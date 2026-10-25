// Writes March of Davos's Black Market (wiki/plans/march-of-davos-sets.md): the curtained doorway in a court between two
// crumbling buildings, and behind it a maze of stalls and tents in a lane roofed with canvas and strung with lanterns,
// at nightfall. At the lane's far end, the auction house's door, the way on to the auction (encounters 20 to 22). The
// stagings of the entrance and the stalls.
//
//   pnpm exec tsx scripts/stage-sets/black-market.ts && pnpm stage:check
//
// The JSON it writes is what the app loads. Edit this file and rerun rather than editing the JSON by hand.

import { readFileSync, writeFileSync } from "node:fs"

type V2 = [number, number]
type Obj = Record<string, unknown>
const SETS = "packages/stage/src/sets/realm-of-myr"
const STAGINGS = "packages/stage/src/stagings/march-of-davos"
const ART = "/stage/fixtures/march-of-davos"
const lower = JSON.parse(readFileSync(`${SETS}/kordavos-lower-districts.json`, "utf8"))
const docks = JSON.parse(readFileSync(`${SETS}/kordavos-docks.json`, "utf8"))
const festival = JSON.parse(readFileSync(`${STAGINGS}/the-harvest-festival.json`, "utf8"))
const r2 = (n: number) => Math.round(n * 100) / 100
function write(path: string, data: unknown) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
}
let seed = 1818
const rnd = (a = 0, b = 1) => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return a + ((b - a) * seed) / 4294967296
}
const pickOne = <T>(xs: T[]) => xs[Math.floor(rnd(0, xs.length))]

// ── Plan ──
// The court: x from -2.4 to 2.4, z from 6.6 to 20, between two crumbling houses, closed at the south by a house with a
// passage back to the alleys. The market's wall stands across z = 6.4 with the curtained arch in it. Beyond it the lane
// runs north, 5.6 m between the houses' fronts, to the auction house at z = -36. Side lanes turn off east at z = -11
// and west at z = -21, each ending in tents.
const COURT = { hw: 2.4, z0: 6.6, z1: 20 }
const GATE_Z = 6.4
const LANE = { hw: 2.8, z0: GATE_Z - 0.3, z1: -36 }
const EAST = { z0: -13.2, z1: -9.7, x1: 15 }
const WEST = { z0: -23.2, z1: -19.7, x1: -14 }
const D = 8

function house(at: V2, yaw: number, w: number, extra: Obj = {}): Obj {
  return {
    type: "tenement",
    at,
    yaw,
    w: r2(w),
    d: D,
    storeys: pickOne([2, 3, 3, 4]),
    ground: r2(rnd(2.9, 3.3)),
    storey: r2(rnd(2.5, 2.8)),
    jetty: r2(rnd(0.3, 0.5)),
    lean: r2(rnd(-0.4, 0.4)),
    gable: rnd() < 0.5,
    front: pickOne(["shop", "shop", "door", "plain"]),
    lit: r2(rnd(0.2, 0.55)),
    balcony: rnd() < 0.25,
    ...extra,
  }
}
// One side of a lane running along z: houses shoulder to shoulder from z0 toward z1, skipping gaps.
function rowZ(x: number, yaw: number, z0: number, z1: number, gaps: V2[] = [], extra: Obj = {}): Obj[] {
  const out: Obj[] = []
  let z = z0
  while (z > z1 + 2.5) {
    const w = Math.min(rnd(4.2, 6.2), z - z1)
    const zc = z - w / 2
    const gap = gaps.find(([a, b]) => zc + w / 2 > a && zc - w / 2 < b)
    if (gap) {
      z = gap[0]
      continue
    }
    const corner = gaps.some(([a, b]) => Math.abs(zc - w / 2 - b) < 0.3 || Math.abs(zc + w / 2 - a) < 0.3)
    out.push(house([x, r2(zc)], yaw, w - 0.04, { ...(corner ? { sides: true } : {}), ...extra }))
    z -= w
  }
  return out
}
// One side of a lane running along x, from x0 toward x1 (either way).
function rowX(z: number, yaw: number, x0: number, x1: number, extra: Obj = {}): Obj[] {
  const out: Obj[] = []
  const dir = Math.sign(x1 - x0)
  let x = x0
  while (Math.abs(x1 - x) > 2.5) {
    const w = Math.min(rnd(4.0, 5.6), Math.abs(x1 - x))
    out.push(house([r2(x + (dir * w) / 2), z], yaw, w - 0.04, { storeys: pickOne([2, 3]), ...extra }))
    x += dir * w
  }
  return out
}

