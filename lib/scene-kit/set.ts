// scene-kit set contract: what an authored set is, and what it gets to build with.
//
// A set is a location. The pipeline authors one per place an adventure visits;
// encounters that share a place share the set and differ only in which marks the
// characters stand on, which camera opens the scene, and which toggles are set.

import type * as THREE from "three"
import type { Animated, FireSystem } from "./atmosphere"
import type { Rng } from "./core"
import type { EnvironmentHandle } from "./environment"
import type { MaterialLibrary } from "./materials"
import type { TimeUniform } from "./shaders"
import type { HeightFn } from "./terrain"

export type TimeOfDay = "day" | "dusk" | "night"

export interface SetToggles {
  timeOfDay?: TimeOfDay
  /** Set-specific flags the author declares (firesLit, gatesOpen, ...). */
  [flag: string]: string | boolean | undefined
}

/** A named stage position: where a character stands and which way they face (yaw radians). */
export interface SetMark {
  position: [number, number, number]
  facing: number
  label: string
}

export interface SetCamera {
  position: [number, number, number]
  target: [number, number, number]
  label: string
  /** Vertical field of view in degrees. */
  fov?: number
}

export interface SetContext {
  scene: THREE.Scene
  renderer: THREE.WebGLRenderer
  time: TimeUniform
  rng: Rng
  materials: MaterialLibrary
  /** Shared flame/smoke/flicker system; the set must include it in `animated`. */
  fire: FireSystem
  toggles: SetToggles
  /** Report a loading stage and yield a frame so the loader can repaint. */
  progress: (message: string) => Promise<void>
}

export interface SceneSet {
  id: string
  title: string
  root: THREE.Group
  marks: Record<string, SetMark>
  /** The first camera is the opening shot shown on load; one should be named "establishing". */
  cameras: Record<string, SetCamera>
  groundHeight: HeightFn
  environment: EnvironmentHandle
  animated: Animated[]
  dispose(): void
}

export type SetBuilder = (ctx: SetContext) => Promise<SceneSet>

export interface SetDefinition {
  id: string
  title: string
  /** One line for the brief's reuse list: what it is and which marks and cameras exist. */
  summary: string
  build: SetBuilder
}
