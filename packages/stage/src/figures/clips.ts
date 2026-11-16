// Clips for every rigged figure (rig.py): Idle, Walk and Hit, written as turns, as figure.ts writes its own. And the
// moves of a fight, played once when a figure attacks or is missed (models.ts): Swing, a sword's cut; Shoot, a bow
// drawn, held and loosed; Dodge, a duck and a step aside; Claw, a beast's swipe; and Roar.
//
// The skeleton is the same in every character: the same bone names, and every bone square to the world at rest, x the
// figure's left, y up and z the way it faces. So a clip is a turn per bone in its parent's frame, and it plays on
// anyone. A positive turn about z lifts the left arm and lowers the right. A positive turn about x takes a hanging limb
// back, and a negative one forward.
//
// Three things are read from the figure itself: how far out its arms were modelled, how far out they must hang to
// clear its own body, and where its hips rest, since a walk moves them.

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
// How far out each arm was modelled, and how far out it hangs when standing: the least that clears this body, which
// rig.py measures and leaves on the skeleton. A figure rigged before that hangs at HANG.
interface Arms {
  L: number
  R: number
  hangL: number
  hangR: number
  // The turn that brings each hand into line with its forearm (relaxHands).
  wristL: Q
  wristR: Q
}

interface Pose {
  turns: Record<string, Q>
  // The hips, moved from where they rest, in metres on a figure 1.8 m tall.
  lift?: [number, number, number]
}
interface Written {
  name: string
  seconds: number
  pose: (t: number, arm: Arms) => Pose
}

