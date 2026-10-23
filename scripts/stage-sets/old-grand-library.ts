// Writes March of Davos's Old Grand Library (wiki/plans/old-grand-library-stage.md): the great reading hall under its
// painted vault and dome, with the private archives behind the red door, and the staging of the library's encounter.
//
//   pnpm exec tsx scripts/stage-sets/old-grand-library.ts && pnpm stage:check
//
// The JSON it writes is what the app loads. Edit this file and rerun rather than editing the JSON by hand.

import { readFileSync, writeFileSync } from "node:fs"

type V2 = [number, number]
type V3 = [number, number, number]
type Obj = Record<string, unknown>
const SETS = "packages/stage/src/sets/realm-of-myr"
const STAGINGS = "packages/stage/src/stagings/march-of-davos"
const ART = "/stage/fixtures/march-of-davos"
const square = JSON.parse(readFileSync(`${SETS}/kordavos-harvest-square.json`, "utf8"))
const festival = JSON.parse(readFileSync(`${STAGINGS}/the-harvest-festival.json`, "utf8"))
const pick = (names: string[]) => Object.fromEntries(names.map((n) => [n, square.materials[n]]))
const r2 = (n: number) => Math.round(n * 100) / 100
function write(path: string, data: unknown) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
}
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
const image = (map: string, extra: Obj = {}) => ({ type: "image", map: `/stage/textures/${map}.jpg`, ...extra })

// ── The hall ──
// The reading hall runs north from the entrance (z = 10) to the archives' red door (z = -12), x from -7 to 7. Bookcases
// line both long walls, a gallery runs round at 4.2 m with more bookcases and tall stained-glass windows, a painted
// barrel vault springs at 7.5 m, and a dome stands over the crossing in the middle.
const W = 7
const N = -12
const S = 10
const T = 0.4
const LEVEL = 4.2
const SPRING = 7.5
const CROWN = SPRING + W
const CROSS = [-3.6, 3.6]
// The outer walls rise to the roof, so no daylight comes in but by the windows.
const TOP = CROWN + 3.8
const DOME_R = 3.4
// Midday sun from the south, through the great window over the entrance and down onto the crossing's floor.
const SUN: V3 = [0.09, 0.5, 0.86]
// The upper west and east walls: bays of bookcases between tall windows.
const WINDOWS = [-9.0, -5.4, 5.4, 8.4]
const WIN = { w: 1.5, sill: LEVEL + 0.5, h: 2.6 }
// The private archives behind the red door, a step down the stair in the legacy notes, here level with the hall.
const ARCH = { x0: -3.2, x1: 3.2, z0: -18.4, z1: N - T / 2, h: 3.6 }

