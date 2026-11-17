// A clip from another skeleton, played on a figure's own: the moves of Quaternius's Universal Animation Library (CC0,
// quaternius.itch.io/universal-animation-library and -2) on a skeleton of Mixamo's names, as Meshy rigs one.
// Mesh2Motion's clips (github.com/Mesh2Motion/mesh2motion-app, CC0) are on the same skeleton, one clip to a file, and
// have what the library's free tier lacks: a bow drawn and loosed, dodges and strafes.
//
// The two skeletons agree on nothing but the body they stand for: their bones have other names, lie along other axes,
// and the library rests with its arms straight out where a generated figure rests with them 40 degrees down. So no
// turn is copied bone to bone. For each bone, how far the library's has turned in the world since its rest is found,
// and the figure's bone is turned as far from a rest of its own in which its arms and legs point as the library's do.
// A bone copied without that comes out as far over-turned as the two rests differ.
//
// The hips are carried as the library's are, scaled by how tall the two stand at the hip. Nothing is done for feet
// that slide or hands that miss: the limbs are other lengths.
//
// A hand is lined up whole, by the way its fingers run and the way its palm faces, and each finger by the way it
// points. A finger curls about the line across its knuckles, and that line is the hand's own: lined up by the forearm
// alone, with the palm a part turn off the library's, the fingers of a fist closed sideways through each other (the
// owner, 2026-11-16: "the hands look garbled").

import type { Animation, Document, Node } from "@gltf-transform/core"
import { type Quat, qall, qbetween, qframe, qinv, qmix, qmul, qturn, type Vec } from "./quat"

// The library's bone for each of the figure's, by Mixamo's name without its prefix.
const BONES: Record<string, string> = { Hips: "pelvis", Spine: "spine_01", Spine1: "spine_02", Spine2: "spine_03", Neck: "neck_01", Head: "Head" }
// A limb's bone, and the bone it reaches to: the two skeletons are lined up by the way each of these points at rest.
// Every other bone keeps how it sat on its parent, as the trunk does, where the two only place their joints apart.
const REACH: Record<string, string> = {}
// A hand, and the three knuckles that give its frame: the middle one it runs to, and the two it lies across.
const PALM: Record<string, [string, string, string]> = {}
for (const [side, s] of [
  ["Left", "l"],
  ["Right", "r"],
]) {
  Object.assign(BONES, {
    [`${side}Shoulder`]: `clavicle_${s}`,
    [`${side}Arm`]: `upperarm_${s}`,
    [`${side}ForeArm`]: `lowerarm_${s}`,
    [`${side}Hand`]: `hand_${s}`,
    [`${side}UpLeg`]: `thigh_${s}`,
    [`${side}Leg`]: `calf_${s}`,
    [`${side}Foot`]: `foot_${s}`,
    [`${side}ToeBase`]: `ball_${s}`,
  })
  Object.assign(REACH, { [`${side}Arm`]: `${side}ForeArm`, [`${side}ForeArm`]: `${side}Hand`, [`${side}UpLeg`]: `${side}Leg`, [`${side}Leg`]: `${side}Foot` })
  for (const [finger, f] of [
    ["Thumb", "thumb"],
    ["Index", "index"],
    ["Middle", "middle"],
    ["Ring", "ring"],
    ["Pinky", "pinky"],
  ])
    for (const i of [1, 2, 3]) {
      BONES[`${side}Hand${finger}${i}`] = `${f}_0${i}_${s}`
      if (i < 3) REACH[`${side}Hand${finger}${i}`] = `${side}Hand${finger}${i + 1}`
    }
  PALM[`${side}Hand`] = [`${side}HandMiddle1`, `${side}HandIndex1`, `${side}HandPinky1`]
}
const FRAMES = 30
// How far a finger goes from how the figure's own was modelled toward how the library's is held. The library's
// mannequin walks and stands with its fists shut. Shut as tight on a generated hand, whose fingers are thicker and one
// skin with its palm, they sink into it and the hand is a stub (the owner, 2026-11-16: "stubby and a little garbled").
// Half way was still a fist. A fifth of the way is the hand as it was modelled, hung a little closed, with the
// library's own stir in it. A weapon's grip is not this: it is set on the hand that holds it.
const CURL = 0.2
const FINGER = /Hand(Thumb|Index|Middle|Ring|Pinky)\d$/

