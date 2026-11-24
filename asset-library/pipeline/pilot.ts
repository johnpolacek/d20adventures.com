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
// A brief with "maker": "hi3d" (thalbern-hi3d) has its model from Hi3D v3.0 on fal ($2.10), from the same front and
// back, and the same rig after it.
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
// played one after another, each cut by seconds: "m2m/bow-pull@0-1.5 > m2m/bow-release@0-0.6". A part is eased into
// over three frames, or over as many as "~8" after it says. The libraries are not kept in git:
//   ual1.glb, ual2.glb   Quaternius's Universal Animation Library 1 and 2, CC0: each pack's Unreal-Godot file
//                        without root motion (UAL1_Standard.glb, UAL2_Standard.glb)
//   m2m/                 Mesh2Motion's clips, CC0: static/assets/human/animations of its repository
//
// Writes, in asset-library/characters/<id>/:
//   pilot-model.json, pilot-rig.json   the generators' answers. With them there, nothing is paid for again.
//   pilot/                             what came back: the rigged model, and one model per clip
//   lod0.glb                           the rigged model with every clip in it, each by the name the game plays it by
//   lod1.glb, lod2.glb                 the same with fewer triangles and smaller textures, for a crowd and for far off
//   figure.json                        for the library page: /settings/realm-of-myr/assets?id=<id>
//
// Each clip is made to play on the spot: the hips keep their height and lose their way across the ground, since the
// stage moves a cast member itself.

import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { type Accessor, type Document, type Node, NodeIO, type Primitive, type Texture } from "@gltf-transform/core"
import { ALL_EXTENSIONS, EXTTextureWebP, KHRMaterialsEmissiveStrength } from "@gltf-transform/extensions"
import { simplify, textureCompress, weld } from "@gltf-transform/functions"
import { MeshoptSimplifier } from "meshoptimizer"
import sharp from "sharp"
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js"
import { dataUri, fal, fetchBuffer } from "../../lab/stage-art/gen"
import { facing } from "./facing"
import { type Quat, qall, qbetween, qinv, qmix, qmul, qturn, qunit, qup } from "./quat"
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

// A head held higher in a clip, by so many degrees and never past level. The hunched stand and walk a beast borrows
// hang the head with the back, and a head as large as an owlbear's then shows its crown and no face (the owner's
// owlbear from Hi3D, 2026-11-20: in the game its eyes did not show). The line the face looks along is turned up
// about the level line square to it, half at the neck and half at the head, frame by frame, so the head still sways.
// Returns how far under level the face looked at its worst, and the most it was lifted.
function chin(doc: Document, name: string, degrees: number) {
  const clip = doc
    .getRoot()
    .listAnimations()
    .find((a) => a.getName() === name)
  const joints = doc.getRoot().listSkins()[0]?.listJoints() ?? []
  const find = (bone: string) => joints.find((j) => new RegExp(`(^|:)${bone}$`).test(j.getName()))
  const [neck, head] = [find("Neck"), find("Head")]
  if (!clip || !neck || !head) return null
  const read = reader(clip)
  const turned = (node: Node | null, time: number): Quat => {
    if (!node) return [0, 0, 0, 1]
    const up = node.getParentNode()
    const own = read(node, "rotation", time) as Quat
    return up ? qmul(turned(up, time), own) : own
  }
  const keys = (node: Node) => {
    const sampler = clip
      .listChannels()
      .find((c) => c.getTargetNode() === node && c.getTargetPath() === "rotation")
      ?.getSampler()
    return [sampler?.getInput(), sampler?.getOutput()] as const
  }
  const [times, necks] = keys(neck)
  const [, heads] = keys(head)
  if (!times || !necks || !heads || heads.getCount() !== necks.getCount() || head.getParentNode() !== neck) return null
  // The way the face looks, as the head bone has it: forward of the figure as it was modelled.
  const forward = qturn(qinv(head.getWorldRotation() as Quat), [0, 0, 1])
  let [worst, most] = [0, 0]
  for (let i = 0; i < necks.getCount(); i++) {
    const time = times.getScalar(i)
    const above = turned(neck.getParentNode(), time)
    const [n, h] = [necks.getElement(i, [0, 0, 0, 1]) as Quat, heads.getElement(i, [0, 0, 0, 1]) as Quat]
    const looks = qturn(qall(above, n, h), forward)
    const under = (-Math.asin(Math.max(-1, Math.min(1, looks[1] / (Math.hypot(...looks) || 1)))) * 180) / Math.PI
    worst = Math.max(worst, under)
    const by = Math.max(0, Math.min(degrees, under))
    if (!by) continue
    most = Math.max(most, by)
    // About the level line square to the way it looks, the turn that brings that way up.
    const level = Math.hypot(looks[0], looks[2]) || 1
    const half = (by * Math.PI) / 180 / 4
    const up: Quat = [(-looks[2] / level) * Math.sin(half), 0, (looks[0] / level) * Math.sin(half), Math.cos(half)]
    necks.setElement(i, qall(qinv(above), up, above, n))
    // The head's parent has turned by then: the same turn again, as the neck now has it.
    const neckNow = qall(up, above, n)
    heads.setElement(i, qall(qinv(neckNow), up, neckNow, h))
  }
  return [worst, most] as const
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

const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: number[]) => {
  const long = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / long, a[1] / long, a[2] / long]
}
const RAD = Math.PI / 180

// An elbow kept an elbow in every clip: bent a little at the least, and bent the way an elbow bends. A library's
// clips are made on its own mannequin, where an arm thrown out straight may pass straight and lean to one side, and
// nothing shows it. On a figure with a sleeve and a bracer it is an arm with no joint in it: in the sword cut, as the
// blow lands, the sword arm was 10 degrees past straight and 16 to the side (the owner, 2026-11-19: "rubbery like
// gumby", "pay attention to the hand position and the elbow position"). The forearm is turned about the elbow to
// where a bend of FLOOR degrees or more would have it, and what it leans to the side is taken down while the arm is
// near straight, where the lean is the clip's looseness and not the shoulder's turn. The hand keeps the way it faces
// in the world, and goes where the forearm takes it. Returns how far past straight an elbow went, and how many keys
// were moved.
const FLOOR = 12
function elbows(doc: Document) {
  const joints = doc.getRoot().listSkins()[0]?.listJoints() ?? []
  const find = (bone: string) => joints.find((j) => new RegExp(`(^|:)${bone}$`).test(j.getName()))
  let [past, where, moved] = [0, "", 0]
  for (const clip of doc.getRoot().listAnimations()) {
    const read = reader(clip)
    const turned = (node: Node | null, time: number): Quat => {
      if (!node) return [0, 0, 0, 1]
      const up = node.getParentNode()
      const own = read(node, "rotation", time) as Quat
      return up ? qmul(turned(up, time), own) : own
    }
    for (const side of ["Left", "Right"]) {
      const [arm, fore, hand] = [find(`${side}Arm`), find(`${side}ForeArm`), find(`${side}Hand`)]
      if (!arm || !fore || !hand) continue
      const keys = (of: Node) =>
        clip
          .listChannels()
          .find((c) => c.getTargetNode() === of && c.getTargetPath() === "rotation")
          ?.getSampler()
      const [foreKeys, handKeys] = [keys(fore), keys(hand)]
      const [input, foreOut, handOut] = [foreKeys?.getInput(), foreKeys?.getOutput(), handKeys?.getOutput()]
      if (!input || !foreOut || !handOut || foreOut.getCount() !== handOut.getCount() || foreKeys?.getInterpolation() === "CUBICSPLINE") continue
      // The upper arm's own lines, in its own space: the way it runs, and the way its elbow folds, which at rest is
      // the way the figure faces.
      const rest = arm.getWorldRotation() as Quat
      const runs = unit(qturn(rest, fore.getTranslation()))
      const [alongArm, alongFore] = [unit(fore.getTranslation()), unit(hand.getTranslation())]
      const folds = qturn(qinv(rest), unit([-runs[0] * runs[2], -runs[1] * runs[2], 1 - runs[2] * runs[2]]))
      for (let i = 0; i < foreOut.getCount(); i++) {
        const above = turned(arm, input.getScalar(i))
        const [own, held] = [foreOut.getElement(i, [0, 0, 0, 1]) as Quat, handOut.getElement(i, [0, 0, 0, 1]) as Quat]
        const world = qmul(above, own)
        const [a, f, d] = [qturn(above, alongArm), qturn(above, folds), unit(qturn(world, alongFore))]
        const aside = cross(a, f)
        const bent = Math.atan2(dot(d, f), dot(d, a)) / RAD
        const leans = Math.asin(Math.max(-1, Math.min(1, dot(d, aside)))) / RAD
        // Only an arm near straight is touched: one folded right up is an elbow already, whichever way these two
        // angles read it, and from 40 degrees of fold to 60 less and less is done.
        const folded = Math.acos(Math.max(-1, Math.min(1, dot(d, a)))) / RAD
        const open = 1 - Math.max(0, Math.min(1, (folded - 40) / 20)) ** 2 * (3 - 2 * Math.max(0, Math.min(1, (folded - 40) / 20)))
        if (open <= 0) continue
        if (-bent > past) [past, where] = [-bent, `${side.toLowerCase()} arm in ${clip.getName()}`]
        // Never under the floor, and come to it gently: from well above it nothing changes.
        const bend = bent + (FLOOR + 5 * Math.log1p(Math.exp((bent - FLOOR) / 5)) - bent) * open
        const near = 1 - Math.max(0, Math.min(1, (bend - 15) / 25)) ** 2 * (3 - 2 * Math.max(0, Math.min(1, (bend - 15) / 25)))
        const lean = leans * (1 - 0.7 * near * open)
        if (Math.abs(bend - bent) < 0.2 && Math.abs(lean - leans) < 0.2) continue
        const to = [0, 1, 2].map((k) => Math.cos(lean * RAD) * (Math.cos(bend * RAD) * a[k] + Math.sin(bend * RAD) * f[k]) + Math.sin(lean * RAD) * aside[k])
        const turn = qbetween(d, to)
        foreOut.setElement(i, qall(qinv(above), turn, above, own))
        handOut.setElement(i, qall(qinv(world), qinv(turn), world, held))
        moved++
      }
    }
  }
  return { past, where, moved }
}

