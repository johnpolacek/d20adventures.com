// Fortifications: a pointed-arch gate block with archivolts and a carved
// frieze, round towers, curtain walls with timber hoarding, and great doors.
// The arch is described by one ArchSpec so doors, portcullis, god rays and the
// passage all agree on the opening.

import * as THREE from "three"
import { box, cyl, mesh, sph } from "../primitives"
import { clothify } from "../shaders"
import { type TextureSet, texSet } from "../textures"
import type { BuilderContext } from "./context"

export interface ArchSpec {
  /** Opening width at the springing. */
  w: number
  /** Height of the springing line. */
  spring: number
  /** Radius of each arc of the pointed arch (must exceed w/2). */
  r: number
}

export interface ResolvedArch extends ArchSpec {
  cx: number
  apex: number
  th: number
}

export function resolveArch(spec: ArchSpec): ResolvedArch {
  const cx = spec.r - spec.w / 2
  const apex = spec.spring + Math.sqrt(spec.r * spec.r - cx * cx)
  const th = Math.acos(-cx / spec.r)
  return { ...spec, cx, apex, th }
}

export function archPath(arch: ResolvedArch, offset = 0, path = new THREE.Path()): THREE.Path {
  const { w, spring, r, cx } = arch
  const hw = w / 2 + offset
  const rr = r + offset
  const th = Math.acos(-cx / rr)
  path.moveTo(-hw, -0.5)
  path.lineTo(-hw, spring)
  path.absarc(cx, spring, rr, Math.PI, th, true)
  path.absarc(-cx, spring, rr, Math.PI - th, 0, true)
  path.lineTo(hw, -0.5)
  return path
}

function archPoints(arch: ResolvedArch, offset: number, n = 90): THREE.Vector2[] {
  const path = archPath(arch, offset)
  const points: THREE.Vector2[] = []
  for (let i = 0; i <= n; i++) points.push(path.getPointAt(i / n))
  return points
}

/** Sweep a rectangular section along the arch curve with arc-length uvs. */
export function archBand(arch: ResolvedArch, inner: number, outer: number, z0: number, z1: number, uRepeat = 1, n = 90): THREE.BufferGeometry {
  const pi = archPoints(arch, inner, n)
  const po = archPoints(arch, outer, n)
  const position: number[] = []
  const normal: number[] = []
  const uv: number[] = []
  const index: number[] = []
  let L = 0
  const len = [0]
  for (let i = 1; i < pi.length; i++) {
    L += pi[i].distanceTo(pi[i - 1])
    len.push(L)
  }
  const quad = (a: number[], b: number[], c: number[], d: number[], N: number[]) => {
    const base = position.length / 3
    position.push(...a, ...b, ...c, ...d)
    for (let k = 0; k < 4; k++) normal.push(...N)
    index.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  for (let i = 0; i < pi.length - 1; i++) {
    const s0 = (len[i] / L) * uRepeat
    const s1 = (len[i + 1] / L) * uRepeat
    const a = pi[i]
    const b = pi[i + 1]
    const c = po[i]
    const d = po[i + 1]
    const t = new THREE.Vector2().subVectors(b, a).normalize()
    const on = [-t.y, t.x, 0]
    quad([a.x, a.y, z1], [b.x, b.y, z1], [d.x, d.y, z1], [c.x, c.y, z1], [0, 0, 1])
    uv.push(s0, 0, s1, 0, s1, 1, s0, 1)
    quad([c.x, c.y, z0], [d.x, d.y, z0], [b.x, b.y, z0], [a.x, a.y, z0], [0, 0, -1])
    uv.push(s0, 1, s1, 1, s1, 0, s0, 0)
    quad([c.x, c.y, z1], [d.x, d.y, z1], [d.x, d.y, z0], [c.x, c.y, z0], on)
    uv.push(s0, 0, s1, 0, s1, 0.3, s0, 0.3)
    quad([a.x, a.y, z0], [b.x, b.y, z0], [b.x, b.y, z1], [a.x, a.y, z1], [-on[0], -on[1], 0])
    uv.push(s0, 0, s1, 0, s1, 0.3, s0, 0.3)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3))
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3))
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2))
  geometry.setIndex(index)
  return geometry
}

export interface GateBlockOptions {
  arch: ResolvedArch
  /** Block half-width, height and depth. */
  halfWidth?: number
  height?: number
  depth?: number
  frieze?: TextureSet
  medallion?: TextureSet
  portcullis?: boolean
  lantern?: boolean
  sconces?: boolean
}

