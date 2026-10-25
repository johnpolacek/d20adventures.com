// The street kit (wiki/plans/march-of-davos-sets.md): a Kordavos street that any encounter can redress. A dressing
// picks a layout (lanes, a waterfront lane, a square), a time (night, dawn, day), the house fronts, and its own props,
// lights, crowd, marks and shots, and gets back a whole set. The houses, cobbles, lanterns, signs and washing are the
// kit's; what makes the place one encounter's is the dressing's.
//
// Used by scripts/stage-sets/kordavos-streets.ts. Coordinates: the street runs from the camera's end (z = NEAR) up -z.

import { readFileSync } from "node:fs"

export type V2 = [number, number]
export type V3 = [number, number, number]
export type Obj = Record<string, unknown>

export type Layout = "lanes" | "waterfront" | "square"
export type Time = "night" | "dawn" | "day"

// Each layout's measurements, for dressings to place things by.
export const LAYOUTS = {
  // Narrow night lanes: a crossing at z = -22 with alleys either side, a side alley off east at z = -6, and an archway
  // house across the street at z = -46.
  lanes: { hw: 3.0, near: 14, far: -72, cross: -22, alley: -6, bridge: -46 },
  // A lane of old stone houses ending at a quay over the harbour at z = -30.
  waterfront: { hw: 4.2, near: 14, far: -30 },
  // A street opening at z = 0 into a square 28 m wide, closed at z = -36 by a great house with a balcony.
  square: { hw: 3.4, near: 16, sq: 14, top: 0, far: -36 },
} as const

export interface StreetDress {
  id: string
  title: string
  seed: number
  layout: Layout
  time: Time
  // Timber-framed jettied storeys, or plain stone throughout.
  fronts?: "timber" | "stone"
  // Stretches of the street's sides left without houses, for the dressing's own buildings.
  gaps?: { side: -1 | 1; z: V2 }[]
  laundry?: boolean
  signs?: boolean
  spires?: boolean
  fog?: number
  // Where the sun (or moon) is, when the time's own place for it would light the wrong side of the scene.
  sun?: V3
  // Parts of the time's atmosphere to replace (a sky lost in sea mist).
  atmosphere?: Obj
  objects?: Obj[]
  materials?: Obj
  // Lamps of the dressing's own; the kit fills the rest of the eight with the street's lanterns, spread from the camera's
  // end to z = lightsTo.
  lights?: Obj[]
  lightsTo?: number
  marks?: Record<string, Obj>
  shots: Record<string, Obj>
  crowd?: { walkers?: number; mix?: Obj; groups?: Obj[]; avoid?: [number, number, number][] }
  dust?: boolean
}

const SETS = "packages/stage/src/sets/realm-of-myr"
const lower = JSON.parse(readFileSync(`${SETS}/kordavos-lower-districts.json`, "utf8"))
const r2 = (n: number) => Math.round(n * 100) / 100
const D = 8