function shell(): Obj[] {
  const o: Obj[] = [
    // The ground outside and the hall's floor of worn flagstones.
    { type: "box", at: [0, -0.14, 0], size: [120, 0.1, 120], material: "ground" },
    { type: "box", at: [0, -0.1, (N + S) / 2], size: [2 * W + 0.8, 0.1, S - N + 0.8], material: "floor" },
    { type: "box", at: [0, -0.1, (ARCH.z0 + ARCH.z1) / 2], size: [ARCH.x1 - ARCH.x0 + 0.8, 0.1, ARCH.z1 - ARCH.z0 + 0.8], material: "floor" },
  ]
  // Long walls, solid to the vault's crown, cut by the upper windows; the stone shows above the bookcases.
  for (const s of [-1, 1]) {
    const x = s * (W + T / 2)
    const cuts = [N - T, ...WINDOWS.flatMap((zz) => [zz - WIN.w / 2, zz + WIN.w / 2]), S + T]
    for (let i = 0; i < cuts.length - 1; i++) {
      const z0 = cuts[i]
      const z1 = cuts[i + 1]
      if (i % 2 === 0) o.push({ type: "box", at: [x, 0, r2((z0 + z1) / 2)], size: [T, TOP, r2(z1 - z0)], material: "stone", solid: true })
      else {
        o.push({ type: "box", at: [x, 0, r2((z0 + z1) / 2)], size: [T, WIN.sill, r2(z1 - z0)], material: "stone", solid: true })
        o.push({ type: "box", at: [x, WIN.sill + WIN.h, r2((z0 + z1) / 2)], size: [T, r2(TOP - WIN.sill - WIN.h), r2(z1 - z0)], material: "stone" })
      }
    }
    for (const zz of WINDOWS) {
      const yaw = s < 0 ? 90 : -90
      // The window: a round head over the square opening, a deep stone reveal, a sill, and the saint in glass.
      o.push({ type: "archHead", at: [x, WIN.sill, zz], yaw, width: WIN.w, height: WIN.h, thickness: T, materials: { fill: "stone", trim: "stoneTrim" } })
      o.push({ type: "panel", at: [r2(x + s * 0.02), WIN.sill, zz], yaw, size: [WIN.w, WIN.h], arch: true, material: "saint" })
      o.push({ type: "box", at: [r2(x - s * 0.28), WIN.sill - 0.08, zz], size: [0.36, 0.08, WIN.w + 0.3], material: "stoneTrim" })
    }
  }
  // The north wall with the red door to the archives, and the south wall with the entrance and a great window over it.
  o.push(
    {
      type: "wall",
      at: [0, N - T / 2],
      yaw: 0,
      length: 2 * W + 2 * T,
      height: TOP,
      thickness: T,
      a: { finish: "stone" },
      b: { finish: "stone" },
      openings: [{ at: 0, width: 1.8, height: 3.0, kind: "door" }],
    },
    // The south wall in two storeys, since a wall's openings cannot stand one over another: the door below, the window above.
    {
      type: "wall",
      at: [0, S + T / 2],
      yaw: 180,
      length: 2 * W + 2 * T,
      height: 7.6,
      thickness: T,
      a: { finish: "stone" },
      b: { finish: "stone" },
      openings: [{ at: 0, width: 2.2, height: 3.4, kind: "door" }],
    },
    {
      type: "wall",
      at: [0, 7.6, S + T / 2],
      yaw: 180,
      length: 2 * W + 2 * T,
      height: TOP - 7.6,
      thickness: T,
      a: { finish: "stone" },
      b: { finish: "stone" },
      openings: [{ at: 0, width: 3.2, height: 5.0, kind: "window", panes: [1, 1] }],
    },
    { type: "archHead", at: [0, 7.6, S + T / 2], yaw: 180, width: 3.2, height: 5.0, thickness: T, materials: { fill: "stone", trim: "stoneTrim" } },
    { type: "panel", at: [0, 7.6, S + 0.02], yaw: 180, size: [3.2, 5.0], arch: true, material: "saint" },
    { type: "archHead", at: [0, 0, N - T / 2], width: 1.8, height: 3.0, thickness: T + 0.04, materials: { fill: "stone", trim: "gilt" } },
    { type: "archHead", at: [0, 0, S + T / 2], yaw: 180, width: 2.2, height: 3.4, thickness: T + 0.04, materials: { fill: "stone", trim: "stoneTrim" } }
  )
  // The red doors: painted leaves, shut, on both faces of the archives' doorway, and the entrance's oak doors.
  o.push(
    { type: "panel", at: [0, 0, N + 0.005], size: [1.8, 3.0], arch: true, material: "doorRed" },
    { type: "panel", at: [0, 0, N - T - 0.005], yaw: 180, size: [1.8, 3.0], arch: true, material: "doorRed" },
    { type: "panel", at: [0, 0, S - 0.005], yaw: 180, size: [2.2, 3.4], arch: true, material: "doorOak", depth: 0.06, edge: "oakDark" }
  )
  // The vault in two halves either side of the crossing, and the crossing's flat ceiling round the dome.
  o.push(
    { type: "vault", at: [0, 0], span: 2 * W, from: N, to: CROSS[0], spring: SPRING, bay: 2.8, repeat: [3, 3], materials: { shell: "fresco", rib: "stoneTrim", trim: "gilt" } },
    { type: "vault", at: [0, 0], span: 2 * W, from: CROSS[1], to: S, spring: SPRING, bay: 3.2, repeat: [3, 2], materials: { shell: "fresco", rib: "stoneTrim", trim: "gilt" } },
    {
      type: "extrude",
      at: [0, CROWN, 0],
      plane: "xz",
      depth: 0.3,
      points: [
        [-W - 0.1, CROSS[0] - 0.1],
        [W + 0.1, CROSS[0] - 0.1],
        [W + 0.1, CROSS[1] + 0.1],
        [-W - 0.1, CROSS[1] + 0.1],
      ],
      holes: [Array.from({ length: 40 }, (_, i) => [r2(Math.cos((i / 40) * 2 * Math.PI) * DOME_R), r2(Math.sin((i / 40) * 2 * Math.PI) * DOME_R)])],
      material: "ceiling",
    },
    // Over each end of the crossing, the wall between the vault's arch and the crossing's ceiling.
    { type: "archHead", at: [0, SPRING, CROSS[0] - 0.08], width: 2 * W, height: W, thickness: 0.16, moulding: 0, keystone: false, materials: { fill: "stone", trim: "gilt" } },
    { type: "archHead", at: [0, SPRING, CROSS[1] + 0.08], width: 2 * W, height: W, thickness: 0.16, moulding: 0, keystone: false, materials: { fill: "stone", trim: "gilt" } },
    { type: "cupola", at: [0, CROWN + 0.3, 0], radius: DOME_R, rise: 3.0, ribs: 8, oculus: 0.7, materials: { shell: "dome" } },
    // A roof over everything, so the sun comes in by the windows and the oculus only.
    { type: "box", at: [0, TOP, -4], size: [2 * W + 1.6, 0.4, S - ARCH.z0 + 1.6], material: "dark" }
  )
  // The crossing's sides above the springing: a great saint in glass in each, under a round head.
  for (const s of [-1, 1]) {
    const x = s * (W - 0.05)
    const yaw = s < 0 ? 90 : -90
    o.push(
      { type: "box", at: [x, SPRING, 0], size: [0.1, CROWN - SPRING, CROSS[1] - CROSS[0]], material: "stone" },
      { type: "panel", at: [r2(x - s * 0.06), SPRING + 0.9, 0], yaw, size: [2.6, 5.2], arch: true, material: "saint", depth: 0.05, edge: "stoneTrim" },
      { type: "archHead", at: [r2(x - s * 0.12), SPRING + 0.9, 0], yaw, width: 3.0, height: 5.4, thickness: 0.12, materials: { fill: "stone", trim: "gilt" } },
      { type: "box", at: [r2(x - s * 0.22), SPRING + 0.8, 0], size: [0.3, 0.12, 3.2], material: "stoneTrim" }
    )
  }
  return o
}

