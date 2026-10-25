// The tunnel kit (wiki/plans/march-of-davos-sets.md): bores and caves below the city that any encounter can redress.
// A dressing lays out its bores (paths swept with laid stone or rough rock), its cave chambers with mouths where the
// bores come in, its tone of light, and its own props, lamps, marks and shots, and gets back a whole set.
//
// Used by scripts/stage-sets/catacombs.ts.

import { readFileSync } from "node:fs"
import type { Obj, V2, V3 } from "./street"

export type Tone = "green" | "blue" | "frost"

export interface TunnelDress {
  id: string
  title: string
  seed: number
  tone: Tone
  // The camera's box: [x0, y0, z0, x1, y1, z1].
  bounds: [number, number, number, number, number, number]
  objects: Obj[]
  materials?: Obj
  lights: Obj[]
  marks?: Record<string, Obj>
  shots: Record<string, Obj>
  crowd?: Obj
  fog?: number
  dust?: [number, number, number, number, number, number]
}

const SETS = "packages/stage/src/sets/realm-of-myr"
const lower = JSON.parse(readFileSync(`${SETS}/kordavos-lower-districts.json`, "utf8"))

// Where a bore leaves a cave at `at` (cave centre), `rx` by `rz`, on a bearing in degrees: the point on the wall, and
// one `out` metres further along the same bearing.
export function mouth(at: V2, rx: number, rz: number, bearing: number, out: number): [V2, V2] {
  const a = (bearing * Math.PI) / 180
  const s = Math.sin(a)
  const c = Math.cos(a)
  const r = 1 / Math.hypot(s / rx, c / rz)
  const p = (k: number): V2 => [Math.round((at[0] + s * k) * 100) / 100, Math.round((at[1] + c * k) * 100) / 100]
  return [p(r - 0.6), p(r + out)]
}

// A worn stone frame round a mouth, so the bore's arch meets the cave wall cleanly: two jambs and a lintel, standing
// across the bearing at the mouth's point on the wall, `width` and `height` the opening inside the frame.
export function portal(at: V2, rx: number, rz: number, bearing: number, width: number, height: number): Obj[] {
  const [p] = mouth(at, rx, rz, bearing, 0)
  const a = (bearing * Math.PI) / 180
  const across: V2 = [Math.cos(a), -Math.sin(a)]
  const yaw = Math.round(bearing)
  const q = (k: number): V2 => [Math.round((p[0] + across[0] * k) * 100) / 100, Math.round((p[1] + across[1] * k) * 100) / 100]
  const j = 0.7
  return [
    { type: "box", at: [q(-(width / 2 + j / 2))[0], 0, q(-(width / 2 + j / 2))[1]], yaw, size: [j, height + 0.9, 1.2], material: "arch" },
    { type: "box", at: [q(width / 2 + j / 2)[0], 0, q(width / 2 + j / 2)[1]], yaw, size: [j, height + 0.9, 1.2], material: "arch" },
    { type: "box", at: [p[0], height, p[1]], yaw, size: [width + 2 * j, 0.9, 1.2], material: "arch" },
  ]
}

// Crystals set in the rock: a cluster of glowing shards at a wall point, leaning out along `normal` (x, z).
export function crystals(at: V3, normal: V2, count = 5, size = 0.3): Obj[] {
  const o: Obj[] = []
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2
    const lean = 25 + ((i * 37) % 30)
    o.push({
      type: "cone",
      at: [Math.round((at[0] + Math.cos(a) * size * 0.4) * 100) / 100, Math.round((at[1] + Math.sin(a) * size * 0.4) * 100) / 100, at[2]],
      yaw: Math.round((Math.atan2(normal[0], normal[1]) * 180) / Math.PI + Math.cos(a) * 25),
      pitch: lean + 40,
      radius: size * (0.18 + (i % 3) * 0.05),
      height: size * (0.8 + ((i * 13) % 5) * 0.15),
      segments: 5,
      material: "crystal",
    })
  }
  return o
}

const TONES: Record<Tone, Obj> = {
  green: { hemisphere: { sky: "#3e5a44", ground: "#10140e", intensity: 0.55 }, fog: "#1a2a20", fill: "#e4f0d8", glow: "#c8e0a0", grade: "neutral" },
  blue: { hemisphere: { sky: "#2e4a6a", ground: "#0c1016", intensity: 0.6 }, fog: "#122030", fill: "#d8e4f0", glow: "#8ab0d8", grade: "neutral" },
  frost: { hemisphere: { sky: "#4a5e72", ground: "#12161c", intensity: 0.55 }, fog: "#2a3a48", fill: "#e8f0f8", glow: "#c0d8f0", grade: "neutral" },
}

