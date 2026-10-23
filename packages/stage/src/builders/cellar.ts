import * as THREE from "three"
import { z } from "zod"
import { beam, Frame, G, M4, TAU, type Vec2 } from "../kit/geometry"
import { defineBuilder, num, size } from "./types"

// Cellars and stores below ground (the cellar kit): casks lying in rows on cradles, racks of dusty bottles, and torches
// burning in iron sconces.

// A row of `count` casks lying on timber cradles, their heads facing +z, along x; `tiers` stacks a second row nested in
// the hollows of the first. Each cask is `length` long and `r` round at the bilge.
export const cask = defineBuilder(
  z
    .object({
      r: size(1.5).default(0.48),
      length: size(3).default(1.15),
      count: z.number().int().min(1).max(16).default(4),
      tiers: z.number().int().min(1).max(3).default(1),
      gap: num(0, 1).default(0.06),
    })
    .strict(),
  (ctx, p) => {
    const { M } = ctx
    const r = p.r
    const L = p.length
    const step = 2 * r + p.gap
    const width = p.count * step
    // The bilged body: a lathe along its own axis, laid along z.
    const profile: Vec2[] = [
      [0, 0],
      [r * 0.84, 0],
      [r * 0.95, L * 0.25],
      [r, L * 0.5],
      [r * 0.95, L * 0.75],
      [r * 0.84, L],
      [0, L],
    ]
    const body = G(
      `cask-${r}-${L}`,
      () =>
        new THREE.LatheGeometry(
          profile.map(([a, b]) => new THREE.Vector2(a, b)),
          18
        )
    )
    const hoop = (rr: number) => G(`cask-hoop-${rr.toFixed(3)}`, () => new THREE.TorusGeometry(rr, 0.022, 4, 22))
    const head = G(`cask-head-${r}`, () => new THREE.CircleGeometry(r * 0.8, 18))
    const lay = (x: number, y: number) => {
      // Laid down: the lathe's axis turned from +y to +z, running from -L/2 to L/2.
      ctx.b.add(body, M.wood, M4(x, y, -L / 2, 0, 1, 1, 1, Math.PI / 2), { uv: "keep" })
      for (const t of [0.06, 0.22, 0.78, 0.94]) {
        const rr = r * (t < 0.5 ? 0.84 + t * 0.64 : 0.84 + (1 - t) * 0.64) + 0.012
        ctx.b.add(hoop(rr), M.iron, M4(x, y, L / 2 - t * L), { uv: "keep" })
      }
      // The head toward +z, painted over the end, with a tap bung.
      ctx.b.add(head, M.head, M4(x, y, L / 2 + 0.004), { uv: "keep" })
      const F = new Frame(ctx.b, M4(x, y, L / 2))
      F.box(M.iron, 0, -r * 0.45, 0.01, 0.06, 0.06, 0.04)
    }
    for (let t = 0; t < p.tiers; t++) {
      const n = p.count - t
      const y0 = r + 0.16 + t * r * 1.72
      for (let i = 0; i < n; i++) lay(-width / 2 + step / 2 + i * step + (t * step) / 2, y0)
    }
    // The cradle: two heavy rails under the bottom row, chocks between the casks.
    const F = new Frame(ctx.b, new THREE.Matrix4())
    for (const zz of [L * 0.32, -L * 0.32]) {
      F.box(M.cradle, 0, 0.08, zz, width + 0.1, 0.16, 0.16)
      for (let i = 0; i <= p.count; i++) F.box(M.cradle, -width / 2 + i * step, 0.2, zz, 0.12, 0.14, 0.17)
    }
    ctx.footprint(0, 0, width / 2, L / 2, 0, p.tiers * r * 1.72 + 0.4)
  },
  { wood: "barrel", head: "caskHead", iron: "iron", cradle: "timber" }
)

