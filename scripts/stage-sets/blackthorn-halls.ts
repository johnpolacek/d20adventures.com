// Writes the Blackthorn mansion's halls for March of Davos (wiki/plans/march-of-davos-sets.md): the stair hall where the
// way divides, up to the family's floors or down to the cellars; the long upper corridor of portraits that ends at Astrid's
// carved door and passes Thaddeus's guarded one; and Thaddeus's cold study. Each is the cellar kit's room redressed as a
// finished interior. And the stagings of the four encounters played there.
//
//   pnpm exec tsx scripts/stage-sets/blackthorn-halls.ts && pnpm stage:check
//
// The JSON it writes is what the app loads. Edit this file and rerun rather than editing the JSON by hand.

import { readFileSync, writeFileSync } from "node:fs"
import { cellarSet } from "./kits/cellar"
import type { Obj, V2, V3 } from "./kits/street"

const SETS = "packages/stage/src/sets/realm-of-myr"
const STAGINGS = "packages/stage/src/stagings/march-of-davos"
const ART = "/stage/fixtures/march-of-davos"
const read = (name: string) => JSON.parse(readFileSync(`${SETS}/${name}.json`, "utf8"))
const festival = JSON.parse(readFileSync(`${STAGINGS}/the-harvest-festival.json`, "utf8"))
function write(path: string, data: unknown) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
}
const r2 = (n: number) => Math.round(n * 100) / 100
const pick = (set: Obj, keys: string[]) => Object.fromEntries(keys.map((k) => [k, (set.materials as Obj)[k]]).filter(([, v]) => v))
const library = read("old-grand-library")
const inn = read("dragonbone-inn")
const ballroom = read("blackthorn-ballroom")
const square = read("kordavos-harvest-square")

const art = (name: string) => ({ front: `${ART}/${name}-front.webp`, back: `${ART}/${name}-back.webp`, portrait: `${ART}/${name}-portrait.jpg` })
type Facing = string | V2 | number
const member = (id: string, name: string, role: string, height: number, file: string, at: V2, facing: Facing) => ({ id, name, role, height, art: art(file), at, facing })
const party = (spots: [string, V2][], facing: Facing) => spots.map(([id, at]) => ({ ...festival.cast.find((c: Obj) => c.id === id), at, facing }))
const partyShot = (spots: [string, V2][], offset: V3, label = "Party", fov = 54) => ({ subjects: spots.map(([id]) => id), offset, target: [0, 1.2, 0], relative: "world", fov, label })
const shotOn = (subject: string, distance: number, angle: number, height: number, lookHeight: number, label: string, fov = 44) => ({ subject, distance, angle, height, lookHeight, fov, label })
function staging(id: string, set: string, cast: Obj[], shots: Obj, shot: string, extra: Obj = {}) {
  write(`${STAGINGS}/${id}.json`, { format: "d20.stage.staging", version: 1, id: `march-of-davos/${id}`, set: `realm-of-myr/${set}`, cast, shots, shot, ...extra })
}

