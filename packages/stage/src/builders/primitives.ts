import * as THREE from "three"
import { z } from "zod"
import { beam, DEG, M4, shape, V } from "../kit/geometry"
import { opening as openingPart } from "./parts"
import { defineBuilder, matName, num, segments, size, vec2, vec3 } from "./types"

// Primitives: the building blocks an author (or a set generator) composes when no parametric builder fits.
// Each sits on the object's origin: `at` is the centre of its base, so a box with `at: [0, 0]` stands on the ground.

const tilt = { pitch: num(-360, 360).default(0), roll: num(-360, 360).default(0) }
// `solid` marks the footprint as something people walk around (a platform, a well) and the crowd keeps off.
const solid = z.boolean().default(false)
const uvMode = z.enum(["planar", "radial", "keep"]).optional()

export const boxPrim = defineBuilder(z.object({ size: z.tuple([size(500), size(500), size(500)]), material: matName, solid, ...tilt }).strict(), (ctx, p) => {
  const [w, h, d] = p.size
  ctx.b.add(new THREE.BoxGeometry(1, 1, 1), ctx.mat(p.material), M4(0, 0, 0, 0, 1, 1, 1, p.pitch * DEG, p.roll * DEG).multiply(M4(0, h / 2, 0, 0, w, h, d)))
  if (p.solid) ctx.footprint(0, 0, w / 2, d / 2)
})

export const cylinderPrim = defineBuilder(
  z
    .object({
      radius: z.union([size(200), z.tuple([num(0, 200), num(0, 200)])]),
      height: size(500),
      segments: segments(3, 96).default(24),
      open: z.boolean().default(false),
      material: matName,
      uv: uvMode,
      solid,
      ...tilt,
    })
    .strict(),
  (ctx, p) => {
    const [rb, rt] = Array.isArray(p.radius) ? p.radius : [p.radius, p.radius]
    const g = new THREE.CylinderGeometry(rt, rb, 1, p.segments, 1, p.open)
    ctx.b.add(g, ctx.mat(p.material), M4(0, 0, 0, 0, 1, 1, 1, p.pitch * DEG, p.roll * DEG).multiply(M4(0, p.height / 2, 0, 0, 1, p.height, 1)), {
      uv: p.uv ?? "radial",
      r: Math.max(rb, rt),
      flat: p.segments <= 12,
    })
    g.dispose()
    if (p.solid) ctx.circle(0, 0, Math.max(rb, rt))
  }
)

export const conePrim = defineBuilder(z.object({ radius: size(200), height: size(500), segments: segments(3, 96).default(16), material: matName, ...tilt }).strict(), (ctx, p) => {
  const g = new THREE.ConeGeometry(1, 1, p.segments, 1)
  ctx.b.add(g, ctx.mat(p.material), M4(0, 0, 0, 0, 1, 1, 1, p.pitch * DEG, p.roll * DEG).multiply(M4(0, p.height / 2, 0, 0, p.radius, p.height, p.radius)), { uv: "keep", flat: p.segments <= 8 })
  g.dispose()
})

export const spherePrim = defineBuilder(
  z
    .object({
      radius: z.union([size(200), z.tuple([size(200), size(200), size(200)])]),
      segments: segments(4, 64).default(16),
      material: matName,
      hemisphere: z.boolean().default(false),
    })
    .strict(),
  (ctx, p) => {
    const [rx, ry, rz] = Array.isArray(p.radius) ? p.radius : [p.radius, p.radius, p.radius]
    const g = new THREE.SphereGeometry(1, p.segments, Math.max(3, Math.ceil(p.segments * 0.7)), 0, Math.PI * 2, 0, p.hemisphere ? Math.PI / 2 : Math.PI)
    ctx.b.add(g, ctx.mat(p.material), M4(0, p.hemisphere ? 0 : ry, 0, 0, rx, ry, rz), { uv: "keep" })
    g.dispose()
  }
)

export const torusPrim = defineBuilder(
  z
    .object({
      radius: size(200),
      tube: size(50),
      arc: num(1, 360).default(360),
      segments: segments(6, 96).default(32),
      material: matName,
      ...tilt,
    })
    .strict(),
  (ctx, p) => {
    const g = new THREE.TorusGeometry(p.radius, p.tube, 8, p.segments, p.arc * DEG)
    ctx.b.add(g, ctx.mat(p.material), M4(0, 0, 0, 0, 1, 1, 1, p.pitch * DEG, p.roll * DEG), { uv: "keep" })
    g.dispose()
  }
)

// A surface of revolution from a [radius, height] profile.
export const lathePrim = defineBuilder(
  z
    .object({
      profile: z
        .array(z.tuple([num(0, 200), num(-200, 500)]))
        .min(2)
        .max(64),
      segments: segments(3, 96).default(24),
      material: matName,
      uv: uvMode,
    })
    .strict(),
  (ctx, p) => {
    const g = new THREE.LatheGeometry(
      p.profile.map(([r, y]) => new THREE.Vector2(r, y)),
      p.segments
    )
    ctx.b.add(g, ctx.mat(p.material), M4(), { uv: p.uv ?? "radial", r: Math.max(...p.profile.map((q) => q[0])) })
    g.dispose()
  }
)

// A round bar between two points (posts, spars, ropes seen from afar).
export const beamPrim = defineBuilder(
  z
    .object({
      from: vec3,
      to: vec3,
      radius: size(20),
      radiusTo: size(20).optional(),
      segments: segments(3, 32).default(6),
      material: matName,
    })
    .strict(),
  (ctx, p) => {
    beam(ctx.b, ctx.mat(p.material), V(...p.from), V(...p.to), p.radius, p.segments, p.radiusTo ?? p.radius)
  }
)

// A polygon extruded along its normal, with optional holes: walls with doorways, gables, plinths.
// plane "xy": the outline stands upright facing +z and extrudes toward -z; "xz": it lies on the ground and extrudes up.
export const extrudePrim = defineBuilder(
  z
    .object({
      points: z.array(vec2).min(3).max(256),
      holes: z.array(z.array(vec2).min(3).max(128)).max(16).default([]),
      depth: size(500),
      bevel: num(0, 2).default(0),
      plane: z.enum(["xy", "xz"]).default("xy"),
      material: matName,
    })
    .strict(),
  (ctx, p) => {
    const m = p.plane === "xy" ? M4(0, 0, -p.depth) : M4(0, 0, 0, 0, 1, 1, 1, -Math.PI / 2)
    shape(ctx.b, ctx.mat(p.material), p.points, p.depth, m, p.bevel, p.holes)
  }
)

// An arched window or door cut into a wall face: a dark void, a moulded frame and a sill. Faces +z.
export const openingPrim = defineBuilder(
  z
    .object({
      width: size(30),
      height: size(60),
      pointed: z.boolean().default(false),
      depth: size(5).default(0.7),
      frame: size(3).default(0.38),
    })
    .strict(),
  (ctx, p) => openingPart(ctx.b, ctx.M.void, ctx.M.trim, M4(), p.width, p.height, p.pointed, p.depth, p.frame)
)

// A flat disc of paving or earth under everything.
export const groundDisc = defineBuilder(z.object({ radius: size(3000).default(250), segments: segments(8, 128).default(64) }).strict(), (ctx, p) => {
  const g = new THREE.CircleGeometry(p.radius, p.segments)
  ctx.b.add(g, ctx.M.ground, new THREE.Matrix4().makeRotationX(-Math.PI / 2))
  g.dispose()
})
