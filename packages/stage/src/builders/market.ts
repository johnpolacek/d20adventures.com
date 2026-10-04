import * as THREE from "three"
import { z } from "zod"
import { beam, box, cyl, Frame, G, lathe, M4, type Sink, TAU, V } from "../kit/geometry"
import type { Rand } from "../kit/rng"
import { pennant } from "./parts"
import { type BuildCtx, coord, defineBuilder, matName, num, size, vec3 } from "./types"

// Market, town and harvest-festival dressing, ported from the Kordavos plaza.

const lerp3 = (a: THREE.Vector3, b: THREE.Vector3, t: number) => a.clone().lerp(b, t)

// A cloth sheet stretched between four corners, sagging where it is unsupported.
function sheet(b: Sink, mat: THREE.Material, c00: THREE.Vector3, c10: THREE.Vector3, c01: THREE.Vector3, c11: THREE.Vector3, sag: number, nu = 12, nv = 8) {
  const g = new THREE.PlaneGeometry(1, 1, nu, nv)
  const p = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) {
    const u = uv.getX(i)
    const v = uv.getY(i)
    const q = lerp3(lerp3(c00, c10, u), lerp3(c01, c11, u), v)
    q.y -= sag * Math.sin(Math.PI * u) * (0.35 + 0.65 * Math.sin(Math.PI * v))
    p.setXYZ(i, q.x, q.y, q.z)
  }
  g.computeVertexNormals()
  b.add(g, mat, null, { uv: "keep", extra: (geo, i) => Math.sin(Math.PI * geo.attributes.uv.getX(i)) * Math.sin(Math.PI * geo.attributes.uv.getY(i)) * 0.5 })
  g.dispose()
}
// A frayed valance hanging from an edge.
function valance(b: Sink, mat: THREE.Material, a: THREE.Vector3, c: THREE.Vector3, drop: number) {
  const g = new THREE.PlaneGeometry(1, 1, 10, 3)
  const p = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) {
    const u = uv.getX(i)
    const v = uv.getY(i)
    const q = lerp3(a, c, u)
    q.y -= (1 - v) * drop
    p.setXYZ(i, q.x, q.y, q.z)
  }
  g.computeVertexNormals()
  b.add(g, mat, null, { uv: "keep", extra: (geo, i) => (1 - geo.attributes.uv.getY(i)) * 0.9 })
  g.dispose()
}
function sheetWall(b: Sink, mat: THREE.Material, a: THREE.Vector3, c: THREE.Vector3, h: number) {
  const g = new THREE.PlaneGeometry(1, 1, 8, 3)
  const p = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) {
    const u = uv.getX(i)
    const v = uv.getY(i)
    const q = lerp3(a, c, u)
    q.y = v * h
    p.setXYZ(i, q.x, q.y, q.z)
  }
  g.computeVertexNormals()
  b.add(g, mat, null, { uv: "keep", extra: (geo, i) => geo.attributes.uv.getY(i) * 0.25 })
  g.dispose()
}

