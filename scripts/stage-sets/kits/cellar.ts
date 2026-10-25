// The cellar kit (wiki/plans/march-of-davos-sets.md): a room below ground that any encounter can redress. A dressing
// picks its size, a stone barrel vault or a low beamed ceiling, stone or boarded walls, a stair or a door in at the
// near end, and its own props, lamps, marks and shots, and gets back a whole set. No daylight reaches it: the room is
// lit only by the dressing's lamps and the camera's fill.
//
// Used by scripts/stage-sets/cellars.ts. Coordinates: the room runs from its entrance wall at z = 0 to its far wall at
// z = -length, x from -width/2 to width/2.

import { readFileSync } from "node:fs"
import type { Obj, V3 } from "./street"

export interface CellarDress {
  id: string
  title: string
  seed: number
  width: number
  length: number
  // The vault springs at `height`; a beamed ceiling sits at it.
  height: number
  ceiling: "vault" | "beams"
  // Posts under a beamed ceiling's two great beams; a finished room has none.
  posts?: boolean
  walls: "stone" | "boards"
  floor: "flags" | "boards"
  // A stair coming down through an arch in the entrance wall, steps going on down from it ("down"), or a plank door,
  // at x = entranceX.
  entrance: "stair" | "down" | "door"
  entranceX?: number
  // Warm candle and lamp light, or a cold damp gloom.
  tone: "warm" | "cold"
  objects?: Obj[]
  materials?: Obj
  // Parts of the tone's atmosphere to replace (a finished room lit brighter than a cellar).
  atmosphere?: Obj
  lights: Obj[]
  marks?: Record<string, Obj>
  shots: Record<string, Obj>
  crowd?: Obj
  dust?: number
}

const SETS = "packages/stage/src/sets/realm-of-myr"
const lower = JSON.parse(readFileSync(`${SETS}/kordavos-lower-districts.json`, "utf8"))
const library = JSON.parse(readFileSync(`${SETS}/old-grand-library.json`, "utf8"))

export function cellarSet(d: CellarDress): Obj {
  const { width: W, length: L, height: H } = d
  const ex = d.entranceX ?? 0
  const top = d.ceiling === "vault" ? H + W / 2 : H
  const wallMat = d.walls === "stone" ? "cellarStone" : "weatherboard"
  const o: Obj[] = [
    { type: "box", at: [0, -0.3, -L / 2], size: [W + 2, 0.3, L + 2], material: d.floor === "flags" ? "cellarFloor" : "deck" },
    // The side walls, solid to the walks.
    { type: "box", at: [-W / 2 - 0.3, 0, -L / 2], size: [0.6, H + 0.02, L + 1.2], material: wallMat, solid: true },
    { type: "box", at: [W / 2 + 0.3, 0, -L / 2], size: [0.6, H + 0.02, L + 1.2], material: wallMat, solid: true },
    // The far wall, to the crown.
    { type: "box", at: [0, 0, -L - 0.3], size: [W + 1.2, top + 0.4, 0.6], material: wallMat, solid: true },
  ]
  // The entrance wall, cut by a stair arch or a door.
  const opening = d.entrance === "door" ? { at: ex, width: 1.2, height: 2.2, kind: "door", leaf: -70 } : { at: ex, width: 1.5, height: 2.5, kind: "doorway" }
  o.push({
    type: "wall",
    at: [0, 0.3],
    length: W + 0.6,
    height: H,
    thickness: 0.6,
    a: { finish: d.walls, wainscot: 0, studs: 0, rail: 0 },
    b: { finish: d.walls, wainscot: 0, studs: 0, rail: 0 },
    openings: [opening],
    materials: { wall: wallMat, stone: "cellarStone", boards: "weatherboard", door: "door", panel: "door" },
  })
  if (d.ceiling === "vault") {
    // Above the springing the entrance wall closes the vault's end.
    o.push({ type: "box", at: [0, H, 0.3], size: [W + 1.2, top - H + 0.4, 0.6], material: wallMat })
    o.push({ type: "vault", at: [0, 0], span: W, from: 0.02, to: -L - 0.02, spring: H, bay: 3.2, rib: 0.3, materials: { shell: "cellarVault", rib: "cellarRib", trim: "cellarRib" } })
  } else {
    // A low ceiling of boards on joists, carried by two great beams on posts.
    o.push({ type: "box", at: [0, H, -L / 2], size: [W + 0.6, 0.06, L + 0.6], material: "ceilingBoards" })
    for (let z = -0.4; z > -L; z -= 0.62) o.push({ type: "box", at: [0, H - 0.16, z], size: [W, 0.16, 0.12], material: "timber" })
    for (const x of [-W / 4, W / 4]) {
      o.push({ type: "box", at: [x, H - 0.42, -L / 2], size: [0.28, 0.28, L], material: "timber" })
      if (d.posts !== false) for (let z = -L / 3; z > -L + 0.5; z -= L / 3) o.push({ type: "box", at: [x, 0, z], size: [0.24, H - 0.42, 0.24], material: "timber", solid: true })
    }
  }
  // Beyond the entrance: the foot of a stone stair rising out of sight, steps going down into the dark, or a dark passage.
  if (d.entrance === "down") {
    for (let i = 0; i < 9; i++) o.push({ type: "box", at: [ex, -(i + 1) * 0.19, 1.0 + i * 0.27], size: [1.5, 0.19, 0.3], material: "cellarStep" })
    o.push({ type: "box", at: [ex, -2.4, 4.0], size: [1.6, 2.4, 0.2], material: "void" })
  }
  if (d.entrance !== "door") {
    if (d.entrance === "stair") for (let i = 0; i < 9; i++) o.push({ type: "box", at: [ex, i * 0.19, 1.0 + i * 0.27], size: [1.5, 0.19, 0.3 + (9 - i) * 0.27], material: "cellarStep" })
    o.push(
      { type: "box", at: [ex - 1.0, 0, 2.2], size: [0.5, 4.2, 3.0], material: wallMat },
      { type: "box", at: [ex + 1.0, 0, 2.2], size: [0.5, 4.2, 3.0], material: wallMat },
      { type: "box", at: [ex, 2.6, 2.2], size: [1.6, 1.6, 3.0], material: wallMat }
    )
  } else o.push({ type: "box", at: [ex, 0, 1.6], size: [1.6, 2.6, 0.2], material: "void" })
  o.push(...(d.objects ?? []))

  const warm = d.tone === "warm"
  const keep = Object.fromEntries(Object.entries(lower.materials).filter(([k]) => !["signDagger", "signSerpent", "puddle", "stone"].includes(k)))
  const fromLibrary = Object.fromEntries(["candle", "candleFlame"].map((k) => [k, library.materials[k]]))
  return {
    format: "d20.stage.set",
    version: 1,
    id: d.id,
    settingId: "realm-of-myr",
    locationId: d.id,
    title: d.title,
    seed: d.seed,
    atmosphere: {
      // Underground: no sun to speak of, a faint bounce, the lamps doing all the work.
      sun: { direction: [0.2, 1, 0.1], color: "#2a2620", intensity: 0, target: [0, 0, -L / 2], distance: 60, shadow: { left: -20, right: 20, top: 20, bottom: -20, near: 10, far: 120, size: 1024 } },
      hemisphere: warm ? { sky: "#5a4632", ground: "#1e140c", intensity: 0.36 } : { sky: "#2a3434", ground: "#0e0e0c", intensity: 0.24 },
      sky: { horizon: "#1a1612", mid: "#100e0c", zenith: "#080706", gain: 0.2, clouds: 0, stars: 0, moon: 0 },
      fog: { density: 0.012, color: warm ? "#2a1e14" : "#141a1a", start: 6 },
      glow: warm ? "#ffb070" : "#8aa0a0",
      fill: { color: warm ? "#ffe0c0" : "#d8e0e0", intensity: warm ? 1.1 : 0.9, distance: 7 },
      lights: d.lights,
      environment: 0.12,
      exposure: warm ? 1.3 : 1.2,
      grade: warm ? "warm" : "neutral",
      wind: 0.05,
      ...(d.atmosphere ?? {}),
    },
    camera: { near: 0.05, far: 200, min: [-W / 2 + 0.25, 0.3, -L + 0.25], max: [W / 2 - 0.25, top - 0.3, d.entrance === "door" ? -0.3 : 1.6], maxDistance: Math.max(8, L) },
    materials: { ...keep, ...fromLibrary, ...CELLAR_MATERIALS, ...(d.materials ?? {}) },
    objects: o,
    crowd: d.crowd,
    marks: d.marks ?? {},
    shots: d.shots,
    life: { dust: { count: d.dust ?? 260, box: [-W / 2, 0.2, -L, W / 2, H, 0] } },
  }
}

