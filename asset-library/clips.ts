// Clips for every rigged figure (rig.py): Idle, Walk and Hit, written as turns, as figure.ts writes its own.
//
// The skeleton is the same in every character: the same bone names, and every bone square to the world at rest, x the
// figure's left, y up and z the way it faces. So a clip is a turn per bone in its parent's frame, and it plays on
// anyone. A positive turn about z lifts the left arm and lowers the right. A positive turn about x takes a hanging limb
// back, and a negative one forward.
//
// Two things are read from the figure itself: how far out its arms were modelled, so that standing they hang the same
// on everyone, and where its hips rest, since a walk moves them.

import * as THREE from "three"

type Q = THREE.Quaternion
const X = new THREE.Vector3(1, 0, 0)
const Y = new THREE.Vector3(0, 1, 0)
const Z = new THREE.Vector3(0, 0, 1)
const about = (axis: THREE.Vector3, deg: number) => new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(deg))
// The last turn is made first, as in figure.ts.
const turn = (...parts: Q[]) => parts.reduce((a, b) => a.clone().multiply(b), new THREE.Quaternion())
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
const FPS = 30
// Degrees a standing arm hangs out from straight down.
const HANG = 15

interface Pose {
  turns: Record<string, Q>
  // The hips, moved from where they rest, in metres on a figure 1.8 m tall.
  lift?: [number, number, number]
}
interface Written {
  name: string
  seconds: number
  pose: (t: number, arm: { L: number; R: number }) => Pose
}

const standing = (arm: { L: number; R: number }, sway: { armL?: number; armR?: number; swingL?: number; swingR?: number; elbowL?: number; elbowR?: number } = {}) => ({
  upperarmL: turn(about(X, sway.swingL ?? 0), about(Z, -(arm.L - HANG) + (sway.armL ?? 0))),
  upperarmR: turn(about(X, sway.swingR ?? 0), about(Z, arm.R - HANG - (sway.armR ?? 0))),
  forearmL: about(X, -9 + (sway.elbowL ?? 0)),
  forearmR: about(X, -9 + (sway.elbowR ?? 0)),
})

const wave = (t: number, T: number, phase = 0, times = 1) => Math.sin((2 * Math.PI * times * t) / T + phase)

const WRITTEN: Written[] = [
  {
    // Breathing, a slow look about, the weight of the arms.
    name: "Idle",
    seconds: 5,
    pose: (t, arm) => ({
      turns: {
        ...standing(arm, { armL: 0.9 * wave(t, 5, 0, 2), armR: 0.9 * wave(t, 5, 0, 2), elbowL: 1.5 * wave(t, 5, 1.1), elbowR: 1.5 * wave(t, 5, 2.3) }),
        spine: turn(about(X, 0.5 * wave(t, 5, 0, 2)), about(Z, 0.5 * wave(t, 5, 0.6))),
        chest: turn(about(X, -0.9 * wave(t, 5, 0, 2)), about(Y, 1.1 * wave(t, 5, 0.3))),
        neck: about(Y, 2.2 * wave(t, 5, 0.9)),
        head: turn(about(Y, 3.2 * wave(t, 5, 0.9)), about(X, 1.1 * wave(t, 5, 2, 2))),
      },
    }),
  },
  {
    // On the spot: a leg swings through with its knee bent and lands straight, the hips turn with it and dip as the
    // weight comes down, and the arms answer the legs.
    name: "Walk",
    seconds: 1.05,
    pose: (t, arm) => {
      const p = (2 * Math.PI * t) / 1.05
      const s = Math.sin(p)
      const knee = (c: number) => 5 + 46 * Math.max(0, c) ** 1.3
      return {
        turns: {
          ...standing(arm, { swingL: 17 * s, swingR: -17 * s, elbowL: -8 + 9 * s, elbowR: -8 - 9 * s }),
          hips: turn(about(Y, -5 * s), about(Z, 1.5 * Math.cos(p))),
          spine: about(X, 2),
          chest: turn(about(Y, 9 * s), about(X, 1.5)),
          neck: about(Y, -3 * s),
          thighL: about(X, -25 * s),
          thighR: about(X, 25 * s),
          shinL: about(X, knee(Math.cos(p))),
          shinR: about(X, knee(-Math.cos(p))),
          footL: about(X, -9 * s + 8 * Math.max(0, Math.cos(p))),
          footR: about(X, 9 * s + 8 * Math.max(0, -Math.cos(p))),
        },
        lift: [0, -0.014 + 0.014 * Math.cos(2 * p), 0],
      }
    },
  },
  {
    // Struck in the chest: thrown back from the waist, arms flung out, and back to standing.
    name: "Hit",
    seconds: 0.6,
    pose: (t, arm) => {
      const e = Math.sin(Math.PI * clamp01(t / 0.6) ** 0.55) ** 1.3
      return {
        turns: {
          ...standing(arm, { armL: 13 * e, armR: 13 * e, elbowL: -22 * e, elbowR: -16 * e }),
          hips: about(X, -2.5 * e),
          spine: turn(about(X, -8 * e), about(Y, 5 * e)),
          chest: turn(about(X, -7 * e), about(Y, 6 * e)),
          neck: about(X, 4 * e),
          head: about(X, 9 * e),
          thighL: about(X, -3 * e),
          thighR: about(X, 2 * e),
        },
        lift: [0, 0, -0.035 * e],
      }
    },
  },
]

// Whether a loaded model carries the shared skeleton.
export const isRigged = (root: THREE.Object3D) => !!root.getObjectByName("hips") && !!root.getObjectByName("upperarmL")

// The clips for one figure. `height` is the model's own, in its units, before anything scales it.
export function figureClips(root: THREE.Object3D, height: number): THREE.AnimationClip[] {
  const bone = (name: string) => root.getObjectByName(name)
  const out = (side: "L" | "R") => {
    const elbow = bone(`forearm${side}`)?.position
    return elbow ? THREE.MathUtils.radToDeg(Math.atan2(Math.abs(elbow.x), -elbow.y)) : 35
  }
  const arm = { L: out("L"), R: out("R") }
  const hips = bone("hips")?.position.clone() ?? new THREE.Vector3()
  const size = height / 1.8
  return WRITTEN.map((w) => {
    const frames = Math.round(w.seconds * FPS)
    const times = Array.from({ length: frames + 1 }, (_, i) => (i / frames) * w.seconds)
    const poses = times.map((t) => w.pose(t === w.seconds ? 0 : t, arm))
    const names = [...new Set(poses.flatMap((p) => Object.keys(p.turns)))]
    const tracks: THREE.KeyframeTrack[] = names.map(
      (n) =>
        new THREE.QuaternionKeyframeTrack(
          `${n}.quaternion`,
          times,
          poses.flatMap((p) => (p.turns[n] ?? new THREE.Quaternion()).toArray())
        )
    )
    if (poses.some((p) => p.lift))
      tracks.push(
        new THREE.VectorKeyframeTrack(
          "hips.position",
          times,
          poses.flatMap((p) => [hips.x + (p.lift?.[0] ?? 0) * size, hips.y + (p.lift?.[1] ?? 0) * size, hips.z + (p.lift?.[2] ?? 0) * size])
        )
      )
    return new THREE.AnimationClip(w.name, w.seconds, tracks)
  })
}
