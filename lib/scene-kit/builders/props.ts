// Set dressing: containers, carts, lights, fences, boards, camp and festival clutter.
// Everything is built at the origin facing +Z; the set positions and rotates it.

import * as THREE from "three"
import { box, cyl, mesh, sph, V3 } from "../primitives"
import { clothify } from "../shaders"
import { type TextureSet, texSet } from "../textures"
import type { BuilderContext } from "./context"
import { randomTraveler } from "./figure"

export function barrel(ctx: BuilderContext, s = 1): THREE.Group {
  const { materials: M } = ctx
  const points: THREE.Vector2[] = []
  for (let i = 0; i <= 8; i++) {
    const t = i / 8
    points.push(new THREE.Vector2((0.27 + 0.06 * Math.sin(t * Math.PI)) * s, (t - 0.5) * 0.8 * s))
  }
  const g = new THREE.Group()
  g.add(mesh(new THREE.LatheGeometry(points, 20), M.wood(2, 1, M.woodVTex)))
  for (const yy of [-0.28, 0, 0.28]) g.add(mesh(new THREE.TorusGeometry((0.28 + 0.06 * Math.sin((yy / 0.8 + 0.5) * Math.PI)) * s, 0.018, 6, 24), M.ironDark, 0, yy * s, 0).rotateX(Math.PI / 2))
  g.add(cyl(0.25 * s, 0.25 * s, 0.02, M.wood(1, 1, M.woodDarkTex), 0, 0.4 * s, 0, 20))
  return g
}

export function crate(ctx: BuilderContext, w = 0.6, h = 0.5, d = 0.6): THREE.Group {
  const { materials: M } = ctx
  const g = new THREE.Group()
  g.add(box(w, h, d, M.wood(1, 1)))
  const rm = M.wood(1, 1, M.woodDarkTex)
  for (const s of [-1, 1]) {
    g.add(box(w + 0.02, 0.06, 0.06, rm, 0, (s * h) / 2 / 1.1, d / 2))
    g.add(box(w + 0.02, 0.06, 0.06, rm, 0, (s * h) / 2 / 1.1, -d / 2))
    g.add(box(0.06, h, 0.06, rm, (s * w) / 2, 0, d / 2))
    g.add(box(0.06, h, 0.06, rm, (s * w) / 2, 0, -d / 2))
  }
  return g
}

export function sack(ctx: BuilderContext, s = 1): THREE.Group {
  const { materials: M, rng } = ctx
  const g = new THREE.Group()
  const m = new THREE.MeshStandardMaterial({ ...texSet(M.canvasClothTex, 1, 1), roughness: 1 })
  const body = mesh(new THREE.SphereGeometry(0.32 * s, 16, 12), m, 0, 0.24 * s, 0)
  body.scale.set(1, 0.8, 0.9)
  g.add(body)
  g.add(mesh(new THREE.CylinderGeometry(0.08 * s, 0.14 * s, 0.16 * s, 10), m, 0, 0.52 * s, 0))
  g.add(mesh(new THREE.TorusGeometry(0.1 * s, 0.015, 6, 14), M.flat(0x4a3220), 0, 0.47 * s, 0).rotateX(Math.PI / 2))
  g.rotation.y = rng.value() * 6
  return g
}

/** A spoked cart wheel on its axle stub, centred at the hub. */
export function wheel(ctx: BuilderContext, r: number, spokeMaterial: THREE.Material, rimMaterial: THREE.Material): THREE.Group {
  const { materials: M } = ctx
  const g = new THREE.Group()
  g.add(mesh(new THREE.TorusGeometry(r - 0.06, 0.07, 8, 28), rimMaterial).rotateY(Math.PI / 2))
  g.add(mesh(new THREE.TorusGeometry(r, 0.025, 6, 28), M.ironDark).rotateY(Math.PI / 2))
  for (let i = 0; i < 10; i++) {
    const spoke = cyl(0.03, 0.03, r * 2 - 0.15, spokeMaterial, 0, 0, 0, 6)
    spoke.rotation.x = (i / 10) * Math.PI
    g.add(spoke)
  }
  g.add(cyl(0.12, 0.12, 0.26, rimMaterial, 0, 0, 0, 10).rotateZ(Math.PI / 2))
  return g
}