export const CELLAR_MATERIALS: Obj = {
  cellarStone: { type: "image", map: "/stage/textures/stone-old.jpg", size: [2.4, 2.4], tint: "#b8aa98", roughness: 0.92 },
  cellarVault: { type: "image", map: "/stage/textures/stone-old.jpg", size: [2.0, 2.0], tint: "#a8987e", roughness: 0.95 },
  cellarRib: { type: "masonry", a: "#6a5a48", b: "#7a6854", c: "#5e5040", mortar: "#4a3e32", block: [0.5, 0.3], joint: 0.01, relief: 0.006, variance: 0.5, grime: 1.8 },
  cellarStep: { type: "masonry", a: "#5a5048", b: "#665a50", c: "#4e463e", mortar: "#3a3430", block: [0.9, 0.3], joint: 0.01, relief: 0.006, variance: 0.4, grime: 2.0 },
  cellarFloor: { type: "masonry", a: "#4e4640", b: "#5a5048", c: "#443e38", mortar: "#2a2622", block: [0.8, 0.6], joint: 0.02, relief: 0.02, variance: 0.5, grime: 2.2, ground: true, roughness: 0.6 },
  weatherboard: { type: "painted", map: "/stage/textures/timber-hold.jpg", tint: "#7c7468", plank: [0.22, 4], size: [0.7, 2.2], relief: 0.1, grime: 2.4, nails: 0.5 },
  ceilingBoards: { type: "painted", map: "/stage/textures/timber-hold.jpg", tint: "#5a5048", plank: [0.2, 4], size: [0.7, 2.2], relief: 0.06, grime: 2.6 },
  deck: { type: "painted", map: "/stage/textures/boards-weathered.jpg", tint: "#7a6c5c", plank: [0.16, 4.2], size: [0.5, 1.4], relief: 0.08, grime: 1.8, nails: 0.6 },
  caskHead: { type: "wood", a: "#5a3c26", b: "#664530", c: "#4e3420", plank: [0.12, 2], relief: 0.04, grime: 1.2 },
  bottleDark: { type: "plain", color: "#141a12", roughness: 0.25 },
  bottleGreen: { type: "plain", color: "#1e3220", roughness: 0.25 },
  bottleBrown: { type: "plain", color: "#3a2412", roughness: 0.25 },
  fire: { type: "fire", color: "#ff7a26" },
  // What a table's candle and setting ask for.
  pewter: { type: "metal", color: "#8e8c88", roughness: 0.45, metalness: 0.7 },
  bread: { type: "plain", color: "#b47a3e", roughness: 0.8 },
  cheese: { type: "plain", color: "#d8b456", roughness: 0.7 },
}

export type { Obj, V3 }