// ── Bookcases, galleries and the far end ──
const BOOKS = ["bookRed", "bookGreen", "bookBlue", "bookBrown", "bookTan", "bookBlack", "bookCloth", "bookOx"]
function stacks(): Obj[] {
  const o: Obj[] = []
  for (const s of [-1, 1]) {
    const x = s * W
    const yaw = s < 0 ? 90 : -90
    // Ground floor: one long run each side, broken at the crossing for a reading alcove under a window-less arch.
    for (const [z0, z1, ladder] of [
      [N + 0.5, CROSS[0] - 0.4, 1.5],
      [CROSS[1] + 0.4, S - 0.5, -0.8],
    ] as [number, number, number][])
      o.push({ type: "bookcase", at: [x, r2((z0 + z1) / 2)], yaw, length: r2(z1 - z0), height: 3.9, depth: 0.45, bay: 1.05, books: BOOKS, ladder: s * ladder })
    // The crossing's alcove: a tall case on the wall with a reading desk before it.
    o.push({ type: "bookcase", at: [x, 0], yaw, length: 3.2, height: 3.9, depth: 0.45, bay: 1.06, books: BOOKS, fill: 0.8 })
    // The gallery with its own bookcases between the windows.
    o.push({ type: "gallery", at: [x, LEVEL, (N + S) / 2], yaw, length: S - N - 2.5, level: 0, depth: 1.25, brackets: 1.4 })
    const cuts = [N + 0.1, ...WINDOWS.flatMap((zz) => [zz - WIN.w / 2 - 0.3, zz + WIN.w / 2 + 0.3]), S - 0.1]
    for (let i = 0; i < cuts.length - 1; i += 2) {
      const z0 = cuts[i]
      const z1 = cuts[i + 1]
      if (z1 - z0 > 0.8) o.push({ type: "bookcase", at: [x, LEVEL + 0.08, r2((z0 + z1) / 2)], yaw, length: r2(z1 - z0), height: 2.9, depth: 0.4, bay: 1.0, plinth: 0.3, books: BOOKS })
    }
  }
  // The far end: a gallery bowed out into a balcony over the red door, between columns, bookcases either side, and a
  // second red door up on the balcony.
  o.push(
    { type: "gallery", at: [0, LEVEL, N], length: 2 * W - 0.1, level: 0, depth: 1.25, curve: 1.2 },
    { type: "column", at: [-1.55, N + 0.55], height: LEVEL - 0.3, radius: 0.24, flutes: 16 },
    { type: "column", at: [1.55, N + 0.55], height: LEVEL - 0.3, radius: 0.24, flutes: 16 },
    { type: "panel", at: [0, LEVEL + 0.08, N + 0.005], size: [1.4, 2.5], arch: true, material: "doorRed" },
    { type: "archHead", at: [0, LEVEL + 0.08, N - T / 2], width: 1.4, height: 2.5, thickness: T + 0.05, materials: { fill: "stone", trim: "gilt" } },
    // Over the balcony, Thyra's tree and moon in glass.
    { type: "panel", at: [0, 7.4, N + 0.02], size: [3.2, 6.0], arch: true, material: "thyra", depth: 0.1, edge: "stoneTrim" },
    { type: "box", at: [0, 7.24, N + 0.15], size: [3.6, 0.16, 0.3], material: "stoneTrim" },
    { type: "torus", at: [0, 7.4 + 6.0 - 1.6, N + 0.08], radius: 1.68, tube: 0.1, arc: 180, segments: 28, material: "gilt" },
    ...[-1, 1].map((s) => ({ type: "box", at: [s * 1.68, 7.4, N + 0.08], size: [0.2, 4.4, 0.2], material: "gilt" }))
  )
  for (const s of [-1, 1]) {
    o.push({ type: "bookcase", at: [s * 4.2, N], length: 4.6, height: 3.9, depth: 0.45, bay: 1.0, books: BOOKS })
    o.push({ type: "bookcase", at: [s * 4.2, LEVEL + 0.08, N], length: 4.6, height: 2.9, depth: 0.4, bay: 1.0, plinth: 0.3, books: BOOKS })
    // The entrance wall: bookcases either side of the doors.
    o.push({ type: "bookcase", at: [s * 4.0, S], yaw: 180, length: 5.0, height: 3.9, depth: 0.45, bay: 1.05, books: BOOKS })
    o.push({ type: "gallery", at: [s * 4.15, LEVEL, S], yaw: 180, length: 5.5, level: 0, depth: 1.25, brackets: 1.4 })
    o.push({ type: "bookcase", at: [s * 4.0, LEVEL + 0.08, S], yaw: 180, length: 5.0, height: 2.9, depth: 0.4, bay: 1.05, plinth: 0.3, books: BOOKS })
  }
  return o
}

