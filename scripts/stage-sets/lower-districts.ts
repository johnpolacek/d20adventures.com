// Writes March of Davos's Lower Districts (wiki/plans/march-of-davos-sets.md): a narrow street of leaning tenements under
// a house built across it, and the side alley where the Black Market's day signs are carved, at the day's grey end. The
// stagings of its three encounters: the walk in, the urchins, and the search for the signs.
//
//   pnpm exec tsx scripts/stage-sets/lower-districts.ts && pnpm stage:check
//
// The JSON it writes is what the app loads. Edit this file and rerun rather than editing the JSON by hand.

import { readFileSync, writeFileSync } from "node:fs"

type V2 = [number, number]
type Obj = Record<string, unknown>
const SETS = "packages/stage/src/sets/realm-of-myr"
const STAGINGS = "packages/stage/src/stagings/march-of-davos"
const ART = "/stage/fixtures/march-of-davos"
const docks = JSON.parse(readFileSync(`${SETS}/kordavos-docks.json`, "utf8"))
const festival = JSON.parse(readFileSync(`${STAGINGS}/the-harvest-festival.json`, "utf8"))
const r2 = (n: number) => Math.round(n * 100) / 100
function write(path: string, data: unknown) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
}
// A seeded stream, so the generator writes the same street every run.
let seed = 4021
const rnd = (a = 0, b = 1) => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return a + ((b - a) * seed) / 4294967296
}
const pickOne = <T>(xs: T[]) => xs[Math.floor(rnd(0, xs.length))]

// ── The street ──
// The street runs from the camera's end (z = 14) north under the bridge-house (z = -30) and on to z = -64. Its cobbles
// are 6.4 m wide between the stone ground floors; the storeys jut over it until the eaves almost meet. The alley turns
// off west at z = -7.5, 2.6 m wide, to a dark archway at x = -26.
const HW = 3.2
const NEAR = 14
const FAR = -84
const BRIDGE = -54
const ALLEY = { z0: -8.8, z1: -6.2, x1: -26 }
const D = 8

function house(at: V2, yaw: number, w: number, extra: Obj = {}): Obj {
  const storeys = pickOne([2, 3, 3, 3, 4])
  return {
    type: "tenement",
    at,
    yaw,
    w: r2(w),
    d: D,
    storeys,
    ground: r2(rnd(2.8, 3.3)),
    storey: r2(rnd(2.5, 2.8)),
    jetty: r2(rnd(0.25, 0.45)),
    lean: r2(rnd(-0.35, 0.35)),
    gable: rnd() < 0.6,
    front: pickOne(["door", "door", "arch", "shop", "shop", "plain"]),
    lit: r2(rnd(0.15, 0.5)),
    balcony: rnd() < 0.2,
    ...extra,
  }
}

// One side of the street: houses shoulder to shoulder from `z0` toward `z1`, skipping `gaps`.
function row(side: -1 | 1, z0: number, z1: number, gaps: V2[] = []): Obj[] {
  const out: Obj[] = []
  let z = z0
  while (z > z1 + 3) {
    const w = Math.min(rnd(4.4, 6.6), z - z1)
    const zc = z - w / 2
    const gap = gaps.find(([a, b]) => zc + w / 2 > a && zc - w / 2 < b)
    if (gap) {
      z = gap[0]
      continue
    }
    // Houses next to a gap stand on a corner: frame their sides as well.
    const corner = gaps.some(([a, b]) => Math.abs(zc - w / 2 - b) < 0.3 || Math.abs(zc + w / 2 - a) < 0.3)
    out.push(house([side * (HW + D / 2), r2(zc)], side < 0 ? 90 : -90, w - 0.04, corner ? { sides: true } : {}))
    z -= w
  }
  return out
}