// The finished rooms' materials: dark oak panelling, damask walls, a parquet floor, plaster above, gilt everywhere.
const ROOM_MATERIALS: Obj = {
  ...pick(library, [
    "gilt",
    "brass",
    "rug",
    "fresco",
    "globeMap",
    "cabinetGlass",
    "glassShelf",
    "paper",
    "ink",
    "leather",
    "leatherRed",
    "oak",
    "oakDark",
    "doorOak",
    "bookRed",
    "bookGreen",
    "bookBlue",
    "bookBrown",
    "bookTan",
    "bookBlack",
    "bookOx",
    "bookCloth",
    "lead",
  ]),
  ...pick(inn, ["fire", "coal", "hearthApron", "hearthStone", "hearthMortar", "soot", "log", "pewter"]),
  ...pick(ballroom, ["velvet", "velvetDark", "marble", "marbleTrim", "nightGlass", "gem"]),
  bannerAsterian: (square.materials as Obj).banner,
  cellarStone: { type: "plain", color: "#3e1c1e", roughness: 0.85 },
  cellarVault: { type: "plain", color: "#c8b898", roughness: 0.9 },
  cellarRib: { type: "plain", color: "#b8a684", roughness: 0.8 },
  cellarFloor: { type: "painted", map: "/stage/textures/floor-worn.jpg", tint: "#8a6040", plank: [0.14, 2.2], size: [0.5, 1.6], relief: 0.04, grime: 0.6 },
  ceilingBoards: { type: "plain", color: "#c4b28e", roughness: 0.9 },
  timber: { type: "painted", map: "/stage/textures/door-oak.jpg", tint: "#4a3426", plank: [0, 40], size: [0.6, 1.8], relief: 0.06, grime: 0.8 },
  panelling: { type: "painted", map: "/stage/textures/door-oak.jpg", tint: "#5a3e2c", plank: [0.4, 2], size: [0.6, 1.8], relief: 0.08, grime: 0.6 },
  branch: { type: "image", map: "/stage/textures/bark-moss.jpg", size: [0.4, 1.2], tint: "#8a7a64", roughness: 0.9 },
  steel: { type: "metal", color: "#b8bcc0", roughness: 0.25, metalness: 0.9 },
  moonlight: { type: "plain", color: "#000000", roughness: 1, emissive: "#6a8ab8", emissiveIntensity: 0.6 },
}
// Dark oak panelling to dado height along both side walls of a room `w` wide from z0 to z1, a gilt rail over it.
function wainscot(w: number, z0: number, z1: number, h = 1.15): Obj[] {
  const o: Obj[] = []
  for (const s of [-1, 1]) {
    o.push({ type: "box", at: [s * (w / 2 - 0.03), 0, (z0 + z1) / 2], size: [0.06, h, Math.abs(z1 - z0)], material: "panelling" })
    o.push({ type: "box", at: [s * (w / 2 - 0.07), h, (z0 + z1) / 2], size: [0.06, 0.06, Math.abs(z1 - z0)], material: "gilt" })
    o.push({ type: "box", at: [s * (w / 2 - 0.04), 0, (z0 + z1) / 2], size: [0.08, 0.16, Math.abs(z1 - z0)], material: "oakDark" })
  }
  return o
}
// A framed painting hung on a side wall at x (facing in), centred at z, `w` by `h`, its bottom at y.
function portrait(x: number, z: number, y: number, w: number, h: number, material: string): Obj[] {
  const s = Math.sign(x)
  const yaw = s < 0 ? 90 : -90
  return [
    { type: "box", at: [r2(x - s * 0.03), y - 0.08, z], yaw, size: [w + 0.16, h + 0.16, 0.06], material: "gilt" },
    { type: "panel", at: [r2(x - s * 0.07), y, z], yaw, size: [w, h], material },
  ]
}
// A brass sconce of three candles on a wall facing +z (before yaw), at height y.
function sconce(at: V2, yaw: number, y = 1.9): Obj[] {
  const a = (yaw * Math.PI) / 180
  const out = (k: number, side: number): V3 => [r2(at[0] + Math.sin(a) * k + Math.cos(a) * side), y, r2(at[1] + Math.cos(a) * k - Math.sin(a) * side)]
  const o: Obj[] = [{ type: "box", at: out(0.02, 0), yaw, size: [0.14, 0.3, 0.03], material: "brass" }]
  for (const side of [-0.14, 0, 0.14]) {
    const [x, , z] = out(0.16, side)
    o.push({ type: "cylinder", at: [x, y, z], radius: 0.04, height: 0.02, material: "brass", segments: 8 })
    o.push({ type: "cylinder", at: [x, y + 0.02, z], radius: 0.015, height: 0.16, material: "candle", segments: 6 })
    o.push({ type: "cylinder", at: [x, y + 0.18, z], radius: [0.01, 0.0], height: 0.04, material: "candleFlame", segments: 5 })
  }
  return o
}