const standing = (arm: Arms, sway: { armL?: number; armR?: number; swingL?: number; swingR?: number; elbowL?: number; elbowR?: number } = {}) => ({
  upperarmL: turn(about(X, sway.swingL ?? 0), about(Z, -(arm.L - arm.hangL) + (sway.armL ?? 0))),
  upperarmR: turn(about(X, sway.swingR ?? 0), about(Z, arm.R - arm.hangR - (sway.armR ?? 0))),
  // No two arms hang alike.
  forearmL: about(X, -15 + (sway.elbowL ?? 0)),
  forearmR: about(X, -10 + (sway.elbowR ?? 0)),
  handL: arm.wristL,
  handR: arm.wristR,
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

// The moment in each move that lands, in seconds: the cut, the loosing of the arrow, the swipe. An attack's effect
// starts there (stage.ts).
export const STRIKE: Record<string, number> = { Swing: 0.45, Shoot: 1.05, Claw: 0.5 }
// Every move a rigged figure can be made to play (models.ts act).
export const MOVE_NAMES = ["Swing", "Shoot", "Dodge", "Claw", "Roar"]
// What each move has in hand while it plays (weapons.ts): the prop's name and the hand it is in.
export const IN_HAND: Record<string, { what: "sword" | "bow"; hand: "L" | "R" }> = { Swing: { what: "sword", hand: "R" }, Shoot: { what: "bow", hand: "L" } }
// The bowstring is drawn to the other hand over this span of Shoot, and loosed at its end.
export const DRAW: [number, number, number] = [0.3, 0.7, STRIKE.Shoot]

// Rises from 0 to 1 over a to b, holds, and falls to 0 over c to d.
const span = (t: number, a: number, b: number, c: number, d: number) => smooth(a, b, t) * (1 - smooth(c, d, t))
// How far into Shoot the bow is raised, the string drawn, and the hand flown back after the loosing, each 0 to 1. The
// arms are put where these say by models.ts as well, after the clip.
// How far into Swing the sword is wound back over the shoulder, and how far it has come through (0 to 1), and how much
// of the arm models.ts puts where those say.
export const swinging = (t: number) => ({ wound: span(t, 0, 0.3, 0.36, 0.5), through: smooth(0.36, 0.52, t), arm: span(t, 0, 0.28, 0.66, 1.05) })
export const shooting = (t: number) => ({
  raise: span(t, 0, 0.32, 1.3, 1.75),
  draw: span(t, DRAW[0], DRAW[1], STRIKE.Shoot, STRIKE.Shoot + 0.06),
  after: span(t, STRIKE.Shoot, STRIKE.Shoot + 0.1, 1.3, 1.75),
})

const MOVES: Written[] = [
  {
    // A cut from over the right shoulder, down and across, with a step in on the left foot.
    name: "Swing",
    seconds: 1.05,
    pose: (t, arm) => {
      const w = span(t, 0, 0.32, 0.36, 0.48)
      const k = span(t, 0.36, 0.5, 0.62, 1.05)
      return {
        turns: {
          ...standing(arm, { armL: 22 * (w + k), swingL: 18 * k, elbowL: -20 * (w + k), swingR: -165 * w - 60 * k, armR: 20 * w - 8 * k, elbowR: -75 * w - 12 * k }),
          // The wrist cocked back over the shoulder, then thrown over so the blade comes down and forward.
          handR: turn(about(X, -25 * w + 60 * k), arm.wristR),
          hips: about(Y, -12 * w + 14 * k),
          spine: turn(about(X, -6 * w + 14 * k), about(Y, -8 * w + 8 * k)),
          chest: turn(about(X, -4 * w + 8 * k), about(Y, -22 * w + 28 * k)),
          head: turn(about(X, 6 * k), about(Y, 18 * w - 20 * k)),
          thighL: about(X, -30 * k),
          shinL: about(X, 26 * k),
          footL: about(X, 4 * k),
          thighR: about(X, 14 * k),
          shinR: about(X, 14 * k),
          footR: about(X, -12 * k),
        },
        lift: [0, -0.05 * k, 0.11 * k],
      }
    },
  },
  {
    // The bow raised in the left hand and the body turned side on, the string drawn to the jaw, held, and loosed, the
    // right hand flying back; then the bow lowered. The left arm is rolled so that the bow stands upright.
    name: "Shoot",
    seconds: 1.75,
    pose: (t, arm) => {
      const { raise: r, draw: d, after } = shooting(t)
      const raiseL = (93 - arm.hangL) * r
      const raiseR = (88 - arm.hangR) * r
      return {
        turns: {
          upperarmL: turn(about(Z, -(arm.L - arm.hangL) + raiseL), about(Y, 90 * r)),
          forearmL: about(X, -15 + 10 * r),
          handL: arm.wristL,
          upperarmR: turn(about(X, 22 * after), about(Z, arm.R - arm.hangR - raiseR)),
          forearmR: about(X, -10 - 70 * r - 80 * d + 40 * after),
          handR: arm.wristR,
          hips: about(Y, -28 * r),
          spine: about(Y, -22 * r),
          chest: turn(about(Y, -30 * r), about(X, -3 * r)),
          neck: about(Y, 36 * r),
          head: turn(about(Y, 36 * r), about(Z, -6 * r)),
          thighL: about(Z, 9 * r),
          thighR: about(Z, -9 * r),
        },
      }
    },
  },
  {
    // Down and aside, to the figure's left, arms up before the face, and back up again.
    name: "Dodge",
    seconds: 0.9,
    pose: (t, arm) => {
      const e = Math.sin(Math.PI * clamp01(t / 0.9) ** 0.6) ** 1.2
      return {
        turns: {
          ...standing(arm, { swingL: -55 * e, swingR: -55 * e, elbowL: -70 * e, elbowR: -75 * e, armL: 8 * e, armR: 4 * e }),
          hips: about(Z, -4 * e),
          spine: turn(about(X, 12 * e), about(Z, -12 * e)),
          chest: turn(about(X, 12 * e), about(Y, -10 * e)),
          head: about(X, 8 * e),
          thighL: turn(about(Z, 14 * e), about(X, -50 * e)),
          shinL: about(X, 78 * e),
          footL: about(X, -28 * e),
          thighR: turn(about(Z, -10 * e), about(X, -44 * e)),
          shinR: about(X, 72 * e),
          footR: about(X, -28 * e),
        },
        lift: [0.16 * e, -0.2 * e, -0.04 * e],
      }
    },
  },
  {
    // A beast's swipe: the right arm thrown up and back, then raked down and across, the body lunging after it.
    name: "Claw",
    seconds: 1.15,
    pose: (t, arm) => {
      const w = span(t, 0, 0.36, 0.4, 0.52)
      const k = span(t, 0.4, 0.55, 0.68, 1.15)
      return {
        turns: {
          ...standing(arm, { armR: 95 * w + 15 * k, swingR: -35 * w - 85 * k, elbowR: -55 * w - 20 * k, armL: 25 * (w + k), swingL: -20 * k, elbowL: -35 * (w + k) }),
          hips: about(Y, -10 * w + 12 * k),
          spine: turn(about(X, -8 * w + 16 * k), about(Y, -10 * w + 10 * k)),
          chest: turn(about(X, -6 * w + 12 * k), about(Y, -20 * w + 30 * k)),
          head: about(X, -8 * w + 12 * k),
          thighL: about(X, -22 * k),
          shinL: about(X, 20 * k),
          thighR: about(X, 10 * k),
          shinR: about(X, 12 * k),
        },
        lift: [0, -0.04 * k, 0.14 * k],
      }
    },
  },
  {
    // Reared back with the arms up and out, the head thrown up, shaking with it.
    name: "Roar",
    seconds: 1.9,
    pose: (t, arm) => {
      const r = span(t, 0, 0.45, 1.35, 1.9)
      const shake = Math.sin(2 * Math.PI * 7 * t) * r * smooth(0.4, 0.55, t)
      return {
        turns: {
          ...standing(arm, { armL: 70 * r, armR: 70 * r, swingL: -30 * r, swingR: -30 * r, elbowL: -45 * r, elbowR: -45 * r }),
          spine: about(X, -10 * r),
          chest: turn(about(X, -12 * r), about(Y, 3 * shake)),
          neck: about(X, -10 * r),
          head: turn(about(X, -18 * r), about(Z, 3 * shake)),
        },
        lift: [0, 0.03 * r, -0.04 * r],
      }
    },
  },
]

// The axes of a cloud of points, longest first: the eigenvectors of its covariance, by Jacobi's turns.
function axes(points: THREE.Vector3[], centre: THREE.Vector3) {
  const a = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  for (const p of points) {
    const d = [p.x - centre.x, p.y - centre.y, p.z - centre.z]
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) a[i][j] += d[i] * d[j]
  }
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]
  for (let sweep = 0; sweep < 12; sweep++)
    for (const [i, j] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ]) {
      if (Math.abs(a[i][j]) < 1e-12) continue
      const th = 0.5 * Math.atan2(2 * a[i][j], a[j][j] - a[i][i])
      const [c, sn] = [Math.cos(th), Math.sin(th)]
      for (let k = 0; k < 3; k++) [a[k][i], a[k][j]] = [c * a[k][i] - sn * a[k][j], sn * a[k][i] + c * a[k][j]]
      for (let k = 0; k < 3; k++) [a[i][k], a[j][k]] = [c * a[i][k] - sn * a[j][k], sn * a[i][k] + c * a[j][k]]
      for (let k = 0; k < 3; k++) [v[k][i], v[k][j]] = [c * v[k][i] - sn * v[k][j], sn * v[k][i] + c * v[k][j]]
    }
  return [0, 1, 2].sort((i, j) => a[j][j] - a[i][i]).map((i) => new THREE.Vector3(v[0][i], v[1][i], v[2][i]))
}

