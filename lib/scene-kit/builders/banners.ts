// Cloth: hanging banners on iron rods, streamers, and pennant bunting.

import * as THREE from "three"
import { cyl, mesh, sph } from "../primitives"
import { type ClothOptions, clothify } from "../shaders"
import { type TextureSet, texSet } from "../textures"
import type { BuilderContext } from "./context"

export interface BannerOptions {
  wind?: number
  phase?: number
  /** Use the texture's alpha map for a ragged lower edge. */
  tatter?: boolean
}

/** A wind-animated cloth plane hanging from its top edge at the origin. */
export function banner(ctx: BuilderContext, tex: TextureSet, w: number, h: number, { wind = 1, phase = 0, tatter = false }: BannerOptions = {}, mode: ClothOptions["mode"] = 0): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(w, h, 22, 56)
  geometry.translate(0, -h / 2, 0)
  const material = new THREE.MeshStandardMaterial({ ...texSet(tex, 1, 1), roughness: 0.9, side: THREE.DoubleSide, transparent: tatter, alphaTest: tatter ? 0.5 : 0 })
  clothify(material, ctx.time, { W: w, H: h, strength: wind, phase, mode })
  const cloth = mesh(geometry, material)
  cloth.castShadow = true
  return cloth
}

/** A banner on an iron rod with brass finials and wall brackets, hung at the origin. */
export function hangBanner(ctx: BuilderContext, tex: TextureSet, w: number, h: number, opts: BannerOptions = {}): THREE.Group {
  const { materials: M } = ctx
  const group = new THREE.Group()
  const rod = cyl(0.04, 0.04, w + 0.5, M.iron, 0, 0.05, 0, 8)
  rod.rotation.z = Math.PI / 2
  group.add(rod)
  for (const s of [-1, 1]) {
    group.add(sph(0.07, M.brass, s * (w / 2 + 0.25), 0.05, 0, 8))
    const bracket = cyl(0.03, 0.03, 0.6, M.iron, s * (w / 2 + 0.1), 0.05, -0.3, 6)
    bracket.rotation.x = Math.PI / 2
    group.add(bracket)
  }
  group.add(banner(ctx, tex, w, h, opts))
  return group
}

export const BUNTING_COLORS = [0xc8352a, 0xe0b04a, 0x2e8a7a, 0xe8dcc0, 0x5a7a2a, 0xd8701e, 0x7a3a6a] as const

export interface BuntingRun {
  from: THREE.Vector3
  to: THREE.Vector3
  sag?: number
  spacing?: number
}

/** Sagging cords with instanced triangular pennants along every run. */
export function bunting(ctx: BuilderContext, runs: BuntingRun[]): THREE.Group {
  const group = new THREE.Group()
  const flags: { p: THREE.Vector3; dir: THREE.Vector3; c: number }[] = []
  for (const { from, to, sag = 1.2, spacing = 0.45 } of runs) {
    const L = from.distanceTo(to)
    const n = Math.max(2, Math.floor(L / spacing))
    const points: THREE.Vector3[] = []
    const dir = new THREE.Vector3().subVectors(to, from).normalize()
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const p = new THREE.Vector3().lerpVectors(from, to, t)
      p.y -= sag * 4 * t * (1 - t)
      points.push(p)
      if (i < n) flags.push({ p, dir, c: BUNTING_COLORS[(i + Math.floor(Math.abs(from.x))) % BUNTING_COLORS.length] })
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x3a2a1c })))
  }
  const tri = new THREE.BufferGeometry()
  tri.setAttribute("position", new THREE.Float32BufferAttribute([-0.12, 0, 0, 0.12, 0, 0, 0, -0.3, 0], 3))
  tri.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3))
  tri.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 1, 1, 0.5, 0], 2))
  const instanced = new THREE.InstancedMesh(tri, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, side: THREE.DoubleSide }), flags.length)
  const dummy = new THREE.Object3D()
  const color = new THREE.Color()
  flags.forEach((f, i) => {
    dummy.position.copy(f.p)
    dummy.position.y -= 0.02
    dummy.rotation.y = Math.atan2(f.dir.x, f.dir.z) + Math.PI / 2
    dummy.updateMatrix()
    instanced.setMatrixAt(i, dummy.matrix)
    instanced.setColorAt(i, color.set(f.c))
  })
  instanced.castShadow = false
  group.add(instanced)
  return group
}
