import * as THREE from "three"
import { z } from "zod"
import { beam, Frame, G, M4, type Sink, shape, V, type Vec2 } from "../kit/geometry"
import { defineBuilder, num, size, vec3 } from "./types"

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
    const helm = p.lit ? M.helm : M.void
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
    const Lp = Math.min(2.6, Lc * 0.38)
    const Wp = Wc * 0.82
    const Hp = Hc * 0.74
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
      F.box(helm, (side * Wp) / 2, py + Hp * 0.7, pz, 0.03, Hp * 0.5, Lp - 0.12)
      for (const k of [-1, 0, 1]) F.box(M.rust, side * (Wp / 2 + 0.02), py + Hp * 0.7, pz + (k * Lp) / 3, 0.03, Hp * 0.5, 0.05)
      F.box(helm, 0, py + Hp * 0.7, pz + (side * Lp) / 2, Wp - 0.12, Hp * 0.5, 0.03)
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
    F.cyl(M.iron, Wp * 0.18, py, sz, 0.14, 0.13, 3.1, 12)
    F.cyl(M.iron, Wp * 0.18, py + 3.1, sz, 0.18, 0.17, 0.14, 12)
    beam(b, M.iron, [-Wc * 0.25, py, z0 + 0.6], [-Wc * 0.25, py + 1.5, z0 + 0.6], 0.05, 6)
    beam(b, M.iron, [-Wc * 0.25, py + 1.5, z0 + 0.6], [-Wc * 0.25, py + 1.75, z0 + 0.35], 0.05, 6)
    // A rail round the cabin top aft of the pilothouse.
    railing(
      b,
      M.rust,
      [
        [-Wc / 2 - 0.08, z1 + 0.08],
        [-Wc / 2 - 0.08, z0 - 0.08],
        [Wc / 2 + 0.08, z0 - 0.08],
        [Wc / 2 + 0.08, z1 + 0.08],
      ],
      py,
      0.75,
      true
    )
    // Rope fenders hanging over both sides amidships.
    for (const side of [-1, 1])
      for (const t of [0.3, 0.42, 0.54, 0.66]) {
        const st = at(t)
        F.cyl(M.rope, side * (sideAt(st, -0.25) + 0.13), -0.62, st.z, 0.12, 0.12, 0.45, 8)
        beam(b, M.rope, V(side * (sideAt(st, -0.25) + 0.13), -0.17, st.z), V(side * (st.w - 0.05), st.top + 0.03, st.z), 0.012, 4)
      }
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
  { hull: "hull", strake: "strake", deck: "deck", rust: "rust", cabin: "cabin", roof: "roof", window: "window", helm: "window", void: "void", iron: "iron", ring: "rust", rope: "rope" }
)

