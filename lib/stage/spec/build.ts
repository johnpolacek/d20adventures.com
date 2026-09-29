import * as THREE from "three"
import { BUILDERS } from "../builders"
import type { Anchor, BuildCtx, Footprint } from "../builders/types"
import type { PersonSeed } from "../figures/crowd"
import type { PawnKind } from "../figures/pawns"
import { Batch, DEG, M4, resetGeometryCache } from "../kit/geometry"
import { createRand, hashSeed, type Rand } from "../kit/rng"
import type { MaterialLibrary } from "../materials/library"
import { type CrowdGroup, LIMITS, objectEnvelope, type SetSpec, setSpecSchema } from "./set"

export class SetBuildError extends Error {
  constructor(
    public path: string,
    message: string
  ) {
    super(`${path}: ${message}`)
  }
}

export interface BuiltGeometry {
  batch: Batch
  extras: THREE.Object3D[]
  footprints: Footprint[]
  anchors: Anchor[]
  placed: number
}

const ENVELOPE_KEYS = new Set(["type", "id", "at", "yaw", "materials"])

// Runs every object's builder into one Batch. Each object gets its own random stream (set seed + its path in the spec),
// its frame (`at`, `yaw`, composed with any layout above it), and a material resolver: a role resolves through the
// object's `materials` map (inherited by children), then the builder's role defaults, then the role name itself.
export function buildSetGeometry(spec: SetSpec, library: MaterialLibrary): BuiltGeometry {
  const batch = new Batch()
  const footprints: Footprint[] = []
  const anchors: Anchor[] = []
  const extras: THREE.Object3D[] = []
  let placed = 0
  const _v = new THREE.Vector3()
  const _q = new THREE.Quaternion()
  const _s = new THREE.Vector3()

  const toWorld = (frame: THREE.Matrix4, x: number, y: number, z: number) => _v.set(x, y, z).applyMatrix4(frame)
  const yawOf = (frame: THREE.Matrix4) => {
    frame.decompose(_v, _q, _s)
    const e = new THREE.Euler().setFromQuaternion(_q, "YXZ")
    return e.y
  }
  const isBlocked = (x: number, z: number) => {
    for (const f of footprints) {
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

  function place(raw: Record<string, unknown>, parent: THREE.Matrix4, rand: Rand, path: string, depth: number, inherited: Record<string, string>) {
    if (depth > LIMITS.depth) throw new SetBuildError(path, `layouts nest deeper than ${LIMITS.depth}`)
    if (++placed > LIMITS.placed) throw new SetBuildError(path, `more than ${LIMITS.placed} objects placed`)
    const env = objectEnvelope.safeParse(raw)
    if (!env.success) throw new SetBuildError(path, env.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; "))
    const o = env.data
    const def = BUILDERS[o.type]
    if (!def) throw new SetBuildError(path, `unknown object type "${o.type}"`)
    const rest: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(raw)) if (!ENVELOPE_KEYS.has(k)) rest[k] = v
    const params = def.params.safeParse(rest)
    if (!params.success) throw new SetBuildError(`${path} (${o.type})`, params.error.issues.map((i) => `${i.path.join(".") || "params"}: ${i.message}`).join("; "))
    const at = o.at ? (o.at.length === 2 ? [o.at[0], 0, o.at[1]] : o.at) : [0, 0, 0]
    const frame = parent.clone().multiply(M4(at[0], at[1], at[2], (o.yaw ?? 0) * DEG))
    const overrides = { ...inherited, ...(o.materials ?? {}) }
    const mat = (name: string) => {
      const m = library.get(name)
      if (!m) throw new SetBuildError(`${path} (${o.type})`, `material "${name}" is not defined`)
      return m
    }
    const M = new Proxy({} as Record<string, THREE.Material>, { get: (_, role: string) => mat(overrides[role] ?? def.roles[role] ?? role) })
    const worldYaw = yawOf(frame)
    const ctx: BuildCtx = {
      b: batch.framed(frame),
      M,
      mat: (name) => mat(overrides[name] ?? name),
      rand,
      frame,
      footprint: (x, z, hw, hd, ry = 0) => {
        const p = toWorld(frame, x, 0, z)
        footprints.push({ kind: "rect", x: p.x, z: p.z, hw, hd, ry: ry + worldYaw })
      },
      circle: (x, z, r) => {
        const p = toWorld(frame, x, 0, z)
        footprints.push({ kind: "circle", x: p.x, z: p.z, r })
      },
      anchor: (tag, x, y, z) => {
        const p = toWorld(frame, x, y, z)
        anchors.push({ tag, x: p.x, y: p.y, z: p.z })
      },
      addObject: (obj) => {
        obj.applyMatrix4(frame)
        extras.push(obj)
      },
      place: (child, local, r, label) => place(child, frame.clone().multiply(local), r, `${path}/${label}`, depth + 1, overrides),
      blocked: (x, z) => {
        const p = toWorld(frame, x, 0, z)
        return isBlocked(p.x, p.z)
      },
    }
    try {
      def.build(ctx, params.data)
    } catch (err) {
      if (err instanceof SetBuildError) throw err
      throw new SetBuildError(`${path} (${o.type})`, err instanceof Error ? err.message : String(err))
    }
    if (batch.vertices > LIMITS.vertices) throw new SetBuildError(path, `the set exceeds ${LIMITS.vertices.toLocaleString()} vertices`)
  }

  try {
    spec.objects.forEach((raw, i) => {
      const label = raw.id ? `objects/${i}:${raw.id}` : `objects/${i}`
      place(raw as Record<string, unknown>, new THREE.Matrix4(), createRand(hashSeed(spec.seed, "objects", raw.id ?? i)), label, 0, {})
    })
  } finally {
    resetGeometryCache()
  }
  return { batch, extras, footprints, anchors, placed }
}

// ── Crowd population from the spec's groups ──────────────────────────────────
type Mix = Partial<Record<PawnKind, number>>
function pickKind(rand: Rand, mix: Mix): PawnKind {
  const entries = Object.entries(mix).filter(([, w]) => (w ?? 0) > 0) as [PawnKind, number][]
  if (!entries.length) return "traveler"
  const total = entries.reduce((a, [, w]) => a + w, 0)
  let r = rand(0, total)
  for (const [k, w] of entries) if ((r -= w) < 0) return k
  return entries[entries.length - 1][0]
}
function polyLength(pts: [number, number][]) {
  let L = 0
  for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
  return L
}
function pointAt(pts: [number, number][], d: number) {
  let L = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[i + 1]
    const len = Math.hypot(bx - ax, bz - az)
    if (d <= L + len || i === pts.length - 2) {
      const t = len > 0 ? Math.min(1, Math.max(0, (d - L) / len)) : 0
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: len > 0 ? (bx - ax) / len : 0, dz: len > 0 ? (bz - az) / len : 1 }
    }
    L += len
  }
  return { x: pts[0][0], z: pts[0][1], dx: 0, dz: 1 }
}

