import type * as THREE from "three"
import type { MaterialSpec } from "./set"

// What stands in the camera's way, taken from the set as it was built and not from its footprints: a footprint is where
// no one walks, and a tree's is its trunk, while its roots and a crooked bole reach well past that. Every solid
// triangle is marked into a grid of cells a hand wide, each a column of slices of height, so a sight line is tested
// against what the lens will see. Built once with the set, without a GPU, so `stage:check` sees what the stage does.

const CELL = 0.25
const SLICE = 0.25
const SLICES = 24
// Lower than this is ground cover and the ground itself.
const FLOOR = 0.3
const TOP = SLICE * SLICES
// Past this many cells the grid keeps to the middle of its ground.
const MAX_CELLS = 1_500_000

// Materials the eye passes through or over: grass and ferns, mist, light, glass, water, flame.
const THROUGH = new Set<MaterialSpec["type"]>(["grass", "meadow", "mist", "glow", "fire", "orb", "glass", "water", "card"])

export interface Sight {
  x0: number
  z0: number
  w: number
  d: number
  bits: Uint32Array
}
export type Point3 = readonly [number, number, number]
export interface Seen {
  x: number
  z: number
  y?: number
  height: number
  down?: boolean
}
export interface Lens {
  position: Point3
  target: Point3
  fov: number
  aspect: number
}

// `box` is the ground the grid covers, as [x0, z0, x1, z1]: where the cast can stand, with room for a camera about them.
// Beyond it nothing is known to be in the way.
export function buildSight(buckets: Iterable<[THREE.Material, THREE.BufferGeometry[]]>, materials: Record<string, MaterialSpec>, box: readonly [number, number, number, number]): Sight {
  let [x0, z0] = box
  let w = Math.max(1, Math.ceil((box[2] - x0) / CELL))
  let d = Math.max(1, Math.ceil((box[3] - z0) / CELL))
  if (w * d > MAX_CELLS) {
    const k = Math.sqrt(MAX_CELLS / (w * d))
    const cx = (box[0] + box[2]) / 2
    const cz = (box[1] + box[3]) / 2
    w = Math.floor(w * k)
    d = Math.floor(d * k)
    x0 = cx - (w * CELL) / 2
    z0 = cz - (d * CELL) / 2
  }
  const solid: THREE.BufferGeometry[] = []
  for (const [m, geos] of buckets) {
    const type = materials[m.name]?.type
    if (type && THROUGH.has(type)) continue
    for (const g of geos) {
      g.computeBoundingBox()
      const b = g.boundingBox!
      if (b.max.y < FLOOR || b.min.y > TOP || b.max.x < x0 || b.max.z < z0 || b.min.x > x0 + w * CELL || b.min.z > z0 + d * CELL) continue
      solid.push(g)
    }
  }
  const bits = new Uint32Array(w * d)
  const xN = x0 + w * CELL
  const zN = z0 + d * CELL
  const mark = (x: number, y: number, z: number) => {
    if (y < FLOOR) return
    const s = Math.floor(y / SLICE)
    if (s >= SLICES) return
    const i = Math.floor((x - x0) / CELL)
    const j = Math.floor((z - z0) / CELL)
    if (i < 0 || j < 0 || i >= w || j >= d) return
    bits[j * w + i] |= 1 << s
  }
  // Points across each triangle closer together than a cell, so none slips between them.
  const step = CELL * 0.7
  for (const g of solid) {
    const p = g.attributes.position.array as ArrayLike<number>
    const index = g.index?.array
    const n = index ? index.length : p.length / 3
    for (let t = 0; t < n; t += 3) {
      const a = (index ? index[t] : t) * 3
      const b = (index ? index[t + 1] : t + 1) * 3
      const c = (index ? index[t + 2] : t + 2) * 3
      const ax = p[a]
      const ay = p[a + 1]
      const az = p[a + 2]
      const bx = p[b]
      const by = p[b + 1]
      const bz = p[b + 2]
      const cx = p[c]
      const cy = p[c + 1]
      const cz = p[c + 2]
      if (Math.max(ay, by, cy) < FLOOR || Math.min(ay, by, cy) > TOP) continue
      if (Math.max(ax, bx, cx) < x0 || Math.min(ax, bx, cx) > xN || Math.max(az, bz, cz) < z0 || Math.min(az, bz, cz) > zN) continue
      // Rows run from the corner opposite the shortest side out to that side, each as wide as the triangle is there,
      // so a sliver of a tall trunk costs its length and not its length squared.
      const ab = Math.hypot(bx - ax, by - ay, bz - az)
      const ac = Math.hypot(cx - ax, cy - ay, cz - az)
      const bc = Math.hypot(cx - bx, cy - by, cz - bz)
      let o = a
      let e1 = b
      let e2 = c
      let narrow = bc
      if (ab <= ac && ab <= bc) {
        o = c
        e1 = a
        e2 = b
        narrow = ab
      } else if (ac <= ab && ac <= bc) {
        o = b
        e1 = a
        e2 = c
        narrow = ac
      }
      const ox = p[o]
      const oy = p[o + 1]
      const oz = p[o + 2]
      const px = p[e1]
      const py = p[e1 + 1]
      const pz = p[e1 + 2]
      const qx = p[e2]
      const qy = p[e2 + 1]
      const qz = p[e2 + 2]
      const long = Math.max(ab, ac, bc)
      const rows = Math.min(2000, Math.max(1, Math.ceil(long / step)))
      for (let u = 0; u <= rows; u++) {
        // From the apex (u = 0) out to the long side.
        const f = u / rows
        const sx = ox + (px - ox) * f
        const sy = oy + (py - oy) * f
        const sz = oz + (pz - oz) * f
        const ex = ox + (qx - ox) * f
        const ey = oy + (qy - oy) * f
        const ez = oz + (qz - oz) * f
        const cols = Math.min(2000, Math.max(1, Math.ceil((narrow * f) / step)))
        for (let v = 0; v <= cols; v++) {
          const g2 = v / cols
          mark(sx + (ex - sx) * g2, sy + (ey - sy) * g2, sz + (ez - sz) * g2)
        }
      }
    }
  }
  return { x0, z0, w, d, bits }
}

