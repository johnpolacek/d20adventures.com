import * as THREE from "three"
import { archOutline, beam, Frame, G, lathe, M4, type Sink, TAU } from "../kit/geometry"
import type { Rand } from "../kit/rng"

// Pieces shared by several builders.

export const cone = (seg = 24) => G(`cone${seg}`, () => new THREE.ConeGeometry(1, 1, seg, 1))

export function spike(b: Sink, mat: THREE.Material, x: number, y: number, z: number, h = 1.4, r = 0.07) {
  b.add(cone(5), mat, M4(x, y + h / 2, z, 0, r, h, r), { uv: "keep" })
}
// A moulded ring around a round tower.
export function band(b: Sink, mat: THREE.Material, x: number, z: number, y: number, r: number, h: number, out: number, seg = 72) {
  lathe(
    b,
    mat,
    x,
    y,
    z,
    [
      [r - 0.2, 0],
      [r + out * 0.55, 0],
      [r + out, h * 0.25],
      [r + out, h * 0.7],
      [r + out * 0.4, h],
      [r - 0.2, h],
    ],
    seg
  )
}
export function merlons(b: Sink, rand: Rand, mat: THREE.Material, x: number, z: number, y: number, r: number, n: number, h: number, frac = 0.55, thick = 0.9, spikeMat: THREE.Material | null = null) {
  for (let k = 0; k < n; k++) {
    const a = ((k + 0.5) * TAU) / n
    const w = ((TAU * r) / n) * frac
    const px = x + Math.sin(a) * (r - thick / 2)
    const pz = z + Math.cos(a) * (r - thick / 2)
    const f = new Frame(b, M4(px, 0, pz, a))
    f.box(mat, 0, y + h / 2, 0, w, h, thick)
    f.box(mat, 0, y + h + 0.12, 0, w + 0.2, 0.24, thick + 0.2)
    if (spikeMat && k % 2 === 0) spike(b, spikeMat, px, y + h + 0.2, pz, rand(0.9, 1.8))
  }
}
export function corbels(b: Sink, mat: THREE.Material, x: number, z: number, y: number, r: number, n: number, out = 1.2) {
  for (let k = 0; k < n; k++) {
    const a = (k * TAU) / n
    const f = new Frame(b, M4(x + Math.sin(a) * r, y, z + Math.cos(a) * r, a))
    f.box(mat, 0, -0.35, out * 0.2, 0.55, 0.7, out * 0.4)
    f.box(mat, 0, -1.05, out * 0.1, 0.5, 0.7, out * 0.2)
    f.box(mat, 0, 0.25, out * 0.5, 0.6, 0.5, out)
  }
}
// A window cut into the wall: a black void, a moulded frame and a sill.
export function opening(b: Sink, voidMat: THREE.Material, trim: THREE.Material, m: THREE.Matrix4, w: number, h: number, pointed = false, depth = 0.7, frame = 0.38) {
  const f = new Frame(b, m)
  const inner = archOutline(w, h, pointed)
  const outer = archOutline(w + frame * 2, h + frame, pointed)
  f.shape(voidMat, inner, 0.3, M4(0, 0, -0.2))
  f.shape(
    trim,
    outer.map(([x, y]) => [x, y - frame * 0.5] as [number, number]),
    depth,
    M4(0, 0, -depth + 0.35),
    0,
    [inner]
  )
  f.box(trim, 0, -frame * 0.5 - 0.15, 0.2, w + frame * 2 + 0.4, 0.3, 0.5)
}
// A hanging banner, top edge at y, swaying most at its foot; optionally on an iron rod with ball finials.
export function banner(b: Sink, mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, ry = 0, rod: THREE.Material | null = null) {
  const g = G(`banner${w}-${h}`, () => new THREE.PlaneGeometry(w, h, 6, 28))
  b.add(g, mat, M4(x, y - h / 2, z, ry), { uv: "keep", extra: (geo, i) => (1 - THREE.MathUtils.clamp(geo.attributes.uv.getY(i), 0, 1)) ** 1.4 })
  if (rod) {
    const dx = Math.cos(ry) * (w / 2 + 0.45)
    const dz = -Math.sin(ry) * (w / 2 + 0.45)
    beam(b, rod, [x - dx, y + 0.1, z - dz], [x + dx, y + 0.1, z + dz], 0.12, 8)
    for (const s of [-1, 1])
      b.add(
        G("sph10", () => new THREE.SphereGeometry(1, 10, 7)),
        rod,
        M4(x + s * dx, y + 0.1, z + s * dz, 0, 0.28, 0.28, 0.28),
        { uv: "keep" }
      )
  }
}
// A tapering pennant on its own pole; `dir` is the yaw of the fly (radians).
export function pennant(b: Sink, mat: THREE.Material, poleMat: THREE.Material, x: number, y: number, z: number, len = 6, h = 1.6, pole = 6, dir = 0.4) {
  beam(b, poleMat, [x, y, z], [x, y + pole, z], 0.09, 6, 0.05)
  const g = G(`pennant${len}-${h}`, () => {
    const p = new THREE.PlaneGeometry(len, h, 16, 3)
    p.translate(len / 2, 0, 0)
    const pos = p.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const t = pos.getX(i) / len
      pos.setY(i, pos.getY(i) * (1 - 0.78 * t))
    }
    p.computeVertexNormals()
    return p
  })
  b.add(g, mat, M4(x, y + pole - h / 2 - 0.1, z, dir), { uv: "keep", extra: (geo, i) => geo.attributes.uv.getX(i) * 1.6 })
}