function street(): Obj[] {
  const o: Obj[] = [
    // Cobbles: small wet setts between the houses, a gutter of flags down the middle, the ground beyond.
    { type: "box", at: [0, -0.14, -20], size: [160, 0.1, 200], material: "ground" },
    { type: "box", at: [0, -0.1, (NEAR + FAR) / 2], size: [2 * HW + 0.4, 0.1, NEAR - FAR + 30], material: "cobbles" },
    { type: "box", at: [0, -0.06, (NEAR + FAR) / 2], size: [0.5, 0.06, NEAR - FAR + 30], material: "gutter" },
    { type: "box", at: [(ALLEY.x1 - HW) / 2, -0.1, (ALLEY.z0 + ALLEY.z1) / 2], size: [-ALLEY.x1 - HW + 0.4, 0.1, ALLEY.z1 - ALLEY.z0 + 0.4], material: "cobbles" },
    // The Black Market's day sign cut into a paving stone in the alley, as the painting shows it.
    { type: "panel", at: [-15.25, 0.004, -6.95], size: [1.2, 1.2], pitch: -90, material: "signDagger" },
  ]
  // Both sides of the street, the alley's mouth left open on the west.
  o.push(...row(-1, NEAR + 6, FAR, [[ALLEY.z0, ALLEY.z1]]))
  o.push(...row(1, NEAR + 6, FAR))
  // The house built across the street, its archway the way on, and the end of the street beyond it.
  o.push(
    { ...house([0, BRIDGE], 0, 2 * HW + 1.8, { front: "passage", storeys: 2, gable: false, jetty: 0.3, lean: 0, balcony: true, lit: 0.6 }) },
    // The way back down to the docks: another archway closing the street's near end.
    { ...house([0, NEAR + 10], 180, 2 * HW + 1.8, { front: "passage", storeys: 3, gable: true, jetty: 0.3, lean: -0.15, lit: 0.4 }) },
    house([0, FAR - 6], 0, 2 * HW + 4, { front: "door", storeys: 4, gable: true, lean: 0.2, lit: 0.5 })
  )
  // The alley: houses face into it from both sides, and a dark archway closes its far end.
  for (const [side, z] of [
    [-1, ALLEY.z0 - D / 2],
    [1, ALLEY.z1 + D / 2],
  ] as [number, number][]) {
    let x = -HW - D - 0.1
    while (x > ALLEY.x1 + 3) {
      const w = Math.min(rnd(4.0, 5.6), x - ALLEY.x1)
      o.push(house([r2(x - w / 2), z], side < 0 ? 0 : 180, w - 0.04, { storeys: pickOne([2, 3, 3]), jetty: r2(rnd(0.2, 0.35)), front: pickOne(["door", "arch", "plain", "door"]), sides: false }))
      x -= w
    }
  }
  o.push(
    { ...house([ALLEY.x1 - 3, (ALLEY.z0 + ALLEY.z1) / 2], 90, 6.2, { front: "passage", storeys: 2, gable: true, jetty: 0.2, lean: 0, lit: 0.2 }), d: 6 },
    // A shut gate at the passage's far end, a lamp over it.
    { type: "box", at: [ALLEY.x1 - 5.9, 0, (ALLEY.z0 + ALLEY.z1) / 2], size: [0.12, 2.9, 3.6], material: "door" },
    { type: "box", at: [ALLEY.x1 - 5.8, 1.3, (ALLEY.z0 + ALLEY.z1) / 2], size: [0.06, 0.1, 3.4], material: "iron" },
    { type: "wallLantern", at: [ALLEY.x1 - 5.8, 2.7, (ALLEY.z0 + ALLEY.z1) / 2], yaw: 90, reach: 0.3 },
    // A worn stone threshold across the alley's mouth: a doorway to the walks, so the way in from the street turns there.
    {
      type: "wall",
      at: [-HW - 0.12, (ALLEY.z0 + ALLEY.z1) / 2],
      yaw: 90,
      length: ALLEY.z1 - ALLEY.z0,
      height: 0.04,
      thickness: 0.3,
      openings: [{ at: 0, width: ALLEY.z1 - ALLEY.z0 - 0.06, height: 0.02, kind: "doorway" }],
      materials: { wall: "gutter", timber: "stoneTrim" },
    }
  )
  // Spires of the upper city over the roofs, far up the street.
  o.push(
    { type: "roundTower", at: [-14, -110], r: 3, height: 26, roofHeight: 14, sides: 12, materials: { wall: "far", roof: "roofFar", trim: "far", pennant: "clothRed" } },
    { type: "roundTower", at: [9, -128], r: 2.4, height: 30, roofHeight: 12, sides: 12, materials: { wall: "far", roof: "roofFar", trim: "far", pennant: "clothRed" } },
    { type: "roundTower", at: [22, -96], r: 2.2, height: 20, roofHeight: 10, sides: 12, materials: { wall: "far", roof: "roofFar", trim: "far", pennant: "clothRed" } }
  )
  return o
}

