// Human figures: a parametric traveler, a city guard, and an armoured captain
// with an animated beckoning arm. All built from primitives so clothing colours,
// props and heraldry come from the set, not from a fixed mesh.

import * as THREE from "three"
import type { Animated } from "../atmosphere"
import { box, cyl, mesh, sph } from "../primitives"
import { clothify } from "../shaders"
import { type TextureSet, texSet } from "../textures"
import type { BuilderContext } from "./context"

export const SKIN_TONES = [0xd9a98a, 0xc48d68, 0x9c6b4a, 0x6f4a34, 0xe4b99d] as const
export const CLOTH_COLORS = [0x8a3b2a, 0xa8772e, 0x5a6a2e, 0x4d3a2a, 0x3f5877, 0xc9b48e, 0x5e3a5c, 0x7a5a3a, 0x9a4b3b, 0x2e4a44] as const
export const HAIR_COLORS = [0x2a1c12, 0x4a2c18, 0x8a5a2a, 0xd9a86a, 0x1a1210, 0x6a3a1a, 0xb0a090] as const

export interface FigureOptions {
  /** Overall height multiplier; 1 is ~1.9 m. */
  h?: number
  skin?: number
  tunic?: number
  legs?: number
  cloak?: number | null
  hood?: boolean
  hat?: boolean
  staff?: boolean
  bundle?: boolean
  basket?: boolean
  sack?: boolean
  hair?: number
  seated?: boolean
  noHair?: boolean
}

