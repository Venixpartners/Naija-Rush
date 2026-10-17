import { isValidCode, randomCode } from "./rng";

export const CHALLENGE_CODE_LENGTH = 10;
export type ChallengeOutcome = "beaten" | "tied" | "lost";

export const newChallengeCode = () => randomCode(CHALLENGE_CODE_LENGTH);
export const isChallengeCode = (code: string) => isValidCode(code, CHALLENGE_CODE_LENGTH);

export function compareToTarget(score: number, target: number): ChallengeOutcome {
  if (score > target) return "beaten";
  if (score === target) return "tied";
  return "lost";
}

/** Lagos calendar day, used for the daily seed and daily leaderboard. */
export function lagosDay(at: Date = new Date()): string {
  // Africa/Lagos is UTC+1 all year (no daylight saving).
  return new Date(at.getTime() + 60 * 60_000).toISOString().slice(0, 10);
}

export const dailySeed = (at: Date = new Date()) => `daily:${lagosDay(at)}`;

export type PeriodKey = "daily" | "weekly" | "all";

/** Start of the leaderboard window in UTC, using Lagos day boundaries. */
export function periodStart(period: PeriodKey, at: Date = new Date()): Date | null {
  if (period === "all") return null;
  const lagosMidnight = new Date(`${lagosDay(at)}T00:00:00+01:00`);
  if (period === "daily") return lagosMidnight;
  // Weeks start on Monday in Lagos.
  const dow = (new Date(lagosMidnight.getTime() + 60 * 60_000).getUTCDay() + 6) % 7;
  return new Date(lagosMidnight.getTime() - dow * 86_400_000);
}
