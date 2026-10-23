// Writes March of Davos's street scenes from the street kit (wiki/plans/march-of-davos-sets.md): Silverhand's trail
// through the night lanes, his hideout on the waterfront, the Cowl's ambush on the way back to the inn, and the two
// endings set in the great square, at dawn and at a funeral.
//
//   pnpm exec tsx scripts/stage-sets/kordavos-streets.ts && pnpm stage:check
//
// The JSON it writes is what the app loads. Edit this file and rerun rather than editing the JSON by hand.

import { readFileSync, writeFileSync } from "node:fs"
import { LAYOUTS, type Obj, streetSet, type V2, type V3 } from "./kits/street"

const SETS = "packages/stage/src/sets/realm-of-myr"
const STAGINGS = "packages/stage/src/stagings/march-of-davos"
const ART = "/stage/fixtures/march-of-davos"
const festival = JSON.parse(readFileSync(`${STAGINGS}/the-harvest-festival.json`, "utf8"))
function write(path: string, data: unknown) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
}

// ── Cast ──
const art = (name: string, dir = ART) => ({ front: `${dir}/${name}-front.webp`, back: `${dir}/${name}-back.webp`, portrait: `${dir}/${name}-portrait.jpg` })
type Facing = string | V2 | number
const member = (id: string, name: string, role: string, height: number, file: string, at: V2, facing: Facing, extra: Obj = {}) => ({ id, name, role, height, art: art(file), at, facing, ...extra })
const party = (spots: [string, V2][], facing: Facing) => spots.map(([id, at]) => ({ ...festival.cast.find((c: Obj) => c.id === id), at, facing }))
const HEROES = ["branka-stoneveil", "cassia-verane", "yeva-softstep", "milos-radan"]
const shotOn = (subject: string, distance: number, angle: number, height: number, lookHeight: number, label: string, fov = 44) => ({ subject, distance, angle, height, lookHeight, fov, label })
const partyShot = (spots: [string, V2][], offset: V3, label = "Party", fov = 54) => ({ subjects: spots.map(([id]) => id), offset, target: [0, 1.2, 0], relative: "world", fov, label })
function staging(id: string, set: string, cast: Obj[], shots: Obj, shot: string, extra: Obj = {}) {
  write(`${STAGINGS}/${id}.json`, { format: "d20.stage.staging", version: 1, id: `march-of-davos/${id}`, set: `realm-of-myr/${set}`, cast, shots, shot, ...extra })
}
const silverhand = (at: V2, facing: Facing) => member("silverhand", "Silverhand", "Smuggler lord", 1.88, "silverhand", at, facing)
const representative = (at: V2, facing: Facing) => member("silverhand-representative", "Silverhand's representative", "Representative", 1.86, "silverhand-representative", at, facing)
const varchk = (at: V2, facing: Facing) => member("aldith", "Varchk", "Silverhand's bodyguard", 1.98, "aldith", at, facing)
const kaeleth = (at: V2, facing: Facing) => member("kaelen", "Kaeleth", "Silverhand's scout", 1.7, "kaelen", at, facing)

// A bracket lantern burning red, and a lamp light for it.
const RED = "#ff4a3a"

