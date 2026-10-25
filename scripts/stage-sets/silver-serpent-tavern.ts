// Writes March of Davos's Silver Serpent Tavern (wiki/plans/march-of-davos-sets.md): a dockside drinking hall of tarred
// timber, its far end a great arch open on the foggy quay, and the staging of the tavern's encounter.
//
//   pnpm exec tsx scripts/stage-sets/silver-serpent-tavern.ts && pnpm stage:check
//
// The JSON it writes is what the app loads. Edit this file and rerun rather than editing the JSON by hand.

import { readFileSync, writeFileSync } from "node:fs"

type V2 = [number, number]
type V3 = [number, number, number]
type Obj = Record<string, unknown>
const SETS = "packages/stage/src/sets/realm-of-myr"
const STAGINGS = "packages/stage/src/stagings/march-of-davos"
const ART = "/stage/fixtures/march-of-davos"
const inn = JSON.parse(readFileSync(`${SETS}/dragonbone-inn.json`, "utf8"))
const riverfront = JSON.parse(readFileSync(`${SETS}/kordavos-riverfront.json`, "utf8"))
const festival = JSON.parse(readFileSync(`${STAGINGS}/the-harvest-festival.json`, "utf8"))
const fromInn = (names: string[]) => Object.fromEntries(names.map((n) => [n, inn.materials[n]]))
const fromRiver = (names: string[]) => Object.fromEntries(names.map((n) => [n, riverfront.materials[n]]))
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
  grime: 1.2,
  ...extra,
})
const image = (map: string, extra: Obj = {}) => ({ type: "image", map: `/stage/textures/${map}.jpg`, ...extra })

// ── The hall ──
// A long hall running north from the street door (z = 6) to a great arch open on the quay (z = -13), x from -6 to 6, under
// a boarded ceiling at 4.8 m on heavy beams and posts. The bar runs down the east side; two rows of long tables fill the rest.
const W = 6
const N = -13
const S = 6
const T = 0.3
const H = 4.8
const ARCH = { w: 4.6, h: 4.2 }
// Hazy daylight off the water, low in the north, through the arch.
const SUN: V3 = [-0.12, 0.32, -0.94]
const BAR_X = 4.0
const LEFT_X = -3.3
const MID_X = 0.6
// Posts under the long beams stand between the tables, clear of the aisle.
const POST_X = [-2.75, 2.4]
const POST_Z = [-7.6, -4.0, -0.4]

// A wall from `a` to `c`, side a facing left of that direction (as in dragonbone-inn.ts).
function wall(a: V2, c: V2, params: Obj, openings: (Obj & { at: V2 })[] = []) {
  const len = Math.hypot(c[0] - a[0], c[1] - a[1])
  const ux = (c[0] - a[0]) / len
  const uz = (c[1] - a[1]) / len
  const mid: V2 = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2]
  return {
    type: "wall",
    at: [r2(mid[0]), r2(mid[1])],
    yaw: r2((Math.atan2(-uz, ux) * 180) / Math.PI),
    length: r2(len),
    ...params,
    openings: openings.map((o) => ({ ...o, at: r2((o.at[0] - mid[0]) * ux + (o.at[1] - mid[1]) * uz) })),
  }
}
const planks = { finish: "boards", wainscot: 1.1, studs: 1.6, rail: 2.6 }
const outside = { finish: "boards" }