// Whether something solid is at a point.
export function solidAt(s: Sight, x: number, y: number, z: number) {
  if (y < FLOOR) return false
  const k = Math.floor(y / SLICE)
  if (k >= SLICES) return false
  const i = Math.floor((x - s.x0) / CELL)
  const j = Math.floor((z - s.z0) / CELL)
  if (i < 0 || j < 0 || i >= s.w || j >= s.d) return false
  return (s.bits[j * s.w + i] & (1 << k)) !== 0
}

// Whether the way from one point to another is clear. It stops `short` of the far end: what is looked at may lean on
// something, or stand in it.
export function clearLine(s: Sight, from: Point3, to: Point3, short = 0.35) {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const dz = to[2] - from[2]
  const len = Math.hypot(dx, dy, dz)
  const n = Math.ceil((len - short) / (CELL * 0.5))
  for (let i = 0; i <= n; i++) {
    const t = (i * CELL * 0.5) / len
    if (solidAt(s, from[0] + dx * t, from[1] + dy * t, from[2] + dz * t)) return false
  }
  return true
}

// Whether a camera stands clear: not in anything solid, nor so near that the lens cuts into it. What merely stands
// close and fills the picture is counted as cover, by what it hides.
export function roomAt(s: Sight, x: number, y: number, z: number, r = 0.25) {
  for (const [dx, dz] of AROUND) if (solidAt(s, x + dx * r, y, z + dz * r)) return false
  return true
}
const AROUND = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.7, 0.7],
  [-0.7, 0.7],
  [0.7, -0.7],
  [-0.7, -0.7],
  [0.5, 0],
  [-0.5, 0],
  [0, 0.5],
  [0, -0.5],
]

