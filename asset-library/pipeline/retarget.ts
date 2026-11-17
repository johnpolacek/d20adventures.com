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

import type { Animation, Document, Node } from "@gltf-transform/core"
import { type Quat, qall, qbetween, qinv, qmix, qmul, qturn, type Vec } from "./quat"

// The library's bone for each of the figure's, by Mixamo's name without its prefix.
const BONES: Record<string, string> = { Hips: "pelvis", Spine: "spine_01", Spine1: "spine_02", Spine2: "spine_03", Neck: "neck_01", Head: "Head" }
// A limb's bone, and the bone it reaches to: the two skeletons are lined up by the way each of these points at rest.
// Every other bone keeps how it sat on its parent, as the trunk does, where the two only place their joints apart.
const REACH: Record<string, string> = {}
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
    for (const i of [1, 2, 3]) BONES[`${side}Hand${finger}${i}`] = `${f}_0${i}_${s}`
}
const FRAMES = 30

// A node's turn and place in the world at rest, its parents' above it.
function resting(node: Node): { turn: Quat; at: Vec } {
  const up = node.getParentNode()
  const above = up ? resting(up) : { turn: [0, 0, 0, 1] as Quat, at: [0, 0, 0] as Vec }
  const moved = qturn(above.turn, node.getTranslation())
  return { turn: qmul(above.turn, node.getRotation() as Quat), at: [above.at[0] + moved[0], above.at[1] + moved[1], above.at[2] + moved[2]] }
}

// What a clip has a node at, at a time: its keys read between, or the node's rest where the clip leaves it alone.
function reader(clip: Animation) {
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

// The clip of that name in the library, or its first when none is named, added to the figure under the name it is to
// be played by. Returns how long it is in seconds, or null when the library has no such clip or the figure no such
// skeleton.
export function retarget(figure: Document, library: Document, clip: string | undefined, as: string): number | null {
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

  // The figure's rest with its limbs pointed as the library's: each limb bone turned the least way that lines it up,
  // and every bone below it keeping how it sat on its parent.
  const lined = new Map<Node, Quat>()
  const by = new Map<Node, Quat>()
  for (const joint of joints) {
    const name = joint.getName().replace(/^.*:/, "")
    const [to, theirs] = [REACH[name] ? bone(figure, REACH[name], true) : null, pairs.get(joint)]
    const theirTo = to ? pairs.get(to) : null
    const up = joint.getParentNode()
    let turn = (up && by.get(up)) || ([0, 0, 0, 1] as Quat)
    if (to && theirs && theirTo) {
      const [a, b, c, d] = [resting(joint).at, resting(to).at, resting(theirs).at, resting(theirTo).at]
      turn = qbetween([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [d[0] - c[0], d[1] - c[1], d[2] - c[2]])
    }
    by.set(joint, turn)
    lined.set(joint, qmul(turn, resting(joint).turn))
  }

  const read = reader(source)
  const long = Math.max(...source.listSamplers().map((s) => s.getInput()?.getMax([0])[0] ?? 0))
  const count = Math.max(2, Math.ceil(long * FRAMES) + 1)
  const times = Float32Array.from({ length: count }, (_, i) => Math.min(long, i / FRAMES))
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
      world.set(joint, now)
      turns.get(joint)?.set(qmul(qinv(parent), now), i * 4)
    }
    const at = theirs(pelvis).at
    const moved = qturn(qinv(above), [(at[0] - pelvisRest[0]) * tall, (at[1] - pelvisRest[1]) * tall, (at[2] - pelvisRest[2]) * tall])
    places.set([hipsRest[0] + moved[0], hipsRest[1] + moved[1], hipsRest[2] + moved[2]], i * 3)
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
  add(hips, "translation", places)
  return long
}
