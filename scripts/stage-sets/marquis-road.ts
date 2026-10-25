// Writes The Road to Kordavos's sets from the road kit (wiki/plans/road-to-kordavos-sets.md): the Marquis Road in the
// hill woods where Dmitri's caravan comes by, the road nearer the city where Borina keeps her table, and the stagings for
// all three encounters, the last on the gate set.
//
//   pnpm exec tsx scripts/stage-sets/marquis-road.ts && pnpm stage:check
//
// The JSON it writes is what the app loads. Edit this file and rerun rather than editing the JSON by hand.

import { mkdirSync, writeFileSync } from "node:fs"
import { roadSet, roadX } from "./kits/road"
import type { Obj, V2 } from "./kits/street"

const SETS = "packages/stage/src/sets/realm-of-myr"
const STAGINGS = "packages/stage/src/stagings/the-road-to-kordavos"
const ART = "/stage/fixtures/the-road-to-kordavos"
function write(path: string, data: unknown) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
}

const art = (dir: string, name: string) => ({ front: `${dir}/${name}-front.webp`, back: `${dir}/${name}-back.webp`, portrait: `${dir}/${name}-portrait.jpg` })
type Facing = string | V2 | number
const member = (id: string, name: string, role: string, height: number, file: string, at: V2, facing: Facing) => ({ id, name, role, height, art: art(ART, file), at, facing })
// The party: this adventure has no premades, so stock heroes hold the places the app gives the player's own heroes.
const HEROES: [string, string, number][] = [
  ["hero-1", "human-a", 1.8],
  ["hero-2", "elf-b", 1.76],
  ["hero-3", "dwarf-a", 1.4],
]
const party = (spots: V2[], facing: Facing) =>
  spots.map((at, i) => {
    const [id, figure, height] = HEROES[i]
    return { id, name: `Traveller ${i + 1}`, role: "Hero", height, art: art("/stage/heroes", figure), at, facing }
  })
const partyShot = (offset: [number, number, number], label = "Party", fov = 54) => ({
  subjects: HEROES.map(([id]) => id),
  offset,
  target: [0, 1.2, 0],
  relative: "world",
  fov,
  label,
})
const shotOn = (subject: string, distance: number, angle: number, height: number, lookHeight: number, label: string, fov = 44) => ({ subject, distance, angle, height, lookHeight, fov, label })
function staging(id: string, set: string, cast: Obj[], shots: Obj, shot: string, extra: Obj = {}) {
  write(`${STAGINGS}/${id}.json`, { format: "d20.stage.staging", version: 1, id: `the-road-to-kordavos/${id}`, set: `realm-of-myr/${set}`, cast, shots, shot, ...extra })
}

const DMITRI = "npcs-1749870310278"
const ELARAEN = "npcs-1749870658664"
const MIRA = "npcs-1749870721240"
const BORINA = "npcs-1749870598631"