function building(): Obj[] {
  const o: Obj[] = [
    { type: "box", at: [0, -0.14, 0], size: [140, 0.1, 140], material: "paving" },
    { type: "box", at: [0, -0.1, (N + S) / 2], size: [2 * W + 0.6, 0.1, S - N + 0.6], material: "floor" },
    wall([W + T / 2, N], [W + T / 2, S], { height: H + 1.2, thickness: T, a: planks, b: outside }, [{ at: [W + T / 2, 2.6], width: 0.9, height: 1.1, sill: 1.4, kind: "window", panes: [2, 3] }]),
    wall([-W - T / 2, S], [-W - T / 2, N], { height: H + 1.2, thickness: T, a: planks, b: outside }, [
      { at: [-W - T / 2, 3.2], width: 0.9, height: 1.1, sill: 1.4, kind: "window", panes: [2, 3] },
      { at: [-W - T / 2, -9.6], width: 0.9, height: 1.1, sill: 1.4, kind: "window", panes: [2, 3] },
    ]),
    wall([W + T, S + T / 2], [-W - T, S + T / 2], { height: H + 1.2, thickness: T, a: planks, b: outside }, [
      { at: [-1.8, S + T / 2], width: 1.3, height: 2.3, kind: "door", leaf: 0 },
      { at: [1.6, S + T / 2], width: 1.0, height: 1.1, sill: 1.3, kind: "window", panes: [2, 3] },
    ]),
    // The north wall: the great arch onto the quay.
    wall([-W - T, N - T / 2], [W + T, N - T / 2], { height: H + 1.2, thickness: T + 0.2, a: planks, b: outside }, [{ at: [-0.4, N - T / 2], width: ARCH.w, height: ARCH.h, kind: "doorway" }]),
    { type: "archHead", at: [-0.4, 0, N - T / 2], width: ARCH.w, height: ARCH.h, thickness: T + 0.24, moulding: 0.12, materials: { fill: "boards", trim: "timber" } },
    // The ceiling: boards over deep beams on posts down both rows of tables, and a smoke hatch near the arch.
    { type: "box", at: [0, H, (N + S) / 2], size: [2 * W + 0.6, 0.14, S - N + 0.6], material: "ceiling" },
    { type: "box", at: [0, H + 1.2, (N + S) / 2], size: [2 * W + 1.2, 0.3, S - N + 1.2], material: "dark" },
  ]
  for (let zz = N + 1.4; zz < S; zz += 2.3) o.push({ type: "box", at: [0, H - 0.34, r2(zz)], size: [2 * W, 0.34, 0.3], material: "timber" })
  for (const x of POST_X) o.push({ type: "box", at: [x, H - 0.6, (N + S) / 2], size: [0.32, 0.26, S - N], material: "timber" })
  // Posts with knee braces under the long beams.
  for (const x of POST_X)
    for (const zz of POST_Z) {
      o.push({ type: "box", at: [x, 0, zz], size: [0.3, H - 0.6, 0.3], material: "timber", solid: true })
      for (const s of [-1, 1]) o.push({ type: "beam", from: [x, H - 1.5, zz], to: [x, H - 0.7, r2(zz + s * 0.9)], radius: 0.08, segments: 4, material: "timber" })
    }
  // The quay outside the arch: wet paving, a stone edge, bollards, the harbour water, ships in the fog.
  o.push(
    { type: "box", at: [0, -0.12, -22], size: [40, 0.12, 18], material: "paving" },
    { type: "box", at: [0, -0.6, -31.4], size: [60, 0.6, 0.8], material: "stoneEdge" },
    { type: "box", at: [0, -1.2, -60], size: [400, 0.1, 56], material: "water" },
    { type: "cylinder", at: [-4, 0, -30.5], radius: 0.22, height: 0.7, material: "iron" },
    { type: "cylinder", at: [4.5, 0, -30.5], radius: 0.22, height: 0.7, material: "iron" },
    { type: "ship", at: [-6, -1.2, -38], yaw: 82, length: 22, beam: 6, masts: 3, height: 20 },
    { type: "ship", at: [14, -1.2, -46], yaw: 98, length: 18, beam: 5.5, masts: 2, height: 16, sails: "set" },
    { type: "barrel", at: [-3.0, -17], r: 0.35, h: 0.95 },
    { type: "barrel", at: [-2.3, -17.4], r: 0.35, h: 0.95 },
    { type: "crate", at: [3.2, -18.2], yaw: 14, size: 0.9 },
    { type: "crate", at: [3.3, 0.9, -18.2], yaw: -8, size: 0.6 },
    { type: "rope", from: [-4, 0.65, -30.5], to: [-5.5, -0.4, -36], sag: 0.6, radius: 0.04 },
    // Warehouses either side of the quay, beyond the arch.
    { type: "house", at: [-12, -22], yaw: 90, w: 10, d: 8, h: 9 },
    { type: "house", at: [12, -21], yaw: -90, w: 10, d: 8, h: 8 },
    { type: "house", at: [-14, -2], yaw: 90, w: 18, d: 8, h: 8 },
    { type: "house", at: [14, -2], yaw: -90, w: 18, d: 8, h: 8 }
  )
  return o
}