// ── Dressing ──
const CLOTHS = ["linen", "linenB", "clothRed", "clothBlue", "clothDrab"]
function dressing(): Obj[] {
  const o: Obj[] = []
  // Washing strung across the street between the upper storeys.
  for (const [z, y] of [
    [6.5, 7.4],
    [-1.5, 8.0],
    [-14, 7.2],
    [-21, 7.8],
    [-41, 7.0],
    [-50, 7.6],
  ])
    o.push({ type: "laundry", from: [-2.2, y, z], to: [2.2, y + rnd(-0.4, 0.4), z + rnd(-1.2, 1.2)], sag: 0.45, items: Math.floor(rnd(4, 8)), cloths: CLOTHS })
  // And across the alley.
  for (const x of [-13, -18.5, -23]) o.push({ type: "laundry", from: [x, 5.8, ALLEY.z0 + 0.3], to: [x + rnd(-1, 1), 6.0, ALLEY.z1 - 0.3], sag: 0.3, items: 4, cloths: CLOTHS })
  // Lanterns on brackets along both fronts, and shop signs hung out over the cobbles.
  for (const z of [10.5, 3.5, -3.2, -12.5, -19, -25.5, -36, -44, -52, -60, -68]) {
    const side = z % 2 === 0 || Math.round(z) % 2 === 0 ? -1 : 1
    o.push({ type: "wallLantern", at: [side * (HW + 0.05), 2.6, r2(z)], yaw: side < 0 ? 90 : -90, reach: 0.45 })
  }
  for (const z of [8.2, -16.5, -40]) o.push({ type: "wallLantern", at: [HW + 0.05, 2.5, r2(z)], yaw: -90, reach: 0.45 })
  const emblems = ["boot", "mug", "key", "fish", "scissors", "moon"]
  for (const [i, z] of [12, 5.2, -0.6, -11, -17.8, -24, -34, -47].entries()) {
    const side = i % 2 === 0 ? -1 : 1
    o.push({
      type: "hangingSign",
      at: [side * (HW + 0.05), 3.4, z],
      yaw: side < 0 ? 90 : -90,
      reach: 1.1,
      width: 0.75,
      height: 0.5,
      emblem: emblems[i % emblems.length],
      materials: { board: pickOne(["signRed", "signGreen", "signBlue", "signBoard"]) },
    })
  }
  // The alley's lanterns, the serpent-and-moon block over a doorway, and a lamp by the dark archway.
  o.push(
    { type: "wallLantern", at: [-17.0, 2.5, ALLEY.z1 - 0.02], yaw: 180, reach: 0.4 },
    { type: "wallLantern", at: [-20.7, 2.4, ALLEY.z0 + 0.02], yaw: 0, reach: 0.4 },
    { type: "panel", at: [-19.9, 2.2, ALLEY.z0 + 0.03], size: [0.56, 0.56], material: "signSerpent" }
  )
  // Clutter along the walls: barrels, crates, sacks, baskets, handcarts, a rubbish heap, a rain barrel, a vendor's stall.
  const clutter: [string, number, number, Obj][] = [
    ["barrel", -2.7, 9.6, { r: 0.34, h: 0.95 }],
    ["barrel", -2.75, 8.9, { r: 0.3, h: 0.85 }],
    ["crate", 2.7, 7.2, { size: 0.7 }],
    ["crate", 2.65, 6.5, { size: 0.55 }],
    ["sack", 2.6, 5.9, { size: 0.55 }],
    ["basket", -2.8, 4.1, { size: 0.5 }],
    ["barrel", 2.75, 1.0, { r: 0.32, h: 0.9 }],
    ["crate", -2.7, -3.9, { size: 0.65 }],
    ["sack", -2.65, -4.6, { size: 0.6 }],
    ["barrel", 2.75, -10.2, { r: 0.34, h: 1.0 }],
    ["crate", 2.7, -14.0, { size: 0.6 }],
    ["basket", 2.8, -14.7, { size: 0.45 }],
    ["barrel", -2.75, -18.6, { r: 0.3, h: 0.85 }],
    ["crate", -2.7, -22.4, { size: 0.7 }],
    ["sack", 2.6, -23.5, { size: 0.6 }],
    ["barrel", -2.7, -38, { r: 0.33, h: 0.9 }],
    ["crate", 2.7, -45, { size: 0.65 }],
    // The alley's clutter, knocked about.
    ["crate", -12.6, -6.55, { size: 0.6 }],
    ["barrel", -12.7, -8.45, { r: 0.3, h: 0.85 }],
    ["sack", -17.6, -8.5, { size: 0.5 }],
    ["crate", -21.0, -6.5, { size: 0.55 }],
    ["barrel", -22.4, -6.55, { r: 0.3, h: 0.8 }],
  ]
  for (const [type, x, z, p] of clutter) o.push({ type, at: [x, z], yaw: Math.round(rnd(-30, 30)), ...p })
  o.push(
    { type: "crate", at: [-16.4, 0.35, -6.6], yaw: 70, size: 0.5 },
    { type: "box", at: [-16.3, 0, -6.6], yaw: 20, size: [0.7, 0.35, 0.5], material: "crateDark" },
    // A handcart left against the wall, and a vendor's stall under its own canvas.
    { type: "cart", at: [2.45, -6.4], yaw: 3 },
    { type: "stall", at: [-2.45, -26.0], yaw: 90, w: 2.6, d: 1.6, cloth: "tentRust", goods: "pots", sides: false, back: false, frontHeight: 2.2, backRise: 0.2 },
    { type: "stall", at: [2.25, 13.2], yaw: -90, w: 2.4, d: 1.5, cloth: "tentGreen", goods: "baskets", sides: false, back: false, frontHeight: 2.2, backRise: 0.2 }
  )
  return o
}

