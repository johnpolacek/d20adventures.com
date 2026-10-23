// Writes March of Davos's auction house (wiki/plans/march-of-davos-sets.md): the candlelit chamber behind the Black
// Market's curtained door, a horseshoe hall of old stone with a gallery round it, rows of velvet chairs facing a stone
// lectern and a half-round stage, and the stagings of the three auction encounters. One set per lot on the lectern: the
// jewelled dagger, the relic map, and nothing once the map is sold.
//
//   pnpm exec tsx scripts/stage-sets/auction-hall.ts && pnpm stage:check
//
// The JSON it writes is what the app loads. Edit this file and rerun rather than editing the JSON by hand.

import { readFileSync, writeFileSync } from "node:fs"

type V2 = [number, number]
type Obj = Record<string, unknown>
const SETS = "packages/stage/src/sets/realm-of-myr"
const STAGINGS = "packages/stage/src/stagings/march-of-davos"
const ART = "/stage/fixtures/march-of-davos"
const market = JSON.parse(readFileSync(`${SETS}/kordavos-black-market.json`, "utf8"))
const library = JSON.parse(readFileSync(`${SETS}/old-grand-library.json`, "utf8"))
const festival = JSON.parse(readFileSync(`${STAGINGS}/the-harvest-festival.json`, "utf8"))
const pick = (from: Obj, names: string[]) => Object.fromEntries(names.map((n) => [n, (from.materials as Obj)[n]]))
const r2 = (n: number) => Math.round(n * 100) / 100
function write(path: string, data: unknown) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
}

// ── The hall ──
// The stage wall runs across z = -7. Straight side walls at x = ±10 run back to z = 0, and from there the hall closes in
// a half-round of radius 10 round the origin, the entrance at its south point (0, 10) and the side exit at 62 degrees
// east. Angles are degrees round the origin: 0 is +z, 90 is +x.
const R = 10
const NORTH = -7
const H = 9.5
const LEVEL = 4.3
const DAIS = { z: NORTH, r: 4 }
// The auctioneer stands between his lectern and the stage.
const LECTERN: V2 = [0, -1.9]
const SPEAKER: V2 = [0, -2.65]
// Rows of chairs on arcs round the lectern.
const ROW_CENTRE: V2 = [0, -2.4]
const ROWS = [3.4, 4.5, 5.6, 6.7, 7.8]
const SPREAD = 56
const EXIT = 62
const DEG = Math.PI / 180
const polar = (c: V2, a: number, r: number): V2 => [r2(c[0] + Math.sin(a * DEG) * r), r2(c[1] + Math.cos(a * DEG) * r)]
// Seats kept empty of chairs, for the seated cast: [row, angle].
const SEATS: Record<string, [number, number]> = {
  noblewoman: [0, -24],
  merchant: [1, 20],
  collector: [0, 30],
  veiled: [2, -32],
  youngNoble: [1, -48],
  blue: [0, 14],
  hooded: [2, 8],
  beak: [1, -12],
  silver: [2, 40],
  hoodedB: [3, -18],
  blueB: [3, 26],
  merchantB: [2, -50],
  silverhand: [4, 38],
}
const seat = (k: string) => polar(ROW_CENTRE, SEATS[k][1], ROWS[SEATS[k][0]])

