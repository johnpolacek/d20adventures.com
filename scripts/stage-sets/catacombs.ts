// Writes March of Davos's catacombs from the tunnel kit (wiki/plans/march-of-davos-sets.md): the powder chamber where
// the Covenant lays its fuse, the forking labyrinth that ends at a blank wall, the same wall with its black iron door
// revealed, and the vast empty hall beyond it. And their stagings.
//
//   pnpm exec tsx scripts/stage-sets/catacombs.ts && pnpm stage:check
//
// The JSON it writes is what the app loads. Edit this file and rerun rather than editing the JSON by hand.

import { readFileSync, writeFileSync } from "node:fs"
import type { Obj, V2, V3 } from "./kits/street"
import { crystals, mouth, portal, tunnelSet } from "./kits/tunnel"

const SETS = "packages/stage/src/sets/realm-of-myr"
const STAGINGS = "packages/stage/src/stagings/march-of-davos"
const ART = "/stage/fixtures/march-of-davos"
const festival = JSON.parse(readFileSync(`${STAGINGS}/the-harvest-festival.json`, "utf8"))
function write(path: string, data: unknown) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
}
const r2 = (n: number) => Math.round(n * 100) / 100

const art = (name: string) => ({ front: `${ART}/${name}-front.webp`, back: `${ART}/${name}-back.webp`, portrait: `${ART}/${name}-portrait.jpg` })
type Facing = string | V2 | number
const member = (id: string, name: string, role: string, height: number, file: string, at: V2, facing: Facing) => ({ id, name, role, height, art: art(file), at, facing })
const party = (spots: [string, V2][], facing: Facing) => spots.map(([id, at]) => ({ ...festival.cast.find((c: Obj) => c.id === id), at, facing }))
const partyShot = (spots: [string, V2][], offset: V3, label = "Party", fov = 54) => ({ subjects: spots.map(([id]) => id), offset, target: [0, 1.2, 0], relative: "world", fov, label })
const shotOn = (subject: string, distance: number, angle: number, height: number, lookHeight: number, label: string, fov = 44) => ({ subject, distance, angle, height, lookHeight, fov, label })
function staging(id: string, set: string, cast: Obj[], shots: Obj, shot: string, extra: Obj = {}) {
  write(`${STAGINGS}/${id}.json`, { format: "d20.stage.staging", version: 1, id: `march-of-davos/${id}`, set: `realm-of-myr/${set}`, cast, shots, shot, ...extra })
}
const astrid = (at: V2, facing: Facing) => member("astrid-blackthorn", "Lady Astrid Blackthorn", "Blackthorn ranger", 1.78, "astrid-blackthorn", at, facing)
const eamon = (at: V2, facing: Facing) => member("eamon", "Eamon", "Scholar and mage", 1.78, "eamon", at, facing)
// A solid footprint under the floor for something round the walks must go around (a pillar).
const block = (at: V2, r: number): Obj => ({ type: "box", at: [at[0], -0.4, at[1]], size: [r * 2, 0.05, r * 2], material: "tunnelFloor", solid: true })
// A fuse laid along the floor through `pts`, an ember at its last point.
function fuse(pts: V2[]): Obj[] {
  const o: Obj[] = []
  for (let i = 0; i < pts.length - 1; i++) o.push({ type: "beam", from: [pts[i][0], 0.02, pts[i][1]], to: [pts[i + 1][0], 0.02, pts[i + 1][1]], radius: 0.012, material: "fuse", segments: 4 })
  const e = pts[pts.length - 1]
  o.push({ type: "sphere", at: [e[0], 0.03, e[1]], radius: 0.05, material: "ember", segments: 8 })
  return o
}