// ── The stair hall: Through the Halls ──
// A dim, high hall where the way from the ballroom divides: a grand stair climbs the far wall in two flights to a gallery,
// up to the family's floors; by the near wall, narrow steps go down through an arch into the cellars. A candle burns far
// off on the gallery; moonlight through a tall window at the top.
const SW = 12
const SL = 18
function stairHall(): Obj[] {
  const o: Obj[] = [...wainscot(SW, -0.4, -SL + 0.2)]
  // Two flights rising toward the far wall, meeting a gallery across it.
  for (const s of [-1, 1])
    o.push({
      type: "stairs",
      at: [s * 3.8, -SL + 8.4],
      width: 2.2,
      rise: 4.2,
      run: 6.4,
      rail: s < 0 ? "right" : "left",
      boarded: true,
      materials: { tread: "oakDark", riser: "oak", timber: "oakDark" },
    })
  o.push(
    {
      type: "gallery",
      at: [0, -SL],
      length: SW - 0.2,
      level: 4.2,
      depth: 2.2,
      rail: 1.0,
      gaps: [
        [-3.8, 2.3],
        [3.8, 2.3],
      ],
      materials: { deck: "oak", case: "oakDark", trim: "gilt" },
    },
    // A tall window over the gallery, the moon behind it; a door off the gallery between the flights.
    { type: "box", at: [0, 5.6, -SL + 0.02], size: [2.2, 4.4, 0.06], material: "nightGlass" },
    { type: "box", at: [0, 5.5, -SL + 0.06], size: [2.6, 0.14, 0.12], material: "gilt" },
    { type: "box", at: [0, 7.4, -SL + 0.08], size: [0.08, 4.0, 0.06], material: "gilt" },
    { type: "box", at: [0, 0, -SL + 0.04], size: [1.6, 2.8, 0.06], material: "doorOak" },
    { type: "chandelier", at: [0, 11.6, -9], radius: 1.2, candles: 12, drop: 3.6, materials: { timber: "gilt" } },
    // A runner down the floor to the stairs.
    { type: "panel", at: [0, 0.004, -1.5], size: [1.8, 13], pitch: -90, material: "rug" },
    // Candle stands at the foot of each flight.
    { type: "candleStand", at: [-5.2, -9.4] },
    { type: "candleStand", at: [5.2, -9.4] }
  )
  for (const z of [-4, -10]) for (const s of [-1, 1]) o.push(...portrait(s * (SW / 2 - 0.02), z, 1.8, 1.4, 1.8, z === -4 ? "fresco" : "dome"))
  o.push(...sconce([-SW / 2 + 0.02, -7], 90), ...sconce([SW / 2 - 0.02, -7], -90))
  return o
}
write(
  `${SETS}/blackthorn-stair-hall.json`,
  cellarSet({
    id: "blackthorn-stair-hall",
    title: "The Blackthorn mansion: the stair hall",
    seed: 3201,
    width: SW,
    length: SL,
    height: 7,
    ceiling: "vault",
    walls: "stone",
    floor: "flags",
    entrance: "down",
    entranceX: 4.0,
    tone: "cold",
    objects: stairHall(),
    atmosphere: { hemisphere: { sky: "#3e566e", ground: "#161a20", intensity: 1.0 }, exposure: 1.45, fill: { color: "#e0e8f0", intensity: 1.4, distance: 9 } },
    materials: { ...ROOM_MATERIALS, dome: { type: "image", map: "/stage/textures/dome-fresco.jpg", roughness: 0.9 }, cellarStep: { type: "plain", color: "#2a2420", roughness: 1 } },
    lights: [
      { at: [0, 6.6, -SL + 1.2], color: "#7a9ac8", intensity: 14, distance: 16 },
      { at: [0, 7.6, -9], color: "#ffb070", intensity: 12, distance: 14 },
      { at: [-SW / 2 + 0.5, 2.1, -7], color: "#ffa850", intensity: 5, distance: 6 },
      { at: [SW / 2 - 0.5, 2.1, -7], color: "#ffa850", intensity: 5, distance: 6 },
      { at: [0, 5.2, -SL + 1.4], color: "#ffa850", intensity: 2, distance: 4 },
      { at: [4.0, 0.4, -0.6], color: "#3a4a5a", intensity: 1.5, distance: 3 },
      { at: [-4.8, 1.8, -9.6], color: "#ffb060", intensity: 6, distance: 7 },
      { at: [4.8, 1.8, -9.6], color: "#ffb060", intensity: 6, distance: 7 },
    ],
    marks: {
      hall: { at: [0, -6], label: "the hall" },
      leftStair: { at: [-3.8, -9.2], label: "the foot of the stairs up" },
      rightStair: { at: [3.8, -9.2], label: "the foot of the other flight up" },
      down: { at: [4.0, -0.9], label: "the steps down to the cellars" },
    },
    shots: {
      hall: { position: [0.4, 1.7, -1.4], target: [0, 4.0, -SL], fov: 60, label: "The stair hall" },
      down: { position: [1.0, 1.7, -4.6], target: [4.0, 0.2, 1.4], fov: 54, label: "The steps down" },
      gallery: { position: [-1.2, 1.4, -6], target: [0, 5.2, -SL], fov: 56, label: "The gallery" },
    },
  })
)
const HALL: [string, V2][] = [
  ["branka-stoneveil", [-2.6, -5.2]],
  ["cassia-verane", [-1.7, -5.6]],
  ["yeva-softstep", [1.8, -5.2]],
  ["milos-radan", [2.7, -5.6]],
]
staging("through-the-halls", "blackthorn-stair-hall", party(HALL, [0, -SL]), { party: partyShot(HALL, [1.8, 1.8, 4.4]) }, "hall")