function shell(): Obj[] {
  const o: Obj[] = [
    { type: "box", at: [0, -0.14, 0], size: [80, 0.1, 80], material: "ground" },
    { type: "box", at: [0, -0.1, 1.5], size: [2 * R + 1, 0.1, 2 * R + 6], material: "floor" },
    // The half-round wall with its arched niches, lamps glowing in them below and above the gallery, the entrance and the
    // side exit.
    {
      type: "rotunda",
      at: [0, 0],
      radius: R,
      from: -90,
      to: 90,
      height: H,
      thickness: 0.6,
      niche: 15,
      nicheSize: [1.3, 2.4],
      nicheLevels: [0.85, LEVEL + 0.55],
      doors: [
        [0, 2.6],
        [EXIT, 1.4],
      ],
      doorHeight: 3.4,
      cornice: H - 0.5,
      materials: { niche: "nicheGlow" },
    },
    // The straight side walls and the stage wall.
    { type: "wall", at: [-R - 0.2, (NORTH + 0) / 2], yaw: 90, length: -NORTH + 0.4, height: H, thickness: 0.4, a: { finish: "stone" }, b: { finish: "stone" } },
    { type: "wall", at: [R + 0.2, (NORTH + 0) / 2], yaw: -90, length: -NORTH + 0.4, height: H, thickness: 0.4, a: { finish: "stone" }, b: { finish: "stone" } },
    { type: "wall", at: [0, NORTH - 0.2], length: 2 * R + 0.8, height: H, thickness: 0.4, a: { finish: "stone" }, b: { finish: "stone" } },
    // Darkness through the doors: the passage back to the market and the side exit's stair.
    { type: "box", at: [0, 0, R + 1.6], size: [3.4, 3.6, 1.4], material: "void" },
    { type: "box", at: [r2(Math.sin(EXIT * DEG) * (R + 1.2)), 0, r2(Math.cos(EXIT * DEG) * (R + 1.2))], yaw: EXIT, size: [1.8, 3.6, 1.0], material: "void" },
    // Wine curtains hung in the entrance, drawn back, and a plain one half across the side exit.
    { type: "curtain", at: [0, 0, R + 0.62], yaw: 180, width: 2.6, height: 3.4, folds: 14, depth: 0.08, gather: 0.55, side: "both", tie: 0.4, cloth: "curtainWine" },
    { type: "curtain", at: polar([0, 0], EXIT, R + 0.62), yaw: EXIT + 180, width: 1.4, height: 2.7, folds: 8, depth: 0.06, gather: 0.25, side: "left", tie: 0.45, cloth: "curtainDark" },
    // The gallery round the half-round and along the side walls, and the coffered ceiling with a dark painted dome.
    { type: "ringGallery", at: [0, 0], radius: R, from: -90, to: 90, level: LEVEL, depth: 1.7, rail: 1.0, brackets: 9, materials: { deck: "oakDark", case: "oakDark", trim: "gilt" } },
    ...[-1, 1].map((s) => ({
      type: "gallery",
      at: [s * R, LEVEL, NORTH / 2 + 0.6],
      yaw: s < 0 ? 90 : -90,
      length: -NORTH - 1.2,
      level: 0,
      depth: 1.7,
      brackets: 1.6,
      materials: { deck: "oakDark", case: "oakDark", trim: "gilt" },
    })),
    {
      type: "extrude",
      at: [0, H, 0],
      plane: "xz",
      depth: 0.3,
      points: [
        [-R - 0.8, NORTH - 0.6],
        [R + 0.8, NORTH - 0.6],
        [R + 0.8, R + 0.8],
        [-R - 0.8, R + 0.8],
      ],
      holes: [Array.from({ length: 40 }, (_, i) => [r2(Math.cos((i / 40) * 2 * Math.PI) * 5), r2(Math.sin((i / 40) * 2 * Math.PI) * 5 - 1)])],
      material: "ceiling",
    },
    { type: "cupola", at: [0, H + 0.3, 1], radius: 5, rise: 3.2, ribs: 12, oculus: 0, materials: { shell: "dome", trim: "gilt" } },
    { type: "box", at: [0, H + 4, 0], size: [2 * R + 4, 0.4, 2 * R + 20], material: "dark" },
  ]
  // Fill the corners of the ceiling beyond the half-round, so no light falls in round the wall's back.
  for (const s of [-1, 1]) o.push({ type: "box", at: [s * (R + 0.5), 0, 6], size: [1, H + 0.4, 10], material: "dark" })
  return o
}

