import { periodStart, type PeriodKey } from "@venix/core";
import { sql } from "drizzle-orm";
import { db } from "../db";

export interface LeaderboardRow {
  rank: number;
  name: string;
  score: number;
  isYou: boolean;
  at: string;
}

export const PERIODS: PeriodKey[] = ["daily", "weekly", "all"];
export const isPeriod = (v: unknown): v is PeriodKey => typeof v === "string" && (PERIODS as string[]).includes(v);

/**
 * Best valid score per player in the window. Ties go to whoever got there
 * first. Flagged or hidden runs never appear. Players are shown by the
 * nickname they chose to make public on a challenge, otherwise by an opaque
 * "Player XXXX" tag derived from their session id.
 */
export async function getLeaderboard(gameSlug: string, period: PeriodKey, limit = 50, viewerGuestId?: string | null) {
  const start = periodStart(period);
  const rows = await db().execute<{ guest_session_id: string; score: number; submitted_at: Date; name: string | null }>(sql`
    with best as (
      select distinct on (gs.guest_session_id) gs.guest_session_id, gs.score, gs.submitted_at
      from naijarush.game_sessions gs
      where gs.game_slug = ${gameSlug} and gs.status = 'valid' and not gs.hidden and gs.mode <> 'endless'
        and (${start?.toISOString() ?? null}::timestamptz is null or gs.submitted_at >= ${start?.toISOString() ?? null}::timestamptz)
      order by gs.guest_session_id, gs.score desc, gs.submitted_at asc
    )
    select b.guest_session_id, b.score, b.submitted_at,
      (select c.display_name from naijarush.challenges c
        where c.creator_guest_id = b.guest_session_id and c.display_name is not null and c.status = 'active'
        order by c.created_at desc limit 1) as name
    from best b
    order by b.score desc, b.submitted_at asc
    limit ${Math.min(Math.max(limit, 1), 100)}
  `);
  return rows.map<LeaderboardRow>((r, i) => ({
    rank: i + 1,
    name: r.name ?? `Player ${r.guest_session_id.replace(/-/g, "").slice(-4).toUpperCase()}`,
    score: Number(r.score),
    isYou: Boolean(viewerGuestId && viewerGuestId === r.guest_session_id),
    at: new Date(r.submitted_at).toISOString(),
  }));
}