// A hand hung a little closed in every clip, whatever its model's fingers were modelled as. A clip's fingers go a
// fifth of the way from the model's own to the library's (retarget.ts `CURL`), so a hand modelled flat with its
// fingers spread stays a flat hand: Hi3D's Thalbern held an open paddle out at the end of each arm. Each joint of
// each finger is closed by what it lacks of a hand at ease, about the line the game closes it about (hold.ts), in
// every clip. A hand that holds a weapon is closed by the game from its rest, and is not this. Nor is a hand modelled
// as a fist round what it carries (a brief's `holds`): the rigger lays those bones straight through the fist, they
// read as bent back half a turn, and Wollandora's was closed 174 degrees a joint to make up for it. A finger that
// reads as bent back at all is left as it is. Returns the most a joint was closed, in degrees.
const EASE_HAND = [22, 30, 18]
function hang(doc: Document, fist?: "L" | "R") {
  const joints = doc.getRoot().listSkins()[0]?.listJoints() ?? []
  const find = (bone: string) => joints.find((j) => new RegExp(`(^|:)${bone}$`).test(j.getName()))
  const at = (node: Node) => node.getWorldMatrix().slice(12, 15)
  const from = (a: Node, b: Node) => at(b).map((v, k) => v - at(a)[k])
  let most = 0
  for (const [side, sign] of [
    ["Left", 1],
    ["Right", -1],
  ] as const) {
    const [wrist, middle, index, pinky] = [find(`${side}Hand`), find(`${side}HandMiddle1`), find(`${side}HandIndex1`), find(`${side}HandPinky1`)]
    if (!wrist || !middle || !index || !pinky || side[0] === fist) continue
    const along = unit(from(wrist, middle))
    const wide = from(pinky, index)
    const across = unit(wide.map((v, k) => v - along[k] * dot(wide, along)))
    const palm = cross(along, across).map((v) => v * sign)
    for (const finger of ["Index", "Middle", "Ring", "Pinky"]) {
      const bones = [1, 2, 3].map((k) => find(`${side}Hand${finger}${k}`))
      const [a, b, c] = bones
      if (!a || !b || !c) continue
      const [first, second] = [unit(from(a, b)), unit(from(b, c))]
      const last = unit(qturn(c.getWorldRotation() as Quat, unit(c.getTranslation())))
      const about = unit(cross(first, palm))
      const closed = (u: number[], v: number[]) => Math.atan2(dot(cross(u, v), about), dot(u, v)) / RAD
      const has = [closed(along, first), closed(first, second), closed(second, last)]
      if (has.some((angle) => angle < -30)) continue
      const lacks = has.map((angle, k) => Math.max(0, EASE_HAND[k] - Math.max(0, angle)))
      for (const [k, bone] of bones.entries()) {
        if (!bone || lacks[k] < 0.5) continue
        most = Math.max(most, lacks[k])
        const line = unit(qturn(qinv(bone.getWorldRotation() as Quat), about))
        const half = (lacks[k] * RAD) / 2
        const more: Quat = [line[0] * Math.sin(half), line[1] * Math.sin(half), line[2] * Math.sin(half), Math.cos(half)]
        for (const clip of doc.getRoot().listAnimations()) {
          const out = clip
            .listChannels()
            .find((ch) => ch.getTargetNode() === bone && ch.getTargetPath() === "rotation")
            ?.getSampler()
            ?.getOutput()
          for (let i = 0; out && i < out.getCount(); i++) out.setElement(i, qmul(out.getElement(i, [0, 0, 0, 1]) as Quat, more))
        }
      }
    }
  }
  return most
}

// What a finger's bone holds that is no finger, given to the hand. A rigger shares a point among the bones near it,
// and a sleeve that hangs by the hand at rest is near the fingers: Wollandora's hung a seventh on two finger bones,
// beside the forearm and the upper arm. A point may hang on four bones and no more, so when another bone was added
// for it (the forearm's roll, below) one of the four was dropped, the upper arm from one point and a finger from the
// point beside it, and with the arm bent to her staff the sleeve between them was torn into sheets 65 times as long.
// A point further than NEAR from a finger's bone is no finger: its share goes to the hand, and the count falls. One
// further than PALM from the hand's own line, wrist to knuckle, is no hand either, and what the hand and its fingers
// hold of it goes to the forearm: the hand turns on the wrist to carry a staff, and cloth hung on it swings out with
// it like a flag.
// Both are come to over a distance and not at a line: a point just inside beside a point just outside, on other
// bones altogether, is a tear of its own. A hand modelled as a fist round what it carries (a brief's `holds`) has its
// finger bones laid straight through it by the rigger, near nothing they should hold, and its fingers are never
// moved: all that they hold is the hand's.
const NEAR = 0.03
const PALM = 0.09
const eased = (v: number, from: number, to: number) => {
  const t = Math.max(0, Math.min(1, (v - from) / (to - from)))
  return t * t * (3 - 2 * t)
}
function fingersOnly(doc: Document, fist?: "L" | "R", big = 1) {
  const skin = doc.getRoot().listSkins()[0]
  const joints = skin?.listJoints() ?? []
  // Each finger bone's line at rest, from its joint to the next, or as far again past the last, and its hand.
  const lines = new Map<number, { from: number[]; to: number[]; hand: number; fist: boolean }>()
  // Each hand's own line, and the forearm above it.
  const palms = new Map<number, { from: number[]; to: number[]; fore: number }>()
  const place = (name: string) => joints.findIndex((j) => new RegExp(`(^|:)${name}$`).test(j.getName()))
  for (const side of ["Left", "Right"]) {
    const [hand, fore, middle] = [place(`${side}Hand`), place(`${side}ForeArm`), place(`${side}HandMiddle1`)]
    if (hand < 0 || fore < 0 || middle < 0) continue
    const [from, knuckle] = [joints[hand].getWorldMatrix().slice(12, 15), joints[middle].getWorldMatrix().slice(12, 15)]
    palms.set(hand, { from, to: from.map((v, k) => v + (knuckle[k] - v) * 1.6), fore })
  }
  for (const [i, joint] of joints.entries()) {
    const found = /(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)\d$/.exec(joint.getName())
    if (!found) continue
    const hand = place(`${found[1]}Hand`)
    const from = joint.getWorldMatrix().slice(12, 15)
    const next = joint.listChildren().find((child) => joints.includes(child))
    const up = joint.getParentNode()?.getWorldMatrix().slice(12, 15) ?? from
    const to = next ? next.getWorldMatrix().slice(12, 15) : from.map((v, k) => v + (v - up[k]))
    if (hand >= 0) lines.set(i, { from, to, hand, fist: found[1][0] === fist })
  }
  const off = (p: number[], line: { from: number[]; to: number[] }) => {
    const along = line.to.map((v, n) => v - line.from[n])
    const t = Math.max(0, Math.min(1, dot(p.map((v, n) => v - line.from[n]), along) / (dot(along, along) || 1)))
    return Math.hypot(...p.map((v, n) => v - line.from[n] - along[n] * t))
  }
  let moved = 0
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const [pos, J, W] = [prim.getAttribute("POSITION"), prim.getAttribute("JOINTS_0"), prim.getAttribute("WEIGHTS_0")]
      if (!pos || !J || !W) continue
      for (let i = 0; i < J.getCount(); i++) {
        const [j, w] = [J.getElement(i, [0, 0, 0, 0]), W.getElement(i, [0, 0, 0, 0])]
        if (!j.some((bone, k) => w[k] > 0 && (lines.has(bone) || palms.has(bone)))) continue
        const p = pos.getElement(i, [0, 0, 0])
        const shares = new Map<number, number>()
        let changed = false
        const give = (bone: number, share: number) => shares.set(bone, (shares.get(bone) ?? 0) + share)
        for (const [k, bone] of j.entries()) {
          if (w[k] <= 0) continue
          const line = lines.get(bone)
          // What of this share is no finger, and of that, what is no hand.
          const loose = line ? (line.fist ? 1 : eased(off(p, line), NEAR * 0.6 * big, NEAR * 1.6 * big)) : 0
          const palm = palms.get(line ? line.hand : bone)
          const far = palm ? eased(off(p, palm), PALM * 0.6 * big, PALM * 1.4 * big) : 0
          const [stays, toHand, toFore] = line ? [1 - loose, loose * (1 - far), loose * far] : [1 - far, 0, far]
          if (stays < 0.999) changed = true
          if (stays > 0) give(bone, w[k] * stays)
          if (line && toHand > 0) give(line.hand, w[k] * toHand)
          if (palm && toFore > 0) give(palm.fore, w[k] * toFore)
        }
        if (!changed) continue
        const top = [...shares].sort((x, y) => y[1] - x[1]).slice(0, 4)
        const [whole, kept] = [[...shares.values()].reduce((sum, v) => sum + v, 0), top.reduce((sum, [, v]) => sum + v, 0) || 1]
        J.setElement(
          i,
          [0, 1, 2, 3].map((k) => top[k]?.[0] ?? 0)
        )
        W.setElement(
          i,
          [0, 1, 2, 3].map((k) => ((top[k]?.[1] ?? 0) / kept) * whole)
        )
        moved++
      }
    }
  return moved
}

