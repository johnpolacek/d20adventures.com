// A pilot of another way to make a figure: a model facing forward, rigged by Meshy to a Mixamo skeleton with fingers,
// and moved by Meshy's library of captured motions in place of the clips written in packages/stage/src/figures/clips.ts.
//
//   pnpm assets thalbern-pilot              the free steps of build.ts: the sheet, then it stops before the model
//   pnpm assets:pilot thalbern-pilot        says what the paid steps cost, and makes nothing
//   pnpm assets:pilot thalbern-pilot --pay  the model ($0.60), then the rig with its clips ($1.04)
//
// A brief with "maker": "rodin" (thalbern-rodin) is made another way again: Rodin Gen-2.5 from the sheet's front and
// back in an A-pose ($0.40), rigged by Hyper3D with its stock clips ($0.20). Run without --pay first: it lists the
// stock clips (free) and keeps the ones it picks in pilot-picks.json, to look over before paying.
//
// A brief with "body": "<id>" (thalbern-rodin-meshy) makes no model: it takes that figure's, and its sheet, and pays
// for Meshy's rig and clips alone ($1.04). Hyper3D's stock has no bow and no sword, and Meshy's library has both.
//
// What it answers, against the figures rig.py makes: whether a shoulder and an elbow keep their shape when an arm is
// raised and folded, whether a hand can close, and whether captured motion reads better than written turns.
//
// A brief with "face": "close", or one whose body has it, gets the sheet's face painted on, free: paint.py paints as
// rig.py does, onto the model as its rigger left it, and the textures go into lod0.glb. Before it, `pnpm assets <id>`
// paints the close head (it stops before build.ts's own model). `--redo=face` paints again.
//
// A brief with "borrowed" has clips from another skeleton's library copied onto the figure's own (retarget.ts), free:
// { "Q Swing": "ual1:Sword_Attack" } is the clip Sword_Attack of asset-library/moves/ual1.glb, played as Q Swing,
// and { "Q Dodge": "m2m/dodge-left" } the one clip of asset-library/moves/m2m/dodge-left.glb. Parts of clips can be
// played one after another, each cut by seconds: "m2m/bow-pull@0-1.5 > m2m/bow-release@0-0.6". The libraries are not
// kept in git:
//   ual1.glb, ual2.glb   Quaternius's Universal Animation Library 1 and 2, CC0: each pack's Unreal-Godot file
//                        without root motion (UAL1_Standard.glb, UAL2_Standard.glb)
//   m2m/                 Mesh2Motion's clips, CC0: static/assets/human/animations of its repository
//
// Writes, in asset-library/characters/<id>/:
//   pilot-model.json, pilot-rig.json   the generators' answers. With them there, nothing is paid for again.
//   pilot/                             what came back: the rigged model, and one model per clip
//   lod0.glb                           the rigged model with every clip in it, each by the name the game plays it by
//   figure.json                        for the library page: /dev/assets?id=<id>
//
// Each clip is made to play on the spot: the hips keep their height and lose their way across the ground, since the
// stage moves a cast member itself.

import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { type Accessor, type Document, type Node, NodeIO } from "@gltf-transform/core"
import { ALL_EXTENSIONS, EXTTextureWebP } from "@gltf-transform/extensions"
import sharp from "sharp"
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js"
import { dataUri, fal, fetchBuffer } from "../../lab/stage-art/gen"
import { facing } from "./facing"
import { type Quat, qall, qbetween, qinv, qmix, qmul, qturn, qup } from "./quat"
import { type Part, reader, retarget } from "./retarget"

const MODEL = { endpoint: "tripo3d/h3.1/image-to-3d", cost: 0.6 }
const RIG = { endpoint: "meshy/rigging/multi-animation", cost: 0.2, clip: 0.12 }
const BLENDER = process.env.BLENDER || "/Applications/Blender.app/Contents/MacOS/Blender"
// Meshy's library (https://docs.meshy.ai/en/api/animation-library), by the name the game plays each by. The walk
// comes with every rig, free.
const CLIPS: [string, number][] = [
  ["Idle", 0],
  ["Shoot", 224], // Archery Shot
  ["Swing", 219], // Right Hand Sword Slash
  ["Dodge", 158], // Roll Dodge
  ["Sidestep", 156], // Stand Dodge
  ["Hit", 178], // Hit Reaction
  ["Fall", 187], // Knock Down
]

const args = process.argv.slice(2)
const [id] = args.filter((a) => !a.startsWith("--"))
const pay = args.includes("--pay")
const dir = `asset-library/characters/${id}`
const say = (step: string, text: string) => console.log(`${id.padEnd(15)} ${step.padEnd(8)}${text}`)
const rigCost = RIG.cost + RIG.clip * CLIPS.length

type Remote = { url?: string } | null | undefined
type ModelAnswer = { model_urls?: { pbr_model?: Remote; glb?: Remote }; model_mesh?: Remote }
type RigAnswer = {
  rigged_character_glb?: Remote
  basic_animations?: { walking_glb?: Remote } | null
  animations?: { action_id: number; animation_glb?: Remote }[]
}

async function kept<T>(file: string) {
  return existsSync(file) ? (JSON.parse(await readFile(file, "utf8")) as T) : null
}

// The hips' way across the ground taken out of a clip, so it plays where the cast member stands: over the place the
// hips rest at. Not where the clip begins, which Meshy's Knock Down does a metre and a half behind the figure.
function inPlace(doc: Document, rest?: number[]) {
  for (const anim of doc.getRoot().listAnimations())
    for (const ch of anim.listChannels()) {
      if (ch.getTargetPath() !== "translation" || !/hips$/i.test(ch.getTargetNode()?.getName() ?? "")) continue
      const out = ch.getSampler()?.getOutput()
      const a = out?.getArray()
      if (!out || !a || out.getElementSize() !== 3) continue
      const [x0, , z0] = rest ?? ch.getTargetNode()?.getTranslation() ?? [a[0], 0, a[2]]
      for (let i = 0; i < a.length; i += 3) {
        a[i] = x0
        a[i + 2] = z0
      }
      out.setArray(a)
    }
}

// How much of a clip's stoop is taken out. The clips a figure stands and walks in lose one lean, the same all through.
// A clip that acts, and crouches and rises as it goes, loses a share of whatever lean each frame has.
const UPRIGHT: Record<string, [share: number, of: "whole" | "each"]> = { Idle: [0.85, "whole"], Walk: [0.85, "whole"], Swing: [0.55, "each"] }