// ── The powder chamber: Into the Catacombs ──
// A long laid-stone bore runs down from the grate to a cave chamber held up by four rough pillars. Four of the
// Covenant are setting six powder kegs against the pillars, a long fuse snaking across the floor to the one who kneels to
// light it. The bore goes on beyond the chamber into the dark.
const PIL: V2[] = [
  [-3, 2.8],
  [3, 2.8],
  [-3, -2.8],
  [3, -2.8],
]
function powderChamber(): Obj[] {
  const [, aOut] = mouth([0, 0], 7, 7, 0, 0)
  const [cIn] = mouth([0, 0], 7, 7, 180, 0)
  const o: Obj[] = [
    {
      type: "bore",
      path: [
        [0, 26],
        [0, aOut[1] - 0.8],
      ],
      width: 2.8,
      walls: 1.5,
      rough: 0.04,
      caps: [true, false],
      materials: { wall: "tunnelStone" },
    },
    {
      type: "cave",
      at: [0, 0],
      rx: 7,
      rz: 7,
      height: 6,
      rough: 0.7,
      mouths: [
        { at: 0, width: 3.3, height: 3.2 },
        { at: 180, width: 3.1, height: 3.1 },
      ],
    },
    { type: "bore", path: [cIn, [0, -16], [2.5, -24]], width: 2.6, walls: 1.3, rough: 0.35, caps: [false, true] },
    ...portal([0, 0], 7, 7, 0, 2.9, 2.95),
    ...portal([0, 0], 7, 7, 180, 2.7, 2.65),
  ]
  // Pillars of rough stone into the dome.
  for (const p of PIL) o.push({ type: "cylinder", at: [p[0], 0, p[1]], radius: [0.55, 0.62], height: 6.4, segments: 10, material: "tunnelRock" }, block(p, 0.62))
  // Powder kegs against the pillars, two more by the far mouth, crates of powder.
  const kegs: V2[] = [
    [-2.35, 2.2],
    [2.35, 2.2],
    [-2.35, -2.2],
    [2.35, -2.2],
    [-1.0, -5.2],
    [1.0, -5.3],
  ]
  for (const k of kegs) o.push({ type: "barrel", at: k, r: 0.32, h: 0.85, solid: true })
  o.push({ type: "crate", at: [-4.6, -3.6], yaw: 20, size: 0.7, stack: true, solid: true }, { type: "crate", at: [4.4, -4.0], yaw: -15, size: 0.65, solid: true })
  // The fuse from keg to keg, then off to where the cultist kneels.
  o.push(
    ...fuse([
      [-2.0, 2.0],
      [-0.6, 1.2],
      [2.0, 2.0],
      [1.6, 0.4],
      [2.0, -2.0],
      [0.4, -2.4],
      [-2.0, -2.0],
      [-1.2, -3.4],
      [-0.8, -4.9],
      [0.2, -4.4],
      [1.0, -5.0],
      [1.6, -3.9],
    ])
  )
  // Torches along the bore, a cultist's lantern on the chamber floor.
  for (const [s, z] of [
    [-1, 21],
    [1, 15.5],
    [-1, 10],
  ])
    o.push({ type: "torch", at: [s * 1.36, 1.85, z], yaw: s < 0 ? 90 : -90 })
  o.push({ type: "lantern", at: [-1.8, 0, -0.8] }, { type: "lantern", at: [2.4, 0, -4.4] })
  return o
}
const POWDER_MARKS = {
  tunnel: { at: [0, 12], label: "the tunnel" },
  chamber: { at: [0, 0], label: "the chamber" },
  barrels: { at: [-1.6, 1.6], label: "the barrels by the pillars" },
  fuse: { at: [1.6, -3.4], label: "the end of the fuse" },
  onward: { at: [0, -8], label: "the tunnel on" },
}
write(
  `${SETS}/catacombs-powder.json`,
  tunnelSet({
    id: "catacombs-powder",
    title: "The catacombs: the powder chamber",
    seed: 4101,
    tone: "green",
    bounds: [-6.4, 0.3, -12, 6.4, 5.4, 25],
    objects: powderChamber(),
    lights: [
      { at: [-1.0, 2.0, 21], color: "#ffa850", intensity: 4, distance: 6 },
      { at: [1.0, 2.0, 15.5], color: "#ffa850", intensity: 4, distance: 6 },
      { at: [-1.0, 2.0, 10], color: "#ffa850", intensity: 4, distance: 6 },
      // The chamber, lit greenish-gold by the cultists' lanterns, as in the painting.
      { at: [-1.6, 0.9, -0.6], color: "#d8e070", intensity: 10, distance: 9 },
      { at: [2.3, 0.9, -4.0], color: "#d8e070", intensity: 9, distance: 8 },
      { at: [0, 4.0, 0], color: "#9ac8a0", intensity: 8, distance: 12 },
      { at: [1.6, 0.25, -3.9], color: "#ff7a30", intensity: 1.2, distance: 2 },
    ],
    marks: POWDER_MARKS,
    shots: {
      catacombs: { position: [0.4, 1.8, 15.0], target: [0, 1.1, -2], fov: 48, label: "The catacombs" },
      chamber: { position: [0.0, 1.7, 5.4], target: [0, 0.8, -4], fov: 60, label: "The chamber" },
      barrels: { position: [-0.4, 1.0, 0.6], target: [-2.4, 0.5, 2.3], fov: 54, label: "The barrels" },
      fuse: { position: [0.2, 1.1, -1.8], target: [1.6, 0.0, -4.0], fov: 50, label: "The fuse" },
    },
    crowd: {
      library: "realm-of-myr",
      groups: [
        {
          type: "points",
          people: [
            { kind: "soldier", at: [-0.6, 18.0], yaw: 180 },
            { kind: "soldier", at: [0.6, 18.8], yaw: 180 },
            { kind: "soldier", at: [-0.2, 19.8], yaw: 180 },
          ],
        },
      ],
    },
  })
)
const POWDER: [string, V2][] = [
  ["branka-stoneveil", [-0.8, 9.6]],
  ["cassia-verane", [0.3, 10.2]],
  ["yeva-softstep", [-0.3, 11.2]],
  ["milos-radan", [0.9, 11.0]],
]
staging(
  "into-the-catacombs",
  "catacombs-powder",
  [
    ...party(POWDER, [0, 0]),
    astrid([-0.6, 8.2], [0, 0]),
    eamon([0.8, 8.6], [0, 0]),
    member("covenant-rogue", "A Covenant rogue", "Covenant rogue", 1.78, "covenant-rogue", [-1.9, 0.4], [0, 8]),
    member("covenant-rogue-2", "A Covenant rogue", "Covenant rogue", 1.78, "covenant-rogue", [2.0, 0.9], [0, 8]),
    member("covenant-cultist", "A Covenant cultist", "Cowl cultist", 1.68, "covenant-cultist", [1.9, -3.4], [1.6, -3.9]),
    member("covenant-cultist-2", "A Covenant cultist", "Cowl cultist", 1.68, "covenant-cultist", [-1.6, -1.6], [-2.35, -2.2]),
  ],
  {
    party: partyShot(POWDER, [1.2, 1.7, 4.2]),
    astrid: shotOn("astrid-blackthorn", 2.4, 20, 1.65, 1.6, "Lady Astrid"),
    eamon: shotOn("eamon", 2.4, -20, 1.65, 1.6, "Eamon"),
    cultists: {
      subjects: ["covenant-cultist", "covenant-cultist-2", "covenant-rogue", "covenant-rogue-2"],
      offset: [0, 1.7, 7.5],
      target: [0, 1.0, 0],
      relative: "world",
      fov: 54,
      label: "The Covenant",
    },
  },
  "catacombs"
)

