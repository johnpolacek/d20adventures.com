import * as THREE from "three"
import { z } from "zod"
import { arcPts, beam, Frame, G, M4, TAU, unitBox, type Vec2 } from "../kit/geometry"
import { defineBuilder, matName, num, size } from "./types"

// A library's hall and furniture (the Old Grand Library): painted panels, bookcases full of books, a barrel vault, a
// dome, galleries with balustrades, columns, arched frames, reading desks, armchairs, a globe and candle stands.

// A geometry turned inside out: faces wound the other way and normals reversed, for vaults and domes seen from within.
export function inward(g: THREE.BufferGeometry) {
  const out = g.index ? g.toNonIndexed() : g.clone()
  const p = out.attributes.position.array as Float32Array
  const n = out.attributes.normal.array as Float32Array
  const uv = out.attributes.uv?.array as Float32Array | undefined
  for (let i = 0; i < p.length; i += 9) {
    for (const arr of [p, n]) for (let k = 0; k < 3; k++) [arr[i + 3 + k], arr[i + 6 + k]] = [arr[i + 6 + k], arr[i + 3 + k]]
    if (uv) {
      const j = (i / 9) * 6
      for (let k = 0; k < 2; k++) [uv[j + 2 + k], uv[j + 4 + k]] = [uv[j + 4 + k], uv[j + 2 + k]]
    }
  }
  for (let i = 0; i < n.length; i++) n[i] = -n[i]
  return out
}
// A flat shape in the XY plane with uv 0..1 over its bounds, or repeated `repeat` times.
function flatShape(pts: Vec2[], repeat: Vec2 = [1, 1]) {
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map((q) => new THREE.Vector2(...q))), 24)
  g.computeBoundingBox()
  const bb = g.boundingBox as THREE.Box3
  const p = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) uv.setXY(i, ((p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x)) * repeat[0], ((p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y)) * repeat[1])
  return g
}
const roundTop = (w: number, h: number): Vec2[] => (h <= w / 2 ? arcPts(0, 0, w / 2, 0, Math.PI, 24) : [[-w / 2, 0], [w / 2, 0], ...arcPts(0, h - w / 2, w / 2, 0, Math.PI, 24)])

// ── Painted panels ──────────────────────────────────────────────────────────

// A painting on a flat panel facing +z, its foot on the origin: a rug (pitch -90), a fresco, a tapestry, stained glass
// with a round top (`arch`). `repeat` tiles the painting across it. `depth` gives it thickness, in `edge`.
export const panel = defineBuilder(
  z
    .object({
      size: z.tuple([size(200), size(200)]),
      material: matName,
      arch: z.boolean().default(false),
      repeat: z.tuple([num(0.01, 200), num(0.01, 200)]).default([1, 1]),
      depth: num(0, 2).default(0),
      edge: matName.optional(),
      pitch: num(-180, 180).default(0),
      roll: num(-180, 180).default(0),
    })
    .strict(),
  (ctx, p) => {
    const [w, h] = p.size
    const pts: Vec2[] = p.arch
      ? roundTop(w, h)
      : [
          [-w / 2, 0],
          [w / 2, 0],
          [w / 2, h],
          [-w / 2, h],
        ]
    const tilt = M4(0, 0, 0, 0, 1, 1, 1, (p.pitch * Math.PI) / 180, (p.roll * Math.PI) / 180)
    ctx.b.add(flatShape(pts, p.repeat), ctx.mat(p.material), tilt.clone().multiply(M4(0, 0, p.depth + 0.001)), { uv: "keep" })
    if (p.depth > 0) {
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map((q) => new THREE.Vector2(...q))), { depth: p.depth, bevelEnabled: false, curveSegments: 24 })
      ctx.b.add(g, ctx.mat(p.edge ?? p.material), tilt)
      g.dispose()
    }
  }
)

// The wall over a round-headed opening: the two spandrels between the arch and the top of a square opening `width`
// wide whose head is at `height`, with a moulded archivolt and a keystone. Fills a wall's rectangular window or door
// opening into an arch.
export const archHead = defineBuilder(
  z.object({ width: size(30), height: size(60), thickness: size(4).default(0.3), moulding: num(0, 1).default(0.09), keystone: z.boolean().default(true) }).strict(),
  (ctx, p) => {
    const { M } = ctx
    const r = p.width / 2
    const cy = p.height - r
    const spandrel: Vec2[] = [[r, cy], [r, p.height], [-r, p.height], [-r, cy], ...arcPts(0, cy, r, Math.PI, 0, 24).slice(1, -1)]
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(spandrel.map((q) => new THREE.Vector2(...q))), { depth: p.thickness, bevelEnabled: false, curveSegments: 24 })
    ctx.b.add(g, M.fill, M4(0, 0, -p.thickness / 2))
    g.dispose()
    if (p.moulding > 0)
      for (const s of [-1, 1]) {
        const t = G(`lib-arch-${r}-${p.moulding}`, () => new THREE.TorusGeometry(r + p.moulding * 0.4, p.moulding * 0.5, 6, 28, Math.PI))
        ctx.b.add(t, M.trim, M4(0, cy, s * (p.thickness / 2 + p.moulding * 0.1)), { uv: "keep" })
      }
    if (p.keystone) {
      const F = new Frame(ctx.b, new THREE.Matrix4())
      F.shape(
        M.trim,
        [
          [-0.09, 0],
          [0.09, 0],
          [0.13, 0.26],
          [-0.13, 0.26],
        ],
        p.thickness + 0.08,
        M4(0, p.height - 0.13 - 0.05, -(p.thickness + 0.08) / 2)
      )
    }
  },
  { fill: "plaster", trim: "stone" }
)

