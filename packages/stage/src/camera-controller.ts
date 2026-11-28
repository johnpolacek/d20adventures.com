import type * as THREE from "three"
import type { CameraMove, Ease } from "./director"
import type { StagingShot } from "./spec/staging"
import type { TripodPoint } from "./tripod"

// Explicit camera rig & motion state machine for Stage.
// Guarantees settleWaiters resolution on every exit (including OrbitControls.start, LookControls.start,
// finishShot, and dispose), cancels take moves on user input, and preserves director modifiers on retakes.

export interface CameraPose {
  pos: THREE.Vector3
  target: THREE.Vector3
  fov: number
}

export interface CameraTransition {
  from: CameraPose
  to: CameraPose
  start: number
  duration: number
  ease: Ease
}

export type ActiveTakeMove = CameraMove & { start: number | null; done: number }

export type AskedShot = {
  which: string | StagingShot
  follow: string[]
  duration: number
  ease: Ease
  move?: CameraMove
  take?: string
  planted: boolean
}

export type CameraRig =
  | { kind: "free" }
  | {
      kind: "tripod"
      point: TripodPoint
      aim: THREE.Vector3
      want: { target: THREE.Vector3; fov: number; placed: boolean }
      arrivedAt: number
    }

export type CameraMotionMode =
  | { kind: "idle" }
  | { kind: "gliding"; transition: CameraTransition }
  | { kind: "cutting" }
  | { kind: "driving" }
  | { kind: "panning" }
  | { kind: "userLook" }

export class CameraController {
  rig: CameraRig = { kind: "free" }
  motion: CameraMotionMode = { kind: "idle" }
  asked: AskedShot | null = null
  takeMove: ActiveTakeMove | null = null
  circling = 0
  sweepLeft = Number.POSITIVE_INFINITY
  framed = new Set<string>()
  followed = new Map<string, { x: number; z: number }>()
  planted = false
  activeFov: number | null = null
  take: string | null = null

  private settleWaiters: (() => void)[] = []

  get transition(): CameraTransition | null {
    return this.motion.kind === "gliding" ? this.motion.transition : null
  }

  get driving(): boolean {
    return this.motion.kind === "driving"
  }

  get tripod(): Extract<CameraRig, { kind: "tripod" }> | null {
    return this.rig.kind === "tripod" ? this.rig : null
  }

  /** Whether a shot glide or cut is currently in progress. */
  get settling(): boolean {
    return this.motion.kind === "gliding" || this.motion.kind === "cutting"
  }

  /** Resolves once the current glide/cut completes, or immediately if none is running. */
  shotSettled(): Promise<void> {
    return this.settling ? new Promise<void>((resolve) => this.settleWaiters.push(resolve)) : Promise.resolve()
  }

  /** Flushes all pending `shotSettled()` waiters. */
  flushSettle() {
    if (!this.settleWaiters.length) return
    const waiters = this.settleWaiters
    this.settleWaiters = []
    for (const resolve of waiters) resolve()
  }

  beginGlide(transition: CameraTransition) {
    this.motion = { kind: "gliding", transition }
  }

  beginCut() {
    this.motion = { kind: "cutting" }
  }

  finishMoveToIdle() {
    this.motion = { kind: "idle" }
    this.flushSettle()
  }

  setPanning() {
    if (this.motion.kind === "idle") {
      this.motion = { kind: "panning" }
    }
  }

  clearPanning() {
    if (this.motion.kind === "panning") {
      this.motion = { kind: "idle" }
    }
  }

  /** Called when OrbitControls starts a user drag/zoom: cancels glide/takeMove/circling and settles waiters. */
  onOrbitStart() {
    this.circling = 0
    this.takeMove = null
    this.motion = { kind: "driving" }
    this.flushSettle()
  }

  /** Called when LookControls starts a user drag/zoom on a painted tripod: cancels glide/takeMove/circling and settles waiters. */
  onLookStart(finishCut?: () => void) {
    if (this.motion.kind === "cutting") finishCut?.()
    this.circling = 0
    this.takeMove = null
    this.motion = { kind: "userLook" }
    this.flushSettle()
  }

  dispose() {
    this.takeMove = null
    this.circling = 0
    this.followed.clear()
    this.framed.clear()
    this.motion = { kind: "idle" }
    this.flushSettle()
  }
}