// ── The night lanes: Shadowing Silverhand ──
// The party comes out into the lanes behind Silverhand's people, who walk on up the street toward the crossing. Kaeleth
// has dropped back to the crossing's corner to watch the way they came.
const lanes = LAYOUTS.lanes
const LANE_MARKS: Record<string, Obj> = {
  street: { at: [0, 8], label: "the street" },
  doorway: { at: [-2.5, 2.6], label: "a dark doorway" },
  sideAlley: { at: [6.5, lanes.alley], label: "the side alley" },
  crossing: { at: [0, lanes.cross], label: "the crossing" },
  westAlley: { at: [-9, lanes.cross], label: "the west alley at the crossing" },
  eastAlley: { at: [9, lanes.cross], label: "the east alley at the crossing" },
  bridge: { at: [0, lanes.bridge + 4], label: "the archway under the bridge-house" },
  beyond: { at: [0, lanes.bridge - 8], label: "the street beyond the archway" },
}
const LANE_SHOTS = {
  lanes: { position: [-0.9, 1.65, 13.0], target: [0.3, 6.4, -40], fov: 54, label: "The lanes" },
  crossing: { position: [1.0, 1.6, -12.5], target: [-0.8, 1.9, -26], fov: 56, label: "The crossing" },
  sideAlley: { position: [1.6, 1.6, -6.0], target: [14, 1.8, -6.0], fov: 56, label: "The side alley" },
  bridge: { position: [0.6, 1.6, -32], target: [0, 4.0, -46], fov: 58, label: "The bridge-house" },
  spires: { position: [0.4, 1.3, -24], target: [0.2, 14, -80], fov: 60, label: "The spires" },
}
write(
  `${SETS}/kordavos-night-lanes.json`,
  streetSet({
    id: "kordavos-night-lanes",
    title: "Kordavos: the night lanes",
    seed: 2301,
    layout: "lanes",
    time: "night",
    laundry: true,
    marks: LANE_MARKS,
    shots: LANE_SHOTS,
    crowd: {
      groups: [
        {
          type: "points",
          people: [
            { kind: "pilgrim", at: [2.3, -30], yaw: 190 },
            { kind: "traveler", at: [-2.2, -36], yaw: 10 },
            { kind: "woman", at: [1.9, -52], yaw: 170 },
          ],
        },
      ],
    },
  })
)
const TRAIL: [string, V2][] = [
  ["branka-stoneveil", [-1.0, 9.4]],
  ["cassia-verane", [0.0, 10.0]],
  ["yeva-softstep", [-1.9, 8.6]],
  ["milos-radan", [1.0, 9.7]],
]
staging(
  "shadowing-silverhand",
  "kordavos-night-lanes",
  [...party(TRAIL, [0.2, -12]), silverhand([0.4, -12.5], [0, -40]), representative([-0.6, -11.4], [0, -40]), varchk([1.2, -10.4], [0, -40]), kaeleth([-2.2, -19.6], [0, 6])],
  {
    party: partyShot(TRAIL, [1.6, 1.7, 4.4]),
    silverhand: { subjects: ["silverhand", "silverhand-representative", "aldith"], offset: [-1.6, 1.7, 6.5], target: [0, 1.4, -2], relative: "world", fov: 46, label: "Silverhand" },
    kaeleth: shotOn("kaelen", 2.6, -20, 1.6, 1.5, "Kaeleth"),
    varchk: shotOn("aldith", 2.8, 25, 1.7, 1.65, "Varchk"),
  },
  "lanes",
  {
    exits: [
      { cast: "silverhand", when: "slips off", via: ["crossing"], to: "beyond" },
      { cast: "silverhand-representative", when: "slips off", via: ["crossing"], to: "beyond" },
      { cast: "aldith", via: ["crossing"], to: "beyond" },
      { cast: "kaelen", to: "beyond" },
    ],
  }
)