// ── Bookcases ───────────────────────────────────────────────────────────────

// A wall of bookcases along x facing +z, its back on z = 0: bays between pilasters, shelves full of books of many
// heights and colours (some leaning, some lying in stacks, a few gaps), a plinth with cupboard doors and a cornice.
// `books` are the materials books are bound in: painted spines (an `image` material) laid on each book's face.
export const bookcase = defineBuilder(
  z
    .object({
      length: size(60),
      height: size(20).default(3),
      depth: size(1.2).default(0.42),
      bay: size(3).default(1.0),
      shelf: size(1).default(0.36),
      plinth: num(0, 2).default(0.55),
      fill: num(0, 1).default(0.9),
      books: z.array(matName).min(1).max(12),
      gilt: z.boolean().default(true),
      ladder: num(-30, 30).optional(),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const F = new Frame(b, new THREE.Matrix4())
    const { length: L, height: H, depth: D } = p
    const nb = Math.max(1, Math.round(L / p.bay))
    const bw = L / nb
    const post = 0.09
    const cornice = 0.22
    const top = H - cornice
    // Carcass: back, plinth, cornice.
    F.box(M.back, 0, H / 2, 0.02, L, H, 0.04)
    if (p.plinth > 0) {
      F.box(M.case, 0, p.plinth / 2, D / 2 + 0.03, L + 0.04, p.plinth, D + 0.02)
      F.box(M.case, 0, p.plinth - 0.02, D / 2 + 0.05, L + 0.1, 0.05, D + 0.08)
      F.box(M.case, 0, 0.05, D / 2 + 0.06, L + 0.06, 0.1, D + 0.04)
    }
    F.box(M.case, 0, top + cornice * 0.35, D / 2 + 0.04, L + 0.1, cornice * 0.7, D + 0.06)
    F.box(M.case, 0, top + cornice * 0.85, D / 2 + 0.08, L + 0.2, cornice * 0.3, D + 0.16)
    if (p.gilt) F.box(M.trim, 0, top + cornice * 0.7, D + 0.075, L + 0.12, 0.025, 0.015)
    const spineGeo = unitBox()
    for (let i = 0; i < nb; i++) {
      const x0 = -L / 2 + i * bw
      // Pilasters between bays, with a gilt capital.
      F.box(M.case, x0 + (i === 0 ? post / 2 : 0), H / 2, D / 2 + 0.02, post * (i === 0 ? 1 : 1.4), H, D + 0.03)
      if (p.gilt) F.box(M.trim, x0 + (i === 0 ? post / 2 : 0), top - 0.06, D + 0.04, post * 1.6, 0.08, 0.03)
      // Cupboard doors in the plinth.
      if (p.plinth > 0.3)
        for (const s of [0.25, 0.75]) {
          F.box(M.case, x0 + bw * s, p.plinth / 2 + 0.02, D + 0.045, bw * 0.42, p.plinth - 0.16, 0.025)
          F.box(M.trim, x0 + bw * s + (s < 0.5 ? bw * 0.17 : -bw * 0.17), p.plinth / 2 + 0.04, D + 0.065, 0.015, 0.06, 0.015)
        }
      const xs = x0 + post * 0.7
      const xe = x0 + bw - post * 0.7
      const n = Math.max(1, Math.floor((top - p.plinth) / p.shelf))
      const sh = (top - p.plinth) / n
      for (let k = 0; k < n; k++) {
        const y = p.plinth + k * sh
        F.box(M.case, x0 + bw / 2, y + 0.015, D / 2 + 0.02, bw, 0.03, D - 0.02)
        F.box(M.case, x0 + bw / 2, y + 0.045, D + 0.005, bw, 0.035, 0.02)
        // Books from the left of the shelf: a run of upright books, now and then a stack lying flat, a leaning book at
        // the end of a run, or a gap.
        const room = sh - 0.04
        let x = xs + rand(0, 0.03)
        const tone = Math.floor(rand(0, p.books.length))
        while (x < xe - 0.03) {
          const r = rand()
          if (r > p.fill + 0.05) {
            x += rand(0.06, 0.18)
            continue
          }
          if (r < 0.05 && xe - x > 0.3) {
            // A stack lying flat.
            let y0 = y + 0.03
            const m = Math.floor(rand(2, 6))
            const sw = rand(0.18, 0.26)
            for (let j = 0; j < m && y0 < y + room - 0.08; j++) {
              const t = rand(0.03, 0.055)
              F.geo(
                ctx.mat(p.books[Math.floor(rand(0, p.books.length))]),
                spineGeo,
                M4(x + sw / 2 + rand(-0.01, 0.01), y0 + t / 2, D - 0.13, rand(-0.08, 0.08), sw, t, rand(0.15, 0.22), 0, Math.PI / 2),
                { uv: "keep" }
              )
              y0 += t
            }
            x += sw + 0.02
            continue
          }
          const tw = rand(0.022, 0.062)
          const th = Math.min(room - 0.01, room * rand(0.62, 0.97))
          const td = rand(0.17, Math.min(0.28, D - 0.08))
          // Books of one colour run together, as sets do.
          const mat = ctx.mat(p.books[rand() < 0.55 ? tone : Math.floor(rand(0, p.books.length))])
          if (r > p.fill - 0.04 && xe - x > th * 0.5) {
            // Leaning against the run.
            const a = rand(0.25, 0.5)
            F.geo(mat, spineGeo, M4(x + (Math.sin(a) * th) / 2 + tw / 2, y + 0.03 + (Math.cos(a) * th) / 2, D - 0.06 - td / 2, 0, tw, th, td, 0, -a), { uv: "keep" })
            x += Math.sin(a) * th + tw + rand(0.04, 0.12)
            continue
          }
          F.geo(mat, spineGeo, M4(x + tw / 2, y + 0.03 + th / 2, D - 0.05 - td / 2 + rand(-0.015, 0.015), 0, tw, th, td), { uv: "keep" })
          x += tw + rand(0, 0.004)
        }
      }
      // A top shelf above the last.
      F.box(M.case, x0 + bw / 2, top - 0.015, D / 2 + 0.02, bw, 0.03, D - 0.02)
    }
    F.box(M.case, L / 2 - post / 2, H / 2, D / 2 + 0.02, post, H, D + 0.03)
    if (p.ladder !== undefined) {
      // A library ladder leaning on its rail.
      F.box(M.trim, 0, top - 0.3, D + 0.12, L, 0.03, 0.03)
      const lx = p.ladder
      const foot = D + 0.7
      for (const s of [-0.22, 0.22]) beam(b, M.case, [lx + s, 0, foot], [lx + s, top - 0.25, D + 0.13], 0.025, 6)
      for (let k = 1; k < 10; k++) {
        const t = k / 10
        F.box(M.case, lx, t * (top - 0.25), foot + (D + 0.13 - foot) * t, 0.44, 0.03, 0.05)
      }
    }
    ctx.footprint(0, D / 2, L / 2, D / 2 + 0.05, 0, H)
  },
  { case: "oakDark", back: "dark", trim: "gilt" }
)

// ── Vaults and domes ─────────────────────────────────────────────────────────

// A barrel vault seen from below, its axis along z from `from` to `to`, `span` wide, springing at `spring`: the shell,
// transverse ribs every `bay`, and a moulded cornice along both springing lines.
export const vault = defineBuilder(
  z
    .object({
      span: size(60),
      from: num(-200, 200),
      to: num(-200, 200),
      spring: size(60),
      bay: size(20).default(3),
      rib: num(0, 2).default(0.22),
      repeat: z.tuple([num(0.01, 200), num(0.01, 200)]).optional(),
    })
    .strict(),
  (ctx, p) => {
    const { M } = ctx
    const r = p.span / 2
    const len = Math.abs(p.to - p.from)
    const mid = (p.to + p.from) / 2
    // The shell: half a cylinder, axis along z, opening downward.
    const g = new THREE.CylinderGeometry(r, r, len, 48, 1, true, -Math.PI / 2, Math.PI)
    if (p.repeat) {
      const uv = g.attributes.uv
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * p.repeat[0], uv.getY(i) * p.repeat[1])
    }
    const shell = inward(g)
    g.dispose()
    ctx.b.add(shell, M.shell, M4(0, p.spring, mid, 0, 1, 1, 1, -Math.PI / 2), { uv: p.repeat ? "keep" : "planar" })
    shell.dispose()
    if (p.rib > 0) {
      const n = Math.max(1, Math.round(len / p.bay))
      for (let i = 0; i <= n; i++) {
        const zz = Math.min(p.from, p.to) + (i * len) / n
        const t = G(`lib-rib-${r}-${p.rib}`, () => new THREE.TorusGeometry(r - p.rib * 0.3, p.rib * 0.55, 6, 40, Math.PI))
        ctx.b.add(t, M.rib, M4(0, p.spring, zz, 0, 1, 1, 1.4), { uv: "keep" })
      }
    }
    for (const s of [-1, 1]) {
      const F = new Frame(ctx.b, new THREE.Matrix4())
      F.box(M.rib, s * (r - 0.12), p.spring - 0.1, mid, 0.34, 0.2, len)
      F.box(M.rib, s * (r - 0.05), p.spring - 0.28, mid, 0.2, 0.16, len)
      F.box(M.trim, s * (r - 0.155), p.spring - 0.2, mid, 0.02, 0.03, len)
    }
  },
  { shell: "plaster", rib: "stone", trim: "gilt" }
)

