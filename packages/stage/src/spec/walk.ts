import type { Footprint } from "../builders/types"

// Whether a ground point is inside a solid footprint (walls, stalls, tables): what the cast walks around and the crowd
// keeps off. Shared by the set build, the crowd, the runtime and `stage:check`, so they agree on what is walkable.
// With `above`, a footprint whose top is lower is passed over: a sight line at that height clears a crate.
export function onFootprint(footprints: readonly Footprint[], x: number, z: number, above = -Infinity) {
  for (const f of footprints) {
    if (f.kind === "rect" && f.top !== undefined && f.top < above) continue
    if (f.kind === "circle") {
      if (Math.hypot(x - f.x, z - f.z) < f.r) return true
      continue
    }
    const dx = x - f.x
    const dz = z - f.z
    const c = Math.cos(f.ry)
    const s = Math.sin(f.ry)
    if (Math.abs(dx * c - dz * s) < f.hw && Math.abs(dx * s + dz * c) < f.hd) return true
  }
  return false
}

// How far someone can walk from `from` toward `to` in a straight line: stops at the first solid footprint or at `budget`
// metres. Returns where they would stop, the distance walked, and whether something or the budget cut it short.
export function reachOver(footprints: readonly Footprint[], from: { x: number; z: number }, to: { x: number; z: number }, budget: number) {
  const dx = to.x - from.x
  const dz = to.z - from.z
  const want = Math.hypot(dx, dz)
  const limit = Math.min(want, budget)
  const step = 0.2
  let d = 0
  let blocked = false
  while (d + step <= limit) {
    const t = (d + step) / Math.max(want, 1e-6)
    if (onFootprint(footprints, from.x + dx * t, from.z + dz * t)) {
      blocked = true
      break
    }
    d += step
  }
  if (!blocked && limit - d > 1e-3 && !onFootprint(footprints, from.x + (dx * limit) / Math.max(want, 1e-6), from.z + (dz * limit) / Math.max(want, 1e-6))) d = limit
  const t = d / Math.max(want, 1e-6)
  return { x: from.x + dx * t, z: from.z + dz * t, distance: d, blocked, short: blocked || want > budget }
}