// ── The ambush: the same lanes, two flat-roofed stone houses over the street, the Cowl's archers on them ──
// The party walks back toward the inn (down the street, +z). Silas watches from the east roof and Liora from the west,
// both stone houses taller than the tenements round them. An arrow stands in a door beside the party, another ahead.
const ROOF = 12
function flatHouse(side: -1 | 1, z0: number, z1: number): Obj[] {
  const w = z1 - z0
  const zc = (z0 + z1) / 2
  const x = side * (lanes.hw + 4)
  const fx = side * lanes.hw
  const o: Obj[] = [
    { type: "box", at: [x, 0, zc], size: [8, ROOF, w], material: "stone", solid: true },
    // A heavy parapet round the roof, lower toward the street so the archers show over it.
    { type: "box", at: [fx + side * 0.15, ROOF, zc], size: [0.3, 0.5, w], material: "stoneTrim" },
    { type: "box", at: [x + side * 3.85, ROOF, zc], size: [0.3, 1.0, w], material: "stoneTrim" },
    { type: "box", at: [x, ROOF, z0 + 0.15], size: [8, 1.0, 0.3], material: "stoneTrim" },
    { type: "box", at: [x, ROOF, z1 - 0.15], size: [8, 1.0, 0.3], material: "stoneTrim" },
    { type: "box", at: [fx + side * 0.06, ROOF - 0.25, zc], size: [0.2, 0.25, w + 0.1], material: "stoneTrim" },
    { type: "box", at: [fx + side * 0.04, 3.0, zc], size: [0.16, 0.2, w], material: "stoneTrim" },
    // A plank door with a stone surround, and narrow dark windows over it.
    { type: "box", at: [fx + side * 0.02, 0, zc - 0.6], size: [0.1, 2.15, 1.05], material: "door" },
    { type: "box", at: [fx - side * 0.02, 2.15, zc - 0.6], size: [0.12, 0.22, 1.45], material: "stoneTrim" },
  ]
  for (const dz of [-w / 2 + 1.0, w / 2 - 1.0]) for (const y of [4.2, 6.4]) o.push({ type: "box", at: [fx - side * 0.02, y, zc + dz], size: [0.06, 1.1, 0.6], material: "windowDark" })
  o.push({ type: "box", at: [fx - side * 0.02, 4.2, zc - 0.6], size: [0.06, 1.1, 0.6], material: "windowDark" })
  return o
}
// An arrow struck in a surface at `tip`, its shaft running back along `dir` toward where it came from.
function arrow(tip: V3, dir: V3): Obj[] {
  const n = Math.hypot(...dir)
  const u = dir.map((v) => v / n) as V3
  const at = (k: number): V3 => [tip[0] + u[0] * k, tip[1] + u[1] * k, tip[2] + u[2] * k].map((v) => Math.round(v * 1000) / 1000) as V3
  return [
    { type: "beam", from: tip, to: at(0.68), radius: 0.01, material: "arrowShaft", segments: 5 },
    { type: "beam", from: at(0.56), to: at(0.7), radius: 0.026, radiusTo: 0.01, material: "fletching", segments: 3 },
  ]
}
const WEST: V2 = [-4, 2]
const EAST: V2 = [-15, -9]
write(
  `${SETS}/kordavos-ambush-lanes.json`,
  streetSet({
    id: "kordavos-ambush-lanes",
    title: "Kordavos: the ambush in the lanes",
    seed: 2601,
    layout: "lanes",
    time: "night",
    laundry: true,
    gaps: [
      { side: -1, z: WEST },
      { side: 1, z: EAST },
    ],
    objects: [
      ...flatHouse(-1, WEST[0], WEST[1]),
      ...flatHouse(1, EAST[0], EAST[1]),
      // The first arrow, in the west house's door beside the party; the second in the east wall ahead.
      ...arrow([-2.98, 1.45, -1.2], [0.75, 0.62, -0.15]),
      ...arrow([2.98, 2.3, -16.2], [-0.8, 0.55, 0.2]),
    ],
    materials: {
      arrowShaft: { type: "plain", color: "#5a4632", roughness: 0.8 },
      fletching: { type: "plain", color: "#141414", roughness: 1 },
    },
    marks: {
      ...LANE_MARKS,
      westRoof: { at: [-5.2, -1.0] },
      eastRoof: { at: [5.2, -12.0] },
      arrowDoor: { at: [-2.3, -1.2], label: "the door with the arrow in it" },
    },
    shots: {
      ...LANE_SHOTS,
      // As the painting: from the roof behind the west archer, down the long lane between the roofs.
      lanes: { position: [-2.3, ROOF + 1.9, 2.2], target: [0.6, 4.0, -40], fov: 58, label: "The rooftops" },
      arrow: { position: [-1.4, 1.6, 0.2], target: [-2.9, 1.5, -1.2], fov: 40, label: "The arrow" },
    },
  })
)
const WALK: [string, V2][] = [
  ["branka-stoneveil", [-0.9, -6.4]],
  ["cassia-verane", [0.3, -5.8]],
  ["yeva-softstep", [-1.7, -4.4]],
  ["milos-radan", [1.2, -4.9]],
]
staging(
  "the-ambush",
  "kordavos-ambush-lanes",
  [
    ...party(WALK, [0, 12]),
    member("silas", "A hooded archer", "Cowl rogue", 1.8, "silas", [3.5, -12.2], [0, -5.5], { y: ROOF }),
    member("liora", "A hooded archer", "Cowl assassin", 1.72, "cowl-archer", [-3.5, -1.4], [0, -5.5], { y: ROOF }),
  ],
  {
    party: partyShot(WALK, [2.0, 1.8, 4.6]),
    silas: shotOn("silas", 4.2, 10, 1.2, 1.4, "The archer on the east roof", 48),
    liora: shotOn("liora", 4.2, -10, 1.2, 1.4, "The archer on the west roof", 48),
  },
  "lanes",
  {
    exits: [
      { cast: "silas", when: "melt away", to: [6.8, -12.2] },
      { cast: "liora", when: "melt away", to: [-6.8, -1.4] },
    ],
  }
)

