// The road kit (wiki/plans/road-to-kordavos-sets.md): a dirt road through daylight woods that any travel encounter can
// redress. A dressing gives the road's line, the woods (hill firs or giant old trees), its backdrops, its travellers,
// and its own props, places and views, and gets back a whole set. The road, its ruts and verges, the trees, ferns and
// grass are the kit's; what makes the place one encounter's is the dressing's.
//
// Used by scripts/stage-sets/marquis-road.ts. Coordinates: the road runs from the camera's end (+z) on up -z.

import { readFileSync } from "node:fs"
import type { Obj, V2 } from "./street"

export type Woods = "hills" | "giants"

export interface RoadDress {
  id: string
  title: string
  seed: number
  woods: Woods
  // The road's centre line, from +z toward -z, and its width.
  road: V2[]
  width?: number
  // The camera's box: [x0, y0, z0, x1, y1, z1].
  bounds: [number, number, number, number, number, number]
  // Clearings in the trees and the undergrowth, round cameras, props and places: [x, z, r].
  clear?: [number, number, number][]
  objects?: Obj[]
  materials?: Obj
  backdrops?: Obj[]
  // Parts of the woods' atmosphere to replace.
  atmosphere?: Obj
  marks?: Record<string, Obj>
  shots: Record<string, Obj>
  crowd?: Obj
}

const SETS = "packages/stage/src/sets/realm-of-myr"
const gate = JSON.parse(readFileSync(`${SETS}/kordavos-south-gate.json`, "utf8"))
const pick = (names: string[]) => Object.fromEntries(names.map((n) => [n, gate.materials[n]]))
const r2 = (n: number) => Math.round(n * 100) / 100

// Circles along a polyline, for scatters to keep clear.
export function clearAlong(pts: V2[], r: number, step = 1.6) {
  const out: [number, number, number][] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]
    const [cx, cz] = pts[i + 1]
    const n = Math.max(1, Math.ceil(Math.hypot(cx - ax, cz - az) / step))
    for (let k = 0; k <= n; k++) out.push([r2(ax + ((cx - ax) * k) / n), r2(az + ((cz - az) * k) / n), r])
  }
  return out
}

// The road's line moved `d` metres to its right (+x when heading -z), for the ruts.
function offset(pts: V2[], d: number): V2[] {
  return pts.map(([x, z], i) => {
    const [ax, az] = pts[Math.max(0, i - 1)]
    const [cx, cz] = pts[Math.min(pts.length - 1, i + 1)]
    const len = Math.hypot(cx - ax, cz - az) || 1
    // Heading along (dx, dz), its right-hand normal is (-dz, dx).
    return [r2(x + (-(cz - az) / len) * d), r2(z + ((cx - ax) / len) * d)]
  })
}

// Where the road is at depth z: its centre's x, interpolated along the line.
export function roadX(pts: V2[], z: number) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]
    const [cx, cz] = pts[i + 1]
    if ((z <= az && z >= cz) || (z >= az && z <= cz)) return r2(ax + ((cx - ax) * (z - az)) / (cz - az || 1))
  }
  return z > pts[0][1] ? pts[0][0] : pts[pts.length - 1][0]
}

const ATMOSPHERES: Record<Woods, Obj> = {
  // Clear morning in the hills: a warm sun from ahead and high, a blue sky with fair clouds, the far hills blued by air.
  hills: {
    sun: { direction: [-0.35, 0.72, -0.6], color: "#fff0d0", intensity: 3.6, target: [0, 0, 0], distance: 220, shadow: { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 460, size: 2048 } },
    hemisphere: { sky: "#b4d0ec", ground: "#4a5630", intensity: 0.95 },
    sky: { horizon: "#d6e4ec", mid: "#9cc2e2", zenith: "#5288c6", gain: 1, clouds: 0.45 },
    fog: { density: 0.006, color: "#b8ccd8", start: 24 },
    glow: "#fff2cc",
    environment: 0.35,
    exposure: 1.0,
    grade: "warm",
    wind: 0.7,
  },
  // Green-gold afternoon under giant trees, as on the old forest path.
  giants: {
    sun: { direction: [0.25, 0.85, -0.45], color: "#fff0c4", intensity: 2.8, target: [0, 0, -10], distance: 200, shadow: { left: -50, right: 50, top: 50, bottom: -50, near: 10, far: 420 } },
    hemisphere: { sky: "#c4d898", ground: "#36421f", intensity: 1.15 },
    sky: { horizon: "#c4d49c", mid: "#8cae6c", zenith: "#56804e", gain: 0.9, clouds: 0.35 },
    fog: { density: 0.02, color: "#8aa06a", start: 6 },
    glow: "#e8f0b0",
    environment: 0.3,
    exposure: 1.1,
    grade: "warm",
    wind: 0.5,
  },
}

