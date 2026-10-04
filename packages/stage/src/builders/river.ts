import * as THREE from "three"
import { z } from "zod"
import { beam, Frame, G, M4, type Sink, shape, type Vec2 } from "../kit/geometry"
import { defineBuilder, num, size } from "./types"

// Rivers and harbours: a riverboat with a lit cabin, a pier on pilings, and sailing ships at their moorings. Decks and
// pier boards sit at y = 0, where people stand; hulls and pilings reach down past the set's water line.

// An outline on the ground [x, z], extruded up from y0 by `depth` in the object's frame. (The bare `extrude` primitive's
// "xz" plane mirrors z; this does not.)
function plan(b: Sink, mat: THREE.Material, pts: Vec2[], y0: number, depth: number) {
  shape(
    b,
    mat,
    pts.map(([x, zz]) => [x, -zz]),
    depth,
    M4(0, y0, 0, 0, 1, 1, 1, -Math.PI / 2)
  )
}
const scale = (pts: Vec2[], sx: number, sz: number): Vec2[] => pts.map(([x, zz]) => [x * sx, zz * sz])

// A hull seen from above: a square-cut stern at -z, straight sides, and a bow that curves to a point at +z.
function hullOutline(L: number, B: number, bow = 0.3, n = 10): Vec2[] {
  const half = B / 2
  const stern = -L / 2
  const shoulder = L / 2 - L * bow
  const right: Vec2[] = [
    [half * 0.8, stern],
    [half, stern + Math.min(1, L * 0.08)],
    [half, shoulder],
  ]
  for (let i = 1; i < n; i++) {
    const t = (i / n) * (Math.PI / 2)
    right.push([half * Math.cos(t) ** 0.85, shoulder + (L / 2 - shoulder) * Math.sin(t)])
  }
  right.push([0, L / 2])
  return [
    ...right,
    ...right
      .slice(0, -1)
      .reverse()
      .map(([x, zz]) => [-x, zz] as Vec2),
  ]
}

// A rail along a polyline: posts at each point and rails between them.
function railing(b: Sink, mat: THREE.Material, pts: Vec2[], y: number, h: number, closed = false) {
  const all = closed ? [...pts, pts[0]] : pts
  for (const [x, zz] of pts) beam(b, mat, [x, y, zz], [x, y + h, zz], 0.035, 5)
  for (let i = 0; i < all.length - 1; i++) {
    const [ax, az] = all[i]
    const [cx, cz] = all[i + 1]
    beam(b, mat, [ax, y + h, az], [cx, y + h, cz], 0.03, 5)
    beam(b, mat, [ax, y + h * 0.5, az], [cx, y + h * 0.5, cz], 0.02, 4)
  }
}
// Points along a closed outline, about `step` apart.
function along(pts: Vec2[], step: number): Vec2[] {
  const out: Vec2[] = []
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i]
    const [cx, cz] = pts[(i + 1) % pts.length]
    const n = Math.max(1, Math.round(Math.hypot(cx - ax, cz - az) / step))
    for (let k = 0; k < n; k++) out.push([ax + ((cx - ax) * k) / n, az + ((cz - az) * k) / n])
  }
  return out
}