// ── Materials ──
function materials(): Obj {
  const keep = [
    "far",
    "roofFar",
    "ground",
    "table",
    "crate",
    "crateDark",
    "barrel",
    "sack",
    "sackB",
    "basket",
    "iron",
    "brass",
    "void",
    "pottery",
    "potteryB",
    "goodsRed",
    "goodsGreen",
    "goodsYellow",
    "goodsTeal",
    "rope",
    "straw",
    "clothDrab",
    "tentRust",
    "tentGreen",
    "lead",
    "pole",
    "coin",
    "gourd",
    "door",
    "flame",
    "fire",
    "coal",
    "crystal",
    "tablecloth",
    "chest",
  ]
  const m: Obj = Object.fromEntries(keep.filter((k) => docks.materials[k]).map((k) => [k, docks.materials[k]]))
  return {
    ...m,
    // Grey-brown stone and soot-dark timber under a grey sky, cold blue in the shade and warm where lamps fall, as the
    // paintings have it: wet setts, damp plaster gone green and grey.
    cobbles: {
      type: "masonry",
      a: "#3e4246",
      b: "#4a4e52",
      c: "#34383c",
      mortar: "#16181a",
      block: [0.7, 0.5],
      joint: 0.035,
      relief: 0.08,
      variance: 0.6,
      grime: 1.6,
      ground: true,
      stones: 0.16,
      roughness: 0.3,
    },
    gutter: { type: "masonry", a: "#3a3836", b: "#44403c", c: "#302e2c", mortar: "#161412", block: [0.5, 0.36], joint: 0.03, relief: 0.06, variance: 0.4, grime: 2.0, ground: true, roughness: 0.3 },
    // Rough coursed stone, soot-dark, its joints close to the stone's own colour: dark joints would be inked by the paint pass.
    stone: { type: "masonry", a: "#56504a", b: "#6a625a", c: "#4a4440", mortar: "#3a3430", block: [0.46, 0.28], joint: 0.012, relief: 0.008, variance: 0.8, grime: 2.2 },
    stoneTrim: { type: "rock", a: "#56504a", b: "#6c645c", moss: "#3a4232", mossLight: "#4c5640", lichen: "#7a7468", mossAmount: 0.35, lichenAmount: 0.1, relief: 0.4, scale: 0.8 },
    plaster: { type: "rock", a: "#7a7268", b: "#8e867a", moss: "#4c5244", mossLight: "#5e6454", lichen: "#a09888", mossAmount: 0.3, lichenAmount: 0.15, relief: 0.15, scale: 1.6 },
    plasterB: { type: "rock", a: "#6e6a62", b: "#84786a", moss: "#4a4a40", mossLight: "#5c5a4e", lichen: "#9a9080", mossAmount: 0.35, lichenAmount: 0.12, relief: 0.15, scale: 1.4 },
    timber: { type: "wood", a: "#2a201a", b: "#342820", c: "#262220", plank: [0, 40], relief: 0.04, seed: 3.7 },
    roof: { type: "masonry", a: "#3c3e42", b: "#46484c", c: "#323438", mortar: "#18181a", block: [0.42, 0.26], joint: 0.03, relief: 0.08, variance: 0.5, grime: 1.2 },
    shutter: { type: "painted", map: "/stage/textures/boat-paint.jpg", tint: "#6a7468", plank: [0.12, 2], size: [0.5, 1.4], relief: 0.08, grime: 1.4 },
    dark: { type: "plain", color: "#14110e", roughness: 1 },
    windowLit: { type: "plain", color: "#000000", roughness: 1, emissive: "#ff9a40", emissiveIntensity: 0.8 },
    shopLit: { type: "plain", color: "#000000", roughness: 1, emissive: "#d27a34", emissiveIntensity: 0.45 },
    windowDark: { type: "plain", color: "#141820", roughness: 0.2 },
    lamp: { type: "plain", color: "#000000", roughness: 1, emissive: "#ffa850", emissiveIntensity: 2.2 },
    gilt: { type: "metal", color: "#b08a48", roughness: 0.45, metalness: 0.8 },
    signBoard: { type: "plain", color: "#3a2a1e", roughness: 0.8 },
    signRed: { type: "plain", color: "#5a2420", roughness: 0.8 },
    signGreen: { type: "plain", color: "#2a3e2c", roughness: 0.8 },
    signBlue: { type: "plain", color: "#26344a", roughness: 0.8 },
    linen: { type: "cloth", color: "#c8c0ae" },
    linenB: { type: "cloth", color: "#a8a49a" },
    clothRed: { type: "cloth", color: "#7a3a2c" },
    clothBlue: { type: "cloth", color: "#3e4e66" },
    puddle: { type: "water", color: "#1e2428", reflect: 6, ripple: 0.3, flow: [0, 1], mirror: 0.6 },
    signDagger: { type: "image", map: "/stage/textures/sign-dagger.jpg", roughness: 0.5 },
    signSerpent: { type: "image", map: "/stage/textures/sign-serpent.jpg", roughness: 0.8 },
  }
}

