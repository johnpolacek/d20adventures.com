// Whether a figure's legs hold up through its clips, measured and not looked at. The arms have armcheck.ts.
//
//   pnpm assets:legs thalbern-hi3d               every clip
//   pnpm assets:legs thalbern-hi3d "Idle,Walk"   the clips named, by comma
//
// For each clip:
//   slide   how far a planted foot slides along the ground, in a clip the figure stands in
//   floor   how far the lowest point of the skin goes below the ground the figure stands on at rest
//   seam    how far any joint is from where it started, at the last frame of a clip that loops
//   knee    the most a knee bends the wrong way: behind the line from hip to ankle, while bent
//   hips    how far the hips rise and fall
// And for the walk, the speed it walks at. The game moves every figure at 1.2 metres a second for the walk at its own
// pace (STRIDE in packages/stage/src/figures/models.ts), so a walk made for another speed skates: `slip` is how far a
// planted foot slides in a step at the game's speed.
//
// The limits were set here, 2026-11-24, from how the game shows a figure: about 160 pixels tall, so 2 cm is two pixels.
// A foot is planted while it is within 3 cm of the lowest it goes in the clip.

import { readFile } from "node:fs/promises"
import { NodeIO } from "@gltf-transform/core"
import { ALL_EXTENSIONS } from "@gltf-transform/extensions"
import { angle, mul, posed, skinPoint } from "./pose"

const LIMITS = { slide: 2, floor: 2, seam: 1, knee: 2, speed: 0.15 }
const STRIDE = 1.2
const FRAMES = 60
const PLANTED = 0.03
// A clip whose hips go farther than this from where they start moves the figure about: its feet are not held to the
// ground, and the slide is not counted.
const STANDS = 0.1

type Figure = { height: number; lods: { file: string }[]; motion?: { idle?: string; walk?: string } }

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
  const loops = (name: string) => name === figure.motion?.idle || name === figure.motion?.walk || /idle|walk|strafe/i.test(name)
  const bad: string[] = []
  console.log(`${id}: ${points.length} points in ${file}, ${figure.height} m tall, ${scale.toFixed(3)} of the file's units to a metre`)
  console.log("clip".padEnd(14), "stands", "slide cm", "floor cm", "seam cm", "knee cm", "hips cm ", "walk")
  for (const clip of clips) {
    const name = clip.getName()
    const long = Math.max(...clip.listSamplers().map((s) => s.getInput()?.getMax([0])[0] ?? 0))
    const at = posed(clip)
    const frames = Array.from({ length: Math.ceil(long * FRAMES) + 1 }, (_, f) => Math.min(long, f / FRAMES))
    const poses = frames.map((t) => {
      const world = at(t)
      const of = (i: number) => world(joints[i]).slice(12, 15)
      return { world, of, all: joints.map((_, i) => of(i)) }
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
    const spans = feet.map((foot) => {
      const least = Math.min(...foot.map((p) => p[1]))
      const runs: [number, number][] = []
      let from = -1
      foot.forEach((p, f) => {
        const down = p[1] < least + PLANTED
        if (down && from < 0) from = f
        if ((!down || f === foot.length - 1) && from >= 0) {
          const to = down ? f : f - 1
          if (to > from) runs.push([from, to])
          from = -1
        }
      })
      return runs
    })
    const flat = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[2] - b[2])
    let slide = 0
    for (const [side, runs] of spans.entries())
      for (const [from, to] of runs) for (let f = from; f <= to; f++) slide = Math.max(slide, flat(feet[side][f], feet[side][from]))

    // The walk's own speed: how fast a planted foot goes back, and which way.
    let walk = ""
    if (walks(name) && !/strafe/i.test(name)) {
      const moves: { d: number[]; dt: number }[] = []
      for (const [side, runs] of spans.entries())
        for (const [from, to] of runs) {
          const [a, b] = [feet[side][from], feet[side][to]]
          moves.push({ d: [b[0] - a[0], b[2] - a[2]], dt: frames[to] - frames[from] })
        }
      const sum = moves.reduce((s, m) => [s[0] + m.d[0], s[1] + m.d[1], s[2] + m.dt], [0, 0, 0])
      const speed = (Math.hypot(sum[0], sum[1]) * scale) / (sum[2] || 1)
      const back = [sum[0] / (Math.hypot(sum[0], sum[1]) || 1), sum[1] / (Math.hypot(sum[0], sum[1]) || 1)]
      // At the game's speed the ground goes back under the figure at STRIDE: a planted foot should go back as fast.
      let slip = 0
      for (const [side, runs] of spans.entries())
        for (const [from, to] of runs)
          for (let f = from; f <= to; f++) {
            const dt = frames[f] - frames[from]
            const [p, q] = [feet[side][f], feet[side][from]]
            slip = Math.max(slip, Math.hypot((p[0] - q[0]) * scale - back[0] * STRIDE * dt, (p[2] - q[2]) * scale - back[1] * STRIDE * dt))
          }
      walk = `walks ${speed.toFixed(2)} m/s, slip ${(slip * 100).toFixed(1)} cm at ${STRIDE}`
      if (name === figure.motion?.walk && Math.abs(speed - STRIDE) / STRIDE > LIMITS.speed) bad.push(`${name} walks at ${speed.toFixed(2)} m/s, and the game moves it at ${STRIDE}: a planted foot slips ${(slip * 100).toFixed(1)} cm`)
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

    const cm = (m: number) => (m * 100).toFixed(1)
    slide *= scale
    if (stands && slide * 100 > LIMITS.slide) bad.push(`${name}: a planted foot slides ${cm(slide)} cm`)
    if (floor.value * 100 > LIMITS.floor) bad.push(`${name}: the skin goes ${cm(floor.value)} cm below the ground at ${floor.at.toFixed(2)} s, at the ${floor.part}`)
    if (seam !== null && seam * 100 > LIMITS.seam) bad.push(`${name}: the loop's last frame is ${cm(seam)} cm from its first`)
    if (knee.value * 100 > LIMITS.knee) bad.push(`${name}: the ${knee.side.toLowerCase()} knee bends ${cm(knee.value)} cm the wrong way at ${knee.at.toFixed(2)} s`)
    const mark = (over: boolean) => (over ? "!" : "")
    console.log(
      name.padEnd(14),
      (stands ? "yes" : "no").padEnd(6),
      `${cm(slide)}${mark(stands && slide * 100 > LIMITS.slide)}`.padEnd(8),
      `${cm(Math.max(0, floor.value))}${mark(floor.value * 100 > LIMITS.floor)}`.padEnd(8),
      `${seam === null ? "-" : cm(seam)}${mark(seam !== null && seam * 100 > LIMITS.seam)}`.padEnd(7),
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