/** A tall pole with an iron fire cage and flames. Base at the origin. */
export function torchPole(ctx: BuilderContext): THREE.Group {
  const { materials: M, fire } = ctx
  const g = new THREE.Group()
  g.add(cyl(0.06, 0.08, 3.2, M.wood(1, 1, M.woodDarkTex), 0, 1.6, 0, 8))
  const cage = new THREE.Group()
  cage.position.set(0, 3.3, 0)
  g.add(cage)
  cage.add(cyl(0.16, 0.12, 0.3, M.ironDark, 0, 0, 0, 8))
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    cage.add(cyl(0.012, 0.012, 0.4, M.ironDark, Math.cos(a) * 0.15, 0.3, Math.sin(a) * 0.15, 4))
  }
  cage.add(mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 12), M.ironDark, 0, 0.5, 0).rotateX(Math.PI / 2))
  fire.addFire(g, { count: 7, y: 2.5 })
  fire.addLight(g, { intensity: 12, distance: 9, y: 3.6 })
  return g
}

/** An iron tripod brazier with coals, logs, flames and smoke. */
export function brazier(ctx: BuilderContext): THREE.Group {
  const { materials: M, rng, fire } = ctx
  const g = new THREE.Group()
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    const leg = cyl(0.02, 0.025, 0.9, M.ironDark, Math.cos(a) * 0.22, 0.45, Math.sin(a) * 0.22, 6)
    leg.rotation.z = -Math.cos(a) * 0.25
    leg.rotation.x = Math.sin(a) * 0.25
    g.add(leg)
  }
  g.add(mesh(new THREE.SphereGeometry(0.32, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.ironDark, 0, 0.95, 0))
  g.add(mesh(new THREE.TorusGeometry(0.32, 0.03, 8, 24), M.ironDark, 0, 0.95, 0).rotateX(Math.PI / 2))
  const coals = mesh(new THREE.SphereGeometry(0.26, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.emissive(0x2a1a12, 0xff4a10, 2.5, 1), 0, 0.72, 0)
  coals.scale.y = 0.6
  g.add(coals)
  for (let i = 0; i < 5; i++) {
    const log = cyl(0.03, 0.035, 0.4, M.flat(0x2a1a12), rng.range(-0.12, 0.12), 0.9, rng.range(-0.12, 0.12), 6)
    log.rotation.set(rng.range(-1.2, 1.2), rng.range(0, 3), rng.range(-1.2, 1.2))
    g.add(log)
  }
  fire.addFire(g, { count: 10, y: 0.05 })
  fire.addSmoke(g, { count: 8, y: 0 })
  fire.addLight(g, { color: 0xff7a30, intensity: 18, distance: 10, y: 1.3 })
  return g
}

/** A ring of stones with burning logs; flames and smoke; light. */
export function campfire(ctx: BuilderContext): THREE.Group {
  const { materials: M, rng, fire } = ctx
  const g = new THREE.Group()
  const stone = M.flat(0x6a6660)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    g.add(sph(rng.range(0.1, 0.15), stone, Math.cos(a) * 0.55, 0.06, Math.sin(a) * 0.55, 8))
  }
  for (let i = 0; i < 4; i++) {
    const log = cyl(0.05, 0.06, 0.8, M.flat(0x2a1a12), 0, 0.12, 0, 6)
    log.rotation.set(0.3, i * 0.8, 1.2)
    g.add(log)
  }
  fire.addFire(g, { count: 8, y: -0.8 })
  fire.addSmoke(g, { count: 6, y: -0.8 })
  fire.addLight(g, { intensity: 10, distance: 8, y: 0.6 })
  return g
}

/** A hanging lantern: glowing glass, iron caps, a short chain; optional light. */
export function lantern(ctx: BuilderContext, light = false): THREE.Group {
  const { materials: M } = ctx
  const g = new THREE.Group()
  const glass = M.emissive(0xffd090, 0xff9a30, 4, 0.6)
  g.add(cyl(0.16, 0.12, 0.32, glass, 0, 0, 0, 6))
  g.add(cyl(0.18, 0.18, 0.03, M.ironDark, 0, 0.17, 0, 6))
  g.add(cyl(0.12, 0.12, 0.03, M.ironDark, 0, -0.17, 0, 6))
  g.add(cyl(0.01, 0.01, 0.5, M.ironDark, 0, 0.4, 0, 4))
  if (light) g.add(new THREE.PointLight(0xffa050, 14, 12, 2))
  return g
}