// ── Furniture ──
const DANICA_TABLE: V2 = [-3.3, 5.6]
function furnishings(): Obj[] {
  const dark = { wood: "oakDark" }
  return [
    // The great rug under the dome, a smaller one before the archives' door.
    { type: "panel", at: [0, 0.006, -1.3], size: [7.4, 4.2], pitch: -90, material: "rug", depth: 0.012, edge: "rugEdge" },
    { type: "panel", at: [0, 0.006, -10.6], size: [2.6, 1.5], pitch: -90, material: "rug", depth: 0.012, edge: "rugEdge" },
    // Sister Danica's reading table near the entrance, with chairs.
    { type: "desk", id: "reading-table", at: DANICA_TABLE, kind: "writing", length: 2.2, width: 1.0, books: 6, materials: dark },
    { type: "chair", at: [-3.9, 6.35], yaw: 180, materials: { seat: "oakDark" } },
    { type: "chair", at: [-2.75, 6.38], yaw: 172, materials: { seat: "oakDark" } },
    { type: "chair", at: [-3.85, 4.82], yaw: 4, materials: { seat: "oakDark" } },
    // Lecterns down the hall's sides, as in the painting.
    { type: "desk", at: [4.9, -4.8], yaw: -90, kind: "lectern", length: 1.3, width: 0.7, materials: dark },
    { type: "desk", at: [4.9, -8.0], yaw: -90, kind: "lectern", length: 1.3, width: 0.7, candle: false, materials: dark },
    { type: "desk", at: [-4.9, -6.4], yaw: 90, kind: "double", length: 1.6, width: 1.0, materials: dark },
    // Writing desks with stacks of books in the crossing's alcoves, armchairs by them.
    { type: "desk", at: [-5.35, -0.4], yaw: 90, kind: "writing", length: 1.6, width: 0.8, books: 5, materials: dark },
    { type: "armchair", at: [-4.6, 1.7], yaw: 140 },
    { type: "desk", at: [5.35, 0.6], yaw: -90, kind: "writing", length: 1.6, width: 0.8, books: 4, materials: dark },
    { type: "armchair", at: [4.5, -1.2], yaw: -40 },
    { type: "armchair", at: [-5.6, 7.7], yaw: 120 },
    { type: "armchair", at: [5.6, 7.6], yaw: -120 },
    // A globe and tall candle stands round the crossing.
    { type: "globe", at: [2.6, 7.4], radius: 0.28 },
    ...[
      [-4.3, -3.2],
      [4.3, -3.2],
      [-4.3, 3.9],
      [4.3, 3.9],
    ].map(([x, zz]) => ({ type: "candleStand", at: [x, zz], height: 1.7, candles: 5 })),
    // Brass chandeliers in the vault bays.
    ...[-8.0, 6.8].map((zz) => ({ type: "chandelier", at: [0, CROWN - 0.3, zz], radius: 0.9, candles: 12, drop: 8.2, materials: { timber: "brass" } })),
    // Stacks of books on the floor by the alcove desk, as the painting has.
    ...[
      [-6.1, 0.9, 6],
      [-6.0, 1.45, 4],
      [6.1, -0.6, 5],
    ].flatMap(([x, zz, n]) =>
      Array.from({ length: n }, (_, i) => ({ type: "box", at: [x + (i % 2) * 0.02, i * 0.07, zz], yaw: (i * 23) % 40, size: [0.32, 0.07, 0.24], material: BOOKS[(i * 3 + n) % BOOKS.length] }))
    ),
  ]
}

