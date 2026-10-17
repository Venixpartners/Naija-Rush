import { schema } from "@venix/database";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { HttpError } from "../http";

export const SLUG = /^[a-z0-9][a-z0-9-]{2,40}$/;

export type Campaign = typeof schema.campaigns.$inferSelect & { sponsorName: string | null };

export const isOpen = (c: Pick<Campaign, "status" | "startsAt" | "endsAt">, now = new Date()) =>
  c.status === "live" && c.startsAt <= now && c.endsAt > now;

export async function getCampaign(slug: string): Promise<Campaign | null> {
  if (!SLUG.test(slug)) return null;
  const [c] = await db()
    .select({ c: schema.campaigns, sponsorName: schema.sponsors.name })
    .from(schema.campaigns)
    .leftJoin(schema.sponsors, eq(schema.sponsors.id, schema.campaigns.sponsorId))
    .where(eq(schema.campaigns.slug, slug));
  return c ? { ...c.c, sponsorName: c.sponsorName } : null;
}

/** Live and finished campaigns. Drafts are never public. */
export async function publicCampaigns(): Promise<Campaign[]> {
  const rows = await db()
    .select({ c: schema.campaigns, sponsorName: schema.sponsors.name })
    .from(schema.campaigns)
    .leftJoin(schema.sponsors, eq(schema.sponsors.id, schema.campaigns.sponsorId))
    .where(sql`${schema.campaigns.status} in ('live', 'ended')`)
    .orderBy(desc(schema.campaigns.startsAt));
  return rows.map((r) => ({ ...r.c, sponsorName: r.sponsorName }));
}

/** Resolve a campaign for a new run, enforcing dates and game. */
export async function campaignForRun(slug: string | null | undefined, gameSlug: string, guestId: string): Promise<string | null> {
  if (!slug) return null;
  const c = await getCampaign(slug);
  if (!c || !isOpen(c)) throw new HttpError(410, "campaign_closed", "This event is not running right now.");
  if (c.gameSlug !== gameSlug) throw new HttpError(400, "campaign_game_mismatch");
  await db().insert(schema.campaignParticipants).values({ campaignId: c.id, guestSessionId: guestId }).onConflictDoNothing();
  return c.id;
}

export async function campaignBoard(campaignId: string, limit = 50) {
  const rows = await db().execute<{ who: string; score: number; name: string | null }>(sql`
    with best as (
      select distinct on (coalesce(gs.user_id::text, gs.guest_session_id::text))
        coalesce(gs.user_id::text, gs.guest_session_id::text) as who, gs.user_id, gs.guest_session_id, gs.score, gs.submitted_at
      from naijarush.game_sessions gs
      where gs.campaign_id = ${campaignId} and gs.status = 'valid' and not gs.hidden
      order by coalesce(gs.user_id::text, gs.guest_session_id::text), gs.score desc, gs.submitted_at asc
    )
    select b.who, b.score,
      (select p.display_name from naijarush.user_profiles p where p.user_id = b.user_id and p.is_public) as name
    from best b order by b.score desc, b.submitted_at asc limit ${limit}`);
  return rows.map((r, i) => ({ rank: i + 1, name: r.name ?? `Player ${r.who.replace(/-/g, "").slice(-4).toUpperCase()}`, score: Number(r.score), isYou: false, at: "" }));
}

/** Sponsor report: measured numbers only. */
export async function campaignReport(campaignId: string) {
  const [r] = await db().execute<{ participants: number; runs: number; valid_runs: number; challenges: number; arrivals: number; accepted: number }>(sql`
    select
      (select count(*)::int from naijarush.campaign_participants where campaign_id = ${campaignId}) as participants,
      (select count(*)::int from naijarush.game_sessions where campaign_id = ${campaignId}) as runs,
      (select count(*)::int from naijarush.game_sessions where campaign_id = ${campaignId} and status = 'valid') as valid_runs,
      (select count(*)::int from naijarush.challenges where campaign_id = ${campaignId}) as challenges,
      (select count(*)::int from naijarush.referral_clicks r join naijarush.challenges c on c.id = r.challenge_id where c.campaign_id = ${campaignId} and not r.is_bot) as arrivals,
      (select count(*)::int from naijarush.challenge_attempts a join naijarush.challenges c on c.id = a.challenge_id where c.campaign_id = ${campaignId}) as accepted`);
  return r!;
}

export async function createCampaign(input: {
  slug: string;
  name: string;
  sponsorName: string;
  gameSlug: string;
  kind: string;
  startsAt: Date;
  endsAt: Date;
  rulesMd: string;
  eligibility: string;
}) {
  if (!SLUG.test(input.slug)) throw new Error("Slug must be 3 to 41 lowercase letters, numbers or hyphens.");
  if (!(input.startsAt < input.endsAt)) throw new Error("The event must end after it starts.");
  if (input.rulesMd.trim().length < 40) throw new Error("Write the rules in full before saving.");
  if (input.eligibility.trim().length < 10) throw new Error("State who can take part.");
  let sponsorId: string | null = null;
  if (input.sponsorName.trim()) {
    const [s] = await db().insert(schema.sponsors).values({ name: input.sponsorName.trim().slice(0, 80) }).returning({ id: schema.sponsors.id });
    sponsorId = s!.id;
  }
  const [c] = await db()
    .insert(schema.campaigns)
    .values({ slug: input.slug, name: input.name.trim().slice(0, 80), sponsorId, gameSlug: input.gameSlug, kind: input.kind === "creator" ? "creator" : "sponsored", startsAt: input.startsAt, endsAt: input.endsAt, rulesMd: input.rulesMd.trim(), eligibility: input.eligibility.trim(), status: "draft" })
    .returning();
  return c!;
}

export async function setCampaignStatus(id: string, status: "draft" | "live" | "ended") {
  await db().update(schema.campaigns).set({ status }).where(and(eq(schema.campaigns.id, id)));
}
