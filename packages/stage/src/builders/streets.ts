import * as THREE from "three"
import { z } from "zod"
import { arcPts, beam, Frame, M4, TAU, type Vec2 } from "../kit/geometry"
import type { Rand } from "../kit/rng"
import { inward } from "./library"
import { defineBuilder, matName, num, size, vec3 } from "./types"

// The old town's crowded streets (Kordavos's Lower Districts): tall jettied tenements of timber and plaster over stone
// ground floors, archways through them, laundry strung across the lane, lanterns on brackets and hanging signs.

type M = Record<string, THREE.Material>

// ── Tenements ────────────────────────────────────────────────────────────────

// One window in a timber-framed front at local (x, y) on the face z: a frame, leaded casements lit from within or dark,
// and shutters open, half shut or closed.
function casement(F: Frame, M: M, rand: Rand, x: number, y: number, z: number, w: number, h: number, lit: boolean) {
  F.box(lit ? M.lit : M.glassDark, x, y, z - 0.02, w, h, 0.04)
  for (const s of [-1, 1]) F.box(M.timber, x + (s * (w + 0.08)) / 2, y, z + 0.03, 0.08, h + 0.16, 0.08)
  for (const s of [-1, 1]) F.box(M.timber, x, y + (s * (h + 0.08)) / 2, z + 0.03, w + 0.16, 0.08, 0.08)
  F.box(M.timber, x, y, z + 0.01, 0.04, h, 0.04)
  for (const t of [-0.2, 0.2]) F.box(M.lead, x, y + t * h, z + 0.005, w, 0.015, 0.015)
  F.box(M.timber, x, y - h / 2 - 0.1, z + 0.08, w + 0.24, 0.06, 0.16)
  const shut = rand()
  if (shut < 0.12) F.box(M.shutter, x, y, z + 0.06, w + 0.04, h + 0.04, 0.04)
  else if (shut < 0.75)
    for (const s of [-1, 1]) {
      const a = rand(0.15, 1.3)
      const hx = x + (s * (w + 0.12)) / 2
      F.box(M.shutter, hx + s * Math.cos(a) * (w / 4), y, z + 0.06 + Math.sin(a) * (w / 4), w / 2, h, 0.035, s * a)
    }
}