type M = Record<string, THREE.Material>
export function crate(b: Sink, M: M, x: number, y: number, z: number, s = 1, ry = 0) {
  const f = new Frame(b, M4(x, y, z, ry))
  f.box(M.crate, 0, s / 2, 0, s, s, s)
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    f.box(M.crateDark, dx * s * 0.47, s / 2, dz * s * 0.47, s * 0.1, s * 1.01, s * 0.1)
  for (const yy of [0.05, 0.95]) {
    f.box(M.crateDark, 0, s * yy, s * 0.47, s * 1.01, s * 0.1, s * 0.1)
    f.box(M.crateDark, 0, s * yy, -s * 0.47, s * 1.01, s * 0.1, s * 0.1)
  }
}
export function barrel(b: Sink, M: M, x: number, y: number, z: number, r = 0.38, h = 1) {
  lathe(
    b,
    M.barrel,
    x,
    y,
    z,
    [
      [0, 0],
      [r * 0.82, 0],
      [r * 0.95, h * 0.25],
      [r, h * 0.5],
      [r * 0.95, h * 0.75],
      [r * 0.82, h],
      [0, h],
    ],
    16,
    { uv: "keep" }
  )
  for (const t of [0.12, 0.35, 0.65, 0.88]) {
    const rr = r * (t < 0.5 ? 0.82 + t * 0.72 : 0.82 + (1 - t) * 0.72) + 0.012
    b.add(
      G(`hoop${rr.toFixed(3)}`, () => new THREE.TorusGeometry(rr, 0.018, 4, 20)),
      M.iron,
      M4(x, y + h * t, z, 0, 1, 1, 1, Math.PI / 2),
      { uv: "keep" }
    )
  }
}
export function sack(b: Sink, M: M, rand: Rand, x: number, y: number, z: number, s = 0.6) {
  const f = new Frame(b, M4(x, y, z, rand(0, TAU)))
  f.sphere(rand.pick([M.sack, M.sackB]), 0, s * 0.42, 0, s * 0.45, s * 0.45, s * 0.38, 10)
  f.sphere(M.sack, 0, s * 0.88, 0, s * 0.12, s * 0.16, s * 0.12, 6)
}
export function pot(b: Sink, M: M, rand: Rand, x: number, y: number, z: number, s = 0.5) {
  lathe(
    b,
    rand.pick([M.pottery, M.potteryB]),
    x,
    y,
    z,
    [
      [0, 0],
      [s * 0.28, 0],
      [s * 0.5, s * 0.35],
      [s * 0.45, s * 0.72],
      [s * 0.2, s * 0.92],
      [s * 0.22, s],
    ],
    14,
    { uv: "keep" }
  )
}
function fruit(b: Sink, M: M, rand: Rand, x: number, y: number, z: number, s: number) {
  const g = new Frame(b, M4(x, y + s * 0.42, z))
  for (let i = 0; i < 5; i++) g.sphere(rand.pick([M.goodsRed, M.goodsGreen, M.goodsYellow]), rand(-s * 0.25, s * 0.25), rand(0, s * 0.1), rand(-s * 0.25, s * 0.25), s * 0.13, s * 0.13, s * 0.13, 8)
}
export function basket(b: Sink, M: M, rand: Rand, x: number, y: number, z: number, s = 0.5) {
  lathe(
    b,
    M.basket,
    x,
    y,
    z,
    [
      [0, 0],
      [s * 0.45, 0],
      [s * 0.55, s * 0.5],
      [s * 0.5, s * 0.52],
    ],
    14,
    { uv: "keep" }
  )
  fruit(b, M, rand, x, y, z, s)
}
export function lantern(b: Sink, M: M, x: number, y: number, z: number) {
  const f = new Frame(b, M4(x, y, z))
  f.box(M.iron, 0, 0.25, 0, 0.22, 0.04, 0.22)
  f.box(M.iron, 0, -0.05, 0, 0.2, 0.04, 0.2)
  f.box(M.flame, 0, 0.1, 0, 0.12, 0.22, 0.12)
  f.cyl(M.iron, 0, 0.27, 0, 0.15, 0.02, 0.15, 4)
}

