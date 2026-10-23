// Writes March of Davos's docks (wiki/plans/march-of-davos-sets.md): the Kordavos harbour quay in golden late light, with
// the elven ship Star of Faelendar at her berth, Warehouse 14 in its shadowed corner, and the same quay wrecked after the
// forest drake broke loose. Stagings for the five dock encounters.
//
//   pnpm exec tsx scripts/stage-sets/kordavos-docks.ts && pnpm stage:check
//
// The JSON it writes is what the app loads. Edit this file and rerun rather than editing the JSON by hand.

import { readFileSync, writeFileSync } from "node:fs"

type V2 = [number, number]
type V3 = [number, number, number]
type Obj = Record<string, unknown>
const SETS = "packages/stage/src/sets/realm-of-myr"
const STAGINGS = "packages/stage/src/stagings/march-of-davos"
const ART = "/stage/fixtures/march-of-davos"
const square = JSON.parse(readFileSync(`${SETS}/kordavos-harvest-square.json`, "utf8"))
const riverfront = JSON.parse(readFileSync(`${SETS}/kordavos-riverfront.json`, "utf8"))
const festival = JSON.parse(readFileSync(`${STAGINGS}/the-harvest-festival.json`, "utf8"))
const r2 = (n: number) => Math.round(n * 100) / 100
function write(path: string, data: unknown) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
}
const painted = (map: string, tint: string, plank: [number, number], extra: Obj = {}) => ({
  type: "painted",
  map: `/stage/textures/${map}.jpg`,
  tint,
  plank,
  size: [0.5, 1.4],
  relief: 0.08,
  grime: 1.1,
  ...extra,
})

// ── The harbour ──
// The quay's edge runs along x at z = 0, the harbour lies north (z < 0) with its water 4 m down, and the quay runs
// south 22 m to a row of stone warehouses facing the water. The Star of Faelendar lies along the quay, bow east, her main
// deck level with the paving and her hull towering out of the deep water. Warehouse 14 is a timber shed at the west
// end, its doors open east onto the quay, wedged between a tall warehouse and the harbour wall. A timber jetty runs
// out west of the ship; the painting's view looks east along the water from it.
const WATER = -5.5
const BACK = 22
const SHIP = { x: 14, z: -7.4, length: 42, beam: 11 }
// The ship lies bow west, toward the painting's view: her local z runs along world -x, local x along world +z (the
// quay side).
const onShip = (lz: number, lx = 0): V2 => [r2(SHIP.x - lz), r2(SHIP.z + lx)]
const GANGWAY_Z = 8
const BOLLARDS = [-46, -38, -30, -18, -14, -10.5, -6, 9.5, 13.5, 22, 25.5, 33.5, 49]
const HATCH_Z = -4.5
const JETTY = 42
const SHED = { x0: -30, x1: -20.5, z0: 5, z1: 15, h: 4.2 }
// Golden low sun from the east-north-east over the water: backlight down the harbour, as in the painting.
const SUN: V3 = [0.72, 0.3, -0.62]