/** A run of rope on brass-topped posts through the given ground points. */
export function ropeLine(ctx: BuilderContext, points: [number, number, number][]): THREE.Group {
  const { materials: M } = ctx
  const g = new THREE.Group()
  const postMaterial = M.wood(1, 1, M.woodDarkTex)
  const tops: THREE.Vector3[] = []
  for (const [x, y, z] of points) {
    const post = new THREE.Group()
    post.position.set(x, y, z)
    post.add(cyl(0.05, 0.065, 1.15, postMaterial, 0, 0.57, 0, 8))
    post.add(sph(0.08, M.brass, 0, 1.18, 0, 8))
    g.add(post)
    tops.push(V3(x, y + 1.08, z))
  }
  for (let i = 0; i < tops.length - 1; i++) {
    const a = tops[i]
    const b = tops[i + 1]
    const mid = a.clone().lerp(b, 0.5)
    mid.y -= 0.32
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, mid, b]), 12, 0.025, 6, false), M.rope))
  }
  return g
}

/** A two-wheeled handcart heaped with produce. */
export function handcart(ctx: BuilderContext): THREE.Group {
  const { materials: M, rng } = ctx
  const g = new THREE.Group()
  const wm = M.wood(2, 1)
  const dm = M.wood(1, 1, M.woodDarkTex)
  g.add(box(1.2, 0.1, 1.8, wm, 0, 0.7, 0))
  for (const s of [-1, 1]) {
    g.add(box(0.06, 0.4, 1.8, wm, s * 0.6, 0.9, 0))
    g.add(box(1.2, 0.4, 0.06, wm, 0, 0.9, s * 0.9))
    g.add(box(0.08, 0.08, 1.6, dm, s * 0.3, 0.68, 1.6))
  }
  for (const s of [-1, 1]) {
    const w = wheel(ctx, 0.5, wm, dm)
    w.position.set(s * 0.72, 0.5, 0)
    g.add(w)
  }
  g.add(box(0.08, 0.62, 0.08, dm, 0, 0.35, -0.7))
  for (let i = 0; i < 12; i++) {
    const p = sph(rng.range(0.13, 0.2), M.flat(i % 3 ? 0xd8701e : 0xe0a030), rng.range(-0.4, 0.4), 0.95, rng.range(-0.7, 0.7), 12)
    p.scale.y = 0.72
    g.add(p)
  }
  return g
}

/** A slatted crate with three hens. */
export function henCrate(ctx: BuilderContext): THREE.Group {
  const { materials: M, rng } = ctx
  const g = new THREE.Group()
  const wm = M.wood(2, 1)
  const dm = M.wood(1, 1, M.woodDarkTex)
  g.add(box(0.7, 0.05, 0.5, wm, 0, 0.03, 0))
  g.add(box(0.7, 0.05, 0.5, wm, 0, 0.5, 0))
  for (let i = 0; i < 8; i++) {
    g.add(cyl(0.01, 0.01, 0.5, dm, -0.33 + i * 0.094, 0.27, 0.25, 4))
    g.add(cyl(0.01, 0.01, 0.5, dm, -0.33 + i * 0.094, 0.27, -0.25, 4))
  }
  for (let i = 0; i < 3; i++) {
    const hen = new THREE.Group()
    hen.position.set(rng.range(-0.2, 0.2), 0.06, rng.range(-0.12, 0.12))
    hen.rotation.y = rng.value() * 6
    g.add(hen)
    const hc = M.flat([0xf0e8d8, 0x8a5a2a, 0x3a2a22][i])
    const body = sph(0.09, hc, 0, 0.09, 0, 8)
    body.scale.set(1, 0.9, 1.3)
    hen.add(body)
    hen.add(sph(0.05, hc, 0, 0.18, 0.1, 6))
    hen.add(mesh(new THREE.ConeGeometry(0.02, 0.05, 4), M.flat(0xd8a02a), 0, 0.17, 0.15))
    hen.add(box(0.02, 0.04, 0.03, M.flat(0xc82a2a), 0, 0.23, 0.1))
  }
  return g
}