/**
 * The central gate block: extruded masonry with the arch cut through, light-stone
 * archivolts, a knotwork frieze band, drip courses, parapet with crenellations, a
 * crest block with carved medallion and spire, corner buttresses, a raised
 * portcullis, a hanging passage lantern, and torch sconces.
 */
export function gateBlock(
  ctx: BuilderContext,
  { arch, halfWidth = 6.2, height = 13.2, depth = 6.4, frieze, medallion, portcullis = true, lantern = true, sconces = true }: GateBlockOptions
): THREE.Group {
  const { materials: M, fire } = ctx
  const gate = new THREE.Group()
  const shape = new THREE.Shape()
  shape.moveTo(-halfWidth, -1)
  shape.lineTo(halfWidth, -1)
  shape.lineTo(halfWidth, height)
  shape.lineTo(-halfWidth, height)
  shape.closePath()
  shape.holes.push(archPath(arch, 0))
  const body = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 40 })
  body.translate(0, 0, -depth / 2)
  gate.add(mesh(body, M.stone(0.22, 0.22)))

  const hd = depth / 2
  const light = M.stone(0.5, 0.5, {}, M.stoneLightTex, 0.3)
  gate.add(mesh(archBand(arch, 0.02, 0.75, hd, hd + 0.42, 6), light))
  gate.add(mesh(archBand(arch, 0.02, 0.75, -hd - 0.42, -hd, 6), light))
  const friezeTex = frieze ?? M.knotTex
  const km = M.relief(friezeTex, 1, 1)
  gate.add(mesh(archBand(arch, 0.75, 1.45, hd, hd + 0.3, 14), km))
  gate.add(mesh(archBand(arch, 0.75, 1.45, -hd - 0.3, -hd, 14), km))
  gate.add(mesh(archBand(arch, 1.45, 1.7, hd, hd + 0.55, 6), light))
  const kb = M.relief(friezeTex, 9, 1)
  const bandY = height - 1.85
  gate.add(box(halfWidth * 2, 0.9, 0.25, kb, 0, bandY, hd + 0.12))
  gate.add(box(halfWidth * 2, 0.9, 0.25, kb, 0, bandY, -hd - 0.12))
  gate.add(box(halfWidth * 2 + 0.2, 0.35, depth + 0.6, light, 0, bandY + 0.6, 0))
  gate.add(box(halfWidth * 2 + 0.2, 0.35, depth + 0.6, light, 0, bandY - 0.6, 0))

  const parapet = M.stone(0.3, 0.3, {}, M.stoneTex, 0)
  const pz = hd - 0.15
  gate.add(box(halfWidth * 2 + 0.2, 1.3, 0.7, parapet, 0, height + 0.65, pz))
  gate.add(box(halfWidth * 2 + 0.2, 1.3, 0.7, parapet, 0, height + 0.65, -pz))
  for (let i = 0; i < 9; i++) {
    const x = -halfWidth + 0.6 + i * 1.4
    gate.add(box(0.8, 1.1, 0.7, parapet, x, height + 1.85, pz))
    gate.add(box(0.8, 1.1, 0.7, parapet, x, height + 1.85, -pz))
  }
  for (let i = 0; i < 14; i++) {
    const x = -halfWidth + i * 0.95 + 0.2
    gate.add(box(0.35, 0.5, 0.5, light, x, height - 0.2, hd + 0.3))
    gate.add(box(0.35, 0.5, 0.5, light, x, height - 0.2, -hd - 0.3))
  }

  const crest = M.stone(0.3, 0.3, {}, M.stoneLightTex, 0)
  gate.add(box(5.2, 3.4, 2.6, crest, 0, height + 2.0, 0))
  gate.add(box(5.6, 0.4, 3.0, light, 0, height + 3.85, 0))
  const med = M.relief(medallion ?? M.medallionTex, 1, 1, 1.6)
  const md = mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.25, 48), med, 0, height + 2.0, 1.35)
  md.rotation.x = Math.PI / 2
  gate.add(md)
  gate.add(mesh(new THREE.TorusGeometry(1.4, 0.12, 10, 48), M.brass, 0, height + 2.0, 1.42))
  const gable = mesh(new THREE.ConeGeometry(2.2, 1.5, 4), crest, 0, height + 4.8, 0)
  gable.rotation.y = Math.PI / 4
  gate.add(gable)
  gate.add(cyl(0.03, 0.05, 4.5, M.iron, 0, height + 7.3, 0, 8))
  gate.add(sph(0.14, M.gold, 0, height + 9.6, 0, 12))

  for (const s of [-1, 1]) {
    const bx = s * (halfWidth - 0.3)
    gate.add(box(1.0, 10.5, 1.0, M.stone(0.3, 0.3), bx, 5.25, hd + 0.2))
    gate.add(box(1.0, 10.5, 1.0, M.stone(0.3, 0.3), bx, 5.25, -hd - 0.2))
    gate.add(box(1.3, 0.6, 1.3, light, bx, 10.7, hd + 0.2))
    gate.add(box(1.3, 0.6, 1.3, light, bx, 10.7, -hd - 0.2))
  }

  if (portcullis) {
    const pc = new THREE.Group()
    pc.position.set(0, 0, 1.3)
    gate.add(pc)
    const top = arch.apex + 2.3
    for (let i = 0; i < 9; i++) {
      const x = -3.0 + i * 0.75
      pc.add(cyl(0.06, 0.06, 4.2, M.iron, x, top, 0, 8))
      pc.add(mesh(new THREE.ConeGeometry(0.075, 0.45, 8), M.iron, x, top - 2.3, 0))
    }
    for (let j = 0; j < 5; j++) pc.add(box(6.2, 0.1, 0.12, M.iron, 0, top - 1.8 + j * 0.85, 0))
    const link = new THREE.TorusGeometry(0.075, 0.022, 6, 12)
    for (const x of [-2.4, 2.4]) {
      for (let i = 0; i < 14; i++) {
        const l = mesh(link, M.iron, x, top + 1.6 + i * 0.13, 0)
        l.rotation.y = i % 2 ? Math.PI / 2 : 0
        pc.add(l)
      }
    }
  }

  if (lantern) {
    const ln = new THREE.Group()
    ln.position.set(0, arch.apex - 0.1, 0)
    const link = new THREE.TorusGeometry(0.075, 0.022, 6, 12)
    for (let i = 0; i < 10; i++) {
      const l = mesh(link, M.iron, 0, 1.4 + i * 0.13, 0)
      l.rotation.y = i % 2 ? Math.PI / 2 : 0
      ln.add(l)
    }
    ln.add(cyl(0.16, 0.22, 0.5, M.ironDark, 0, 0.9, 0, 6))
    ln.add(cyl(0.05, 0.05, 0.2, M.ironDark, 0, 1.3, 0, 6))
    ln.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.36, 6), M.emissive(0xffc070, 0xff9a30, 5), 0, 0.5, 0))
    const pl = new THREE.PointLight(0xffb060, 28, 14, 2)
    pl.position.set(0, 0.45, 0)
    ln.add(pl)
    gate.add(ln)
  }

  if (sconces) {
    for (const s of [-1, 1]) {
      const sc = new THREE.Group()
      sc.position.set(s * (arch.w / 2 - 0.05), 3.6, 1.8)
      sc.add(cyl(0.05, 0.05, 0.9, M.ironDark, -s * 0.1, 0.2, 0, 6))
      sc.add(cyl(0.04, 0.06, 0.5, M.wood(1, 1), -s * 0.1, 0.65, 0, 6))
      const holder = new THREE.Group()
      holder.position.set(-s * 0.1, 0.2, 0)
      sc.add(holder)
      fire.addFire(holder, { count: 4, scale: 0.6 })
      const tl = new THREE.PointLight(0xff9040, 10, 8, 2)
      tl.position.set(-s * 0.2, 1.1, 0)
      sc.add(tl)
      gate.add(sc)
    }
  }
  return gate
}