// A node's turn and place in the world at rest, its parents' above it.
function resting(node: Node): { turn: Quat; at: Vec } {
  const up = node.getParentNode()
  const above = up ? resting(up) : { turn: [0, 0, 0, 1] as Quat, at: [0, 0, 0] as Vec }
  const moved = qturn(above.turn, node.getTranslation())
  return { turn: qmul(above.turn, node.getRotation() as Quat), at: [above.at[0] + moved[0], above.at[1] + moved[1], above.at[2] + moved[2]] }
}

// What a clip has a node at, at a time: its keys read between, or the node's rest where the clip leaves it alone.
export function reader(clip: Animation) {
  const keys = new Map<Node, Record<string, { times: number[]; at: (i: number) => number[]; step: boolean }>>()
  for (const ch of clip.listChannels()) {
    const [node, sampler] = [ch.getTargetNode(), ch.getSampler()]
    const [input, output] = [sampler?.getInput(), sampler?.getOutput()]
    if (!node || !sampler || !input || !output) continue
    // A cubic key is three values, its own in the middle: the curve between is read as a straight line. Read by
    // element, since a file may keep its turns as whole numbers to be scaled (Mesh2Motion's are 16 bits).
    const cubic = sampler.getInterpolation() === "CUBICSPLINE"
    const of = keys.get(node) ?? {}
    of[ch.getTargetPath() ?? ""] = { times: Array.from(input.getArray() ?? []), at: (i) => output.getElement(cubic ? i * 3 + 1 : i, []), step: sampler.getInterpolation() === "STEP" }
    keys.set(node, of)
  }
  return (node: Node, path: "rotation" | "translation", time: number): number[] => {
    const k = keys.get(node)?.[path]
    if (!k?.times.length) return path === "rotation" ? node.getRotation() : node.getTranslation()
    let i = k.times.findIndex((t) => t > time)
    if (i === 0) return k.at(0)
    if (i < 0) return k.at(k.times.length - 1)
    i--
    const [a, b] = [k.at(i), k.at(i + 1)]
    const share = k.step ? 0 : (time - k.times[i]) / (k.times[i + 1] - k.times[i] || 1)
    return path === "rotation" ? qmix(a, b, share) : a.map((v, n) => v + (b[n] - v) * share)
  }
}

// A clip of a library, its first when none is named, or the part of it between two times in seconds.
export type Part = { library: Document; clip?: string; from?: number; to?: number }
type Take = { hips: Node; count: number; turns: Map<Node, Float32Array<ArrayBuffer>>; places: Float32Array<ArrayBuffer> }
// How long one part is eased into from the one before it, in frames.
const EASE = 3

