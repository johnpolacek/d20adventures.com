// Whether a figure's legs hold up through its clips, measured and not looked at. The arms have armcheck.ts.
//
//   pnpm assets:legs thalbern-hi3d               every clip
//   pnpm assets:legs thalbern-hi3d "Idle,Walk"   the clips named, by comma
//
// For each clip:
//   slide   how far a planted foot slides along the ground, in a clip the figure stands in
//   floor   how far the lowest point of the skin goes below the ground the figure stands on at rest
//   seam    how far any joint is from where it started, at the last frame of a clip that loops
//   hitch   angular velocity kink or speed dip across the loop seam (ported from patch-gg/cloud-blender-skills loop_check.py)
//   knee    the most a knee bends the wrong way: behind the line from hip to ankle, while bent
//   hips    how far the hips rise and fall
// And for each gait, a walk, a sneak, a run or a sprint, the speed it goes at (gait.ts). The game plays a gait at the
// speed `motion.gaits` in figure.json gives it, and a walk with none at 1.2 metres a second: `slip` is how far a planted
// foot slides in a step at that speed.
//
// The limits were set here, 2026-11-24, from how the game shows a figure: about 160 pixels tall, so 2 cm is two pixels.
// A foot is planted while it is within 3 cm of the lowest it goes in the clip.

import { readFile } from "node:fs/promises"
import { NodeIO } from "@gltf-transform/core"
import { ALL_EXTENSIONS } from "@gltf-transform/extensions"
import { type Gaits, gaitSpeed, plantedSpans } from "./gait"
import { angle, type Mat, mul, posed, skinPoint } from "./pose"
import { type Quat, qinv, qmul, qunit } from "./quat"

const LIMITS = { slide: 2, floor: 2, seam: 1, seamDeg: 5, hitchDeg: 6, knee: 2, speed: 0.15 }
const STRIDE = 1.2
const FRAMES = 60
// A clip whose hips go farther than this from where they start moves the figure about: its feet are not held to the
// ground, and the slide is not counted.
const STANDS = 0.1

// Extracts the world rotation quaternion from a column-major 4x4 matrix (ignoring scale and translation).
function matQuat(m: Mat): Quat {
  const col = (c: number) => {
    const v = [m[c * 4], m[c * 4 + 1], m[c * 4 + 2]]
    const len = Math.hypot(v[0], v[1], v[2]) || 1
    return [v[0] / len, v[1] / len, v[2] / len]
  }
  const [x, y, z] = [col(0), col(1), col(2)]
  const trace = x[0] + y[1] + z[2]
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2
    return qunit([(y[2] - z[1]) / s, (z[0] - x[2]) / s, (x[1] - y[0]) / s, s / 4])
  }
  if (x[0] > y[1] && x[0] > z[2]) {
    const s = Math.sqrt(1 + x[0] - y[1] - z[2]) * 2
    return qunit([s / 4, (y[0] + x[1]) / s, (z[0] + x[2]) / s, (y[2] - z[1]) / s])
  }
  if (y[1] > z[2]) {
    const s = Math.sqrt(1 + y[1] - x[0] - z[2]) * 2
    return qunit([(y[0] + x[1]) / s, s / 4, (z[1] + y[2]) / s, (z[0] - x[2]) / s])
  }
  const s = Math.sqrt(1 + z[2] - x[0] - y[1]) * 2
  return qunit([(z[0] + x[2]) / s, (z[1] + y[2]) / s, s / 4, (x[1] - y[0]) / s])
}

// Signed angular velocity vector from rotation a to b, in degrees per step (axis * angle).
function angVel(a: Quat, b: Quat): [number, number, number] {
  let [x, y, z, w] = qmul(b, qinv(a))
  if (w < 0) [x, y, z, w] = [-x, -y, -z, -w]
  const sinHalf = Math.hypot(x, y, z)
  if (sinHalf < 1e-7) return [0, 0, 0]
  const deg = (2 * Math.atan2(sinHalf, Math.min(1, w)) * 180) / Math.PI
  const k = deg / sinHalf
  return [x * k, y * k, z * k]
}

