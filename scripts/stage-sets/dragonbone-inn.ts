// Writes March of Davos's Dragonbone Inn (wiki/plans/dragonbone-inn-stage.md): the inn's common room and backroom in the
// evening and at dawn the next day, and the stagings of the three encounters there.
//
//   pnpm exec tsx scripts/stage-sets/dragonbone-inn.ts && pnpm stage:check
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
const festival = JSON.parse(readFileSync(`${STAGINGS}/the-harvest-festival.json`, "utf8"))
const pick = (names: string[]) => Object.fromEntries(names.map((n) => [n, square.materials[n]]))
const r2 = (n: number) => Math.round(n * 100) / 100
const omit = <T>(all: Record<string, T>, key: string) => Object.fromEntries(Object.entries(all).filter(([k]) => k !== key))
function write(path: string, data: unknown) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
}
// Boards painted from art (scripts/stage-textures.ts). size = [across, along] the grain the painting covers, in metres.
const painted = (map: string, tint: string, plank: [number, number], extra: Obj = {}) => ({
  type: "painted",
  map: `/stage/textures/${map}.jpg`,
  tint,
  plank,
  size: [0.5, 1.4],
  relief: 0.08,
  grime: 1.0,
  ...extra,
})

// ── The building ──
// The common room inside its walls: x from -7 to 7, z from -5 (the bar's wall) to 5 (the street), the ceiling at 3.5.
// The backroom lies behind the bar's wall at the east end, under a lower ceiling.
const H = 3.5
const T = 0.3
const BACK = { x0: 2.8, x1: 7, z0: -8.6, z1: -5.3, h: 2.9 }
const DOOR: V2 = [0.6, 5.15]
const SOUTH_WINDOWS = [-5.0, -2.4, 3.2, 5.6]
const HEARTH: V2 = [-6.1, -0.5]
const CORNER: V2 = [5.4, 3.3]
// The early sun comes in from the south-south-east, 30 degrees up, through the street windows, over the houses across
// the street.
const SUN: V3 = [0.4, 0.5, 0.76]

// A wall from `a` to `c`. Its side a faces left of that direction; openings are placed at points on the wall.
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
const room = { finish: "plaster", wainscot: 1.0, studs: 1.4, rail: 2.45 }
const glazed = (at: V2, extra: Obj = {}) => ({ at, width: 1.1, height: 1.3, sill: 0.95, kind: "window", panes: [2, 4], ...extra })