export function figure(
  ctx: BuilderContext,
  {
    h = 1.0,
    skin,
    tunic,
    legs,
    cloak = null,
    hood = false,
    hat = false,
    staff = false,
    bundle = false,
    basket = false,
    sack = false,
    hair = 0x2a1c12,
    seated = false,
    noHair = false,
  }: FigureOptions = {}
): THREE.Group {
  const { materials: M, rng } = ctx
  const g = new THREE.Group()
  const sk = M.flat(skin ?? rng.pick(SKIN_TONES))
  const tm = M.flat(tunic ?? rng.pick(CLOTH_COLORS))
  const lm = M.flat(legs ?? rng.pick(CLOTH_COLORS))
  const boot = M.flat(0x3a2a1c)
  if (!seated) {
    for (const s of [-1, 1]) {
      g.add(cyl(0.085, 0.1, 0.82, lm, s * 0.12, 0.45, 0, 10))
      g.add(box(0.16, 0.12, 0.26, boot, s * 0.12, 0.06, 0.03))
    }
  } else {
    for (const s of [-1, 1]) {
      const thigh = cyl(0.09, 0.085, 0.5, lm, s * 0.2, 0.84, 0.22, 10)
      thigh.rotation.set(-1.3, 0, s * 0.35)
      g.add(thigh)
      g.add(cyl(0.08, 0.085, 0.5, lm, s * 0.3, 0.5, 0.42, 10))
      g.add(box(0.16, 0.12, 0.26, boot, s * 0.3, 0.2, 0.46))
    }
  }
  g.add(cyl(0.21, 0.25, 0.3, tm, 0, 0.98, 0, 14))
  g.add(cyl(0.2, 0.21, 0.62, tm, 0, 1.38, 0, 14))
  g.add(cyl(0.22, 0.2, 0.08, M.flat(0x3a2818), 0, 1.12, 0, 14))
  g.add(sph(0.2, tm, 0, 1.66, 0, 14))
  for (const s of [-1, 1]) {
    const arm = new THREE.Group()
    arm.position.set(s * 0.26, 1.62, 0)
    arm.rotation.z = s * 0.12
    arm.rotation.x = rng.range(-0.2, 0.1)
    arm.add(cyl(0.06, 0.055, 0.62, tm, 0, -0.31, 0, 8))
    arm.add(sph(0.06, sk, 0, -0.64, 0, 8))
    g.add(arm)
  }
  g.add(cyl(0.06, 0.07, 0.12, sk, 0, 1.74, 0, 8))
  const head = sph(0.135, sk, 0, 1.9, 0, 16)
  head.scale.set(0.9, 1.05, 0.95)
  g.add(head)
  const eye = M.flat(0x1a1210)
  g.add(sph(0.02, eye, -0.045, 1.905, 0.12, 6))
  g.add(sph(0.02, eye, 0.045, 1.905, 0.12, 6))
  g.add(sph(0.025, sk, 0, 1.88, 0.135, 6))
  if (hood) {
    const hm = cloak != null ? M.flat(cloak) : tm
    hm.side = THREE.DoubleSide
    g.add(mesh(new THREE.SphereGeometry(0.17, 16, 12, Math.PI / 2 + 0.75, Math.PI * 2 - 1.5), hm, 0, 1.92, -0.02))
    g.add(mesh(new THREE.ConeGeometry(0.26, 0.32, 16, 1, true), hm, 0, 1.72, 0))
  } else if (hat) {
    const hatMat = M.flat(0x4a3a2a)
    g.add(cyl(0.28, 0.3, 0.03, hatMat, 0, 1.99, 0, 14))
    g.add(cyl(0.12, 0.15, 0.16, hatMat, 0, 2.07, 0, 12))
  } else if (!noHair) {
    const hr = mesh(new THREE.SphereGeometry(0.142, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), M.flat(hair), 0, 1.925, -0.015)
    hr.scale.set(0.95, 0.95, 0.95)
    g.add(hr)
  }
  if (cloak != null) {
    const ck = mesh(new THREE.ConeGeometry(0.42, 1.15, 18, 1, true), M.flat(cloak), 0, 1.1, -0.05)
    ck.material.side = THREE.DoubleSide
    g.add(ck)
  }
  if (staff) {
    const st = cyl(0.022, 0.028, 1.9, M.wood(1, 1, M.woodDarkTex), 0.4, 0.95, 0.15, 8)
    st.rotation.z = -0.05
    g.add(st)
    g.add(sph(0.04, M.brass, 0.4, 1.9, 0.15, 8))
  }
  if (bundle) {
    const b = sph(0.22, M.flat(0xb8a27a), 0, 1.5, -0.32, 12)
    b.scale.set(1, 0.8, 0.8)
    g.add(b)
    const strap = mesh(new THREE.TorusGeometry(0.26, 0.015, 6, 20), M.flat(0x4a3220), 0, 1.5, -0.05)
    strap.rotation.y = Math.PI / 2
    g.add(strap)
  }
  if (basket) {
    g.add(cyl(0.2, 0.14, 0.28, M.wood(1, 1), -0.42, 1.05, 0.05, 12))
    for (let i = 0; i < 5; i++) g.add(sph(0.06, M.flat([0xc9402a, 0xd88a2a, 0xe8c040][i % 3]), -0.42 + rng.range(-0.1, 0.1), 1.2, 0.05 + rng.range(-0.1, 0.1), 8))
  }
  if (sack) {
    const sc = sph(0.24, M.flat(0xb8a27a), 0.25, 1.85, -0.1, 12)
    sc.scale.set(1.5, 0.7, 0.8)
    sc.rotation.z = 0.3
    g.add(sc)
  }
  g.scale.setScalar(h)
  return g
}

export interface TravelerOptions extends FigureOptions {
  /** Skip the carried props (for drivers and riders). */
  noProps?: boolean
}

/** A randomly dressed traveler: sometimes a child, sometimes hooded or hatted, sometimes laden. */
export function randomTraveler(ctx: BuilderContext, extra: TravelerOptions = {}): THREE.Group {
  const { rng } = ctx
  const k = rng.value()
  const o: FigureOptions = { h: rng.range(0.9, 1.06), ...extra }
  if (k < 0.12 && !extra.seated) o.h = rng.range(0.5, 0.65)
  o.tunic = rng.pick(CLOTH_COLORS)
  o.legs = rng.pick(CLOTH_COLORS)
  const a = rng.value()
  if (a < 0.15) o.hood = true
  else if (a < 0.3) o.hat = true
  if (rng.chance(0.3)) o.cloak = rng.pick(CLOTH_COLORS)
  if (!extra.noProps) {
    const b = rng.value()
    if (b < 0.15) o.staff = true
    else if (b < 0.3) o.bundle = true
    else if (b < 0.42) o.basket = true
    else if (b < 0.52) o.sack = true
  }
  o.hair = rng.pick(HAIR_COLORS)
  return figure(ctx, o)
}

