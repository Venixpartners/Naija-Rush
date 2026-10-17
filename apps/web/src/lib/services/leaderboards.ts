import { periodStart, type PeriodKey } from "@venix/core";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { schema } from "@venix/database";
import { eq } from "drizzle-orm";

export async function viewerFor(guestId: string | null): Promise<Viewer | null> {
  if (!guestId) return null;
  const [g] = await db().select({ userId: schema.guestSessions.userId }).from(schema.guestSessions).where(eq(schema.guestSessions.id, guestId));
  return { guestId, userId: g?.userId ?? null };
}

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
export interface Viewer {
  guestId: string;
  userId: string | null;
}

export async function getLeaderboard(gameSlug: string, period: PeriodKey, limit = 50, viewer?: Viewer | string | null) {
  if (typeof viewer === "string") viewer = await viewerFor(viewer);
  const start = periodStart(period);
  // One row per person: signed in players across devices count once.
  const rows = await db().execute<{ who: string; user_id: string | null; guest_session_id: string; score: number; submitted_at: Date; name: string | null }>(sql`
    with runs as (
      select coalesce(gs.user_id::text, gs.guest_session_id::text) as who, gs.user_id, gs.guest_session_id, gs.score, gs.submitted_at
      from naijarush.game_sessions gs
      left join naijarush.users u on u.id = gs.user_id
      where gs.game_slug = ${gameSlug} and gs.status = 'valid' and not gs.hidden and gs.mode <> 'endless'
        and (u.id is null or u.status = 'active')
        and (${start?.toISOString() ?? null}::timestamptz is null or gs.submitted_at >= ${start?.toISOString() ?? null}::timestamptz)
    ),
    best as (
      select distinct on (who) who, user_id, guest_session_id, score, submitted_at
      from runs order by who, score desc, submitted_at asc
    )
    select b.who, b.user_id, b.guest_session_id, b.score, b.submitted_at,
      coalesce(
        (select p.display_name from naijarush.user_profiles p where p.user_id = b.user_id and p.is_public and p.display_name is not null),
        (select c.display_name from naijarush.challenges c
          where (c.creator_guest_id = b.guest_session_id or (b.user_id is not null and c.creator_user_id = b.user_id))
            and c.display_name is not null and c.status = 'active'
          order by c.created_at desc limit 1)
      ) as name
    from best b
    order by b.score desc, b.submitted_at asc
    limit ${Math.min(Math.max(limit, 1), 100)}
  `);
  const viewerKey = viewer ? (viewer.userId ?? viewer.guestId) : null;
  return rows.map<LeaderboardRow>((r, i) => ({
    rank: i + 1,
    name: r.name ?? `Player ${r.who.replace(/-/g, "").slice(-4).toUpperCase()}`,
    score: Number(r.score),
    isYou: Boolean(viewerKey && viewerKey === r.who),
    at: new Date(r.submitted_at).toISOString(),
  }));
}
