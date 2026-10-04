import * as THREE from "three"
import { z } from "zod"
import { beam, G, lathe, M4, type Sink, TAU, V } from "../kit/geometry"
import { defineBuilder, matName, num, size, vec2 } from "./types"

// Woodland: trees, undergrowth, boulders, fallen logs and a worn trail. Shapes stay simple; the paint pass and the
// lighting carry the look. Material roles: bark, leaves (plus leavesDark and leavesLight for variety), stone, trail.

const unitTrunk = () => G("trunk8", () => new THREE.CylinderGeometry(0.62, 1, 1, 8, 1))
const unitLimb = () => G("limb6", () => new THREE.CylinderGeometry(0.5, 1, 1, 6, 1))
const unitBlob = () => G("blob12", () => new THREE.SphereGeometry(1, 12, 8))
const unitBlobLow = () => G("blob7", () => new THREE.SphereGeometry(1, 7, 5))
const unitCone = () => G("cone8", () => new THREE.ConeGeometry(1, 1, 8, 1))
const unitBlade = () => G("blade4", () => new THREE.ConeGeometry(1, 1, 4, 1))
const unitBeard = () => G("beard5", () => new THREE.ConeGeometry(1, 1, 5, 1))

// A mass of leaves in the unit sphere: `n` leaf cards facing every way, their normals pointing out from the centre so
// the cluster shades like a rounded mass, lit on top and dark beneath. Four variants per count.
function leafCards(n: number, variant: number) {
  return G(`leafcards${n}-${variant}`, () => {
    let seed = 7919 * (variant + 1) + n
    const rnd = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    const pos: number[] = []
    const nor: number[] = []
    const uv: number[] = []
    const q = new THREE.Quaternion()
    const v = new THREE.Vector3()
    for (let i = 0; i < n; i++) {
      const c = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize().multiplyScalar(0.25 + rnd() * 0.4)
      q.setFromEuler(new THREE.Euler(rnd() * Math.PI, rnd() * Math.PI * 2, rnd() * Math.PI))
      const s = 0.95 + rnd() * 0.35
      const corners = [
        [-0.5, -0.5, 0, 0],
        [0.5, -0.5, 1, 0],
        [0.5, 0.5, 1, 1],
        [-0.5, -0.5, 0, 0],
        [0.5, 0.5, 1, 1],
        [-0.5, 0.5, 0, 1],
      ]
      for (const [x, y, u, w] of corners) {
        v.set(x * s, y * s, 0)
          .applyQuaternion(q)
          .add(c)
        pos.push(v.x, v.y, v.z)
        v.normalize()
        nor.push(v.x, v.y, v.z)
        uv.push(u, w)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3))
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2))
    return g
  })
}

// A mass of leaves: leafy sphere, or leaf cards when the material carries a painted leaf clump.
function mass(b: Sink, mat: THREE.Material, m: THREE.Matrix4, rand: () => number, low = false) {
  if (mat.userData.cards) b.add(leafCards(low ? 8 : 14, Math.floor(rand() * 4)), mat, m, { uv: "keep" })
  else b.add(low ? unitBlobLow() : unitBlob(), mat, m, { uv: "keep" })
}

// A card hanging from its top edge: a unit plane from y = 0 down to y = -1, its texture's top at the top.
const unitHang = () => G("hang", () => new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0))

// Beards of moss hanging from a point: long thin cones, point down, swaying a little apart. With a `card` material
// (a painting of hanging moss) they are curtains instead: pairs of crossed cards, longer and wider.
function beards(b: Sink, mat: THREE.Material, rand: () => number, at: THREE.Vector3, n: number, reach: number) {
  if (mat.userData.card) {
    for (let i = 0; i < Math.ceil(n / 3); i++) {
      const len = reach * (1.2 + rand() * 1.2)
      const w = len * (0.55 + rand() * 0.3)
      const x = at.x + (rand() - 0.5) * reach * 0.8
      const zz = at.z + (rand() - 0.5) * reach * 0.8
      const yaw = rand() * TAU
      for (const turn of [0, Math.PI / 2]) b.add(unitHang(), mat, M4(x, at.y + len * 0.05, zz, yaw + turn, w, len, 1), { uv: "keep" })
    }
    return
  }
  for (let i = 0; i < n; i++) {
    const len = reach * (0.45 + rand() * 0.75)
    const w = reach * (0.05 + rand() * 0.05)
    const x = at.x + (rand() - 0.5) * reach * 0.6
    const zz = at.z + (rand() - 0.5) * reach * 0.6
    b.add(unitBeard(), mat, M4(x, at.y - len / 2, zz, rand() * TAU, w, len, w * 0.5, Math.PI), { uv: "keep", flat: true })
  }
}