// A clip's stoop taken out: Meshy's Idle tips the chest 30 degrees forward of how the figure was modelled and its Walk
// 13, and a chest in armour then reads as hollow (the owner, 2026-11-16: "the chest seems slightly concave or flat").
// The chest is turned back toward its attitude at rest by one turn for the whole clip, at the first joint of the
// spine, so the breathing and the stride stay. The head and the upper arms keep the way they pointed.
// Meshy's sword cut begins in a crouch with the chest 55 degrees over, arms hung wide (the owner: "this looks bad"):
// there a share of each frame's own lean is taken out, so the cut still winds up and comes down, from nearer upright.
function upright(doc: Document, name: string, share: number, of: "whole" | "each") {
  const anim = doc
    .getRoot()
    .listAnimations()
    .find((a) => a.getName() === name)
  const bone = (end: string) =>
    doc
      .getRoot()
      .listNodes()
      .find((n) => new RegExp(`(^|:)${end}$`).test(n.getName()))
  const turns = (end: string) => {
    const node = bone(end)
    const out = anim
      ?.listChannels()
      .find((ch) => ch.getTargetNode() === node && ch.getTargetPath() === "rotation")
      ?.getSampler()
      ?.getOutput()
    return node ? { rest: node.getRotation() as Quat, out, at: (i: number) => (out ? out.getElement(i, [0, 0, 0, 1]) : node.getRotation()) as Quat } : null
  }
  const [hips, spine, spine1, spine2, neck] = ["Hips", "Spine", "Spine1", "Spine2", "Neck"].map(turns)
  const arms = ["Left", "Right"].map((side) => [turns(`${side}Shoulder`), turns(`${side}Arm`)] as const)
  const frames = spine?.out?.getCount() ?? 0
  const moved = [neck, ...arms.map(([, arm]) => arm)]
  if (!hips || !spine?.out || !spine1 || !spine2 || !frames || moved.some((b) => b?.out?.getCount() !== frames) || [hips, spine1, spine2].some((b) => b.out && b.out.getCount() !== frames))
    return say("upright", `${name}: left as it came, its spine is not keyed frame for frame`)
  // The chest's turn in the hips, and where its up points, against the same at rest.
  const chest = (i: number) => qall(spine.at(i), spine1.at(i), spine2.at(i))
  const rest = qinv(qall(hips.rest, spine.rest, spine1.rest, spine2.rest))
  const mean = [0, 0, 0]
  for (let i = 0; i < frames; i++) {
    const up = qup(qall(hips.at(i), chest(i), rest))
    for (let k = 0; k < 3; k++) mean[k] += up[k] / frames
  }
  const tilt = Math.atan2(Math.hypot(mean[0], mean[2]), mean[1])
  if (of === "whole" && tilt * share < 0.035) return say("upright", `${name}: stands ${Math.round((tilt * 180) / Math.PI)}° off, left`)
  // About the level line square to the way an up leans, back by a share of the lean.
  const righting = (up: number[]): Quat => {
    const lean = Math.hypot(up[0], up[2])
    if (lean < 1e-6) return [0, 0, 0, 1]
    const half = (-Math.atan2(lean, up[1]) * share) / 2
    return [(up[2] / lean) * Math.sin(half), 0, (-up[0] / lean) * Math.sin(half), Math.cos(half)]
  }
  let most = 0
  for (let i = 0; i < frames; i++) {
    const [h, c] = [hips.at(i), chest(i)]
    const up = of === "each" ? qup(qall(h, c, rest)) : mean
    most = Math.max(most, Math.atan2(Math.hypot(up[0], up[2]), up[1]))
    const back = righting(up)
    // The turn back as each bone's parent has it.
    const undo = qall(qinv(c), qinv(h), qinv(back), h, c)
    neck?.out?.setElement(i, qmul(undo, neck.at(i)))
    for (const [shoulder, arm] of arms) if (shoulder && arm?.out) arm.out.setElement(i, qall(qinv(shoulder.at(i)), undo, shoulder.at(i), arm.at(i)))
    spine.out.setElement(i, qall(qinv(h), back, h, spine.at(i)))
  }
  say("upright", `${name}: stood ${Math.round((most * 180) / Math.PI)}° off${of === "each" ? " at most" : ""}, ${Math.round((most * share * 180) / Math.PI)}° taken out`)
}

// The top of a shoulder kept from going after the arm. A rigger shares the top of a shoulder between the collarbone
// and the upper arm by degrees, which suits skin. Over armour the least share pulls the cap of a pauldron out after
// the arm as a wing, and the quiver behind it (the owner, 2026-11-16: "the arms do weird things"). On top of each
// shoulder a quarter is taken off the arm's share and what is left spread over the rest: a point the arm barely
// pulled is let go, and no point is given a share far from its neighbour's. Under the arm the shares are left as
// they came.
// The first try made the share steep, all the collarbone's under 35% and all the arm's over 65%. The cap held, but
// the turn was taken in a narrow band, and measured (armcheck.ts) the skin there was crushed to an eighth in a walk
// and the upper arm stretched half as far again in every move.
function plates(doc: Document) {
  const skin = doc.getRoot().listSkins()[0]
  const joints = skin?.listJoints() ?? []
  let changed = 0
  for (const side of ["Left", "Right"]) {
    const arm = joints.findIndex((j) => new RegExp(`(^|:)${side}Arm$`).test(j.getName()))
    if (arm < 0) continue
    const at = joints[arm].getWorldMatrix().slice(12, 15)
    for (const mesh of doc.getRoot().listMeshes())
      for (const prim of mesh.listPrimitives()) {
        const [pos, J, W] = [prim.getAttribute("POSITION"), prim.getAttribute("JOINTS_0"), prim.getAttribute("WEIGHTS_0")]
        if (!pos || !J || !W) continue
        for (let i = 0; i < pos.getCount(); i++) {
          const [j, w] = [J.getElement(i, [0, 0, 0, 0]), W.getElement(i, [0, 0, 0, 0])]
          const slot = j.findIndex((b, k) => b === arm && w[k] > 0)
          const total = w[0] + w[1] + w[2] + w[3]
          if (slot < 0 || !total) continue
          const share = w[slot] / total
          if (share <= 0.02 || share >= 0.98) continue
          // From a hand's width under the joint and up: the top of the shoulder, and not the armpit. Taken lower, to
          // 16 cm under, the sleeve met the chest in a row of teeth when the arm went back.
          const top = Math.min(1, Math.max(0, (pos.getElement(i, [0, 0, 0])[1] - at[1] + 0.11) / 0.08))
          const steep = share + top * (Math.max(0, (share - PLATE) / (1 - PLATE)) - share)
          if (Math.abs(steep - share) < 1e-4) continue
          const rest = (1 - steep) / (1 - share)
          W.setElement(
            i,
            w.map((v, k) => (k === slot ? steep : (v / total) * rest))
          )
          changed++
        }
      }
  }
  return changed
}
// The share of the upper arm under which a point on top of a shoulder is the collarbone's alone.
const PLATE = 0.25

// The bones' shares about each shoulder spread over a wider band of skin. A rigger hands the skin from the trunk to
// the arm across a few centimetres, and when the arm is raised or thrown back all of that turn is taken there: the
// skin where arm meets trunk was stretched four and five times its length at rest. Each point within reach of a
// shoulder joint takes some of the mean of its neighbours' shares, most at the joint and none at the reach's edge,
// pass after pass, so the turn is shared out by more skin.
function spread(doc: Document, reach: number, passes: number) {
  const joints = doc.getRoot().listSkins()[0]?.listJoints() ?? []
  const centres = ["Left", "Right"]
    .map((side) =>
      joints
        .find((j) => new RegExp(`(^|:)${side}Arm$`).test(j.getName()))
        ?.getWorldMatrix()
        .slice(12, 15)
    )
    .filter((c) => !!c)
  let moved = 0
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const [pos, J, W, index] = [prim.getAttribute("POSITION"), prim.getAttribute("JOINTS_0"), prim.getAttribute("WEIGHTS_0"), prim.getIndices()]
      if (!pos || !J || !W || !centres.length) continue
      // Points at one position are one place: the mesh comes apart along its texture's edges, and the skin does not.
      const places = new Map<string, number>()
      const of: number[] = []
      const at: number[][] = []
      for (let i = 0; i < pos.getCount(); i++) {
        const p = pos.getElement(i, [0, 0, 0])
        const key = p.map((v) => v.toFixed(5)).join(",")
        if (!places.has(key)) {
          places.set(key, at.length)
          at.push(p)
        }
        of.push(places.get(key) as number)
      }
      const pull = at.map((p) => {
        const far = Math.min(...centres.map((c) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2])))
        const t = Math.max(0, 1 - far / reach)
        return t * t * (3 - 2 * t)
      })
      const beside = at.map(() => new Set<number>())
      const corners = index ? index.getCount() : pos.getCount()
      for (let t = 0; t < corners; t += 3) {
        const [a, b, c] = [0, 1, 2].map((k) => of[index ? index.getScalar(t + k) : t + k])
        if (!pull[a] && !pull[b] && !pull[c]) continue
        for (const [x, y] of [
          [a, b],
          [b, c],
          [c, a],
        ])
          if (x !== y) {
            beside[x].add(y)
            beside[y].add(x)
          }
      }
      let shares = at.map(() => new Map<number, number>())
      for (let i = 0; i < pos.getCount(); i++) {
        const [j, w] = [J.getElement(i, [0, 0, 0, 0]), W.getElement(i, [0, 0, 0, 0])]
        const mine = shares[of[i]]
        if (!mine.size) for (const [k, bone] of j.entries()) if (w[k] > 0) mine.set(bone, (mine.get(bone) ?? 0) + w[k])
      }
      for (let pass = 0; pass < passes; pass++)
        shares = shares.map((own, p) => {
          if (!pull[p] || !beside[p].size) return own
          const next = new Map<number, number>()
          const take = 0.5 * pull[p]
          for (const [bone, w] of own) next.set(bone, w * (1 - take))
          for (const q of beside[p]) for (const [bone, w] of shares[q]) next.set(bone, (next.get(bone) ?? 0) + (w * take) / beside[p].size)
          return next
        })
      for (let i = 0; i < pos.getCount(); i++) {
        if (!pull[of[i]]) continue
        // The four bones that pull hardest, their shares made to add to one.
        const top = [...shares[of[i]]].sort((a, b) => b[1] - a[1]).slice(0, 4)
        const total = top.reduce((sum, [, w]) => sum + w, 0) || 1
        J.setElement(
          i,
          [0, 1, 2, 3].map((k) => top[k]?.[0] ?? 0)
        )
        W.setElement(
          i,
          [0, 1, 2, 3].map((k) => (top[k]?.[1] ?? 0) / total)
        )
        moved++
      }
    }
  return moved
}