// ── The stage ──
function stage(lot: "dagger" | "map" | "none"): Obj[] {
  const o: Obj[] = [
    { type: "dais", id: "stage", at: [0, DAIS.z], radius: DAIS.r, height: 0.7, materials: { stone: "lecternStone", top: "stageTop" } },
    // Heavy wine curtains hung across the stage wall between two fluted columns, drawn a little to show the stone.
    { type: "curtain", at: [0, 0.7, NORTH + 0.05], width: 7.4, height: 6.4, folds: 30, depth: 0.12, gather: 0.18, side: "both", tie: 0.55, cloth: "curtainWine" },
    ...[-1, 1].map((s) => ({ type: "column", at: [s * 4.35, NORTH + 0.45], height: 7.2, radius: 0.36, flutes: 18 })),
    { type: "box", at: [0, 7.15, NORTH + 0.4], size: [9.8, 0.5, 0.6], material: "stoneTrim" },
    { type: "box", at: [0, 7.3, NORTH + 0.71], size: [9.6, 0.06, 0.04], material: "gilt" },
    // The serpent-and-moon over the stage.
    { type: "panel", at: [0, 7.7, NORTH + 0.02], size: [1.3, 1.3], material: "signSerpent", depth: 0.06, edge: "gilt" },
    // Lots on the stage awaiting their turn: velvet-draped pedestals, a gilded cage, a covered painting on an easel, a
    // chest, a marble bust.
    ...pedestal(-2.6, -5.3, "drape"),
    ...pedestal(2.5, -5.5, "bust"),
    ...pedestal(-1.0, -6.0, "casket"),
    {
      type: "lathe",
      at: [1.2, 0.7, -6.1],
      profile: [
        [0, 0],
        [0.32, 0],
        [0.32, 0.05],
        [0.04, 0.08],
        [0.04, 0.9],
        [0.3, 0.95],
        [0.32, 1.0],
        [0, 1.02],
      ],
      segments: 18,
      material: "gilt",
    },
    ...Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2
      return {
        type: "beam",
        from: [r2(1.2 + Math.cos(a) * 0.3), 0.75, r2(-6.1 + Math.sin(a) * 0.3)],
        to: [r2(1.2 + Math.cos(a) * 0.12), 1.95, r2(-6.1 + Math.sin(a) * 0.12)],
        radius: 0.012,
        material: "gilt",
      }
    }),
    { type: "sphere", at: [1.2, 1.9, -6.1], radius: 0.13, material: "gilt" },
    // An easel with a covered painting.
    { type: "beam", from: [-3.3, 0.7, -6.0], to: [-3.1, 2.7, -6.2], radius: 0.03, material: "oakDark" },
    { type: "beam", from: [-2.5, 0.7, -6.0], to: [-2.7, 2.7, -6.2], radius: 0.03, material: "oakDark" },
    { type: "beam", from: [-2.9, 0.7, -6.6], to: [-2.9, 2.6, -6.25], radius: 0.03, material: "oakDark" },
    { type: "box", at: [-2.9, 1.45, -6.12], pitch: -6, size: [1.1, 1.2, 0.06], material: "clothVelvet" },
    // Candelabra at the stage's edge, and at the lectern's sides.
    ...[-3.3, 3.3].map((x) => ({ type: "candleStand", at: [x, 0.7, -4.2], height: 1.5, candles: 5 })),
    ...[-2.4, 2.4].map((x) => ({ type: "candleStand", at: [x, -1.4], height: 1.7, candles: 3 })),
    // The lectern, with the night's lot on it.
    { type: "lectern", id: "lectern", at: LECTERN, width: 1.15, lot, materials: { stone: "lecternStone", trim: "oakDark", paper: "mapRoll" } },
  ]
  return o
}
function pedestal(x: number, zz: number, top: "drape" | "bust" | "casket"): Obj[] {
  const o: Obj[] = [
    {
      type: "lathe",
      at: [x, 0.7, zz],
      profile: [
        [0, 0],
        [0.32, 0],
        [0.32, 0.1],
        [0.2, 0.16],
        [0.17, 0.85],
        [0.28, 0.92],
        [0.3, 1.0],
        [0, 1.0],
      ],
      segments: 20,
      material: "stoneTrim",
    },
  ]
  if (top === "drape")
    o.push(
      { type: "sphere", at: [x, 1.7, zz], radius: [0.28, 0.3, 0.28], hemisphere: true, segments: 18, material: "clothVelvet" },
      { type: "cylinder", at: [x, 1.55, zz], radius: [0.32, 0.27], height: 0.18, material: "clothVelvet" }
    )
  if (top === "bust")
    o.push(
      {
        type: "lathe",
        at: [x, 1.7, zz],
        profile: [
          [0, 0],
          [0.16, 0],
          [0.12, 0.06],
          [0.06, 0.1],
          [0.2, 0.22],
          [0.22, 0.32],
          [0.1, 0.38],
          [0.06, 0.42],
        ],
        segments: 18,
        material: "marble",
      },
      { type: "sphere", at: [x, 2.1, zz], radius: [0.1, 0.13, 0.11], segments: 14, material: "marble" }
    )
  if (top === "casket")
    o.push({ type: "strongbox", at: [x, 1.7, zz], yaw: 15, width: 0.5, height: 0.32, depth: 0.34, lid: 0.12, chain: false, materials: { wood: "chest", inner: "dark", iron: "gilt" } })
  return o
}

