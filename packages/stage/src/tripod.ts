import * as THREE from "three"
import type { SetSpec } from "./spec/set"

// A painted set's camera stands only at painted points, tripods it turns and zooms on.
// This file is the geometry of that, with no GPU: which point a shot is seen from, and how far a view may turn
// and widen before it runs off the paint.

type Spec = NonNullable<SetSpec["painted"]>

// One painting's frame as seen from its point: the camera it was painted for.
export interface Frame {
  quaternion: THREE.Quaternion
  inverse: THREE.Quaternion
  fov: number
  // Half the frame's height and width at one metre.
  tanY: number
  tanX: number
}
export interface TripodPoint {
  name: string
  label?: string
  position: THREE.Vector3
  frames: Frame[]
}
// Where on the canvas a shot's subject should sit, -1..1 each way with 0 the middle: the middle of what a docked panel
// leaves uncovered. The lens is always the whole canvas. A lens fitted to the uncovered part alone would have to keep a
// canvas two or three times its height on one painting, and narrows to a close-up of someone's belt.
export type Spot = readonly [number, number]
export interface View {
  point: TripodPoint
  target: THREE.Vector3
  fov: number
  // The lens the shot wanted from this point and what it wanted to look at, before the paintings narrowed and turned
  // it. A window that changes shape fits them again.
  asked: number
  wanted: THREE.Vector3
}

const UP = new THREE.Vector3(0, 1, 0)
const rad = THREE.MathUtils.degToRad
const deg = THREE.MathUtils.radToDeg
// A view stops this far inside a painting's edge, where the paint fades out.
const INSIDE = 0.994

export function tripodPoints(spec: Spec): TripodPoint[] {
  return Object.entries(spec.points).map(([name, p]) => ({
    name,
    label: p.label,
    position: new THREE.Vector3(...p.position),
    frames: p.paintings.map((f) => {
      const quaternion = new THREE.Quaternion(...f.quaternion).normalize()
      const tanY = Math.tan(rad(f.fov) / 2)
      return { quaternion, inverse: quaternion.clone().invert(), fov: f.fov, tanY, tanX: tanY * f.aspect }
    }),
  }))
}

// Where a direction falls in a frame: -1..1 each way inside it. Null behind the camera.
function inFrame(f: Frame, dir: THREE.Vector3, v = new THREE.Vector3()) {
  v.copy(dir).applyQuaternion(f.inverse)
  if (v.z > -1e-4) return null
  return { u: v.x / -v.z / f.tanX, v: v.y / -v.z / f.tanY }
}

// The closest view to the one asked for that stays on one painting: narrowed until it fits, then turned back inside.
function fitFrame(f: Frame, aim: THREE.Vector3, fov: number, aspect: number) {
  const dir = aim.clone().normalize()
  const right = new THREE.Vector3()
  const up = new THREE.Vector3()
  const ray = new THREE.Vector3()
  const tmp = new THREE.Vector3()
  let t = Math.tan(rad(fov) / 2)
  let ok = false
  for (let i = 0; i < 12 && !ok; i++) {
    if (!inFrame(f, dir, tmp)) dir.set(0, 0, -1).applyQuaternion(f.quaternion)
    right.crossVectors(dir, UP)
    // Looking straight up or down has no level: take the frame's own.
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0).applyQuaternion(f.quaternion)
    right.normalize()
    up.crossVectors(right, dir)
    let u0 = Infinity
    let u1 = -Infinity
    let v0 = Infinity
    let v1 = -Infinity
    let behind = false
    for (const x of [-1, 0, 1])
      for (const y of [-1, 0, 1]) {
        ray
          .copy(dir)
          .addScaledVector(right, x * t * aspect)
          .addScaledVector(up, y * t)
        const p = inFrame(f, ray, tmp)
        if (!p) {
          behind = true
          continue
        }
        u0 = Math.min(u0, p.u)
        u1 = Math.max(u1, p.u)
        v0 = Math.min(v0, p.v)
        v1 = Math.max(v1, p.v)
      }
    // Part of the view looks behind the painting's camera: far too wide, or turned far away.
    if (behind) {
      t *= 0.7
      dir.lerp(tmp.set(0, 0, -1).applyQuaternion(f.quaternion), 0.5).normalize()
      continue
    }
    const wide = Math.max((u1 - u0) / (2 * INSIDE), (v1 - v0) / (2 * INSIDE))
    if (wide > 1) {
      t = (t / wide) * 0.998
      continue
    }
    const du = u0 < -INSIDE ? -INSIDE - u0 : u1 > INSIDE ? INSIDE - u1 : 0
    const dv = v0 < -INSIDE ? -INSIDE - v0 : v1 > INSIDE ? INSIDE - v1 : 0
    if (Math.abs(du) < 1e-4 && Math.abs(dv) < 1e-4) {
      ok = true
      break
    }
    const a = inFrame(f, dir, tmp)!
    dir
      .set((a.u + du) * f.tanX, (a.v + dv) * f.tanY, -1)
      .applyQuaternion(f.quaternion)
      .normalize()
  }
  return { dir, fov: deg(2 * Math.atan(t)), ok }
}