// ── The set ──
const MARKS = {
  street: { at: [0, 8], label: "the street" },
  bridge: { at: [0, BRIDGE + 4], label: "the archway under the bridge-house" },
  beyond: { at: [0, BRIDGE - 7], label: "the street beyond the archway" },
  alleyMouth: { at: [-3.6, -7.5], label: "the mouth of the side alley" },
  alley: { at: [-12, -7.5], label: "the alley" },
  sign: { at: [-14.4, -7.6], label: "the carved sign in the paving" },
  serpent: { at: [-19.9, -7.2], label: "the serpent-and-moon carving over the doorway" },
  archway: { at: [-24.6, -7.5], label: "the dark archway at the end of the alley" },
  stall: { at: [-0.4, -26.0], label: "the pot-seller's stall" },
  cart: { at: [1.0, -5.0], label: "the handcart" },
}
const SHOTS = {
  street: { position: [-1.9, 1.6, 12.6], target: [0.5, 2.7, -44], fov: 52, label: "The Lower Districts" },
  crowd: { position: [1.2, 1.6, 2.0], target: [-0.6, 1.5, -12], fov: 54, label: "The crowd" },
  bridge: { position: [0.6, 1.6, -40], target: [0, 4.2, -54], fov: 58, label: "The bridge-house" },
  alley: { position: [-4.4, 1.65, -7.8], target: [-25, 1.8, -7.4], fov: 56, label: "The alley" },
  sign: { position: [-13.5, 0.95, -7.4], target: [-15.6, 0.0, -7.6], fov: 58, label: "The carved sign" },
  serpent: { position: [-18.9, 1.65, -6.6], target: [-19.9, 2.45, -8.8], fov: 32, label: "The serpent and moon" },
  roofs: { position: [2.4, 1.3, -2.5], target: [-1.0, 8.5, -16], fov: 60, label: "The leaning houses" },
}

