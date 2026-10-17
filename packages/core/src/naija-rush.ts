/**
 * Naija Rush: Survive Lagos. Deterministic rules engine.
 *
 * A fixed step simulation (60 ticks per second) shared by the browser and the
 * server. The browser records swipes as [tick, action]; the server replays
 * them against the seed it issued and that result is the score. Only basic
 * IEEE 754 arithmetic is used in the simulation, so every engine agrees.
 *
 * World units are metres. The player runs along +z in one of three lanes.
 */
import { createRng } from "./rng";

export const NR_VERSION = "nr-1.0.0";
export const TICK_HZ = 60;
export const SHORT_RUN_TICKS = 60 * TICK_HZ; // 60 second rush
export const ENDLESS_MAX_TICKS = 20 * 60 * TICK_HZ; // hard stop at 20 minutes
export const LANES = [-1, 0, 1] as const;
export const LANE_WIDTH = 2.6;
export const JUMP_TICKS = 38;
export const SLIDE_TICKS = 38;
export const SHIELD_TICKS = 9 * TICK_HZ;
export const MAGNET_TICKS = 7 * TICK_HZ;
export const SURVIVE_BONUS = 150;
export const MAX_INPUTS_PER_SECOND = 12;

export type NrAction = "L" | "R" | "J" | "S";
export const NR_ACTIONS: readonly NrAction[] = ["L", "R", "J", "S"];

/** low: jump over it. high: slide under it. block: change lane. */
export type ObstacleKind = "pothole" | "puddle" | "cones" | "barrier" | "canopy" | "banner" | "danfo" | "keke" | "cart";
export const OBSTACLE_CLEARANCE: Record<ObstacleKind, "low" | "high" | "block"> = {
  pothole: "low",
  puddle: "low",
  cones: "low",
  barrier: "low",
  canopy: "high",
  banner: "high",
  danfo: "block",
  keke: "block",
  cart: "block",
};
export const OBSTACLE_LENGTH: Record<ObstacleKind, number> = {
  pothole: 1.8,
  puddle: 2.2,
  cones: 1.2,
  barrier: 0.8,
  canopy: 1.6,
  banner: 0.8,
  danfo: 6.5,
  keke: 3,
  cart: 2.2,
};

export type PickupKind = "coin" | "shield" | "magnet";

export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  lane: number;
  z: number;
}

export interface Pickup {
  id: number;
  kind: PickupKind;
  lane: number;
  z: number;
}

export interface Track {
  obstacles: Obstacle[];
  pickups: Pickup[];
  length: number;
}

/** Speed in metres per second as a function of distance travelled. */
export const speedAt = (z: number) => Math.min(24, 11 + z * 0.012);

const PLAYER_DEPTH = 0.45;
const START_CLEAR = 45;

/**
 * Build the track for a seed. Every row leaves a way through, and the gap
 * between rows always gives at least ~1 second at the speed reached there,
 * so every pattern is fair to a human.
 */