// A part as the figure plays it, frame by frame: each bone's turn on its parent, and where the hips are. Null when
// the library has no such clip or the figure no such skeleton.
function take(figure: Document, { library, clip, from, to }: Part): Take | null {
  const source = library
    .getRoot()
    .listAnimations()
    .find((a) => !clip || a.getName() === clip)
  // The library's bones by name whatever their capitals: Quaternius has `Head` where Mesh2Motion has `head`.
  const bone = (doc: Document, name: string, prefixed: boolean) =>
    doc
      .getRoot()
      .listNodes()
      .find((n) => (prefixed ? new RegExp(`(^|:)${name}$`).test(n.getName()) : n.getName().toLowerCase() === name.toLowerCase()))
  const joints = figure.getRoot().listSkins()[0]?.listJoints() ?? []
  const pairs = new Map<Node, Node>()
  for (const [ours, theirs] of Object.entries(BONES)) {
    const [a, b] = [bone(figure, ours, true), bone(library, theirs, false)]
    if (a && b) pairs.set(a, b)
  }
  const [hips, pelvis] = [bone(figure, "Hips", true), bone(library, "pelvis", false)]
  if (!source || !hips || !pelvis || pairs.size < 20) return null

  // The figure's rest with its limbs pointed as the library's. A bone starts from the turn its parent was given, so it
  // keeps how it sat on it, and a limb's bone is then turned the least way further that lines it up. A hand is lined
  // up whole.
  const lined = new Map<Node, Quat>()
  const by = new Map<Node, Quat>()
  const span = (a: Node, b: Node) => {
    const [from, to] = [resting(a).at, resting(b).at]
    return [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
  }
  for (const joint of joints) {
    const name = joint.getName().replace(/^.*:/, "")
    const theirs = pairs.get(joint)
    const up = joint.getParentNode()
    let turn = (up && by.get(up)) || ([0, 0, 0, 1] as Quat)
    const palm = (PALM[name] ?? []).map((knuckle) => bone(figure, knuckle, true))
    const theirPalm = palm.map((knuckle) => knuckle && pairs.get(knuckle))
    const to = REACH[name] ? bone(figure, REACH[name], true) : null
    const theirTo = to ? pairs.get(to) : null
    if (theirs && palm.length === 3 && palm.every(Boolean) && theirPalm.every(Boolean)) {
      const [middle, index, pinky] = palm as Node[]
      const [theirMiddle, theirIndex, theirPinky] = theirPalm as Node[]
      turn = qmul(qframe(span(theirs, theirMiddle), span(theirPinky, theirIndex)), qinv(qframe(span(joint, middle), span(pinky, index))))
    } else if (to && theirs && theirTo) turn = qmul(qbetween(qturn(turn, span(joint, to)), span(theirs, theirTo)), turn)
    by.set(joint, turn)
    lined.set(joint, qmul(turn, resting(joint).turn))
  }

  const read = reader(source)
  const long = Math.max(...source.listSamplers().map((s) => s.getInput()?.getMax([0])[0] ?? 0))
  const [start, end] = [Math.min(long, from ?? 0), Math.min(long, to ?? long)]
  const count = Math.max(2, Math.ceil((end - start) * FRAMES) + 1)
  const times = Float32Array.from({ length: count }, (_, i) => Math.min(end, start + i / FRAMES))
  const turns = new Map(joints.filter((j) => pairs.has(j)).map((j) => [j, new Float32Array(count * 4)]))
  const places = new Float32Array(count * 3)
  // The library's bones at a time, each in the world: its parents' turns above its own.
  const posed = (time: number) => {
    const memo = new Map<Node, { turn: Quat; at: Vec }>()
    const of = (node: Node): { turn: Quat; at: Vec } => {
      const had = memo.get(node)
      if (had) return had
      const up = node.getParentNode()
      const above = up ? of(up) : { turn: [0, 0, 0, 1] as Quat, at: [0, 0, 0] as Vec }
      const moved = qturn(above.turn, read(node, "translation", time))
      const now = { turn: qmul(above.turn, read(node, "rotation", time) as Quat), at: [above.at[0] + moved[0], above.at[1] + moved[1], above.at[2] + moved[2]] as Vec }
      memo.set(node, now)
      return now
    }
    return of
  }
  const rest = new Map([...pairs.values()].map((theirs) => [theirs, resting(theirs)]))
  const [hipsRest, pelvisRest] = [hips.getTranslation(), resting(pelvis).at]
  const tall = resting(hips).at[1] / pelvisRest[1]
  const above = hips.getParentNode() ? resting(hips.getParentNode() as Node).turn : ([0, 0, 0, 1] as Quat)
  for (let i = 0; i < count; i++) {
    const theirs = posed(times[i])
    const world = new Map<Node, Quat>()
    for (const joint of joints) {
      const up = joint.getParentNode()
      const parent = (up && world.get(up)) || (up ? resting(up).turn : ([0, 0, 0, 1] as Quat))
      const pair = pairs.get(joint)
      const restOf = pair && rest.get(pair)
      // As far from its lined-up rest as the library's bone is from its own.
      const now = pair && restOf ? qall(theirs(pair).turn, qinv(restOf.turn), lined.get(joint) as Quat) : qmul(parent, joint.getRotation() as Quat)
      // A finger is eased back toward its own rest, and the bones below it follow what it was given.
      const local = qmul(qinv(parent), now)
      const eased = pair && FINGER.test(joint.getName()) ? qmix(joint.getRotation(), local, CURL) : local
      world.set(joint, eased === local ? now : qmul(parent, eased))
      turns.get(joint)?.set(eased, i * 4)
    }
    const at = theirs(pelvis).at
    const moved = qturn(qinv(above), [(at[0] - pelvisRest[0]) * tall, (at[1] - pelvisRest[1]) * tall, (at[2] - pelvisRest[2]) * tall])
    places.set([hipsRest[0] + moved[0], hipsRest[1] + moved[1], hipsRest[2] + moved[2]], i * 3)
  }

  return { hips, count, turns, places }
}

// The parts, one after another, added to the figure as one clip under the name it is to be played by. Each part
// after the first is eased into from where the one before it stopped: Mesh2Motion's bow is drawn in one clip and
// loosed in another, and the second is little more than where the arm is thrown to. Returns how long the clip is in
// seconds, or null when a part cannot be played.
export function retarget(figure: Document, parts: Part[], as: string): number | null {
  const takes = parts.map((part) => take(figure, part))
  if (!takes.length || takes.some((t) => !t)) return null
  const [first, ...rest] = takes as Take[]
  const count = first.count + rest.reduce((sum, t) => sum + t.count, 0)
  const times = Float32Array.from({ length: count }, (_, i) => i / FRAMES)
  const turns = new Map([...first.turns.keys()].map((joint) => [joint, new Float32Array(count * 4)]))
  const places = new Float32Array(count * 3)
  let at = 0
  for (const [n, part] of (takes as Take[]).entries()) {
    for (let i = 0; i < part.count; i++, at++) {
      // How much of this frame is the part's own, and how much where the last part stopped.
      const own = n && i < EASE ? (i + 1) / (EASE + 1) : 1
      for (const [joint, all] of turns) {
        const turn = part.turns.get(joint)?.subarray(i * 4, i * 4 + 4)
        if (turn) all.set(own < 1 ? qmix(all.subarray((at - i - 1) * 4, (at - i) * 4), turn, own) : turn, at * 4)
      }
      for (let k = 0; k < 3; k++) places[at * 3 + k] = own < 1 ? places[(at - i - 1) * 3 + k] * (1 - own) + part.places[i * 3 + k] * own : part.places[i * 3 + k]
    }
  }

  const buffer = figure.getRoot().listBuffers()[0] ?? figure.createBuffer()
  const input = figure.createAccessor().setType("SCALAR").setArray(times).setBuffer(buffer)
  const made = figure.createAnimation(as)
  const add = (node: Node, path: "rotation" | "translation", values: Float32Array<ArrayBuffer>) => {
    const sampler = figure
      .createAnimationSampler()
      .setInput(input)
      .setOutput(
        figure
          .createAccessor()
          .setType(path === "rotation" ? "VEC4" : "VEC3")
          .setArray(values)
          .setBuffer(buffer)
      )
    made.addSampler(sampler).addChannel(figure.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler))
  }
  for (const [joint, values] of turns) add(joint, "rotation", values)
  add(first.hips, "translation", places)
  return (count - 1) / FRAMES
}
