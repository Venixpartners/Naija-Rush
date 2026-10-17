import { describe, expect, it } from "vitest";
import {
  LANES,
  NrEngine,
  OBSTACLE_CLEARANCE,
  SHORT_RUN_TICKS,
  SURVIVE_BONUS,
  TICK_HZ,
  generateTrack,
  replayNr,
  speedAt,
  validateNrRun,
} from "../src";
import { playWithBot } from "../src/naija-rush-bot";

describe("track generation", () => {
  it("is deterministic per seed", () => {
    expect(generateTrack("abc")).toEqual(generateTrack("abc"));
    expect(generateTrack("abc")).not.toEqual(generateTrack("abd"));
  });

  it("never blocks every lane with vehicles in the same row", () => {
    for (let i = 0; i < 40; i++) {
      const { obstacles } = generateTrack(`row-${i}`);
      const rows = new Map<number, Set<number>>();
      for (const o of obstacles) {
        if (OBSTACLE_CLEARANCE[o.kind] !== "block") continue;
        const key = Math.round(o.z);
        rows.set(key, (rows.get(key) ?? new Set()).add(o.lane));
      }
      for (const lanes of rows.values()) expect(lanes.size).toBeLessThan(LANES.length);
    }
  });

  it("keeps the start clear and gives at least about a second between rows", () => {
    const { obstacles } = generateTrack("gaps");
    expect(Math.min(...obstacles.map((o) => o.z))).toBeGreaterThanOrEqual(45);
    const rowZs = [...new Set(obstacles.map((o) => Math.round(o.z)))].sort((a, b) => a - b);
    for (let i = 1; i < rowZs.length; i++) {
      const seconds = (rowZs[i]! - rowZs[i - 1]!) / speedAt(rowZs[i - 1]!);
      expect(seconds).toBeGreaterThan(0.55);
    }
  });
});

describe("fairness", () => {
  it("every generated 60 second track can be survived", () => {
    for (let i = 0; i < 30; i++) {
      const { engine } = playWithBot(`fair-${i}`, "short", { delayTicks: 4 });
      expect(engine.state.crashed, `seed fair-${i} crashed into ${engine.state.crashedInto} at ${engine.state.z.toFixed(0)}m`).toBe(false);
      expect(engine.state.tick).toBe(SHORT_RUN_TICKS);
    }
  });

  it("standing still ends the run on the first hazard", () => {
    const r = replayNr("idle", "short", []);
    expect(r.state.crashed).toBe(true);
    // The opening is gentle (centre lane often clear) but a passive player is out well before the end.
    expect(r.state.tick).toBeLessThan(15 * TICK_HZ);
  });
});

describe("replay", () => {
  it("matches the live engine exactly", () => {
    const { inputs, score, engine } = playWithBot("replay-seed");
    const r = replayNr("replay-seed", "short", inputs);
    expect(r.score).toBe(score);
    expect(r.state).toEqual(engine.state);
    expect(score).toBeGreaterThan(SURVIVE_BONUS + 800);
  });

  it("ignores impossible moves", () => {
    const e = new NrEngine("moves");
    e.act("L");
    e.act("L");
    expect(e.state.lane).toBe(-1);
    e.act("J");
    e.step();
    e.act("J"); // already airborne
    expect(e.state.jumpTick).toBe(1);
  });
});

describe("server validation", () => {
  const seed = "validate-nr";
  const { inputs, engine, score } = playWithBot(seed);
  const log = { inputs, endTick: engine.state.tick };
  const issuedAt = 1_000_000;
  const receivedAt = issuedAt + 63_000;

  it("accepts an honest run and recomputes its score", () => {
    const v = validateNrRun({ seed, mode: "short", log, claimedScore: score, issuedAt, receivedAt });
    expect(v.status).toBe("valid");
    expect(v.score).toBe(score);
    expect(v.stats?.survived).toBe(true);
  });

  it("uses the server score when the client lies", () => {
    const v = validateNrRun({ seed, mode: "short", log, claimedScore: 999_999, issuedAt, receivedAt });
    expect(v.score).toBe(score);
    expect(v.flags).toContain("score_mismatch");
  });

  it("rejects a 60 second run submitted after 10 seconds", () => {
    const v = validateNrRun({ seed, mode: "short", log, claimedScore: score, issuedAt, receivedAt: issuedAt + 10_000 });
    expect(v.reason).toBe("submitted_too_early");
  });

  it("rejects malformed logs", () => {
    for (const bad of [null, [], { inputs: "x", endTick: 5 }, { inputs: [[1, "Q"]], endTick: 5 }, { inputs: [[5, "L"], [2, "R"]], endTick: 9 }, { inputs: [], endTick: 0 }]) {
      expect(validateNrRun({ seed, mode: "short", log: bad, claimedScore: 0, issuedAt, receivedAt }).status).toBe("rejected");
    }
  });

  it("flags machine speed input", () => {
    const spam = { inputs: Array.from({ length: 2400 }, (_, i) => [i, i % 2 ? "L" : "R"]), endTick: 3000 };
    const v = validateNrRun({ seed, mode: "short", log: spam, claimedScore: 0, issuedAt, receivedAt });
    expect(v.flags).toContain("input_burst");
    expect(v.status).toBe("flagged");
  });
});