// ── The labyrinth and the sealed door: Through the Labyrinth, The Sealed Door ──
// A rough bore comes down into a cave where the way splits. Crystal-set runes glow in the walls. The right fork runs off
// into the dark; the left bends twice and ends at a seamless wall. In the second set the wall is a black iron door of
// glowing sigils, rimed with frost.
const E_R = 5.2
const [fIn] = mouth([0, 0], E_R, E_R, 150, 0)
const [gIn] = mouth([0, 0], E_R, E_R, 210, 0)
const G_PATH: V2[] = [gIn, [-6.5, -11.3], [-7.0, -17], [-3.5, -21.5]]
const DOOR = G_PATH[3]
const leg = [DOOR[0] - G_PATH[2][0], DOOR[1] - G_PATH[2][1]]
const legLen = Math.hypot(leg[0], leg[1])
const dir: V2 = [leg[0] / legLen, leg[1] / legLen]
const left: V2 = [-dir[1], dir[0]]
const onLeg = (t: number, side = 0): V2 => [r2(G_PATH[2][0] + leg[0] * t + left[0] * side), r2(G_PATH[2][1] + leg[1] * t + left[1] * side)]
const at3 = (q: V2, y: number): V3 => [q[0], y, q[1]]
const doorYaw = Math.round((Math.atan2(-dir[0], -dir[1]) * 180) / Math.PI)
function labyrinth(door: boolean): Obj[] {
  const o: Obj[] = [
    {
      type: "bore",
      path: [
        [0, 22],
        [0, E_R - 0.4],
      ],
      width: 2.6,
      walls: 1.3,
      rough: 0.35,
      caps: [true, false],
    },
    {
      type: "cave",
      at: [0, 0],
      rx: E_R,
      rz: E_R,
      height: 5,
      rough: 0.9,
      mouths: [
        { at: 0, width: 3.1, height: 3.0 },
        { at: 150, width: 3.1, height: 3.0 },
        { at: 210, width: 3.1, height: 3.0 },
      ],
    },
    { type: "bore", path: [fIn, [7.5, -13], [9, -24]], width: 2.6, walls: 1.3, rough: 0.4, caps: [false, true] },
    { type: "bore", path: G_PATH, width: 2.6, walls: 1.3, rough: 0.4, caps: [false, true] },
    ...portal([0, 0], E_R, E_R, 0, 2.7, 2.65),
    ...portal([0, 0], E_R, E_R, 150, 2.7, 2.65),
    ...portal([0, 0], E_R, E_R, 210, 2.7, 2.65),
  ]
  // Crystal runes in the cave's walls and along the left fork.
  for (const b of [60, 110, 300]) {
    const a = (b * Math.PI) / 180
    o.push(...crystals([r2(Math.sin(a) * (E_R - 0.5)), 1.7, r2(Math.cos(a) * (E_R - 0.5))], [-Math.sin(a), -Math.cos(a)], 6, 0.36))
  }
  o.push(...crystals([-4.6, 1.5, -8.6], [0.85, 0.5], 5, 0.3), ...crystals([-7.8, 1.6, -14.6], [1, 0], 4, 0.28))
  // The party's lantern set down in the cave, and a cold mist drifting out of the forks.
  o.push({ type: "lantern", at: [0.9, 0, 1.6] }, { type: "mist", at: [0, -0.4, -3.6], width: 9, height: 2.2, layers: 2, spacing: 2.2 })
  if (door) {
    // The black iron door set in the wall, a carved stone frame round it, sigils glowing on its face: a ring, a star
    // inside it, runes round the edge. Frost on the floor before it.
    const d = (x: number, y: number, zz: number): V3 => [r2(DOOR[0] - dir[0] * zz + left[0] * x), y, r2(DOOR[1] - dir[1] * zz + left[1] * x)]
    o.push(
      { type: "box", at: d(0, 0, 0.5), yaw: doorYaw, size: [1.9, 2.7, 0.3], material: "ironBlack", solid: true },
      { type: "box", at: d(-1.15, 0, 0.55), yaw: doorYaw, size: [0.4, 3.0, 0.5], material: "arch" },
      { type: "box", at: d(1.15, 0, 0.55), yaw: doorYaw, size: [0.4, 3.0, 0.5], material: "arch" },
      { type: "box", at: d(0, 2.7, 0.55), yaw: doorYaw, size: [2.7, 0.4, 0.5], material: "arch" },
      { type: "torus", at: d(0, 1.5, 0.66), yaw: doorYaw, radius: 0.62, tube: 0.035, segments: 40, material: "sigil" },
      { type: "torus", at: d(0, 1.5, 0.66), yaw: doorYaw, radius: 0.36, tube: 0.025, segments: 32, material: "sigil" }
    )
    // Eight spokes from the inner ring to the outer, a knot at the centre.
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4
      const p0 = d(Math.sin(a) * 0.36, 1.5 + Math.cos(a) * 0.36, 0.67)
      const p1 = d(Math.sin(a) * 0.6, 1.5 + Math.cos(a) * 0.6, 0.67)
      o.push({ type: "beam", from: p0, to: p1, radius: 0.02, material: "sigil", segments: 4 })
    }
    o.push({ type: "torus", at: d(0, 1.5, 0.66), yaw: doorYaw, radius: 0.12, tube: 0.03, segments: 20, material: "sigil" })
    for (let k = 0; k < 14; k++) {
      const y = 0.35 + (k % 7) * 0.33
      const x = k < 7 ? -0.74 : 0.74
      o.push({ type: "box", at: d(x, y, 0.67), yaw: doorYaw + (k % 3) * 20, size: [0.12, 0.16, 0.02], material: "sigil" })
    }
    o.push({ type: "mist", at: d(0, -0.4, 2.2), yaw: doorYaw, width: 4, height: 1.2, layers: 3, spacing: 1.4, materials: { mist: "frost" } })
  }
  return o
}
const LAB_MARKS = {
  tunnel: { at: [0, 9], label: "the tunnel down" },
  junction: { at: [0, 0], label: "the fork" },
  runes: { at: [3.6, 1.8], label: "the crystal runes" },
  right: { at: mouth([0, 0], E_R, E_R, 150, 2.5)[1], label: "the right-hand tunnel" },
  left: { at: mouth([0, 0], E_R, E_R, 210, 2.5)[1], label: "the left-hand tunnel" },
  bend: { at: [-6.6, -12.6], label: "the bend in the left-hand tunnel" },
  wall: { at: onLeg(0.72), label: "the wall at the tunnel's end" },
}
const LAB_LIGHTS = [
  { at: [r2(Math.sin(1.05) * 4.2), 1.7, r2(Math.cos(1.05) * 4.2)], color: "#6ab8ff", intensity: 5, distance: 7 },
  { at: [r2(Math.sin(5.24) * 4.2), 1.7, r2(Math.cos(5.24) * 4.2)], color: "#6ab8ff", intensity: 4, distance: 6 },
  { at: [-7.2, 1.6, -14.6], color: "#6ab8ff", intensity: 3, distance: 6 },
  { at: [0.9, 0.6, 1.6], color: "#ffb070", intensity: 3, distance: 6 },
  // Faint glows down both forks, so their mouths read against the rock.
  { at: [4.4, 1.6, -7.6], color: "#5aa0d8", intensity: 7, distance: 9 },
  { at: [-4.4, 1.6, -7.6], color: "#5aa0d8", intensity: 6, distance: 9 },
]
write(
  `${SETS}/catacombs-labyrinth.json`,
  tunnelSet({
    id: "catacombs-labyrinth",
    title: "The catacombs: the labyrinth",
    seed: 4201,
    tone: "blue",
    bounds: [-8.4, 0.3, -24, 9.5, 4.4, 21],
    objects: labyrinth(false),
    lights: LAB_LIGHTS,
    marks: LAB_MARKS,
    shots: {
      labyrinth: { position: [-1.4, 1.7, 3.6], target: [0.4, 1.3, -5], fov: 62, label: "The labyrinth" },
      runes: { position: [1.2, 1.6, 0.4], target: [4.6, 1.6, 2.4], fov: 50, label: "The crystal runes" },
      left: { position: [-5.9, 1.6, -9.0], target: [-7.0, 1.4, -17], fov: 56, label: "The left-hand tunnel" },
      wall: { position: at3(onLeg(0.05), 1.6), target: at3(DOOR, 1.4), fov: 54, label: "The blank wall" },
    },
    crowd: {
      library: "realm-of-myr",
      groups: [
        {
          type: "points",
          people: [
            { kind: "soldier", at: [-0.5, 8.0], yaw: 180 },
            { kind: "soldier", at: [0.6, 9.2], yaw: 180 },
          ],
        },
      ],
    },
  })
)
const FORK: [string, V2][] = [
  ["branka-stoneveil", [1.2, 2.0]],
  ["cassia-verane", [2.2, 2.6]],
  ["yeva-softstep", [1.6, 3.2]],
  ["milos-radan", [2.6, 1.4]],
]
staging(
  "through-the-labyrinth",
  "catacombs-labyrinth",
  [...party(FORK, [0, -4]), astrid([-1.6, -1.6], [-2.6, -4.5]), eamon([3.3, 1.5], [4.6, 2.4])],
  {
    party: partyShot(FORK, [1.0, 1.7, 4.0]),
    astrid: shotOn("astrid-blackthorn", 2.4, 20, 1.65, 1.6, "Lady Astrid"),
    eamon: shotOn("eamon", 2.0, -40, 1.65, 1.6, "Eamon"),
  },
  "labyrinth"
)
write(
  `${SETS}/catacombs-sealed-door.json`,
  tunnelSet({
    id: "catacombs-sealed-door",
    title: "The catacombs: the sealed door",
    seed: 4301,
    tone: "frost",
    bounds: [-8.4, 0.3, -24, 9.5, 4.4, 21],
    objects: labyrinth(true),
    lights: [...LAB_LIGHTS.slice(0, 3), { at: at3(onLeg(0.8), 1.5), color: "#ff9a40", intensity: 6, distance: 6 }, { at: at3(onLeg(0.4), 2.2), color: "#c8dcf0", intensity: 2, distance: 6 }],
    marks: { ...LAB_MARKS, wall: { at: onLeg(0.72), label: "the black iron door" } },
    shots: {
      door: { position: at3(onLeg(0.05), 1.5), target: at3(DOOR, 1.4), fov: 52, label: "The sealed door" },
      sigils: { position: at3(onLeg(0.6), 1.55), target: at3(DOOR, 1.5), fov: 40, label: "The sigils" },
      left: { position: [-5.9, 1.6, -9.0], target: [-7.0, 1.4, -17], fov: 56, label: "The left-hand tunnel" },
    },
  })
)
const SEAL: [string, V2][] = [
  ["branka-stoneveil", onLeg(0.3, -0.6)],
  ["cassia-verane", onLeg(0.24, 0.5)],
  ["yeva-softstep", onLeg(0.12, -0.2)],
  ["milos-radan", onLeg(0.08, 0.6)],
]
staging(
  "the-sealed-door",
  "catacombs-sealed-door",
  [...party(SEAL, DOOR), astrid(onLeg(0.5, 0.6), DOOR), eamon(onLeg(0.66, -0.3), DOOR)],
  {
    party: { subjects: SEAL.map(([id]) => id), offset: [-dir[0] * 3.2, 1.7, -dir[1] * 3.2], target: [dir[0] * 2, 1.2, dir[1] * 2], relative: "world", fov: 54, label: "Party" },
    eamon: shotOn("eamon", 2.0, -30, 1.6, 1.55, "Eamon"),
    astrid: shotOn("astrid-blackthorn", 2.2, 30, 1.65, 1.6, "Lady Astrid"),
  },
  "door"
)