function harbour(wrecked: boolean): Obj[] {
  const o: Obj[] = [
    // The water, the quay's paving of small worn cobbles, worn flags along the edge, and the stone face down to the water
    // under a coping.
    { type: "box", at: [0, WATER - 0.1, -170], size: [500, 0.1, 340], material: "water" },
    { type: "box", at: [0, -0.3, 31.75], size: [500, 0.3, 56.5], material: "paving" },
    { type: "box", at: [0, -0.3, 1.75], size: [500, 0.3, 3.5], material: "flags" },
    { type: "box", at: [0, WATER - 2, -0.35], size: [500, 2 - WATER, 0.7], material: "quayWall" },
    { type: "box", at: [0, -0.02, 0.25], size: [500, 0.08, 0.5], material: "stoneTrim" },
    // The quay head across the harbour's west end, where the painting's view stands, its face down to the water.
    { type: "box", at: [-29, -0.3, -15.5], size: [14, 0.3, 31], material: "flags" },
    { type: "box", at: [-21.65, WATER - 2, -15.5], size: [0.7, 2 - WATER, 31], material: "quayWall" },
    { type: "box", at: [-22.25, -0.02, -15.5], size: [0.5, 0.08, 31], material: "stoneTrim" },
    // The timber jetty west of the ship.
    { type: "pier", at: [JETTY, 0, 0], yaw: 180, length: 20, width: 2.6, depth: 8, rickety: 0.15, materials: { plank: "deck", post: "post" } },
  ]
  // Small craft along the quay and round the jetty, and two cargo barges laden with crates.
  for (const [x, zz, yaw, len] of [
    [JETTY - 2.2, -5, 172, 4.6],
    [JETTY + 2.3, -8.5, 8, 4.4],
    [JETTY - 2.4, -11.5, 186, 5.2],
    [JETTY + 2.4, -14, -6, 4.2],
    [JETTY - 2.2, -16.5, 176, 4.8],
    [-19.6, -24, 4, 5],
    [-19.4, -28.5, 178, 4.6],
    [-19.8, -12, 2, 4.4],
    [-19.6, -16.5, 176, 5],
    [-17.2, -14.5, 6, 4.2],
    [-17.0, -26.5, 182, 4.8],
    [-6, -24, 70, 4.6],
    [2, -28, 96, 5.2],
    [10, -24, 84, 4.4],
    [-2, -33, 120, 4.6],
    [34, -2.2, 92, 4.8],
    [38.5, -2.4, 88, 4.4],
    [-8, -30, 40, 4.6],
    [20, -34, -70, 5],
    [-26, -40, 110, 4.4],
  ] as [number, number, number, number][])
    o.push({ type: "skiff", at: [x, WATER + 0.55, zz], yaw, length: len })
  for (const [x, zz, yaw] of [
    [-10, -20, 84],
    [26, -21, -96],
  ] as [number, number, number][]) {
    o.push({ type: "skiff", at: [x, WATER + 0.5, zz], yaw, length: 10, beam: 3.2, materials: { hull: "wale" } })
    for (let k = 0; k < 6; k++) {
      const along = -3 + k * 1.2
      const rad = (yaw * Math.PI) / 180
      o.push({
        type: "crate",
        at: [r2(x + Math.sin(rad) * along + ((k % 2) - 0.5) * 0.9 * Math.cos(rad)), WATER + 0.17, r2(zz + Math.cos(rad) * along - ((k % 2) - 0.5) * 0.9 * Math.sin(rad))],
        yaw: yaw + k * 7,
        size: 0.8,
        stack: k % 3 === 0,
      })
    }
  }
  // Bollards along the edge, clear of the jetty's root and the gangway; rope coils by some; iron rings and ladders down
  // the quay's face.
  for (const x of BOLLARDS) o.push({ type: "bollard", at: [x, 0.75] })
  for (const x of [-38, -18, 22, 33.5]) for (let k = 0; k < 3; k++) o.push({ type: "torus", at: [x + 0.8, 0.05 + k * 0.07, 1.4], radius: 0.32 - k * 0.04, tube: 0.04, pitch: 90, material: "rope" })
  for (let x = -44; x <= 52; x += 6) o.push({ type: "torus", at: [x, -0.9, -0.02], radius: 0.14, tube: 0.028, material: "iron" })
  for (const x of [-3, 21, -44]) {
    for (const s of [-0.25, 0.25]) o.push({ type: "box", at: [x + s, WATER - 0.4, -0.06], size: [0.05, -WATER + 0.4, 0.05], material: "iron" })
    for (let y = WATER; y < 0; y += 0.3) o.push({ type: "box", at: [x, y, -0.06], size: [0.5, 0.03, 0.04], material: "iron" })
  }
  // Nets hung to dry on poles by the jetty.
  for (const [x, zz] of [
    [JETTY - 4, 1.8],
    [JETTY + 4.2, 2.0],
  ]) {
    o.push({ type: "panel", at: [x, 0.2, zz], size: [3.2, 2.4], material: "net" })
    for (const dx of [-1.65, 1.65]) o.push({ type: "cylinder", at: [x + dx, 0, zz], radius: 0.05, height: 2.8, material: "post" })
  }
  // The Star of Faelendar at her berth, a gangway to her rail, her lines to the bollards.
  o.push({
    type: "galleon",
    id: "star-of-faelendar",
    at: [SHIP.x, 0, SHIP.z],
    yaw: -90,
    length: SHIP.length,
    beam: SHIP.beam,
    height: 32,
    depth: 8,
    stern: 9.5,
    fore: 6.5,
    sails: wrecked ? "torn" : "set",
    gangway: [1, GANGWAY_Z],
    hatch: { at: HATCH_Z, size: 2.8, state: wrecked ? "burst" : "shut" },
  })
  const g = onShip(GANGWAY_Z)
  const gap = -SHIP.z - SHIP.beam / 2
  o.push(
    { type: "box", at: [g[0], 0.02, r2(-gap / 2 - 0.1)], size: [1.3, 0.06, r2(gap + 0.4)], material: "deck" },
    ...[-0.62, 0.62].map((dx) => ({ type: "box", at: [g[0] + dx, 0.0, r2(-gap / 2 - 0.1)], size: [0.08, 0.12, r2(gap + 0.4)], material: "rail" })),
    ...[-0.4, -0.9, -1.4].map((zz) => ({ type: "box", at: [g[0], 0.05, zz], size: [1.2, 0.03, 0.05], material: "rail" })),
    ...[-0.62, 0.62].map((dx) => ({ type: "rope", from: [g[0] + dx, 1.0, 0.1], to: [g[0] + dx, 1.05, r2(-gap - 0.1)], sag: 0.15, radius: 0.025 }))
  )
  for (const [lz, bx] of [
    [19, -14],
    [15, -6],
    [-15, 33.5],
    [-19, 49],
  ]) {
    const [sx, sz] = onShip(lz, SHIP.beam / 2 - 0.3)
    o.push({ type: "rope", from: [sx, 1.0, sz], to: [bx, 0.6, 0.75], sag: 0.5, radius: 0.04 })
  }
  // The beast's cage in the hold under the hatch: whole, or eaten through by acid.
  const [cx, cz] = onShip(HATCH_Z)
  o.push({ type: "cage", id: "cage", at: [cx, -2.1 - 0.05, cz], yaw: -90, width: 2.3, depth: 2.3, height: 1.9, melted: wrecked ? 0.6 : 0 })
  // Ships along the quay and out in the harbour, some under sail.
  o.push(
    { type: "ship", at: [64, WATER + 1.4, -7.5], yaw: 90, length: 24, beam: 6.5, masts: 2, height: 18, sails: "furled" },
    { type: "ship", at: [-52, WATER + 1.4, -9], yaw: -88, length: 20, beam: 6, masts: 2, height: 16, sails: "furled" },
    { type: "ship", at: [-14, WATER + 1.4, -52], yaw: 70, length: 22, beam: 6, masts: 3, height: 18, sails: "set" },
    { type: "ship", at: [64, WATER + 1.4, -36], yaw: 100, length: 26, beam: 7, masts: 3, height: 20, sails: "set" },
    { type: "ship", at: [-30, WATER + 1.4, -70], yaw: 80, length: 22, beam: 6, masts: 3, height: 18, sails: "furled" },
    { type: "ship", at: [18, WATER + 1.4, -95], yaw: -100, length: 26, beam: 7, masts: 3, height: 20, sails: "set" },
    { type: "ship", at: [110, WATER + 1.4, -20], yaw: 88, length: 22, beam: 6, masts: 2, height: 17, sails: "furled" },
    { type: "ship", at: [150, WATER + 1.4, -32], yaw: 100, length: 24, beam: 6.5, masts: 3, height: 19, sails: "set" }
  )
  // The treadwheel crane east of the ship, its net of crates swung out over her deck.
  o.push({ type: "crane", at: [19, 3.2], yaw: 180, reach: 9.5, height: 11, drop: wrecked ? 7.5 : 4.5, load: !wrecked })
  // Warehouses along the back of the quay, facing the water, with a gap for a street up into the city, and more running
  // on east along the harbour.
  for (const [x, w, h, bays] of [
    [-58, 14, 12, 3],
    [-42, 16, 13, 4],
    [-24, 14, 15, 3],
    [-6, 18, 12, 4],
    [24, 16, 14, 4],
    [42, 14, 12, 3],
    [58, 16, 15, 4],
    [76, 16, 12, 4],
    [94, 14, 14, 3],
  ] as [number, number, number, number][])
    o.push({ type: "warehouse", at: [x, BACK + 5], yaw: 180, w, d: 10, h, bays, arch: 4.4 })
  // A round harbour tower at the far end of the quay, as in the painting.
  o.push({ type: "roundTower", at: [112, 4], r: 4.5, height: 22, sides: 18, roofHeight: 9, materials: { roof: "roofRed" } })
  // Beyond the street gap, houses climbing into the city.
  for (const [x, zz, h] of [
    [8, 34, 10],
    [16, 38, 14],
    [6, 44, 16],
  ])
    o.push({ type: "house", at: [x, zz], yaw: 180, w: 8, d: 8, h })
  return o
}