const LEAVES = "/stage/textures/leaves-oak.webp"
const WOODS_MATERIALS: Record<Woods, Obj> = {
  hills: {
    ground: {
      type: "meadow",
      grass: "#5a7232",
      grassDark: "#34481e",
      moss: "#627e2e",
      dry: "#8a8248",
      dirt: "#5e4c30",
      litter: "#6a5634",
      dirtAmount: 0.3,
      pebbles: 0.3,
      litterAmount: 0.45,
      flowers: 0.08,
      relief: 0.9,
    },
    bark: { type: "wood", a: "#4e4234", b: "#625240", c: "#3e3830", plank: [0, 40], relief: 0.09, variance: 0.8, seed: 6.1, grime: 0.5 },
    leaves: { type: "foliage", color: "#d4e0a4", map: LEAVES },
    leavesDark: { type: "foliage", color: "#8a9c74", map: LEAVES },
    leavesLight: { type: "foliage", color: "#ecf0b0", map: LEAVES },
    fern: { type: "foliage", color: "#557a34" },
    grass: { type: "grass", base: "#34481e", tip: "#9aac58" },
    stone: { type: "rock", a: "#6c6a62", b: "#86827a", moss: "#4e6a2a", mossLight: "#7a9440", lichen: "#a8a690", mossAmount: 0.4, lichenAmount: 0.4, relief: 0.6 },
  },
  giants: {
    ground: {
      type: "meadow",
      grass: "#4c6a2c",
      grassDark: "#2c4220",
      moss: "#5c7e2c",
      dry: "#6e6a3a",
      dirt: "#4a3e28",
      litter: "#5e4a2a",
      dirtAmount: 0.4,
      pebbles: 0.3,
      litterAmount: 0.6,
      flowers: 0.05,
      relief: 0.9,
    },
    bark: { type: "wood", a: "#56623a", b: "#6a7646", c: "#424a30", plank: [0, 40], relief: 0.09, variance: 0.8, seed: 4.9, grime: 0.5 },
    leaves: { type: "foliage", color: "#e0e4b8", map: LEAVES },
    leavesDark: { type: "foliage", color: "#a0a880", map: LEAVES },
    leavesLight: { type: "foliage", color: "#f4f0c0", map: LEAVES },
    fern: { type: "foliage", color: "#4c6e32" },
    grass: { type: "grass", base: "#2a3c1c", tip: "#7a9a40" },
    stone: { type: "rock", a: "#4a5040", b: "#62684e", moss: "#3c5a22", mossLight: "#6a8a34", lichen: "#8a9474", mossAmount: 0.8, lichenAmount: 0.3, relief: 0.6 },
  },
}