// ── Furnishings ──
const oak = { top: "oak", seat: "oakDark" }
function furnishings(): Obj[] {
  const o: Obj[] = [
    // The bar down the east side, Harron's shelves of bottles and sea-curios behind it.
    { type: "bar", id: "bar", at: [BAR_X, -2.8], yaw: -90, length: 8.4, back: 1.55, gap: "right", kegs: 4, materials: oak },
    // Long tables: a row on the west side under the sea map, a row down the middle, benches and stools.
    ...[-9.4, -5.8, -2.2, 1.4].flatMap((zz) => [
      { type: "table", at: [LEFT_X, zz], yaw: 90, length: 2.6, width: 0.9, setting: 6, candle: true, materials: oak },
      // A bench on the wall side where no one sits on a stool of their own.
      ...(zz < -9 ? [{ type: "bench", at: [LEFT_X - 0.75, zz], yaw: 90, length: 2.4, materials: { seat: "oakDark" } }] : []),
    ]),
    ...[-9.4, -5.8, -2.2].flatMap((zz) => [
      { type: "table", at: [MID_X, zz], yaw: 90, length: 2.4, width: 0.85, setting: 5, candle: true, materials: oak },
      { type: "stool", at: [MID_X + 0.75, zz - 0.6], materials: oak },
      { type: "stool", at: [MID_X + 0.75, zz + 0.5], materials: oak },
    ]),
    // A barrel for a stool in the aisle, as in the painting, and barrels for standing drinkers.
    { type: "barrel", at: [-2.55, 1.6], r: 0.26, h: 0.62 },
    ...[
      [-1.95, -7.6],
      [1.9, 1.3],
    ].flatMap(([x, zz]) => [
      { type: "barrel", at: [x, zz], r: 0.32, h: 1.0 },
      { type: "cylinder", at: [x, 1.0, zz], radius: 0.42, height: 0.05, material: "oak" },
    ]),
    // The carved sea map on the west wall, in a heavy frame.
    { type: "panel", id: "sea-map", at: [-W + 0.14, 1.15, -4.0], yaw: 90, size: [5.6, 3.15], material: "seaMap", depth: 0.08, edge: "timber" },
    { type: "box", at: [-W + 0.16, 1.05, -4.0], size: [0.2, 0.14, 5.9], material: "timber" },
    { type: "box", at: [-W + 0.16, 4.3, -4.0], size: [0.2, 0.14, 5.9], material: "timber" },
    { type: "box", at: [-W + 0.16, 1.05, r2(-4.0 - 2.9)], size: [0.2, 3.39, 0.14], material: "timber" },
    { type: "box", at: [-W + 0.16, 1.05, r2(-4.0 + 2.9)], size: [0.2, 3.39, 0.14], material: "timber" },
    // Glowing amber panels, a ship's wheel, an anchor and nets on the walls.
    { type: "panel", at: [-W + 0.04, 1.9, -9.6 + 1.2], yaw: 90, size: [0.9, 1.2], material: "amberSerpent", depth: 0.06, edge: "timber" },
    { type: "panel", at: [-W + 0.04, 1.8, 1.2], yaw: 90, size: [1.4, 1.05], material: "amberSailors", depth: 0.06, edge: "timber" },
    { type: "panel", at: [-2.75, 2.3, -4.16], yaw: 180, size: [0.75, 1.0], material: "amberSerpent", depth: 0.05, edge: "timber" },
    { type: "panel", at: [2.4, 2.3, -3.84], size: [0.75, 1.0], material: "amberSerpent", depth: 0.05, edge: "timber" },
    { type: "shipWheel", at: [-2.6, 2.6, S - 0.08], yaw: 180, radius: 0.55 },
    { type: "anchor", at: [W - 0.12, 3.6, 4.4], yaw: -90, height: 1.4 },
    { type: "panel", at: [-W + 0.1, 2.3, -11.6], yaw: 90, size: [2.0, 2.3], material: "net" },
    { type: "panel", at: [3.6, 2.2, S - 0.1], yaw: 180, size: [2.2, 2.4], material: "net" },
    // The silver serpent of the sign, over the bar.
    { type: "box", at: [W - 0.12, 3.05, -3.0], size: [0.1, 1.25, 4.4], material: "oakDark" },
    { type: "box", at: [W - 0.1, 3.0, -3.0], size: [0.12, 0.08, 4.5], material: "brass" },
    { type: "box", at: [W - 0.1, 4.28, -3.0], size: [0.12, 0.08, 4.5], material: "brass" },
    { type: "serpent", id: "silver-serpent", at: [W - 0.32, 3.7, -3.0], yaw: -90, length: 3.8, girth: 0.17, humps: 3 },
    // Shelves of sea-curios over the west tables: bottles with ships, a spyglass, shells, a compass.
    { type: "box", at: [-W + 0.18, 2.95, 2.9], size: [0.32, 0.04, 2.0], material: "oakDark" },
    { type: "box", at: [-W + 0.18, 2.95, -10.9], size: [0.32, 0.04, 1.6], material: "oakDark" },
    // The great hanging ring-lamp over the aisle, with its brass globe below, as in the painting.
    { type: "chandelier", at: [-0.5, H - 0.3, -6.6], radius: 0.8, candles: 10, drop: 1.4, materials: { timber: "brass" } },
    { type: "chain", from: [-0.5, H - 1.7, -6.6], to: [-0.5, H - 2.5, -6.6], sag: 0, link: 0.05 },
    { type: "sphere", at: [-0.5, H - 2.85, -6.6], radius: 0.18, material: "brass" },
    { type: "chandelier", at: [-1.0, H - 0.3, 0.2], radius: 0.6, candles: 8, drop: 1.0, materials: { timber: "brass" } },
    // Smoke drifting in the arch's light.
    { type: "mist", at: [-0.4, 0.5, -11.0], width: 7, height: 4.5, layers: 3, spacing: 2.2, materials: { mist: "smoke" } },
  ]
  // Ship's bottles and curios on the shelves.
  for (const [zz, i] of [
    [2.3, 0],
    [2.7, 1],
    [3.15, 2],
    [3.55, 3],
    [-11.4, 4],
    [-10.9, 5],
    [-10.4, 6],
  ] as [number, number][]) {
    if (i % 2 === 0)
      o.push({
        type: "lathe",
        at: [-W + 0.18, 2.97, zz],
        profile: [
          [0, 0],
          [0.07, 0],
          [0.08, 0.12],
          [0.03, 0.2],
          [0.02, 0.28],
          [0, 0.28],
        ],
        segments: 14,
        material: "bottleGreen",
      })
    else o.push({ type: "sphere", at: [-W + 0.18, 2.97, zz], radius: [0.1, 0.06, 0.08], material: i % 3 ? "shell" : "brass" })
  }
  o.push({ type: "cylinder", at: [-W + 0.18, 3.0, 2.0], radius: [0.03, 0.045], height: 0.5, pitch: 90, material: "brass" })
  // Lanterns: a ship's lantern on every post and over the bar, and a few on the walls.
  for (const [x, y, zz] of [
    [-2.75, 2.6, -7.35],
    [-2.75, 2.6, -3.75],
    [-2.75, 2.6, -0.15],
    [2.4, 2.6, -7.35],
    [2.4, 2.6, -0.15],
    [W - 0.25, 2.3, -7.6],
    [W - 0.25, 2.3, 1.4],
    [-W + 0.25, 2.5, -7.0],
    [-W + 0.25, 2.5, -0.6],
    [-0.6, 2.2, S - 0.25],
    [-3.2, 2.2, S - 0.25],
  ] as V3[])
    o.push(...shipLantern(x, y, zz))
  return o
}
function shipLantern(x: number, y: number, zz: number): Obj[] {
  return [
    { type: "cylinder", at: [x, y, zz], radius: 0.075, height: 0.05, material: "brass" },
    { type: "cylinder", at: [x, y + 0.05, zz], radius: 0.06, height: 0.2, material: "lamp" },
    ...[0, 1, 2, 3].map((k) => {
      const a = (k * Math.PI) / 2 + Math.PI / 4
      return {
        type: "beam",
        from: [r2(x + Math.cos(a) * 0.068), y + 0.05, r2(zz + Math.sin(a) * 0.068)],
        to: [r2(x + Math.cos(a) * 0.068), y + 0.25, r2(zz + Math.sin(a) * 0.068)],
        radius: 0.01,
        material: "iron",
      }
    }),
    { type: "cylinder", at: [x, y + 0.25, zz], radius: [0.085, 0.03], height: 0.08, material: "brass" },
    { type: "torus", at: [x, y + 0.36, zz], radius: 0.035, tube: 0.01, material: "iron" },
  ]
}