// ── The rows ──
function rows(): Obj[] {
  // Walks that cannot cross the rows go down the central aisle.
  const o: Obj[] = [
    // `to` is the far end, from `at`. The first lets the auctioneer out round his lectern.
    { type: "aisle", at: [1.05, -2.75], to: [0, 1.95] },
    { type: "aisle", at: [0, 6.3], to: [0, -5.9] },
    { type: "aisle", at: [-7.0, 5.0], to: [-1.2, -6.8] },
    { type: "aisle", at: [7.0, 5.0], to: [1.2, -6.8] },
  ]
  const taken = Object.keys(SEATS).map((k) => `${SEATS[k][0]}/${SEATS[k][1]}`)
  ROWS.forEach((r, ri) => {
    // Chairs every 0.72 m round the arc, a central aisle of 1.6 m left open.
    const step = 0.72 / r / DEG
    for (let a = -SPREAD; a <= SPREAD + 0.01; a += step) {
      if (Math.abs(a) * DEG * r < 0.85) continue
      const ar = Math.round(a)
      if (taken.some((t) => t.startsWith(`${ri}/`) && Math.abs(Number(t.split("/")[1]) - a) < step / 2)) continue
      const [x, zz] = polar(ROW_CENTRE, a, r)
      o.push({ type: "theatreChair", at: [x, zz], yaw: r2(ar + 180), materials: { trim: "oakDark" } })
    }
  })
  return o
}

// ── Dressing ──
function dressing(): Obj[] {
  return [
    // Brass chandeliers of candles over the rows and before the stage.
    { type: "chandelier", at: [-3.6, H - 0.2, 2.2], radius: 0.8, candles: 12, drop: 4.3, materials: { timber: "brass" } },
    { type: "chandelier", at: [3.6, H - 0.2, 2.2], radius: 0.8, candles: 12, drop: 4.3, materials: { timber: "brass" } },
    { type: "chandelier", at: [0, H - 0.2, -3.6], radius: 1.0, candles: 14, drop: 4.0, materials: { timber: "brass" } },
    // Tall banners on the side walls between the gallery and the ceiling, and dark hangings below.
    ...[-1, 1].flatMap((s) => [-5.2, -1.8].map((zz) => ({ type: "box", at: [r2(s * (R - 0.04)), LEVEL + 1.0, zz], size: [0.04, 3.6, 1.4], material: "clothVelvet" }))),
    // A runner up the central aisle.
    { type: "panel", at: [0, 0.006, 9.0], size: [1.3, 9.6], pitch: -90, material: "runner", depth: 0.01, edge: "rugEdge" },
    // A guard's stool and a small table with the ledger of lots by the entrance.
    { type: "cylinder", at: [-2.3, 0, 8.3], radius: [0.22, 0.12], height: 0.72, segments: 14, material: "oakDark", solid: true },
    { type: "cylinder", at: [-2.3, 0.72, 8.3], radius: 0.42, height: 0.05, segments: 24, material: "oakDark" },
    { type: "candleStand", at: [-2.15, 0.77, 8.15], height: 0.25, candles: 1 },
    { type: "box", at: [-2.3, 0.77, 8.3], size: [0.36, 0.06, 0.28], material: "leatherRed" },
  ]
}

