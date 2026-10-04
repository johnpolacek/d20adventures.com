import * as THREE from "three"
import { mergeVertices, toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js"
import { z } from "zod"
import { M4, TAU, V } from "../kit/geometry"
import type { Rand } from "../kit/rng"
import { coord, defineBuilder, matName, num, size, vec2 } from "./types"

// Wild ground: weathered menhirs and boulders, flagstones set in turf, grass and heather, and distant mountains.
// Rock is shaped from seeded noise and cut by a few fracture planes, so each stone has its own flat broken faces and
// rounded weathered edges. Material roles: stone, flagstone, grass, mountain.

// Seeded 3D value noise in [0, 1].
function noise3(rand: Rand) {
  const perm = new Uint8Array(512)
  const base = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand(0, i + 1))
    ;[base[i], base[j]] = [base[j], base[i]]
  }
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255]
  const h = (x: number, y: number, z: number) => perm[(perm[(perm[x & 255] + y) & 255] + z) & 255] / 255
  const f = (t: number) => t * t * (3 - 2 * t)
  return (x: number, y: number, z: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const zi = Math.floor(z)
    const u = f(x - xi)
    const v = f(y - yi)
    const w = f(z - zi)
    const l = (a: number, b: number, t: number) => a + (b - a) * t
    return l(
      l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
      l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v),
      w
    )
  }
}

// Fracture planes in a stone's unit space: mostly upright faces, with `tops` of them tilted to break the crown.
function fractures(rand: Rand, n: number, tops: number) {
  return Array.from({ length: n }, (_, i) => {
    const a = rand(0, TAU)
    const tilt = i < tops ? rand(0.55, 1.1) : rand(-0.3, 0.35)
    return { n: V(Math.cos(a) * Math.cos(tilt), Math.sin(tilt), Math.sin(a) * Math.cos(tilt)), d: i < tops ? rand(0.9, 1.08) : rand(0.55, 0.8) }
  })
}
function cut(u: THREE.Vector3, planes: { n: THREE.Vector3; d: number }[]) {
  for (const p of planes) {
    const k = u.dot(p.n) - p.d
    if (k > 0) u.addScaledVector(p.n, -k)
  }
}

// A menhir: a slab of superelliptic section, swelling a little, narrowing and rounding toward a sloped crown, roughened
// by noise and cut by fracture planes. Built standing on y = 0 with 0.4 m buried, `w`/`d` the half-width and half-depth.
function menhir(rand: Rand, h: number, w: number, d: number) {
  const n3 = noise3(rand)
  const R = 22
  const H = 30
  const bulge = rand(0.04, 0.18)
  const slant = rand(-0.5, 0.5)
  const taper = rand(0.38, 0.58)
  // Broken crowns: the tilted planes bite well into the top, so it ends in sloped facets rather than a dome.
  const planes = fractures(rand, 12, 4)
  for (const pl of planes.slice(0, 4)) pl.d = rand(0.88, 1.04)
  const pos: number[] = []
  const u = V()
  for (let j = 0; j <= H; j++) {
    const t = j / H
    let prof = (1 + bulge * Math.sin(t * Math.PI * 0.8)) * (1 - taper * t)
    if (t > 0.8) {
      const k = (t - 0.8) / 0.2
      prof *= Math.sqrt(Math.max(0, 1 - k * k * 0.9))
    }
    for (let i = 0; i < R; i++) {
      const a = (i / R) * TAU
      const c = Math.cos(a)
      const s = Math.sin(a)
      const sx = Math.sign(c) * Math.abs(c) ** 0.55
      const sz = Math.sign(s) * Math.abs(s) ** 0.55
      // Unit space: x, z in [-1, 1] across the section, y in [0, 1.2] up the stone.
      u.set(sx * prof, t * 1.2, sz * prof)
      const rough = 1 + (n3(u.x * 1.3 + 3, t * 3.2, u.z * 1.3) - 0.5) * 0.55 + (n3(u.x * 4 + 9, t * 11, u.z * 4) - 0.5) * 0.14
      u.x *= rough
      u.z *= rough
      // The stone's axis wanders, so its outline swells and bends instead of running straight.
      u.x += (n3(11, t * 1.6, 3) - 0.5) * 0.5
      u.z += (n3(5, t * 1.6, 13) - 0.5) * 0.3
      cut(u, planes)
      const x = u.x * w
      const z = u.z * d
      const y = (u.y / 1.2) * (h + 0.4) - 0.4 + slant * x * Math.max(0, t - 0.6) * 1.8
      pos.push(x, y, z)
    }
  }
  // Close the crown at the centre of the last ring.
  let cx = 0
  let cy = 0
  let cz = 0
  for (let i = 0; i < R; i++) {
    cx += pos[(H * R + i) * 3] / R
    cy = Math.max(cy, pos[(H * R + i) * 3 + 1])
    cz += pos[(H * R + i) * 3 + 2] / R
  }
  pos.push(cx, cy + 0.04, cz)
  const idx: number[] = []
  for (let j = 0; j < H; j++)
    for (let i = 0; i < R; i++) {
      const a = j * R + i
      const b = j * R + ((i + 1) % R)
      const c = a + R
      const e = b + R
      idx.push(a, c, b, b, c, e)
    }
  const apex = (H + 1) * R
  for (let i = 0; i < R; i++) idx.push(H * R + i, apex, H * R + ((i + 1) % R))
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  // Sharp where fracture faces meet, smooth across the weathered curves.
  const out = toCreasedNormals(g, 0.55)
  g.dispose()
  return out
}