// ── Materials ──
function materials(): Obj {
  return {
    ...fromInn([
      "barrel",
      "iron",
      "brass",
      "pottery",
      "crate",
      "crateDark",
      "sack",
      "sackB",
      "dark",
      "void",
      "pewter",
      "steel",
      "bottleGreen",
      "bottleBrown",
      "cloth",
      "candle",
      "lead",
      "bread",
      "cheese",
      "roast",
      "roastDark",
      "candleFlame",
    ]),
    ...fromRiver(["paving", "water", "hull", "deck", "trim", "mast", "sail", "rope", "window", "roof", "plaster", "plasterB", "stone", "door", "wood"]),
    // Tarred, smoke-dark timber and boards; a floor of dark, sticky planks.
    floor: painted("floor-worn", "#7e6e60", [0.24, 3.4], { size: [0.6, 1.8], nails: 0.6, grime: 1.8, relief: 0.06, variance: 0.35 }),
    timber: painted("timber-hold", "#6e5c4e", [0, 40], { size: [0.7, 2.2], grime: 1.6, relief: 0.12, variance: 0.25 }),
    ceiling: painted("timber-hold", "#4a3e36", [0.22, 40], { size: [0.7, 2.2], grime: 1.8, relief: 0.1 }),
    boards: painted("cabin-dark", "#9a8270", [0.24, 40], { size: [0.6, 1.8], grime: 1.4, relief: 0.1, variance: 0.4 }),
    panel: painted("cabin-planks", "#7a5e50", [0.16, 40], { size: [0.5, 1.6], grime: 1.2, relief: 0.14, variance: 0.35 }),
    oak: painted("door-oak", "#a88a70", [0.2, 2.4], { size: [0.6, 1.8], grime: 1.4, relief: 0.1 }),
    oakDark: painted("door-oak", "#6e5646", [0, 40], { size: [0.6, 1.8], grime: 1.4, relief: 0.1 }),
    stoneEdge: { type: "masonry", a: "#5a5e60", b: "#686c6c", c: "#4e5254", mortar: "#2e3032", block: [0.9, 0.4], joint: 0.02, relief: 0.1, variance: 0.4, grime: 1.4 },
    silver: { type: "metal", color: "#b8bec4", roughness: 0.32, metalness: 0.95 },
    bone: { type: "plain", color: "#e0d8c4", roughness: 0.5 },
    eyeGlow: { type: "plain", color: "#000000", emissive: "#5ad0ff", emissiveIntensity: 2 },
    shell: { type: "plain", color: "#e8c8b0", roughness: 0.5 },
    seaMap: image("sea-map-carved", { roughness: 0.75, tint: "#e8dccc" }),
    amberSerpent: image("amber-panel-serpent", { glow: 1.6, roughness: 0.6 }),
    amberSailors: image("amber-panel-sailors", { glow: 1.4, roughness: 0.6 }),
    net: { type: "card", map: "/stage/textures/fishing-net.webp", tint: "#c8b8a0" },
    lamp: { type: "plain", color: "#000000", roughness: 1, emissive: "#ff7a20", emissiveIntensity: 0.9 },
    glass: { type: "glass", color: "#b8c8d4", opacity: 0.35 },
    glassOut: { type: "glass", color: "#ffa850", opacity: 0.3, emissive: "#ff8a30", emissiveIntensity: 0.3 },
    smoke: { type: "mist", color: "#c8ccd0", opacity: 0.22 },
    shaft: { type: "glow", color: "#e8eef4", opacity: 0.05 },
  }
}

