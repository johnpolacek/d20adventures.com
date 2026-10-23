import * as THREE from "three"
import { z } from "zod"
import { arcPts, beam, Frame, G, M4, type Vec2 } from "../kit/geometry"
import { defineBuilder, num, size } from "./types"

// A round hall's parts (the Black Market's auction house): a curved wall with arched niches and doors, a gallery that
// follows it, a half-round stage, and a speaker's stone lectern with a gavel.

// Angles are in degrees round the origin: 0 points to +z, 90 to +x. A point at angle a and radius r is (sin a, cos a) * r.
const DEG = Math.PI / 180
const at = (a: number, r: number): Vec2 => [Math.sin(a * DEG) * r, Math.cos(a * DEG) * r]
// Spans of an arc from `from` to `to` degrees, cut out where `gaps` stand ([angle, width in metres]).
function spans(from: number, to: number, r: number, gaps: [number, number][]) {
  const cuts = gaps.map(([a, w]) => [a - w / 2 / r / DEG, a + w / 2 / r / DEG]).sort((p, q) => p[0] - q[0])
  const out: [number, number][] = []
  let a = from
  for (const [g0, g1] of cuts) {
    if (g0 > a) out.push([a, Math.min(g0, to)])
    a = Math.max(a, g1)
  }
  if (a < to) out.push([a, to])
  return out
}
// A ring sector in the XZ plane between radii r0 and r1, from a0 to a1, as a flat outline for `shape` (laid with pitch
// -90, so its second coordinate is -z).
function sector(r0: number, r1: number, a0: number, a1: number, n = 32): Vec2[] {
  const outer: Vec2[] = []
  const inner: Vec2[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    const [x1, z1] = at(a, r1)
    const [x0, z0] = at(a, r0)
    outer.push([x1, -z1])
    inner.push([x0, -z0])
  }
  return [...outer, ...inner.reverse()]
}