// The road and its props, the same in any woods.
export const ROAD_MATERIALS: Obj = {
  road: {
    type: "meadow",
    grass: "#6a6a3a",
    grassDark: "#4e4a2c",
    moss: "#6a7038",
    dry: "#9a8a5a",
    dirt: "#7a6444",
    litter: "#6e5a3c",
    dirtAmount: 0.92,
    pebbles: 0.15,
    litterAmount: 0.25,
    flowers: 0,
    relief: 0.7,
  },
  rut: {
    type: "meadow",
    grass: "#605a38",
    grassDark: "#4c462e",
    moss: "#5e6034",
    dry: "#7e6e4a",
    dirt: "#68543a",
    litter: "#62503a",
    dirtAmount: 1,
    pebbles: 0.1,
    litterAmount: 0.1,
    flowers: 0,
    relief: 0.5,
  },
  birch: { type: "wood", a: "#d8d4c8", b: "#e8e4d8", c: "#3a3530", plank: [0, 40], relief: 0.05, variance: 0.6, seed: 2.2, grime: 0.6 },
  moss: { type: "foliage", color: "#8a9a6a" },
  sunbeam: { type: "glow", color: "#f0f0c0", opacity: 0.08 },
  ...pick(["crate", "crateDark", "barrel", "sack", "sackB", "iron", "goodsRed", "flame", "pole"]),
  wagonWood: { type: "wood", a: "#7a5a3a", b: "#8c6a46", c: "#5e4a36", plank: [0.22, 2.4], relief: 0.05, variance: 0.45, seed: 9.3, grime: 0.6 },
  wagonCanvas: { type: "cloth", color: "#d8ccae", amp: 0.04 },
  wagonMark: { type: "image", map: "/stage/textures/volkov-mark.png", roughness: 0.9 },
  shrineStone: { type: "rock", a: "#7a7468", b: "#8e887a", moss: "#4e6a2a", mossLight: "#7a9440", lichen: "#a8a690", mossAmount: 0.25, lichenAmount: 0.4, relief: 0.3 },
  shrineRoof: { type: "masonry", a: "#4a4c50", b: "#5a5c60", c: "#404246", mortar: "#34363a", block: [0.25, 0.16], joint: 0.01, relief: 0.01, variance: 0.4, grime: 1.0 },
  silver: { type: "metal", color: "#c8ccd0", roughness: 0.3, metalness: 0.9 },
  candle: { type: "plain", color: "#e8dcc0", roughness: 0.9 },
  candleFlame: { type: "plain", color: "#000000", roughness: 1, emissive: "#ffa040", emissiveIntensity: 2.4 },
  flowerA: { type: "plain", color: "#e8d040", roughness: 0.9 },
  flowerB: { type: "plain", color: "#f0f0e8", roughness: 0.9 },
  tableWood: { type: "wood", a: "#4a3020", b: "#5c3c28", c: "#3a2a20", plank: [0.2, 1.6], relief: 0.04, variance: 0.4, seed: 7.7 },
  carpet: { type: "image", map: "/stage/textures/library-rug.jpg", roughness: 1, tint: "#a07068" },
  orb: { type: "orb", glow: "#9ac0f0" },
  cards: { type: "plain", color: "#e4d8b8", roughness: 0.8 },
  cardBack: { type: "plain", color: "#3a2a5a", roughness: 0.7 },
}

// Hill woods: firs along the verges, a dense wood of firs and a few oaks standing back from the road with a thicket at
// its feet, and solid cone firs beyond 42 m. Oaks near a camera show their bare forks.
function hillWoods(d: RoadDress, w: number): Obj[] {
  const [x0, , , x1] = d.bounds
  const [zNear, zFar] = [d.road[0][1], d.road[d.road.length - 1][1]]
  const xs = d.road.map(([x]) => x)
  const clear = d.clear ?? []
  const wide = [x0 - 10, zFar - 20, x1 + 10, zNear + 10]
  return [
    {
      type: "scatter",
      id: "verge-trees",
      area: [Math.min(...xs) - 18, zFar, Math.max(...xs) + 18, zNear],
      count: 110,
      clear: [...clearAlong(d.road, w / 2 + 3.5), ...clear],
      items: [{ weight: 1, item: { type: "tree", kind: "fir" }, vary: { height: [10, 18] } }],
    },
    {
      type: "scatter",
      id: "woods",
      area: wide,
      count: 440,
      clear: [...clearAlong(d.road, w / 2 + 6.5, 3), ...clear],
      items: [
        { weight: 5, item: { type: "tree", kind: "fir" }, vary: { height: [16, 30] } },
        { weight: 1, item: { type: "tree", kind: "oak" }, vary: { height: [11, 16] } },
      ],
    },
    {
      type: "scatter",
      id: "thicket",
      area: wide,
      count: 320,
      avoid: false,
      clear: [...clearAlong(d.road, w / 2 + 4, 3), ...clear],
      items: [{ weight: 1, item: { type: "bush" }, vary: { size: [1.4, 3] } }],
    },
    {
      type: "scatter",
      id: "far-woods",
      area: [x0 - 120, zFar - 140, x1 + 120, zNear + 80],
      count: 320,
      clear: clearAlong(d.road, 42, 8),
      // Leaf cards thin out at a distance, so the far firs are solid cones.
      items: [{ weight: 1, item: { type: "tree", kind: "pine", low: true }, vary: { height: [18, 30] } }],
    },
  ]
}

