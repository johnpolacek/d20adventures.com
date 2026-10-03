import * as THREE from "three"
import { z } from "zod"
import { beam, box, cyl, DEG, Frame, G, lathe, M4, type Sink, TAU, V } from "../kit/geometry"
import { barrel, crate, sack } from "./market"
import { banner, pennant } from "./parts"
import { defineBuilder, matName, num, size, vec2, vec3 } from "./types"

// A gate checkpoint: barrier, the sergeant's table, a brazier, the watch's awning, a searched cart and queue ropes.

// A timber barrier along x, centred on the object: trestles every couple of metres, two rails, crest plaques.
export const barrier = defineBuilder(
  z
    .object({
      length: size(60),
      plaques: matName.default("bannerCity"),
    })
    .strict(),
  (ctx, p) => {
    const { b, M } = ctx
    const x0 = -p.length / 2
    const x1 = p.length / 2
    const step = p.length / Math.max(1, Math.round(p.length / 2.2))
    for (let x = x0; x <= x1 + 0.01; x += step) for (const s of [-1, 1]) beam(b, M.pole, [x + s * 0.35, 0, 0], [x, 1.15, 0], 0.05, 5)
    box(b, M.table, 0, 1.1, 0, p.length + 0.3, 0.14, 0.14)
    box(b, M.table, 0, 0.6, 0, p.length + 0.2, 0.1, 0.1)
    const plaque = ctx.mat(p.plaques)
    for (let x = x0 + 0.6; x < x1; x += 1.1) box(b, plaque, x, 1.1, 0.075, 0.5, 0.1, 0.01)
    ctx.footprint(0, 0, p.length / 2 + 0.2, 0.5)
  }
)

function rope(b: Sink, mat: THREE.Material, a: [number, number, number], c: [number, number, number], sag = 0.14) {
  const A = V(...a)
  const C = V(...c)
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 8; i++) {
    const t = i / 8
    const q = A.clone().lerp(C, t)
    q.y -= Math.sin(Math.PI * t) * sag
    pts.push(q)
  }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.034, 5)
  b.add(g, mat, null, { uv: "keep" })
  g.dispose()
}
// Brass-knobbed stanchions every few metres with a sagging rope between them.
export const ropeLine = defineBuilder(
  z
    .object({
      from: vec2,
      to: vec2,
      spacing: num(0.5, 10).default(2.4),
    })
    .strict(),
  (ctx, p) => {
    const { b, M } = ctx
    const [x0, z0] = p.from
    const [x1, z1] = p.to
    const n = Math.min(200, Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / p.spacing)))
    const pts: [number, number][] = []
    for (let i = 0; i <= n; i++) pts.push([x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n])
    for (const [x, zz] of pts) {
      cyl(b, M.pole, x, 0, zz, 0.055, 0.045, 1.02, 6, { uv: "keep" })
      b.add(
        G("knob", () => new THREE.SphereGeometry(1, 8, 6)),
        M.bronze,
        M4(x, 1.05, zz, 0, 0.06, 0.06, 0.06),
        { uv: "keep" }
      )
      cyl(b, M.iron, x, 0, zz, 0.16, 0.14, 0.05, 8, { uv: "keep" })
    }
    for (let i = 0; i < pts.length - 1; i++) rope(b, M.queueRope, [pts[i][0], 0.98, pts[i][1]], [pts[i + 1][0], 0.98, pts[i + 1][1]])
  }
)

export const brazier = defineBuilder(z.object({}).strict(), (ctx) => {
  const { b, M, rand } = ctx
  for (let i = 0; i < 3; i++) {
    const a = (i * TAU) / 3
    beam(b, M.iron, [Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35], [0, 0.75, 0], 0.03, 5)
  }
  lathe(
    b,
    M.iron,
    0,
    0.72,
    0,
    [
      [0, 0],
      [0.32, 0.06],
      [0.42, 0.3],
      [0.38, 0.32],
    ],
    14,
    { uv: "keep" }
  )
  lathe(
    b,
    M.fire,
    0,
    0.92,
    0,
    [
      [0, 0],
      [0.2, 0.04],
      [0.15, 0.24],
      [0.05, 0.42],
      [0, 0.46],
    ],
    10,
    { uv: "keep" }
  )
  for (let i = 0; i < 7; i++)
    b.add(
      G("ember", () => new THREE.IcosahedronGeometry(1, 0)),
      M.coal,
      M4(rand(-0.2, 0.2), 0.98, rand(-0.2, 0.2), rand(0, 3), 0.09, 0.06, 0.09),
      { uv: "keep" }
    )
  ctx.circle(0, 0, 0.6)
})

