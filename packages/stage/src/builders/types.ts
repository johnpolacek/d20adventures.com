import type * as THREE from "three"
import { z } from "zod"
import type { Sink } from "../kit/geometry"
import type { Rand } from "../kit/rng"

// Where the crowd may not stand: a rotated rectangle [x, z, halfWidth, halfDepth, yaw radians] or a circle [x, z, r].
// `top`, when given, is the world height of something low (a crate) that a camera can see over. `height` is how high the
// thing stands above the ground it is on, in metres, for judging cover; none is unknown.
export type Footprint = { kind: "rect"; x: number; z: number; hw: number; hd: number; ry: number; top?: number; height?: number } | { kind: "circle"; x: number; z: number; r: number; height?: number }
export interface Anchor {
  tag: string
  x: number
  y: number
  z: number
}

// What a builder sees. Geometry goes into `b` in the object's local frame; `M` resolves material roles (a role is the
// material name unless the object's `materials` map says otherwise); footprints and anchors are given in local
// coordinates and land in world space.
export interface BuildCtx {
  b: Sink
  M: Record<string, THREE.Material>
  mat: (name: string) => THREE.Material
  rand: Rand
  frame: THREE.Matrix4
  // `top` is the local height a camera sees over (see Footprint); `height` how high the thing stands, for cover, and
  // when left out it is `top`.
  footprint: (x: number, z: number, hw: number, hd: number, ry?: number, top?: number, height?: number) => void
  circle: (x: number, z: number, r: number, height?: number) => void
  anchor: (tag: string, x: number, y: number, z: number) => void
  // Standalone meshes (not merged): the land ring, anything with its own attributes.
  addObject: (o: THREE.Object3D) => void
  // Layouts place child objects: `local` is the child's frame relative to this object's frame.
  place: (child: Record<string, unknown>, local: THREE.Matrix4, rand: Rand, label: string) => void
  // Whether a local point falls on a footprint registered so far (scatter layouts keep clear of what is built).
  blocked: (x: number, z: number) => boolean
}

// `roles` names the default material for a role whose name is not itself a material (role `wall` → material `stone`).
export interface BuilderDef<P = any> {
  params: z.ZodType<P, any>
  build: (ctx: BuildCtx, p: P) => void
  roles: Record<string, string>
}
export const defineBuilder = <S extends z.ZodType>(params: S, build: (ctx: BuildCtx, p: z.output<S>) => void, roles: Record<string, string> = {}): BuilderDef<z.output<S>> => ({
  params: params as unknown as z.ZodType<z.output<S>, any>,
  build,
  roles,
})

// Shared param vocabulary. Everything is bounded: sets are untrusted input.
export const num = (min: number, max: number) => z.number().min(min).max(max)
export const coord = num(-3000, 3000)
export const vec2 = z.tuple([coord, coord])
export const vec3 = z.tuple([coord, coord, coord])
export const deg = num(-720, 720)
export const size = (max = 200) => num(0.01, max)
export const matName = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/, "material names are letters, digits, - and _")
// Cast, shot, loop and beat ids. Heroes made on the website have numeric ids (`1749159962941`), so a leading digit is fine.
export const idName = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/, "ids are letters, digits, - and _")
export const segments = (min = 3, max = 96) => z.number().int().min(min).max(max)
