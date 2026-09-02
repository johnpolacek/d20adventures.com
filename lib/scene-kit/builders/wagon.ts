// Wagons: covered, hay or barrel-laden, with a driver and hitched horses.
// Built at the origin facing +Z (the horses stand at +Z).

import * as THREE from "three"
import { box, mesh } from "../primitives"
import { clothify } from "../shaders"
import { texSet } from "../textures"
import { horse } from "./animals"
import type { BuilderContext } from "./context"
import { randomTraveler } from "./figure"
import { barrel, crate, sack, wheel } from "./props"

export type WagonType = "covered" | "hay" | "barrels"

export interface WagonOptions {
  type?: WagonType
  horses?: number
  driver?: boolean
}

export function wagon(ctx: BuilderContext, { type = "covered", horses = 1, driver = true }: WagonOptions = {}): THREE.Group {
  const { materials: M, rng, time } = ctx
  const cart = new THREE.Group()
  const wm = M.wood(2, 1)
  const dm = M.wood(1, 1, M.woodDarkTex)
  const W = type === "hay" ? 2.0 : 1.8
  const L = type === "covered" ? 3.8 : 3.2
  cart.add(box(W, 0.12, L, wm, 0, 0.98, 0))
  cart.add(box(0.18, 0.18, L + 0.3, dm, 0, 0.88, 0))
  cart.add(box(W + 0.6, 0.16, 0.16, dm, 0, 0.78, -L * 0.3))
  cart.add(box(W + 0.4, 0.16, 0.16, dm, 0, 0.78, L * 0.3))
  if (type === "hay") {
    for (const s of [-1, 1]) {
      for (let i = 0; i < 9; i++) cart.add(box(0.07, 0.8, 0.1, wm, (s * W) / 2, 1.4, -L / 2 + 0.2 + (i * (L - 0.4)) / 8))
      cart.add(box(0.08, 0.06, L, dm, (s * W) / 2, 1.78, 0))
    }
    const heap = mesh(new THREE.SphereGeometry(1, 24, 16), M.hay, 0, 1.5, 0)
    heap.scale.set(W * 0.55, 0.7, L * 0.5)
    cart.add(heap)
    const heap2 = mesh(new THREE.SphereGeometry(0.6, 16, 12), M.hay, 0.3, 2.0, -0.4)
    heap2.scale.set(1.2, 0.7, 1)
    cart.add(heap2)
  } else {
    for (const s of [-1, 1]) {
      cart.add(box(0.08, 0.6, L, M.wood(4, 1), s * (W / 2 - 0.02), 1.3, 0))
      cart.add(box(W, 0.6, 0.08, M.wood(2, 1), 0, 1.3, -(L / 2 - 0.02)))
    }
  }
  if (type === "covered") {
    const cover = new THREE.CylinderGeometry(W * 0.56, W * 0.56, L - 0.4, 28, 8, true, 0, Math.PI)
    cover.rotateZ(Math.PI / 2)
    cover.rotateY(Math.PI / 2)
    const coverM = new THREE.MeshStandardMaterial({ ...texSet(M.canvasClothTex, 3, 2), roughness: 1, side: THREE.DoubleSide })
    clothify(coverM, time, { W: 3, H: L, strength: 0.1, phase: rng.value() * 6 })
    cart.add(mesh(cover, coverM, 0, 1.6, -0.1))
    for (let i = 0; i < 5; i++) cart.add(mesh(new THREE.TorusGeometry(W * 0.56, 0.03, 6, 24, Math.PI), dm, 0, 1.6, -L / 2 + 0.4 + (i * (L - 0.8)) / 4))
    const b = barrel(ctx)
    b.position.set(-0.45, 1.42, 0.6)
    cart.add(b)
    const s = sack(ctx, 0.9)
    s.position.set(0.3, 1.04, 0.6)
    cart.add(s)
    const c = crate(ctx, 0.5, 0.4, 0.5)
    c.position.set(0.3, 1.25, -0.6)
    c.rotation.y = 0.3
    cart.add(c)
  }
  if (type === "barrels") {
    for (const [x, y, z, s] of [
      [-0.5, 1.42, 0.9, 1],
      [0.45, 1.42, 0.9, 0.95],
      [-0.5, 1.42, 0.15, 1],
      [0.45, 1.42, 0.15, 1],
      [0, 2.2, 0.5, 0.9],
    ]) {
      const b = barrel(ctx, s)
      b.position.set(x, y, z)
      cart.add(b)
    }
    const c = crate(ctx, 0.9, 0.5, 0.7)
    c.position.set(0, 1.3, -0.9)
    cart.add(c)
  }
  for (const [x, z, r] of [
    [-W / 2 - 0.12, -L * 0.3, 0.78],
    [W / 2 + 0.12, -L * 0.3, 0.78],
    [-W / 2 - 0.1, L * 0.3, 0.58],
    [W / 2 + 0.1, L * 0.3, 0.58],
  ]) {
    const w = wheel(ctx, r, wm, dm)
    w.position.set(x, r, z)
    cart.add(w)
  }
  // driver's bench + footboard
  cart.add(box(W - 0.3, 0.08, 0.5, dm, 0, 1.55, L / 2 + 0.05))
  for (const s of [-1, 1]) cart.add(box(0.08, 0.55, 0.08, dm, s * (W / 2 - 0.25), 1.28, L / 2 + 0.05))
  cart.add(box(W - 0.2, 0.55, 0.08, wm, 0, 1.2, L / 2 + 0.42))
  if (driver) {
    const d = randomTraveler(ctx, { seated: true, noProps: true })
    d.position.set(0.25, 0.66, L / 2 + 0.02)
    cart.add(d)
  }
  const shaftLength = 2.6
  for (const s of [-1, 1]) cart.add(box(0.1, 0.1, shaftLength, dm, s * (horses > 1 ? 0.95 : 0.45), 0.95, L / 2 + shaftLength / 2 - 0.2))
  if (horses > 1) cart.add(box(2.1, 0.08, 0.08, dm, 0, 0.95, L / 2 + shaftLength - 0.3))
  for (let i = 0; i < horses; i++) {
    const h = horse(ctx)
    h.position.set(horses > 1 ? (i ? 0.55 : -0.55) : 0, 0, L / 2 + shaftLength - 0.5)
    cart.add(h)
  }
  return cart
}
