// Writes Covert Cargo's Stageview sets and stagings from the adventure's art (wiki/plans/covert-cargo-3d.md):
// the Mordava pier before dawn, the riverboat's cabin, the Kordavos riverfront and the old forest path.
//
//   pnpm exec tsx scripts/stage-sets/covert-cargo.ts && pnpm stage:check
//
// The JSON it writes is what the app loads. Edit this file and rerun rather than editing the JSON by hand.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"

type V2 = [number, number]
type Obj = Record<string, unknown>
const SETS = "packages/stage/src/sets/realm-of-myr"
const STAGINGS = "packages/stage/src/stagings/covert-cargo"
const gate = JSON.parse(readFileSync(`${SETS}/kordavos-south-gate.json`, "utf8"))
const pick = (from: { materials: Record<string, unknown> }, names: string[]) => Object.fromEntries(names.map((n) => [n, from.materials[n]]))
const r2 = (n: number) => Math.round(n * 100) / 100
// Boards painted from the art (scripts/stage-textures.ts). size = [across, along] the grain the painting covers, in metres.
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
// The `extrude` primitive's "xz" plane mirrors z, so ground outlines are written mirrored.
const ground = (pts: V2[]) => pts.map(([x, z]) => [r2(x), r2(-z)])
// Deterministic jitter for hand-placed rows.
let seed = 7
const rnd = (a = 0, b = 1) => {
  seed = (seed * 16807) % 2147483647
  return a + ((seed - 1) / 2147483646) * (b - a)
}
// Circles along a polyline, for scatters to keep clear.
function clearAlong(pts: V2[], r: number, step = 1.6) {
  const out: [number, number, number][] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]
    const [cx, cz] = pts[i + 1]
    const n = Math.max(1, Math.ceil(Math.hypot(cx - ax, cz - az) / step))
    for (let k = 0; k <= n; k++) out.push([r2(ax + ((cx - ax) * k) / n), r2(az + ((cz - az) * k) / n), r])
  }
  return out
}
function write(path: string, data: unknown) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
}
const base = (id: string, locationId: string, title: string) => ({ format: "d20.stage.set", version: 1, id, settingId: "realm-of-myr", locationId, title })

// ── Cast ──
const ART = "/stage/fixtures/covert-cargo"
const art = (name: string) => ({ front: `${ART}/${name}-front.webp`, back: `${ART}/${name}-back.webp`, portrait: `${ART}/${name}-portrait.jpg` })
const CAST = {
  lyra: { id: "lyra", name: "Lyra Silvanus", role: "Asterian arcanist", height: 1.7, art: art("lyra") },
  poppen: { id: "poppen", name: "Poppen Quickfoot", role: "Halfling rogue", height: 1.06, art: art("poppen") },
  reinhard: { id: "npcs-1749163978757", name: "Reinhard", role: "Enforcer", height: 1.92, art: art("reinhard") },
  silas: { id: "npcs-1749181492795", name: "Silas", role: "Rogue, the brains of the mission", height: 1.78, art: art("silas") },
  aelar: { id: "npcs-1749184389465", name: "Aelar Moonglimmer", role: "Elf operative", height: 1.86, art: art("aelar") },
  archer: { id: "npcs-1749243735467", name: "Elven Archer", role: "Wood elf archer", height: 1.8, art: art("elf-archer") },
  fighter: { id: "npcs-1749243869357", name: "Elven Fighter", role: "Elf fighter", height: 1.88, art: art("elf-fighter") },
}
type Who = keyof typeof CAST
const on = (who: Who, at: string | V2, facing: string | number | V2) => ({ ...CAST[who], at, facing: typeof facing === "string" && facing in CAST ? CAST[facing as Who].id : facing })
const close = (who: Who, distance = 3.2, angle = 22, height = 1.6, lookHeight?: number, label?: string) => ({
  subject: CAST[who].id,
  distance,
  angle,
  height,
  lookHeight: lookHeight ?? CAST[who].height * 0.82,
  fov: 44,
  label: label ?? CAST[who].name.split(" ")[0],
})
function staging(id: string, set: string, cast: Obj[], shots: Record<string, Obj>, shot: string) {
  write(`${STAGINGS}/${id}.json`, { format: "d20.stage.staging", version: 1, id: `covert-cargo/${id}`, set: `realm-of-myr/${set}`, cast, shots, shot })
}