function building(morning: boolean): Obj[] {
  const objects: Obj[] = [
    // The street outside and the floor inside.
    { type: "box", at: [0, -0.12, 6], size: [90, 0.1, 80], material: "ground" },
    { type: "box", at: [0, -0.1, 0], size: [14.6, 0.1, 10.6], material: "floor" },
    { type: "box", at: [4.9, -0.1, -6.95], size: [4.8, 0.1, 3.6], material: "floor" },
    // The common room's walls: the street wall with the door and four windows, the bar's wall with the kitchen and the
    // backroom doorways, and a window at each end.
    wall([7.3, 5.15], [-7.3, 5.15], { height: H, thickness: T, a: room, b: { finish: "plaster", studs: 1.2 } }, [
      { at: DOOR, width: 1.2, height: 2.2, kind: "door", leaf: morning ? 78 : 0 },
      ...SOUTH_WINDOWS.map((x) => glazed([x, 5.15])),
    ]),
    wall([-7.3, -5.15], [7.3, -5.15], { height: H, thickness: T, a: room, b: { finish: "boards" } }, [
      { at: [-3.95, -5.15], width: 0.95, height: 2.05, kind: "doorway" },
      { at: [4.1, -5.15], width: 1.0, height: 2.05, kind: "doorway" },
    ]),
    wall([7.15, -5.0], [7.15, 5.0], { height: H, thickness: T, a: room }, [glazed([7.15, 3.5], { width: 0.9, height: 1.2, sill: 1.0, panes: [2, 3] })]),
    wall([-7.15, 5.0], [-7.15, -5.0], { height: H, thickness: T, a: room }, [glazed([-7.15, 3.6], { width: 0.9, height: 1.2, sill: 1.0, panes: [2, 3] })]),
    // The backroom's plank walls.
    wall([2.5, -8.75], [7.3, -8.75], { height: BACK.h, thickness: T, a: { finish: "boards" } }),
    wall([7.15, -8.6], [7.15, -5.3], { height: BACK.h, thickness: T, a: { finish: "boards" } }),
    wall([2.65, -5.3], [2.65, -8.6], { height: BACK.h, thickness: T, a: { finish: "boards" } }),
    // Darkness through the kitchen doorway.
    { type: "box", at: [-3.95, 0, -5.9], size: [1.4, 2.4, 1.2], material: "void" },
  ]
  // The ceiling: boards with a stairwell over the top of the stairs, deep cross beams, and a dark shaft above the well.
  const ceiling: [number, number, number, number][] = [
    [-7.3, 5.85, -5.3, 5.3],
    [5.85, 7.3, -1.2, 5.3],
    [7.0, 7.3, -5.3, -1.2],
    [5.85, 7.0, -5.3, -5.0],
  ]
  for (const [x0, x1, z0, z1] of ceiling) objects.push({ type: "box", at: [r2((x0 + x1) / 2), H, r2((z0 + z1) / 2)], size: [r2(x1 - x0), 0.12, r2(z1 - z0)], material: "ceiling" })
  objects.push(
    { type: "box", at: [5.85, H, -3.1], size: [0.1, 1.6, 3.9], material: "void" },
    { type: "box", at: [7.02, H, -3.1], size: [0.1, 1.6, 3.9], material: "void" },
    { type: "box", at: [6.43, H, -1.17], size: [1.2, 1.6, 0.1], material: "void" },
    { type: "box", at: [6.43, H, -5.03], size: [1.2, 1.6, 0.1], material: "void" },
    { type: "box", at: [6.43, H + 1.6, -3.1], size: [1.3, 0.1, 4.0], material: "void" }
  )
  for (const x of [-6.0, -4.3, -2.6, -0.9, 0.8, 2.5, 4.2, 5.85]) {
    const z0 = x > 5.5 ? -1.2 : -5.0
    objects.push({ type: "box", at: [x, H - 0.3, r2((z0 + 5) / 2)], size: [0.28, 0.3, r2(5 - z0)], material: "timber" })
  }
  for (const z of [-3.2, -1.4, 0.4, 2.2, 4.0]) objects.push({ type: "box", at: [-0.05, H - 0.14, z], size: [11.8, 0.14, 0.12], material: "timber" })
  objects.push({ type: "box", at: [4.9, BACK.h, -6.95], size: [4.8, 0.12, 3.6], material: "ceiling" })
  for (const x of [3.6, 4.9, 6.2]) objects.push({ type: "box", at: [x, BACK.h - 0.22, -6.95], size: [0.22, 0.22, 3.3], material: "timber" })
  // Houses across the street and at either end, seen through the windows.
  for (const [x, zz, w, h, yaw] of [
    [-10.5, 19.6, 8.5, 7, 180],
    [-1.5, 20, 8, 6.6, 180],
    [7.5, 19.5, 8.5, 7, 180],
    [16.5, 19.8, 8, 7, 180],
    [-15.5, 1, 8, 9, 90],
    [15.5, 0, 8, 8.5, -90],
  ])
    objects.push({ type: "house", at: [x, zz], yaw, w, d: 6, h })
  return objects
}