// A sixth finger taken off. Hi3D made Thalbern's hands with five fingers and a thumb, from a sheet that has four and a
// thumb, and the rigger hung two of them on the ring finger's bones (the owner, 2026-11-23: "somehow thalbern got too
// many fingers"). The fingers are found where they part: past the knuckles, each is a piece of skin of its own, and
// the distance past them at which the most pieces stand apart is where they are counted. With four bone lines and
// five fingers, the finger farthest from the line it lies nearest is the one too many. A hand with four is left be.
// Two tries that failed: cut where the fingers part, it left a flap 3 cm long, the web it shared with the ring finger;
// folded flat and hung on the hand, it tore into shards as the fingers closed. What holds is below.
function sixth(doc: Document) {
  const skin = doc.getRoot().listSkins()[0]
  const joints = skin?.listJoints() ?? []
  const place = (name: string) => joints.findIndex((j) => new RegExp(`(^|:)${name}$`).test(j.getName()))
  const at = (i: number) => joints[i].getWorldMatrix().slice(12, 15)
  const sub = (a: number[], b: number[]) => a.map((v, k) => v - b[k])
  const unit = (a: number[]) => {
    const l = Math.hypot(...a) || 1
    return a.map((v) => v / l)
  }
  const said: string[] = []
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const [pos, J, W, idx] = [prim.getAttribute("POSITION"), prim.getAttribute("JOINTS_0"), prim.getAttribute("WEIGHTS_0"), prim.getIndices()]
      if (!pos || !J || !W || !idx) continue
      for (const side of ["Left", "Right"]) {
        const [hand, ...knuckles] = [`${side}Hand`, ...["Index", "Middle", "Ring", "Pinky"].map((f) => `${side}Hand${f}1`)].map(place)
        if (hand < 0 || knuckles.some((k) => k < 0)) continue
        const bones = new Set(joints.flatMap((j, i) => (new RegExp(`(^|:)${side}Hand(Thumb|Index|Middle|Ring|Pinky)?\\d?$`).test(j.getName()) ? [i] : [])))
        const thumbs = new Set(joints.flatMap((j, i) => (new RegExp(`(^|:)${side}HandThumb\\d$`).test(j.getName()) ? [i] : [])))
        const wrist = at(hand)
        const ks = knuckles.map(at)
        const mid = [0, 1, 2].map((k) => ks.reduce((s, p) => s + p[k], 0) / ks.length)
        const h = unit(sub(mid, wrist))
        const reach = dot(sub(mid, wrist), h)
        const raw = sub(ks[0], ks[3])
        const across = unit(sub(raw, h.map((v) => v * dot(raw, h))))
        const n = [h[1] * across[2] - h[2] * across[1], h[2] * across[0] - h[0] * across[2], h[0] * across[1] - h[1] * across[0]]
        const span = Math.abs(dot(raw, across))
        // The finger bones' lines, each from its first joint past its last.
        const lines = ["Index", "Middle", "Ring", "Pinky"].map((f) => {
          const ps = [1, 2, 3].map((s) => place(`${side}Hand${f}${s}`)).filter((i) => i >= 0).map(at)
          const last = ps[ps.length - 1]
          return [...ps, last.map((v, k) => v + (v - ps[ps.length - 2][k]))]
        })
        const toLine = (p: number[], line: number[][]) => {
          let best = Infinity
          for (let s = 0; s + 1 < line.length; s++) {
            const d = sub(line[s + 1], line[s])
            const t = Math.max(0, Math.min(1, dot(sub(p, line[s]), d) / (dot(d, d) || 1)))
            best = Math.min(best, Math.hypot(...sub(p, line[s].map((v, k) => v + d[k] * t))))
          }
          return best
        }
        // The hand's skin: points that hang mostly on this hand and its fingers, near the hand.
        const count = pos.getCount()
        const along = new Float64Array(count)
        const side_ = new Float64Array(count)
        const inHand = new Uint8Array(count)
        const onThumb = new Float64Array(count)
        for (let i = 0; i < count; i++) {
          const [j, w] = [J.getElement(i, [0, 0, 0, 0]), W.getElement(i, [0, 0, 0, 0])]
          let share = 0
          for (let k = 0; k < 4; k++) {
            if (bones.has(j[k])) share += w[k]
            if (thumbs.has(j[k])) onThumb[i] += w[k]
          }
          if (share < 0.5) continue
          const d = sub(pos.getElement(i, [0, 0, 0]), wrist)
          along[i] = dot(d, h)
          side_[i] = dot(d, across)
          if (along[i] > 0 && Math.abs(dot(d, n)) < reach && Math.abs(side_[i] - dot(sub(mid, wrist), across)) < span * 1.5) inHand[i] = 1
        }
        const tris = idx.getArray() as ArrayLike<number>
        // The pieces of the hand's skin past a distance along it, and which are fingers: long enough, and not the thumb.
        const pieces = (cut: number) => {
          const parent = new Int32Array(count).map((_, i) => i)
          const root = (i: number): number => {
            while (parent[i] !== i) i = parent[i] = parent[parent[i]]
            return i
          }
          const past = (i: number) => inHand[i] === 1 && along[i] > cut
          for (let t = 0; t < tris.length; t += 3)
            for (const [a, b] of [
              [tris[t], tris[t + 1]],
              [tris[t + 1], tris[t + 2]],
              [tris[t + 2], tris[t]],
            ])
              if (past(a) && past(b)) parent[root(a)] = root(b)
          const groups = new Map<number, number[]>()
          for (let i = 0; i < count; i++) if (past(i)) groups.set(root(i), [...(groups.get(root(i)) ?? []), i])
          return [...groups.values()].filter((g) => {
            if (g.length < 30) return false
            const long = Math.max(...g.map((i) => along[i])) - cut
            const thumb = g.reduce((s, i) => s + onThumb[i], 0) / g.length
            return long > reach * 0.1 && thumb < 0.5
          })
        }
        let found: { cut: number; fingers: number[][] } | null = null
        for (let step = 0; step <= 12; step++) {
          const cut = reach * (1 + step * 0.04)
          const fingers = pieces(cut)
          if (!found || fingers.length > found.fingers.length) found = { cut, fingers }
        }
        if (!found || found.fingers.length < 5) continue
        if (found.fingers.length > 5) {
          said.push(`${side.toLowerCase()}: ${found.fingers.length} fingers, left as they are`)
          continue
        }
        const middleOf = (g: number[]) => [0, 1, 2].map((k) => g.reduce((s, i) => s + pos.getElement(i, [0, 0, 0])[k], 0) / g.length)
        const fingers = found.fingers.map((g) => {
          const c = middleOf(g)
          const far = lines.map((line) => toLine(c, line))
          const near = far.indexOf(Math.min(...far))
          return { g, c, near, far: far[near], side: dot(sub(c, wrist), across) }
        })
        const extra = [0, 1, 2, 3]
          .map((line) => fingers.filter((f) => f.near === line).sort((a, b) => b.far - a.far))
          .find((on) => on.length > 1)?.[0]
        if (!extra) {
          said.push(`${side.toLowerCase()} five fingers, none on a line of another`)
          continue
        }
        // The finger too many taken off down to the knuckles. Each finger's line runs from the knuckles to its middle,
        // and every point past the knuckles nearer that finger's line than any other's goes, so the skin it shared with
        // the finger beside it is split down the middle of the web and not left hanging as a flap. The wound is closed
        // with a fan from its middle, hung on the hand, and the skin about it smoothed. The fingers beside it are then
        // drawn in across the gap, each kept whole.
        const at3 = (i: number) => pos.getElement(i, [0, 0, 0])
        const axes = fingers.map((f) => {
          const base = wrist.map((v, k) => v + h[k] * reach + across[k] * f.side + n[k] * dot(sub(f.c, wrist), n))
          return [base, f.c.map((v, k) => v + (v - base[k]))]
        })
        const gap = Math.min(...fingers.filter((f) => f !== extra).map((f) => Math.abs(f.side - extra.side)))
        const c0 = extra.side
        const which = fingers.indexOf(extra)
        const gone = new Uint8Array(count)
        let taken = 0
        for (let i = 0; i < count; i++) {
          if (!inHand[i] || along[i] < reach * 0.95 || Math.abs(side_[i] - c0) > gap * 1.6) continue
          const p = at3(i)
          const far = axes.map((line) => toLine(p, line))
          if (far.indexOf(Math.min(...far)) === which) {
            gone[i] = 1
            taken++
          }
        }
        // A point is known by its place: where the texture has a seam, two points stand in one place.
        const placeOf = (i: number) => at3(i).map((v) => Math.round(v * 1e5)).join(",")
        // A point that shares its place with one taken off goes too, or a seam would be left open.
        const goneAt = new Set<string>()
        for (let i = 0; i < count; i++) if (gone[i]) goneAt.add(placeOf(i))
        for (let i = 0; i < count; i++) if (!gone[i] && inHand[i] && goneAt.has(placeOf(i))) gone[i] = 1
        const kept: number[] = []
        const lost = new Set<string>()
        for (let t = 0; t < tris.length; t += 3) {
          const tri = [tris[t], tris[t + 1], tris[t + 2]]
          if (tri.some((i) => gone[i])) for (let e = 0; e < 3; e++) lost.add(`${placeOf(tri[e])}|${placeOf(tri[(e + 1) % 3])}`)
          else kept.push(...tri)
        }
        // A wound's edge is a kept triangle's a→b that a lost one had as b→a.
        const rimEdges: [number, number][] = []
        for (let t = 0; t < kept.length; t += 3)
          for (let e = 0; e < 3; e++) {
            const [a, b] = [kept[t + e], kept[t + ((e + 1) % 3)]]
            if (lost.has(`${placeOf(b)}|${placeOf(a)}`)) rimEdges.push([a, b])
          }
        const rim = [...new Set(rimEdges.flat())]
        // The wound is closed with its own points: a copy of each on the rim and one in the middle, all at one place in
        // the skin's texture, so the plug takes the skin's colour and does not smear the texture across its islands.
        const centre = count
        const copies = new Map(rim.map((i, k) => [i, count + 1 + k]))
        const added = rim.length + 1
        const uv = prim.getAttribute("TEXCOORD_0")
        // The skin's colour from the back of the hand, well inside it: a point on the wound's rim may lie on the edge of
        // its island in the texture, where the texture is clear.
        const palmMiddle = wrist.map((v, k) => v + h[k] * reach * 0.6)
        let inside = rim[0]
        for (let i = 0; i < count; i++)
          if (inHand[i] && !gone[i] && Math.hypot(...sub(at3(i), palmMiddle)) < Math.hypot(...sub(at3(inside), palmMiddle))) inside = i
        const skinAt = uv ? uv.getElement(inside, [0, 0]) : null
        for (const accessor of prim.listAttributes()) {
          const array = accessor.getArray()!
          const grown = new (array.constructor as Float32ArrayConstructor)(array.length + accessor.getElementSize() * added)
          grown.set(array)
          accessor.setArray(grown)
          accessor.setElement(centre, accessor.getElement(rim[0], []))
          for (const [i, c] of copies) accessor.setElement(c, accessor.getElement(i, []))
        }
        if (uv && skinAt) for (const c of [centre, ...copies.values()]) uv.setElement(c, skinAt)
        J.setElement(centre, [hand, 0, 0, 0])
        W.setElement(centre, [1, 0, 0, 0])
        const normal = prim.getAttribute("NORMAL")
        if (normal) normal.setElement(centre, unit([0, 1, 2].map((k) => rim.reduce((s, i) => s + normal.getElement(i, [0, 0, 0])[k], 0))))
        // The wound is no flat ring, so a fan over it faces both ways in places: it is given both faces, or the hand
        // would show through where it faced in.
        for (const [a, b] of rimEdges) kept.push(copies.get(b)!, copies.get(a)!, centre, copies.get(a)!, copies.get(b)!, centre)
        idx.setArray(new (count + added > 65535 || tris instanceof Uint32Array ? Uint32Array : Uint16Array)(kept))
        // The fingers beside the gap drawn in, the more the further past the knuckles.
        const half = gap / 2
        for (let i = 0; i < count; i++) {
          if (!inHand[i] || gone[i]) continue
          const reachIn = eased(along[i], reach * 0.85, reach * 1.05)
          if (reachIn <= 0) continue
          const off = side_[i] - c0
          const move = -Math.sign(off) * half * eased(Math.abs(off), gap * 0.2, gap * 0.6) * reachIn
          const p = at3(i)
          pos.setElement(
            i,
            p.map((v, k) => v + across[k] * move)
          )
        }
        // The plug's rim goes where the rim went.
        for (const [i, c] of copies) pos.setElement(c, at3(i))
        // The rim and two rings about it smoothed, the wound's middle with them. Points that share a place move as one,
        // with the neighbours of all of them, or the seam between them would open.
        const group = new Map<string, number[]>()
        const links = new Map<string, Set<string>>()
        for (let t = 0; t < kept.length; t += 3)
          for (let e = 0; e < 3; e++) {
            const [a, b] = [kept[t + e], kept[t + ((e + 1) % 3)]]
            const [ka, kb] = [placeOf(a), placeOf(b)]
            for (const [k, i] of [
              [ka, a],
              [kb, b],
            ] as const) {
              if (!group.has(k)) group.set(k, [])
              if (!group.get(k)!.includes(i)) group.get(k)!.push(i)
              if (!links.has(k)) links.set(k, new Set())
            }
            links.get(ka)!.add(kb)
            links.get(kb)!.add(ka)
          }
        let ring = new Set([...rim, centre].map(placeOf))
        for (let r = 0; r < 2; r++) ring = new Set([...ring, ...[...ring].flatMap((k) => [...(links.get(k) ?? [])])])
        const where_ = new Map([...group].map(([k, members]) => [k, at3(members[0])]))
        for (let pass = 0; pass < 6; pass++) {
          const next = new Map<string, number[]>()
          for (const k of ring) {
            const near = [...(links.get(k) ?? [])]
            if (!near.length) continue
            const mean = [0, 1, 2].map((d) => near.reduce((s, j) => s + where_.get(j)![d], 0) / near.length)
            next.set(k, where_.get(k)!.map((v, d) => v + (mean[d] - v) * 0.5))
          }
          for (const [k, p] of next) where_.set(k, p)
        }
        for (const k of ring) for (const i of group.get(k) ?? []) pos.setElement(i, where_.get(k)!)
        const where = ["index", "middle", "ring", "little"][extra.near]
        said.push(`${side.toLowerCase()}: one beside the ${where} finger, ${taken} points taken off, ${(extra.far * 100).toFixed(1)} cm off its line, parting ${((found.cut - reach) * 100).toFixed(1)} cm past the knuckles, the gap ${(gap * 100).toFixed(1)} cm closed`)
      }
    }
  return said
}