// A cargo strongbox, as in Covert Cargo's crate: rough boards laid across each face with gaps between them, corner
// posts and a middle batten, a lid with a deep rim, skids underneath, iron corner plates and straps studded with rivets,
// a hasp with a chain hanging from it, and ring handles at the ends. Width along x, the front faces +z. Solid.
export const strongbox = defineBuilder(
  z
    .object({
      width: size(4).default(1.35),
      height: size(3).default(0.85),
      depth: size(3).default(0.92),
      lid: num(0.1, 0.4).default(0.24),
      boards: z.number().int().min(2).max(8).default(4),
      chain: z.boolean().default(true),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const F = new Frame(b, M4())
    const W = p.width
    const D = p.depth
    const skid = 0.06
    const H = p.height - skid
    const Hl = H * p.lid
    const Hb = H - Hl
    const t = 0.035
    const gap = 0.012
    F.box(M.inner, 0, skid + H / 2, 0, W - 2 * t, H - 0.02, D - 2 * t)
    for (const sx of [-0.36, 0.36]) F.box(M.wood, sx * W, skid / 2, 0, 0.12, skid, D + 0.02)
    // Boards across one face of the body or the lid, from y0 up h, each a little proud or sunk and slightly askew.
    const face = (y0: number, h: number, n: number, axis: "x" | "z", side: number) => {
      const len = axis === "x" ? W : D
      const off = axis === "x" ? D / 2 : W / 2
      for (let i = 0; i < n; i++) {
        const bh = h / n - gap
        const y = y0 + (i + 0.5) * (h / n)
        const proud = rand(-0.004, 0.006)
        const tilt = rand(-0.006, 0.006)
        if (axis === "x") F.box(M.wood, 0, y, side * (off - t / 2 + proud), len, bh, t, 0, 0, tilt)
        else F.box(M.wood, side * (off - t / 2 + proud), y, 0, t, bh, len - 2 * t, 0, tilt, 0)
      }
    }
    const n = p.boards
    for (const side of [-1, 1]) {
      face(skid, Hb, n, "x", side)
      face(skid, Hb, n, "z", side)
      face(skid + Hb + 0.004, Hl - 0.004, 2, "x", side)
      face(skid + Hb + 0.004, Hl - 0.004, 2, "z", side)
    }
    // The lid's top: boards along x, overhanging a little.
    const top = skid + H
    const lb = Math.max(3, Math.round(D / 0.2))
    for (let i = 0; i < lb; i++) {
      const w = (D + 0.05) / lb
      F.box(M.wood, rand(-0.006, 0.006), top + 0.018 + rand(-0.003, 0.003), -D / 2 - 0.025 + (i + 0.5) * w, W + 0.05, 0.036, w - gap, 0, rand(-0.008, 0.008))
    }
    // Corner posts on the front and back, a middle batten on each, and battens at the ends, proud of the boards.
    const bw = 0.085
    const bt = 0.03
    for (const side of [-1, 1]) {
      for (const sx of [-1, 1]) {
        F.box(M.wood, sx * (W / 2 - bw / 2), skid + Hb / 2, side * (D / 2 + bt / 2), bw, Hb - 0.01, bt)
        F.box(M.wood, sx * (W / 2 + bt / 2), skid + Hb / 2, side * (D / 2 - bw / 2), bt, Hb - 0.01, bw)
      }
      F.box(M.wood, 0, skid + Hb / 2, side * (D / 2 + bt / 2), bw * 1.2, Hb - 0.04, bt)
      for (const sx of [-1, 1]) F.box(M.wood, sx * W * 0.25, skid + Hb / 2, side * (D / 2 + bt / 2), bw, Hb - 0.04, bt)
    }
    // The lid's rim: a proud band round its foot, so the lid reads apart from the body.
    for (const side of [-1, 1]) {
      F.box(M.wood, 0, skid + Hb + 0.035, side * (D / 2 + bt / 2 + 0.006), W + 2 * bt + 0.012, 0.07, bt + 0.012)
      F.box(M.wood, side * (W / 2 + bt / 2 + 0.006), skid + Hb + 0.035, 0, bt + 0.012, 0.07, D + 2 * bt)
    }
    // Iron: corner plates folded round each vertical corner, straps over the lid and down the front, all riveted.
    const it = 0.008
    const rivet = (x: number, y: number, zz: number, nx: number, nz: number) =>
      F.geo(
        M.iron,
        G("rivet", () => new THREE.SphereGeometry(1, 6, 4)),
        M4(x + nx * (it + 0.004), y, zz + nz * (it + 0.004), 0, 0.011, 0.011, 0.011),
        { uv: "keep" }
      )
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        for (const [y, h] of [
          [skid + 0.09, 0.16],
          [skid + Hb - 0.08, 0.14],
          [skid + Hb + Hl / 2, Hl - 0.02],
        ] as const) {
          const x = sx * (W / 2 + bt + it / 2)
          const zz = sz * (D / 2 + bt + it / 2)
          F.box(M.iron, sx * (W / 2 - 0.03), y, zz, 0.1, h * 0.8, it)
          F.box(M.iron, x, y, sz * (D / 2 - 0.03), it, h * 0.8, 0.1)
          for (const k of [-0.22, 0.22]) {
            rivet(sx * (W / 2 - 0.05), y + k * h, sz * (D / 2 + bt), 0, sz)
            rivet(sx * (W / 2 + bt), y + k * h, sz * (D / 2 - 0.05), sx, 0)
          }
        }
    // Straps: across the lid front to back at the battens, then down the front of the lid as hinges' partners.
    for (const sx of [-W * 0.25, W * 0.25]) {
      F.box(M.iron, sx, top + 0.04, 0, 0.06, it, D + 0.06)
      for (const side of [-1, 1]) F.box(M.iron, sx, skid + Hb + Hl / 2, side * (D / 2 + bt + it / 2 + 0.002), 0.06, Hl, it)
      for (let k = 0; k < 5; k++)
        F.geo(
          M.iron,
          G("rivet", () => new THREE.SphereGeometry(1, 6, 4)),
          M4(sx, top + 0.046, -D / 2 + ((k + 0.5) * D) / 5, 0, 0.011, 0.008, 0.011),
          { uv: "keep" }
        )
    }
    // The hasp: a plate on the lid's front, a staple below it on the body, and a chain hanging from the staple.
    const fz = D / 2 + bt
    F.box(M.iron, 0, skid + Hb + 0.02, fz + 0.014, 0.07, 0.2, 0.012)
    F.box(M.iron, 0, skid + Hb - 0.07, fz + 0.016, 0.1, 0.07, 0.014)
    const ring = (r: number, tube: number) => G(`ring${r}-${tube}`, () => new THREE.TorusGeometry(r, tube, 6, 14))
    F.geo(M.iron, ring(0.022, 0.006), M4(0, skid + Hb - 0.1, fz + 0.03, Math.PI / 2), { uv: "keep" })
    if (p.chain) {
      let y = skid + Hb - 0.13
      for (let k = 0; k < 7; k++) {
        F.geo(M.iron, ring(0.022, 0.0065), M4(rand(-0.004, 0.004), y, fz + 0.032, k % 2 ? 0 : Math.PI / 2, 1, 1.5, 1), { uv: "keep" })
        y -= 0.052
      }
    }
    // Ring handles on brackets at both ends.
    for (const sx of [-1, 1]) {
      F.box(M.iron, sx * (W / 2 + bt + 0.01), skid + Hb * 0.72, 0, 0.02, 0.06, 0.1)
      F.geo(M.iron, ring(0.07, 0.011), M4(sx * (W / 2 + bt + 0.03), skid + Hb * 0.72 - 0.07, 0, Math.PI / 2), { uv: "keep" })
    }
    ctx.footprint(0, 0, W / 2 + 0.05, D / 2 + 0.05)
  },
  { wood: "crate", inner: "crateDark", iron: "iron" }
)

// Points from a to b sagging by `sag` at the middle, as a hanging line does.
function sagging(a: THREE.Vector3, c: THREE.Vector3, sag: number, n: number) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n
    return a
      .clone()
      .lerp(c, t)
      .add(V(0, -4 * sag * t * (1 - t), 0))
  })
}