// A dome seen from below, standing on a ring at the origin: a painted shell, gilt ribs and an oculus of light at the top.
export const cupola = defineBuilder(
  z.object({ radius: size(40), rise: size(40).optional(), ribs: z.number().int().min(0).max(24).default(8), oculus: num(0, 10).default(0.8) }).strict(),
  (ctx, p) => {
    const { M } = ctx
    const r = p.radius
    const rise = p.rise ?? r * 0.75
    const n = 20
    // The shell from the base ring up to the oculus, its uv running around and up.
    const ring: THREE.Vector2[] = []
    const top = Math.acos(Math.min(0.999, p.oculus / r))
    for (let i = 0; i <= n; i++) {
      const t = (top * i) / n
      ring.push(new THREE.Vector2(r * Math.cos(t), rise * Math.sin(t)))
    }
    const g = new THREE.LatheGeometry(ring, 48)
    const shell = inward(g)
    g.dispose()
    ctx.b.add(shell, M.shell, M4(), { uv: "keep" })
    shell.dispose()
    for (let i = 0; i < p.ribs; i++) {
      const a = (i * TAU) / p.ribs
      for (let k = 0; k < n; k++) {
        const t0 = (top * k) / n
        const t1 = (top * (k + 1)) / n
        const ra = r - 0.06
        beam(
          ctx.b,
          M.trim,
          [Math.cos(a) * ra * Math.cos(t0), rise * Math.sin(t0) - 0.03, Math.sin(a) * ra * Math.cos(t0)],
          [Math.cos(a) * ra * Math.cos(t1), rise * Math.sin(t1) - 0.03, Math.sin(a) * ra * Math.cos(t1)],
          0.07,
          5
        )
      }
    }
    // A moulded base ring and the oculus's rim and light.
    ctx.b.add(
      G(`lib-ring-${r}`, () => new THREE.TorusGeometry(r - 0.05, 0.12, 6, 64)),
      M.trim,
      M4(0, 0.05, 0, 0, 1, 1, 1, Math.PI / 2),
      { uv: "keep" }
    )
    if (p.oculus > 0) {
      const oy = rise * Math.sin(top)
      ctx.b.add(
        G(`lib-oc-${p.oculus}`, () => new THREE.TorusGeometry(p.oculus, 0.08, 6, 40)),
        M.trim,
        M4(0, oy, 0, 0, 1, 1, 1, Math.PI / 2),
        { uv: "keep" }
      )
      ctx.b.add(
        G(`lib-ocd-${p.oculus}`, () => new THREE.CircleGeometry(p.oculus, 40)),
        M.light,
        M4(0, oy + 0.3, 0, 0, 1, 1, 1, Math.PI / 2),
        { uv: "keep" }
      )
      const c = new THREE.CylinderGeometry(p.oculus, p.oculus, 0.3, 40, 1, true)
      const ci = inward(c)
      c.dispose()
      ctx.b.add(ci, M.shell, M4(0, oy + 0.15, 0))
      ci.dispose()
    }
  },
  { shell: "plaster", trim: "gilt", light: "skylight" }
)

