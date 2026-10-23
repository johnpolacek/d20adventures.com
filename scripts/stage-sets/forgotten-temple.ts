// Writes the forgotten temple for March of Davos (wiki/plans/march-of-davos-sets.md), the adventure's last bespoke set:
// a hidden cathedral of Old Valkara beyond the catacombs' archway. Walls of white marble glowing with a faint inner
// starlight, pillars carved as ancient oaks branching into the vault, the vault painted with the constellations of a lost
// sky, and at the centre an empty altar, the air above it rippling. And the stagings of Forgotten Temple and the Final
// Confrontation.
//
//   pnpm exec tsx scripts/stage-sets/forgotten-temple.ts && pnpm stage:check
//
// The JSON it writes is what the app loads. Edit this file and rerun rather than editing the JSON by hand.

import { readFileSync, writeFileSync } from "node:fs"
import type { Obj, V2, V3 } from "./kits/street"

const SETS = "packages/stage/src/sets/realm-of-myr"
const STAGINGS = "packages/stage/src/stagings/march-of-davos"
const ART = "/stage/fixtures/march-of-davos"
const festival = JSON.parse(readFileSync(`${STAGINGS}/the-harvest-festival.json`, "utf8"))
const lower = JSON.parse(readFileSync(`${SETS}/kordavos-lower-districts.json`, "utf8"))
function write(path: string, data: unknown) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
}
const r2 = (n: number) => Math.round(n * 100) / 100
let seed = 4501
const rnd = (a = 0, b = 1) => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return a + ((b - a) * seed) / 4294967296
}

const art = (name: string) => ({ front: `${ART}/${name}-front.webp`, back: `${ART}/${name}-back.webp`, portrait: `${ART}/${name}-portrait.jpg` })
type Facing = string | V2 | number
const member = (id: string, name: string, role: string, height: number, file: string, at: V2, facing: Facing) => ({ id, name, role, height, art: art(file), at, facing })
const party = (spots: [string, V2][], facing: Facing) => spots.map(([id, at]) => ({ ...festival.cast.find((c: Obj) => c.id === id), at, facing }))
const partyShot = (spots: [string, V2][], offset: V3, label = "Party", fov = 54) => ({ subjects: spots.map(([id]) => id), offset, target: [0, 1.2, 0], relative: "world", fov, label })
const shotOn = (subject: string, distance: number, angle: number, height: number, lookHeight: number, label: string, fov = 44) => ({ subject, distance, angle, height, lookHeight, fov, label })
function staging(id: string, cast: Obj[], shots: Obj, shot: string, extra: Obj = {}) {
  write(`${STAGINGS}/${id}.json`, { format: "d20.stage.staging", version: 1, id: `march-of-davos/${id}`, set: "realm-of-myr/forgotten-temple", cast, shots, shot, ...extra })
}

const W = 18
const L = 30
const SPRING = 9
const R = W / 2
const ALTAR: V2 = [0, -18]
const PILLARS: V2[] = []
for (const z of [-5, -11, -17, -23]) for (const s of [-1, 1]) PILLARS.push([s * 5.4, z])

// A pillar carved as an ancient oak: a flared root, a trunk, and boughs spreading up into the vault.
function oakPillar([x, z]: V2): Obj[] {
  const o: Obj[] = [
    { type: "cone", at: [x, 0, z], radius: 1.1, height: 1.4, segments: 12, material: "marbleGlow" },
    { type: "cylinder", at: [x, 0, z], radius: [0.62, 0.5], height: 7.4, segments: 14, material: "marbleGlow" },
    // A solid footprint for the walks.
    { type: "box", at: [x, -0.4, z], size: [1.5, 0.05, 1.5], material: "marbleFloor", solid: true },
  ]
  // Root ridges round the foot.
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + rnd(-0.2, 0.2)
    o.push({
      type: "beam",
      from: [r2(x + Math.cos(a) * 0.4), 1.2, r2(z + Math.sin(a) * 0.4)],
      to: [r2(x + Math.cos(a) * 1.25), 0.02, r2(z + Math.sin(a) * 1.25)],
      radius: 0.16,
      radiusTo: 0.06,
      segments: 6,
      material: "marbleGlow",
    })
  }
  // Boughs: two along the nave, two out toward the wall and across toward the middle, each in two crooked lengths up to
  // the vault.
  for (const [dx, dz] of [
    [0, 1],
    [0, -1],
    [Math.sign(x), 0],
    [-Math.sign(x), 0.2],
  ]) {
    const mid: V3 = [r2(x + dx * 1.3 + rnd(-0.2, 0.2)), r2(7.4 + 1.2 + rnd(-0.2, 0.3)), r2(z + dz * 1.3 + rnd(-0.2, 0.2))]
    const endX = x + dx * 2.6
    const endY = SPRING + Math.sqrt(Math.max(0, R * R - endX * endX)) - 0.35
    const end: V3 = [r2(endX), r2(Math.min(endY, SPRING + 2.6)), r2(z + dz * 2.6)]
    o.push(
      { type: "beam", from: [x, 7.2, z], to: mid, radius: 0.32, radiusTo: 0.24, segments: 8, material: "marbleGlow" },
      { type: "beam", from: mid, to: end, radius: 0.24, radiusTo: 0.1, segments: 8, material: "marbleGlow" }
    )
  }
  return o
}