// A boulder: a noisy, flattened sphere with a few broken faces, half sunk.
function boulder(rand: Rand, detail: number) {
  const n3 = noise3(rand)
  const src = new THREE.IcosahedronGeometry(1, detail)
  src.deleteAttribute("normal")
  src.deleteAttribute("uv")
  const g = mergeVertices(src)
  src.dispose()
  const planes = fractures(rand, 5, 1).map((p) => ({ n: p.n, d: p.d * 1.1 }))
  const p = g.attributes.position
  const u = V()
  for (let i = 0; i < p.count; i++) {
    u.set(p.getX(i), p.getY(i), p.getZ(i))
    const r = 1 + (n3(u.x * 1.4 + 5, u.y * 1.4, u.z * 1.4) - 0.5) * 0.45 + (n3(u.x * 4 + 2, u.y * 4, u.z * 4) - 0.5) * 0.12
    u.multiplyScalar(r)
    cut(u, planes)
    p.setXYZ(i, u.x, u.y, u.z)
  }
  const out = toCreasedNormals(g, 0.6)
  g.dispose()
  return out
}

// A standing stone: a tall weathered slab, leaning a little. Solid.
export const standingStone = defineBuilder(
  z
    .object({
      height: size(20).default(4),
      width: size(6).default(1.2),
      depth: size(6).default(0.7),
      lean: num(0, 20).default(4),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const g = menhir(rand, p.height, p.width / 2, p.depth / 2)
    const lx = ((rand(-1, 1) * p.lean) / 180) * Math.PI
    const lz = ((rand(-1, 1) * p.lean) / 180) * Math.PI
    b.add(g, M.stone, M4(0, 0, 0, rand(-0.2, 0.2), 1, 1, 1, lx, lz))
    g.dispose()
    ctx.footprint(0, 0, p.width / 2 + 0.25, p.depth / 2 + 0.3)
  }
)

// A boulder, half sunk, sometimes with a smaller one beside it. `flat` squashes it into a low slab (a fallen stone).
// Solid.
export const rock = defineBuilder(z.object({ size: size(10).default(1.2), flat: num(0.15, 1.5).default(0.7) }).strict(), (ctx, p) => {
  const { b, M, rand } = ctx
  const s = p.size
  const detail = s > 0.9 ? 3 : 2
  const g = boulder(rand, detail)
  b.add(g, M.stone, M4(0, s * 0.18 * p.flat, 0, rand(0, TAU), s, s * p.flat * rand(0.8, 1.1), s * rand(0.7, 1), rand(-0.15, 0.15)))
  g.dispose()
  if (rand() < 0.5) {
    const g2 = boulder(rand, 2)
    const k = rand(0.3, 0.45)
    b.add(g2, M.stone, M4(s * 0.95, s * 0.06, s * 0.35, rand(0, TAU), s * k, s * k * 0.8, s * k))
    g2.dispose()
  }
  ctx.circle(0, 0, s * 0.95)
})

// Flagstones set in turf along a polyline: irregular slabs, a little proud of the grass, with gaps between them and a
// few strays off the edges. Not solid.
export const flagstones = defineBuilder(
  z
    .object({
      points: z.array(vec2).min(2).max(64),
      width: size(12).default(1.6),
      spacing: num(0.3, 3).default(0.8),
      strays: z.number().int().min(0).max(200).default(12),
      stray: size(10).default(2),
      material: matName.default("flagstone"),
    })
    .strict(),
  (ctx, p) => {
    const { b, rand } = ctx
    const mat = ctx.mat(p.material)
    const placed: [number, number, number][] = []
    const slab = (x: number, zz: number, r: number) => {
      for (const [px, pz, pr] of placed) if (Math.hypot(px - x, pz - zz) < (pr + r) * 0.82) return
      placed.push([x, zz, r])
      const shape = new THREE.Shape()
      const n = 5 + Math.floor(rand(0, 3))
      const stretch = rand(1, 1.7)
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rand(-0.3, 0.3)
        const rr = r * rand(0.68, 1.12)
        const vx = Math.cos(a) * rr * stretch
        const vy = Math.sin(a) * rr
        if (i === 0) shape.moveTo(vx, vy)
        else shape.lineTo(vx, vy)
      }
      shape.closePath()
      const depth = 0.1
      const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 1, curveSegments: 1 })
      b.add(g, mat, M4(x, rand(-0.085, -0.06), zz, rand(0, TAU), 1, 1, 1, -Math.PI / 2, rand(-0.03, 0.03)), { flat: true })
      g.dispose()
    }
    const pts = p.points
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i]
      const [bx, bz] = pts[i + 1]
      const len = Math.hypot(bx - ax, bz - az)
      const dx = (bx - ax) / len
      const dz = (bz - az) / len
      for (let t = 0; t < len; t += p.spacing * rand(0.8, 1.2)) {
        const across = Math.max(1, Math.round(p.width / 0.8))
        for (let k = 0; k < across; k++) {
          if (rand() < 0.18) continue
          const off = (across === 1 ? 0 : (k / (across - 1) - 0.5) * p.width) + rand(-0.15, 0.15)
          slab(ax + dx * t - dz * off + rand(-0.1, 0.1), az + dz * t + dx * off + rand(-0.1, 0.1), rand(0.28, 0.5))
        }
      }
    }
    for (let i = 0; i < p.strays; i++) {
      const seg = Math.floor(rand(0, pts.length - 1))
      const t = rand()
      const [ax, az] = pts[seg]
      const [bx, bz] = pts[seg + 1]
      const len = Math.hypot(bx - ax, bz - az) || 1
      const side = (rand() < 0.5 ? -1 : 1) * (p.width / 2 + rand(0.2, p.stray))
      slab(ax + (bx - ax) * t - ((bz - az) / len) * side, az + (bz - az) * t + ((bx - ax) / len) * side, rand(0.18, 0.34))
    }
  }
)