// ── The set ──
const MARKS = {
  door: { at: [-1.8, 4.9], label: "the street door" },
  bar: { at: [2.9, -2.8], label: "the bar" },
  seaMap: { at: [-1.4, -3.8], label: "the carved sea map" },
  dockworkers: { at: [-2.0, -2.2], label: "the dockworkers' table" },
  middle: { at: [-0.4, -5.8], label: "the middle tables" },
  arch: { at: [-0.4, -12.0], label: "the arch onto the quay" },
  quay: { at: [-0.4, -17.5], label: "the quay" },
  corner: { at: [-1.2, 3.0], label: "inside the door" },
}
const SHOTS = {
  hall: { position: [-0.6, 1.7, 4.6], target: [-0.3, 1.9, -13], fov: 60, label: "The tavern" },
  bar: { position: [-0.4, 1.7, 0.6], target: [5.2, 1.6, -4.6], fov: 56, label: "The bar" },
  map: { position: [1.6, 1.75, -1.6], target: [-6, 2.4, -4.6], fov: 58, label: "The sea map" },
  arch: { position: [1.4, 1.7, -6.0], target: [-0.6, 2.0, -20], fov: 58, label: "The arch" },
  door: { position: [0.4, 1.7, -4.0], target: [-1.8, 1.4, 6.0], fov: 56, label: "The door" },
}
const ROOM_BOX = [-W, -0.5, N, W, H, S]

