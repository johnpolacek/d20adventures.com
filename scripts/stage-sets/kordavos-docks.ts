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
// The quay's edge runs along x at z = 0, the harbour lies north (z < 0) with its water 1.5 m down, and the quay runs
// south 22 m to a row of stone warehouses facing the water. The Star of Faelendar lies along the quay, bow east, her main
// deck level with the paving. Warehouse 14 is a timber shed at the west end, its doors open east onto the quay, wedged
// between a tall warehouse and the harbour wall.
const WATER = -2.4
const BACK = 22
const SHIP = { x: 4, z: -5.6, length: 30, beam: 8 }
// The ship's frame: her local z runs along world x (bow east), local x along world -z.
const onShip = (lz: number, lx = 0): V2 => [r2(SHIP.x + lz), r2(SHIP.z - lx)]
const GANGWAY_Z = -2.2
const BOLLARDS = [-38, -30, -22, -10.5, -6, 9.5, 13.5, 17.5, 25.5, 33.5, 41.5]
const HATCH_Z = 3.2
const SHED = { x0: -30, x1: -20.5, z0: 5, z1: 15, h: 4.2 }
// Golden late sun from the west-north-west, low over the water, behind the ship as in the painting.
const SUN: V3 = [-0.62, 0.4, -0.67]