// Grass tufts (or heather, with a heather material) over an area [x0, z0, x1, z1], clear of footprints and of `clear`
// circles [x, z, r]. Each tuft is a fan of curved, tapering blades. Not solid.
export const grassPatch = defineBuilder(
  z
    .object({
      area: z.tuple([coord, coord, coord, coord]),
      count: z.number().int().min(1).max(8000),
      height: z.tuple([size(3), size(3)]).default([0.25, 0.6]),
      blades: z.tuple([z.number().int().min(1).max(40), z.number().int().min(1).max(40)]).default([7, 14]),
      spread: size(2).default(0.14),
      lean: z.tuple([num(0, 1.4), num(0, 1.4)]).default([0.15, 0.7]),
      width: size(0.3).default(0.035),
      clear: z
        .array(z.tuple([coord, coord, size(200)]))
        .max(256)
        .default([]),
      avoid: z.boolean().default(true),
      material: matName.default("grass"),
    })
    .strict(),
  (ctx, p) => {
    const { b, rand } = ctx
    const [x0, z0, x1, z1] = p.area
    const pos: number[] = []
    const nor: number[] = []
    const uv: number[] = []
    const at = (v: THREE.Vector3, tuft: number, t: number) => {
      pos.push(v.x, v.y, v.z)
      nor.push(0, 1, 0)
      uv.push(tuft, t)
    }
    const LV = [0, 0.38, 0.72, 1]
    let placed = 0
    for (let tries = 0; placed < p.count && tries < p.count * 8; tries++) {
      const tx = rand(x0, x1)
      const tz = rand(z0, z1)
      if (p.clear.some(([cx, cz, r]) => (tx - cx) ** 2 + (tz - cz) ** 2 < r * r)) continue
      if (p.avoid && ctx.blocked(tx, tz)) continue
      placed++
      const tuft = rand()
      const n = Math.round(rand(p.blades[0], p.blades[1] + 0.99))
      const hTuft = rand(p.height[0], p.height[1])
      for (let k = 0; k < n; k++) {
        const ang = rand(0, TAU)
        const r0 = rand(0, p.spread)
        const base = V(tx + Math.cos(ang) * r0, -0.02, tz + Math.sin(ang) * r0)
        const dir = rand() < 0.75 ? ang + rand(-0.4, 0.4) : rand(0, TAU)
        const d = V(Math.cos(dir), 0, Math.sin(dir))
        const side = V(-d.z, 0, d.x).applyAxisAngle(V(0, 1, 0), rand(-0.5, 0.5))
        const lean = rand(p.lean[0], p.lean[1])
        const h = hTuft * rand(0.6, 1.15)
        const w = p.width * rand(0.7, 1.3)
        const ring = LV.map((t) => {
          const c = base.clone().addScaledVector(d, Math.sin(lean) * h * t * t * 1.2)
          c.y += Math.cos(lean * t) * h * t
          const half = (w / 2) * (1 - t) ** 0.85
          return [c.clone().addScaledVector(side, -half), c.clone().addScaledVector(side, half), t] as const
        })
        for (let l = 0; l < 3; l++) {
          const [a0, a1, ta] = ring[l]
          const [b0, b1, tb] = ring[l + 1]
          at(a0, tuft, ta)
          at(a1, tuft, ta)
          at(b0, tuft, tb)
          if (l < 2) {
            at(a1, tuft, ta)
            at(b1, tuft, tb)
            at(b0, tuft, tb)
          }
        }
      }
    }
    if (!pos.length) return
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3))
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2))
    b.add(g, ctx.mat(p.material), null, { uv: "keep" })
    g.dispose()
  }
)