// ── The common room's furnishings ──
function furnishings(morning: boolean): Obj[] {
  const oak = { top: "oak", seat: "oakDark" }
  const objects: Obj[] = [
    // The great hearth on the west wall, the inn's dragon skull over its mantel, a fur rug before it.
    { type: "hearth", id: "hearth", at: HEARTH, yaw: 90, width: 3, depth: 0.9, height: H, fire: morning ? "embers" : "blaze", spit: !morning, wood: "right" },
    { type: "dragonSkull", id: "dragonbone", at: [-6.19, 2.5, -0.5], yaw: 90, length: 1.1, jaw: 18 },
    { type: "box", at: [-4.75, 0.005, -0.5], size: [1.3, 0.02, 1.9], material: "rug" },
    // The bar along the back wall, a gap at its west end, Bram's dresser of bottles behind it.
    { type: "bar", id: "bar", at: [-0.4, -3.0], length: 5.8, back: 1.95, gap: "left", kegs: 3, materials: oak },
    // Stairs up to the rooms along the east wall, stores under them.
    { type: "stairs", at: [6.45, 1.4], width: 1.0, rise: H, run: 4.8, rail: "left", materials: { tread: "oak", riser: "timber" } },
    { type: "barrel", at: [6.5, -2.3], r: 0.32, h: 0.9 },
    { type: "barrel", at: [6.45, -1.55], r: 0.3, h: 0.85 },
    { type: "crate", at: [6.45, -0.75], yaw: 6, size: 0.6 },
    { type: "sack", at: [6.4, 0.0], size: 0.55 },
    // Tables. The long one under the west chandelier, two round ones, the corner table and its settles, the dark corner's.
    { type: "table", at: [-2.6, 0.4], length: 2.4, width: 0.85, setting: 8, candle: true, materials: oak },
    { type: "stool", at: [-3.4, 1.15], materials: oak },
    { type: "stool", at: [-2.2, 1.12], materials: oak },
    { type: "stool", at: [-3.2, -0.4], materials: oak },
    { type: "table", at: [0.8, 1.8], kind: "round", radius: 0.55, setting: 5, materials: oak },
    { type: "stool", at: [0.05, 1.45], materials: oak },
    { type: "stool", at: [0.55, 0.95], materials: oak },
    { type: "table", at: [-2.6, 3.4], kind: "round", radius: 0.5, setting: 4, candle: true, materials: oak },
    { type: "stool", at: [-2.6, 4.2], materials: oak },
    { type: "stool", at: [-3.35, 3.9], materials: oak },
    { type: "table", id: "corner", at: CORNER, length: 1.6, width: 0.8, setting: 6, candle: true, materials: oak },
    { type: "bench", at: [5.4, 4.6], yaw: 180, length: 1.7, back: 1.35, materials: oak },
    { type: "bench", at: [6.55, 3.1], yaw: -90, length: 1.5, back: 1.35, materials: oak },
    { type: "table", at: [-5.4, -4.0], length: 1.1, width: 0.7, setting: 2, candle: true, materials: oak },
    // Barrels for standing drinkers.
    ...[
      [-1.2, -1.6],
      [3.4, -1.4],
    ].flatMap(([x, zz]) => [
      { type: "barrel", at: [x, zz], r: 0.32, h: 1.0 },
      { type: "cylinder", at: [x, 1.0, zz], radius: 0.42, height: 0.05, material: "oak" },
    ]),
    // Wheel chandeliers on the beams.
    { type: "chandelier", at: [-2.6, H - 0.3, 0.4], radius: 0.55, candles: 8, drop: 0.75 },
    { type: "chandelier", at: [0.8, H - 0.3, 1.8], radius: 0.5, candles: 7, drop: 0.75 },
  ]
  // The backroom: a sturdy table, mismatched chairs, one lantern, stores along the walls.
  objects.push(
    { type: "table", id: "backroom", at: [5.0, -7.0], length: 1.8, width: 0.9, setting: 2, materials: oak },
    { type: "chair", at: [4.3, -6.3], yaw: 170, materials: { seat: "oakDark" } },
    { type: "chair", at: [5.6, -6.25], yaw: 196, materials: { seat: "oak" } },
    { type: "chair", at: [4.5, -7.75], yaw: 8, materials: { seat: "timber" } },
    { type: "stool", at: [5.7, -7.7], materials: oak },
    { type: "chair", at: [6.25, -7.0], yaw: -100, materials: { seat: "oakDark" } },
    { type: "crate", at: [3.3, -8.1], yaw: 10, size: 0.7 },
    { type: "crate", at: [3.35, 0.7, -8.1], yaw: -6, size: 0.5 },
    { type: "barrel", at: [6.6, -8.15], r: 0.3, h: 0.85 },
    { type: "sack", at: [3.2, -7.2], size: 0.6 },
    { type: "box", at: [6.95, 1.2, -6.4], size: [0.3, 0.04, 1.6], material: "oak" },
    { type: "box", at: [6.95, 1.75, -6.4], size: [0.3, 0.04, 1.6], material: "oak" }
  )
  // Lanterns: on the corner table's wall, over the bar, in the backroom on the table.
  for (const [x, y, zz] of [
    [6.95, 1.75, 4.2],
    [-0.4, 2.3, -3.15],
    [2.2, 2.3, -3.15],
    [5.0, 0.76, -7.0],
  ])
    objects.push(...shipLantern(x, y, zz))
  // On the walls: a round shield by the backroom doorway.
  objects.push(
    { type: "cylinder", at: [3.2, 2.0, -4.97], radius: 0.38, height: 0.05, pitch: 90, material: "shield" },
    { type: "cylinder", at: [3.2, 2.0, -4.93], radius: 0.09, height: 0.05, pitch: 90, material: "iron" },
    // A round shield south of the hearth, a shelf of jugs north of it.
    { type: "cylinder", at: [-6.97, 1.85, 2.6], radius: 0.36, height: 0.05, roll: 90, material: "shield" },
    { type: "cylinder", at: [-6.93, 1.85, 2.6], radius: 0.08, height: 0.05, roll: 90, material: "iron" },
    { type: "box", at: [-6.85, 1.62, -3.6], size: [0.28, 0.04, 1.6], material: "oak" },
    ...[-4.25, -3.95, -3.6, -3.25, -2.95].map((zz, i) => ({
      type: "lathe",
      at: [-6.85, 1.64, zz],
      profile:
        i % 2
          ? [
              [0, 0],
              [0.06, 0],
              [0.09, 0.1],
              [0.07, 0.2],
              [0.035, 0.24],
              [0.04, 0.26],
            ]
          : [
              [0, 0],
              [0.05, 0],
              [0.06, 0.12],
              [0.03, 0.15],
              [0.03, 0.2],
            ],
      segments: 14,
      material: i % 2 ? "pottery" : "pewter",
    })),
  )
  return objects
}
// A ship's lantern: brass cap and base, amber glass, an iron cage, on a wall bracket or standing.
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
function materials(morning: boolean): Obj {
  return {
    ...pick(["ground", "barrel", "iron", "brass", "pottery", "crate", "crateDark", "sack", "sackB", "plasterB", "dark", "roof", "fire", "coal", "void"]),
    // Warm oak per the art direction: honey boards worn pale where people walk, oak beams and furniture, red-brown dado
    // panels, amber planks in the backroom, smoke-stained plaster between the studs.
    floor: painted("floor-worn", "#cdb8a2", [0.26, 3.2], { size: [0.6, 1.8], nails: 0.5, grime: 1.0, relief: 0.05, variance: 0.3 }),
    timber: painted("timber-hold", "#a08672", [0, 40], { size: [0.7, 2.2], grime: 1.2, relief: 0.1, variance: 0.25 }),
    ceiling: painted("timber-hold", "#6e5c50", [0.2, 40], { size: [0.7, 2.2], grime: 1.5, relief: 0.1 }),
    oak: painted("door-oak", "#d0b498", [0.2, 2.4], { size: [0.6, 1.8], grime: 0.9, relief: 0.1 }),
    oakDark: painted("door-oak", "#9a7c64", [0.12, 2.4], { size: [0.6, 1.8], grime: 1.1, relief: 0.1 }),
    panel: painted("cabin-planks", "#a88a7a", [0.16, 40], { size: [0.5, 1.6], grime: 0.9, relief: 0.14, variance: 0.35 }),
    boards: painted("timber-hold", "#dcb88e", [0.26, 40], { size: [0.7, 2.2], grime: 0.9, relief: 0.08, variance: 0.35 }),
    door: painted("door-oak", "#ffffff", [0, 12], { size: [0.6, 1.8], grime: 0.6, relief: 0.14 }),
    plaster: { type: "rock", a: "#76685a", b: "#928270", moss: "#56483c", mossLight: "#6a5c4e", lichen: "#a29280", mossAmount: 0.3, lichenAmount: 0.2, relief: 0.2, scale: 1.4 },
    hearthApron: { type: "masonry", a: "#5a524c", b: "#6a6058", c: "#4c4642", mortar: "#2e2824", block: [0.7, 0.5], joint: 0.03, relief: 0.03, variance: 0.6, grime: 1.6 },
    hearthStone: { type: "rock", a: "#4a4440", b: "#6a6258", moss: "#2e2a26", mossLight: "#3e3832", lichen: "#7a7266", mossAmount: 0.4, lichenAmount: 0.08, relief: 0.8, scale: 0.6 },
    hearthMortar: { type: "plain", color: "#2e2824", roughness: 1 },
    soot: { type: "plain", color: "#171310", roughness: 1 },
    log: { type: "wood", a: "#4a3426", b: "#5c4232", c: "#3a2c22", plank: [0, 40], relief: 0.05, seed: 5.3 },
    roast: { type: "plain", color: "#6a3a20", roughness: 0.6 },
    roastDark: { type: "plain", color: "#4c2410", roughness: 0.5 },
    bread: { type: "plain", color: "#b47a3e", roughness: 0.8 },
    cheese: { type: "plain", color: "#d8b456", roughness: 0.7 },
    pewter: { type: "metal", color: "#8e8c88", roughness: 0.45, metalness: 0.7 },
    steel: { type: "metal", color: "#9a9ea2", roughness: 0.35, metalness: 0.85 },
    bottleGreen: { type: "plain", color: "#2a4a2c", roughness: 0.2 },
    bottleBrown: { type: "plain", color: "#4c2c14", roughness: 0.2 },
    cloth: { type: "burlap", color: "#c8b898" },
    rug: { type: "plain", color: "#4a3428", roughness: 1 },
    shield: { type: "plain", color: "#5a3026", roughness: 0.7 },
    lead: { type: "metal", color: "#2a2826", roughness: 0.6, metalness: 0.4 },
    candle: { type: "plain", color: "#e8dcc0", roughness: 0.9 },
    // The dragon's bone: old ivory, darker in the hollows.
    bone: { type: "rock", a: "#a29274", b: "#d8ccae", moss: "#7e705a", mossLight: "#a49478", lichen: "#c8bc9e", mossAmount: 0.25, lichenAmount: 0.1, relief: 0.5, scale: 0.5 },
    // Candles lit in the evening; at dawn only the bar's is.
    candleFlame: morning ? { type: "plain", color: "#2a2420", roughness: 1 } : { type: "plain", color: "#000000", roughness: 1, emissive: "#ff9a40", emissiveIntensity: 2.2 },
    lamp: morning ? { type: "plain", color: "#3a2a1a", roughness: 0.5 } : { type: "plain", color: "#000000", roughness: 1, emissive: "#ff6a10", emissiveIntensity: 0.6 },
    // Leaded glass: dusk blue or clear morning seen from inside, the room's glow seen from the street.
    glass: morning ? { type: "glass", color: "#eef2f0", opacity: 0.1, roughness: 0.1 } : { type: "glass", color: "#203458", opacity: 0.3, roughness: 0.1 },
    glassOut: morning
      ? { type: "glass", color: "#c8d4dc", opacity: 0.2, roughness: 0.1 }
      : { type: "glass", color: "#ffa850", opacity: 0.3, emissive: "#ff8a30", emissiveIntensity: 0.35, roughness: 0.1 },
    shaft: { type: "glow", color: "#ffe2b4", opacity: 0.07 },
  }
}