// ── The great empty hall: Big Empty ──
// Through the door, a vast cavern whose roof is lost in the dark, its floor deep in grey dust. A single narrow archway
// glows at the far end. The ancient dead lie under the dust until they rise.
const HR: V2 = [10, 15]
const [, hIn] = mouth([0, 0], HR[0], HR[1], 0, 0)
const [aIn] = mouth([0, 0], HR[0], HR[1], 180, 0)
function hall(): Obj[] {
  return [
    {
      type: "bore",
      path: [
        [0, 25],
        [0, hIn[1] - 0.8],
      ],
      width: 2.6,
      walls: 1.3,
      rough: 0.35,
      caps: [true, false],
    },
    {
      type: "cave",
      at: [0, 0],
      rx: HR[0],
      rz: HR[1],
      height: 11,
      rough: 1.6,
      grain: 3.5,
      mouths: [
        { at: 0, width: 3.2, height: 3.2 },
        { at: 180, width: 1.7, height: 2.7 },
      ],
      materials: { floor: "dustFloor" },
    },
    // The narrow archway: a short passage glowing blue at its end.
    { type: "bore", path: [aIn, [0, -23.5]], width: 1.5, walls: 1.9, rough: 0.15, caps: [false, true], materials: { wall: "tunnelStone" } },
    { type: "box", at: [-0.95, 0, aIn[1] - 0.2], size: [0.4, 2.9, 0.5], material: "arch" },
    { type: "box", at: [0.95, 0, aIn[1] - 0.2], size: [0.4, 2.9, 0.5], material: "arch" },
    { type: "box", at: [0, 2.6, aIn[1] - 0.2], size: [2.3, 0.45, 0.5], material: "arch" },
    { type: "box", at: [0, 0.1, -23.35], size: [1.3, 2.4, 0.04], material: "archGlow" },
    ...portal([0, 0], HR[0], HR[1], 0, 2.7, 2.65),
    // The opened door, swung back against the passage wall behind the party.
    { type: "box", at: [1.05, 0, 21.6], yaw: 80, size: [1.9, 2.7, 0.3], material: "ironBlack" },
    // The soldiers' torch by the door.
    { type: "torch", at: [-1.26, 1.85, 20], yaw: 90 },
  ]
}
write(
  `${SETS}/catacombs-hall.json`,
  tunnelSet({
    id: "catacombs-hall",
    title: "The catacombs: the great empty hall",
    seed: 4401,
    tone: "blue",
    fog: 0.022,
    bounds: [-8.5, 0.3, -18, 8.5, 8, 24],
    objects: hall(),
    materials: {
      archGlow: { type: "plain", color: "#000000", roughness: 1, emissive: "#4a90e0", emissiveIntensity: 1.1 },
      tunnelRock: { type: "rock", a: "#58687e", b: "#6a7c92", moss: "#3e4a5a", mossLight: "#4a586a", lichen: "#8090a4", mossAmount: 0.1, lichenAmount: 0.1, relief: 0.9, scale: 1.6 },
    },
    lights: [
      { at: [0, 1.4, -15.6], color: "#7ab8ff", intensity: 16, distance: 12 },
      { at: [0, 1.4, -20.5], color: "#7ab8ff", intensity: 8, distance: 6 },
      { at: [-5.5, 4, -4], color: "#3a70c0", intensity: 16, distance: 14 },
      { at: [5.5, 4, -6], color: "#3a70c0", intensity: 16, distance: 14 },
      { at: [0, 7, 2], color: "#3a70c0", intensity: 12, distance: 16 },
      { at: [-0.9, 2.0, 20], color: "#ffa850", intensity: 4, distance: 7 },
    ],
    marks: {
      door: { at: [0, 19.5], label: "the doorway behind" },
      centre: { at: [0, 2], label: "the centre of the hall" },
      archway: { at: [0, aIn[1] + 1.5], label: "the archway at the far end" },
      dust: { at: [-3.5, -4], label: "the scuffs in the dust" },
    },
    shots: {
      hall: { position: [0.6, 2.3, 12.4], target: [0, 1.8, -15], fov: 58, label: "The great hall" },
      archway: { position: [0.4, 1.6, -8], target: [0, 1.4, -18], fov: 50, label: "The archway" },
      dust: { position: [-1.4, 1.2, 1.0], target: [-4.0, 0.0, -4.0], fov: 54, label: "The dust" },
    },
    dust: [-8, 0.1, -16, 8, 4, 18],
  })
)
const HALL: [string, V2][] = [
  ["branka-stoneveil", [-1.6, 9.4]],
  ["cassia-verane", [-0.4, 9.8]],
  ["yeva-softstep", [-2.4, 10.4]],
  ["milos-radan", [1.4, 9.6]],
]
const undead = (id: string, at: V2): Obj => member(id, "An ancient dead warrior", "Ancient undead", 1.85, "ancient-undead", at, [0, 6])
staging(
  "big-empty",
  "catacombs-hall",
  [
    ...party(HALL, [0, -10]),
    astrid([0.4, 4.0], [0, -10]),
    eamon([-1.2, 14.0], [0, 0]),
    undead("ancient-undead", [-4.5, -3.0]),
    undead("ancient-undead-2", [4.2, -5.4]),
    undead("ancient-undead-3", [-0.8, -9.0]),
  ],
  {
    party: partyShot(HALL, [1.4, 1.7, 4.0]),
    astrid: shotOn("astrid-blackthorn", 2.6, 20, 1.65, 1.6, "Lady Astrid"),
    eamon: shotOn("eamon", 2.2, -20, 1.65, 1.6, "Eamon"),
    undead: { subjects: ["ancient-undead", "ancient-undead-2", "ancient-undead-3"], offset: [0, 1.6, 9], target: [0, 1.2, 0], relative: "world", fov: 56, label: "The undead" },
  },
  "hall",
  {
    entrances: [
      { cast: "ancient-undead", when: "rise", from: [-4.5, -3.0], shot: "undead" },
      { cast: "ancient-undead-2", when: "rise", from: [4.2, -5.4], shot: "undead" },
      { cast: "ancient-undead-3", when: "rise", from: [-0.8, -9.0], shot: "undead" },
    ],
  }
)

console.log("wrote 4 tunnel sets and 4 stagings")