// How far from a shoulder joint the shares are spread, in metres, and how many times over. Measured on thalbern-rodin
// (armcheck.ts), this much crushes the skin less where arm meets trunk and stretches it no more: in the sword cut the
// worst of it was crushed to an eighth and is now crushed to a fifth. Wider and more (0.2 m and 16, 0.24 m and 32)
// stretched it further, to 6.7 times from 4.6. No setting stretched it less: that is the one skin, not the shares.
const SPREAD = { reach: 0.16, passes: 8 }

// A bow shot drawn to the jaw. A shot copied from another skeleton can end with the string hand out at the chest and
// well to the side, the arrow lying across the body: here the hand that draws is brought in under the jaw and the
// hand that holds the bow up level with it, so the arrow runs from the face to the mark. Each hand is moved by one
// fixed step, none of it before the hands begin to part and all of it at the full draw (`until`, in seconds) and
// after, so the shot keeps its shape and its loose. Each arm is then bent to reach: its elbow stays on the side it
// was, and the drawing arm's is set a little under the arrow and behind it. Measures are in centimetres of the
// figure's height.
//
// The drawing arm is set from its elbow. The elbow goes straight back from the shoulder, away from the mark, and so
// far under the arrow that the arm is raised no more than the skin bears (armcheck.ts: 105 degrees). The hand is then
// where the forearm reaches the arrow's line beside the face: on a figure with short arms that is under the ear and
// not at the chin, with the elbow bent as far as it goes.
//
// What is set beside the face is the knuckle the string and the arrow's nock are drawn from (hold.ts), not the wrist:
// the knuckle lies some 7 cm inside the wrist of a hand drawn up like this, and an arrow set by the wrist ran
// through the cheek.
const DRAW = { bowUnder: 3, side: 9.5, under: 0, elbowUnder: 12, elbowOut: 2, elbowMost: 150 }
function draw(doc: Document, name: string, until: number, tall: number, bow: "Left" | "Right" = "Left") {
  const clip = doc
    .getRoot()
    .listAnimations()
    .find((a) => a.getName() === name)
  const joints = doc.getRoot().listSkins()[0]?.listJoints() ?? []
  const find = (bone: string) => joints.find((j) => new RegExp(`(^|:)${bone}$`).test(j.getName()))
  const y = doc
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .map((p) => p.getAttribute("POSITION"))
    .find((p) => !!p)
  const head = find("Head")
  if (!clip || !head || !y) return null
  const cm = (y.getMax([0, 0, 0])[1] - y.getMin([0, 0, 0])[1]) / (tall * 100)
  const read = reader(clip)
  type V = number[]
  const add = (a: V, b: V, by = 1) => a.map((v, k) => v + b[k] * by)
  const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const unit = (a: V) => a.map((v) => v / (Math.hypot(...a) || 1))
  const posed = (node: Node | null, time: number): { q: Quat; p: V } => {
    if (!node) return { q: [0, 0, 0, 1], p: [0, 0, 0] }
    const up = posed(node.getParentNode(), time)
    const wide = node.getParentNode()?.getWorldScale() ?? [1, 1, 1]
    const moved = qturn(
      up.q,
      (read(node, "translation", time) as V).map((v, k) => v * wide[k])
    )
    return { q: qmul(up.q, read(node, "rotation", time) as Quat), p: add(up.p, moved) }
  }
  const sides = [bow, bow === "Left" ? "Right" : "Left"].map((side) => {
    const [arm, fore, hand] = [find(`${side}Arm`), find(`${side}ForeArm`), find(`${side}Hand`)]
    const keys = (node?: Node) =>
      clip
        .listChannels()
        .find((c) => c.getTargetNode() === node && c.getTargetPath() === "rotation")
        ?.getSampler()
    return { arm, fore, hand, armKeys: keys(arm), foreKeys: keys(fore) }
  })
  const input = sides[0].armKeys?.getInput()
  if (!input || sides.some((s) => !s.arm || !s.fore || !s.hand || !s.armKeys?.getOutput() || !s.foreKeys?.getOutput())) return null
  // Every frame as the clip has it, read before any of it is changed.
  const frames = Array.from({ length: input.getCount() }, (_, i) => {
    const time = input.getScalar(i)
    return {
      time,
      head: posed(head, time).p,
      arms: sides.map((s) => ({ above: posed(s.arm?.getParentNode() ?? null, time).q, at: [s.arm, s.fore, s.hand].map((n) => posed(n as Node, time).p) })),
    }
  })
  const apart = frames.map((f) => Math.hypot(...add(f.arms[0].at[2], f.arms[1].at[2], -1)))
  const full = frames.reduce((last, f, i) => (f.time <= until ? i : last), 0)
  const least = apart.slice(0, full + 1).indexOf(Math.min(...apart.slice(0, full + 1)))
  const share = frames.map((_, i) => {
    if (i <= least) return 0
    if (i >= full) return 1
    const t = Math.max(0, Math.min(1, (apart[i] - apart[least]) / (apart[full] - apart[least] || 1)))
    return t * t * (3 - 2 * t)
  })
  // Where the hands should be at the full draw: the mark is where the bow hand is from the head, flat on the ground.
  const at = frames[full]
  const aim = unit([at.arms[0].at[2][0] - at.head[0], 0, at.arms[0].at[2][2] - at.head[2]])
  const side = [aim[2], 0, -aim[0]].map((v) => v * (bow === "Left" ? -1 : 1))
  const bowTo = [at.arms[0].at[2][0], at.head[1] - DRAW.bowUnder * cm, at.arms[0].at[2][2]]
  const [from, elbowWas, wristWas] = at.arms[1].at
  const [upper, lower] = [Math.hypot(...add(elbowWas, from, -1)), Math.hypot(...add(wristWas, elbowWas, -1)) * 0.995]
  const level = at.head[1] - DRAW.under * cm
  const [rise, out] = [level - DRAW.elbowUnder * cm - from[1], DRAW.elbowOut * cm]
  const elbowTo = add(add(add(from, side, out), [0, 1, 0], rise), aim, -Math.sqrt(Math.max(0, upper * upper - rise * rise - out * out)))
  const beside = add(at.head, side, DRAW.side * cm)
  beside[1] = level
  // The wrist, for the knuckle to lie on the arrow's line beside the face: `knuckle` is how far the knuckle is from
  // the wrist, found by bending the arm and looking, a few times over.
  let knuckle: V = [0, 0, 0]
  const wristTo = () => {
    const line = add(beside, knuckle, -1)
    const gap = add(line, elbowTo, -1)
    return add(line, aim, -dot(gap, aim) + Math.sqrt(Math.max(0, dot(gap, aim) ** 2 - (dot(gap, gap) - lower * lower))))
  }
  const steps = [add(bowTo, at.arms[0].at[2], -1), add(wristTo(), wristWas, -1)]
  // Each arm bent to reach at the full draw, and the turn that takes it there kept: a share of that turn is given to
  // every frame. Bending each frame to reach on its own swings the elbow over the shoulder as the hand passes it.
  const bend = (n: number): [Quat, Quat] => {
    const [root, elbow, wrist] = at.arms[n].at
    const [l1, l2] = [Math.hypot(...add(elbow, root, -1)), Math.hypot(...add(wrist, elbow, -1))]
    const want = add(wrist, steps[n])
    const reach = Math.max(Math.abs(l1 - l2) + 1e-4, Math.min((l1 + l2) * 0.985, Math.hypot(...add(want, root, -1))))
    const toward = unit(add(want, root, -1))
    const to = add(root, toward, reach)
    // The elbow: on the circle both bones allow, to the side its hint lies.
    const reachOut = add(n === 1 ? elbowTo : elbow, root, -1)
    const off = unit(add(reachOut, toward, -dot(reachOut, toward)))
    const along = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach)
    const bent = add(add(root, toward, along), off, Math.sqrt(Math.max(0, l1 * l1 - along * along)))
    // The upper arm's turn as the world has it, and the forearm's as the upper arm has it: the elbow then bends
    // steadily further, and never back through itself.
    const [armOut, foreOut] = [sides[n].armKeys?.getOutput(), sides[n].foreKeys?.getOutput()]
    const armTurn = qbetween(unit(add(elbow, root, -1)), unit(add(bent, root, -1)))
    if (!armOut || !foreOut) return [armTurn, [0, 0, 0, 1] as Quat]
    const armWas = qmul(at.arms[n].above, armOut.getElement(full, [0, 0, 0, 1]) as Quat)
    const foreOwn = foreOut.getElement(full, [0, 0, 0, 1]) as Quat
    const foreNow = qmul(qbetween(unit(add(wrist, elbow, -1)), unit(add(to, bent, -1))), qmul(armWas, foreOwn))
    return [armTurn, qmul(qmul(qinv(qmul(armTurn, armWas)), foreNow), qinv(foreOwn))]
  }
  const [hand, first] = [sides[1].hand, find(`${bow === "Left" ? "Right" : "Left"}HandMiddle1`)]
  const [armKeys, foreKeys] = [sides[1].armKeys?.getOutput(), sides[1].foreKeys?.getOutput()]
  if (hand && first && armKeys && foreKeys) {
    const wide = hand.getWorldScale()
    const reach = first.getTranslation().map((v, k) => v * wide[k])
    const own = [armKeys, foreKeys].map((keys) => keys.getElement(full, [0, 0, 0, 1]) as Quat)
    for (let pass = 0; pass < 6; pass++) {
      const [armTurn, foreTurn] = bend(1)
      const arm = qmul(armTurn, qmul(at.arms[1].above, own[0]))
      knuckle = qturn(qall(arm, foreTurn, own[1], read(hand, "rotation", at.time) as Quat), reach)
      steps[1] = add(wristTo(), wristWas, -1)
    }
  }
  const turns = sides.map((_, n) => bend(n))
  const still: Quat = [0, 0, 0, 1]
  for (const [i, frame] of frames.entries()) {
    if (!share[i]) continue
    for (const [n, s] of sides.entries()) {
      const [armOut, foreOut] = [s.armKeys?.getOutput(), s.foreKeys?.getOutput()]
      if (!armOut || !foreOut) continue
      const armWas = qmul(frame.arms[n].above, armOut.getElement(i, [0, 0, 0, 1]) as Quat)
      const armNow = qmul(qmix(still, turns[n][0], share[i]), armWas)
      armOut.setElement(i, qmul(qinv(frame.arms[n].above), armNow))
      // The elbow bent no further than the skin bears: the clip's own bend and the draw's together can fold it shut.
      const [upperLine, foreLine] = [unit(s.fore?.getTranslation() ?? [0, 1, 0]), unit(s.hand?.getTranslation() ?? [0, 1, 0])]
      const own = qmul(qmix(still, turns[n][1], share[i]), foreOut.getElement(i, [0, 0, 0, 1]) as Quat)
      const line = qturn(own, foreLine)
      const most = (DRAW.elbowMost * Math.PI) / 180
      const bend = Math.acos(Math.max(-1, Math.min(1, dot(upperLine, line))))
      const across = unit(add(line, upperLine, -dot(line, upperLine)))
      const kept =
        bend > most
          ? qmul(
              qbetween(
                line,
                add(
                  upperLine.map((v) => v * Math.cos(most)),
                  across,
                  Math.sin(most)
                )
              ),
              own
            )
          : own
      foreOut.setElement(i, kept)
    }
  }
  return steps.map((step) => Math.hypot(...step) / cm)
}