// The lens of the closest painting made of what a view toward `aim` looks at.
function closest(point: TripodPoint, aim: THREE.Vector3) {
  let tight = Infinity
  const tmp = new THREE.Vector3()
  for (const f of point.frames) {
    const p = inFrame(f, aim, tmp)
    if (p && Math.abs(p.u) < 1 && Math.abs(p.v) < 1) tight = Math.min(tight, f.fov)
  }
  return Number.isFinite(tight) ? tight : point.frames[0].fov
}
// The tightest a view toward `aim` may zoom: to half that lens, where a painting's pixels are drawn twice their size.
export function minFov(point: TripodPoint, aim: THREE.Vector3) {
  return Math.max(6, closest(point, aim) * 0.5)
}

// A view from a point toward `aim`, as near the one asked for as its paintings allow. `turned` is how far it had to
// turn away, as a share of the lens it ends with, and `narrowed` how much of the lens it lost.
export function fitView(point: TripodPoint, aim: THREE.Vector3, fov: number, aspect: number, at: Spot = [0, 0]) {
  const subject = aim.clone().normalize()
  const asked = THREE.MathUtils.clamp(fov, minFov(point, subject), 110)
  // The way the camera looks so that the subject sits at `at`: off the subject by that share of the lens it ends with.
  // A painting that narrows the lens narrows that turn with it, or the subject would slide out of the frame, so the
  // view is fitted again with the lens it got.
  const right = new THREE.Vector3().crossVectors(subject, UP)
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0)
  right.normalize()
  const up = new THREE.Vector3().crossVectors(right, subject)
  const want = new THREE.Vector3()
  let lens = asked
  let best: { dir: THREE.Vector3; fov: number; turned: number; narrowed: number; cost: number } | undefined
  for (let pass = 0; pass < 4; pass++) {
    const t = Math.tan(rad(lens) / 2)
    want
      .copy(subject)
      .addScaledVector(right, -at[0] * t * aspect)
      .addScaledVector(up, -at[1] * t)
      .normalize()
    best = undefined
    for (const f of point.frames) {
      const r = fitFrame(f, want, asked, aspect)
      const turned = r.dir.angleTo(want) / rad(r.fov)
      const narrowed = 1 - r.fov / asked
      const cost = turned + narrowed + (r.ok ? 0 : 10)
      if (!best || cost < best.cost) best = { dir: r.dir, fov: r.fov, turned, narrowed, cost }
    }
    if (!best || (!at[0] && !at[1]) || Math.abs(best.fov - lens) < 0.05) break
    lens = best.fov
  }
  return best!
}

// The view of a shot from a painted point. The shot's own camera can stand anywhere, so its subject is seen from the
// point that best suits it: near where the camera was meant to be, with the subject on its paintings, at the size the
// shot showed it. `penalty` adds what the geometry here cannot know, such as a wall between a point and the subject.
export function tripodView(
  points: TripodPoint[],
  shot: { position: readonly number[]; target: readonly number[]; fov: number },
  aspect: number,
  at: Spot = [0, 0],
  penalty?: (point: TripodPoint) => number
): View {
  const from = new THREE.Vector3(...(shot.position as [number, number, number]))
  const target = new THREE.Vector3(...(shot.target as [number, number, number]))
  const reach = Math.max(from.distanceTo(target), 0.1)
  let best: { view: View; score: number } | undefined
  for (const point of points) {
    const aim = target.clone().sub(point.position)
    const far = Math.max(aim.length(), 0.1)
    // The same subject at the same size from farther off is a longer lens.
    const fov = deg(2 * Math.atan((Math.tan(rad(shot.fov) / 2) * reach) / far))
    const fit = fitView(point, aim, fov, aspect, at)
    // Metres from where the camera was meant to stand, plus what this point cannot give, each weighed as metres:
    // the subject pushed toward the edge of the frame or out of it, a lens narrower than asked or not as tight, a
    // painting enlarged until it is soft, and the subject seen from another side than the shot meant.
    const side = aim.clone().negate().angleTo(from.clone().sub(target))
    const score =
      point.position.distanceTo(from) +
      Math.max(0, fit.turned - 0.15) * 40 +
      fit.narrowed * 12 +
      (fit.cost >= 10 ? 60 : 0) +
      Math.max(0, fit.fov / Math.max(fov, 6) - 1) * 6 +
      Math.max(0, closest(point, fit.dir) / fit.fov - 1) * 6 +
      (side / (Math.PI / 2)) * 6 +
      (penalty?.(point) ?? 0)
    if (!best || score < best.score) best = { view: { point, target: point.position.clone().addScaledVector(fit.dir, far), fov: fit.fov, asked: fov, wanted: target }, score }
  }
  return best!.view
}

// The most a drift slides something half way to the subject across the frame, as a share of the frame's height.
const DRIFT_ON_SCREEN = 0.01

// How far the camera still is from its point as it drifts in: off to one side and a little back. `left` is the share of
// the way still to go, 1 on arriving and 0 at rest. `aim` runs from the point to what the camera looks at. `amp` is
// the farthest it starts, in metres, which a wide view of something far takes whole. A close view takes less, so that
// things slide across the screen no faster than they do in a far one: a subject 3 m off through a 35 degree lens
// drifts under 2 cm, where 15 cm would swing the foreground a tenth of the frame.
export function driftIn(aim: THREE.Vector3, fov: number, amp: number, left: number, out = new THREE.Vector3()) {
  const k = Math.min(amp, DRIFT_ON_SCREEN * aim.length() * rad(fov)) * left
  const fwd = aim.clone().normalize()
  const right = new THREE.Vector3().crossVectors(fwd, UP)
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0)
  right.normalize()
  return out
    .set(0, 0, 0)
    .addScaledVector(right, k)
    .addScaledVector(fwd, -k * 0.5)
}