function buildings(): Obj[] {
  const o: Obj[] = [
    { type: "box", at: [0, -0.14, -10], size: [160, 0.1, 160], material: "ground" },
    // Old cracked flags in the court, mud and straw-strewn setts in the market.
    { type: "box", at: [0, -0.1, (COURT.z0 + COURT.z1) / 2 + 0.4], size: [2 * COURT.hw + 0.4, 0.1, COURT.z1 - COURT.z0 + 1.6], material: "flags" },
    { type: "box", at: [0, -0.1, (LANE.z0 + LANE.z1) / 2], size: [2 * LANE.hw + 0.4, 0.1, LANE.z0 - LANE.z1 + 1], material: "cobbles" },
    { type: "box", at: [(LANE.hw + EAST.x1) / 2, -0.1, (EAST.z0 + EAST.z1) / 2], size: [EAST.x1 - LANE.hw + 0.4, 0.1, EAST.z1 - EAST.z0 + 0.4], material: "cobbles" },
    { type: "box", at: [(WEST.x1 - LANE.hw) / 2, -0.1, (WEST.z0 + WEST.z1) / 2], size: [-WEST.x1 - LANE.hw + 0.4, 0.1, WEST.z1 - WEST.z0 + 0.4], material: "cobbles" },
  ]
  // The court's crumbling houses, plain and shuttered, and the house at its south end with the passage out.
  o.push(...rowZ(-(COURT.hw + D / 2), 90, COURT.z1, COURT.z0 - 0.2, [], { front: "plain", lit: 0.15, storeys: 3 }))
  o.push(...rowZ(COURT.hw + D / 2, -90, COURT.z1, COURT.z0 - 0.2, [], { front: "door", lit: 0.1, storeys: 3 }))
  o.push({ ...house([0, COURT.z1 + D / 2], 180, 2 * COURT.hw + 0.4, { front: "passage", storeys: 2, gable: true, lean: 0.1, lit: 0.25 }) })
  // The market's wall across the court's north end: old stone, the arch, the planked-up doorways either side of it.
  o.push(
    {
      type: "wall",
      at: [0, GATE_Z],
      yaw: 180,
      length: 2 * COURT.hw + 0.6,
      height: 7.2,
      thickness: 0.5,
      a: { finish: "stone" },
      b: { finish: "stone" },
      openings: [{ at: 0, width: 2.3, height: 3.2, kind: "doorway" }],
    },
    { type: "archHead", at: [0, 0, GATE_Z], yaw: 180, width: 2.3, height: 3.2, thickness: 0.56, moulding: 0.12, materials: { fill: "stone", trim: "stoneTrim" } },
    // The curtains: heavy ochre cloth half drawn, darkness and a glimmer of lamps beyond.
    { type: "curtain", at: [0, 0, GATE_Z - 0.05], yaw: 180, width: 2.3, height: 3.05, folds: 20, depth: 0.045, gather: 0.5, side: "both", tie: 0.42, cloth: "curtainGold" },
    { type: "box", at: [0, 0, GATE_Z - 1.2], size: [2.5, 3.0, 0.1], material: "void" },
    // Old doors nailed up either side, a ledge and a bowl, a lantern.
    { type: "box", at: [-1.95, 0, GATE_Z + 0.27], size: [0.9, 2.3, 0.06], material: "door" },
    { type: "boards", at: [-1.95, 0, GATE_Z + 0.3], yaw: 180, width: 1.0, height: 2.2, planks: 4 },
    { type: "box", at: [1.95, 0, GATE_Z + 0.27], size: [0.9, 2.3, 0.06], material: "door" },
    { type: "boards", at: [1.95, 0, GATE_Z + 0.3], yaw: 180, width: 1.0, height: 2.2, planks: 3 },
    { type: "box", at: [-2.1, 1.1, GATE_Z + 0.45], size: [0.5, 0.05, 0.3], material: "crateDark" },
    { type: "pot", at: [-2.15, 1.15, GATE_Z + 0.45], size: 0.22 },
    { type: "wallLantern", at: [1.55, 2.7, GATE_Z + 0.28], yaw: 180, reach: 0.35 }
  )
  // The market's lane: houses both sides with gaps for the side lanes.
  o.push(...rowZ(-(LANE.hw + D / 2), 90, LANE.z0 - 0.2, LANE.z1, [[WEST.z0, WEST.z1]]))
  o.push(...rowZ(LANE.hw + D / 2, -90, LANE.z0 - 0.2, LANE.z1, [[EAST.z0, EAST.z1]]))
  // Behind the market's wall, the houses that frame the court continue as the lane's first fronts: close the gap above.
  o.push({ type: "box", at: [0, 7.2, GATE_Z], size: [2 * LANE.hw + 0.4, 3, 0.5], material: "stone" })
  // The side lanes and their dead ends.
  o.push(...rowX(EAST.z0 - D / 2, 0, LANE.hw + D + 0.1, EAST.x1), ...rowX(EAST.z1 + D / 2, 180, LANE.hw + D + 0.1, EAST.x1))
  o.push({ ...house([EAST.x1 + D / 2, (EAST.z0 + EAST.z1) / 2], -90, EAST.z1 - EAST.z0 + 2.6, { front: "plain", storeys: 3 }) })
  o.push(...rowX(WEST.z0 - D / 2, 0, -LANE.hw - D - 0.1, WEST.x1), ...rowX(WEST.z1 + D / 2, 180, -LANE.hw - D - 0.1, WEST.x1))
  o.push({ ...house([WEST.x1 - D / 2, (WEST.z0 + WEST.z1) / 2], 90, WEST.z1 - WEST.z0 + 2.6, { front: "plain", storeys: 3 }) })
  // The auction house closes the lane: a tall old stone front, a wide arched door hung with dark curtains, guarded.
  o.push(
    {
      type: "wall",
      at: [0, LANE.z1 - 0.25],
      length: 2 * LANE.hw + 1.4,
      height: 11,
      thickness: 0.5,
      a: { finish: "stone" },
      b: { finish: "stone" },
      openings: [{ at: 0, width: 2.6, height: 3.6, kind: "doorway" }],
    },
    { type: "archHead", at: [0, 0, LANE.z1 - 0.25], width: 2.6, height: 3.6, thickness: 0.56, moulding: 0.14, materials: { fill: "stone", trim: "stoneTrim" } },
    { type: "curtain", at: [0, 0, LANE.z1 - 0.1], width: 2.6, height: 3.4, folds: 14, depth: 0.08, gather: 0.25, side: "both", tie: 0.4, cloth: "curtainWine" },
    { type: "box", at: [0, 0, LANE.z1 - 1.4], size: [2.8, 3.6, 0.1], material: "void" },
    { type: "column", at: [-1.75, LANE.z1 + 0.25], height: 4.2, radius: 0.2, square: true, gilt: false, materials: { shaft: "stoneTrim", trim: "stoneTrim" } },
    { type: "column", at: [1.75, LANE.z1 + 0.25], height: 4.2, radius: 0.2, square: true, gilt: false, materials: { shaft: "stoneTrim", trim: "stoneTrim" } },
    { type: "box", at: [0, 4.3, LANE.z1 + 0.15], size: [4.4, 0.35, 0.6], material: "stoneTrim" },
    { type: "brazier", at: [-2.3, LANE.z1 + 1.0] },
    { type: "brazier", at: [2.3, LANE.z1 + 1.0] },
    { type: "panel", at: [0, 5.0, LANE.z1 + 0.02], size: [0.9, 0.9], material: "signSerpent" },
    // Tall windows above, a lit one.
    ...[-2.0, 2.0].flatMap((x) => [{ type: "panel", at: [x, 6.0, LANE.z1 + 0.02], size: [0.9, 2.2], arch: true, material: x < 0 ? "windowLit" : "windowDark", depth: 0.05, edge: "stoneTrim" }])
  )
  return o
}