// A curved wall of radius `radius` round the origin, its inner face toward the centre, from `from` to `to` degrees:
// dressed stone with a plinth and a cornice, arched niches with a lamp in each every `niche` degrees, and doorways
// (`doors`, [angle, width]) that walks pass through.
export const rotunda = defineBuilder(
  z
    .object({
      radius: size(100),
      from: num(-360, 360),
      to: num(-360, 360),
      height: size(40),
      thickness: size(3).default(0.5),
      niche: num(0, 180).default(0),
      nicheSize: z.tuple([size(10), size(10)]).default([1.4, 2.6]),
      nicheSill: num(0, 20).default(0.9),
      nicheLevels: z.array(num(0, 40)).max(4).default([]),
      doors: z.array(z.tuple([num(-360, 360), size(10)])).max(6).default([]),
      doorHeight: size(10).default(3.2),
      cornice: num(0, 40).optional(),
    })
    .strict(),
  (ctx, p) => {
    const { b, M } = ctx
    const F = new Frame(b, new THREE.Matrix4())
    const r = p.radius
    const T = p.thickness
    const segs = Math.max(8, Math.round((Math.abs(p.to - p.from) * DEG * r) / 0.8))
    // The shell: a thick ring, full height between doors, and over each door a lintel.
    const solid = spans(p.from, p.to, r, p.doors)
    for (const [a0, a1] of solid) {
      const n = Math.max(2, Math.round((segs * (a1 - a0)) / (p.to - p.from)))
      F.shape(M.wall, sector(r, r + T, a0, a1, n), p.height, M4(0, 0, 0, 0, 1, 1, 1, -Math.PI / 2))
      // Footprints along the wall, a short rect per step.
      for (let i = 0; i < n; i++) {
        const a = a0 + ((a1 - a0) * (i + 0.5)) / n
        const len = ((a1 - a0) / n) * DEG * (r + T / 2)
        const [x, zz] = at(a, r + T / 2)
        ctx.footprint(x, zz, len / 2 + 0.02, T / 2 + 0.03, a * DEG)
      }
      // Plinth and cornice run round the inner face.
      F.shape(M.trim, sector(r - 0.12, r, a0, a1, n), 0.4, M4(0, 0, 0, 0, 1, 1, 1, -Math.PI / 2))
    }
    for (const [a, w] of p.doors) {
      const da = w / 2 / r / DEG
      F.shape(M.wall, sector(r, r + T, a - da, a + da, 6), p.height - p.doorHeight, M4(0, p.doorHeight, 0, 0, 1, 1, 1, -Math.PI / 2))
      // A moulded arch over the door, its jambs, and anchors a step either side for walks.
      const [x, zz] = at(a, r - 0.02)
      const frame = new Frame(b, M4(x, 0, zz, a * DEG + Math.PI))
      frame.geo(M.trim, G(`hall-door-${w}`, () => new THREE.TorusGeometry(w / 2 + 0.12, 0.12, 6, 20, Math.PI)), M4(0, p.doorHeight - w / 2, 0), { uv: "keep" })
      for (const s of [-1, 1]) frame.box(M.trim, (s * (w / 2 + 0.12)), (p.doorHeight - w / 2) / 2, 0, 0.26, p.doorHeight - w / 2, 0.3)
      const [ix, iz] = at(a, r - 0.8)
      const [ox, oz] = at(a, r + T + 0.8)
      ctx.anchor("door", ix, 0, iz)
      ctx.anchor("door", ox, 0, oz)
    }
    if (p.cornice !== undefined) {
      for (const [a0, a1] of solid) F.shape(M.trim, sector(r - 0.22, r, a0, a1, 24), 0.22, M4(0, p.cornice, 0, 0, 1, 1, 1, -Math.PI / 2))
      for (const [a, w] of p.doors) {
        const da = w / 2 / r / DEG
        F.shape(M.trim, sector(r - 0.22, r, a - da, a + da, 4), 0.22, M4(0, p.cornice, 0, 0, 1, 1, 1, -Math.PI / 2))
      }
    }
    // Arched niches, dark inside, with a pilaster between each and a lamp glowing in the back of each.
    if (p.niche > 0) {
      const [nw, nh] = p.nicheSize
      const levels = p.nicheLevels.length ? p.nicheLevels : [p.nicheSill]
      const n = Math.floor((p.to - p.from) / p.niche)
      for (let i = 0; i <= n; i++) {
        const a = p.from + (p.to - p.from - n * p.niche) / 2 + i * p.niche
        if (p.doors.some(([d, w]) => Math.abs(a - d) * DEG * r < w / 2 + nw / 2 + 0.3)) continue
        const [x, zz] = at(a, r)
        const f = new Frame(b, M4(x, 0, zz, a * DEG + Math.PI))
        for (const y0 of levels) {
          // The niche: a dark round-headed recess, its frame, a sill.
          const arch = [...arcPts(0, nh - nw / 2, nw / 2, 0, Math.PI, 14), [-nw / 2, 0] as Vec2, [nw / 2, 0] as Vec2]
          f.shape(M.niche, arch, 0.02, M4(0, y0, -0.02))
          f.geo(M.trim, G(`hall-niche-${nw}`, () => new THREE.TorusGeometry(nw / 2 + 0.06, 0.06, 5, 16, Math.PI)), M4(0, y0 + nh - nw / 2, 0.02), { uv: "keep" })
          for (const s of [-1, 1]) f.box(M.trim, (s * (nw / 2 + 0.06)), y0 + (nh - nw / 2) / 2, 0.02, 0.12, nh - nw / 2, 0.1)
          f.box(M.trim, 0, y0 - 0.05, 0.08, nw + 0.3, 0.1, 0.24)
          // A lamp on a bracket in the niche: a brass cup and a glowing globe.
          f.cyl(M.brass, 0, y0 + nh * 0.42, 0.12, 0.07, 0.1, 0.06, 10)
          f.sphere(M.lamp, 0, y0 + nh * 0.42 + 0.14, 0.12, 0.09, 0.11, 0.09, 12)
        }
        // A pilaster halfway to the next niche.
        if (i < n) {
          const [px, pz] = at(a + p.niche / 2, r)
          const pf = new Frame(b, M4(px, 0, pz, (a + p.niche / 2) * DEG + Math.PI))
          pf.box(M.trim, 0, p.height / 2, 0.06, 0.5, p.height, 0.14)
        }
      }
    }
  },
  { wall: "stone", trim: "stoneTrim", niche: "dark", lamp: "lamp", brass: "brass" }
)

