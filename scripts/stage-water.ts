// Where a set's water is deep enough to swim in, read from the set as it was built, so the rules engine has no water to
// find in three.js. A water surface counts where nothing walkable stands over it: a pier's boards, a boat's deck and the
// bank are dry, and the open river between them is not. Shallow water (a puddle, a ford a hand deep) is not swum in.
// Each stretch comes out as a ring in metres, [x, z] by x and z as authored, and the rings are read with the even-odd
// rule, so a ring inside another is a dry island in it.

import type * as THREE from "three"
import type { MaterialSpec } from "@d20/stage/spec/set"

// A cell is half a metre across: a pier plank is wider, and the rings are drawn to a third of a metre in the end.
const CELL = 0.5
// Past this many cells the grid keeps to the middle of its box.
const MAX_CELLS = 1_000_000
// Water at least this deep (a metre, to a Medium creature's waist) is swum in. Shallower is waded.
const DEPTH = 1
// A surface this far above the water line, or less, is a place to stand over it. Higher is a roof or a branch.
const STANDS_BELOW = 2.5
// A surface this near the water line or above it covers the water. Less is a bed under it.
const LEVEL = 0.05
// A ring this small, in square metres, is a post or a ripple, and is left out.
const SMALLEST = 1
// How closely a ring follows the cells it came from, in metres.
const TOLERANCE = 0.3

// What is not a floor: leaves, mist, light, flame and glass are drawn over the ground, not stood on.
const NOT_FLOOR = new Set<MaterialSpec["type"]>(["foliage", "mist", "glow", "fire", "orb", "glass", "card"])

type Ring = [number, number][]

// A triangle's cells whose centre it covers, each with the height of the triangle there.
function cover(g: THREE.BufferGeometry, up: boolean, x0: number, z0: number, w: number, d: number, visit: (cell: number, y: number) => void) {
  const p = g.attributes.position.array as ArrayLike<number>
  const index = g.index?.array
  const n = index ? index.length : p.length / 3
  for (let t = 0; t < n; t += 3) {
    const a = (index ? index[t] : t) * 3
    const b = (index ? index[t + 1] : t + 1) * 3
    const c = (index ? index[t + 2] : t + 2) * 3
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = [p[a], p[a + 1], p[a + 2], p[b], p[b + 1], p[b + 2], p[c], p[c + 1], p[c + 2]]
    // The area of the triangle seen from above, signed: it faces up when the corners run one way round.
    const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az)
    if (Math.abs(area) < 1e-9 || area > 0 !== up) continue
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / CELL))
    const i1 = Math.min(w - 1, Math.floor((Math.max(ax, bx, cx) - x0) / CELL))
    const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - z0) / CELL))
    const j1 = Math.min(d - 1, Math.floor((Math.max(az, bz, cz) - z0) / CELL))
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = x0 + (i + 0.5) * CELL
        const z = z0 + (j + 0.5) * CELL
        const u = ((bx - x) * (cz - z) - (cx - x) * (bz - z)) / area
        const v = ((cx - x) * (az - z) - (ax - x) * (cz - z)) / area
        const s = 1 - u - v
        if (u < 0 || v < 0 || s < 0) continue
        visit(j * w + i, u * ay + v * by + s * cy)
      }
  }
}

// The ring of a mask's outline, each as the corners of the cells it runs round, inside on the left.
function outlines(mask: Uint8Array, w: number, d: number): Ring[] {
  const at = (i: number, j: number) => i >= 0 && j >= 0 && i < w && j < d && mask[j * w + i] === 1
  // A directed edge from a corner to the next, keyed by the corner it starts at.
  const starts = new Map<number, [number, number][]>()
  const corner = (i: number, j: number) => j * (w + 1) + i
  const edge = (i: number, j: number, k: number, l: number) => {
    const list = starts.get(corner(i, j)) ?? []
    list.push([k, l])
    starts.set(corner(i, j), list)
  }
  for (let j = 0; j < d; j++)
    for (let i = 0; i < w; i++) {
      if (!at(i, j)) continue
      if (!at(i, j - 1)) edge(i, j, i + 1, j)
      if (!at(i + 1, j)) edge(i + 1, j, i + 1, j + 1)
      if (!at(i, j + 1)) edge(i + 1, j + 1, i, j + 1)
      if (!at(i - 1, j)) edge(i, j + 1, i, j)
    }
  const rings: Ring[] = []
  for (const [key, list] of starts) {
    while (list.length) {
      const first: [number, number] = [key % (w + 1), Math.floor(key / (w + 1))]
      const ring: Ring = [first]
      let [ci, cj] = first
      let heading = [list[0][0] - ci, list[0][1] - cj]
      for (;;) {
        const out = starts.get(corner(ci, cj))
        if (!out?.length) break
        // At a corner where two outlines touch, turn left first, so each ring stays one piece.
        const turn = (e: [number, number]) => heading[0] * (e[1] - cj) - heading[1] * (e[0] - ci)
        out.sort((a, b) => turn(a) - turn(b))
        const next = out.shift() as [number, number]
        heading = [next[0] - ci, next[1] - cj]
        ;[ci, cj] = next
        if (ci === first[0] && cj === first[1]) break
        ring.push([ci, cj])
      }
      rings.push(ring)
    }
  }
  return rings
}