// ── The stalls ──
const TENTS = ["tentRust", "tentWine", "tentPlum", "tentBlack", "tentOchre", "tentTeal", "tentGreen", "clothDrab"]
const GEMS = ["gemRed", "gemGreen", "gemBlue", "gemPurple"]
const POTIONS = ["potionRed", "potionGreen", "potionBlue", "potionAmber", "potionViolet", "pottery"]
// A stall against a lane's west or east front at z: canvas over the counter, its goods, stock behind.
function stallAt(side: -1 | 1, z: number, w: number, goods: string, extra: Obj = {}): Obj {
  return {
    type: "stall",
    at: [r2(side * (LANE.hw - 0.75)), r2(z)],
    yaw: side < 0 ? 90 : -90,
    w: r2(w),
    d: 1.3,
    cloth: pickOne(TENTS),
    goods,
    sides: false,
    back: true,
    frontHeight: 2.25,
    backRise: 0.35,
    sag: 0.18,
    valance: pickOne(TENTS),
    backCloth: pickOne(TENTS),
    pad: 0.1,
    ...extra,
  }
}
function market(): Obj[] {
  const o: Obj[] = []
  // West side of the lane, from the gate north. Vera's blades at z = -2.6; the rest packed close.
  for (const [z, w, g] of [
    [3.2, 2.2, "cloth"],
    [-6.0, 2.4, "spices"],
    [-9.0, 2.2, "pots"],
    [-14.0, 2.4, "jewels"],
    [-17.2, 2.2, "baskets"],
    [-25.0, 2.6, "arms"],
    [-28.6, 2.2, "sacks"],
    [-32.0, 2.2, "cloth"],
  ] as [number, number, string][])
    o.push(stallAt(-1, z, w, g))
  // East side: Grendar's treasure at the first stall, then potions, cloth, spices, oddities.
  for (const [z, w, g] of [
    [-3.6, 2.2, "spices"],
    [-6.8, 2.2, "none"],
    [-14.6, 2.4, "cloth"],
    [-18.0, 2.2, "pots"],
    [-21.6, 2.4, "spices"],
    [-25.2, 2.2, "none"],
    [-29.0, 2.4, "jewels"],
    [-32.6, 2.2, "baskets"],
  ] as [number, number, string][])
    o.push(stallAt(1, z, w, g))
  // Grendar's stall by the gate: a counter heaped with gold and gems, his canvas over it, curios behind him.
  o.push(
    { type: "treasureCounter", at: [1.75, 1.2], yaw: -90, length: 2.0, width: 0.7, height: 0.92, heaps: 12, gems: GEMS },
    { type: "curioShelf", at: [LANE.hw - 0.02, 1.2], yaw: -90, width: 2.0, height: 2.2, shelves: 5, glass: POTIONS },
    {
      type: "canvas",
      corners: [
        [1.15, 2.55, 2.4],
        [1.15, 2.55, 0.0],
        [2.8, 3.0, 0.0],
        [2.8, 3.0, 2.4],
      ],
      cloth: "tentWine",
      sag: 0.12,
    }
  )
  // Potion and oddity shelves in the stalls with no goods of their own.
  for (const z of [-6.8, -25.2]) o.push({ type: "curioShelf", at: [LANE.hw - 0.12, z], yaw: -90, width: 2.0, height: 2.0, shelves: 4, glass: POTIONS })
  // Vera's rack of blades and a table of daggers.
  o.push(
    { type: "bladeRack", at: [-2.35, -1.2], yaw: 90, width: 1.6, height: 1.8, blades: 9 },
    { type: "table", at: [-1.85, -2.9], yaw: 90, length: 1.4, width: 0.6, materials: { top: "table" } },
    ...Array.from({ length: 6 }, (_, i) => ({ type: "box", at: [-1.9 + (i % 2) * 0.18, 0.77, -3.45 + i * 0.2], yaw: 80 + i * 7, size: [0.32, 0.012, 0.04], material: "steel" })),
    {
      type: "canvas",
      corners: [
        [-1.15, 2.55, -0.3],
        [-1.15, 2.55, -3.7],
        [-2.8, 3.0, -3.7],
        [-2.8, 3.0, -0.3],
      ],
      cloth: "tentBlack",
      sag: 0.12,
    }
  )
  // Mizrith's tent at the mouth of the east lane: a heap of curiosities.
  o.push(
    { type: "curioShelf", at: [5.6, EAST.z0 + 0.05], yaw: 0, width: 2.2, height: 2.2, shelves: 5, glass: POTIONS },
    { type: "treasureCounter", at: [5.6, -12.0], yaw: 0, length: 1.6, width: 0.6, height: 0.85, heaps: 3, gems: GEMS, materials: { cloth: "clothPlum" } },
    {
      type: "awning",
      corners: [
        [4.4, 2.7, -13.1],
        [6.8, 2.7, -13.1],
        [6.8, 2.45, -11.5],
        [4.4, 2.45, -11.5],
      ],
      cloth: "tentPlum",
      sag: 0.15,
    }
  )
  // Further down the east lane, tents and a dead end.
  o.push(
    {
      type: "stall",
      at: [9.8, EAST.z0 + 0.75],
      yaw: 0,
      w: 2.4,
      d: 1.3,
      cloth: "tentTeal",
      goods: "jewels",
      sides: false,
      back: true,
      frontHeight: 2.2,
      backRise: 0.3,
      backCloth: "tentBlack",
      pad: 0.1,
    },
    { type: "stall", at: [12.6, EAST.z1 - 0.75], yaw: 180, w: 2.2, d: 1.3, cloth: "tentOchre", goods: "pots", sides: false, back: true, frontHeight: 2.2, backRise: 0.3, backCloth: "clothDrab" }
  )
  // The west lane: the shadowy corner stall where the oily vendor sells the stolen elven goods, and tents.
  o.push(
    { type: "table", at: [-9.2, WEST.z0 + 0.75], length: 1.8, width: 0.7, materials: { top: "table" } },
    { type: "box", at: [-9.6, 0.765, WEST.z0 + 0.8], yaw: 8, size: [0.7, 0.012, 0.5], material: "elvenSilk" },
    ...[-9.85, -9.5, -9.15].map((x, i) => ({
      type: "lathe",
      at: [x, 0.77, WEST.z0 + 0.62 + (i % 2) * 0.2],
      profile: [
        [0, 0],
        [0.04, 0],
        [0.012, 0.025],
        [0.01, 0.1],
        [0.045, 0.14],
        [0.05, 0.22],
        [0, 0.2],
      ],
      segments: 14,
      material: "silver",
    })),
    { type: "box", at: [-8.6, 0.77, WEST.z0 + 0.7], yaw: 30, size: [0.36, 0.3, 0.12], material: "carving" },
    { type: "box", at: [-8.35, 0.77, WEST.z0 + 0.9], yaw: -12, size: [0.14, 0.42, 0.1], material: "carving" },
    { type: "box", at: [-8.9, 0.78, WEST.z0 + 1.0], yaw: 8, size: [0.5, 0.08, 0.32], material: "elvenSilk" },
    {
      type: "stall",
      at: [-5.6, WEST.z1 - 0.75],
      yaw: 180,
      w: 2.4,
      d: 1.3,
      cloth: "tentRust",
      goods: "sacks",
      sides: false,
      back: true,
      frontHeight: 2.2,
      backRise: 0.3,
      backCloth: "clothDrab",
      pad: 0.1,
    },
    {
      type: "stall",
      at: [-11.8, WEST.z1 - 0.75],
      yaw: 180,
      w: 2.2,
      d: 1.3,
      cloth: "tentBlack",
      goods: "arms",
      sides: false,
      back: true,
      frontHeight: 2.1,
      backRise: 0.3,
      backCloth: "tentBlack",
      pad: 0.1,
    },
    {
      type: "awning",
      corners: [
        [-10.4, 2.3, WEST.z0],
        [-8.0, 2.3, WEST.z0],
        [-8.0, 2.1, WEST.z0 + 1.4],
        [-10.4, 2.1, WEST.z0 + 1.4],
      ],
      cloth: "tentBlack",
      sag: 0.15,
    },
    { type: "lantern", at: [-8.1, 2.0, WEST.z0 + 1.35] }
  )
  // Over the lane: patched canvas sheets on poles between the houses, lanterns strung across, washing higher up.
  for (const [z0, z1, y, c] of [
    [1.0, -4.6, 5.0, "canvasOld"],
    [-7.6, -13.0, 5.4, "tentRust"],
    [-15.6, -20.4, 5.1, "canvasOld"],
    [-23.4, -28.8, 5.5, "tentWine"],
    [-30.6, -34.6, 5.2, "canvasOld"],
  ] as [number, number, number, string][])
    o.push({
      type: "canvas",
      corners: [
        [-LANE.hw - 0.4, y + 0.3, z0],
        [LANE.hw + 0.4, y, z0],
        [LANE.hw + 0.4, y - 0.2, z1],
        [-LANE.hw - 0.4, y + 0.1, z1],
      ],
      cloth: c,
      sag: 0.5,
    })
  for (let z = 4.6; z > LANE.z1 + 1; z -= 2.6) {
    const zz = r2(z + rnd(-0.4, 0.4))
    o.push({
      type: "lanternString",
      materials: { lamp: "globe" },
      from: [-LANE.hw - 0.2, r2(rnd(3.7, 4.2)), zz],
      to: [LANE.hw + 0.2, r2(rnd(3.7, 4.2)), r2(zz - rnd(0.6, 1.6))],
      sag: 0.45,
      count: Math.floor(rnd(3, 6)),
      drop: 0.25,
      size: 0.2,
    })
  }
  for (const x of [5, 8.5, 12])
    o.push({ type: "lanternString", materials: { lamp: "globe" }, from: [x, 3.6, EAST.z0 - 0.1], to: [x + 1.0, 3.8, EAST.z1 + 0.1], sag: 0.3, count: 2, drop: 0.2, size: 0.18 })
  for (const x of [-6, -9.5, -12.5])
    o.push({ type: "lanternString", materials: { lamp: "globe" }, from: [x, 3.5, WEST.z0 - 0.1], to: [x - 0.8, 3.7, WEST.z1 + 0.1], sag: 0.3, count: 2, drop: 0.2, size: 0.18 })
  for (const [z, y] of [
    [-5.5, 8.0],
    [-21, 8.4],
    [-30, 7.8],
  ])
    o.push({ type: "laundry", from: [-2.4, y, z], to: [2.4, y + rnd(-0.3, 0.3), z + rnd(-1, 1)], sag: 0.4, items: 5, cloths: ["linen", "linenB", "clothRed", "clothBlue"] })
  // Braziers smoking in the lane, crates and barrels, sacks, a cage, a rug thrown down before a stall.
  o.push(
    { type: "brazier", at: [-2.0, -11.45] },
    { type: "brazier", at: [2.05, -23.45] },
    // Worn thresholds across the side lanes' mouths, out in the lane: doorways to the walks, so walks turn there.
    ...[
      [1.75, EAST],
      [-1.75, WEST],
    ].map(([x, l]) => {
      const lane = l as typeof EAST
      return {
        type: "wall",
        at: [x as number, (lane.z0 + lane.z1) / 2],
        yaw: 90,
        length: lane.z1 - lane.z0,
        height: 0.03,
        thickness: 0.3,
        openings: [{ at: 0, width: lane.z1 - lane.z0 - 0.06, height: 0.02, kind: "doorway" }],
        materials: { wall: "gutter", timber: "gutter" },
      }
    }),
    { type: "mist", at: [0, 0, -10], width: 5.6, height: 3.5, layers: 4, spacing: 7, materials: { mist: "smoke" } },
    { type: "barrel", at: [-2.45, 5.2], r: 0.3, h: 0.85 },
    { type: "crate", at: [2.45, -1.0], yaw: 12, size: 0.6 },
    { type: "crate", at: [2.4, -1.0], yaw: -8, size: 0.45 },
    { type: "barrel", at: [2.5, -16.4], r: 0.32, h: 0.9 },
    { type: "crate", at: [-2.45, -18.9], yaw: 5, size: 0.6 },
    { type: "basket", at: [2.5, -23.4], size: 0.5 },
    { type: "barrel", at: [-2.45, -30.2], r: 0.3, h: 0.85 },
    { type: "panel", at: [-0.2, 0.006, -14.0], size: [1.6, 1.0], pitch: -90, material: "rugWorn" }
  )
  return o
}