// ── Sets ──
const MARKS = {
  hearth: { at: [-4.8, 1.3], label: "the hearth" },
  bar: { at: [-0.4, -2.45], label: "the bar" },
  cornerTable: { at: [4.3, 2.5], label: "the corner table" },
  frontDoor: { at: [0.6, 4.1], label: "the front door" },
  street: { at: [0.6, 6.5], label: "the street outside the inn" },
  stairs: { at: [6.1, 2.1], label: "the foot of the stairs" },
  backroomDoor: { at: [4.1, -4.35], label: "the backroom doorway" },
  backroom: { at: [5.0, -6.0], label: "the backroom" },
  kitchen: { at: [-3.95, -4.35], label: "the kitchen doorway" },
  bard: { at: [-4.6, 2.1], label: "the bard by the fire" },
  darkCorner: { at: [-4.6, -3.2], label: "the dark corner" },
  window: { at: [-2.4, 4.4], label: "the street windows" },
}
const SHOTS = {
  room: { position: [4.6, 1.95, 3.9], target: [-4.0, 1.25, -1.6], fov: 58, label: "The common room" },
  hearth: { position: [-2.6, 1.55, 1.6], target: [-6.4, 1.85, -0.6], fov: 52, label: "The hearth" },
  skull: { position: [-3.9, 2.15, 0.9], target: [-6.1, 2.45, -0.5], fov: 44, label: "The dragon's skull" },
  bar: { position: [0.9, 1.65, 0.6], target: [-0.6, 1.3, -4.4], fov: 54, label: "The bar" },
  table: { position: [3.0, 1.75, 0.8], target: [5.6, 1.0, 3.6], fov: 52, label: "The corner table" },
  door: { position: [-1.6, 1.7, -0.6], target: [0.6, 1.3, 5.0], fov: 52, label: "The front door" },
  stairs: { position: [2.4, 1.6, 3.6], target: [6.4, 2.0, -1.6], fov: 56, label: "The stairs" },
  backroom: { position: [3.25, 1.6, -5.65], target: [6.2, 0.8, -8.1], fov: 62, label: "The backroom" },
  darkCorner: { position: [-2.9, 1.55, -1.6], target: [-5.8, 0.9, -4.2], fov: 52, label: "The dark corner" },
}
// The inside-first room boxes: the common room, then the backroom.
const ROOM_BOX = [-7.0, -0.5, -5.0, 7.0, H + 0.1, 5.0]
const BACK_BOX = [BACK.x0, -0.5, BACK.z0, BACK.x1, BACK.h + 0.1, BACK.z1]
const BACKROOM_LIGHTS = [
  { at: [5.0, 1.3, -7.0], color: "#ffbc78", intensity: 20, distance: 5 },
  { at: [3.6, 2.2, -5.9], color: "#ffb070", intensity: 3, distance: 4 },
]