// ── Well Met: the Marquis Road in the hill woods ──
// Kordavos lies on up the road (-z). Dmitri's caravan comes up it from behind the camera's end, Dmitri riding at its
// head, two covered wagons with his house's mark, pack horses at the tail and guards alongside. The party has stopped
// at a wayside shrine on the west verge, where Sister Mira rests. Elaraen sits out the heat by the milestone across the
// road. The caravan draws level with them.
const HILL_ROAD: V2[] = [
  [1.5, 34],
  [0.6, 20],
  [0, 8],
  [-0.2, -4],
  [0.6, -16],
  [2.4, -30],
  [3.0, -46],
  [1.2, -64],
  [-1.8, -84],
]
const SHRINE: V2 = [-4.6, -4.2]
// Each wagon's horse stands at the end of its tongue, 3 m ahead of the wagon's middle.
const WAGONS: V2[] = [
  [roadX(HILL_ROAD, 9.6), 9.6],
  [roadX(HILL_ROAD, 18.4), 18.4],
]
const WAGON_SPOTS: V2[] = [
  [-2.1, -1.6],
  [-1.0, -2.5],
  [-3.0, -0.4],
]
function hillRoad() {
  const objects: Obj[] = [
    ...WAGONS.map(([x, z]) => ({ type: "wagon", at: [x, z], yaw: 180 })),
    { type: "shrine", at: SHRINE, yaw: 75 },
    // A milestone on the east verge: so many leagues to Kordavos.
    { type: "standingStone", at: [3.4, -9], height: 1.0, width: 0.5, depth: 0.32, lean: 3, materials: { stone: "shrineStone" } },
    { type: "log", at: [-6.4, 3.5], yaw: 20, length: 4.5, r: 0.32 },
  ]
  write(
    `${SETS}/marquis-road.json`,
    roadSet({
      id: "marquis-road",
      title: "The Marquis Road",
      seed: 3101,
      woods: "hills",
      road: HILL_ROAD,
      width: 4.4,
      bounds: [-40, 0.4, -80, 40, 30, 40],
      clear: [
        [SHRINE[0], SHRINE[1], 3.2],
        [-2.2, -1.5, 3.4],
        [3.4, -9, 1.6],
        [3.0, -6.3, 2],
        [0.6, -6.2, 2.5],
        [-6.4, 3.5, 3],
        // Camera places.
        [-1.8, -7.5, 3],
        [2.9, -2.6, 3],
        [4.8, 4.5, 3],
        [-4.4, 14, 3],
      ],
      objects,
      // The hills behind the caravan and ahead up the road (scripts/stage-backdrops.ts).
      backdrops: [
        { map: "/stage/textures/marquis-hills.webp", arc: 140, yaw: 180, radius: 160, bottom: -4, top: 30, gain: 0.7, haze: 0.2 },
        { map: "/stage/textures/marquis-hills.webp", arc: 140, yaw: 10, radius: 160, bottom: -4, top: 30, gain: 0.7, haze: 0.2 },
      ],
      marks: {
        shrine: { at: [-3.5, -3.6], label: "the wayside shrine" },
        roadAhead: { at: [1.2, -22], label: "the road on to Kordavos" },
        caravanHead: { at: [1.6, 1.2], label: "the head of the caravan" },
        wagon: { at: [-1.9, WAGONS[0][1]], label: "the lead wagon" },
        tail: { at: [-2.0, 22.6], label: "the pack horses at the tail" },
        milestone: { at: [2.7, -8.2], label: "the milestone" },
        log: { at: [-5.6, 1.6], label: "the fallen log by the verge" },
      },
      shots: {
        caravan: { position: [2.9, 1.0, -2.6], target: [-0.2, 2.3, 3.4], fov: 52, label: "The caravan" },
        road: { position: [0.4, 1.7, 4], target: [1.8, 2.2, -40], fov: 55, label: "The road" },
        wagons: { position: [4.6, 1.7, 4.6], target: [-0.4, 1.6, 14], fov: 55, label: "The wagons" },
        shrine: { position: [0.6, 1.55, -6.2], target: [-4.4, 1.25, -3.5], fov: 50, label: "The shrine" },
      },
    })
  )
  const cast = [
    member(DMITRI, "Dmitri Volkov", "Merchant of the Volkov trading house", 2.6, "dmitri-mounted", [0.1, 2.2], [-1.8, -1.6]),
    member(ELARAEN, "Elaraen Whisperwind", "Half-elf bard", 1.8, "elaraen", [3.0, -6.3], [-1.5, -1.5]),
    member(MIRA, "Sister Mira", "Cleric of Valkara", 1.7, "sister-mira", [-3.9, -2.6], [0.4, -4]),
    member("caravan-guard-a", "Caravan guard", "Volkov house guard", 1.82, "caravan-guard-a", [2.3, 7.6], [6, -4]),
    member("draft-horse-1", "Draft horse", "Wagon horse", 2.15, "draft-horse", [WAGONS[0][0], WAGONS[0][1] - 3.1], [WAGONS[0][0], -10]),
    member("teamster", "Teamster", "Wagon driver", 1.76, "teamster", [WAGONS[0][0] - 1.2, WAGONS[0][1] - 2.9], [-1.6, -2]),
    member("draft-horse-2", "Draft horse", "Wagon horse", 2.15, "draft-horse", [WAGONS[1][0], WAGONS[1][1] - 3.1], [WAGONS[1][0], -10]),
    member("caravan-guard-b", "Caravan guard", "Volkov house guard", 1.72, "caravan-guard-b", [-2.0, 13.6], [-8, 12]),
    member("pack-horse-1", "Pack horse", "Pack horse", 2.0, "pack-horse", [roadX(HILL_ROAD, 22.8) + 0.3, 22.8], [0, -10]),
    member("pack-horse-2", "Pack horse", "Pack horse", 2.0, "pack-horse", [roadX(HILL_ROAD, 25.6) - 0.2, 25.6], [0, -10]),
    ...party(WAGON_SPOTS, DMITRI),
  ]
  staging(
    "well-met",
    "marquis-road",
    cast,
    {
      party: partyShot([2.6, 1.7, -4.6]),
      dmitri: shotOn(DMITRI, 4.4, 18, 1.5, 2.1, "Dmitri", 46),
      elaraen: shotOn(ELARAEN, 3.0, -20, 1.6, 1.5, "Elaraen"),
      mira: shotOn(MIRA, 3.0, 25, 1.55, 1.4, "Mira"),
    },
    "caravan"
  )
}