// ── Materials ──
function materials(): Obj {
  return {
    ...pick(market, ["stone", "stoneTrim", "gilt", "brass", "iron", "dark", "void", "curtainWine", "lamp", "steel", "paper", "signSerpent", "ground"]),
    ...pick(library, ["candle", "candleFlame", "oakDark", "oak", "timber", "panel", "boards", "door", "lead", "glass", "glassOut", "rugEdge", "plaster"]),
    // Old flagstones, dark and worn.
    floor: { type: "masonry", a: "#3a3a36", b: "#44423c", c: "#32302c", mortar: "#22201c", block: [0.7, 0.5], joint: 0.012, relief: 0.01, variance: 0.6, grime: 2.0, ground: true, roughness: 0.45 },
    ceiling: { type: "masonry", a: "#1c2626", b: "#222e2e", c: "#182222", mortar: "#6a5430", block: [1.25, 1.25], joint: 0.06, relief: 0.3, variance: 0.3, grime: 0.8 },
    dome: { type: "image", map: "/stage/textures/dome-fresco.jpg", roughness: 0.9, tint: "#5a6a66" },
    velvet: { type: "plain", color: "#46101a", roughness: 0.92 },
    // Dark worn stone for the lectern and the stage's drum, its top grey flags.
    lecternStone: { type: "rock", a: "#3e3a36", b: "#4c4842", moss: "#2a2826", mossLight: "#36332f", lichen: "#5a5650", mossAmount: 0.3, lichenAmount: 0.06, relief: 0.35, scale: 0.7 },
    stageTop: { type: "masonry", a: "#4a4640", b: "#56524a", c: "#3e3a36", mortar: "#26221e", block: [0.62, 0.44], joint: 0.012, relief: 0.01, variance: 0.6, grime: 2.0, roughness: 0.5 },
    // The niches glow faintly warm, lamplit, as the painting's arches do.
    nicheGlow: { type: "plain", color: "#000000", roughness: 1, emissive: "#6a3414", emissiveIntensity: 0.55 },
    clothVelvet: { type: "cloth", color: "#3e1016", amp: 0.1 },
    curtainDark: { type: "cloth", color: "#1e1a1c", amp: 0.2, freq: 0.6 },
    runner: { type: "image", map: "/stage/textures/library-rug.jpg", roughness: 1, tint: "#7a5a58" },
    stoneDark: { type: "plain", color: "#1e1c1a", roughness: 1 },
    marble: { type: "rock", a: "#c8c4bc", b: "#e0dcd4", moss: "#a8a49c", mossLight: "#bcb8b0", lichen: "#d8d4cc", mossAmount: 0.2, lichenAmount: 0.1, relief: 0.2, scale: 0.6 },
    mapRoll: { type: "plain", color: "#8a7a5e", roughness: 0.9 },
    relicMap: { type: "image", map: "/stage/textures/relic-map.jpg", roughness: 0.9 },
    leatherRed: { type: "plain", color: "#4a1e14", roughness: 0.6 },
    ruby: { type: "plain", color: "#a01828", roughness: 0.15, emissive: "#ff2040", emissiveIntensity: 0.3 },
    chest: { type: "plain", color: "#3a2416", roughness: 0.7 },
    haze: { type: "glow", color: "#9ec4c0", opacity: 0.03 },
  }
}

// ── The set ──
const MARKS = {
  entrance: { at: [0, 8.6], label: "the entrance" },
  aisle: { at: [0, 4.4], label: "the central aisle" },
  lectern: { at: [0, -1.0], label: "the auctioneer's lectern" },
  stage: { at: [-4.9, -4.4], label: "the steps up to the stage" },
  frontRow: { at: [-1.4, 1.2], label: "the front row" },
  backRow: { at: [-2.0, 6.4], label: "the back of the hall" },
  sideExit: { at: polar([0, 0], EXIT, R - 1.0), label: "the side exit" },
  eastAisle: { at: polar(ROW_CENTRE, 70, 6.0), label: "the east side of the hall" },
  westAisle: { at: polar(ROW_CENTRE, -70, 6.0), label: "the west side of the hall" },
}
const SHOTS = {
  // As the painting: from beside the stage, past the auctioneer's back, across the rows to the gallery.
  auction: { position: [1.05, 2.15, -4.35], target: [-2.0, 1.9, 6.5], fov: 60, label: "The auction" },
  stage: { position: [0, 1.75, 7.2], target: [0, 2.1, -5.5], fov: 56, label: "The stage" },
  lectern: { position: [0.15, 1.55, -0.4], target: [0, 1.35, -2.7], fov: 44, label: "The lectern" },
  gavel: { position: [0.55, 1.24, -2.42], target: [0.2, 1.08, 1.5], fov: 42, label: "The gavel" },
  gallery: { position: [-3.4, 1.6, -2.8], target: [3.6, 5.6, 6.8], fov: 62, label: "The gallery" },
  rows: { position: [-6.4, 2.6, -2.2], target: [2.6, 0.8, 4.0], fov: 58, label: "The bidders" },
  exit: { position: [0.5, 2.3, 0.4], target: [8.6, 1.4, 4.9], fov: 52, label: "The side exit" },
}
const HALL_BOX = [-R, -0.5, NORTH, R, H + 4, R]