// ── The private archives ──
function archives(): Obj[] {
  const stone = { finish: "stone" as const }
  const o: Obj[] = [
    { type: "wall", at: [0, ARCH.z0 - T / 2], length: ARCH.x1 - ARCH.x0 + 2 * T, height: ARCH.h + 3.2, thickness: T, a: stone, b: stone },
    { type: "wall", at: [ARCH.x0 - T / 2, (ARCH.z0 + ARCH.z1) / 2], yaw: -90, length: ARCH.z1 - ARCH.z0, height: ARCH.h + 3.2, thickness: T, a: stone, b: stone },
    { type: "wall", at: [ARCH.x1 + T / 2, (ARCH.z0 + ARCH.z1) / 2], yaw: 90, length: ARCH.z1 - ARCH.z0, height: ARCH.h + 3.2, thickness: T, a: stone, b: stone },
    // A low stone vault.
    { type: "vault", at: [0, 0], span: ARCH.x1 - ARCH.x0, from: ARCH.z0, to: ARCH.z1, spring: ARCH.h - 0.6, bay: 1.6, rib: 0.18, materials: { shell: "stoneVault", rib: "stoneTrim", trim: "brass" } },
    { type: "box", at: [0, ARCH.h + 3, (ARCH.z0 + ARCH.z1) / 2], size: [8, 0.4, 8], material: "dark" },
    // Narrow saints in glass high on the side walls.
    ...[-16.6, -14.2].flatMap((zz) =>
      [-1, 1].map((s) => ({ type: "panel", at: [r2(s * (ARCH.x1 - 0.02)), 1.7, zz], yaw: s < 0 ? 90 : -90, size: [0.55, 1.5], arch: true, material: "saintDim", depth: 0.04, edge: "lead" }))
    ),
    // Shelves of scrolls and tomes on the back wall and the west wall.
    { type: "bookcase", at: [0, ARCH.z0], length: 6.2, height: 2.9, depth: 0.42, bay: 1.03, books: BOOKS, plinth: 0.4, fill: 0.85 },
    { type: "bookcase", at: [ARCH.x0, -15.6], yaw: 90, length: 3.2, height: 2.6, depth: 0.42, bay: 1.06, books: BOOKS, plinth: 0.4, fill: 0.75, gilt: false },
    // The ancient reading table with scattered documents, and a chair.
    { type: "desk", id: "archive-table", at: [0, -15.5], kind: "writing", length: 2.0, width: 1.0, books: 3, materials: { wood: "oakDark" } },
    { type: "chair", at: [0.3, -14.7], yaw: 190, materials: { seat: "oakDark" } },
    // The locked glass cabinet of rare texts and relics on the east wall.
    { type: "box", id: "cabinet", at: [ARCH.x1 - 0.32, 0, -15.6], size: [0.6, 0.85, 1.6], material: "oakDark", solid: true },
    { type: "box", at: [ARCH.x1 - 0.32, 0.85, -15.6], size: [0.56, 0.04, 1.56], material: "gilt" },
    { type: "box", at: [ARCH.x1 - 0.32, 2.05, -15.6], size: [0.62, 0.1, 1.66], material: "oakDark" },
    ...[-16.37, -15.6, -14.83].map((zz) => ({ type: "box", at: [ARCH.x1 - 0.32, 0.85, zz], size: [0.06, 1.2, 0.06], material: "oakDark" })),
    ...[ARCH.x1 - 0.6, ARCH.x1 - 0.04].map((x) => ({ type: "box", at: [x, 0.85, -16.37], size: [0.04, 1.2, 0.04], material: "oakDark" })),
    { type: "box", at: [ARCH.x1 - 0.61, 0.89, -15.6], size: [0.01, 1.14, 1.5], material: "cabinetGlass" },
    { type: "box", at: [ARCH.x1 - 0.32, 1.42, -15.6], size: [0.5, 0.02, 1.5], material: "glassShelf" },
    { type: "sphere", at: [ARCH.x1 - 0.32, 0.9, -16.0], radius: 0.1, material: "relicOrb" },
    {
      type: "lathe",
      at: [ARCH.x1 - 0.32, 0.87, -15.3],
      profile: [
        [0, 0],
        [0.06, 0],
        [0.02, 0.04],
        [0.015, 0.14],
        [0.07, 0.2],
        [0.075, 0.28],
        [0, 0.26],
      ],
      segments: 18,
      material: "gilt",
    },
    { type: "box", at: [ARCH.x1 - 0.32, 1.44, -15.9], yaw: 20, size: [0.3, 0.06, 0.24], material: "bookRed" },
    { type: "box", at: [ARCH.x1 - 0.32, 1.44, -15.3], yaw: -10, size: [0.18, 0.1, 0.18], material: "gilt" },
    { type: "candleStand", at: [-2.3, -17.5], height: 1.5, candles: 3 },
    { type: "panel", at: [-0.2, 0.006, -16.45], size: [3.0, 1.9], pitch: -90, material: "rug", depth: 0.012, edge: "rugEdge" },
  ]
  return o
}