export function generateTrack(seed: string, length = 2400): Track {
  const rng = createRng(`nr:${seed}`);
  const obstacles: Obstacle[] = [];
  const pickups: Pickup[] = [];
  let oid = 0;
  let pid = 0;
  let z = START_CLEAR;
  let lastFree = 0;

  const add = (kind: ObstacleKind, lane: number, at: number) => obstacles.push({ id: oid++, kind, lane, z: at });
  const coinRow = (lane: number, from: number, count: number) => {
    for (let i = 0; i < count; i++) pickups.push({ id: pid++, kind: "coin", lane, z: from + i * 2.2 });
  };

  while (z < length) {
    const v = speedAt(z);
    const difficulty = Math.min(1, z / 1400);
    const roll = rng.next();

    if (roll < 0.34) {
      // One or two vehicles blocking lanes; the free lane is never far from the last one.
      const free = rng.next() < 0.5 ? lastFree : (LANES[rng.int(0, 2)] as number);
      const blocked = LANES.filter((l) => l !== free);
      const twoBlocks = rng.next() < 0.35 + difficulty * 0.45;
      const pick = blocked[rng.int(0, blocked.length - 1)]!;
      const vehicles: ObstacleKind[] = ["danfo", "keke", "cart"];
      for (const lane of twoBlocks ? blocked : [pick]) add(rng.pick(vehicles), lane, z);
      coinRow(free, z - 4, 4);
      lastFree = free;
    } else if (roll < 0.56) {
      // Low hazard across every lane: jump.
      const kind = rng.pick<ObstacleKind>(["pothole", "puddle", "cones", "barrier"]);
      for (const lane of LANES) add(kind, lane, z);
    } else if (roll < 0.72) {
      // Overhead canopy or banner across every lane: slide.
      const kind = rng.pick<ObstacleKind>(["canopy", "banner"]);
      for (const lane of LANES) add(kind, lane, z);
    } else if (roll < 0.9) {
      // Mixed: a vehicle in one lane, a low hazard in another, one lane clear.
      // Fisher Yates with the seeded RNG. Never sort with a random comparator:
      // browsers use different sort algorithms and would disagree with the server.
      const lanes: number[] = [...LANES];
      for (let k = lanes.length - 1; k > 0; k--) {
        const j = rng.int(0, k);
        [lanes[k], lanes[j]] = [lanes[j]!, lanes[k]!];
      }
      add(rng.pick<ObstacleKind>(["danfo", "keke"]), lanes[0]!, z);
      add(rng.pick<ObstacleKind>(["pothole", "cones"]), lanes[1]!, z);
      coinRow(lanes[2]!, z - 6, 5);
      lastFree = lanes[2]!;
    } else {
      // Breather with a long coin trail and sometimes a power up.
      const lane = LANES[rng.int(0, 2)]!;
      coinRow(lane, z - 6, 8);
      if (rng.next() < 0.45) pickups.push({ id: pid++, kind: rng.next() < 0.5 ? "shield" : "magnet", lane: LANES[rng.int(0, 2)]!, z: z + 8 });
    }

    const gapSeconds = 1.15 - difficulty * 0.2 + rng.next() * 0.35;
    z += Math.max(14, v * gapSeconds);
  }
  // Coins and power ups must never sit inside an obstacle.
  const clean = pickups.filter((p) => !obstacles.some((o) => o.lane === p.lane && Math.abs(o.z - p.z) < OBSTACLE_LENGTH[o.kind] / 2 + 1));
  return { obstacles, pickups: clean, length };
}

export interface NrState {
  tick: number;
  z: number;
  lane: number;
  jumpTick: number; // ticks since jump started, -1 when grounded
  slideTick: number; // ticks since slide started, -1 when upright
  shieldUntil: number;
  magnetUntil: number;
  coins: number;
  shieldsUsed: number;
  nearMisses: number;
  crashed: boolean;
  crashedInto: ObstacleKind | null;
  finished: boolean;
}

export type NrEvent =
  | { type: "coin"; pickup: Pickup }
  | { type: "power"; pickup: Pickup }
  | { type: "shield_break"; obstacle: Obstacle }
  | { type: "crash"; obstacle: Obstacle }
  | { type: "near_miss"; obstacle: Obstacle }
  | { type: "finish" };

export type NrMode = "short" | "endless";

export const isAirborne = (s: NrState) => s.jumpTick >= 3 && s.jumpTick <= JUMP_TICKS - 3;
export const isLow = (s: NrState) => s.slideTick >= 2 && s.slideTick <= SLIDE_TICKS - 2;

/** Jump height curve for rendering (metres). Not used by collision. */
export function jumpHeight(jumpTick: number): number {
  if (jumpTick < 0) return 0;
  const p = jumpTick / JUMP_TICKS;
  return 4 * 1.7 * p * (1 - p);
}

export function nrScore(s: Pick<NrState, "z" | "coins" | "nearMisses" | "finished" | "crashed">): number {
  return Math.floor(s.z) + s.coins * 5 + s.nearMisses * 10 + (s.finished && !s.crashed ? SURVIVE_BONUS : 0);
}

export class NrEngine {
  readonly track: Track;
  readonly state: NrState = {
    tick: 0,
    z: 0,
    lane: 0,
    jumpTick: -1,
    slideTick: -1,
    shieldUntil: -1,
    magnetUntil: -1,
    coins: 0,
    shieldsUsed: 0,
    nearMisses: 0,
    crashed: false,
    crashedInto: null,
    finished: false,
  };
  private taken = new Set<number>();
  private passed = new Set<number>();
  private hit = new Set<number>();
  private obstacleCursor = 0;
  private pickupCursor = 0;
  readonly maxTicks: number;

  constructor(
    readonly seed: string,
    readonly mode: NrMode = "short",
  ) {
    this.track = generateTrack(seed, mode === "short" ? 2400 : 30000);
    this.maxTicks = mode === "short" ? SHORT_RUN_TICKS : ENDLESS_MAX_TICKS;
  }

  get over() {
    return this.state.crashed || this.state.finished;
  }