// An arm kept from being raised past a limit in a clip, in degrees up from hanging as the chest has it. The limit is
// come to gently: from twenty degrees under it the arm gives up more and more of its lift and never passes it, so a
// cut still rises and falls and has no flat top. The forearm and hand keep their own turns and come down with it.
// The skin of a shoulder made in one piece with its plates is at its worst with the arm out level or higher.
function ease(doc: Document, name: string, limit: number) {
  const clip = doc
    .getRoot()
    .listAnimations()
    .find((a) => a.getName() === name)
  const joints = doc.getRoot().listSkins()[0]?.listJoints() ?? []
  const find = (bone: string) => joints.find((j) => new RegExp(`(^|:)${bone}$`).test(j.getName()))
  const chest = find("Spine2")
  if (!clip || !chest) return null
  const read = reader(clip)
  // A bone's turn in the world at a moment: its own on its parent's, to the top.
  const turned = (node: Node | null, time: number): Quat => {
    if (!node) return [0, 0, 0, 1]
    const up = node.getParentNode()
    const own = read(node, "rotation", time) as Quat
    return up ? qmul(turned(up, time), own) : own
  }
  const chestRest = chest.getWorldRotation() as Quat
  const knee = limit - 20
  let most = 0
  for (const side of ["Left", "Right"]) {
    const [arm, fore] = [find(`${side}Arm`), find(`${side}ForeArm`)]
    const sampler = clip
      .listChannels()
      .find((c) => c.getTargetNode() === arm && c.getTargetPath() === "rotation")
      ?.getSampler()
    const [input, output] = [sampler?.getInput(), sampler?.getOutput()]
    if (!arm || !fore || !input || !output) continue
    for (let i = 0; i < output.getCount(); i++) {
      const time = input.getScalar(i)
      const above = turned(arm.getParentNode(), time)
      const own = output.getElement(i, [0, 0, 0, 1]) as Quat
      const along = qturn(qmul(above, own), fore.getTranslation())
      const long = Math.hypot(...along) || 1
      const u = along.map((v) => v / long)
      const down = qturn(qmul(turned(chest, time), qinv(chestRest)), [0, -1, 0])
      const cos = Math.max(-1, Math.min(1, u[0] * down[0] + u[1] * down[1] + u[2] * down[2]))
      const raised = (Math.acos(cos) * 180) / Math.PI
      most = Math.max(most, raised)
      if (raised <= knee) continue
      const to = knee + (limit - knee) * (1 - Math.exp(-(raised - knee) / (limit - knee)))
      // The arm's line turned toward the chest's down by what it gives up.
      const across = [0, 1, 2].map((k) => down[k] - cos * u[k])
      const wide = Math.hypot(...across) || 1
      const by = ((raised - to) * Math.PI) / 180
      const lowered = [0, 1, 2].map((k) => u[k] * Math.cos(by) + (across[k] / wide) * Math.sin(by))
      output.setElement(i, qall(qinv(above), qbetween(u, lowered), above, own))
    }
  }
  return most
}

