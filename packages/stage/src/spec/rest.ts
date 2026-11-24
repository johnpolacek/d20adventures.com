import type { Part } from "./build"
import type { MaterialSpec } from "./set"

// What stands on nothing: a placed object that touches no other object and does not sit on the ground. A crate a
// hand over the deck, a lantern with no bracket, a sign that stops short of its wall. Each object is taken whole, its
// own geometry and not its children's, so the parts one builder makes are not tested against each other. Built in
// Node without a GPU, so `stage:check` sees what the stage draws.

// Nearer than this to another object's surface is touching it.
const TOUCH = 0.04
// The lowest point no higher than this is on the ground.
const GROUND = 0.04
const CELL = 0.5
// A triangle that covers more cells than this is kept in one list of its own: a set's whole ground is two of them.
const WIDE = 4096
// The most points of one object tested: its lowest first, then a spread of the rest.
const LOW = 64
const SPREAD = 512
// A face longer than this is sampled across, not only at its corners.
const FACE = 0.1

// Higher than this is hung overhead by design, a chandelier, bunting, a ceiling: not checked.
const OVERHEAD = 2.5

// Materials nothing stands on or hangs from: mist, light, flame, and a plain colour that is mostly its own glow (stars).
const AIR = new Set<MaterialSpec["type"]>(["mist", "glow", "fire", "orb"])
const isAir = (m: MaterialSpec | undefined) => !!m && (AIR.has(m.type) || ("emissiveIntensity" in m && (m.emissiveIntensity ?? 0) >= 1))

export interface Floater {
  path: string
  type: string
  // How high its lowest point is over what lies under it, or over the ground when nothing does.
  gap: number
  over: string | null
}

type Tri = Float64Array & { length: 9 }
const key = (ix: number, iz: number) => (ix + 4096) * 8192 + (iz + 4096)

export function findFloaters(parts: readonly Part[], materials: Record<string, MaterialSpec>): Floater[] {
  const solid = (name: string) => !isAir(materials[name])
  // Every solid triangle, with the object it belongs to.
  const tris: Tri[] = []
  const owner: number[] = []
  const cells = new Map<number, number[]>()
  const wide: number[] = []
  parts.forEach((part, pi) => {
    for (const { geo, material } of part.geos) {
      if (!solid(material.name)) continue
      const p = geo.attributes.position.array as ArrayLike<number>
      for (let i = 0; i + 8 < p.length; i += 9) {
        const t = new Float64Array(9) as Tri
        for (let k = 0; k < 9; k++) t[k] = p[i + k]
        const ti = tris.push(t) - 1
        owner.push(pi)
        const x0 = Math.floor((Math.min(t[0], t[3], t[6]) - TOUCH) / CELL)
        const x1 = Math.floor((Math.max(t[0], t[3], t[6]) + TOUCH) / CELL)
        const z0 = Math.floor((Math.min(t[2], t[5], t[8]) - TOUCH) / CELL)
        const z1 = Math.floor((Math.max(t[2], t[5], t[8]) + TOUCH) / CELL)
        if ((x1 - x0 + 1) * (z1 - z0 + 1) > WIDE) {
          wide.push(ti)
          continue
        }
        for (let ix = x0; ix <= x1; ix++)
          for (let iz = z0; iz <= z1; iz++) {
            const k = key(ix, iz)
            let c = cells.get(k)
            if (!c) cells.set(k, (c = []))
            c.push(ti)
          }
      }
    }
  })
  const near = (x: number, z: number) => [...(cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []), ...wide]

  const out: Floater[] = []
  parts.forEach((part, pi) => {
    const points: number[] = []
    for (const { geo, material } of part.geos) {
      if (!solid(material.name)) continue
      const p = geo.attributes.position.array as ArrayLike<number>
      for (let i = 0; i + 2 < p.length; i += 3) points.push(p[i], p[i + 1], p[i + 2])
    }
    const n = points.length / 3
    if (!n) return
    let low = Number.POSITIVE_INFINITY
    for (let i = 0; i < n; i++) low = Math.min(low, points[i * 3 + 1])
    if (low <= GROUND || low > OVERHEAD) return
    // A broad face touches through its middle as well as its corners: a coffin wider than its bier, a sign on a beam.
    for (const { geo, material } of part.geos) {
      if (!solid(material.name)) continue
      const p = geo.attributes.position.array as ArrayLike<number>
      for (let i = 0; i + 8 < p.length; i += 9) {
        const edge = Math.max(Math.hypot(p[i] - p[i + 3], p[i + 1] - p[i + 4], p[i + 2] - p[i + 5]), Math.hypot(p[i] - p[i + 6], p[i + 1] - p[i + 7], p[i + 2] - p[i + 8]))
        const k = Math.min(12, Math.floor(edge / FACE))
        for (let a = 1; a < k; a++)
          for (let b = 1; a + b < k; b++) {
            const u = a / k
            const v = b / k
            for (let c = 0; c < 3; c++) points.push(p[i + c] + u * (p[i + 3 + c] - p[i + c]) + v * (p[i + 6 + c] - p[i + c]))
          }
      }
    }
    const order = [...Array(n).keys()].sort((a, b) => points[a * 3 + 1] - points[b * 3 + 1])
    const all = points.length / 3
    const step = Math.max(1, Math.floor(all / SPREAD))
    const tested = new Set([...order.slice(0, LOW), ...Array.from({ length: Math.ceil(all / step) }, (_, i) => i * step)])
    for (const i of tested) {
      const x = points[i * 3]
      const y = points[i * 3 + 1]
      const z = points[i * 3 + 2]
      // A point sunk in another object, a shelf's end in its wall, rests in it: an odd count of that object's surfaces
      // above the point.
      const above = new Map<number, number>()
      for (const ti of near(x, z)) {
        if (owner[ti] === pi) continue
        if (distance(tris[ti], x, y, z) <= TOUCH) return
        const h = heightAt(tris[ti], x, z)
        if (h !== null && h > y) above.set(owner[ti], (above.get(owner[ti]) ?? 0) + 1)
      }
      for (const count of above.values()) if (count % 2) return
    }
    // Nothing touched: the least drop from one of its lowest points to whatever lies under it, or to the ground.
    let gap = low
    let over: string | null = null
    for (const i of order.slice(0, LOW)) {
      const x = points[i * 3]
      const y = points[i * 3 + 1]
      const z = points[i * 3 + 2]
      for (const ti of near(x, z)) {
        if (owner[ti] === pi) continue
        const h = heightAt(tris[ti], x, z)
        if (h !== null && h <= y + TOUCH && y - h < gap) {
          gap = y - h
          over = parts[owner[ti]].type
        }
      }
    }
    out.push({ path: part.path, type: part.type, gap, over })
  })
  return out
}