// ── The Mordava pier before dawn ──
// The river runs along -z into the fog. The west bank edge is near x = 0, the pier lies along it, and the boat is moored
// alongside, bow upstream. Ground and decks are at y = 0; the water is 0.47 m below.
function pierSet() {
  const center = (zz: number) => 8.3 + 7 * Math.sin(-zz / 140) + (zz < -120 ? (zz + 120) * 0.05 : 0)
  const width = (zz: number) => 16 + Math.max(0, -zz - 40) * 0.05
  const zs: number[] = []
  for (let zz = 90; zz >= -520; zz -= 10) zs.push(zz)
  const west = zs.map((zz) => [center(zz) - width(zz) / 2, zz] as V2)
  const east = zs.map((zz) => [center(zz) + width(zz) / 2, zz] as V2)
  const river = [...west, ...east.slice().reverse()]
  const wide = [
    ...west.map(([x, zz]) => [x - 0.6, zz] as V2),
    ...east
      .slice()
      .reverse()
      .map(([x, zz]) => [x + 0.6, zz] as V2),
  ]
  const land: V2[] = [
    [-600, 400],
    [600, 400],
    [600, -800],
    [-600, -800],
  ]
  const trailPts: V2[] = [
    [-1.4, 10],
    [-2.4, 12.5],
    [-3.2, 15.5],
    [-4.6, 20],
    [-5.4, 25],
    [-8, 31],
    [-12, 38],
    [-17, 44],
  ]
  const objects: Obj[] = [
    // The banks stand a metre above the water, so the tug's hull shows as in the art.
    { type: "extrude", id: "ground", at: [0, -1.2, 0], points: ground(land), holes: [ground(river)], depth: 1.2, plane: "xz", material: "ground" },
    { type: "extrude", id: "river", at: [0, -1.02, 0], points: ground(wide), depth: 0.02, plane: "xz", material: "water" },
    { type: "trail", id: "bank-trail", points: trailPts, width: 1.3 },
    // The gangway runs from the bank down to the tug's bow, as in the art.
    { type: "pier", id: "gangway", at: [-1.3, 0, 9.8], yaw: 137.4, length: 6.8, width: 1.5, depth: 3.4, span: 2.2, rickety: 0.5 },
    { type: "riverboat", id: "tug", at: [4.6, 0, -0.6], length: 14, beam: 4, draft: 2, sheer: 1, cabin: 0.55, saloon: 0.4, height: 2.35, materials: { helm: "helmGlass" } },
    { type: "lantern", at: [2.75, 0, 5.15], height: 1.45, post: true },
    { type: "crate", at: [5.3, 0, -6.75], yaw: 12, size: 0.6 },
    { type: "barrel", at: [3.95, 0, -6.8], r: 0.28, h: 0.75 },
    { type: "torus", at: [4.6, 0.05, 4.6], radius: 0.24, tube: 0.05, pitch: 90, material: "rope" },
    // Tall mooring pilings round the tug, and lines to its bitts.
    ...[
      [3.05, 5.7, 2.3],
      [2.55, 3.3, 1.8],
      [2.3, -5.7, 1.6],
      [6.6, -6.5, 2.7],
      [6.95, -5.25, 2.2],
    ].map(([x, zz, top]) => ({ type: "beam", from: [x, -3.4, zz], to: [x, top, zz], radius: 0.13, radiusTo: 0.11, segments: 8, material: "post" })),
    { type: "beam", from: [3.05, 1.5, 5.7], to: [4.1, 0.4, 4.72], radius: 0.03, material: "rope" },
    { type: "beam", from: [2.3, 1.2, -5.7], to: [4.0, 0.4, -7.1], radius: 0.03, material: "rope" },
    { type: "beam", from: [6.6, 2.0, -6.5], to: [5.2, 0.4, -7.1], radius: 0.03, material: "rope" },
  ]
  // The west bank climbs steeply into wooded hills behind the tug, as in the art. Its foot keeps clear of the reeds,
  // the gangway's landing and the trail. Trees, bushes and moss sit on the same height function.
  const trailX = (zz: number) => {
    for (let i = 0; i < trailPts.length - 1; i++) {
      const [ax, az] = trailPts[i]
      const [bx, bz] = trailPts[i + 1]
      if (zz >= az && zz <= bz) return ax + ((bx - ax) * (zz - az)) / (bz - az)
    }
    return zz < trailPts[0][1] ? trailPts[0][0] : trailPts[trailPts.length - 1][0]
  }
  const foot = (zz: number) => (zz < -4 ? -2.4 : zz < 0 ? -2.4 - ((zz + 4) / 4) * 4.1 : zz < 12 ? -6.5 : Math.min(-6.5, trailX(zz) - 3.5))
  const hill = (x: number, zz: number) => {
    const d = foot(zz) - x
    if (d <= 0) return -0.3
    const H = 11 + 3 * Math.sin(zz * 0.09) + 2 * Math.sin(zz * 0.23 + 1)
    return H * (1 - Math.exp(-d / 7)) + 0.6 * Math.sin(x * 0.7 + zz * 0.3) * Math.sin(zz * 0.5) * Math.min(1, d / 3) - 0.3 * Math.exp(-d)
  }
  const HX = [-62, -2.5]
  const HZ = [-100, 40]
  const [NX, NZ] = [60, 140]
  const heights: number[] = []
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) heights.push(r2(hill(HX[0] + ((HX[1] - HX[0]) * i) / NX, HZ[0] + ((HZ[1] - HZ[0]) * j) / NZ)))
  objects.push({ type: "heightfield", id: "west-hill", at: [r2((HX[0] + HX[1]) / 2), 0, r2((HZ[0] + HZ[1]) / 2)], size: [HX[1] - HX[0], HZ[1] - HZ[0]], cells: [NX, NZ], heights, material: "ground" })
  // Clear of the cameras on the bank, the gangway's landing and the trail.
  const keepClear: [number, number, number][] = [[-3.6, 12.8, 3.8], [-4.4, 1.8, 3.2], [-3.9, 2.1, 3], [-7.4, 31, 2.4], [-7.5, 26.8, 2.2], [-1.5, 10, 3.2], [-1.2, 5, 3], ...clearAlong(trailPts, 2.0)]
  // `reach` is how far the object spreads from its centre: a big bush needs more room than a trunk.
  const clearOf = (x: number, zz: number, reach = 0) => keepClear.every(([cx, cz, r]) => Math.hypot(x - cx, zz - cz) > r + reach)
  // Trees climb the hill, most of them near its foot where the camera sees them; understory oaks and big bushes
  // pile foliage up the slope into the wall of green beside the tug in the art.
  const onHill = (x: number, zz: number, sink: number) => r2(Math.max(0, hill(x, zz)) - sink)
  const slope = (near: number, far: number) => {
    const zz = rnd(-98, 38)
    return [foot(zz) - near - (far - near) * rnd() ** 2, zz] as V2
  }
  for (let k = 0; k < 150; k++) {
    const [x, zz] = slope(0.8, 50)
    if (!clearOf(x, zz)) continue
    const near = foot(zz) - x < 14 && zz > -45
    objects.push({
      type: "tree",
      at: [r2(x), onHill(x, zz, 0.5), r2(zz)],
      kind: rnd() < 0.75 ? "oak" : "gnarled",
      height: r2(rnd(11, 19)),
      lean: r2(rnd(2, 14)),
      leanYaw: r2(rnd(-35, 35)),
      moss: near ? 0.95 : 0.35,
    })
  }
  for (let k = 0; k < 60; k++) {
    const [x, zz] = slope(0.5, 14)
    if (zz < -60 || !clearOf(x, zz)) continue
    objects.push({ type: "tree", at: [r2(x), onHill(x, zz, 0.3), r2(zz)], kind: "oak", height: r2(rnd(6, 9)), lean: r2(rnd(8, 24)), leanYaw: r2(rnd(-30, 30)), moss: 1, low: true })
  }
  for (let k = 0; k < 380; k++) {
    const [x, zz] = slope(-0.4, 22)
    const size = rnd(2.0, 4.6)
    if (!clearOf(x, zz, size * 0.7)) continue
    objects.push({ type: "bush", at: [r2(x), onHill(x, zz, 0.3), r2(zz)], size: r2(size) })
  }
  // Ferns and small bushes on the flat strip between the hill and the water.
  for (let k = 0; k < 160; k++) {
    const zz = rnd(-60, 38)
    const x = rnd(foot(zz) + 0.2, -0.6)
    if (x >= -0.6 || !clearOf(x, zz, 1.4)) continue
    objects.push(rnd() < 0.5 ? { type: "bush", at: [r2(x), 0, r2(zz)], size: r2(rnd(1.0, 2.2)) } : { type: "fern", at: [r2(x), 0, r2(zz)], size: r2(rnd(0.9, 1.5)) })
  }
  // Mist in banks down the river and along the hill, and a low sheet over the water.
  for (const [x, zz, w, h, layers, spacing] of [
    [9, -22, 34, 9, 3, 12],
    [10, -62, 54, 13, 3, 16],
    [-13, -12, 24, 11, 3, 10],
    [-16, -48, 30, 13, 2, 14],
  ])
    objects.push({ type: "mist", at: [x, -0.8, zz], width: w, height: h, layers, spacing })
  objects.push({ type: "mist", at: [9, -0.88, -34], width: 30, height: 56, layers: 1, flat: true })
  // Stones and roots along both banks hide the cut where the ground meets the water.
  for (let zz = 40; zz >= -90; zz -= rnd(1.6, 3)) {
    if (zz > -7 && zz < 16) continue
    objects.push({ type: "rock", at: [r2(center(zz) - width(zz) / 2 - rnd(0, 0.3)), r2(zz)], size: r2(rnd(0.45, 1.1)), flat: 0.5, materials: { stone: "bankStone" } })
  }
  for (let zz = 12; zz >= -90; zz -= rnd(1.6, 3))
    objects.push({ type: "rock", at: [r2(center(zz) + width(zz) / 2 + rnd(0, 0.3)), r2(zz)], size: r2(rnd(0.35, 0.85)), flat: 0.5, materials: { stone: "bankStone" } })
  objects.push({ type: "log", at: [17.2, -13], yaw: 70, length: 6, r: 0.32 })
  for (const [id, area] of [
    ["bank-bushes-west", [-3.4, -60, -0.1, 1.5]],
    ["bank-bushes-west-near", [-4, 11.5, -0.1, 40]],
    ["bank-bushes-east", [16.2, -70, 19.5, 30]],
  ] as const)
    objects.push({
      type: "scatter",
      id,
      area,
      count: 240,
      avoid: false,
      // Clear of the cameras that stand on the banks and of the trail.
      clear: [[-3.6, 12.8, 3.8], [-4.4, 1.8, 3], [-7.4, 31, 2.4], ...clearAlong(trailPts, 1.2)],
      items: [
        { weight: 3, item: { type: "bush" }, vary: { size: [1.0, 2.3] } },
        { weight: 2, item: { type: "fern" }, vary: { size: [0.9, 1.5] } },
      ],
    })
  // Trees that lean out over the water toward the river view, and an ivy-hung giant behind the gangway.
  objects.push({ type: "tree", id: "overhang", at: [18.6, 17.5], kind: "oak", height: 14, lean: 30, leanYaw: 215, moss: 1 })
  objects.push({ type: "tree", id: "overhang-2", at: [17.6, 9.5], kind: "oak", height: 16, lean: 34, leanYaw: 195, moss: 1 })
  objects.push({ type: "tree", id: "overhang-3", at: [-2.4, 16], kind: "oak", height: 15, lean: 28, leanYaw: -20, moss: 1 })
  objects.push({ type: "tree", id: "gangway-giant", at: [-3.4, 6.6], kind: "ancient", height: 19, girth: 0.85, moss: 1 })
  objects.push({ type: "log", at: [-2.6, -24], yaw: -60, length: 5, r: 0.3 })
  // Old live oaks, hung with moss, lean out over the water from both banks.
  const oaks: [number, number, number, number, number][] = [
    [-4.2, -6, 16, 12, 0],
    [-6.8, 4, 18, 6, 0],
    [-3.6, 13.5, 14, 16, 20],
    [-9.5, -14, 17, 8, 0],
    [-2.8, -19, 15, 22, 0],
    [-5.5, -30, 18, 14, 10],
    [19.5, -4, 18, 14, 180],
    [21.5, 10, 16, 8, 190],
    [18.8, -21, 17, 22, 180],
    [22, -36, 18, 12, 170],
    [20.5, 22, 15, 12, 200],
  ]
  for (const [x, zz, h, lean, leanYaw] of oaks) objects.push({ type: "tree", at: [x, r2(Math.max(0, hill(x, zz)) - 0.4), zz], kind: "oak", height: h, lean, leanYaw, moss: 0.95 })
  const nearClear = [...clearAlong(trailPts, 2.4), [-1.5, 10, 3.2], [-1.2, 5, 3]] as [number, number, number][]
  const woods = (id: string, area: number[], count: number, extra: [number, number, number][] = [], low = false, moss = 0.5) => ({
    type: "scatter",
    id,
    area,
    count,
    clear: extra,
    items: [
      { weight: 6, item: { type: "tree", kind: "oak", moss, low }, vary: { height: [10, 19], lean: [2, 10] } },
      { weight: 2, item: { type: "tree", kind: "gnarled", moss, low }, vary: { height: [9, 15] } },
      { weight: 1, item: { type: "tree", kind: "pine", low }, vary: { height: [14, 22] } },
    ],
  })
  objects.push(woods("west-woods", [-70, 40, -3, 60], 30, nearClear, false, 0.35))
  objects.push(woods("west-woods-south", [-70, -140, -3, -100], 30, [], false, 0.35))
  objects.push(woods("east-woods", [18, -150, 80, 60], 110, [], false, 0.35))
  objects.push(woods("west-far", [-140, -520, -10, -140], 40, [], true, 0))
  objects.push(woods("east-far", [30, -520, 160, -150], 40, [], true, 0))
  objects.push({
    type: "scatter",
    id: "undergrowth-east",
    area: [18.5, -70, 40, 40],
    count: 200,
    items: [
      { weight: 3, item: { type: "bush" }, vary: { size: [0.8, 1.9] } },
      { weight: 2, item: { type: "fern" }, vary: { size: [0.6, 1.2] } },
    ],
  })
  objects.push({
    type: "grass",
    id: "reeds-pier",
    area: [-2.2, 1.5, 0.3, 8.6],
    count: 700,
    height: [0.8, 1.7],
    blades: [6, 11],
    lean: [0.1, 0.45],
    width: 0.03,
    material: "reeds",
  })
  objects.push({
    type: "grass",
    id: "reeds-west",
    area: [-1.0, -40, 0.3, 40],
    count: 700,
    height: [0.6, 1.5],
    blades: [5, 10],
    lean: [0.1, 0.5],
    width: 0.03,
    material: "reeds",
    clear: [
      [-1.2, 10.2, 1.6],
      [0.2, 7.5, 1.2],
    ],
  })
  objects.push({ type: "grass", id: "reeds-east", area: [16.0, -40, 17.6, 40], count: 650, height: [0.6, 1.5], blades: [5, 10], lean: [0.1, 0.5], width: 0.03, material: "reeds" })
  objects.push({ type: "grass", id: "turf", area: [-7, -4, -0.8, 30], count: 1200, height: [0.12, 0.35], clear: clearAlong(trailPts, 0.8) })
  write(`${SETS}/mordava-river-pier.json`, {
    ...base("mordava-river-pier", "mordava-river-pier", "A quiet pier on the Mordava"),
    seed: 4212,
    // Blue predawn mist that brightens to cyan down the river, and warm lamplight from the tug's saloon pooling on the
    // deck and hull and glinting in the water.
    atmosphere: {
      sun: {
        direction: [0.15, 0.6, -0.8],
        disc: [-0.08, 0.1, -1],
        color: "#a8dcec",
        intensity: 1.5,
        target: [3, 0, -4],
        distance: 200,
        shadow: { left: -40, right: 40, top: 40, bottom: -40, near: 10, far: 420 },
      },
      hemisphere: { sky: "#2f7cb2", ground: "#0b2430", intensity: 0.8 },
      sky: { horizon: "#8ae2f2", mid: "#1f6a98", zenith: "#0a2c4c", gain: 0.95, clouds: 0.06, stars: 0 },
      fog: { density: 0.042, color: "#3a88ac", start: 14 },
      glow: "#c2f4f2",
      fill: { color: "#ffffff", intensity: 3.5, distance: 12 },
      lights: [
        { at: [4.6, 1.1, 0.4], color: "#ffa046", intensity: 42, distance: 12 },
        { at: [4.6, 1.1, 1.6], color: "#ffa046", intensity: 32, distance: 11 },
        { at: [4.6, 4.6, 0.12], color: "#ffb060", intensity: 4, distance: 6 },
        { at: [6.5, -0.5, 0.9], color: "#ff9a40", intensity: 12, distance: 7 },
        { at: [2.75, 1.6, 5.15], color: "#ffbc6a", intensity: 6, distance: 7 },
        { at: [-1.0, 2.6, 5.0], color: "#e2da74", intensity: 12, distance: 12 },
      ],
      environment: 0.32,
      exposure: 1.0,
      grade: "neutral",
      wind: 0.3,
    },
    camera: { near: 0.2, far: 900, min: [-40, 0.3, -90], max: [40, 30, 60], maxDistance: 80 },
    materials: {
      ground: {
        type: "meadow",
        grass: "#24483e",
        grassDark: "#10262a",
        moss: "#2a5844",
        dry: "#3e5040",
        dirt: "#22282a",
        litter: "#2e3a30",
        dirtAmount: 0.3,
        pebbles: 0.25,
        litterAmount: 0.4,
        flowers: 0.02,
        relief: 0.8,
      },
      trail: {
        type: "meadow",
        grass: "#2c4238",
        grassDark: "#1c2a28",
        moss: "#2e4a3a",
        dry: "#3c4840",
        dirt: "#2c2c2a",
        litter: "#38382e",
        dirtAmount: 1.0,
        pebbles: 0.7,
        litterAmount: 0.5,
        flowers: 0,
        relief: 0.8,
      },
      water: { type: "water", color: "#051a2c", reflect: 2.4, ripple: 0.1, flow: [0, -1] },
      bark: painted("bark-moss", "#98a6a2", [0, 40], { size: [1.6, 2.4], relief: 0.14, variance: 0.25 }),
      birch: { type: "wood", a: "#8a9090", b: "#9aa0a0", c: "#6f7676", plank: [0, 40], relief: 0.04, variance: 0.6, seed: 7.7 },
      leaves: { type: "foliage", color: "#2c5a2c" },
      leavesDark: { type: "foliage", color: "#163a20" },
      leavesLight: { type: "foliage", color: "#6a8c34" },
      fern: { type: "foliage", color: "#33642e" },
      moss: { type: "card", map: "/stage/textures/moss-hanging.webp", tint: "#9cb4b0" },
      mist: { type: "mist", color: "#7cc4d8", opacity: 0.3 },
      grass: { type: "grass", base: "#142a26", tip: "#3e6a52" },
      reeds: { type: "grass", base: "#18302a", tip: "#6e9468" },
      stone: { type: "rock", a: "#2e3a3c", b: "#465456", moss: "#1c3a32", mossLight: "#36584a", lichen: "#62767a", mossAmount: 0.6, lichenAmount: 0.3, relief: 0.6 },
      bankStone: { type: "rock", a: "#26302f", b: "#3c4848", moss: "#183428", mossLight: "#2e5040", lichen: "#5a6c6c", mossAmount: 0.7, lichenAmount: 0.2, relief: 0.6 },
      hull: painted("hull-tar", "#8c98a8", [0.24, 6], { size: [0.9, 3], grime: 1.3, nails: 0.3 }),
      strake: painted("boat-paint", "#6c86a0", [0.2, 6], { size: [0.9, 3], grime: 1.4 }),
      rust: painted("boat-paint", "#b04c36", [0, 40], { size: [0.5, 1.5], grime: 1.0 }),
      deck: painted("boards-weathered", "#8a8680", [0.16, 3.2], { nails: 0.7 }),
      cabin: painted("boat-paint", "#b4c6d0", [0.14, 40], { size: [0.8, 2.2], grime: 1.5 }),
      roof: painted("cabin-dark", "#8c8c8c", [0.3, 40]),
      window: { type: "plain", color: "#3a1806", roughness: 1, emissive: "#ff7410", emissiveIntensity: 0.8 },
      helmGlass: { type: "plain", color: "#0a0808", roughness: 0.4, emissive: "#7a3410", emissiveIntensity: 0.14 },
      void: { type: "plain", color: "#0d0a09", roughness: 1 },
      plank: painted("boards-weathered", "#7c7a74", [0, 40], { size: [0.8, 2.4], nails: 0.8, variance: 0.5, grime: 1.3 }),
      post: painted("cabin-dark", "#9c948c", [0, 40], { size: [0.6, 1.6], grime: 1.6 }),
      rope: { type: "plain", color: "#6b5a40", roughness: 1 },
      ...pick(gate, ["crate", "crateDark", "barrel", "iron", "flame", "pole"]),
    },
    objects,
    marks: {
      pier: { at: [0.9, 7.8], label: "the gangway" },
      pierEnd: { at: [2.85, 5.6], label: "the end of the gangway" },
      foredeck: { at: [4.35, 3.6], label: "the tug's foredeck" },
      cabinDoor: { at: [4.6, 2.6], label: "the saloon door" },
      bow: { at: [4.6, 5.3], label: "the bow" },
      stern: { at: [4.6, -6.85], label: "the stern" },
      reeds: { at: [-1.2, 4.6], label: "the reeds by the gangway" },
      bank: { at: [-2.4, 9.4], label: "the riverbank" },
      treeline: { at: [-6, 4], label: "the treeline" },
      trail: { at: [-4.6, 20], label: "the bank trail into the woods" },
      woods: { at: [-12, 38], label: "deep in the woods along the trail" },
    },
    shots: {
      river: { position: [10.8, 0.6, 15.5], target: [3.2, 2.1, -8], fov: 50, label: "The river" },
      pier: { position: [-3.6, 1.9, 12.8], target: [4.2, 1.3, 2.5], fov: 50, label: "The gangway" },
      boat: { position: [10.5, 1.9, 9.5], target: [4.4, 1.5, 0.5], fov: 50, label: "The tug" },
      reeds: { position: [-4.4, 1.0, 1.8], target: [1.4, 0.9, 6.8], fov: 50, label: "The reeds" },
      trail: { position: [-7.4, 1.7, 31], target: [-1.5, 1.4, 12], fov: 52, label: "The trail" },
      bank: { position: [5.2, 1.5, -12], target: [-6, 3.8, -4], fov: 55, label: "The wooded bank" },
    },
    life: { dust: { count: 160, box: [-6, 0.4, -10, 10, 5, 12] } },
  })
  const crew = [on("archer", "bow", "bank"), on("fighter", "stern", "pier")]
  staging(
    "the-shipment",
    "mordava-river-pier",
    [on("lyra", [4.2, 3.45], "aelar"), on("aelar", [4.85, 2.75], "silas"), on("silas", [-1.7, 10.0], "aelar"), on("reinhard", [1.4, 7.25], "lyra"), on("poppen", [-1.2, 4.6], "pierEnd"), ...crew],
    {
      exchange: { subjects: [CAST.lyra.id, CAST.aelar.id, CAST.silas.id, CAST.reinhard.id], offset: [7.5, 2.4, 3.5], target: [0, 1.1, 0], fov: 52, label: "The meeting" },
      lyra: close("lyra"),
      aelar: close("aelar", 3.3, -25),
      poppen: close("poppen", 2.6, 15, 0.9, 0.85),
    },
    "river"
  )
  staging(
    "the-transaction",
    "mordava-river-pier",
    [on("lyra", [4.5, 3.3], "aelar"), on("aelar", [3.75, 4.55], "silas"), on("silas", [2.75, 5.45], "aelar"), on("reinhard", [1.55, 7.1], "silas"), on("poppen", [-1.2, 4.6], "pierEnd"), ...crew],
    { handover: { subjects: [CAST.aelar.id, CAST.silas.id], offset: [3.2, 1.7, 2.6], target: [0, 1.3, 0], fov: 42, label: "The handover" }, silas: close("silas", 2.8, 30), lyra: close("lyra") },
    "handover"
  )
  staging(
    "the-disturbance",
    "mordava-river-pier",
    [
      on("fighter", [-0.4, 6.6], "reeds"),
      on("archer", [0.8, 7.8], "reeds"),
      on("reinhard", [4.25, 3.05], "pier"),
      on("silas", [2.2, 6.2], "reeds"),
      on("aelar", [4.9, 3.75], "reeds"),
      on("lyra", [4.2, 3.9], "pier"),
      on("poppen", [-1.2, 4.6], "fighter"),
    ],
    {
      search: { subjects: [CAST.fighter.id, CAST.archer.id, CAST.poppen.id], offset: [-3.6, 2.1, -4.2], target: [0, 0.9, 0], fov: 50, label: "The search" },
      poppen: close("poppen", 2.4, 20, 0.85, 0.8),
      archer: close("archer", 3, -20),
    },
    "reeds"
  )
  staging(
    "the-escape",
    "mordava-river-pier",
    [on("lyra", [-4.4, 19.6], [-12, 38]), on("poppen", [-3.6, 21.0], [-12, 38])],
    {
      flight: { subjects: [CAST.lyra.id, CAST.poppen.id], offset: [-3.5, 1.9, 6.5], target: [0, 1.1, 0], fov: 50, label: "The flight" },
      lyra: close("lyra", 3, 160),
      poppen: close("poppen", 2.6, 160, 0.9, 0.85),
    },
    "flight"
  )
}

