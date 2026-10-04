import * as THREE from "three"
import { z } from "zod"
import { G, M4, type Sink, TAU, V } from "../kit/geometry"
import { defineBuilder, matName, num, size, vec2 } from "./types"

// Woodland: trees, undergrowth, boulders, fallen logs and a worn trail. Shapes stay simple; the paint pass and the
// lighting carry the look. Material roles: bark, leaves (plus leavesDark and leavesLight for variety), stone, trail.

const unitTrunk = () => G("trunk8", () => new THREE.CylinderGeometry(0.62, 1, 1, 8, 1))
const unitLimb = () => G("limb6", () => new THREE.CylinderGeometry(0.5, 1, 1, 6, 1))
const unitBlob = () => G("blob12", () => new THREE.SphereGeometry(1, 12, 8))
const unitCone = () => G("cone8", () => new THREE.ConeGeometry(1, 1, 8, 1))
const unitBlade = () => G("blade4", () => new THREE.ConeGeometry(1, 1, 4, 1))

// A tapered cylinder from a to c, `r` at its base.
function limb(b: Sink, mat: THREE.Material, a: THREE.Vector3, c: THREE.Vector3, r: number) {
  const dir = c.clone().sub(a)
  const len = dir.length()
  const m = new THREE.Matrix4().compose(a.clone().add(c).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.normalize()), V(r, len, r))
  b.add(unitLimb(), mat, m, { uv: "keep" })
}

// A tree. `oak`: a stout trunk forking into limbs under a broad crown of leaf masses. `pine`: a straight trunk under
// stacked cones. `birch`: a slender pale trunk and a small, high crown. `gnarled`: an old crooked trunk whose twisting
// limbs split into twigs, with a few sparse leaf clumps. The trunk is solid; the crown is not.
export const tree = defineBuilder(
  z
    .object({
      kind: z.enum(["oak", "pine", "birch", "gnarled"]).default("oak"),
      height: size(60).default(12),
      girth: size(4).optional(),
      lean: num(0, 20).default(3),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const h = p.height
    const leaves = () => rand.pick([M.leaves, M.leaves, M.leavesDark, M.leavesLight])
    const leanA = rand(0, TAU)
    const leanT = Math.tan((rand(0, p.lean) * Math.PI) / 180)
    const top = (y: number) => V(Math.cos(leanA) * leanT * y, y, Math.sin(leanA) * leanT * y)
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
          if (rand() < 0.45) {
            const s = h * rand(0.05, 0.09)
            b.add(unitBlob(), leaves(), M4(tip.x, tip.y, tip.z, rand(0, TAU), s, s * 0.7, s), { uv: "keep" })
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
    const blobs = birch ? 5 : 9
    for (let i = 0; i < blobs; i++) {
      const anchor = i < ends.length ? ends[i] : crown
      const s = h * (birch ? 0.11 : 0.17) * rand(0.75, 1.15)
      const off = V(rand(-1, 1) * spread * 0.5, rand(-0.2, 0.5) * s, rand(-1, 1) * spread * 0.5)
      b.add(unitBlob(), leaves(), M4(anchor.x + off.x, anchor.y + off.y, anchor.z + off.z, rand(0, TAU), s, s * rand(0.65, 0.85), s), { uv: "keep" })
    }
    ctx.circle(0, 0, r + 0.25)
  },
  { bark: "bark", birch: "birch", leaves: "leaves", leavesDark: "leavesDark", leavesLight: "leavesLight" }
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
    b.add(unitBlob(), rand.pick([M.leaves, M.leavesDark]), M4(rand(-0.4, 0.4) * p.size, s * 0.7, rand(-0.4, 0.4) * p.size, rand(0, TAU), s, s * 0.75, s), { uv: "keep" })
  }
})

// A boulder, half sunk, sometimes with a smaller one beside it. Solid.
export const rock = defineBuilder(z.object({ size: size(10).default(1.2) }).strict(), (ctx, p) => {
  const { b, M, rand } = ctx
  const s = p.size
  b.add(unitBlob(), M.stone, M4(0, s * 0.25, 0, rand(0, TAU), s, s * rand(0.55, 0.8), s * rand(0.7, 1), rand(-0.2, 0.2)), { uv: "planar", flat: true })
  if (rand() < 0.5) b.add(unitBlob(), M.stone, M4(s * 0.9, s * 0.1, s * 0.3, rand(0, TAU), s * 0.4, s * 0.35, s * 0.45), { uv: "planar", flat: true })
  ctx.circle(0, 0, s * 0.95)
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

// A standing stone: a tall, weathered slab narrowing toward its top, leaning a little. Solid.
export const standingStone = defineBuilder(
  z
    .object({
      height: size(20).default(4),
      width: size(6).default(1.2),
      depth: size(6).default(0.7),
      lean: num(0, 20).default(4),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    // Each stone gets its own weathered shape: a rough slab, narrower and rounded toward the top.
    const g = new THREE.CylinderGeometry(0.55, 1, 1, 8, 6)
    const pos = g.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      const k = rand(0.82, 1.14) * (y > 0.45 ? 0.75 : 1)
      pos.setXYZ(i, pos.getX(i) * k, y + rand(-0.025, 0.025), pos.getZ(i) * k)
    }
    g.computeVertexNormals()
    const lx = ((rand(-1, 1) * p.lean) / 180) * Math.PI
    const lz = ((rand(-1, 1) * p.lean) / 180) * Math.PI
    b.add(g, M.stone, M4(0, p.height / 2 - 0.3, 0, rand(0, Math.PI), p.width * 0.6, p.height + 0.3, p.depth * 0.75, lx, lz), { uv: "planar" })
    g.dispose()
    ctx.footprint(0, 0, p.width / 2 + 0.2, p.depth / 2 + 0.2)
  }
)
