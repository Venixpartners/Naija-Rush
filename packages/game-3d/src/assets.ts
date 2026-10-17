/**
 * Original, code built low poly assets for Naija Rush. Every prop is made of
 * primitives with baked vertex colours, merged into one mesh per template so
 * the scene can draw hundreds of instances cheaply. No external models,
 * textures or logos: nothing to license, nothing extra to download.
 */
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Scene } from "@babylonjs/core/scene";
import type { ObstacleKind, PickupKind } from "@venix/core";

export const COLORS = {
  danfo: "#FFC400",
  black: "#15101C",
  white: "#FFFFFF",
  glass: "#2B3A67",
  pink: "#FF3D8B",
  blue: "#00C2FF",
  orange: "#FF7A00",
  lime: "#7BE000",
  purple: "#B44DFF",
  teal: "#00E0B0",
  red: "#FF2E4D",
  road: "#3B3346",
  asphaltLine: "#FFF3B0",
  kerb: "#FFD23F",
  pavement: "#C9A27E",
  mud: "#4A2E1E",
  water: "#3FA9F5",
  wood: "#A0522D",
  skin1: "#7A4A2A",
  skin2: "#5C3317",
  skin3: "#8D5524",
  gold: "#FFD54A",
};

const hexToColor4 = (hex: string, a = 1) => {
  const n = parseInt(hex.slice(1), 16);
  return new Color4(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a);
};

/** Paint every vertex of a mesh one flat colour. */
export function paint(mesh: Mesh, hex: string): Mesh {
  const c = hexToColor4(hex);
  const count = mesh.getTotalVertices();
  const data = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) data.set([c.r, c.g, c.b, c.a], i * 4);
  mesh.setVerticesData(VertexBuffer.ColorKind, data);
  return mesh;
}

type Part = Mesh;

export class AssetFactory {
  readonly material: StandardMaterial;
  readonly glow: StandardMaterial;

  constructor(private scene: Scene) {
    // One shared material: colour comes from vertices.
    this.material = new StandardMaterial("vc", scene);
    this.material.specularColor.set(0.08, 0.08, 0.08);
    this.glow = new StandardMaterial("glow", scene);
    this.glow.emissiveColor.set(1, 0.85, 0.3);
    this.glow.disableLighting = true;
  }

  private box(w: number, h: number, d: number, at: [number, number, number], color: string): Part {
    const m = CreateBox("p", { width: w, height: h, depth: d }, this.scene);
    m.position.set(...at);
    return paint(m, color);
  }

  private cyl(dTop: number, dBottom: number, h: number, at: [number, number, number], color: string, rotZ = 0, tess = 12): Part {
    const m = CreateCylinder("p", { diameterTop: dTop, diameterBottom: dBottom, height: h, tessellation: tess }, this.scene);
    m.position.set(...at);
    m.rotation.z = rotZ;
    return paint(m, color);
  }

  private sphere(d: number, at: [number, number, number], color: string, seg = 8): Part {
    const m = CreateSphere("p", { diameter: d, segments: seg }, this.scene);
    m.position.set(...at);
    return paint(m, color);
  }