// ── The upper corridor: The Ranger's Quarters, The Lavish Corridor ──
// A long corridor on the family's floor: damask walls over dark panelling, portraits in gilt frames, tapestries of the
// Asterian eagle, candelabra and two crystal chandeliers, a runner down the middle. At its end, Astrid's heavy door,
// carved with twisted branches. Near it, in the east wall, the great carved door of Thaddeus's chambers.
const CW = 4.4
const CL = 30
const TDOOR_Z = -21
function corridor(): Obj[] {
  const o: Obj[] = [...wainscot(CW, -0.4, -CL + 0.2)]
  o.push({ type: "panel", at: [0, 0.004, -0.6], size: [1.8, CL - 1.4], pitch: -90, material: "rug" })
  for (const [i, z] of [-3.2, -8.6, -14.0, -19.4, -25.2].entries())
    for (const s of [-1, 1]) if (!(s > 0 && Math.abs(z - TDOOR_Z) < 3)) o.push(...portrait(s * (CW / 2 - 0.02), z, 1.6, 1.0, 1.4, i % 2 ? "fresco" : "dome"))
  for (const z of [-5.9, -16.7]) for (const s of [-1, 1]) o.push({ type: "banner", at: [r2(s * (CW / 2 - 0.08)), 3.9, z], yaw: s < 0 ? 90 : -90, w: 1.1, h: 2.6, material: "bannerAsterian" })
  for (const z of [-11.3, -22.6]) o.push({ type: "candleStand", at: [-CW / 2 + 0.5, z] })
  for (const z of [-7, -19]) o.push({ type: "chandelier", at: [0, 4.4, z], radius: 0.7, candles: 10, drop: 1.3, materials: { timber: "gilt" } })
  // Thaddeus's door: tall carved double doors under a gilt pediment.
  o.push(
    { type: "box", at: [CW / 2 - 0.05, 0, TDOOR_Z], size: [0.1, 3.4, 2.4], material: "doorOak" },
    { type: "box", at: [CW / 2 - 0.1, 0, TDOOR_Z], size: [0.04, 3.4, 0.05], material: "gilt" },
    { type: "box", at: [CW / 2 - 0.12, 3.4, TDOOR_Z], size: [0.2, 0.36, 2.9], material: "gilt" },
    { type: "box", at: [CW / 2 - 0.1, 0, TDOOR_Z - 1.3], size: [0.16, 3.4, 0.2], material: "oakDark" },
    { type: "box", at: [CW / 2 - 0.1, 0, TDOOR_Z + 1.3], size: [0.16, 3.4, 0.2], material: "oakDark" }
  )
  // Astrid's door at the end: heavy double doors carved with branches, twisted roots and boughs framing them, candle
  // sconces either side.
  const ez = -CL + 0.08
  o.push(
    { type: "box", at: [0, 0, ez], size: [2.2, 3.0, 0.1], material: "doorOak" },
    { type: "box", at: [0, 0, ez + 0.06], size: [0.05, 3.0, 0.04], material: "oakDark" },
    { type: "box", at: [0, 3.0, ez + 0.02], size: [2.6, 0.2, 0.16], material: "oakDark" }
  )
  for (const s of [-1, 1])
    for (let k = 0; k < 5; k++) {
      // Each bough climbs the jamb and arches over toward the middle, wandering as it goes.
      const pts: V3[] = []
      for (let i = 0; i <= 8; i++) {
        const t = i / 8
        const ang = t * Math.PI * 0.62
        const rx = 1.3 + k * 0.13
        const ry = 3.0 + k * 0.1
        const wob = Math.sin(i * 1.9 + k * 2.3) * 0.16 + Math.cos(i * 3.1 + k) * 0.06
        pts.push([r2(s * (rx * Math.cos(ang) + wob)), r2(Math.max(0, ry * Math.sin(ang) * 1.05 - 0.1 + k * 0.05 + wob * 0.6)), r2(ez + 0.12 + (k % 3) * 0.05)])
      }
      pts[0][1] = 0
      for (let i = 0; i < pts.length - 1; i++)
        o.push({
          type: "beam",
          from: pts[i],
          to: pts[i + 1],
          radius: r2(Math.max(0.025, 0.1 - k * 0.014 - i * 0.006)),
          radiusTo: r2(Math.max(0.02, 0.095 - k * 0.014 - i * 0.006)),
          segments: 6,
          material: "branch",
        })
    }
  o.push(...sconce([-1.85, ez], 0, 1.8), ...sconce([1.85, ez], 0, 1.8))
  return o
}
write(
  `${SETS}/blackthorn-corridor.json`,
  cellarSet({
    id: "blackthorn-corridor",
    title: "The Blackthorn mansion: the upper corridor",
    seed: 3301,
    width: CW,
    length: CL,
    height: 4.6,
    ceiling: "beams",
    posts: false,
    walls: "stone",
    floor: "flags",
    entrance: "door",
    entranceX: 0,
    tone: "warm",
    objects: corridor(),
    materials: { ...ROOM_MATERIALS, dome: { type: "image", map: "/stage/textures/dome-fresco.jpg", roughness: 0.9 } },
    lights: [
      { at: [0, 3.0, -7], color: "#ffc070", intensity: 7, distance: 9 },
      { at: [0, 3.0, -19], color: "#ffc070", intensity: 7, distance: 9 },
      { at: [-CW / 2 + 0.6, 1.8, -11.3], color: "#ffb060", intensity: 2.5, distance: 4 },
      { at: [-CW / 2 + 0.6, 1.8, -22.6], color: "#ffb060", intensity: 2.5, distance: 4 },
      { at: [-1.6, 1.9, -CL + 0.6], color: "#ffb060", intensity: 3, distance: 4 },
      { at: [1.6, 1.9, -CL + 0.6], color: "#ffb060", intensity: 3, distance: 4 },
    ],
    marks: {
      corridor: { at: [0, -4], label: "the corridor" },
      thaddeusDoor: { at: [CW / 2 - 0.9, TDOOR_Z], label: "the carved door of Thaddeus's chambers" },
      astridDoor: { at: [0, -CL + 0.9], label: "the door carved with branches" },
    },
    shots: {
      corridor: { position: [0.6, 1.7, -1.2], target: [0, 1.7, -CL], fov: 52, label: "The corridor" },
      astridDoor: { position: [0.3, 1.6, -CL + 5.2], target: [0, 1.6, -CL], fov: 50, label: "The carved door" },
      thaddeusDoor: { position: [-1.4, 1.6, TDOOR_Z + 4.6], target: [CW / 2, 1.7, TDOOR_Z], fov: 54, label: "Thaddeus's door" },
    },
  })
)
const UPPER: [string, V2][] = [
  ["branka-stoneveil", [-0.8, -CL + 3.4]],
  ["cassia-verane", [0.4, -CL + 3.7]],
  ["yeva-softstep", [-0.2, -CL + 4.6]],
  ["milos-radan", [1.0, -CL + 4.8]],
]
staging("the-rangers-quarters", "blackthorn-corridor", party(UPPER, [0, -CL]), { party: partyShot(UPPER, [1.2, 1.7, 3.6]) }, "astridDoor")
const WATCH: [string, V2][] = [
  ["branka-stoneveil", [-0.9, -12.0]],
  ["cassia-verane", [0.2, -11.6]],
  ["yeva-softstep", [-0.4, -10.8]],
  ["milos-radan", [0.8, -10.6]],
]
staging(
  "the-lavish-corridor",
  "blackthorn-corridor",
  [
    ...party(WATCH, [CW / 2, TDOOR_Z]),
    member("blackthorn-guard", "A grey-haired guard", "Blackthorn guard", 1.85, "blackthorn-guard", [1.3, TDOOR_Z + 1.9], [0, -12]),
    member("blackthorn-guard-2", "A young bearded guard", "Blackthorn guard", 1.85, "blackthorn-guard", [0.9, TDOOR_Z - 1.6], [0, -12]),
  ],
  {
    party: partyShot(WATCH, [1.2, 1.7, 3.6]),
    guards: { subjects: ["blackthorn-guard", "blackthorn-guard-2"], offset: [-1.4, 1.7, 4.4], target: [0.4, 1.5, 0], relative: "world", fov: 50, label: "The guards" },
    guard: shotOn("blackthorn-guard", 2.4, 15, 1.7, 1.65, "The grey-haired guard"),
  },
  "thaddeusDoor"
)