// Warehouse 14: a timber shed in the quay's shadowed west corner, its double doors open east, crates of elven wine and
// silk inside, the reinforced lockbox, and against the back wall the great iron-banded crate hung with chain.
function shed(wrecked: boolean): Obj[] {
  const { x0, x1, z0, z1, h } = SHED
  const boards = { finish: "boards" as const, studs: 1.5 }
  const o: Obj[] = [
    { type: "box", at: [(x0 + x1) / 2, -0.04, (z0 + z1) / 2], size: [x1 - x0, 0.05, z1 - z0], material: "floor" },
    { type: "wall", at: [(x0 + x1) / 2, z0 - 0.12], yaw: 0, length: x1 - x0 + 0.24, height: h, thickness: 0.24, a: boards, b: { finish: "boards" } },
    { type: "wall", at: [(x0 + x1) / 2, z1 + 0.12], yaw: 180, length: x1 - x0 + 0.24, height: h, thickness: 0.24, a: boards, b: { finish: "boards" } },
    { type: "wall", at: [x0 - 0.12, (z0 + z1) / 2], yaw: -90, length: z1 - z0, height: h, thickness: 0.24, a: boards, b: { finish: "boards" } },
    {
      type: "wall",
      at: [x1 + 0.12, (z0 + z1) / 2],
      yaw: 90,
      length: z1 - z0,
      height: h,
      thickness: 0.24,
      a: boards,
      b: { finish: "boards" },
      openings: [
        { at: 0, width: 3.0, height: 3.0, kind: "door" },
        { at: -3.4, width: 0.9, height: 0.7, sill: 2.3, kind: "window", panes: [2, 2] },
      ],
    },
    // The roof: a shallow pitch of planks on rafters, a gap of light under the eaves.
    { type: "box", at: [(x0 + x1) / 2, h, (z0 + z1) / 2], size: [x1 - x0 + 0.8, 0.12, z1 - z0 + 0.8], material: "shedRoof" },
    ...[0.2, 0.4, 0.6, 0.8].map((t) => ({ type: "box", at: [r2(x0 + (x1 - x0) * t), h - 0.2, (z0 + z1) / 2], size: [0.16, 0.22, z1 - z0], material: "timber" })),
    // The two door leaves swung back against the front wall.
    { type: "box", at: [x1 + 0.3, 0.05, (z0 + z1) / 2 - 2.25], size: [0.08, 2.95, 1.5], material: "door" },
    { type: "box", at: [x1 + 0.3, 0.05, (z0 + z1) / 2 + 2.25], size: [0.08, 2.95, 1.5], material: "door" },
    { type: "lantern", at: [x1 + 0.4, 0, (z0 + z1) / 2 - 1.9], height: 2.6 },
  ]
  // Crates of elven wine and bolts of silk in stacks, lanes between them, a barrel row along the north wall.
  const stacks: [number, number, number, boolean][] = [
    [-28.9, 6.3, 1.0, true],
    [-27.7, 6.2, 0.9, false],
    [-28.8, 7.5, 0.95, true],
    [-25.6, 6.3, 0.85, true],
    [-24.5, 6.2, 0.8, false],
    [-23.2, 6.5, 0.9, true],
    [-26.4, 9.9, 0.9, true],
    [-25.3, 10.1, 0.85, false],
    [-26.3, 11.1, 0.8, false],
    [-23.4, 12.9, 0.9, true],
    [-22.3, 13.6, 0.8, false],
  ]
  for (const [x, zz, s, stack] of stacks) o.push({ type: "crate", at: [x, zz], yaw: (x * 37) % 12, size: s, stack, solid: true, materials: { crate: "crateOak" } })
  for (let k = 0; k < 5; k++) o.push({ type: "barrel", at: [r2(-29.2 + k * 0.85), 14.3], r: 0.36, h: 0.95, solid: true })
  for (const [x, zz] of [
    [-28.6, 10.6],
    [-28.9, 11.4],
    [-28.3, 12.1],
  ])
    o.push({ type: "sack", at: [x, zz], size: 0.75, materials: { sack: "silk", sackB: "silkB" } })
  o.push(
    // The chained crate against the back wall, and the lockbox on a crate by the lane.
    { type: "strongbox", id: "chained-crate", at: [-29.0, 9.1], yaw: 90, width: 1.8, height: 1.3, depth: 1.3, boards: 6, chain: true, materials: { wood: "crateOak" } },
    { type: "crate", at: [-25.5, 8.4], size: 0.8, solid: true },
    { type: "strongbox", id: "lockbox", at: [-25.5, 0.8, 8.4], yaw: 20, width: 0.5, height: 0.32, depth: 0.36, boards: 2, chain: false },
    { type: "lantern", at: [-25.3, 0.8, 8.15], height: 0 }
  )
  if (wrecked) o.push({ type: "box", at: [-24, 0.4, 10.4], yaw: 30, size: [0.9, 0.06, 0.6], material: "crateOak" })
  return o
}

