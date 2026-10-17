import { GAMES, checkNickname, isChallengeCode, isGameSlug, newChallengeCode } from "@venix/core";
import { schema } from "@venix/database";
import { and, eq, sql } from "drizzle-orm";
import { track } from "../analytics";
import { db } from "../db";
import { env } from "../env";
import { HttpError } from "../http";

export interface PublicChallenge {
  id: string;
  code: string;
  gameSlug: string;
  gameName: string;
  seed: string;
  targetScore: number;
  displayName: string | null;
  expiresAt: string;
  createdAt: string;
  attempts: number;
  beaten: number;
}

export const POLICY_VERSION = "2026-10-draft";

/** Active, unexpired challenge by code, or null. Never throws on bad input. */
export async function loadActiveChallenge(code: string): Promise<PublicChallenge | null> {
  if (!isChallengeCode(code)) return null;
  const rows = await db().execute<{
    id: string;
    code: string;
    game_slug: string;
    seed: string;
    target_score: number;
    display_name: string | null;
    expires_at: Date;
    created_at: Date;
    attempts: number;
    beaten: number;
  }>(sql`
    select c.id, c.code, c.game_slug, c.seed, c.target_score, c.display_name, c.expires_at, c.created_at,
      (select count(*)::int from naijarush.challenge_results r where r.challenge_id = c.id) as attempts,
      (select count(*)::int from naijarush.challenge_results r where r.challenge_id = c.id and r.outcome = 'beaten') as beaten
    from naijarush.challenges c
    where c.code = ${code} and c.status = 'active' and c.expires_at > now()
    limit 1
  `);
  const c = rows[0];
  if (!c) return null;
  const slug = isGameSlug(c.game_slug) ? c.game_slug : "naija-rush";
  return {
    id: c.id,
    code: c.code,
    gameSlug: c.game_slug,
    gameName: GAMES[slug].name,
    seed: c.seed,
    targetScore: c.target_score,
    displayName: c.display_name,
    expiresAt: new Date(c.expires_at).toISOString(),
    createdAt: new Date(c.created_at).toISOString(),
    attempts: Number(c.attempts),
    beaten: Number(c.beaten),
  };
}

export interface CreateChallengeInput {
  guestId: string;
  runId: string;
  nickname?: unknown;
  showNickname?: unknown;
}

export async function createChallenge(input: CreateChallengeInput) {
  const [run] = await db()
    .select()
    .from(schema.gameSessions)
    .where(and(eq(schema.gameSessions.id, input.runId), eq(schema.gameSessions.guestSessionId, input.guestId)));
  if (!run) throw new HttpError(404, "run_not_found");
  if (run.mode === "endless") throw new HttpError(409, "run_not_competitive", "Endless runs are just for fun. Play the 60 second rush to challenge a friend.");
  if (run.status !== "valid") {
    throw new HttpError(409, "run_not_eligible", run.status === "flagged" ? "This run is under review." : "This run cannot be shared.");
  }

  let displayName: string | null = null;
  if (input.showNickname === true && typeof input.nickname === "string" && input.nickname.trim()) {
    const check = checkNickname(input.nickname);
    if (!check.ok) throw new HttpError(422, `nickname_${check.reason}`, "Please choose a different nickname.");
    displayName = check.value;
    await db().insert(schema.consents).values({
      guestSessionId: input.guestId,
      kind: "public_nickname",
      granted: true,
      policyVersion: POLICY_VERSION,
    });
  }

  // One challenge per run: repeated taps on "Challenge a friend" reuse it.
  const existing = await db().select().from(schema.challenges).where(eq(schema.challenges.sourceSessionId, run.id));
  if (existing[0]) {
    const c = existing[0];
    if (displayName !== c.displayName && displayName) {
      await db().update(schema.challenges).set({ displayName }).where(eq(schema.challenges.id, c.id));
    }
    return { code: c.code, url: `${env.siteUrl}/c/${c.code}`, targetScore: c.targetScore, displayName: displayName ?? c.displayName };
  }

  const expiresAt = new Date(Date.now() + env.challengeTtlDays * 86_400_000);
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newChallengeCode();
    try {
      const [c] = await db()
        .insert(schema.challenges)
        .values({
          code,
          gameSlug: run.gameSlug,
          gameVersion: run.gameVersion,
          mode: run.mode,
          seed: run.seed,
          sourceSessionId: run.id,
          creatorGuestId: input.guestId,
          parentChallengeId: run.challengeId,
          displayName,
          targetScore: run.score ?? 0,
          expiresAt,
        })
        .returning();
      await db().insert(schema.shareAssets).values([
        { challengeId: c!.id, kind: "scorecard_story", storageKey: `/api/scorecard/${code}?format=story` },
        { challengeId: c!.id, kind: "scorecard_square", storageKey: `/api/scorecard/${code}?format=square` },
        { challengeId: c!.id, kind: "og", storageKey: `/c/${code}/opengraph-image` },
      ]);
      await track("challenge_created", {
        guestId: input.guestId,
        gameSlug: run.gameSlug,
        challengeId: c!.id,
        props: { rematch: Boolean(run.challengeId), score: run.score },
      });
      return { code, url: `${env.siteUrl}/c/${code}`, targetScore: c!.targetScore, displayName };
    } catch (err) {
      // Unique violation on code: astronomically unlikely, retry with a new one.
      if (String((err as { code?: string }).code) !== "23505") throw err;
    }
  }
  throw new HttpError(500, "challenge_code_collision");
}

const BOT_UA = /bot|crawler|spider|facebookexternalhit|whatsapp|snapchat|tiktok|twitterbot|slackbot|discordbot|telegrambot|linkedinbot|preview|embedly|headless/i;
export const isBotUserAgent = (ua: string | null) => !ua || BOT_UA.test(ua);

export async function recordReferral(challengeId: string, channel: string, guestId: string | null, userAgent: string | null) {
  const isBot = isBotUserAgent(userAgent);
  await db().insert(schema.referralClicks).values({ challengeId, channel, guestSessionId: guestId, isBot });
  if (!isBot && guestId) {
    await db()
      .update(schema.guestSessions)
      .set({ firstChannel: sql`coalesce(${schema.guestSessions.firstChannel}, ${channel})`, firstChallengeId: sql`coalesce(${schema.guestSessions.firstChallengeId}, ${challengeId}::uuid)` })
      .where(eq(schema.guestSessions.id, guestId));
    await track("referral_landed", { guestId, challengeId, channel });
  }
}
