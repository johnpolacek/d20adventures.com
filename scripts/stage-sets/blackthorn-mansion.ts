// Writes the Blackthorn mansion for March of Davos (wiki/plans/march-of-davos-sets.md), the adventure's bespoke set:
// the ballroom of the masquerade, with and without the caged drake revealed on its stage, and the grounds by night, the
// front court and its gates, and the garden under the ballroom balcony with the ivy wall and the drain grate. And the
// stagings of the encounters played there.
//
//   pnpm exec tsx scripts/stage-sets/blackthorn-mansion.ts && pnpm stage:check
//
// The JSON it writes is what the app loads. Edit this file and rerun rather than editing the JSON by hand.

import { readFileSync, writeFileSync } from "node:fs"
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
const docks = read("kordavos-docks")
const lower = read("kordavos-lower-districts")
const inn = read("dragonbone-inn")
const square = read("kordavos-harvest-square")

// ── Cast ──
const art = (name: string) => ({ front: `${ART}/${name}-front.webp`, back: `${ART}/${name}-back.webp`, portrait: `${ART}/${name}-portrait.jpg` })
type Facing = string | V2 | number
const member = (id: string, name: string, role: string, height: number, file: string, at: V2, facing: Facing, extra: Obj = {}) => ({ id, name, role, height, art: art(file), at, facing, ...extra })
const party = (spots: [string, V2][], facing: Facing) => spots.map(([id, at]) => ({ ...festival.cast.find((c: Obj) => c.id === id), at, facing }))
const partyShot = (spots: [string, V2][], offset: V3, label = "Party", fov = 54) => ({ subjects: spots.map(([id]) => id), offset, target: [0, 1.2, 0], relative: "world", fov, label })
const shotOn = (subject: string, distance: number, angle: number, height: number, lookHeight: number, label: string, fov = 44) => ({ subject, distance, angle, height, lookHeight, fov, label })
function staging(id: string, set: string, cast: Obj[], shots: Obj, shot: string, extra: Obj = {}) {
  write(`${STAGINGS}/${id}.json`, { format: "d20.stage.staging", version: 1, id: `march-of-davos/${id}`, set: `realm-of-myr/${set}`, cast, shots, shot, ...extra })
}
const guest = (id: string, at: V2, facing: Facing) => {
  const look: Record<string, [string, number]> = {
    "guest-crimson": ["A lady in a crimson cloak", 1.68],
    "guest-ivory": ["A lady in ivory", 1.72],
    "guest-raven": ["A gentleman in a raven mask", 1.85],
    "guest-gold": ["A gentleman in a sun mask", 1.76],
  }
  return member(id, look[id][0], "Masked guest", look[id][1], id, at, facing)
}
// The same four costumes again, further off, so the near floor is full of masks rather than the crowd's plain figures.
const moreGuests = (spots: [string, V2, Facing][]) => spots.map(([g, at, facing], i) => ({ ...guest(g, at, facing), id: `${g}-${i + 2}` }))
const astridBall = (at: V2, facing: Facing) => member("astrid-blackthorn", "Lady Astrid Blackthorn", "Lady of the house", 1.78, "astrid-ball", at, facing)
const thaddeus = (at: V2, facing: Facing, extra: Obj = {}) => member("thaddeus-blackthorn", "Lord Thaddeus Blackthorn", "Lord of the house", 1.88, "thaddeus-blackthorn", at, facing, extra)