// A rope from `from` to `to` (in the object's frame), sagging between them, with knots along it.
export const hangingRope = defineBuilder(
  z
    .object({
      from: vec3,
      to: vec3,
      sag: num(0, 20).default(0.1),
      radius: size(0.5).default(0.03),
      knots: z.number().int().min(0).max(12).default(0),
      segments: z.number().int().min(1).max(48).default(10),
    })
    .strict(),
  (ctx, p) => {
    const pts = sagging(V(...p.from), V(...p.to), p.sag, p.segments)
    for (let i = 0; i < pts.length - 1; i++) beam(ctx.b, ctx.M.rope, pts[i], pts[i + 1], p.radius, 7)
    for (let k = 0; k < p.knots; k++) {
      const at = pts[Math.round(((k + 1) / (p.knots + 1)) * p.segments)]
      ctx.b.add(
        G("knot", () => new THREE.SphereGeometry(1, 8, 6)),
        ctx.M.rope,
        M4(at.x, at.y, at.z, ctx.rand(0, Math.PI), p.radius * 2.2, p.radius * 2.6, p.radius * 2.2),
        { uv: "keep" }
      )
    }
  },
  { rope: "rope" }
)

// An iron chain from `from` to `to`, sagging between them: oval links, each turned a quarter from the last.
export const chainLine = defineBuilder(
  z
    .object({
      from: vec3,
      to: vec3,
      sag: num(0, 20).default(0.2),
      link: size(0.3).default(0.06),
    })
    .strict(),
  (ctx, p) => {
    const a = V(...p.from)
    const c = V(...p.to)
    const n = Math.min(400, Math.max(2, Math.round((a.distanceTo(c) + p.sag * 1.5) / (p.link * 0.8))))
    const pts = sagging(a, c, p.sag, n)
    const ring = G(`link${p.link}`, () => new THREE.TorusGeometry(p.link * 0.36, p.link * 0.1, 5, 12).scale(1, 1.45, 1))
    const up = V(0, 1, 0)
    for (let i = 0; i < n; i++) {
      const mid = pts[i]
        .clone()
        .add(pts[i + 1])
        .multiplyScalar(0.5)
      const dir = pts[i + 1].clone().sub(pts[i]).normalize()
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir).multiply(new THREE.Quaternion().setFromAxisAngle(up, i % 2 ? Math.PI / 2 : 0))
      ctx.b.add(ring, ctx.M.iron, new THREE.Matrix4().compose(mid, q, V(1, 1, 1)), { uv: "keep" })
    }
  },
  { iron: "iron" }
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
