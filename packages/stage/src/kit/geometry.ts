import * as THREE from "three"
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js"

export const TAU = Math.PI * 2
export const DEG = Math.PI / 180
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
export type Vec3 = [number, number, number]
export type Vec2 = [number, number]

export const smooth = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
// Position, yaw, scale, then pitch and roll: the placement every builder uses.
export function M4(x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  _e.set(rx, ry, rz, "YXZ")
  _q.setFromEuler(_e)
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz))
}

// Base geometries are shared while a set builds; every placement bakes a transformed copy into a Batch.
// The cache is emptied after each build, so parameters from an untrusted spec cannot grow it without bound.
const cache = new Map<string, THREE.BufferGeometry>()
export function G(key: string, make: () => THREE.BufferGeometry) {
  let g = cache.get(key)
  if (!g) {
    g = make()
    cache.set(key, g)
  }
  return g
}
export function resetGeometryCache() {
  for (const g of cache.values()) g.dispose()
  cache.clear()
}
export const unitBox = () => G("box", () => new THREE.BoxGeometry(1, 1, 1))

export type UVMode = "planar" | "radial" | "keep"
export interface AddOptions {
  uv?: UVMode
  r?: number
  extra?: ((g: THREE.BufferGeometry, i: number) => number) | null
  flat?: boolean
}

// Masonry shaders read the uv attribute as surface metres, so blocks keep a constant
// size whether they cover a 2 m corbel or a 90 m tower.
function surfaceUV(g: THREE.BufferGeometry, mode: UVMode, r: number, orig: ArrayLike<number> | null) {
  const p = g.attributes.position
  const n = g.attributes.normal
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const nx = n.getX(i)
    const ny = n.getY(i)
    const nz = n.getZ(i)
    if (Math.abs(ny) > 0.72) {
      uv[i * 2] = x
      uv[i * 2 + 1] = z
    } else if (mode === "radial" && orig) {
      uv[i * 2] = orig[i * 2] * TAU * r
      uv[i * 2 + 1] = y
    } else {
      const l = Math.hypot(nx, nz) || 1
      uv[i * 2] = x * (-nz / l) + z * (nx / l)
      uv[i * 2 + 1] = y
    }
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2))
}

// Timber shaders run their grain along the long axis of each piece. Before the placement matrix bakes the geometry into
// world space, each vertex records that axis (xyz, world space) and, on round pieces, the girth (w) that turns the wrapped
// uv into metres. Flat faces take the axis that runs longest along the face (its extent times how much of it lies in the
// face), projected into the face, so a curved hull's planks follow the hull to the bow. Round pieces run along their axis.
const ROUND = new Set(["CylinderGeometry", "LatheGeometry"])
function woodGrain(orig: THREE.BufferGeometry, g: THREE.BufferGeometry, matrix: THREE.Matrix4 | null, uvMode: UVMode) {
  g.computeBoundingBox()
  const size = g.boundingBox!.getSize(new THREE.Vector3())
  const e = (matrix || new THREE.Matrix4()).elements
  const col = [0, 1, 2].map((i) => new THREE.Vector3(e[i * 4], e[i * 4 + 1], e[i * 4 + 2]))
  const len = col.map((c) => c.length())
  const dir = col.map((c, i) => (len[i] > 1e-6 ? c.clone().divideScalar(len[i]) : new THREE.Vector3(+(i === 0), +(i === 1), +(i === 2))))
  const ext = [size.x * len[0], size.y * len[1], size.z * len[2]]
  const n = g.attributes.normal
  const out = new Float32Array(n.count * 4)
  const round = ROUND.has(orig.type)
  const girth = uvMode === "radial" ? 1 : Math.PI * Math.max(ext[0], ext[2])
  const t = new THREE.Vector3()
  for (let i = 0; i < n.count; i++) {
    if (round) {
      out[i * 4] = dir[1].x
      out[i * 4 + 1] = dir[1].y
      out[i * 4 + 2] = dir[1].z
      out[i * 4 + 3] = girth
      continue
    }
    const nn = [n.getX(i), n.getY(i), n.getZ(i)]
    let best = -1
    let k = 0
    for (let a = 0; a < 3; a++) {
      const score = ext[a] * Math.sqrt(Math.max(0, 1 - nn[a] * nn[a]))
      if (score > best + 1e-9) {
        best = score
        k = a
      }
    }
    t.set(0, 0, 0)
    for (let a = 0; a < 3; a++) t.addScaledVector(col[a], (a === k ? 1 : 0) - nn[a] * nn[k])
    if (t.lengthSq() < 1e-12) t.copy(dir[k])
    t.normalize()
    out[i * 4] = t.x
    out[i * 4 + 1] = t.y
    out[i * 4 + 2] = t.z
    out[i * 4 + 3] = 0
  }
  return out
}