// A river packet: a dark low hull, a planked deck with a rail, a cabin with lit windows and a door at each end, an upper
// deck with its own rail, a pilothouse forward on it and a thin stack. The bow points +z. The cabin is solid.
export const riverboat = defineBuilder(
  z
    .object({
      length: size(40).default(12),
      beam: size(12).default(3.6),
      draft: size(4).default(1),
      // The cabin's share of the length, and how far aft of midships it sits.
      cabin: num(0.25, 0.8).default(0.5),
      aft: num(0, 0.5).default(0.12),
      height: size(4).default(2.2),
      lit: z.boolean().default(true),
    })
    .strict(),
  (ctx, p) => {
    const { b, M } = ctx
    const L = p.length
    const B = p.beam
    const hull = hullOutline(L, B)
    // Hulls step in toward the keel, so the waterline reads curved rather than boxed.
    plan(b, M.hull, scale(hull, 0.8, 0.95), -p.draft, p.draft * 0.5)
    plan(b, M.hull, hull, -p.draft * 0.5, p.draft * 0.5)
    plan(b, M.trim, scale(hull, 1.025, 1.012), -0.22, 0.2)
    plan(b, M.deck, scale(hull, 0.95, 0.975), -0.02, 0.03)
    railing(b, M.trim, along(scale(hull, 0.97, 0.985), 1.1), 0, 0.85, true)
    // The cabin.
    const Lc = L * p.cabin
    const Wc = B * 0.72
    const Hc = p.height
    const cz = -L * p.aft
    const F = new Frame(b, M4(0, 0, cz))
    F.box(M.cabin, 0, Hc / 2, 0, Wc, Hc, Lc)
    // Windows along each side, each with a frame and a mullion.
    for (const sx of [-1, 1])
      for (let i = 0, n = Math.max(1, Math.floor(Lc / 0.95)); i < n; i++) {
        const wz = -Lc / 2 + ((i + 0.5) * Lc) / n
        F.box(M.trim, sx * (Wc / 2 + 0.015), Hc * 0.6, wz, 0.04, 0.68, 0.62)
        F.box(p.lit ? M.window : M.void, sx * (Wc / 2 + 0.03), Hc * 0.6, wz, 0.02, 0.54, 0.48)
        F.box(M.trim, sx * (Wc / 2 + 0.045), Hc * 0.6, wz, 0.02, 0.56, 0.05)
      }
    for (const end of [-1, 1]) {
      const ez = end * (Lc / 2 + 0.01)
      F.box(M.void, 0, 0.95, ez, 0.85, 1.9, 0.04)
      F.box(M.trim, 0, 1.95, ez + end * 0.02, 1.05, 0.12, 0.06)
      for (const sx of [-1, 1]) F.box(p.lit ? M.window : M.void, sx * Wc * 0.3, Hc * 0.62, ez, 0.45, 0.45, 0.04)
    }
    F.box(M.roof, 0, Hc + 0.06, 0, Wc + 0.35, 0.12, Lc + 0.35)
    railing(
      b,
      M.trim,
      along(
        [
          [-Wc / 2 - 0.1, cz - Lc / 2 - 0.1],
          [Wc / 2 + 0.1, cz - Lc / 2 - 0.1],
          [Wc / 2 + 0.1, cz + Lc / 2 + 0.1],
          [-Wc / 2 - 0.1, cz + Lc / 2 + 0.1],
        ],
        1.2
      ),
      Hc + 0.12,
      0.7,
      true
    )
    // The pilothouse, forward on the upper deck, glazed on every side.
    const Lp = Math.min(2.2, Lc * 0.4)
    const pz = Lc / 2 - Lp / 2 - 0.3
    const Wp = Wc * 0.66
    const Hp = 1.7
    F.box(M.cabin, 0, Hc + 0.12 + Hp / 2, pz, Wp, Hp, Lp)
    for (const sx of [-1, 1]) F.box(p.lit ? M.window : M.void, sx * (Wp / 2 + 0.005), Hc + 0.12 + Hp * 0.62, pz, 0.04, 0.6, Lp * 0.7)
    for (const sz of [-1, 1]) F.box(p.lit ? M.window : M.void, 0, Hc + 0.12 + Hp * 0.62, pz + sz * (Lp / 2 + 0.005), Wp * 0.7, 0.6, 0.04)
    F.box(M.roof, 0, Hc + 0.12 + Hp + 0.05, pz, Wp + 0.4, 0.1, Lp + 0.4)
    // The stack, behind the pilothouse.
    const sz = pz - Lp / 2 - 0.55
    F.cyl(M.iron, 0, Hc + 0.12, sz, 0.13, 0.12, 2.3, 10)
    F.cyl(M.iron, 0, Hc + 2.4, sz, 0.2, 0.16, 0.12, 10)
    // Bitts fore and aft for the mooring lines.
    for (const [bx, bz] of [
      [B * 0.3, L / 2 - L * 0.22],
      [-B * 0.3, L / 2 - L * 0.22],
      [B * 0.3, -L / 2 + 0.6],
      [-B * 0.3, -L / 2 + 0.6],
    ])
      b.add(
        G("bitt8", () => new THREE.CylinderGeometry(0.1, 0.12, 1, 8)),
        M.trim,
        M4(bx, 0.25, bz, 0, 1, 0.5, 1),
        { uv: "keep" }
      )
    ctx.footprint(0, cz, Wc / 2, Lc / 2)
  },
  { hull: "hull", deck: "deck", trim: "trim", cabin: "cabin", roof: "roof", window: "window", void: "void", iron: "iron" }
)