export interface TowerOptions {
  radius?: number
  height?: number
  /** Streamer cloths hung from the spire, in order. */
  streamers?: TextureSet[]
}

/** A round tower: battered base, string courses, corbelled machicolations, crenellated drum, conical roof, spire. */
export function tower(ctx: BuilderContext, { radius = 3.15, height = 14.6, streamers = [] }: TowerOptions = {}): THREE.Group {
  const { materials: M, time } = ctx
  const t = new THREE.Group()
  const sm = M.stone(5.5, 3.2)
  const smL = M.stone(5.5, 1, {}, M.stoneLightTex, 0.2)
  t.add(cyl(radius, radius + 0.3, height, sm, 0, height / 2, 0, 48))
  t.add(cyl(radius + 0.6, radius + 0.85, 1.6, M.stone(6, 0.5), 0, 0.8, 0, 48))
  t.add(cyl(radius + 0.2, radius + 0.2, 0.5, smL, 0, height * 0.37, 0, 48))
  t.add(cyl(radius + 0.17, radius + 0.17, 0.42, smL, 0, height * 0.66, 0, 48))
  const corbelY = height - 0.4
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2
    const c = box(0.5, 0.9, 0.7, smL, Math.cos(a) * (radius + 0.3), corbelY, Math.sin(a) * (radius + 0.3))
    c.rotation.y = -a
    t.add(c)
  }
  t.add(cyl(radius + 0.8, radius + 0.65, 2.7, M.stone(6, 0.8), 0, height + 1.3, 0, 48))
  t.add(cyl(radius + 0.9, radius + 0.9, 0.35, smL, 0, height + 2.8, 0, 48))
  const parapet = M.stone(0.3, 0.3, {}, M.stoneTex, 0)
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2
    const c = box(0.8, 1.15, 0.55, parapet, Math.cos(a) * (radius + 0.6), height + 3.5, Math.sin(a) * (radius + 0.6))
    c.rotation.y = -a
    t.add(c)
    t.add(mesh(new THREE.ConeGeometry(0.06, 0.9, 6), M.iron, Math.cos(a) * (radius + 0.6), height + 4.5, Math.sin(a) * (radius + 0.6)))
  }
  t.add(mesh(new THREE.ConeGeometry(2.4, 3.6, 24), M.roofTimber, 0, height + 4.7, 0))
  t.add(cyl(0.035, 0.06, 4.6, M.iron, 0, height + 8.6, 0, 8))
  t.add(sph(0.16, M.gold, 0, height + 10.9, 0, 12))
  for (const [ang, h] of [
    [0.35, 4],
    [-0.35, 7.5],
    [0.15, 11],
    [2.6, 6],
    [-2.6, 9],
  ]) {
    const slit = box(0.16, 1.3, 0.3, M.ironDark, Math.cos(ang) * (radius + 0.1), h, Math.sin(ang) * (radius + 0.1))
    slit.rotation.y = -ang
    t.add(slit)
  }
  const win = new THREE.Group()
  win.position.set(0, height * 0.78, radius - 0.1)
  win.add(box(0.9, 1.7, 0.5, M.ironDark, 0, 0, 0))
  win.add(box(1.4, 0.25, 0.6, smL, 0, 1.05, 0))
  for (const s of [-1, 1]) win.add(box(0.25, 2.0, 0.6, smL, s * 0.6, 0, 0))
  t.add(win)
  streamers.forEach((tex, i) => {
    const s = i % 2 ? 1 : -1
    const g = new THREE.PlaneGeometry(0.55, 2.2, 22, 56)
    g.translate(0, -1.1, 0)
    const m = new THREE.MeshStandardMaterial({ ...texSet(tex, 1, 1), roughness: 0.9, side: THREE.DoubleSide })
    clothify(m, time, { W: 0.55, H: 2.2, strength: 2.2, phase: s * 2 })
    const st = mesh(g, m, s * 0.3, height + 10, 0)
    st.rotation.y = Math.PI / 2
    t.add(st)
    const rod = cyl(0.02, 0.02, 0.7, M.iron, 0, height + 10, 0, 6)
    rod.rotation.x = Math.PI / 2
    t.add(rod)
  })
  return t
}