export function tunnelSet(d: TunnelDress): Obj {
  const t = TONES[d.tone] as { hemisphere: Obj; fog: string; fill: string; glow: string; grade: string }
  const [x0, y0, z0, x1, y1, z1] = d.bounds
  const keep = Object.fromEntries(Object.entries(lower.materials).filter(([k]) => !["signDagger", "signSerpent", "puddle"].includes(k)))
  return {
    format: "d20.stage.set",
    version: 1,
    id: d.id,
    settingId: "realm-of-myr",
    locationId: d.id,
    title: d.title,
    seed: d.seed,
    atmosphere: {
      // Below ground: no sun, a faint cold bounce, the lamps and the dressing's glows doing the work.
      sun: {
        direction: [0.2, 1, 0.1],
        color: "#202428",
        intensity: 0,
        target: [(x0 + x1) / 2, 0, (z0 + z1) / 2],
        distance: 80,
        shadow: { left: -30, right: 30, top: 30, bottom: -30, near: 10, far: 160, size: 1024 },
      },
      hemisphere: t.hemisphere,
      sky: { horizon: "#0e1214", mid: "#08090a", zenith: "#040506", gain: 0.1, clouds: 0, stars: 0, moon: 0 },
      fog: { density: d.fog ?? 0.03, color: t.fog, start: 5 },
      glow: t.glow,
      fill: { color: t.fill, intensity: 1.1, distance: 8 },
      lights: d.lights,
      environment: 0.1,
      exposure: 1.25,
      grade: t.grade,
      wind: 0.05,
    },
    camera: { near: 0.05, far: 300, min: [x0, y0, z0], max: [x1, y1, z1], maxDistance: 22 },
    materials: { ...keep, ...TUNNEL_MATERIALS, ...(d.materials ?? {}) },
    objects: d.objects,
    crowd: d.crowd,
    marks: d.marks ?? {},
    shots: d.shots,
    life: { dust: { count: 500, box: d.dust ?? [x0, 0.2, z0, x1, Math.min(y1, 6), z1] } },
  }
}

export const TUNNEL_MATERIALS: Obj = {
  // Old laid stone, damp and green-grey, for the bores the Covenant keeps.
  tunnelStone: { type: "image", map: "/stage/textures/stone-old.jpg", size: [2.0, 2.0], tint: "#8a9488", roughness: 0.6 },
  // Raw rock where the bores were hewn and in the caves.
  tunnelRock: { type: "rock", a: "#5a5e64", b: "#6e7276", moss: "#2e3a34", mossLight: "#3c4a40", lichen: "#6a7270", mossAmount: 0.12, lichenAmount: 0.08, relief: 0.8, scale: 1.4 },
  tunnelFloor: { type: "rock", a: "#34363a", b: "#44464a", moss: "#2a302c", mossLight: "#343c36", lichen: "#5a605e", mossAmount: 0.15, lichenAmount: 0.05, relief: 0.4, scale: 1.0 },
  crystal: { type: "plain", color: "#1e4a78", roughness: 0.2, emissive: "#3a8ad8", emissiveIntensity: 0.7 },
  sigil: { type: "plain", color: "#000000", roughness: 1, emissive: "#ff9a30", emissiveIntensity: 3.2 },
  ironBlack: { type: "metal", color: "#16161a", roughness: 0.5, metalness: 0.85 },
  powder: { type: "plain", color: "#2a2622", roughness: 1 },
  fuse: { type: "plain", color: "#4a3a2a", roughness: 0.9 },
  ember: { type: "plain", color: "#000000", roughness: 1, emissive: "#ff6a20", emissiveIntensity: 4 },
  dustFloor: { type: "rock", a: "#6a6a68", b: "#7a7874", moss: "#5a5a58", mossLight: "#6a6a68", lichen: "#8a8884", mossAmount: 0.05, lichenAmount: 0.05, relief: 0.2, scale: 2.0 },
  frost: { type: "mist", color: "#c8dcec", opacity: 0.22 },
  mist: { type: "mist", color: "#6a8aa0", opacity: 0.2 },
  fire: { type: "fire", color: "#ff7a26" },
  candle: { type: "plain", color: "#e8dcc0", roughness: 0.9 },
  candleFlame: { type: "plain", color: "#000000", roughness: 1, emissive: "#ffa040", emissiveIntensity: 2.4 },
  arch: { type: "masonry", a: "#4a4c50", b: "#56585c", c: "#404246", mortar: "#2a2c2e", block: [0.6, 0.35], joint: 0.012, relief: 0.008, variance: 0.5, grime: 2.0 },
}