// Each shoulder joint moved up by so many centimetres of the figure's height, down if less than none, with the skin
// bound as it was and the elbow left where it is: to measure whether a rigger set the joint too high or too low
// (`--shoulder=-3`).
function lift(doc: Document, cm: number, tall: number) {
  const skin = doc.getRoot().listSkins()[0]
  const bind = skin?.getInverseBindMatrices()
  const y = doc
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .map((p) => p.getAttribute("POSITION"))
    .find((p) => !!p)
  if (!skin || !bind || !y) return
  const by = (cm / 100 / tall) * (y.getMax([0, 0, 0])[1] - y.getMin([0, 0, 0])[1])
  const joints = skin.listJoints()
  for (const side of ["Left", "Right"]) {
    const arm = joints.findIndex((j) => new RegExp(`(^|:)${side}Arm$`).test(j.getName()))
    const node = joints[arm]
    const up = node?.getParentNode()
    if (!node || !up) continue
    const [above, own] = [up.getWorldRotation() as Quat, node.getWorldRotation() as Quat]
    const [wide, mine] = [up.getWorldScale(), node.getWorldScale()]
    const there = qturn(qinv(above), [0, by, 0])
    node.setTranslation(node.getTranslation().map((v, k) => v + there[k] / wide[k]) as [number, number, number])
    const back = qturn(qinv(own), [0, by, 0])
    for (const child of node.listChildren()) child.setTranslation(child.getTranslation().map((v, k) => v - back[k] / mine[k]) as [number, number, number])
    const m = bind.getElement(arm, new Array(16).fill(0))
    for (let r = 0; r < 3; r++) m[12 + r] -= m[4 + r] * by
    bind.setElement(arm, m)
  }
}

// A bone at each shoulder that turns part of the way the arm does, and the skin between arm and trunk hung on it.
// Skin shared between two bones is put a share of the way between where each would carry it, along a straight line:
// with the arm turned far from the trunk that line cuts inside the shoulder, and the shoulder caves in. With a bone
// between, each share spans half the turn and the line cuts half as deep. The bone is the arm's own at rest, a child
// of the collarbone as the arm is, so nothing moves until a clip plays, and every clip is given its keys: no player
// has to know of it. What the arm holds at the shoulder becomes the half bone's, wholly at the joint and less with
// every step down the arm, so a plate over the shoulder rides half the arm's turn and the sleeve under it the whole.
//
// Measured on thalbern-rodin (armcheck.ts, the same edges before and after): the skin where arm meets trunk is crushed
// half as far, to 2.8 times from 5.3 in the sword cut and to 3.7 from 7.0 in the bow shot, and stretched a little
// less, 3.9 times from 4.6. It is not stretched much less at any setting tried, shares of 0.35 to 0.65 and reaches of
// 0.35 to 1.3: the worst of it is three edges in the armpit, where the arm hangs against the ribs at rest.
const HALF = 0.5
// How far down the upper arm the half bone's hold reaches, as a share of the arm's length: to the elbow.
const CAP = 1
function helpers(doc: Document) {
  const skin = doc.getRoot().listSkins()[0]
  const bind = skin?.getInverseBindMatrices()
  if (!skin || !bind) return 0
  const joints = skin.listJoints()
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer()
  const binds = [...(bind.getArray() ?? [])]
  const made: { arm: number; half: number; chain: Set<number>; from: number[]; along: number[]; long: number }[] = []
  for (const side of ["Left", "Right"]) {
    const arm = joints.findIndex((j) => new RegExp(`(^|:)${side}Arm$`).test(j.getName()))
    const node = joints[arm]
    const up = node?.getParentNode()
    if (!node || !up) continue
    const half = doc.createNode(`${node.getName()}Half`).setTranslation(node.getTranslation()).setRotation(node.getRotation()).setScale(node.getScale())
    up.addChild(half)
    skin.addJoint(half)
    binds.push(...binds.slice(arm * 16, arm * 16 + 16))
    const chain = new Set<number>()
    node.traverse((n) => {
      if (joints.includes(n)) chain.add(joints.indexOf(n))
    })
    const [from, to] = [
      node.getWorldMatrix().slice(12, 15),
      joints
        .find((j) => new RegExp(`(^|:)${side}ForeArm$`).test(j.getName()))
        ?.getWorldMatrix()
        .slice(12, 15) ?? [0, 0, 0],
    ]
    const along = [0, 1, 2].map((k) => to[k] - from[k])
    made.push({ arm, half: joints.length + made.length, chain, from, along, long: Math.hypot(...along) ** 2 })
    const rest = node.getRotation()
    for (const anim of doc.getRoot().listAnimations()) {
      const sampler = anim
        .listChannels()
        .find((c) => c.getTargetNode() === node && c.getTargetPath() === "rotation")
        ?.getSampler()
      const [input, output] = [sampler?.getInput(), sampler?.getOutput()]
      if (!sampler || !input || !output) continue
      if (sampler.getInterpolation() === "CUBICSPLINE") throw new Error(`${anim.getName()}: a helper bone's keys are made from plain keys, and these are splines`)
      const values = new Float32Array(output.getCount() * 4)
      for (let i = 0; i < output.getCount(); i++) values.set(qmix(rest, output.getElement(i, [0, 0, 0, 0]), HALF), i * 4)
      const keys = doc.createAnimationSampler().setInput(input).setOutput(doc.createAccessor().setType("VEC4").setArray(values).setBuffer(buffer)).setInterpolation(sampler.getInterpolation())
      anim.addSampler(keys).addChannel(doc.createAnimationChannel().setTargetNode(half).setTargetPath("rotation").setSampler(keys))
    }
  }
  bind.setArray(new Float32Array(binds))
  let moved = 0
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const [pos, J, W] = [prim.getAttribute("POSITION"), prim.getAttribute("JOINTS_0"), prim.getAttribute("WEIGHTS_0")]
      if (!pos || !J || !W) continue
      for (let i = 0; i < J.getCount(); i++) {
        const [p, j, w] = [pos.getElement(i, [0, 0, 0]), J.getElement(i, [0, 0, 0, 0]), W.getElement(i, [0, 0, 0, 0])]
        const shares = new Map<number, number>()
        for (const [k, bone] of j.entries()) if (w[k] > 0) shares.set(bone, (shares.get(bone) ?? 0) + w[k])
        let changed = false
        for (const { arm, half, from, along, long } of made) {
          const a = shares.get(arm) ?? 0
          if (!a) continue
          // How far down the upper arm the point lies: 0 at the shoulder, 1 at the elbow.
          const down = (along[0] * (p[0] - from[0]) + along[1] * (p[1] - from[1]) + along[2] * (p[2] - from[2])) / long
          const t = Math.max(0, Math.min(1, down / CAP))
          const given = a * (1 - t * t * (3 - 2 * t))
          if (given < 1e-4) continue
          shares.set(half, given)
          shares.set(arm, a - given)
          changed = true
        }
        if (!changed) continue
        const top = [...shares].sort((x, y) => y[1] - x[1]).slice(0, 4)
        const total = top.reduce((sum, [, share]) => sum + share, 0) || 1
        J.setElement(
          i,
          [0, 1, 2, 3].map((k) => top[k]?.[0] ?? 0)
        )
        W.setElement(
          i,
          [0, 1, 2, 3].map((k) => (top[k]?.[1] ?? 0) / total)
        )
        moved++
      }
    }
  return moved
}

