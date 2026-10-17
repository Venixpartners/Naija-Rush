/**
 * Server side validation for Naija Rush runs. Same philosophy as Beat My
 * Score: the server replays the input log against its own seed, and that is
 * the score. Plausibility checks flag runs for human review.
 */
import { MAX_INPUTS_PER_SECOND, NR_ACTIONS, TICK_HZ, ENDLESS_MAX_TICKS, replayNr, type NrAction, type NrInput, type NrMode } from "./naija-rush";
import { MAX_WALL_MS, type ValidationResult } from "./validation";

export interface NrValidationInput {
  seed: string;
  mode: NrMode;
  log: unknown;
  claimedScore: unknown;
  issuedAt: number;
  receivedAt: number;
}

const MAX_INPUTS = 4000;

export function parseNrLog(raw: unknown): { inputs: NrInput[]; endTick: number } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const { inputs, endTick } = raw as { inputs?: unknown; endTick?: unknown };
  if (!Array.isArray(inputs) || inputs.length > MAX_INPUTS) return null;
  if (typeof endTick !== "number" || !Number.isInteger(endTick) || endTick < 1 || endTick > ENDLESS_MAX_TICKS) return null;
  const out: NrInput[] = [];
  let last = -1;
  for (const item of inputs) {
    if (!Array.isArray(item) || item.length !== 2) return null;
    const [tick, action] = item as unknown[];
    if (typeof tick !== "number" || !Number.isInteger(tick) || tick < 0 || tick > endTick || tick < last) return null;
    if (typeof action !== "string" || !(NR_ACTIONS as readonly string[]).includes(action)) return null;
    last = tick;
    out.push([tick, action as NrAction]);
  }
  return { inputs: out, endTick };
}

export function validateNrRun(input: NrValidationInput): ValidationResult {
  const reject = (reason: string): ValidationResult => ({ status: "rejected", score: 0, flags: [], reason });
  const wall = input.receivedAt - input.issuedAt;
  if (wall > MAX_WALL_MS && input.mode === "short") return reject("run_expired");

  const log = parseNrLog(input.log);
  if (!log) return reject("malformed_input_log");

  const result = replayNr(input.seed, input.mode, log.inputs);
  const flags: string[] = [];

  // Game time cannot run faster than the wall clock (pauses only add time).
  const gameMs = (result.state.tick * 1000) / TICK_HZ;
  if (wall < gameMs - 2_000) return reject("submitted_too_early");

  if (result.state.tick !== log.endTick) flags.push("end_tick_mismatch");
  if (typeof input.claimedScore !== "number" || input.claimedScore !== result.score) flags.push("score_mismatch");

  // Sustained input faster than a human can swipe.
  let burst = 0;
  for (let i = MAX_INPUTS_PER_SECOND; i < log.inputs.length; i++) {
    if (log.inputs[i]![0] - log.inputs[i - MAX_INPUTS_PER_SECOND]![0] < TICK_HZ) burst++;
  }
  if (burst > 10) flags.push("input_burst");

  // A full 60 seconds with zero crashes, no shield used and every coin taken
  // is possible but rare enough to look at.
  if (result.state.finished && !result.state.crashed && result.state.shieldsUsed === 0 && result.state.nearMisses > 40) {
    flags.push("perfect_run_review");
  }

  return {
    status: flags.some((f) => f !== "score_mismatch" && f !== "end_tick_mismatch") ? "flagged" : "valid",
    score: result.score,
    flags,
    stats: {
      distance: Math.floor(result.state.z),
      coins: result.state.coins,
      nearMisses: result.state.nearMisses,
      shieldsUsed: result.state.shieldsUsed,
      seconds: Math.round(gameMs / 100) / 10,
      survived: result.state.finished && !result.state.crashed,
      crashedInto: result.state.crashedInto,
      inputs: result.inputs,
    },
  };
}
