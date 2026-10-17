/**
 * Naija Rush: Survive Lagos. Babylon.js renderer, input and game loop.
 *
 * The rules live in @venix/core (NrEngine). This class steps the engine at a
 * fixed 60 Hz, records inputs as [tick, action] for server replay, and draws
 * an interpolated view. Nothing here can change the score.
 */
import "@babylonjs/core/Materials/standardMaterial";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import "@babylonjs/core/Meshes/instancedMesh";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Layer } from "@babylonjs/core/Layers/layer";
import {
  LANE_WIDTH,
  NrEngine,
  TICK_HZ,
  jumpHeight,
  speedAt,
  type NrAction,
  type NrEvent,
  type NrInput,
  type NrMode,
  type NrState,
  type Obstacle,
  type ObstacleKind,
  type Pickup,
  type PickupKind,
} from "@venix/core";
import { AssetFactory, CHARACTERS, COLORS, buildCharacter, paint, type CharacterRig } from "./assets";

export interface HudState {
  score: number;
  coins: number;
  seconds: number;
  distance: number;
  shield: boolean;
  magnet: boolean;
  remaining: number | null;
}

export interface NrResult {
  score: number;
  log: { inputs: NrInput[]; endTick: number };
  state: NrState;
}

export interface NaijaRushOptions {
  seed: string;
  mode: NrMode;
  character?: string;
  muted?: boolean;
  reducedMotion?: boolean;
  quality?: "auto" | "low" | "high";
  onHud?: (hud: HudState) => void;
  onEvent?: (e: NrEvent) => void;
  onFinish: (result: NrResult) => void;
  onPauseChange?: (paused: boolean) => void;
}

const VIEW_AHEAD = 150;
const VIEW_BEHIND = 14;
const SEGMENT = 40;
const SEGMENTS = 6;