// ── Materials ──
function materials(): Obj {
  const from = (src: Obj, names: string[]) => Object.fromEntries(names.filter((n) => (src.materials as Obj)[n]).map((n) => [n, (src.materials as Obj)[n]]))
  const plain = (color: string, roughness = 0.6, extra: Obj = {}) => ({ type: "plain", color, roughness, ...extra })
  return {
    ...from(docks, ["tentRust", "tentWine", "tentPlum", "tentBlack", "tentOchre", "tentTeal", "tentGreen", "tentCream", "goodsRed", "goodsGreen", "goodsYellow", "goodsTeal"]),
    ...from(lower, [
      "far",
      "roofFar",
      "ground",
      "table",
      "crate",
      "crateDark",
      "barrel",
      "sack",
      "sackB",
      "basket",
      "iron",
      "brass",
      "void",
      "pottery",
      "potteryB",
      "rope",
      "straw",
      "clothDrab",
      "pole",
      "coin",
      "gourd",
      "door",
      "flame",
      "fire",
      "coal",
      "crystal",
      "tablecloth",
      "chest",
      "gutter",
      "stone",
      "stoneTrim",
      "plaster",
      "plasterB",
      "timber",
      "roof",
      "shutter",
      "dark",
      "windowLit",
      "shopLit",
      "windowDark",
      "gilt",
      "linen",
      "linenB",
      "clothRed",
      "clothBlue",
      "lead",
      "signSerpent",
      "signBoard",
      "signRed",
      "signGreen",
      "signBlue",
    ]),
    cobbles: { ...(lower.materials.cobbles as Obj), a: "#3a3a38", b: "#46443e", c: "#302e2c", mortar: "#1a1814" },
    flags: { type: "masonry", a: "#4a4640", b: "#56524a", c: "#3e3a36", mortar: "#26221e", block: [0.62, 0.44], joint: 0.02, relief: 0.012, variance: 0.7, grime: 2.2, ground: true, roughness: 0.4 },
    curtainGold: { type: "cloth", color: "#8e6a2e", amp: 0.4, freq: 0.6 },
    curtainWine: { type: "cloth", color: "#4a1a1e", amp: 0.3, freq: 0.6 },
    canvasOld: { type: "cloth", color: "#7a6e5a", amp: 0.5 },
    clothPlum: { type: "cloth", color: "#4e2a46" },
    smoke: { type: "mist", color: "#6a6460", opacity: 0.14 },
    gold: { type: "metal", color: "#d4a640", roughness: 0.32, metalness: 0.9 },
    silver: { type: "metal", color: "#c8ccd0", roughness: 0.25, metalness: 0.9 },
    steel: { type: "metal", color: "#9aa0a6", roughness: 0.3, metalness: 0.85 },
    leather: plain("#3a2618", 0.7),
    bone: plain("#c8bca0", 0.8),
    paper: plain("#d8ccae", 0.9),
    carving: { type: "wood", a: "#8a6a44", b: "#a07c50", c: "#74583a", plank: [0, 40], relief: 0.2, seed: 2.2 },
    elvenSilk: { type: "cloth", color: "#d8d2c2", shadow: false },
    gemRed: plain("#a01828", 0.15, { emissive: "#ff2040", emissiveIntensity: 0.25 }),
    gemGreen: plain("#1a8a3a", 0.15, { emissive: "#30ff70", emissiveIntensity: 0.2 }),
    gemBlue: plain("#1a3aa0", 0.15, { emissive: "#4070ff", emissiveIntensity: 0.25 }),
    gemPurple: plain("#6a1a8a", 0.15, { emissive: "#b040ff", emissiveIntensity: 0.2 }),
    potionRed: plain("#7a1018", 0.12, { emissive: "#c02030", emissiveIntensity: 0.3 }),
    potionGreen: plain("#1e5a20", 0.12, { emissive: "#40c050", emissiveIntensity: 0.3 }),
    potionBlue: plain("#18306a", 0.12, { emissive: "#3060e0", emissiveIntensity: 0.3 }),
    potionAmber: plain("#7a4a10", 0.12, { emissive: "#e09030", emissiveIntensity: 0.3 }),
    potionViolet: plain("#4a1a5a", 0.12, { emissive: "#a050d0", emissiveIntensity: 0.3 }),
    shield: { type: "plain", color: "#4a2a20", roughness: 0.7 },
    // Old ochre-grey stone painted from the entrance's art, one tile to 2.4 m of wall.
    stone: { type: "image", map: "/stage/textures/stone-old.jpg", size: [2.4, 2.4], tint: "#c8beb0", roughness: 0.9 },
    // Paper and glass lantern globes, deep amber so they read as flame-lit, not as white bulbs.
    globe: { type: "plain", color: "#000000", roughness: 1, emissive: "#ff7a24", emissiveIntensity: 0.9 },
    lamp: { type: "plain", color: "#000000", roughness: 1, emissive: "#ff8a30", emissiveIntensity: 1.1 },
    rugWorn: { type: "image", map: "/stage/textures/library-rug.jpg", roughness: 1, tint: "#a08878" },
  }
}