// ── The waterfront: The Hideout ──
// A lane of old stone houses down to the quay, sea mist rolling in. The abandoned warehouse stands on the east side
// near the water: weathered boards on a stone footing, its windows boarded, its rusted iron door hanging loose under a
// red lantern. Varchk and Kaeleth keep its door; Silverhand slips in out of the mist.
const wf = LAYOUTS.waterfront
const HIDE: V2 = [-29, -16]
const hz = (HIDE[0] + HIDE[1]) / 2
const hx = wf.hw
const DOOR_Z = hz + 1.2
function hideout(): Obj[] {
  const w = HIDE[1] - HIDE[0]
  const o: Obj[] = [
    // The front: an old stone ground storey cut by the iron door and a barred window, weathered boards above with their
    // windows boarded up.
    {
      type: "wall",
      at: [hx + 0.15, hz],
      yaw: -90,
      length: w,
      height: 3.4,
      thickness: 0.3,
      a: { finish: "stone", wainscot: 0, studs: 0, rail: 0 },
      b: { finish: "stone", wainscot: 0, studs: 0, rail: 0 },
      openings: [
        { at: DOOR_Z - hz, width: 1.6, height: 2.5, kind: "door", leaf: 38 },
        { at: -3.4, width: 1.1, height: 0.9, sill: 1.3, kind: "window" },
      ],
      materials: { wall: "stone", door: "rustIron", panel: "rustIron", stone: "stone", glassOut: "windowDark", glass: "windowDark" },
    },
    // The boarded storey above: a plain box, since a wall's footprint up here would stop walks through the door below.
    { type: "box", at: [hx + 0.35, 3.4, hz], size: [0.3, 3.8, w], material: "weatherboard" },
    ...[-4.4, 0.8, 4.4].map((dz) => ({ type: "box", at: [hx + 0.18, 4.2, hz + dz], size: [0.04, 1.2, 1.0], material: "windowDark" })),
    { type: "box", at: [hx + 0.15, 3.3, hz], size: [0.5, 0.2, w], material: "stoneTrim" },
    // A worn stone surround to the door.
    { type: "box", at: [hx - 0.02, 0, DOOR_Z - 0.92], size: [0.12, 2.6, 0.24], material: "stoneTrim" },
    { type: "box", at: [hx - 0.02, 0, DOOR_Z + 0.92], size: [0.12, 2.6, 0.24], material: "stoneTrim" },
    { type: "box", at: [hx - 0.02, 2.5, DOOR_Z], size: [0.14, 0.3, 2.1], material: "stoneTrim" },
    // The body behind it, a dark entry inside the door, and a low pitched roof of old slates.
    { type: "box", at: [hx + 5.2, 0, hz], size: [6, 7.2, w], material: "weatherboard", solid: true },
    { type: "box", at: [hx + 2.1, 0, DOOR_Z], size: [0.1, 2.6, 2.2], material: "void" },
    { type: "box", at: [hx + 1.2, 2.6, DOOR_Z], size: [1.9, 0.1, 2.2], material: "void" },
    { type: "box", at: [hx + 4.2, 7.2, hz], size: [8.6, 0.25, w + 0.6], material: "roof" },
    { type: "box", at: [hx + 4.2, 7.45, hz], size: [5.6, 0.9, w + 0.4], material: "roof" },
    { type: "box", at: [hx + 4.2, 8.35, hz], size: [2.4, 0.6, w + 0.2], material: "roof" },
    // A red lantern by the door, and one dim lamp further up.
    { type: "wallLantern", at: [hx - 0.02, 2.9, DOOR_Z - 1.5], yaw: -90, reach: 0.45, materials: { glow: "lampRed" } },
  ]
  // Boards nailed across the windows.
  for (const z of [hz + 4.4, hz - 0.8, hz - 4.4]) o.push({ type: "boards", at: [hx + 0.16, 4.0, z], yaw: -90, width: 1.3, height: 1.6, planks: 4 })
  // Crates and debris heaped by the quay end, hiding a back way in.
  const heap: [string, number, number, Obj][] = [
    ["crate", hx - 0.6, HIDE[0] + 0.9, { size: 0.9 }],
    ["crate", hx - 0.5, HIDE[0] + 1.9, { size: 0.7 }],
    ["barrel", hx - 0.55, HIDE[0] + 2.8, { r: 0.36, h: 1.0 }],
    ["crate", hx - 1.3, HIDE[0] + 1.3, { size: 0.6 }],
    ["barrel", hx - 0.5, DOOR_Z + 1.4, { r: 0.34, h: 0.95 }],
    ["barrel", hx - 0.55, DOOR_Z + 2.2, { r: 0.3, h: 0.85 }],
    ["sack", hx - 0.7, DOOR_Z + 2.9, { size: 0.55 }],
  ]
  for (const [type, x, z, p] of heap) o.push({ type, at: [x, z], yaw: (x * 37 + z * 11) % 40, ...p })
  o.push({ type: "crate", at: [hx - 0.6, 0.9, HIDE[0] + 1.0], yaw: 15, size: 0.6 })
  // Fallen masonry across the lane's far end, as the painting has it.
  for (const [x, z, s] of [
    [-3.4, -26.5, 0.5],
    [-2.6, -27.8, 0.35],
    [-3.7, -28.6, 0.42],
  ])
    o.push({ type: "rock", at: [x, z], size: s, materials: { rock: "stoneTrim" } })
  return o
}
write(
  `${SETS}/kordavos-waterfront.json`,
  streetSet({
    id: "kordavos-waterfront",
    title: "Kordavos: the waterfront at night",
    seed: 2401,
    layout: "waterfront",
    time: "night",
    fronts: "stone",
    laundry: false,
    fog: 0.05,
    spires: false,
    // The sky lost in sea mist.
    atmosphere: { sky: { horizon: "#6e8c90", mid: "#56747a", zenith: "#2c4248", gain: 0.6, clouds: 0.1, stars: 0, moon: 2.0 } },
    gaps: [{ side: 1, z: HIDE }],
    sun: [-0.35, 0.4, -0.85],
    objects: [
      ...hideout(),
      // Banks of sea mist over the water and rolling up the lane.
      { type: "mist", at: [0, -3.4, wf.far - 14], width: 60, height: 9, layers: 3, spacing: 9 },
      { type: "mist", at: [0, -0.6, wf.far - 2], width: 18, height: 5, layers: 2, spacing: 5 },
      { type: "mist", at: [0, -0.8, -10], width: 10, height: 3.2, layers: 2, spacing: 8 },
    ],
    lights: [
      { at: [hx - 1.0, 2.5, DOOR_Z - 1.5], color: RED, intensity: 3.5, distance: 6 },
      { at: [hx - 0.4, 1.3, DOOR_Z], color: "#ffb070", intensity: 1.5, distance: 3 },
    ],
    materials: {
      mist: { type: "mist", color: "#8eb0b2", opacity: 0.32 },
      weatherboard: { type: "painted", map: "/stage/textures/timber-hold.jpg", tint: "#7c7870", plank: [0.22, 4], size: [0.7, 2.2], relief: 0.1, grime: 2.2, nails: 0.5 },
      rustIron: { type: "metal", color: "#4a3428", roughness: 0.85, metalness: 0.5 },
      lampRed: { type: "plain", color: "#000000", roughness: 1, emissive: RED, emissiveIntensity: 2.6 },
    },
    marks: {
      lane: { at: [0, 4], label: "the lane" },
      shadows: { at: [-wf.hw + 0.7, -12], label: "the shadows across the lane" },
      door: { at: [hx - 1.0, DOOR_Z], label: "the hideout's door" },
      crates: { at: [hx - 2.2, HIDE[0] + 1.6], label: "the crates heaped by the warehouse" },
      quay: { at: [0, wf.far - 5.5], label: "the quay's edge" },
      inside: { at: [hx + 1.4, DOOR_Z] },
    },
    shots: {
      waterfront: { position: [-0.4, 1.6, -1.0], target: [1.4, 3.4, -30], fov: 56, label: "The waterfront" },
      hideout: { position: [-2.4, 1.6, -18], target: [hx + 0.2, 2.2, DOOR_Z], fov: 50, label: "The hideout" },
      lantern: { position: [hx - 2.6, 2.2, DOOR_Z - 3.4], target: [hx, 2.6, DOOR_Z - 1.4], fov: 46, label: "The red lantern" },
      quay: { position: [0.5, 1.7, -24], target: [-2, 3, -60], fov: 58, label: "The quay" },
      lane: { position: [1.2, 1.7, -24], target: [-0.4, 3.2, 4], fov: 56, label: "The lane" },
    },
  })
)
const WATCH: [string, V2][] = [
  ["branka-stoneveil", [-2.6, -6.6]],
  ["cassia-verane", [-1.7, -5.8]],
  ["yeva-softstep", [-3.3, -7.8]],
  ["milos-radan", [-1.0, -6.9]],
]
staging(
  "the-hideout",
  "kordavos-waterfront",
  [...party(WATCH, [hx, DOOR_Z]), varchk([hx - 1.1, DOOR_Z - 1.5], [-2, DOOR_Z - 4]), kaeleth([hx - 1.3, DOOR_Z + 1.2], [-2, DOOR_Z + 6]), silverhand([0.6, DOOR_Z + 2.5], [hx, DOOR_Z])],
  {
    party: partyShot(WATCH, [2.2, 1.7, 4.2]),
    guards: { subjects: ["aldith", "kaelen"], offset: [-4.6, 1.7, 0.6], target: [0, 1.5, 0], relative: "world", fov: 50, label: "The guards" },
    varchk: shotOn("aldith", 2.8, 0, 1.75, 1.7, "Varchk"),
    kaeleth: shotOn("kaelen", 2.5, 10, 1.6, 1.5, "Kaeleth"),
  },
  "waterfront",
  { exits: [{ cast: "silverhand", when: "vanishes", to: "inside" }] }
)