export interface CurtainWallOptions {
  /** Which side of the gate: -1 west, +1 east. */
  sign: 1 | -1
  /** Where the run starts (the gate block's outer edge) and how long it is. */
  startX?: number
  length?: number
  height?: number
  /** A square tower partway along, and a round one at the far end. */
  midTowerAt?: number
  endTower?: boolean
  pennant?: TextureSet
}

/** A curtain wall with timber hoarding on top, a square intermediate tower and a round end tower. */
export function curtainWall(ctx: BuilderContext, { sign, startX = 9.4, length = 62, height = 8, midTowerAt = 32, endTower = true, pennant }: CurtainWallOptions): THREE.Group {
  const { materials: M, time } = ctx
  const w = new THREE.Group()
  const L = length
  const cx = sign * (startX + L / 2)
  w.add(box(L, height, 2.6, M.stone(L / 4, 2), cx, height / 2, 0))
  w.add(box(L, 1.4, 3.6, M.stone(L / 4, 0.4), cx, 0.7, 0))
  w.add(box(L, 0.4, 3.0, M.stone(L / 4, 0.15, {}, M.stoneLightTex, 0), cx, height + 0.2, 0))
  const hm = M.wood(L / 2, 1)
  w.add(box(L, 2.3, 3.9, hm, cx, height + 1.55, 0))
  const rm = M.wood(L / 2, 1, M.woodDarkTex)
  for (const s of [-1, 1]) {
    const r = box(L, 0.22, 2.4, rm, cx, height + 3.05, s * 1.05)
    r.rotation.x = s * 0.42
    w.add(r)
  }
  w.add(box(L, 0.3, 0.6, rm, cx, height + 3.5, 0))
  for (let i = 0; i < Math.floor(L / 2.4); i++) {
    const x = sign * (startX + 1.2 + i * 2.4)
    for (const s of [-1, 1]) {
      const b = box(0.22, 0.22, 1.9, rm, x, height - 0.15, s * 1.5)
      b.rotation.x = s * 0.7
      w.add(b)
      w.add(box(0.3, 0.9, 0.12, M.ironDark, x, height + 1.3, s * 1.97))
    }
  }
  if (midTowerAt > 0) {
    const tx = sign * midTowerAt
    w.add(box(5.5, 12.5, 5.5, M.stone(1.4, 3.2), tx, 6.25, 0))
    w.add(box(6.2, 0.5, 6.2, M.stone(1.5, 0.2, {}, M.stoneLightTex, 0), tx, 12.6, 0))
    const parapet = M.stone(0.3, 0.3, {}, M.stoneTex, 0)
    for (let i = 0; i < 5; i++) {
      for (const s of [-1, 1]) {
        w.add(box(0.7, 1.0, 0.6, parapet, tx - 2.4 + i * 1.2, 13.35, s * 2.8))
        w.add(box(0.6, 1.0, 0.7, parapet, tx + s * 2.8, 13.35, -2.4 + i * 1.2))
      }
    }
    const roof = mesh(new THREE.ConeGeometry(4.0, 3.2, 4), M.roofTimber, tx, 14.9, 0)
    roof.rotation.y = Math.PI / 4
    w.add(roof)
    w.add(cyl(0.03, 0.05, 3, M.iron, tx, 17.5, 0, 6))
    if (pennant) {
      const g = new THREE.PlaneGeometry(0.8, 2.6, 22, 56)
      g.translate(0, -1.3, 0)
      const m = new THREE.MeshStandardMaterial({ ...texSet(pennant, 1, 1), roughness: 0.9, side: THREE.DoubleSide })
      clothify(m, time, { W: 0.8, H: 2.6, strength: 1.6, phase: sign * 3 })
      const st = mesh(g, m, tx, 19, 0)
      st.rotation.y = Math.PI / 2
      w.add(st)
    }
  }
  if (endTower) {
    const fx = sign * (startX + L)
    w.add(cyl(3.2, 3.5, 13, M.stone(5, 3), fx, 6.5, 0, 32))
    w.add(mesh(new THREE.ConeGeometry(3.5, 4, 24), M.roofTimber, fx, 15, 0))
  }
  return w
}