function crowd(morning: boolean) {
  const people = morning
    ? [{ kind: "traveler", at: [1.5, -2.4], yaw: 190 }]
    : [
        // Drinkers at the bar, round the barrel by it, and listening to the bard.
        { kind: "merchant", at: [-2.2, -2.4], yaw: 180 },
        { kind: "traveler", at: [-1.45, -2.38], yaw: 165 },
        { kind: "soldier", at: [1.4, -2.42], yaw: 200 },
        { kind: "woman", at: [-1.7, -1.2], yaw: 128 },
        { kind: "traveler", at: [-0.7, -1.15], yaw: -132 },
        { kind: "merchant", at: [-4.3, 1.6], yaw: -40 },
        { kind: "woman", at: [-3.95, 2.45], yaw: -96 },
        { kind: "traveler", at: [2.2, 0.6], yaw: 60 },
        { kind: "pilgrim", at: [-4.9, -2.3], yaw: 150 },
      ]
  return { library: "realm-of-myr", groups: [{ type: "points", people }] }
}

function inn(morning: boolean) {
  const objects = [...building(morning), ...furnishings(morning)]
  if (morning) {
    // Dawn light through the street windows: a soft shaft from each, down onto the floor.
    for (const x of SOUTH_WINDOWS) {
      const k = 1.6 / SUN[1]
      objects.push({ type: "beam", from: [x, 1.6, 5.05], to: [r2(x - SUN[0] * k), 0, r2(5.05 - SUN[2] * k)], radius: 0.5, radiusTo: 0.62, segments: 12, material: "shaft" })
    }
  }
  return {
    format: "d20.stage.set",
    version: 1,
    id: morning ? "dragonbone-inn-morning" : "dragonbone-inn",
    settingId: "realm-of-myr",
    locationId: "dragonbone-inn",
    title: morning ? "The Dragonbone Inn at dawn" : "The Dragonbone Inn",
    seed: 5150,
    atmosphere: morning
      ? {
          sun: {
            direction: SUN,
            color: "#ffe2b8",
            intensity: 5,
            target: [0, 0, 0],
            distance: 200,
            shadow: { left: -14, right: 14, top: 14, bottom: -14, near: 120, far: 280, size: 4096 },
          },
          hemisphere: { sky: "#b8cce0", ground: "#6a5440", intensity: 0.55 },
          sky: { horizon: "#f0dcc0", mid: "#a8c4dc", zenith: "#5a8ab8", gain: 1, clouds: 0.5, stars: 0, moon: 0 },
          fog: { density: 0.004, start: 12 },
          fill: { color: "#fff2e0", intensity: 1.2, distance: 10 },
          lights: [],
          environment: 0.3,
          exposure: 1.0,
          grade: "neutral",
          wind: 0.2,
        }
      : {
          sun: {
            direction: [-0.75, 0.12, 0.65],
            color: "#ff9a6a",
            intensity: 0.5,
            target: [0, 0, 0],
            distance: 200,
            shadow: { left: -14, right: 14, top: 14, bottom: -14, near: 120, far: 280, size: 2048 },
          },
          hemisphere: { sky: "#4a5a8a", ground: "#2a2018", intensity: 0.3 },
          sky: { horizon: "#c27a5c", mid: "#5a4a7a", zenith: "#1a2448", gain: 0.8, clouds: 0.4, stars: 0.2, moon: 0 },
          fog: { density: 0.01, color: "#3a4060", start: 10 },
          glow: "#ff9a6a",
          fill: { color: "#ffe8d0", intensity: 1.6, distance: 10 },
          lights: [],
          environment: 0.25,
          exposure: 1.0,
          grade: "neutral",
          wind: 0.2,
        },
    // Inside, the sky's light falls away and the room's own lights take over: the fire, the chandeliers, the bar's lantern
    // and the corner table's in the evening; the low sun, the banked fire and the bar's candle at dawn.
    rooms: [
      {
        box: ROOM_BOX,
        ambient: morning ? 0.5 : 0.12,
        fill: morning ? 1.0 : 1.6,
        exposure: morning ? 1.0 : 1.1,
        lights: morning
          ? [
              { at: [-6.0, 0.5, -0.5], color: "#ff7030", intensity: 5, distance: 3.5 },
              { at: [-3.2, 2.9, 4.3], color: "#ffe2b8", intensity: 3, distance: 5 },
              { at: [3.4, 2.9, 4.3], color: "#ffe2b8", intensity: 3, distance: 5 },
              { at: [0.0, 2.6, 1.0], color: "#d8e4f0", intensity: 4, distance: 9 },
              { at: [1.6, 1.5, -3.3], color: "#ffb060", intensity: 2.5, distance: 3 },
            ]
          : [
              { at: [-5.0, 0.7, -0.5], color: "#ff9448", intensity: 14, distance: 8 },
              { at: [-3.6, 2.7, -0.5], color: "#ffc488", intensity: 2.5, distance: 4 },
              { at: [-2.6, 2.3, 0.4], color: "#ffc488", intensity: 9, distance: 6 },
              { at: [0.8, 2.3, 1.8], color: "#ffc488", intensity: 9, distance: 6 },
              { at: [0.6, 2.1, -3.4], color: "#ffbc78", intensity: 6, distance: 4.5 },
              { at: [5.6, 1.5, 3.5], color: "#ffc488", intensity: 6, distance: 3.5 },
              { at: [-1.0, 2.0, 4.4], color: "#6a84c4", intensity: 2.5, distance: 5 },
              { at: [6.2, 2.4, 0.0], color: "#ffbc78", intensity: 3, distance: 4 },
            ],
      },
      { box: BACK_BOX, ambient: 0.16, fill: 2.2, exposure: 1.15, lights: BACKROOM_LIGHTS },
    ],
    camera: { near: 0.1, far: 300, min: [-6.85, 0.4, -8.45], max: [6.85, H - 0.15, 4.85], maxDistance: 12 },
    materials: materials(morning),
    objects,
    crowd: crowd(morning),
    marks: MARKS,
    // At dawn the opening view looks across the room to the sunlit street windows and the door.
    shots: morning ? { morning: { position: [-5.0, 1.75, -2.6], target: [1.0, 1.1, 4.2], fov: 56, label: "The common room" }, ...omit(SHOTS, "room") } : SHOTS,
    life: morning ? { dust: { count: 260, box: [-6.5, 0.2, -1.5, 6.5, 3.2, 5] } } : {},
  }
}
write(`${SETS}/dragonbone-inn.json`, inn(false))
write(`${SETS}/dragonbone-inn-morning.json`, inn(true))

