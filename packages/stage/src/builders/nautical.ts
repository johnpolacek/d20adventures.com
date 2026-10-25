import * as THREE from "three"
import { z } from "zod"
import { beam, Frame, G, M4, TAU, V } from "../kit/geometry"
import { defineBuilder, size } from "./types"

// A sailors' tavern's dressing (the Silver Serpent): a sea serpent cast in silver for its sign, a ship's wheel and an
// anchor for the walls.

// A sea serpent swimming along x in the plane of a wall, facing +z: humps rising out of and diving into a line of waves,
// a tapering tail, and a horned head with an open jaw and a fin crest. `length` from tail to snout.
export const serpent = defineBuilder(
  z.object({ length: size(20).default(3), girth: size(1).default(0.12), humps: z.number().int().min(1).max(6).default(3) }).strict(),
  (ctx, p) => {
    const { b, M } = ctx
    const L = p.length
    const n = 64
    // The spine: x from tail to head, y a wave that grows toward the head.
    const at = (t: number) => V(-L / 2 + t * L, Math.sin(t * p.humps * Math.PI) * L * 0.09 * (0.4 + 0.6 * t), Math.sin(t * TAU * 0.7) * 0.06)
    const r = (t: number) => p.girth * (0.18 + 0.82 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5)) * (t > 0.9 ? 1 - (t - 0.9) * 2 : 1)
    for (let i = 0; i < n; i++) {
      const t0 = i / n
      const t1 = (i + 1) / n
      beam(b, M.body, at(t0), at(t1), r(t1), 10, r(t0))
      // A crest of fins along the back.
      if (i % 3 === 0 && t0 > 0.12 && t0 < 0.88) {
        const c = at(t0)
        const d = at(t1).sub(c).normalize()
        const up = V(-d.y, d.x, 0)
        beam(
          b,
          M.fin,
          c.clone().addScaledVector(up, r(t0) * 0.8),
          c
            .clone()
            .addScaledVector(up, r(t0) * 2.1)
            .addScaledVector(d, -p.girth * 0.5),
          p.girth * 0.12,
          4,
          0.004
        )
      }
    }
    // The head: a long skull, a lower jaw dropped open, two swept horns and eyes.
    const F = new Frame(b, M4())
    const h = at(1)
    const g = p.girth
    F.sphere(M.body, h.x + g * 0.5, h.y + g * 0.15, h.z, g * 1.5, g * 0.75, g * 0.8, 14)
    F.box(M.body, h.x + g * 1.6, h.y + g * 0.25, h.z, g * 2.2, g * 0.5, g * 0.9, 0, 0, -0.1)
    F.box(M.body, h.x + g * 1.4, h.y - g * 0.5, h.z, g * 2.0, g * 0.3, g * 0.75, 0, 0, -0.45)
    for (const s of [-1, 1]) {
      beam(b, M.fin, [h.x + g * 0.2, h.y + g * 0.6, h.z + s * g * 0.4], [h.x - g * 1.4, h.y + g * 1.6, h.z + s * g * 0.7], g * 0.2, 6, 0.01)
      F.sphere(M.eye, h.x + g * 1.1, h.y + g * 0.45, h.z + s * g * 0.42, g * 0.14, g * 0.14, g * 0.1, 8)
      for (let k = 0; k < 4; k++) beam(b, M.fang, [h.x + g * (1.4 + k * 0.4), h.y, h.z + s * g * 0.3], [h.x + g * (1.4 + k * 0.4), h.y - g * 0.3, h.z + s * g * 0.3], g * 0.05, 4, 0.002)
    }
    // Carved waves under it.
    for (let k = 0; k < 7; k++) {
      const x = -L / 2 + (k + 0.5) * (L / 7)
      F.geo(
        M.wave,
        G(`naut-wave-${g}`, () => new THREE.TorusGeometry(g * 2.2, g * 0.35, 6, 16, Math.PI)),
        M4(x, -L * 0.1, -0.05, 0, 1, 0.6, 0.5),
        { uv: "keep" }
      )
    }
  },
  { body: "silver", fin: "silver", eye: "eyeGlow", fang: "bone", wave: "silver" }
)

// A ship's wheel standing in the plane of a wall, facing +z: a rim, a hub, and spokes running out past it to turned handles.
export const shipWheel = defineBuilder(
  z.object({ radius: size(2).default(0.55), spokes: z.number().int().min(4).max(12).default(8) }).strict(),
  (ctx, p) => {
    const { b, M } = ctx
    const F = new Frame(b, M4())
    const r = p.radius
    F.geo(
      M.wood,
      G(`naut-rim-${r}`, () => new THREE.TorusGeometry(r, r * 0.07, 8, 40)),
      M4(),
      { uv: "keep" }
    )
    F.geo(
      M.wood,
      G(`naut-rim2-${r}`, () => new THREE.TorusGeometry(r * 0.88, r * 0.035, 6, 40)),
      M4(),
      { uv: "keep" }
    )
    F.cyl(M.brass, 0, -0.06, 0, r * 0.16, r * 0.16, 0.12, 16, Math.PI / 2)
    for (let i = 0; i < p.spokes; i++) {
      const a = (i * TAU) / p.spokes
      const c = Math.cos(a)
      const s = Math.sin(a)
      beam(b, M.wood, [c * r * 0.15, s * r * 0.15, 0], [c * r * 1.05, s * r * 1.05, 0], r * 0.035, 6)
      beam(b, M.wood, [c * r * 1.05, s * r * 1.05, 0], [c * r * 1.32, s * r * 1.32, 0], r * 0.05, 8, r * 0.035)
    }
  },
  { wood: "oakDark", brass: "brass" }
)

// An iron anchor hanging point down in the plane of a wall: a ring, a stock across the top, a shank, and flukes.
export const anchor = defineBuilder(
  z.object({ height: size(4).default(1.3) }).strict(),
  (ctx, p) => {
    const { b, M } = ctx
    const F = new Frame(b, M4())
    const H = p.height
    F.geo(
      M.iron,
      G(`naut-ring-${H}`, () => new THREE.TorusGeometry(H * 0.08, H * 0.015, 6, 20)),
      M4(0, H * 0.06, 0),
      { uv: "keep" }
    )
    beam(b, M.iron, [0, 0, 0], [0, -H, 0], H * 0.035, 8)
    F.box(M.wood, 0, -H * 0.16, 0, H * 0.55, H * 0.06, H * 0.06)
    F.geo(
      M.iron,
      G(`naut-arms-${H}`, () => new THREE.TorusGeometry(H * 0.3, H * 0.035, 6, 20, Math.PI)),
      M4(0, -H * 0.72, 0, 0, 1, 1, 1, 0, Math.PI),
      { uv: "keep" }
    )
    for (const s of [-1, 1]) F.box(M.iron, s * H * 0.3, -H * 0.68, 0, H * 0.13, H * 0.13, H * 0.03, 0, 0, s * 0.8)
  },
  { iron: "iron", wood: "oakDark" }
)