function hall(lot: "dagger" | "map" | "none", id: string, title: string) {
  return {
    format: "d20.stage.set",
    version: 1,
    id,
    settingId: "realm-of-myr",
    locationId: "black-market-auction",
    title,
    seed: 2020,
    atmosphere: {
      // Underground and windowless: no sun to speak of, a cold teal dark, the room's own candles.
      sun: { direction: [0.2, 0.9, 0.3], color: "#6a8a90", intensity: 0.05, target: [0, 0, 0], distance: 200, shadow: { left: -14, right: 14, top: 14, bottom: -14, near: 120, far: 300, size: 1024 } },
      hemisphere: { sky: "#4a6a70", ground: "#2a1e14", intensity: 0.45 },
      sky: { horizon: "#1a2426", mid: "#121a1c", zenith: "#0a0e10", gain: 0.5, clouds: 0, stars: 0, moon: 0 },
      fog: { density: 0.014, color: "#2a3c3e", start: 5 },
      fill: { color: "#ffe2c0", intensity: 1.2, distance: 8 },
      lights: [],
      environment: 0.2,
      exposure: 1.0,
      grade: "neutral",
      wind: 0,
    },
    // The hall is a room: candlelight pools on the stage and the lectern, the chandeliers warm the rows, the niches glow
    // round the walls, and a cold teal light hangs high in the dome.
    rooms: [
      {
        box: HALL_BOX,
        ambient: 0.4,
        fill: 1.4,
        exposure: 1.4,
        lights: [
          { at: [0, 2.6, -4.6], color: "#ffb470", intensity: 16, distance: 7 },
          { at: [0.3, 2.7, -0.9], color: "#ffbc78", intensity: 5, distance: 4 },
          { at: [-3.6, 4.6, 2.2], color: "#ffb870", intensity: 14, distance: 8 },
          { at: [3.6, 4.6, 2.2], color: "#ffb870", intensity: 14, distance: 8 },
          { at: [-6.8, 2.2, 2.6], color: "#ff9a50", intensity: 8, distance: 6 },
          { at: [6.5, 2.4, 2.0], color: "#ff9a50", intensity: 10, distance: 6.5 },
          { at: [0, 6.2, 7.8], color: "#ff9a50", intensity: 10, distance: 7 },
          { at: [0, 10.5, 1], color: "#7ab0b0", intensity: 18, distance: 13 },
        ],
      },
    ],
    camera: { near: 0.1, far: 300, min: [-R + 0.6, 0.4, NORTH + 0.6], max: [R - 0.6, H - 1, R - 0.6], maxDistance: 16 },
    materials: materials(),
    objects: [
      ...shell(),
      ...stage(lot),
      ...rows(),
      ...dressing(),
      // A faint haze of candle smoke hanging under the dome.
      { type: "beam", from: [0, H + 2, 1], to: [0, 0, 1], radius: 3.2, radiusTo: 6.5, segments: 20, material: "haze", open: true },
    ],
    crowd: {
      library: "realm-of-myr",
      groups: [
        // The gallery packed with onlookers at the rail, and a few standing at the back of the hall.
        {
          type: "points",
          people: [
            ...Array.from({ length: 26 }, (_, i) => {
              const a = -84 + i * (168 / 25)
              const [x, zz] = polar([0, 0], a + (i % 2 ? 1.4 : -1.4), R - 0.85 - (i % 3) * 0.32)
              return { kind: (["merchant", "pilgrim", "woman", "traveler", "merchant", "woman"] as const)[i % 6], at: [x, zz] as V2, yaw: r2(a + 180), y: LEVEL }
            }),
            ...[-1, 1].flatMap((s) =>
              [-5.6, -3.6, -1.6].map((zz, i) => ({ kind: (["woman", "merchant", "traveler"] as const)[i], at: [r2(s * (R - 0.9)), zz] as V2, yaw: s < 0 ? 90 : -90, y: LEVEL }))
            ),
            { kind: "merchant", at: [-4.4, 7.4], yaw: 160 },
            { kind: "woman", at: [-5.2, 6.6], yaw: 150 },
            { kind: "pilgrim", at: [4.8, 7.0], yaw: 210 },
            { kind: "soldier", at: [-1.9, 9.1], yaw: 180 },
            { kind: "soldier", at: [-6.6, -5.8], yaw: 120 },
            { kind: "soldier", at: [6.6, -5.8], yaw: 240 },
          ],
        },
      ],
    },
    marks: MARKS,
    shots: SHOTS,
    life: { dust: { count: 300, box: [-8, 0.5, -6, 8, 7, 8] } },
  }
}
write(`${SETS}/black-market-auction.json`, hall("dagger", "black-market-auction", "The auction house"))
write(`${SETS}/black-market-auction-relic.json`, hall("map", "black-market-auction-relic", "The auction house, the relic on the lectern"))
write(`${SETS}/black-market-auction-sold.json`, hall("none", "black-market-auction-sold", "The auction house, the relic sold"))

