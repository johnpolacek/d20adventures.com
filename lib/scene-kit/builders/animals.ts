// Animals: a draft or riding horse, and a small quadruped (goat, dog).

import * as THREE from "three"
import { box, cyl, mesh, sph } from "../primitives"
import type { BuilderContext } from "./context"

export const HORSE_COLORS = [0x5a3a22, 0x8a5a32, 0x3a2a22, 0x8c8880, 0x6a4a30, 0x2a2220, 0xa8865a] as const

export interface HorseOptions {
  color?: number
  grazing?: boolean
  harness?: boolean
  saddle?: boolean
}

export function horse(ctx: BuilderContext, { color, grazing = false, harness = true, saddle = false }: HorseOptions = {}): THREE.Group {
  const { materials: M, rng } = ctx
  const g = new THREE.Group()
  const m = M.flat(color ?? rng.pick(HORSE_COLORS), 0.8)
  const dk = M.flat(0x1e1814)
  const body = mesh(new THREE.CapsuleGeometry(0.36, 1.25, 8, 18), m, 0, 1.28, 0)
  body.rotation.x = Math.PI / 2
  body.scale.set(1, 1.1, 1)
  g.add(body)
  const chest = sph(0.36, m, 0, 1.3, 0.55, 14)
  chest.scale.set(0.95, 1.05, 1)
  g.add(chest)
  const rump = sph(0.37, m, 0, 1.35, -0.6, 14)
  rump.scale.set(1, 1.05, 1.05)
  g.add(rump)
  for (const [x, z, front] of [
    [-0.18, 0.52, 1],
    [0.18, 0.52, 1],
    [-0.18, -0.62, 0],
    [0.18, -0.62, 0],
  ]) {
    const upper = cyl(0.085, 0.065, 0.55, m, x, 0.85, z, 8)
    upper.rotation.x = front ? 0.08 : -0.1
    g.add(upper)
    g.add(cyl(0.055, 0.05, 0.5, m, x, 0.35, z + (front ? 0.02 : -0.03), 8))
    g.add(cyl(0.06, 0.07, 0.1, dk, x, 0.05, z + (front ? 0.02 : -0.03), 8))
    g.add(sph(0.07, m, x, 0.6, z, 8))
  }
  const neck = new THREE.Group()
  neck.position.set(0, 1.5, 0.85)
  neck.rotation.x = grazing ? 0.9 : -0.55
  g.add(neck)
  const nk = mesh(new THREE.CapsuleGeometry(0.17, 0.55, 6, 12), m, 0, 0.35, 0)
  nk.scale.set(1, 1, 1.4)
  neck.add(nk)
  const head = new THREE.Group()
  head.position.set(0, 0.72, 0.05)
  head.rotation.x = grazing ? 0.6 : 1.25
  neck.add(head)
  const hd = mesh(new THREE.CapsuleGeometry(0.12, 0.4, 6, 12), m, 0, 0.15, 0)
  hd.scale.set(1, 1, 1.15)
  head.add(hd)
  head.add(sph(0.11, m, 0, 0.42, 0, 10))
  for (const s of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.04, 0.17, 8), m, s * 0.08, -0.05, -0.06)
    ear.rotation.x = -0.5
    head.add(ear)
    head.add(sph(0.025, dk, s * 0.1, 0.05, 0.06, 6))
  }
  head.add(sph(0.03, dk, -0.05, 0.5, 0.04, 6))
  head.add(sph(0.03, dk, 0.05, 0.5, 0.04, 6))
  neck.add(box(0.06, 0.18, 0.75, dk, 0, 0.15, -0.12))
  g.add(box(0.06, 0.14, 0.5, dk, 0, 1.72, 0.35))
  const tail = cyl(0.06, 0.02, 0.9, dk, 0, 1.0, -1.05, 8)
  tail.rotation.x = 0.35
  g.add(tail)
  const leather = M.flat(0x3a2818)
  if (harness) {
    g.add(mesh(new THREE.TorusGeometry(0.44, 0.035, 8, 24), leather, 0, 1.3, 0.55))
    g.add(mesh(new THREE.TorusGeometry(0.41, 0.025, 8, 24), leather, 0, 1.3, -0.2))
  }
  if (saddle) {
    g.add(box(0.5, 0.02, 0.7, M.flat(0x8a3b2a), 0, 1.62, -0.05))
    g.add(box(0.46, 0.12, 0.6, M.flat(0x5a3a22), 0, 1.68, -0.05))
    g.add(box(0.06, 0.18, 0.1, M.flat(0x5a3a22), 0, 1.78, 0.25))
    g.add(mesh(new THREE.TorusGeometry(0.42, 0.025, 8, 24), leather, 0, 1.3, -0.05))
  }
  return g
}

export interface CritterOptions {
  size?: number
  color?: number
  horns?: boolean
  tailUp?: boolean
  dark?: number
}

/** A goat (horns) or dog (tail up, collar). ~0.9 m at the shoulder before `size`. */
export function critter(ctx: BuilderContext, { size = 1, color = 0xf0e8d8, horns = false, tailUp = false, dark = 0x2a2220 }: CritterOptions = {}): THREE.Group {
  const { materials: M } = ctx
  const g = new THREE.Group()
  g.scale.setScalar(size)
  const m = M.flat(color)
  const dk = M.flat(dark)
  const body = mesh(new THREE.CapsuleGeometry(0.19, 0.5, 6, 12), m, 0, 0.52, 0)
  body.rotation.x = Math.PI / 2
  g.add(body)
  for (const [x, z] of [
    [-0.1, 0.22],
    [0.1, 0.22],
    [-0.1, -0.22],
    [0.1, -0.22],
  ]) {
    g.add(cyl(0.035, 0.03, 0.42, m, x, 0.24, z, 6))
    g.add(cyl(0.035, 0.04, 0.05, dk, x, 0.03, z, 6))
  }
  const neck = cyl(0.09, 0.12, 0.3, m, 0, 0.68, 0.36, 8)
  neck.rotation.x = -0.7
  g.add(neck)
  const head = mesh(new THREE.CapsuleGeometry(0.08, 0.2, 4, 10), m, 0, 0.8, 0.52)
  head.rotation.x = Math.PI / 2 - 0.3
  g.add(head)
  for (const s of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.03, 0.12, 6), m, s * 0.07, 0.9, 0.42)
    ear.rotation.z = s * 0.9
    g.add(ear)
    g.add(sph(0.018, dk, s * 0.045, 0.85, 0.55, 5))
    if (horns) {
      const horn = cyl(0.02, 0.01, 0.22, M.flat(0x5a5048), s * 0.05, 0.98, 0.38, 5)
      horn.rotation.set(0.6, 0, -s * 0.4)
      g.add(horn)
    }
  }
  const tail = cyl(0.02, 0.01, 0.25, m, 0, tailUp ? 0.72 : 0.5, -0.42, 5)
  tail.rotation.x = tailUp ? -0.7 : 0.5
  g.add(tail)
  if (!horns) g.add(sph(0.05, M.flat(0x8a4a3a), 0, 0.72, -0.05, 5))
  return g
}