// A distant mountain: a ridged, noisy cone to stand beyond the trees and fade into the haze. Not solid.
export const mountain = defineBuilder(
  z
    .object({
      radius: size(2000).default(200),
      height: size(1500).default(150),
      ridges: num(0, 1).default(0.5),
      // Stretches the mountain along x into a ridge.
      stretch: num(0.2, 5).default(1),
      material: matName.default("mountain"),
    })
    .strict(),
  (ctx, p) => {
    const { b, rand } = ctx
    const n3 = noise3(rand)
    const RINGS = 18
    const SEGS = 56
    const pos: number[] = [0, p.height, 0]
    for (let j = 1; j <= RINGS; j++) {
      const t = j / RINGS
      for (let i = 0; i < SEGS; i++) {
        const a = (i / SEGS) * TAU
        const c = Math.cos(a)
        const s = Math.sin(a)
        const ridge = 1 - Math.abs(n3(c * 3 + 7, s * 3, t * 2) * 2 - 1)
        const r = t * p.radius * (0.8 + 0.4 * n3(c * 1.5, s * 1.5, 3))
        // A rounded summit over concave lower slopes, broken by ridges and spurs.
        const y = p.height * Math.exp(-3.2 * t * t) * (1 - t) * (0.8 + 0.4 * n3(c * 2 + 1, s * 2, t * 3) + p.ridges * 0.4 * (ridge - 0.5)) - (j === RINGS ? 4 : 0)
        pos.push(c * r * p.stretch, y, s * r)
      }
    }
    const idx: number[] = []
    for (let i = 0; i < SEGS; i++) idx.push(0, 1 + ((i + 1) % SEGS), 1 + i)
    for (let j = 0; j < RINGS - 1; j++)
      for (let i = 0; i < SEGS; i++) {
        const a = 1 + j * SEGS + i
        const bb = 1 + j * SEGS + ((i + 1) % SEGS)
        idx.push(a, bb, a + SEGS, bb, bb + SEGS, a + SEGS)
      }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    b.add(g, ctx.mat(p.material))
    g.dispose()
  }
)