/** Two great oak doors hinged at the arch jambs, swung open inward (toward -Z). */
export function gateDoors(ctx: BuilderContext, arch: ResolvedArch, { openAngles = [0.5, 0.34], z = -2.3 }: { openAngles?: [number, number]; z?: number } = {}): THREE.Group {
  const { materials: M } = ctx
  const group = new THREE.Group()
  const hw = arch.w / 2 - 0.05
  const doorShape = () => {
    const s = new THREE.Shape()
    s.moveTo(-hw, 0)
    s.lineTo(-hw, arch.spring)
    s.absarc(arch.cx, arch.spring, arch.r - 0.05, Math.PI, arch.th, true)
    s.lineTo(0, 0)
    s.closePath()
    return s
  }
  for (const side of [-1, 1]) {
    const g = new THREE.ExtrudeGeometry(doorShape(), { depth: 0.28, bevelEnabled: false, curveSegments: 24 })
    g.translate(hw, 0, 0)
    if (side > 0) g.scale(-1, 1, 1)
    g.computeVertexNormals()
    const d = new THREE.Group()
    d.position.set(side * hw, 0.05, z)
    d.rotation.y = side * (side < 0 ? openAngles[0] : openAngles[1])
    group.add(d)
    const dm = M.wood(0.3, 0.1, M.woodVTex)
    for (const key of ["map", "normalMap", "roughnessMap"] as const) {
      const texture = dm[key]
      if (texture) texture.rotation = Math.PI / 2
    }
    d.add(mesh(g, dm))
    for (const y of [1.2, 4.0, 6.8]) {
      d.add(box(2.9, 0.18, 0.05, M.ironDark, -side * 1.55, y, 0.31))
      d.add(box(2.9, 0.18, 0.05, M.ironDark, -side * 1.55, y, -0.03))
      for (let i = 0; i < 6; i++) d.add(sph(0.045, M.iron, -side * (0.3 + i * 0.5), y, 0.34, 6))
    }
    d.add(box(0.12, 3.0, 0.12, M.ironDark, -side * 2.9, 4.5, 0.32))
    d.add(mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 16), M.iron, -side * 0.5, 4.8, 0.36))
  }
  return group
}
