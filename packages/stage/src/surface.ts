import type * as THREE from "three"
import type { MaterialSpec } from "./spec/set"

// What a cast member has underfoot, for how their step sounds there: the forest floor, a dirt road, a gravel path,
// boards, stone, or something soft laid over the floor (a rug, straw).
export type Surface = "leaves" | "earth" | "gravel" | "wood" | "stone" | "soft"

const SOFT = /rug|carpet|straw|silk|cloth|hay|fur/i
const GRAVEL = /gravel|pebble|shingle/i
const BARE = /road|trail|path|track|dirt|earth|sand|mud/i

// The surface a material makes to walk on, by its kind and its name in the set. Null for one nobody walks on: mist, a
// glow, glass, water, the bark of a root.
export function surfaceOf(name: string, type: MaterialSpec["type"]): Surface | null {
  if (type === "cloth" || type === "burlap" || SOFT.test(name)) return "soft"
  if (GRAVEL.test(name)) return "gravel"
  if (type === "meadow") return BARE.test(name) ? "earth" : "leaves"
  if (type === "masonry" || type === "rock") return "stone"
  if (type === "wood" || type === "painted") return /bark/i.test(name) ? null : "wood"
  return null
}

type Tri = { ax: number; ay: number; az: number; bx: number; by: number; bz: number; cx: number; cy: number; cz: number; surface: Surface }
// A triangle that covers more cells than this is kept in one list of its own: a set's whole ground is two of them.
const WIDE = 64
const key = (ix: number, iz: number) => (ix + 4096) * 8192 + (iz + 4096)

/**
 * The set's floors, to ask what is under a point. A ray into the set's merged meshes takes 5 to 17 ms, a dropped frame
 * at every footfall, so the near-level triangles of what can be walked on are sorted once into metre cells.
 */
export class Floor {
  private cells = new Map<number, Tri[]>()
  private wide: Tri[] = []

  constructor(meshes: readonly THREE.Mesh[], materials: Record<string, MaterialSpec>) {
    for (const mesh of meshes) {
      const name = (mesh.material as THREE.Material).name
      const spec = materials[name]
      const surface = spec && surfaceOf(name, spec.type)
      if (!surface) continue
      const p = mesh.geometry.attributes.position
      const index = mesh.geometry.index
      const n = index ? index.count : p.count
      for (let i = 0; i < n; i += 3) {
        const a = index ? index.getX(i) : i
        const b = index ? index.getX(i + 1) : i + 1
        const c = index ? index.getX(i + 2) : i + 2
        const t: Tri = { ax: p.getX(a), ay: p.getY(a), az: p.getZ(a), bx: p.getX(b), by: p.getY(b), bz: p.getZ(b), cx: p.getX(c), cy: p.getY(c), cz: p.getZ(c), surface }
        // Near level only: a wall or a trunk is not stood on. The cross product's y against its length.
        const ux = t.bx - t.ax
        const uy = t.by - t.ay
        const uz = t.bz - t.az
        const vx = t.cx - t.ax
        const vy = t.cy - t.ay
        const vz = t.cz - t.az
        const ny = uz * vx - ux * vz
        const length = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx)
        if (length < 1e-9 || Math.abs(ny) / length < 0.7) continue
        const x0 = Math.floor(Math.min(t.ax, t.bx, t.cx))
        const x1 = Math.floor(Math.max(t.ax, t.bx, t.cx))
        const z0 = Math.floor(Math.min(t.az, t.bz, t.cz))
        const z1 = Math.floor(Math.max(t.az, t.bz, t.cz))
        if ((x1 - x0 + 1) * (z1 - z0 + 1) > WIDE) {
          this.wide.push(t)
          continue
        }
        for (let ix = x0; ix <= x1; ix++)
          for (let iz = z0; iz <= z1; iz++) {
            const k = key(ix, iz)
            const cell = this.cells.get(k)
            if (cell) cell.push(t)
            else this.cells.set(k, [t])
          }
      }
    }
  }

  /** What is under a point whose feet are at `y`: the highest floor from just over the feet to a little below them. Bare earth where there is none. */
  at(x: number, z: number, y = 0): Surface {
    let best: Surface = "earth"
    let top = -Infinity
    const look = (list: readonly Tri[] | undefined) => {
      if (!list) return
      for (const t of list) {
        const d = (t.bz - t.cz) * (t.ax - t.cx) + (t.cx - t.bx) * (t.az - t.cz)
        if (Math.abs(d) < 1e-12) continue
        const u = ((t.bz - t.cz) * (x - t.cx) + (t.cx - t.bx) * (z - t.cz)) / d
        const v = ((t.cz - t.az) * (x - t.cx) + (t.ax - t.cx) * (z - t.cz)) / d
        if (u < 0 || v < 0 || u + v > 1) continue
        const h = u * t.ay + v * t.by + (1 - u - v) * t.cy
        if (h > y + 0.35 || h < y - 1.2 || h < top) continue
        top = h
        best = t.surface
      }
    }
    look(this.cells.get(key(Math.floor(x), Math.floor(z))))
    look(this.wide)
    return best
  }
}