// ── The set ──
const MARKS = {
  court: { at: [0, 13], label: "the court before the curtained doorway" },
  doorway: { at: [0, GATE_Z + 1.1], label: "the curtained doorway" },
  inside: { at: [0, 4.2], label: "inside the curtain" },
  grendar: { at: [0.5, 1.2], label: "the first stall, heaped with gold" },
  blades: { at: [-0.7, -2.2], label: "the dwarf's blade stall" },
  potions: { at: [1.0, -6.8], label: "the potion stall" },
  eastLane: { at: [4.0, -11.45], label: "the turn to the east lane" },
  curios: { at: [5.6, -10.9], label: "the cackling peddler's tent of curiosities" },
  westLane: { at: [-4.0, -21.45], label: "the turn to the west lane" },
  elven: { at: [-9.2, -21.6], label: "the shadowy stall of elven goods" },
  braziers: { at: [-0.7, -11.45], label: "the smoking brazier" },
  auction: { at: [0, LANE.z1 + 2.2], label: "the auction house door" },
}
const SHOTS = {
  entrance: { position: [0.2, 1.55, 9.75], target: [0, 1.62, 6.6], fov: 50, label: "The curtained doorway" },
  court: { position: [-1.6, 1.7, 18.4], target: [0.4, 2.2, 6.4], fov: 56, label: "The court" },
  stalls: { position: [-0.9, 1.55, 4.0], target: [0.9, 1.7, -14], fov: 52, label: "The Black Market" },
  grendar: { position: [0.75, 1.45, 3.0], target: [3.6, 1.45, -3.4], fov: 54, label: "Grendar's stall" },
  lane: { position: [0.6, 1.6, -4.5], target: [-0.4, 2.0, -34], fov: 54, label: "The lane" },
  curios: { position: [3.6, 1.55, -9.0], target: [5.8, 1.2, -12.8], fov: 52, label: "The curiosities" },
  elven: { position: [-6.4, 1.6, -20.6], target: [-9.4, 0.9, -22.6], fov: 50, label: "The elven goods" },
  auction: { position: [0.4, 1.7, -27.5], target: [0, 3.0, -36], fov: 56, label: "The auction house" },
  canvas: { position: [0.8, 1.4, -10], target: [-0.6, 6.5, -20], fov: 62, label: "The lanterns" },
}