const vlen = (v: [number, number, number]) => Math.hypot(v[0], v[1], v[2])
const vsub = (a: [number, number, number], b: [number, number, number]): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const vdot = (a: [number, number, number], b: [number, number, number]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

// Checks a looping clip for rotational pop at the seam and velocity kinks/dips across the 4 steps straddling it.
function seamMotion(rots: Quat[][], jointNames: string[]) {
  const n = rots.length
  if (n < 5) return { rotPop: 0, popBone: "", hitch: 0, hitchBone: "", hitchKind: "" }
  let [rotPop, popBone] = [0, ""]
  let [hitch, hitchBone, hitchKind] = [0, "", ""]
  for (let i = 0; i < jointNames.length; i++) {
    const p0 = rots[0][i]
    const n0 = rots[1][i]
    const m0 = rots[2][i]
    const p1 = rots[n - 1][i]
    const n1 = rots[n - 2][i]
    const m1 = rots[n - 3][i]
    const pop = vlen(angVel(p0, p1))
    if (pop > rotPop) [rotPop, popBone] = [pop, jointNames[i]]
    const [v1, v2, v3, v4] = [angVel(m1, n1), angVel(n1, p1), angVel(p0, n0), angVel(n0, m0)]
    const [aBefore, aSeam, aAfter] = [vsub(v2, v1), vsub(v3, v2), vsub(v4, v3)]
    const avg: [number, number, number] = [(aBefore[0] + aAfter[0]) / 2, (aBefore[1] + aAfter[1]) / 2, (aBefore[2] + aAfter[2]) / 2]
    const jerk = vlen(vsub(aSeam, avg))
    const kink = jerk > LIMITS.hitchDeg && jerk > Math.max(vlen(aBefore), vlen(aAfter))
    const sameDir = vdot(v1, v2) > 0 && vdot(v2, v3) > 0 && vdot(v3, v4) > 0
    const [lo, hi] = [Math.min(vlen(v2), vlen(v3)), Math.min(vlen(v1), vlen(v4))]
    const dip = sameDir && hi - lo > LIMITS.hitchDeg && lo < 0.5 * hi
    if (kink && jerk > hitch) [hitch, hitchBone, hitchKind] = [jerk, jointNames[i], "kink"]
    else if (dip && hi - lo > hitch) [hitch, hitchBone, hitchKind] = [hi - lo, jointNames[i], "dip"]
  }
  return { rotPop, popBone, hitch, hitchBone, hitchKind }
}

type Figure = { height: number; lods: { file: string }[]; motion?: { idle?: string; walk?: string; gaits?: Gaits } }

async function main() {
  const [id, only] = process.argv.slice(2).filter((a) => !a.startsWith("--"))
  if (!id) throw new Error("Name a character: pnpm assets:legs <id> [clip,clip]")
  const dir = `asset-library/characters/${id}`
  const figure = JSON.parse(await readFile(`${dir}/figure.json`, "utf8")) as Figure
  // The lightest copy: the same bones and clips, and fewer points to pose for the floor.
  const file = figure.lods[figure.lods.length - 1].file
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(`${dir}/${file}`)
  const skin = doc.getRoot().listSkins()[0]
  const joints = skin?.listJoints() ?? []
  const bind = skin?.getInverseBindMatrices()
  const bone = (name: string) => {
    const i = joints.findIndex((j) => new RegExp(`(^|:)${name}$`).test(j.getName()))
    if (i < 0) throw new Error(`No ${name} bone in ${file}`)
    return i
  }
  const prims = doc
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .filter((p) => p.getAttribute("JOINTS_0"))
  if (!prims.length || !bind) throw new Error(`No skinned mesh in ${dir}/${file}`)
  const points: { p: number[]; j: number[]; w: number[] }[] = []
  for (const prim of prims) {
    const [pos, J, W] = [prim.getAttribute("POSITION"), prim.getAttribute("JOINTS_0"), prim.getAttribute("WEIGHTS_0")]
    if (!pos || !J || !W) continue
    for (let i = 0; i < pos.getCount(); i++) points.push({ p: pos.getElement(i, [0, 0, 0]), j: J.getElement(i, [0, 0, 0, 0]), w: W.getElement(i, [0, 0, 0, 0]) })
  }
  const binds = joints.map((_, i) => bind.getElement(i, new Array(16).fill(0)))
  const span = (world: ReturnType<ReturnType<typeof posed>>) => {
    const skinned = joints.map((joint, i) => mul(world(joint), binds[i]))
    let [least, most, which] = [Infinity, -Infinity, 0]
    for (const [i, { p, j, w }] of points.entries()) {
      const y = skinPoint(p, j, w, skinned)[1]
      if (y < least) [least, which] = [y, i]
      most = Math.max(most, y)
    }
    return [least, most, which]
  }
  // The lowest point of the skin, and the bone that pulls on it most.
  const lowest = (world: ReturnType<ReturnType<typeof posed>>) => {
    const [y, , i] = span(world)
    const { j, w } = points[i]
    return { y, part: joints[j[w.indexOf(Math.max(...w))]].getName().replace(/^.*:/, "") }
  }
  // The game stands a figure on the lowest point of its skin at rest and scales it to the brief's height
  // (packages/stage/src/figures/models.ts), so every distance is given at that scale.
  const [ground, top] = span(posed(null)(0))
  const scale = figure.height / (top - ground)
  const legs = ["Left", "Right"].map((side) => ({ side, hip: bone(`${side}UpLeg`), knee: bone(`${side}Leg`), ankle: bone(`${side}Foot`), toe: bone(`${side}ToeBase`) }))
  const hips = bone("Hips")
  // Which way each thigh faces, in the thigh's own frame: the way the toes point at rest, along the ground. A knee bends
  // toward it, however the leg is turned or the foot pointed.
  const restAt = posed(null)(0)
  const facing = [0, 1, 2].map((n) => legs.reduce((sum, leg) => sum + restAt(joints[leg.toe])[12 + n] - restAt(joints[leg.ankle])[12 + n], 0))
  facing[1] = 0
  const inFrame = (m: number[], v: number[], back = false) => {
    const axes = [0, 1, 2].map((c) => {
      const col = [m[c * 4], m[c * 4 + 1], m[c * 4 + 2]]
      const long = Math.hypot(...col) || 1
      return col.map((x) => x / long)
    })
    const out = back ? axes.map((a) => a[0] * v[0] + a[1] * v[1] + a[2] * v[2]) : [0, 1, 2].map((r) => axes[0][r] * v[0] + axes[1][r] * v[1] + axes[2][r] * v[2])
    const long = Math.hypot(...out) || 1
    return out.map((x) => x / long)
  }
  const thighFront = legs.map((leg) => inFrame(restAt(joints[leg.hip]), facing, true))

  const clips = doc
    .getRoot()
    .listAnimations()
    .filter((a) => !only || only.split(",").includes(a.getName()))
  const walks = (name: string) => name === figure.motion?.walk || /walk|strafe|sneak|run|jog|sprint|crouch fwd/i.test(name)
  const loops = (name: string) => name === figure.motion?.idle || name === figure.motion?.walk || /idle|walk|strafe|sneak|run|jog|sprint|crouch/i.test(name)
  const jointNames = joints.map((j) => j.getName().replace(/^.*:/, ""))
  const bad: string[] = []
  console.log(`${id}: ${points.length} points in ${file}, ${figure.height} m tall, ${scale.toFixed(3)} of the file's units to a metre`)
  console.log("clip".padEnd(14), "stands", "slide cm", "floor cm", "seam cm", "hitch°", "knee cm", "hips cm ", "walk")
  for (const clip of clips) {
    const name = clip.getName()
    const long = Math.max(...clip.listSamplers().map((s) => s.getInput()?.getMax([0])[0] ?? 0))
    const at = posed(clip)
    const frames = Array.from({ length: Math.ceil(long * FRAMES) + 1 }, (_, f) => Math.min(long, f / FRAMES))
    const poses = frames.map((t) => {
      const world = at(t)
      const of = (i: number) => world(joints[i]).slice(12, 15)
      return { world, of, all: joints.map((_, i) => of(i)), rots: joints.map((j) => matQuat(world(j))) }
    })
    // A foot's point on the ground: between the ankle and the toe, as the sole rolls from heel to toe.
    const feet = legs.map((leg) =>
      poses.map(({ of }) => {
        const [a, t] = [of(leg.ankle), of(leg.toe)]
        return [0, 1, 2].map((k) => (a[k] + t[k]) / 2)
      })
    )
    const start = poses[0].of(hips)
    const travel = Math.max(...poses.map(({ of }) => Math.hypot(of(hips)[0] - start[0], of(hips)[2] - start[2])))
    const stands = travel * scale < STANDS && !walks(name)
    const heights = poses.map(({ of }) => of(hips)[1])

    // The spans each foot is planted for, as runs of frames.
    const spans = feet.map((foot) => plantedSpans(foot.map((p) => p[1])))
    const flat = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[2] - b[2])
    let slide = 0
    for (const [side, runs] of spans.entries())
      for (const [from, to] of runs) for (let f = from; f <= to; f++) slide = Math.max(slide, flat(feet[side][f], feet[side][from]))

    // The walk's own speed: how fast a planted foot goes back, and which way.
    let walk = ""
    if (walks(name) && !/strafe/i.test(name)) {
      const { speed, back } = gaitSpeed(frames, feet, spans, scale)
      // At the speed the game plays it at, the ground goes back under the figure as fast: a planted foot should too.
      const kept = Object.values(figure.motion?.gaits ?? {}).find((g) => g?.clip === name)
      const plays = kept?.speed ?? STRIDE
      let slip = 0
      for (const [side, runs] of spans.entries())
        for (const [from, to] of runs)
          for (let f = from; f <= to; f++) {
            const dt = frames[f] - frames[from]
            const [p, q] = [feet[side][f], feet[side][from]]
            slip = Math.max(slip, Math.hypot((p[0] - q[0]) * scale - back[0] * plays * dt, (p[2] - q[2]) * scale - back[1] * plays * dt))
          }
      walk = `walks ${speed.toFixed(2)} m/s, slip ${(slip * 100).toFixed(1)} cm at ${plays}`
      if ((kept || name === figure.motion?.walk) && Math.abs(speed - plays) / plays > LIMITS.speed)
        bad.push(`${name} walks at ${speed.toFixed(2)} m/s, and the game plays it as ${plays}${kept ? "" : ", having no motion.gaits: rebuild it"}: a planted foot slips ${(slip * 100).toFixed(1)} cm`)
    }

    let floor = { value: -Infinity, at: 0, part: "" }
    let knee = { value: 0, at: 0, side: "" }
    poses.forEach(({ world, of }, f) => {
      const low = lowest(world)
      const below = (ground - low.y) * scale
      if (below > floor.value) floor = { value: below, at: frames[f], part: low.part }
      for (const [n, leg] of legs.entries()) {
        const [h, k, a] = [of(leg.hip), of(leg.knee), of(leg.ankle)]
        const thigh = [0, 1, 2].map((n) => k[n] - h[n])
        const shin = [0, 1, 2].map((n) => a[n] - k[n])
        if (angle(thigh, shin) < 20) continue
        // The knee from the line hip to ankle, along the way the thigh faces.
        const line = [0, 1, 2].map((n) => a[n] - h[n])
        const share = (thigh[0] * line[0] + thigh[1] * line[1] + thigh[2] * line[2]) / (line[0] ** 2 + line[1] ** 2 + line[2] ** 2 || 1)
        const off = [0, 1, 2].map((n) => k[n] - (h[n] + line[n] * share))
        const front = inFrame(world(joints[leg.hip]), thighFront[n])
        const wrong = -(off[0] * front[0] + off[1] * front[1] + off[2] * front[2]) * scale
        if (wrong > knee.value) knee = { value: wrong, at: frames[f], side: leg.side }
      }
    })
    const last = poses[poses.length - 1].all
    const seam = loops(name) ? Math.max(...poses[0].all.map((p, i) => Math.hypot(...[0, 1, 2].map((n) => p[n] - last[i][n])))) * scale : null
    const seamAng = loops(name) ? seamMotion(poses.map((p) => p.rots), jointNames) : null

    const cm = (m: number) => (m * 100).toFixed(1)
    slide *= scale
    if (stands && slide * 100 > LIMITS.slide) bad.push(`${name}: a planted foot slides ${cm(slide)} cm`)
    if (floor.value * 100 > LIMITS.floor) bad.push(`${name}: the skin goes ${cm(floor.value)} cm below the ground at ${floor.at.toFixed(2)} s, at the ${floor.part}`)
    if (seam !== null && seam * 100 > LIMITS.seam) bad.push(`${name}: the loop's last frame is ${cm(seam)} cm from its first`)
    if (seamAng && seamAng.rotPop > LIMITS.seamDeg) bad.push(`${name}: the loop's ${seamAng.popBone} turns ${seamAng.rotPop.toFixed(1)}° across the seam`)
    if (seamAng && seamAng.hitch > LIMITS.hitchDeg) bad.push(`${name}: the loop's ${seamAng.hitchBone} has a ${seamAng.hitch.toFixed(1)}° ${seamAng.hitchKind} across the seam`)
    if (knee.value * 100 > LIMITS.knee) bad.push(`${name}: the ${knee.side.toLowerCase()} knee bends ${cm(knee.value)} cm the wrong way at ${knee.at.toFixed(2)} s`)
    const mark = (over: boolean) => (over ? "!" : "")
    const hitchCell = seamAng ? `${Math.max(seamAng.rotPop, seamAng.hitch).toFixed(1)}${mark(seamAng.rotPop > LIMITS.seamDeg || seamAng.hitch > LIMITS.hitchDeg)}` : "-"
    console.log(
      name.padEnd(14),
      (stands ? "yes" : "no").padEnd(6),
      `${cm(slide)}${mark(stands && slide * 100 > LIMITS.slide)}`.padEnd(8),
      `${cm(Math.max(0, floor.value))}${mark(floor.value * 100 > LIMITS.floor)}`.padEnd(8),
      `${seam === null ? "-" : cm(seam)}${mark(seam !== null && seam * 100 > LIMITS.seam)}`.padEnd(7),
      hitchCell.padEnd(6),
      `${cm(knee.value)}${mark(knee.value * 100 > LIMITS.knee)}`.padEnd(7),
      `${cm((Math.max(...heights) - Math.min(...heights)) * scale)}`.padEnd(8),
      walk
    )
  }
  console.log(bad.length ? `\n${bad.length} over a limit:\n${bad.map((b) => `  ${b}`).join("\n")}` : "\nNothing over a limit.")
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