// Stars on the vault: points just inside its surface, brighter ones joined into constellations.
function starVault(): Obj[] {
  const o: Obj[] = []
  const on = (u: number, z: number, inset = 0.12): V3 => {
    const a = Math.PI * u
    return [r2(-Math.cos(a) * (R - inset)), r2(SPRING + Math.sin(a) * (R - inset)), r2(z)]
  }
  for (let i = 0; i < 260; i++) o.push({ type: "sphere", at: on(rnd(0.06, 0.94), rnd(-L + 0.5, -0.5)), radius: r2(rnd(0.025, 0.06)), segments: 4, material: "star" })
  // Six constellations of five to seven stars, joined by fine lines.
  for (let c = 0; c < 6; c++) {
    const u0 = rnd(0.2, 0.8)
    const z0 = rnd(-L + 4, -4)
    const pts: V3[] = []
    let u = u0
    let z = z0
    for (let k = 0; k < 5 + (c % 3); k++) {
      pts.push(on(u, z, 0.14))
      u = Math.min(0.92, Math.max(0.08, u + rnd(-0.07, 0.07)))
      z += rnd(-1.6, 1.6)
    }
    for (const p of pts) o.push({ type: "sphere", at: p, radius: 0.1, segments: 6, material: "starBright" })
    for (let k = 0; k < pts.length - 1; k++) o.push({ type: "beam", from: pts[k], to: pts[k + 1], radius: 0.012, segments: 3, material: "starLine" })
  }
  return o
}