// ── Cast ──
const art = (name: string) => ({ front: `${ART}/${name}-front.webp`, back: `${ART}/${name}-back.webp`, portrait: `${ART}/${name}-portrait.jpg` })
const member = (id: string, name: string, role: string, height: number, file: string, at: V2, facing: string | V2 | number) => ({ id, name, role, height, art: art(file), at, facing })
// The heroes at the corner table: the west end, the bench side under the window, and the near corner. The one in the
// booth can walk out only past the table's end: walks go straight or through one doorway. Premade slots as at
// the festival. A fifth hero stands at [4.3, 2.5], the scenes' `spare` in apps/desktop/src/scenes.ts.
const PARTY: [string, V2][] = [
  ["branka-stoneveil", [4.2, 3.25]],
  ["cassia-verane", [4.45, 4.1]],
  ["yeva-softstep", [5.35, 4.05]],
  ["milos-radan", [5.95, 2.15]],
]
const party = (spots: [string, V2][], facing: V2) => spots.map(([id, at]) => ({ ...festival.cast.find((c: Obj) => c.id === id), at, facing }))
const bram = (at: V2, facing: string | V2) => member("bram", "Bram", "Innkeeper", 1.86, "bram", at, facing)
const bard = member("bard", "The bard", "Minstrel", 1.8, "bard", [-5.0, 2.3], [-1.5, 1.6])
// Patrons on their own stools, at the tables and in the dark corner.
const seated = (id: string, name: string, at: V2, facing: V2) => member(`patron-${id}`, name, "Patron", 1.32, `patron-${id}`, at, facing)
const PATRONS = [
  seated("merchant", "A laughing merchant", [-2.0, -0.42], [-2.0, 0.4]),
  seated("farmer", "An old farmer", [0.8, 2.62], [0.8, 1.8]),
  seated("sailor", "A river sailor", [1.6, 1.42], [0.8, 1.8]),
  seated("traveller", "A tired traveller", [-3.35, 3.05], [-2.6, 3.4]),
  seated("hooded", "A hooded stranger", [-6.25, -4.0], [-5.4, -4.0]),
  seated("hooded-b", "A cloaked woman", [-5.25, -4.62], [-5.4, -4.0]),
]
const shotOn = (subject: string, distance: number, angle: number, height: number, lookHeight: number, label: string) => ({ subject, distance, angle, height, lookHeight, fov: 44, label })
const partyShot = { subjects: PARTY.map(([id]) => id), offset: [-2.2, 1.75, -2.4], target: [0.1, 1.05, 0.1], relative: "world", fov: 54, label: "Party" }
function staging(id: string, set: string, cast: Obj[], shots: Obj, shot: string, extra: Obj = {}) {
  write(`${STAGINGS}/${id}.json`, { format: "d20.stage.staging", version: 1, id: `march-of-davos/${id}`, set: `realm-of-myr/${set}`, cast, shots, shot, ...extra })
}