// One normal for every place on the mesh. Rodin's comes apart along every edge of its texture layout with a normal to
// each side, a median of 63 degrees apart, and is lit as flat shards: an ear, a nose and hair cut from card. rig.py
// welds its own models for the same reason.
function smooth(doc: Document) {
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const [pos, nor] = [prim.getAttribute("POSITION"), prim.getAttribute("NORMAL")]
      if (!pos || !nor) continue
      const sums = new Map<string, [number, number, number]>()
      const keys: string[] = []
      const [p, n] = [
        [0, 0, 0],
        [0, 0, 0],
      ]
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, p)
        nor.getElement(i, n)
        const key = p.map((v) => v.toFixed(5)).join(",")
        keys.push(key)
        const sum = sums.get(key) ?? [0, 0, 0]
        sums.set(key, [sum[0] + n[0], sum[1] + n[1], sum[2] + n[2]])
      }
      for (let i = 0; i < keys.length; i++) {
        const [x, y, z] = sums.get(keys[i]) ?? [0, 0, 0]
        const long = Math.hypot(x, y, z)
        if (long > 1e-6) nor.setElement(i, [x / long, y / long, z / long])
      }
    }
}

// A brief's borrowed clips copied onto the figure (retarget.ts). Returns the names of those that could be played.
async function borrow(base: Document, borrowed: Record<string, string> = {}) {
  const made: string[] = []
  const libraries = new Map<string, Document>()
  // Mesh2Motion packs its clips with meshopt.
  await MeshoptDecoder.ready
  const library = async (name: string) => {
    const file = `asset-library/moves/${name}.glb`
    if (!libraries.has(name) && existsSync(file)) libraries.set(name, await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder }).read(file))
    return libraries.get(name)
  }
  for (const [name, from] of Object.entries(borrowed)) {
    // "ual1:Sword_Attack", "m2m/bow-pull", and parts of clips one after another: "m2m/bow-pull@0-1.5 > m2m/bow-release".
    const parts = await Promise.all(
      from.split(">").map(async (part) => {
        const [spec, cut] = part.trim().split("@")
        const [file, clip] = spec.split(":")
        const [start, end] = (cut ?? "").split("-").map(Number)
        return { library: await library(file), clip, from: cut ? start : undefined, to: cut ? end : undefined }
      })
    )
    const long = parts.every((part) => part.library) ? retarget(base, parts as Part[], name) : null
    if (long === null) say("borrow", `${name}: ${from} cannot be played. Its file is not under asset-library/moves, or it has no such clip`)
    else made.push(name)
  }
  return made
}

// The rigged model, with the clip of each clip file copied in under its name. Channels are matched to the model's
// bones by name: every file is the same rig.
async function merge(rigged: string, clips: [string, string][], to: string, borrowed: Record<string, string> = {}) {
  // Every extension a generator may write: textures in WebP, transforms, materials.
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const base = await io.read(rigged)
  const buffer = base.getRoot().listBuffers()[0] ?? base.createBuffer()
  for (const a of base.getRoot().listAnimations()) a.dispose()
  const nodes = new Map(
    base
      .getRoot()
      .listNodes()
      .map((n) => [n.getName(), n])
  )
  const copy = (from: Accessor) =>
    base
      .createAccessor()
      .setType(from.getType())
      .setArray(from.getArray()?.slice() ?? null)
      .setBuffer(buffer)
  const made: string[] = []
  for (const [name, file] of clips) {
    const doc = await io.read(file)
    inPlace(doc, [...nodes.entries()].find(([bone]) => /hips$/i.test(bone))?.[1].getTranslation())
    const source = doc.getRoot().listAnimations()[0]
    if (!source) {
      say("merge", `${name}: no clip in ${file}`)
      continue
    }
    const anim = base.createAnimation(name)
    let missed = 0
    for (const ch of source.listChannels()) {
      const target = nodes.get(ch.getTargetNode()?.getName() ?? "")
      const s = ch.getSampler()
      const [input, output] = [s?.getInput(), s?.getOutput()]
      if (!target || !s || !input || !output) {
        missed++
        continue
      }
      const sampler = base.createAnimationSampler().setInput(copy(input)).setOutput(copy(output)).setInterpolation(s.getInterpolation())
      anim.addSampler(sampler).addChannel(
        base
          .createAnimationChannel()
          .setTargetNode(target)
          .setTargetPath(ch.getTargetPath() as "translation" | "rotation" | "scale" | "weights")
          .setSampler(sampler)
      )
    }
    if (missed) say("merge", `${name}: ${missed} channels had no bone of that name, left out`)
    made.push(name)
  }
  smooth(base)
  say("plates", `${plates(base)} points on top of the shoulders given to one bone or the other`)
  for (const [name, [share, of]] of Object.entries(UPRIGHT)) if (made.includes(name)) upright(base, name, share, of)
  made.push(...(await borrow(base, borrowed)))
  await io.write(to, base)
  return made
}

interface Brief {
  name: string
  role: string
  cast: string[]
  height: number
  party?: boolean
  who: string
  // Who makes it: Tripo then Meshy (the default), or Rodin then Hyper3D's rigging.
  maker?: "rodin"
  // A figure whose model and sheet this one takes in place of its own. Meshy's rig and clips alone are paid for.
  body?: string
  // Clips copied from another skeleton's library, each by the name it is played by: "ual1:Sword_Attack".
  borrowed?: Record<string, string>
  // How Hyper3D shares the skin among its bones: "core" unless said.
  skinning?: "core" | "shell"
  // The bow shots drawn to the jaw, and when each is at its full draw, in seconds: { "Shoot": { "until": 1.5 } }.
  drawn?: Record<string, { until: number }>
  // The most an arm is raised in a clip, in degrees up from hanging: { "Swing": 85 }.
  eased?: Record<string, number>
  // False to leave out the bones between arm and trunk, for a figure kept to measure against.
  helpers?: boolean
}

// Where a figure's sheet and model are: its own folder, or the folder of the figure it takes them from.
const home = (brief: Brief) => (brief.body ? `asset-library/characters/${brief.body}` : dir)

// What came back, fetched again from the kept answers at no charge.
async function fetched(remote: Remote, name: string) {
  await mkdir(`${dir}/pilot`, { recursive: true })
  const file = `${dir}/pilot/${name}.glb`
  if (!existsSync(file) && remote?.url) await writeFile(file, await fetchBuffer(remote.url))
  return existsSync(file) ? file : null
}

// A step run outside, Blender or Python: what its line beginning with the tag reports.
function report<T>(command: string, argv: string[], tag: string) {
  const out = execFileSync(command, argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 })
  const line = out.split("\n").findLast((l) => l.startsWith(`${tag} `))
  return line ? (JSON.parse(line.slice(tag.length + 1)) as T) : null
}