// A gallery following a curved wall of radius `radius` at height `level`, from `from` to `to` degrees, `depth` deep: a
// deck, a moulded fascia with carved brackets under it, and a balustrade of turned balusters with a handrail.
export const ringGallery = defineBuilder(
  z
    .object({
      radius: size(100),
      from: num(-360, 360),
      to: num(-360, 360),
      level: num(0, 40),
      depth: size(6).default(1.5),
      rail: size(2).default(1.0),
      spacing: size(1).default(0.2),
      brackets: num(0, 30).default(8),
    })
    .strict(),
  (ctx, p) => {
    const { b, M } = ctx
    const F = new Frame(b, new THREE.Matrix4())
    const r1 = p.radius
    const r0 = r1 - p.depth
    const n = Math.max(8, Math.round(((p.to - p.from) * DEG * r1) / 0.6))
    const lay = (y: number) => M4(0, y, 0, 0, 1, 1, 1, -Math.PI / 2)
    F.shape(M.deck, sector(r0, r1, p.from, p.to, n), 0.1, lay(p.level))
    F.shape(M.case, sector(r0 - 0.03, r1, p.from, p.to, n), 0.36, lay(p.level - 0.1))
    F.shape(M.trim, sector(r0 - 0.08, r0 + 0.1, p.from, p.to, n), 0.08, lay(p.level - 0.04))
    F.shape(M.trim, sector(r0 - 0.06, r0 + 0.1, p.from, p.to, n), 0.06, lay(p.level - 0.46))
    // The balustrade.
    const rr = r0 + 0.07
    for (let i = 0; i < n; i++) {
      const a0 = p.from + ((p.to - p.from) * i) / n
      const a1 = p.from + ((p.to - p.from) * (i + 1)) / n
      const [x0, z0] = at(a0, rr)
      const [x1, z1] = at(a1, rr)
      beam(b, M.case, [x0, p.level + 0.08, z0], [x1, p.level + 0.08, z1], 0.045, 4)
      beam(b, M.case, [x0, p.level + p.rail, z0], [x1, p.level + p.rail, z1], 0.07, 6)
      beam(b, M.trim, [x0, p.level + p.rail + 0.065, z0], [x1, p.level + p.rail + 0.065, z1], 0.025, 4)
    }
    const baluster: Vec2[] = [
      [0.035, 0],
      [0.035, 0.05],
      [0.02, 0.09],
      [0.045, 0.3],
      [0.05, 0.42],
      [0.022, 0.6],
      [0.03, 0.68],
      [0.035, p.rail - 0.1],
    ]
    const nb = Math.round(((p.to - p.from) * DEG * rr) / p.spacing)
    for (let i = 0; i <= nb; i++) {
      const [x, zz] = at(p.from + ((p.to - p.from) * i) / nb, rr)
      F.lathe(M.case, x, p.level + 0.1, zz, baluster, 8)
    }
    // Carved brackets under the deck at the wall.
    if (p.brackets > 0) {
      const nk = Math.max(1, Math.round((p.to - p.from) / p.brackets))
      for (let i = 0; i <= nk; i++) {
        const a = p.from + ((p.to - p.from) * i) / nk
        const [x, zz] = at(a, r1)
        const f = new Frame(b, M4(x, 0, zz, a * DEG + Math.PI))
        f.shape(M.case, [[0, 0], [p.depth * 0.75, 0], [p.depth * 0.18, -0.9], [0, -0.9]], 0.16, M4(0.08, p.level - 0.1, 0, Math.PI / 2))
      }
    }
  },
  { deck: "oak", case: "oakDark", trim: "gilt" }
)