function blackMarket() {
  return {
    format: "d20.stage.set",
    version: 1,
    id: "kordavos-black-market",
    settingId: "realm-of-myr",
    locationId: "kordavos-black-market",
    title: "The Black Market",
    seed: 1818,
    atmosphere: {
      // Nightfall: the last cold light high in the sky, and the market lit by its own lamps, braziers and lanterns.
      sun: {
        direction: [0.3, 0.55, -0.78],
        color: "#8a9ab8",
        intensity: 0.5,
        target: [0, 0, -12],
        distance: 220,
        shadow: { left: -36, right: 36, top: 40, bottom: -40, near: 120, far: 360, size: 2048 },
      },
      hemisphere: { sky: "#5a6a88", ground: "#2a2018", intensity: 0.45 },
      sky: { horizon: "#7a8094", mid: "#4a5470", zenith: "#1e2438", gain: 0.75, clouds: 0.8, stars: 0.1, moon: 0 },
      fog: { density: 0.026, color: "#3a3e4a", start: 10 },
      glow: "#ffb070",
      fill: { color: "#ffe2c0", intensity: 1.1, distance: 8 },
      lights: [
        { at: [0.9, 2.4, 1.6], color: "#ffa850", intensity: 9, distance: 6 },
        { at: [-1.2, 3.2, -2.0], color: "#ffa850", intensity: 9, distance: 7 },
        { at: [-2.0, 1.4, -11.45], color: "#ff8a3a", intensity: 10, distance: 7 },
        { at: [5.0, 2.3, -11.4], color: "#ffb070", intensity: 6, distance: 6 },
        { at: [0.6, 3.4, -16.0], color: "#ffa850", intensity: 9, distance: 8 },
        { at: [-8.6, 1.9, -21.9], color: "#ffb060", intensity: 8, distance: 5 },
        { at: [2.05, 1.4, -23.45], color: "#ff8a3a", intensity: 10, distance: 8 },
        { at: [0, 2.2, LANE.z1 + 1.4], color: "#ff9a40", intensity: 12, distance: 9 },
      ],
      environment: 0.3,
      exposure: 1.1,
      grade: "neutral",
      wind: 0.3,
    },
    // The court has its own light: a lamp by the doorway, the warm glow on the curtains, the last of the sky. The set's
    // lights are the market's.
    rooms: [
      {
        box: [-COURT.hw - 0.2, -0.5, GATE_Z + 0.3, COURT.hw + 0.2, 14, COURT.z1],
        ambient: 0.9,
        fill: 1.3,
        exposure: 1.15,
        lights: [
          { at: [-1.4, 2.3, 9.2], color: "#ffb064", intensity: 7, distance: 6 },
          { at: [0, 2.3, GATE_Z + 0.55], color: "#ffc070", intensity: 5, distance: 3.5 },
          { at: [1.55, 2.4, GATE_Z + 0.65], color: "#ffa850", intensity: 4, distance: 4 },
          { at: [0.6, 6, 15], color: "#8a9ac0", intensity: 4, distance: 14 },
        ],
      },
    ],
    camera: { near: 0.1, far: 500, min: [WEST.x1 + 0.6, 0.4, LANE.z1 + 0.8], max: [EAST.x1 - 0.6, 7.5, COURT.z1 - 0.6], maxDistance: 14 },
    materials: materials(),
    objects: [...buildings(), ...market()],
    paths: {
      lane: [
        [0.35, 1.6],
        [0.3, -10],
        [0.4, -22],
        [0.3, LANE.z1 + 3],
      ],
      laneB: [
        [0.9, LANE.z1 + 3],
        [0.8, -20],
        [0.95, -8],
        [0.85, 1.6],
      ],
    },
    crowd: {
      library: "realm-of-myr",
      // Keep passers-by off the line from Grendar's stall down the lane, and out of the curtain's mouth.
      avoid: {
        rects: [],
        circles: [
          [1.0, 1.8, 2.4],
          [0, 4.6, 1.6],
          [-0.7, -0.9, 1.4],
        ],
      },
      groups: [
        { type: "walkers", path: "lane", count: 24, speed: [0.4, 0.7], lateral: [-0.4, 0.3], mix: { pilgrim: 6, traveler: 4, merchant: 2, woman: 2 } },
        { type: "walkers", path: "laneB", count: 24, speed: [0.4, 0.7], lateral: [-0.3, 0.4], mix: { pilgrim: 6, traveler: 4, packer: 1, woman: 2 } },
        {
          type: "points",
          people: [
            { kind: "pilgrim", at: [-1.0, -6.1], yaw: -90 },
            { kind: "traveler", at: [1.2, -14.6], yaw: 90 },
            { kind: "pilgrim", at: [-1.1, -17.0], yaw: -90 },
            { kind: "merchant", at: [1.2, -21.6], yaw: 95 },
            { kind: "woman", at: [-1.2, -25.1], yaw: -80 },
            { kind: "pilgrim", at: [1.1, -29.1], yaw: 90 },
            { kind: "traveler", at: [-1.2, -32.0], yaw: -100 },
            { kind: "pilgrim", at: [8.0, -11.2], yaw: 10 },
            { kind: "traveler", at: [-5.4, -20.8], yaw: 200 },
            { kind: "soldier", at: [-1.2, LANE.z1 + 1.2], yaw: 0 },
            { kind: "soldier", at: [1.2, LANE.z1 + 1.2], yaw: 0 },
          ],
        },
      ],
    },
    marks: MARKS,
    shots: SHOTS,
    life: { dust: { count: 260, box: [-LANE.hw, 0.2, -30, LANE.hw, 5, 6] } },
  }
}
write(`${SETS}/kordavos-black-market.json`, blackMarket())