// The sergeant's table: an open ledger without a word written on it, scales, ink, the strongbox and its coins.
export const ledgerTable = defineBuilder(z.object({ cloth: matName.default("bannerCity") }).strict(), (ctx, p) => {
  const { b, M, rand } = ctx
  const F = new Frame(b, new THREE.Matrix4())
  F.box(M.table, 0, 0.9, 0, 2.4, 0.08, 0.8)
  for (const [dx, dz] of [
    [-1.1, -0.33],
    [1.1, -0.33],
    [-1.1, 0.33],
    [1.1, 0.33],
  ])
    F.box(M.table, dx, 0.45, dz, 0.08, 0.9, 0.08)
  F.box(ctx.mat(p.cloth), 0, 0.82, 0.41, 2.42, 0.16, 0.01)
  for (const s of [-1, 1]) F.box(M.parchment, -0.55 + s * 0.19, 0.96, 0.05, 0.36, 0.02, 0.48, 0, 0, s * 0.06)
  F.box(M.leather, -0.55, 0.945, 0.05, 0.78, 0.02, 0.52)
  F.cyl(M.iron, -0.05, 0.94, -0.12, 0.05, 0.04, 0.07, 8)
  F.box(M.parchment, -0.03, 1.05, -0.1, 0.01, 0.22, 0.03, 0.3, 0, -0.4)
  F.cyl(M.bronze, 0.35, 0.94, -0.05, 0.08, 0.03, 0.04, 10)
  F.cyl(M.bronze, 0.35, 0.98, -0.05, 0.012, 0.012, 0.34, 6)
  F.box(M.bronze, 0.35, 1.32, -0.05, 0.52, 0.02, 0.02)
  for (const s of [-1, 1]) {
    F.cyl(M.bronze, 0.35 + s * 0.25, 1.14, -0.05, 0.09, 0.1, 0.03, 12)
    for (const t of [-1, 1]) beam(b, M.bronze, V(0.35 + s * 0.25 + t * 0.07, 1.16, -0.05), V(0.35 + s * 0.25, 1.32, -0.05), 0.004, 3)
  }
  F.box(M.chest, 0.85, 1.08, 0.05, 0.5, 0.3, 0.34)
  for (const t of [-0.18, 0, 0.18]) F.box(M.iron, 0.85 + t, 1.08, 0.05, 0.04, 0.31, 0.35)
  F.box(M.chest, 0.85, 1.3, -0.16, 0.5, 0.32, 0.04, -0.35)
  for (let i = 0; i < 26; i++) F.cyl(M.coin, 0.85 + rand(-0.18, 0.18), 1.2 + rand(0, 0.05), 0.05 + rand(-0.12, 0.12), 0.03, 0.03, 0.006, 8)
  for (let i = 0; i < 6; i++) F.cyl(M.coin, rand(-0.2, 0.1), 0.945 + i * 0.007, 0.22, 0.03, 0.03, 0.006, 8)
  ctx.footprint(0, 0, 1.4, 0.6)
})