export interface GuardOptions {
  spear?: boolean
  /** Tabard cloth (the city crest, a faction device). */
  tabard?: TextureSet
  tunic?: number
}

/** A city guard: cuirass, tabard, pauldrons, kettle helm, spear and round shield. */
export function guard(ctx: BuilderContext, { spear = true, tabard, tunic = 0x22304f }: GuardOptions = {}): THREE.Group {
  const { materials: M, rng, time } = ctx
  const gd = figure(ctx, { h: 1.04, tunic, legs: 0x3a3230, skin: rng.pick(SKIN_TONES), hair: 0x2a1c12, noHair: true })
  gd.add(cyl(0.24, 0.22, 0.5, M.steel, 0, 1.42, 0, 14))
  gd.add(mesh(new THREE.TorusGeometry(0.235, 0.015, 8, 24), M.gold, 0, 1.66, 0).rotateX(Math.PI / 2))
  const tabGeometry = new THREE.PlaneGeometry(0.38, 0.7, 6, 10)
  tabGeometry.translate(0, -0.35, 0)
  const tm = new THREE.MeshStandardMaterial({ ...texSet(tabard ?? M.tabardTex, 1, 1), roughness: 0.85, side: THREE.DoubleSide })
  clothify(tm, time, { W: 0.38, H: 0.7, strength: 0.05, phase: rng.value() * 6 })
  gd.add(mesh(tabGeometry, tm, 0, 1.66, 0.24))
  for (const s of [-1, 1]) {
    const p = mesh(new THREE.SphereGeometry(0.13, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.steel, s * 0.27, 1.66, 0)
    p.rotation.z = -s * 0.3
    gd.add(p)
  }
  gd.add(mesh(new THREE.SphereGeometry(0.155, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.steel, 0, 1.9, 0))
  gd.add(cyl(0.165, 0.165, 0.06, M.steel, 0, 1.88, 0, 16))
  gd.add(box(0.03, 0.16, 0.02, M.steel, 0, 1.84, 0.155))
  gd.add(mesh(new THREE.ConeGeometry(0.03, 0.12, 8), M.gold, 0, 2.1, 0))
  if (spear) {
    const sp = new THREE.Group()
    sp.position.set(0.42, 0, 0.1)
    sp.add(cyl(0.02, 0.025, 2.5, M.wood(1, 1, M.woodDarkTex), 0, 1.3, 0, 8))
    const blade = mesh(new THREE.ConeGeometry(0.045, 0.42, 4), M.steel, 0, 2.7, 0)
    blade.scale.set(0.5, 1, 1)
    sp.add(blade)
    sp.add(cyl(0.03, 0.03, 0.06, M.brass, 0, 2.48, 0, 8))
    gd.add(sp)
  }
  const shield = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 20), M.flat(tunic), 0, 1.35, -0.27)
  shield.rotation.x = Math.PI / 2
  gd.add(shield)
  gd.add(mesh(new THREE.TorusGeometry(0.28, 0.02, 8, 24), M.gold, 0, 1.35, -0.29))
  gd.add(sph(0.05, M.gold, 0, 1.35, -0.3, 8))
  return gd
}

export interface CaptainOptions {
  skin?: number
  beard?: number
  hair?: number
  eyes?: number
  tabard?: TextureSet
  underTunic?: number
  scale?: number
}

/**
 * An armoured captain in half-plate with gold-trimmed edges, a tabard front and
 * back, a sword, a beard, and a right arm that beckons. Garlan Ironfist's build.
 */