// ── The ballroom ──
// A long hall 18 m wide and 34 deep on the mansion's first floor. A colonnade of fluted marble columns under gilded
// arches divides the nave from an aisle each side; the nave rises into a painted barrel vault hung with three great
// chandeliers. Tall windows dressed in red velvet line the outer walls; in the east wall, glazed doors stand open onto a
// moonlit balcony over the garden. At the far end a stage under the house's banners, a curtained cage on its west half.
const HW = 9
const N = 8
const F = -26
const COL = 6
const SPRING = 8
const STAGE = { x0: -6.5, x1: 6.5, z0: F, z1: -21.6, h: 0.9 }
const CAGE: V2 = [-3.4, -23.7]
const BALCONY_Z = -8
const COLS = [6, 2, -2, -6, -10, -14, -18, -22]
function ballroom(drake: boolean): Obj[] {
  const o: Obj[] = [{ type: "box", at: [0, -0.3, (N + F) / 2], size: [2 * HW + 0.6, 0.3, N - F + 0.6], material: "marble" }]
  // Outer walls with tall windows; the east wall's glazed doors open onto the balcony.
  const windows = (zs: number[], cz: number, sign: number) => zs.map((z) => ({ at: r2(sign * (z - cz)), width: 2.0, height: 4.6, sill: 1.3, kind: "window", panes: [3, 6] }))
  const wallMats = { wall: "ballWall", panel: "ballPanel", timber: "gilt", door: "ballDoor", glass: "nightGlass", glassOut: "nightGlass", lead: "gilt", stone: "marbleTrim", boards: "ballPanel" }
  const face = { finish: "plaster", wainscot: 1.1, studs: 0, rail: 3.0 }
  const cz = (N + F) / 2
  o.push(
    { type: "wall", at: [-HW - 0.2, cz], yaw: 90, length: N - F + 0.4, height: 7.4, thickness: 0.4, a: face, b: face, openings: windows([4, -4, -12, -20], cz, -1), materials: wallMats },
    {
      type: "wall",
      at: [HW + 0.2, cz],
      yaw: -90,
      length: N - F + 0.4,
      height: 7.4,
      thickness: 0.4,
      a: face,
      b: face,
      openings: [...windows([4, -16], cz, 1), { at: r2(BALCONY_Z - cz), width: 2.6, height: 4.6, kind: "door", leaf: -75, panes: [3, 8] }],
      materials: wallMats,
    },
    // The entrance wall, its great doorway onto the foyer, and the wall behind the stage.
    { type: "wall", at: [0, N + 0.2], length: 2 * HW + 0.8, height: 7.4, thickness: 0.4, a: face, b: face, openings: [{ at: 0, width: 3.4, height: 4.8, kind: "doorway" }], materials: wallMats },
    { type: "box", at: [0, 0, N + 2.2], size: [3.6, 5, 0.2], material: "void" },
    { type: "wall", at: [0, F - 0.2], length: 2 * HW + 0.8, height: 7.4, thickness: 0.4, a: face, b: face, materials: wallMats },
    // The end walls above the cornice, up into the vault.
    { type: "box", at: [0, 7.4, N + 0.2], size: [2 * HW + 0.8, SPRING + COL - 7.4 + 0.4, 0.4], material: "ballWall" },
    { type: "box", at: [0, 7.4, F - 0.2], size: [2 * HW + 0.8, SPRING + COL - 7.4 + 0.4, 0.4], material: "ballWall" }
  )
  // The colonnade: fluted columns, gilded arches between them, a cornice along the top, flat aisle ceilings.
  for (const s of [-1, 1]) {
    for (const z of COLS) o.push({ type: "column", at: [s * COL, z], height: 5.6, radius: 0.38, flutes: 16, materials: { shaft: "marbleColumn", flute: "marbleTrim", trim: "gilt" } })
    for (let i = 0; i < COLS.length; i++) {
      const z0 = COLS[i]
      const z1 = COLS[i + 1] ?? F
      o.push({
        type: "archHead",
        at: [s * COL, (z0 + z1) / 2],
        yaw: 90,
        width: r2(Math.abs(z0 - z1) - (COLS[i + 1] === undefined ? 0.2 : 0.76)),
        height: 7.4,
        thickness: 0.6,
        materials: { fill: "ballWall", trim: "gilt" },
      })
    }
    o.push(
      { type: "archHead", at: [s * COL, (N + COLS[0]) / 2], yaw: 90, width: r2(N - COLS[0] - 0.4), height: 7.4, thickness: 0.6, materials: { fill: "ballWall", trim: "gilt" } },
      { type: "box", at: [s * COL, 7.4, cz], size: [0.9, 0.6, N - F], material: "ballWall" },
      { type: "box", at: [s * (COL + 0.47), 7.5, cz], size: [0.06, 0.12, N - F], material: "gilt" },
      { type: "box", at: [s * (COL + (HW - COL) / 2 + 0.2), 7.4, cz], size: [HW - COL + 0.4, 0.2, N - F], material: "ballCeiling" }
    )
  }
  // The painted vault over the nave, and three great chandeliers.
  o.push({ type: "vault", at: [0, 0], span: 2 * COL, from: N + 0.1, to: F - 0.1, spring: SPRING, bay: 4, rib: 0.26, repeat: [3, 2], materials: { shell: "fresco", rib: "ballWall", trim: "gilt" } })
  for (const z of [3, -7, -17]) o.push({ type: "chandelier", at: [0, 13.6, z], radius: 1.7, candles: 16, drop: 4.6, materials: { timber: "gilt" } })
  // The stage: a dais with steps, its front edged in gilt, the house's banners and red drapes behind it.
  const sw = STAGE.x1 - STAGE.x0
  const sd = STAGE.z1 - STAGE.z0
  o.push(
    { type: "box", at: [0, 0, (STAGE.z0 + STAGE.z1) / 2], size: [sw, STAGE.h, sd], material: "stageWood", solid: true },
    { type: "box", at: [0, STAGE.h - 0.02, (STAGE.z0 + STAGE.z1) / 2 + 0.3], size: [sw - 0.6, 0.03, sd - 0.6], material: "carpet" },
    { type: "box", at: [0, STAGE.h - 0.12, STAGE.z1 + 0.02], size: [sw + 0.04, 0.1, 0.06], material: "gilt" }
  )
  for (let i = 0; i < 3; i++) o.push({ type: "box", at: [0, i * 0.3, STAGE.z1 + 1.05 - i * 0.35], size: [4.4 - i * 0.4, 0.3, 0.7], material: "stageWood" })
  o.push(
    { type: "box", at: [0, 0, F + 0.05], size: [2 * HW - 1.0, 7.3, 0.1], material: "velvetDark" },
    { type: "curtain", at: [0, 0, F + 0.35], width: 2 * HW - 1.2, height: 7.2, folds: 30, depth: 0.16, gather: 0.08, side: "both", tie: 0.4, cloth: "velvet" },
    { type: "banner", at: [-3.6, 7.0, F + 0.5], w: 2.0, h: 5.2, material: "bannerAsterian" },
    { type: "banner", at: [3.6, 7.0, F + 0.5], w: 2.0, h: 5.2, material: "bannerAsterian" }
  )
  // The drake's cage on the stage's west half, behind a curtain drawn back for the speech.
  o.push({ type: "cage", at: [CAGE[0], STAGE.h, CAGE[1]], width: 3.8, depth: 3.4, height: 4.4 })
  o.push({ type: "curtain", at: [CAGE[0], 0, STAGE.z1 + 0.15], width: 4.8, height: 6.2, folds: 18, depth: 0.14, gather: drake ? 0.85 : 0, side: "both", tie: 0.45, cloth: "velvet" })
  o.push({ type: "box", at: [CAGE[0], 6.1, STAGE.z1 + 0.15], size: [5.2, 0.12, 0.12], material: "gilt" })
  // Windows dressed in red velvet; candle stands along the aisles; banquet tables in the west aisle; musicians' chairs.
  for (const [x, z, yaw] of [
    [-HW + 0.3, 4, 90],
    [-HW + 0.3, -4, 90],
    [-HW + 0.3, -12, 90],
    [-HW + 0.3, -20, 90],
    [HW - 0.3, 4, -90],
    [HW - 0.3, -16, -90],
  ])
    o.push({ type: "curtain", at: [x, 0, z], yaw, width: 2.9, height: 6.0, folds: 12, depth: 0.12, gather: 0.7, side: "both", tie: 0.42, cloth: "velvet" })
  for (const s of [-1, 1]) for (const z of s < 0 ? [0, -8, -16] : [0, -4, -16]) o.push({ type: "candleStand", at: [s * (COL + 0.9), z] })
  for (const z of [3.2, -1.2]) o.push({ type: "table", at: [-7.5, z], yaw: 90, length: 3.2, width: 1.1, height: 0.84, setting: 8, candle: true, materials: { top: "tablecloth" } })
  o.push({ type: "table", at: [-7.5, -6.6], yaw: 90, length: 2.2, width: 1.0, height: 0.9, materials: { top: "velvetDark" } })
  for (const [x, z, r] of [
    [-7.6, -6.0, 0.08],
    [-7.3, -6.8, 0.06],
    [-7.7, -7.3, 0.07],
  ])
    o.push({ type: "sphere", at: [x, 0.98, z], radius: r, segments: 10, material: "gem" })
  for (const [x, z] of [
    [7.0, -19.6],
    [7.9, -20.4],
    [7.2, -21.4],
  ])
    o.push({ type: "chair", at: [x, z], yaw: -110 })
  // The balcony outside the east doors: a deck with a balustrade, the garden dark below, the city and the moon beyond.
  o.push(
    { type: "box", at: [HW + 1.8, -0.3, BALCONY_Z], size: [3.4, 0.3, 6.4], material: "terrace" },
    { type: "gallery", at: [HW + 0.2, BALCONY_Z], yaw: 90, length: 6.2, level: 0, depth: 3.2, rail: 1.05, materials: { deck: "terrace", case: "balustrade", trim: "balustrade" } },
    { type: "box", at: [HW + 12, -7, BALCONY_Z], size: [26, 0.2, 40], material: "garden" }
  )
  for (const [x, z, sc] of [
    [HW + 6, -14, 1.4],
    [HW + 8, -3, 1.2],
    [HW + 11, -10, 1.6],
    [HW + 5, 0, 1.0],
  ])
    o.push({ type: "bush", at: [x, -6.9, z], size: sc })
  return o
}
const BALL_ROOM = [-HW - 0.2, 0, F - 0.2, HW + 0.2, 15, N + 0.2]
const BALL_MATERIALS = {
  ...pick(library, ["gilt", "fresco", "candle", "candleFlame", "iron", "brass", "oak", "oakDark", "void", "dark", "lead"]),
  ...pick(docks, ["slag", "acid", "cageStraw", "scorch"]),
  ...pick(inn, ["pewter", "bread", "cheese", "roast", "roastDark", "bone", "horn", "bottleBrown", "bottleGreen"]),
  ...pick(lower, ["timber", "tablecloth", "pottery", "potteryB", "rope", "glow", "lamp", "flame"]),
  bannerAsterian: (square.materials as Obj).banner,
  marble: { type: "masonry", a: "#d8cfc0", b: "#cbbfae", c: "#e2d9cc", mortar: "#9a8a76", block: [1.2, 1.2], joint: 0.005, relief: 0.002, variance: 0.35, grime: 0.3, ground: true, roughness: 0.22 },
  marbleColumn: { type: "masonry", a: "#e4dccc", b: "#d8cebc", c: "#ece4d6", mortar: "#c8bca8", block: [0.8, 0.5], joint: 0.002, relief: 0.001, variance: 0.25, grime: 0.2, roughness: 0.3 },
  marbleTrim: { type: "masonry", a: "#cfc4b0", b: "#c4b8a2", c: "#d8cebc", mortar: "#b0a48e", block: [0.6, 0.3], joint: 0.003, relief: 0.002, variance: 0.2, grime: 0.3 },
  ballWall: { type: "masonry", a: "#d6c8ac", b: "#cfc0a2", c: "#dccfb4", mortar: "#c0b092", block: [1.6, 0.8], joint: 0.002, relief: 0.001, variance: 0.15, grime: 0.25 },
  ballPanel: { type: "plain", color: "#7a4a2a", roughness: 0.6 },
  ballCeiling: { type: "plain", color: "#c8b48c", roughness: 0.8 },
  ballDoor: { type: "painted", map: "/stage/textures/door-oak.jpg", tint: "#7a5a40", plank: [0.2, 2.4], size: [0.6, 1.8], relief: 0.08, grime: 0.6 },
  nightGlass: { type: "glass", color: "#0c1424", opacity: 0.7, emissive: "#0a1426", emissiveIntensity: 0.12 },
  velvet: { type: "cloth", color: "#6a141a", amp: 0.15, freq: 0.5 },
  velvetDark: { type: "plain", color: "#3a0c10", roughness: 0.8 },
  carpet: { type: "plain", color: "#5a1018", roughness: 0.9 },
  stageWood: { type: "painted", map: "/stage/textures/door-oak.jpg", tint: "#6a4a32", plank: [0.18, 3], size: [0.6, 1.8], relief: 0.06, grime: 0.6 },
  gem: { type: "plain", color: "#2a4a8a", roughness: 0.1, emissive: "#3a6ac0", emissiveIntensity: 0.6 },
  terrace: { type: "masonry", a: "#8a8478", b: "#948e82", c: "#7e786c", mortar: "#5a564e", block: [0.8, 0.8], joint: 0.008, relief: 0.004, variance: 0.3, grime: 1.2, ground: true },
  balustrade: { type: "masonry", a: "#b8b0a2", b: "#c2baac", c: "#aea698", mortar: "#8a8276", block: [0.6, 0.3], joint: 0.003, relief: 0.002, variance: 0.2, grime: 1.0 },
  garden: { type: "meadow", grass: "#1a2a1c", grassDark: "#101a12", dirt: "#1a1612", flowers: 0.1 },
  leaves: { type: "foliage", color: "#1e3a22" },
  leavesDark: { type: "foliage", color: "#142a18" },
  bark: { type: "plain", color: "#2a2018", roughness: 1 },
}
function ballroomSet(id: string, title: string, drake: boolean) {
  return {
    format: "d20.stage.set",
    version: 1,
    id,
    settingId: "realm-of-myr",
    locationId: "blackthorn-ballroom",
    title,
    seed: 2801,
    atmosphere: {
      // Night outside: a high moon over the garden, seen through the east doors and windows.
      sun: {
        direction: [0.8, 0.5, -0.25],
        color: "#a8bcd8",
        intensity: 0.8,
        target: [HW + 2, 0, BALCONY_Z],
        distance: 120,
        shadow: { left: -20, right: 20, top: 20, bottom: -20, near: 40, far: 200, size: 1024 },
      },
      hemisphere: { sky: "#2a3a56", ground: "#14100c", intensity: 0.35 },
      sky: { horizon: "#3a4a62", mid: "#1e2a40", zenith: "#0a1020", gain: 0.6, clouds: 0.3, stars: 0.5, moon: 2.6 },
      fog: { density: 0.004, color: "#2a2420", start: 20 },
      glow: "#a8bcd8",
      fill: { color: "#fff0dc", intensity: 1.0, distance: 9 },
      lights: [{ at: [HW + 1.6, 2.6, BALCONY_Z], color: "#a8c0e0", intensity: 3, distance: 6 }],
      environment: 0.25,
      exposure: 1.1,
      grade: "warm",
      wind: 0.1,
    },
    // Inside, the chandeliers and candles light the hall warm and gold.
    rooms: [
      {
        box: BALL_ROOM,
        ambient: 0.35,
        fill: 1.0,
        exposure: 1.15,
        lights: [
          { at: [0, 8.4, 3], color: "#ffc070", intensity: 26, distance: 18 },
          { at: [0, 8.4, -7], color: "#ffc070", intensity: 26, distance: 18 },
          { at: [0, 8.4, -17], color: "#ffc070", intensity: 26, distance: 18 },
          { at: [-7.5, 3.0, 0], color: "#ffb060", intensity: 8, distance: 10 },
          { at: [7.5, 3.0, -4], color: "#ffb060", intensity: 8, distance: 10 },
          { at: [0, 3.4, -20.5], color: "#ffc880", intensity: 14, distance: 10 },
          { at: [CAGE[0], 3.6, -21.2], color: drake ? "#ffd8a0" : "#ffb060", intensity: drake ? 10 : 3, distance: 7 },
          { at: [HW - 0.6, 2.4, BALCONY_Z], color: "#a8c0e0", intensity: 3, distance: 5 },
        ],
      },
    ],
    camera: { near: 0.1, far: 400, min: [-HW + 0.3, 0.4, F + 0.4], max: [HW + 3.2, 12, N - 0.3], maxDistance: 26 },
    materials: BALL_MATERIALS,
    objects: ballroom(drake),
    crowd: {
      library: "realm-of-myr",
      avoid: {
        rects: [],
        circles: [
          [0, 4.5, 2.6],
          [0, -2, 2.6],
          [3.4, -2.4, 2.2],
          [0, -19.6, 2.4],
          [-1.4, -12.6, 2.6],
          [CAGE[0], -21, 2.4],
        ],
      },
      groups: [
        {
          type: "scatter",
          area: [-HW + 0.7, -19.6, HW - 0.7, -7],
          count: 26,
          mix: { merchant: 5, knight: 1 },
          density: [{ rect: [-HW, -19.6, -COL, 5], factor: 0.5 }],
          face: { toward: [0, -22], jitter: 60, share: 0.4 },
        },
      ],
    },
    marks: {
      entrance: { at: [0, 6.6], label: "the grand doors" },
      floor: { at: [0, -4], label: "the middle of the ballroom" },
      tables: { at: [-5.6, 1.0], label: "the banquet tables" },
      gems: { at: [-5.6, -6.6], label: "the gem display" },
      window: { at: [5.0, -1.6], label: "the window by the colonnade" },
      stage: { at: [0, -19.8], label: "the foot of the stage" },
      cage: { at: [CAGE[0], -20.6], label: "the curtained cage" },
      musicians: { at: [5.4, -19.4], label: "the musicians" },
      balconyDoor: { at: [HW - 1.0, BALCONY_Z], label: "the doors to the balcony" },
      balcony: { at: [HW + 1.9, BALCONY_Z], label: "the balcony" },
    },
    shots: {
      ballroom: { position: [0.8, 1.8, 7.2], target: [0, 4.0, -20], fov: 60, label: "The ballroom" },
      stage: { position: [1.0, 1.7, -11], target: [0, 2.4, -24], fov: 56, label: "The stage" },
      colonnade: { position: [-4.4, 1.6, 5.0], target: [-6.4, 4.6, -16], fov: 60, label: "The colonnade" },
      balcony: { position: [HW - 3.4, 1.7, BALCONY_Z + 1.2], target: [HW + 6, 1.2, BALCONY_Z - 1], fov: 58, label: "The balcony" },
      vault: { position: [0, 1.6, -2], target: [0, 12, -12], fov: 64, label: "The painted vault" },
    },
    life: { dust: { count: 220, box: [-HW, 1, F, HW, 9, N] } },
  }
}
write(`${SETS}/blackthorn-ballroom.json`, ballroomSet("blackthorn-ballroom", "The Blackthorn ballroom", false))
write(`${SETS}/blackthorn-ballroom-drake.json`, ballroomSet("blackthorn-ballroom-drake", "The Blackthorn ballroom, the drake revealed", true))