// ── Galleries, columns, balustrades ─────────────────────────────────────────

// A gallery along x at height `level`, its back on z = 0 and its front edge `depth` out: a boarded deck, a fascia with
// moulded cornice and carved brackets under it, and a balustrade of turned balusters with a handrail. `curve` bows the
// front out into a half-round balcony that far at the middle.
export const gallery = defineBuilder(
  z
    .object({
      length: size(60),
      level: num(0, 20),
      depth: size(4).default(1.1),
      rail: size(2).default(0.95),
      spacing: size(1).default(0.16),
      brackets: size(10).default(1.5),
      curve: num(0, 6).default(0),
      gaps: z
        .array(z.tuple([num(-100, 100), size(20)]))
        .max(8)
        .default([]),
    })
    .strict(),
  (ctx, p) => {
    const { b, M } = ctx
    const F = new Frame(b, new THREE.Matrix4())
    const { length: L, level: y, depth: d } = p
    // Front line: straight, or bowed out as a half ellipse over the middle third.
    const front = (x: number) => {
      if (!p.curve) return d
      const w = L / 2
      const u = x / w
      return d + p.curve * Math.sqrt(Math.max(0, 1 - u * u))
    }
    const steps = p.curve ? 40 : 1
    const pts: Vec2[] = [[-L / 2, 0]]
    for (let i = 0; i <= steps; i++) {
      const x = -L / 2 + (i * L) / steps
      pts.push([x, front(x)])
    }
    pts.push([L / 2, 0])
    // The deck, its fascia and cornice (extruded down from the floor's outline).
    const outline = (inset: number, z0: number) => pts.map(([x, zz]) => [x, -(zz === 0 ? zz : zz + inset) - z0] as Vec2)
    F.shape(M.deck, outline(0, 0), 0.08, M4(0, y, 0, 0, 1, 1, 1, -Math.PI / 2))
    F.shape(M.case, outline(0.02, 0), 0.32, M4(0, y - 0.08, 0, 0, 1, 1, 1, -Math.PI / 2))
    F.shape(M.case, outline(0.08, 0), 0.08, M4(0, y - 0.02, 0, 0, 1, 1, 1, -Math.PI / 2))
    F.shape(M.trim, outline(0.035, 0), 0.025, M4(0, y - 0.22, 0, 0, 1, 1, 1, -Math.PI / 2))
    // The balustrade: a bottom rail, turned balusters, a handrail, newels every few metres, broken by gaps (stairs).
    const inGap = (x: number) => p.gaps.some(([gx, gw]) => Math.abs(x - gx) < gw / 2)
    const run = (x0: number, x1: number, fn: (x: number, x2: number) => void) => {
      const n = Math.max(1, Math.round((x1 - x0) / 0.2))
      for (let i = 0; i < n; i++) {
        const a = x0 + ((x1 - x0) * i) / n
        const c = x0 + ((x1 - x0) * (i + 1)) / n
        if (!inGap((a + c) / 2)) fn(a, c)
      }
    }
    const fz = (x: number) => front(x) - 0.06
    run(-L / 2, L / 2, (a, c) => {
      const za = fz(a)
      const zc = fz(c)
      const len = Math.hypot(c - a, zc - za)
      const yaw = -Math.atan2(zc - za, c - a)
      F.box(M.case, (a + c) / 2, y + 0.06, (za + zc) / 2, len + 0.01, 0.06, 0.09, yaw)
      F.box(M.case, (a + c) / 2, y + p.rail - 0.03, (za + zc) / 2, len + 0.01, 0.06, 0.12, yaw)
      F.box(M.trim, (a + c) / 2, y + p.rail + 0.005, (za + zc) / 2, len + 0.01, 0.012, 0.05, yaw)
    })
    const baluster: Vec2[] = [
      [0.035, 0],
      [0.035, 0.05],
      [0.02, 0.09],
      [0.045, 0.3],
      [0.05, 0.42],
      [0.022, 0.6],
      [0.03, 0.68],
      [0.035, p.rail - 0.12],
    ]
    const nb = Math.round(L / p.spacing)
    for (let i = 0; i <= nb; i++) {
      const x = -L / 2 + 0.05 + ((L - 0.1) * i) / nb
      if (inGap(x)) continue
      F.lathe(M.case, x, y + 0.09, fz(x), baluster, 8)
    }
    const nn = Math.max(1, Math.round(L / 3))
    for (let i = 0; i <= nn; i++) {
      const x = -L / 2 + 0.07 + ((L - 0.14) * i) / nn
      if (inGap(x)) continue
      F.box(M.case, x, y + p.rail / 2, fz(x), 0.13, p.rail + 0.04, 0.13)
      F.box(M.trim, x, y + p.rail + 0.06, fz(x), 0.09, 0.06, 0.09)
    }
    for (const [gx, gw] of p.gaps)
      for (const s of [-1, 1]) {
        const x = gx + (s * gw) / 2
        F.box(M.case, x, y + p.rail / 2, fz(x), 0.13, p.rail + 0.04, 0.13)
      }
    // Carved brackets under the deck at the wall.
    if (!p.curve) {
      const n = Math.max(1, Math.round(L / p.brackets))
      for (let i = 0; i <= n; i++) {
        const x = -L / 2 + 0.2 + ((L - 0.4) * i) / n
        F.shape(
          M.case,
          [
            [0, 0],
            [d * 0.7, 0],
            [d * 0.2, -0.75],
            [0, -0.75],
          ],
          0.12,
          M4(x - 0.06, y - 0.08, 0, Math.PI / 2)
        )
      }
    }
  },
  { deck: "oak", case: "oakDark", trim: "gilt" }
)

