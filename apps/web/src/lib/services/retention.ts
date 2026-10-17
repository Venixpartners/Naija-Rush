import { getDb, schema } from "@venix/database";
import { sql } from "drizzle-orm";

/**
 * Data retention (docs/DATA_RETENTION.md). Runs daily from Vercel Cron.
 * Work is done in bounded batches so a backlog never holds long locks.
 * Scores, runs, challenges and payment records are kept; only the raw
 * evidence and expired operational rows are removed.
 */
export const RETENTION = {
  rawLogDays: 90,
  analyticsMonths: 13,
  idleGuestMonths: 12,
  loginTokenGraceHours: 24,
  rateLimitGraceHours: 48,
} as const;

const BATCH = 5000;
const MAX_BATCHES = 40;

async function batched(run: () => Promise<number>): Promise<number> {
  let total = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const n = await run();
    total += n;
    if (n < BATCH) break;
  }
  return total;
}

const count = (r: unknown) => (r as { count?: number }).count ?? (r as unknown[]).length ?? 0;

export interface RetentionReport {
  rawLogsCleared: number;
  analyticsDeleted: number;
  referralClicksDeleted: number;
  loginTokensDeleted: number;
  rateLimitsDeleted: number;
  idleGuestsDeleted: number;
  ms: number;
}

export async function runRetention(actor = "cron"): Promise<RetentionReport> {
  const db = getDb();
  const started = Date.now();

  const rawLogsCleared = await batched(async () =>
    count(
      await db.execute(sql`
        update naijarush.score_submissions set payload = null
        where id in (
          select id from naijarush.score_submissions
          where payload is not null and received_at < now() - make_interval(days => ${RETENTION.rawLogDays})
          limit ${BATCH}
        )`),
    ),
  );

  const analyticsDeleted = await batched(async () =>
    count(
      await db.execute(sql`
        delete from naijarush.analytics_events
        where id in (
          select id from naijarush.analytics_events
          where created_at < now() - make_interval(months => ${RETENTION.analyticsMonths})
          limit ${BATCH}
        )`),
    ),
  );

  const referralClicksDeleted = await batched(async () =>
    count(
      await db.execute(sql`
        delete from naijarush.referral_clicks
        where id in (
          select id from naijarush.referral_clicks
          where landed_at < now() - make_interval(months => ${RETENTION.analyticsMonths})
          limit ${BATCH}
        )`),
    ),
  );

  const loginTokensDeleted = count(
    await db.execute(sql`
      delete from naijarush.login_tokens
      where expires_at < now() - make_interval(hours => ${RETENTION.loginTokenGraceHours})`),
  );

  const rateLimitsDeleted = count(
    await db.execute(sql`
      delete from naijarush.rate_limits
      where window_start < now() - make_interval(hours => ${RETENTION.rateLimitGraceHours})`),
  );

  // Only empty visitors: no account and no runs. Runs are kept for the
  // life of the service, so their guest rows stay too.
  const idleGuestsDeleted = await batched(async () =>
    count(
      await db.execute(sql`
        delete from naijarush.guest_sessions
        where id in (
          select g.id from naijarush.guest_sessions g
          where g.user_id is null
            and g.last_seen_at < now() - make_interval(months => ${RETENTION.idleGuestMonths})
            and not exists (select 1 from naijarush.game_sessions s where s.guest_session_id = g.id)
          limit ${BATCH}
        )`),
    ),
  );

  const report: RetentionReport = {
    rawLogsCleared,
    analyticsDeleted,
    referralClicksDeleted,
    loginTokensDeleted,
    rateLimitsDeleted,
    idleGuestsDeleted,
    ms: Date.now() - started,
  };
  await db.insert(schema.adminAuditLogs).values({ actor, action: "retention.run", targetType: "system", targetId: null, details: report });
  return report;
}