// Inside the Ball: the party just inside the grand doors, masked guests talking in pairs ahead of them.
const ARRIVE: [string, V2][] = [
  ["branka-stoneveil", [-1.3, 5.0]],
  ["cassia-verane", [-0.4, 5.4]],
  ["yeva-softstep", [0.5, 5.0]],
  ["milos-radan", [1.4, 5.4]],
]
const GUESTS = [
  guest("guest-crimson", [-2.6, 1.2], [-1.6, 0.6]),
  guest("guest-raven", [-1.6, 0.6], [-2.6, 1.2]),
  guest("guest-ivory", [2.6, -0.8], [3.4, 0.2]),
  guest("guest-gold", [3.4, 0.2], [2.6, -0.8]),
  ...moreGuests([
    ["guest-gold", [-4.4, -2.6], [-3.6, -3.4]],
    ["guest-ivory", [-3.6, -3.4], [-4.4, -2.6]],
    ["guest-raven", [1.2, -4.8], [0.4, -5.4]],
    ["guest-crimson", [0.4, -5.4], [1.2, -4.8]],
    ["guest-ivory", [4.6, -6.4], [0, -20]],
    ["guest-raven", [-1.8, -7.6], [0, -20]],
  ]),
]
staging(
  "inside-the-ball",
  "blackthorn-ballroom",
  [...party(ARRIVE, [0, -10]), ...GUESTS],
  {
    party: partyShot(ARRIVE, [1.6, 1.8, -4.2]),
    guests: { subjects: ["guest-crimson", "guest-raven"], offset: [1.8, 1.7, 2.6], target: [0, 1.4, 0], relative: "world", fov: 48, label: "The masked guests" },
  },
  "ballroom"
)
// The Blackthorns: Lady Astrid crosses to the party in the middle of the hall; Thaddeus holds court a little way off.
const MEET: [string, V2][] = [
  ["branka-stoneveil", [-1.3, 0.4]],
  ["cassia-verane", [-0.4, 0.8]],
  ["yeva-softstep", [0.5, 0.4]],
  ["milos-radan", [1.4, 0.8]],
]
staging(
  "the-blackthorns",
  "blackthorn-ballroom",
  [...party(MEET, [0.2, -1.6]), astridBall([0.2, -1.6], [0, 0.6]), thaddeus([2.8, -4.6], [0.2, -1.6]), guest("guest-gold", [3.8, -4.0], [2.8, -4.6]), guest("guest-ivory", [-3.2, -3.0], [-2.4, -2.4])],
  {
    party: partyShot(MEET, [1.4, 1.8, 4.2]),
    astrid: shotOn("astrid-blackthorn", 2.2, 10, 1.65, 1.6, "Lady Astrid"),
    thaddeus: shotOn("thaddeus-blackthorn", 2.6, -15, 1.7, 1.68, "Lord Thaddeus"),
  },
  "astrid"
)
// The Lady and the Bishop: by the window at the east colonnade, Seraphina and the bishop come to the party.
const WINDOW: [string, V2][] = [
  ["branka-stoneveil", [1.4, -3.4]],
  ["cassia-verane", [2.2, -4.2]],
  ["yeva-softstep", [1.6, -2.6]],
  ["milos-radan", [2.6, -3.2]],
]
staging(
  "the-lady-and-the-bishop",
  "blackthorn-ballroom",
  [
    ...party(WINDOW, [4.2, -1.6]),
    member("seraphina-valtor", "A masked noblewoman", "Head of the Valtor clan", 1.7, "seraphina-masked", [3.9, -1.4], [2, -3.2]),
    member("bishop-nicolai", "A masked churchman", "Bishop of the Church of Valkara", 1.82, "bishop-nicolai-masked", [4.8, -2.2], [2, -3.2]),
    guest("guest-raven", [-2.2, -5.2], [-1.4, -6.0]),
    guest("guest-crimson", [-1.4, -6.0], [-2.2, -5.2]),
  ],
  {
    party: partyShot(WINDOW, [-2.6, 1.8, 2.4]),
    seraphina: shotOn("seraphina-valtor", 2.2, 15, 1.6, 1.55, "Seraphina"),
    bishop: shotOn("bishop-nicolai", 2.4, -10, 1.7, 1.65, "The bishop"),
  },
  "seraphina"
)
// A Distraction: Lady Astrid at the foot of the stage speaks to the hall; the elf bard comes in by the grand doors and
// plays in the middle of the floor while every eye is on him.
const CROWD_SPOT: [string, V2][] = [
  ["branka-stoneveil", [-3.4, -9.2]],
  ["cassia-verane", [-2.5, -9.8]],
  ["yeva-softstep", [-3.0, -8.4]],
  ["milos-radan", [-2.0, -8.8]],
]
staging(
  "a-distraction",
  "blackthorn-ballroom",
  [...party(CROWD_SPOT, [0, -14]), astridBall([0.6, -19.6], [0, -4]), member("aelindor", "Aelindor", "Elven bard", 1.85, "aelindor", [0.4, -12.4], [0, -4]), ...GUESTS.map((g) => ({ ...g }))],
  {
    party: partyShot(CROWD_SPOT, [2.2, 1.8, 3.6]),
    astrid: shotOn("astrid-blackthorn", 3.0, 10, 1.65, 1.6, "Lady Astrid"),
    aelindor: shotOn("aelindor", 2.6, 15, 1.7, 1.65, "Aelindor"),
  },
  "stage",
  { entrances: [{ cast: "aelindor", when: "elf", from: "entrance" }] }
)
// The Speech: Thaddeus on the stage; the curtain is drawn and the drake glares from its cage. The party is in the crowd.
const SPEECH: [string, V2][] = [
  ["branka-stoneveil", [-1.8, -13.0]],
  ["cassia-verane", [-0.9, -13.4]],
  ["yeva-softstep", [-1.4, -12.2]],
  ["milos-radan", [-0.2, -12.8]],
]
const THADDEUS_AT: V2 = [2.4, -22.6]
const drakeCast = member("forest-drake", "The forest drake", "Caged drake", 3.0, "forest-drake", CAGE, [0, 0], { y: STAGE.h + 0.06 })
staging(
  "the-speech",
  "blackthorn-ballroom-drake",
  [
    ...party(SPEECH, [1, -22]),
    thaddeus(THADDEUS_AT, [0, -10], { y: STAGE.h }),
    member("eamon", "Eamon", "Scholar", 1.78, "eamon", [2.2, -11.0], [2.4, -22.6]),
    drakeCast,
    guest("guest-gold", [3.6, -12.4], [2.4, -22.6]),
    guest("guest-ivory", [-3.2, -14.6], [2.4, -22.6]),
  ],
  {
    party: partyShot(SPEECH, [2.2, 1.8, 3.6]),
    thaddeus: shotOn("thaddeus-blackthorn", 4.2, 0, 1.0, 1.7, "Lord Thaddeus", 46),
    drake: { position: [-1.6, 1.6, -15], target: [CAGE[0], 2.6, CAGE[1]], fov: 50, label: "The drake" },
    eamon: shotOn("eamon", 2.2, -15, 1.65, 1.6, "Eamon"),
  },
  "stage"
)
// Death to the Murderer: the assassin breaks from the crowd at the stage's foot, strikes Thaddeus, and runs for the
// balcony doors. Thaddeus falls on the stage.
staging(
  "death-to-the-murderer",
  "blackthorn-ballroom-drake",
  [
    ...party(SPEECH, [1, -22]),
    thaddeus(THADDEUS_AT, [0, -10], { y: STAGE.h }),
    member("covenant-assassin", "A hooded figure", "Covenant assassin", 1.8, "covenant-assassin", [3.6, -20.4], [2.4, -22.6]),
    drakeCast,
    guest("guest-gold", [3.6, -12.4], [2.4, -22.6]),
    guest("guest-ivory", [-3.2, -14.6], [2.4, -22.6]),
  ],
  {
    party: partyShot(SPEECH, [2.2, 1.8, 3.6]),
    thaddeus: shotOn("thaddeus-blackthorn", 4.2, 0, 1.0, 1.7, "Lord Thaddeus", 46),
    assassin: shotOn("covenant-assassin", 2.6, 20, 1.6, 1.6, "The assassin"),
    fall: { position: [4.6, 2.4, -19.2], target: [2.4, 0.9, -22.8], fov: 50, label: "Thaddeus falls" },
    balcony: { position: [HW - 3.6, 1.7, BALCONY_Z + 2.4], target: [HW + 3, 1.3, BALCONY_Z], fov: 56, label: "The balcony" },
  },
  "stage",
  {
    exits: [
      { cast: "thaddeus-blackthorn", when: "gasps", lands: [2.4, -24.2], shot: "fall" },
      {
        cast: "covenant-assassin",
        when: "races for the balcony",
        via: [
          [4.4, BALCONY_Z],
          [7.4, BALCONY_Z],
        ],
        to: "balcony",
        shot: "balcony",
      },
    ],
  }
)

