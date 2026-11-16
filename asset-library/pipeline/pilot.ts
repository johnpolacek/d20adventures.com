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
// What it answers, against the figures rig.py makes: whether a shoulder and an elbow keep their shape when an arm is
// raised and folded, whether a hand can close, and whether captured motion reads better than written turns.
//
// Writes, in asset-library/characters/<id>/:
//   pilot-model.json, pilot-rig.json   the generators' answers. With them there, nothing is paid for again.
//   pilot/                             what came back: the rigged model, and one model per clip
//   lod0.glb                           the rigged model with every clip in it, each by the name the game plays it by
//   figure.json                        for the library page: /dev/assets?id=<id>
//
// Each clip is made to play on the spot: the hips keep their height and lose their way across the ground, since the
// stage moves a cast member itself.

import { existsSync } from "node:fs"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { type Accessor, type Document, NodeIO } from "@gltf-transform/core"
import { ALL_EXTENSIONS } from "@gltf-transform/extensions"
import sharp from "sharp"
import { dataUri, fal, fetchBuffer } from "../../lab/stage-art/gen"

const MODEL = { endpoint: "tripo3d/h3.1/image-to-3d", cost: 0.6 }
const RIG = { endpoint: "meshy/rigging/multi-animation", cost: 0.2, clip: 0.12 }
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
const say = (step: string, text: string) => console.log(`${id.padEnd(16)}${step.padEnd(8)}${text}`)
const cost = MODEL.cost + RIG.cost + RIG.clip * CLIPS.length

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

// The hips' way across the ground taken out of a clip, so it plays where the cast member stands.
function inPlace(doc: Document) {
  for (const anim of doc.getRoot().listAnimations())
    for (const ch of anim.listChannels()) {
      if (ch.getTargetPath() !== "translation" || !/hips$/i.test(ch.getTargetNode()?.getName() ?? "")) continue
      const out = ch.getSampler()?.getOutput()
      const a = out?.getArray()
      if (!out || !a || out.getElementSize() !== 3) continue
      const [x0, z0] = [a[0], a[2]]
      for (let i = 0; i < a.length; i += 3) {
        a[i] = x0
        a[i + 2] = z0
      }
      out.setArray(a)
    }
}

// The rigged model, with the clip of each clip file copied in under its name. Channels are matched to the model's
// bones by name: every file is the same rig.
async function merge(rigged: string, clips: [string, string][], to: string) {
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
    inPlace(doc)
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
}

// What came back, fetched again from the kept answers at no charge.
async function fetched(remote: Remote, name: string) {
  await mkdir(`${dir}/pilot`, { recursive: true })
  const file = `${dir}/pilot/${name}.glb`
  if (!existsSync(file) && remote?.url) await writeFile(file, await fetchBuffer(remote.url))
  return existsSync(file) ? file : null
}

// Tripo's model turned to face as the sheet does, rigged by Meshy to a Mixamo skeleton with fingers, with clips from
// Meshy's library merged into it. Returns the clips it has.
async function tripoMeshy(brief: Brief) {
  let model = await kept<ModelAnswer>(`${dir}/pilot-model.json`)
  let rig = await kept<RigAnswer>(`${dir}/pilot-rig.json`)
  const owed = (model ? 0 : MODEL.cost) + (rig ? 0 : RIG.cost + RIG.clip * CLIPS.length)
  if (owed > 0 && !pay) {
    say("cost", `$${owed.toFixed(2)} to make: the model $${MODEL.cost.toFixed(2)}, the rig and ${CLIPS.length} clips $${(RIG.cost + RIG.clip * CLIPS.length).toFixed(2)}. Run again with --pay`)
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
    say("rig", `made, $${(RIG.cost + RIG.clip * CLIPS.length).toFixed(2)}`)
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
  return { clips: await merge(rigged, clips, `${dir}/lod0.glb`), generator: "Tripo H3.1 on fal, rigged by Meshy", weights: "meshy", cost }
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
  const roleOf = new Map<string, string>()
  Object.entries(picks).forEach(([role, stock], i) => {
    roleOf.set(stock, role)
    const named = rig?.animations?.[i]?.action_id
    if (named) roleOf.set(named, role)
  })
  const made: string[] = []
  for (const anim of doc.getRoot().listAnimations()) {
    const role = roleOf.get(anim.getName()) ?? [...roleOf.entries()].find(([stock]) => anim.getName().includes(stock))?.[1]
    if (role) anim.setName(role)
    made.push(anim.getName())
  }
  inPlace(doc)
  await io.write(`${dir}/lod0.glb`, doc)
  const order = ["Idle", "Walk", "Shoot", "Swing", "Dodge", "Hit", "Fall"]
  made.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
  return { clips: made, generator: "Rodin Gen-2.5 on fal, rigged by Hyper3D", weights: "hyper3d", cost: RODIN.cost + HYPER.cost }
}

async function main() {
  if (!id) throw new Error("Name a character: pnpm assets:pilot <id>")
  const brief = JSON.parse(await readFile(`${dir}/character.json`, "utf8")) as Brief
  if (!existsSync(`${dir}/apose-front.png`)) throw new Error(`No sheet: run pnpm assets ${id} first, and look at ${dir}/sheet.png`)
  const made = brief.maker === "rodin" ? await rodinHyper(brief) : await tripoMeshy(brief)
  if (!made) return
  say("merge", `${dir}/lod0.glb with ${made.clips.join(", ")}`)

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
  await sharp(`${dir}/apose-front.png`).resize({ height: 640 }).webp({ quality: 85 }).toFile(`${dir}/front.webp`)
  await writeFile(`${dir}/figure.json`, `${JSON.stringify({ id, ...figure }, null, 2)}\n`)
  say("shelf", `on the shelf: /dev/assets?id=${id}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