// The quay's working clutter: cargo by the gangway, carts, stalls under cream canvas along the warehouse fronts, lamps.
// After the drake: staved-in crates, spilt cargo, splintered planks, a toppled cart, scorch and acid on the stones.
const CARGO: [number, number, number, boolean][] = [
  [10.4, 3.4, 0.9, true],
  [11.4, 3.6, 0.8, false],
  [11.0, 4.6, 0.85, true],
  [14.4, 3.2, 0.9, false],
  [15.2, 3.9, 0.8, true],
  [-3.8, 3.0, 0.8, false],
  [-4.6, 3.8, 0.9, true],
  [24.5, 3.6, 0.9, true],
  [25.5, 3.8, 0.8, false],
  [-13.2, 3.2, 0.9, true],
]
function quay(wrecked: boolean): Obj[] {
  const o: Obj[] = []
  if (!wrecked) for (const [x, zz, sz, stack] of CARGO) o.push({ type: "crate", at: [x, zz], yaw: (x * 41) % 20, size: sz, stack, solid: true })
  else {
    // Crates the drake smashed, staved in and tipped, and the rest standing.
    for (const [x, zz, sz, stack] of CARGO.slice(5)) o.push({ type: "crate", at: [x, zz], yaw: (x * 41) % 20, size: sz, stack, solid: true })
    for (const [x, zz, sz] of [
      [14.6, 3.6, 0.8],
      [15.4, 4.4, 0.7],
    ])
      o.push({ type: "crate", at: [x, zz], yaw: (x * 67) % 50, size: sz, solid: true })
    for (const [x, zz, yaw, roll] of [
      [9.6, 3.0, 20, 35],
      [11.8, 5.2, -30, 60],
      [3.2, 4.4, 50, 90],
    ])
      o.push({ type: "box", at: [x, 0.25, zz], yaw, roll, size: [0.8, 0.5, 0.8], material: "crate" })
    // Splintered planks flung across the paving round the gangway and toward the warehouses.
    let k = 0
    for (const [x, zz] of [
      [3.5, 2.2],
      [5.2, 1.6],
      [6.6, 2.4],
      [8.2, 1.9],
      [2.0, 3.6],
      [9.4, 2.9],
      [4.4, 4.6],
      [1.2, 1.4],
      [7.8, 5.6],
      [10.8, 2.0],
      [12.6, 4.8],
      [6.0, 6.8],
      [0.2, 2.6],
      [8.8, 7.4],
    ])
      for (let j = 0; j < 4; j++, k++)
        o.push({
          type: "box",
          at: [r2(x + ((k * 0.37) % 1.2) - 0.6), 0.02, r2(zz + ((k * 0.53) % 1.0) - 0.5)],
          yaw: (k * 53) % 180,
          size: [0.1 + (k % 3) * 0.03, 0.03, 0.5 + ((k * 0.17) % 0.7)],
          material: "crate",
        })
    // Spilt cargo: silk bolts unrolled, sacks burst, barrels rolled loose.
    for (const [x, zz, yaw, mat] of [
      [7.0, 3.6, 30, "silk"],
      [9.0, 4.4, -20, "silkB"],
      [5.4, 5.2, 70, "silk"],
    ] as [number, number, number, string][])
      o.push({ type: "box", at: [x, 0.01, zz], yaw, size: [0.55, 0.02, 1.6], material: mat })
    for (const [x, zz] of [
      [4.8, 3.2],
      [12.2, 6.0],
      [2.6, 5.6],
    ])
      o.push({ type: "sack", at: [x, zz], size: 0.55 })
    for (const [x, zz, yaw] of [
      [-1.2, 5.2, 30],
      [12.6, 6.4, -40],
      [16.4, 7.2, 80],
    ])
      o.push({ type: "cylinder", at: [x, 0.38, zz], radius: 0.38, height: 0.95, roll: 90, yaw, material: "barrel" })
    // A cart toppled on its side, one wheel in the air.
    o.push(
      { type: "box", at: [13.8, 0.75, 8.6], yaw: 25, roll: 80, size: [1.5, 0.12, 2.6], material: "planks" },
      { type: "box", at: [13.25, 0.35, 8.35], yaw: 25, size: [0.1, 0.7, 2.6], material: "planks" },
      { type: "torus", at: [14.3, 0.5, 7.4], yaw: 25, radius: 0.5, tube: 0.06, segments: 16, material: "planks" },
      { type: "torus", at: [14.5, 1.4, 9.6], yaw: 25, pitch: 80, radius: 0.5, tube: 0.06, segments: 16, material: "planks" }
    )
    // Scorch where the drake's acid-wet hide dragged, and acid pooled by the gangway.
    for (const [x, zz, sx, sz, yaw, mat] of [
      [5.8, 1.2, 0.9, 1.4, 10, "scorch"],
      [7.6, 2.8, 0.6, 1.0, 40, "scorch"],
      [4.6, 0.8, 0.8, 1.2, -20, "acid"],
      [9.0, 1.6, 0.7, 0.9, 60, "acid"],
    ] as [number, number, number, number, number, string][])
      o.push({ type: "box", at: [x, 0.005, zz], yaw, size: [sx, 0.01, sz], material: mat })
  }
  for (const [x, zz] of [
    [13.6, 4.6],
    [16.4, 2.9],
    [-5.6, 2.7],
    [26.8, 3.2],
  ])
    o.push({ type: "barrel", at: [x, zz], r: 0.38, h: 1.0, solid: true })
  for (const [x, zz] of [
    [12.6, 5.4],
    [13.1, 5.7],
    [-2.8, 3.4],
    [24, 5],
  ])
    o.push({ type: "sack", at: [x, zz], size: 0.6 })
  if (!wrecked) o.push({ type: "cart", at: [19.5, 16.6], yaw: -100 })
  o.push({ type: "cart", at: [-13.5, 16.8], yaw: 80 })
  // Stalls under cream canvas along the warehouse arcades, as in the painting.
  for (const [x, cloth, goods] of [
    [-38, "tentCream", "sacks"],
    [-17.5, "tentCream", "baskets"],
    [-9.5, "tentOchre", "cloth"],
    [-1.5, "tentCream", "pots"],
    [28, "tentCream", "sacks"],
    [35, "tentRust", "baskets"],
    [46, "tentCream", "pots"],
    [62, "tentCream", "cloth"],
    [80, "tentOchre", "sacks"],
  ] as [number, string, string][])
    o.push({ type: "stall", at: [x, BACK - 1.9], yaw: 180, w: 5, d: 3.2, cloth, goods, frontHeight: 2.6, backRise: 0.7, back: false })
  // The quay head: cargo and a few dockhands in the painting's foreground.
  for (const [x, zz, sz, stack] of [
    [-25.0, -24.6, 0.9, true],
    [-25.6, -23.5, 0.8, false],
    [-24.4, -12.5, 0.9, true],
  ] as [number, number, number, boolean][])
    o.push({ type: "crate", at: [x, zz], yaw: 12, size: sz, stack, solid: true })
  o.push({ type: "barrel", at: [-23.6, -26], r: 0.38, h: 1.0, solid: true }, { type: "bollard", at: [-22.8, -17] }, { type: "bollard", at: [-22.8, -8] })
  // Lamp posts along the quay.
  for (const x of [-12, 0.5, 13, 28, 44]) o.push({ type: "lantern", at: [x, 14.5], height: 3.2, post: true })
  return o
}