// Anything geometry can be poured into: a Batch, or a Batch seen through an object's frame.
export interface Sink {
  add(geo: THREE.BufferGeometry, material: THREE.Material, matrix?: THREE.Matrix4 | null, opts?: AddOptions): THREE.BufferGeometry
}

// Static geometry merged by material: one draw call (plus its shadow) per material for the whole set.
export class Batch implements Sink {
  buckets = new Map<THREE.Material, THREE.BufferGeometry[]>()
  vertices = 0
  add(geo: THREE.BufferGeometry, material: THREE.Material, matrix: THREE.Matrix4 | null = null, { uv = "planar", r = 1, extra = null, flat = false }: AddOptions = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone()
    if (flat) g.computeVertexNormals()
    const orig = uv === "radial" && g.attributes.uv ? (g.attributes.uv.array as ArrayLike<number>) : null
    const grain = material.userData.wood ? woodGrain(geo, g, matrix, uv) : null
    if (matrix) g.applyMatrix4(matrix)
    if (uv === "planar" || uv === "radial") surfaceUV(g, uv, r, orig)
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k)
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    if (grain) g.setAttribute("grain", new THREE.BufferAttribute(grain, 4))
    if (material.userData.sway) {
      const s = new Float32Array(g.attributes.position.count)
      if (extra) for (let i = 0; i < s.length; i++) s[i] = extra(g, i)
      g.setAttribute("sway", new THREE.BufferAttribute(s, 1))
    }
    let bucket = this.buckets.get(material)
    if (!bucket) {
      bucket = []
      this.buckets.set(material, bucket)
    }
    bucket.push(g)
    this.vertices += g.attributes.position.count
    return g
  }
  // Seen through a frame: every placement is premultiplied by it (an object's position and yaw in the set).
  framed(frame: THREE.Matrix4): Sink {
    return {
      add: (geo, material, matrix = null, opts) => this.add(geo, material, matrix ? frame.clone().multiply(matrix) : frame.clone(), opts),
    }
  }
  flush(parent: THREE.Object3D, { cast = true, receive = true } = {}) {
    const meshes: THREE.Mesh[] = []
    for (const [material, geos] of this.buckets) {
      if (!geos.length) continue
      const merged = mergeGeometries(geos, false)
      if (!merged) throw new Error(`Unable to merge ${material.name || "geometry"}`)
      for (const g of geos) g.dispose()
      merged.computeBoundingSphere()
      // The CPU copy is not needed once the GPU has it: nothing raycasts or rebuilds the statics.
      for (const a of Object.values(merged.attributes)) (a as THREE.BufferAttribute).onUpload(dropArray)
      const m = new THREE.Mesh(merged, material)
      m.castShadow = cast && !material.userData.noShadow
      m.receiveShadow = receive
      m.matrixAutoUpdate = false
      m.name = `static:${material.name}`
      parent.add(m)
      meshes.push(m)
    }
    this.buckets.clear()
    return meshes
  }
}
function dropArray(this: THREE.BufferAttribute) {
  ;(this as unknown as { array: null }).array = null
}