// A tall townhouse facing +z, its front on z = d/2: a stone ground floor with a door or a shopfront (or an archway
// through it), timber-framed storeys each jutting further over the street, a steep slate roof with its gable to the
// street or its eaves, chimneys, and a crooked lean that grows with height. `lit` is the share of windows lit.
export const tenement = defineBuilder(
  z
    .object({
      w: size(20).default(5.5),
      d: size(20).default(8),
      storeys: z.number().int().min(1).max(6).default(3),
      ground: size(6).default(3.0),
      storey: size(5).default(2.7),
      jetty: num(0, 1.2).default(0.35),
      lean: num(-0.6, 0.6).default(0),
      gable: z.boolean().default(true),
      front: z.enum(["door", "shop", "arch", "passage", "plain"]).default("door"),
      lit: num(0, 1).default(0.35),
      balcony: z.boolean().default(false),
      // Frame and window the side walls too, for a house on a corner or along an alley.
      sides: z.boolean().default(false),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const F = new Frame(b, new THREE.Matrix4())
    const { w, d, ground: G0, storey: SH } = p
    const fz = d / 2
    // Ground floor of rough stone, its front cut by a door, a shopfront or a passage.
    if (p.front === "passage") {
      // An archway through the house: stone piers either side, a vault overhead, the storeys carried over it.
      const pier = Math.max(0.7, (w - 4.2) / 2)
      const span = w - 2 * pier
      for (const s of [-1, 1]) F.box(M.stone, s * (w / 2 - pier / 2), G0 / 2, 0, pier, G0, d)
      const rise = Math.min(span / 2, G0 - 1.8)
      const top = G0 - 0.05
      const spr = top - rise - 0.25
      F.box(M.stone, 0, top + 0.02, 0, span, 0.3, d)
      // Spandrels and the arch ring on both faces.
      for (const sz of [-1, 1]) {
        const ring: Vec2[] = [[span / 2, spr], [span / 2, top], [-span / 2, top], [-span / 2, spr], ...arcPts(0, spr, span / 2, Math.PI, 0, 18).slice(1, -1)]
        F.shape(M.stone, ring, 0.4, M4(0, 0, sz * (d / 2) - (sz > 0 ? 0.4 : 0)))
        const t = new THREE.TorusGeometry(span / 2 + 0.12, 0.16, 6, 24, Math.PI)
        F.geo(M.stoneTrim, t, M4(0, spr, sz * (d / 2 + 0.04)), { uv: "keep" })
        t.dispose()
      }
      // The passage's barrel vault, seen from below.
      const v = new THREE.CylinderGeometry(span / 2, span / 2, d, 18, 1, true, -Math.PI / 2, Math.PI)
      const vi = inward(v)
      v.dispose()
      F.geo(M.stone, vi, M4(0, spr, 0, 0, 1, 1, 1, -Math.PI / 2))
      vi.dispose()
      for (const s of [-1, 1]) ctx.footprint(s * (w / 2 - pier / 2), 0, pier / 2, d / 2)
    } else {
      F.box(M.stone, 0, G0 / 2, 0, w, G0, d)
      F.box(M.stoneTrim, 0, G0 - 0.08, fz + 0.06, w + 0.1, 0.16, 0.16)
      F.box(M.dark, 0, 0.18, fz + 0.03, w, 0.36, 0.08)
      const dx = rand(-w * 0.2, w * 0.2)
      if (p.front === "shop") {
        // A wide shop window lit from within, a stall board below it, an awning-board over it, and a door beside.
        const sw = Math.min(w - 1.6, 2.6)
        const sx = dx - 0.5
        // Small leaded panes, warm and dim, with the shop's wares on the sill inside.
        F.box(M.shopLit, sx, 1.55, fz - 0.06, sw, 1.3, 0.04)
        for (let i = 1; i < 4; i++) F.box(M.timber, sx - sw / 2 + (i * sw) / 4, 1.55, fz + 0.04, 0.05, 1.3, 0.05)
        for (let i = 1; i < 4; i++) F.box(M.lead, sx, 0.9 + (i * 1.3) / 4, fz + 0.02, sw, 0.02, 0.02)
        for (let i = 1; i < 12; i++) F.box(M.lead, sx - sw / 2 + (i * sw) / 12, 1.55, fz + 0.02, 0.012, 1.3, 0.012)
        for (let i = 0; i < 5; i++) F.cyl(rand() < 0.5 ? M.pot : M.timber, sx - sw / 2 + 0.3 + i * ((sw - 0.6) / 4), 0.92, fz - 0.2, 0.09, 0.07, rand(0.18, 0.36), 8)
        F.box(M.timber, sx, 0.85, fz + 0.25, sw + 0.3, 0.06, 0.5)
        F.box(M.timber, sx, 2.3, fz + 0.12, sw + 0.3, 0.12, 0.24)
        for (const s of [-1, 1]) F.box(M.timber, sx + (s * (sw + 0.14)) / 2, 1.55, fz + 0.06, 0.12, 1.6, 0.1)
        F.box(M.door, sx + sw / 2 + 0.75, 1.0, fz + 0.03, 0.9, 2.0, 0.06)
        F.box(M.timber, sx + sw / 2 + 0.75, 2.06, fz + 0.06, 1.1, 0.12, 0.12)
      } else if (p.front === "door" || p.front === "arch") {
        const dw = 1.0
        const dh = p.front === "arch" ? 2.3 : 2.05
        F.box(M.dark, dx, dh / 2, fz - 0.05, dw, dh, 0.12)
        F.box(M.door, dx, dh / 2, fz + 0.01, dw - 0.06, dh - 0.04, 0.05)
        for (let i = 1; i < 4; i++) F.box(M.timber, dx - dw / 2 + (i * dw) / 4, dh / 2, fz + 0.04, 0.02, dh - 0.1, 0.02)
        F.box(M.iron, dx + dw * 0.3, 1.05, fz + 0.07, 0.04, 0.12, 0.04)
        if (p.front === "arch") {
          const t = new THREE.TorusGeometry(dw / 2 + 0.12, 0.13, 6, 18, Math.PI)
          F.geo(M.stoneTrim, t, M4(dx, dh - dw / 2, fz + 0.06), { uv: "keep" })
          t.dispose()
        } else {
          F.box(M.stoneTrim, dx, dh + 0.12, fz + 0.06, dw + 0.4, 0.24, 0.16)
          for (const s of [-1, 1]) F.box(M.stoneTrim, dx + (s * (dw + 0.2)) / 2, dh / 2, fz + 0.05, 0.2, dh, 0.12)
        }
        F.box(M.stoneTrim, dx, 0.08, fz + 0.3, dw + 0.3, 0.16, 0.5)
        // A small barred window beside the door.
        const wx = dx + (dx > 0 ? -1.4 : 1.4)
        if (Math.abs(wx) < w / 2 - 0.5) {
          F.box(rand() < p.lit ? M.lit : M.glassDark, wx, 1.6, fz + 0.01, 0.6, 0.7, 0.04)
          for (let i = -1; i <= 1; i++) F.box(M.iron, wx + i * 0.18, 1.6, fz + 0.06, 0.025, 0.72, 0.025)
        }
      }
      ctx.footprint(0, 0, w / 2, d / 2)
    }
    // Storeys: each juts `jetty` further over the street and leans a little further, on joist ends and brackets.
    let face = fz
    let y = G0
    for (let k = 0; k < p.storeys; k++) {
      const nf = face + p.jetty
      const lx = p.lean * (k + 1) * 0.3
      const depth = nf + d / 2
      const cz = (nf - d / 2) / 2
      F.box(rand() < 0.5 ? M.plaster : M.plasterB, lx, y + SH / 2, cz, w, SH, depth)
      // Joist ends and a bressumer under the jetty, brackets at the corners.
      if (p.jetty > 0.05) {
        F.box(M.timber, lx, y + 0.1, nf - 0.05, w + 0.04, 0.22, 0.2)
        const nj = Math.max(3, Math.round(w / 0.5))
        for (let i = 0; i <= nj; i++) F.box(M.timber, lx - w / 2 + 0.1 + (i * (w - 0.2)) / nj, y - 0.06, face + p.jetty / 2, 0.12, 0.12, p.jetty + 0.1)
        for (const s of [-1, 1]) beam(b, M.timber, [lx + s * (w / 2 - 0.12), y - 0.9, face + 0.02], [lx + s * (w / 2 - 0.12), y - 0.05, nf - 0.1], 0.07, 4)
      }
      // The timber frame: corner and mid posts, a sill and head rail, braces, and windows between the posts.
      const bays = Math.max(2, Math.round(w / 1.25))
      const bw = w / bays
      for (let i = 0; i <= bays; i++) F.box(M.timber, lx - w / 2 + i * bw, y + SH / 2, nf + 0.04, i === 0 || i === bays ? 0.2 : 0.14, SH, 0.1)
      F.box(M.timber, lx, y + 0.12, nf + 0.05, w + 0.06, 0.18, 0.1)
      F.box(M.timber, lx, y + SH - 0.1, nf + 0.05, w + 0.06, 0.16, 0.1)
      F.box(M.timber, lx, y + 0.95, nf + 0.045, w, 0.1, 0.08)
      for (let i = 0; i < bays; i++) {
        const cx = lx - w / 2 + (i + 0.5) * bw
        const win = (i + k) % 2 === 0 || bays <= 2 || rand() < 0.35
        if (win) casement(F, M, rand, cx, y + 1.65, nf + 0.06, Math.min(0.75, bw - 0.4), 1.05, rand() < p.lit)
        else {
          // A brace across the panel, one way or the other.
          const s = rand() < 0.5 ? -1 : 1
          beam(b, M.timber, [cx - (s * bw) / 2 + s * 0.08, y + 0.2, nf + 0.05], [cx + (s * bw) / 2 - s * 0.08, y + SH - 0.18, nf + 0.05], 0.05, 4)
          F.box(M.timber, cx, y + 0.55, nf + 0.05, bw - 0.1, 0.08, 0.08)
        }
      }
      if (p.sides)
        for (const sx of [-1, 1]) {
          const x = lx + sx * (w / 2 + 0.05)
          const z0 = -d / 2
          const span = nf - z0
          const np = Math.max(2, Math.round(span / 1.5))
          for (let i = 0; i <= np; i++) F.box(M.timber, x, y + SH / 2, z0 + (i * span) / np, 0.1, SH, 0.14)
          F.box(M.timber, x, y + 0.12, z0 + span / 2, 0.1, 0.16, span)
          F.box(M.timber, x, y + SH - 0.1, z0 + span / 2, 0.1, 0.14, span)
          for (let i = 0; i < np; i++) {
            const zc = z0 + ((i + 0.5) * span) / np
            if ((i + k) % 3 === 1) {
              const g = new Frame(b, M4(x, 0, zc, (sx * Math.PI) / 2))
              casement(g, M, rand, 0, y + 1.6, 0.03, 0.6, 0.9, rand() < p.lit)
            } else if ((i + k) % 3 === 2) {
              const s2 = rand() < 0.5 ? -1 : 1
              beam(b, M.timber, [x, y + 0.2, zc - (s2 * span) / np / 2 + s2 * 0.1], [x, y + SH - 0.2, zc + (s2 * span) / np / 2 - s2 * 0.1], 0.05, 4)
            }
          }
        }
      if (p.balcony && k === 0) {
        // A rickety balcony with a rail and a few pots.
        F.box(M.timber, lx, y + 0.05, nf + 0.5, w * 0.6, 0.08, 0.9)
        F.box(M.timber, lx, y + 0.95, nf + 0.92, w * 0.6, 0.06, 0.06)
        for (let i = 0; i <= 8; i++) F.box(M.timber, lx - w * 0.3 + (i * w * 0.6) / 8, y + 0.5, nf + 0.92, 0.04, 0.9, 0.04)
        for (const s of [-1, 1]) beam(b, M.timber, [lx + s * w * 0.28, y - 0.7, nf], [lx + s * w * 0.28, y, nf + 0.85], 0.05, 4)
        for (let i = 0; i < 3; i++) F.cyl(M.pot, lx - w * 0.2 + i * w * 0.18, y + 0.09, nf + 0.7, 0.1, 0.13, 0.22, 8)
      }
      face = nf
      y += SH
    }
    // The roof: a steep slate gable over the street (ridge along z), or eaves to the street (ridge along x).
    const lx = p.lean * p.storeys * 0.3
    const back = -d / 2
    const over = 0.35
    const depth = face - back
    const cz = (face + back) / 2
    if (p.gable) {
      const rh = w * 0.85
      const tri: Vec2[] = [
        [-w / 2 - over, 0],
        [w / 2 + over, 0],
        [0, rh],
      ]
      F.shape(M.roof, tri, depth + over * 2, M4(lx, y, back - over))
      // The gable's face: plaster with a frame, a small window, a crossing brace, and a barge board.
      const gtri: Vec2[] = [
        [-w / 2, 0],
        [w / 2, 0],
        [0, rh - 0.25],
      ]
      F.shape(M.plaster, gtri, 0.1, M4(lx, y, face + 0.12))
      F.box(M.timber, lx, y + (rh - 0.25) / 2, face + 0.17, 0.14, rh - 0.25, 0.06)
      casement(F, M, rand, lx, y + rh * 0.35, face + 0.2, 0.5, 0.7, rand() < p.lit)
      for (const s of [-1, 1]) {
        const a: [number, number, number] = [lx + s * (w / 2 + over), y - 0.05, face + over + 0.02]
        const c: [number, number, number] = [lx, y + rh + 0.04, face + over + 0.02]
        beam(b, M.timber, a, c, 0.07, 4)
      }
    } else {
      const rh = depth * 0.55
      const tri: Vec2[] = [
        [back - over, 0],
        [face + over, 0],
        [cz, rh],
      ]
      F.shape(
        M.roof,
        tri.map(([zz, yy]) => [-zz, yy] as Vec2),
        w + over * 2,
        M4(lx - w / 2 - over, y, 0, Math.PI / 2)
      )
      // A dormer in the street slope.
      if (w > 4) {
        const dzz = face - depth * 0.25
        const dy = y + rh * 0.4
        F.box(M.plaster, lx, dy + 0.5, dzz, 1.1, 1.0, 0.9)
        casement(F, M, rand, lx, dy + 0.5, dzz + 0.46, 0.5, 0.6, rand() < p.lit)
        F.shape(
          M.roof,
          [
            [-0.75, 0],
            [0.75, 0],
            [0, 0.65],
          ],
          1.3,
          M4(lx, dy + 1.0, dzz - 0.65)
        )
      }
    }
    // Chimneys.
    const nc = rand() < 0.4 ? 2 : 1
    for (let i = 0; i < nc; i++) {
      const cx = lx + (i === 0 ? -1 : 1) * w * 0.28
      const czz = back + d * rand(0.2, 0.45)
      F.box(M.stone, cx, y, czz, 0.6, w * 0.85 + 0.9, 0.55)
      F.box(M.stoneTrim, cx, y + w * 0.85 + 0.9, czz, 0.75, 0.15, 0.7)
      F.cyl(M.pot, cx, y + w * 0.85 + 1.05, czz, 0.11, 0.09, 0.32, 8)
    }
  },
  {
    stone: "stone",
    stoneTrim: "stoneTrim",
    plaster: "plaster",
    plasterB: "plasterB",
    timber: "timber",
    roof: "roof",
    lit: "windowLit",
    shopLit: "shopLit",
    glassDark: "windowDark",
    door: "door",
    iron: "iron",
    dark: "dark",
    lead: "lead",
    shutter: "shutter",
    pot: "pottery",
  }
)

// ── Street dressing ─────────────────────────────────────────────────────────

// A washing line from `from` to `to` sagging by `sag`, hung with shirts, sheets and rags in the given cloths.
export const laundry = defineBuilder(
  z
    .object({
      from: vec3,
      to: vec3,
      sag: num(0, 3).default(0.5),
      items: z.number().int().min(0).max(24).default(7),
      cloths: z.array(matName).min(1).max(8),
    })
    .strict(),
  (ctx, p) => {
    const { b, rand } = ctx
    const A = new THREE.Vector3(...p.from)
    const C = new THREE.Vector3(...p.to)
    const at = (t: number) =>
      A.clone()
        .lerp(C, t)
        .add(new THREE.Vector3(0, -p.sag * 4 * t * (1 - t), 0))
    const n = 14
    for (let i = 0; i < n; i++) beam(b, ctx.M.rope, at(i / n), at((i + 1) / n), 0.008, 3)
    const dir = C.clone().sub(A).setY(0).normalize()
    const yaw = Math.atan2(-dir.z, dir.x)
    for (let i = 0; i < p.items; i++) {
      const t = (i + 0.5 + rand(-0.25, 0.25)) / p.items
      const q = at(t)
      const mat = ctx.mat(rand.pick(p.cloths))
      const kind = rand()
      const w = kind < 0.3 ? rand(0.7, 1.1) : rand(0.35, 0.6)
      const h = kind < 0.3 ? rand(0.9, 1.4) : rand(0.4, 0.75)
      const g = new THREE.PlaneGeometry(w, h, 4, 6)
      const pos = g.attributes.position
      for (let k = 0; k < pos.count; k++) pos.setZ(k, Math.sin((pos.getX(k) / w) * Math.PI * 2 + i) * 0.03 + (0.5 - pos.getY(k) / h) * 0.04)
      g.computeVertexNormals()
      b.add(g, mat, M4(q.x, q.y - h / 2, q.z, yaw, 1, 1, 1, rand(-0.12, 0.12), rand(-0.05, 0.05)), { uv: "keep" })
      g.dispose()
    }
  },
  { rope: "rope" }
)

// A lantern on an iron bracket out from a wall facing +z: a scrolled arm, a cage of glass glowing within.
export const wallLantern = defineBuilder(
  z.object({ reach: size(2).default(0.5) }).strict(),
  (ctx, p) => {
    const { M } = ctx
    const F = new Frame(ctx.b, new THREE.Matrix4())
    const r = p.reach
    F.box(M.iron, 0, 0, 0.02, 0.1, 0.28, 0.04)
    F.box(M.iron, 0, 0.08, r / 2, 0.03, 0.03, r)
    beam(ctx.b, M.iron, [0, -0.12, 0.03], [0, 0.07, r * 0.6], 0.012, 4)
    const t = new THREE.TorusGeometry(0.06, 0.008, 4, 12)
    F.geo(M.iron, t, M4(0, 0.02, r * 0.35, Math.PI / 2), { uv: "keep" })
    t.dispose()
    F.box(M.iron, 0, 0.0, r, 0.012, 0.16, 0.012)
    F.cyl(M.iron, 0, -0.38, r, 0.08, 0.1, 0.05, 6)
    F.cyl(M.glow, 0, -0.33, r, 0.075, 0.09, 0.22, 6)
    F.cyl(M.iron, 0, -0.11, r, 0.11, 0.03, 0.09, 6)
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6
      F.box(M.iron, Math.cos(a) * 0.088, -0.22, r + Math.sin(a) * 0.088, 0.012, 0.23, 0.012)
    }
  },
  { iron: "iron", glow: "lamp" }
)