// ── Materials ──
function materials(): Obj {
  const book = (tint: string, map = "book-spine") => image(map, { tint, roughness: 0.7 })
  return {
    ...pick(["ground", "iron", "brass", "dark", "void"]),
    // Cobblestone floors worn by centuries of seekers: big worn flags, grey-brown, darker in the joints.
    floor: { type: "masonry", a: "#5e554c", b: "#6e6458", c: "#4e463e", mortar: "#2a2420", block: [0.9, 0.6], joint: 0.02, relief: 0.05, variance: 0.5, grime: 1.4, ground: true },
    stone: { type: "masonry", a: "#4e4a46", b: "#5a5450", c: "#46423e", mortar: "#2a2624", block: [0.6, 0.32], joint: 0.015, relief: 0.02, variance: 0.4, grime: 1.6 },
    stoneVault: { type: "masonry", a: "#5a544e", b: "#645e56", c: "#4e4842", mortar: "#2e2a26", block: [0.5, 0.28], joint: 0.015, relief: 0.015, variance: 0.4, grime: 1.8 },
    stoneTrim: { type: "rock", a: "#5a5450", b: "#6e6862", moss: "#3e3a36", mossLight: "#4e4842", lichen: "#7e766e", mossAmount: 0.2, lichenAmount: 0.05, relief: 0.4, scale: 0.8 },
    stoneDark: { type: "plain", color: "#2a2624", roughness: 1 },
    plaster: { type: "plain", color: "#3a3430", roughness: 1 },
    // Dark carved wood with gilt: the painting's bookcases and galleries.
    oak: painted("door-oak", "#8a6a54", [0.2, 2.4], { size: [0.6, 1.8], grime: 1.0, relief: 0.1 }),
    oakDark: painted("door-oak", "#5c4436", [0, 40], { size: [0.6, 1.8], grime: 1.2, relief: 0.1 }),
    timber: painted("timber-hold", "#6e5a4a", [0, 40], { size: [0.7, 2.2], grime: 1.2, relief: 0.1 }),
    panel: painted("cabin-planks", "#6e5446", [0.16, 40], { size: [0.5, 1.6], grime: 0.9, relief: 0.14 }),
    boards: painted("timber-hold", "#7a6450", [0.26, 40], { size: [0.7, 2.2], grime: 0.9, relief: 0.08 }),
    door: painted("door-oak", "#a08068", [0, 12], { size: [0.6, 1.8], grime: 0.6, relief: 0.14 }),
    gilt: { type: "metal", color: "#c89a48", roughness: 0.38, metalness: 0.85 },
    lead: { type: "metal", color: "#2a2826", roughness: 0.6, metalness: 0.4 },
    // Books bound in leather and cloth of many colours, painted spines tinted.
    bookRed: book("#b04a3a"),
    bookGreen: book("#5a7a4c"),
    bookBlue: book("#4a5e86"),
    bookBrown: book("#9a6a44"),
    bookTan: book("#e8d0aa"),
    bookBlack: book("#4e4440"),
    bookOx: book("#8a2e2a"),
    bookCloth: book("#c8bca0", "book-spine-cloth"),
    paper: { type: "plain", color: "#e2d6b8", roughness: 0.95 },
    leather: { type: "plain", color: "#1e3a44", roughness: 0.5 },
    leatherRed: { type: "plain", color: "#5a2420", roughness: 0.6 },
    candle: { type: "plain", color: "#e8dcc0", roughness: 0.9 },
    candleFlame: { type: "plain", color: "#000000", roughness: 1, emissive: "#ffa040", emissiveIntensity: 2.4 },
    rug: image("library-rug", { roughness: 1 }),
    rugEdge: { type: "plain", color: "#4a1a1a", roughness: 1 },
    fresco: image("vault-fresco", { roughness: 0.9, tint: "#f0e8dc" }),
    dome: image("dome-fresco", { roughness: 0.9 }),
    // Coffers: deep teal squares between gilt ribs.
    ceiling: { type: "masonry", a: "#2c3a3a", b: "#334242", c: "#283434", mortar: "#a07a3a", block: [1.2, 1.2], joint: 0.07, relief: 0.4, variance: 0.3, grime: 0.6 },
    skylight: { type: "plain", color: "#000000", emissive: "#fff2d8", emissiveIntensity: 3 },
    saint: image("stained-saint", { glow: 1.4, roughness: 0.3, double: true }),
    saintDim: image("stained-saint", { glow: 0.55, roughness: 0.3 }),
    thyra: image("stained-thyra", { glow: 1.3, roughness: 0.3 }),
    doorRed: image("door-thyra", { roughness: 0.55, tint: "#e8dcd4" }),
    doorOak: painted("door-oak", "#8a6a54", [0.18, 3.4], { size: [0.6, 1.8], grime: 0.8 }),
    globeMap: image("globe-map", { roughness: 0.6 }),
    glass: { type: "glass", color: "#a8c0d8", opacity: 0.25 },
    glassOut: { type: "glass", color: "#a8c0d8", opacity: 0.25 },
    cabinetGlass: { type: "glass", color: "#c8d8e0", opacity: 0.12, roughness: 0.05 },
    glassShelf: { type: "glass", color: "#c8d8e0", opacity: 0.2, roughness: 0.05 },
    relicOrb: { type: "orb", color: "#1a2a3a", glow: "#7ab0ff" },
    ink: { type: "plain", color: "#141414", roughness: 0.3 },
    shaft: { type: "glow", color: "#ffd9a0", opacity: 0.035 },
    shaftDome: { type: "glow", color: "#fff0d0", opacity: 0.03 },
  }
}