  /** Apply a player action at the current tick. Invalid moves are ignored. */
  act(action: NrAction) {
    const s = this.state;
    if (this.over) return;
    if (action === "L") s.lane = Math.max(-1, s.lane - 1);
    else if (action === "R") s.lane = Math.min(1, s.lane + 1);
    else if (action === "J" && s.jumpTick < 0) {
      s.jumpTick = 0;
      s.slideTick = -1;
    } else if (action === "S") {
      // Sliding while airborne slams down fast, a common runner convention.
      s.jumpTick = -1;
      s.slideTick = 0;
    }
  }

  /** Advance one tick. Returns the events that happened during it. */
  step(): NrEvent[] {
    const s = this.state;
    const events: NrEvent[] = [];
    if (this.over) return events;

    s.tick++;
    s.z += speedAt(s.z) / TICK_HZ;
    if (s.jumpTick >= 0) s.jumpTick = s.jumpTick + 1 > JUMP_TICKS ? -1 : s.jumpTick + 1;
    if (s.slideTick >= 0) s.slideTick = s.slideTick + 1 > SLIDE_TICKS ? -1 : s.slideTick + 1;

    // Pickups
    const pk = this.track.pickups;
    while (this.pickupCursor < pk.length && pk[this.pickupCursor]!.z < s.z - 2) this.pickupCursor++;
    const magnet = s.magnetUntil >= s.tick;
    for (let i = this.pickupCursor; i < pk.length && pk[i]!.z < s.z + 1.2; i++) {
      const p = pk[i]!;
      if (this.taken.has(p.id)) continue;
      const reach = p.kind === "coin" && magnet ? 1 : 0;
      if (Math.abs(p.z - s.z) < 1 && Math.abs(p.lane - s.lane) <= reach) {
        this.taken.add(p.id);
        if (p.kind === "coin") {
          s.coins++;
          events.push({ type: "coin", pickup: p });
        } else {
          if (p.kind === "shield") s.shieldUntil = s.tick + SHIELD_TICKS;
          else s.magnetUntil = s.tick + MAGNET_TICKS;
          events.push({ type: "power", pickup: p });
        }
      }
    }

    // Obstacles
    const ob = this.track.obstacles;
    while (this.obstacleCursor < ob.length) {
      const o = ob[this.obstacleCursor]!;
      if (o.z + OBSTACLE_LENGTH[o.kind] / 2 + PLAYER_DEPTH >= s.z) break;
      // Fully passed: count a near miss when a vehicle was in the next lane.
      if (!this.hit.has(o.id) && !this.passed.has(o.id) && OBSTACLE_CLEARANCE[o.kind] === "block" && Math.abs(o.lane - s.lane) === 1) {
        s.nearMisses++;
        events.push({ type: "near_miss", obstacle: o });
      }
      this.passed.add(o.id);
      this.obstacleCursor++;
    }
    for (let i = this.obstacleCursor; i < ob.length; i++) {
      const o = ob[i]!;
      const half = OBSTACLE_LENGTH[o.kind] / 2 + PLAYER_DEPTH;
      if (o.z - half > s.z) break;
      if (o.lane !== s.lane || this.hit.has(o.id)) continue;
      const clear = OBSTACLE_CLEARANCE[o.kind];
      const dodged = (clear === "low" && isAirborne(s)) || (clear === "high" && isLow(s));
      if (dodged) continue;
      this.hit.add(o.id);
      if (s.shieldUntil >= s.tick) {
        s.shieldUntil = -1;
        s.shieldsUsed++;
        events.push({ type: "shield_break", obstacle: o });
        continue;
      }
      s.crashed = true;
      s.crashedInto = o.kind;
      events.push({ type: "crash", obstacle: o });
      return events;
    }

    if (s.tick >= this.maxTicks) {
      s.finished = true;
      events.push({ type: "finish" });
    }
    return events;
  }

  get score() {
    return nrScore(this.state);
  }

  /** Whether a pickup has been collected (for renderers). */
  isTaken(pickupId: number) {
    return this.taken.has(pickupId);
  }
}

export type NrInput = [tick: number, action: NrAction];

export interface NrReplayResult {
  score: number;
  state: NrState;
  inputs: number;
}

/**
 * Replay a run. An input stamped with tick t is applied before step t+1,
 * exactly as the client loop does it.
 */
export function replayNr(seed: string, mode: NrMode, inputs: readonly NrInput[]): NrReplayResult {
  const engine = new NrEngine(seed, mode);
  let i = 0;
  while (!engine.over) {
    while (i < inputs.length && inputs[i]![0] <= engine.state.tick) engine.act(inputs[i++]![1]);
    engine.step();
  }
  return { score: engine.score, state: { ...engine.state }, inputs: inputs.length };
}
