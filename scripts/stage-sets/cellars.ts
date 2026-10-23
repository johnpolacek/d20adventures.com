// Writes March of Davos's rooms below ground from the cellar kit (wiki/plans/march-of-davos-sets.md): the low back room
// of Silverhand's hideout and the Blackthorn mansion's wine cellar, and their stagings.
//
//   pnpm exec tsx scripts/stage-sets/cellars.ts && pnpm stage:check
//
// The JSON it writes is what the app loads. Edit this file and rerun rather than editing the JSON by hand.

import { readFileSync, writeFileSync } from "node:fs"
import { cellarSet, type Obj } from "./kits/cellar"

type V2 = [number, number]
const SETS = "packages/stage/src/sets/realm-of-myr"
const STAGINGS = "packages/stage/src/stagings/march-of-davos"
const ART = "/stage/fixtures/march-of-davos"
const festival = JSON.parse(readFileSync(`${STAGINGS}/the-harvest-festival.json`, "utf8"))
function write(path: string, data: unknown) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
}
const r2 = (n: number) => Math.round(n * 100) / 100
let seed = 3601
const rnd = (a = 0, b = 1) => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return a + ((b - a) * seed) / 4294967296
}

const art = (name: string) => ({ front: `${ART}/${name}-front.webp`, back: `${ART}/${name}-back.webp`, portrait: `${ART}/${name}-portrait.jpg` })
type Facing = string | V2 | number
const member = (id: string, name: string, role: string, height: number, file: string, at: V2, facing: Facing) => ({ id, name, role, height, art: art(file), at, facing })
const party = (spots: [string, V2][], facing: Facing) => spots.map(([id, at]) => ({ ...festival.cast.find((c: Obj) => c.id === id), at, facing }))
const partyShot = (spots: [string, V2][], offset: [number, number, number], label = "Party", fov = 54) => ({
  subjects: spots.map(([id]) => id),
  offset,
  target: [0, 1.2, 0],
  relative: "world",
  fov,
  label,
})
const shotOn = (subject: string, distance: number, angle: number, height: number, lookHeight: number, label: string, fov = 44) => ({ subject, distance, angle, height, lookHeight, fov, label })
function staging(id: string, set: string, cast: Obj[], shots: Obj, shot: string, extra: Obj = {}) {
  write(`${STAGINGS}/${id}.json`, { format: "d20.stage.staging", version: 1, id: `march-of-davos/${id}`, set: `realm-of-myr/${set}`, cast, shots, shot, ...extra })
}