// ── The set ──
const MARKS = {
  entrance: { at: [0, 8.6], label: "the entrance" },
  readingTable: { at: [-2.0, 5.6], label: "the reading table" },
  dome: { at: [0, 1.5], label: "under the dome" },
  stacks: { at: [-5.6, -3.0], label: "the stacks" },
  lecterns: { at: [3.9, -6.4], label: "the lecterns" },
  alcove: { at: [-3.9, -0.2], label: "the reading alcove" },
  globe: { at: [2.0, 7.8], label: "the globe" },
  archiveDoor: { at: [0, -10.9], label: "the red door to the private archives" },
  archives: { at: [-1.2, -14.0], label: "the private archives" },
  cabinet: { at: [1.9, -15.6], label: "the locked glass cabinet" },
  archiveTable: { at: [-1.5, -15.5], label: "the archive's reading table" },
}
const SHOTS = {
  hall: { position: [0, 1.75, 8.6], target: [0, 3.6, -12], fov: 60, label: "The great hall" },
  dome: { position: [0.8, 1.6, -1.8], target: [0, 16, 0.2], fov: 66, label: "The dome" },
  stacks: { position: [-2.6, 1.6, 2.8], target: [-6.8, 3.4, -6.4], fov: 58, label: "The stacks" },
  gallery: { position: [4.8, 1.7, 6.6], target: [-5.4, 5.6, -4.0], fov: 56, label: "The galleries" },
  lecterns: { position: [1.8, 1.6, -2.2], target: [5.4, 1.1, -8.4], fov: 54, label: "The lecterns" },
  table: { position: [-1.2, 1.7, 2.6], target: [-3.6, 0.9, 6.0], fov: 54, label: "The reading table" },
  door: { position: [0, 1.65, -5.0], target: [0, 2.6, -12.2], fov: 56, label: "The red door" },
  archives: { position: [-2.5, 1.65, -12.9], target: [1.6, 1.1, -17.2], fov: 64, label: "The private archives" },
  cabinet: { position: [-0.6, 1.5, -14.0], target: [3.0, 1.2, -15.8], fov: 52, label: "The glass cabinet" },
}
const HALL_BOX = [-W, -0.5, N, W, CROWN + 3.5, S]
const ARCH_BOX = [ARCH.x0, -0.5, ARCH.z0, ARCH.x1, ARCH.h + 1, ARCH.z1]