function tavern() {
  const objects = [...building(), ...furnishings()]
  // The arch's daylight lying along the floor.
  objects.push({ type: "beam", from: [-0.4, 3.2, N - 0.3], to: [-0.2, 0.2, -4.5], radius: 1.6, radiusTo: 2.4, segments: 16, material: "shaft", open: true })
  return {
    format: "d20.stage.set",
    version: 1,
    id: "silver-serpent-tavern",
    settingId: "realm-of-myr",
    locationId: "silver-serpent-tavern",
    title: "The Silver Serpent Tavern",
    seed: 9090,
    atmosphere: {
      sun: {
        direction: SUN,
        color: "#e8eef4",
        intensity: 2.2,
        target: [0, 0, -6],
        distance: 200,
        shadow: { left: -24, right: 24, top: 24, bottom: -24, near: 120, far: 300, size: 4096 },
      },
      hemisphere: { sky: "#c8d4e0", ground: "#5a5048", intensity: 0.8 },
      sky: { horizon: "#e8ecee", mid: "#c4d0dc", zenith: "#8ea4bc", gain: 1.1, clouds: 0.8, stars: 0, moon: 0 },
      fog: { density: 0.014, color: "#c8ced4", start: 12 },
      fill: { color: "#fff0e0", intensity: 1.2, distance: 10 },
      lights: [],
      environment: 0.35,
      exposure: 1.0,
      grade: "neutral",
      wind: 0.3,
    },
    backdrops: [{ map: "/stage/textures/riverfront-city.webp", arc: 100, yaw: 0, radius: 80, bottom: -4, top: 26, gain: 0.55, haze: 0.6 }],
    // Inside, smoky dark between the lanterns: warm pools on the tables and the bar, the amber panels' glow, and the cold
    // grey daylight of the arch.
    rooms: [
      {
        box: ROOM_BOX,
        ambient: 0.1,
        fill: 1.3,
        exposure: 1.15,
        lights: [
          { at: [-0.4, 2.2, -12.4], color: "#d8e4f0", intensity: 7, distance: 6 },
          { at: [-0.5, 2.8, -6.6], color: "#ffb060", intensity: 12, distance: 7 },
          { at: [-1.0, 2.9, 0.2], color: "#ffb060", intensity: 9, distance: 6 },
          { at: [3.0, 2.3, -3.0], color: "#ffa850", intensity: 10, distance: 6 },
          { at: [-4.4, 1.6, -4.0], color: "#ffa040", intensity: 8, distance: 5 },
          { at: [-4.6, 1.5, 1.4], color: "#ff9a40", intensity: 6, distance: 4 },
          { at: [1.4, 1.5, -8.0], color: "#ffa850", intensity: 6, distance: 4.5 },
          { at: [-1.2, 2.5, 4.0], color: "#ffb070", intensity: 14, distance: 7 },
        ],
      },
    ],
    camera: { near: 0.1, far: 400, min: [-5.7, 0.4, N + 0.4], max: [5.7, H - 0.2, S - 0.3], maxDistance: 14 },
    materials: materials(),
    objects,
    crowd: crowd(),
    marks: MARKS,
    shots: SHOTS,
    life: { dust: { count: 300, box: [-5.5, 0.3, -12.5, 5.5, 4.2, 5.5] } },
  }
}
// Sailors, smugglers and dockhands packed round the middle tables, at the bar and in the arch, as in the painting.
function crowd() {
  const people = [
    { kind: "packer", at: [-1.9, -9.6], yaw: 80 },
    { kind: "porter", at: [-1.3, -10.6], yaw: 200 },
    { kind: "traveler", at: [-0.3, -11.2], yaw: 160 },
    { kind: "packer", at: [0.7, -11.7], yaw: 210 },
    { kind: "packer", at: [-2.4, -11.9], yaw: 140 },
    { kind: "merchant", at: [1.7, -10.4], yaw: 250 },
    { kind: "woman", at: [-0.2, -8.6], yaw: 20 },
    { kind: "porter", at: [-0.6, -4.2], yaw: 90 },
    { kind: "traveler", at: [1.9, -6.4], yaw: 260 },
    { kind: "packer", at: [2.6, -8.6], yaw: 90 },
    { kind: "porter", at: [2.7, -0.4], yaw: 80 },
    { kind: "traveler", at: [2.75, -5.2], yaw: 95 },
    { kind: "woman", at: [-1.7, -7.0], yaw: -30 },
    { kind: "packer", at: [-2.6, -14.2], yaw: 60 },
    { kind: "porter", at: [2.6, -15.0], yaw: 220 },
  ]
  return { library: "realm-of-myr", groups: [{ type: "points", people }] }
}
write(`${SETS}/silver-serpent-tavern.json`, tavern())