// ── Materials ──
function materials(): Obj {
  return {
    ...square.materials,
    ...Object.fromEntries(["water", "mast", "window", "roofRed"].map((n) => [n, riverfront.materials[n]])),
    roof: riverfront.materials.roofRed,
    pennant: riverfront.materials.pennant,
    // Sun-warmed paving and honey stone, the painting's palette.
    paving: { type: "masonry", a: "#9a8466", b: "#ab9474", c: "#887258", mortar: "#4a3c2c", block: [0.7, 0.5], joint: 0.03, relief: 0.05, variance: 0.5, grime: 1.1, ground: true, stones: 0.13 },
    flags: { type: "masonry", a: "#a08a6c", b: "#b09a7a", c: "#8c785e", mortar: "#4a3c2c", block: [1.1, 0.7], joint: 0.025, relief: 0.04, variance: 0.6, grime: 1.4, ground: true },
    stone: { type: "masonry", a: "#b89a72", b: "#c8aa80", c: "#a4885e", mortar: "#5a4834", block: [0.9, 0.42], joint: 0.02, relief: 0.05, variance: 0.4, grime: 1.2 },
    stoneTrim: { type: "rock", a: "#a88e6a", b: "#c4aa84", moss: "#6a5a44", mossLight: "#8a7658", lichen: "#d0bc98", mossAmount: 0.15, lichenAmount: 0.1, relief: 0.4, scale: 0.8 },
    quayWall: { type: "masonry", a: "#5a5044", b: "#6a5e4e", c: "#4a4238", mortar: "#2a241e", block: [0.9, 0.45], joint: 0.02, relief: 0.06, variance: 0.4, grime: 2.2 },
    water: { type: "water", color: "#2a5058", reflect: 5, ripple: 0.7, flow: [1, 0], mirror: 0.5 },
    // The Star of Faelendar: honey-brown elven planking, a green band with gilt, pale sails.
    hull: painted("timber-hold", "#f0c890", [0.24, 40], { size: [0.7, 2.2], grime: 0.8, relief: 0.06 }),
    wale: painted("hull-tar", "#6a5a50", [0, 40], { size: [0.5, 1.4], grime: 1.0 }),
    band: { type: "plain", color: "#2e4a36", roughness: 0.6 },
    gilt: { type: "metal", color: "#c89a48", roughness: 0.38, metalness: 0.85 },
    trim: riverfront.materials.trim,
    deck: painted("boards-weathered", "#c8b49a", [0.16, 4.2], { size: [0.5, 1.4], nails: 0.6, grime: 1.0 }),
    rail: painted("timber-hold", "#9a7a5a", [0, 40], { size: [0.7, 2.2], grime: 0.8 }),
    hold: { type: "plain", color: "#1a1410", roughness: 1 },
    post: painted("timber-hold", "#7a6a5a", [0, 40], { size: [0.7, 2.2] }),
    sail: { type: "image", map: "/stage/textures/sail-canvas.jpg", tint: "#fff6e8", roughness: 0.9, double: true },
    furl: { type: "cloth", color: "#d8ccb0", amp: 0, freq: 0.7 },
    net: { type: "card", map: "/stage/textures/fishing-net.webp", tint: "#c8b8a0" },
    sailTorn: { type: "cloth", color: "#dcceb0", amp: 0.5, freq: 1.1, tatters: [9, 0.45] },
    rope: { type: "plain", color: "#5a4632", roughness: 1 },
    lamp: { type: "plain", color: "#000000", roughness: 1, emissive: "#ff8a30", emissiveIntensity: 0.5 },
    // The cage: black iron, acid-eaten stubs and their green-grey residue, scorch on the hold's boards.
    slag: { type: "metal", color: "#4a4a3e", roughness: 0.7, metalness: 0.5 },
    acid: { type: "plain", color: "#3a4a2a", roughness: 0.3, emissive: "#6a8a2a", emissiveIntensity: 0.25 },
    scorch: { type: "plain", color: "#141210", roughness: 1 },
    cageStraw: { type: "plain", color: "#4a3e2a", roughness: 1 },
    // Warehouse 14: grey weathered boards, a dark plank roof, crates of pale elven oak, silk bales.
    floor: painted("boards-weathered", "#9a8e80", [0.22, 3.6], { size: [0.5, 1.4], grime: 1.4 }),
    boards: painted("boards-weathered", "#a89a88", [0.24, 40], { size: [0.5, 1.4], grime: 1.2 }),
    panel: painted("boards-weathered", "#8a7e70", [0.2, 40], { size: [0.5, 1.4] }),
    shedRoof: painted("timber-hold", "#6a5a4e", [0.3, 40], { size: [0.7, 2.2] }),
    door: painted("timber-hold", "#9a8470", [0.18, 3], { size: [0.7, 2.2] }),
    crateOak: painted("crate-oak", "#c0aa8c", [0.14, 1.0], { size: [0.5, 1.4], nails: 0.8 }),
    silk: { type: "cloth", color: "#3e5a4e", amp: 0 },
    silkB: { type: "cloth", color: "#6a4a3e", amp: 0 },
    shutter: painted("boat-paint", "#7a8a8a", [0.12, 2], { size: [0.5, 1.4] }),
    lead: { type: "metal", color: "#2a2826", roughness: 0.6, metalness: 0.4 },
    glass: { type: "glass", color: "#203040", opacity: 0.4 },
    glassOut: { type: "glass", color: "#8aa0b0", opacity: 0.3 },
    shaft: { type: "glow", color: "#ffd9a0", opacity: 0.05 },
  }
}