function library() {
  const objects = [...shell(), ...stacks(), ...furnishings(), ...archives()]
  // Sunlight through the great south window: one long shaft down the hall onto the crossing's floor.
  {
    const y = 10.0
    const k = y / SUN[1]
    objects.push({ type: "beam", from: [0, y, S], to: [r2(-SUN[0] * k), 0, r2(S - SUN[2] * k)], radius: 0.9, radiusTo: 1.4, segments: 16, material: "shaft", open: true })
  }
  // The oculus's light falling to the rug.
  objects.push({ type: "beam", from: [0, CROWN + 2.8, 0], to: [0, 0, 0.8], radius: 0.55, radiusTo: 1.6, segments: 16, material: "shaftDome", open: true })
  return {
    format: "d20.stage.set",
    version: 1,
    id: "old-grand-library",
    settingId: "realm-of-myr",
    locationId: "old-grand-library",
    title: "The Old Grand Library",
    seed: 8080,
    atmosphere: {
      sun: {
        direction: SUN,
        color: "#ffe0b0",
        intensity: 5,
        target: [0, 0, -2],
        distance: 200,
        shadow: { left: -22, right: 22, top: 22, bottom: -22, near: 120, far: 300, size: 4096 },
      },
      hemisphere: { sky: "#a8bcd4", ground: "#5a4a3a", intensity: 0.5 },
      sky: { horizon: "#e8d8c0", mid: "#a0bcd8", zenith: "#5a84b4", gain: 1, clouds: 0.5, stars: 0, moon: 0 },
      fog: { density: 0.003, start: 20 },
      fill: { color: "#fff0e0", intensity: 1.2, distance: 10 },
      lights: [],
      environment: 0.3,
      exposure: 1.0,
      grade: "neutral",
      wind: 0,
    },
    // Inside: daylight from the windows and the oculus, warm pools from the candle stands, the lecterns and the
    // chandeliers, and dusk between the stacks. In the archives, the candles and the glass.
    rooms: [
      {
        box: HALL_BOX,
        ambient: 0.32,
        fill: 1.5,
        exposure: 1.3,
        lights: [
          { at: [0, 9.5, 0.4], color: "#fff0d8", intensity: 26, distance: 14 },
          { at: [-4.0, 2.2, -3.2], color: "#ffb870", intensity: 7, distance: 6 },
          { at: [4.0, 2.2, -3.2], color: "#ffb870", intensity: 7, distance: 6 },
          { at: [-4.0, 2.2, 3.9], color: "#ffb870", intensity: 7, distance: 6 },
          { at: [4.0, 2.2, 3.9], color: "#ffb870", intensity: 7, distance: 6 },
          { at: [0, 5.6, -8.0], color: "#ffc078", intensity: 26, distance: 12 },
          { at: [0, 5.6, 6.8], color: "#ffc078", intensity: 26, distance: 12 },
          { at: [0, 2.4, -10.8], color: "#ffb870", intensity: 5, distance: 5 },
        ],
      },
      {
        box: ARCH_BOX,
        ambient: 0.12,
        fill: 1.1,
        exposure: 1.15,
        lights: [
          { at: [-2.3, 1.9, -17.4], color: "#ffb870", intensity: 6, distance: 5 },
          { at: [-0.6, 1.2, -15.4], color: "#ffbc78", intensity: 5, distance: 4 },
          { at: [2.4, 1.4, -15.6], color: "#8ab4ff", intensity: 1.2, distance: 2.5 },
          { at: [0, 2.6, -13.2], color: "#b8c4e8", intensity: 2, distance: 5 },
        ],
      },
    ],
    camera: { near: 0.1, far: 300, min: [-6.6, 0.4, ARCH.z0 + 0.3], max: [6.6, 13, S - 0.4], maxDistance: 14 },
    materials: materials(),
    objects,
    crowd: {
      library: "realm-of-myr",
      groups: [
        {
          type: "points",
          people: [
            { kind: "pilgrim", at: [5.95, -6.4], yaw: -90 },
            { kind: "woman", at: [-6.15, 3.4], yaw: -90, y: LEVEL },
            { kind: "traveler", at: [6.2, -2.4], yaw: 90, y: LEVEL },
            { kind: "pilgrim", at: [-5.9, -8.6], yaw: 90 },
          ],
        },
      ],
    },
    marks: MARKS,
    shots: SHOTS,
    life: { dust: { count: 420, box: [-6.5, 0.2, -11.5, 6.5, 9, 9.5] } },
  }
}
write(`${SETS}/old-grand-library.json`, library())

// ── Cast and staging ──
const art = (name: string) => ({ front: `${ART}/${name}-front.webp`, back: `${ART}/${name}-back.webp`, portrait: `${ART}/${name}-portrait.jpg` })
const member = (id: string, name: string, role: string, height: number, file: string, at: V2, facing: string | V2 | number) => ({ id, name, role, height, art: art(file), at, facing })
// The heroes just inside the entrance, looking up the hall; Danica comes to them from beside the reading table.
const PARTY: [string, V2][] = [
  ["branka-stoneveil", [-1.3, 7.7]],
  ["cassia-verane", [-0.45, 7.95]],
  ["yeva-softstep", [0.45, 7.95]],
  ["milos-radan", [1.3, 7.7]],
]
const party = (spots: [string, V2][], facing: V2) => spots.map(([id, at]) => ({ ...festival.cast.find((c: Obj) => c.id === id), at, facing }))
const seated = (id: string, name: string, at: V2, facing: V2) => member(`reader-${id}`, name, "Reader", 1.32, `reader-${id}`, at, facing)
const shotOn = (subject: string, distance: number, angle: number, height: number, lookHeight: number, label: string) => ({ subject, distance, angle, height, lookHeight, fov: 44, label })
function staging(id: string, cast: Obj[], shots: Obj, shot: string, extra: Obj = {}) {
  write(`${STAGINGS}/${id}.json`, { format: "d20.stage.staging", version: 1, id: `march-of-davos/${id}`, set: "realm-of-myr/old-grand-library", cast, shots, shot, ...extra })
}

staging(
  "the-old-grand-library",
  [
    ...party(PARTY, [0, 5.9]),
    member("sister-danica", "Sister Danica", "Cleric of Thyra", 1.7, "sister-danica", [-0.3, 5.9], [0, 7.9]),
    member("eldrin-varokich", "The Archivist", "Archivist", 1.72, "eldrin-varokich", [1.6, -16.6], [-0.4, -13.2]),
    seated("scholar", "An old scholar", [-4.75, -0.4], [-5.35, -0.4]),
    seated("acolyte", "A young acolyte", [-2.75, 4.8], [-2.75, 5.6]),
  ],
  {
    danica: shotOn("sister-danica", 2.2, 20, 1.62, 1.56, "Sister Danica"),
    archivist: shotOn("eldrin-varokich", 2.0, -25, 1.6, 1.55, "The Archivist"),
    party: { subjects: PARTY.map(([id]) => id), offset: [1.8, 1.7, -3.2], target: [0, 1.1, 0], relative: "world", fov: 54, label: "Party" },
  },
  "hall"
)