  /** Merge parts into one template mesh, hidden until instanced. */
  private template(name: string, parts: Part[]): Mesh {
    const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, false)!;
    merged.name = name;
    merged.material = this.material;
    merged.isVisible = false;
    merged.alwaysSelectAsActiveMesh = false;
    merged.freezeNormals();
    return merged;
  }

  private wheels(xs: number, zs: number[], y: number, d: number): Part[] {
    const out: Part[] = [];
    for (const z of zs) for (const x of [-xs, xs]) out.push(this.cyl(d, d, 0.32, [x, y, z], COLORS.black, Math.PI / 2));
    return out;
  }

  /** Yellow danfo bus with the black stripes Lagos knows by heart. */
  danfo(): Mesh {
    const p: Part[] = [
      this.box(2.2, 2.1, 6.2, [0, 1.45, 0], COLORS.danfo),
      this.box(2.24, 0.16, 6.24, [0, 1.05, 0], COLORS.black),
      this.box(2.24, 0.16, 6.24, [0, 1.85, 0], COLORS.black),
      this.box(2.1, 0.75, 5.4, [0, 2.1, -0.2], COLORS.glass),
      this.box(2.1, 0.8, 0.1, [0, 2.0, -3.11], COLORS.glass), // windscreen faces the runner
      this.box(2.0, 0.25, 5.6, [0, 2.62, 0], COLORS.danfo),
      this.box(1.6, 0.3, 2.2, [0, 2.88, 0.6], COLORS.wood), // roof rack
      this.box(0.4, 0.25, 0.1, [-0.7, 1.0, -3.12], COLORS.white),
      this.box(0.4, 0.25, 0.1, [0.7, 1.0, -3.12], COLORS.white),
      ...this.wheels(1.0, [-2.1, 2.1], 0.45, 0.9),
    ];
    return this.template("danfo", p);
  }

  /** Tricycle (keke) with a bright canopy. */
  keke(): Mesh {
    const p: Part[] = [
      this.box(1.4, 0.9, 2.4, [0, 0.9, 0.2], COLORS.lime),
      this.box(1.5, 0.12, 2.6, [0, 1.42, 0.2], COLORS.black),
      this.box(1.45, 0.1, 2.5, [0, 2.15, 0.25], COLORS.danfo),
      this.box(0.08, 0.75, 0.08, [-0.66, 1.78, -0.9], COLORS.black),
      this.box(0.08, 0.75, 0.08, [0.66, 1.78, -0.9], COLORS.black),
      this.box(0.08, 0.75, 0.08, [-0.66, 1.78, 1.3], COLORS.black),
      this.box(0.08, 0.75, 0.08, [0.66, 1.78, 1.3], COLORS.black),
      this.box(1.2, 0.6, 0.06, [0, 1.75, -0.95], COLORS.glass),
      this.cyl(0.6, 0.6, 0.18, [0, 0.32, -1.05], COLORS.black, Math.PI / 2),
      ...this.wheels(0.68, [0.9], 0.32, 0.62),
    ];
    return this.template("keke", p);
  }

  /** Street food cart with a striped umbrella. */
  cart(): Mesh {
    const p: Part[] = [
      this.box(1.7, 1.0, 1.6, [0, 0.9, 0], COLORS.blue),
      this.box(1.75, 0.12, 1.65, [0, 1.45, 0], COLORS.white),
      this.box(0.5, 0.3, 0.5, [-0.35, 1.65, 0], COLORS.orange),
      this.box(0.5, 0.25, 0.5, [0.35, 1.62, 0.1], COLORS.lime),
      this.cyl(0.06, 0.06, 1.6, [0.6, 2.2, 0], COLORS.white),
      this.cyl(0.05, 2.6, 0.6, [0.6, 3.1, 0], COLORS.pink, 0, 8),
      ...this.wheels(0.9, [0], 0.35, 0.7),
    ];
    return this.template("cart", p);
  }

  pothole(): Mesh {
    return this.template("pothole", [
      this.cyl(2.1, 2.1, 0.04, [0, 0.02, 0], COLORS.mud, 0, 16),
      this.cyl(1.5, 1.5, 0.05, [0, 0.03, 0], COLORS.black, 0, 16),
      this.box(0.3, 0.12, 0.3, [0.9, 0.06, 0.4], COLORS.road),
      this.box(0.25, 0.1, 0.2, [-0.8, 0.05, -0.5], COLORS.road),
    ]);
  }

  puddle(): Mesh {
    return this.template("puddle", [this.cyl(2.4, 2.4, 0.04, [0, 0.02, 0], COLORS.water, 0, 16), this.cyl(1.2, 1.2, 0.05, [0.4, 0.03, 0.3], COLORS.blue, 0, 12)]);
  }

  cones(): Mesh {
    const p: Part[] = [];
    for (const x of [-0.7, 0, 0.7]) {
      p.push(this.cyl(0.08, 0.55, 0.85, [x, 0.45, 0], COLORS.orange));
      p.push(this.cyl(0.32, 0.4, 0.14, [x, 0.42, 0], COLORS.white));
      p.push(this.box(0.62, 0.06, 0.62, [x, 0.03, 0], COLORS.black));
    }
    return this.template("cones", p);
  }

  barrier(): Mesh {
    const p: Part[] = [this.box(0.12, 0.9, 0.12, [-1, 0.45, 0], COLORS.white), this.box(0.12, 0.9, 0.12, [1, 0.45, 0], COLORS.white)];
    for (let i = 0; i < 5; i++) p.push(this.box(0.44, 0.34, 0.14, [-0.88 + i * 0.44, 0.75, 0], i % 2 ? COLORS.white : COLORS.red));
    return this.template("barrier", p);
  }

  /** Market canopy hung across the road at head height. Slide under it. */
  canopy(): Mesh {
    const p: Part[] = [this.box(0.12, 2.2, 0.12, [-1.2, 1.1, 0], COLORS.wood), this.box(0.12, 2.2, 0.12, [1.2, 1.1, 0], COLORS.wood)];
    const stripes = [COLORS.pink, COLORS.danfo, COLORS.teal, COLORS.purple, COLORS.orange, COLORS.blue];
    stripes.forEach((c, i) => p.push(this.box(0.44, 0.7, 1.4, [-1.1 + i * 0.44, 1.75, 0], c)));
    return this.template("canopy", p);
  }

  /** Overhead event banner. Slide under it. */
  banner(): Mesh {
    return this.template("banner", [
      this.box(0.14, 2.4, 0.14, [-1.25, 1.2, 0], COLORS.black),
      this.box(0.14, 2.4, 0.14, [1.25, 1.2, 0], COLORS.black),
      this.box(2.6, 0.8, 0.12, [0, 1.8, 0], COLORS.purple),
      this.box(2.2, 0.22, 0.14, [0, 1.92, 0], COLORS.danfo),
      this.box(1.4, 0.16, 0.14, [0, 1.62, 0], COLORS.white),
    ]);
  }

  coin(): Mesh {
    const m = this.template("coin", [this.cyl(0.6, 0.6, 0.1, [0, 0, 0], COLORS.gold, Math.PI / 2, 16), this.cyl(0.38, 0.38, 0.12, [0, 0, 0], COLORS.danfo, Math.PI / 2, 12)]);
    return m;
  }

  shield(): Mesh {
    const ring = CreateTorus("p", { diameter: 0.9, thickness: 0.16, tessellation: 18 }, this.scene);
    ring.rotation.x = Math.PI / 2;
    paint(ring, COLORS.teal);
    return this.template("shield", [ring, this.sphere(0.5, [0, 0, 0], COLORS.blue)]);
  }

  magnet(): Mesh {
    return this.template("magnet", [
      this.box(0.22, 0.7, 0.22, [-0.3, 0.1, 0], COLORS.red),
      this.box(0.22, 0.7, 0.22, [0.3, 0.1, 0], COLORS.red),
      this.box(0.82, 0.22, 0.22, [0, 0.45, 0], COLORS.red),
      this.box(0.22, 0.2, 0.22, [-0.3, -0.33, 0], COLORS.white),
      this.box(0.22, 0.2, 0.22, [0.3, -0.33, 0], COLORS.white),
    ]);
  }

  obstacle(kind: ObstacleKind): Mesh {
    return this[kind]();
  }

  pickup(kind: PickupKind): Mesh {
    return this[kind]();
  }

  /** Colourful two or three storey Lagos building with windows and a sign band. */
  building(seed: number): Mesh {
    const walls = [COLORS.pink, COLORS.blue, COLORS.lime, COLORS.orange, COLORS.purple, COLORS.teal, COLORS.danfo];
    const wall = walls[seed % walls.length]!;
    const trim = walls[(seed + 3) % walls.length]!;
    const floors = 2 + (seed % 3);
    const h = floors * 3;
    const w = 7 + (seed % 3) * 1.5;
    const p: Part[] = [this.box(5, h, w, [0, h / 2, 0], wall), this.box(5.2, 0.4, w + 0.2, [0, h + 0.2, 0], trim)];
    for (let f = 0; f < floors; f++) {
      for (let k = 0; k < Math.floor(w / 2.2); k++) {
        p.push(this.box(0.1, 1.2, 1.1, [2.52, 1.7 + f * 3, -w / 2 + 1.4 + k * 2.2], f === 0 ? COLORS.glass : COLORS.white));
      }
    }
    p.push(this.box(0.14, 0.9, w * 0.8, [2.56, 3.1, 0], trim)); // shop sign band, faces the road
    p.push(this.box(1.6, 0.12, w, [3.2, 2.7, 0], COLORS.white)); // awning
    return this.template(`building${seed}`, p);
  }

  palm(): Mesh {
    const p: Part[] = [this.cyl(0.25, 0.35, 5, [0, 2.5, 0], COLORS.wood)];
    for (let i = 0; i < 6; i++) {
      const leaf = this.box(0.3, 0.08, 2.6, [0, 5, 0], i % 2 ? COLORS.lime : COLORS.teal);
      leaf.rotation.y = (i / 6) * Math.PI * 2;
      leaf.rotation.x = 0.35;
      leaf.locallyTranslate(new Vector3(0, 0, 1.1));
      p.push(leaf);
    }
    return this.template("palm", p);
  }

  /** Roadside stall with stacked colourful goods. */
  stall(seed: number): Mesh {
    const goods = [COLORS.orange, COLORS.lime, COLORS.pink, COLORS.danfo, COLORS.blue];
    const p: Part[] = [this.box(2.2, 0.9, 1.4, [0, 0.45, 0], COLORS.wood)];
    for (let i = 0; i < 6; i++) p.push(this.sphere(0.45, [-0.75 + (i % 3) * 0.75, 1.05 + Math.floor(i / 3) * 0.3, -0.2 + Math.floor(i / 3) * 0.3], goods[(seed + i) % goods.length]!, 6));
    p.push(this.cyl(0.05, 0.05, 1.8, [0.9, 1.6, 0], COLORS.white));
    p.push(this.cyl(0.05, 2.4, 0.5, [0.9, 2.6, 0], goods[(seed + 2) % goods.length]!, 0, 8));
    return this.template(`stall${seed}`, p);
  }

  /** Billboard with an original abstract panel (no third party brands). */
  billboard(seed: number): Mesh {
    const bg = [COLORS.purple, COLORS.pink, COLORS.blue][seed % 3]!;
    return this.template(`billboard${seed}`, [
      this.box(0.3, 6, 0.3, [0, 3, 0], COLORS.black),
      this.box(0.3, 3, 6, [0, 7, 0], bg),
      this.box(0.34, 0.6, 4.6, [0, 7.6, 0], COLORS.danfo),
      this.box(0.34, 0.4, 3.4, [0, 6.6, 0], COLORS.white),
      this.box(0.34, 0.5, 1.2, [0, 6.0, -1.6], COLORS.lime),
    ]);
  }
}

