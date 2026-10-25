import * as THREE from "three"
import { z } from "zod"
import { beam, Frame, G, M4, TAU } from "../kit/geometry"
import { defineBuilder, matName, num, size, vec3 } from "./types"

// The Black Market's dressing: heavy curtains in a doorway, strings of lanterns across a lane, shelves of potions and
// curios, a counter heaped with gold and gems, and a rack of blades.

// A heavy curtain hanging from a rod across x, facing +z, its foot on the ground: deep pleats, drawn toward one side or
// both (`gather` 0 hangs straight, 1 is drawn right back) and caught with a tie at `tie` height.
export const curtain = defineBuilder(
  z
    .object({
      width: size(20).default(2.4),
      height: size(20).default(3),
      folds: z.number().int().min(2).max(40).default(10),
      depth: num(0, 0.6).default(0.1),
      gather: num(0, 1).default(0.4),
      side: z.enum(["left", "right", "both"]).default("both"),
      tie: num(0, 1).default(0.45),
      cloth: matName,
      rod: z.boolean().default(true),
    })
    .strict(),
  (ctx, p) => {
    const { b, M } = ctx
    const W = p.width
    const H = p.height
    const halves: { x0: number; x1: number; toward: number }[] =
      p.side === "both"
        ? [
            { x0: -W / 2, x1: 0, toward: -W / 2 },
            { x0: 0, x1: W / 2, toward: W / 2 },
          ]
        : [{ x0: -W / 2, x1: W / 2, toward: p.side === "left" ? -W / 2 : W / 2 }]
    for (const h of halves) {
      const nf = Math.max(2, Math.round((p.folds * (h.x1 - h.x0)) / W))
      const g = new THREE.PlaneGeometry(1, 1, nf * 6, 16)
      const pa = g.attributes.position
      const uv = g.attributes.uv
      for (let i = 0; i < pa.count; i++) {
        const u = uv.getX(i)
        const v = uv.getY(i)
        // At the rod the cloth spans its half; lower down it is pulled in toward the tie, most at the tie's height.
        const pull = p.gather * Math.max(0, 1 - Math.abs(v - p.tie) / Math.max(p.tie, 1 - p.tie)) ** 0.8
        const x0 = h.x0 + (h.toward - h.x0) * pull * 0.85
        const x1 = h.x1 + (h.toward - h.x1) * pull * 0.85
        const x = x0 + (x1 - x0) * u
        const crowd = 1 + pull * 2.5
        // Pleats of uneven depth and width, swelling and fading down the drop, as real cloth hangs.
        const ph = u * nf * TAU + Math.sin(u * nf * 1.9 + v * 2.2) * 0.9
        const amp = 0.5 + 0.5 * Math.sin(u * nf * 0.73 + 1.3) * Math.cos(v * 1.7 + u * 3.1)
        const zz = Math.sin(ph) * p.depth * crowd * 0.5 * (0.45 + amp) + p.depth
        pa.setXYZ(i, x, v * H, zz)
      }
      g.computeVertexNormals()
      b.add(g, ctx.mat(p.cloth), null, { uv: "keep", extra: (geo, i) => (1 - geo.attributes.uv.getY(i)) * 0.18 })
      g.dispose()
      if (p.gather > 0.05) {
        const tx = h.toward + (h.x0 + h.x1 - 2 * h.toward) * 0.12
        b.add(
          G("bm-tie", () => new THREE.TorusGeometry(0.1, 0.025, 6, 14)),
          M.trim,
          M4(tx, H * p.tie, p.depth * 1.6, 0, 1.3, 0.6, 1, Math.PI / 2),
          { uv: "keep" }
        )
      }
    }
    if (p.rod) {
      beam(b, M.trim, [-W / 2 - 0.15, H + 0.04, p.depth], [W / 2 + 0.15, H + 0.04, p.depth], 0.03, 8)
      const F = new Frame(b, new THREE.Matrix4())
      for (const s of [-1, 1]) F.sphere(M.trim, s * (W / 2 + 0.17), H + 0.04, p.depth, 0.05, 0.05, 0.05, 8)
    }
  },
  { trim: "brass" }
)