// ── The riverboat's cabin ──
// A low panelled room, 3.4 m by 6 m, fore wall at z = -3 with the helm; the door is aft, open onto a strip of deck and
// the teal water. The crate sits in the middle under hanging ropes and candlelight.
function cabinSet() {
  const objects: Obj[] = [
    {
      type: "extrude",
      id: "water",
      at: [0, -0.49, 0],
      points: ground([
        [-200, 300],
        [200, 300],
        [200, -300],
        [-200, -300],
      ]),
      depth: 0.02,
      plane: "xz",
      material: "water",
    },
    { type: "box", id: "floor", at: [0, -0.1, 0], size: [3.5, 0.1, 6.1], material: "floor" },
    { type: "box", id: "deck", at: [0, -0.1, 4.35], size: [3.7, 0.1, 2.6], material: "deck" },
    { type: "box", id: "hull-port", at: [-1.88, -0.9, 1.3], size: [0.16, 1.15, 8.8], material: "hull" },
    { type: "box", id: "hull-starboard", at: [1.88, -0.9, 1.3], size: [0.16, 1.15, 8.8], material: "hull" },
    { type: "box", id: "hull-stern", at: [0, -0.9, 5.68], size: [3.9, 1.15, 0.16], material: "hull" },
    // Walls, ceiling and beams.
    { type: "box", id: "wall-port", at: [-1.76, 0, 0], size: [0.12, 2.4, 6.1], material: "panel" },
    { type: "box", id: "wall-starboard", at: [1.76, 0, 0], size: [0.12, 2.4, 6.1], material: "panel" },
    { type: "box", id: "wall-fore", at: [0, 0, -3.0], size: [3.6, 2.4, 0.12], material: "panel" },
    { type: "box", id: "wall-aft-port", at: [-0.825, 0, 3.0], size: [1.95, 2.4, 0.12], material: "panel" },
    { type: "box", id: "wall-aft-starboard", at: [1.425, 0, 3.0], size: [0.75, 2.4, 0.12], material: "panel" },
    { type: "box", id: "lintel", at: [0.6, 1.95, 3.0], size: [0.9, 0.45, 0.12], material: "panel" },
    { type: "box", id: "ceiling", at: [0, 2.4, 0], size: [3.6, 0.1, 6.2], material: "roof" },
    { type: "box", id: "roof-outside", at: [0, 2.5, 0], size: [3.9, 0.12, 6.5], material: "roof" },
    // The door, open outward on its hinge, with its porthole and knob.
    { type: "box", id: "door-frame-l", at: [0.12, 0, 3.07], size: [0.08, 2.0, 0.1], material: "trim" },
    { type: "box", id: "door-frame-r", at: [1.08, 0, 3.07], size: [0.08, 2.0, 0.1], material: "trim" },
    { type: "box", id: "door", at: [1.11, 0.02, 3.52], size: [0.07, 1.92, 0.88], material: "door" },
    { type: "torus", id: "porthole", at: [1.15, 1.42, 3.52], yaw: 90, radius: 0.13, tube: 0.032, material: "brass" },
    { type: "cylinder", id: "porthole-glass", at: [1.15, 1.42, 3.52], radius: 0.12, height: 0.03, roll: 90, material: "glass" },
    { type: "sphere", id: "door-knob", at: [1.18, 1.0, 3.88], radius: 0.045, material: "brass" },
    // Railing round the deck outside.
    ...[-1.75, -0.9, 0, 0.9, 1.75].map((x) => ({ type: "beam", from: [x, 0, 5.55], to: [x, 0.9, 5.55], radius: 0.035, material: "trim" })),
    { type: "beam", from: [-1.8, 0.9, 5.55], to: [1.8, 0.9, 5.55], radius: 0.035, material: "trim" },
    { type: "beam", from: [-1.8, 0.9, 3.1], to: [-1.8, 0.9, 5.55], radius: 0.035, material: "trim" },
    { type: "beam", from: [1.8, 0.9, 3.1], to: [1.8, 0.9, 5.55], radius: 0.035, material: "trim" },
    { type: "lantern", at: [-1.5, 0, 5.3], height: 1.25, post: true },
    // The helm, gauges and lamps on the fore wall.
    { type: "box", id: "helm-post", at: [0.4, 0, -2.78], size: [0.18, 1.0, 0.22], material: "trim" },
    { type: "torus", id: "helm-wheel", at: [0.4, 1.25, -2.6], radius: 0.42, tube: 0.035, material: "wheel" },
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
      const a = (i * Math.PI) / 4
      return { type: "beam", at: [0.4, 1.25, -2.6], from: [0, 0, 0], to: [r2(Math.cos(a) * 0.56), r2(Math.sin(a) * 0.56), 0], radius: 0.025, radiusTo: 0.018, material: "wheel" }
    }),
    { type: "cylinder", id: "helm-hub", at: [0.4, 1.25, -2.66], radius: 0.07, height: 0.14, pitch: 90, material: "brass" },
    { type: "box", id: "console", at: [-0.75, 0, -2.72], size: [1.6, 0.92, 0.5], material: "trim" },
    { type: "box", id: "chart", at: [-0.7, 0.93, -2.7], size: [0.6, 0.02, 0.4], material: "parchment" },
    ...[
      [-0.35, 1.62],
      [-0.8, 1.62],
      [1.25, 1.72],
    ].flatMap(([x, y]) => [
      { type: "cylinder", at: [x, y, -2.92], radius: 0.11, height: 0.05, pitch: 90, material: "brass" },
      { type: "cylinder", at: [x, y, -2.89], radius: 0.085, height: 0.01, pitch: 90, material: "gauge" },
    ]),
    { type: "lantern", at: [-0.6, 1.72, -1.7] },
    { type: "beam", from: [-0.6, 2.38, -1.7], to: [-0.6, 2.0, -1.7], radius: 0.012, material: "iron" },
    { type: "lantern", at: [-0.8, 1.72, 1.55] },
    { type: "beam", from: [-0.8, 2.38, 1.55], to: [-0.8, 2.0, 1.55], radius: 0.012, material: "iron" },
    // The crate: iron-banded, chained, too heavy to move.
    { type: "strongbox", id: "crate", at: [0, 0, -0.55], yaw: 6, width: 1.35, height: 0.97, depth: 0.92, materials: { iron: "crateIron" } },
    // Posts and hanging rope.
    { type: "box", id: "post-port", at: [-1.2, 0, -0.45], size: [0.22, 2.36, 0.22], material: "post", solid: true },
    { type: "box", id: "post-starboard", at: [1.25, 0, 0.55], size: [0.22, 2.36, 0.22], material: "post", solid: true },
    { type: "beam", from: [-1.05, 2.36, -0.35], to: [-0.98, 0.25, -0.1], radius: 0.022, material: "rope" },
    { type: "torus", at: [1.15, 0.05, -1.7], radius: 0.28, tube: 0.05, pitch: 90, material: "rope" },
    // Stores along the walls, and candles.
    { type: "barrel", at: [-1.3, 0, 2.35], r: 0.32, h: 0.85 },
    { type: "barrel", at: [-0.65, 0, 2.55], r: 0.3, h: 0.8 },
    { type: "sack", at: [-1.35, 0, 1.55], size: 0.55 },
    { type: "crate", at: [1.32, 0, -2.25], size: 0.6 },
    { type: "box", id: "bench", at: [1.47, 0, 1.6], size: [0.45, 0.45, 1.6], material: "trim", solid: true },
    ...[
      [-1.2, 0.93, -2.6],
      [-1.32, 0.86, 2.35],
      [1.32, 0.62, -2.2],
      [1.45, 0.47, 1.2],
    ].flatMap(([x, y, zz]) => [
      { type: "cylinder", at: [x, y, zz], radius: 0.03, height: 0.16, material: "candle" },
      { type: "sphere", at: [x, y + 0.17, zz], radius: [0.018, 0.03, 0.018], material: "flame" },
    ]),
    // Ceiling beams and the side windows' glow.
    ...[-2.4, -1.5, -0.6, 0.3, 1.2, 2.1].map((zz) => ({ type: "box", at: [0, 2.22, zz], size: [3.5, 0.16, 0.16], material: "post" })),
    ...[-1, 1].flatMap((s) =>
      [-1.6, 0.4].flatMap((zz) => [
        { type: "box", at: [s * 1.695, 1.18, zz], size: [0.03, 0.46, 0.6], material: "glass" },
        { type: "box", at: [s * 1.69, 1.13, zz], size: [0.05, 0.56, 0.72], material: "trim" },
      ])
    ),
    // A far bank glimpsed through the door.
    { type: "box", id: "far-bank-ground", at: [0, -0.49, 52], size: [160, 0.5, 44], material: "bank" },
    {
      type: "scatter",
      id: "far-bank",
      area: [-60, 30, 60, 70],
      count: 120,
      items: [{ weight: 1, item: { type: "tree", kind: "oak", low: true, moss: 0.5 }, vary: { height: [10, 18] } }],
    },
  ]
  write(`${SETS}/riverboat-cabin.json`, {
    ...base("riverboat-cabin", "riverboat-cabin", "The riverboat's cabin"),
    seed: 5150,
    atmosphere: {
      sun: { direction: [0.18, 0.38, 1], color: "#5fb6c6", intensity: 2.4, target: [0, 0, 1], distance: 30, shadow: { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 70 } },
      hemisphere: { sky: "#3e4c52", ground: "#1a140e", intensity: 0.65 },
      sky: { horizon: "#4f8f98", mid: "#2a5e6a", zenith: "#102a34", gain: 0.7, clouds: 0.2, stars: 0.05 },
      fog: { density: 0.03, color: "#3e7a86" },
      glow: "#9fd0d0",
      fill: { color: "#ffdcb8", intensity: 2.5, distance: 8 },
      // The hanging lanterns and the candles light the cabin, as in the crate's art.
      lights: [
        { at: [-0.6, 1.55, -1.7], color: "#ffb060", intensity: 4.5, distance: 5 },
        { at: [-0.8, 1.55, 1.55], color: "#ffb060", intensity: 4, distance: 5 },
        { at: [-1.1, 1.15, -2.5], color: "#ffa850", intensity: 2, distance: 2.5 },
        { at: [1.35, 0.85, -2.2], color: "#ffa850", intensity: 1.6, distance: 2.5 },
        // Cold river light through the open door, as in The Fake.
        { at: [0.6, 1.5, 2.6], color: "#4fb4c4", intensity: 6, distance: 4 },
      ],
      environment: 0.25,
      exposure: 1.2,
      grade: "neutral",
      wind: 0.2,
    },
    camera: { near: 0.08, far: 400, min: [-1.6, 0.35, -2.9], max: [1.6, 2.25, 5.4], maxDistance: 8 },
    materials: {
      floor: painted("boards-weathered", "#9a9088", [0.2, 2.8], { nails: 0.8, grime: 1.3, variance: 0.3 }),
      panel: painted("cabin-dark", "#d6ccc2", [0.18, 40], { size: [0.6, 1.6], grime: 1.1 }),
      roof: painted("cabin-dark", "#a49a90", [0.24, 40], { grime: 1.3 }),
      post: painted("cabin-dark", "#bcb0a4", [0, 40], { size: [0.4, 1.2], grime: 1.4 }),
      trim: painted("cabin-dark", "#c8b8a8", [0, 40], { grime: 0.6 }),
      door: painted("cabin-dark", "#e6c8a8", [0.14, 12], { nails: 0.6 }),
      wheel: { type: "wood", a: "#5a3a24", b: "#6e4a2e", c: "#4a3020", plank: [0, 40], relief: 0.02, seed: 3.7 },
      deck: painted("boards-weathered", "#a8a098", [0.16, 3.2], { nails: 0.7, grime: 0.8 }),
      hull: { type: "wood", a: "#2a2420", b: "#342c26", c: "#211d1a", plank: [0.22, 6], relief: 0.05, variance: 0.4, seed: 2.2, grime: 1.4 },
      brass: { type: "metal", color: "#a8823e", roughness: 0.35, metalness: 0.85 },
      gauge: { type: "plain", color: "#d8cfb4", roughness: 0.8 },
      glass: { type: "plain", color: "#20383c", roughness: 0.3, emissive: "#4a96a2", emissiveIntensity: 0.9 },
      candle: { type: "plain", color: "#e6dcc0", roughness: 0.9 },
      rope: { type: "plain", color: "#7a6448", roughness: 1 },
      parchment: { type: "plain", color: "#cbb78e", roughness: 1 },
      water: { type: "water", color: "#0a2329", reflect: 3.2, ripple: 0.35, flow: [1, 0] },
      bank: { type: "plain", color: "#1c3027", roughness: 1 },
      bark: painted("bark-moss", "#c0c8c0", [0, 40], { size: [1.2, 1.8], relief: 0.12, variance: 0.2 }),
      leaves: { type: "foliage", color: "#26473c" },
      leavesDark: { type: "foliage", color: "#163028" },
      leavesLight: { type: "foliage", color: "#3a5e4c" },
      moss: { type: "foliage", color: "#7c8f86" },
      ...pick(gate, ["crate", "crateDark", "barrel", "iron", "pole", "sack", "sackB"]),
      flame: { type: "plain", color: "#000000", roughness: 1, emissive: "#ffb262", emissiveIntensity: 1.8 },
      crateIron: { type: "metal", color: "#2e2824", roughness: 0.75, metalness: 0.5 },
      crate: painted("crate-oak", "#a8a090", [0.2, 1.2], { size: [1.2, 2.4], nails: 1, grime: 1.2, relief: 0.1, variance: 0.35 }),
    },
    objects,
    marks: {
      crate: { at: [0, -0.55], label: "the crate" },
      door: { at: [0.6, 2.8], label: "the cabin door" },
      helm: { at: [0.4, -2.3], label: "the helm" },
      window: { at: [-1.4, 0.4], label: "the side window" },
      stores: { at: [-1.0, 1.9], label: "the barrels and stores" },
      deck: { at: [0.2, 4.4], label: "the deck outside the cabin" },
    },
    shots: {
      cabin: { position: [-1.25, 1.65, -2.55], target: [0.55, 1.05, 3], fov: 60, label: "The cabin" },
      crate: { position: [0.55, 2.1, 1.95], target: [0, 0.45, -0.6], fov: 55, label: "The crate" },
      chest: { position: [-0.45, 1.2, 1.15], target: [0.05, 0.42, -0.55], fov: 50, label: "The crate up close" },
      door: { position: [-0.15, 1.55, 0.05], target: [0.65, 1.3, 3], fov: 55, label: "The door" },
      helm: { position: [0.2, 1.45, 1.3], target: [0.2, 1.35, -3], fov: 58, label: "The helm" },
    },
    life: { dust: { count: 90, box: [-1.6, 0.4, -2.8, 1.6, 2.2, 2.8] } },
  })
  const poppenOutside = on("poppen", [-0.9, 4.45], [0.6, 2.8])
  staging(
    "the-fake",
    "riverboat-cabin",
    [on("silas", [0.6, 2.55], "aelar"), on("reinhard", [-0.85, -1.55], "aelar"), on("aelar", [0.75, -1.65], "silas"), on("lyra", [-1.05, 0.15], "aelar"), poppenOutside],
    {
      standoff: { subjects: [CAST.silas.id, CAST.aelar.id, CAST.reinhard.id], offset: [-1.3, 0.3, 0.6], target: [0, 1.2, 0], relative: "world", fov: 62, label: "The standoff" },
      silas: close("silas", 2.1, 25, 1.55, undefined),
      aelar: close("aelar", 2.0, -20),
    },
    "door"
  )
  staging(
    "battle-on-the-boat",
    "riverboat-cabin",
    [on("reinhard", [0.25, -1.75], "lyra"), on("lyra", [0.55, 1.05], "reinhard"), on("silas", [0.6, 2.55], "lyra"), poppenOutside],
    { reinhard: close("reinhard", 2.0, 8, 1.35, 1.55), lyra: close("lyra", 2.0, 30), silas: close("silas", 2.1, 25) },
    "helm"
  )
  staging(
    "the-crate",
    "riverboat-cabin",
    [on("lyra", [-1.05, 0.05], "crate"), on("poppen", [0.95, 0.15], "crate")],
    { pair: { subjects: [CAST.lyra.id, CAST.poppen.id], offset: [0.2, 0.9, 2.1], target: [0, 0.6, -0.6], fov: 58, label: "The pair" } },
    "chest"
  )
}

