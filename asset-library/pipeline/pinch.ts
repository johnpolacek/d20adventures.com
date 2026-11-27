// Whether a limb keeps its thickness where it bends, through a figure's clips: an elbow that folds flat, a wrist that
// twists thin like a sweet wrapper, a knee that swells. armcheck.ts asks it of the elbows and wrists, legcheck.ts of
// the knees and ankles.
//
// The flesh about a joint is the skin within half a bone's length of it along the limb, within 1.8 times the limb's
// own thickness there of the limb's line, and pulled most by the limb's own bones (so a coat's skirt, a scabbard or
// the trunk beside it are not counted). It is cut in eight rings along the limb, four each side of the joint. Each
// ring's spread across the limb (spread below), posed against at rest, is how much of its cross-section is left.
// Under 0.4 it has collapsed, a fault. Over 1.5 it has swollen, marked but not a fault (PINCH).
//
// Adapted from deformation_report and flag_report in scenario-labs/skills (skills/dcc/blender/scenario-blender-rigging,
// MIT), which measured it on Rigify poses in Blender, with 0.85 and 1.25 for its limits. There it is the distance to
// the bone's line, which falls on the inside of every bend: at 0.85 nearly every clip of every figure here failed. Here it is the ring's spread about its
// own middle, at every frame of the figure's own clips.

import type { Animation, Document, Node } from "@gltf-transform/core"
import { type Mat, mul, posed, skinPoint } from "./pose"

// Set 2026-11-27 from close renders of Thalbern (Rodin) in headless Blender. His right wrist in Combo at 0.30 is wrung
// to a thin neck at the cuff. His elbows at 0.45 to 0.59 and his knee at 0.76 are deep bends that look as they should.
// Swelling to 1.46 was the left knee, where his scabbard's tips hang against the leg: gear in the ring, not the knee.
// Across the 21 figures on disk the knees that swell past 1.5, to 2.9, are those in coats and robes (Aelar, Elf
// Fighter, Silas, Wollandora), whose hems swing out from the leg. A swelling is shown, then, and never a fault.
// The same run found Wollandora (Hi3D)'s right hand torn into spikes in Idle, at 0.20, and Lyra's knee at 0.34 in
// Sneak, a deep crouch with a heavy crease behind it.
export const PINCH = { collapse: 0.4, swell: 1.5 }
const RINGS = 8
const FRAMES = 30

// A joint and the three points of the limb about it: the joint above, the joint, the joint below. Each may be named
// two ways: a person's skeleton or a beast's.
export const JOINTS: Record<string, string[][]> = {
  elbow: [["Arm"], ["ForeArm"], ["Hand", "FrontFoot"]],
  wrist: [["ForeArm"], ["Hand"], ["HandMiddle1"]],
  knee: [["UpLeg"], ["Leg"], ["Foot", "HindFoot"]],
  ankle: [["Leg"], ["Foot", "HindFoot"], ["ToeBase", "HindToeBase"]],
}

type Ring = { least: number; leastAt: number; most: number; mostAt: number }
export type Pinch = Record<string, Ring | null>

const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
// How far a point lies from a bone's line, and where along it, 0 at a and 1 at b.
function along(p: number[], a: number[], b: number[]) {
  const ab = sub(b, a)
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / Math.max(1e-12, dot(ab, ab))))
  const q = [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]]
  return { d: Math.hypot(...sub(p, q)), t }
}
// From the limb's two bones: the distance to the nearer, and where, -1 at the joint above, 0 at the joint, 1 below.
function onLimb(p: number[], [a, j, b]: number[][]) {
  const [up, down] = [along(p, a, j), along(p, j, b)]
  return up.d <= down.d ? { d: up.d, s: up.t - 1 } : { d: down.d, s: down.t }
}

// Each ring's cross-section: the mean squared distance of its points from their own middle, across the bone the ring
// lies along (the upper bone for the rings above the joint, the lower for those below). A fold flattens one side of a
// ring and pushes out the other, and the spread holds. A twist that wrings the ring thin, or skin left behind as the
// bone moves on, changes it. A ring of fewer than six points is 0, and not measured.
function spread(r: { chain: number[]; points: number[]; ring: number[] }, at: (i: number) => number[], line: number[][]) {
  const groups: number[][][] = Array.from({ length: RINGS }, () => [])
  r.points.forEach((i, k) => {
    groups[r.ring[k]].push(at(i))
  })
  return groups.map((pts, k) => {
    if (pts.length < 6) return 0
    const [a, b] = k < RINGS / 2 ? [line[0], line[1]] : [line[1], line[2]]
    const axis = sub(b, a)
    const len = Math.hypot(...axis) || 1
    const u = axis.map((v) => v / len)
    const mid = [0, 1, 2].map((c) => pts.reduce((sum, p) => sum + p[c], 0) / pts.length)
    let sum = 0
    for (const p of pts) {
      const d = sub(p, mid)
      const t = dot(d, u)
      sum += dot(d, d) - t * t
    }
    return sum / pts.length
  })
}