// ── Cast and stagings ──
const art = (name: string) => ({ front: `${ART}/${name}-front.webp`, back: `${ART}/${name}-back.webp`, portrait: `${ART}/${name}-portrait.jpg` })
const member = (id: string, name: string, role: string, height: number, file: string, at: V2, facing: string | V2 | number) => ({ id, name, role, height, art: art(file), at, facing })
const party = (spots: [string, V2][], facing: V2) => spots.map(([id, at]) => ({ ...festival.cast.find((c: Obj) => c.id === id), at, facing }))
const shotOn = (subject: string, distance: number, angle: number, height: number, lookHeight: number, label: string) => ({ subject, distance, angle, height, lookHeight, fov: 44, label })
function staging(id: string, cast: Obj[], shots: Obj, shot: string, extra: Obj = {}) {
  write(`${STAGINGS}/${id}.json`, { format: "d20.stage.staging", version: 1, id: `march-of-davos/${id}`, set: "realm-of-myr/kordavos-black-market", cast, shots, shot, ...extra })
}

// The Entrance: the party has come into the court from the alleys. Garrick stands before the half-drawn curtain, arms
// crossed, and steps forward to block it.
const COURT_PARTY: [string, V2][] = [
  ["branka-stoneveil", [-1.3, 11.6]],
  ["cassia-verane", [-0.4, 12.0]],
  ["yeva-softstep", [0.5, 11.7]],
  ["milos-radan", [1.4, 12.1]],
]
staging(
  "the-entrance-to-the-black-market",
  [...party(COURT_PARTY, [0, GATE_Z]), member("garrick", "A hooded guard", "Doorkeeper", 1.92, "garrick", [0, GATE_Z + 0.95], [0, 12])],
  {
    garrick: shotOn("garrick", 2.4, 0, 1.6, 1.62, "The guard"),
    party: { subjects: COURT_PARTY.map(([id]) => id), offset: [0.4, 1.7, -3.6], target: [0, 1.2, 0], relative: "world", fov: 54, label: "Party" },
  },
  "entrance"
)