// ── The Kordavos riverfront ──
// Kordavos on a bright afternoon, from the right-bank quay: the river runs along -z with ships at their moorings,
// timber-framed houses and round towers line both banks, and the castle stands on its hill beyond.
function riverfrontSet() {
  const center = (zz: number) => -21 + 9 * Math.sin(-zz / 160)
  const width = (zz: number) => 26 + Math.max(0, -zz - 60) * 0.04
  const zs: number[] = []
  for (let zz = 60; zz >= -700; zz -= 12) zs.push(zz)
  const left = zs.map((zz) => [center(zz) - width(zz) / 2, zz] as V2)
  const right = zs.map((zz) => [center(zz) + width(zz) / 2, zz] as V2)
  const objects: Obj[] = [
    { type: "extrude", id: "right-bank", at: [0, -1.6, 0], points: ground([...right, [800, -700], [800, 60]]), depth: 1.6, plane: "xz", material: "paving" },
    { type: "extrude", id: "left-bank", at: [0, -1.6, 0], points: ground([[-800, 60], [-800, -700], ...left.slice().reverse()]), depth: 1.6, plane: "xz", material: "meadow" },
    {
      type: "extrude",
      id: "river",
      at: [0, -1.58, 0],
      points: ground([
        ...left.map(([x, zz]) => [x - 1, zz] as V2),
        ...right
          .slice()
          .reverse()
          .map(([x, zz]) => [x + 1, zz] as V2),
      ]),
      depth: 0.02,
      plane: "xz",
      material: "water",
    },
  ]
  // Bollards and lamps along the quay edge.
  for (let zz = 30; zz >= -160; zz -= 7) {
    const x = center(zz) + width(zz) / 2 + 0.6
    objects.push({ type: "cylinder", at: [r2(x), r2(zz)], radius: 0.18, height: 0.7, material: "iron" })
    if (Math.round(zz) % 21 === 2) objects.push({ type: "lantern", at: [r2(x + 0.8), r2(zz - 3)], height: 3, post: true })
  }
  objects.push(
    { type: "barrel", at: [-5, 3], r: 0.4, h: 1 },
    { type: "barrel", at: [-5.6, 2.2], r: 0.4, h: 1 },
    { type: "crate", at: [-4.6, -4], size: 0.9, stack: true },
    { type: "barrel", at: [-4.4, -5.2], r: 0.38, h: 0.95 }
  )
  // Ships at their moorings and one under sail.
  objects.push(
    { type: "ship", id: "cog-near", at: [r2(center(-14) + width(-14) / 2 - 4.5), -1.58, -14], yaw: 180, length: 20, beam: 6, masts: 2, height: 17, sails: "furled" },
    { type: "ship", id: "sloop", at: [r2(center(-46) + width(-46) / 2 - 4), -1.58, -46], yaw: 176, length: 14, beam: 4.8, masts: 1, height: 13, sails: "furled" },
    { type: "ship", id: "carrack", at: [r2(center(-95)), -1.58, -95], yaw: 188, length: 24, beam: 7, masts: 3, height: 20, sails: "set" },
    { type: "ship", id: "cog-far", at: [r2(center(-30) - width(-30) / 2 + 4.5), -1.58, -30], yaw: 4, length: 16, beam: 5, masts: 2, height: 14, sails: "furled" },
    { type: "ship", id: "barge", at: [r2(center(-150) + width(-150) / 2 - 5), -1.58, -150], yaw: 182, length: 18, beam: 6, masts: 1, height: 12, sails: "set" }
  )
  // Houses: a row facing the river on each bank, a second row behind, and towers with conical roofs among them.
  const houses = (id: string, from: V2, to: V2, yaw: number, h: [number, number]) => ({
    type: "row",
    id,
    from,
    to,
    step: [8.5, 11],
    itemYaw: yaw,
    yawJitter: 3,
    item: { type: "house", materials: { roof: "roofRed" } },
    vary: { h: h, w: [7, 10], d: [8, 10] },
  })
  objects.push(houses("right-front", [6.5, -6], [10, -230], -90, [9, 15]))
  objects.push(houses("right-back", [19, 4], [24, -240], -90, [11, 18]))
  objects.push(houses("left-front", [-46, -16], [-40, -230], 90, [9, 14]))
  for (const [x, zz, r, h, roof] of [
    [9, -42, 4.5, 22, 9],
    [11, -96, 5, 26, 11],
    [8, -150, 4, 20, 8],
    [-42, -8, 4, 18, 8],
    [-38, -120, 4.5, 21, 9],
  ])
    objects.push({ type: "roundTower", at: [x, zz], r, height: h, sides: 16, roofHeight: roof, materials: { roof: "roofRed" } })
  // The castle on its hill.
  objects.push({ type: "mountain", id: "castle-hill", at: [34, -235], radius: 110, height: 40, ridges: 0.25, stretch: 1.3, material: "hill" })
  objects.push({ type: "squareTower", at: [34, 33, -240], width: 20, height: 62 })
  for (const [x, zz, r, h] of [
    [16, -226, 9, 46],
    [52, -222, 8, 40],
    [26, -258, 7, 54],
    [46, -256, 7.5, 44],
  ])
    objects.push({ type: "roundTower", at: [x, 31, zz], r, height: h, sides: 20, roofHeight: r * 2.4, materials: { roof: "roofRed" } })
  objects.push({ type: "curtainWall", at: [34, 31, -214], length: 34, height: 16 })
  objects.push({ type: "squareTower", at: [13, -72], width: 7, height: 24, materials: { roof: "roofRed" } })
  objects.push({ type: "squareTower", at: [15, -128], width: 8, height: 28, materials: { roof: "roofRed" } })
  objects.push({ type: "skyline", id: "far-towers", kind: "towers", area: [-20, -520, 140, -230], count: 18, height: [24, 52], radius: [3, 6], materials: { roof: "roofRedFar" } })
  objects.push({
    type: "skyline",
    id: "far-roofs",
    kind: "blocks",
    area: [-30, -260, 130, -60],
    count: 50,
    height: [8, 18],
    radius: [6, 14],
    exclude: [[-40, -260, 0, 40]],
    materials: { roof: "roofRedFar" },
  })
  objects.push({ type: "skyline", id: "left-roofs", kind: "blocks", area: [-160, -300, -60, -20], count: 40, height: [7, 15], radius: [6, 12], materials: { roof: "roofRedFar" } })
  objects.push({ type: "tree", at: [2.5, 7], kind: "oak", height: 9 }, { type: "tree", at: [3.2, -2.5], kind: "oak", height: 8 }, { type: "tree", at: [-52, 12], kind: "oak", height: 11 })
  write(`${SETS}/kordavos-riverfront.json`, {
    ...base("kordavos-riverfront", "kordavos-riverfront", "The Kordavos riverfront"),
    seed: 9031,
    atmosphere: {
      sun: { direction: [-0.45, 0.72, 0.52], color: "#fff0d4", intensity: 3.2, target: [-8, 0, -40], distance: 300, shadow: { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 700 } },
      hemisphere: { sky: "#a0c6e6", ground: "#4f5a3c", intensity: 0.9 },
      sky: { horizon: "#d4e6ee", mid: "#86b6dc", zenith: "#3f7fc2", gain: 1.0, clouds: 1.0 },
      fog: { density: 0.0022, color: "#cddde4" },
      environment: 0.35,
      exposure: 1.05,
      grade: "warm",
      wind: 0.9,
    },
    camera: { near: 0.3, far: 2400, min: [-70, 0.5, -220], max: [40, 40, 60], maxDistance: 220 },
    materials: {
      ...gate.materials,
      paving: gate.materials.ground,
      meadow: {
        type: "meadow",
        grass: "#5f7a3a",
        grassDark: "#3e5428",
        moss: "#5a7a34",
        dry: "#8a8a50",
        dirt: "#6a5a40",
        litter: "#7a6040",
        dirtAmount: 0.3,
        pebbles: 0.3,
        litterAmount: 0.2,
        flowers: 0.3,
        relief: 0.5,
      },
      water: { type: "water", color: "#1d5560", reflect: 4, ripple: 0.6, flow: [0, -1] },
      hill: { type: "plain", color: "#5f7a46", roughness: 1 },
      roofRed: { type: "masonry", a: "#9a4a30", b: "#b45e3a", c: "#7c3e2c", mortar: "#3a2018", block: [0.55, 0.34], joint: 0.035, relief: 0.07, grime: 0.6 },
      roofRedFar: { type: "masonry", a: "#a65a3c", b: "#b86a46", c: "#8a4e3a", block: [0.6, 0.4], relief: 0.02, grime: 0.3 },
      hull: { type: "wood", a: "#3a2c22", b: "#4a382a", c: "#30261e", plank: [0.26, 8], relief: 0.05, variance: 0.4, seed: 2.4, grime: 1.1 },
      deck: { type: "wood", a: "#7a644a", b: "#8a7254", c: "#6a5640", plank: [0.18, 4], relief: 0.04, seed: 5.1 },
      trim: { type: "wood", a: "#5a4030", b: "#6e4f37", c: "#4a4038", plank: [0, 40], relief: 0.03, seed: 6.2 },
      mast: { type: "wood", a: "#6a5038", b: "#7a5e42", c: "#5a4430", plank: [0, 60], relief: 0.02, seed: 7.8 },
      sail: { type: "cloth", color: "#e8dcc2", amp: 0.3, freq: 0.8 },
      rope: { type: "plain", color: "#4a3a2a", roughness: 1 },
      window: { type: "plain", color: "#1a1410", roughness: 1 },
      bark: { type: "wood", a: "#3a3228", b: "#4a3e32", c: "#2e2820", plank: [0, 40], relief: 0.07, variance: 0.5, seed: 4.2, grime: 0.8 },
      leaves: { type: "foliage", color: "#4a6a32" },
      leavesDark: { type: "foliage", color: "#33502a" },
      leavesLight: { type: "foliage", color: "#6a8a40" },
      trimWood: { type: "wood", a: "#5a4030", b: "#6e4f37", c: "#4a4038", plank: [0, 40], relief: 0.03, seed: 6.2 },
    },
    objects,
    marks: {
      quay: { at: [-3, 0], label: "the quay" },
      quayEdge: { at: [r2(center(-6) + width(-6) / 2 + 1), -6], label: "the edge of the quay" },
      ships: { at: [-6, -16], label: "the moored ships" },
      road: { at: [0.5, -20], label: "the road into the city" },
      tower: { at: [6, -38], label: "the riverside tower" },
    },
    shots: {
      city: { position: [-2, 9, 24], target: [-6, 16, -200], fov: 52, label: "The city" },
      quay: { position: [-1.5, 1.7, 16], target: [-5, 1.8, -20], fov: 52, label: "The quay" },
      ships: { position: [-6.5, 2.4, 8], target: [-14, 5, -30], fov: 55, label: "The ships" },
    },
    life: { birds: { count: 14, center: [-18, -60], spread: [40, 60], radius: [8, 24], height: [14, 30] } },
  })
  staging(
    "return-to-the-city",
    "kordavos-riverfront",
    [on("lyra", [-3.6, 8.5], [-8, -60]), on("poppen", [-2.7, 9.6], [-8, -60])],
    {
      pair: { subjects: [CAST.lyra.id, CAST.poppen.id], offset: [-1.8, 1.6, 4.5], target: [0, 1.2, 0], fov: 50, label: "Lyra and Poppen" },
      lyra: close("lyra"),
      poppen: close("poppen", 2.6, 20, 0.9, 0.85),
    },
    "city"
  )
}