// The sheet's face on the model, when the sheet's brief asks for one and face.py has made the close head: painted,
// fitted to the model's own face as that painting drew it out, and painted again, as build.ts does with rig.py. The
// textures then go into lod0.glb in place of the generator's. Returns what was painted.
async function face(brief: Brief, rest: string) {
  const from = home(brief)
  if ((await kept<{ face?: string }>(`${from}/character.json`))?.face !== "close" || !existsSync(`${from}/apose-face.png`)) return null
  const out = `${dir}/pilot/paint`
  type Painted = { faceFromSheet?: { texels: number; fitted: boolean } | null }
  let painted = await kept<Painted>(`${out}/paint.json`)
  if (!painted || args.some((a) => a.startsWith("--redo=") && a.includes("face"))) {
    const paint = () => report<Painted>(BLENDER, ["-b", "-P", "asset-library/pipeline/paint.py", "--", rest, from, out], "PAINT")
    painted = paint()
    const fit = report<{ fitted?: boolean }>(
      "uv",
      ["run", "--quiet", "--python", "3.12", "--with", "mediapipe==0.10.14", "--with", "numpy", "asset-library/pipeline/face.py", "fit", from, "--eyes=painted"],
      "FACE"
    )
    if (fit?.fitted) painted = paint()
    if (!painted?.faceFromSheet) return null
    await writeFile(`${out}/paint.json`, `${JSON.stringify(painted, null, 2)}\n`)
  }
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const doc = await io.read(`${dir}/lod0.glb`)
  doc.createExtension(EXTTextureWebP).setRequired(true)
  for (const m of doc.getRoot().listMaterials())
    for (const [kind, texture] of [
      ["colour", m.getBaseColorTexture()],
      ["normal", m.getNormalTexture()],
      ["rough", m.getMetallicRoughnessTexture()],
    ] as const)
      if (texture && existsSync(`${out}/${kind}.png`)) texture.setImage(await sharp(`${out}/${kind}.png`).webp({ quality: 92 }).toBuffer()).setMimeType("image/webp")
  await io.write(`${dir}/lod0.glb`, doc)
  return painted.faceFromSheet
}

// Tripo's model turned to face as the sheet does, or another figure's model, rigged by Meshy to a Mixamo skeleton
// with fingers, with clips from Meshy's library merged into it. Returns the clips it has.
async function tripoMeshy(brief: Brief) {
  const from = home(brief)
  let model = await kept<ModelAnswer>(`${from}/pilot-model.json`)
  let rig = await kept<RigAnswer>(`${dir}/pilot-rig.json`)
  if (brief.body && !model) throw new Error(`No model in ${from}/pilot-model.json: make ${brief.body} first`)
  // Who made the model, and for how much: this run, or the run that made the figure it is taken from.
  const body = brief.body ? ((await kept<Brief>(`${from}/character.json`)) ?? brief) : brief
  const maker = body.maker === "rodin" ? { name: "Rodin Gen-2.5 on fal", cost: RODIN.cost } : { name: "Tripo H3.1 on fal", cost: MODEL.cost }
  const owed = (model ? 0 : MODEL.cost) + (rig ? 0 : rigCost)
  if (owed > 0 && !pay) {
    const had = model ? `the model kept${brief.body ? ` from ${brief.body}` : ""}` : `the model $${MODEL.cost.toFixed(2)}`
    say("cost", `$${owed.toFixed(2)} to make: ${had}, the rig and ${CLIPS.length} clips $${rigCost.toFixed(2)}. Run again with --pay`)
    return null
  }
  if (!model) {
    // Turned to face as the sheet does, so the rigger finds the figure facing forward.
    model = await fal<ModelAnswer>(`pilot model ${id}`, MODEL.endpoint, {
      image_url: dataUri(await sharp(`${dir}/apose-front.png`).png().toBuffer()),
      texture: true,
      pbr: true,
      texture_quality: "detailed",
      geometry_quality: "detailed",
      face_limit: 60000,
      orientation: "align_image",
    })
    await writeFile(`${dir}/pilot-model.json`, `${JSON.stringify(model, null, 2)}\n`)
    say("model", `made, $${MODEL.cost.toFixed(2)}`)
  } else say("model", "kept")
  const url = model.model_urls?.pbr_model?.url ?? model.model_urls?.glb?.url ?? model.model_mesh?.url
  if (!url) throw new Error(`No model in ${dir}/pilot-model.json`)

  if (!rig) {
    rig = await fal<RigAnswer>(`pilot rig ${id}`, RIG.endpoint, {
      model_url: url,
      height_meters: brief.height,
      skeleton_template: "mixamo",
      include_fingers: true,
      animation_action_ids: CLIPS.map(([, action]) => action),
    })
    await writeFile(`${dir}/pilot-rig.json`, `${JSON.stringify(rig, null, 2)}\n`)
    say("rig", `made, $${rigCost.toFixed(2)}`)
  } else say("rig", "kept")

  const rigged = await fetched(rig.rigged_character_glb, "rigged")
  if (!rigged) throw new Error(`No rigged model in ${dir}/pilot-rig.json`)
  // Idle first, the clip a figure stands in, then the walk that came with the rig.
  const clips: [string, string][] = []
  for (const [name, action] of CLIPS) {
    const file = await fetched(rig.animations?.find((a) => a.action_id === action)?.animation_glb, name)
    if (file) clips.push([name, file])
    else say("clip", `${name}: none came back`)
  }
  const walk = await fetched(rig.basic_animations?.walking_glb, "Walk")
  if (walk) clips.splice(1, 0, ["Walk", walk])
  return { clips: await merge(rigged, clips, `${dir}/lod0.glb`, brief.borrowed), rest: rigged, generator: `${maker.name}, rigged by Meshy`, weights: "meshy", cost: maker.cost + rigCost }
}

const RODIN = { endpoint: "fal-ai/hyper3d/rodin/v2.5", cost: 0.4 }
const HYPER = { endpoint: "hyper3d/rigging", list: "hyper3d/rigging/animations", cost: 0.2 }
// The clips wanted from Hyper3D's stock, by the name the game plays each by: the first stock clip whose name or
// description matches, a looping one first for a clip that loops. `pilot-picks.json` keeps what was picked: edit it
// before paying to choose others.
const WANT: [string, RegExp, boolean][] = [
  ["Idle", /\bidle\b/i, true],
  ["Walk", /\bwalk/i, true],
  ["Shoot", /\b(bow|archer|arrow|shoot)/i, false],
  ["Swing", /\b(sword|slash|swing)/i, false],
  ["Dodge", /\b(dodge|roll)/i, false],
  ["Hit", /\b(hit|react|impact|stagger)/i, false],
  ["Fall", /\b(death|die|dying|knock|fall)/i, false],
]
type Stock = { animation_id: string; display_name?: string; content_description?: string; loop?: { kind?: string } | null; duration_seconds?: number }
type HyperAnswer = { model_mesh?: Remote; rigged_character_glb?: Remote; animations?: { action_id?: string; animation_glb?: Remote }[] }
type RodinAnswer = { model_mesh?: Remote }