// ── Cast and stagings ──
const art = (name: string) => ({ front: `${ART}/${name}-front.webp`, back: `${ART}/${name}-back.webp`, portrait: `${ART}/${name}-portrait.jpg` })
const member = (id: string, name: string, role: string, height: number, file: string, at: V2, facing: string | V2 | number) => ({ id, name, role, height, art: art(file), at, facing })
// The party stands at the back of the hall by the entrance, as the late come do.
const PARTY: [string, V2][] = [
  ["branka-stoneveil", [-2.2, 7.0]],
  ["cassia-verane", [-1.3, 7.45]],
  ["yeva-softstep", [1.3, 7.45]],
  ["milos-radan", [2.2, 7.0]],
]
const party = (facing: V2) => PARTY.map(([id, at]) => ({ ...festival.cast.find((c: Obj) => c.id === id), at, facing }))
const toStage: V2 = [0, -3]
const auctioneer = member("auctioneer", "The Auctioneer", "Auctioneer", 1.88, "auctioneer", SPEAKER, [0, 6])
const assistant = member("auction-assistant", "The assistant", "Auction assistant", 1.68, "auction-assistant", [-1.55, -2.75], [-0.3, -1.9])
const bidder = (id: string, file: string, name: string, k: string) => member(id, name, "Bidder", 1.36, file, seat(k), toStage)
const BIDDERS = [
  bidder("bidder-noblewoman", "bidder-noblewoman", "A masked noblewoman", "noblewoman"),
  bidder("bidder-merchant", "bidder-merchant", "A masked merchant", "merchant"),
  bidder("bidder-collector", "bidder-collector", "A masked collector", "collector"),
  bidder("bidder-veiled", "bidder-veiled", "A veiled lady", "veiled"),
  bidder("bidder-young-noble", "bidder-young-noble", "A masked young noble", "youngNoble"),
  bidder("bidder-blue", "bidder-blue", "A lady in a blue mask", "blue"),
  bidder("bidder-hooded", "bidder-hooded", "A hooded buyer", "hooded"),
  bidder("bidder-beak", "bidder-beak", "A buyer in a beaked mask", "beak"),
  bidder("bidder-silver", "bidder-silver", "An elf in a silver mask", "silver"),
  bidder("bidder-hooded-b", "bidder-hooded", "Another hooded buyer", "hoodedB"),
  bidder("bidder-blue-b", "bidder-blue", "A masked lady", "blueB"),
  bidder("bidder-merchant-b", "bidder-merchant", "A stout masked buyer", "merchantB"),
]
const SH = seat("silverhand")
const guards = (spots: [V2, V2], facing: V2 | string) => [
  member("raskov-guard-a", "A silent guard", "Raskov guard", 1.85, "raskov-guard", spots[0], facing),
  member("raskov-guard-b", "A silent guard", "Raskov guard", 1.85, "raskov-guard", spots[1], facing),
]
const shotOn = (subject: string, distance: number, angle: number, height: number, lookHeight: number, label: string) => ({ subject, distance, angle, height, lookHeight, fov: 44, label })
const partyShot = { subjects: PARTY.map(([id]) => id), offset: [0.4, 1.75, -3.6], target: [0, 1.15, 0], relative: "world", fov: 56, label: "Party" }
function staging(id: string, set: string, cast: Obj[], shots: Obj, shot: string, extra: Obj = {}) {
  write(`${STAGINGS}/${id}.json`, { format: "d20.stage.staging", version: 1, id: `march-of-davos/${id}`, set: `realm-of-myr/${set}`, cast, shots, shot, ...extra })
}