// A beast's head given to its head bone. A rigger looks for a person: on an owlbear, whose head sits in its
// shoulders with no neck, it shared the head's skin between the chest (38%), the two collarbones (27%) and the head
// (34%), where a person's head is the head bone's by four fifths. The head then hung with the chest and no turn of
// the neck moved the face (the owner's owlbear from Hi3D, 2026-11-20). From the neck joint's height the skin is given
// to the head more and more, all of it at the head joint's, and only between the shoulders: above the head joint by
// the neck's length again it is the head's however wide, for ears and tufts.
function crown(doc: Document) {
  const skin = doc.getRoot().listSkins()[0]
  const joints = skin?.listJoints() ?? []
  const place = (name: string) => joints.findIndex((j) => new RegExp(`(^|:)${name}$`).test(j.getName()))
  const [head, neck, armL, armR] = [place("Head"), place("Neck"), place("LeftArm"), place("RightArm")]
  if (head < 0 || neck < 0 || armL < 0 || armR < 0) return 0
  const at = (i: number) => joints[i].getWorldMatrix().slice(12, 15)
  const [h, n] = [at(head), at(neck)]
  const wide = Math.max(Math.abs(at(armL)[0] - h[0]), Math.abs(at(armR)[0] - h[0]))
  const long = Math.max(1e-6, h[1] - n[1])
  let moved = 0
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const [pos, J, W] = [prim.getAttribute("POSITION"), prim.getAttribute("JOINTS_0"), prim.getAttribute("WEIGHTS_0")]
      if (!pos || !J || !W) continue
      for (let i = 0; i < J.getCount(); i++) {
        const p = pos.getElement(i, [0, 0, 0])
        const between = Math.max(1 - eased(Math.abs(p[0] - h[0]), wide * 0.7, wide * 1.1), eased(p[1], h[1], h[1] + long))
        const share = eased(p[1], n[1], h[1]) * between
        if (share < 0.004) continue
        const [j, w] = [J.getElement(i, [0, 0, 0, 0]), W.getElement(i, [0, 0, 0, 0])]
        const shares = new Map<number, number>()
        let given = 0
        for (const [k, bone] of j.entries()) {
          if (w[k] <= 0) continue
          const gives = bone === head ? 0 : w[k] * share
          given += gives
          shares.set(bone, (shares.get(bone) ?? 0) + w[k] - gives)
        }
        if (given < 0.004) continue
        shares.set(head, (shares.get(head) ?? 0) + given)
        const top = [...shares].sort((x, y) => y[1] - x[1]).slice(0, 4)
        const [whole, kept] = [[...shares.values()].reduce((sum, v) => sum + v, 0), top.reduce((sum, [, v]) => sum + v, 0) || 1]
        J.setElement(
          i,
          [0, 1, 2, 3].map((k) => top[k]?.[0] ?? 0)
        )
        W.setElement(
          i,
          [0, 1, 2, 3].map((k) => ((top[k]?.[1] ?? 0) / kept) * whole)
        )
        moved++
      }
    }
  return moved
}

// A bone in each forearm that rolls with the hand, and the forearm's skin hung on it more and more toward the wrist.
// A real forearm rolls along its length: the elbow is a hinge and the wrist turns the palm. A library's skeleton has
// bones for that and a rigged figure's has one forearm bone, so a clip's roll came whole at the elbow: in the sword
// cut the forearm stood rolled 103 degrees on the upper arm, bracer and elbow wrung round like a rubber hose (the
// owner, 2026-11-19: "rubbery like gumby"). The forearm's own roll about its length is taken out of every clip and
// given to the hand, which stays as it was in the world, sword and all. The new bone, a child of the forearm that
// rests where it does, takes a share of the hand's roll, and what the forearm holds becomes its, none at the elbow
// and all at the wrist. As with the shoulder's, every clip is given its keys and no player has to know of it.
const ROLL = 0.75
const REACH = (110 * Math.PI) / 180
function rolls(doc: Document, big = 1) {
  const skin = doc.getRoot().listSkins()[0]
  const bind = skin?.getInverseBindMatrices()
  if (!skin || !bind) return null
  const joints = skin.listJoints()
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer()
  const binds = [...(bind.getArray() ?? [])]
  // A turn's part about a line through it: what is left is a swing with none.
  const about = (q: Quat, axis: number[]): Quat => {
    const along = q[0] * axis[0] + q[1] * axis[1] + q[2] * axis[2]
    return Math.hypot(along, q[3]) < 1e-6 ? [0, 0, 0, 1] : qunit([axis[0] * along, axis[1] * along, axis[2] * along, q[3]])
  }
  const made: { fore: number; roll: number; from: number[]; along: number[]; long: number }[] = []
  let [most, where] = [0, ""]
  for (const side of ["Left", "Right"]) {
    const fore = joints.findIndex((j) => new RegExp(`(^|:)${side}ForeArm$`).test(j.getName()))
    const [node, hand] = [joints[fore], joints.find((j) => new RegExp(`(^|:)${side}Hand$`).test(j.getName()))]
    if (!node || !hand) continue
    const reach = hand.getTranslation()
    const axis = reach.map((v) => v / (Math.hypot(...reach) || 1))
    const roll = doc.createNode(`${node.getName()}Roll`)
    node.addChild(roll)
    skin.addJoint(roll)
    binds.push(...binds.slice(fore * 16, fore * 16 + 16))
    const [from, to] = [node.getWorldMatrix().slice(12, 15), hand.getWorldMatrix().slice(12, 15)]
    const along = [0, 1, 2].map((k) => to[k] - from[k])
    made.push({ fore, roll: joints.length + made.length, from, along, long: Math.hypot(...along) ** 2 })
    const [foreRest, handRest] = [node.getRotation() as Quat, hand.getRotation() as Quat]
    for (const anim of doc.getRoot().listAnimations()) {
      const keys = (of: Node) =>
        anim
          .listChannels()
          .find((c) => c.getTargetNode() === of && c.getTargetPath() === "rotation")
          ?.getSampler()
      const [foreKeys, handKeys] = [keys(node), keys(hand)]
      const [input, foreOut, handOut] = [foreKeys?.getInput(), foreKeys?.getOutput(), handKeys?.getOutput()]
      if (!foreKeys || !handKeys || !input || !foreOut || !handOut || foreOut.getCount() !== handOut.getCount() || handKeys.getInput()?.getCount() !== input.getCount()) continue
      if (foreKeys.getInterpolation() === "CUBICSPLINE" || handKeys.getInterpolation() === "CUBICSPLINE") throw new Error(`${anim.getName()}: a roll bone's keys are made from plain keys, and these are splines`)
      const values = new Float32Array(foreOut.getCount() * 4)
      let before = 0
      for (let i = 0; i < foreOut.getCount(); i++) {
        const [f, h] = [foreOut.getElement(i, [0, 0, 0, 1]) as Quat, handOut.getElement(i, [0, 0, 0, 1]) as Quat]
        // The forearm's roll since its rest, about its own length: out of the forearm, and onto the hand.
        const own = about(qmul(qinv(foreRest), f), axis)
        foreOut.setElement(i, qmul(f, qinv(own)))
        const held = qmul(own, h)
        handOut.setElement(i, held)
        // The hand's roll on the forearm since its rest, about the same line, and a share of it for the new bone.
        const turned = qinv(about(qinv(qmul(held, qinv(handRest))), axis))
        const angle = 2 * Math.atan2(turned[0] * axis[0] + turned[1] * axis[1] + turned[2] * axis[2], turned[3])
        // The same way round as the frame before: a roll that passes half a turn does not come back the other way.
        const wrapped = angle - 2 * Math.PI * Math.round((angle - before) / (2 * Math.PI))
        before = wrapped
        if (Math.abs(wrapped) > most) [most, where] = [Math.abs(wrapped), `${side.toLowerCase()} hand in ${anim.getName()}`]
        // No forearm rolls much past a quarter turn. A clip that asks for more, the bow's drawing hand at 212 degrees
        // with its elbow folded, keeps the rest at the wrist, where it was.
        const half = (Math.max(-REACH, Math.min(REACH, wrapped)) * ROLL) / 2
        values.set([axis[0] * Math.sin(half), axis[1] * Math.sin(half), axis[2] * Math.sin(half), Math.cos(half)], i * 4)
      }
      const sampler = doc.createAnimationSampler().setInput(input).setOutput(doc.createAccessor().setType("VEC4").setArray(values).setBuffer(buffer)).setInterpolation(foreKeys.getInterpolation())
      anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(roll).setTargetPath("rotation").setSampler(sampler))
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
        const whole = [...shares.values()].reduce((sum, share) => sum + share, 0)
        let changed = false
        for (const { fore, roll, from, along, long } of made) {
          const a = shares.get(fore) ?? 0
          if (!a) continue
          // How far down the forearm the point lies: 0 at the elbow, 1 at the wrist.
          const t = Math.max(0, Math.min(1, (along[0] * (p[0] - from[0]) + along[1] * (p[1] - from[1]) + along[2] * (p[2] - from[2])) / long))
          // Only what lies on the arm rolls with it. A sleeve that hangs a hand's breadth under the forearm is cloth,
          // and rolled with the arm it is swung round it.
          const out = Math.hypot(...[0, 1, 2].map((k) => p[k] - from[k] - along[k] * t))
          const on = 1 - eased(out, 0.06 * big, 0.12 * big)
          const given = a * t * t * (3 - 2 * t) * on
          if (given < 1e-4) continue
          shares.set(roll, given)
          shares.set(fore, a - given)
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
          [0, 1, 2, 3].map((k) => ((top[k]?.[1] ?? 0) / total) * whole)
        )
        moved++
      }
    }
  return { moved, most: (most * 180) / Math.PI, where }
}