export function armoredCaptain(
  ctx: BuilderContext,
  { skin = 0xd6a284, beard = 0x5a3a22, hair = 0x4a2c18, eyes = 0x3a5a3a, tabard, underTunic = 0x22304f, scale = 1.16 }: CaptainOptions = {}
): { group: THREE.Group } & Animated {
  const { materials: M, time } = ctx
  const g = new THREE.Group()
  g.scale.setScalar(scale)
  const sk = M.flat(skin)
  const beardM = M.flat(beard)
  const tabM = new THREE.MeshStandardMaterial({ ...texSet(tabard ?? M.tabardTex, 1, 1), roughness: 0.85, side: THREE.DoubleSide })
  const plate = M.plate
  const edge = M.gold
  const under = M.flat(underTunic)
  for (const s of [-1, 1]) {
    g.add(cyl(0.1, 0.11, 0.85, M.flat(0x3a3230), s * 0.14, 0.45, 0, 12))
    g.add(cyl(0.11, 0.12, 0.5, plate, s * 0.14, 0.36, 0, 12))
    g.add(mesh(new THREE.TorusGeometry(0.115, 0.012, 6, 20), edge, s * 0.14, 0.6, 0).rotateX(Math.PI / 2))
    g.add(box(0.2, 0.14, 0.3, M.flat(0x2a1c12), s * 0.14, 0.07, 0.04))
    g.add(sph(0.075, plate, s * 0.14, 0.7, 0.06, 10))
    g.add(cyl(0.12, 0.11, 0.12, plate, s * 0.14, 0.68, 0, 12))
  }
  g.add(cyl(0.27, 0.24, 0.34, under, 0, 1.02, 0, 16))
  const cuirass = cyl(0.26, 0.29, 0.55, plate, 0, 1.38, 0, 20)
  cuirass.scale.z = 0.85
  g.add(cuirass)
  const chest = mesh(new THREE.SphereGeometry(0.28, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), plate, 0, 1.62, 0)
  chest.scale.set(1, 0.5, 0.85)
  g.add(chest)
  const rim1 = mesh(new THREE.TorusGeometry(0.27, 0.02, 8, 24), edge, 0, 1.12, 0).rotateX(Math.PI / 2)
  rim1.scale.set(1, 0.87, 1)
  g.add(rim1)
  const rim2 = mesh(new THREE.TorusGeometry(0.265, 0.018, 8, 24), edge, 0, 1.63, 0).rotateX(Math.PI / 2)
  rim2.scale.set(1, 0.87, 1)
  g.add(rim2)
  const tabGeometry = new THREE.PlaneGeometry(0.44, 0.95, 10, 20)
  tabGeometry.translate(0, -0.475, 0)
  const tabFront = tabM.clone()
  clothify(tabFront, time, { W: 0.44, H: 0.95, strength: 0.08, phase: 2 })
  g.add(mesh(tabGeometry, tabFront, 0, 1.62, 0.26))
  const back = mesh(tabGeometry.clone(), tabFront, 0, 1.62, -0.24)
  back.rotation.y = Math.PI
  g.add(back)
  g.add(mesh(new THREE.TorusGeometry(0.29, 0.03, 8, 24), M.flat(0x3a2818), 0, 1.1, 0).rotateX(Math.PI / 2))
  g.add(box(0.08, 0.06, 0.02, M.gold, 0, 1.1, 0.3))
  const scabbard = box(0.06, 0.9, 0.04, M.flat(0x2a1c12), -0.3, 0.78, 0.05)
  scabbard.rotation.z = 0.15
  g.add(scabbard)
  g.add(box(0.2, 0.04, 0.04, M.brass, -0.33, 1.22, 0.05))
  g.add(cyl(0.02, 0.02, 0.16, M.flat(0x3a2818), -0.34, 1.32, 0.05, 8))
  g.add(sph(0.03, M.brass, -0.34, 1.41, 0.05, 8))
  for (const s of [-1, 1]) {
    const p = mesh(new THREE.SphereGeometry(0.17, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), plate, s * 0.3, 1.68, 0)
    p.rotation.z = -s * 0.35
    g.add(p)
    const pr = mesh(new THREE.TorusGeometry(0.17, 0.015, 8, 24), edge, s * 0.3, 1.68, 0)
    pr.rotation.set(Math.PI / 2, 0, -s * 0.35)
    g.add(pr)
  }
  const armL = new THREE.Group()
  armL.position.set(-0.32, 1.62, 0)
  armL.rotation.set(-0.35, 0, 0.55)
  g.add(armL)
  armL.add(cyl(0.075, 0.065, 0.42, under, 0, -0.21, 0, 10))
  const foreL = new THREE.Group()
  foreL.position.set(0, -0.42, 0)
  foreL.rotation.x = -1.6
  armL.add(foreL)
  foreL.add(cyl(0.065, 0.06, 0.36, plate, 0, -0.18, 0, 10))
  foreL.add(mesh(new THREE.TorusGeometry(0.066, 0.012, 6, 16), edge, 0, -0.33, 0).rotateX(Math.PI / 2))
  foreL.add(box(0.1, 0.12, 0.08, plate, 0, -0.4, 0))
  const armR = new THREE.Group()
  armR.position.set(0.32, 1.62, 0)
  armR.rotation.set(-1.6, 0, -0.45)
  g.add(armR)
  armR.add(cyl(0.075, 0.065, 0.42, under, 0, -0.21, 0, 10))
  const foreR = new THREE.Group()
  foreR.position.set(0, -0.42, 0)
  foreR.rotation.x = -1.15
  armR.add(foreR)
  foreR.add(cyl(0.065, 0.06, 0.36, plate, 0, -0.18, 0, 10))
  foreR.add(mesh(new THREE.TorusGeometry(0.066, 0.012, 6, 16), edge, 0, -0.33, 0).rotateX(Math.PI / 2))
  const hand = new THREE.Group()
  hand.position.set(0, -0.4, 0)
  foreR.add(hand)
  hand.add(box(0.09, 0.1, 0.04, sk, 0, -0.02, 0))
  for (let i = 0; i < 4; i++) {
    const finger = cyl(0.012, 0.012, 0.09, sk, -0.032 + i * 0.022, -0.11, 0, 6)
    finger.rotation.x = -0.3
    hand.add(finger)
  }
  const thumb = cyl(0.013, 0.013, 0.07, sk, 0.055, -0.04, 0.01, 6)
  thumb.rotation.z = -0.8
  hand.add(thumb)
  g.add(cyl(0.07, 0.09, 0.12, sk, 0, 1.76, 0, 10))
  g.add(mesh(new THREE.TorusGeometry(0.1, 0.025, 8, 20), edge, 0, 1.74, 0).rotateX(Math.PI / 2))
  const head = sph(0.15, sk, 0, 1.95, 0, 20)
  head.scale.set(0.95, 1.08, 0.95)
  g.add(head)
  const brow = box(0.2, 0.03, 0.04, M.flat(hair), 0, 2.0, 0.13)
  brow.rotation.x = 0.3
  g.add(brow)
  for (const s of [-1, 1]) {
    g.add(sph(0.026, M.flat(0xf0ece8), s * 0.05, 1.975, 0.125, 8))
    g.add(sph(0.014, M.flat(eyes), s * 0.05, 1.975, 0.145, 8))
    g.add(sph(0.03, sk, s * 0.145, 1.95, 0, 8))
  }
  g.add(sph(0.03, sk, 0, 1.94, 0.15, 8))
  const beardMesh = sph(0.13, beardM, 0, 1.85, 0.06, 14)
  beardMesh.scale.set(0.95, 1.05, 0.8)
  g.add(beardMesh)
  g.add(sph(0.05, beardM, -0.06, 1.93, 0.12, 8))
  g.add(sph(0.05, beardM, 0.06, 1.93, 0.12, 8))
  const hairMesh = mesh(new THREE.SphereGeometry(0.158, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.flat(hair), 0, 1.97, -0.02)
  hairMesh.scale.set(1, 0.9, 1)
  g.add(hairMesh)
  return {
    group: g,
    update(t) {
      armR.rotation.x = -1.6 + Math.sin(t * 1.6) * 0.1
      foreR.rotation.x = -1.15 + Math.sin(t * 1.6 + 0.8) * 0.2
    },
  }
}