const GOODS = ["pots", "baskets", "cloth", "sacks", "arms"] as const
// Chosen only by name, so `random` stalls keep the picks they had.
const NAMED_GOODS = ["jewels", "spices", "none"] as const
// A trader's stall: four poles, a pitched cloth roof, a ragged valance, a counter with goods, and stock behind.
function buildStall(
  ctx: BuildCtx,
  p: { w: number; d: number; cloth: string; goods: string; back: boolean; sides: boolean; frontHeight?: number; backRise?: number; sag: number; valance?: string; backCloth: string }
) {
  const { b, M, rand } = ctx
  const { w, d } = p
  const P = (lx: number, ly: number, lz: number) => V(lx, ly, lz)
  const cloth = ctx.mat(p.cloth)
  const val = p.valance ? ctx.mat(p.valance) : cloth
  const hf = p.frontHeight ?? rand(2.9, 3.4)
  const hb = hf + (p.backRise ?? rand(0.6, 1.3))
  const c = [P(-w / 2, hf, d / 2), P(w / 2, hf, d / 2), P(-w / 2, hb, -d / 2), P(w / 2, hb, -d / 2)]
  for (const q of c) beam(b, M.pole, [q.x, 0, q.z], [q.x + rand(-0.05, 0.05), q.y + 0.12, q.z + rand(-0.05, 0.05)], 0.07, 6, 0.06)
  beam(b, M.pole, c[0], c[1], 0.05, 5)
  beam(b, M.pole, c[2], c[3], 0.05, 5)
  const over = V(0, -0.28, 0.5)
  sheet(b, cloth, c[0].clone().add(over), c[1].clone().add(over), c[2], c[3], p.sag)
  valance(b, val, c[0].clone().add(over), c[1].clone().add(over), rand(0.5, 0.9))
  if (p.sides) {
    valance(b, val, c[2], c[0].clone().add(over), rand(0.3, 0.6))
    valance(b, val, c[1].clone().add(over), c[3], rand(0.3, 0.6))
  }
  if (p.back) sheetWall(b, ctx.mat(p.backCloth), c[2], c[3], hb)
  const F = new Frame(b, new THREE.Matrix4())
  F.box(M.table, 0, 0.92, d / 2 - 0.45, w - 0.4, 0.1, 0.8)
  for (const s of [-1, 1]) F.box(M.table, s * (w / 2 - 0.35), 0.45, d / 2 - 0.45, 0.1, 0.9, 0.7)
  F.box(M.clothDrab, 0, 0.6, d / 2 - 0.08, w - 0.5, 0.6, 0.03)
  const goods = p.goods === "random" ? rand.pick(GOODS) : p.goods
  for (let gx = -w / 2 + 0.6; goods !== "none" && gx < w / 2 - 0.4; gx += rand(0.55, 0.8)) {
    const zc = d / 2 - 0.45
    if (goods === "jewels") {
      // A shallow casket heaped with gold and stones.
      F.box(M.chest, gx, 1.02, zc, 0.4, 0.1, 0.28)
      for (let i = 0; i < 6; i++) F.sphere(rand.pick([M.coin, M.coin, M.goodsRed, M.goodsTeal]), gx + rand(-0.14, 0.14), 1.1, zc + rand(-0.08, 0.08), 0.035, 0.03, 0.035, 6)
    } else if (goods === "spices") {
      // Stoppered jars beside an open heap of chilli, saffron, paprika or herbs.
      pot(b, M, rand, gx - 0.12, 0.97, zc - 0.18, rand(0.18, 0.26))
      F.sphere(rand.pick([M.goodsRed, M.goodsYellow, M.gourd, M.goodsGreen]), gx + 0.12, 0.99, zc + 0.1, 0.15, 0.07, 0.15, 8)
    } else if (goods === "pots") pot(b, M, rand, gx, 0.97, zc, rand(0.3, 0.55))
    else if (goods === "baskets") basket(b, M, rand, gx, 0.97, zc, rand(0.35, 0.5))
    else if (goods === "cloth")
      F.geo(
        rand.pick([M.goodsRed, M.goodsTeal, M.goodsYellow, M.clothDrab, M.goodsGreen]),
        G("bolt", () => new THREE.CylinderGeometry(0.13, 0.13, 0.75, 10)),
        M4(gx, 1.1, zc + rand(-0.15, 0.15), rand(-0.3, 0.3), 1, 1, 1, 0, Math.PI / 2),
        { uv: "keep" }
      )
    else if (goods === "sacks") sack(b, M, rand, gx, 0.97, zc, rand(0.35, 0.5))
    else {
      F.box(M.iron, gx, 1.0, zc, 0.08, 0.08, 0.7, rand(-0.2, 0.2))
      F.geo(
        M.shield,
        G("shield", () => new THREE.CylinderGeometry(0.34, 0.34, 0.05, 16)),
        M4(gx, 1.3, d / 2 - 0.75, 0, 1, 1, 1, 1.2),
        { uv: "keep" }
      )
    }
  }
  // Stock stacked behind and beside the counter.
  const n = rand(2, 6)
  for (let i = 0; i < n; i++) {
    const x = rand(-w / 2 + 0.5, w / 2 - 0.5)
    const zz = rand(-d / 2 + 0.5, 0)
    const k = rand()
    if (k < 0.4) crate(b, M, x, 0, zz, rand(0.5, 0.8), rand(0, 1))
    else if (k < 0.7) barrel(b, M, x, 0, zz, rand(0.3, 0.4), rand(0.8, 1.1))
    else sack(b, M, rand, x, 0, zz, rand(0.5, 0.75))
  }
  if (rand() < 0.6) {
    beam(b, M.pole, [w / 2 - 0.2, 0, d / 2 + 0.1], [w / 2 - 0.2, hf + 1.8, d / 2 + 0.1], 0.05, 5)
    lantern(b, M, w / 2 - 0.2, hf + 0.6, d / 2 + 0.1)
  }
  ctx.footprint(0, 0, w / 2 + 0.6, d / 2 + 0.9)
}
export const stall = defineBuilder(
  z
    .object({
      w: size(20).default(5),
      d: size(20).default(3.6),
      cloth: matName,
      goods: z.enum(["random", ...GOODS, ...NAMED_GOODS]).default("random"),
      back: z.boolean().default(true),
      sides: z.boolean().default(true),
      frontHeight: size(10).optional(),
      backRise: num(0, 5).optional(),
      sag: num(0, 3).default(0.22),
      valance: matName.optional(),
      backCloth: matName.default("clothDrab"),
    })
    .strict(),
  buildStall
)