// ── The grounds by night ──
// The mansion's front faces south across a cobbled court to its wrought-iron gates on the street. A grand stair climbs
// to its doors. East of the house, below the ballroom's balcony, a walled garden: gravel paths between flower beds, an
// ivy-choked wall, and the old drain grate where the assassin vanished. The moon stands over the house's spires.
const FZ = -18
const MW = 46
function grounds(): Obj[] {
  const o: Obj[] = [
    { type: "box", at: [0, -0.3, 0], size: [140, 0.3, 120], material: "ground" },
    { type: "box", at: [-6, -0.2, 3], size: [30, 0.22, 42], material: "cobbles" },
  ]
  // The house: a long front of dressed stone three storeys high under a slate roof, lit windows, corner towers with
  // spires, a portico of columns at the head of the stair.
  o.push({ type: "box", at: [0, 0, FZ - 8], size: [MW, 15, 16], material: "ashlar", solid: true })
  o.push({ type: "box", at: [0, 15, FZ - 8], size: [MW + 0.6, 0.6, 16.6], material: "ashlarTrim" })
  // A steep slate roof, its ridge along the front.
  o.push({
    type: "extrude",
    at: [-MW / 2, 15.6, FZ - 8],
    yaw: 90,
    points: [
      [-8.4, 0],
      [8.4, 0],
      [0, 6.2],
    ],
    depth: MW,
    material: "roof",
  })
  for (const x of [-MW / 2 - 2, MW / 2 + 2])
    o.push({ type: "squareTower", at: [x, FZ - 6], width: 7, height: 24, pennant: "bannerAsterian", materials: { wall: "ashlar", roof: "roof", trim: "ashlarTrim" } })
  // Rows of tall windows, most lit.
  for (let fl = 0; fl < 3; fl++)
    for (let i = 0; i < 11; i++) {
      const x = -MW / 2 + 2.6 + i * 4.08
      if (fl === 0 && Math.abs(x) < 4) continue
      const lit = (i * 7 + fl * 3) % 5 !== 0
      o.push({ type: "box", at: [x, 1.6 + fl * 4.6, FZ + 0.02], size: [1.6, 2.8, 0.06], material: lit ? "windowWarm" : "windowDark" })
      o.push({ type: "box", at: [x, 1.6 + fl * 4.6, FZ + 0.07], size: [0.07, 2.8, 0.04], material: "ashlarTrim" })
      for (const dy of [0.95, 1.9]) o.push({ type: "box", at: [x, 1.6 + fl * 4.6 + dy, FZ + 0.07], size: [1.6, 0.06, 0.04], material: "ashlarTrim" })
      o.push({ type: "box", at: [x, 1.45 + fl * 4.6, FZ + 0.12], size: [2.0, 0.16, 0.24], material: "ashlarTrim" })
      o.push({ type: "box", at: [x, 4.45 + fl * 4.6, FZ + 0.12], size: [2.0, 0.22, 0.24], material: "ashlarTrim" })
    }
  for (const y of [4.2, 8.8]) o.push({ type: "box", at: [0, y, FZ + 0.1], size: [MW, 0.25, 0.3], material: "ashlarTrim" })
  // The doors, the portico and the grand stair.
  o.push({ type: "box", at: [0, 0, FZ + 0.05], size: [3.2, 4.4, 0.1], material: "doorLit" })
  for (const x of [-3.6, -1.8, 1.8, 3.6])
    o.push({ type: "column", at: [x, FZ + 2.4], height: 5.6, radius: 0.36, flutes: 12, gilt: false, materials: { shaft: "ashlar", flute: "ashlarTrim", trim: "ashlarTrim" } })
  o.push({ type: "box", at: [0, 5.6, FZ + 1.6], size: [9.2, 0.8, 3.6], material: "ashlarTrim" })
  for (let i = 0; i < 8; i++) o.push({ type: "box", at: [0, i * 0.2, FZ + 4.2 + (7 - i) * 0.4], size: [10 - i * 0.2, 0.2, 0.4 + i * 0.0 + 0.02], material: "steps" })
  o.push({ type: "box", at: [0, 0, FZ + 2.4], size: [10, 1.6, 3.2], material: "steps", solid: true })
  // The ballroom balcony on the east wing's first floor, over the garden.
  o.push({ type: "gallery", at: [15, 5.4, FZ], length: 8, level: 0, depth: 3.0, rail: 1.05, materials: { deck: "terrace", case: "balustrade", trim: "balustrade" } })
  o.push({ type: "box", at: [15, 5.0, FZ + 1.5], size: [8, 0.4, 3.0], material: "terrace" })
  for (const x of [11.4, 18.6]) o.push({ type: "box", at: [x, 0, FZ + 2.7], size: [0.5, 5.0, 0.5], material: "ashlar" })
  o.push({ type: "box", at: [15, 5.4, FZ + 0.03], size: [2.6, 4.2, 0.06], material: "doorLit" })
  o.push({ type: "rope", from: [17.2, 6.4, FZ + 2.95], to: [17.0, 0.2, FZ + 3.4], sag: 0.05, radius: 0.02 })
  // The front court's wall and the wrought-iron gates on the street, lamps on the piers.
  for (const s of [-1, 1]) {
    o.push({ type: "box", at: [s * 11.5 - 6, 0, 22], size: [17, 2.6, 0.6], material: "ashlar", solid: true })
    o.push({ type: "box", at: [s * 3.2 - 6, 0, 22], size: [1.0, 3.6, 1.0], material: "ashlarTrim", solid: true })
    o.push({ type: "lantern", at: [s * 3.2 - 6, 3.6, 22], height: 0 })
    // A gate leaf swung open inward.
    const hx = s * 2.7 - 6
    for (let k = 0; k < 9; k++) {
      const t = (k + 0.5) / 9
      o.push({ type: "cylinder", at: [r2(hx - s * 0.3 * t), 0, r2(22 - 2.4 * t)], radius: 0.025, height: 3.2 + Math.sin(t * Math.PI) * 0.5, segments: 5, material: "iron" })
    }
    o.push({ type: "beam", from: [hx, 1.0, 22], to: [r2(hx - s * 0.3), 1.0, 19.6], radius: 0.035, segments: 5, material: "iron" })
    o.push({ type: "beam", from: [hx, 2.9, 22], to: [r2(hx - s * 0.3), 2.9, 19.6], radius: 0.035, segments: 5, material: "iron" })
  }
  // Townhouses across the street outside the gates.
  for (let i = 0; i < 9; i++) {
    const x = -34 + i * 6.4
    o.push({
      type: "tenement",
      at: [x, 33],
      yaw: 180,
      w: 6.3,
      d: 8,
      storeys: 2 + (i % 3),
      ground: 3.0,
      storey: 2.7,
      jetty: 0.3,
      lean: ((i * 37) % 7) / 20 - 0.15,
      gable: i % 2 === 0,
      front: i % 3 === 0 ? "shop" : "door",
      lit: 0.4,
      materials: { lit: "windowWarm" },
    })
  }
  // Lamp posts up the drive.
  for (const [x, z] of [
    [-10, 12],
    [-2, 12],
    [-10, 2],
    [-2, 2],
  ])
    o.push({ type: "lantern", at: [x, 0, z], height: 3, post: true })
  // The garden: walled on the east and the south, gravel paths, flower beds, ivy thick on the walls.
  o.push(
    { type: "box", at: [26, 0, 0], size: [0.6, 3.4, 36], material: "ashlar", solid: true },
    { type: "box", at: [17, 0, 18], size: [18, 3.4, 0.6], material: "ashlar", solid: true },
    { type: "box", at: [10, 0, 6], size: [0.6, 1.2, 24], material: "balustrade", solid: true },
    { type: "box", at: [18, -0.08, 0], size: [2.2, 0.1, 34], material: "gravel" },
    { type: "box", at: [18, -0.07, -6], size: [15, 0.1, 2.0], material: "gravel" },
    { type: "box", at: [18, -0.07, 8], size: [15, 0.1, 2.0], material: "gravel" }
  )
  for (const [x, z, sc] of [
    [13.4, -2, 1.3],
    [22.6, -2, 1.4],
    [13.4, 3, 1.2],
    [22.6, 3, 1.3],
    [13.4, 12, 1.4],
    [22.6, 12, 1.2],
    [14.6, -11, 1.0],
  ])
    o.push({ type: "bush", at: [x, z], size: sc })
  // Lanterns on the garden wall.
  for (const z of [-12, 4]) o.push({ type: "wallLantern", at: [25.65, 2.5, z], yaw: -90, reach: 0.4 })
  // Ivy over the east wall and round the grate.
  for (let z = -14; z < 17; z += 2.3) o.push({ type: "bush", at: [25.3, r2(z)], size: r2(1.1 + ((z * 7) % 3) * 0.2) })
  // The drain grate in the paving by the ivy, faint runes on its frame.
  o.push({ type: "box", at: [GRATE[0], -0.06, GRATE[1]], size: [1.6, 0.1, 1.2], material: "ashlarTrim" }, { type: "box", at: [GRATE[0], -0.02, GRATE[1]], size: [1.2, 0.04, 0.9], material: "void" })
  for (let i = 0; i < 7; i++) o.push({ type: "box", at: [r2(GRATE[0] - 0.54 + i * 0.18), 0.0, GRATE[1]], size: [0.05, 0.05, 0.9], material: "iron" })
  for (const dz of [-0.3, 0, 0.3]) o.push({ type: "box", at: [GRATE[0], 0.0, r2(GRATE[1] + dz)], size: [1.2, 0.05, 0.05], material: "iron" })
  for (const [dx, dz] of [
    [-0.7, -0.5],
    [0.7, -0.5],
    [-0.7, 0.5],
    [0.7, 0.5],
  ])
    o.push({ type: "box", at: [r2(GRATE[0] + dx), 0.0, r2(GRATE[1] + dz)], size: [0.12, 0.03, 0.08], material: "rune" })
  return o
}
const GRATE: V2 = [23.8, -9.4]
write(`${SETS}/blackthorn-grounds.json`, {
  format: "d20.stage.set",
  version: 1,
  id: "blackthorn-grounds",
  settingId: "realm-of-myr",
  locationId: "blackthorn-grounds",
  title: "The Blackthorn mansion by night",
  seed: 2701,
  atmosphere: {
    sun: { direction: [0.1, 0.5, -0.86], color: "#a8bcd8", intensity: 1.35, target: [6, 0, 0], distance: 220, shadow: { left: -50, right: 50, top: 50, bottom: -50, near: 100, far: 360, size: 2048 } },
    hemisphere: { sky: "#4a5a7a", ground: "#1a1812", intensity: 0.7 },
    sky: { horizon: "#4a5a72", mid: "#24304a", zenith: "#0c1222", gain: 0.6, clouds: 0.4, stars: 0.5, moon: 3.0 },
    fog: { density: 0.012, color: "#2a3444", start: 20 },
    glow: "#a8bcd8",
    fill: { color: "#ffe8d0", intensity: 1.2, distance: 9 },
    lights: [
      { at: [0, 3.0, FZ + 1.2], color: "#ffb060", intensity: 10, distance: 12 },
      { at: [-9.2, 3.4, 22], color: "#ffa850", intensity: 6, distance: 8 },
      { at: [-2.8, 3.4, 22], color: "#ffa850", intensity: 6, distance: 8 },
      { at: [-10, 2.9, 7], color: "#ffa850", intensity: 5, distance: 9 },
      { at: [15, 7.6, FZ + 1.0], color: "#ffb060", intensity: 6, distance: 8 },
      { at: [GRATE[0] - 1.2, 1.4, GRATE[1] + 1.0], color: "#ffb060", intensity: 3, distance: 6 },
      { at: [GRATE[0], 0.3, GRATE[1]], color: "#5aa0ff", intensity: 1.2, distance: 2.5 },
      { at: [25.0, 2.3, 4], color: "#ffa850", intensity: 5, distance: 8 },
    ],
    environment: 0.3,
    exposure: 1.1,
    grade: "neutral",
    wind: 0.4,
  },
  camera: { near: 0.1, far: 900, min: [-28, 0.4, FZ + 0.6], max: [25.4, 16, 32], maxDistance: 40 },
  materials: {
    ...pick(lower, ["ground", "cobbles", "roof", "windowLit", "windowDark", "iron", "lamp", "lead", "pole", "brass", "glow", "flame", "dark", "void", "rope"]),
    ...pick(library, ["gilt"]),
    bannerAsterian: (square.materials as Obj).banner,
    ashlar: { type: "masonry", a: "#7e786e", b: "#8a8478", c: "#726c62", mortar: "#5e5850", block: [0.9, 0.45], joint: 0.008, relief: 0.004, variance: 0.4, grime: 1.4 },
    ashlarTrim: { type: "masonry", a: "#9a9488", b: "#a49e92", c: "#908a7e", mortar: "#7a746a", block: [1.2, 0.3], joint: 0.005, relief: 0.003, variance: 0.3, grime: 1.0 },
    steps: { type: "masonry", a: "#8a8478", b: "#948e82", c: "#7e786c", mortar: "#5a564e", block: [1.0, 0.2], joint: 0.006, relief: 0.003, variance: 0.3, grime: 1.2 },
    doorLit: { type: "plain", color: "#000000", roughness: 1, emissive: "#ff9a40", emissiveIntensity: 0.7 },
    windowWarm: { type: "plain", color: "#000000", roughness: 1, emissive: "#e88a3a", emissiveIntensity: 0.45 },
    terrace: BALL_MATERIALS.terrace,
    balustrade: BALL_MATERIALS.balustrade,
    gravel: { type: "masonry", a: "#6a665e", b: "#76726a", c: "#5e5a54", mortar: "#4a4640", block: [0.3, 0.3], joint: 0.02, relief: 0.02, variance: 0.5, grime: 0.8, ground: true, stones: 0.12 },
    rune: { type: "plain", color: "#000000", roughness: 1, emissive: "#4a8ae0", emissiveIntensity: 1.2 },
    leaves: { type: "foliage", color: "#1e3a22" },
    leavesDark: { type: "foliage", color: "#142a18" },
    bark: { type: "plain", color: "#2a2018", roughness: 1 },
    roof: (lower.materials as Obj).roof,
    ...pick(lower, ["stone", "stoneTrim", "plaster", "plasterB", "timber", "shopLit", "door", "shutter", "pottery"]),
  },
  objects: grounds(),
  crowd: {
    library: "realm-of-myr",
    avoid: { rects: [], circles: [[-6, 12, 3]] },
    groups: [
      {
        type: "walkers",
        path: [
          [-7, 21],
          [-7, 12],
          [-4, 4],
          [0, FZ + 6],
        ],
        count: 14,
        speed: [0.5, 0.8],
        lateral: [-1.2, 1.2],
        mix: { woman: 3, merchant: 3, traveler: 1 },
      },
      {
        type: "points",
        people: [
          { kind: "porter", at: [-12, 16], yaw: 90 },
          { kind: "porter", at: [-0.5, 18], yaw: -90 },
        ],
      },
    ],
  },
  marks: {
    gates: { at: [-6, 20.6], label: "the iron gates" },
    court: { at: [-6, 10], label: "the courtyard" },
    stair: { at: [0, FZ + 8.4], label: "the foot of the grand staircase" },
    doors: { at: [0, FZ + 4.8], label: "the doors at the top of the stair" },
    garden: { at: [18, 0], label: "the garden" },
    grate: { at: [GRATE[0] - 1.4, GRATE[1]], label: "the drain grate under the ivy" },
    balconyBelow: { at: [16.4, FZ + 4.4], label: "below the balcony" },
    balcony: { at: [15, FZ + 1.6] },
  },
  shots: {
    mansion: { position: [-6.4, 1.7, 26], target: [0, 9, FZ], fov: 56, label: "The mansion" },
    gates: { position: [-6, 1.6, 13], target: [-6, 2.2, 24], fov: 54, label: "The gates" },
    garden: { position: [13.8, 1.7, 10], target: [22, 1.0, -9], fov: 56, label: "The garden" },
    grate: { position: [21.0, 1.4, -6.4], target: [GRATE[0], 0, GRATE[1]], fov: 50, label: "The drain grate" },
    balcony: { position: [16.2, 7.2, FZ + 2.4], target: [21, 0.4, -6], fov: 58, label: "From the balcony" },
  },
  life: { dust: { count: 200, box: [-20, 0.4, -10, 25, 6, 24] } },
})