const area = (ring: Ring) => Math.abs(ring.reduce((sum, [x, z], i) => sum + (ring[(i + 1) % ring.length][0] * z - x * ring[(i + 1) % ring.length][1]), 0)) / 2

// Douglas-Peucker on a closed ring: the points that matter, no point of the rest farther than the tolerance from them.
function simplify(ring: Ring, tolerance: number): Ring {
  const off = (p: [number, number], a: [number, number], b: [number, number]) => {
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const len = dx * dx + dz * dz
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len))
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz))
  }
  const keep = new Set<number>()
  const between = (lo: number, hi: number) => {
    let far = -1
    let most = tolerance
    for (let i = lo + 1; i < hi; i++) {
      const gap = off(ring[i % ring.length], ring[lo % ring.length], ring[hi % ring.length])
      if (gap > most) {
        most = gap
        far = i
      }
    }
    if (far < 0) return
    keep.add(far % ring.length)
    between(lo, far)
    between(far, hi)
  }
  // Split at the point farthest from the first, so the two halves are open runs.
  let split = 0
  for (let i = 1; i < ring.length; i++) if (Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]) > Math.hypot(ring[split][0] - ring[0][0], ring[split][1] - ring[0][1])) split = i
  keep.add(0)
  keep.add(split)
  between(0, split)
  between(split, ring.length)
  return ring.filter((_, i) => keep.has(i))
}

/**
 * The rings of a built set's swimmable water, in metres, inside `box` as [x0, z0, x1, z1]. None when it has none.
 * `buckets` are the build's geometry by material, `materials` the set's own. Where a river is the hole in the ground and
 * its water lies a hand below the bank, the rings follow the bank, and a pier's boards or a boat's deck over it are holes.
 */
export function waterRings(buckets: Iterable<[THREE.Material, THREE.BufferGeometry[]]>, materials: Record<string, MaterialSpec>, box: readonly [number, number, number, number]): Ring[] {
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
  const all = [...buckets]
  const surface = new Float32Array(w * d).fill(Number.NEGATIVE_INFINITY)
  for (const [m, geos] of all) {
    if (materials[m.name]?.type !== "water") continue
    for (const g of geos) cover(g, true, x0, z0, w, d, (cell, y) => (surface[cell] = Math.max(surface[cell], y)))
  }
  // What lies over the water, and the highest bed under it.
  const over = new Uint8Array(w * d)
  const bed = new Float32Array(w * d).fill(Number.NEGATIVE_INFINITY)
  for (const [m, geos] of all) {
    const type = materials[m.name]?.type
    if (type === "water" || (type && NOT_FLOOR.has(type))) continue
    for (const g of geos)
      cover(g, true, x0, z0, w, d, (cell, y) => {
        if (surface[cell] === Number.NEGATIVE_INFINITY) return
        if (y >= surface[cell] - LEVEL) {
          if (y <= STANDS_BELOW) over[cell] = 1
        } else bed[cell] = Math.max(bed[cell], y)
      })
  }
  const mask = new Uint8Array(w * d)
  for (let cell = 0; cell < w * d; cell++) if (surface[cell] > Number.NEGATIVE_INFINITY && !over[cell] && surface[cell] - bed[cell] >= DEPTH) mask[cell] = 1
  const metres = (i: number, j: number): [number, number] => [x0 + i * CELL, z0 + j * CELL]
  return outlines(mask, w, d)
    .filter((ring) => area(ring.map(([i, j]) => metres(i, j))) >= SMALLEST)
    .map((ring) => simplify(ring.map(([i, j]) => metres(i, j)), TOLERANCE))
    .filter((ring) => ring.length >= 3)
}