// Common placements. Cylinders and lathes take their base height, boxes their centre.
export function box(b: Sink, mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0, rx = 0, rz = 0) {
  return b.add(unitBox(), mat, M4(x, y, z, ry, w, h, d, rx, rz))
}
export interface CylOptions {
  open?: boolean
  arc?: number
  start?: number
  ry?: number
  uv?: UVMode
}
export function cyl(b: Sink, mat: THREE.Material, x: number, y0: number, z: number, rBot: number, rTop: number, h: number, seg = 24, opts: CylOptions = {}) {
  const geo = G(
    `cyl${seg}-${rBot}-${rTop}-${opts.open ? 1 : 0}-${opts.arc || TAU}-${opts.start || 0}`,
    () => new THREE.CylinderGeometry(rTop, rBot, 1, seg, 1, !!opts.open, opts.start || 0, opts.arc || TAU)
  )
  return b.add(geo, mat, M4(x, y0 + h / 2, z, opts.ry || 0, 1, h, 1), { uv: opts.uv || "radial", r: Math.max(rBot, rTop), flat: seg <= 12 })
}
export interface LatheOptions {
  start?: number
  arc?: number
  ry?: number
  sx?: number
  sz?: number
  uv?: UVMode
}
export function lathe(b: Sink, mat: THREE.Material, x: number, y0: number, z: number, profile: Vec2[], seg = 32, opts: LatheOptions = {}) {
  const geo = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
    opts.start || 0,
    opts.arc || TAU
  )
  const r = Math.max(...profile.map((p) => p[0]))
  return b.add(geo, mat, M4(x, y0, z, opts.ry || 0, opts.sx || 1, 1, opts.sz || opts.sx || 1), { uv: opts.uv || "radial", r })
}
export function beam(b: Sink, mat: THREE.Material, a: Vec3 | THREE.Vector3, c: Vec3 | THREE.Vector3, r: number, seg = 6, r2 = r) {
  const A = Array.isArray(a) ? V(...a) : a
  const C = Array.isArray(c) ? V(...c) : c
  const dir = C.clone().sub(A)
  const len = dir.length()
  const m = new THREE.Matrix4().compose(A.clone().add(C).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.normalize()), V(1, len, 1))
  return b.add(
    G(`beam${seg}-${r}-${r2}`, () => new THREE.CylinderGeometry(r2, r, 1, seg, 1)),
    mat,
    m,
    { uv: "keep" }
  )
}
export function shape(b: Sink, mat: THREE.Material, pts: Vec2[], depth: number, matrix: THREE.Matrix4 | null, bevel = 0, holes: Vec2[][] = []) {
  const s = new THREE.Shape(pts.map((p) => new THREE.Vector2(...p)))
  for (const h of holes) s.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(...p))))
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 24 })
  const out = b.add(geo, mat, matrix)
  geo.dispose()
  return out
}
// Points on a round arch in the XY plane.
export function arcPts(cx: number, cy: number, r: number, a0: number, a1: number, n: number): Vec2[] {
  const out: Vec2[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  return out
}
// Outline of an arched opening, origin at the sill centre.
export function archOutline(w: number, h: number, pointed = false, n = 14): Vec2[] {
  const r = w / 2
  const pts: Vec2[] = [
    [-r, 0],
    [r, 0],
  ]
  if (!pointed) pts.push(...arcPts(0, h - r, r, 0, Math.PI, n))
  else {
    const R = w * 0.8
    const sp = h - Math.sqrt(R * R - (R - r) ** 2)
    const a = Math.acos((R - r) / R)
    pts.push(...arcPts(r - R, sp, R, 0, a, n / 2), ...arcPts(R - r, sp, R, Math.PI - a, Math.PI, n / 2).slice(1))
  }
  return pts
}

// A local coordinate frame for compound objects: windows on a curved wall, a statue in its niche.
export class Frame {
  constructor(
    public b: Sink,
    public m: THREE.Matrix4
  ) {}
  at(local: THREE.Matrix4) {
    return this.m.clone().multiply(local)
  }
  box(mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0, rx = 0, rz = 0) {
    return this.b.add(unitBox(), mat, this.at(M4(x, y, z, ry, w, h, d, rx, rz)))
  }
  geo(mat: THREE.Material, geo: THREE.BufferGeometry, local: THREE.Matrix4, opts?: AddOptions) {
    return this.b.add(geo, mat, this.at(local), opts)
  }
  shape(mat: THREE.Material, pts: Vec2[], depth: number, local: THREE.Matrix4, bevel = 0, holes: Vec2[][] = []) {
    return shape(this.b, mat, pts, depth, this.at(local), bevel, holes)
  }
  sphere(mat: THREE.Material, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, seg = 12) {
    return this.b.add(
      G(`sph${seg}`, () => new THREE.SphereGeometry(1, seg, Math.ceil(seg * 0.7))),
      mat,
      this.at(M4(x, y, z, 0, sx, sy, sz)),
      { uv: "keep" }
    )
  }
  cyl(mat: THREE.Material, x: number, y0: number, z: number, rb: number, rt: number, h: number, seg = 16, rx = 0, rz = 0) {
    return this.b.add(
      G(`fcyl${seg}-${rb}-${rt}`, () => new THREE.CylinderGeometry(rt, rb, 1, seg)),
      mat,
      this.at(M4(x, y0 + h / 2, z, 0, 1, h, 1, rx, rz)),
      { uv: "keep" }
    )
  }
  lathe(mat: THREE.Material, x: number, y0: number, z: number, profile: Vec2[], seg = 20, sx = 1, sz = sx) {
    const geo = new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r, y)),
      seg
    )
    const out = this.b.add(geo, mat, this.at(M4(x, y0, z, 0, sx, 1, sz)), { uv: "keep" })
    geo.dispose()
    return out
  }
}

export function canvasTexture(w: number, h: number, paint: (c: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true) {
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  paint(c.getContext("2d")!, w, h)
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}
