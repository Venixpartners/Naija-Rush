import {
  compareToTarget,
  dailySeed,
  liveGame,
  periodStart,
  validateNrRun,
  type ChallengeOutcome,
  type ValidationResult,
} from "@venix/core";
import { schema } from "@venix/database";
import { and, eq, sql } from "drizzle-orm";
import { track } from "../analytics";
import { randomSeed, signRunToken, verifyRunToken } from "../crypto";
import { db } from "../db";
import { HttpError } from "../http";
import { campaignForRun } from "./campaigns";
import { loadActiveChallenge, type PublicChallenge } from "./challenges";

/**
 * standard: random seed. daily: one seed per Lagos day. challenge: the
 * challenger's seed. endless: Naija Rush without the 60 second cap; it is for
 * fun and never ranks or creates challenges.
 */
export type RunMode = "standard" | "daily" | "challenge" | "endless";

export interface StartRunInput {
  guestId: string;
  gameSlug: string;
  mode?: string;
  challengeCode?: string | null;
  campaignSlug?: string | null;
}

export interface StartRunResult {
  runId: string;
  token: string;
  seed: string;
  mode: RunMode;
  version: string;
  challenge: PublicChallenge | null;
}

export async function startRun(input: StartRunInput): Promise<StartRunResult> {
  const game = liveGame(input.gameSlug);
  if (!game) throw new HttpError(404, "game_not_available");

  let mode: RunMode =
    input.mode === "daily" ? "daily" : input.mode === "endless" && game.slug === "naija-rush" ? "endless" : "standard";
  let seed = mode === "daily" ? dailySeed() : randomSeed();
  let challenge: PublicChallenge | null = null;

  if (input.challengeCode) {
    challenge = await loadActiveChallenge(input.challengeCode);
    if (!challenge) throw new HttpError(410, "challenge_unavailable", "This challenge has expired or was removed.");
    if (challenge.gameSlug !== game.slug) throw new HttpError(400, "challenge_game_mismatch");
    // Same seed as the challenger means the same targets: a fair head to head.
    mode = "challenge";
    seed = challenge.seed;
  }

  const campaignId = mode === "endless" ? null : await campaignForRun(input.campaignSlug, game.slug, input.guestId);
  const [owner] = await db().select({ userId: schema.guestSessions.userId }).from(schema.guestSessions).where(eq(schema.guestSessions.id, input.guestId));
  const [run] = await db()
    .insert(schema.gameSessions)
    .values({
      userId: owner?.userId ?? null,
      campaignId,
      gameSlug: game.slug,
      gameVersion: game.version,
      mode,
      seed,
      guestSessionId: input.guestId,
      challengeId: challenge?.id ?? null,
    })
    .returning({ id: schema.gameSessions.id });

  if (challenge) {
    await db().insert(schema.challengeAttempts).values({ challengeId: challenge.id, gameSessionId: run!.id, guestSessionId: input.guestId });
    await track("challenge_accepted", { guestId: input.guestId, gameSlug: game.slug, challengeId: challenge.id });
  }
  await track("game_start", { guestId: input.guestId, gameSlug: game.slug, challengeId: challenge?.id, props: { mode } });

  return { runId: run!.id, token: signRunToken(run!.id, input.guestId, mode === "endless" ? 2 * 60 * 60_000 : 20 * 60_000), seed, mode, version: game.version, challenge };
}

export interface FinishRunInput {
  guestId: string;
  runId: string;
  token: unknown;
  /** { inputs: [tick, action][], endTick } */
  log?: unknown;
  claimedScore: unknown;
}

export interface FinishRunResult {
  runId: string;
  status: "valid" | "flagged" | "rejected";
  score: number;
  reason?: string;
  personalBest: number;
  isNewBest: boolean;
  dailyRank: number | null;
  challenge: null | { code: string; targetScore: number; displayName: string | null; outcome: ChallengeOutcome };
  stats: Record<string, unknown> | null;
}