// A line of lanterns strung between two points, sagging, each lantern hanging on a short drop below it.
export const lanternString = defineBuilder(
  z
    .object({
      from: vec3,
      to: vec3,
      sag: num(0, 4).default(0.5),
      count: z.number().int().min(1).max(24).default(5),
      drop: num(0, 2).default(0.3),
      size: size(1).default(0.22),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const A = new THREE.Vector3(...p.from)
    const C = new THREE.Vector3(...p.to)
    const at = (t: number) =>
      A.clone()
        .lerp(C, t)
        .add(new THREE.Vector3(0, -Math.sin(Math.PI * t) * p.sag, 0))
    const n = 16
    for (let i = 0; i < n; i++) beam(b, M.rope, at(i / n), at((i + 1) / n), 0.008, 4)
    const F = new Frame(b, new THREE.Matrix4())
    for (let k = 0; k < p.count; k++) {
      const q = at((k + 0.5) / p.count)
      const d = p.drop * rand(0.6, 1.2)
      const r = p.size / 2
      beam(b, M.rope, q, [q.x, q.y - d, q.z], 0.006, 4)
      const y = q.y - d
      F.cyl(M.brass, q.x, y - r * 0.35, q.z, r * 0.25, r * 0.6, r * 0.35, 10)
      // A round paper or glass globe, warm, and a small base.
      F.geo(
        M.lamp,
        G("bm-globe", () => new THREE.SphereGeometry(1, 14, 10)),
        M4(q.x, y - r * 1.25, q.z, 0, r, r * 1.05, r),
        { uv: "keep" }
      )
      F.cyl(M.brass, q.x, y - r * 2.35, q.z, r * 0.4, r * 0.3, r * 0.15, 10)
    }
  },
  { rope: "rope", lamp: "lamp", brass: "brass" }
)

// Open shelves against a wall, facing +z, crowded with potion bottles in coloured glass, jars, boxes and oddities.
export const curioShelf = defineBuilder(
  z
    .object({
      width: size(10).default(1.6),
      height: size(6).default(2.0),
      depth: size(1).default(0.32),
      shelves: z.number().int().min(1).max(10).default(4),
      glass: z.array(matName).min(1).max(8),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const F = new Frame(b, new THREE.Matrix4())
    const { width: w, height: h, depth: d } = p
    F.box(M.wood, 0, h / 2, 0.015, w, h, 0.03)
    for (const s of [-1, 1]) F.box(M.wood, (s * (w - 0.04)) / 2, h / 2, d / 2, 0.04, h, d)
    const sh = (h - 0.2) / p.shelves
    for (let k = 0; k <= p.shelves; k++) {
      const y = 0.1 + k * sh
      F.box(M.wood, 0, y, d / 2, w, 0.03, d)
      if (k === p.shelves) break
      let x = -w / 2 + 0.06
      while (x < w / 2 - 0.08) {
        const r = rand()
        const gm = ctx.mat(p.glass[Math.floor(rand(0, p.glass.length))])
        const zz = rand(0.1, d - 0.08)
        if (r < 0.55) {
          // A bottle: round or square shouldered, a neck and a cork.
          const rr = rand(0.03, 0.06)
          const bh = Math.min(sh - 0.08, rand(0.1, 0.24))
          F.lathe(
            gm,
            x + rr,
            y + 0.015,
            zz,
            [
              [0, 0],
              [rr, 0],
              [rr, bh * 0.6],
              [rr * 0.4, bh * 0.82],
              [rr * 0.3, bh],
              [0, bh],
            ],
            10
          )
          F.cyl(M.cork, x + rr, y + 0.015 + bh, zz, rr * 0.28, rr * 0.3, 0.025, 6)
          x += rr * 2 + rand(0.01, 0.04)
        } else if (r < 0.75) {
          // A squat jar with a lid.
          const rr = rand(0.05, 0.08)
          const jh = Math.min(sh - 0.08, rand(0.08, 0.14))
          F.cyl(rand() < 0.5 ? M.pottery : gm, x + rr, y + 0.015, zz, rr, rr * 0.9, jh, 12)
          F.cyl(M.wood, x + rr, y + 0.015 + jh, zz, rr * 0.92, rr * 0.85, 0.02, 12)
          x += rr * 2 + rand(0.01, 0.05)
        } else if (r < 0.88) {
          // A small box or casket.
          const bw = rand(0.1, 0.2)
          const bh = Math.min(sh - 0.1, rand(0.06, 0.12))
          F.box(M.chest, x + bw / 2, y + 0.015 + bh / 2, zz, bw, bh, rand(0.08, 0.14), rand(-0.3, 0.3))
          F.box(M.brass, x + bw / 2, y + 0.017 + bh, zz, bw * 0.3, 0.008, 0.02)
          x += bw + rand(0.02, 0.05)
        } else {
          // An oddity: a skull, a crystal, a rolled scroll.
          const k = Math.floor(rand(0, 3))
          if (k === 0) F.sphere(M.bone, x + 0.06, y + 0.07, zz, 0.06, 0.055, 0.07, 10)
          else if (k === 1)
            F.geo(
              M.crystal,
              G("bm-crystal", () => new THREE.OctahedronGeometry(1, 0)),
              M4(x + 0.04, y + 0.08, zz, rand(0, 3), 0.035, 0.065, 0.035),
              { uv: "keep" }
            )
          else F.cyl(M.paper, x + 0.12, y + 0.04, zz, 0.025, 0.025, 0.22, 8, 0, Math.PI / 2)
          x += 0.16
        }
      }
    }
    ctx.footprint(0, d / 2, w / 2, d / 2, 0, h)
  },
  { wood: "table", cork: "crate", pottery: "pottery", chest: "chest", brass: "brass", bone: "bone", crystal: "crystal", paper: "paper" }
)

// A trader's counter facing +z heaped with treasure: a draped cloth, piles of gold coins, gems, goblets, an open casket
// spilling jewels, chains and trinkets.
export const treasureCounter = defineBuilder(
  z
    .object({
      length: size(6).default(1.8),
      width: size(2).default(0.7),
      height: size(1.5).default(0.9),
      heaps: z.number().int().min(0).max(20).default(6),
      gems: z.array(matName).min(1).max(6),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const F = new Frame(b, new THREE.Matrix4())
    const { length: l, width: w, height: h } = p
    F.box(M.wood, 0, h / 2, 0, l, h - 0.04, w - 0.06)
    F.box(M.wood, 0, h - 0.02, 0, l + 0.06, 0.04, w)
    // A cloth thrown over the top, hanging down the front.
    F.box(M.cloth, 0, h + 0.004, 0.03, l * 0.86, 0.008, w * 0.9)
    F.box(M.cloth, 0, h - 0.22, w / 2 + 0.01, l * 0.86, 0.44, 0.012)
    const coin = G("bm-coin", () => new THREE.CylinderGeometry(1, 1, 1, 10))
    for (let i = 0; i < p.heaps; i++) {
      const cx = rand(-l / 2 + 0.15, l / 2 - 0.15)
      const cz = rand(-w / 2 + 0.12, w / 2 - 0.1)
      const r = rand(0.07, 0.14)
      // A heap of coins: a low cone of gold and loose coins round it.
      F.geo(
        M.gold,
        G("bm-heap", () => new THREE.ConeGeometry(1, 1, 14, 1)),
        M4(cx, h + 0.01 + r * 0.25, cz, rand(0, 3), r, r * 0.5, r),
        { uv: "keep" }
      )
      for (let k = 0; k < 6; k++) {
        const a = rand(0, TAU)
        const rr = r * rand(1.0, 1.6)
        F.geo(M.gold, coin, M4(cx + Math.cos(a) * rr, h + 0.012 + rand(0, 0.01), cz + Math.sin(a) * rr, 0, 0.018, 0.004, 0.018, rand(-0.3, 0.3)), { uv: "keep" })
      }
      // Gems scattered on it.
      for (let k = 0; k < 3; k++)
        F.geo(
          ctx.mat(p.gems[Math.floor(rand(0, p.gems.length))]),
          G("bm-gem", () => new THREE.OctahedronGeometry(1, 0)),
          M4(cx + rand(-r, r), h + 0.02 + rand(0, r * 0.4), cz + rand(-r, r), rand(0, 3), 0.018, 0.024, 0.018),
          { uv: "keep" }
        )
    }
    // Goblets and an open casket.
    for (let i = 0; i < 3; i++) {
      const gx = rand(-l / 2 + 0.1, l / 2 - 0.1)
      const gz = rand(-w / 2 + 0.1, 0)
      F.lathe(
        M.gold,
        gx,
        h + 0.008,
        gz,
        [
          [0, 0],
          [0.035, 0],
          [0.012, 0.02],
          [0.008, 0.08],
          [0.04, 0.11],
          [0.045, 0.17],
          [0, 0.15],
        ],
        12
      )
    }
    const kx = rand(-l / 4, l / 4)
    F.box(M.chest, kx, h + 0.08, -w / 4, 0.32, 0.16, 0.22)
    F.box(M.chest, kx, h + 0.22, -w / 4 - 0.12, 0.32, 0.2, 0.025, 0, -0.6)
    F.geo(
      M.gold,
      G("bm-heap", () => new THREE.ConeGeometry(1, 1, 14, 1)),
      M4(kx, h + 0.17, -w / 4, 0, 0.14, 0.05, 0.09),
      { uv: "keep" }
    )
    ctx.footprint(0, 0, l / 2, w / 2, 0, h)
  },
  { wood: "table", cloth: "tablecloth", gold: "gold", chest: "chest" }
)

// A standing rack of blades facing +z: swords, sabres and daggers hung by their crossguards.
export const bladeRack = defineBuilder(
  z.object({ width: size(4).default(1.4), height: size(3).default(1.7), blades: z.number().int().min(1).max(16).default(7) }).strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const F = new Frame(b, new THREE.Matrix4())
    const { width: w, height: h } = p
    for (const s of [-1, 1]) {
      F.box(M.wood, (s * w) / 2, h / 2, 0, 0.07, h, 0.07)
      F.box(M.wood, (s * w) / 2, 0.03, 0, 0.1, 0.06, 0.5)
    }
    for (const y of [h - 0.06, h * 0.55]) F.box(M.wood, 0, y, 0, w, 0.06, 0.05)
    for (let i = 0; i < p.blades; i++) {
      const x = -w / 2 + ((i + 0.5) * w) / p.blades
      const long = rand() < 0.6
      const top = long ? h - 0.03 : h * 0.55 + 0.03
      const len = long ? rand(0.8, 1.05) : rand(0.3, 0.45)
      F.box(M.steel, x, top - 0.12 - len / 2, 0.06, long ? 0.035 : 0.028, len, 0.006)
      F.box(M.brass, x, top - 0.1, 0.06, long ? 0.18 : 0.1, 0.02, 0.025)
      F.cyl(M.grip, x, top - 0.1, 0.06, 0.014, 0.014, 0.12, 6)
      F.sphere(M.brass, x, top + 0.03, 0.06, 0.022, 0.022, 0.022, 8)
    }
    ctx.footprint(0, 0, w / 2 + 0.05, 0.25, 0, h)
  },
  { wood: "table", steel: "steel", brass: "brass", grip: "leather" }
)

// A box of crude planks nailed across an old opening (the market's makeshift door frame), on the wall plane facing +z.
export const boards = defineBuilder(
  z.object({ width: size(6).default(1.2), height: size(6).default(2.4), planks: z.number().int().min(1).max(12).default(4) }).strict(),
  (ctx, p) => {
    const { M, rand } = ctx
    const F = new Frame(ctx.b, new THREE.Matrix4())
    for (let i = 0; i < p.planks; i++) {
      const y = rand(0.2, p.height - 0.2)
      F.box(M.wood, rand(-0.1, 0.1), y, 0.03, p.width + rand(0, 0.3), rand(0.14, 0.22), 0.035, 0, 0, rand(-0.25, 0.25))
    }
  },
  { wood: "crateDark" }
)

// A sheet of canvas slung overhead between four corners on the walls, sagging, with no poles: a roof over a lane.
export const canvas = defineBuilder(z.object({ corners: z.tuple([vec3, vec3, vec3, vec3]), cloth: matName, sag: num(0, 3).default(0.4) }).strict(), (ctx, p) => {
  const c = p.corners.map((q) => new THREE.Vector3(...q))
  const g = new THREE.PlaneGeometry(1, 1, 14, 10)
  const pa = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < pa.count; i++) {
    const u = uv.getX(i)
    const v = uv.getY(i)
    const q = c[0].clone().lerp(c[1], u).lerp(c[3].clone().lerp(c[2], u), v)
    q.y -= Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * p.sag
    pa.setXYZ(i, q.x, q.y, q.z)
  }
  g.computeVertexNormals()
  ctx.b.add(g, ctx.mat(p.cloth), null, { uv: "keep", extra: (geo, i) => Math.sin(Math.PI * geo.attributes.uv.getX(i)) * Math.sin(Math.PI * geo.attributes.uv.getY(i)) * 0.25 })
  g.dispose()
})