// A pier: boards across a walkway of `length` along +z, on pilings that reach below the water, with taller mooring posts
// at intervals. `rickety` tilts boards and drops a few. Not solid: people walk on it.
export const pier = defineBuilder(
  z
    .object({
      length: size(80).default(12),
      width: size(8).default(2),
      depth: size(10).default(2.5),
      board: size(1).default(0.28),
      span: size(10).default(2.4),
      rickety: num(0, 1).default(0.3),
      posts: z.boolean().default(true),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const n = Math.floor(p.length / p.board)
    for (let i = 0; i < n; i++) {
      if (i > 2 && rand() < p.rickety * 0.06) continue
      const zz = (i + 0.5) * p.board
      const tilt = (rand() - 0.5) * p.rickety * 0.06
      b.add(
        G("box", () => new THREE.BoxGeometry(1, 1, 1)),
        M.plank,
        M4(rand(-0.04, 0.04) * p.rickety, -0.04, zz, rand(-0.03, 0.03) * p.rickety, p.width * rand(0.96, 1.04), 0.06, p.board * 0.9, 0, tilt)
      )
    }
    for (const sx of [-1, 1])
      b.add(
        G("box", () => new THREE.BoxGeometry(1, 1, 1)),
        M.post,
        M4((sx * p.width) / 2 - sx * 0.1, -0.16, p.length / 2, 0, 0.14, 0.16, p.length)
      )
    for (let zz = 0.2; zz <= p.length; zz += p.span)
      for (const sx of [-1, 1]) {
        const tall = p.posts && (Math.abs(zz - p.length) < p.span || rand() < 0.25)
        const top = tall ? rand(0.6, 1.0) : -0.1
        beam(b, M.post, [(sx * p.width) / 2, -p.depth, zz + rand(-0.1, 0.1)], [(sx * p.width) / 2 + rand(-0.04, 0.04) * p.rickety * 3, top, zz], rand(0.11, 0.14), 7, 0.11)
      }
  },
  { plank: "plank", post: "post" }
)

// A merchant ship at her moorings: a deep hull with a raised sterncastle, one to three masts with yards, sails set or
// furled, a bowsprit and stays. The bow points +z. Seen across a harbour, not walked on.
export const ship = defineBuilder(
  z
    .object({
      length: size(60).default(18),
      beam: size(16).default(5.5),
      masts: z.number().int().min(1).max(3).default(2),
      height: size(60).default(16),
      sails: z.enum(["set", "furled"]).default("furled"),
      freeboard: size(6).default(1.6),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const L = p.length
    const hull = hullOutline(L, p.beam, 0.32)
    plan(b, M.hull, scale(hull, 0.72, 0.9), -2, 1.2)
    plan(b, M.hull, scale(hull, 0.9, 0.97), -0.8, 1.0)
    plan(b, M.hull, hull, 0.2, p.freeboard - 0.2)
    plan(b, M.trim, scale(hull, 1.02, 1.01), p.freeboard - 0.15, 0.25)
    plan(b, M.deck, scale(hull, 0.92, 0.96), p.freeboard - 0.3, 0.32)
    const F = new Frame(b, M4())
    // Sterncastle and forecastle.
    F.box(M.hull, 0, p.freeboard + 1.1, -L / 2 + L * 0.13, p.beam * 0.86, 2.2, L * 0.24)
    F.box(M.trim, 0, p.freeboard + 2.25, -L / 2 + L * 0.13, p.beam * 0.9, 0.12, L * 0.25)
    F.box(M.hull, 0, p.freeboard + 0.6, L / 2 - L * 0.2, p.beam * 0.6, 1.2, L * 0.12)
    for (let i = 0; i < 4; i++) F.box(M.window, (i - 1.5) * p.beam * 0.18, p.freeboard + 1.2, -L / 2 + 0.02, 0.4, 0.5, 0.06)
    beam(b, M.mast, [0, p.freeboard, L / 2 - 1], [0, p.freeboard + 2.2, L / 2 + L * 0.18], 0.14, 6, 0.07)
    const tops: THREE.Vector3[] = []
    for (let m = 0; m < p.masts; m++) {
      const mz = p.masts === 1 ? 0 : -L * 0.12 + (m * L * 0.36) / (p.masts - 1)
      const h = p.height * (m === p.masts - 1 && p.masts > 1 ? 0.85 : 1)
      beam(b, M.mast, [0, p.freeboard, mz], [0, p.freeboard + h, mz], 0.22, 8, 0.1)
      tops.push(new THREE.Vector3(0, p.freeboard + h, mz))
      for (const [y, w] of [
        [0.88, 0.5],
        [0.55, 0.75],
      ] as const) {
        const yy = p.freeboard + h * y
        const half = (p.beam * w * 1.4) / 2
        beam(b, M.mast, [-half, yy, mz], [half, yy, mz], 0.09, 6, 0.09)
        if (p.sails === "furled") beam(b, M.sail, [-half * 0.9, yy - 0.15, mz + 0.05], [half * 0.9, yy - 0.15, mz + 0.05], 0.18, 6, 0.18)
        else {
          const drop = h * (y === 0.88 ? 0.28 : 0.3)
          const g = G(`sail${half.toFixed(2)}-${drop.toFixed(2)}`, () => {
            const s = new THREE.PlaneGeometry(half * 1.8, drop, 8, 6)
            const pos = s.attributes.position
            for (let i = 0; i < pos.count; i++) {
              const u = pos.getX(i) / (half * 0.9)
              const v = pos.getY(i) / (drop / 2)
              pos.setZ(i, (1 - u * u) * (1 - v * v * 0.6) * drop * 0.14)
            }
            s.computeVertexNormals()
            return s
          })
          b.add(g, M.sail, M4(0, yy - drop / 2 - 0.1, mz + 0.1), { uv: "keep" })
        }
      }
    }
    // Stays from the mastheads to bow and stern.
    for (const t of tops) {
      beam(b, M.rope, [t.x, t.y, t.z], [0, p.freeboard + 2, L / 2 + L * 0.17], 0.025, 4)
      beam(b, M.rope, [t.x, t.y, t.z], [0, p.freeboard + 2.3, -L / 2 + 0.5], 0.025, 4)
      for (const sx of [-1, 1]) beam(b, M.rope, [t.x, t.y * 0.92, t.z], [sx * p.beam * 0.5, p.freeboard, t.z - rand(0.5, 1.5)], 0.02, 4)
    }
  },
  { hull: "hull", deck: "deck", trim: "trim", mast: "mast", sail: "sail", rope: "rope", window: "window" }
)