// A tapered cylinder from a to c, `r` at its base.
function limb(b: Sink, mat: THREE.Material, a: THREE.Vector3, c: THREE.Vector3, r: number) {
  const dir = c.clone().sub(a)
  const len = dir.length()
  const m = new THREE.Matrix4().compose(a.clone().add(c).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.normalize()), V(r, len, r))
  b.add(unitLimb(), mat, m, { uv: "keep" })
}

// A tree. `oak`: a stout trunk forking into limbs under a broad crown of leaf masses. `pine`: a straight trunk under
// stacked cones. `birch`: a slender pale trunk and a small, high crown. `gnarled`: an old crooked trunk whose twisting
// limbs split into twigs, with a few sparse leaf clumps. `ancient`: a huge old forest giant, its smooth tapering trunk
// flaring into buttress roots across the ground and great limbs arching out under a high crown. The trunk is solid; the
// crown is not.
export const tree = defineBuilder(
  z
    .object({
      kind: z.enum(["oak", "pine", "birch", "gnarled", "ancient"]).default("oak"),
      height: size(60).default(12),
      girth: size(4).optional(),
      lean: num(0, 40).default(3),
      // Lean toward this heading (degrees, 0 = +x, 90 = +z) by exactly `lean` degrees, instead of a random one.
      leanYaw: num(-360, 360).optional(),
      // Fewer, coarser leaf masses: for distant woods that only the haze will see.
      low: z.boolean().default(false),
      // Grey moss hanging in beards from the limbs (live oaks and old willows): 0 none, 1 heavy. Needs a `moss` material.
      moss: num(0, 1).default(0),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const h = p.height
    const leaves = () => rand.pick([M.leaves, M.leaves, M.leavesDark, M.leavesLight])
    const randA = rand(0, TAU)
    const randL = rand(0, p.lean)
    const leanA = p.leanYaw === undefined ? randA : (p.leanYaw * Math.PI) / 180
    const leanT = Math.tan(((p.leanYaw === undefined ? randL : p.lean) * Math.PI) / 180)
    const top = (y: number) => V(Math.cos(leanA) * leanT * y, y, Math.sin(leanA) * leanT * y)
    if (p.kind === "ancient") {
      const r = p.girth ?? h * 0.06
      // The trunk: a smooth taper in kinked segments whose ends meet.
      let at = V(0, 0, 0)
      let rr = r
      const segs = 5
      for (let i = 1; i <= segs; i++) {
        const next = V(at.x + rand(-1, 1) * r * 0.35, (h * 0.5 * i) / segs, at.z + rand(-1, 1) * r * 0.35)
        const r2 = r * (1 - i * 0.09)
        beam(b, M.bark, at, next, rr, 14, r2)
        at = next
        rr = r2
      }
      // A buttress flare at the foot, and roots that snake out and sink into the ground.
      lathe(
        b,
        M.bark,
        0,
        -0.1,
        0,
        [
          [r * 2.1, 0],
          [r * 1.45, r * 0.5],
          [r * 1.1, r * 1.3],
          [r * 0.98, r * 2.4],
        ],
        16
      )
      const roots = 6 + Math.floor(rand(0, 3))
      for (let i = 0; i < roots; i++) {
        const a = (i / roots) * TAU + rand(-0.25, 0.25)
        const mid = V(Math.cos(a) * r * rand(1.4, 1.8), r * 0.18, Math.sin(a) * r * rand(1.4, 1.8))
        beam(b, M.bark, V(Math.cos(a) * r * 0.6, r * 0.8, Math.sin(a) * r * 0.6), mid, r * 0.34, 8, r * 0.22)
        beam(b, M.bark, mid, V(Math.cos(a + rand(-0.3, 0.3)) * r * rand(2.4, 3.2), -0.12, Math.sin(a + rand(-0.3, 0.3)) * r * rand(2.4, 3.2)), r * 0.22, 8, r * 0.07)
      }
      // Great limbs arch out and up, each splitting into branches that carry leaf masses.
      const limbs = 4 + Math.floor(rand(0, 3))
      for (let i = 0; i < limbs; i++) {
        const a = (i / limbs) * TAU + rand(-0.4, 0.4)
        const from = V(at.x * rand(0.5, 1), h * rand(0.32, 0.5), at.z * rand(0.5, 1))
        const mid = from.clone().add(V(Math.cos(a) * h * rand(0.16, 0.26), h * rand(0.12, 0.22), Math.sin(a) * h * rand(0.16, 0.26)))
        beam(b, M.bark, from, mid, rr * 0.55, 10, rr * 0.32)
        for (let k = 0; k < 2; k++) {
          const b2 = a + rand(-0.8, 0.8)
          const tip = mid.clone().add(V(Math.cos(b2) * h * rand(0.08, 0.16), h * rand(0.08, 0.2), Math.sin(b2) * h * rand(0.08, 0.16)))
          beam(b, M.bark, mid, tip, rr * 0.3, 8, rr * 0.12)
          const s = h * rand(0.08, 0.12)
          mass(b, leaves(), M4(tip.x, tip.y + s * 0.3, tip.z, rand(0, TAU), s * 1.3, s * 0.75, s * 1.3), rand, p.low)
          if (p.moss > 0 && rand() < p.moss) beards(b, M.moss, rand, tip, 2 + Math.floor(rand() * 3), h * 0.1)
        }
      }
      ctx.circle(0, 0, r * 1.6)
      return
    }
    if (p.kind === "gnarled") {
      const r = p.girth ?? h * 0.045
      // A crooked trunk in a few segments, each kinked away from the last.
      let at = V(0, -0.2, 0)
      const segs = 7
      let drift = V(rand(-1, 1), 0, rand(-1, 1)).multiplyScalar(h * 0.012)
      for (let i = 1; i <= segs; i++) {
        drift = drift.clone().add(V(rand(-1, 1), 0, rand(-1, 1)).multiplyScalar(h * 0.01))
        const next = V(at.x + drift.x, (h * 0.55 * i) / segs, at.z + drift.z)
        limb(b, M.bark, at, next, r * (1 - (i - 1) * 0.09))
        at = next
      }
      for (let i = 0; i < 5; i++) limb(b, M.bark, V(0, 0.9, 0), V(Math.cos(i * 1.3 + rand(0, 1)) * r * 2.2, -0.05, Math.sin(i * 1.3 + rand(0, 1)) * r * 2.2), r * 0.6)
      // Limbs reach out and up, then split into twigs; a few ends carry leaves.
      const limbs = 4 + Math.floor(rand(0, 3))
      for (let i = 0; i < limbs; i++) {
        const a = (i / limbs) * TAU + rand(-0.5, 0.5)
        const from = V(at.x * rand(0.6, 1), h * rand(0.4, 0.56), at.z * rand(0.6, 1))
        const mid = from.clone().add(V(Math.cos(a) * h * rand(0.14, 0.24), h * rand(0.08, 0.18), Math.sin(a) * h * rand(0.14, 0.24)))
        limb(b, M.bark, from, mid, r * 0.45)
        for (let k = 0; k < 2; k++) {
          const b2 = a + rand(-0.9, 0.9)
          const tip = mid.clone().add(V(Math.cos(b2) * h * rand(0.08, 0.16), h * rand(0.04, 0.16), Math.sin(b2) * h * rand(0.08, 0.16)))
          limb(b, M.bark, mid, tip, r * 0.2)
          if (p.moss > 0 && rand() < p.moss) beards(b, M.moss, rand, tip, 2 + Math.floor(rand() * 3), h * 0.12)
          if (rand() < 0.45) {
            const s = h * rand(0.05, 0.09)
            mass(b, leaves(), M4(tip.x, tip.y, tip.z, rand(0, TAU), s, s * 0.7, s), rand, p.low)
          }
        }
      }
      ctx.circle(0, 0, r + 0.3)
      return
    }
    if (p.kind === "pine") {
      const r = p.girth ?? h * 0.022
      b.add(unitTrunk(), M.bark, M4(top(h * 0.45).x, h * 0.45, top(h * 0.45).z, rand(0, TAU), r, h * 0.9, r), { uv: "keep" })
      const tiers = 4 + Math.floor(rand(0, 3))
      for (let i = 0; i < tiers; i++) {
        const t = i / tiers
        const y = h * (0.22 + t * 0.62)
        const w = h * (0.26 - t * 0.17) * rand(0.9, 1.1)
        const c = top(y)
        b.add(unitCone(), leaves(), M4(c.x, y + w * 0.6, c.z, rand(0, TAU), w, w * 1.5, w), { uv: "keep", flat: true })
      }
      ctx.circle(0, 0, r + 0.25)
      return
    }
    const birch = p.kind === "birch"
    const r = p.girth ?? h * (birch ? 0.016 : 0.04)
    const fork = h * (birch ? 0.55 : 0.4)
    const trunkTop = top(fork)
    limb(b, birch ? M.birch : M.bark, V(0, -0.2, 0), trunkTop, r)
    // Roots flare into the ground so the trunk does not stand on it like a post.
    if (!birch) for (let i = 0; i < 4; i++) limb(b, M.bark, V(0, 0.5, 0), V(Math.cos(i * 1.6 + rand(0, 1)) * r * 2.4, -0.05, Math.sin(i * 1.6 + rand(0, 1)) * r * 2.4), r * 0.45)
    const spread = h * (birch ? 0.2 : 0.36)
    const limbs = birch ? 2 : 3 + Math.floor(rand(0, 2))
    const ends: THREE.Vector3[] = []
    for (let i = 0; i < limbs; i++) {
      const a = (i / limbs) * TAU + rand(-0.4, 0.4)
      const end = trunkTop.clone().add(V(Math.cos(a) * spread * rand(0.5, 0.85), h * rand(0.18, 0.32), Math.sin(a) * spread * rand(0.5, 0.85)))
      limb(b, birch ? M.birch : M.bark, trunkTop, end, r * 0.55)
      ends.push(end)
    }
    const crown = top(h * 0.74)
    // Leaf cards cost far less than leafy spheres, so card crowns carry more masses and read fuller.
    const blobs = birch ? 5 : p.low ? 6 : M.leaves.userData.cards ? 14 : 9
    for (let i = 0; i < blobs; i++) {
      const anchor = i < ends.length ? ends[i] : crown
      const s = h * (birch ? 0.11 : 0.17) * rand(0.75, 1.15)
      const off = V(rand(-1, 1) * spread * 0.5, rand(-0.2, 0.5) * s, rand(-1, 1) * spread * 0.5)
      mass(b, leaves(), M4(anchor.x + off.x, anchor.y + off.y, anchor.z + off.z, rand(0, TAU), s, s * rand(0.65, 0.85), s), rand, p.low)
      if (p.moss > 0 && rand() < p.moss) beards(b, M.moss, rand, V(anchor.x + off.x, anchor.y + off.y - s * 0.55, anchor.z + off.z), 3 + Math.floor(rand() * 4), h * 0.16)
    }
    if (p.moss > 0) for (const end of ends) beards(b, M.moss, rand, end, Math.round(2 + p.moss * 3), h * 0.13)
    ctx.circle(0, 0, r + 0.25)
  },
  { bark: "bark", birch: "birch", leaves: "leaves", leavesDark: "leavesDark", leavesLight: "leavesLight", moss: "moss" }
)

// A fern: fronds fanning from the ground. Not solid.
export const fern = defineBuilder(z.object({ size: size(3).default(0.8) }).strict(), (ctx, p) => {
  const { b, M, rand } = ctx
  const n = 6 + Math.floor(rand(0, 4))
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rand(-0.3, 0.3)
    const len = p.size * rand(0.7, 1.2)
    const tilt = rand(0.55, 1.05)
    const m = new THREE.Matrix4()
      .makeRotationY(-a)
      .multiply(new THREE.Matrix4().makeRotationZ(-tilt))
      .multiply(M4(0, len / 2, 0, 0, len * 0.14, len, len * 0.035))
    b.add(unitBlade(), rand.pick([M.fern, M.fern, M.leavesDark]), m, { uv: "keep", flat: true })
  }
})

