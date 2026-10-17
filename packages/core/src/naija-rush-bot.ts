/**
 * Test autopilot for Naija Rush. Used to prove generated tracks are fair and
 * to drive end to end tests. It looks at most 30 m ahead, like a player.
 * Not exported from the package index, so it never ships to browsers.
 */
import { NrEngine, OBSTACLE_CLEARANCE, OBSTACLE_LENGTH, TICK_HZ, speedAt, type NrAction, type NrInput, type NrMode } from "./naija-rush";

export interface BotOptions {
  /** Extra ticks of hesitation before reacting, to look human. */
  delayTicks?: number;
}

export function playWithBot(seed: string, mode: NrMode = "short", opts: BotOptions = {}) {
  const engine = new NrEngine(seed, mode);
  const inputs: NrInput[] = [];
  const delay = opts.delayTicks ?? 0;
  let cooldown = 0;

  const act = (a: NrAction) => {
    inputs.push([engine.state.tick, a]);
    engine.act(a);
  };

  while (!engine.over) {
    const s = engine.state;
    const v = speedAt(s.z);
    if (cooldown > 0) cooldown--;
    const ahead = engine.track.obstacles.filter((o) => o.z + OBSTACLE_LENGTH[o.kind] / 2 > s.z - 0.5 && o.z - s.z < 30);
    if (ahead.length && cooldown === 0) {
      const rowZ = Math.min(...ahead.map((o) => o.z));
      const row = ahead.filter((o) => Math.abs(o.z - rowZ) < 1.5);
      const blocked = new Set(row.filter((o) => OBSTACLE_CLEARANCE[o.kind] === "block").map((o) => o.lane));
      if (blocked.has(s.lane)) {
        const options = [-1, 0, 1].filter((l) => !blocked.has(l)).sort((a, b) => Math.abs(a - s.lane) - Math.abs(b - s.lane));
        const target = options[0];
        if (target !== undefined) {
          act(target < s.lane ? "L" : "R");
          cooldown = 2 + delay;
        }
      } else {
        const mine = row.find((o) => o.lane === s.lane);
        if (mine) {
          const gap = mine.z - OBSTACLE_LENGTH[mine.kind] / 2 - s.z;
          const clear = OBSTACLE_CLEARANCE[mine.kind];
          if (gap <= (v * 6) / TICK_HZ) {
            if (clear === "low" && s.jumpTick < 0) act("J");
            if (clear === "high" && s.slideTick < 0) act("S");
          }
        }
      }
    }
    engine.step();
  }
  return { engine, inputs, score: engine.score };
}