// A shop sign hanging from an iron arm out from a wall facing +z: a board turned across the street, edged, with a
// painted emblem shape on both faces.
export const hangingSign = defineBuilder(
  z
    .object({
      reach: size(3).default(1.1),
      width: size(2).default(0.8),
      height: size(2).default(0.55),
      emblem: z.enum(["boot", "mug", "key", "fish", "scissors", "moon", "none"]).default("none"),
    })
    .strict(),
  (ctx, p) => {
    const { M } = ctx
    const F = new Frame(ctx.b, new THREE.Matrix4())
    const r = p.reach
    F.box(M.iron, 0, 0, r / 2, 0.035, 0.035, r)
    beam(ctx.b, M.iron, [0, -0.45, 0.02], [0, -0.01, r * 0.55], 0.014, 4)
    F.box(M.iron, 0, 0.0, 0.02, 0.08, 0.2, 0.04)
    for (const t of [0.25, 0.75]) F.box(M.iron, 0, -0.08, r * 0.15 + t * (r * 0.8), 0.01, 0.16, 0.01)
    const zc = r * 0.15 + (r * 0.8) / 2
    const top = -0.16
    F.box(M.board, 0, top - p.height / 2, zc, 0.05, p.height, p.width)
    F.box(M.trim, 0, top - p.height / 2, zc, 0.056, p.height + 0.04, 0.03, 0)
    for (const s of [-1, 1]) F.box(M.trim, 0, top - p.height / 2, zc + (s * p.width) / 2, 0.06, p.height + 0.04, 0.03)
    for (const s of [-1, 1]) F.box(M.trim, 0, top - p.height / 2 + (s * p.height) / 2, zc, 0.06, 0.03, p.width + 0.04)
    if (p.emblem === "none") return
    const ey = top - p.height / 2
    const shapes: Record<string, Vec2[]> = {
      boot: [
        [-0.12, -0.16],
        [0.16, -0.16],
        [0.16, -0.08],
        [0.0, -0.06],
        [-0.02, 0.18],
        [-0.12, 0.18],
      ],
      mug: [
        [-0.1, -0.15],
        [0.08, -0.15],
        [0.08, 0.15],
        [-0.1, 0.15],
        [-0.1, 0.1],
        [-0.17, 0.1],
        [-0.17, -0.06],
        [-0.1, -0.06],
      ],
      key: [
        [-0.2, -0.03],
        [0.08, -0.03],
        [0.08, -0.1],
        [0.12, -0.1],
        [0.12, -0.03],
        [0.2, -0.03],
        [0.2, 0.05],
        [0.12, 0.09],
        [0.06, 0.03],
        [-0.2, 0.03],
      ],
      fish: [
        [-0.22, 0],
        [-0.06, -0.09],
        [0.12, -0.05],
        [0.22, -0.12],
        [0.2, 0],
        [0.22, 0.12],
        [0.12, 0.05],
        [-0.06, 0.09],
      ],
      scissors: [
        [-0.15, -0.15],
        [0.0, 0.02],
        [0.15, -0.15],
        [0.18, -0.12],
        [0.03, 0.05],
        [0.12, 0.18],
        [0.08, 0.2],
        [0.0, 0.08],
        [-0.08, 0.2],
        [-0.12, 0.18],
        [-0.03, 0.05],
        [-0.18, -0.12],
      ],
      moon: [...arcPts(0, 0, 0.16, Math.PI * 0.3, Math.PI * 1.7, 12), ...arcPts(0.06, 0, 0.12, Math.PI * 1.55, Math.PI * 0.45, 10)],
    }
    for (const s of [-1, 1]) F.shape(M.emblem, shapes[p.emblem], 0.012, M4(s * 0.032, ey, zc, (s * Math.PI) / 2))
  },
  { iron: "iron", board: "signBoard", trim: "gilt", emblem: "gilt" }
)