// The Auction Begins: the jewelled dagger on the lectern, the auctioneer behind it, the bidders in their seats. Silverhand
// sits near the back by the side exit, not yet named, his man standing at his shoulder and his guards behind.
staging(
  "the-auction-begins",
  "black-market-auction",
  [
    ...party(toStage),
    auctioneer,
    assistant,
    ...BIDDERS,
    member("silverhand", "A hooded man with a silver gauntlet", "Smuggler lord", 1.36, "silverhand-seated", SH, toStage),
    member("silverhand-representative", "A man in a black coat", "Representative", 1.86, "silverhand-representative", polar(ROW_CENTRE, 47, 8.8), toStage),
    ...guards([polar(ROW_CENTRE, 33, 8.75), polar(ROW_CENTRE, 42, 8.85)], toStage),
  ],
  {
    auctioneer: shotOn("auctioneer", 2.4, 0, 1.75, 1.7, "The Auctioneer"),
    silverhand: shotOn("silverhand", 2.2, -20, 1.4, 1.15, "The hooded man"),
    party: partyShot,
  },
  "auction"
)

// A Relic of Old Valkara: the map laid open on the lectern. Silverhand's representative has stepped forward into the
// east aisle to bid; Silverhand watches from his seat.
staging(
  "a-relic-of-old-valkara",
  "black-market-auction-relic",
  [
    ...party(toStage),
    auctioneer,
    assistant,
    ...BIDDERS,
    member("silverhand", "Silverhand", "Smuggler lord", 1.36, "silverhand-seated", SH, toStage),
    member("silverhand-representative", "Silverhand's representative", "Representative", 1.86, "silverhand-representative", polar(ROW_CENTRE, 64, 6.9), toStage),
    ...guards([polar(ROW_CENTRE, 33, 8.75), polar(ROW_CENTRE, 42, 8.85)], toStage),
  ],
  {
    map: { position: [0.1, 2.05, -0.95], target: [-0.05, 1.05, -1.95], fov: 40, label: "The map" },
    auctioneer: shotOn("auctioneer", 2.4, 0, 1.75, 1.7, "The Auctioneer"),
    representative: shotOn("silverhand-representative", 2.3, 25, 1.75, 1.7, "The representative"),
    silverhand: shotOn("silverhand", 2.2, -20, 1.4, 1.15, "Silverhand"),
    party: partyShot,
  },
  "lectern"
)

// The Winning Bid: sold. The representative is at the side exit with the map case; Silverhand has risen and follows,
// his two guards flanking him.
const EXIT_IN = polar([0, 0], EXIT, R - 1.1)
staging(
  "the-winning-bid",
  "black-market-auction-sold",
  [
    ...party(toStage),
    auctioneer,
    assistant,
    ...BIDDERS,
    member("silverhand", "Silverhand", "Smuggler lord", 1.88, "silverhand", polar(ROW_CENTRE, 61, 8.5), EXIT_IN),
    member("silverhand-representative", "Silverhand's representative", "Representative", 1.86, "silverhand-representative", EXIT_IN, polar([0, 0], EXIT, R + 2)),
    ...guards([polar(ROW_CENTRE, 55, 9.1), polar(ROW_CENTRE, 66, 7.9)], EXIT_IN),
  ],
  {
    auctioneer: shotOn("auctioneer", 2.4, 0, 1.75, 1.7, "The Auctioneer"),
    silverhand: shotOn("silverhand", 2.6, 30, 1.75, 1.65, "Silverhand"),
    party: partyShot,
  },
  "gavel"
)