// A bush: a few leaf masses close to the ground. Not solid.
export const bush = defineBuilder(z.object({ size: size(5).default(1.2) }).strict(), (ctx, p) => {
  const { b, M, rand } = ctx
  for (let i = 0; i < 3; i++) {
    const s = p.size * rand(0.4, 0.6)
    mass(b, rand.pick([M.leaves, M.leavesDark]), M4(rand(-0.4, 0.4) * p.size, s * 0.7, rand(-0.4, 0.4) * p.size, rand(0, TAU), s, s * 0.75, s), rand)
  }
})

// A fallen log along local x, with a broken branch or two. Solid.
export const log = defineBuilder(z.object({ length: size(30).default(5), r: size(2).default(0.35) }).strict(), (ctx, p) => {
  const { b, M, rand } = ctx
  b.add(unitTrunk(), M.bark, M4(0, p.r * 0.9, 0, 0, p.r, p.length, p.r, 0, Math.PI / 2), { uv: "keep" })
  for (let i = 0; i < 2; i++) {
    const x = rand(-0.35, 0.35) * p.length
    limb(b, M.bark, V(x, p.r * 1.2, 0), V(x + rand(-0.5, 0.5), p.r * 1.2 + rand(0.6, 1.2), rand(-0.6, 0.6)), p.r * 0.25)
  }
  ctx.footprint(0, 0, p.length / 2, p.r + 0.2)
})

