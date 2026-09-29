import type { CastMember } from "../figures/standees"
import { DEG, type Vec3 } from "../kit/geometry"
import type { SetSpec } from "./set"
import type { StagingShot, StagingSpec } from "./staging"

export interface ResolvedShot {
  position: Vec3
  target: Vec3
  fov: number
  label?: string
}

// Cast positions from marks or points; facing from degrees, another cast member, a mark, or a point.
export function resolveCast(set: SetSpec, staging: StagingSpec | null): CastMember[] {
  if (!staging) return []
  const place = new Map<string, { x: number; z: number; yaw?: number }>()
  const where = (ref: string | [number, number]) => {
    if (Array.isArray(ref)) return { x: ref[0], z: ref[1] }
    const m = set.marks[ref]
    if (!m) throw new Error(`staging ${staging.id}: unknown mark "${ref}"`)
    return { x: m.at[0], z: m.at[1], yaw: m.yaw }
  }
  for (const c of staging.cast) place.set(c.id, where(c.at))
  return staging.cast.map((c) => {
    const p = place.get(c.id)!
    let ry = (p.yaw ?? 0) * DEG
    const f = c.facing
    if (typeof f === "number") ry = f * DEG
    else {
      const t = Array.isArray(f) ? { x: f[0], z: f[1] } : (place.get(f) ?? where(f))
      ry = Math.atan2(t.x - p.x, t.z - p.z)
    }
    return { id: c.id, name: c.name, role: c.role, height: c.height, art: c.art, x: p.x, z: p.z, ry, walking: false, walk: 0, stride: 0 }
  })
}

// A staging shot framed on the cast's current positions: group shots on the centroid of their subjects, subject shots
// at a distance and angle off one character's facing.
export function frameShot(s: StagingShot, cast: CastMember[]): ResolvedShot {
  if ("position" in s) return s
  const byId = new Map(cast.map((c) => [c.id, c]))
  const need = (id: string) => {
    const c = byId.get(id)
    if (!c) throw new Error(`shot frames unknown cast member "${id}"`)
    return c
  }
  if ("subjects" in s) {
    let x = 0
    let z = 0
    for (const id of s.subjects) {
      const c = need(id)
      x += c.x
      z += c.z
    }
    x /= s.subjects.length
    z /= s.subjects.length
    return { position: [x + s.offset[0], s.offset[1], z + s.offset[2]], target: [x + s.target[0], s.target[1], z + s.target[2]], fov: s.fov, label: s.label }
  }
  const c = need(s.subject)
  const a = c.ry + s.angle * DEG
  return { position: [c.x + Math.sin(a) * s.distance, s.height, c.z + Math.cos(a) * s.distance], target: [c.x, s.lookHeight, c.z], fov: s.fov, label: s.label }
}

// Set shots, then staging shots on top, framed on where the cast stands now.
export function resolveShots(set: SetSpec, staging: StagingSpec | null, cast: CastMember[]): Record<string, ResolvedShot> {
  const out: Record<string, ResolvedShot> = {}
  for (const [k, s] of Object.entries(set.shots)) out[k] = { position: s.position, target: s.target, fov: s.fov, label: s.label }
  for (const [k, s] of Object.entries(staging?.shots ?? {})) out[k] = frameShot(s, cast)
  return out
}