// The points of a figure a view should show, as the camera sees them: head, chest and both shoulders. Someone behind a
// table or knee deep in ferns is in plain view. Someone lying down is a low shape as long as they are tall.
export function figurePoints(c: Seen, from: Point3): Point3[] {
  const y = c.y ?? 0
  const dx = c.x - from[0]
  const dz = c.z - from[2]
  const len = Math.hypot(dx, dz) || 1
  const rx = -dz / len
  const rz = dx / len
  if (c.down) {
    const half = c.height * 0.4
    return [
      [c.x, y + FLOOR + 0.1, c.z],
      [c.x + rx * half, y + FLOOR + 0.1, c.z + rz * half],
      [c.x - rx * half, y + FLOOR + 0.1, c.z - rz * half],
    ]
  }
  const half = c.height * 0.17
  const at = (side: number, up: number): Point3 => [c.x + rx * half * side, y + Math.max(FLOOR + 0.05, c.height * up), c.z + rz * half * side]
  return [at(0, 0.92), at(0, 0.7), at(1, 0.72), at(-1, 0.72)]
}

// What a view costs its figures. `hidden` is the share of them behind something solid, and `out` the share outside the
// picture, each with the worst-off figure counted beside the average, so one of two wholly lost is not half a fault.
// `cover` is the share of the middle of the picture filled by something nearer than they are, such as a trunk beside
// the lens.
export function viewCost(s: Sight, lens: Lens, figures: readonly Seen[]) {
  const [px, py, pz] = lens.position
  let fx = lens.target[0] - px
  let fy = lens.target[1] - py
  let fz = lens.target[2] - pz
  const fl = Math.hypot(fx, fy, fz) || 1
  fx /= fl
  fy /= fl
  fz /= fl
  // Right and up of a level camera.
  let rx = -fz
  let rz = fx
  const rl = Math.hypot(rx, rz) || 1
  rx /= rl
  rz /= rl
  const ux = -rz * fy
  const uy = rz * fx - rx * fz
  const uz = rx * fy
  const tanY = Math.tan((lens.fov * Math.PI) / 360)
  const tanX = tanY * lens.aspect
  const hid = { worst: 0, sum: 0 }
  const off = { worst: 0, sum: 0 }
  let far = 0
  for (const c of figures) {
    const points = figurePoints(c, lens.position)
    let lost = 0
    let outside = 0
    for (const p of points) {
      const vx = p[0] - px
      const vy = p[1] - py
      const vz = p[2] - pz
      const depth = vx * fx + vy * fy + vz * fz
      if (depth < 0.3 || Math.abs((vx * rx + vz * rz) / (depth * tanX)) > 0.94 || Math.abs((vx * ux + vy * uy + vz * uz) / (depth * tanY)) > 0.94) outside++
      if (!clearLine(s, lens.position, p)) lost++
    }
    hid.worst = Math.max(hid.worst, lost / points.length)
    hid.sum += lost / points.length
    off.worst = Math.max(off.worst, outside / points.length)
    off.sum += outside / points.length
    far = Math.max(far, Math.hypot(c.x - px, c.z - pz))
  }
  const n = Math.max(1, figures.length)
  // Lines through the middle of the picture, as far as the farthest figure.
  let filled = 0
  let lines = 0
  const reach = figures.length ? far : fl
  for (const a of [-0.7, -0.45, -0.2, 0, 0.2, 0.45, 0.7])
    for (const b of [-0.5, -0.2, 0.1, 0.4]) {
      lines++
      const dx = fx + rx * a * tanX + ux * b * tanY
      const dy = fy + uy * b * tanY
      const dz = fz + rz * a * tanX + uz * b * tanY
      const k = reach / Math.max(Math.hypot(dx, dz), 1e-6)
      if (!clearLine(s, lens.position, [px + dx * k, py + dy * k, pz + dz * k], 0)) filled++
    }
  return { hidden: (hid.worst + hid.sum / n) / 2, out: (off.worst + off.sum / n) / 2, cover: filled / lines }
}
