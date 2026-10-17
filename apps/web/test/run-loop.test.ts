/**
 * Integration tests: the Naija Rush loop against a real Postgres database
 * carrying the production `naijarush` schema. Requires TEST_DATABASE_URL.
 */
import { closeDb, getDb, schema } from "@venix/database";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { playWithBot } from "../../../packages/core/src/naija-rush-bot";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5432/naija_rush_test";

const { startRun, finishRun } = await import("@/lib/services/runs");
const { createChallenge, loadActiveChallenge, recordReferral } = await import("@/lib/services/challenges");
const { getLeaderboard } = await import("@/lib/services/leaderboards");
const { guestIdForToken } = await import("@/lib/guest");

let ada: string;
let tunde: string;

async function run(guestId: string, opts: { mode?: string; challengeCode?: string; delay?: number; claimed?: number } = {}) {
  const r = await startRun({ guestId, gameSlug: "naija-rush", mode: opts.mode, challengeCode: opts.challengeCode });
  const bot = playWithBot(r.seed, r.mode === "endless" ? "endless" : "short", { delayTicks: opts.delay ?? 3 });
  const seconds = Math.ceil(bot.engine.state.tick / 60) + 3;
  await getDb().execute(sql`update naijarush.game_sessions set issued_at = now() - make_interval(secs => ${seconds}) where id = ${r.runId}`);
  const log = { inputs: bot.inputs, endTick: bot.engine.state.tick };
  const result = await finishRun({ guestId, runId: r.runId, token: r.token, log, claimedScore: opts.claimed ?? bot.score });
  return { r, result, bot, log };
}

beforeAll(async () => {
  await getDb().execute(sql`truncate naijarush.guest_sessions, naijarush.analytics_events, naijarush.rate_limits cascade`);
  ada = await guestIdForToken("ada-token-0123456789-0123456789-abcdef");
  tunde = await guestIdForToken("tunde-token-0123456789-0123456789-abcd");
});

afterAll(async () => {
  await closeDb();
});

describe("Naija Rush loop", () => {
  let code = "";
  let target = 0;

  it("verifies a 60 second rush by replay", async () => {
    const { r, result, bot } = await run(ada);
    expect(r.version).toBe("nr-1.0.0");
    expect(result.status).toBe("valid");
    expect(result.score).toBe(bot.score);
    expect(result.stats?.survived).toBe(true);
    expect(result.dailyRank).toBe(1);
    const c = await createChallenge({ guestId: ada, runId: result.runId, nickname: "Ada", showNickname: true });
    code = c.code;
    target = result.score;
  });

  it("the friend arrives from WhatsApp and runs the identical street", async () => {
    const ch = (await loadActiveChallenge(code))!;
    await recordReferral(ch.id, "whatsapp", tunde, "Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile");
    const { r, result } = await run(tunde, { challengeCode: code, delay: 0 });
    expect(r.seed).toBe(ch.seed);
    expect(r.challenge?.targetScore).toBe(target);
    expect(["beaten", "tied", "lost"]).toContain(result.challenge?.outcome);
    const rows = await getLeaderboard("naija-rush", "daily", 10);
    expect(rows.some((x) => x.name === "Ada")).toBe(true);
  });

  it("ignores a spoofed score and rejects a duplicate submission", async () => {
    const { r, result, bot, log } = await run(tunde, { claimed: 999_999 });
    expect(result.score).toBe(bot.score);
    const [row] = await getDb().select().from(schema.gameSessions).where(eq(schema.gameSessions.id, r.runId));
    expect(row!.flags).toContain("score_mismatch");
    await expect(finishRun({ guestId: tunde, runId: r.runId, token: r.token, log, claimedScore: bot.score })).rejects.toMatchObject({ code: "run_already_submitted" });
  });

  it("rejects another player's token and a run submitted too early", async () => {
    const r = await startRun({ guestId: ada, gameSlug: "naija-rush" });
    await expect(finishRun({ guestId: tunde, runId: r.runId, token: r.token, log: { inputs: [], endTick: 1 }, claimedScore: 0 })).rejects.toMatchObject({ code: "invalid_run_token" });
    const bot = playWithBot(r.seed);
    const early = await finishRun({ guestId: ada, runId: r.runId, token: r.token, log: { inputs: bot.inputs, endTick: bot.engine.state.tick }, claimedScore: bot.score });
    expect(early.reason).toBe("submitted_too_early");
  });

  it("keeps endless runs off the rankings and out of challenges", async () => {
    const { r, result } = await run(tunde, { mode: "endless" });
    expect(r.mode).toBe("endless");
    expect(result.dailyRank).toBeNull();
    await expect(createChallenge({ guestId: tunde, runId: result.runId })).rejects.toMatchObject({ code: "run_not_competitive" });
  });

  it("refuses expired challenges", async () => {
    await getDb().update(schema.challenges).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.challenges.code, code));
    await expect(startRun({ guestId: tunde, gameSlug: "naija-rush", challengeCode: code })).rejects.toMatchObject({ code: "challenge_unavailable" });
  });
});