// ── Cast and staging ──
const art = (name: string) => ({ front: `${ART}/${name}-front.webp`, back: `${ART}/${name}-back.webp`, portrait: `${ART}/${name}-portrait.jpg` })
const member = (id: string, name: string, role: string, height: number, file: string, at: V2, facing: string | V2 | number) => ({ id, name, role, height, art: art(file), at, facing })
// The heroes just inside the street door, looking down the hall.
const PARTY: [string, V2][] = [
  ["branka-stoneveil", [-2.9, 4.3]],
  ["cassia-verane", [-2.0, 4.75]],
  ["yeva-softstep", [-1.0, 4.65]],
  ["milos-radan", [-0.4, 3.9]],
]
const party = (spots: [string, V2][], facing: V2) => spots.map(([id, at]) => ({ ...festival.cast.find((c: Obj) => c.id === id), at, facing }))
const seated = (id: string, name: string, role: string, file: string, at: V2, facing: V2) => member(id, name, role, 1.32, file, at, facing)
const shotOn = (subject: string, distance: number, angle: number, height: number, lookHeight: number, label: string) => ({ subject, distance, angle, height, lookHeight, fov: 44, label })
// The dockworkers' table is the west row's third, by the sea map; Harron works behind the bar.
const DOCK: V2 = [LEFT_X, -2.2]
write(`${STAGINGS}/the-silver-serpent-tavern.json`, {
  format: "d20.stage.staging",
  version: 1,
  id: "march-of-davos/the-silver-serpent-tavern",
  set: "realm-of-myr/silver-serpent-tavern",
  cast: [
    ...party(PARTY, [-0.5, -4.0]),
    member("harron", "The bartender", "Bartender", 1.8, "harron", [4.75, -2.6], [2.0, -2.0]),
    seated("dockworker-boss", "A burly dockworker", "Dockworker", "dockworker-boss", [-2.55, -2.0], [-1.2, 1.0]),
    seated("dockworker-a", "A dockworker", "Dockworker", "dockworker-a", [-2.55, -2.95], DOCK),
    seated("dockworker-b", "A dockworker", "Dockworker", "dockworker-b", [-4.05, -2.5], DOCK),
    seated("patron-sailor", "A river sailor", "Patron", "patron-sailor", [-4.05, -5.6], [LEFT_X, -5.8]),
    seated("patron-hooded", "A hooded stranger", "Patron", "patron-hooded", [-4.05, 1.4], [LEFT_X, 1.4]),
    seated("patron-hooded-b", "A cloaked woman", "Patron", "patron-hooded-b", [-2.55, -9.1], [LEFT_X, -9.4]),
    seated("patron-merchant", "A laughing merchant", "Patron", "patron-merchant", [MID_X + 0.75, -5.2], [MID_X, -5.8]),
    member("smuggler", "A smuggler in a tricorn", "Smuggler", 1.84, "smuggler", [-0.35, -9.0], [MID_X, -9.4]),
  ],
  shots: {
    harron: shotOn("harron", 2.3, 20, 1.68, 1.6, "Harron"),
    dockworkers: { subjects: ["dockworker-boss", "dockworker-a", "dockworker-b"], offset: [2.4, 1.6, 0.9], target: [0, 0.9, 0], relative: "world", fov: 52, label: "The dockworkers" },
    boss: shotOn("dockworker-boss", 2.0, 0, 1.3, 1.15, "The burly dockworker"),
    party: { subjects: PARTY.map(([id]) => id), offset: [0.8, 1.7, -3.4], target: [0, 1.1, 0], relative: "world", fov: 54, label: "Party" },
  },
  shot: "hall",
})