// The sheet of a figure that holds something may paint that hand closed round a short rod in flat blue (build.ts), so
// the model has a fist made round something. As rig.py does for its own figures, every face the texture colours blue
// is taken out, with whatever the cut leaves loose inside the hand, and the rod's line and width are kept for the prop
// that goes there (packages/stage/src/figures/props.ts wayThrough). Null for a model with no blue on it.
async function unrod(doc: Document) {
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const [pos, uv, idx] = [prim.getAttribute("POSITION"), prim.getAttribute("TEXCOORD_0"), prim.getIndices()]
      const image = prim.getMaterial()?.getBaseColorTexture()?.getImage()
      if (!pos || !uv || !idx || !image) continue
      const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true })
      const blue = (u: number, v: number) => {
        const x = Math.min(info.width - 1, Math.floor((u - Math.floor(u)) * info.width))
        const y = Math.min(info.height - 1, Math.floor((v - Math.floor(v)) * info.height))
        const o = (y * info.width + x) * 3
        return data[o + 2] > 102 && data[o + 2] > 1.7 * Math.max(data[o], data[o + 1]) ? 1 : 0
      }
      const faces = idx.getCount() / 3
      const corners = (f: number) => [idx.getScalar(f * 3), idx.getScalar(f * 3 + 1), idx.getScalar(f * 3 + 2)]
      const at = (i: number) => pos.getElement(i, [0, 0, 0])
      const gone = new Uint8Array(faces)
      const rod: number[][] = []
      for (let f = 0; f < faces; f++) {
        const q = corners(f).map((i) => uv.getElement(i, [0, 0]))
        const c = [(q[0][0] + q[1][0] + q[2][0]) / 3, (q[0][1] + q[1][1] + q[2][1]) / 3]
        if (blue(c[0], c[1]) + q.reduce((n, p) => n + blue(c[0] + (p[0] - c[0]) * 0.6, c[1] + (p[1] - c[1]) * 0.6), 0) < 2) continue
        gone[f] = 1
        for (const i of corners(f)) rod.push(at(i))
      }
      if (rod.length < 60) continue
      const middle = [0, 1, 2].map((k) => rod.reduce((sum, p) => sum + p[k], 0) / rod.length)
      // The way the rod runs: the line its points are spread widest along, upward.
      const cov = [0, 1, 2].map((a) => [0, 1, 2].map((b) => rod.reduce((sum, p) => sum + (p[a] - middle[a]) * (p[b] - middle[b]), 0)))
      let runs = [0.2, 1, 0.2]
      for (let i = 0; i < 60; i++) {
        const next = cov.map((row) => row[0] * runs[0] + row[1] * runs[1] + row[2] * runs[2])
        const long = Math.hypot(...next) || 1
        runs = next.map((v) => v / long)
      }
      if (runs[1] < 0) runs = runs.map((v) => -v)
      const along = (p: number[]) => (p[0] - middle[0]) * runs[0] + (p[1] - middle[1]) * runs[1] + (p[2] - middle[2]) * runs[2]
      const off = (p: number[]) => {
        const a = along(p)
        return Math.hypot(p[0] - middle[0] - a * runs[0], p[1] - middle[1] - a * runs[1], p[2] - middle[2] - a * runs[2])
      }
      const wide = rod.map(off).sort((a, b) => a - b)[Math.floor(rod.length * 0.75)]
      const ends = rod.map(along)
      const [low, high] = [Math.min(...ends), Math.max(...ends)]
      // What the cut leaves joined to nothing, inside where the rod was: its ends, which are not always blue.
      const place = new Map<string, number>()
      const of = new Int32Array(pos.getCount())
      for (let i = 0; i < of.length; i++) {
        const key = at(i)
          .map((v) => v.toFixed(5))
          .join(",")
        of[i] = place.get(key) ?? place.size
        if (of[i] === place.size) place.set(key, of[i])
      }
      const up = Int32Array.from({ length: place.size }, (_, i) => i)
      const top = (i: number) => {
        while (up[i] !== i) {
          up[i] = up[up[i]]
          i = up[i]
        }
        return i
      }
      for (let f = 0; f < faces; f++) {
        if (gone[f]) continue
        const [a, b, c] = corners(f).map((i) => top(of[i]))
        up[b] = a
        up[top(c)] = a
      }
      const sizes = new Map<number, number>()
      const within = new Map<number, boolean>()
      for (let f = 0; f < faces; f++) {
        if (gone[f]) continue
        const part = top(of[idx.getScalar(f * 3)])
        sizes.set(part, (sizes.get(part) ?? 0) + 1)
        const inside = corners(f).every((i) => along(at(i)) > low - 0.03 && along(at(i)) < high + 0.03 && off(at(i)) < wide * 1.6)
        within.set(part, (within.get(part) ?? true) && inside)
      }
      const body = [...sizes].sort((a, b) => b[1] - a[1])[0]?.[0]
      let loose = 0
      const left: number[] = []
      const grip: number[] = []
      for (let f = 0; f < faces; f++) {
        if (gone[f]) continue
        const part = top(of[idx.getScalar(f * 3)])
        if (part !== body && within.get(part)) {
          loose++
          continue
        }
        left.push(...corners(f))
        // The fingers about the rod are where the grip is along it: more of a rod may show at one end.
        for (const i of corners(f)) if (off(at(i)) < wide * 1.8 && along(at(i)) > low && along(at(i)) < high) grip.push(along(at(i)))
      }
      const made = idx.getArray()
      if (!made) continue
      idx.setArray(made instanceof Uint16Array ? Uint16Array.from(left) : Uint32Array.from(left))
      const mid = grip.length ? grip.reduce((sum, a) => sum + a, 0) / grip.length : 0
      return { at: middle.map((v, k) => v + runs[k] * mid), runs, wide, faces: rod.length / 3, loose }
    }
  return null
}

// What blue is left is a fringe on the fingers beside the rod: it takes the colour of the skin about it, as rig.py has
// it. After the face is painted, since that brings the textures in again.
async function unblue() {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const doc = await io.read(`${dir}/lod0.glb`)
  let changed = 0
  for (const texture of new Set(
    doc
      .getRoot()
      .listMaterials()
      .map((m) => m.getBaseColorTexture())
  )) {
    const image = texture?.getImage()
    if (!texture || !image) continue
    const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    const [w, h] = [info.width, info.height]
    const fringe = new Uint8Array(w * h)
    let some = 0
    for (let i = 0; i < w * h; i++)
      if (data[i * 3 + 2] > 77 && data[i * 3 + 2] > 1.25 * Math.max(data[i * 3], data[i * 3 + 1])) {
        fringe[i] = 1
        some++
      }
    if (!some) continue
    let spread = fringe.slice()
    for (let pass = 0; pass < Math.round((6 * w) / 2048); pass++) {
      const grown = spread.slice()
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = y * w + x
          if (spread[i]) continue
          if ((x > 0 && spread[i - 1]) || (x < w - 1 && spread[i + 1]) || (y > 0 && spread[i - w]) || (y < h - 1 && spread[i + w])) grown[i] = 1
        }
      spread = grown
    }
    const tones = [0, 1, 2].map(() => new Uint32Array(256))
    let about = 0
    for (let i = 0; i < w * h; i++)
      if (spread[i] && !fringe[i]) {
        about++
        for (let k = 0; k < 3; k++) tones[k][data[i * 3 + k]]++
      }
    if (!about) continue
    const skin = tones.map((t) => {
      let seen = 0
      return t.findIndex((n) => (seen += n) >= about / 2)
    })
    for (let i = 0; i < w * h; i++) if (fringe[i]) for (let k = 0; k < 3; k++) data[i * 3 + k] = skin[k]
    // And the rod's blue was in the light on the hand that held it: the skin about it came out lilac. Skin is never
    // bluer than it is green, so on what lies close about the rod's line the blue is brought under.
    const way = doc
      .getRoot()
      .listNodes()
      .map((n) => n.getExtras().tunnel)
      .find((t): t is number[] => Array.isArray(t) && t.length >= 7)
    for (const prim of way
      ? doc
          .getRoot()
          .listMeshes()
          .flatMap((m) => m.listPrimitives())
          .filter((p) => p.getMaterial()?.getBaseColorTexture() === texture)
      : []) {
      const [pos, uv, idx] = [prim.getAttribute("POSITION"), prim.getAttribute("TEXCOORD_0"), prim.getIndices()]
      if (!way || !pos || !uv || !idx) continue
      for (let f = 0; f < idx.getCount(); f += 3) {
        const corners = [idx.getScalar(f), idx.getScalar(f + 1), idx.getScalar(f + 2)]
        const c = [0, 1, 2].map((k) => corners.reduce((sum, i) => sum + pos.getElement(i, [0, 0, 0])[k], 0) / 3 - way[k])
        const along = c[0] * way[3] + c[1] * way[4] + c[2] * way[5]
        if (Math.abs(along) > 0.17 || Math.hypot(c[0] - along * way[3], c[1] - along * way[4], c[2] - along * way[5]) > 0.15) continue
        const at = corners.map((i) => uv.getElement(i, [0, 0]).map((v) => v - Math.floor(v)))
        const [x0, x1] = [Math.max(0, Math.floor(Math.min(...at.map((q) => q[0])) * w) - 1), Math.min(w, Math.ceil(Math.max(...at.map((q) => q[0])) * w) + 2)]
        const [y0, y1] = [Math.max(0, Math.floor(Math.min(...at.map((q) => q[1])) * h) - 1), Math.min(h, Math.ceil(Math.max(...at.map((q) => q[1])) * h) + 2)]
        if (x1 - x0 > w / 5 || y1 - y0 > h / 5) continue
        for (let y = y0; y < y1; y++)
          for (let x = x0; x < x1; x++) {
            const o = (y * w + x) * 3
            if (data[o + 2] > 0.9 * data[o + 1]) data[o + 2] = Math.min(data[o + 2], Math.round(data[o + 1] * 0.84))
          }
      }
    }
    const out = sharp(data, { raw: { width: w, height: h, channels: 3 } })
    texture.setImage(await (texture.getMimeType() === "image/webp" ? out.webp({ quality: 92 }) : out.png()).toBuffer())
    changed += some
  }
  if (changed) await io.write(`${dir}/lod0.glb`, doc)
  return changed
}