// The Dragonbone Inn: Bram has brought the party to the corner table and sets down their drinks. Beric and Eamon watch
// from the barrel by the bar, not yet named.
staging(
  "the-dragonbone-inn",
  "dragonbone-inn",
  [
    ...party(PARTY, CORNER),
    bram([5.3, 2.2], CORNER),
    bard,
    ...PATRONS,
    member("beric", "A scarred dockworker", "Dockworker", 1.86, "beric", [3.0, -0.95], [5.2, 3.0]),
    member("eamon", "A spectacled scholar", "Scholar", 1.78, "eamon", [3.85, -0.9], [5.2, 3.0]),
  ],
  {
    bram: shotOn("bram", 2.3, 25, 1.7, 1.6, "Bram"),
    party: partyShot,
    bardShot: shotOn("bard", 2.6, 10, 1.6, 1.4, "The bard"),
  },
  "room"
)

// An Unsolicited Opportunity: late in the evening, Beric and Eamon at the corner table, Bram back at the bar, fewer
// patrons. The backroom is through the doorway at the bar's east end.
staging(
  "an-unsolicited-opportunity",
  "dragonbone-inn",
  [
    ...party(PARTY, CORNER),
    member("beric", "Beric Sonacus", "Dockworker", 1.86, "beric", [4.6, 2.2], [5.3, 3.8]),
    member("eamon", "Eamon Vellis", "Scholar", 1.78, "eamon", [5.45, 2.15], [5.3, 3.8]),
    bram([-1.1, -2.35], [2, 1]),
    ...PATRONS.filter((p) => !["patron-traveller", "patron-sailor"].includes(p.id)),
  ],
  {
    visitors: { subjects: ["beric", "eamon"], offset: [0.35, 1.72, 2.55], target: [0, 1.45, 0], relative: "world", fov: 50, label: "Beric and Eamon" },
    beric: shotOn("beric", 2.2, -25, 1.72, 1.62, "Beric"),
    eamon: shotOn("eamon", 2.1, 25, 1.66, 1.55, "Eamon"),
    party: partyShot,
  },
  "visitors"
)