// ── Sets ──
const MARKS = {
  quay: { at: [1.0, 8.0], label: "the quay" },
  gangway: { at: [onShip(GANGWAY_Z)[0], 0.9], label: "the gangway of the Star of Faelendar" },
  deck: { at: onShip(-0.5, 1.2), label: "the deck of the Star of Faelendar" },
  hatch: { at: onShip(HATCH_Z + 2.3, 0.6), label: "the cargo hatch" },
  crane: { at: [17.0, 6.0], label: "the crane" },
  cargo: { at: [12.6, 7.0], label: "the cargo stacks" },
  pier: { at: [JETTY, -1.2], label: "the jetty" },
  warehouse14: { at: [-18.6, 10], label: "Warehouse 14" },
  inside: { at: [-22.6, 10.4], label: "inside Warehouse 14" },
  chainedCrate: { at: [-27.7, 9.1], label: "the chained crate" },
  lockbox: { at: [-24.6, 8.4], label: "the lockbox" },
  arcades: { at: [-6, 18.6], label: "the warehouse arcades" },
  street: { at: [10.5, 21], label: "the street into the city" },
}
const SHOTS = {
  // The painting's view: low on the jetty, looking east along the water, the ship looming right of centre, boats on
  // the water to the left, the warehouses and the far end of the harbour beyond.
  quay: { position: [-31, 2.0, -19.5], target: [22, 6.5, -3], fov: 62, label: "The docks" },
  harbour: { position: [-9.5, 2.4, 12.5], target: [6, 7.5, -12], fov: 58, label: "The harbour" },
  ship: { position: [-2.5, 1.8, 6.5], target: [10, 7.5, -8], fov: 64, label: "The Star of Faelendar" },
  along: { position: [26, 2.2, 10], target: [-6, 1.6, 6], fov: 56, label: "Along the quay" },
  warehouses: { position: [2, 1.8, 2], target: [-14, 4.5, 20], fov: 58, label: "The warehouses" },
  warehouse14: { position: [-11.5, 1.7, 9.5], target: [-21, 1.8, 10], fov: 56, label: "Warehouse 14" },
  inside: { position: [-21.4, 1.65, 13.4], target: [-28.6, 1.0, 8.2], fov: 64, label: "Inside Warehouse 14" },
  deck: { position: [onShip(-18, 0.4)[0], 7.8, onShip(-18, 0.4)[1]], target: [onShip(8)[0], 2.0, onShip(8)[1]], fov: 62, label: "The deck" },
  hatch: { position: [onShip(HATCH_Z)[0] - 0.4, 3.0, onShip(0, -2.6)[1]], target: [onShip(HATCH_Z)[0], -2.6, onShip(0, 0.2)[1]], fov: 58, label: "The cage in the hold" },
}
const SHED_BOX = [SHED.x0, -0.5, SHED.z0, SHED.x1, SHED.h, SHED.z1]

function crowd(wrecked: boolean) {
  if (wrecked)
    return {
      library: "realm-of-myr",
      groups: [
        {
          type: "points",
          people: [
            // Dockworkers creeping out of the arcades, and two who swam for it hauling out at the ladder.
            { kind: "porter", at: [-6.5, 18.9], yaw: 200 },
            { kind: "packer", at: [-4.8, 19.2], yaw: 170 },
            { kind: "woman", at: [22, 18.8], yaw: 195 },
            { kind: "porter", at: [24.5, 19.0], yaw: 160 },
            { kind: "child", at: [-2.5, 19.4], yaw: 180 },
            { kind: "merchant", at: [29.5, 16.4], yaw: 210 },
            { kind: "packer", at: [-7.2, 1.2], yaw: 20 },
          ],
        },
      ],
    }
  return {
    library: "realm-of-myr",
    groups: [
      { type: "walkers", path: "quayWalk", count: 34, speed: [0.7, 1.1], lateral: [-2.5, 2.5], both: true, mix: { porter: 6, packer: 5, traveler: 2, merchant: 2, woman: 2, child: 1 } },
      {
        type: "points",
        people: [
          { kind: "porter", at: [-24.6, -19.6], yaw: 80 },
          { kind: "merchant", at: [-25.8, -21.2], yaw: 60 },
          { kind: "woman", at: [-26.4, -16.4], yaw: 100 },
          { kind: "packer", at: [-23.2, -14.6], yaw: 150 },
          { kind: "porter", at: [12.4, 5.9], yaw: 200 },
          { kind: "packer", at: [13.6, 2.4], yaw: 240 },
          { kind: "porter", at: [16.0, 5.2], yaw: 170 },
          { kind: "packer", at: [23.6, 4.6], yaw: 120 },
          { kind: "porter", at: [-12.4, 4.4], yaw: 60 },
          { kind: "porter", at: [JETTY + 0.4, -6], yaw: 0 },
          { kind: "packer", at: [JETTY - 0.4, -11], yaw: 180 },
          { kind: "merchant", at: [27.5, 17.2], yaw: 10 },
          { kind: "woman", at: [34.8, 17.4], yaw: -10 },
          { kind: "porter", at: [onShip(-10, 2)[0], onShip(-10, 2)[1]], yaw: 270 },
          { kind: "porter", at: [-3.2, 2.0], yaw: 150 },
          { kind: "merchant", at: [-1.6, 17.4], yaw: 0 },
          { kind: "woman", at: [5.6, 17.6], yaw: 20 },
          { kind: "porter", at: [onShip(6, 1.5)[0], onShip(6, 1.5)[1]], yaw: 90 },
          { kind: "packer", at: [onShip(-1, -3)[0], onShip(-1, -3)[1]], yaw: 300 },
        ],
      },
    ],
  }
}

