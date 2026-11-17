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
// { "Q Swing": "ual1:Sword_Attack" } is the clip Sword_Attack of asset-library/moves/ual1.glb, played as Q Swing.
// The libraries are Quaternius's Universal Animation Library 1 and 2, CC0, each pack's Unreal-Godot file without
// root motion (UAL1_Standard.glb, UAL2_Standard.glb) put there as ual1.glb and ual2.glb. They are not kept in git.
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
import { type Accessor, type Document, NodeIO } from "@gltf-transform/core"
import { ALL_EXTENSIONS, EXTTextureWebP } from "@gltf-transform/extensions"
import sharp from "sharp"
import { dataUri, fal, fetchBuffer } from "../../lab/stage-art/gen"
import { facing } from "./facing"
import { type Quat, qall, qinv, qmul, qup } from "./quat"
import { retarget } from "./retarget"

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

// A shoulder plate made to hold its shape. A rigger shares the top of a shoulder between the collarbone and the upper
// arm by degrees, which suits skin. Over armour it pulls the cap of a pauldron out after the arm into a wing (the
// owner, 2026-11-16: "the arms do weird things"). On top of each shoulder the share is made steep: a point mostly the
// collarbone's becomes all the collarbone's, one mostly the arm's all the arm's, and the turn is taken in a narrow band
// between, as a plate hinges on its strap. Under the arm the shares are left as they came.
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
          const t = Math.min(1, Math.max(0, (share - PLATE[0]) / (PLATE[1] - PLATE[0])))
          const steep = share + top * (t * t * (3 - 2 * t) - share)
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
// The shares of the upper arm between which a shoulder plate turns: under the first it is the collarbone's alone.
const PLATE = [0.35, 0.65]

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
  const libraries = new Map<string, Document>()
  for (const [name, from] of Object.entries(borrowed)) {
    const [library, clip] = from.split(":")
    const file = `asset-library/moves/${library}.glb`
    if (!libraries.has(library) && existsSync(file)) libraries.set(library, await io.read(file))
    const source = libraries.get(library)
    const long = source ? retarget(base, source, clip, name) : null
    if (long === null) say("borrow", `${name}: ${source ? `no clip ${clip} in ${file}, or no skeleton to play it` : `no ${file}`}`)
    else made.push(name)
  }
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
  const views = ["apose-front.png", "apose-back.png"].filter((f) => existsSync(`${dir}/${f}`))
  let picks = await kept<Record<string, string>>(`${dir}/pilot-picks.json`)
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
  let model = await kept<RodinAnswer>(`${dir}/pilot-model.json`)
  let rig = await kept<HyperAnswer>(`${dir}/pilot-rig.json`)
  const owed = (model ? 0 : RODIN.cost) + (rig ? 0 : HYPER.cost)
  if (owed > 0 && !pay) {
    say(
      "cost",
      `$${owed.toFixed(2)} to make: the model $${RODIN.cost.toFixed(2)} from ${views.length} views, the rig and its clips $${HYPER.cost.toFixed(2)}. Look over ${dir}/pilot-picks.json, then run again with --pay`
    )
    return null
  }
  if (!model) {
    model = await fal<RodinAnswer>(`pilot model ${id}`, RODIN.endpoint, {
      image_urls: await Promise.all(views.map(async (f) => dataUri(await sharp(`${dir}/${f}`).png().toBuffer()))),
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
  if (!model.model_mesh?.url) throw new Error(`No model in ${dir}/pilot-model.json`)
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
      image_url: dataUri(await sharp(`${dir}/apose-front.png`).png().toBuffer()),
      skinning_method: "core",
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
  await io.write(`${dir}/lod0.glb`, doc)
  const order = ["Idle", "Walk", "Shoot", "Swing", "Dodge", "Hit", "Fall"]
  made.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
  return { clips: made, rest: all, generator: "Rodin Gen-2.5 on fal, rigged by Hyper3D", weights: "hyper3d", cost: RODIN.cost + HYPER.cost }
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