export function streetSet(d: StreetDress): Obj {
  let seed = d.seed
  const rnd = (a = 0, b = 1) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return a + ((b - a) * seed) / 4294967296
  }
  const pickOne = <T>(xs: readonly T[]) => xs[Math.floor(rnd(0, xs.length))]
  const stone = d.fronts === "stone"
  const lit = d.time === "night" ? [0.25, 0.6] : d.time === "dawn" ? [0.1, 0.3] : [0, 0.05]

  function house(at: V2, yaw: number, w: number, extra: Obj = {}): Obj {
    const h: Obj = {
      type: "tenement",
      at,
      yaw,
      w: r2(w),
      d: D,
      storeys: pickOne([2, 3, 3, 3, 4]),
      ground: r2(rnd(2.8, 3.3)),
      storey: r2(rnd(2.5, 2.8)),
      jetty: stone ? 0 : r2(rnd(0.25, 0.45)),
      lean: stone ? r2(rnd(-0.08, 0.08)) : r2(rnd(-0.35, 0.35)),
      gable: rnd() < 0.6,
      front: pickOne(["door", "door", "arch", "shop", "shop", "plain"]),
      lit: r2(rnd(lit[0], lit[1])),
      balcony: rnd() < 0.2,
      ...extra,
    }
    // Stone fronts: the storeys and their frames in the house's own stone.
    if (stone) h.materials = { plaster: "stoneUpper", plasterB: "stoneUpperB", timber: "stoneFrame" }
    return h
  }
  // One side of a street: houses shoulder to shoulder from z0 toward z1 at x = side * (hw + D / 2), skipping gaps.
  function row(side: -1 | 1, hw: number, z0: number, z1: number, gaps: V2[] = []): Obj[] {
    const out: Obj[] = []
    let z = z0
    while (z > z1 + 2.5) {
      const w = Math.min(rnd(4.4, 6.6), z - z1)
      const zc = z - w / 2
      const gap = gaps.find(([a, b]) => zc + w / 2 > a && zc - w / 2 < b)
      if (gap) {
        z = gap[0]
        continue
      }
      const corner = gaps.some(([a, b]) => Math.abs(zc - w / 2 - b) < 0.3 || Math.abs(zc + w / 2 - a) < 0.3)
      out.push(house([side * (hw + D / 2), r2(zc)], side < 0 ? 90 : -90, w - 0.04, corner ? { sides: true } : {}))
      z -= w
    }
    return out
  }
  // Houses along x from x0 to x1 facing +z (face 1) or -z (face -1), their fronts on z = zf.
  function rank(x0: number, x1: number, zf: number, face: 1 | -1, extra: Obj = {}): Obj[] {
    const out: Obj[] = []
    let x = x0
    while (x < x1 - 2.5) {
      const w = Math.min(rnd(4.4, 6.4), x1 - x)
      out.push(house([r2(x + w / 2), r2(zf - (face * D) / 2)], face > 0 ? 0 : 180, w - 0.04, extra))
      x += w
    }
    return out
  }
  // A cross alley: houses either side of it facing in, from the street's edge out to x1 (signed), and a closed end.
  function alley(z: number, width: number, x1: number): Obj[] {
    const out: Obj[] = []
    const s = Math.sign(x1)
    for (const [face, zf] of [
      [1, z - width / 2],
      [-1, z + width / 2],
    ] as [1 | -1, number][]) {
      let x = s * (L.hw + D + 0.1)
      while (Math.abs(x) < Math.abs(x1) - 2.5) {
        const w = Math.min(rnd(4.0, 5.6), Math.abs(x1) - Math.abs(x))
        out.push(
          house([r2(x + (s * w) / 2), r2(zf - (face * D) / 2)], face > 0 ? 0 : 180, w - 0.04, { storeys: pickOne([2, 3, 3]), front: pickOne(["door", "arch", "plain", "door"]), balcony: false })
        )
        x += s * w
      }
    }
    out.push({ ...house([x1 + s * 3, z], s < 0 ? 90 : -90, width + 3.6, { front: "plain", storeys: 3, sides: false }), d: 6 })
    out.push({ type: "box", at: [r2((s * L.hw + x1) / 2), -0.1, z], size: [Math.abs(x1) - L.hw + 0.4, 0.1, width + 0.4], material: "cobbles" })
    // A worn threshold across the mouth, a doorway to the walks.
    out.push({
      type: "wall",
      at: [s * (L.hw + 0.12), z],
      yaw: 90,
      length: width,
      height: 0.04,
      thickness: 0.3,
      openings: [{ at: 0, width: width - 0.06, height: 0.02, kind: "doorway" }],
      materials: { wall: "gutter", timber: "stoneTrim" },
    })
    return out
  }

  const L = LAYOUTS[d.layout] as { hw: number; near: number; far: number } & Record<string, number>
  const gapsOn = (side: -1 | 1) => (d.gaps ?? []).filter((g) => g.side === side).map((g) => g.z)
  // The ground under everything, stopping at the quay on the waterfront.
  const qz = LAYOUTS.waterfront.far - 7
  const o: Obj[] = [
    d.layout === "waterfront"
      ? { type: "box", at: [0, -0.14, (qz + 90) / 2], size: [200, 0.1, 90 - qz], material: "ground" }
      : { type: "box", at: [0, -0.14, -20], size: [200, 0.1, 220], material: "ground" },
  ]
  const lanterns: V3[] = []
  // Lanterns on brackets down both fronts, every few metres, alternating sides.
  const lanternRow = (z0: number, z1: number, hw: number, step: number) => {
    let i = 0
    for (let z = z0; z > z1; z -= step) {
      const side = i++ % 2 === 0 ? -1 : 1
      // None on the dressing's own buildings.
      if ((d.gaps ?? []).some((g) => g.side === side && z > g.z[0] - 0.5 && z < g.z[1] + 0.5)) continue
      o.push({ type: "wallLantern", at: [side * (hw + 0.05), 2.6, r2(z)], yaw: side < 0 ? 90 : -90, reach: 0.45 })
      lanterns.push([side * (hw - 0.4), 2.3, r2(z)])
    }
  }

  if (d.layout === "lanes") {
    const { cross, alley: side, bridge } = LAYOUTS.lanes
    o.push(
      { type: "box", at: [0, -0.1, (L.near + L.far) / 2], size: [2 * L.hw + 0.4, 0.1, L.near - L.far + 30], material: "cobbles" },
      { type: "box", at: [0, -0.06, (L.near + L.far) / 2], size: [0.5, 0.06, L.near - L.far + 30], material: "gutter" }
    )
    o.push(...row(-1, L.hw, L.near + 6, L.far, [[cross - 1.4, cross + 1.4], ...gapsOn(-1)]))
    o.push(...row(1, L.hw, L.near + 6, L.far, [[cross - 1.4, cross + 1.4], [side - 1.2, side + 1.2], ...gapsOn(1)]))
    o.push(...alley(cross, 2.8, -18), ...alley(cross, 2.8, 18), ...alley(side, 2.4, 14))
    o.push(
      house([0, bridge], 0, 2 * L.hw + 1.8, { front: "passage", storeys: 2, gable: false, jetty: stone ? 0 : 0.3, lean: 0, balcony: true, lit: 0.6 }),
      house([0, L.near + 10], 180, 2 * L.hw + 1.8, { front: "passage", storeys: 3, gable: true, lean: -0.1, lit: 0.4 }),
      house([0, L.far - 6], 0, 2 * L.hw + 4, { front: "door", storeys: 4, gable: true, lean: 0.2, lit: 0.5 })
    )
    lanternRow(L.near - 6, L.far + 4, L.hw, 6.5)
    lanterns.push([0, 2.6, bridge + 1.5])
    // A lantern down each alley.
    for (const [x, z, face] of [
      [-10.5, cross + 1.38, -1],
      [10.5, cross - 1.38, 1],
      [9.5, side + 1.18, -1],
    ] as V3[]) {
      o.push({ type: "wallLantern", at: [x, 2.5, z], yaw: face < 0 ? 180 : 0, reach: 0.35 })
      lanterns.push([x, 2.2, z + face * 0.5])
    }
  } else if (d.layout === "waterfront") {
    o.push({ type: "box", at: [0, -0.1, (L.near + L.far) / 2 + 2], size: [2 * L.hw + 0.4, 0.1, L.near - L.far + 4], material: "cobbles" })
    o.push(...row(-1, L.hw, L.near + 6, L.far + 1, gapsOn(-1)), ...row(1, L.hw, L.near + 6, L.far + 1, gapsOn(1)))
    o.push(house([0, L.near + 10], 180, 2 * L.hw + 1.8, { front: "passage", storeys: 3, gable: true, lean: 0, lit: 0.3 }))
    // The quay at the lane's end: worn flags to the edge, the stone face down to the water, and the harbour in mist.
    o.push(
      { type: "box", at: [0, -0.1, (L.far + qz) / 2], size: [60, 0.1, L.far - qz], material: "flags" },
      { type: "box", at: [0, -3.6, qz + 0.4], size: [60, 3.5, 0.8], material: "quayFace" },
      { type: "box", at: [0, -0.02, qz + 0.3], size: [60, 0.14, 0.6], material: "stoneTrim" },
      { type: "box", at: [0, -3.6, qz - 80], size: [400, 0.1, 160], material: "harbour" }
    )
    for (const x of [-9, -3.5, 3.5, 9]) o.push({ type: "bollard", at: [x, qz + 0.9] })
    for (const [x, z, yaw] of [
      [-8, qz - 4, 20],
      [5, qz - 6, -15],
      [13, qz - 3.5, 70],
    ])
      o.push({ type: "skiff", at: [x, -3.55, z], yaw })
    // Ruined warehouse walls along the quay either side of the lane's mouth, and a tall harbour tower to the west.
    o.push(
      { type: "box", at: [-L.hw - 16, 2.4, L.far - 2], size: [12, 4.8, 3], material: "stone" },
      { type: "box", at: [L.hw + 9, 3.2, L.far - 2], size: [10, 6.4, 3], material: "stone" },
      {
        type: "roundTower",
        at: [-L.hw - 1.4, L.far - 11],
        r: 3.4,
        height: 21,
        roofHeight: 0,
        sides: 14,
        crown: true,
        materials: { wall: "stone", roof: "roof", trim: "stoneTrim", trimB: "stoneTrim", pennant: "clothDrab" },
      }
    )
    lanternRow(L.near - 3, L.far + 3, L.hw, 7)
  } else {
    const { sq, top, far } = LAYOUTS.square
    o.push(
      { type: "box", at: [0, -0.1, (L.near + top) / 2 + 2], size: [2 * L.hw + 0.4, 0.1, L.near - top + 8], material: "cobbles" },
      { type: "box", at: [0, -0.1, (top + far) / 2], size: [2 * sq + 0.4, 0.1, top - far + 1], material: "flags" },
      { type: "box", at: [0, -0.06, (top + far) / 2], size: [2 * sq - 4, 0.06, top - far - 4], material: "cobbles" }
    )
    o.push(...row(-1, L.hw, L.near + 6, top + D), ...row(1, L.hw, L.near + 6, top + D))
    o.push(...rank(-sq - D, -L.hw, top, -1), ...rank(L.hw, sq + D, top, -1))
    o.push(...row(-1, sq, top, far + 0.5, gapsOn(-1)), ...row(1, sq, top, far + 0.5, gapsOn(1)))
    o.push(house([0, L.near + 10], 180, 2 * L.hw + 1.8, { front: "passage", storeys: 3, gable: true, lean: 0, lit: 0.3 }))
    // The great house across the square's head: three bays of dressed stone, the middle one with a balcony over its door
    // and steps up to it.
    const ashlar = { plaster: "ashlar", plasterB: "ashlar", timber: "ashlar", stone: "ashlar" }
    o.push(
      { ...house([0, far - 5], 0, 12, { front: "arch", storeys: 3, gable: false, jetty: 0, lean: 0, balcony: true, lit: lit[1], ground: 4.2, storey: 3.4 }), d: 10, materials: ashlar },
      { ...house([-11, far - 5], 0, 10, { front: "door", storeys: 3, gable: true, jetty: 0, lean: 0, balcony: false, lit: lit[1], ground: 4.0, storey: 3.2 }), d: 10, materials: ashlar },
      { ...house([11, far - 5], 0, 10, { front: "door", storeys: 3, gable: true, jetty: 0, lean: 0, balcony: false, lit: lit[1], ground: 4.0, storey: 3.2 }), d: 10, materials: ashlar },
      { ...house([-sq - 4, far - 5], 0, 6, { front: "plain", storeys: 3, gable: true, jetty: 0, lean: 0 }), d: 10, materials: ashlar },
      { ...house([sq + 4, far - 5], 0, 6, { front: "plain", storeys: 3, gable: true, jetty: 0, lean: 0 }), d: 10, materials: ashlar }
    )
    for (let i = 0; i < 3; i++) o.push({ type: "box", at: [0, i * 0.16, far + 1.2 - i * 0.4], size: [6 - i * 0.6, 0.16, 2.4 - i * 0.8], material: "ashlarTrim" })
    lanternRow(L.near - 3, top + 2, L.hw, 6)
    for (const [x, z] of [
      [-sq + 0.6, -6],
      [sq - 0.6, -10],
      [-sq + 0.6, -22],
      [sq - 0.6, -26],
    ]) {
      o.push({ type: "wallLantern", at: [Math.sign(x) * (sq + 0.05), 2.8, z], yaw: x < 0 ? 90 : -90, reach: 0.45 })
      lanterns.push([Math.sign(x) * (sq - 0.4), 2.5, z])
    }
  }

  // Spires of the upper city beyond the roofs.
  if (d.spires !== false) {
    const zf = L.far - 40
    const spire = { wall: "farNight", roof: "roofFar", trim: "farNight", pennant: "clothRed" }
    o.push(
      { type: "roundTower", at: [-3, zf - 24], r: 3.2, height: 30, roofHeight: 18, sides: 12, materials: spire },
      { type: "roundTower", at: [3.5, zf - 30], r: 2.6, height: 38, roofHeight: 16, sides: 12, materials: spire },
      { type: "roundTower", at: [-14, zf - 10], r: 2.4, height: 24, roofHeight: 12, sides: 12, materials: spire },
      { type: "roundTower", at: [14, zf - 16], r: 2.2, height: 22, roofHeight: 10, sides: 12, materials: spire }
    )
  }

  // Washing across the street between the upper storeys, and shop signs hung out over it.
  const CLOTHS = ["linen", "linenB", "clothRed", "clothBlue", "clothDrab"]
  if (d.laundry) {
    for (let z = L.near - 8; z > L.far + 6; z -= rnd(7, 13)) {
      const y = rnd(6.8, 8.0)
      o.push({ type: "laundry", from: [-L.hw + 0.8, y, r2(z)], to: [L.hw - 0.8, r2(y + rnd(-0.4, 0.4)), r2(z + rnd(-1.2, 1.2))], sag: 0.45, items: Math.floor(rnd(3, 7)), cloths: CLOTHS })
    }
  }
  if (d.signs !== false) {
    const emblems = ["boot", "mug", "key", "fish", "scissors", "moon"]
    let i = 0
    const zEnd = d.layout === "square" ? LAYOUTS.square.top + 3 : L.far + 6
    for (let z = L.near - 1.5; z > zEnd; z -= rnd(5, 9)) {
      const side = i % 2 === 0 ? 1 : -1
      o.push({
        type: "hangingSign",
        at: [side * (L.hw + 0.05), 3.4, r2(z)],
        yaw: side < 0 ? 90 : -90,
        reach: 1.1,
        width: 0.75,
        height: 0.5,
        emblem: emblems[i++ % emblems.length],
        materials: { board: pickOne(["signRed", "signGreen", "signBlue", "signBoard"]) },
      })
    }
  }
  o.push(...(d.objects ?? []))

  // Lights: the dressing's own first, then the street's lanterns spread along the street, eight in all.
  const lamp = (at: V3) => ({ at, color: "#ffa850", intensity: d.time === "night" ? 7 : 3, distance: 7 })
  const own = d.lights ?? []
  const room = Math.max(0, 8 - own.length)
  const near = lanterns.filter((l) => l[2] > (d.lightsTo ?? -50)).sort((a, b) => b[2] - a[2])
  const street = d.time === "day" ? [] : near.filter((_, i) => i % Math.max(1, Math.ceil(near.length / room)) === 0).slice(0, room)
  const lights = [...own, ...street.map(lamp)]

  const ATMOS: Record<Time, Obj> = {
    // A low moon over the spires up the street, thin cloud, sea mist between the houses, lanterns lit.
    night: {
      sun: {
        direction: [0.02, 0.36, -0.93],
        color: "#a8c4cc",
        intensity: 0.95,
        target: [0, 0, -14],
        distance: 220,
        shadow: { left: -40, right: 40, top: 50, bottom: -50, near: 120, far: 360, size: 2048 },
      },
      hemisphere: { sky: "#58747a", ground: "#1e1c1a", intensity: 0.6 },
      sky: { horizon: "#6e8a8c", mid: "#3a5258", zenith: "#16242a", gain: 0.7, clouds: 0.5, stars: 0.3, moon: 2.4 },
      fog: { density: d.fog ?? 0.03, color: "#4e6466", start: d.fog && d.fog > 0.04 ? 2 : 8 },
      glow: "#a8c4cc",
      fill: { color: "#ffe2c0", intensity: 1.2, distance: 8 },
      lights,
      environment: 0.28,
      exposure: 1.1,
      grade: "neutral",
      wind: 0.3,
    },
    // Dawn: a low gold sun from the east down the cross streets, a pale sky, a little mist left in the street.
    dawn: {
      sun: {
        direction: [0.62, 0.22, -0.75],
        color: "#ffc68c",
        intensity: 2.6,
        target: [0, 0, -14],
        distance: 240,
        shadow: { left: -50, right: 50, top: 60, bottom: -60, near: 120, far: 380, size: 4096 },
      },
      hemisphere: { sky: "#b0bcd0", ground: "#5a4636", intensity: 0.6 },
      sky: { horizon: "#f2c8a0", mid: "#b4bccc", zenith: "#6478a0", gain: 0.95, clouds: 0.6, stars: 0, moon: 0 },
      fog: { density: d.fog ?? 0.012, color: "#d0bca8", start: 18 },
      glow: "#ffc080",
      fill: { color: "#fff0dc", intensity: 0.9, distance: 9 },
      lights,
      environment: 0.36,
      exposure: 1.05,
      grade: "warm",
      wind: 0.8,
    },
    // Full day: high sun, clouds, a clear view to the far towers.
    day: {
      sun: {
        direction: [-0.45, 0.72, 0.52],
        color: "#ffe2bc",
        intensity: 4.6,
        target: [0, 0, -14],
        distance: 260,
        shadow: { left: -60, right: 60, top: 70, bottom: -70, near: 10, far: 560, size: 4096 },
      },
      hemisphere: { sky: "#a9c6e2", ground: "#6a4c38", intensity: 0.4 },
      sky: { horizon: "#d6d6cc", mid: "#96bad6", zenith: "#4a82b6", gain: 1, clouds: 1, stars: 0, moon: 0 },
      fog: { density: d.fog ?? 0.004, color: "#c8d0d4", start: 30 },
      glow: "#ffe0b0",
      fill: { color: "#fff4e4", intensity: 0.7, distance: 9 },
      lights,
      environment: 0.4,
      exposure: 1.0,
      grade: "warm",
      wind: 0.9,
    },
  }

  // Walkers up and down the street's middle.
  const groups: Obj[] = []
  if (d.crowd?.walkers) {
    const zEnd = d.layout === "lanes" ? L.far + 4 : d.layout === "square" ? LAYOUTS.square.top - 2 : L.far + 2
    const path: V2[] = [
      [-0.8, L.near + 2],
      [-0.7, (L.near + zEnd) / 2],
      [-0.6, zEnd],
    ]
    const mix = d.crowd.mix ?? { pilgrim: 8, traveler: 5, merchant: 2, woman: 3, porter: 2 }
    groups.push(
      { type: "walkers", path, count: d.crowd.walkers, speed: [0.6, 1.0], lateral: [-0.9, 0.6], mix },
      { type: "walkers", path: path.map(([x, z]) => [-x + 0.4, z]).reverse(), count: d.crowd.walkers, speed: [0.6, 1.0], lateral: [-0.6, 0.9], mix }
    )
  }
  groups.push(...(d.crowd?.groups ?? []))

  const keep = Object.fromEntries(Object.entries(lower.materials).filter(([k]) => !["signDagger", "signSerpent", "puddle"].includes(k)))
  const sq = d.layout === "square" ? LAYOUTS.square.sq : L.hw
  const atmosphere = { ...ATMOS[d.time], ...(d.atmosphere ?? {}) } as { sun: Obj }
  if (d.sun) atmosphere.sun = { ...atmosphere.sun, direction: d.sun }
  return {
    format: "d20.stage.set",
    version: 1,
    id: d.id,
    settingId: "realm-of-myr",
    locationId: d.id,
    title: d.title,
    seed: d.seed,
    atmosphere,
    camera: {
      near: 0.1,
      far: 600,
      min: [-sq - (d.layout === "lanes" ? 15 : 0) + 0.3, 0.4, L.far - (d.layout === "waterfront" ? 6.5 : 2)],
      max: [sq + (d.layout === "lanes" ? 11 : 0) - 0.3, 16, L.near + 1],
      maxDistance: 16,
    },
    materials: { ...keep, ...STREET_MATERIALS, ...(d.materials ?? {}) },
    objects: o,
    crowd: groups.length ? { library: "realm-of-myr", avoid: { rects: [], circles: d.crowd?.avoid ?? [] }, groups } : undefined,
    marks: d.marks ?? {},
    shots: d.shots,
    life: d.dust === false ? {} : { dust: { count: 360, box: [-sq, 0.2, Math.max(L.far, -40), sq, 7, L.near] } },
  }
}