// A column: a moulded base, a plain or fluted shaft, and a capital; `square` makes a pilaster against a wall.
export const column = defineBuilder(
  z.object({ height: size(40), radius: size(3).default(0.22), square: z.boolean().default(false), flutes: z.number().int().min(0).max(32).default(0), gilt: z.boolean().default(true) }).strict(),
  (ctx, p) => {
    const { M } = ctx
    const F = new Frame(ctx.b, new THREE.Matrix4())
    const r = p.radius
    const H = p.height
    const base = r * 1.1
    const cap = r * 1.5
    if (p.square) {
      F.box(M.shaft, 0, base * 0.5, 0, r * 2.6, base, r * 1.4)
      F.box(M.shaft, 0, H / 2, 0, r * 2, H - base - cap, r)
      F.box(M.trim, 0, base + 0.04, r * 0.52, r * 2.1, 0.05, 0.02)
      F.box(M.shaft, 0, H - cap / 2, 0, r * 2.8, cap, r * 1.5)
      if (p.gilt) F.box(M.trim, 0, H - cap * 0.6, r * 0.77, r * 2.4, cap * 0.35, 0.02)
      ctx.footprint(0, 0, r * 1.3, r * 0.7)
      return
    }
    F.lathe(
      M.shaft,
      0,
      0,
      0,
      [
        [0, 0],
        [r * 1.45, 0],
        [r * 1.45, base * 0.4],
        [r * 1.3, base * 0.55],
        [r * 1.35, base * 0.75],
        [r * 1.1, base],
        [r, base + 0.02],
        [0, base + 0.02],
      ],
      24
    )
    F.cyl(M.shaft, 0, base, 0, r, r * 0.88, H - base - cap, 24)
    if (p.flutes)
      for (let i = 0; i < p.flutes; i++) {
        const a = (i * TAU) / p.flutes
        beam(ctx.b, M.flute, [Math.cos(a) * r * 0.97, base + 0.15, Math.sin(a) * r * 0.97], [Math.cos(a) * r * 0.86, H - cap - 0.15, Math.sin(a) * r * 0.86], 0.022, 4)
      }
    F.lathe(
      M.trim,
      0,
      H - cap,
      0,
      [
        [0, 0],
        [r * 0.95, 0],
        [r * 1.05, cap * 0.15],
        [r * 0.95, cap * 0.25],
        [r * 1.3, cap * 0.55],
        [r * 1.55, cap * 0.75],
        [r * 1.55, cap],
        [0, cap],
      ],
      24
    )
    F.box(M.shaft, 0, H - 0.04, 0, r * 3.3, 0.08, r * 3.3)
    ctx.circle(0, 0, r * 1.45)
  },
  { shaft: "stone", flute: "stoneDark", trim: "gilt" }
)