function lowerDistricts() {
  return {
    format: "d20.stage.set",
    version: 1,
    id: "kordavos-lower-districts",
    settingId: "realm-of-myr",
    locationId: "kordavos-lower-districts",
    title: "The Lower Districts of Kordavos",
    seed: 4021,
    atmosphere: {
      // The day's grey end: a low sun behind thin cloud far up the street, cool sky light, and lamps already lit.
      sun: {
        direction: [-0.18, 0.32, -0.93],
        color: "#d8c8b0",
        intensity: 1.6,
        target: [0, 0, -14],
        distance: 220,
        shadow: { left: -40, right: 40, top: 50, bottom: -50, near: 120, far: 360, size: 4096 },
      },
      hemisphere: { sky: "#9aa6b4", ground: "#3a342e", intensity: 0.75 },
      sky: { horizon: "#b4b8b4", mid: "#8a96a2", zenith: "#56606e", gain: 0.85, clouds: 1, stars: 0, moon: 0 },
      fog: { density: 0.022, color: "#8a9298", start: 16 },
      glow: "#c8b89c",
      fill: { color: "#e8e4dc", intensity: 1.0, distance: 9 },
      lights: [
        { at: [-2.6, 2.3, 10.5], color: "#ffa850", intensity: 6, distance: 6 },
        { at: [2.6, 2.3, 3.5], color: "#ffa850", intensity: 6, distance: 6 },
        { at: [-2.6, 2.3, -3.2], color: "#ffa850", intensity: 6, distance: 6 },
        { at: [2.6, 2.3, -12.5], color: "#ffa850", intensity: 6, distance: 6 },
        { at: [0, 2.6, BRIDGE + 1.5], color: "#ffa850", intensity: 9, distance: 8 },
        { at: [-17.0, 2.2, ALLEY.z1 - 0.5], color: "#ffa850", intensity: 5, distance: 5 },
        { at: [-20.5, 2.1, ALLEY.z0 + 0.6], color: "#ffa850", intensity: 5, distance: 5 },
        { at: [-15.9, 1.5, -6.7], color: "#d0d8e0", intensity: 5, distance: 4 },
      ],
      environment: 0.35,
      exposure: 1.05,
      grade: "neutral",
      wind: 0.4,
    },
    // The camera stays in the street and the alley, below the eaves.
    camera: { near: 0.1, far: 500, min: [ALLEY.x1 + 0.6, 0.4, FAR + 2], max: [HW - 0.3, 9, NEAR + 1], maxDistance: 14 },
    materials: materials(),
    objects: [...street(), ...dressing()],
    paths: {
      street: [
        [-0.8, NEAR + 2],
        [-0.6, 0],
        [-0.9, -18],
        [-0.4, BRIDGE + 1],
        [0, FAR + 4],
      ],
      streetB: [
        [1.3, FAR + 4],
        [1.2, BRIDGE + 1],
        [1.4, -12],
        [1.1, 0],
        [1.3, NEAR + 2],
      ],
    },
    crowd: {
      library: "realm-of-myr",
      groups: [
        { type: "walkers", path: "street", count: 44, speed: [0.6, 1.0], lateral: [-0.9, 0.6], mix: { pilgrim: 10, traveler: 5, merchant: 2, woman: 3, porter: 2, child: 1 } },
        { type: "walkers", path: "streetB", count: 40, speed: [0.6, 1.0], lateral: [-0.6, 0.9], mix: { pilgrim: 10, traveler: 5, packer: 2, woman: 3, child: 1 } },
        {
          type: "points",
          people: [
            { kind: "pilgrim", at: [-2.5, 7.6], yaw: 60 },
            { kind: "woman", at: [2.5, 9.6], yaw: -120 },
            { kind: "merchant", at: [-1.2, -20.6], yaw: 200 },
            { kind: "traveler", at: [2.4, -27.6], yaw: -90 },
            { kind: "pilgrim", at: [-2.4, -33], yaw: 150 },
            { kind: "child", at: [1.8, -38], yaw: 30 },
            { kind: "woman", at: [-1.6, -42], yaw: 170 },
            { kind: "pilgrim", at: [0.4, 4.6], yaw: 175 },
            { kind: "traveler", at: [-0.9, 2.2], yaw: 190 },
            { kind: "pilgrim", at: [1.7, 0.4], yaw: 165 },
            { kind: "woman", at: [-1.9, -2.2], yaw: 10 },
            { kind: "pilgrim", at: [0.6, -6.8], yaw: 200 },
            { kind: "merchant", at: [-1.4, -9.9], yaw: 175 },
            { kind: "pilgrim", at: [1.9, -12.6], yaw: 5 },
            { kind: "traveler", at: [-0.3, -15], yaw: 185 },
            { kind: "pilgrim", at: [-2.1, -24], yaw: 160 },
            { kind: "pilgrim", at: [1.1, -29], yaw: 185 },
          ],
        },
      ],
    },
    marks: MARKS,
    shots: SHOTS,
    life: { dust: { count: 400, box: [-HW, 0.2, -40, HW, 7, NEAR] } },
  }
}
write(`${SETS}/kordavos-lower-districts.json`, lowerDistricts())