// Labyrinthine Stalls: the party just inside the curtain. Grendar leans over his gold at the first stall, Vera holds up
// a carved dagger at her blades, Rae saunters past, Mizrith beckons from his tent where the east lane turns off, and the
// oily vendor keeps his elven goods in the shadowy west lane.
const IN_PARTY: [string, V2][] = [
  ["branka-stoneveil", [-1.4, 4.9]],
  ["cassia-verane", [-0.6, 5.5]],
  ["yeva-softstep", [-0.6, 4.4]],
  ["milos-radan", [0.25, 5.4]],
]
staging(
  "labyrinthine-stalls",
  [
    ...party(IN_PARTY, [0, -6]),
    member("grendel-one-eye", "Grendar", "Trinket dealer", 1.8, "grendel-one-eye", [2.45, 1.2], [0.4, 4.2]),
    member("vera-azimov", "Vera Azimov", "Weapon dealer", 1.36, "vera-azimov", [-1.35, -2.0], [0, 3.8]),
    member("rae-the-scarred", "A scarred young woman", "Rogue", 1.68, "rae-the-scarred", [0.7, -0.6], [-0.4, 4.6]),
    member("mizrith-the-cackler", "A cackling peddler", "Peddler", 1.3, "mizrith-the-cackler", [5.6, -12.65], [3, -8]),
    member("vesk-the-fence", "An oily vendor", "Fence", 1.32, "oily-vendor", [-9.2, WEST.z0 + 0.12], [-9.2, -20.0]),
  ],
  {
    grendarShot: { subject: "grendel-one-eye", distance: 1.6, angle: -35, height: 1.5, lookHeight: 1.45, fov: 46, label: "Grendar" },
    vera: shotOn("vera-azimov", 1.8, -40, 1.25, 1.05, "Vera"),
    rae: shotOn("rae-the-scarred", 2.0, -20, 1.6, 1.55, "Rae"),
    mizrith: shotOn("mizrith-the-cackler", 2.0, 20, 1.3, 1.05, "Mizrith"),
    vendor: shotOn("vesk-the-fence", 2.0, 0, 1.35, 1.0, "The oily vendor"),
    party: { subjects: IN_PARTY.map(([id]) => id), offset: [0.6, 1.7, -3.8], target: [0, 1.2, 0], relative: "world", fov: 54, label: "Party" },
  },
  "grendar"
)
