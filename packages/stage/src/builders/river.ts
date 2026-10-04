import * as THREE from "three"
import { z } from "zod"
import { beam, Frame, G, M4, type Sink, shape, V, type Vec2 } from "../kit/geometry"
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

// A tug's hull, t from 0 at the stern to 1 at the bow: half-beam, deck-edge height (sheer), and keel depth.
function station(t: number, L: number, B: number, draft: number, sheer: number) {
  const half = B / 2
  const w = t < 0.6 ? half * Math.min(1, 0.8 + t * 1.3) : half * Math.cos(((t - 0.6) / 0.4) * (Math.PI / 2)) ** 0.7
  const top = sheer * Math.max(0, (t - 0.42) / 0.58) ** 2 + sheer * 0.3 * Math.max(0, (0.2 - t) / 0.2) ** 2
  const keel = -draft * (1 - 0.65 * Math.max(0, (t - 0.8) / 0.2) ** 1.4)
  return { z: -L / 2 + t * L, w: Math.max(w, 0.015), top, keel }
}
// Where the hull side is at height y: sections are rounded Us, near vertical at the top and full at the bilge.
function sideAt(st: ReturnType<typeof station>, y: number) {
  const c = THREE.MathUtils.clamp((st.top - y) / (st.top - st.keel), 0, 1) ** (1 / 0.6)
  return st.w * Math.sin(Math.acos(c))
}
// A band of hull skin between two heights (each a function of the station), lofted along the length. `inner` faces
// inward, for bulwarks seen from the deck.
function loft(
  L: number,
  B: number,
  draft: number,
  sheer: number,
  lo: (st: ReturnType<typeof station>) => number,
  hi: (st: ReturnType<typeof station>) => number,
  inner = false,
  inset = 1,
  n = 34,
  k = 7
) {
  const pos: number[] = []
  const rows: number[][] = []
  for (let i = 0; i <= n; i++) {
    const st = station(i / n, L, B, draft, sheer)
    const y0 = Math.min(lo(st), st.top)
    const y1 = Math.min(hi(st), st.top)
    const ring: number[] = []
    for (let side = -1; side <= 1; side += 2)
      for (let j = 0; j <= k; j++) {
        const y = side < 0 ? y1 - ((y1 - y0) * j) / k : y0 + ((y1 - y0) * j) / k
        ring.push(side * sideAt(st, y) * inset, y, st.z)
      }
    rows.push(ring)
  }
  const per = rows[0].length / 3
  for (let i = 0; i < n; i++)
    for (let j = 0; j < per - 1; j++) {
      if (j === k) continue
      const a = rows[i].slice(j * 3, j * 3 + 3)
      const b = rows[i].slice(j * 3 + 3, j * 3 + 6)
      const c = rows[i + 1].slice(j * 3, j * 3 + 3)
      const d = rows[i + 1].slice(j * 3 + 3, j * 3 + 6)
      if (inner) pos.push(...a, ...c, ...b, ...b, ...c, ...d)
      else pos.push(...a, ...b, ...c, ...b, ...d, ...c)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

// An old river tug, as in Covert Cargo's art: a lofted hull that rises to the bow, dark below a blue-grey strake and a
// rust rub rail; a pale cabin with rust trim, its forward saloon glazed and lit, small windows aft; a pilothouse with a
// rounded roof on the cabin top, a thin stack and a gooseneck vent; rails, life rings and bitts. Bow toward +z. Decks are
// at y = 0. The cabin is solid.
export const riverboat = defineBuilder(
  z
    .object({
      length: size(40).default(12),
      beam: size(12).default(3.6),
      draft: size(4).default(1.1),
      sheer: num(0, 3).default(0.9),
      // The cabin's share of the length, and the share of it at the fore end that is the lit saloon.
      cabin: num(0.3, 0.8).default(0.55),
      saloon: num(0, 1).default(0.4),
      height: size(4).default(2.1),
      lit: z.boolean().default(true),
    })
    .strict(),
  (ctx, p) => {
    const { b, M } = ctx
    const L = p.length
    const B = p.beam
    const band = -0.32
    const at = (t: number) => station(t, L, B, p.draft, p.sheer)
    b.add(
      loft(
        L,
        B,
        p.draft,
        p.sheer,
        (st) => st.keel,
        () => band
      ),
      M.hull,
      null,
      { uv: "planar" }
    )
    b.add(
      loft(
        L,
        B,
        p.draft,
        p.sheer,
        () => band,
        (st) => st.top
      ),
      M.strake,
      null,
      { uv: "planar" }
    )
    b.add(
      loft(
        L,
        B,
        p.draft,
        p.sheer,
        () => 0,
        (st) => st.top,
        true,
        0.97
      ),
      M.cabin,
      null,
      { uv: "planar" }
    )
    // Transom, deck, rub rail and gunwale cap.
    const stern = at(0)
    const transom: Vec2[] = []
    for (let j = 0; j <= 8; j++) {
      const y = stern.keel + ((stern.top - stern.keel) * j) / 8
      transom.unshift([sideAt(stern, y), y])
      transom.push([-sideAt(stern, y), y])
    }
    shape(b, M.hull, transom, 0.05, M4(0, 0, -L / 2))
    const n = 34
    const deck: Vec2[] = []
    const rub: THREE.Vector3[] = []
    const cap: THREE.Vector3[] = []
    for (let i = 0; i <= n; i++) {
      const st = at(i / n)
      deck.push([sideAt(st, 0) * 0.97, st.z])
      rub.push(new THREE.Vector3(sideAt(st, band) + 0.03, band, st.z))
      cap.push(new THREE.Vector3(st.w + 0.01, st.top + 0.03, st.z))
    }
    plan(
      b,
      M.deck,
      [
        ...deck,
        ...deck
          .slice()
          .reverse()
          .map(([x, zz]) => [-x, zz] as Vec2),
      ],
      -0.03,
      0.03
    )
    for (const side of [-1, 1])
      for (let i = 0; i < n; i++) {
        beam(b, M.rust, V(rub[i].x * side, rub[i].y, rub[i].z), V(rub[i + 1].x * side, rub[i + 1].y, rub[i + 1].z), 0.045, 5)
        beam(b, M.rust, V(cap[i].x * side, cap[i].y, cap[i].z), V(cap[i + 1].x * side, cap[i + 1].y, cap[i + 1].z), 0.04, 5)
      }
    // The cabin: pale planking, rust corner posts and fascia, a lit glazed saloon forward and small windows aft.
    const Wc = B * 0.72
    const Hc = p.height
    const Lc = L * p.cabin
    const z0 = -L / 2 + L * 0.13
    const z1 = z0 + Lc
    const zc = (z0 + z1) / 2
    const zs = z1 - Lc * p.saloon
    const F = new Frame(b, M4())
    const glow = p.lit ? M.window : M.void
    F.box(M.cabin, 0, Hc / 2, zc, Wc, Hc, Lc)
    for (const [x, zz] of [
      [-1, z0],
      [1, z0],
      [-1, z1],
      [1, z1],
      [-1, zs],
      [1, zs],
    ])
      F.box(M.rust, (x * Wc) / 2, Hc / 2, zz, 0.1, Hc, 0.1)
    F.box(M.rust, 0, Hc - 0.07, zc, Wc + 0.04, 0.14, Lc + 0.04)
    F.box(M.rust, 0, 0.08, zc, Wc + 0.04, 0.16, Lc + 0.04)
    F.box(M.roof, 0, Hc + 0.05, zc, Wc + 0.3, 0.1, Lc + 0.3)
    const pane = (x: number, y: number, zz: number, w: number, h: number, axis: "x" | "z", lit: boolean) => {
      const [sx, sz] = axis === "x" ? [0.03, w] : [w, 0.03]
      F.box(M.rust, x, y, zz, sx + (axis === "x" ? 0.02 : 0.12), h + 0.12, sz + (axis === "x" ? 0.12 : 0.02))
      F.box(lit ? glow : M.void, x + (axis === "x" ? Math.sign(x) * 0.012 : 0), y, zz + (axis === "z" ? Math.sign(zz - zc) * 0.012 : 0), sx, h, sz)
      F.box(M.rust, x + (axis === "x" ? Math.sign(x) * 0.02 : 0), y, zz + (axis === "z" ? Math.sign(zz - zc) * 0.02 : 0), axis === "x" ? 0.02 : 0.05, h, axis === "x" ? 0.05 : 0.02)
      F.box(M.rust, x + (axis === "x" ? Math.sign(x) * 0.02 : 0), y, zz + (axis === "z" ? Math.sign(zz - zc) * 0.02 : 0), axis === "x" ? 0.02 : w, 0.04, axis === "x" ? w : 0.02)
    }
    for (const side of [-1, 1]) {
      const x = side * (Wc / 2 + 0.015)
      const big = Math.max(1, Math.floor((z1 - zs) / 0.95))
      for (let i = 0; i < big; i++) pane(x, Hc * 0.56, zs + ((i + 0.5) * (z1 - zs)) / big, 0.7, 0.9, "x", true)
      const small = Math.max(1, Math.floor((zs - z0) / 0.85))
      for (let i = 0; i < small; i++) pane(x, Hc * 0.62, z0 + ((i + 0.5) * (zs - z0)) / small, 0.36, 0.44, "x", i % 3 !== 1)
    }
    // The saloon's fore face: a glazed door between two windows; the aft face: a door and a window.
    pane(0, 0.98, z1 + 0.015, 0.72, 1.7, "z", true)
    for (const sx of [-1, 1]) pane(sx * Wc * 0.31, Hc * 0.58, z1 + 0.015, 0.5, 0.8, "z", true)
    F.box(M.void, -Wc * 0.2, 0.95, z0 - 0.015, 0.7, 1.8, 0.03)
    pane(Wc * 0.22, Hc * 0.62, z0 - 0.015, 0.36, 0.44, "z", true)
    // The pilothouse, forward on the cabin top, with a rounded roof.
    const Lp = Math.min(2.1, Lc * 0.38)
    const Wp = Wc * 0.82
    const Hp = 1.55
    const pz = z1 - Lp / 2 - 0.15
    const py = Hc + 0.1
    F.box(M.cabin, 0, py + Hp * 0.22, pz, Wp, Hp * 0.44, Lp)
    for (const [x, zz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      F.box(M.rust, (x * Wp) / 2, py + Hp / 2, pz + (zz * Lp) / 2, 0.1, Hp, 0.1)
    for (const side of [-1, 1]) {
      F.box(glow, (side * Wp) / 2, py + Hp * 0.7, pz, 0.03, Hp * 0.5, Lp - 0.12)
      for (const k of [-1, 0, 1]) F.box(M.rust, side * (Wp / 2 + 0.02), py + Hp * 0.7, pz + (k * Lp) / 3, 0.03, Hp * 0.5, 0.05)
      F.box(glow, 0, py + Hp * 0.7, pz + (side * Lp) / 2, Wp - 0.12, Hp * 0.5, 0.03)
      for (const k of [-1, 0, 1]) F.box(M.rust, (k * Wp) / 3, py + Hp * 0.7, pz + side * (Lp / 2 + 0.02), 0.05, Hp * 0.5, 0.03)
    }
    F.box(M.rust, 0, py + Hp * 0.96, pz, Wp + 0.04, 0.1, Lp + 0.04)
    const R = Lp / 2 + 0.18
    // A half cylinder across the beam, arched up and flattened.
    b.add(
      G(`barrel${R.toFixed(2)}-${(Wp + 0.3).toFixed(2)}`, () => new THREE.CylinderGeometry(R, R, Wp + 0.3, 18, 1, false, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2)),
      M.roof,
      M4(0, py + Hp, pz, 0, 1, 0.32, 1),
      { uv: "keep" }
    )
    // The stack behind the pilothouse and a gooseneck vent aft, both thin.
    const sz = pz - Lp / 2 - 0.3
    F.cyl(M.iron, Wp * 0.18, py, sz, 0.08, 0.075, 2.3, 10)
    F.cyl(M.iron, Wp * 0.18, py + 2.3, sz, 0.11, 0.1, 0.1, 10)
    beam(b, M.iron, [-Wc * 0.25, py, z0 + 0.6], [-Wc * 0.25, py + 1.5, z0 + 0.6], 0.05, 6)
    beam(b, M.iron, [-Wc * 0.25, py + 1.5, z0 + 0.6], [-Wc * 0.25, py + 1.75, z0 + 0.35], 0.05, 6)
    // A rail round the cabin top aft of the pilothouse.
    railing(
      b,
      M.rust,
      [
        [-Wc / 2 - 0.08, pz - Lp / 2],
        [-Wc / 2 - 0.08, z0 - 0.08],
        [Wc / 2 + 0.08, z0 - 0.08],
        [Wc / 2 + 0.08, pz - Lp / 2],
      ],
      py,
      0.75
    )
    // Life rings on the cabin sides, bitts fore and aft.
    for (const side of [-1, 1])
      b.add(
        G("ring", () => new THREE.TorusGeometry(0.24, 0.055, 8, 20)),
        M.ring,
        M4(side * (Wc / 2 + 0.07), Hc * 0.4, z0 + 0.5, Math.PI / 2),
        { uv: "keep" }
      )
    for (const [bx, bz] of [
      [0.5, at(0.88).z],
      [-0.5, at(0.88).z],
      [0.6, -L / 2 + 0.5],
      [-0.6, -L / 2 + 0.5],
    ])
      b.add(
        G("bitt8", () => new THREE.CylinderGeometry(0.1, 0.12, 1, 8)),
        M.iron,
        M4(bx, 0.22, bz, 0, 1, 0.44, 1),
        { uv: "keep" }
      )
    ctx.footprint(0, zc, Wc / 2, Lc / 2)
  },
  { hull: "hull", strake: "strake", deck: "deck", rust: "rust", cabin: "cabin", roof: "roof", window: "window", void: "void", iron: "iron", ring: "rust" }
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