// ── The square at dawn: The New Dawn ──
// The great house's balcony over the square, hung with the old colours of Valkara. Joran raises the Key; Seraphina
// stands at his shoulder. The square below is full.
const sq = LAYOUTS.square
const BALCONY_Y = 4.24
const BALCONY_Z = sq.far + 0.5
// Banners hung down the great house and the houses along the square, in the colours of the scene.
function banners(material: string, heights: [number, number]): Obj[] {
  const o: Obj[] = []
  for (const x of [-11, -5.4, 5.4, 11]) o.push({ type: "banner", at: [x, heights[0], sq.far + 0.12], w: 1.6, h: heights[1], material })
  for (const z of [-8, -20, -30]) for (const s of [-1, 1]) o.push({ type: "banner", at: [s * (sq.sq - 0.12), 8.4, z], yaw: s < 0 ? 90 : -90, w: 1.3, h: 4.6, material })
  return o
}
const SQUARE_MARKS = {
  street: { at: [0, 8], label: "the street into the square" },
  square: { at: [0, -14], label: "the square" },
  steps: { at: [0, sq.far + 3.4], label: "the steps of the great house" },
  balcony: { at: [0, BALCONY_Z], label: "the balcony" },
  west: { at: [-10, -18], label: "the west side of the square" },
  east: { at: [10, -18], label: "the east side of the square" },
}
write(
  `${SETS}/kordavos-square-dawn.json`,
  streetSet({
    id: "kordavos-square-dawn",
    title: "Kordavos: the great square at dawn",
    seed: 4701,
    layout: "square",
    time: "dawn",
    sun: [0.62, 0.24, 0.74],
    signs: true,
    objects: banners("bannerValkaran", [12.4, 6]),
    materials: { bannerValkaran: { type: "cloth", color: "#2f5a3a", heraldry: "valkaran" } },
    marks: SQUARE_MARKS,
    shots: {
      square: { position: [-1.4, 1.7, 3.0], target: [0.4, 5.0, -36], fov: 54, label: "The square" },
      balcony: { position: [1.5, 1.6, -27], target: [0, 5.6, sq.far], fov: 46, label: "The balcony" },
      crowd: { position: [-11, 2.4, -30], target: [4, 1.4, -8], fov: 58, label: "The crowd" },
    },
    crowd: {
      groups: [
        {
          type: "scatter",
          area: [-sq.sq + 0.8, sq.far + 4.5, sq.sq - 0.8, -2],
          count: 220,
          mix: { traveler: 3, pilgrim: 2, merchant: 1, woman: 3, porter: 1, child: 1 },
          density: [{ rect: [-3, -16, 3, -2], factor: 0.15 }],
          face: { toward: [0, sq.far], jitter: 25, share: 0.9 },
        },
      ],
      avoid: [
        [0, -12, 3.6],
        [1.5, -27, 1.6],
      ],
    },
  })
)
const DAWN: [string, V2][] = [
  ["branka-stoneveil", [-1.0, -11.6]],
  ["cassia-verane", [0.1, -12.2]],
  ["yeva-softstep", [1.0, -11.2]],
  ["milos-radan", [-0.2, -10.6]],
]
staging(
  "the-new-dawn",
  "kordavos-square-dawn",
  [
    ...party(DAWN, [0, sq.far]),
    member("joran-antonov", "Joran Antonov", "Champion of the Covenant", 1.82, "joran", [-0.8, BALCONY_Z], [0, -10], { y: BALCONY_Y }),
    member("seraphina-valtor", "Seraphina Valtor", "Head of the Valtor clan", 1.7, "seraphina", [1.1, BALCONY_Z - 0.1], [0, -10], { y: BALCONY_Y }),
  ],
  {
    party: partyShot(DAWN, [2.0, 1.8, 4.4]),
    joran: shotOn("joran-antonov", 3.4, 0, 0.3, 1.6, "Joran", 46),
    seraphina: shotOn("seraphina-valtor", 3.0, -10, 0.3, 1.5, "Seraphina", 44),
  },
  "square"
)