function docks(wrecked: boolean) {
  const objects = [...harbour(wrecked), ...shed(wrecked), ...quay(wrecked)]
  // Light falling in at the shed's door.
  objects.push({ type: "beam", from: [SHED.x1 + 1.5, 2.6, 10], to: [SHED.x1 - 3.2, 0, 9.6], radius: 1.2, radiusTo: 1.6, segments: 12, material: "shaft", open: true })
  return {
    format: "d20.stage.set",
    version: 1,
    id: wrecked ? "kordavos-docks-wrecked" : "kordavos-docks",
    settingId: "realm-of-myr",
    locationId: "kordavos-docks",
    title: wrecked ? "The Kordavos docks after the drake" : "The Kordavos docks",
    seed: 7310,
    atmosphere: {
      sun: {
        direction: SUN,
        color: "#ffcf8a",
        intensity: 4.6,
        target: [0, 0, 0],
        distance: 300,
        shadow: { left: -55, right: 55, top: 55, bottom: -55, near: 150, far: 480, size: 4096 },
      },
      hemisphere: { sky: "#c0c8d0", ground: "#7a6044", intensity: 0.8 },
      sky: { horizon: "#f6d6a2", mid: "#b4c4cc", zenith: "#5a86b8", gain: 1.05, clouds: 0.9, stars: 0, moon: 0 },
      fog: { density: 0.006, color: "#efcf9e", start: 28 },
      glow: "#ffc070",
      fill: { color: "#fff0dc", intensity: 1.0, distance: 9 },
      lights: [],
      environment: 0.4,
      exposure: 1.0,
      grade: "warm",
      wind: 1.0,
    },
    rooms: [
      {
        box: SHED_BOX,
        ambient: 0.22,
        fill: 1.4,
        exposure: 1.2,
        lights: [
          { at: [-25.1, 1.4, 8.1], color: "#ffbc78", intensity: 5, distance: 4 },
          { at: [-21.4, 2.4, 10], color: "#ffe2b8", intensity: 9, distance: 7 },
          { at: [-27.6, 2.6, 12.4], color: "#ffcf98", intensity: 3, distance: 5 },
        ],
      },
    ],
    camera: { near: 0.2, far: 1200, min: [-60, 0.4, -40], max: [60, 34, 26], maxDistance: 55 },
    materials: materials(),
    objects,
    // Across the harbour to the north, and down its far end to the east.
    backdrops: [
      { map: "/stage/textures/docks-harbour.webp", arc: 110, yaw: 8, radius: 320, bottom: -7, top: 39.6, gain: 0.62, haze: 0.4 },
      { map: "/stage/textures/docks-harbour.webp", arc: 80, yaw: -78, radius: 300, bottom: -6, top: 28, gain: 0.6, haze: 0.5 },
    ],
    crowd: crowd(wrecked),
    paths: {
      quayWalk: [
        [-17, 16.5],
        [-12, 13],
        [-2, 11.8],
        [16, 12.2],
        [40, 12.8],
        [70, 13],
      ],
    },
    marks: MARKS,
    shots: SHOTS,
    life: { birds: { count: 40, center: [10, -25], spread: [80, 40], radius: [6, 24], height: [8, 34] } },
  }
}
write(`${SETS}/kordavos-docks.json`, docks(false))
write(`${SETS}/kordavos-docks-wrecked.json`, docks(true))

// ── Cast and stagings ──
const art = (name: string) => ({ front: `${ART}/${name}-front.webp`, back: `${ART}/${name}-back.webp`, portrait: `${ART}/${name}-portrait.jpg` })
const member = (id: string, name: string, role: string, height: number, file: string, at: V2, facing: string | V2 | number) => ({ id, name, role, height, art: art(file), at, facing })
const party = (spots: [string, V2][], facing: V2) => spots.map(([id, at]) => ({ ...festival.cast.find((c: Obj) => c.id === id), at, facing }))
const shotOn = (subject: string, distance: number, angle: number, height: number, lookHeight: number, label: string, fov = 44) => ({ subject, distance, angle, height, lookHeight, fov, label })
const partyShot = (ids: string[], offset: V3, label = "Party") => ({ subjects: ids, offset, target: [0, 1.1, 0], relative: "world", fov: 54, label })
function staging(id: string, set: string, cast: Obj[], shots: Obj, shot: string, extra: Obj = {}) {
  write(`${STAGINGS}/${id}.json`, { format: "d20.stage.staging", version: 1, id: `march-of-davos/${id}`, set: `realm-of-myr/${set}`, cast, shots, shot, ...extra })
}
const IDS = ["branka-stoneveil", "cassia-verane", "yeva-softstep", "milos-radan"]
const at = (spots: V2[]): [string, V2][] => IDS.map((id, i) => [id, spots[i]])
const finn = (p: V2, f: string | V2) => member("loric-windrider", "A grizzled dockworker", "Dock foreman", 1.8, "loric-windrider", p, f)
const petra = (p: V2, f: string | V2, name = "A dock hand with a pipe") => member("petra-velan", name, "Dock hand", 1.68, "petra-velan", p, f)
const astrid = (p: V2, f: string | V2, name: string, file = "astrid-blackthorn") => member("astrid-blackthorn", name, "Noble ranger", 1.78, file, p, f)