/** True when this browser can run WebGL at all. */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Visual only randomness (scenery), never touches the simulation. */
function visualRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class NaijaRushGame {
  private engine3d: Engine;
  private scene: Scene;
  private camera: FreeCamera;
  private sim: NrEngine;
  private assets: AssetFactory;
  private rig: CharacterRig;
  private shadow: Mesh;
  private shieldBubble: Mesh;
  private obstacleTemplates = new Map<ObstacleKind, Mesh>();
  private pickupTemplates = new Map<PickupKind, Mesh>();
  private live = new Map<string, InstancedMesh>();
  private pool = new Map<string, InstancedMesh[]>();
  private segments: Mesh[] = [];
  private inputs: NrInput[] = [];
  private prevZ = 0;
  private viewX = 0;
  private accumulator = 0;
  private lastTime = 0;
  private running = false;
  private paused = false;
  private finished = false;
  private shake = 0;
  private crashSpin = 0;
  private fpsSamples: number[] = [];
  private scaling = 1;
  private audio: AudioContext | null = null;
  private pointerStart: { x: number; y: number; used: boolean } | null = null;
  private cleanup: (() => void)[] = [];
  private lastHud = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private opts: NaijaRushOptions,
  ) {
    this.sim = new NrEngine(opts.seed, opts.mode);
    this.engine3d = new Engine(canvas, false, { preserveDrawingBuffer: true, stencil: false, powerPreference: "high-performance" }, false);
    const dpr = Math.min(window.devicePixelRatio || 1, opts.quality === "low" ? 1 : 1.5);
    this.scaling = 1 / dpr;
    this.engine3d.setHardwareScalingLevel(this.scaling);

    const scene = (this.scene = new Scene(this.engine3d));
    scene.skipPointerMovePicking = true;
    scene.autoClear = false;
    scene.clearColor = new Color4(1, 0.55, 0.45, 1);
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogStart = 70;
    scene.fogEnd = VIEW_AHEAD;
    scene.fogColor = new Color3(1, 0.62, 0.55);
    this.buildSky();

    const hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, -0.3), scene);
    hemi.intensity = 0.95;
    hemi.groundColor = new Color3(0.55, 0.35, 0.6);
    const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, 0.6), scene);
    sun.intensity = 0.55;
    sun.diffuse = new Color3(1, 0.85, 0.7);

    this.camera = new FreeCamera("cam", new Vector3(0, 4.4, -7.5), scene);
    this.camera.fov = 1.0;
    this.camera.minZ = 0.3;
    this.camera.maxZ = VIEW_AHEAD + 40;
    this.camera.inputs.clear();

    this.assets = new AssetFactory(scene);
    for (const k of ["pothole", "puddle", "cones", "barrier", "canopy", "banner", "danfo", "keke", "cart"] as ObstacleKind[]) {
      this.obstacleTemplates.set(k, this.assets.obstacle(k));
    }
    for (const k of ["coin", "shield", "magnet"] as PickupKind[]) this.pickupTemplates.set(k, this.assets.pickup(k));

    this.buildRoad();
    const look = CHARACTERS.find((c) => c.id === opts.character) ?? CHARACTERS[0]!;
    this.rig = buildCharacter(scene, look, this.assets.material);
    this.rig.root.rotation.y = 0;

    this.shadow = CreateDisc("shadow", { radius: 0.55, tessellation: 18 }, scene);
    this.shadow.rotation.x = Math.PI / 2;
    const shadowMat = new StandardMaterial("shadow", scene);
    shadowMat.diffuseColor = new Color3(0, 0, 0);
    shadowMat.alpha = 0.35;
    shadowMat.disableLighting = true;
    this.shadow.material = shadowMat;

    this.shieldBubble = CreateDisc("bubble", { radius: 1.2, tessellation: 24 }, scene);
    const bubbleMat = new StandardMaterial("bubble", scene);
    bubbleMat.emissiveColor = new Color3(0, 0.88, 0.69);
    bubbleMat.alpha = 0.28;
    bubbleMat.disableLighting = true;
    bubbleMat.backFaceCulling = false;
    this.shieldBubble.material = bubbleMat;
    this.shieldBubble.isVisible = false;

    this.bindInput();
    this.updateWorld(0);
    this.render(0);
  }

  /* ───────── public API ───────── */

  start() {
    if (this.running || this.finished) return;
    this.running = true;
    this.lastTime = performance.now();
    this.engine3d.runRenderLoop(this.frame);
  }

  /** Register a player action now. Also used by on screen buttons. */
  input(action: NrAction) {
    if (!this.running || this.paused || this.finished) return;
    this.inputs.push([this.sim.state.tick, action]);
    this.sim.act(action);
    if (action === "J") this.beep(520, 0.08, "triangle");
    if (action === "S") this.beep(200, 0.08, "triangle");
  }

  pause() {
    if (!this.running || this.paused || this.finished) return;
    this.paused = true;
    this.opts.onPauseChange?.(true);
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.lastTime = performance.now();
    this.opts.onPauseChange?.(false);
  }

  setMuted(m: boolean) {
    this.opts.muted = m;
  }

  get canvasElement() {
    return this.canvas;
  }

  destroy() {
    this.cleanup.forEach((f) => f());
    this.engine3d.stopRenderLoop();
    this.scene.dispose();
    this.engine3d.dispose();
    this.audio?.close().catch(() => {});
  }

  /* ───────── loop ───────── */

  private frame = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    if (!this.paused && !this.finished) {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= 1 / TICK_HZ && steps < 6 && !this.sim.over) {
        this.prevZ = this.sim.state.z;
        for (const e of this.sim.step()) this.onSimEvent(e);
        this.accumulator -= 1 / TICK_HZ;
        steps++;
      }
      if (this.sim.over && !this.finished) this.finish();
      this.adaptQuality(dt);
    }
    const alpha = this.paused ? 1 : Math.min(1, this.accumulator * TICK_HZ);
    this.render(alpha);
    this.scene.render();
    this.emitHud(now);
  };

  private finish() {
    this.finished = true;
    this.beep(this.sim.state.crashed ? 110 : 660, 0.35, this.sim.state.crashed ? "sawtooth" : "square");
    // Keep rendering briefly for the crash tumble, then hand over.
    window.setTimeout(() => {
      this.opts.onFinish({ score: this.sim.score, log: { inputs: [...this.inputs], endTick: this.sim.state.tick }, state: { ...this.sim.state } });
    }, this.sim.state.crashed ? 900 : 300);
  }

  private onSimEvent(e: NrEvent) {
    this.opts.onEvent?.(e);
    switch (e.type) {
      case "coin":
        this.beep(980 + (this.sim.state.coins % 4) * 90, 0.05);
        break;
      case "power":
        this.beep(740, 0.18, "square");
        navigator.vibrate?.(20);
        break;
      case "near_miss":
        this.beep(1300, 0.04);
        break;
      case "shield_break":
        if (!this.opts.reducedMotion) this.shake = 0.5;
        this.beep(300, 0.2, "square");
        navigator.vibrate?.(60);
        break;
      case "crash":
        if (!this.opts.reducedMotion) this.shake = 1;
        this.crashSpin = 0.001;
        navigator.vibrate?.([80, 40, 80]);
        break;
    }
  }

  /* ───────── world ───────── */

  private buildSky() {
    const tex = new DynamicTexture("sky", { width: 8, height: 256 }, this.scene, false);
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#5B2BFF");
    g.addColorStop(0.45, "#FF3D8B");
    g.addColorStop(0.8, "#FF9A3D");
    g.addColorStop(1, "#FFD08A");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 256);
    tex.update();
    const layer = new Layer("skyLayer", null, this.scene, true);
    layer.texture = tex;
  }

  private buildRoad() {
    const scene = this.scene;
    const scenery: Mesh[] = [];
    for (let i = 0; i < 6; i++) scenery.push(this.assets.building(i));
    const palm = this.assets.palm();
    const stalls = [this.assets.stall(0), this.assets.stall(2)];
    const boards = [this.assets.billboard(0), this.assets.billboard(1), this.assets.billboard(2)];

    for (let s = 0; s < SEGMENTS; s++) {
      // Road, lane dashes, kerbs and pavements merged into one vertex coloured
      // mesh per segment: one draw call instead of about twenty.
      const parts: Mesh[] = [];
      const road = paint(CreateGround("road", { width: LANE_WIDTH * 3 + 1.2, height: SEGMENT }, scene), COLORS.road);
      parts.push(road);
      for (const x of [-LANE_WIDTH / 2, LANE_WIDTH / 2]) {
        for (let d = 0; d < SEGMENT; d += 5) {
          const dash = paint(CreateBox("dash", { width: 0.16, height: 0.02, depth: 2.4 }, scene), COLORS.asphaltLine);
          dash.position.set(x, 0.01, -SEGMENT / 2 + d + 1.2);
          parts.push(dash);
        }
      }
      for (const side of [-1, 1]) {
        const kerb = paint(CreateBox("kerb", { width: 0.5, height: 0.25, depth: SEGMENT }, scene), COLORS.kerb);
        kerb.position.set(side * (LANE_WIDTH * 1.5 + 0.85), 0.12, 0);
        parts.push(kerb);
        const pave = paint(CreateGround("pave", { width: 7, height: SEGMENT }, scene), "#E8B48A");
        pave.position.set(side * (LANE_WIDTH * 1.5 + 4.6), 0.05, 0);
        parts.push(pave);
      }
      const seg = Mesh.MergeMeshes(parts, true, true)!;
      seg.name = `seg${s}`;
      seg.material = this.assets.material;
      // Deterministic per segment slot so the street looks the same each lap.
      const r = visualRng(9_001 + s * 31);
      for (const side of [-1, 1]) {
        let z = -SEGMENT / 2 + 4;
        while (z < SEGMENT / 2 - 4) {
          const b = scenery[Math.floor(r() * scenery.length)]!.createInstance("b");
          b.isVisible = true;
          b.parent = seg;
          b.position.set(side * (LANE_WIDTH * 1.5 + 11 + r() * 2), 0, z + 4);
          b.rotation.y = side < 0 ? 0 : Math.PI;
          z += 10;
        }
        const extras = r();
        if (extras < 0.45) {
          const p = palm.createInstance("palm");
          p.parent = seg;
          p.position.set(side * (LANE_WIDTH * 1.5 + 2.4), 0, -8 + r() * 16);
        } else if (extras < 0.8) {
          const st = stalls[Math.floor(r() * stalls.length)]!.createInstance("stall");
          st.parent = seg;
          st.position.set(side * (LANE_WIDTH * 1.5 + 3), 0, -10 + r() * 20);
          st.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        } else {
          const bb = boards[Math.floor(r() * boards.length)]!.createInstance("board");
          bb.parent = seg;
          bb.position.set(side * (LANE_WIDTH * 1.5 + 5.5), 0, 0);
          bb.rotation.y = side < 0 ? 0 : Math.PI;
        }
      }
      seg.position.z = s * SEGMENT;
      seg.freezeWorldMatrix();
      seg.getChildMeshes().forEach((m) => m.freezeWorldMatrix());
      this.segments.push(seg);
    }
  }

  /** Recycle road segments and spawn or release props near the player. */
  private updateWorld(z: number) {
    for (const seg of this.segments) {
      if (seg.position.z + SEGMENT / 2 < z - VIEW_BEHIND - SEGMENT / 2) {
        seg.unfreezeWorldMatrix();
        seg.getChildMeshes().forEach((m) => m.unfreezeWorldMatrix());
        seg.position.z += SEGMENT * SEGMENTS;
        seg.computeWorldMatrix(true);
        seg.getChildMeshes().forEach((m) => m.computeWorldMatrix(true));
        seg.freezeWorldMatrix();
        seg.getChildMeshes().forEach((m) => m.freezeWorldMatrix());
      }
    }
    const keep = new Set<string>();
    const lo = z - VIEW_BEHIND;
    const hi = z + VIEW_AHEAD;
    for (const o of this.windowed(this.sim.track.obstacles, lo, hi)) {
      const key = `o${o.id}`;
      keep.add(key);
      if (!this.live.has(key)) this.spawn(key, `o:${o.kind}`, this.obstacleTemplates.get(o.kind)!, o);
    }
    for (const p of this.windowed(this.sim.track.pickups, lo, hi)) {
      const key = `p${p.id}`;
      if (this.sim.isTaken(p.id)) continue;
      keep.add(key);
      if (!this.live.has(key)) this.spawn(key, `p:${p.kind}`, this.pickupTemplates.get(p.kind)!, p);
    }
    for (const [key, inst] of this.live) {
      if (keep.has(key)) continue;
      inst.setEnabled(false);
      const poolKey = inst.metadata as string;
      (this.pool.get(poolKey) ?? this.pool.set(poolKey, []).get(poolKey)!).push(inst);
      this.live.delete(key);
    }
  }

  private *windowed<T extends { z: number }>(items: T[], lo: number, hi: number): Generator<T> {
    // Items are sorted by z; binary search the start.
    let a = 0;
    let b = items.length;
    while (a < b) {
      const m = (a + b) >> 1;
      if (items[m]!.z < lo) a = m + 1;
      else b = m;
    }
    for (let i = a; i < items.length && items[i]!.z <= hi; i++) yield items[i]!;
  }

  private spawn(key: string, poolKey: string, template: Mesh, item: Obstacle | Pickup) {
    const inst = this.pool.get(poolKey)?.pop() ?? template.createInstance(poolKey);
    inst.metadata = poolKey;
    inst.setEnabled(true);
    inst.position.set(item.lane * LANE_WIDTH, "kind" in item && (item.kind === "coin" || item.kind === "shield" || item.kind === "magnet") ? 1 : 0, item.z);
    inst.rotation.set(0, 0, 0);
    this.live.set(key, inst);
  }

  /* ───────── render ───────── */

  private render(alpha: number) {
    const s = this.sim.state;
    const z = this.prevZ + (s.z - this.prevZ) * alpha;
    const t = performance.now() / 1000;
    this.updateWorld(z);

    // Smooth lane change and jump arc
    const targetX = s.lane * LANE_WIDTH;
    this.viewX += (targetX - this.viewX) * (this.opts.reducedMotion ? 1 : 0.32);
    const y = jumpHeight(s.jumpTick);
    const root = this.rig.root;
    root.position.set(this.viewX, y, z);
    root.rotation.z = (this.viewX - targetX) * 0.08;

    const sliding = s.slideTick >= 0;
    root.scaling.y = sliding ? 0.55 : 1;
    root.rotation.x = sliding ? -0.5 : 0;

    // Run cycle
    const phase = this.finished ? 0 : z * 1.6;
    const swing = Math.sin(phase) * (s.jumpTick >= 0 ? 0.2 : 0.9);
    this.rig.legL.rotation.x = swing;
    this.rig.legR.rotation.x = -swing;
    this.rig.armL.rotation.x = -swing * 0.8;
    this.rig.armR.rotation.x = swing * 0.8;
    this.rig.body.position.y = this.finished ? 0 : Math.abs(Math.cos(phase)) * 0.06;

    if (this.crashSpin > 0) {
      this.crashSpin += 0.016;
      root.rotation.x = -Math.min(1.4, this.crashSpin * 4);
      root.position.y = Math.max(0, 0.6 - this.crashSpin * 2);
    }

    this.shadow.position.set(this.viewX, 0.03, z);
    this.shadow.scaling.setAll(Math.max(0.5, 1 - y * 0.25));

    const shielded = s.shieldUntil >= s.tick;
    this.shieldBubble.isVisible = shielded;
    if (shielded) {
      this.shieldBubble.position.set(this.viewX, y + 1.1, z - 0.4);
    }

    // Spin pickups
    for (const [key, inst] of this.live) {
      if (key[0] === "p") {
        inst.rotation.y = t * 3;
        if (!this.opts.reducedMotion) inst.position.y = 1 + Math.sin(t * 4 + inst.position.z) * 0.12;
      }
    }

    // Camera follows behind and slightly above
    let shakeX = 0;
    let shakeY = 0;
    if (this.shake > 0) {
      shakeX = (Math.random() - 0.5) * this.shake;
      shakeY = (Math.random() - 0.5) * this.shake;
      this.shake *= 0.9;
      if (this.shake < 0.01) this.shake = 0;
    }
    const speedPull = (speedAt(z) - 11) * 0.06;
    this.camera.position.set(this.viewX * 0.65 + shakeX, 4.3 + y * 0.35 + shakeY, z - 7.6 - speedPull);
    this.camera.setTarget(new Vector3(this.viewX * 0.8, 1.4, z + 9));
  }

  private emitHud(now: number) {
    if (!this.opts.onHud || now - this.lastHud < 90) return;
    this.lastHud = now;
    const s = this.sim.state;
    this.opts.onHud({
      score: this.sim.score,
      coins: s.coins,
      seconds: s.tick / TICK_HZ,
      distance: Math.floor(s.z),
      shield: s.shieldUntil >= s.tick,
      magnet: s.magnetUntil >= s.tick,
      remaining: this.opts.mode === "short" ? Math.max(0, Math.ceil((this.sim.maxTicks - s.tick) / TICK_HZ)) : null,
    });
  }

  /** Lower the render resolution if the device cannot keep up. */
  private adaptQuality(dt: number) {
    if (this.opts.quality === "high") return;
    this.fpsSamples.push(1 / Math.max(dt, 0.001));
    if (this.fpsSamples.length < 90) return;
    const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    this.fpsSamples = [];
    if (avg < 40 && this.scaling < 2) {
      this.scaling = Math.min(2, this.scaling + 0.25);
      this.engine3d.setHardwareScalingLevel(this.scaling);
      this.scene.fogEnd = Math.max(100, this.scene.fogEnd - 15);
    } else if (avg > 57 && this.scaling > 1 / Math.min(window.devicePixelRatio || 1, 1.5)) {
      this.scaling = Math.max(1 / Math.min(window.devicePixelRatio || 1, 1.5), this.scaling - 0.25);
      this.engine3d.setHardwareScalingLevel(this.scaling);
    }
  }

  /* ───────── input ───────── */

  private bindInput() {
    const SWIPE = 28;
    const onDown = (e: PointerEvent) => {
      this.pointerStart = { x: e.clientX, y: e.clientY, used: false };
    };
    const onMove = (e: PointerEvent) => {
      const p = this.pointerStart;
      if (!p || p.used) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE) return;
      p.used = true;
      if (Math.abs(dx) > Math.abs(dy)) this.input(dx < 0 ? "L" : "R");
      else this.input(dy < 0 ? "J" : "S");
    };
    const onUp = () => {
      this.pointerStart = null;
    };
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, NrAction> = {
        ArrowLeft: "L",
        a: "L",
        ArrowRight: "R",
        d: "R",
        ArrowUp: "J",
        w: "J",
        " ": "J",
        ArrowDown: "S",
        s: "S",
      };
      if (e.key === "p" || e.key === "Escape") {
        this.paused ? this.resume() : this.pause();
        return;
      }
      const a = map[e.key];
      if (a) {
        e.preventDefault();
        this.input(a);
      }
    };
    const onVisibility = () => document.hidden && this.pause();
    const onResize = () => this.engine3d.resize();
    this.canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", onResize);
    this.cleanup.push(
      () => this.canvas.removeEventListener("pointerdown", onDown),
      () => window.removeEventListener("pointermove", onMove),
      () => window.removeEventListener("pointerup", onUp),
      () => window.removeEventListener("pointercancel", onUp),
      () => window.removeEventListener("keydown", onKey),
      () => document.removeEventListener("visibilitychange", onVisibility),
      () => window.removeEventListener("resize", onResize),
    );
  }

  private beep(freq: number, dur: number, type: OscillatorType = "sine") {
    if (this.opts.muted) return;
    try {
      this.audio ??= new AudioContext();
      const osc = this.audio.createOscillator();
      const gain = this.audio.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.07, this.audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.audio.currentTime + dur);
      osc.connect(gain).connect(this.audio.destination);
      osc.start();
      osc.stop(this.audio.currentTime + dur);
    } catch {
      /* audio optional */
    }
  }
}