// ── Cast and stagings ──
const art = (name: string) => ({ front: `${ART}/${name}-front.webp`, back: `${ART}/${name}-back.webp`, portrait: `${ART}/${name}-portrait.jpg` })
const member = (id: string, name: string, role: string, height: number, file: string, at: V2, facing: string | V2 | number) => ({ id, name, role, height, art: art(file), at, facing })
const party = (spots: [string, V2][], facing: V2) => spots.map(([id, at]) => ({ ...festival.cast.find((c: Obj) => c.id === id), at, facing }))
const shotOn = (subject: string, distance: number, angle: number, height: number, lookHeight: number, label: string) => ({ subject, distance, angle, height, lookHeight, fov: 44, label })
function staging(id: string, cast: Obj[], shots: Obj, shot: string, extra: Obj = {}) {
  write(`${STAGINGS}/${id}.json`, { format: "d20.stage.staging", version: 1, id: `march-of-davos/${id}`, set: "realm-of-myr/kordavos-lower-districts", cast, shots, shot, ...extra })
}
const fiddler = (at: V2, facing: V2) => member("fiddler", "A street fiddler", "Street musician", 1.75, "fiddler", at, facing)
const local = (at: V2, facing: V2) => member("hooded-local", "A hooded woman", "Local", 1.64, "hooded-local", at, facing)
const fence = (at: V2, facing: V2) => member("fence", "A trinket-seller", "Street merchant", 1.78, "fence", at, facing)