/** A hay bale block. */
export function hayBale(ctx: BuilderContext): THREE.Mesh {
  return box(1.1, 0.6, 0.7, ctx.materials.hay, 0, 0.3, 0)
}

/** A notice board on two posts with blank pinned parchments. */
export function noticeBoard(ctx: BuilderContext): THREE.Group {
  const { materials: M } = ctx
  const g = new THREE.Group()
  const dm = M.wood(1, 1, M.woodDarkTex)
  g.add(cyl(0.06, 0.07, 2.2, dm, -0.7, 1.1, 0, 8))
  g.add(cyl(0.06, 0.07, 2.2, dm, 0.7, 1.1, 0, 8))
  g.add(box(1.6, 1.0, 0.06, M.wood(2, 1), 0, 1.6, 0))
  g.add(box(1.7, 0.12, 0.2, dm, 0, 2.15, 0))
  const parchment = M.flat(0xe6d8b8)
  for (const [x, y, w, h, r] of [
    [-0.45, 1.7, 0.42, 0.5, 0.05],
    [0.1, 1.55, 0.5, 0.6, -0.08],
    [0.55, 1.75, 0.3, 0.4, 0.1],
    [-0.1, 1.35, 0.35, 0.3, 0.03],
  ]) {
    const p = box(w, h, 0.01, parchment, x, y, 0.04)
    p.rotation.z = r
    g.add(p)
    g.add(sph(0.015, M.iron, x, y + h / 2 - 0.03, 0.05, 5))
  }
  return g
}

/** A guard's inspection table: ledger desk with strongbox, coins and inkpot, spears beside. */
export function inspectionTable(ctx: BuilderContext): THREE.Group {
  const { materials: M, rng } = ctx
  const g = new THREE.Group()
  const wm = M.wood(2, 1)
  const dm = M.wood(1, 1, M.woodDarkTex)
  g.add(box(1.8, 0.07, 0.8, wm, 0, 0.82, 0))
  for (const [x, z] of [
    [-0.8, -0.3],
    [0.8, -0.3],
    [-0.8, 0.3],
    [0.8, 0.3],
  ])
    g.add(box(0.08, 0.8, 0.08, dm, x, 0.4, z))
  g.add(box(1.7, 0.06, 0.06, dm, 0, 0.5, -0.3))
  g.add(box(1.7, 0.06, 0.06, dm, 0, 0.5, 0.3))
  const strongbox = new THREE.Group()
  strongbox.position.set(-0.45, 0.86, 0)
  strongbox.rotation.y = 0.2
  g.add(strongbox)
  strongbox.add(box(0.55, 0.34, 0.36, dm, 0, 0.17, 0))
  for (const x of [-0.2, 0.2]) strongbox.add(box(0.05, 0.36, 0.38, M.ironDark, x, 0.17, 0))
  strongbox.add(box(0.57, 0.05, 0.38, M.ironDark, 0, 0.33, 0))
  strongbox.add(box(0.08, 0.1, 0.03, M.brass, 0, 0.2, 0.19))
  strongbox.add(mesh(new THREE.TorusGeometry(0.03, 0.01, 6, 10), M.brass, 0, 0.14, 0.2))
  const link = new THREE.TorusGeometry(0.03, 0.009, 5, 10)
  for (let i = 0; i < 9; i++) {
    const l = mesh(link, M.iron, 0.28 + i * 0.03, 0.34 - i * i * 0.006, 0.1 + i * 0.01)
    l.rotation.y = i % 2 ? 0 : Math.PI / 2
    l.rotation.z = i % 2 ? 0 : 0.3
    strongbox.add(l)
  }
  g.add(cyl(0.11, 0.08, 0.06, M.brass, 0.35, 0.88, 0.1, 14))
  for (let i = 0; i < 6; i++) g.add(cyl(0.025, 0.025, 0.006, M.gold, 0.35 + rng.range(-0.07, 0.07), 0.915, 0.1 + rng.range(-0.06, 0.06), 10))
  g.add(cyl(0.06, 0.05, 0.14, M.flat(0x6a5a4a), 0.7, 0.92, -0.2, 10))
  return g
}