// ── Silverhand's back room: Face-to-Face with Silverhand ──
// A cramped, low room at the back of the warehouse: boards for walls, beams overhead, crates and sacks of smuggled
// goods stacked along every wall. A long weathered table runs down the middle, empty chairs either side. Silverhand sits
// at its far end behind a single candle and an uncorked bottle of Hammerdeep whiskey. Varchk stands behind him.
const HW = 3.2
const HL = 11
const TABLE: V2 = [0, -6.0]
const TL = 4.4
function hideoutRoom(): Obj[] {
  const o: Obj[] = [
    { type: "table", at: TABLE, yaw: 90, length: TL, width: 1.0, height: 0.78 },
    // A single stub of candle in an iron dish before Silverhand.
    { type: "cylinder", at: [-0.12, 0.78, TABLE[1] - TL / 2 + 0.55], radius: 0.07, height: 0.015, material: "iron", segments: 12 },
    { type: "cylinder", at: [-0.12, 0.795, TABLE[1] - TL / 2 + 0.55], radius: 0.022, height: 0.13, material: "candle", segments: 8 },
    { type: "cylinder", at: [-0.12, 0.925, TABLE[1] - TL / 2 + 0.55], radius: [0.012, 0.0], height: 0.045, material: "candleFlame", segments: 6 },
    // The whiskey, uncorked, by Silverhand's place, its cork beside it.
    { type: "cylinder", at: [0.22, 0.78, TABLE[1] - TL / 2 + 0.35], radius: 0.04, height: 0.2, material: "whiskey", segments: 10 },
    { type: "cylinder", at: [0.22, 1.0, TABLE[1] - TL / 2 + 0.35], radius: [0.026, 0.014], height: 0.09, material: "whiskey", segments: 8 },
    { type: "cylinder", at: [0.32, 0.78, TABLE[1] - TL / 2 + 0.42], radius: 0.016, height: 0.035, material: "cork", segments: 6 },
  ]
  // Empty chairs down both sides, a little askew.
  for (const s of [-1, 1]) for (const dz of [-1.4, 0, 1.4]) o.push({ type: "chair", at: [s * 0.82, r2(TABLE[1] + dz + rnd(-0.1, 0.1))], yaw: s < 0 ? r2(90 + rnd(-12, 12)) : r2(-90 + rnd(-12, 12)) })
  // Crates and sacks stacked along the walls, a few barrels, a coil of rope.
  for (const s of [-1, 1])
    for (let z = -1.2; z > -HL + 0.6; z -= rnd(0.9, 1.3)) {
      const x = s * (HW - 0.5)
      const kind = rnd()
      if (kind < 0.55) o.push({ type: "crate", at: [r2(x + s * rnd(-0.05, 0.05)), r2(z)], yaw: r2(rnd(-8, 8)), size: r2(rnd(0.7, 0.9)), stack: rnd() < 0.7, solid: true })
      else if (kind < 0.8) o.push({ type: "sack", at: [r2(x + s * 0.1), r2(z)], size: r2(rnd(0.55, 0.7)) }, { type: "sack", at: [r2(x - s * 0.25), r2(z + 0.35)], size: r2(rnd(0.5, 0.6)) })
      else o.push({ type: "barrel", at: [r2(x + s * 0.05), r2(z)], r: 0.34, h: 0.95, solid: true })
    }
  // Crates against the far wall either side of Silverhand, and a lantern on a hook by the door.
  o.push(
    { type: "crate", at: [-1.9, -HL + 0.55], yaw: 4, size: 0.85, stack: true, solid: true },
    { type: "crate", at: [2.0, -HL + 0.5], yaw: -6, size: 0.8, stack: true, solid: true },
    { type: "lantern", at: [-0.6, 1.9, -0.9], height: 0 },
    { type: "box", at: [-0.6, 2.18, -0.9], size: [0.04, 0.3, 0.04], material: "iron" }
  )
  return o
}
write(
  `${SETS}/silverhand-hideout.json`,
  cellarSet({
    id: "silverhand-hideout",
    title: "Silverhand's hideout",
    seed: 2501,
    width: 2 * HW,
    length: HL,
    height: 2.5,
    ceiling: "beams",
    walls: "boards",
    floor: "boards",
    entrance: "door",
    entranceX: -1.4,
    tone: "cold",
    objects: hideoutRoom(),
    materials: { cork: { type: "plain", color: "#8a6a48", roughness: 0.9 }, whiskey: { type: "plain", color: "#2a1608", roughness: 0.55 } },
    lights: [
      // The candle at Silverhand's end of the table, the room's only warmth.
      { at: [-0.12, 1.1, TABLE[1] - TL / 2 + 0.75], color: "#ffa850", intensity: 3.2, distance: 5 },
      { at: [-0.6, 1.7, -1.1], color: "#ffb070", intensity: 1.6, distance: 3.5 },
      // A cold seep of light from the door's cracks.
      { at: [-1.4, 1.6, -0.6], color: "#8ab0b4", intensity: 0.8, distance: 3 },
    ],
    marks: {
      door: { at: [-1.4, -0.8], label: "the door" },
      table: { at: [0, TABLE[1] + TL / 2 + 0.6], label: "the near end of the table" },
      chairs: { at: [-0.6, TABLE[1]], label: "the empty chairs" },
      head: { at: [0.8, TABLE[1] - TL / 2 - 0.2], label: "Silverhand's end of the table" },
      crates: { at: [2.2, -3.0], label: "the stacked crates" },
    },
    shots: {
      room: { position: [0.5, 1.6, -0.7], target: [0, 1.0, -8.6], fov: 44, label: "The hideout" },
      table: { position: [-0.9, 1.7, -3.4], target: [0.3, 0.8, -7.4], fov: 50, label: "The table" },
      crates: { position: [-1.0, 1.5, -6.0], target: [2.8, 1.0, -3.0], fov: 54, label: "The crates" },
    },
  })
)
const MEET: [string, V2][] = [
  ["branka-stoneveil", [-1.1, -2.9]],
  ["cassia-verane", [-0.2, -2.6]],
  ["yeva-softstep", [-1.9, -2.2]],
  ["milos-radan", [1.1, -3.0]],
]
const SEAT: V2 = [0, TABLE[1] - TL / 2 - 0.42]
staging(
  "face-to-face-with-silverhand",
  "silverhand-hideout",
  [
    ...party(MEET, SEAT),
    member("silverhand", "Silverhand", "Smuggler lord", 1.36, "silverhand-seated", SEAT, [0, 0]),
    member("aldith", "Varchk", "Silverhand's bodyguard", 1.98, "aldith", [1.3, -HL + 1.2], [0, -2]),
  ],
  {
    party: partyShot(MEET, [1.6, 1.6, 3.2]),
    silverhand: shotOn("silverhand", 2.1, 0, 1.15, 1.0, "Silverhand", 40),
    varchk: shotOn("aldith", 2.6, 15, 1.7, 1.65, "Varchk"),
  },
  "room"
)