// The kit's own materials on top of the Lower Districts' palette: dressed stone for stone fronts and the great house,
// the quay, the harbour and masts.
const STREET_MATERIALS: Obj = {
  stone: { type: "image", map: "/stage/textures/stone-old.jpg", size: [2.4, 2.4], tint: "#c8beb0", roughness: 0.9 },
  farNight: { type: "masonry", a: "#6a6a68", b: "#7a7874", c: "#5e5e5c", block: [2.5, 1.2], grime: 0.6, relief: 0.03 },
  stoneUpper: { type: "masonry", a: "#5e5852", b: "#6e6660", c: "#524c48", mortar: "#403a36", block: [0.5, 0.3], joint: 0.012, relief: 0.008, variance: 0.8, grime: 2.4 },
  stoneUpperB: { type: "masonry", a: "#56524e", b: "#645e58", c: "#4a4642", mortar: "#3a3632", block: [0.42, 0.28], joint: 0.012, relief: 0.008, variance: 0.8, grime: 2.6 },
  stoneFrame: { type: "masonry", a: "#4a4440", b: "#56504a", c: "#403c38", mortar: "#36302c", block: [0.6, 0.3], joint: 0.01, relief: 0.006, variance: 0.5, grime: 2.0 },
  ashlar: { type: "masonry", a: "#8a8276", b: "#968e80", c: "#7e766a", mortar: "#6a6258", block: [0.9, 0.42], joint: 0.008, relief: 0.006, variance: 0.4, grime: 1.2 },
  ashlarTrim: { type: "masonry", a: "#a0968a", b: "#aaa094", c: "#948a7e", mortar: "#7a7268", block: [1.2, 0.3], joint: 0.006, relief: 0.004, variance: 0.3, grime: 0.8 },
  flags: { type: "masonry", a: "#4e4c48", b: "#5a5650", c: "#44423e", mortar: "#2a2826", block: [0.9, 0.6], joint: 0.02, relief: 0.03, variance: 0.5, grime: 1.6, ground: true, roughness: 0.4 },
  quayFace: { type: "masonry", a: "#3a3c3a", b: "#44463e", c: "#30322e", mortar: "#22241e", block: [0.8, 0.45], joint: 0.015, relief: 0.01, variance: 0.6, grime: 2.6 },
  harbour: { type: "water", color: "#1e2830", reflect: 5, ripple: 0.4, flow: [0.2, 1], mirror: 0.3 },
  mast: { type: "wood", a: "#2a2420", b: "#342c26", c: "#241e1a", plank: [0, 30], relief: 0.02 },
  candle: { type: "plain", color: "#e8dcc0", roughness: 0.9 },
  candleFlame: { type: "plain", color: "#000000", roughness: 1, emissive: "#ffb060", emissiveIntensity: 4 },
  // Skiffs at the quay, night-dark versions of the docks' boats.
  hull: { type: "painted", map: "/stage/textures/timber-hold.jpg", tint: "#8a7c6c", plank: [0.24, 40], size: [0.7, 2.2], relief: 0.06, grime: 1.4 },
  deck: { type: "painted", map: "/stage/textures/boards-weathered.jpg", tint: "#8a8070", plank: [0.16, 4.2], size: [0.5, 1.4], relief: 0.08, grime: 1.4, nails: 0.6 },
  rail: { type: "wood", a: "#3a3028", b: "#443830", c: "#30281e", plank: [0, 30], relief: 0.02 },
  clothDrab: { type: "cloth", color: "#5a5448" },
}