// Morning at the Dragonbone: dawn through the street windows, the party at the table under them turned toward the street
// door, Bram at the bar, one farmer at breakfast. Elara comes in by the door.
const MORNING_PARTY: [string, V2][] = [
  ["branka-stoneveil", [-3.4, 2.85]],
  ["cassia-verane", [-2.75, 2.45]],
  ["yeva-softstep", [-2.0, 2.45]],
  ["milos-radan", [-1.55, 2.95]],
]
staging(
  "morning-at-the-dragonbone",
  "dragonbone-inn-morning",
  [
    ...party(MORNING_PARTY, [0.3, 3.4]),
    bram([-0.8, -2.3], [0.3, 3.4]),
    member("elara", "Elara Antonov", "Courier", 1.65, "elara", [0.3, 3.4], [-0.8, -2.3]),
    seated("farmer", "An old farmer", [-1.65, -0.42], [-1.65, 0.4]),
  ],
  {
    elara: shotOn("elara", 2.2, 20, 1.6, 1.5, "Elara"),
    bram: shotOn("bram", 2.3, -20, 1.7, 1.6, "Bram"),
    party: { subjects: MORNING_PARTY.map(([id]) => id), offset: [2.5, 1.7, -0.4], target: [0, 1.05, 0.15], relative: "world", fov: 54, label: "Party" },
  },
  "morning",
  { entrances: [{ cast: "elara", when: "door creaks open", from: "street", shot: "door" }] }
)
