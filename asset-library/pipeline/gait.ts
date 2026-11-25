// How fast a figure's gaits go: the speed at which each walk, sneak, run or sprint clip keeps a planted foot still on
// the ground. A clip is made in place, so a planted foot goes back under the figure as fast as the figure goes forward.
// legcheck.ts reports it, and pilot.ts writes it into figure.json as `motion.gaits`, which the stage plays each gait at
// (packages/stage/src/figures/models.ts).

import type { Document } from "@gltf-transform/core"
import { mul, posed, skinPoint } from "./pose"

// A foot is planted while it is within this of the lowest it goes in the clip, in the file's units.
export const PLANTED = 0.03
const FRAMES = 60

// The gaits the stage knows, and the clip each is played from in a brief's `borrowed`.
export const GAITS = { sneak: "Sneak", walk: "Walk", run: "Run", sprint: "Sprint" } as const
export type Gait = keyof typeof GAITS
export type Gaits = Partial<Record<Gait, { clip: string; speed: number }>>

// The runs of frames a foot is planted for, from its heights.
export function plantedSpans(heights: number[]) {
  const least = Math.min(...heights)
  const runs: [number, number][] = []
  let from = -1
  heights.forEach((y, f) => {
    const down = y < least + PLANTED
    if (down && from < 0) from = f
    if ((!down || f === heights.length - 1) && from >= 0) {
      const to = down ? f : f - 1
      if (to > from) runs.push([from, to])
      from = -1
    }
  })
  return runs
}

// The speed of a gait, in metres a second, and the way the ground goes under it: each planted span's travel added up,
// over its time added up. `feet` are each foot's points by frame, `scale` metres to the file's unit.
export function gaitSpeed(frames: number[], feet: number[][][], spans: [number, number][][], scale: number) {
  let [x, z, dt] = [0, 0, 0]
  for (const [side, runs] of spans.entries())
    for (const [from, to] of runs) {
      const [a, b] = [feet[side][from], feet[side][to]]
      x += b[0] - a[0]
      z += b[2] - a[2]
      dt += frames[to] - frames[from]
    }
  const long = Math.hypot(x, z) || 1
  return { speed: (Math.hypot(x, z) * scale) / (dt || 1), back: [x / long, z / long] }
}

// Each gait clip the figure has, with its speed, for a figure `height` metres tall.
export function measureGaits(doc: Document, height: number): Gaits {
  const skin = doc.getRoot().listSkins()[0]
  const joints = skin?.listJoints() ?? []
  const bind = skin?.getInverseBindMatrices()
  const bone = (name: string) => joints.find((j) => new RegExp(`(^|:)${name}$`).test(j.getName()))
  const legs = ["Left", "Right"].map((side) => [bone(`${side}Foot`), bone(`${side}ToeBase`)])
  if (!bind || legs.flat().some((b) => !b)) return {}
  // The figure's height in the file, at rest, which the game scales to `height`.
  const binds = joints.map((_, i) => bind.getElement(i, new Array(16).fill(0)))
  const rest = posed(null)(0)
  const skinned = joints.map((joint, i) => mul(rest(joint), binds[i]))
  let [least, most] = [Infinity, -Infinity]
  for (const prim of doc
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives())) {
    const [pos, J, W] = [prim.getAttribute("POSITION"), prim.getAttribute("JOINTS_0"), prim.getAttribute("WEIGHTS_0")]
    if (!pos || !J || !W) continue
    for (let i = 0; i < pos.getCount(); i++) {
      const y = skinPoint(pos.getElement(i, [0, 0, 0]), J.getElement(i, [0, 0, 0, 0]), W.getElement(i, [0, 0, 0, 0]), skinned)[1]
      least = Math.min(least, y)
      most = Math.max(most, y)
    }
  }
  const scale = height / (most - least || 1)
  const out: Gaits = {}
  for (const [gait, name] of Object.entries(GAITS) as [Gait, string][]) {
    const clip = doc
      .getRoot()
      .listAnimations()
      .find((a) => a.getName() === name)
    if (!clip) continue
    const long = Math.max(...clip.listSamplers().map((s) => s.getInput()?.getMax([0])[0] ?? 0))
    const at = posed(clip)
    const frames = Array.from({ length: Math.ceil(long * FRAMES) + 1 }, (_, f) => Math.min(long, f / FRAMES))
    const feet = legs.map(() => [] as number[][])
    for (const t of frames) {
      const world = at(t)
      for (const [side, [ankle, toe]] of legs.entries()) {
        const [a, b] = [world(ankle!).slice(12, 15), world(toe!).slice(12, 15)]
        feet[side].push([0, 1, 2].map((k) => (a[k] + b[k]) / 2))
      }
    }
    const spans = feet.map((foot) => plantedSpans(foot.map((p) => p[1])))
    out[gait] = { clip: name, speed: Math.round(gaitSpeed(frames, feet, spans, scale).speed * 100) / 100 }
  }
  return out
}