// A rack of bottles lying in cells, facing +z, against a wall: `cols` by `rows` of square cells, `fill` the share
// holding a bottle. Its back is on z = 0.
export const wineRack = defineBuilder(
  z
    .object({
      width: size(8).default(2),
      height: size(5).default(2.2),
      depth: size(1).default(0.36),
      cols: z.number().int().min(1).max(40).default(12),
      rows: z.number().int().min(1).max(30).default(14),
      fill: num(0, 1).default(0.85),
    })
    .strict(),
  (ctx, p) => {
    const { M, rand } = ctx
    const F = new Frame(ctx.b, new THREE.Matrix4())
    const { width: W, height: H, depth: D } = p
    const cw = W / p.cols
    const ch = (H - 0.12) / p.rows
    F.box(M.back, 0, H / 2, 0.02, W, H, 0.04)
    // Uprights and shelves of thin boards.
    for (let i = 0; i <= p.cols; i++) F.box(M.wood, -W / 2 + i * cw, H / 2, D / 2, i % 4 === 0 ? 0.05 : 0.018, H, D)
    for (let j = 0; j <= p.rows; j++) F.box(M.wood, 0, 0.06 + j * ch, D / 2, W, j === 0 || j === p.rows ? 0.05 : 0.016, D)
    F.box(M.wood, 0, H + 0.03, D / 2 + 0.02, W + 0.1, 0.06, D + 0.06)
    // Bottles lying necks out: a body and a neck.
    const br = Math.min(cw, ch) * 0.36
    const body = G(`bottle-${br.toFixed(3)}`, () => new THREE.CylinderGeometry(br, br, D * 0.7, 7).rotateX(Math.PI / 2))
    const neck = G(`neck-${br.toFixed(3)}`, () => new THREE.CylinderGeometry(br * 0.32, br * 0.4, D * 0.28, 5).rotateX(Math.PI / 2))
    const glass = [M.bottle, M.bottleB, M.bottleC]
    for (let i = 0; i < p.cols; i++)
      for (let j = 0; j < p.rows; j++) {
        if (rand() > p.fill) continue
        const x = -W / 2 + (i + 0.5) * cw
        const y = 0.06 + (j + 0.5) * ch
        const m = glass[Math.floor(rand(0, 3))]
        ctx.b.add(body, m, M4(x, y, D * 0.42), { uv: "keep" })
        ctx.b.add(neck, m, M4(x, y, D * 0.9), { uv: "keep" })
      }
    ctx.footprint(0, D / 2, W / 2, D / 2)
  },
  { wood: "timber", back: "dark", bottle: "bottleDark", bottleB: "bottleGreen", bottleC: "bottleBrown" }
)

// A torch burning in an iron sconce on a wall facing +z: a ring on a bracket, a pitch-wrapped stave, live flame.
export const torch = defineBuilder(
  z.object({ reach: size(1).default(0.22) }).strict(),
  (ctx, p) => {
    const { M } = ctx
    const F = new Frame(ctx.b, new THREE.Matrix4())
    F.box(M.iron, 0, 0, 0.02, 0.12, 0.3, 0.04)
    beam(ctx.b, M.iron, [0, -0.06, 0.03], [0, -0.02, p.reach], 0.015, 4)
    const ring = G("torch-ring", () => new THREE.TorusGeometry(0.05, 0.012, 4, 12).rotateX(Math.PI / 2))
    ctx.b.add(ring, M.iron, M4(0, -0.02, p.reach), { uv: "keep" })
    // The stave leans out a little from the wall.
    beam(ctx.b, M.stave, [0, -0.32, p.reach - 0.05], [0, 0.22, p.reach + 0.04], 0.03, 6)
    F.cyl(M.pitch, 0, 0.14, p.reach + 0.03, 0.045, 0.05, 0.14, 8)
    if (M.fire.userData.fire)
      for (let i = 0; i < 3; i++)
        ctx.b.add(
          G("flame-card", () => new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0)),
          M.fire,
          M4(0, 0.24, p.reach + 0.03, (i * TAU) / 6, 0.22, 0.42, 1),
          { uv: "keep" }
        )
    else F.cyl(M.fire, 0, 0.26, p.reach + 0.03, 0.05, 0.0, 0.2, 6)
  },
  { iron: "iron", stave: "timber", pitch: "dark", fire: "fire" }
)