// ── The old forest path ──
// A mossy path through huge gnarled trees, roots across the ground, green-gold light and haze.
function forestSet() {
  const path: V2[] = [
    [0.2, 22],
    [0.4, 12],
    [-0.3, 3],
    [0.5, -7],
    [1.4, -17],
    [0.6, -29],
    [-0.8, -44],
    [-2, -60],
  ]
  const giants: [number, number, number, number][] = [
    [-3.5, 3, 24, 1.6],
    [3.8, -2, 26, 1.8],
    [-3.9, -12, 22, 1.5],
    [4.6, -16, 25, 1.7],
    [-3.1, -25, 22, 1.4],
    [3.4, -31, 23, 1.5],
    [-4.6, 12, 20, 1.4],
    [4.2, 9, 22, 1.6],
    [-3.0, -40, 21, 1.4],
    [3.6, -46, 22, 1.5],
  ]
  const objects: Obj[] = [
    { type: "groundDisc", id: "ground", radius: 260 },
    { type: "trail", id: "path", points: path, width: 1.7 },
    ...giants.map(([x, zz, h, girth]) => ({ type: "tree", at: [x, zz], kind: "ancient", height: h, girth: girth * 0.85, lean: 3 })),
    { type: "lightShaft", at: [1.4, -6], height: 24, top: 1.2, bottom: 3.2, tilt: 10, material: "sunbeam" },
    { type: "lightShaft", at: [-1.0, -21], height: 24, top: 1, bottom: 2.6, tilt: -8, material: "sunbeam" },
    { type: "lightShaft", at: [2.2, 7], height: 22, top: 0.9, bottom: 2.4, tilt: 6, material: "sunbeam" },
    { type: "rock", at: [-2.2, -6], size: 0.9, flat: 0.5 },
    { type: "rock", at: [2.6, -24], size: 1.2, flat: 0.5 },
    { type: "log", at: [-7, -18], yaw: 30, length: 7, r: 0.5 },
    { type: "log", at: [8, -6], yaw: -50, length: 6, r: 0.45 },
    {
      type: "scatter",
      id: "canopy",
      area: [-60, -110, 60, 40],
      count: 170,
      clear: clearAlong(path, 3.6),
      items: [
        { weight: 2, item: { type: "tree", kind: "ancient" }, vary: { height: [16, 24], girth: [0.7, 1.1] } },
        { weight: 3, item: { type: "tree", kind: "oak" }, vary: { height: [18, 28] } },
      ],
    },
    {
      type: "scatter",
      id: "far-canopy",
      area: [-140, -240, 140, 90],
      count: 260,
      clear: [[0, -30, 62]],
      items: [{ weight: 1, item: { type: "tree", kind: "oak", low: true }, vary: { height: [18, 28] } }],
    },
    {
      type: "scatter",
      id: "ferns",
      area: [-14, -60, 14, 24],
      count: 300,
      avoid: false,
      clear: clearAlong(path, 1.1),
      items: [
        { weight: 3, item: { type: "fern" }, vary: { size: [0.6, 1.3] } },
        { weight: 1, item: { type: "bush" }, vary: { size: [0.7, 1.4] } },
      ],
    },
    { type: "grass", id: "moss-tufts", area: [-9, -55, 9, 22], count: 3600, height: [0.06, 0.2], blades: [8, 16], spread: 0.12, clear: clearAlong(path, 0.6) },
  ]
  write(`${SETS}/old-forest-path.json`, {
    ...base("old-forest-path", "old-forest-path", "The old forest path"),
    seed: 6620,
    atmosphere: {
      sun: { direction: [0.25, 0.85, -0.45], color: "#fff0c4", intensity: 2.8, target: [0, 0, -10], distance: 200, shadow: { left: -50, right: 50, top: 50, bottom: -50, near: 10, far: 420 } },
      hemisphere: { sky: "#c4d898", ground: "#36421f", intensity: 1.15 },
      sky: { horizon: "#c4d49c", mid: "#8cae6c", zenith: "#56804e", gain: 0.9, clouds: 0.35 },
      fog: { density: 0.024, color: "#8aa06a" },
      glow: "#e8f0b0",
      environment: 0.3,
      exposure: 1.1,
      grade: "warm",
      wind: 0.5,
    },
    camera: { near: 0.2, far: 900, min: [-40, 0.4, -80], max: [40, 30, 40], maxDistance: 70 },
    materials: {
      ground: {
        type: "meadow",
        grass: "#4c6a2c",
        grassDark: "#2c4220",
        moss: "#5c7e2c",
        dry: "#6e6a3a",
        dirt: "#4a3e28",
        litter: "#5e4a2a",
        dirtAmount: 0.4,
        pebbles: 0.3,
        litterAmount: 0.6,
        flowers: 0.05,
        relief: 0.9,
      },
      trail: {
        type: "meadow",
        grass: "#56703a",
        grassDark: "#3a4c26",
        moss: "#6a8a3a",
        dry: "#7a7448",
        dirt: "#5a4a30",
        litter: "#6a5434",
        dirtAmount: 0.75,
        pebbles: 0.5,
        litterAmount: 0.5,
        flowers: 0,
        relief: 0.8,
      },
      bark: { type: "wood", a: "#56623a", b: "#6a7646", c: "#424a30", plank: [0, 40], relief: 0.09, variance: 0.8, seed: 4.9, grime: 0.5 },
      leaves: { type: "foliage", color: "#4f6a2e" },
      leavesDark: { type: "foliage", color: "#2f4220" },
      leavesLight: { type: "foliage", color: "#7a8f3a" },
      fern: { type: "foliage", color: "#4c6e32" },
      grass: { type: "grass", base: "#2a3c1c", tip: "#7a9a40" },
      stone: { type: "rock", a: "#4a5040", b: "#62684e", moss: "#3c5a22", mossLight: "#6a8a34", lichen: "#8a9474", mossAmount: 0.8, lichenAmount: 0.3, relief: 0.6 },
      sunbeam: { type: "glow", color: "#eaf0b0", opacity: 0.1 },
    },
    objects,
    marks: {
      pathAhead: { at: [0.6, -16], label: "the path ahead" },
      roots: { at: [-2.6, -4], label: "the great roots" },
      pathBack: { at: [0.3, 16], label: "the path back" },
      hollow: { at: [-6, 4], label: "a mossy hollow off the path" },
    },
    shots: {
      path: { position: [0.6, 1.4, 14], target: [0.6, 2.6, -25], fov: 55, label: "The path" },
      giants: { position: [2.6, 1.1, 1.5], target: [-3.4, 5.5, 2.4], fov: 60, label: "The old trees" },
      onward: { position: [-0.5, 1.7, -24], target: [0.4, 1.4, 2], fov: 52, label: "Looking back" },
    },
    life: { dust: { count: 220, box: [-5, 0.4, -30, 5, 6, 10] } },
  })
  staging(
    "the-end",
    "old-forest-path",
    [on("lyra", [-0.25, 4.6], [0.6, -16]), on("poppen", [0.8, 5.4], [0.6, -16])],
    {
      pair: { subjects: [CAST.lyra.id, CAST.poppen.id], offset: [-1.6, 1.4, -4.6], target: [0, 1.1, 0], fov: 50, label: "Lyra and Poppen" },
      lyra: close("lyra"),
      poppen: close("poppen", 2.6, 20, 0.9, 0.85),
    },
    "path"
  )
}

mkdirSync(STAGINGS, { recursive: true })
pierSet()
cabinSet()
riverfrontSet()
forestSet()
console.log("Wrote 4 sets and 9 stagings for Covert Cargo.")