/** A spear leaning at a slight angle, butt at the origin. */
export function leaningSpear(ctx: BuilderContext): THREE.Group {
  const { materials: M } = ctx
  const g = new THREE.Group()
  g.rotation.z = -0.16
  g.rotation.x = 0.06
  g.add(cyl(0.02, 0.025, 2.4, M.wood(1, 1, M.woodDarkTex), 0, 1.2, 0, 8))
  const blade = mesh(new THREE.ConeGeometry(0.045, 0.42, 4), M.steel, 0, 2.6, 0)
  blade.scale.set(0.5, 1, 1)
  g.add(blade)
  g.add(cyl(0.03, 0.03, 0.06, M.brass, 0, 2.4, 0, 8))
  return g
}

/** A round striped pavilion tent with guy ropes and a pennant. */
export function pavilion(ctx: BuilderContext, { wall, roof, pennant }: { wall: TextureSet; roof: TextureSet; pennant: TextureSet }): THREE.Group {
  const { materials: M, time } = ctx
  const g = new THREE.Group()
  const wallM = M.clothMat(wall, 4, 1)
  const roofM = M.clothMat(roof, 1, 1)
  g.add(mesh(new THREE.CylinderGeometry(2.1, 2.1, 2.3, 24, 1, true, 0.6, Math.PI * 2 - 1.2), wallM, 0, 1.15, 0))
  g.add(mesh(new THREE.ConeGeometry(2.45, 1.9, 24, 1, true), roofM, 0, 3.25, 0))
  g.add(mesh(new THREE.TorusGeometry(2.3, 0.05, 6, 24), M.gold, 0, 2.3, 0).rotateX(Math.PI / 2))
  g.add(cyl(0.05, 0.07, 5.2, M.wood(1, 1, M.woodDarkTex), 0, 2.6, 0, 8))
  g.add(sph(0.12, M.gold, 0, 5.25, 0, 10))
  const flagGeometry = new THREE.PlaneGeometry(0.5, 1.6, 22, 56)
  flagGeometry.translate(0, -0.8, 0)
  const flagM = M.clothMat(pennant)
  clothify(flagM, time, { W: 0.5, H: 1.6, strength: 1.8, phase: 3 })
  const flag = mesh(flagGeometry, flagM, 0, 5.1, 0)
  flag.rotation.y = Math.PI / 2
  g.add(flag)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    g.add(
      cyl(0.02, 0.02, 1.6, M.rope, Math.cos(a) * 2.9, 0.8, Math.sin(a) * 2.9, 4)
        .rotateZ(Math.cos(a) * 0.55)
        .rotateX(-Math.sin(a) * 0.55)
    )
    g.add(cyl(0.03, 0.03, 0.4, M.wood(1, 1, M.woodDarkTex), Math.cos(a) * 3.3, 0.15, Math.sin(a) * 3.3, 6))
  }
  return g
}

/** A carved totem post with a knotwork collar, a stag-head plaque, antlers and offerings at the base. */
export function stagTotem(ctx: BuilderContext): THREE.Group {
  const { materials: M, rng } = ctx
  const g = new THREE.Group()
  g.add(cyl(0.22, 0.3, 3.2, M.wood(1, 2, M.woodVTex), 0, 1.6, 0, 10))
  g.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 10), M.relief(M.knotTex, 2, 1, 1.5), 0, 1.0, 0))
  g.add(box(0.55, 0.55, 0.12, M.relief(M.medallionTex, 1, 1, 2), 0, 3.4, 0.2))
  const dk = M.flat(0x4a3220)
  for (const s of [-1, 1]) {
    const a = cyl(0.03, 0.02, 0.9, dk, s * 0.3, 3.9, 0.1, 6)
    a.rotation.z = -s * 0.5
    g.add(a)
    const t1 = cyl(0.02, 0.015, 0.4, dk, s * 0.45, 4.15, 0.1, 5)
    t1.rotation.z = -s * 1.2
    g.add(t1)
    const t2 = cyl(0.02, 0.015, 0.4, dk, s * 0.55, 4.35, 0.1, 5)
    t2.rotation.z = s * 0.3
    g.add(t2)
  }
  for (let i = 0; i < 5; i++) {
    const p = sph(rng.range(0.14, 0.22), M.flat(0xd8701e), rng.range(-0.6, 0.6), 0.12, rng.range(0.3, 0.8), 12)
    p.scale.y = 0.72
    g.add(p)
  }
  for (let i = 0; i < 6; i++) g.add(sph(0.06, M.flat([0xc8352a, 0xd9a02a][i % 2]), rng.range(-0.5, 0.5), 0.06, rng.range(0.3, 0.9), 8))
  g.add(mesh(new THREE.TorusGeometry(0.3, 0.06, 8, 16), M.flat(0xa8772e), 0, 0.06, 0.9).rotateX(Math.PI / 2))
  return g
}

