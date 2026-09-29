import * as THREE from "three"
import { z } from "zod"
import { archOutline, arcPts, beam, box, cyl, DEG, Frame, lathe, M4, type Sink, shape, TAU } from "../kit/geometry"
import { band, banner, cone, corbels, merlons, opening, pennant, spike } from "./parts"
import { coord, defineBuilder, matName, num, size } from "./types"

// Fortifications, ported from the Kordavos gate: everything is authored in metres, facing +z (the field side) in the
// object's own frame. `at` and `yaw` place it in the set.

function pinnacle(ctx: { b: Sink; M: Record<string, THREE.Material> }, x: number, y: number, z: number, h = 7, w = 1) {
  const { b, M } = ctx
  box(b, M.trim, x, y + h * 0.4, z, w, h * 0.8, w)
  box(b, M.trimB, x, y + h * 0.8, z, w + 0.3, 0.3, w + 0.3)
  b.add(cone(4), M.roof, M4(x, y + h * 0.8 + h * 0.15, z, Math.PI / 4, w * 0.78, h * 0.3, w * 0.78), { uv: "keep", flat: true })
  spike(b, M.iron, x, y + h * 0.95, z, h * 0.35, 0.06)
}

// ── A drum tower past 100 m: plinth, ribbed shaft, hoarding, upper drum, crown of pinnacles and a domed lantern ──
export const drumTower = defineBuilder(
  z
    .object({
      r: size(40).default(13),
      side: z.enum(["left", "right"]).default("left"),
      bannerA: matName.default("banner"),
      bannerB: matName.default("bannerRust"),
      pennant: matName.default("pennant"),
      footprint: num(0, 20).default(3),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const side = p.side === "left" ? -1 : 1
    const r = p.r
    const S = M.stoneRed
    cyl(b, M.dark, 0, -1, 0, r + 2.3, r + 0.5, 11, 72)
    band(b, M.trim, 0, 0, 9.6, r + 0.4, 1.3, 0.6)
    cyl(b, S, 0, 10, 0, r, r, 47.5, 72, { open: true })
    const ribs = 14
    for (let k = 0; k < ribs; k++) {
      const a = (k * TAU) / ribs + 0.11
      box(b, M.trim, Math.sin(a) * (r + 0.3), 33.5, Math.cos(a) * (r + 0.3), 1.5, 47, 1, a)
      const aw = a + TAU / ribs / 2
      if (Math.cos(aw - side * 0.5) < -0.3) continue
      for (const y of [15, 24.5, 37, 46]) opening(b, M.void, M.trim, M4(Math.sin(aw) * (r + 0.05), y, Math.cos(aw) * (r + 0.05), aw), 0.8, 4.6, false, 0.6, 0.34)
    }
    for (const y of [31.5, 55]) band(b, M.trim, 0, 0, y, r, 1.2, 0.55)
    corbels(b, M.trim, 0, 0, 60.4, r + 0.3, 56, 1.6)
    cyl(b, M.dark, 0, 60.2, 0, r + 1.6, r + 1.6, 0.25, 72)
    cyl(b, S, 0, 60.2, 0, r + 1.6, r + 1.6, 3.4, 72, { open: true })
    band(b, M.trim, 0, 0, 60, r + 1.5, 0.7, 0.3)
    merlons(b, rand, S, 0, 0, 63.6, r + 1.6, 30, 1.8, 0.55, 0.9, M.iron)
    // Timber hoarding wraps the field-facing half of the upper gallery.
    const arcStart = side < 0 ? -1.9 : -0.35
    const arc = 2.25
    cyl(b, M.wood, 0, 60.4, 0, r + 2.25, r + 2.25, 3.1, 60, { open: true, start: arcStart, arc })
    cyl(b, M.roof, 0, 63.4, 0, r + 2.9, r + 1, 2.6, 60, { open: true, start: arcStart, arc })
    for (let k = 0; k <= 13; k++) {
      const a = arcStart + (arc * k) / 13
      const px = Math.sin(a)
      const pz = Math.cos(a)
      beam(b, M.wood, [px * (r + 2.3), 58.8, pz * (r + 2.3)], [px * (r + 2.3), 63.9, pz * (r + 2.3)], 0.17, 5)
      beam(b, M.wood, [px * (r + 0.2), 57, pz * (r + 0.2)], [px * (r + 2.3), 60.4, pz * (r + 2.3)], 0.15, 5)
    }
    // Upper drum, set back behind the gallery, with tall round-headed windows.
    const r2 = r - 2.4
    cyl(b, S, 0, 63, 0, r2, r2, 24, 64, { open: true })
    for (let k = 0; k < 10; k++) {
      const a = (k * TAU) / 10 + 0.2
      box(b, M.trim, Math.sin(a) * (r2 + 0.25), 74.5, Math.cos(a) * (r2 + 0.25), 1.2, 23, 0.8, a)
      const aw = a + TAU / 20
      if (Math.cos(aw - side * 0.5) < -0.4) continue
      opening(b, M.void, M.trim, M4(Math.sin(aw) * (r2 + 0.05), 67, Math.cos(aw) * (r2 + 0.05), aw), 1.7, 9, false, 0.9, 0.5)
      opening(b, M.void, M.trim, M4(Math.sin(aw) * (r2 + 0.05), 79.4, Math.cos(aw) * (r2 + 0.05), aw), 1.1, 3.2, false, 0.6, 0.35)
    }
    band(b, M.trim, 0, 0, 77.5, r2, 0.8, 0.45)
    corbels(b, M.trim, 0, 0, 87.2, r2 + 0.3, 44, 1.5)
    cyl(b, M.dark, 0, 86.9, 0, r2 + 1.5, r2 + 1.5, 0.25, 64)
    cyl(b, S, 0, 86.9, 0, r2 + 1.5, r2 + 1.5, 2.7, 64, { open: true })
    merlons(b, rand, S, 0, 0, 89.6, r2 + 1.5, 24, 1.7, 0.55, 0.8, M.iron)
    // A crown of pinnacles around a domed lantern.
    for (let k = 0; k < 8; k++) {
      const a = (k * TAU) / 8 + TAU / 16
      pinnacle(ctx, Math.sin(a) * (r2 + 0.9), 89.6, Math.cos(a) * (r2 + 0.9), rand(7, 9.5), 1.1)
    }
    cyl(b, S, 0, 86.9, 0, 3.8, 3.8, 10.5, 24)
    for (let k = 0; k < 6; k++) {
      const a = (k * TAU) / 6
      opening(b, M.void, M.trim, M4(Math.sin(a) * 3.85, 90, Math.cos(a) * 3.85, a), 0.8, 3.6, false, 0.4, 0.25)
    }
    band(b, M.trim, 0, 0, 97.2, 3.8, 0.7, 0.45, 24)
    lathe(
      b,
      M.roof,
      0,
      97.9,
      0,
      [
        [4.2, 0],
        [4.3, 0.6],
        [3.6, 2.6],
        [2.2, 4.4],
        [0.9, 5.6],
        [0.35, 6.6],
        [0, 6.8],
      ],
      24
    )
    beam(b, M.iron, [0, 104, 0], [0, 113, 0], 0.12, 6, 0.05)
    pennant(b, ctx.mat(p.pennant), M.iron, 0, 105, 0, 10, 2.4, 7, side < 0 ? 0.5 : -0.1)
    // Bartizans cling to the upper parapet.
    for (let k = 0; k < 3; k++) {
      const a = side * -0.45 + (k - 1) * 1.3
      const bx = Math.sin(a) * (r2 + 1.7)
      const bz = Math.cos(a) * (r2 + 1.7)
      cyl(b, M.trim, bx, 78, bz, 0.3, 2.3, 3.5, 20)
      cyl(b, S, bx, 81.5, bz, 2.3, 2.3, 8, 24)
      merlons(b, rand, S, bx, bz, 89.5, 2.35, 8, 1.1, 0.5, 0.5)
      lathe(
        b,
        M.roof,
        bx,
        90.1,
        bz,
        [
          [2.5, 0],
          [2.3, 1.2],
          [1.3, 3],
          [0.4, 4.4],
          [0, 5],
        ],
        16
      )
      spike(b, M.iron, bx, 95, bz, 3, 0.08)
    }
    // Both cultures hang together on every tower.
    const a = side * -0.4
    banner(b, ctx.mat(p.bannerA), Math.sin(a) * (r + 1.1), 53, Math.cos(a) * (r + 1.1), 6, 36, a, M.iron)
    const a2 = side * 0.55
    banner(b, ctx.mat(p.bannerB), Math.sin(a2) * (r + 1.1), 52, Math.cos(a2) * (r + 1.1), 4, 24, a2, M.iron)
    ctx.anchor("lookout", Math.sin(side * -0.2) * (r + 1), 63.6, Math.cos(side * -0.2) * (r + 1))
    ctx.anchor("lookout", Math.sin(side * 0.3) * (r + 1), 63.6, Math.cos(side * 0.3) * (r + 1))
    ctx.anchor("lookout", 0, 89.6, r2 + 0.6)
    if (p.footprint > 0) ctx.circle(0, 0, r + p.footprint)
  }
)

// ── The gatehouse: a stepped portal of four orders, keystone mask, sun medallion, warden kings and a central keep ──
export const gatehouse = defineBuilder(
  z
    .object({
      halfWidth: size(80).default(22),
      depth: size(80).default(28),
      top: size(150).default(64),
      opening: size(40).default(13),
      spring: size(80).default(25),
      orders: z.number().int().min(0).max(6).default(4),
      orderWidth: size(5).default(1.6),
      orderDepth: size(5).default(1.7),
      keystone: z.boolean().default(true),
      medallion: z.boolean().default(true),
      statues: z.boolean().default(true),
      portcullis: z.boolean().default(true),
      doors: z.boolean().default(true),
      lamp: z.boolean().default(true),
      keep: z.boolean().default(true),
      banner: matName.default("bannerCity"),
      pennant: matName.default("pennant"),
      footprintTo: coord.default(7.5),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const W = p.halfWidth
    const D = p.depth
    const T = p.top
    const R = p.opening
    const SP = p.spring
    const S = M.stone
    const hole: [number, number][] = [[R, -0.5], ...arcPts(0, SP, R, 0, Math.PI, 48), [-R, -0.5]]
    shape(
      b,
      S,
      [
        [-W, -1],
        [W, -1],
        [W, T],
        [-W, T],
      ],
      D,
      M4(0, 0, -D),
      0,
      [hole]
    )
    // Orders of the portal step forward as they widen; each is cut into voussoirs.
    for (let k = 0; k < p.orders; k++) {
      const r0 = R + k * p.orderWidth
      const r1 = r0 + p.orderWidth
      const zf = p.orderDepth * (k + 1)
      const mat = k % 2 ? M.trim : M.trimB
      const n = 23 + k * 2
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI + 0.003
        const a1 = ((i + 1) / n) * Math.PI - 0.003
        shape(
          b,
          mat,
          [
            [Math.cos(a0) * r0, SP + Math.sin(a0) * r0],
            [Math.cos(a0) * r1, SP + Math.sin(a0) * r1],
            [Math.cos(a1) * r1, SP + Math.sin(a1) * r1],
            [Math.cos(a1) * r0, SP + Math.sin(a1) * r0],
          ],
          zf,
          M4(0, 0, 0),
          0.05
        )
      }
      for (const s of [-1, 1]) {
        for (let y = 0; y < SP - 0.1; y += 1.25) box(b, mat, s * (r0 + p.orderWidth / 2), y + 0.62, zf / 2, p.orderWidth - 0.06, 1.19, zf, 0)
        box(b, M.trimB, s * (r0 + p.orderWidth / 2), SP - 0.3, zf / 2, p.orderWidth + 0.3, 0.6, zf + 0.3)
        // Engaged shafts with cushion capitals at each step.
        cyl(b, M.trimB, s * r1, 0, zf - 0.1, 0.7, 0.7, 1.3, 16)
        cyl(b, M.trim, s * r1, 1.3, zf - 0.1, 0.5, 0.5, SP - 2.8, 16)
        cyl(b, M.trimB, s * r1, SP - 1.5, zf - 0.1, 0.55, 1.05, 1.5, 16)
      }
      b.add(new THREE.TorusGeometry(r1, 0.45, 8, 56, Math.PI), M.trim, M4(0, SP, zf - 0.1), { uv: "keep" })
    }
    // The frontispiece slab frames the outermost order.
    const zOut = p.orderDepth * p.orders
    const rOut = R + p.orders * p.orderWidth
    const top = SP + rOut + 5.5
    shape(
      b,
      S,
      [
        [-W, -1],
        [W, -1],
        [W, top],
        [-W, top],
      ],
      Math.max(0.5, zOut),
      M4(0, 0, 0),
      0,
      [[[rOut, -0.5], ...arcPts(0, SP, rOut, 0, Math.PI, 48), [-rOut, -0.5]]]
    )
    for (const s of [-1, 1]) for (let y = 3; y < top - 2; y += 9) box(b, M.trim, s * (W - 0.8), y + 3.5, zOut + 0.3, 1.6, 7, 0.8)
    for (const s of [-1, 1]) banner(b, ctx.mat(p.banner), s * (rOut + 1.25), top - 1.2, zOut + 1.1, 2.3, 30, 0, M.iron)
    if (p.keystone) {
      // Keystone mask: a crowned warden's face gazes down on all who enter.
      const k = new Frame(b, M4(0, SP + rOut - 0.8, zOut + 0.2))
      k.shape(
        M.trimB,
        [
          [-2.3, -2.6],
          [2.3, -2.6],
          [3.1, 4],
          [-3.1, 4],
        ],
        2,
        M4(0, 0, -0.6),
        0.1
      )
      k.sphere(M.carve, 0, 1.1, 1.6, 1.6, 1.9, 0.9, 18)
      k.box(M.carve, 0, 1.8, 2.25, 2.7, 0.4, 0.55)
      for (const s of [-1, 1]) {
        k.sphere(M.void, s * 0.65, 1.25, 2.25, 0.32, 0.2, 0.12)
        k.sphere(M.carve, s * 1.7, 1.55, 1.5, 0.4, 0.95, 0.45)
      }
      k.box(M.carve, 0, 0.7, 2.4, 0.45, 1.2, 0.55, 0, 0.25)
      k.sphere(M.void, 0, -0.15, 2.2, 0.6, 0.26, 0.2)
      k.box(M.bronze, 0, 3.6, 1.5, 3.5, 0.55, 1)
      for (let i = -2; i <= 2; i++) spike(b, M.bronze, i * 0.72, SP + rOut + 2.9, zOut + 1.7, 1.5 - Math.abs(i) * 0.25, 0.18)
    }
    if (p.lamp) {
      // Chains and a hanging iron lamp under the inner arch.
      for (const s of [-1, 1])
        for (let y = 0; y < 8; y += 0.5) {
          const l = new THREE.TorusGeometry(0.18, 0.05, 5, 10)
          b.add(l, M.iron, M4(s * 1.4 * (1 - y / 10), SP + R - 0.3 - y, 1, (Math.round(y * 2) % 2) * (Math.PI / 2)), { uv: "keep" })
        }
      const lamp = new Frame(b, M4(0, SP + R - 9.4, 1))
      lamp.lathe(
        M.iron,
        0,
        0,
        0,
        [
          [0, 0],
          [1, 0.3],
          [1.3, 1.3],
          [0.9, 2],
          [0.2, 2.3],
          [0, 2.5],
        ],
        12
      )
      lamp.lathe(
        M.flame,
        0,
        0.5,
        0,
        [
          [0, 0],
          [0.6, 0.1],
          [0.65, 1],
          [0, 1.3],
        ],
        10
      )
    }
    if (p.portcullis) {
      // Portcullis, raised: only its teeth show beneath the vault.
      for (let x = -R + 0.6; x < R; x += 0.8) {
        const t = SP + Math.sqrt(Math.max(0, R * R - x * x))
        if (t < SP + 1) continue
        box(b, M.iron, x, SP + 0.4 + (t - SP) / 2, -2.4, 0.18, t - SP, 0.24)
        b.add(cone(4), M.iron, M4(x, SP - 0.2, -2.4, 0, 0.16, 1.5, 0.16, Math.PI), { uv: "keep" })
      }
      for (let y = SP + 1.3; y < SP + R; y += 1.4) {
        const hw = Math.sqrt(Math.max(0, R * R - (y - SP) ** 2)) - 0.2
        if (hw > 0.5) box(b, M.iron, 0, y, -2.4, hw * 2, 0.16, 0.28)
      }
    }
    if (p.doors) {
      // Great doors swung back against the passage walls.
      for (const s of [-1, 1]) {
        const f = new Frame(b, M4(s * (R - 0.35), 0, -8, s * (Math.PI / 2)))
        for (let i = 0; i < 15; i++) f.box(M.door, -6.3 + i * 0.84 + 0.42, 12, 0, 0.82, 24, 0.55)
        for (const y of [2, 7.5, 13, 18.5, 23]) f.box(M.iron, 0, y, 0.32, 12.8, 0.38, 0.12)
        for (let i = 0; i < 50; i++) f.sphere(M.iron, rand(-6, 6), rand.pick([2, 7.5, 13, 18.5]), 0.4, 0.09)
      }
      for (const s of [-1, 1])
        for (const zz of [-3, -13, -23]) {
          const f = new Frame(b, M4(s * (R - 0.2), 7.5, zz, -s * (Math.PI / 2)))
          f.box(M.iron, 0, 0, 0.6, 0.2, 0.2, 1.2)
          f.lathe(
            M.iron,
            0,
            0.1,
            1.2,
            [
              [0, 0],
              [0.3, 0.1],
              [0.45, 0.6],
              [0.3, 0.6],
            ],
            8
          )
          f.lathe(
            M.flame,
            0,
            0.45,
            1.2,
            [
              [0, 0],
              [0.3, 0.05],
              [0.25, 0.5],
              [0, 0.9],
            ],
            8
          )
        }
    }

    // ── Upper facade ──
    for (let i = 0; i < 3; i++) box(b, i % 2 ? M.trim : M.trimB, 0, top + 0.3 + i * 0.55, zOut / 2 + i * 0.35, 2 * W + 1 + i * 0.8, 0.55, zOut + i * 0.7)
    const U = top + 1.8
    box(b, S, 0, U + 6, 1.7, 2 * W, 12, 3.4)
    for (const x of [-W * 0.845, W * 0.845]) opening(b, M.void, M.trim, M4(x, U + 0.8, 3.4), 1.6, 8, true, 0.8, 0.42)
    if (p.medallion) {
      // Sun medallion of the Valkaran kings.
      const med = new Frame(b, M4(0, U + 5.8, 3.5))
      med.geo(M.trimB, new THREE.CylinderGeometry(6, 6, 1.2, 48), M4(0, 0, 0.3, 0, 1, 1, 1, Math.PI / 2), { uv: "keep" })
      med.geo(M.bronze, new THREE.TorusGeometry(5.5, 0.34, 8, 48), M4(0, 0, 1), { uv: "keep" })
      med.geo(M.bronze, new THREE.TorusGeometry(3.3, 0.24, 8, 40), M4(0, 0, 1.05), { uv: "keep" })
      med.geo(M.bronze, new THREE.CylinderGeometry(2.3, 2.5, 0.8, 32), M4(0, 0, 1.1, 0, 1, 1, 1, Math.PI / 2), { uv: "keep" })
      for (let i = 0; i < 16; i++) {
        const a = (i * TAU) / 16
        med.box(M.bronze, Math.cos(a) * 4.4, Math.sin(a) * 4.4, 1, 0.6, i % 2 ? 1.4 : 2.1, 0.35, 0, 0, a - Math.PI / 2)
      }
      med.sphere(M.bronze, 0, 0, 1.4, 1.3, 1.3, 0.75, 20)
    }
    if (p.statues) {
      // Warden kings in their niches, swords grounded.
      for (const s of [-1, 1]) {
        const f = new Frame(b, M4(s * W * 0.573, U, 3.4))
        f.shape(M.void, archOutline(4.6, 11), 0.5, M4(0, 0, -0.2))
        f.shape(M.trimB, archOutline(5.8, 11.7), 1.4, M4(0, -0.3, -0.5), 0, [archOutline(4.6, 11)])
        f.box(M.trimB, 0, 0.3, 1, 4.4, 0.6, 2)
        f.lathe(
          M.carve,
          0,
          0.6,
          0.9,
          [
            [0, 0],
            [1.3, 0],
            [1.25, 0.6],
            [1, 3.6],
            [0.82, 5.4],
            [1.06, 6],
            [0.75, 6.5],
            [0.34, 6.8],
            [0, 6.85],
          ],
          20,
          1,
          0.8
        )
        f.sphere(M.carve, 0, 7.6, 0.9, 0.57, 0.7, 0.6, 16)
        f.lathe(
          M.carve,
          0,
          7.5,
          0.9,
          [
            [0.68, 0],
            [0.64, 0.5],
            [0.36, 1.1],
            [0, 1.3],
          ],
          14
        )
        for (const t of [-1, 1]) f.sphere(M.carve, t * 1.06, 6.4, 0.95, 0.54, 0.47, 0.52, 12)
        f.box(M.carve, 0, 3.3, 2.05, 0.27, 4.8, 0.12)
        f.box(M.carve, 0, 5.75, 2.05, 1.6, 0.25, 0.3)
        f.cyl(M.carve, 0, 5.9, 2.05, 0.12, 0.12, 0.95)
        for (const t of [-1, 1]) f.sphere(M.carve, t * 0.21, 6.2, 1.95, 0.25, 0.31, 0.27)
      }
    }
    // Crown of the gatehouse.
    const C = U + 12.2
    for (let x = -W + 0.5; x <= W - 0.5; x += 1.5) {
      const f = new Frame(b, M4(x, C, 3.4))
      f.box(M.trim, 0, -0.4, 0.1, 0.6, 0.8, 0.8)
      f.box(M.trim, 0, -1.2, -0.2, 0.55, 0.8, 0.4)
    }
    box(b, S, 0, C + 1, 3, 2 * W + 0.4, 2.1, 1.2)
    box(b, M.trim, 0, C - 0.1, 3, 2 * W + 0.8, 0.3, 1.5)
    for (let x = -W + 0.9; x < W; x += 2.2) {
      box(b, S, x, C + 3, 3.15, 1.3, 1.9, 0.9)
      box(b, M.trim, x, C + 4.1, 3.15, 1.5, 0.25, 1.1)
      if (Math.round(x) % 2 === 0) spike(b, M.iron, x, C + 4.2, 3.15, rand(1.2, 2.2))
    }
    box(b, S, 0, (T + C) / 2, -D / 2 + 1, 2 * W, C - T + 1.5, D - 2)
    for (const s of [-1, 1]) pinnacle(ctx, s * (W - 0.6), C + 2, 3, 11, 1.5)
    if (p.keep) {
      // Central keep with a domed lantern, the highest point of the gate.
      const kz = -11
      cyl(b, M.stoneRed, 0, C - 1, kz, 8.5, 8.5, 16, 48, { open: true })
      band(b, M.trim, 0, kz, C + 7, 8.5, 0.8, 0.4, 48)
      for (let k2 = 0; k2 < 12; k2++) {
        const a = (k2 * TAU) / 12 + 0.26
        opening(b, M.void, M.trim, M4(Math.sin(a) * 8.55, C + 8.4, kz + Math.cos(a) * 8.55, a), 1.2, 4, true, 0.6, 0.32)
      }
      corbels(b, M.trim, 0, kz, C + 15.2, 8.8, 34, 1.3)
      cyl(b, M.dark, 0, C + 15, kz, 9.9, 9.9, 0.25, 48)
      cyl(b, M.stoneRed, 0, C + 15, kz, 9.9, 9.9, 2.2, 48, { open: true })
      merlons(b, rand, M.stoneRed, 0, kz, C + 17.2, 9.9, 18, 1.6, 0.55, 0.8, M.iron)
      for (let k2 = 0; k2 < 6; k2++) {
        const a = (k2 * TAU) / 6
        pinnacle(ctx, Math.sin(a) * 9.2, C + 17.2, kz + Math.cos(a) * 9.2, 8, 1.1)
      }
      cyl(b, M.stone, 0, C + 15, kz, 5, 5, 9, 24)
      for (let k2 = 0; k2 < 8; k2++) {
        const a = (k2 * TAU) / 8
        opening(b, M.void, M.trim, M4(Math.sin(a) * 5.05, C + 17.5, kz + Math.cos(a) * 5.05, a), 0.9, 4, false, 0.4, 0.25)
      }
      band(b, M.trim, 0, kz, C + 24, 5, 0.7, 0.45, 24)
      lathe(
        b,
        M.roof,
        0,
        C + 24.7,
        kz,
        [
          [5.4, 0],
          [5.6, 0.8],
          [4.8, 3.2],
          [3, 5.6],
          [1.2, 7.4],
          [0.45, 8.6],
          [0, 9],
        ],
        28
      )
      beam(b, M.iron, [0, C + 33, kz], [0, C + 46, kz], 0.14, 6, 0.06)
      pennant(b, ctx.mat(p.pennant), M.iron, 0, C + 36, kz, 14, 3.4, 9, 0.2)
    }
    for (const x of [0, -9, 9, -15, 15]) if (Math.abs(x) < W - 1) ctx.anchor("lookout", x, C + 2, 3.6)
    // The crowd keeps clear of the wall mass either side of the portal.
    const zf = p.footprintTo
    const hw = (W + 2 - (R - 0.8)) / 2
    for (const s of [-1, 1]) ctx.footprint(s * (R - 0.8 + hw), (zf - D - 2) / 2, hw, (zf + D + 2) / 2)
  }
)

// ── Curtain wall: a length of wall with buttresses, a machicolated parapet, crested roundels and banners ──
export const curtainWall = defineBuilder(
  z
    .object({
      length: size(400),
      height: size(120).default(40),
      banners: z.array(matName).min(1).max(4).default(["banner", "bannerRust"]),
      shield: matName.default("bannerRust"),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const len = p.length
    const h = p.height
    const S = M.stone
    const x0 = -len / 2
    const x1 = len / 2
    box(b, S, 0, h / 2 - 0.5, -4, len, h + 1, 8)
    for (let x = x0 + 3.5; x < x1 - 1; x += 7) {
      box(b, M.trim, x, h * 0.4, 0.6, 2.2, h * 0.8, 1.6)
      cyl(b, M.dark, x, -0.5, 0.6, 1.8, 1.2, 5, 4, { uv: "planar" })
    }
    box(b, M.trim, 0, h * 0.82, 0.35, len, 0.8, 0.9)
    for (let x = x0 + 7; x < x1 - 3; x += 14) {
      const f = new Frame(b, M4(x, h * 0.62, 0.2))
      f.geo(M.trimB, new THREE.CylinderGeometry(3, 3, 0.8, 32), M4(0, 0, 0.2, 0, 1, 1, 1, Math.PI / 2), { uv: "keep" })
      f.geo(M.bronze, new THREE.TorusGeometry(2.6, 0.2, 6, 32), M4(0, 0, 0.65), { uv: "keep" })
      f.shape(
        ctx.mat(p.shield),
        [
          [-1.1, 1.2],
          [1.1, 1.2],
          [1.1, -0.3],
          [0, -1.6],
          [-1.1, -0.3],
        ],
        0.15,
        M4(0, 0, 0.55)
      )
    }
    for (let x = x0 + 0.9; x < x1; x += 1.8) {
      const f = new Frame(b, M4(x, h - 0.5, 0.1))
      f.box(M.trim, 0, -0.3, 0.5, 0.5, 0.6, 1)
    }
    box(b, S, 0, h + 0.6, 0.4, len, 1.6, 1.2)
    for (let x = x0 + 0.6; x < x1; x += 2.1) {
      box(b, S, x, h + 2.1, 0.5, 1.2, 1.6, 0.9)
      if (rand() < 0.35) spike(b, M.iron, x, h + 2.9, 0.5, rand(0.8, 1.6))
    }
    for (let x = x0 + 10; x < x1 - 4; x += 16) banner(b, ctx.mat(rand.pick(p.banners)), x, h - 1.2, 1.3, 3, rand(12, 17), 0, M.iron)
    for (let x = x0 + 6; x < x1 - 3; x += 9) ctx.anchor("lookout", x, h + 1.3, -0.6)
    ctx.footprint(0, -3.5, len / 2, 5)
  }
)

// ── Round (or polygonal) outer tower with arched windows, corbelled parapet and a conical roof or a crown ──
export const roundTower = defineBuilder(
  z
    .object({
      r: size(40),
      height: size(160),
      sides: z.number().int().min(4).max(64).default(24),
      roofHeight: num(0, 80).default(16),
      face: num(-360, 360).default(0),
      turrets: z.boolean().default(false),
      banner: matName.optional(),
      crown: z.boolean().default(false),
      pennant: matName.default("pennant"),
      pennantDir: num(-360, 360).default(17),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const r = p.r
    const h = p.height
    const sides = p.sides
    const face = p.face * DEG
    const S = M.wall
    const uvMode = sides > 12 ? "radial" : "planar"
    cyl(b, M.dark, 0, -1, 0, r + 1.4, r + 0.3, 7, sides, { uv: "planar" })
    cyl(b, S, 0, 6, 0, r, r, h - 6, sides, { uv: uvMode, open: true })
    for (const y of [6, h * 0.45, h * 0.72]) band(b, M.trim, 0, 0, y, r, 1, 0.45, sides)
    for (let k = 0; k < sides; k++) {
      const a = ((k + 0.5) * TAU) / sides
      if (Math.cos(a - face) < -0.2) continue
      const rr = r * Math.cos(Math.PI / sides) + 0.05
      for (const [y, w, hh] of [
        [h * 0.2, 0.9, 5],
        [h * 0.5, 1.4, 7.5],
        [h * 0.76, 1.1, 4.5],
      ])
        opening(b, M.void, M.trim, M4(Math.sin(a) * rr, y, Math.cos(a) * rr, a), w, hh, true, 0.7, 0.36)
    }
    corbels(b, M.trim, 0, 0, h + 0.2, r + 0.3, Math.round(r * 3.2), 1.3)
    cyl(b, S, 0, h, 0, r + 1.3, r + 1.3, 2.4, sides, { uv: uvMode, open: true })
    merlons(b, rand, S, 0, 0, h + 2.4, r + 1.3, Math.round(r * 1.9), 1.6, 0.55, 0.8, M.iron)
    const pen = ctx.mat(p.pennant)
    const dir = p.pennantDir * DEG
    if (p.crown) {
      for (let k = 0; k < 6; k++) {
        const a = (k * TAU) / 6 + 0.3
        pinnacle(ctx, Math.sin(a) * (r + 0.7), h + 2.4, Math.cos(a) * (r + 0.7), 7, 1)
      }
      cyl(b, S, 0, h, 0, r * 0.45, r * 0.45, 7, 24)
      lathe(
        b,
        M.roof,
        0,
        h + 7,
        0,
        [
          [r * 0.5, 0],
          [r * 0.47, 1],
          [r * 0.3, 3.4],
          [0.4, 5.4],
          [0, 5.8],
        ],
        24
      )
      beam(b, M.iron, [0, h + 12, 0], [0, h + 19, 0], 0.1, 6, 0.05)
      pennant(b, pen, M.iron, 0, h + 12.5, 0, 7, 1.8, 6, dir)
    } else if (p.roofHeight > 0) {
      cyl(b, M.roof, 0, h + 1.5, 0, r + 0.5, 0.3, p.roofHeight, Math.max(sides, 16))
      beam(b, M.iron, [0, h + 1.5 + p.roofHeight - 0.5, 0], [0, h + p.roofHeight + 8, 0], 0.1, 6, 0.05)
      pennant(b, pen, M.iron, 0, h + p.roofHeight + 2.2, 0, 7, 1.8, 5.5, dir)
    }
    if (p.turrets)
      for (let k = 0; k < 4; k++) {
        const a = (k * TAU) / 4 + 0.78
        const tx = Math.sin(a) * (r + 0.6)
        const tz = Math.cos(a) * (r + 0.6)
        cyl(b, M.trim, tx, h - 5, tz, 0.3, 1.8, 3, 16)
        cyl(b, S, tx, h - 2, tz, 1.8, 1.8, 6, 16)
        cyl(b, M.roof, tx, h + 4, tz, 2, 0.08, 6, 12)
        spike(b, M.iron, tx, h + 10, tz, 2.4, 0.07)
      }
    if (p.banner) banner(b, ctx.mat(p.banner), Math.sin(face) * (r + 0.9), h * 0.7, Math.cos(face) * (r + 0.9), 3.6, h * 0.38, face, M.iron)
    ctx.anchor("lookout", Math.sin(face) * r, h + 2.4, Math.cos(face) * r)
    ctx.circle(0, 0, r + 2)
  },
  { wall: "stone" }
)

// ── Square tower with corner turrets and a pyramid roof ──
export const squareTower = defineBuilder(
  z
    .object({
      width: size(60),
      height: size(160),
      pennant: z.union([matName, z.literal(false)]).default("pennant"),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const w = p.width
    const h = p.height
    const S = M.wall
    box(b, M.dark, 0, 2.5, 0, w + 2, 7, w + 2)
    box(b, S, 0, h / 2, 0, w, h, w)
    for (const y of [h * 0.35, h * 0.7]) box(b, M.trim, 0, y, 0, w + 0.8, 0.9, w + 0.8)
    for (const [dx, dz, a] of [
      [0, 1, 0],
      [-1, 0, -Math.PI / 2],
      [1, 0, Math.PI / 2],
    ])
      for (const y of [h * 0.15, h * 0.45, h * 0.76])
        for (const o of [-w * 0.25, w * 0.25]) opening(b, M.void, M.trim, M4(dx * (w / 2 + 0.02) + (dz ? o : 0), y, dz * (w / 2 + 0.02) + (dx ? o : 0), a), 1.1, 6, true, 0.6, 0.35)
    for (const [dx, dz] of [
      [0, 1],
      [-1, 0],
      [1, 0],
      [0, -1],
    ]) {
      for (let t = -w / 2 + 0.6; t < w / 2; t += 1.8) {
        const px = dx * (w / 2 + 0.6) + (dz ? t : 0)
        const pz = dz * (w / 2 + 0.6) + (dx ? t : 0)
        box(b, M.trim, px, h - 0.4, pz, dz ? 0.5 : 1.1, 0.7, dz ? 1.1 : 0.5)
      }
    }
    box(b, S, 0, h + 1, 0, w + 1.6, 2, w + 1.6)
    for (let t = -w / 2; t <= w / 2; t += 2.2)
      for (const [px, pz] of [
        [t, w / 2 + 0.5],
        [-w / 2 - 0.5, t],
        [w / 2 + 0.5, t],
      ]) {
        box(b, S, px, h + 2.8, pz, 1.2, 1.6, 1.2)
        if (rand() < 0.3) spike(b, M.iron, px, h + 3.6, pz, 1.4)
      }
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const tx = sx * (w / 2 + 0.3)
      const tz = sz * (w / 2 + 0.3)
      cyl(b, S, tx, h - 4, tz, 2, 2, 8, 16)
      cyl(b, M.roof, tx, h + 4, tz, 2.3, 0.1, 7, 12)
      spike(b, M.iron, tx, h + 11, tz, 2.5, 0.07)
    }
    cyl(b, M.roof, 0, h + 2, 0, w * 0.72, 0.2, w * 0.9, 4, { uv: "planar", ry: Math.PI / 4 })
    if (p.pennant) pennant(b, ctx.mat(p.pennant), M.iron, 0, h + 2 + w * 0.9 - 0.5, 0, 7, 1.8, 6, 0.4)
    ctx.footprint(0, 0, w / 2 + 2, w / 2 + 2)
  },
  { wall: "stone" }
)

// ── A distant wall pierced by an arch between two round towers: closes a vista through a gate ──
export const archScreen = defineBuilder(
  z
    .object({
      halfWidth: size(100).default(26),
      height: size(100).default(34),
      depth: size(40).default(10),
      opening: size(40).default(7),
      spring: size(80).default(16),
      towerX: num(0, 100).default(16),
      towerZ: coord.default(8),
      towerR: size(30).default(7),
      towerHeight: size(150).default(46),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const F = M.wall
    const W = p.halfWidth
    const R = p.opening
    shape(
      b,
      F,
      [
        [-W, -1],
        [W, -1],
        [W, p.height],
        [-W, p.height],
      ],
      p.depth,
      M4(0, 0, 0),
      0,
      [[[R, -0.5], ...arcPts(0, p.spring, R, 0, Math.PI, 24), [-R, -0.5]]]
    )
    for (const s of [-1, 1]) {
      cyl(b, F, s * p.towerX, 0, p.towerZ, p.towerR, p.towerR, p.towerHeight, 28)
      cyl(b, M.roof, s * p.towerX, p.towerHeight, p.towerZ, p.towerR + 0.6, 0.2, 16, 24)
      merlons(b, rand, F, s * p.towerX, p.towerZ, p.towerHeight - 4, p.towerR + 0.4, 14, 1.4)
    }
    for (let x = -W + 2; x <= W - 2; x += 2.6) box(b, F, x, p.height + 1, p.depth / 2, 1.4, 2.2, 1)
  },
  { wall: "far", roof: "roofFar" }
)

// ── A skyline: scattered distant towers or blocks inside an area, skipping any `exclude` rectangle ──
export const skyline = defineBuilder(
  z
    .object({
      kind: z.enum(["towers", "blocks"]),
      area: z.tuple([coord, coord, coord, coord]),
      count: z.number().int().min(1).max(200),
      exclude: z
        .array(z.tuple([coord, coord, coord, coord]))
        .max(8)
        .default([]),
      height: z.tuple([size(200), size(200)]).default([28, 75]),
      radius: z.tuple([size(40), size(40)]).default([4, 9]),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const F = M.wall
    const [x0, z0, x1, z1] = p.area
    const inside = (x: number, zz: number) => p.exclude.some(([a, c, d, e]) => x > Math.min(a, d) && x < Math.max(a, d) && zz > Math.min(c, e) && zz < Math.max(c, e))
    for (let i = 0; i < p.count; i++) {
      const x = rand(x0, x1)
      const zz = rand(z0, z1)
      if (p.kind === "towers") {
        const r = rand(p.radius[0], p.radius[1])
        const h = rand(p.height[0], p.height[1])
        if (inside(x, zz)) continue
        if (rand() < 0.6) {
          cyl(b, F, x, 0, zz, r, r, h, 20)
          cyl(b, M.roof, x, h, zz, r + 0.6, 0.2, r * rand(1.4, 2.6), 16)
        } else {
          box(b, F, x, h / 2, zz, r * 2, h, r * 2)
          cyl(b, M.roof, x, h, zz, r * 1.2, 0.2, r * 1.6, 4, { uv: "planar", ry: Math.PI / 4 })
        }
      } else {
        const w = rand(p.radius[0], p.radius[1])
        const h = rand(p.height[0], p.height[1])
        if (inside(x, zz)) continue
        box(b, F, x, h / 2, zz, w, h, rand(8, 16))
        box(b, M.roof, x, h + 1, zz, w + 1, 2, rand(8, 16))
      }
    }
  },
  { wall: "far", roof: "roofFar" }
)

// ── A domed rotunda on a drum, with a spike finial ──
export const dome = defineBuilder(
  z
    .object({
      r: size(80),
      drum: num(0, 4).default(1.3),
    })
    .strict(),
  (ctx, p) => {
    const { b, M } = ctx
    const r = p.r
    cyl(b, M.wall, 0, 0, 0, r, r, r * p.drum, 32)
    b.add(new THREE.SphereGeometry(r, 32, 12, 0, TAU, 0, Math.PI / 2), M.roof, M4(0, r * p.drum, 0), { uv: "planar" })
    spike(b, M.iron, 0, r * (p.drum + 1), 0, 6, 0.3)
  },
  { wall: "far", roof: "roofFar" }
)