function harbour(wrecked: boolean): Obj[] {
  const o: Obj[] = [
    // The water, the quay's paving and its stone face down to the water, with a coping along the edge.
    { type: "box", at: [0, WATER - 0.1, -170], size: [500, 0.1, 340], material: "water" },
    { type: "box", at: [0, -0.3, 30], size: [260, 0.3, 60], material: "paving" },
    { type: "box", at: [0, WATER - 2, -0.35], size: [260, 2 - WATER, 0.7], material: "quayWall" },
    { type: "box", at: [0, -0.02, 0.25], size: [260, 0.08, 0.5], material: "stoneTrim" },
    // A stone pier west of the ship, and a timber jetty beyond it with skiffs.
    { type: "pier", at: [-15, 0, 0], yaw: 180, length: 16, width: 2.4, depth: 4, rickety: 0.15, materials: { plank: "deck", post: "post" } },
    { type: "skiff", at: [-17, WATER + 0.55, -6], yaw: 172 },
    { type: "skiff", at: [-12.8, WATER + 0.55, -9.5], yaw: 8 },
    { type: "skiff", at: [-17.2, WATER + 0.55, -12.5], yaw: 186, length: 5.2 },
    { type: "skiff", at: [24, WATER + 0.55, -2.2], yaw: 95 },
  ]
  // Bollards along the edge, clear of the jetty's root and the gangway; iron rings and ladders down the quay's face.
  for (const x of BOLLARDS) o.push({ type: "bollard", at: [x, 0.75] })
  for (let x = -36; x <= 48; x += 8) o.push({ type: "torus", at: [x, -0.7, -0.02], radius: 0.13, tube: 0.025, material: "iron" })
  for (const x of [-3, 21]) {
    for (const s of [-0.25, 0.25]) o.push({ type: "box", at: [x + s, WATER - 0.4, -0.06], size: [0.05, -WATER + 0.4, 0.05], material: "iron" })
    for (let y = WATER; y < 0; y += 0.3) o.push({ type: "box", at: [x, y, -0.06], size: [0.5, 0.03, 0.04], material: "iron" })
  }
  // The Star of Faelendar at her berth, a gangway to her rail, her lines to the bollards.
  o.push({
    type: "galleon",
    id: "star-of-faelendar",
    at: [SHIP.x, 0, SHIP.z],
    yaw: 90,
    length: SHIP.length,
    beam: SHIP.beam,
    sails: wrecked ? "torn" : "set",
    gangway: [-1, GANGWAY_Z],
    hatch: { at: HATCH_Z, size: 2.6, state: wrecked ? "burst" : "shut" },
  })
  const g = onShip(GANGWAY_Z)
  o.push(
    { type: "box", at: [g[0], 0.02, -0.9], size: [1.3, 0.06, 2.0], material: "deck" },
    ...[-0.62, 0.62].map((dx) => ({ type: "box", at: [g[0] + dx, 0.0, -0.9], size: [0.08, 0.12, 2.0], material: "rail" })),
    ...[-0.4, -0.9, -1.4].map((zz) => ({ type: "box", at: [g[0], 0.05, zz], size: [1.2, 0.03, 0.05], material: "rail" })),
    ...[-0.62, 0.62].map((dx) => ({ type: "rope", from: [g[0] + dx, 1.0, 0.1], to: [g[0] + dx, 1.05, -1.95], sag: 0.15, radius: 0.025 }))
  )
  for (const [lz, bx] of [
    [-13, -10.5],
    [-9, -6],
    [10, 13.5],
    [13.5, 17.5],
  ]) {
    const [sx, sz] = onShip(lz, -SHIP.beam / 2 + 0.2)
    o.push({ type: "rope", from: [sx, 1.0, sz], to: [bx, 0.6, 0.75], sag: 0.45, radius: 0.035 })
  }
  // The beast's cage in the hold under the hatch: whole, or eaten through by acid.
  const [cx, cz] = onShip(HATCH_Z)
  o.push({ type: "cage", id: "cage", at: [cx, -2.1 - 0.05, cz], yaw: 90, width: 2.2, depth: 2.2, height: 1.9, melted: wrecked ? 0.6 : 0 })
  // A second ship east along the quay, sails furled, and ships across the harbour.
  o.push(
    { type: "ship", at: [44, WATER + 1.0, -7.5], yaw: 90, length: 24, beam: 6.5, masts: 2, height: 18, sails: "furled" },
    { type: "ship", at: [-48, WATER + 1.0, -9], yaw: -88, length: 20, beam: 6, masts: 2, height: 16, sails: "furled" },
    { type: "ship", at: [-30, WATER + 1.0, -70], yaw: 80, length: 22, beam: 6, masts: 3, height: 18, sails: "furled" },
    { type: "ship", at: [18, WATER + 1.0, -95], yaw: -100, length: 26, beam: 7, masts: 3, height: 20, sails: "set" },
    { type: "ship", at: [62, WATER + 1.0, -60], yaw: 110, length: 18, beam: 5.5, masts: 2, height: 15, sails: "furled" },
    { type: "skiff", at: [-4, WATER + 0.55, -40], yaw: 40 },
    { type: "skiff", at: [30, WATER + 0.55, -30], yaw: -70, length: 5 }
  )
  // The treadwheel crane east of the ship, its net of crates swung out over her deck.
  o.push({ type: "crane", at: [15.5, 3.2], yaw: 180, reach: 7.5, height: 9.5, drop: wrecked ? 6.5 : 4.2, load: !wrecked })
  // Warehouses along the back of the quay, facing the water, with a gap for a street up into the city.
  for (const [x, w, h, bays] of [
    [-42, 16, 13, 4],
    [-24, 14, 15, 3],
    [-6, 18, 12, 4],
    [24, 16, 14, 4],
    [42, 14, 12, 3],
  ] as [number, number, number, number][])
    o.push({ type: "warehouse", at: [x, BACK + 5], yaw: 180, w, d: 10, h, bays, arch: 4.4 })
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

// The quay's working clutter: cargo by the gangway, carts, stalls under awnings along the warehouse fronts, lamps.
function quay(wrecked: boolean): Obj[] {
  const o: Obj[] = []
  // Cargo waiting by the ship: crate stacks, barrels, sacks, the dockworkers' clutter round the gangway.
  const cargo: [number, number, number, boolean][] = [
    [6.4, 3.4, 0.9, true],
    [7.4, 3.6, 0.8, false],
    [7.0, 4.6, 0.85, true],
    [10.5, 3.2, 0.9, false],
    [11.3, 3.9, 0.8, true],
    [-3.8, 3.0, 0.8, false],
    [-4.6, 3.8, 0.9, true],
  ]
  if (!wrecked) for (const [x, zz, s, stack] of cargo) o.push({ type: "crate", at: [x, zz], yaw: (x * 41) % 20, size: s, stack, solid: true })
  else {
    // Smashed cargo: crates staved in and their planks flung across the paving, barrels rolled loose.
    for (const [x, zz, s] of [
      [10.9, 3.6, 0.8],
      [11.8, 4.2, 0.7],
    ])
      o.push({ type: "crate", at: [x, zz], yaw: (x * 67) % 50, size: s, solid: true })
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
    ])
      for (let j = 0; j < 3; j++, k++)
        o.push({ type: "box", at: [r2(x + ((k * 0.37) % 0.9)), 0.02, r2(zz + ((k * 0.53) % 0.8))], yaw: (k * 53) % 180, size: [0.12, 0.03, 0.6 + ((k * 0.17) % 0.5)], material: "crate" })
    for (const [x, zz] of [
      [-1.2, 5.2],
      [12.6, 6.4],
    ])
      o.push({ type: "cylinder", at: [x, 0.36, zz], radius: 0.36, height: 0.95, roll: 90, material: "barrel" })
    o.push({ type: "box", at: [14.5, 0, 7.6], yaw: 25, size: [1.3, 0.08, 2.4], pitch: 0, roll: 70, material: "planks" })
  }
  for (const [x, zz] of [
    [9.6, 4.6],
    [12.4, 2.9],
    [-5.6, 2.7],
  ])
    o.push({ type: "barrel", at: [x, zz], r: 0.38, h: 1.0, solid: true })
  for (const [x, zz] of [
    [8.6, 5.4],
    [9.1, 5.7],
    [-2.8, 3.4],
  ])
    o.push({ type: "sack", at: [x, zz], size: 0.6 })
  o.push({ type: "cart", at: [-13.5, 16.8], yaw: 80 }, { type: "cart", at: [19.5, 16.6], yaw: -100 })
  // Stalls under canvas along the warehouse arcades, as in the painting.
  for (const [x, cloth, goods] of [
    [-30.5, "tentCream", "sacks"],
    [-17.5, "tentOchre", "baskets"],
    [-1.5, "tentRust", "pots"],
    [-9.5, "tentCream", "cloth"],
    [30, "tentOchre", "sacks"],
  ] as [number, string, string][])
    o.push({ type: "stall", at: [x, BACK - 1.9], yaw: 180, w: 5, d: 3.2, cloth, goods, frontHeight: 2.6, backRise: 0.7, back: false })
  // Lamp posts along the quay.
  for (const x of [-12, 0.5, 13, 28]) o.push({ type: "lantern", at: [x, 14.5], height: 3.2, post: true })
  return o
}