// A half-round stage against a wall, its straight back on z = 0 and its curved front toward +z: a stone drum with a
// moulded nosing and a carved frieze, a rug on top, and stairs at both ends. Solid to walks.
export const dais = defineBuilder(
  z.object({ radius: size(20), height: size(3).default(0.7), stairs: z.boolean().default(true) }).strict(),
  (ctx, p) => {
    const { b, M } = ctx
    const F = new Frame(b, new THREE.Matrix4())
    const r = p.radius
    const h = p.height
    const lay = (y: number) => M4(0, y, 0, 0, 1, 1, 1, -Math.PI / 2)
    // The front half-disc runs from -90 to 90 degrees round +z.
    const disc = (rad: number): Vec2[] => [[-rad, 0], ...arcPts(0, 0, rad, Math.PI, 0, 40).map(([x, y]) => [x, -y] as Vec2), [rad, 0]]
    F.shape(M.stone, disc(r), h - 0.1, lay(0))
    F.shape(M.trim, disc(r + 0.08), 0.1, lay(h - 0.1))
    F.shape(M.trim, disc(r + 0.06), 0.16, lay(0))
    // A frieze band of darker panels round the drum.
    F.shape(M.frieze, disc(r + 0.015), 0.22, lay(h * 0.45))
    F.shape(M.top, disc(r - 0.25), 0.012, lay(h))
    if (p.stairs)
      for (const s of [-1, 1]) {
        const steps = Math.max(2, Math.round(h / 0.17))
        for (let i = 0; i < steps; i++) {
          const hy = (h * (i + 1)) / steps
          F.box(M.stone, s * (r + 0.2 + (steps - 1 - i) * 0.3), hy / 2, 0.6, 0.32, hy, 1.1)
        }
      }
    ctx.footprint(0, r * 0.45, r, r * 0.45, 0, h)
    ctx.circle(0, 0, r * 0.98)
  },
  { stone: "stone", trim: "stoneTrim", frieze: "stoneDark", top: "velvet" }
)

// A speaker's stone lectern facing +z (the speaker stands at -z): a carved block with a sloped top, a gavel resting on
// its sounding block, a candlestick, and `lot` laid on top: an open map, a map case, a dagger on a cushion, or nothing.
export const lectern = defineBuilder(
  z
    .object({
      width: size(3).default(1.1),
      height: size(2).default(1.08),
      lot: z.enum(["none", "map", "case", "dagger"]).default("none"),
    })
    .strict(),
  (ctx, p) => {
    const { b, M } = ctx
    const F = new Frame(b, new THREE.Matrix4())
    const w = p.width
    const h = p.height
    const d = 0.62
    F.box(M.stone, 0, 0.06, 0, w + 0.14, 0.12, d + 0.14)
    F.box(M.stone, 0, h / 2, 0, w, h - 0.1, d)
    F.box(M.trim, 0, h - 0.06, 0, w + 0.12, 0.1, d + 0.12)
    // Carved panels on the front face.
    for (const s of [-1, 1]) F.box(M.trim, (s * w) / 4, h * 0.48, d / 2 + 0.012, w * 0.36, h * 0.56, 0.025)
    F.box(M.frieze, 0, h * 0.48, d / 2 + 0.026, w * 0.22, h * 0.3, 0.012)
    const top = h - 0.01
    // The sounding block and the gavel lying across it.
    F.cyl(M.wood, w / 2 - 0.2, top, -0.08, 0.09, 0.1, 0.05, 18)
    F.cyl(M.wood, w / 2 - 0.2, top + 0.085 - 0.055, -0.08, 0.035, 0.035, 0.11, 12, 0, Math.PI / 2)
    beam(b, M.wood, [w / 2 - 0.2, top + 0.09, -0.08], [w / 2 - 0.42, top + 0.04, 0.12], 0.014, 6)
    // A brass candlestick with a lit candle.
    F.cyl(M.brass, -w / 2 + 0.14, top, -0.14, 0.06, 0.04, 0.02, 12)
    F.cyl(M.brass, -w / 2 + 0.14, top + 0.02, -0.14, 0.015, 0.015, 0.22, 6)
    F.cyl(M.brass, -w / 2 + 0.14, top + 0.24, -0.14, 0.035, 0.025, 0.02, 12)
    F.cyl(M.wax, -w / 2 + 0.14, top + 0.26, -0.14, 0.02, 0.018, 0.14, 8)
    F.sphere(M.flame, -w / 2 + 0.14, top + 0.42, -0.14, 0.012, 0.03, 0.012, 6)
    if (p.lot === "map") {
      // The relic: a weathered map laid open, its corners curling.
      F.geo(M.map, G("hall-map", () => new THREE.PlaneGeometry(0.62, 0.44, 8, 4)), M4(-0.05, top + 0.004, 0.02, 0, 1, 1, 1, -Math.PI / 2), { uv: "keep" })
      for (const s of [-1, 1]) F.cyl(M.paper, -0.05 + s * 0.31, top + 0.016 - 0.22, 0.02, 0.016, 0.016, 0.44, 8, Math.PI / 2, 0)
    }
    if (p.lot === "case") {
      // The map's leather case, brass-capped.
      F.cyl(M.leather, -0.05, top + 0.06 - 0.28, 0.02, 0.055, 0.055, 0.56, 14, 0, Math.PI / 2)
      for (const s of [-1, 1]) F.cyl(M.brass, -0.05 + s * 0.28, top + 0.06 - 0.015, 0.02, 0.06, 0.06, 0.03, 14, 0, Math.PI / 2)
    }
    if (p.lot === "dagger") {
      // A jewelled dagger on a velvet cushion.
      F.box(M.cushion, -0.05, top + 0.04, 0.02, 0.42, 0.08, 0.3)
      F.box(M.steel, -0.02, top + 0.085, 0.02, 0.26, 0.008, 0.035)
      F.box(M.gold, -0.17, top + 0.09, 0.02, 0.025, 0.02, 0.12)
      F.box(M.gold, -0.24, top + 0.09, 0.02, 0.11, 0.02, 0.03)
      F.sphere(M.gem, -0.3, top + 0.095, 0.02, 0.018, 0.018, 0.018, 8)
    }
    ctx.footprint(0, 0, w / 2 + 0.07, d / 2 + 0.07, 0, h)
  },
  { stone: "stone", trim: "stoneTrim", frieze: "stoneDark", wood: "oakDark", brass: "brass", wax: "candle", flame: "candleFlame", map: "relicMap", paper: "paper", leather: "leatherRed", cushion: "velvet", steel: "steel", gold: "gilt", gem: "ruby" }
)