// An old handcart pulled aside for searching; its load half unpacked on the paving.
export const cart = defineBuilder(z.object({}).strict(), (ctx) => {
  const { b, M, rand } = ctx
  const F = new Frame(b, new THREE.Matrix4())
  F.box(M.table, 0, 0.82, 0, 1.5, 0.08, 2.6)
  for (const s of [-1, 1]) {
    F.box(M.table, s * 0.75, 1.02, 0, 0.06, 0.36, 2.6)
    F.geo(
      M.table,
      G("wheel", () => new THREE.CylinderGeometry(0.62, 0.62, 0.08, 18)),
      M4(s * 0.82, 0.62, 0.2, 0, 1, 1, 1, 0, Math.PI / 2),
      { uv: "keep" }
    )
    F.geo(
      M.iron,
      G("tyre", () => new THREE.TorusGeometry(0.62, 0.03, 4, 24)),
      M4(s * 0.86, 0.62, 0.2, Math.PI / 2),
      { uv: "keep" }
    )
  }
  for (const s of [-1, 1]) beam(b, M.table, V(s * 0.45, 0.82, 1.3), V(s * 0.4, 0.15, 3.1), 0.05, 5)
  crate(b, M, -0.35, 0.86, -0.6, 0.6)
  crate(b, M, 0.35, 0.86, -0.7, 0.55, 0.2)
  sack(b, M, rand, 0, 0.86, 0.4, 0.7)
  barrel(b, M, 0.3, 0.86, 0.7, 0.3, 0.7)
  crate(b, M, 1.3, 0, -0.4, 0.6, 0.5)
  sack(b, M, rand, 1.2, 0, 0.5, 0.6)
  b.add(
    G("bolt", () => new THREE.CylinderGeometry(0.13, 0.13, 0.75, 10)),
    M.goodsRed,
    M4(1.5, 0.14, -0.1, 0.4, 1, 1, 1, 0, Math.PI / 2),
    { uv: "keep" }
  )
  ctx.footprint(0.3, 0.5, 1.6, 2.2)
})

// A cloth awning between four corner poles (corners in the object's frame: front-left, front-right, back-left, back-right).
export const awning = defineBuilder(
  z
    .object({
      corners: z.tuple([vec3, vec3, vec3, vec3]),
      cloth: matName.default("tentNavy"),
      sag: num(0, 3).default(0.18),
    })
    .strict(),
  (ctx, p) => {
    const { b, M } = ctx
    const corners = p.corners.map((c) => V(...c))
    for (const c of corners) beam(b, M.pole, [c.x, 0, c.z], [c.x, c.y + 0.1, c.z], 0.06, 6)
    const g = new THREE.PlaneGeometry(1, 1, 10, 6)
    const pa = g.attributes.position
    const uv = g.attributes.uv
    for (let i = 0; i < pa.count; i++) {
      const u = uv.getX(i)
      const v = uv.getY(i)
      const q = corners[0].clone().lerp(corners[1], u).lerp(corners[2].clone().lerp(corners[3], u), v)
      q.y -= Math.sin(Math.PI * u) * p.sag
      pa.setXYZ(i, q.x, q.y, q.z)
    }
    g.computeVertexNormals()
    b.add(g, ctx.mat(p.cloth), null, { uv: "keep", extra: (geo, i) => Math.sin(Math.PI * geo.attributes.uv.getX(i)) * 0.3 })
    g.dispose()
  }
)

// ── Dressing ──
export const bannerPole = defineBuilder(
  z
    .object({
      height: size(40).default(6.6),
      banner: matName.default("bannerCity"),
      w: size(10).default(1.1),
      h: size(40).default(3.4),
    })
    .strict(),
  (ctx, p) => {
    beam(ctx.b, ctx.M.pole, [0, 0, 0], [0, p.height, 0], 0.07, 6)
    banner(ctx.b, ctx.mat(p.banner), 0, p.height - 0.4, 0.15, p.w, p.h, 0, ctx.M.iron)
  }
)
export const bannerHanging = defineBuilder(
  z
    .object({
      w: size(20),
      h: size(80),
      material: matName,
      rod: z.boolean().default(true),
    })
    .strict(),
  (ctx, p) => banner(ctx.b, ctx.mat(p.material), 0, 0, 0, p.w, p.h, 0, p.rod ? ctx.M.iron : null)
)
export const pennantPole = defineBuilder(
  z
    .object({
      length: size(30).default(6),
      h: size(10).default(1.6),
      pole: size(30).default(6),
      dir: num(-360, 360).default(23),
      material: matName.default("pennant"),
      poleMaterial: matName.default("iron"),
    })
    .strict(),
  (ctx, p) => pennant(ctx.b, ctx.mat(p.material), ctx.mat(p.poleMaterial), 0, 0, 0, p.length, p.h, p.pole, p.dir * DEG)
)