// Rodin's model from the sheet's front and back, in an A-pose, rigged by Hyper3D with its stock clips, each renamed
// to the name the game plays it by. Returns the clips it has.
async function rodinHyper(brief: Brief) {
  // A brief with a body takes that figure's sheet, model and picks, and is rigged again on its own.
  const from = home(brief)
  const views = ["apose-front.png", "apose-back.png"].filter((f) => existsSync(`${from}/${f}`))
  let picks = await kept<Record<string, string>>(`${from}/pilot-picks.json`)
  if (!picks) {
    const { animations } = await fal<{ animations: Stock[] }>(`pilot stock ${id}`, HYPER.list, { category: "human" })
    picks = {}
    for (const [role, match, loops] of WANT) {
      const found = animations.filter((a) => match.test(`${a.display_name ?? ""} ${a.content_description ?? ""} ${a.animation_id}`))
      const pick = found.find((a) => !!a.loop === loops) ?? found[0]
      if (pick) picks[role] = pick.animation_id
    }
    await writeFile(`${dir}/pilot-picks.json`, `${JSON.stringify(picks, null, 2)}\n`)
    await writeFile(`${dir}/pilot-stock.json`, `${JSON.stringify(animations, null, 2)}\n`)
  }
  say(
    "clips",
    Object.entries(picks)
      .map(([role, at]) => `${role}: ${at}`)
      .join(", ") || "none found"
  )
  let model = await kept<RodinAnswer>(`${from}/pilot-model.json`)
  let rig = await kept<HyperAnswer>(`${dir}/pilot-rig.json`)
  if (brief.body && !model) throw new Error(`No model in ${from}/pilot-model.json: make ${brief.body} first`)
  const skinning = brief.skinning ?? "core"
  const owed = (model ? 0 : RODIN.cost) + (rig ? 0 : HYPER.cost)
  if (owed > 0 && !pay) {
    const had = model ? `the model kept${brief.body ? ` from ${brief.body}` : ""}` : `the model $${RODIN.cost.toFixed(2)} from ${views.length} views`
    say("cost", `$${owed.toFixed(2)} to make: ${had}, the rig (${skinning} skinning) and its clips $${HYPER.cost.toFixed(2)}. Look over ${from}/pilot-picks.json, then run again with --pay`)
    return null
  }
  if (!model) {
    model = await fal<RodinAnswer>(`pilot model ${id}`, RODIN.endpoint, {
      image_urls: await Promise.all(views.map(async (f) => dataUri(await sharp(`${from}/${f}`).png().toBuffer()))),
      prompt: brief.who,
      tier: "Gen-2.5-High",
      quality_mesh_option: "50K Triangle",
      material: "PBR",
      geometry_file_format: "glb",
      TAPose: true,
    })
    await writeFile(`${dir}/pilot-model.json`, `${JSON.stringify(model, null, 2)}\n`)
    say("model", `made, $${RODIN.cost.toFixed(2)}`)
  } else say("model", "kept")
  if (!model.model_mesh?.url) throw new Error(`No model in ${from}/pilot-model.json`)
  // Hyper3D's rigging does not turn a model. One that faces another way is not sent, so the rig is not paid for.
  const source = await fetched(model.model_mesh, "model")
  const at = source ? await facing(source) : null
  say("faces", at ? `${at.faces}, widest along ${at.wide}, toes ${at.toes.join(", ")}` : "not known")
  if (!rig && !args.includes("--facing=ok") && !(at?.faces === "+z" && at.wide === "x")) {
    say("rig", `not made: the rigger wants the model facing +z. Look at ${dir}/pilot/model.glb, and run again with --pay --facing=ok if it does`)
    return null
  }
  if (!rig) {
    rig = await fal<HyperAnswer>(`pilot rig ${id}`, HYPER.endpoint, {
      model_url: model.model_mesh.url,
      bone_template: "human",
      image_url: dataUri(await sharp(`${from}/apose-front.png`).png().toBuffer()),
      // "core" gathers a bone's pull about the skeleton, "for precise humanoid joints". "shell" "favors smooth weights
      // on the visible mesh" (fal's words for both).
      skinning_method: skinning,
      animation_presets: Object.values(picks),
      in_place: true,
      geometry_file_format: "glb",
    })
    await writeFile(`${dir}/pilot-rig.json`, `${JSON.stringify(rig, null, 2)}\n`)
    say("rig", `made, $${HYPER.cost.toFixed(2)}`)
  } else say("rig", "kept")
  // One file with every clip, each renamed from the stock name to the game's.
  const all = await fetched(rig.model_mesh, "rigged-all")
  if (!all) throw new Error(`No rigged model in ${dir}/pilot-rig.json`)
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const doc = await io.read(all)
  // A clip comes back under its stock name, and in the stock's order, not the order asked for.
  const roleOf = new Map(Object.entries(picks).map(([role, stock]) => [stock, role]))
  const made: string[] = []
  for (const anim of doc.getRoot().listAnimations()) {
    const role = roleOf.get(anim.getName()) ?? [...roleOf.entries()].find(([stock]) => anim.getName().includes(stock))?.[1]
    if (role) anim.setName(role)
    made.push(anim.getName())
  }
  inPlace(doc)
  smooth(doc)
  // A brief that borrows its clips has no use for the rigger's stand-ins, a gun fired for a bow shot and a throw for
  // a cut: they are taken out, keys and all, and the borrowed ones go by the names the game plays.
  if (Object.keys(brief.borrowed ?? {}).length) {
    for (const anim of doc.getRoot().listAnimations()) {
      for (const sampler of anim.listSamplers()) {
        sampler.getInput()?.dispose()
        sampler.getOutput()?.dispose()
        sampler.dispose()
      }
      for (const channel of anim.listChannels()) channel.dispose()
      anim.dispose()
    }
    made.length = 0
  }
  const raise = Number(args.find((a) => a.startsWith("--shoulder="))?.slice(11) ?? 0)
  if (raise) {
    lift(doc, raise, brief.height ?? 1.8)
    say("shoulder", `each joint moved ${raise} cm up`)
  }
  // `--spread=off` leaves the shares as the rigger gave them, to measure one rigging against another.
  if (!args.includes("--spread=off")) say("spread", `${spread(doc, SPREAD.reach, SPREAD.passes)} points about the shoulders`)
  made.push(...(await borrow(doc, brief.borrowed)))
  for (const [name, { until }] of Object.entries(brief.drawn ?? {})) {
    const moved = draw(doc, name, until, brief.height ?? 1.8)
    say("draw", moved ? `${name}: the bow hand moved ${moved[0].toFixed(0)} cm and the string hand ${moved[1].toFixed(0)} cm at the full draw` : `${name}: no such clip, or no arms to it`)
  }
  for (const [name, limit] of Object.entries(brief.eased ?? {})) {
    const most = ease(doc, name, limit)
    say("ease", most === null ? `${name}: no such clip` : `${name}: an arm was raised ${most.toFixed(0)}°, and is kept under ${limit}°`)
  }
  // `--helpers=off` leaves the skeleton as the rigger made it, to measure against.
  if (!args.includes("--helpers=off") && brief.helpers !== false) say("helpers", `${helpers(doc)} points hung on a bone between arm and trunk`)
  await io.write(`${dir}/lod0.glb`, doc)
  const order = ["Idle", "Walk", "Shoot", "Swing", "Dodge", "Sidestep", "Hit", "Fall"]
  made.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
  return { clips: made, rest: all, generator: `Rodin Gen-2.5 on fal, rigged by Hyper3D${skinning === "shell" ? " with shell skinning" : ""}`, weights: "hyper3d", cost: RODIN.cost + HYPER.cost }
}

async function main() {
  if (!id) throw new Error("Name a character: pnpm assets:pilot <id>")
  const brief = JSON.parse(await readFile(`${dir}/character.json`, "utf8")) as Brief
  const sheet = `${home(brief)}/apose-front.png`
  if (!existsSync(sheet)) throw new Error(`No sheet: run pnpm assets ${brief.body ?? id} first, and look at ${home(brief)}/sheet.png`)
  const made = brief.maker === "rodin" ? await rodinHyper(brief) : await tripoMeshy(brief)
  if (!made) return
  say("merge", `${dir}/lod0.glb with ${made.clips.join(", ")}`)
  const painted = await face(brief, made.rest)
  if (painted) say("face", `the sheet's, ${painted.fitted ? "fitted to the model's own" : "not fitted"}, ${painted.texels} texels`)

  const megabytes = Math.round(((await stat(`${dir}/lod0.glb`)).size / 1048576) * 100) / 100
  const figure = {
    name: brief.name,
    role: brief.role,
    cast: brief.cast,
    party: !!brief.party,
    height: brief.height,
    front: "front.webp",
    source: { generator: made.generator, triangles: 0, cost: Math.round(made.cost * 100) / 100, made: new Date().toISOString().slice(0, 10) },
    rig: { bones: 0, weights: made.weights },
    clips: made.clips,
    lods: [{ file: "lod0.glb", triangles: 0, megabytes, texture: 0 }],
  }
  await sharp(sheet).resize({ height: 640 }).webp({ quality: 85 }).toFile(`${dir}/front.webp`)
  await writeFile(`${dir}/figure.json`, `${JSON.stringify({ id, ...figure }, null, 2)}\n`)
  say("shelf", `on the shelf: /dev/assets?id=${id}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