// ── Furniture ───────────────────────────────────────────────────────────────

// A reading desk facing +z: a carved cabinet base and a sloped top with an open book, or a `writing` desk with a flat top,
// drawers, stacked books, papers, an inkwell and a candle. Readers stand or sit on the +z side.
export const desk = defineBuilder(
  z
    .object({
      kind: z.enum(["lectern", "writing", "double"]).default("writing"),
      length: size(4).default(1.4),
      width: size(2).default(0.7),
      height: size(1.6).default(0.78),
      books: z.number().int().min(0).max(12).default(3),
      candle: z.boolean().default(true),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const F = new Frame(b, new THREE.Matrix4())
    const { length: l, width: w } = p
    const h = p.kind === "writing" ? p.height : Math.max(p.height, 0.95)
    const top = p.kind === "writing" ? h : h - 0.12
    // A panelled cabinet base on a plinth, with carved doors.
    F.box(M.wood, 0, 0.05, 0, l - 0.04, 0.1, w - 0.04)
    F.box(M.wood, 0, top / 2 + 0.05, 0, l - 0.14, top - 0.12, w - 0.14)
    for (const s of [-1, 1]) {
      F.box(M.wood, (s * (l - 0.1)) / 2, top / 2, (w - 0.1) / 2, 0.08, top - 0.02, 0.08)
      F.box(M.wood, (s * (l - 0.1)) / 2, top / 2, -(w - 0.1) / 2, 0.08, top - 0.02, 0.08)
    }
    const nd = Math.max(1, Math.round(l / 0.5))
    for (let i = 0; i < nd; i++) {
      const x = -l / 2 + 0.07 + ((i + 0.5) * (l - 0.14)) / nd
      for (const s of [-1, 1]) {
        F.box(M.wood, x, top * 0.5, s * (w / 2 - 0.06), (l - 0.14) / nd - 0.06, top - 0.3, 0.025)
        F.box(M.trim, x, top * 0.5, s * (w / 2 - 0.045), (l - 0.14) / nd - 0.14, 0.015, 0.01)
        F.box(M.trim, x, top - 0.08, s * (w / 2 - 0.05), 0.05, 0.015, 0.012)
      }
    }
    const paper = M.paper
    if (p.kind === "writing") {
      F.box(M.wood, 0, h - 0.025, 0, l, 0.05, w)
      F.box(M.leather, 0, h + 0.002, 0.02, l * 0.62, 0.004, w * 0.6)
      // Stacks of books at one end, loose papers, an inkwell with a quill, an open book.
      let y = h
      for (let i = 0; i < p.books; i++) {
        const bt = rand(0.04, 0.07)
        F.geo(M[`book${i % 4}`], unitBox(), M4(-l / 2 + 0.24 + rand(-0.02, 0.02), y + bt / 2, -w / 2 + 0.2, rand(-0.25, 0.25), rand(0.2, 0.28), bt, rand(0.26, 0.32), 0, Math.PI / 2), { uv: "keep" })
        y += bt
      }
      for (let i = 0; i < 3; i++) F.box(paper, rand(-0.1, 0.25), h + 0.004 + i * 0.002, rand(0, 0.15), 0.21, 0.002, 0.29, rand(-0.6, 0.6))
      F.cyl(M.ink, l / 2 - 0.2, h, -w / 2 + 0.16, 0.035, 0.03, 0.06, 10)
      beam(b, paper, [l / 2 - 0.2, h + 0.05, -w / 2 + 0.16], [l / 2 - 0.12, h + 0.27, -w / 2 + 0.06], 0.008, 4, 0.002)
      openBook(F, M, 0.05, h, 0.06, 0.4, 0)
      if (p.candle) candleStick(F, M, -l / 2 + 0.22, h, w / 2 - 0.2)
    } else {
      // A sloped reading top on both faces (`double`) or one, with a book rest and an open book on each.
      const faces = p.kind === "double" ? [1, -1] : [1]
      const slope = 0.32
      F.box(M.wood, 0, top + 0.02, 0, l, 0.04, w)
      for (const s of faces) {
        const d = p.kind === "double" ? w / 2 : w
        const zc = p.kind === "double" ? (s * w) / 4 : 0
        const rise = Math.sin(slope) * d
        F.box(M.wood, 0, top + 0.04 + rise / 2, zc, l, 0.035, d / Math.cos(slope), 0, s * slope)
        F.box(M.wood, 0, top + 0.06, zc + (s * d) / 2 - s * 0.02, l, 0.05, 0.03)
        openBook(F, M, 0, top + 0.06 + rise * 0.45, zc + s * 0.02, 0.44, s * slope, s < 0)
      }
      if (p.kind === "lectern") F.box(M.wood, 0, top + 0.04 + Math.sin(slope) * w + 0.02, -w / 2 + 0.03, l, 0.06, 0.06)
      if (p.candle) candleStick(F, M, l / 2 - 0.12, top + 0.04, -w / 2 + 0.1)
    }
    ctx.footprint(0, 0, l / 2, w / 2, 0, h)
  },
  {
    wood: "oakDark",
    trim: "gilt",
    paper: "paper",
    leather: "leatherRed",
    ink: "iron",
    flame: "candleFlame",
    wax: "candle",
    brass: "brass",
    book0: "bookRed",
    book1: "bookGreen",
    book2: "bookBlue",
    book3: "bookBrown",
  }
)
// An open book lying on a surface at y, its spine across x, tipped by `tilt` about x.
function openBook(F: Frame, M: Record<string, THREE.Material>, x: number, y: number, zz: number, w: number, tilt: number, flip = false) {
  const d = w * 0.7
  const rot = flip ? Math.PI : 0
  F.geo(M.leather, unitBox(), M4(x, y + 0.005, zz, rot, w + 0.02, 0.01, d + 0.02, tilt))
  for (const s of [-1, 1]) {
    const g = G("lib-page", () => new THREE.CylinderGeometry(1, 1, 1, 10, 1, false, 0, Math.PI / 2))
    F.geo(M.paper, g, M4(x + (s * w) / 4, y + 0.012, zz, rot + (s < 0 ? Math.PI : 0), w / 2, d, 0.035, tilt + Math.PI / 2, 0).multiply(M4(-0.5, 0, 0)), { uv: "keep" })
  }
}
function candleStick(F: Frame, M: Record<string, THREE.Material>, x: number, y: number, zz: number) {
  F.cyl(M.brass, x, y, zz, 0.05, 0.035, 0.015, 10)
  F.cyl(M.brass, x, y + 0.015, zz, 0.012, 0.012, 0.09, 6)
  F.cyl(M.brass, x, y + 0.1, zz, 0.025, 0.02, 0.012, 10)
  F.cyl(M.wax, x, y + 0.11, zz, 0.014, 0.013, 0.09, 8)
  F.sphere(M.flame, x, y + 0.218, zz, 0.008, 0.02, 0.008, 6)
}

// A leather wingback armchair facing +z: a deep cushioned seat, a tall buttoned back, wings, rolled arms and turned legs.
export const armchair = defineBuilder(
  z.object({ width: size(2).default(0.86), back: size(2).default(1.12) }).strict(),
  (ctx, p) => {
    const { M } = ctx
    const F = new Frame(ctx.b, new THREE.Matrix4())
    const w = p.width
    const d = 0.82
    for (const [x, zz] of [
      [-w / 2 + 0.07, d / 2 - 0.07],
      [w / 2 - 0.07, d / 2 - 0.07],
      [-w / 2 + 0.07, -d / 2 + 0.07],
      [w / 2 - 0.07, -d / 2 + 0.07],
    ])
      F.lathe(
        M.legs,
        x,
        0,
        zz,
        [
          [0.02, 0],
          [0.03, 0.04],
          [0.025, 0.1],
          [0.035, 0.14],
          [0, 0.14],
        ],
        8
      )
    F.box(M.leather, 0, 0.26, 0, w, 0.22, d)
    F.box(M.leather, 0, 0.42, 0.05, w - 0.26, 0.12, d - 0.16)
    F.sphere(M.leather, 0, 0.47, 0.06, (w - 0.28) / 2, 0.05, (d - 0.18) / 2, 12)
    // The back, leaning a little, with rows of buttons.
    const lean = -0.12
    F.box(M.leather, 0, 0.37 + p.back / 2, -d / 2 + 0.1, w - 0.04, p.back, 0.2, 0, lean)
    F.sphere(M.leather, 0, 0.37 + p.back - 0.02, -d / 2 + 0.07, w / 2 - 0.02, 0.08, 0.1, 12)
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 4; c++) F.sphere(M.trim, -w / 2 + 0.2 + c * ((w - 0.4) / 3), 0.6 + r * 0.24, -d / 2 + 0.21 + Math.tan(-lean) * (0.25 + r * 0.24) * -1, 0.012, 0.012, 0.008, 6)
    // Wings and rolled arms.
    for (const s of [-1, 1]) {
      F.box(M.leather, s * (w / 2 - 0.06), 0.37 + p.back * 0.62, -d / 2 + 0.26, 0.1, p.back * 0.6, 0.34)
      F.box(M.leather, s * (w / 2 - 0.07), 0.48, 0.0, 0.14, 0.22, d - 0.04)
      F.cyl(M.leather, s * (w / 2 - 0.07), 0.6, -d / 2 + 0.02, 0.085, 0.085, d - 0.02, 12, Math.PI / 2)
      F.cyl(M.trim, s * (w / 2 - 0.07), 0.6, d / 2, 0.087, 0.087, 0.012, 12, Math.PI / 2)
    }
    ctx.footprint(0, 0, w / 2, d / 2, 0, 1.0)
  },
  { leather: "leather", legs: "oakDark", trim: "brass" }
)