// A way through rows of seats for walks: two doorway anchors, at the aisle's near end and at `to` from it. Nothing is drawn. A walk that
// cannot go straight goes in at one end and out at the other.
export const aisle = defineBuilder(z.object({ to: z.tuple([num(-200, 200), num(-200, 200)]) }).strict(), (ctx, p) => {
  ctx.anchor("door", 0, 0, 0)
  ctx.anchor("door", p.to[0], 0, p.to[1])
})

// A theatre chair facing +z: a carved dark frame on turned legs, a velvet seat and a tall velvet back panel with a
// moulded top rail, and padded arms.
export const theatreChair = defineBuilder(
  z.object({ width: size(2).default(0.6), back: size(2).default(1.0) }).strict(),
  (ctx, p) => {
    const { M } = ctx
    const F = new Frame(ctx.b, new THREE.Matrix4())
    const w = p.width
    const d = 0.52
    const seatH = 0.46
    for (const [x, zz] of [
      [-w / 2 + 0.04, d / 2 - 0.04],
      [w / 2 - 0.04, d / 2 - 0.04],
      [-w / 2 + 0.04, -d / 2 + 0.04],
      [w / 2 - 0.04, -d / 2 + 0.04],
    ])
      F.lathe(M.frame, x, 0, zz, [[0.018, 0], [0.026, 0.05], [0.018, 0.16], [0.026, 0.26], [0.022, seatH - 0.06], [0, seatH - 0.06]], 8)
    F.box(M.frame, 0, seatH - 0.07, 0, w, 0.06, d)
    F.box(M.velvet, 0, seatH - 0.01, 0.02, w - 0.06, 0.08, d - 0.06)
    // The back: two posts, a velvet panel, a carved crest.
    for (const s of [-1, 1]) F.box(M.frame, (s * (w / 2 - 0.035)), (seatH + p.back) / 2, -d / 2 + 0.03, 0.05, p.back - seatH + 0.02, 0.05, 0, -0.08)
    F.box(M.velvet, 0, (seatH + 0.06 + p.back - 0.07) / 2, -d / 2 + 0.05, w - 0.1, p.back - seatH - 0.12, 0.06, 0, -0.08)
    F.box(M.frame, 0, p.back - 0.03, -d / 2 + 0.01, w - 0.02, 0.07, 0.06, 0, -0.08)
    F.sphere(M.trim, 0, p.back + 0.02, -d / 2 + 0.01, 0.05, 0.04, 0.025, 8)
    // Arms.
    for (const s of [-1, 1]) {
      F.box(M.frame, (s * (w / 2 - 0.03)), seatH + 0.12, 0.02, 0.05, 0.24, 0.05)
      F.box(M.velvet, (s * (w / 2 - 0.03)), seatH + 0.25, -0.03, 0.07, 0.04, d - 0.08)
    }
    ctx.footprint(0, 0, w / 2, d / 2, 0, p.back)
  },
  { frame: "oakDark", velvet: "velvet", trim: "gilt" }
)