// Every joint of `names` on both sides, measured over the clips given. A joint the skeleton has no bones for is null.
export function pinch(doc: Document, clips: Animation[], names: string[]): Record<string, Pinch> {
  const skin = doc.getRoot().listSkins()[0]
  const joints = skin?.listJoints() ?? []
  const bind = skin?.getInverseBindMatrices()
  const prim = doc
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .find((p) => p.getAttribute("JOINTS_0"))
  const [pos, J, W] = [prim?.getAttribute("POSITION"), prim?.getAttribute("JOINTS_0"), prim?.getAttribute("WEIGHTS_0")]
  if (!skin || !bind || !pos || !J || !W) throw new Error("No skinned mesh")
  const plain = joints.map((j) => j.getName().replace(/^.*:/, ""))
  const find = (side: string, options: string[]) => options.map((o) => plain.indexOf(`${side}${o}`)).find((i) => i >= 0) ?? -1
  const binds = joints.map((_, i) => bind.getElement(i, new Array(16).fill(0)))
  const count = pos.getCount()
  const at = (world: (n: Node) => Mat, i: number) => world(joints[i]).slice(12, 15)
  const rest = posed(null)(0)
  const restSkin = joints.map((j, i) => mul(rest(j), binds[i]))
  const pulls: [number[], number[]][] = []
  const P: number[][] = []
  for (let i = 0; i < count; i++) {
    pulls.push([J.getElement(i, [0, 0, 0, 0]), W.getElement(i, [0, 0, 0, 0])])
    P.push(skinPoint(pos.getElement(i, [0, 0, 0]), pulls[i][0], pulls[i][1], restSkin))
  }

  // The flesh of each joint, its ring, and its distance at rest.
  type Region = {
    name: string
    chain: number[]
    points: number[]
    ring: number[]
    rest: number[]
  }
  const regions: Region[] = []
  const out: Record<string, Pinch> = {}
  for (const name of names) {
    out[name] = {}
    for (const side of ["Left", "Right"]) {
      const chain = JOINTS[name].map((options) => find(side, options))
      if (chain.some((i) => i < 0)) {
        out[name][side] = null
        continue
      }
      // The limb's own bones: the two the joint lies between, and those named after them (a forearm's twist bone).
      const [upper, lower] = [plain[chain[0]], plain[chain[1]]]
      const own = new Set(plain.flatMap((n, i) => (n.startsWith(upper) || n.startsWith(lower) ? [i] : [])))
      const line = chain.map((i) => at(rest, i))
      const near = []
      for (let i = 0; i < count; i++) {
        const [j, w] = pulls[i]
        const top = j[w.indexOf(Math.max(...w))]
        if (!own.has(top)) continue
        const { d, s } = onLimb(P[i], line)
        if (Math.abs(s) <= 0.5) near.push({ i, d, s })
      }
      const close = near.filter((n) => Math.abs(n.s) < 0.15).map((n) => n.d)
      if (close.length < 6) {
        out[name][side] = null
        continue
      }
      close.sort((a, b) => a - b)
      const thick = close[Math.floor(close.length / 2)]
      const kept = near.filter((n) => n.d < 1.8 * thick)
      const ring = kept.map((n) => Math.min(RINGS - 1, Math.floor((n.s + 0.5) * RINGS)))
      const region = {
        name: `${name}:${side}`,
        chain,
        points: kept.map((n) => n.i),
        ring,
        rest: [] as number[],
      }
      region.rest = spread(region, (i) => P[i], line)
      regions.push(region)
      out[name][side] = { least: 1, leastAt: 0, most: 1, mostAt: 0 }
    }
  }

  for (const clip of clips) {
    const world = posed(clip)
    const long = Math.max(...clip.listSamplers().map((s) => s.getInput()?.getMax([0])[0] ?? 0))
    for (let f = 0; f <= Math.ceil(long * FRAMES); f++) {
      const time = Math.min(long, f / FRAMES)
      const now = world(time)
      const skinned = joints.map((j, i) => mul(now(j), binds[i]))
      for (const r of regions) {
        const line = r.chain.map((i) => at(now, i))
        const spreads = spread(r, (i) => skinPoint(pos.getElement(i, [0, 0, 0]), pulls[i][0], pulls[i][1], skinned), line)
        const [name, side] = r.name.split(":")
        const rec = out[name][side] as Ring
        spreads.forEach((v, k) => {
          if (!r.rest[k] || !v) return
          const ratio = v / r.rest[k]
          if (ratio < rec.least) [rec.least, rec.leastAt] = [ratio, time]
          if (ratio > rec.most) [rec.most, rec.mostAt] = [ratio, time]
        })
      }
    }
  }
  return out
}

// One line for each joint over one clip, and the faults in it.
export function pinchLines(clip: string, result: Record<string, Pinch>) {
  const lines: string[] = []
  const bad: string[] = []
  for (const [name, sides] of Object.entries(result)) {
    const cells = Object.entries(sides).map(([side, r]) => {
      if (!r) return `${side} none`
      const low = r.least < PINCH.collapse
      const high = r.most > PINCH.swell
      if (low) bad.push(`${clip} ${side} ${name} collapses to ${r.least.toFixed(2)} at ${r.leastAt.toFixed(2)} s`)
      return `${side} ${r.least.toFixed(2)}${low ? "!" : ""}-${r.most.toFixed(2)}${high ? "!" : ""}`
    })
    lines.push(`    ${name.padEnd(6)} ${cells.join("  ")}`)
  }
  return { lines, bad }
}