// A point the rigger gave wholly to a bone that nothing joined to it has any share in: one left out of the skinning,
// which the file then gives to its first bone, the hips. It stays where the hips are while the hand it is part of
// moves away, and draws a spike from one to the other. It takes the shares of the points it is joined to.
function strays(doc: Document) {
  let patched = 0
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const [pos, J, W, idx] = [prim.getAttribute("POSITION"), prim.getAttribute("JOINTS_0"), prim.getAttribute("WEIGHTS_0"), prim.getIndices()]
      if (!pos || !J || !W || !idx) continue
      const place = new Map<string, number>()
      const of = new Int32Array(pos.getCount())
      for (let i = 0; i < of.length; i++) {
        const key = pos
          .getElement(i, [0, 0, 0])
          .map((v) => v.toFixed(5))
          .join(",")
        of[i] = place.get(key) ?? place.size
        if (of[i] === place.size) place.set(key, of[i])
      }
      const joined = Array.from({ length: place.size }, () => new Set<number>())
      for (let f = 0; f < idx.getCount(); f += 3) {
        const [a, b, c] = [of[idx.getScalar(f)], of[idx.getScalar(f + 1)], of[idx.getScalar(f + 2)]]
        for (const [x, y] of [
          [a, b],
          [b, c],
          [c, a],
        ])
          if (x !== y) {
            joined[x].add(y)
            joined[y].add(x)
          }
      }
      const shares = Array.from({ length: place.size }, () => new Map<number, number>())
      for (let i = 0; i < of.length; i++) {
        const [j, w] = [J.getElement(i, [0, 0, 0, 0]), W.getElement(i, [0, 0, 0, 0])]
        for (let k = 0; k < 4; k++) if (w[k] > 0) shares[of[i]].set(j[k], Math.max(shares[of[i]].get(j[k]) ?? 0, w[k]))
      }
      for (let i = 0; i < of.length; i++) {
        const [j, w] = [J.getElement(i, [0, 0, 0, 0]), W.getElement(i, [0, 0, 0, 0])]
        const k = w.indexOf(Math.max(...w))
        if (w[k] < 0.99 || !joined[of[i]].size) continue
        const about = new Map<number, number>()
        for (const n of joined[of[i]]) for (const [bone, share] of shares[n]) about.set(bone, (about.get(bone) ?? 0) + share)
        if ((about.get(j[k]) ?? 0) > 0.01) continue
        const top = [...about].sort((x, y) => y[1] - x[1]).slice(0, 4)
        const total = top.reduce((sum, [, share]) => sum + share, 0)
        if (!total) continue
        J.setElement(
          i,
          [0, 1, 2, 3].map((n) => top[n]?.[0] ?? 0)
        )
        W.setElement(
          i,
          [0, 1, 2, 3].map((n) => (top[n]?.[1] ?? 0) / total)
        )
        patched++
      }
    }
  return patched
}

// A model made one unit tall given its character's height, in metres: Rodin's comes at a person's height and Hi3D's
// comes 1 tall, and the steps after this one reach by centimetres, as do the weapons put in its hands. Points, bones,
// the bind and every clip's travel are all made as many times larger. Returns how many times, or null if it was near.
function sized(doc: Document, height: number) {
  const root = doc.getRoot()
  const prims = root.listMeshes().flatMap((m) => m.listPrimitives())
  let [low, high] = [Infinity, -Infinity]
  for (const prim of prims) {
    const pos = prim.getAttribute("POSITION")
    for (let i = 0; pos && i < pos.getCount(); i++) {
      const y = pos.getElement(i, [0, 0, 0])[1]
      low = Math.min(low, y)
      high = Math.max(high, y)
    }
  }
  const times = height / (high - low)
  if (!Number.isFinite(times) || Math.abs(times - 1) < 0.15) return null
  const grow = (accessor: Accessor | null, at: (i: number) => boolean) => {
    const a = accessor?.getArray()
    if (!accessor || !a) return
    for (let i = 0; i < a.length; i++) if (at(i)) a[i] *= times
    accessor.setArray(a)
  }
  for (const pos of new Set(prims.map((prim) => prim.getAttribute("POSITION")))) grow(pos, () => true)
  for (const node of root.listNodes()) node.setTranslation(node.getTranslation().map((v) => v * times) as [number, number, number])
  // A bind matrix keeps where the mesh stood from its bone in its last column.
  for (const bind of new Set(root.listSkins().map((skin) => skin.getInverseBindMatrices()))) grow(bind, (i) => i % 16 >= 12 && i % 16 < 15)
  const travels = root.listAnimations().flatMap((anim) => anim.listChannels().filter((ch) => ch.getTargetPath() === "translation").map((ch) => ch.getSampler()?.getOutput() ?? null))
  for (const out of new Set(travels)) grow(out, () => true)
  return times
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
        // "~8" after a part: eased into over eight frames from where the part before it stopped, not the usual three.
        const [whole, ease] = part.trim().split("~")
        const [spec, cut] = whole.split("@")
        const [file, clip] = spec.split(":")
        const [start, end] = (cut ?? "").split("-").map(Number)
        return { library: await library(file), clip, from: cut ? start : undefined, to: cut ? end : undefined, ease: ease ? Number(ease) : undefined }
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
  // A beast, not a person (build.ts asks for its sheet as an animal): its head's skin is given to the head bone.
  creature?: boolean
  // Who makes it: Tripo then Meshy (the default), or Rodin or Hi3D then Hyper3D's rigging.
  maker?: "rodin" | "hi3d"
  // A figure whose model and sheet this one takes in place of its own. Meshy's rig and clips alone are paid for.
  body?: string
  // Clips copied from another skeleton's library, each by the name it is played by: "ual1:Sword_Attack".
  borrowed?: Record<string, string>
  // How Hyper3D shares the skin among its bones: "core" unless said.
  skinning?: "core" | "shell"
  // What it carries at all times, a staff: left on the skeleton for the prop built in its hand (hold.ts `carry`).
  holds?: { what: string; hand?: "L" | "R"; length?: number }
  // The bow shots drawn to the jaw, and when each is at its full draw, in seconds: { "Shoot": { "until": 1.5 } }.
  drawn?: Record<string, { until: number }>
  // The most an arm is raised in a clip, in degrees up from hanging: { "Swing": 85 }.
  eased?: Record<string, number>
  // The head held higher in a clip, in degrees and never past level: { "Idle Heavy": 30 }.
  chin?: Record<string, number>
  // What is lit from within: texels of a hue between two, in degrees, giving off their colour so many times over.
  // An owlbear's amber eyes are { "hue": [20, 55], "strength": 3 }.
  lit?: { hue: [number, number]; strength: number }
  // False to leave out the bones between arm and trunk, for a figure kept to measure against.
  helpers?: boolean
  // The share of its gloss a figure keeps where it is not metal, of 1: 0.5 makes a roughness of 0.6 one of 0.8.
  gloss?: number
  // "smooth" to smooth the model's own lids away, for a model made with lids heavy enough to hide the painted eyes.
  lids?: "smooth"
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

// The model's own lids smoothed away (its brief's `lids`), so the painted eyes are what is seen. Hi3D made Poppen with
// thick upper lids and a sunken bag under each eye, and in the game's light those shapes were a pair of sleepy slits
// in rings of shadow, however the eyes were painted (the owner, 2026-11-23: "too small and weird looking"). About each
// eye that face.py found on the model, the front of the face is smoothed pass after pass, most at the eye and none at
// the edge, and the paint, which lies where the eye is seen from the front, stays where it was.
async function lidless(brief: Brief) {
  const from = home(brief)
  const spec = await kept<{ height: number; sole?: number; joints: Record<string, [number, number]> }>(`${from}/joints.json`)
  const eyes = (await kept<{ ownEyes?: [number, number, number, number][] }>(`${from}/face.json`))?.ownEyes
  const middle = (await kept<{ faceFromSheet?: { sheetMiddle?: number } }>(`${dir}/pilot/paint/paint.json`))?.faceFromSheet?.sheetMiddle
  if (!spec || !eyes?.length || middle === undefined) return null
  // The sheet's measures, as rig.py takes them, and the model in paint.py's frame: on the ground, its crown at the
  // middle, as tall as the sheet's figure.
  const J = spec.joints
  const bottom = Math.max(J.toeL[1], J.toeR[1]) + (spec.sole ?? 6)
  const px = spec.height / (bottom - J.headTop[1])
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const doc = await io.read(`${dir}/lod0.glb`)
  const prim = doc
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .sort((a, b) => (b.getAttribute("POSITION")?.getCount() ?? 0) - (a.getAttribute("POSITION")?.getCount() ?? 0))[0]
  const pos = prim?.getAttribute("POSITION")
  if (!prim || !pos) return null
  // Points at one position are one place, as in spread().
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
  const ys = at.map((p) => p[1])
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)]
  const crown = at.filter((p) => p[1] > y0 + 0.92 * (y1 - y0))
  const cx = crown.reduce((s, p) => s + p[0], 0) / crown.length
  const scale = spec.height / (y1 - y0)
  const sheetOf = (p: number[]) => [middle + ((p[0] - cx) * scale) / px, bottom - ((p[1] - y0) * scale) / px]
  // How much each place is smoothed: inside an oval about each eye, from the brow to under the bag, most at the eye and
  // none at the edge, so the smoothed skin meets the rest without a step. Only the face's front is smoothed: not the
  // nose beside the eye, which stands out past the lid, nor the back of the head behind the same oval.
  const pull = new Float32Array(at.length)
  for (const [ex, ey, rx] of eyes) {
    const reach = (p: number) => {
      const [sx, sy] = sheetOf(at[p])
      return Math.hypot((sx - ex) / (LIDS.wide * rx), (sy - ey) / ((sy < ey ? LIDS.up : LIDS.down) * rx))
    }
    const near: number[] = []
    let front = -Infinity
    for (let p = 0; p < at.length; p++) {
      const d = reach(p)
      if (d >= 1) continue
      near.push(p)
      if (d < 0.35) front = Math.max(front, at[p][2])
    }
    const metres = (rx * px) / scale
    for (const p of near) {
      if (at[p][2] < front - 3 * metres || at[p][2] > front + 0.5 * metres) continue
      const t = Math.min(1, Math.max(0, (1 - reach(p)) / LIDS.soft))
      pull[p] = Math.max(pull[p], t * t * (3 - 2 * t))
    }
  }
  const index = prim.getIndices()
  const corners = index ? index.getCount() : pos.getCount()
  const tris: number[][] = []
  const beside = at.map(() => new Set<number>())
  for (let t = 0; t < corners; t += 3) {
    const tri = [0, 1, 2].map((k) => of[index ? index.getScalar(t + k) : t + k])
    tris.push(tri)
    if (!pull[tri[0]] && !pull[tri[1]] && !pull[tri[2]]) continue
    for (const [x, y] of [
      [tri[0], tri[1]],
      [tri[1], tri[2]],
      [tri[2], tri[0]],
    ])
      if (x !== y) {
        beside[x].add(y)
        beside[y].add(x)
      }
  }
  const moving = [...pull.keys()].filter((p) => pull[p] > 0 && beside[p].size)
  for (let pass = 0; pass < LIDS.passes; pass++) {
    // In depth alone: a point that slid across the face would carry its paint with it, and the painted eye was laid
    // on where each point is seen from the front.
    const next = moving.map((p) => {
      let mean = 0
      for (const q of beside[p]) mean += at[q][2] / beside[p].size
      return at[p][2] + (mean - at[p][2]) * 0.5 * pull[p]
    })
    moving.forEach((p, i) => {
      at[p] = [at[p][0], at[p][1], next[i]]
    })
  }
  // Each point moved, and the bend of the skin about them made again from the triangles they are in.
  const touched = new Set(moving)
  for (const p of moving) for (const q of beside[p]) touched.add(q)
  const normal = new Map<number, number[]>()
  for (const [a, b, c] of tris) {
    if (!touched.has(a) && !touched.has(b) && !touched.has(c)) continue
    const [u, v] = [at[b].map((x, k) => x - at[a][k]), at[c].map((x, k) => x - at[a][k])]
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    for (const p of [a, b, c]) if (touched.has(p)) normal.set(p, (normal.get(p) ?? [0, 0, 0]).map((x, k) => x + n[k]))
  }
  const normals = prim.getAttribute("NORMAL")
  let deepest = 0
  for (let i = 0; i < pos.getCount(); i++) {
    const p = of[i]
    if (!touched.has(p)) continue
    deepest = Math.max(deepest, Math.hypot(...pos.getElement(i, [0, 0, 0]).map((v, k) => v - at[p][k])))
    pos.setElement(i, at[p])
    const n = normal.get(p)
    const length = n ? Math.hypot(...n) : 0
    if (normals && n && length > 0) normals.setElement(i, n.map((x) => x / length))
  }
  await io.write(`${dir}/lod0.glb`, doc)
  return { places: moving.length, mm: Math.round(deepest * scale * 10000) / 10 }
}

