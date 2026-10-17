/** Retention job against real Postgres: removes only what the policy says. */
import { closeDb, getDb } from "@venix/database";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5432/naija_rush_test";
process.env.CRON_SECRET = "cron-secret-for-tests-0123456789";

const { runRetention } = await import("@/lib/services/retention");
const { GET } = await import("@/app/api/cron/retention/route");

const one = async <T>(q: ReturnType<typeof sql>) => ((await getDb().execute(q)) as unknown as T[])[0]!;

let oldSub: string;
let newSub: string;

beforeAll(async () => {
  const db = getDb();
  await db.execute(sql`truncate naijarush.guest_sessions, naijarush.analytics_events, naijarush.referral_clicks, naijarush.rate_limits, naijarush.login_tokens cascade`);
  // Guests: idle and empty (goes), idle with a run (stays), recent and empty (stays).
  await db.execute(sql`insert into naijarush.guest_sessions (id, token_hash, last_seen_at) values
    ('00000000-0000-4000-8000-000000000001', 'h1', now() - interval '13 months'),
    ('00000000-0000-4000-8000-000000000002', 'h2', now() - interval '13 months'),
    ('00000000-0000-4000-8000-000000000003', 'h3', now() - interval '1 day')`);
  const v = await one<{ id: string; game_slug: string }>(sql`select id, game_slug from naijarush.game_versions limit 1`);
  const s1 = await one<{ id: string }>(sql`insert into naijarush.game_sessions (guest_session_id, game_slug, game_version, seed, mode, status)
    values ('00000000-0000-4000-8000-000000000002', ${v.game_slug}, ${v.id}, 'seed-old', 'standard', 'valid') returning id`);
  const s2 = await one<{ id: string }>(sql`insert into naijarush.game_sessions (guest_session_id, game_slug, game_version, seed, mode, status)
    values ('00000000-0000-4000-8000-000000000003', ${v.game_slug}, ${v.id}, 'seed-new', 'standard', 'valid') returning id`);
  oldSub = (await one<{ id: string }>(sql`insert into naijarush.score_submissions (game_session_id, payload, computed_score, status, received_at)
    values (${s1.id}, '{"taps":[[1,2,3]]}', 10, 'valid', now() - interval '91 days') returning id`)).id;
  newSub = (await one<{ id: string }>(sql`insert into naijarush.score_submissions (game_session_id, payload, computed_score, status, received_at)
    values (${s2.id}, '{"taps":[[1,2,3]]}', 10, 'valid', now() - interval '10 days') returning id`)).id;
  await db.execute(sql`insert into naijarush.analytics_events (name, created_at) values ('old', now() - interval '14 months'), ('new', now())`);
  await db.execute(sql`insert into naijarush.rate_limits (key, window_start, count) values ('old', now() - interval '3 days', 1), ('new', now(), 1)`);
});

afterAll(async () => {
  await closeDb();
});

describe("retention", () => {
  it("refuses the cron endpoint without the secret", async () => {
    expect((await GET(new Request("http://x/api/cron/retention"))).status).toBe(401);
    expect((await GET(new Request("http://x/api/cron/retention", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
  });

  it("clears old raw logs but keeps scores, and keeps recent logs", async () => {
    const res = await GET(new Request("http://x/api/cron/retention", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
    expect(res.status).toBe(200);
    const report = await res.json();
    expect(report.rawLogsCleared).toBe(1);
    const o = await one<{ payload: unknown; computed_score: number }>(sql`select payload, computed_score from naijarush.score_submissions where id = ${oldSub}`);
    expect(o.payload).toBeNull();
    expect(o.computed_score).toBe(10);
    const n = await one<{ payload: unknown }>(sql`select payload from naijarush.score_submissions where id = ${newSub}`);
    expect(n.payload).not.toBeNull();
  });

  it("removes only expired operational rows and empty idle guests", async () => {
    const left = await one<{ ev: string; rl: string; guests: string }>(sql`select
      (select string_agg(name, ',') from naijarush.analytics_events) as ev,
      (select string_agg(key, ',') from naijarush.rate_limits) as rl,
      (select string_agg(right(id::text, 1), ',' order by id) from naijarush.guest_sessions) as guests`);
    expect(left.ev).toBe("new");
    expect(left.rl).toBe("new");
    expect(left.guests).toBe("2,3");
  });

  it("is safe to run again and writes an audit entry", async () => {
    const again = await runRetention("test");
    expect(again.rawLogsCleared + again.analyticsDeleted + again.idleGuestsDeleted).toBe(0);
    const a = await one<{ n: number }>(sql`select count(*)::int as n from naijarush.admin_audit_logs where action = 'retention.run'`);
    expect(a.n).toBeGreaterThanOrEqual(2);
  });
});