// ── The square by day: Vengeance of the Blackthorn ──
// Thaddeus lies in state on a draped bier before the great house, under black banners. Asterian soldiers keep an aisle
// from the bier to the street; the city stands behind them. Lady Astrid speaks over the coffin.
const BIER: V2 = [0, -24]
function bier(): Obj[] {
  const [x, z] = BIER
  return [
    { type: "box", at: [x, 0, z], size: [3.4, 0.3, 4.6], material: "ashlarTrim", solid: true },
    { type: "box", at: [x, 0.3, z], size: [2.8, 0.3, 4.0], material: "ashlarTrim" },
    { type: "box", at: [x, 0.6, z], size: [1.6, 0.5, 2.8], material: "pall" },
    { type: "box", at: [x, 1.1, z], size: [0.8, 0.5, 2.2], material: "coffin" },
    { type: "box", at: [x, 1.6, z], size: [0.86, 0.08, 2.26], material: "coffin" },
    { type: "box", at: [x, 1.62, z], size: [1.0, 0.04, 1.5], material: "pall" },
    { type: "box", at: [x, 1.68, z + 0.5], size: [0.1, 0.03, 0.9], material: "gilt" },
    { type: "box", at: [x, 1.68, z + 0.75], size: [0.5, 0.03, 0.1], material: "gilt" },
    // Tall candle stands at its corners.
    ...[
      [-1.5, -2.1],
      [1.5, -2.1],
      [-1.5, 2.1],
      [1.5, 2.1],
    ].map(([dx, dz]) => ({ type: "candleStand", at: [x + dx, z + dz] })),
  ]
}
write(
  `${SETS}/kordavos-square-funeral.json`,
  streetSet({
    id: "kordavos-square-funeral",
    title: "Kordavos: the great square at the funeral",
    seed: 4801,
    layout: "square",
    time: "day",
    signs: true,
    objects: [...banners("bannerBlack", [12.4, 7]), ...bier()],
    materials: {
      bannerBlack: { type: "cloth", color: "#141416" },
      pall: { type: "cloth", color: "#121214", amp: 0, shadow: true },
      coffin: { type: "wood", a: "#2a1a12", b: "#33201a", c: "#22160e", plank: [0, 40], relief: 0.02 },
    },
    marks: {
      ...SQUARE_MARKS,
      bier: { at: [BIER[0], BIER[1] + 3.2], label: "the bier" },
    },
    shots: {
      square: { position: [-1.2, 1.7, 4.0], target: [0.3, 4.0, -36], fov: 54, label: "The square" },
      bier: { position: [3.2, 1.6, -16.5], target: [0, 1.4, -24], fov: 48, label: "The bier" },
      soldiers: { position: [-2.0, 1.7, -6], target: [3.2, 1.5, -18], fov: 52, label: "The soldiers" },
    },
    crowd: {
      groups: [
        // Two ranks of soldiers along the aisle, facing in, and a guard before the great house.
        { type: "line", from: [-2.6, -4], to: [-2.6, -19.5], count: 12, mix: { soldier: 1 }, yaw: 90 },
        { type: "line", from: [2.6, -4], to: [2.6, -19.5], count: 12, mix: { soldier: 1 }, yaw: -90 },
        { type: "line", from: [-6, sq.far + 2], to: [6, sq.far + 2], count: 8, mix: { knight: 1 }, yaw: 0 },
        {
          type: "scatter",
          area: [-sq.sq + 0.8, sq.far + 4.5, sq.sq - 0.8, -2],
          count: 200,
          mix: { traveler: 3, pilgrim: 2, merchant: 2, woman: 3, child: 1 },
          density: [
            { rect: [-4, -21, 4, -2], factor: 0 },
            { rect: [-3, -29, 3, -19], factor: 0 },
          ],
          face: { toward: BIER, jitter: 25, share: 0.9 },
        },
      ],
      avoid: [
        [0, -12, 3.0],
        [3.2, -16.5, 1.5],
      ],
    },
  })
)
const FUNERAL: [string, V2][] = [
  ["branka-stoneveil", [-1.0, -8.6]],
  ["cassia-verane", [0.2, -9.2]],
  ["yeva-softstep", [1.0, -8.2]],
  ["milos-radan", [-0.1, -7.6]],
]
staging(
  "vengeance-of-the-blackthorn",
  "kordavos-square-funeral",
  [...party(FUNERAL, BIER), member("astrid-blackthorn", "Lady Astrid Blackthorn", "Head of House Blackthorn", 1.78, "astrid-blackthorn", [BIER[0] + 0.4, BIER[1] + 3.0], [0, -8])],
  {
    party: partyShot(FUNERAL, [2.0, 1.8, 4.4]),
    astrid: shotOn("astrid-blackthorn", 2.6, 15, 1.65, 1.6, "Lady Astrid"),
  },
  "square"
)

console.log("wrote 5 street sets and 5 stagings")
void HEROES