// How the lids are smoothed: the oval about each eye in the eye's half widths, across, up to the brow and down past the
// bag, the share of it eased in from its edge, and how many passes. Each pass moves a point half way to the middle of
// its neighbours, where the pull is whole. Poppen's lid stood out as high as two half widths over his eye's middle.
const LIDS = { wide: 1.7, up: 2.6, down: 1.6, soft: 0.6, passes: 200 }

// A figure's gloss turned down where it is not metal (its brief's `gloss`). Hi3D gives leather a roughness of 0.6 and
// an eye one of 0.2: in a lit room the leather is wet and the eyes are chrome. Buckles and hilts keep theirs.
async function dull(keeps: number) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const doc = await io.read(`${dir}/lod0.glb`)
  let texels = 0
  for (const texture of new Set(
    doc
      .getRoot()
      .listMaterials()
      .map((m) => m.getMetallicRoughnessTexture())
  )) {
    const image = texture?.getImage()
    if (!texture || !image) continue
    // Green is the roughness and blue the metal, as glTF keeps them.
    const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    for (let i = 0; i < data.length; i += info.channels) {
      const bare = 1 - Math.min(1, data[i + 2] / 128)
      const rough = 255 - (255 - data[i + 1]) * keeps
      data[i + 1] = Math.round(data[i + 1] + (rough - data[i + 1]) * bare)
    }
    texels += info.width * info.height
    doc.createExtension(EXTTextureWebP).setRequired(true)
    texture.setImage(await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).webp({ quality: 92 }).toBuffer()).setMimeType("image/webp")
  }
  await io.write(`${dir}/lod0.glb`, doc)
  return texels
}

// Eyes lit from within. A beast met in a dark wood is known by its eyes, and a model's colour has no light of its
// own: Hi3D's owlbear has amber eyes that the night's light leaves as dull as its fur (the owner, 2026-11-20). Texels
// of the brief's hue, strong in colour and not dark, give off their own colour that many times over: the game and
// the page add it to whatever light falls on them. Returns how many texels are lit.
async function lit(hue: [number, number], strength: number) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const doc = await io.read(`${dir}/lod0.glb`)
  let texels = 0
  for (const material of doc.getRoot().listMaterials()) {
    const image = material.getBaseColorTexture()?.getImage()
    if (!image) continue
    const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    const mask = Buffer.alloc(info.width * info.height)
    for (let i = 0, p = 0; i < data.length; i += info.channels, p++) {
      const [r, g, b] = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255]
      const [most, least] = [Math.max(r, g, b), Math.min(r, g, b)]
      if (most < 0.25 || (most - least) / most < 0.6) continue
      const at = (60 * (most === r ? (g - b) / (most - least) : most === g ? 2 + (b - r) / (most - least) : 4 + (r - g) / (most - least)) + 360) % 360
      if (at < hue[0] || at > hue[1]) continue
      mask[p] = 255
      texels++
    }
    if (!texels) continue
    // The edge of what is lit is softened by a few texels, and the colour is the model's own.
    // sharp hands a blurred one-channel mask back as three: one channel is taken, or a texel reads the mask a third of the way to it.
    const soft = await sharp(mask, { raw: { width: info.width, height: info.height, channels: 1 } }).blur(2).extractChannel(0).raw().toBuffer()
    const glow = Buffer.alloc(info.width * info.height * 3)
    for (let p = 0; p < soft.length; p++) for (let k = 0; k < 3; k++) glow[p * 3 + k] = Math.round((data[p * info.channels + k] * soft[p]) / 255)
    doc.createExtension(EXTTextureWebP).setRequired(true)
    const texture = doc
      .createTexture("glow")
      .setImage(await sharp(glow, { raw: { width: info.width, height: info.height, channels: 3 } }).webp({ quality: 92 }).toBuffer())
      .setMimeType("image/webp")
    // A strength over 1 is its own extension in glTF. The game's night is dim and its exposure low: an eye wants
    // about three times its own colour to show there.
    material
      .setEmissiveTexture(texture)
      .setEmissiveFactor([1, 1, 1])
      .setExtension("KHR_materials_emissive_strength", doc.createExtension(KHRMaterialsEmissiveStrength).createEmissiveStrength().setEmissiveStrength(strength))
  }
  if (texels) await io.write(`${dir}/lod0.glb`, doc)
  return texels
}

// The lighter copies, as rig.py makes them for its figures: the game stands the middle one when more than three
// figures share a scene (play.ts), and the desktop app bundles it. Skin, skeleton and clips are lod0's own.
const LODS: [file: string, triangles: number, texture: number][] = [
  ["lod1.glb", 20000, 1024],
  ["lod2.glb", 6000, 512],
]
const triangles = (doc: Document) =>
  doc
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .reduce((sum, p) => sum + (p.getIndices()?.getCount() ?? p.getAttribute("POSITION")?.getCount() ?? 0) / 3, 0)
const widest = (doc: Document) =>
  Math.max(
    0,
    ...doc
      .getRoot()
      .listTextures()
      .map((t) => t.getSize()?.[0] ?? 0)
  )
// The gaps between the pieces a texture is cut into, filled with the colour of the piece nearest. A generator leaves
// them dark, and a texture made smaller blends each piece's edge with the dark beside it: a line down Lyra's cheek and
// from her mouth to her chin in the middle copy, where the full one is clean (the owner, 2026-11-23, of her face in
// the game). Done to each texture at full size, before it is made smaller.
async function padded(doc: Document) {
  const uses = new Map<Texture, Primitive[]>()
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const m = prim.getMaterial()
      if (!m || !prim.getAttribute("TEXCOORD_0")) continue
      for (const t of [m.getBaseColorTexture(), m.getNormalTexture(), m.getMetallicRoughnessTexture(), m.getOcclusionTexture(), m.getEmissiveTexture()])
        if (t) uses.set(t, [...(uses.get(t) ?? []), prim])
    }
  for (const [texture, prims] of uses) {
    const image = texture.getImage()
    if (!image) continue
    const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const W = info.width
    const H = info.height
    // Each texel a triangle covers, and those a little past its edges, so a thin one is not lost.
    const covered = new Uint8Array(W * H)
    for (const prim of prims) {
      const uv = prim.getAttribute("TEXCOORD_0")?.getArray()
      if (!uv) continue
      const idx = prim.getIndices()?.getArray()
      const count = idx ? idx.length : uv.length / 2
      for (let i = 0; i + 2 < count; i += 3) {
        const [a, b, c] = idx ? [idx[i], idx[i + 1], idx[i + 2]] : [i, i + 1, i + 2]
        const [x0, y0, x1, y1, x2, y2] = [uv[a * 2] * W, uv[a * 2 + 1] * H, uv[b * 2] * W, uv[b * 2 + 1] * H, uv[c * 2] * W, uv[c * 2 + 1] * H]
        const lx = Math.max(0, Math.floor(Math.min(x0, x1, x2)) - 1)
        const hx = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)) + 1)
        const ly = Math.max(0, Math.floor(Math.min(y0, y1, y2)) - 1)
        const hy = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)) + 1)
        const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
        const slack = Math.abs(area) < 1e-9 ? Infinity : 0.75 / Math.sqrt(Math.abs(area))
        for (let y = ly; y <= hy; y++)
          for (let x = lx; x <= hx; x++) {
            if (slack === Infinity) {
              covered[y * W + x] = 1
              continue
            }
            const b1 = ((x + 0.5 - x0) * (y2 - y0) - (x2 - x0) * (y + 0.5 - y0)) / area
            const b2 = ((x1 - x0) * (y + 0.5 - y0) - (x + 0.5 - x0) * (y1 - y0)) / area
            if (b1 >= -slack && b2 >= -slack && 1 - b1 - b2 >= -slack) covered[y * W + x] = 1
          }
      }
    }
    // Outward from every covered texel, one ring at a time, until the gaps are full.
    const queue = new Int32Array(W * H)
    let tail = 0
    for (let p = 0; p < W * H; p++) if (covered[p]) queue[tail++] = p
    for (let head = 0; head < tail; head++) {
      const p = queue[head]
      const x = p % W
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) {
        if (q < 0 || q >= W * H || covered[q]) continue
        covered[q] = 1
        data.copyWithin(q * 4, p * 4, p * 4 + 4)
        queue[tail++] = q
      }
    }
    const png = await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 1 }).toBuffer()
    texture.setImage(new Uint8Array(png)).setMimeType("image/png")
  }
}

async function thin() {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  await MeshoptSimplifier.ready
  const megabytes = async (file: string) => Math.round(((await stat(`${dir}/${file}`)).size / 1048576) * 100) / 100
  const full = await io.read(`${dir}/lod0.glb`)
  // A figure with no face painted on still has the generator's textures as PNG, 13 MB of an owlbear's 18: they are
  // packed as a painted figure's are, at their own size.
  // Hi3D's are 8192 across, a third of a gigabyte each on a graphics card: no figure keeps one wider than 4096.
  const wide = widest(full) > 4096
  if (
    wide ||
    full
      .getRoot()
      .listTextures()
      .some((t) => t.getMimeType() !== "image/webp")
  ) {
    full.createExtension(EXTTextureWebP).setRequired(true)
    await full.transform(textureCompress({ encoder: sharp, targetFormat: "webp", quality: 92, ...(wide ? { resize: [4096, 4096] as [number, number] } : {}) }))
    await io.write(`${dir}/lod0.glb`, full)
  }
  const rows = [{ file: "lod0.glb", triangles: triangles(full), megabytes: await megabytes("lod0.glb"), texture: widest(full) }]
  for (const [file, most, texture] of LODS) {
    const doc = await io.read(`${dir}/lod0.glb`)
    const ratio = Math.min(1, most / Math.max(1, triangles(doc)))
    await padded(doc)
    await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.02 }), textureCompress({ encoder: sharp, resize: [texture, texture], targetFormat: "webp", quality: 85 }))
    await io.write(`${dir}/${file}`, doc)
    rows.push({ file, triangles: triangles(doc), megabytes: await megabytes(file), texture: widest(doc) })
  }
  return rows
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
// Hi3D v3.0 from views given by name. It makes no fewer than 100,000 faces and says 2,000,000 serve it best: 200,000
// is four times Rodin's, and the copies for a crowd are thinned from it as any figure's are.
const HI3D = { endpoint: "hitem3d/hi3d/v3.0/multi-view-to-3d", cost: 2.1, faces: 200_000 }
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