// A globe on a turned stand with a brass meridian ring.
export const globe = defineBuilder(
  z.object({ radius: size(1).default(0.26) }).strict(),
  (ctx, p) => {
    const { M } = ctx
    const F = new Frame(ctx.b, new THREE.Matrix4())
    const r = p.radius
    for (let i = 0; i < 3; i++) {
      const a = (i * TAU) / 3
      beam(ctx.b, M.wood, [Math.cos(a) * r * 1.2, 0, Math.sin(a) * r * 1.2], [Math.cos(a) * r * 0.3, 0.45, Math.sin(a) * r * 0.3], 0.02, 6)
    }
    F.lathe(
      M.wood,
      0,
      0.42,
      0,
      [
        [0.05, 0],
        [0.07, 0.1],
        [0.04, 0.3],
        [0.06, 0.45],
        [0, 0.45],
      ],
      10
    )
    F.cyl(M.wood, 0, 0.87, 0, r * 1.2, r * 1.2, 0.04, 28)
    F.geo(
      M.map,
      G("lib-globe", () => new THREE.SphereGeometry(1, 28, 18)),
      M4(0, 0.87 + r * 0.6, 0, 0.3, r, r, r, 0, 0.4),
      { uv: "keep" }
    )
    F.geo(
      M.trim,
      G(`lib-meridian-${r}`, () => new THREE.TorusGeometry(r * 1.06, 0.008, 5, 40)),
      M4(0, 0.87 + r * 0.6, 0, 0.3, 1, 1, 1, 0, 0.4),
      { uv: "keep" }
    )
    ctx.circle(0, 0, r * 1.2)
  },
  { wood: "oakDark", map: "globeMap", trim: "brass" }
)