export interface CharacterLook {
  id: string;
  name: string;
  skin: string;
  top: string;
  bottom: string;
  shoes: string;
  hat: string;
  hatStyle: "cap" | "gele" | "beanie";
  /** Product that unlocks this outfit; undefined means free. Looks only. */
  product?: string;
}

/** Three original runners. Different looks, identical ability. */
export const CHARACTERS: CharacterLook[] = [
  { id: "tunde", name: "Tunde", skin: COLORS.skin1, top: COLORS.lime, bottom: COLORS.black, shoes: COLORS.white, hat: COLORS.red, hatStyle: "cap" },
  { id: "ada", name: "Ada", skin: COLORS.skin3, top: COLORS.purple, bottom: COLORS.orange, shoes: COLORS.danfo, hat: COLORS.pink, hatStyle: "gele" },
  { id: "zee", name: "Zee", skin: COLORS.skin2, top: COLORS.blue, bottom: COLORS.purple, shoes: COLORS.danfo, hat: COLORS.teal, hatStyle: "beanie" },
  // Premium outfits: identical body, speed and hitbox. Colours only.
  { id: "ada_owambe", name: "Owambe Ada", skin: COLORS.skin3, top: COLORS.gold, bottom: COLORS.gold, shoes: COLORS.white, hat: COLORS.danfo, hatStyle: "gele", product: "skin_owambe_ada" },
  { id: "tunde_neon", name: "Neon Tunde", skin: COLORS.skin1, top: COLORS.teal, bottom: COLORS.pink, shoes: COLORS.lime, hat: COLORS.blue, hatStyle: "cap", product: "skin_neon_tunde" },
];