function temple(): Obj[] {
  const o: Obj[] = [
    { type: "box", at: [0, -0.3, -L / 2], size: [W + 2, 0.3, L + 2], material: "marbleFloor" },
    // The glowing marble walls, and the end walls up into the vault.
    { type: "box", at: [-R - 0.3, 0, -L / 2], size: [0.6, SPRING + 0.02, L + 1.2], material: "marbleGlow", solid: true },
    { type: "box", at: [R + 0.3, 0, -L / 2], size: [0.6, SPRING + 0.02, L + 1.2], material: "marbleGlow", solid: true },
    { type: "box", at: [0, 0, -L - 0.3], size: [W + 1.2, SPRING + R + 0.4, 0.6], material: "marbleGlow", solid: true },
    {
      type: "wall",
      at: [0, 0.3],
      length: W + 0.6,
      height: SPRING,
      thickness: 0.6,
      openings: [{ at: 0, width: 1.7, height: 2.7, kind: "doorway" }],
      materials: { wall: "marbleGlow", stone: "marbleGlow", timber: "silver" },
    },
    { type: "box", at: [0, SPRING, 0.3], size: [W + 1.2, R + 0.4, 0.6], material: "marbleGlow" },
    // Beyond the archway, the catacombs' dark.
    { type: "box", at: [0, 0, 2.2], size: [2.0, 3.0, 0.2], material: "void" },
    // The vault of a lost sky, ribbed in silver.
    { type: "vault", at: [0, 0], span: W, from: 0.02, to: -L - 0.02, spring: SPRING, bay: 6, rib: 0.18, materials: { shell: "nightVault", rib: "marbleGlow", trim: "silver" } },
  ]
  for (const p of PILLARS) o.push(...oakPillar(p))
  o.push(...starVault())
  // The altar on a stepped dais in a ring of silver runes, empty; the air over it rippling with heat.
  for (let i = 0; i < 3; i++) o.push({ type: "cylinder", at: [ALTAR[0], i * 0.22, ALTAR[1]], radius: 3.4 - i * 0.7, height: 0.22, segments: 40, material: "marbleFloor" })
  o.push(
    { type: "box", at: [ALTAR[0], 0.66, ALTAR[1]], size: [2.6, 1.0, 1.3], material: "marbleGlow", solid: true },
    { type: "box", at: [ALTAR[0], 1.66, ALTAR[1]], size: [2.9, 0.14, 1.6], material: "marbleGlow" },
    { type: "torus", at: [ALTAR[0], 0.68, ALTAR[1]], pitch: 90, radius: 3.0, tube: 0.025, segments: 64, material: "silverGlow" },
    { type: "mist", at: [ALTAR[0], 1.7, ALTAR[1]], width: 1.8, height: 2.2, layers: 2, spacing: 0.3, materials: { mist: "heat" } }
  )
  // Runes in silver filigree round the altar's sides.
  for (let k = 0; k < 10; k++) {
    const side = k < 5 ? 1 : -1
    o.push({ type: "box", at: [r2(ALTAR[0] - 1.0 + (k % 5) * 0.5), 1.0 + (k % 2) * 0.2, r2(ALTAR[1] + side * 0.66)], size: [0.22, 0.14, 0.02], material: "silverGlow" })
  }
  return o
}
write(`${SETS}/forgotten-temple.json`, {
  format: "d20.stage.set",
  version: 1,
  id: "forgotten-temple",
  settingId: "realm-of-myr",
  locationId: "forgotten-temple",
  title: "The forgotten temple",
  seed: 4501,
  atmosphere: {
    sun: { direction: [0.2, 1, 0.1], color: "#202430", intensity: 0, target: [0, 0, -L / 2], distance: 80, shadow: { left: -30, right: 30, top: 30, bottom: -30, near: 10, far: 160, size: 1024 } },
    hemisphere: { sky: "#7a88b0", ground: "#2a2a34", intensity: 0.9 },
    sky: { horizon: "#0e1018", mid: "#08090e", zenith: "#040508", gain: 0.1, clouds: 0, stars: 0, moon: 0 },
    fog: { density: 0.01, color: "#3a4060", start: 10 },
    glow: "#c8d4ff",
    fill: { color: "#e8ecff", intensity: 1.0, distance: 9 },
    lights: [
      { at: [0, 10, -8], color: "#b8c8ff", intensity: 18, distance: 22 },
      { at: [0, 10, -22], color: "#b8c8ff", intensity: 18, distance: 22 },
      { at: [ALTAR[0], 2.4, ALTAR[1] + 1.2], color: "#ffcc90", intensity: 10, distance: 9 },
      { at: [-6, 3, -14], color: "#a8b8ff", intensity: 6, distance: 10 },
      { at: [6, 3, -14], color: "#a8b8ff", intensity: 6, distance: 10 },
      { at: [0, 1.8, -3.2], color: "#ffa850", intensity: 5, distance: 7 },
    ],
    environment: 0.2,
    exposure: 1.2,
    grade: "neutral",
    wind: 0.05,
  },
  camera: { near: 0.05, far: 300, min: [-R + 0.3, 0.3, -L + 0.4], max: [R - 0.3, 14, 1.6], maxDistance: 26 },
  materials: {
    ...Object.fromEntries(["void", "dark", "iron"].map((k) => [k, (lower.materials as Obj)[k]])),
    marbleGlow: { type: "masonry", a: "#e8e6ee", b: "#dcdae4", c: "#f2f0f6", mortar: "#c8c6d4", block: [1.4, 0.7], joint: 0.003, relief: 0.002, variance: 0.25, grime: 0.15, roughness: 0.35 },
    marbleFloor: {
      type: "masonry",
      a: "#c8c6d0",
      b: "#bcbac6",
      c: "#d4d2dc",
      mortar: "#8a889a",
      block: [1.2, 1.2],
      joint: 0.004,
      relief: 0.002,
      variance: 0.3,
      grime: 0.4,
      ground: true,
      roughness: 0.25,
    },
    nightVault: { type: "plain", color: "#0c1230", roughness: 0.9, emissive: "#0a1030", emissiveIntensity: 0.5 },
    star: { type: "plain", color: "#000000", roughness: 1, emissive: "#e8f0ff", emissiveIntensity: 3 },
    starBright: { type: "plain", color: "#000000", roughness: 1, emissive: "#fff4d8", emissiveIntensity: 5 },
    starLine: { type: "plain", color: "#000000", roughness: 1, emissive: "#a8b8e8", emissiveIntensity: 1.2 },
    silver: { type: "metal", color: "#c8ccd4", roughness: 0.3, metalness: 0.9 },
    silverGlow: { type: "plain", color: "#000000", roughness: 1, emissive: "#d8e4ff", emissiveIntensity: 1.6 },
    heat: { type: "mist", color: "#fff0dc", opacity: 0.05 },
  },
  objects: temple(),
  marks: {
    archway: { at: [0, -1.2], label: "the archway" },
    nave: { at: [0, -8], label: "the nave" },
    altar: { at: [ALTAR[0], ALTAR[1] + 3.8], label: "the altar" },
    runes: { at: [ALTAR[0] + 1.6, ALTAR[1] + 2.6], label: "the silver runes" },
    behind: { at: [ALTAR[0], -L + 2.4], label: "the shadows behind the altar" },
  },
  shots: {
    temple: { position: [0.6, 1.8, -1.0], target: [0, 5.0, -L], fov: 62, label: "The forgotten temple" },
    vault: { position: [0, 1.6, -6], target: [0, 14, -16], fov: 70, label: "The vault of stars" },
    altar: { position: [2.6, 1.7, -11], target: [ALTAR[0], 1.4, ALTAR[1]], fov: 50, label: "The altar" },
    pillar: { position: [-2.2, 1.4, -8.4], target: [-5.4, 6.0, -11], fov: 58, label: "The oak pillars" },
  },
  life: { dust: { count: 600, box: [-R, 0.4, -L, R, 9, 0] } },
})