// Arrival at the Docks: the party comes along the quay toward the ship; Finn has set down a crate by the cargo stacks and
// eyes them, his crew with him.
const ARRIVAL = at([
  [-0.6, 9.4],
  [0.4, 9.9],
  [1.4, 9.5],
  [-1.6, 9.9],
])
staging(
  "arrival-at-the-docks",
  "kordavos-docks",
  [
    ...party(ARRIVAL, [3.6, 5.6]),
    finn([3.6, 5.6], [0.4, 9.6]),
    member("tor-marros", "A huge tattooed dockworker", "Dockworker", 2.0, "tor-marros", [5.3, 5.2], [0.4, 9.6]),
    petra([2.2, 5.0], [0.4, 9.6]),
  ],
  {
    finn: shotOn("loric-windrider", 2.4, 18, 1.7, 1.62, "Finn"),
    tor: shotOn("tor-marros", 2.8, -15, 1.85, 1.78, "Tor"),
    petra: shotOn("petra-velan", 2.2, 22, 1.6, 1.52, "Petra"),
    crew: { subjects: ["loric-windrider", "tor-marros", "petra-velan"], offset: [-2.6, 1.75, 4.2], target: [0, 1.2, -0.6], relative: "world", fov: 52, label: "The dockworkers" },
    party: partyShot(IDS, [2.8, 1.75, -3.6]),
  },
  "quay"
)

// Mystery Cargo: Alaric and his three blades at Warehouse 14's open doors; the party comes down the quay from the east.
const AT_CARGO = at([
  [-12.8, 9.4],
  [-12.4, 10.6],
  [-11.6, 9.8],
  [-11.4, 11.2],
])
const thug = (id: string, file: string, p: V2) => member(id, "A hired blade", "Mercenary", 1.82, file, p, [-12.2, 10.2])
staging(
  "mystery-cargo",
  "kordavos-docks",
  [
    ...party(AT_CARGO, [-18.6, 10]),
    member("scarface-alaric", "A scarred man", "Rogue", 1.86, "scarface-alaric", [-18.3, 10.0], [-12.2, 10.2]),
    thug("warehouse-thug", "warehouse-thug", [-18.9, 8.4]),
    thug("thug-b", "thug-b", [-17.4, 11.5]),
    thug("thug-c", "thug-c", [-19.4, 12.0]),
  ],
  {
    alaric: shotOn("scarface-alaric", 2.5, 20, 1.72, 1.66, "Alaric"),
    blades: { subjects: ["scarface-alaric", "warehouse-thug", "thug-b", "thug-c"], offset: [4.6, 1.8, 1.0], target: [0, 1.2, 0], relative: "world", fov: 54, label: "The hired blades" },
    party: partyShot(IDS, [-3.6, 1.8, 2.2]),
  },
  "warehouse14"
)

// The Beast Escapes: the drake has burst from the hold and come down onto the quay by the gangway; Lady Astrid, not yet
// named, stands at the gangway's end with her blade drawn; the party has run out from the warehouse.
const BEAST = at([
  [-4.6, 8.4],
  [-3.4, 9.2],
  [-2.6, 7.9],
  [-5.6, 9.4],
])
staging(
  "the-beast-escapes",
  "kordavos-docks-wrecked",
  [...party(BEAST, [6.8, 3.6]), member("forest-drake", "The forest drake", "Beast", 3.8, "forest-drake", [6.8, 3.6], [-3.6, 8.6]), astrid([4.7, 1.3], [6.8, 3.6], "A woman with a curved blade")],
  {
    drake: shotOn("forest-drake", 6.0, 18, 1.6, 2.0, "The drake", 52),
    astrid: shotOn("astrid-blackthorn", 2.4, 30, 1.7, 1.62, "The woman with the blade"),
    standoff: { position: [-2.2, 1.65, 10.2], target: [6.4, 2.0, 2.8], fov: 56, label: "The standoff" },
    party: partyShot(IDS, [5.2, 1.8, -2.4]),
  },
  "standoff"
)

// The Aftermath: the dust settling on the wrecked quay. Astrid comes to the party by the gangway; Petra calls from the
// ship's deck by the burst hatch, over the cage below.
const AFTER = at([
  [-0.9, 4.4],
  [0.2, 5.0],
  [1.2, 4.6],
  [-1.8, 5.2],
])
staging(
  "the-aftermath",
  "kordavos-docks-wrecked",
  [...party(AFTER, [1.5, 2.6]), astrid([1.5, 2.6], [0.1, 4.8], "Lady Astrid Blackthorn"), petra(onShip(HATCH_Z + 2.2, 2.2), [1.5, 2.6], "Petra")],
  {
    astrid: shotOn("astrid-blackthorn", 2.2, 22, 1.7, 1.64, "Astrid"),
    petra: shotOn("petra-velan", 2.6, 30, 1.8, 1.55, "Petra"),
    party: partyShot(IDS, [2.8, 1.75, -2.6]),
  },
  "astrid"
)

// An Invitation: Astrid offers the party the sealed invitation on the quay, the damaged ship behind her.
staging(
  "an-invitation",
  "kordavos-docks-wrecked",
  [...party(AFTER, [1.5, 2.6]), astrid([1.5, 2.6], [0.1, 4.8], "Lady Astrid Blackthorn", "astrid-letter")],
  {
    astrid: shotOn("astrid-blackthorn", 2.0, 18, 1.7, 1.62, "Astrid"),
    invitation: shotOn("astrid-blackthorn", 1.4, 35, 1.45, 1.25, "The invitation", 40),
    party: partyShot(IDS, [2.8, 1.75, -2.6]),
  },
  "astrid"
)