// Entry to the Ball: the party in the court before the stair, Barok and the door guard at its foot.
const COURT: [string, V2][] = [
  ["branka-stoneveil", [-1.6, -4.6]],
  ["cassia-verane", [-0.6, -4.2]],
  ["yeva-softstep", [0.4, -4.6]],
  ["milos-radan", [1.4, -4.2]],
]
const barok = (at: V2, facing: Facing) => member("barok-redbeard", "Barok Redbeard", "House guard", 1.9, "barok", at, facing)
staging(
  "entry-to-the-ball",
  "blackthorn-grounds",
  [
    ...party(COURT, [0, -12]),
    barok([-1.2, -8.2], [0, -4.4]),
    member("door-guard", "The door guard", "House guard", 1.92, "door-guard", [1.6, -8.4], [0, -4.4]),
    guest("guest-crimson", [-3.6, -2.8], [0, -12]),
    guest("guest-raven", [-2.8, -3.4], [0, -12]),
  ],
  {
    party: partyShot(COURT, [1.6, 1.8, 4.2]),
    barok: shotOn("barok-redbeard", 2.6, 10, 1.75, 1.75, "Barok"),
    guard: shotOn("door-guard", 2.6, -15, 1.75, 1.75, "The door guard"),
  },
  "mansion"
)
// The Chase: from the balcony, the party sees the hooded figure slide down the rope into the garden and make for the
// grate under the ivy.
const BALC: [string, V2][] = [
  ["branka-stoneveil", [13.2, FZ + 2.1]],
  ["cassia-verane", [14.4, FZ + 2.3]],
  ["yeva-softstep", [15.6, FZ + 2.1]],
  ["milos-radan", [16.6, FZ + 2.3]],
]
staging(
  "the-chase",
  "blackthorn-grounds",
  [...party(BALC, GRATE).map((c) => ({ ...c, y: 5.4 })), member("covenant-assassin", "A hooded figure", "Covenant assassin", 1.8, "covenant-assassin", [20.6, -10.4], GRATE)],
  {
    party: { subjects: BALC.map(([id]) => id), offset: [-1.6, 2.2, -1.4], target: [3, -2.0, 6], relative: "world", fov: 56, label: "Party" },
    assassin: shotOn("covenant-assassin", 3.4, 30, 1.8, 1.4, "The hooded figure"),
  },
  "balcony",
  { exits: [{ cast: "covenant-assassin", when: "disappears", to: GRATE }] }
)
// The Hunt for the Assassin: Lady Astrid, in ranger's leathers, leads the party across the moonlit garden to the grate,
// where Eamon is already working at its runes. Blackthorn guards bring lanterns.
const HUNT: [string, V2][] = [
  ["branka-stoneveil", [19.2, -7.0]],
  ["cassia-verane", [20.0, -6.2]],
  ["yeva-softstep", [19.0, -5.6]],
  ["milos-radan", [20.6, -7.4]],
]
staging(
  "the-hunt-for-the-assassin",
  "blackthorn-grounds",
  [
    ...party(HUNT, GRATE),
    member("astrid-blackthorn", "Lady Astrid Blackthorn", "Blackthorn ranger", 1.78, "astrid-blackthorn", [21.4, -8.6], GRATE),
    member("eamon", "Eamon", "Scholar and mage", 1.78, "eamon", [22.6, -10.6], GRATE),
    member("blackthorn-guard", "A Blackthorn guard", "House guard", 1.85, "blackthorn-guard", [18.0, -9.2], GRATE),
    member("blackthorn-guard-2", "A Blackthorn guard", "House guard", 1.85, "blackthorn-guard", [18.4, -4.6], GRATE),
  ],
  {
    party: partyShot(HUNT, [-3.0, 1.8, 2.6]),
    astrid: shotOn("astrid-blackthorn", 2.4, 15, 1.65, 1.6, "Lady Astrid"),
    eamon: shotOn("eamon", 2.2, -20, 1.6, 1.4, "Eamon"),
  },
  "grate"
)

console.log("wrote 3 mansion sets and 9 stagings")