const smooth = (a: number, b: number, t: number) => {
  const u = clamp01((t - a) / (b - a))
  return u * u * (3 - 2 * u)
}
// Where the fingers bend, as shares of the hand's length from the wrist, and how far, in degrees.
const KNUCKLES: [number, number][] = [
  [0.46, 14],
  [0.68, 22],
  [0.86, 16],
]
// A hand that holds something (props.ts) is closed about it.
const GRIP: [number, number][] = [
  [0.4, 80],
  [0.6, 86],
  [0.8, 24],
]
// A hand as it was modelled, in the figure's own space: the way it points, the way its palm faces, and its length.
export interface Palm {
  along: THREE.Vector3
  normal: THREE.Vector3
  length: number
  // Modelled closed, as a fist: what it holds stands through its middle, and its fingers are left as they are.
  fist?: boolean
  // Where the middle of the hand lies from the wrist, along the hand and out of its palm.
  middle: [number, number]
}

// A generated figure's hands come as they were modelled: flat, fingers straight and spread wide, turned out at the
// wrist. The skeleton has one bone to a hand, so the fingers are bent in the mesh itself, once: curled a little toward
// the palm at three lines and drawn together. What a bone can do is left to the clips: the hand brought into line with
// the forearm.
export function relaxHands(root: THREE.Object3D): Pick<Arms, "wristL" | "wristR"> & { palm: { L?: Palm; R?: Palm } } {
  const had = root.userData.hands as ReturnType<typeof relaxHands> | undefined
  if (had) return had
  const out: ReturnType<typeof relaxHands> = { wristL: new THREE.Quaternion(), wristR: new THREE.Quaternion(), palm: {} }
  root.userData.hands = out
  // The hand that holds something, "staff:R:2.1" on the skeleton (rig.py), and whether it was modelled as a fist.
  let grips = ""
  let fist = false
  let facing = ""
  root.traverse((o) => {
    if (typeof o.userData.holds !== "string") return
    grips = o.userData.holds.split(":")[1] ?? ""
    fist = ["fist", "rod"].includes(o.userData.holds.split(":")[3])
    facing = o.userData.holds.split(":")[4] ?? ""
  })
  root.traverse((o) => {
    if (!(o instanceof THREE.SkinnedMesh)) return
    const { position: pos, normal: nor, skinIndex: si, skinWeight: sw } = o.geometry.attributes
    if (!pos || !si || !sw) return
    const joint = (name: string) => {
      const i = o.skeleton.bones.findIndex((b) => b.name === name)
      return i < 0 ? null : { i, at: new THREE.Vector3().setFromMatrixPosition(o.skeleton.boneInverses[i].clone().invert()) }
    }
    for (const side of ["L", "R"] as const) {
      const [hand, fore] = [joint(`hand${side}`), joint(`forearm${side}`)]
      if (!hand || !fore) continue
      const W = hand.at
      const ids: number[] = []
      const pts: THREE.Vector3[] = []
      for (let v = 0; v < pos.count; v++) {
        let w = 0
        for (let k = 0; k < 4; k++) if (si.getComponent(v, k) === hand.i) w += sw.getComponent(v, k)
        if (w <= 0.5) continue
        ids.push(v)
        pts.push(new THREE.Vector3().fromBufferAttribute(pos, v).applyMatrix4(o.bindMatrix))
      }
      if (pts.length < 40) continue
      const centre = pts.reduce((n, p) => n.add(p), new THREE.Vector3()).divideScalar(pts.length)
      // Along the hand, out of its palm or its back, and across it.
      const h = centre.clone().sub(W).normalize()
      const closed = fist && grips === side
      // An open hand is thinnest from its back to its palm. A fist is a ball, and no measure of its shape says which
      // side its palm is: guesses from its shape, and from what the sheet seemed to show, were wrong three times. A
      // generator makes a fist as it makes the open hand beside it, palm turned in toward the thigh and thumb to the
      // front, whatever the sheet asked. That was settled by hiding the staff and looking at the bare fist from above.
      // `"palm"` in holds says otherwise, for a model that comes differently: "front" or "back", the way it faces.
      const thigh = new THREE.Vector3(side === "L" ? -1 : 1, -1, 0)
      const n = closed ? (facing === "front" ? new THREE.Vector3(0, 0, 1) : facing === "back" ? new THREE.Vector3(0, 0, -1) : thigh.clone()) : axes(pts, centre)[2]
      n.addScaledVector(h, -n.dot(h)).normalize()
      // The palm is the face turned in and down: the sheet a figure is modelled from holds its palms toward the thighs.
      if (!closed && n.dot(thigh) < 0) n.negate()
      const across = new THREE.Vector3().crossVectors(h, n)
      const L = Math.max(...pts.map((p) => p.clone().sub(W).dot(h)))
      const along = pts.map((p) => p.clone().sub(W).dot(h) / L)
      const off = centre.clone().sub(W).dot(n)
      out.palm[side] = { along: h.clone(), normal: n.clone(), length: L, fist: closed, middle: [centre.clone().sub(W).dot(h), off] }
      for (let m = 0; m < (closed ? 0 : ids.length); m++) {
        const [v, t, p] = [ids[m], along[m], pts[m]]
        // Drawn together, then bent at each line from the fingertips back.
        p.addScaledVector(across, -(grips === side ? 0.68 : 0.4) * smooth(0.42, 0.9, t) * p.clone().sub(W).dot(across))
        const normal = nor ? new THREE.Vector3().fromBufferAttribute(nor, v).transformDirection(o.bindMatrix) : null
        for (const [line, most] of [...(grips === side ? GRIP : KNUCKLES)].reverse()) {
          const angle = THREE.MathUtils.degToRad(most) * smooth(line - 0.07, line + 0.07, t)
          if (!angle) continue
          const hinge = W.clone()
            .addScaledVector(h, line * L)
            .addScaledVector(n, off)
          p.sub(hinge).applyAxisAngle(across, angle).add(hinge)
          normal?.applyAxisAngle(across, angle)
        }
        p.applyMatrix4(o.bindMatrixInverse)
        pos.setXYZ(v, p.x, p.y, p.z)
        if (nor && normal) {
          normal.transformDirection(o.bindMatrixInverse)
          nor.setXYZ(v, normal.x, normal.y, normal.z)
        }
      }
      pos.needsUpdate = true
      if (nor) nor.needsUpdate = true
      // The hand in line with the forearm, most of the way.
      const f = W.clone().sub(fore.at).normalize()
      const bend = Math.min(THREE.MathUtils.degToRad(40), 0.8 * h.angleTo(f))
      out[`wrist${side}`].setFromAxisAngle(new THREE.Vector3().crossVectors(h, f).normalize(), bend)
    }
  })
  return out
}

// Whether a loaded model carries the shared skeleton.
export const isRigged = (root: THREE.Object3D) => !!root.getObjectByName("hips") && !!root.getObjectByName("upperarmL")

// The clips for one figure. `height` is the model's own, in its units, before anything scales it.
export function figureClips(root: THREE.Object3D, height: number): THREE.AnimationClip[] {
  const bone = (name: string) => root.getObjectByName(name)
  const out = (side: "L" | "R") => {
    const elbow = bone(`forearm${side}`)?.position
    return elbow ? THREE.MathUtils.radToDeg(Math.atan2(Math.abs(elbow.x), -elbow.y)) : 35
  }
  let fitted: { hangL?: number; hangR?: number } = {}
  root.traverse((o) => {
    if (typeof o.userData.hangL === "number") fitted = o.userData
  })
  const { wristL, wristR } = relaxHands(root)
  const arm: Arms = { L: out("L"), R: out("R"), hangL: fitted.hangL ?? HANG, hangR: fitted.hangR ?? HANG, wristL, wristR }
  const hips = bone("hips")?.position.clone() ?? new THREE.Vector3()
  const size = height / 1.8
  return [...WRITTEN, ...MOVES].map((w) => {
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