// A great awning sail, pitched from tall poles and guyed to the ground.
export const sail = defineBuilder(
  z
    .object({
      corners: z.tuple([vec3, vec3, vec3, vec3]),
      cloth: matName,
      sag: num(0, 5).default(0.8),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const c = p.corners.map((q) => V(...q))
    const cloth = ctx.mat(p.cloth)
    for (const q of c) {
      beam(b, M.pole, [q.x, 0, q.z], [q.x, q.y + 0.3, q.z], 0.09, 6, 0.07)
      b.add(
        G("knob", () => new THREE.SphereGeometry(1, 8, 6)),
        M.pole,
        M4(q.x, q.y + 0.35, q.z, 0, 0.12, 0.12, 0.12),
        { uv: "keep" }
      )
    }
    sheet(b, cloth, c[0], c[1], c[2], c[3], p.sag, 16, 12)
    valance(b, cloth, c[0], c[1], rand(1, 1.6))
    valance(b, cloth, c[1], c[3], rand(0.6, 1.1))
    valance(b, cloth, c[2], c[0], rand(0.6, 1.1))
    for (const q of c) {
      const a = rand(0, TAU)
      beam(b, M.rope, q, [q.x + Math.cos(a) * 2.5, 0, q.z + Math.sin(a) * 2.5], 0.012, 3)
    }
    for (const q of c) ctx.footprint(q.x, q.z, 0.6, 0.6)
  }
)

// A rack of spears and poleaxes, the forest of shafts that fills the painting's corners.
export const spearRack = defineBuilder(
  z
    .object({
      count: num(1, 30).default(10),
      length: size(8).default(3.4),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const F = new Frame(b, new THREE.Matrix4())
    const n = Math.floor(p.count)
    const w = n * 0.22
    for (const s of [-1, 1]) F.cyl(M.pole, (s * w) / 2, 0, 0, 0.06, 0.05, 1.6, 6)
    F.box(M.pole, 0, 1.45, 0, w + 0.3, 0.08, 0.08)
    for (let i = 0; i < n; i++) {
      const lx = -w / 2 + ((i + 0.5) * w) / n
      const lean = rand(0.18, 0.32)
      const l = p.length * rand(0.85, 1.1)
      const a = V(lx, 0, -0.45)
      const t = V(lx + rand(-0.1, 0.1), Math.cos(lean) * l, -0.45 + Math.sin(lean) * l)
      beam(b, M.pole, a, t, 0.025, 5)
      const dir = t.clone().sub(a).normalize()
      b.add(
        G("tip", () => new THREE.ConeGeometry(1, 1, 4)),
        M.steel,
        new THREE.Matrix4().compose(t.clone().addScaledVector(dir, 0.18), new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir), V(0.045, 0.4, 0.045)),
        { uv: "keep" }
      )
    }
    ctx.footprint(0, 0, w / 2 + 0.3, 0.8)
  }
)

// Tall poles lashed into a tripod, hung with a pennant.
export const standard = defineBuilder(
  z
    .object({
      height: size(30).default(9),
      pennant: matName.default("pennant"),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const h = p.height
    const top = V(0, h, 0)
    for (let i = 0; i < 3; i++) {
      const a = (i * TAU) / 3 + rand(0, 1)
      beam(b, M.pole, [Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3], top.clone().add(V(rand(-0.2, 0.2), rand(0, 1.5), rand(-0.2, 0.2))), 0.06, 5)
    }
    pennant(b, ctx.mat(p.pennant), M.pole, 0, h - 2.5, 0, rand(2.5, 4), 0.9, 3, rand(-1, 1))
    ctx.footprint(0, 0, 1.5, 1.5)
  }
)

// ── Props ──
export const crateProp = defineBuilder(z.object({ size: size(3).default(0.8), stack: z.boolean().default(false) }).strict(), (ctx, p) => {
  crate(ctx.b, ctx.M, 0, 0, 0, p.size)
  if (p.stack) crate(ctx.b, ctx.M, ctx.rand(-0.1, 0.1), p.size * 0.95, 0, p.size * ctx.rand(0.6, 0.8), ctx.rand(0, 1))
})
export const barrelProp = defineBuilder(z.object({ r: size(2).default(0.38), h: size(3).default(1) }).strict(), (ctx, p) => barrel(ctx.b, ctx.M, 0, 0, 0, p.r, p.h))
export const sackProp = defineBuilder(z.object({ size: size(3).default(0.6) }).strict(), (ctx, p) => sack(ctx.b, ctx.M, ctx.rand, 0, 0, 0, p.size))
export const potProp = defineBuilder(z.object({ size: size(3).default(0.5) }).strict(), (ctx, p) => pot(ctx.b, ctx.M, ctx.rand, 0, 0, 0, p.size))
export const basketProp = defineBuilder(z.object({ size: size(3).default(0.5) }).strict(), (ctx, p) => basket(ctx.b, ctx.M, ctx.rand, 0, 0, 0, p.size))
export const lanternProp = defineBuilder(z.object({ height: num(0, 20).default(0), post: z.boolean().default(false) }).strict(), (ctx, p) => {
  if (p.post) beam(ctx.b, ctx.M.pole, [0, 0, 0], [0, p.height + 0.3, 0], 0.06, 5)
  lantern(ctx.b, ctx.M, 0, p.height, 0)
})
// A carter's heap: a crate (often another on top), a barrel and a sack.
export const goodsPile = defineBuilder(z.object({}).strict(), (ctx) => {
  const { b, M, rand } = ctx
  crate(b, M, 0, 0, 0, rand(0.7, 1), rand(0, 1))
  if (rand() < 0.7) crate(b, M, rand(-0.1, 0.1), 0.8, 0, rand(0.5, 0.7), rand(0, 1))
  barrel(b, M, 1.1, 0, 0.4, 0.4, 1.05)
  sack(b, M, rand, -0.9, 0, 0.6, 0.7)
  ctx.footprint(0.1, 0.2, 1.6, 1)
})

// ── Town ──
// A timber-framed house that closes the plaza and throws the foreground into shade.
export const house = defineBuilder(
  z
    .object({
      w: size(40).default(8),
      d: size(40).default(9),
      h: size(60).default(12),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const { w, d, h } = p
    const F = new Frame(b, new THREE.Matrix4())
    F.box(rand.pick([M.plaster, M.plasterB]), 0, h / 2, 0, w, h, d)
    F.box(M.dark, 0, 0.6, 0, w + 0.2, 1.2, d + 0.2)
    const n = Math.max(2, Math.round(w / 1.8))
    for (let i = 0; i <= n; i++) F.box(M.timber, -w / 2 + (i * w) / n, h / 2, d / 2 + 0.06, 0.2, h, 0.12)
    for (const y of [1.2, h * 0.52, h - 0.1]) F.box(M.timber, 0, y, d / 2 + 0.06, w + 0.1, 0.2, 0.12)
    for (let i = 0; i < n; i++) {
      const cx = -w / 2 + ((i + 0.5) * w) / n
      for (const y of [h * 0.3, h * 0.75]) if (h > 7 || y < h * 0.5) F.box(M.void, cx, y, d / 2 + 0.04, 0.7, 1.1, 0.1)
    }
    F.shape(
      M.roof,
      [
        [-d / 2 - 0.7, 0],
        [d / 2 + 0.7, 0],
        [0, d * 0.5],
      ],
      w + 0.8,
      M4(-(w + 0.8) / 2, h, 0, Math.PI / 2)
    )
    if (rand() < 0.5) F.box(M.dark, w * 0.25, h + d * 0.3, 0, 0.8, 2.2, 0.8)
    ctx.footprint(0, 0, w / 2 + 0.5, d / 2 + 0.5)
  }
)

// The outer town: plain blocks of houses along lanes, fading into the haze, with a few landmark towers above the roofs.
export const farTown = defineBuilder(
  z
    .object({
      area: z.tuple([coord, coord, coord, coord]).default([-230, -20, 230, 300]),
      spacing: z.tuple([size(60), size(60)]).default([14, 13]),
      center: z.tuple([coord, coord]).default([0, 60]),
      radius: size(1000).default(260),
      exclude: z
        .array(z.tuple([coord, coord, coord, coord]))
        .max(8)
        .default([]),
      skip: num(0, 1).default(0.18),
      height: z.tuple([size(60), size(60)]).default([7, 15]),
      landmarks: z
        .array(z.tuple([coord, coord, size(120)]))
        .max(12)
        .default([]),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const [x0, z0, x1, z1] = p.area
    const [cx, cz] = p.center
    const excluded = (x: number, zz: number) => p.exclude.some(([a, c, d, e]) => x > Math.min(a, d) && x < Math.max(a, d) && zz > Math.min(c, e) && zz < Math.max(c, e))
    let count = 0
    for (let x = x0; x <= x1; x += p.spacing[0])
      for (let zz = z0; zz <= z1; zz += p.spacing[1]) {
        if (excluded(x, zz) || rand() < p.skip) continue
        const d = Math.hypot(x - cx, zz - cz)
        if (d > p.radius + rand(-40, 20)) continue
        if (++count > 1200) return
        const rows = Math.abs(x - cx) > Math.abs(zz - cz) ? 1 : 0
        const w = rand(7, 11)
        const dd = rand(7, 10)
        const h = rand(p.height[0], p.height[1])
        const F = new Frame(b, M4(x + rand(-2, 2), 0, zz + rand(-2, 2), rows ? Math.PI / 2 : 0))
        F.box(rand.pick([M.plaster, M.plasterB, M.far]), 0, h / 2, 0, w, h, dd)
        F.shape(
          M.roofFar,
          [
            [-dd / 2 - 0.5, 0],
            [dd / 2 + 0.5, 0],
            [0, dd * 0.45],
          ],
          w + 0.6,
          M4(-(w + 0.6) / 2, h, 0, Math.PI / 2)
        )
        if (rand() < 0.4) F.box(M.dark, w * 0.3, h + dd * 0.3, 0, 0.7, 2, 0.7)
      }
    for (const [x, zz, h] of p.landmarks) {
      box(b, M.far, x, h / 2, zz, 8, h, 8)
      cyl(b, M.roofFar, x, h, zz, 6.2, 0.2, 9, 4, { uv: "planar", ry: Math.PI / 4 })
    }
  }
)

// ── Harvest festival ──
// A line of triangular flags on a sagging cord, colours cycling through `flags`.
export const bunting = defineBuilder(
  z
    .object({
      from: vec3,
      to: vec3,
      sag: num(0, 10).default(1.2),
      spacing: num(0.2, 5).default(0.55),
      flags: z.array(matName).min(1).max(6).default(["flagOrange", "flagGreen", "flagCream"]),
    })
    .strict(),
  (ctx, p) => {
    const { b, M } = ctx
    const A = V(...p.from)
    const C = V(...p.to)
    const len = A.distanceTo(C)
    const n = Math.min(400, Math.floor(len / p.spacing))
    const at = (t: number) => {
      const q = A.clone().lerp(C, t)
      q.y -= Math.sin(Math.PI * t) * p.sag
      return q
    }
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 16; i++) pts.push(at(i / 16))
    const cord = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.012, 3)
    b.add(cord, M.rope, null, { uv: "keep" })
    cord.dispose()
    const flags = p.flags.map((f) => ctx.mat(f))
    for (let i = 1; i < n; i++) {
      const a = at(i / n)
      const q = at((i + 0.7) / n)
      const g = new THREE.BufferGeometry()
      g.setAttribute("position", new THREE.Float32BufferAttribute([a.x, a.y, a.z, q.x, q.y, q.z, (a.x + q.x) / 2, a.y - 0.42, (a.z + q.z) / 2], 3))
      g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 1, 1, 0.5, 0], 2))
      g.computeVertexNormals()
      b.add(g, flags[i % flags.length], null, { uv: "keep", extra: (_, k) => (k === 2 ? 0.9 : 0) })
      g.dispose()
    }
  }
)
export const sheaf = defineBuilder(z.object({ size: size(3).default(1), pair: z.boolean().default(false) }).strict(), (ctx, p) => {
  const one = (x: number, zz: number, s: number) => {
    lathe(
      ctx.b,
      ctx.M.straw,
      x,
      0,
      zz,
      [
        [0.18 * s, 0],
        [0.12 * s, 0.45 * s],
        [0.08 * s, 0.6 * s],
        [0.22 * s, 1.05 * s],
        [0.05 * s, 1.15 * s],
      ],
      12,
      { uv: "keep" }
    )
    ctx.b.add(
      G("band", () => new THREE.TorusGeometry(0.09, 0.02, 4, 12)),
      ctx.M.goodsRed,
      M4(x, 0.56 * s, zz, 0, s, s, s, Math.PI / 2),
      { uv: "keep" }
    )
  }
  one(0, 0, p.size)
  if (p.pair) one(0.5, 0.3, p.size * ctx.rand(0.85, 1))
})
export const gourds = defineBuilder(z.object({ count: num(1, 30).default(7) }).strict(), (ctx, p) => {
  const F = new Frame(ctx.b, new THREE.Matrix4())
  const { M, rand } = ctx
  for (let i = 0; i < Math.floor(p.count); i++) {
    const r = rand(0.12, 0.24)
    F.sphere(rand.pick([M.gourd, M.gourd, M.goodsYellow, M.goodsGreen]), rand(-0.5, 0.5), r * 0.8, rand(-0.4, 0.4), r, r * 0.85, r, 10)
  }
})