/** A market stall: counter, posts, a sagging striped canopy with scallops, goods on the counter. */
export function marketStall(ctx: BuilderContext, canopy: TextureSet): THREE.Group {
  const { materials: M, rng, time } = ctx
  const g = new THREE.Group()
  const wm = M.wood(2, 1)
  const dm = M.wood(1, 1, M.woodDarkTex)
  g.add(box(2.6, 0.9, 0.9, wm, 0, 0.45, 0.3))
  g.add(box(2.8, 0.08, 1.1, dm, 0, 0.92, 0.3))
  for (const [px, pz, h] of [
    [-1.4, -0.6, 3.0],
    [1.4, -0.6, 3.0],
    [-1.4, 0.9, 2.5],
    [1.4, 0.9, 2.5],
  ])
    g.add(cyl(0.05, 0.06, h, dm, px, h / 2, pz, 8))
  const cg = new THREE.PlaneGeometry(3.4, 2.2, 16, 10)
  const p = cg.attributes.position
  const uv = cg.attributes.uv
  for (let i = 0; i < p.count; i++) {
    const u = uv.getX(i)
    const v = uv.getY(i)
    p.setZ(i, -0.18 * Math.sin(u * Math.PI) * Math.sin(v * Math.PI))
  }
  cg.computeVertexNormals()
  const cmat = M.clothMat(canopy)
  clothify(cmat, time, { W: 3.4, H: 2.2, strength: 0.06, phase: rng.value() * 6 })
  const cv = mesh(cg, cmat, 0, 2.75, 0.15)
  cv.rotation.x = -Math.PI / 2 + 0.32
  g.add(cv)
  for (let i = 0; i < 7; i++) g.add(mesh(new THREE.CircleGeometry(0.24, 12, Math.PI, Math.PI), cmat, -1.45 + i * 0.48, 2.45, 1.25))
  for (let i = 0; i < 6; i++) {
    const k = rng.value()
    let o: THREE.Mesh
    if (k < 0.4) {
      o = sph(rng.range(0.12, 0.2), M.flat(0xd8701e), 0, 0, 0, 12)
      o.scale.y = 0.75
    } else if (k < 0.7) o = sph(0.07, M.flat([0xc8352a, 0xd9a02a, 0x8a3a2a][i % 3]), 0, 0, 0, 10)
    else o = box(rng.range(0.2, 0.35), 0.12, 0.4, M.flat([0x8a3b2a, 0x2e4a44, 0xa8772e, 0x5e3a5c][i % 4]))
    o.position.set(rng.range(-1.1, 1.1), 1.08, rng.range(0.0, 0.6))
    g.add(o)
  }
  g.add(cyl(0.18, 0.14, 0.28, M.wood(1, 1), -0.9, 1.1, 0.55, 12))
  return g
}

/** Three seated travelers on logs around a point, facing it. */
export function restingTravelers(ctx: BuilderContext, { makeFigure }: { makeFigure?: (facing: number) => THREE.Object3D } = {}): THREE.Group {
  const { materials: M } = ctx
  const g = new THREE.Group()
  const lm = M.wood(2, 1, M.woodDarkTex)
  for (const [x, z, ry] of [
    [-1.4, 0.3, 0.2],
    [0.9, -1.2, 1.3],
    [0.6, 1.4, -1.1],
  ]) {
    const log = cyl(0.2, 0.22, 1.8, lm, x, 0.2, z, 10)
    log.rotation.set(0, ry, Math.PI / 2)
    g.add(log)
    const facing = Math.atan2(-x, -z)
    if (makeFigure) {
      const f = makeFigure(facing)
      f.position.set(x, 0.05, z)
      g.add(f)
    } else {
      const t = randomTraveler(ctx, { seated: true })
      t.position.set(x, 0.05, z)
      t.rotation.y = facing
      g.add(t)
    }
  }
  return g
}