// Giant woods: huge old trees and tall oaks either side of the road, as on the old forest path.
function giantWoods(d: RoadDress, w: number): Obj[] {
  const [x0, , , x1] = d.bounds
  const [zNear, zFar] = [d.road[0][1], d.road[d.road.length - 1][1]]
  return [
    {
      type: "scatter",
      id: "woods",
      area: [x0 - 30, zFar - 20, x1 + 30, zNear + 10],
      count: 170,
      clear: [...clearAlong(d.road, w / 2 + 2.6), ...(d.clear ?? [])],
      items: [
        { weight: 2, item: { type: "tree", kind: "ancient" }, vary: { height: [16, 24], girth: [0.7, 1.1] } },
        { weight: 3, item: { type: "tree", kind: "oak" }, vary: { height: [18, 28] } },
      ],
    },
    {
      type: "scatter",
      id: "far-woods",
      area: [x0 - 120, zFar - 140, x1 + 120, zNear + 80],
      count: 280,
      clear: [[r2((x0 + x1) / 2), r2((zNear + zFar) / 2), Math.round(Math.max(x1 - x0, zNear - zFar) / 2 + 12)]],
      items: [{ weight: 1, item: { type: "tree", kind: "oak", low: true }, vary: { height: [18, 28] } }],
    },
  ]
}

export function roadSet(d: RoadDress): Obj {
  const w = d.width ?? 4.2
  const [x0, y0, z0, x1, y1, z1] = d.bounds
  const clear = d.clear ?? []
  const [zNear, zFar] = [d.road[0][1], d.road[d.road.length - 1][1]]
  const objects: Obj[] = [
    { type: "groundDisc", id: "ground", radius: 260 },
    { type: "trail", id: "road", points: d.road, width: w, material: "road" },
    // Wheel ruts worn into the road, a cart's track apart.
    { type: "trail", id: "rut-west", points: offset(d.road, -0.75), width: 0.42, material: "rut" },
    { type: "trail", id: "rut-east", points: offset(d.road, 0.75), width: 0.42, material: "rut" },
    // The dressing's own things go in before the growth, so the scatters keep off them.
    ...(d.objects ?? []),
    // The verges: tufts along both sides and in the middle, none in the ruts.
    {
      type: "grass",
      id: "verge",
      area: [Math.min(...d.road.map(([x]) => x)) - w / 2 - 5.5, zFar, Math.max(...d.road.map(([x]) => x)) + w / 2 + 5.5, zNear],
      count: 6500,
      height: [0.1, 0.42],
      clear: [...clearAlong(offset(d.road, -0.75), 0.3), ...clearAlong(offset(d.road, 0.75), 0.3), ...clearAlong(d.road, w / 2 - 1.3, 1.2).filter((_, i) => i % 3 === 0)],
    },
    ...(d.woods === "hills" ? hillWoods(d, w) : giantWoods(d, w)),
    {
      type: "scatter",
      id: "undergrowth",
      area: [x0 - 6, zFar, x1 + 6, zNear],
      count: 320,
      avoid: false,
      clear: [...clearAlong(d.road, w / 2 + 0.5), ...clear.map(([x, z, r]) => [x, z, Math.max(0.6, r - 1.6)])],
      items: [
        { weight: 3, item: { type: "fern" }, vary: { size: [0.6, 1.3] } },
        { weight: 1, item: { type: "bush" }, vary: { size: [0.7, 1.5] } },
      ],
    },
    {
      type: "scatter",
      id: "stones",
      area: [x0, zFar, x1, zNear],
      count: 14,
      clear: [...clearAlong(d.road, w / 2 + 1.2), ...clear],
      items: [{ weight: 1, item: { type: "rock", flat: 0.5 }, vary: { size: [0.5, 1.3] } }],
    },
  ]
  return {
    format: "d20.stage.set",
    version: 1,
    id: d.id,
    settingId: "realm-of-myr",
    locationId: d.id,
    title: d.title,
    seed: d.seed,
    atmosphere: { ...ATMOSPHERES[d.woods], ...(d.atmosphere ?? {}) },
    camera: { near: 0.2, far: 900, min: [x0, y0, z0], max: [x1, y1, z1], maxDistance: 70 },
    materials: { ...WOODS_MATERIALS[d.woods], ...ROAD_MATERIALS, ...(d.materials ?? {}) },
    objects,
    ...(d.backdrops ? { backdrops: d.backdrops } : {}),
    ...(d.crowd ? { crowd: d.crowd } : {}),
    marks: d.marks ?? {},
    shots: d.shots,
    life: { dust: { count: 200, box: [x0 / 2, 0.4, z0 / 2, x1 / 2, 6, z1 / 2] } },
  }
}