// Rodin's model, or Hi3D's, from the sheet's front and back, in an A-pose, rigged by Hyper3D with its stock clips, each
// renamed to the name the game plays it by. Returns the clips it has.
async function rodinHyper(brief: Brief) {
  // A brief with a body takes that figure's sheet, model and picks, and is rigged again on its own.
  const from = home(brief)
  const hi3d = (brief.body ? await kept<Brief>(`${from}/character.json`) : brief)?.maker === "hi3d"
  const maker = hi3d ? { name: "Hi3D v3.0 on fal", cost: HI3D.cost } : { name: "Rodin Gen-2.5 on fal", cost: RODIN.cost }
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
  const owed = (model ? 0 : maker.cost) + (rig ? 0 : HYPER.cost)
  if (owed > 0 && !pay) {
    const had = model ? `the model kept${brief.body ? ` from ${brief.body}` : ""}` : `the model $${maker.cost.toFixed(2)} from ${views.length} views (${maker.name})`
    say("cost", `$${owed.toFixed(2)} to make: ${had}, the rig (${skinning} skinning) and its clips $${HYPER.cost.toFixed(2)}. Look over ${from}/pilot-picks.json, then run again with --pay`)
    return null
  }
  if (!model) {
    const images = await Promise.all(views.map(async (f) => dataUri(await sharp(`${from}/${f}`).png().toBuffer())))
    model = hi3d
      ? await fal<RodinAnswer>(`pilot model ${id}`, HI3D.endpoint, {
          front_image_url: images[0],
          ...(images[1] ? { back_image_url: images[1] } : {}),
          resolution: "2048quality",
          face_count: HI3D.faces,
          enable_texture: true,
          enable_pbr: true,
          // How much of the light painted into the pictures is taken out of the colour: its own default.
          shading: 0.5,
          export_format: "glb",
        })
      : await fal<RodinAnswer>(`pilot model ${id}`, RODIN.endpoint, {
          image_urls: images,
          prompt: brief.who,
          tier: "Gen-2.5-High",
          quality_mesh_option: "50K Triangle",
          material: "PBR",
          geometry_file_format: "glb",
          TAPose: true,
        })
    await writeFile(`${dir}/pilot-model.json`, `${JSON.stringify(model, null, 2)}\n`)
    say("model", `made, $${maker.cost.toFixed(2)}`)
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
  const times = sized(doc, brief.height ?? 1.8)
  if (times) say("sized", `${times.toFixed(2)} times larger, to stand ${brief.height} m`)
  inPlace(doc)
  const way = brief.holds ? await unrod(doc) : null
  if (way) say("rod", `${way.faces} blue faces cut from the hand and ${way.loose} left loose by it, a way ${(way.wide * 200).toFixed(1)} cm wide`)
  const stray = strays(doc)
  if (stray) say("strays", `${stray} points the rigger left out of the skinning given the shares of those about them`)
  smooth(doc)
  // The rigger gave Hi3D's model back with three points of its own to every triangle, 600,000 for 105,000 places and
  // 49 MB of them. With one normal to a place, points that are the same in every way are made one again.
  await doc.transform(weld())
  // `--sixth=off` leaves a hand with a finger too many as the generator made it.
  if (!args.includes("--sixth=off")) for (const line of sixth(doc)) say("sixth", line)
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
  for (const [name, degrees] of Object.entries(brief.chin ?? {})) {
    const lifted = chin(doc, name, degrees)
    say("chin", lifted ? `${name}: the face looked ${lifted[0].toFixed(0)}° under level at its lowest, and is lifted by up to ${lifted[1].toFixed(0)}°` : `${name}: no such clip, or no neck and head keyed in it`)
  }
  // `--elbows=off` leaves each elbow as its clip has it, and `--hang=off` each finger as it was modelled.
  const bent = args.includes("--elbows=off") ? null : elbows(doc)
  if (bent) say("elbows", `${bent.moved} keys moved: an elbow went ${bent.past.toFixed(0)}° past straight (the ${bent.where}), and no arm near straight is under ${FLOOR}° now`)
  const hung = args.includes("--hang=off") ? 0 : hang(doc, brief.holds?.hand ?? (brief.holds ? "R" : undefined))
  if (hung) say("hang", `fingers closed by up to ${hung.toFixed(0)}° a joint, to a hand at ease`)
  // The measures of a hand and an arm are a person's, 1.8 m tall: an owlbear's are near twice those and a halfling's
  // little over half.
  const big = (brief.height ?? 1.8) / 1.8
  const cloth = fingersOnly(doc, brief.holds ? (brief.holds.hand ?? "R") : undefined, big)
  if (cloth) say("fingers", `${cloth} points that are no finger or no hand taken off those bones, and given to the hand or the forearm`)
  // A beast's head is its head bone's: `--crown=off` leaves it shared as the rigger had it.
  const crowned = brief.creature && !args.includes("--crown=off") ? crown(doc) : 0
  if (crowned) say("crown", `${crowned} points of the head given to the head bone`)
  // `--helpers=off` leaves the skeleton as the rigger made it, to measure against.
  if (!args.includes("--helpers=off") && brief.helpers !== false) say("helpers", `${helpers(doc)} points hung on a bone between arm and trunk`)
  // `--rolls=off` leaves a forearm's roll at the elbow, to measure against.
  const rolled = args.includes("--rolls=off") ? null : rolls(doc, big)
  if (rolled) say("rolls", `${rolled.moved} points hung on a bone that rolls with the hand, which rolls ${rolled.most.toFixed(0)}° at the most (the ${rolled.where})`)
  // What the brief says it carries, as rig.py leaves it on its skeleton: "staff:R:2.1".
  const hips = doc
    .getRoot()
    .listSkins()[0]
    ?.listJoints()
    .find((j) => /hips$/i.test(j.getName()))
  if (brief.holds && hips) {
    hips.setExtras({
      ...hips.getExtras(),
      holds: `${brief.holds.what}:${brief.holds.hand ?? "R"}:${brief.holds.length ?? 2}${way ? ":rod" : ""}`,
      ...(way ? { tunnel: [...way.at, ...way.runs, way.wide] } : {}),
    })
    say("holds", `a ${brief.holds.what} in the ${brief.holds.hand === "L" ? "left" : "right"} hand, ${brief.holds.length ?? 2} m`)
  }
  await io.write(`${dir}/lod0.glb`, doc)
  const order = ["Idle", "Walk", "Shoot", "Swing", "Dodge", "Sidestep", "Hit", "Fall"]
  made.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
  return {
    rod: !!way,
    clips: made,
    rest: all,
    generator: `${maker.name}, rigged by Hyper3D${skinning === "shell" ? " with shell skinning" : ""}`,
    weights: "hyper3d",
    cost: maker.cost + HYPER.cost,
  }
}

async function main() {
  if (!id) throw new Error("Name a character: pnpm assets:pilot <id>")
  // `--lods` makes the lighter copies again from the lod0.glb there is, and nothing else.
  if (args.includes("--lods")) {
    const was = await kept<{ lods?: unknown; source?: { built?: string } }>(`${dir}/figure.json`)
    if (!was || !existsSync(`${dir}/lod0.glb`)) throw new Error(`No figure in ${dir}: pnpm assets:fetch ${id} first`)
    const lods = await thin()
    say("lods", lods.map((l) => `${l.file} ${l.triangles} triangles, ${l.megabytes} MB`).join(", "))
    await writeFile(`${dir}/figure.json`, `${JSON.stringify({ ...was, lods }, null, 2)}\n`)
    return
  }
  const brief =JSON.parse(await readFile(`${dir}/character.json`, "utf8")) as Brief
  const sheet = `${home(brief)}/apose-front.png`
  if (!existsSync(sheet)) throw new Error(`No sheet: run pnpm assets ${brief.body ?? id} first, and look at ${home(brief)}/sheet.png`)
  // The day its model was made is kept through every time it is put together again: a trial's is its rig's.
  const before = existsSync(`${dir}/${brief.body ? "pilot-rig.json" : "pilot-model.json"}`) ? await kept<{ source?: { made?: string } }>(`${dir}/figure.json`) : null
  const today = new Date().toISOString().slice(0, 10)
  const motion = (await kept<{ motion?: unknown }>(`${dir}/figure.json`))?.motion
  const made = brief.maker === "rodin" || brief.maker === "hi3d" ? await rodinHyper(brief) : await tripoMeshy(brief)
  if (!made) return
  say("merge", `${dir}/lod0.glb with ${made.clips.join(", ")}`)
  const painted = await face(brief, made.rest)
  if (painted) say("face", `the sheet's, ${painted.fitted ? "fitted to the model's own" : "not fitted"}, ${painted.texels} texels`)
  if (painted && brief.lids === "smooth") {
    const smoothed = await lidless(brief)
    say("lids", smoothed ? `${smoothed.places} points about the eyes smoothed, moved ${smoothed.mm} mm at the most` : "no eyes found on the model: run --redo=face")
  }
  if ("rod" in made && made.rod) say("rod", `${await unblue()} texels of blue beside it given the colour of the skin`)
  if (brief.gloss !== undefined && brief.gloss < 1) say("gloss", `${await dull(brief.gloss)} texels keep ${brief.gloss} of it where they are not metal`)
  if (brief.lit) say("lit", `${await lit(brief.lit.hue, brief.lit.strength)} texels of that hue give off their colour ${brief.lit.strength} times over`)

  const lods = await thin()
  say("lods", lods.map((l) => `${l.file} ${l.triangles} triangles, ${l.megabytes} MB`).join(", "))
  const figure = {
    name: brief.name,
    role: brief.role,
    cast: brief.cast,
    party: !!brief.party,
    height: brief.height,
    front: "front.webp",
    // The figure's own picture, once thumbs.ts has taken one of this model.
    ...(before && existsSync(`${dir}/thumb.webp`) ? { thumb: "thumb.webp" } : {}),
    source: { generator: made.generator, triangles: lods[0].triangles, cost: Math.round(made.cost * 100) / 100, made: before?.source?.made ?? today, built: today },
    rig: { bones: 0, weights: made.weights },
    clips: made.clips,
    // How it moves in the game, set by hand: kept through a rebuild.
    ...(motion ? { motion } : {}),
    lods,
  }
  await sharp(sheet).resize({ height: 640 }).webp({ quality: 85 }).toFile(`${dir}/front.webp`)
  await writeFile(`${dir}/figure.json`, `${JSON.stringify({ id, ...figure }, null, 2)}\n`)
  say("shelf", `on the shelf: /settings/realm-of-myr/assets?id=${id}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