export interface CharacterRig {
  root: Mesh;
  body: Mesh;
  armL: Mesh;
  armR: Mesh;
  legL: Mesh;
  legR: Mesh;
}

/** Build an animatable runner. Limbs are separate meshes so they can swing. */
export function buildCharacter(scene: Scene, look: CharacterLook, material: StandardMaterial): CharacterRig {
  const mk = (m: Mesh, color: string) => {
    paint(m, color);
    m.material = material;
    return m;
  };
  const root = new Mesh("runner", scene);
  const torso = mk(CreateBox("torso", { width: 0.62, height: 0.75, depth: 0.36 }, scene), look.top);
  torso.position.y = 1.25;
  const head = mk(CreateSphere("head", { diameter: 0.46, segments: 10 }, scene), look.skin);
  head.position.y = 1.86;
  let hat: Mesh;
  if (look.hatStyle === "cap") {
    hat = Mesh.MergeMeshes([paint(CreateCylinder("c", { diameter: 0.5, height: 0.16 }, scene), look.hat), (() => {
      const b = paint(CreateBox("b", { width: 0.4, height: 0.04, depth: 0.3 }, scene), look.hat);
      b.position.set(0, -0.06, 0.28);
      return b;
    })()], true, true)!;
    hat.position.y = 2.06;
  } else if (look.hatStyle === "gele") {
    hat = paint(CreateTorus("g", { diameter: 0.5, thickness: 0.22, tessellation: 12 }, scene), look.hat);
    hat.position.y = 2.06;
    hat.scaling.y = 1.6;
    hat.rotation.x = -0.25;
  } else {
    hat = paint(CreateSphere("h", { diameter: 0.5, segments: 8, slice: 0.5 }, scene), look.hat);
    hat.position.y = 1.92;
  }
  hat.material = material;
  const body = Mesh.MergeMeshes([torso, head, hat], true, true)!;
  body.material = material;
  body.parent = root;

  const limb = (w: number, h: number, color: string, x: number, y: number, shoe?: string) => {
    const parts = [paint(CreateBox("l", { width: w, height: h, depth: w }, scene), color)];
    parts[0]!.position.y = -h / 2;
    if (shoe) {
      const s = paint(CreateBox("s", { width: w + 0.06, height: 0.14, depth: w + 0.22 }, scene), shoe);
      s.position.set(0, -h, 0.08);
      parts.push(s);
    }
    const m = Mesh.MergeMeshes(parts, true, true)!;
    m.material = material;
    m.position.set(x, y, 0);
    m.parent = root;
    return m;
  };
  const armL = limb(0.16, 0.66, look.top, -0.42, 1.58);
  const armR = limb(0.16, 0.66, look.top, 0.42, 1.58);
  const legL = limb(0.2, 0.86, look.bottom, -0.16, 0.88, look.shoes);
  const legR = limb(0.2, 0.86, look.bottom, 0.16, 0.88, look.shoes);
  return { root, body, armL, armR, legL, legR };
}