// A tall wrought candle stand: a tripod foot, a shaft and a crown of candles.
export const candleStand = defineBuilder(
  z.object({ height: size(4).default(1.6), candles: z.number().int().min(1).max(9).default(3) }).strict(),
  (ctx, p) => {
    const { M } = ctx
    const F = new Frame(ctx.b, new THREE.Matrix4())
    for (let i = 0; i < 3; i++) {
      const a = (i * TAU) / 3
      beam(ctx.b, M.iron, [Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22], [0, 0.22, 0], 0.016, 5)
    }
    F.cyl(M.iron, 0, 0.2, 0, 0.02, 0.016, p.height - 0.2, 6)
    F.cyl(M.iron, 0, p.height - 0.02, 0, 0.13, 0.13, 0.02, 14)
    for (let i = 0; i < p.candles; i++) {
      const a = (i * TAU) / p.candles
      const rr = p.candles === 1 ? 0 : 0.09
      const x = Math.cos(a) * rr
      const zz = Math.sin(a) * rr
      const ch = 0.14 + ((i * 37) % 5) * 0.02
      F.cyl(M.wax, x, p.height, zz, 0.02, 0.018, ch, 8)
      F.sphere(M.flame, x, p.height + ch + 0.02, zz, 0.011, 0.028, 0.011, 6)
    }
    ctx.circle(0, 0, 0.2)
  },
  { iron: "iron", wax: "candle", flame: "candleFlame" }
)