// ── Materials ──
function materials(): Obj {
  return {
    ...square.materials,
    ...Object.fromEntries(["water", "mast", "window", "roofRed"].map((n) => [n, riverfront.materials[n]])),
    roof: riverfront.materials.roofRed,
    // Sun-warmed paving and honey stone, the painting's palette.
    paving: { type: "masonry", a: "#9a8466", b: "#ab9474", c: "#887258", mortar: "#4a3c2c", block: [0.7, 0.5], joint: 0.025, relief: 0.06, variance: 0.5, grime: 1.0, ground: true, stones: 0.45 },
    stone: { type: "masonry", a: "#b89a72", b: "#c8aa80", c: "#a4885e", mortar: "#5a4834", block: [0.9, 0.42], joint: 0.02, relief: 0.05, variance: 0.4, grime: 1.2 },
    stoneTrim: { type: "rock", a: "#a88e6a", b: "#c4aa84", moss: "#6a5a44", mossLight: "#8a7658", lichen: "#d0bc98", mossAmount: 0.15, lichenAmount: 0.1, relief: 0.4, scale: 0.8 },
    quayWall: { type: "masonry", a: "#5a5044", b: "#6a5e4e", c: "#4a4238", mortar: "#2a241e", block: [0.9, 0.45], joint: 0.02, relief: 0.06, variance: 0.4, grime: 2.2 },
    water: { type: "water", color: "#2a5058", reflect: 5, ripple: 0.7, flow: [1, 0], mirror: 0.5 },
    // The Star of Faelendar: honey-brown elven planking, a green band with gilt, pale sails.
    hull: painted("timber-hold", "#d8b48a", [0.24, 40], { size: [0.7, 2.2], grime: 1.0, relief: 0.06 }),
    wale: painted("hull-tar", "#6a5a50", [0, 40], { size: [0.5, 1.4], grime: 1.0 }),
    band: { type: "plain", color: "#2e4a36", roughness: 0.6 },
    gilt: { type: "metal", color: "#c89a48", roughness: 0.38, metalness: 0.85 },
    trim: riverfront.materials.trim,
    deck: painted("boards-weathered", "#c8b49a", [0.16, 4.2], { size: [0.5, 1.4], nails: 0.6, grime: 1.0 }),
    rail: painted("timber-hold", "#9a7a5a", [0, 40], { size: [0.7, 2.2], grime: 0.8 }),
    hold: { type: "plain", color: "#1a1410", roughness: 1 },
    post: painted("timber-hold", "#7a6a5a", [0, 40], { size: [0.7, 2.2] }),
    sail: { type: "cloth", color: "#e8dcc0", amp: 0.25, freq: 0.7 },
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
    silk: { type: "cloth", color: "#5a7a6a", amp: 0 },
    silkB: { type: "cloth", color: "#8a5a6a", amp: 0 },
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
  hatch: { at: onShip(HATCH_Z, -2.3), label: "the cargo hatch" },
  crane: { at: [13.6, 5.6], label: "the crane" },
  cargo: { at: [8.4, 6.8], label: "the cargo stacks" },
  pier: { at: [-15, -1.2], label: "the jetty" },
  warehouse14: { at: [-18.6, 10], label: "Warehouse 14" },
  inside: { at: [-22.6, 10.4], label: "inside Warehouse 14" },
  chainedCrate: { at: [-27.7, 9.1], label: "the chained crate" },
  lockbox: { at: [-24.6, 8.4], label: "the lockbox" },
  arcades: { at: [-6, 18.6], label: "the warehouse arcades" },
  street: { at: [10.5, 21], label: "the street into the city" },
}
const SHOTS = {
  harbour: { position: [-9.5, 2.4, 12.5], target: [6, 6.5, -12], fov: 58, label: "The harbour" },
  ship: { position: [-2.5, 1.8, 6.5], target: [8, 5.5, -8], fov: 62, label: "The Star of Faelendar" },
  quay: { position: [20, 2.2, 10], target: [-6, 1.6, 6], fov: 56, label: "The quay" },
  warehouses: { position: [2, 1.8, 2], target: [-14, 4.5, 20], fov: 58, label: "The warehouses" },
  warehouse14: { position: [-11.5, 1.7, 9.5], target: [-21, 1.8, 10], fov: 56, label: "Warehouse 14" },
  inside: { position: [-21.4, 1.65, 13.4], target: [-28.6, 1.0, 8.2], fov: 64, label: "Inside Warehouse 14" },
  deck: { position: [onShip(-9.4, 0.4)[0], 4.6, onShip(-9.4, 0.4)[1]], target: [onShip(8)[0], 2.2, onShip(8)[1]], fov: 62, label: "The deck" },
  hatch: { position: [onShip(HATCH_Z)[0] - 0.4, 3.0, onShip(0, -2.6)[1]], target: [onShip(HATCH_Z)[0], -2.6, onShip(0, 0.2)[1]], fov: 58, label: "The cage in the hold" },
}
const QUAY_BOX = [-60, -0.6, -1, 60, 60, 60]
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
      { type: "walkers", path: "quayWalk", count: 18, speed: [0.7, 1.1], lateral: [-2.5, 2.5], both: true, mix: { porter: 4, packer: 4, traveler: 2, merchant: 2, woman: 2 } },
      {
        type: "points",
        people: [
          { kind: "porter", at: [10.1, 5.6], yaw: 200 },
          { kind: "packer", at: [12.0, 4.8], yaw: 240 },
          { kind: "porter", at: [-3.2, 2.0], yaw: 150 },
          { kind: "merchant", at: [-1.6, 17.4], yaw: 0 },
          { kind: "woman", at: [5.6, 17.6], yaw: 20 },
          { kind: "packer", at: [-16.2, -6.5], yaw: 180 },
          { kind: "porter", at: [onShip(6, 1.5)[0], onShip(6, 1.5)[1]], yaw: 90 },
          { kind: "packer", at: [onShip(-4, -1.2)[0], onShip(-4, -1.2)[1]], yaw: 300 },
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
        color: "#ffd8a0",
        intensity: 4.2,
        target: [0, 0, 0],
        distance: 300,
        shadow: { left: -55, right: 55, top: 55, bottom: -55, near: 150, far: 480, size: 4096 },
      },
      hemisphere: { sky: "#b8c8d8", ground: "#6a5a44", intensity: 0.75 },
      sky: { horizon: "#f2d8b0", mid: "#a8c0d4", zenith: "#5a86b8", gain: 1.0, clouds: 0.9, stars: 0, moon: 0 },
      fog: { density: 0.0035, color: "#e8d2b0", start: 40 },
      glow: "#ffcf8a",
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
    camera: { near: 0.2, far: 1200, min: [-55, 0.4, -24], max: [55, 30, 26], maxDistance: 40 },
    materials: materials(),
    objects,
    backdrops: [{ map: "/stage/textures/docks-harbour.webp", arc: 110, yaw: 8, radius: 320, bottom: -7, top: 39.6, gain: 0.62, haze: 0.35 }],
    crowd: crowd(wrecked),
    paths: {
      quayWalk: [
        [-17, 16.5],
        [-12, 13],
        [-2, 11.8],
        [16, 12.2],
        [40, 12.8],
      ],
    },
    marks: MARKS,
    shots: SHOTS,
    life: { birds: { count: 22, center: [4, -30], spread: [60, 40], radius: [6, 22], height: [10, 30] } },
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
  "ship"
)

// Mystery Cargo: Alaric and his three blades at Warehouse 14's open doors; the party comes down the quay from the east.
const CARGO = at([
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
    ...party(CARGO, [-18.6, 10]),
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
  [...party(BEAST, [4.4, 3.8]), member("forest-drake", "The forest drake", "Beast", 3.8, "forest-drake", [5.0, 3.6], [-3.6, 8.6]), astrid([1.6, 1.4], [5.0, 3.6], "A woman with a curved blade")],
  {
    drake: shotOn("forest-drake", 6.0, 18, 1.6, 2.0, "The drake", 52),
    astrid: shotOn("astrid-blackthorn", 2.4, 30, 1.7, 1.62, "The woman with the blade"),
    standoff: { position: [-3.2, 1.65, 9.8], target: [4.8, 1.9, 3.2], fov: 56, label: "The standoff" },
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
  [...party(AFTER, [1.5, 2.6]), astrid([1.5, 2.6], [0.1, 4.8], "Lady Astrid Blackthorn"), petra(onShip(HATCH_Z + 2.2, -1.9), [1.5, 2.6], "Petra")],
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
