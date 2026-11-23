import * as THREE from "three"
import { z } from "zod"
import { beam, Frame, G, M4, type Sink, shape, V, type Vec2 } from "../kit/geometry"
import { barrel, crate } from "./market"
import { defineBuilder, num, size, vec3 } from "./types"

// Rivers and harbours: a river barge with a lit cabin, a pier on pilings, and sailing ships at their moorings. Decks and
// pier boards sit at y = 0, where people stand; hulls and pilings reach down past the set's water line.

// An outline on the ground [x, z], extruded up from y0 by `depth` in the object's frame. (The bare `extrude` primitive's
// "xz" plane mirrors z; this does not.)
export function plan(b: Sink, mat: THREE.Material, pts: Vec2[], y0: number, depth: number) {
  shape(
    b,
    mat,
    pts.map(([x, zz]) => [x, -zz]),
    depth,
    M4(0, y0, 0, 0, 1, 1, 1, -Math.PI / 2)
  )
}
const scale = (pts: Vec2[], sx: number, sz: number): Vec2[] => pts.map(([x, zz]) => [x * sx, zz * sz])

// A point on the ground [x, z] lifted to height y, as box arguments.
const pick3 = ([x, zz]: readonly [number, number], y: number) => [x, y, zz] as const

// A hull seen from above: a square-cut stern at -z, straight sides, and a bow that curves to a point at +z.
export function hullOutline(L: number, B: number, bow = 0.3, n = 10): Vec2[] {
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
// How far round the hull's skin a point at height y lies below the deck edge, in metres.
function girth(st: ReturnType<typeof station>, y: number) {
  let d = 0
  let x0 = sideAt(st, st.top)
  let y0 = st.top
  for (let i = 1; i <= 10; i++) {
    const y1 = st.top + ((y - st.top) * i) / 10
    const x1 = sideAt(st, y1)
    d += Math.hypot(x1 - x0, y1 - y0)
    x0 = x1
    y0 = y1
  }
  return d
}
// A band of hull skin between two heights (each a function of the station), lofted along the length. `inner` faces
// inward, for bulwarks seen from the deck. Its uv is [girth below the deck edge, z], so strakes follow the sheer.
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
  const uv: number[] = []
  const rows: number[][] = []
  for (let i = 0; i <= n; i++) {
    const st = station(i / n, L, B, draft, sheer)
    const y0 = Math.min(lo(st), st.top)
    const y1 = Math.min(hi(st), st.top)
    const ring: number[] = []
    for (let side = -1; side <= 1; side += 2)
      for (let j = 0; j <= k; j++) {
        const y = side < 0 ? y1 - ((y1 - y0) * j) / k : y0 + ((y1 - y0) * j) / k
        ring.push(side * sideAt(st, y) * inset, y, st.z, girth(st, y))
      }
    rows.push(ring)
  }
  // Shared corners, so the skin shades as one curve from stern to bow and not a facet a station.
  const per = rows[0].length / 4
  const index: number[] = []
  for (const ring of rows)
    for (let j = 0; j < per; j++) {
      pos.push(ring[j * 4], ring[j * 4 + 1], ring[j * 4 + 2])
      uv.push(ring[j * 4 + 3], ring[j * 4 + 2])
    }
  for (let i = 0; i < n; i++)
    for (let j = 0; j < per - 1; j++) {
      if (j === k) continue
      const a = i * per + j
      const c = (i + 1) * per + j
      if (inner) index.push(a, c, a + 1, a + 1, c, c + 1)
      else index.push(a, a + 1, c, a + 1, c + 1, c)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(index)
  g.computeVertexNormals()
  g.userData.across = true
  return g
}

// A Valkaran river barge, as in Covert Cargo: a lofted plank hull that rises to the bow, tarred below a painted strake,
// with a timber rub rail and gunwale, and a wooden rail on stanchions round the deck's edge; a timber deckhouse of
// board-and-batten walls whose fore end rounds into a bow of windows round the door, leaded casements in wooden frames
// with awning shutters propped out above and drop shutters hung below, posts and knee braces under a planked roof; a
// short mast stepped on the roof aft with its sail furled on the yard, sweeps stowed on the roof, a steering oar over
// the stern, lanterns, bitts, barrels and fenders. Bow toward +z. Decks are at y = 0. The deckhouse is solid, or with
// `interior` the saloon is a room with an open door.
export const riverboat = defineBuilder(
  z
    .object({
      length: size(40).default(12),
      beam: size(12).default(3.6),
      draft: size(4).default(1.1),
      sheer: num(0, 3).default(0.9),
      // The deckhouse's share of the length and of the beam, and the share of its length at the fore end that is the lit saloon.
      cabin: num(0.3, 0.8).default(0.55),
      width: num(0.4, 0.9).default(0.72),
      saloon: num(0, 1).default(0.4),
      height: size(4).default(2.1),
      lit: z.boolean().default(true),
      // The saloon as a room people stand in: walls panelled inside, dark windows behind the lit panes, its bow door
      // standing open as the only way out, and a doorway aft into the owner's cabin.
      interior: z.boolean().default(false),
      // With `interior`, every other side window has its shutters closed. Without, every window stands open, so one on
      // the bank can see and shoot into the saloon through any of them.
      shutters: z.boolean().default(true),
      // With `interior`, whether the saloon's windows hold leaded glass. Off, each is an open hole in the wall with its
      // shutters propped up, as on most working boats, where glass was a rich man's: one on the bank sees and shoots in
      // with nothing between.
      glazed: z.boolean().default(true),
      // A mast on the roof aft with its sail furled on the yard, and sweeps stowed on the roof.
      mast: z.boolean().default(true),
      // The height of the water on the hull. Set, the hull carries a pale band of scum and weed there.
      waterline: num(-4, 0).optional(),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const L = p.length
    const B = p.beam
    const band = -0.32
    const at = (t: number) => station(t, L, B, p.draft, p.sheer)
    const F = new Frame(b, M4())
    // A plank from a to c, `w` wide along `across` and `d` thick: the long axis carries the grain.
    const slab = (mat: THREE.Material, a: THREE.Vector3, c: THREE.Vector3, across: THREE.Vector3, w: number, d: number) => {
      const zAx = c.clone().sub(a)
      const len = zAx.length()
      zAx.normalize()
      const xAx = across.clone().sub(zAx.clone().multiplyScalar(across.dot(zAx))).normalize()
      const yAx = zAx.clone().cross(xAx)
      const m = new THREE.Matrix4().makeBasis(xAx, yAx, zAx).scale(V(w, d, len)).setPosition(a.clone().add(c).multiplyScalar(0.5))
      b.add(G("box", () => new THREE.BoxGeometry(1, 1, 1)), mat, m)
    }
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
      { uv: "keep" }
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
      { uv: "keep" }
    )
    if (p.waterline !== undefined) {
      const wl = p.waterline
      b.add(
        loft(
          L,
          B,
          p.draft,
          p.sheer,
          () => wl - 0.06,
          () => wl + 0.2,
          false,
          1.012
        ),
        M.scum,
        null,
        { uv: "keep" }
      )
    }
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
      M.bulwark,
      null,
      { uv: "keep" }
    )
    // Transom, deck, a timber rub rail and gunwale cap.
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
        beam(b, M.trim, V(rub[i].x * side, rub[i].y, rub[i].z), V(rub[i + 1].x * side, rub[i + 1].y, rub[i + 1].z), 0.06, 6)
        beam(b, M.trim, V(cap[i].x * side, cap[i].y, cap[i].z), V(cap[i + 1].x * side, cap[i + 1].y, cap[i + 1].z), 0.055, 6)
      }
    shape(
      b,
      M.trim,
      [
        [-stern.w - 0.03, stern.top],
        [stern.w + 0.03, stern.top],
        [stern.w + 0.03, stern.top + 0.07],
        [-stern.w - 0.03, stern.top + 0.07],
      ],
      0.14,
      M4(0, 0, -L / 2 - 0.04)
    )
    // The stem rises above the bow and curls over in a carved scroll.
    const bow = at(1)
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * Math.PI * 1.2
      const a1 = ((k + 1) / 8) * Math.PI * 1.2
      const r0 = 0.32 - k * 0.022
      const r1 = 0.32 - (k + 1) * 0.022
      beam(b, M.trim, V(0, bow.top + 0.5 + Math.sin(a0) * r0, L / 2 - 0.3 + Math.cos(a0) * r0), V(0, bow.top + 0.5 + Math.sin(a1) * r1, L / 2 - 0.3 + Math.cos(a1) * r1), 0.07 - k * 0.004, 6)
    }
    beam(b, M.trim, V(0, bow.keel * 0.5, L / 2 + 0.02), V(0, bow.top + 0.5, L / 2 + 0.02), 0.09, 6, 0.08)

    // The rail round the deck's edge: stanchions a pace apart with a cap rail and a mid rail, low where the bow's bulwark
    // already stands high. A gap to port forward is the gangway. For the rules each length is a low wall one can see and
    // shoot over and take cover behind.
    const railTop = (st: ReturnType<typeof station>) => st.top + Math.max(0.3, 0.9 - st.top * 0.55)
    const gangway = (t: number) => t > 0.76 && t < 0.93
    const steps = Math.round(L / 1.05)
    for (const side of [-1, 1]) {
      let prev: { x: number; z: number; y: number; t: number } | null = null
      for (let i = 0; i <= steps; i++) {
        const t = 0.02 + (0.955 * i) / steps
        const st = at(t)
        const x = side * (st.w - 0.07)
        const y = railTop(st)
        const cur = { x, z: st.z, y, t }
        const open = side < 0 && gangway(t)
        if (!open) beam(b, M.trim, V(x, st.top, st.z), V(x, y + 0.03, st.z), 0.045, 4)
        if (prev && !(side < 0 && (gangway(prev.t) || gangway(t)))) {
          beam(b, M.trim, V(prev.x, prev.y + 0.04, prev.z), V(x, y + 0.04, st.z), 0.05, 6)
          const mid = (s: { x: number; z: number; y: number; t: number }) => V(s.x, (at(s.t).top + s.y) / 2, s.z)
          beam(b, M.trim, mid(prev), mid(cur), 0.03, 5)
          const len = Math.hypot(x - prev.x, st.z - prev.z)
          const nx = (st.z - prev.z) / len
          const nz = -(x - prev.x) / len
          ctx.footprint((x + prev.x) / 2, (st.z + prev.z) / 2, len / 2, 0.08, Math.atan2(nx, nz), Math.max(y, prev.y) + 0.05, Math.max(y, prev.y) + 0.05)
        }
        prev = open ? null : cur
        // Taller posts either side of the gangway.
        if (side < 0 && open !== gangway(0.02 + (0.955 * (i + 1)) / steps) && i < steps) {
          const t2 = open ? 0.02 + (0.955 * (i + 1)) / steps : t
          const s2 = at(t2)
          beam(b, M.trim, V(-(s2.w - 0.07), s2.top, s2.z), V(-(s2.w - 0.07), railTop(s2) + 0.3, s2.z), 0.07, 6)
          F.sphere(M.trim, -(s2.w - 0.07), railTop(s2) + 0.33, s2.z, 0.08, 0.06, 0.08, 8)
        }
      }
    }
    // Across the stern, between the corners.
    {
      const y = railTop(stern)
      const x = stern.w * 0.8 - 0.05
      const zz = -L / 2 + 0.12
      for (const k of [-1, -0.5, 0.5, 1]) beam(b, M.trim, V(k * x, stern.top, zz), V(k * x, y + 0.03, zz), 0.045, 4)
      beam(b, M.trim, V(-x, y + 0.04, zz), V(x, y + 0.04, zz), 0.05, 6)
      beam(b, M.trim, V(-x, (stern.top + y) / 2, zz), V(x, (stern.top + y) / 2, zz), 0.03, 5)
      ctx.footprint(0, zz, x, 0.08, 0, y + 0.05, y + 0.05)
    }

    // The deckhouse.
    const Wc = B * p.width
    const Hc = p.height
    const Lc = L * p.cabin
    const z0 = -L / 2 + L * 0.13
    const z1 = z0 + Lc
    const zc = (z0 + z1) / 2
    const zs = z1 - Lc * p.saloon
    const Lr = Wc * 0.42
    const zr = z1 - Lr
    const hw = Wc / 2
    const glow = p.lit ? M.window : M.void
    // The deckhouse's plan grown by `grow`: straight sides aft and an elliptical bow forward, `n` steps round the bow. A
    // saloon people stand in has a bow of seven flat panels, one per window, so each window opens in a flat wall.
    const N = p.interior ? 7 : 16
    const outline = (grow: number, n = N): Vec2[] => {
      const h = hw + grow
      const pts: Vec2[] = [
        [-h, z0 - grow],
        [h, z0 - grow],
      ]
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI
        pts.push([h * Math.cos(a), zr + (Lr + grow) * Math.sin(a)])
      }
      return pts
    }
    // A point on the bow at angle a (0 starboard, PI/2 dead ahead) and its outward normal.
    const bowAt = (a: number, grow: number) => {
      const h = hw + grow
      const nn = V(Math.cos(a) / h, 0, Math.sin(a) / (Lr + grow)).normalize()
      return { x: h * Math.cos(a), z: zr + (Lr + grow) * Math.sin(a), yaw: Math.atan2(nn.x, nn.z) }
    }
    const T = 0.08
    const L0 = T + 0.024
    const WY = Hc * 0.55
    const WH = Hc * 0.4
    const big = Math.max(1, Math.floor((zr - zs) / 0.95))
    // A point on a wall facing `yaw`: `u` along it, `v` up, `d` out from its face.
    const onWall = (x: number, y: number, zz: number, yaw: number) => (u: number, v: number, d: number) => V(x + Math.cos(yaw) * u + Math.sin(yaw) * d, y + v, zz - Math.sin(yaw) * u + Math.cos(yaw) * d)
    // Leaded lights: diamond quarrels of lead over a w x h pane, `d` out from the wall.
    const lattice = (P: ReturnType<typeof onWall>, w: number, h: number, d: number) => {
      const s = 0.13
      const k = 0.62
      for (const dir of [-1, 1])
        for (let c = -w / 2 - h * k; c <= w / 2 + h * k; c += s) {
          // u = c + dir * k * v, clipped to the pane.
          let v0 = -h / 2
          let v1 = h / 2
          const lo = (-w / 2 - c) / (dir * k)
          const hi = (w / 2 - c) / (dir * k)
          v0 = Math.max(v0, Math.min(lo, hi))
          v1 = Math.min(v1, Math.max(lo, hi))
          if (v1 - v0 < 0.02) continue
          beam(b, M.iron, P(c + dir * k * v0, v0, d), P(c + dir * k * v1, v1, d), 0.006, 4)
        }
    }
    // A casement seen from outside, centred on (x, y, z) in a wall facing `yaw`: a timber frame with a drip cap and a sill,
    // a mullion and transom, leaded glass, and shutters. `glass` is a real pane in an opening, or a lit or dark panel set
    // on a solid wall. Shutters: "drop" hangs an awning leaf from the head, propped out, and a drop leaf from the sill,
    // or with `shut` closes both over the window; "side" folds two leaves back flat against the wall, or closes them.
    const casement = (x: number, y: number, zz: number, yaw: number, w: number, h: number, glass: THREE.Material, opts: { pane?: boolean; open?: boolean; shut?: boolean; shutters?: "drop" | "side" | "none" } = {}) => {
      const P = onWall(x, y, zz, yaw)
      const e = V(Math.cos(yaw), 0, -Math.sin(yaw))
      const out = V(Math.sin(yaw), 0, Math.cos(yaw))
      const fw = 0.08
      const box = (u: number, v: number, d: number, bw: number, bh: number, bd: number, mat = M.trim) => {
        const c = P(u, v, d)
        F.box(mat, c.x, c.y, c.z, bw, bh, bd, yaw)
      }
      for (const o of [-1, 1]) box(o * (w / 2 + fw / 2), 0, 0.025, fw, h + 2 * fw, 0.05)
      box(0, h / 2 + fw / 2, 0.03, w + 2 * fw + 0.04, fw, 0.06)
      box(0, h / 2 + fw + 0.02, 0.06, w + 2 * fw + 0.14, 0.045, 0.12)
      box(0, -h / 2 - 0.03, 0.06, w + 2 * fw + 0.1, 0.055, 0.14)
      // `open`: no glass, no lead, no mullion: the frame round an empty hole.
      if (opts.open) {
        // nothing in the opening
      } else if (opts.pane) {
        const c = P(0, 0, -0.012)
        b.add(G("pane", () => new THREE.PlaneGeometry(1, 1)), glass, M4(c.x, c.y, c.z, yaw, w, h, 1), { uv: "keep" })
      } else box(0, 0, -0.004, w, h, 0.02, glass)
      if (!opts.open) {
        lattice(P, w, h, 0.004)
        box(0, 0, 0.012, 0.045, h, 0.03)
        box(0, h * 0.22, 0.012, w, 0.04, 0.03)
      }
      for (const o of [-1, 1]) box(o * (w / 2 - 0.015), 0, 0.012, 0.03, h, 0.03)
      box(0, h / 2 - 0.015, 0.012, w, 0.03, 0.03)
      box(0, -h / 2 + 0.015, 0.012, w, 0.03, 0.03)
      const kind = opts.shutters ?? "none"
      if (kind === "drop") {
        const lw = w + 0.08
        const hs = h / 2 + 0.03
        const top = P(0, h / 2 + fw, 0.09)
        const down = V(0, -1, 0)
        // The awning leaf: out and down from the head; shut, it hangs flat over the upper half.
        const th = opts.shut ? 0 : (62 * Math.PI) / 180
        const tip = top.clone().add(out.clone().multiplyScalar(Math.sin(th) * hs)).add(down.clone().multiplyScalar(Math.cos(th) * hs))
        slab(M.shutter, top, tip, e, lw, 0.035)
        const inward = out.clone().multiplyScalar(-Math.sin(th - Math.PI / 2) * 0.025)
        for (const o of [-0.32, 0.32]) slab(M.iron, top.clone().add(e.clone().multiplyScalar(o * lw)).add(inward), tip.clone().add(e.clone().multiplyScalar(o * lw)).add(inward), e, 0.04, 0.012)
        for (const f of [0.3, 0.85]) {
          const c = top.clone().lerp(tip, f).add(out.clone().multiplyScalar(-Math.cos(th) * 0.0).add(V(0, 0.02 * Math.sin(th), 0)))
          slab(M.trim, c.clone().add(e.clone().multiplyScalar(-lw / 2 + 0.03)), c.clone().add(e.clone().multiplyScalar(lw / 2 - 0.03)), V(0, 1, 0).applyAxisAngle(e, 0), 0.06, 0.04)
        }
        if (!opts.shut)
          for (const o of [-1, 1]) beam(b, M.trim, P(o * (w / 2 + 0.02), -h / 2, 0.12), tip.clone().add(e.clone().multiplyScalar(o * (lw / 2 - 0.06))).add(V(0, -0.02, 0)), 0.014, 4)
        // The drop leaf: hung from below the sill flat against the wall; shut, it stands up over the lower half.
        const foot = P(0, -h / 2 - 0.06, opts.shut ? 0.16 : 0.03)
        const end = opts.shut ? foot.clone().add(V(0, hs, 0)) : foot.clone().add(V(0, -hs, 0))
        slab(M.shutter, foot, end, e, lw, 0.035)
        for (const o of [-0.32, 0.32]) slab(M.iron, foot.clone().add(e.clone().multiplyScalar(o * lw)).add(out.clone().multiplyScalar(0.02)), end.clone().add(e.clone().multiplyScalar(o * lw)).add(out.clone().multiplyScalar(0.02)), e, 0.04, 0.012)
      } else if (kind === "side") {
        const lw = w / 2 + 0.02
        for (const o of [-1, 1]) {
          const u = opts.shut ? (o * lw) / 2 : o * (w / 2 + fw + lw / 2 + 0.01)
          const d = opts.shut ? 0.08 : 0.03
          box(u, 0, d, lw - 0.01, h + 0.06, 0.035, M.shutter)
          for (const v of [-h * 0.3, h * 0.3]) box(u, v, d + 0.02, lw - 0.05, 0.05, 0.012, M.iron)
          box(u, 0, d + 0.02, 0.05, h * 0.62, 0.012, M.trim)
        }
      }
    }
    // Board-and-batten: upright boards on a grid along a wall, each a little proud or sunk, and battens over the seams.
    // `P` is the wall's frame from its start, `len` its length; boards fill u0..u1 and v0..v1, T deep.
    const BW = 0.3
    const boards = (P: ReturnType<typeof onWall>, len: number, u0: number, u1: number, v0: number, v1: number, yaw: number) => {
      if (u1 - u0 < 0.005 || v1 - v0 < 0.005) return
      for (let k = Math.floor((u0 + len / 2) / BW); k * BW - len / 2 < u1; k++) {
        const a = Math.max(u0, k * BW - len / 2)
        const c = Math.min(u1, (k + 1) * BW - len / 2)
        if (c - a < 0.004) continue
        const m = P((a + c) / 2, (v0 + v1) / 2, -T / 2 + rand(-0.004, 0.004))
        F.box(M.wall, m.x, m.y, m.z, c - a - 0.004, v1 - v0, T, yaw)
        const s = k * BW - len / 2
        if (s > u0 + 0.03 && s < u1 - 0.03) {
          const q = P(s, (v0 + v1) / 2, 0.012)
          F.box(M.trim, q.x, q.y, q.z, 0.055, v1 - v0, 0.025, yaw)
        }
      }
    }
    // A wall from (ax, az) to (cx, cz), its outer face on that line and facing out to the right of the way it runs.
    const wallFrame = (ax: number, az: number, cx: number, cz: number) => {
      const len = Math.hypot(cx - ax, cz - az)
      const nx = (cz - az) / len
      const nz = -(cx - ax) / len
      const yaw = Math.atan2(nx, nz)
      const mx = (ax + cx) / 2
      const mz = (az + cz) / 2
      return { len, yaw, mx, mz, P: onWall(mx, 0, mz, yaw) }
    }
    // Inside, a window is a deep timber frame on the wall's inner face: jambs, a head and a sill, dark glass with leaded
    // lights, and on every other window along the sides a pair of closed shutters.
    const inner = (x: number, y: number, zz: number, yaw: number, w: number, h: number, shut = false, open = false) => {
      const ins = (d: number, o = 0) => [x - Math.sin(yaw) * d + Math.cos(yaw) * o, zz - Math.cos(yaw) * d - Math.sin(yaw) * o] as const
      for (const o of [-1, 1]) F.box(M.post, ...pick3(ins(L0 + 0.05, o * (w / 2 + 0.05)), y), 0.1, h + 0.2, 0.1, yaw)
      F.box(M.post, ...pick3(ins(L0 + 0.05), y + h / 2 + 0.05), w + 0.2, 0.1, 0.1, yaw)
      F.box(M.post, ...pick3(ins(L0 + 0.08), y - h / 2 - 0.04), w + 0.34, 0.06, 0.16, yaw)
      // The glass's inner face, faint, facing into the room.
      if (!open)
        b.add(
          G("pane", () => new THREE.PlaneGeometry(1, 1)),
          M.night,
          M4(...pick3(ins(T * 0.5), y), yaw + Math.PI, w, h, 1),
          { uv: "keep" }
        )
      if (shut) {
        for (const o of [-1, 1]) F.box(M.panel, ...pick3(ins(L0 + 0.06, (o * w) / 4), y), w / 2 - 0.01, h, 0.03, yaw)
        for (const o of [-1, 1]) for (const dy of [-0.3, 0.3]) F.box(M.iron, ...pick3(ins(L0 + 0.08, (o * w) / 4), y + dy * h), w / 2 - 0.06, 0.04, 0.01, yaw)
        return
      }
      if (open) return
      lattice(onWall(x, y, zz, yaw), w, h, -T - 0.004)
      F.box(M.post, ...pick3(ins(T + 0.02), y), 0.04, h, 0.03, yaw)
      F.box(M.post, ...pick3(ins(T + 0.02), y + h * 0.22), w, 0.035, 0.03, yaw)
    }

    // The aft cabin is solid: a dark core clad in boards on its three outer faces.
    const aft = p.interior ? zs : zr
    if (!p.interior) plan(b, M.void, outline(-T), 0, Hc)
    else {
      plan(
        b,
        M.void,
        [
          [-hw + T, z0 + T],
          [hw - T, z0 + T],
          [hw - T, zs],
          [-hw + T, zs],
        ],
        0,
        Hc
      )
      ctx.footprint(0, (z0 + zs) / 2, hw, (zs - z0) / 2, 0, undefined, Hc)
    }
    for (const [ax, az, cx, cz] of [
      [hw, z0, hw, aft],
      [-hw, aft, -hw, z0],
      [-hw, z0, hw, z0],
    ]) {
      const f = wallFrame(ax, az, cx, cz)
      boards(f.P, f.len, -f.len / 2, f.len / 2, 0, Hc, f.yaw)
    }
    if (!p.interior) {
      // Without a room, the bow is clad over the core and the windows set on as lit panels, a closed door dead ahead.
      const pts = outline(0)
      for (let i = 2; i < pts.length - 1; i++) {
        const f = wallFrame(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])
        boards(f.P, f.len, -f.len / 2, f.len / 2, 0, Hc, f.yaw)
      }
      for (const side of [-1, 1]) for (let i = 0; i < big; i++) casement(side * hw, WY, zs + ((i + 0.5) * (zr - zs)) / big, (side * Math.PI) / 2, 0.72, WH, glow, { shutters: "drop" })
      for (let k = 0; k < 7; k++) {
        const w = bowAt((Math.PI * (k + 0.5)) / 7, 0)
        if (k === 3) F.box(M.door, w.x, 1.0, w.z, 0.8, 2.0, 0.06, w.yaw)
        else casement(w.x, WY, w.z, w.yaw, 0.5, WH, glow, { shutters: "drop" })
      }
      ctx.footprint(0, zc, Wc / 2, Lc / 2, 0, undefined, Hc)
    } else {
      // The saloon's aft bulkhead, lined with upright boards, and the doorway to the owner's cabin to port in it: a timber
      // frame, and the planked door standing open flat against the bulkhead, strap hinges and a ring pull.
      const lining = (cx: number, cz: number, yaw: number, len: number, y0 = 0, y1 = Hc) => {
        const k = Math.max(1, Math.ceil(len / 0.9))
        for (let j = 0; j < k; j++) {
          const o = -len / 2 + ((j + 0.5) * len) / k
          F.box(M.panel, cx + Math.cos(yaw) * o, (y0 + y1) / 2, cz - Math.sin(yaw) * o, len / k - 0.006, y1 - y0, 0.024, yaw)
        }
      }
      lining(0, zs + 0.012, 0, Wc - 2 * T)
      const dx = -Wc * 0.27
      F.box(M.void, dx, 0.98, zs + 0.03, 0.8, 1.96, 0.02)
      for (const side of [-1, 1]) F.box(M.post, dx + side * 0.46, 1.04, zs + 0.06, 0.12, 2.08, 0.1)
      F.box(M.post, dx, 2.1, zs + 0.06, 1.06, 0.14, 0.1)
      F.box(M.door, dx + 0.94, 0.98, zs + 0.05, 0.78, 1.92, 0.05)
      for (const y of [0.35, 1.6]) F.box(M.iron, dx + 0.82, y, zs + 0.08, 0.5, 0.05, 0.01)
      b.add(
        G("ring", () => new THREE.TorusGeometry(0.24, 0.055, 8, 20)),
        M.iron,
        M4(dx + 1.22, 1.0, zs + 0.085, 0, 0.3, 0.3, 0.3),
        { uv: "keep" }
      )
      // The walls, with real openings: the windows along the sides and one in each bow panel, and the doorway dead ahead.
      // Every other side window has its shutters closed.
      const walls: Vec2[] = [[hw, zs], ...outline(0).slice(2), [-hw, zs]]
      for (let i = 0; i < walls.length - 1; i++) {
        const [ax, az] = walls[i]
        const [cx, cz] = walls[i + 1]
        const { len, yaw, mx, mz, P } = wallFrame(ax, az, cx, cz)
        const nx = Math.sin(yaw)
        const nz = Math.cos(yaw)
        const ex = Math.cos(yaw)
        const ez = -Math.sin(yaw)
        const side = i === 0 || i === walls.length - 2
        const opens = side
          ? Array.from({ length: big }, (_, j) => ({ o: (zs + ((j + 0.5) * (zr - zs)) / big - mz) * ez, w: 0.72, y0: WY - WH / 2, y1: WY + WH / 2, shut: p.shutters && j % 2 === 1, door: false }))
          : Math.abs(mx) < 0.6
            ? [{ o: 0, w: 0.79, y0: 0, y1: 2.05, shut: false, door: true }]
            : [{ o: 0, w: 0.62, y0: WY - WH / 2, y1: WY + WH / 2, shut: false, door: false }]
        opens.sort((a, c) => a.o - c.o)
        const cuts = [-len / 2 - 0.02, ...opens.flatMap((q) => [q.o - q.w / 2, q.o + q.w / 2]), len / 2 + 0.02]
        const inAt = (u: number, d: number) => [mx + ex * u - nx * d, mz + ez * u - nz * d] as const
        const piece = (u0: number, u1: number, v0: number, v1: number) => {
          if (u1 - u0 < 0.005 || v1 - v0 < 0.005) return
          boards(P, len, u0, u1, v0, v1, yaw)
          lining(...inAt((u0 + u1) / 2, T + 0.012), yaw, u1 - u0, v0, v1)
        }
        for (let j = 0; j < cuts.length - 1; j++) {
          const q = j % 2 === 1 ? opens[(j - 1) / 2] : null
          if (q) {
            piece(cuts[j], cuts[j + 1], 0, q.y0)
            piece(cuts[j], cuts[j + 1], q.y1, Hc)
          } else piece(cuts[j], cuts[j + 1], 0, Hc)
          // An open window stands only as high as its sill for the rules, so one on the bank can shoot or cast through
          // it from cover. A shuttered one is wall.
          if (!q?.door) ctx.footprint(...inAt((cuts[j] + cuts[j + 1]) / 2, T / 2), (cuts[j + 1] - cuts[j]) / 2, T / 2 + 0.03, yaw, undefined, q && !q.shut ? q.y0 : Hc)
        }
        for (const q of opens) {
          if (q.door) continue
          const [wx, wz] = inAt(q.o, 0)
          casement(wx, WY, wz, yaw, q.w, WH, M.pane, { pane: true, open: !p.glazed && !q.shut, shut: q.shut, shutters: "drop" })
          inner(wx, WY, wz, yaw, q.w, WH, q.shut, !p.glazed && !q.shut)
        }
      }
      // Along each side: ribs between the windows, a rail under them, and a skirting board.
      for (const side of [-1, 1]) {
        const x = side * (hw - L0)
        for (let i = 0; i <= big; i++) F.box(M.post, x - side * 0.07, Hc / 2, zs + 0.07 + (i * (zr - zs - 0.07)) / big, 0.14, Hc, 0.16)
        F.box(M.post, x - side * 0.04, Hc * 0.55 - Hc * 0.2 - 0.1, (zs + zr) / 2, 0.08, 0.07, zr - zs)
        F.box(M.post, x - side * 0.02, 0.08, (zs + zr) / 2, 0.04, 0.16, zr - zs)
      }
      // The ceiling: dark boards, two fore-and-aft carlins, and deep beams across with knee braces down to the ribs.
      const inside = (zz: number) => (zz <= zr ? hw - L0 : hw * Math.sqrt(Math.max(0, 1 - ((zz - zr) / Lr) ** 2)) - L0 - 0.05)
      const room: Vec2[] = [
        [hw - L0, zs],
        ...outline(-L0)
          .slice(2)
          .filter(([, zz]) => zz >= zr),
        [-hw + L0, zs],
      ]
      plan(b, M.ceiling, room, Hc - 0.035, 0.03)
      plan(b, M.floor, room, 0, 0.006)
      for (const side of [-1, 1]) F.box(M.post, side * Wc * 0.25, Hc - 0.12, (zs + zr) / 2, 0.16, 0.18, zr - zs)
      const beams = Math.round((z1 - 0.6 - zs) / 1.1)
      for (let k = 1; k <= beams; k++) {
        const zz = zs + ((z1 - 0.6 - zs) * k) / (beams + 0.4)
        const half = inside(zz)
        F.box(M.post, 0, Hc - 0.17, zz, half * 2, 0.26, 0.2)
        if (zz < zr) for (const side of [-1, 1]) F.box(M.post, side * (half - 0.2), Hc - 0.48, zz, 0.11, 0.48, 0.14, 0, 0, (side * Math.PI) / 4)
      }
      // The door stands open on its port hinge in a heavy timber frame under a carved lintel: planks with iron studs, strap
      // hinges, a small barred grille, and an iron ring pull.
      const hingeAt = bowAt((Math.PI * 9) / 16, 0)
      for (const a of [(Math.PI * 7) / 16, (Math.PI * 9) / 16]) {
        const post = bowAt(a, 0)
        F.box(M.trim, post.x, 1.04, post.z, 0.14, 2.1, 0.16, post.yaw)
        F.box(M.post, post.x - Math.sin(post.yaw) * 0.11, 1.04, post.z - Math.cos(post.yaw) * 0.11, 0.12, 2.08, 0.06, post.yaw)
      }
      F.box(M.trim, 0, 2.12, z1 + 0.03, 1.08, 0.14, 0.16)
      F.box(M.trim, 0, 2.24, z1 + 0.06, 1.24, 0.08, 0.2)
      F.box(M.post, 0, 2.12, z1 - 0.09, 1.0, 0.14, 0.06)
      const lx = hingeAt.x - 0.05
      const lz = hingeAt.z + 0.4
      F.box(M.door, lx, 1.0, lz, 0.05, 1.96, 0.76)
      F.box(glow, lx, 1.5, lz, 0.056, 0.2, 0.24)
      for (const side of [-1, 1]) {
        const fx = lx + side * 0.03
        for (const zo of [-0.06, 0, 0.06]) F.box(M.iron, fx, 1.5, lz + zo, 0.012, 0.22, 0.014)
        F.box(M.iron, fx, 1.5, lz, 0.012, 0.014, 0.26)
        for (const y of [0.3, 1.0, 1.75]) F.box(M.iron, fx, y, lz - 0.15, 0.01, 0.06, 0.48)
        for (const y of [0.55, 0.8, 1.15, 1.75]) for (const zo of [-0.28, 0.28]) F.sphere(M.iron, fx + side * 0.008, y, lz + zo, 0.014, 0.014, 0.014, 6)
        b.add(G("ring", () => new THREE.TorusGeometry(0.24, 0.055, 8, 20)), M.iron, M4(fx + side * 0.01, 0.95, lz + 0.3, Math.PI / 2, 0.28, 0.28, 0.28), { uv: "keep" })
      }
      ctx.footprint(lx, lz, 0.05, 0.38, 0, undefined, 1.98)
      // The way in and out, for walks: a step inside the doorway and a step outside it.
      ctx.anchor("door", 0, 0, z1 - 0.6)
      ctx.anchor("door", 0, 0, z1 + 0.6)
    }
    // Small casements along the aft cabin, lit but for one in three shuttered, and on its aft face a window and a door.
    for (const side of [-1, 1]) {
      const small = Math.max(1, Math.floor((zs - z0) / 0.85))
      for (let i = 0; i < small; i++) {
        const shut = i % 3 === 1
        casement(side * hw, Hc * 0.6, z0 + ((i + 0.5) * (zs - z0)) / small, (side * Math.PI) / 2, 0.38, 0.5, shut ? M.void : glow, { shut, shutters: "side" })
      }
    }
    casement(Wc * 0.22, Hc * 0.6, z0, Math.PI, 0.38, 0.5, glow, { shutters: "side" })
    F.box(M.door, -Wc * 0.2, 0.95, z0 - 0.03, 0.72, 1.86, 0.04)
    for (const y of [0.4, 1.5]) F.box(M.iron, -Wc * 0.2 + 0.1, y, z0 - 0.055, 0.5, 0.05, 0.01)
    for (const o of [-1, 1]) F.box(M.trim, -Wc * 0.2 + o * 0.42, 1.0, z0 - 0.04, 0.1, 2.0, 0.07)
    F.box(M.trim, -Wc * 0.2, 1.98, z0 - 0.05, 0.98, 0.1, 0.1)
    // Posts at the corners and down the sides between the windows, and round the bow between its panels; a sill plate at
    // the foot and a wall plate under the eaves.
    for (const side of [-1, 1]) {
      const x = side * (hw + 0.03)
      for (const zz of [z0, zs]) F.box(M.trim, x, Hc / 2, zz, 0.16, Hc, 0.16)
      for (let i = 1; i <= big; i++) F.box(M.trim, x, Hc / 2, zs + (i * (zr - zs)) / big, 0.1, Hc, 0.12)
    }
    for (let k = 1; k < 7; k++) {
      const post = bowAt((Math.PI * k) / 7, 0.03)
      if (p.interior && (k === 3 || k === 4)) continue
      F.box(M.trim, post.x, Hc / 2, post.z, 0.11, Hc, 0.11, post.yaw)
    }
    const ring = (grow: number, y: number, h: number, d: number) => {
      const pts = outline(grow)
      for (let i = 0; i < pts.length; i++) {
        const [ax, az] = pts[i]
        const [cx, cz] = pts[(i + 1) % pts.length]
        const len = Math.hypot(cx - ax, cz - az)
        if (len < 0.01) continue
        F.box(M.trim, (ax + cx) / 2, y, (az + cz) / 2, len + d, h, d, Math.atan2(cx - ax, cz - az) + Math.PI / 2)
      }
    }
    ring(0.03, Hc - 0.1, 0.2, 0.07)
    // The roof: planks on a frame, overhanging as eaves with a fascia board, and knee braces under the eaves.
    plan(b, M.roof, outline(0.4), Hc, 0.1)
    ring(0.42, Hc + 0.02, 0.2, 0.05)
    for (const side of [-1, 1])
      for (let i = 0; i <= big + 2; i++) {
        const zz = i <= big ? zs + (i * (zr - zs)) / big : i === big + 1 ? z0 + 0.08 : (z0 + zs) / 2
        beam(b, M.trim, V(side * (hw + 0.05), Hc - 0.62, zz), V(side * (hw + 0.36), Hc - 0.02, zz), 0.035, 4)
      }
    // A lantern on an iron bracket over the door, and one on a pole at the stern.
    const lantern = (x: number, y: number, zz: number) => {
      F.box(M.iron, x, y + 0.3, zz, 0.2, 0.03, 0.2)
      F.cyl(M.iron, x, y + 0.31, zz, 0.15, 0.03, 0.12, 4)
      F.box(M.iron, x, y, zz, 0.18, 0.03, 0.18)
      F.box(M.lamp, x, y + 0.15, zz, 0.13, 0.26, 0.13)
      for (const [dx, dz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        F.box(M.iron, x + dx * 0.075, y + 0.15, zz + dz * 0.075, 0.018, 0.29, 0.018)
      b.add(G("ring", () => new THREE.TorusGeometry(0.24, 0.055, 8, 20)), M.iron, M4(x, y + 0.48, zz, 0, 0.18, 0.18, 0.18), { uv: "keep" })
    }
    if (p.interior) {
      beam(b, M.iron, V(0, 2.62, z1 + 0.08), V(0, 2.62, z1 + 0.42), 0.018, 5)
      beam(b, M.iron, V(0, 2.4, z1 + 0.08), V(0, 2.62, z1 + 0.3), 0.012, 4)
      lantern(0, 1.98, z1 + 0.4)
    }
    beam(b, M.trim, V(-stern.w * 0.62, stern.top, -L / 2 + 0.3), V(-stern.w * 0.62, 2.1, -L / 2 + 0.3), 0.05, 6)
    beam(b, M.iron, V(-stern.w * 0.62, 2.05, -L / 2 + 0.3), V(-stern.w * 0.62 + 0.3, 2.05, -L / 2 + 0.3), 0.015, 4)
    lantern(-stern.w * 0.62 + 0.3, 1.45, -L / 2 + 0.3)
    // The bow lantern, hung from the stem's scroll.
    beam(b, M.iron, V(0, bow.top + 0.55, L / 2 - 0.25), V(0, bow.top + 0.15, L / 2 - 0.25), 0.01, 4)
    lantern(0, bow.top - 0.4, L / 2 - 0.25)

    // The steering oar on the starboard quarter: its loom pivots in a crutch on a post at the transom, runs forward over
    // the aft deck to a grip, and back and out to a broad blade in the water.
    const sx = stern.w * 0.55
    const pivot = V(sx, stern.top + 0.95, -L / 2 - 0.05)
    beam(b, M.trim, V(sx, stern.keel * 0.5, -L / 2 - 0.1), V(sx, pivot.y - 0.05, -L / 2 - 0.1), 0.1, 6, 0.08)
    for (const o of [-1, 1]) beam(b, M.trim, V(sx + o * 0.08, pivot.y - 0.1, -L / 2 - 0.1), V(sx + o * 0.11, pivot.y + 0.16, -L / 2 - 0.1), 0.03, 4)
    const grip = V(sx - 0.55, stern.top + 0.75, -L / 2 + 1.75)
    const dir = pivot.clone().sub(grip).normalize()
    const end = pivot.clone().add(dir.clone().multiplyScalar(2.2))
    end.y = -1.15
    beam(b, M.mast, grip, pivot, 0.055, 6)
    beam(b, M.mast, pivot, end, 0.055, 6, 0.06)
    const along = end.clone().sub(pivot).normalize()
    slab(M.trim, end.clone().sub(along.clone().multiplyScalar(0.3)), end.clone().add(along.clone().multiplyScalar(1.3)), V(0, 1, 0).cross(along), 0.4, 0.05)
    beam(b, M.mast, grip.clone().add(V(-0.12, 0, -0.04)), grip.clone().add(V(0.12, 0, 0.04)), 0.03, 5)

    // Timber bitts fore and aft with rope turned round them, coils on deck, and rope fenders over both sides amidships.
    const bitts = (x: number, zz: number) => {
      for (const o of [-0.16, 0.16]) beam(b, M.trim, V(x + o, 0, zz), V(x + o, 0.5, zz), 0.07, 6)
      F.box(M.trim, x, 0.38, zz, 0.5, 0.07, 0.08)
      b.add(G("coil", () => new THREE.TorusGeometry(0.1, 0.025, 6, 14)), M.rope, M4(x - 0.16, 0.22, zz, 0, 1, 1, 1, Math.PI / 2), { uv: "keep" })
    }
    bitts(0, at(0.9).z)
    bitts(-0.45, -L / 2 + 0.55)
    for (const [x, zz, r] of [
      [-0.55, at(0.86).z, 0.24],
      [0.15, -L / 2 + 0.95, 0.22],
    ])
      for (let k = 0; k < 3; k++) b.add(G(`coilr${(r - k * 0.04).toFixed(2)}`, () => new THREE.TorusGeometry(r - k * 0.04, 0.045, 6, 18)), M.rope, M4(x, 0.05 + k * 0.08, zz, 0, 1, 1, 1, Math.PI / 2), { uv: "keep" })
    for (const side of [-1, 1])
      for (const t of [0.3, 0.42, 0.54, 0.66]) {
        const st = at(t)
        F.cyl(M.rope, side * (sideAt(st, -0.25) + 0.13), -0.62, st.z, 0.12, 0.12, 0.45, 8)
        beam(b, M.rope, V(side * (sideAt(st, -0.25) + 0.13), -0.17, st.z), V(side * (st.w - 0.05), st.top + 0.03, st.z), 0.02, 5)
      }
    // Two barrels lashed on the foredeck to starboard.
    {
      const st = at(0.8)
      const bx = st.w - 0.62
      barrel(b, M, bx, 0, st.z - 0.35, 0.3, 0.82)
      barrel(b, M, bx - 0.1, 0, st.z + 0.32, 0.27, 0.75)
      ctx.circle(bx, st.z - 0.35, 0.32, 0.82)
      ctx.circle(bx - 0.1, st.z + 0.32, 0.29, 0.75)
      beam(b, M.rope, V(bx + 0.3, 0.5, st.z - 0.7), V(bx + 0.27, 0.5, st.z + 0.7), 0.014, 4)
    }

    // On the roof: cargo forward under a lashed tarpaulin, two sweeps on chocks along the sides, and the mast aft.
    const ry = Hc + 0.1
    if (p.mast) {
      for (const side of [-1, 1]) {
        const x = side * (hw - 0.2)
        for (const zz of [z0 + 0.6, zs + 0.5, zr - 0.6]) F.box(M.trim, x, ry + 0.05, zz, 0.18, 0.1, 0.12)
        const a = V(x, ry + 0.16, z0 + 0.1)
        const c = V(x, ry + 0.16, zr + 0.4)
        beam(b, M.mast, a, c, 0.05, 6)
        slab(M.mast, V(x, ry + 0.16, zr + 0.2), V(x, ry + 0.16, zr + 1.3), V(1, 0, 0), 0.24, 0.03)
      }
      // The mast in a tabernacle: two cheeks and a pin, a cap at the head with a sheave, and a yard lowered with the sail
      // furled along it, lashed with gaskets. Shrouds to the gunwales, a forestay to the stem and a backstay to the stern.
      const mz = (z0 + zs) / 2
      const mh = 6.2
      for (const o of [-1, 1]) F.box(M.trim, o * 0.15, ry + 0.55, mz, 0.08, 1.1, 0.34)
      F.cyl(M.iron, -0.22, ry + 0.85, mz, 0.03, 0.03, 0.44, 6, 0, Math.PI / 2)
      beam(b, M.mast, V(0, ry, mz), V(0, ry + mh, mz), 0.13, 10, 0.08)
      F.cyl(M.trim, 0, ry + mh, mz, 0.11, 0.09, 0.12, 10)
      F.sphere(M.trim, 0, ry + mh + 0.16, mz, 0.07, 0.07, 0.07, 8)
      const yy = ry + mh * 0.6
      const yh = B * 0.48
      beam(b, M.mast, V(-yh, yy, mz + 0.16), V(0, yy, mz + 0.16), 0.045, 8, 0.075)
      beam(b, M.mast, V(0, yy, mz + 0.16), V(yh, yy, mz + 0.16), 0.075, 8, 0.045)
      // The canvas is gathered in bays between gaskets: pinched where each gasket binds it, bellied and sagging below
      // the yard between, with a loose fold or two hanging out of a bay.
      const bays = 7
      const span = 2 * yh * 0.92
      const per = 4
      for (let k = 0; k < bays * per; k++) {
        const t = (k + 0.5) / (bays * per)
        const inBay = ((k % per) + 0.5) / per
        const pinch = Math.sin(inBay * Math.PI)
        const whole = Math.sin(t * Math.PI) ** 0.5
        const fat = (0.1 + 0.07 * whole) * (0.62 + 0.38 * pinch) + rand(-0.01, 0.01)
        const sag = 0.05 * pinch * (0.6 + whole)
        const u = -span / 2 + t * span
        b.add(
          G("sph10", () => new THREE.SphereGeometry(1, 10, 7)),
          M.sail,
          M4(u, yy - fat * 0.75 - sag, mz + 0.2 + rand(-0.015, 0.015), rand(-0.25, 0.25), (span / (bays * per)) * 1.25, fat * rand(0.92, 1.08), fat * rand(0.78, 0.92)),
          { uv: "keep" }
        )
        if (k % per === 0 && k > 0) b.add(G("gasket", () => new THREE.TorusGeometry(0.17, 0.012, 4, 14)), M.rope, M4(u - span / (bays * per) / 2, yy - 0.1, mz + 0.2, Math.PI / 2, 0.66, 0.78, 1), { uv: "keep" })
        if (k % per === 1 && rand() < 0.55)
          b.add(
            G("sph10", () => new THREE.SphereGeometry(1, 10, 7)),
            M.sail,
            M4(u + rand(-0.05, 0.05), yy - fat * 1.5 - sag - 0.05, mz + 0.22, rand(-0.35, 0.35), span / (bays * per) * rand(0.9, 1.4), rand(0.06, 0.09), 0.05),
            { uv: "keep" }
          )
      }
      beam(b, M.rope, V(0.04, ry + mh - 0.05, mz + 0.1), V(0.04, yy + 0.05, mz + 0.16), 0.012, 4)
      const head = V(0, ry + mh - 0.15, mz)
      for (const side of [-1, 1])
        for (const dz of [-0.9, 0.5]) {
          const st = at((mz + dz + L / 2) / L)
          const foot = V(side * (st.w + 0.04), st.top + 0.02, mz + dz)
          const dead = foot.clone().lerp(head, 0.12)
          beam(b, M.rope, head, dead, 0.024, 5)
          beam(b, M.rope, dead, foot, 0.02, 5)
          F.sphere(M.trim, dead.x, dead.y, dead.z, 0.06, 0.07, 0.06, 8)
        }
      beam(b, M.rope, head, V(0, bow.top + 0.5, L / 2 - 0.1), 0.024, 5)
      beam(b, M.rope, head, V(sx, pivot.y + 0.1, -L / 2 - 0.1), 0.024, 5)
      // Cargo forward on the roof: a crate and kegs under a tarpaulin, roped down.
      const cz = zr - 0.4
      crate(b, M, -0.55, ry, cz, 0.6, 0.1)
      barrel(b, M, 0.35, ry, cz - 0.15, 0.24, 0.62)
      barrel(b, M, 0.4, ry, cz + 0.4, 0.22, 0.58)
      b.add(G("sph10", () => new THREE.SphereGeometry(1, 10, 7)), M.sail, M4(-0.1, ry + 0.25, cz - 1.0, 0.3, 0.6, 0.3, 0.45), { uv: "keep" })
      b.add(G("sph10", () => new THREE.SphereGeometry(1, 10, 7)), M.sail, M4(0.55, ry + 0.2, cz - 1.1, -0.4, 0.4, 0.22, 0.35), { uv: "keep" })
      for (const o of [-0.25, 0.1]) beam(b, M.rope, V(-0.9, ry + 0.02, cz + o), V(0.7, ry + 0.02, cz + o + 0.1), 0.012, 4)
    }
  },
  {
    hull: "hull",
    strake: "strake",
    scum: "hull",
    deck: "deck",
    bulwark: "plank",
    wall: "siding",
    trim: "boatTrim",
    roof: "roof",
    window: "window",
    lamp: "window",
    void: "void",
    iron: "iron",
    rope: "rope",
    panel: "roof",
    post: "roof",
    night: "void",
    door: "door",
    shutter: "door",
    floor: "deck",
    ceiling: "roof",
    pane: "window",
    mast: "pole",
    sail: "sail",
    barrel: "barrel",
    crate: "crate",
    crateDark: "crateDark",
  }
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
    ctx.footprint(0, 0, W / 2 + 0.05, D / 2 + 0.05, 0, p.height + 0.05)
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