export function populateCrowd(spec: SetSpec, footprints: Footprint[], anchors: Anchor[]): PersonSeed[] {
  const crowd = spec.crowd
  if (!crowd) return []
  const seeds: PersonSeed[] = []
  const blockers: Footprint[] = [
    ...footprints,
    ...crowd.avoid.rects.map(([x, z, hw, hd, ry]) => ({ kind: "rect" as const, x, z, hw, hd, ry: ry * DEG })),
    ...crowd.avoid.circles.map(([x, z, r]) => ({ kind: "circle" as const, x, z, r })),
  ]
  const blocked = (x: number, z: number) =>
    blockers.some((f) => {
      if (f.kind === "circle") return Math.hypot(x - f.x, z - f.z) < f.r
      const dx = x - f.x
      const dz = z - f.z
      const c = Math.cos(f.ry)
      const s = Math.sin(f.ry)
      return Math.abs(dx * c - dz * s) < f.hw && Math.abs(dx * s + dz * c) < f.hd
    })
  const resolvePath = (ref: string | [number, number][], at: string) => {
    if (Array.isArray(ref)) return ref
    const p = spec.paths[ref]
    if (!p) throw new SetBuildError(at, `unknown path "${ref}"`)
    return p as [number, number][]
  }
  crowd.groups.forEach((g: CrowdGroup, gi) => {
    const rand = createRand(hashSeed(spec.seed, "crowd", gi))
    const at = `crowd/groups/${gi}`
    switch (g.type) {
      case "scatter": {
        const [x0, z0, x1, z1] = g.area
        let n = 0
        for (let tries = 0; n < g.count && tries < g.count * 40; tries++) {
          const x = rand(x0, x1)
          const z = rand(z0, z1)
          let d = 1
          for (const { rect, factor } of g.density)
            if (x > Math.min(rect[0], rect[2]) && x < Math.max(rect[0], rect[2]) && z > Math.min(rect[1], rect[3]) && z < Math.max(rect[1], rect[3])) d *= factor
          if (rand() > d || (g.avoid && blocked(x, z))) continue
          let ry = rand(0, Math.PI * 2)
          if (g.face && rand() < g.face.share) ry = Math.atan2(g.face.toward[0] - x, g.face.toward[1] - z) + rand(-g.face.jitter, g.face.jitter) * DEG
          seeds.push({ kind: pickKind(rand, g.mix), x, z, ry })
          n++
        }
        break
      }
      case "line":
        for (let i = 0; i < g.count; i++) {
          const t = g.count === 1 ? 0.5 : i / (g.count - 1)
          seeds.push({ kind: pickKind(rand, g.mix), x: g.from[0] + (g.to[0] - g.from[0]) * t, z: g.from[1] + (g.to[1] - g.from[1]) * t, ry: g.yaw * DEG, s: g.scale })
        }
        break
      case "points":
        for (const p of g.people) seeds.push({ kind: p.kind, x: p.at[0], z: p.at[1], y: p.y, ry: p.yaw * DEG, s: p.scale })
        break
      case "path": {
        const pts = resolvePath(g.path, at)
        const L = polyLength(pts)
        let d = g.start
        for (let i = 0; i < g.count && d <= L; i++) {
          const q = pointAt(pts, d)
          const lat = rand(-g.lateral, g.lateral)
          seeds.push({ kind: pickKind(rand, g.mix), x: q.x - q.dz * lat, z: q.z + q.dx * lat, ry: Math.atan2(-q.dx, -q.dz) })
          d += rand(g.spacing[0], g.spacing[1])
        }
        break
      }
      case "walkers": {
        const pts = resolvePath(g.path, at)
        for (let i = 0; i < g.count; i++) {
          const back = g.both && rand() < 0.5
          const speed = rand(g.speed[0], g.speed[1]) * (back ? -1 : 1)
          seeds.push({ kind: pickKind(rand, g.mix), x: pts[0][0], z: pts[0][1], ry: 0, walker: { path: pts, mode: g.mode, speed, d: rand(), lat: rand(g.lateral[0], g.lateral[1]) } })
        }
        break
      }
      case "anchors":
        for (const a of anchors) {
          if (a.tag !== g.tag) continue
          seeds.push({ kind: pickKind(rand, g.mix), x: a.x + rand(-g.jitter, g.jitter), y: a.y, z: a.z + rand(-g.jitter, g.jitter) * 0.6, ry: rand(g.yaw[0], g.yaw[1]) * DEG })
        }
        break
    }
  })
  return seeds.slice(0, LIMITS.people)
}

// Parse and fully check a set without rendering it: schema, every builder's params, materials, nesting and the geometry
// budget. Runs in Node (the stub library needs no DOM); use it before publishing a generated or edited set.
export function parseSet(input: unknown): SetSpec {
  const r = setSpecSchema.safeParse(input)
  if (!r.success) throw new SetBuildError("set", r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "))
  return r.data
}
