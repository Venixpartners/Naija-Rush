/**
 * Shared validation types. The Naija Rush specific checks live in
 * validation-nr.ts. The client never decides its own score: the server
 * replays the input log against the seed it issued.
 */
export type RunStatus = "valid" | "flagged" | "rejected";

export interface ValidationResult {
  status: RunStatus;
  score: number;
  flags: string[];
  reason?: string;
  /** Run statistics, stored with the run. */
  stats?: Record<string, number | string | boolean | null>;
}

/** Runs older than this are refused (stale or replayed tokens). */
export const MAX_WALL_MS = 20 * 60_000;