// ── Thaddeus's study: Thaddeus Blackthorn's Private Chambers ──
// Grand but cold: dark panelling, a mahogany desk heaped with ledgers before a tall window on moonlit Kordavos, velvet
// curtains half drawn, shelves of scrolls, a glass cabinet of trinkets, a sword in a Valkaran scabbard over the hearth,
// and a tapestry hiding a second door.
const TW = 9
const TL = 8.4
function study(): Obj[] {
  const o: Obj[] = [...wainscot(TW, -0.4, -TL + 0.2, 2.2)]
  o.push(
    { type: "panel", at: [0, 0.004, -2.0], size: [4.2, 3.2], pitch: -90, material: "rug" },
    { type: "desk", at: [0, -5.3], yaw: 180, kind: "writing", length: 2.0, width: 0.95, height: 0.8, books: 4, candle: true },
    { type: "armchair", at: [0, -6.4], width: 0.9, back: 1.3 },
    { type: "armchair", at: [-1.2, -3.8], yaw: 160, width: 0.8, back: 1.0 },
    // The window behind the desk: tall dark panes with the moon's glow, gilt bars, curtains half drawn.
    { type: "box", at: [0, 0.9, -TL + 0.03], size: [2.6, 3.2, 0.04], material: "nightGlass" },
    { type: "box", at: [0, 0.9, -TL + 0.02], size: [2.6, 3.2, 0.02], material: "moonlight" },
    { type: "box", at: [0, 0.9, -TL + 0.07], size: [0.06, 3.2, 0.04], material: "gilt" },
    { type: "box", at: [0, 2.5, -TL + 0.07], size: [2.6, 0.06, 0.04], material: "gilt" },
    { type: "curtain", at: [0, 0, -TL + 0.2], width: 3.6, height: 4.4, folds: 14, depth: 0.12, gather: 0.78, side: "both", tie: 0.55, cloth: "velvet" },
    { type: "chandelier", at: [0, 4.4, -4.2], radius: 0.7, candles: 10, drop: 1.2, materials: { timber: "gilt" } },
    // Shelves of scrolls and sealed letters along the west wall.
    { type: "bookcase", at: [-TW / 2 + 0.02, -4.2], yaw: 90, length: 5.2, height: 3.2, bay: 1.3, fill: 0.35, plinth: 0.4, books: ["paper", "bookTan", "paper"] },
    // The hearth on the east wall, a sword over it.
    { type: "hearth", at: [TW / 2 - 0.02, -3.6], yaw: -90, width: 2.4, depth: 0.7, height: 2.4, opening: [1.3, 0.9], spit: false, fire: "embers", wood: "none" },
    { type: "box", at: [TW / 2 - 0.1, 2.9, -3.6], size: [0.03, 0.05, 1.1], material: "steel" },
    { type: "box", at: [TW / 2 - 0.12, 2.82, -2.98], size: [0.05, 0.2, 0.06], material: "gilt" },
    { type: "box", at: [TW / 2 - 0.1, 2.9, -2.82], size: [0.05, 0.04, 0.32], material: "leatherRed" },
    // A tapestry on the east wall nearer the window, a door behind it.
    { type: "banner", at: [TW / 2 - 0.1, 3.9, -6.6], yaw: -90, w: 1.6, h: 3.4, material: "bannerAsterian" },
    // The glass cabinet of trinkets in the corner.
    { type: "box", at: [-TW / 2 + 0.6, 0, -TL + 0.6], size: [1.0, 2.0, 0.6], material: "cabinetGlass" },
    { type: "box", at: [-TW / 2 + 0.6, 0, -TL + 0.6], size: [1.04, 0.3, 0.64], material: "oakDark" },
    { type: "box", at: [-TW / 2 + 0.6, 2.0, -TL + 0.6], size: [1.04, 0.1, 0.64], material: "oakDark" },
    { type: "sphere", at: [-TW / 2 + 0.5, 1.2, -TL + 0.6], radius: 0.06, segments: 10, material: "gem" },
    { type: "sphere", at: [-TW / 2 + 0.75, 1.2, -TL + 0.55], radius: 0.05, segments: 10, material: "gem" },
    { type: "globe", at: [2.6, -1.6] }
  )
  return o
}
write(
  `${SETS}/blackthorn-study.json`,
  cellarSet({
    id: "blackthorn-study",
    title: "The Blackthorn mansion: Thaddeus's study",
    seed: 3501,
    width: TW,
    length: TL,
    height: 4.6,
    ceiling: "beams",
    posts: false,
    walls: "stone",
    floor: "flags",
    entrance: "door",
    entranceX: -2.6,
    tone: "warm",
    objects: study(),
    atmosphere: { hemisphere: { sky: "#5a4632", ground: "#1e140c", intensity: 0.7 }, exposure: 1.4 },
    materials: { ...ROOM_MATERIALS, cellarStone: { type: "plain", color: "#2a1e18", roughness: 0.8 } },
    lights: [
      { at: [TW / 2 - 0.9, 0.7, -3.6], color: "#ff8a3a", intensity: 8, distance: 7 },
      { at: [0.3, 1.2, -5.1], color: "#ffb060", intensity: 3, distance: 4 },
      { at: [0, 2.2, -TL + 0.8], color: "#9ab4d8", intensity: 7, distance: 8 },
      { at: [0, 3.0, -4.2], color: "#ffc070", intensity: 10, distance: 10 },
    ],
    marks: {
      door: { at: [-2.6, -0.9], label: "the door" },
      desk: { at: [0, -4.2], label: "the desk" },
      window: { at: [1.6, -TL + 0.9], label: "the window" },
      shelves: { at: [-TW / 2 + 1.0, -4.2], label: "the shelves of scrolls" },
      cabinet: { at: [-TW / 2 + 1.5, -TL + 1.4], label: "the glass cabinet" },
      hearth: { at: [TW / 2 - 1.4, -2.2], label: "the hearth and the sword" },
      tapestry: { at: [TW / 2 - 0.9, -6.6], label: "the tapestry" },
    },
    shots: {
      study: { position: [2.6, 1.8, -0.7], target: [-0.4, 1.3, -TL], fov: 58, label: "The study" },
      desk: { position: [0.8, 1.5, -2.8], target: [0, 0.9, -5.4], fov: 50, label: "The desk" },
      sword: { position: [1.6, 1.8, -2.0], target: [TW / 2, 2.6, -3.4], fov: 46, label: "The sword over the hearth" },
      cabinet: { position: [-1.6, 1.5, -5.4], target: [-TW / 2 + 0.6, 1.1, -TL + 0.6], fov: 46, label: "The glass cabinet" },
    },
  })
)
const STUDY: [string, V2][] = [
  ["branka-stoneveil", [-2.2, -1.8]],
  ["cassia-verane", [-1.2, -2.2]],
  ["yeva-softstep", [-2.8, -2.6]],
  ["milos-radan", [-0.6, -1.6]],
]
staging("thaddeus-blackthorns-private-chambers", "blackthorn-study", party(STUDY, [0, -5.3]), { party: partyShot(STUDY, [1.4, 1.7, 3.0]) }, "study")

console.log("wrote 3 hall sets and 4 stagings")