const ENTER: [string, V2][] = [
  ["branka-stoneveil", [-1.2, -3.0]],
  ["cassia-verane", [-0.3, -3.3]],
  ["yeva-softstep", [0.6, -3.0]],
  ["milos-radan", [1.5, -3.3]],
]
const astrid = (at: V2, facing: Facing) => member("astrid-blackthorn", "Lady Astrid Blackthorn", "Blackthorn ranger", 1.78, "astrid-blackthorn", at, facing)
const eamon = (at: V2, facing: Facing) => member("eamon", "Eamon", "Scholar and mage", 1.78, "eamon", at, facing)
staging(
  "forgotten-temple",
  [...party(ENTER, ALTAR), astrid([-0.8, -5.0], ALTAR), eamon([0.9, -5.2], [0, -12])],
  {
    party: partyShot(ENTER, [1.6, 1.8, 4.0]),
    astrid: shotOn("astrid-blackthorn", 2.4, 15, 1.65, 1.6, "Lady Astrid"),
    eamon: shotOn("eamon", 2.2, -15, 1.65, 1.6, "Eamon"),
  },
  "temple"
)
const FACE: [string, V2][] = [
  ["branka-stoneveil", [-1.6, -11.4]],
  ["cassia-verane", [-0.5, -11.0]],
  ["yeva-softstep", [0.6, -11.4]],
  ["milos-radan", [1.7, -11.0]],
]
const JORAN: V2 = [0.4, ALTAR[1] + 3.6]
staging(
  "final-confrontation",
  [...party(FACE, JORAN), astrid([-2.6, -12.6], JORAN), eamon([2.8, -12.4], JORAN), member("joran-antonov", "Joran Antonov", "Champion of the Covenant", 1.82, "joran", JORAN, [0, -8])],
  {
    party: partyShot(FACE, [1.6, 1.8, 4.0]),
    joran: shotOn("joran-antonov", 2.8, 0, 1.6, 1.65, "Joran", 46),
    astrid: shotOn("astrid-blackthorn", 2.4, 20, 1.65, 1.6, "Lady Astrid"),
    eamon: shotOn("eamon", 2.4, -20, 1.65, 1.6, "Eamon"),
    standoff: { subjects: ["joran-antonov", "astrid-blackthorn"], offset: [4.4, 1.8, 1.0], target: [0, 1.4, 0], relative: "world", fov: 52, label: "The standoff" },
  },
  "altar",
  { entrances: [{ cast: "joran-antonov", when: "steps into", from: [4.4, -25], shot: "altar" }] }
)

console.log("wrote the forgotten temple and 2 stagings")