// Welcome to the Lower Districts: the party has come up from the docks and stands where the street narrows, looking up
// it toward the bridge-house. A fiddler plays by a doorway, a hooded woman hurries past, a trinket-seller watches.
const ARRIVE: [string, V2][] = [
  ["branka-stoneveil", [-1.1, 9.6]],
  ["cassia-verane", [-0.2, 9.9]],
  ["yeva-softstep", [0.7, 9.5]],
  ["milos-radan", [1.2, 9.9]],
]
staging(
  "welcome-to-the-lower-districts",
  [...party(ARRIVE, [0, -4]), fiddler([2.55, 4.4], [0.5, 8]), local([-1.4, 3.0], [1, 9]), fence([-2.55, -1.6], [0, 8])],
  {
    party: { subjects: ARRIVE.map(([id]) => id), offset: [1.6, 1.7, -4.2], target: [0, 1.2, 0], relative: "world", fov: 54, label: "Party" },
    fiddlerShot: shotOn("fiddler", 2.3, -30, 1.65, 1.5, "The fiddler"),
  },
  "street"
)

// Beset by Street Urchins: further up, by the alley's mouth, the crowd thick around the party; the urchins weave in
// among them, Mara skipping right up to the heroes and Finn slipping past behind.
const PRESS: [string, V2][] = [
  ["branka-stoneveil", [-1.2, -1.2]],
  ["cassia-verane", [-0.3, -0.8]],
  ["yeva-softstep", [0.6, -1.3]],
  ["milos-radan", [1.4, -0.7]],
]
staging(
  "beset-by-street-urchins",
  [
    ...party(PRESS, [0, -10]),
    member("mara-redleaf", "A red-haired urchin", "Urchin", 1.02, "mara-redleaf", [0.2, -2.6], [0, 2]),
    member("finn-swiftfoot", "A wide-eyed urchin", "Urchin", 1.0, "finn-swiftfoot", [-1.9, 0.3], [2, -2]),
    member("urchin-a", "A laughing urchin", "Urchin", 0.95, "urchin-a", [0.9, -4.2], [-1, 1]),
    member("urchin-b", "A whispering urchin", "Urchin", 0.95, "urchin-b", [-2.3, -3.6], [1, 2]),
    fiddler([2.6, -9.4], [0, -1]),
  ],
  {
    mara: { subject: "mara-redleaf", distance: 1.05, angle: 0, height: 0.98, lookHeight: 0.82, fov: 50, label: "Mara" },
    finn: shotOn("finn-swiftfoot", 1.7, 25, 1.0, 0.82, "Finn"),
    urchins: { subjects: ["mara-redleaf", "finn-swiftfoot", "urchin-a", "urchin-b"], offset: [0.4, 1.5, -4.5], target: [0, 0.8, 0], relative: "world", fov: 56, label: "The urchins" },
    party: { subjects: PRESS.map(([id]) => id), offset: [1.2, 1.6, -4.0], target: [0, 1.2, 0], relative: "world", fov: 54, label: "Party" },
  },
  "mara"
)

// Finding the Black Market: in the side alley, the light fading, the party looking for the day's signs. One is cut into
// a paving stone at their feet, one over a doorway further in. A trinket-seller lounges in a doorway, a hooded woman
// hurries out of the archway.
const ALLEY_PARTY: [string, V2][] = [
  ["branka-stoneveil", [-11.2, -7.0]],
  ["cassia-verane", [-12.0, -8.1]],
  ["yeva-softstep", [-12.7, -7.0]],
  ["milos-radan", [-10.4, -7.9]],
]
staging(
  "finding-the-black-market",
  [...party(ALLEY_PARTY, [-15.2, -7.6]), fence([-21.9, -6.75], [-13, -7.5]), local([-23.6, -7.9], [-16, -7.5])],
  {
    party: { subjects: ALLEY_PARTY.map(([id]) => id), offset: [-3.6, 1.6, 0.3], target: [0, 1.2, 0], relative: "world", fov: 54, label: "Party" },
    fenceShot: shotOn("fence", 2.0, -20, 1.68, 1.6, "The trinket-seller"),
  },
  "sign"
)