// A worn trail: a flat strip just above the ground along a polyline. Not solid.
export const trail = defineBuilder(
  z
    .object({
      points: z.array(vec2).min(2).max(128),
      width: size(20).default(1.6),
      material: matName.default("trail"),
    })
    .strict(),
  (ctx, p) => {
    const pts = p.points.map(([x, zz]) => V(x, 0.03, zz))
    const pos: number[] = []
    const side = (i: number) => {
      const a = pts[Math.max(0, i - 1)]
      const c = pts[Math.min(pts.length - 1, i + 1)]
      const d = c.clone().sub(a).normalize()
      const w = (p.width / 2) * (0.85 + 0.3 * Math.sin(i * 2.3))
      return V(-d.z * w, 0, d.x * w)
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const sa = side(i)
      const sb = side(i + 1)
      const a0 = pts[i].clone().add(sa)
      const a1 = pts[i].clone().sub(sa)
      const b0 = pts[i + 1].clone().add(sb)
      const b1 = pts[i + 1].clone().sub(sb)
      pos.push(...a0.toArray(), ...b1.toArray(), ...a1.toArray(), ...a0.toArray(), ...b0.toArray(), ...b1.toArray())
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    ctx.b.add(g, ctx.mat(p.material), null, { uv: "planar" })
    g.dispose()
  }
)

// A shaft of moonlight falling through a gap in the canopy: an open, glowing cone, wider at the ground. Not solid.
export const lightShaft = defineBuilder(
  z
    .object({
      height: size(60).default(16),
      top: size(10).default(0.8),
      bottom: size(20).default(2.4),
      tilt: num(-45, 45).default(0),
      material: matName.default("moonbeam"),
    })
    .strict(),
  (ctx, p) => {
    const g = new THREE.CylinderGeometry(p.top, p.bottom, p.height, 20, 1, true)
    ctx.b.add(g, ctx.mat(p.material), M4(0, p.height / 2, 0, 0, 1, 1, 1, 0, (p.tilt * Math.PI) / 180), { uv: "keep" })
    g.dispose()
  }
)

// Mist: `layers` soft cloud cards standing across x, spread along z by `spacing`, or lying flat over water when `flat`.
// Each card is `width` by `height`; the cloud fades out at every edge, so its foot can sink into the ground.
export const mistBank = defineBuilder(
  z
    .object({
      width: size(400).default(30),
      height: size(100).default(6),
      layers: z.number().int().min(1).max(24).default(3),
      spacing: size(100).default(8),
      flat: z.boolean().default(false),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const card = G("mistcard", () => new THREE.PlaneGeometry(1, 1))
    for (let i = 0; i < p.layers; i++) {
      const zz = (i - (p.layers - 1) / 2) * p.spacing + rand(-0.2, 0.2) * p.spacing
      const w = p.width * rand(0.8, 1.2)
      const h = p.height * rand(0.8, 1.2)
      if (p.flat) b.add(card, M.mist, M4(rand(-0.1, 0.1) * w, rand(0, 0.3), zz, rand(-0.2, 0.2), w, h, 1, -Math.PI / 2), { uv: "keep" })
      else b.add(card, M.mist, M4(rand(-0.1, 0.1) * w, h * 0.35, zz, rand(-0.15, 0.15), w, h, 1), { uv: "keep" })
    }
  },
  { mist: "mist" }
)