// ── The Fortune Teller: the Marquis Road nearer the city ──
// The road runs wider here between giant old trees, busy with travellers and carts both ways. Borina sits at her
// carved table on the west verge under one of the giants, facing the road, and beckons the party over.
const BUSY_ROAD: V2[] = [
  [0.4, 34],
  [0, 18],
  [-0.4, 4],
  [0.2, -10],
  [1.2, -26],
  [0.8, -44],
  [-0.6, -64],
  [-1.4, -86],
]
const TABLE: V2 = [-5.2, -1.6]
// Either side of the line from the table to the road, so the close views of her table stay clear.
const FORTUNE_SPOTS: V2[] = [
  [-3.6, -3.1],
  [-3.6, 0.0],
  [-2.8, -3.7],
]
function busyRoad() {
  const giants: [number, number, number, number][] = [
    [-8.6, -0.6, 24, 1.7],
    [6.4, -4, 26, 1.8],
    [-7.2, -14, 22, 1.5],
    [6.8, -20, 25, 1.7],
    [-6.6, 12, 22, 1.5],
    [6.2, 10, 23, 1.6],
    [-6.2, -32, 21, 1.4],
    [6.0, -38, 22, 1.5],
  ]
  const objects: Obj[] = [
    ...giants.map(([x, z, h, girth]) => ({ type: "tree", at: [x, z], kind: "ancient", height: h, girth: girth * 0.85, lean: 3 })),
    // Low, so she sits at it as in the painting, her arms on the carpet.
    { type: "fortuneTable", at: TABLE, yaw: 90, height: 0.56 },
    // The carpet she sits on, and a crate of her trinkets with a lantern hung on a pole by her shoulder.
    { type: "box", at: [TABLE[0] - 0.25, 0.01, TABLE[1]], size: [1.9, 0.02, 1.3], material: "carpet" },
    { type: "crate", at: [TABLE[0] - 0.3, TABLE[1] + 1.1], yaw: 12, size: 0.5, solid: true },
    { type: "box", at: [TABLE[0] - 0.9, 0, TABLE[1] + 1.2], size: [0.06, 2.2, 0.06], material: "tableWood" },
    { type: "lantern", at: [TABLE[0] - 0.9, 2.0, TABLE[1] + 1.0], height: 0 },
    { type: "lightShaft", at: [-3.6, -1.8], height: 24, top: 1.0, bottom: 2.8, tilt: 8, material: "sunbeam" },
    { type: "lightShaft", at: [1.2, -12], height: 24, top: 1.2, bottom: 3.2, tilt: -8, material: "sunbeam" },
    { type: "lightShaft", at: [-0.8, 10], height: 22, top: 0.9, bottom: 2.4, tilt: 6, material: "sunbeam" },
  ]
  const mix = { traveler: 3, packer: 2, pilgrim: 1, merchant: 2, woman: 2, porter: 1, child: 1 }
  write(
    `${SETS}/marquis-road-fortune.json`,
    roadSet({
      id: "marquis-road-fortune",
      title: "The Marquis Road near Kordavos",
      seed: 3102,
      woods: "giants",
      road: BUSY_ROAD,
      width: 5.0,
      bounds: [-40, 0.4, -80, 40, 30, 40],
      clear: [
        [TABLE[0], TABLE[1], 3.0],
        [-3.6, -1.6, 2.4],
        // Camera places.
        [-2.6, -1.65, 1.6],
        [2.6, 9, 3],
      ],
      objects,
      // Deeper shade than the old forest path, as in the painting: brown trunks, a thinner haze, less green in the air.
      atmosphere: {
        hemisphere: { sky: "#b4c492", ground: "#2e3420", intensity: 0.95 },
        fog: { density: 0.013, color: "#76805c", start: 8 },
        exposure: 1.0,
      },
      materials: { bark: { type: "wood", a: "#4e4232", b: "#5e5240", c: "#3c3428", plank: [0, 40], relief: 0.09, variance: 0.8, seed: 4.9, grime: 0.6 } },
      // Giant trunks fading into the haze where the scatter ends, ahead and behind (scripts/stage-backdrops.ts).
      backdrops: [
        { map: "/stage/textures/forest-path-depths.webp", arc: 120, yaw: 180, radius: 90, bottom: -7, top: 43, haze: 0.45 },
        { map: "/stage/textures/forest-path-depths.webp", arc: 120, yaw: 0, radius: 90, bottom: -7, top: 43, haze: 0.45 },
      ],
      crowd: {
        library: "realm-of-myr",
        avoid: {
          circles: [
            [TABLE[0], TABLE[1], 2.4],
            [-3.4, -1.6, 2.2],
            [-2.6, -1.65, 1.4],
          ],
          rects: [],
        },
        groups: [
          { type: "walkers", path: BUSY_ROAD.map(([x, z]) => [x + 1.2, z]), count: 34, mode: "pingpong", both: true, speed: [0.7, 1.2], lateral: [-0.9, 0.9], mix },
          { type: "walkers", path: BUSY_ROAD.map(([x, z]) => [x - 1.2, z]), count: 26, mode: "pingpong", both: true, speed: [0.7, 1.1], lateral: [-0.6, 0.6], mix },
          { type: "scatter", area: [-9, -60, 9, 30], count: 18, mix, density: [{ rect: [-2.6, -60, 2.6, 30], factor: 0 }], face: { toward: [0, -80], jitter: 60, share: 0.5 } },
        ],
      },
      marks: {
        table: { at: [-4.1, -1.6], label: "Borina's table" },
        roadAhead: { at: [1.0, -24], label: "the road on to Kordavos" },
        roadBack: { at: [0.6, 22], label: "the road back" },
        farVerge: { at: [3.6, -2], label: "the far side of the road" },
        giant: { at: [-6.0, 3.4], label: "the great tree" },
      },
      shots: {
        fortune: { position: [-2.6, 1.05, -1.65], target: [-5.6, 0.92, -1.6], fov: 42, label: "The fortune teller" },
        road: { position: [0.8, 1.7, 16], target: [0.4, 2.4, -40], fov: 55, label: "The road" },
        ball: { position: [-3.6, 1.0, -1.75], target: [-5.2, 0.72, -1.6], fov: 40, label: "The crystal ball" },
      },
    })
  )
  const cast = [member(BORINA, "Borina Runetongue", "Dwarf fortune teller", 1.2, "borina", [TABLE[0] - 0.52, TABLE[1]], [0, TABLE[1]]), ...party(FORTUNE_SPOTS, BORINA)]
  staging(
    "the-fortune-teller",
    "marquis-road-fortune",
    cast,
    {
      party: partyShot([1.8, 1.6, 2.6]),
      borina: shotOn(BORINA, 2.4, 0, 1.25, 0.95, "Borina", 44),
    },
    "fortune"
  )
}

// ── The Gates Ahead: the road before the south gate ──
// The gate set from out on the road, where the party comes over the last rise and joins the end of the line.
const GATE_SPOTS: V2[] = [
  [1.6, 80.6],
  [3.0, 81.2],
  [2.3, 79.6],
]
function gatesAhead() {
  staging(
    "the-gates-ahead",
    "kordavos-south-gate",
    party(GATE_SPOTS, [0, 0]),
    {
      // From behind them, the gate ahead beyond their shoulders.
      party: partyShot([1.8, 1.9, 4.6], "Party", 58),
    },
    "gate"
  )
}

mkdirSync(STAGINGS, { recursive: true })
hillRoad()
busyRoad()
gatesAhead()
console.log("Wrote 2 sets and 3 stagings for The Road to Kordavos.")