// ── The Blackthorn wine cellar: The Wine Cellar ──
// A long barrel vault below the mansion, down a stone stair from the halls above. Racks of dusty bottles line both
// walls; casks lie in rows before them, heads to the aisle. Two candle chandeliers hang over the aisle. Against the far
// wall stands a sturdier rack of newer wood: the hidden alcove behind it. The sommelier and a servant come down the stair.
const WW = 7.6
const WL = 22
function wineCellar(): Obj[] {
  const o: Obj[] = []
  for (const s of [-1, 1]) {
    // Racks along the wall.
    for (let z = -1.6; z > -WL + 1.6; z -= 2.36)
      o.push({ type: "wineRack", at: [s * (WW / 2), r2(z - 1.15)], yaw: s < 0 ? 90 : -90, width: 2.3, height: 2.3, cols: 11, rows: 12, fill: r2(rnd(0.7, 0.9)) })
    // Rows of casks before them, heads to the aisle; a few stacked two high.
    for (const [z, count, tiers] of [
      [-4.2, 3, 1],
      [-8.6, 3, 2],
      [-13.0, 3, 1],
      [-17.2, 3, 2],
    ] as [number, number, number][])
      o.push({ type: "cask", at: [s * (WW / 2 - 0.42 - 0.62), z], yaw: s < 0 ? 90 : -90, r: 0.46, length: 1.15, count, tiers })
  }
  // The rack on the far wall, of newer, paler wood: the hidden alcove is behind it.
  o.push({ type: "wineRack", at: [0, -WL], yaw: 0, width: 2.6, height: 2.4, cols: 12, rows: 12, fill: 0.9, materials: { wood: "rackNew" } })
  // Chandeliers over the aisle, candle stands, torches either side of the stair.
  o.push(
    { type: "chandelier", at: [0, 5.3, -7.4], radius: 0.6, candles: 10, drop: 1.4 },
    { type: "chandelier", at: [0, 5.3, -15.4], radius: 0.6, candles: 10, drop: 1.4 },
    { type: "candleStand", at: [-2.2, -WL + 1.2] },
    { type: "candleStand", at: [2.2, -WL + 1.2] },
    { type: "torch", at: [-1.15, 2.0, -0.02] },
    { type: "torch", at: [1.15, 2.0, -0.02] },
    // A tasting table at the far end with bottles and a candle.
    { type: "table", at: [1.4, -WL + 3.2], yaw: 0, length: 1.2, width: 0.7, height: 0.8, candle: true }
  )
  for (const [x, z] of [
    [1.05, -WL + 3.1],
    [1.2, -WL + 3.3],
    [1.75, -WL + 3.05],
  ])
    o.push({ type: "cylinder", at: [x, 0.8, z], radius: 0.04, height: 0.3, material: "bottleDark", segments: 8 })
  // Bottles and a dropped cork on the floor, candles guttering on the flags by the casks.
  for (const [x, z] of [
    [-1.6, -6.0],
    [1.7, -11.2],
    [-1.5, -15.6],
    [1.6, -19.4],
  ]) {
    o.push({ type: "cylinder", at: [x, 0, z], radius: 0.035, height: 0.16, material: "candle", segments: 8 })
    o.push({ type: "cylinder", at: [x, 0.16, z], radius: [0.018, 0.0], height: 0.05, material: "candleFlame", segments: 6 })
  }
  return o
}
write(
  `${SETS}/blackthorn-wine-cellar.json`,
  cellarSet({
    id: "blackthorn-wine-cellar",
    title: "The Blackthorn wine cellar",
    seed: 3602,
    width: WW,
    length: WL,
    height: 2.5,
    ceiling: "vault",
    walls: "stone",
    floor: "flags",
    entrance: "stair",
    tone: "warm",
    objects: wineCellar(),
    materials: { rackNew: { type: "wood", a: "#8a6a48", b: "#9a7854", c: "#7e5e3e", plank: [0, 30], relief: 0.02 } },
    lights: [
      { at: [0, 3.6, -7.4], color: "#ffb060", intensity: 20, distance: 12 },
      { at: [0, 3.6, -15.4], color: "#ffb060", intensity: 20, distance: 12 },
      { at: [-1.1, 2.0, -0.5], color: "#ff9a40", intensity: 4, distance: 5 },
      { at: [1.1, 2.0, -0.5], color: "#ff9a40", intensity: 4, distance: 5 },
      { at: [0, 1.6, -WL + 1.4], color: "#ffa850", intensity: 5, distance: 6 },
      { at: [-1.6, 0.4, -6.0], color: "#ffa850", intensity: 1.2, distance: 2.5 },
      { at: [1.6, 0.4, -19.4], color: "#ffa850", intensity: 1.2, distance: 2.5 },
    ],
    marks: {
      stair: { at: [0, 0.9], label: "the foot of the stair" },
      aisle: { at: [0, -9], label: "the aisle between the casks" },
      westCasks: { at: [-1.5, -11.0], label: "behind the casks on the west side" },
      eastCasks: { at: [1.5, -11.0], label: "behind the casks on the east side" },
      farRack: { at: [0, -WL + 0.9], label: "the rack on the far wall" },
      tasting: { at: [0.4, -WL + 3.9], label: "the tasting table" },
    },
    shots: {
      cellar: { position: [0.2, 1.7, -1.4], target: [0, 1.9, -WL], fov: 56, label: "The wine cellar" },
      stair: { position: [0.6, 1.6, -9.0], target: [0, 1.9, 0.4], fov: 52, label: "The stair" },
      casks: { position: [-0.6, 1.2, -9.5], target: [2.6, 0.9, -13.4], fov: 54, label: "The casks" },
      farRack: { position: [0.4, 1.6, -WL + 4.6], target: [0, 1.3, -WL], fov: 48, label: "The rack on the far wall" },
    },
  })
)
const CELLAR: [string, V2][] = [
  ["branka-stoneveil", [-0.7, -10.2]],
  ["cassia-verane", [0.4, -10.8]],
  ["yeva-softstep", [-0.2, -11.6]],
  ["milos-radan", [0.9, -9.8]],
]
staging(
  "the-wine-cellar",
  "blackthorn-wine-cellar",
  [
    ...party(CELLAR, [0, -WL]),
    member("clive-stonebrook", "The sommelier", "Blackthorn sommelier", 1.86, "clive-stonebrook", [0.6, -6.2], [0, -12]),
    member("mira-hearthstone", "A servant", "Blackthorn servant", 1.58, "mira-hearthstone", [-0.4, -5.4], [0, -12]),
  ],
  {
    party: partyShot(CELLAR, [1.4, 1.6, 3.8]),
    sommelier: shotOn("clive-stonebrook", 2.6, -10, 1.7, 1.6, "The sommelier"),
    servant: shotOn("mira-hearthstone", 2.2, 15, 1.5, 1.4, "The servant"),
  },
  "cellar",
  {
    entrances: [
      { cast: "clive-stonebrook", when: "sommelier", from: "stair", shot: "stair" },
      { cast: "mira-hearthstone", when: "servant", from: "stair", shot: "stair" },
    ],
  }
)

console.log("wrote 2 cellar sets and 2 stagings")