// The height of a triangle straight under (x, z), or null when (x, z) is outside it seen from above.
function heightAt(t: Tri, x: number, z: number): number | null {
  const d = (t[3] - t[0]) * (t[8] - t[2]) - (t[6] - t[0]) * (t[5] - t[2])
  if (Math.abs(d) < 1e-12) return null
  const u = ((x - t[0]) * (t[8] - t[2]) - (t[6] - t[0]) * (z - t[2])) / d
  const v = ((t[3] - t[0]) * (z - t[2]) - (x - t[0]) * (t[5] - t[2])) / d
  if (u < 0 || v < 0 || u + v > 1) return null
  return t[1] + u * (t[4] - t[1]) + v * (t[7] - t[1])
}

// How far a point is from a triangle (Ericson, Real-Time Collision Detection, 5.1.5).
function distance(t: Tri, px: number, py: number, pz: number): number {
  const [ax, ay, az, bx, by, bz, cx, cy, cz] = t
  const abx = bx - ax, aby = by - ay, abz = bz - az
  const acx = cx - ax, acy = cy - ay, acz = cz - az
  const apx = px - ax, apy = py - ay, apz = pz - az
  const d1 = abx * apx + aby * apy + abz * apz
  const d2 = acx * apx + acy * apy + acz * apz
  const at = (qx: number, qy: number, qz: number) => Math.hypot(px - qx, py - qy, pz - qz)
  if (d1 <= 0 && d2 <= 0) return at(ax, ay, az)
  const bpx = px - bx, bpy = py - by, bpz = pz - bz
  const d3 = abx * bpx + aby * bpy + abz * bpz
  const d4 = acx * bpx + acy * bpy + acz * bpz
  if (d3 >= 0 && d4 <= d3) return at(bx, by, bz)
  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3)
    return at(ax + v * abx, ay + v * aby, az + v * abz)
  }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz
  const d5 = abx * cpx + aby * cpy + abz * cpz
  const d6 = acx * cpx + acy * cpy + acz * cpz
  if (d6 >= 0 && d5 <= d6) return at(cx, cy, cz)
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6)
    return at(ax + w * acx, ay + w * acy, az + w * acz)
  }
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6))
    return at(bx + w * (cx - bx), by + w * (cy - by), bz + w * (cz - bz))
  }
  const denom = 1 / (va + vb + vc)
  const v = vb * denom
  const w = vc * denom
  return at(ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w)
}