export async function finishRun(input: FinishRunInput): Promise<FinishRunResult> {
  const token = verifyRunToken(input.token);
  if (!token || token.rid !== input.runId || token.gid !== input.guestId) throw new HttpError(403, "invalid_run_token");

  // Atomically claim the run so a duplicate or replayed submission cannot be
  // scored twice.
  const claimed = await db()
    .update(schema.gameSessions)
    .set({ status: "processing", submittedAt: sql`now()` })
    .where(
      and(
        eq(schema.gameSessions.id, input.runId),
        eq(schema.gameSessions.guestSessionId, input.guestId),
        eq(schema.gameSessions.status, "issued"),
      ),
    )
    .returning();
  const run = claimed[0];
  if (!run) throw new HttpError(409, "run_already_submitted");

  const timing = { issuedAt: run.issuedAt.getTime(), receivedAt: Date.now() };
  const verdict: ValidationResult = validateNrRun({ seed: run.seed, mode: run.mode === "endless" ? "endless" : "short", log: input.log, claimedScore: input.claimedScore, ...timing });
  const stats = verdict.stats ?? null;

  await db()
    .update(schema.gameSessions)
    .set({ status: verdict.status, score: verdict.score, flags: verdict.flags, stats })
    .where(eq(schema.gameSessions.id, run.id));

  await db()
    .insert(schema.scoreSubmissions)
    .values({
      gameSessionId: run.id,
      payload: input.log ?? null,
      claimedScore: typeof input.claimedScore === "number" ? Math.trunc(input.claimedScore) : null,
      computedScore: verdict.score,
      status: verdict.status,
      flags: verdict.flags,
      reason: verdict.reason ?? null,
    });

  let challenge: FinishRunResult["challenge"] = null;
  if (run.challengeId && verdict.status !== "rejected") {
    const [c] = await db().select().from(schema.challenges).where(eq(schema.challenges.id, run.challengeId));
    if (c) {
      const outcome = compareToTarget(verdict.score, c.targetScore);
      await db()
        .insert(schema.challengeResults)
        .values({ challengeId: c.id, gameSessionId: run.id, score: verdict.score, targetScore: c.targetScore, outcome })
        .onConflictDoNothing();
      challenge = { code: c.code, targetScore: c.targetScore, displayName: c.displayName, outcome };
    }
  }

  const [best] = await db().execute<{ best: number | null; prev: number | null }>(sql`
    select max(score) as best,
           max(score) filter (where id <> ${run.id}) as prev
    from naijarush.game_sessions
    where ${run.userId ? sql`user_id = ${run.userId}` : sql`guest_session_id = ${input.guestId}`} and game_slug = ${run.gameSlug} and status = 'valid'
      and (mode = 'endless') = ${run.mode === "endless"}
  `);
  const personalBest = Number(best?.best ?? verdict.score);
  const isNewBest = verdict.status === "valid" && verdict.score > Number(best?.prev ?? -1);

  let dailyRank: number | null = null;
  if (verdict.status === "valid" && run.mode !== "endless") {
    const start = periodStart("daily")!;
    const [r] = await db().execute<{ rank: number }>(sql`
      select count(*)::int + 1 as rank from (
        select coalesce(user_id::text, guest_session_id::text) as who, max(score) as best from naijarush.game_sessions
        where game_slug = ${run.gameSlug} and status = 'valid' and not hidden and mode <> 'endless' and submitted_at >= ${start.toISOString()}
          and coalesce(user_id::text, guest_session_id::text) <> ${run.userId ?? input.guestId}
        group by 1
      ) b where b.best > ${personalBest}
    `);
    dailyRank = Number(r?.rank ?? 1);
  }

  await track("game_finish", {
    guestId: input.guestId,
    gameSlug: run.gameSlug,
    challengeId: run.challengeId,
    props: { status: verdict.status, score: verdict.score, mode: run.mode, outcome: challenge?.outcome ?? null },
  });

  return {
    runId: run.id,
    status: verdict.status,
    score: verdict.score,
    reason: verdict.reason,
    personalBest,
    isNewBest,
    dailyRank,
    challenge,
    stats,
  };
}
