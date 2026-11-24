// Builds a character for the asset library, step by step, in its own folder: asset-library/characters/<id>/.
//
//   pnpm assets list                    every character, and how far along it is
//   pnpm assets thalbern                the free steps: pose sheet, joints, and the check picture
//   pnpm assets thalbern --pay          and the model, which costs money, then the rig and the shelf
//   pnpm assets thalbern --redo=rig     a step again: sheet, joints, model, rig
//
// A character starts as character.json, its brief: who it is, which cast members it is, its card, and where what its
// hands hold goes on the sheet. A step whose file is already there is left alone. The model is the one step that
// costs money, and it never runs without --pay.
//
// Files in a character's folder, in the order they are made:
//   character.json                              the brief (by hand)
//   sheet.png, apose-front.png, apose-back.png  the pose sheet, painted from the card
//   joints.json, joints.jpg                     the joints found on the front, and a picture to check them by
//   tripo.json, source.glb                      the generator's answer, and the model as it came. Never overwritten.
//   rig.json, lod0.glb, lod1.glb, lod2.glb      the rig's report, and the rigged copies from heavy to light
//   front.webp, figure.json                     what the library page reads

import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import sharp from "sharp"
import { codexPaint, dataUri, fal, fetchBuffer, jpeg } from "../../lab/stage-art/gen"

const ROOT = "asset-library/characters"
const DESKTOP = `${homedir()}/Desktop/d20-asset-library`
const BLENDER = process.env.BLENDER || "/Applications/Blender.app/Contents/MacOS/Blender"
const MODEL = { name: "Tripo H3.1 on fal", endpoint: "tripo3d/h3.1/image-to-3d", cost: 0.6 }
const CLIPS = ["Idle", "Walk", "Hit"]

interface Brief {
  id: string
  name: string
  role: string
  // The cast ids this character goes by in the stagings: how the library joins the figure to its cards.
  cast: string[]
  height: number
  card: { front: string; back: string }
  who: string
  // Where what the card's hands hold goes on the sheet. A generator fuses anything held into the arm.
  stow: string
  // How far out the arms stand, in degrees: 40, or 45 for a bulky outfit.
  arms: number
  party?: boolean
  // What it holds, built in its hand when it is shown (props.ts) and left off the sheet: { what: "staff", hand: "R", length: 2.1 }.
  // A bow through a hand made round a rod is carried at all times (packages/stage/src/figures/weapons.ts): { what:
  // "bow", hand: "L", length: 1.44, rod: true }.
  // `palm` is the way a fist's palm faces on the model, if not in toward the thigh as an open hand's does: "front"
  // or "back". Hide the staff and look at the bare fist before saying.
  // `rod` has the sheet paint that hand closed round a short rod in flat blue, a colour nothing else on a figure is.
  // The model then has fingers and a thumb made round something, and the rig cuts the blue out (rig.py), leaving a
  // hand with a way through it for the prop. A fist made round nothing has no way through.
  // `thick` is how wide the rod is, in centimetres: as wide as the prop is where it is held, or the hand is modelled
  // round something thinner than what it holds.
  holds?: { what: "staff" | "bow"; hand: "L" | "R"; length: number; fist?: boolean; rod?: boolean; thick?: number; palm?: "front" | "back" }
  // "front" paints the front view alone, upright and at full size: half as many pixels again on a face as the sheet
  // of two views gives. The model is made from the front alone, so the back view was only ever a reference.
  sheet?: "front"
  // "sheet" has the rig lay the sheet's own pixels back onto the front of the head (rig.py): a generator paints a
  // face again from memory, and softer.
  // "close" goes further: the head is painted again on its own, five times the size, and fitted back onto the
  // sheet's (face.py) before the rig paints from it.
  face?: "sheet" | "close"
  // A beast that stands upright on two legs, painted as an animal and not a person in costume.
  creature?: boolean
  // "four": a beast that stands on four feet. Its sheets are painted on all fours, a second one of its two sides, and
  // `pilot.ts` makes and rigs it: the joints and the close face are a person's and are not looked for.
  stance?: "four"
}

const args = process.argv.slice(2)
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const [id] = args.filter((a) => !a.startsWith("--"))
const redo = (flag("redo") ?? "").split(",")
const made = (dir: string, file: string, step: string) => existsSync(`${dir}/${file}`) && !redo.includes(step)

const creaturePrompt = (
  b: Brief
) => `The attached images are the front and the back of a painted game creature: ${b.who}. Make one landscape reference sheet of the SAME creature as a photorealistic studio photograph of a living animal, for building a 3D model. It is a real creature, not a person in a costume.

Two full-body views side by side at the same scale, each filling the frame's height from the top of the head to the soles of the feet: on the left the front view, on the right the back view from directly behind with no face visible.

Pose, in both views: standing upright on its two hind legs, body straight, feet apart with a clear gap of background between the legs, both arms hanging down and held out from the body at about ${b.arms} degrees with a clear gap of background between each arm and the body all the way down, claws open and spread, pointing at the ground. Nothing in the claws. ${b.stow} Calm, neutral expression, mouth closed, looking straight ahead. Not on all fours, not crouching, not rearing with the arms raised.

Keep this creature's head, colouring, markings, build and proportions. Render it as real fur, feathers, skin, claws and horn.

Lighting: soft, even, shadowless studio light from the front, the same in both views, with no rim light and no cast shadow. Background: flat, plain mid-grey, edge to edge. No text, no labels, no props, no floor line.`

// A beast on four feet, as a sheet of two views: its front and back, or its own left and right sides.
const fourPrompt = (b: Brief, sides: boolean) => `The attached images are the front and the back of a painted game creature: ${b.who}. Make one landscape reference sheet of the SAME creature as a photorealistic studio photograph of a living animal, for building a 3D model. It is a real creature, not a sculpture.

${
  sides
    ? "Two full-body views one above the other at the same scale, each filling the frame's width from the tip of the snout to the tip of the tail: on top its own left side, seen square from that side, its head toward the left edge of the picture; below its own right side, seen square from that side, its head toward the right edge. The two views are the same creature in the same pose, one the mirror of the other."
    : "Two full-body views side by side at the same scale, each filling the frame's height from the top of the head to the soles of the feet: on the left the front view, seen from directly in front at the height of its chest; on the right the back view from directly behind, with no face visible."
}

Pose, in every view: standing square on all four feet, as an animal stands at rest, with each leg straight under the body and a clear gap of background between the legs. Not rearing, not crouching, nothing raised. ${b.stow} The head held level and forward on the neck, mouth closed, looking straight ahead. Calm.

Keep this creature's head, colouring, markings, build and proportions. Render it as real scales, skin, claws and horn.

Lighting: soft, even, shadowless studio light from the front, the same in both views, with no rim light and no cast shadow. Background: flat, plain mid-grey, edge to edge. No text, no labels, no props, no floor line.`

const prompt = (b: Brief) => (b.stance === "four" ? fourPrompt(b, false) : b.creature ? creaturePrompt(b) : personPrompt(b))
// A hand that holds something (props.ts) is painted closed, so the model has a fist for the prop to stand in. Bending
// an open hand's mesh shut does not make a grip.
const hands = (b: Brief) => {
  if (b.holds?.rod) {
    const [own, seen, other] = b.holds.hand === "R" ? ["right", "left", "left"] : ["left", "right", "right"]
    const thick = b.holds.thick ?? 5
    return `Their own ${own} hand, on the ${seen} of the picture, holds a short, thick, straight rod upright, as one holds a heavy walking staff: a relaxed, natural grip with the four fingers wrapped round the rod side by side and the thumb wrapped round it the other way. The rod is VERY THICK: ${thick} centimetres across, as thick as a drinks can or a stair rail post, plainly thicker than their own wrist and about two thirds as wide as the back of their hand. The hand is opened wide round it: the fingers reach only about two thirds of the way round, and a clear gap of blue shows between the fingertips and the tip of the thumb. The rod stands vertical and sticks out about a hand's width above the hand and a hand's width below it, and no more. It is a plain smooth cylinder in flat, pure, saturated blue (#0000ff) with no shading, no highlights and no texture: it is a marker to be cut out later, so it must be exactly that blue and nothing else in the picture may be blue. Their ${other} hand is open and relaxed with fingers apart, palm toward the thigh. Nothing else in either hand.`
  }
  if (!b.holds?.fist) return "hands open with fingers apart, palms toward the thighs. Nothing in the hands."
  const [own, seen, other] = b.holds.hand === "R" ? ["right", "left", "left"] : ["left", "right", "right"]
  return `Their own ${own} hand, on the ${seen} of the picture in the front view, is closed in a firm fist with the knuckles forward, the fingers curled tight and the thumb wrapped over them, as if gripping a thick pole that is not there. Their ${other} hand is open with fingers apart, palm toward the thigh. Nothing in either hand.`
}
const views = (b: Brief) =>
  b.sheet === "front"
    ? "One full-body view from directly in front, upright and centred, filling the frame's height from the top of the head to the soles."
    : "Two full-body views side by side at the same scale, each filling the frame's height from the top of the head to the soles: on the left the front view, on the right the back view from directly behind with no face visible."
const personPrompt = (
  b: Brief
) => `The attached images are the front and the back of a painted game character: ${b.who}. Make one ${b.sheet === "front" ? "portrait picture" : "landscape reference sheet"} of the SAME person as a photorealistic costume photograph, for building a 3D model.

${views(b)}

Pose${b.sheet === "front" ? "" : ", in both views"}: standing straight, feet a little apart, both arms held out from the body at about ${b.arms} degrees with a clear gap of background between each arm and the body, ${hands(b)} ${b.stow} Neutral face, mouth closed, looking straight ahead.

Keep this person's face, hair, build and proportions, and every piece of the outfit: its shapes, colours, emblems and layers. Render it as real materials: worn metal, woven cloth, mail, oiled leather, real skin and hair.${b.sheet === "front" ? " The face is in sharp focus and finely detailed: clear eyes, a natural closed mouth, real skin." : ""}

Lighting: soft, even, shadowless studio light from the front${b.sheet === "front" ? "" : ", the same in both views"}, with no rim light and no cast shadow. Background: flat, plain mid-grey, edge to edge. No text, no labels, no props, no floor line.`

// The head alone, enlarged. It must stay the same head, feature for feature: it is fitted back onto the sheet's.
const facePrompt = `The attached image is a small, soft crop of a studio photograph: one person's head, seen from directly in front on a grey background. Make one square image that is the SAME photograph of the SAME head at far higher resolution, as if the original had been taken with a much better camera.

Keep everything where it is: the same framing and crop, the head the same size and in the same place, the same face, expression, eyes, brows, nose, mouth, ears, hair and whatever is worn in the hair, the same soft even light, the same grey background. Change no proportion and move no feature.

Add only what a sharper photograph would show: skin texture and pores, freckles, eyelashes, the detail of the irises with a small catch light, the lines of the lips, single hairs. Natural skin, not retouched, not shiny. Mouth closed. No text.`

function run(label: string, command: string, argv: string[]) {
  const r = spawnSync(command, argv, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`${label} failed: ${(r.stderr || r.stdout || "").trim().split("\n").slice(-6).join("\n")}`)
  return r.stdout
}
const last = (out: string, tag: string) => {
  const line = out.split("\n").find((l) => l.startsWith(`${tag} `))
  return line ? (JSON.parse(line.slice(tag.length + 1)) as Record<string, unknown>) : null
}

async function sheet(dir: string, b: Brief) {
  const card = async (file: string) => jpeg(await sharp(`public${file}`).flatten({ background: "#808080" }).toBuffer(), 1536)
  const front = b.sheet === "front"
  const png = await codexPaint(`character sheet ${b.id}`, prompt(b), [await card(b.card.front), await card(b.card.back)], front ? "portrait 2:3" : "landscape 3:2")
  const { width = 0, height = 0 } = await sharp(png).metadata()
  await writeFile(`${dir}/sheet.png`, png)
  if (front) await writeFile(`${dir}/apose-front.png`, png)
  else {
    const half = Math.floor(width / 2)
    await sharp(png).extract({ left: 0, top: 0, width: half, height }).png().toFile(`${dir}/apose-front.png`)
    await sharp(png).extract({ left: half, top: 0, width: half, height }).png().toFile(`${dir}/apose-back.png`)
  }
  // A beast on four feet is read side on: its sides are a second sheet, the left above the right.
  if (b.stance === "four") {
    const sides = await codexPaint(`character sides ${b.id}`, fourPrompt(b, true), [await card(b.card.front), await card(b.card.back)], "landscape 3:2")
    const { width: w = 0, height: h = 0 } = await sharp(sides).metadata()
    const half = Math.floor(h / 2)
    await writeFile(`${dir}/sides.png`, sides)
    await sharp(sides).extract({ left: 0, top: 0, width: w, height: half }).png().toFile(`${dir}/apose-left.png`)
    await sharp(sides).extract({ left: 0, top: half, width: w, height: h - half }).png().toFile(`${dir}/apose-right.png`)
  }
  await mkdir(DESKTOP, { recursive: true })
  await sharp(png).jpeg({ quality: 92 }).toFile(`${DESKTOP}/${b.id}-sheet.jpg`)
}

type Remote = { url?: string } | null | undefined
type Answer = { model_mesh?: Remote; model_urls?: { glb?: Remote; pbr_model?: Remote } }
async function model(dir: string, b: Brief) {
  let answer = existsSync(`${dir}/tripo.json`) && !redo.includes("model") ? (JSON.parse(await readFile(`${dir}/tripo.json`, "utf8")) as Answer) : null
  if (!answer) {
    answer = await fal<Answer>(`character model ${b.id}`, MODEL.endpoint, {
      image_url: dataUri(await sharp(`${dir}/apose-front.png`).png().toBuffer()),
      texture: true,
      pbr: true,
      texture_quality: "detailed",
      geometry_quality: "detailed",
      face_limit: 60000,
    })
    await writeFile(`${dir}/tripo.json`, `${JSON.stringify(answer, null, 2)}\n`)
  }
  const url = answer.model_urls?.pbr_model?.url ?? answer.model_urls?.glb?.url ?? answer.model_mesh?.url
  if (!url) throw new Error("The generator returned no model")
  await writeFile(`${dir}/source.glb`, await fetchBuffer(url))
}

async function shelve(dir: string, b: Brief) {
  const rig = JSON.parse(await readFile(`${dir}/rig.json`, "utf8")) as {
    sourceTriangles: number
    weights: { solve: string }
    bones: string[]
    lods: { file: string; megabytes: number; triangles: number; texture: number }[]
  }
  await sharp(`${dir}/apose-front.png`).resize({ height: 640 }).webp({ quality: 85 }).toFile(`${dir}/front.webp`)
  const before = existsSync(`${dir}/figure.json`) ? (JSON.parse(await readFile(`${dir}/figure.json`, "utf8")) as { source?: { made?: string }; motion?: unknown }) : null
  const figure = {
    id: b.id,
    name: b.name,
    role: b.role,
    cast: b.cast,
    party: !!b.party,
    height: b.height,
    front: "front.webp",
    // The figure's own picture, once thumbs.ts has taken one. A rig made again wants it taken again.
    ...(existsSync(`${dir}/thumb.webp`) ? { thumb: "thumb.webp" } : {}),
    source: { generator: MODEL.name, triangles: rig.sourceTriangles, cost: MODEL.cost, made: (!redo.includes("model") && before?.source?.made) || new Date().toISOString().slice(0, 10) },
    rig: { bones: rig.bones.length, weights: rig.weights.solve },
    clips: CLIPS,
    // How it moves in the game, set by hand: kept through a rebuild.
    ...(before?.motion ? { motion: before.motion } : {}),
    lods: rig.lods.map((l, i) => ({ file: `lod${i}.glb`, triangles: l.triangles, megabytes: l.megabytes, texture: l.texture })),
  }
  await writeFile(`${dir}/figure.json`, `${JSON.stringify(figure, null, 2)}\n`)
}

async function build(b: Brief) {
  const dir = `${ROOT}/${b.id}`
  const say = (step: string, what: string) => console.log(`${b.id}  ${step.padEnd(7)} ${what}`)
  if (made(dir, "apose-front.png", "sheet")) say("sheet", "kept")
  else {
    await sheet(dir, b)
    say("sheet", `painted, a copy at ${DESKTOP}/${b.id}-sheet.jpg`)
  }
  if (b.stance === "four") return say("next", `look at ${dir}/sheet.png and sides.png, then pnpm assets:pilot ${b.id}`)
  if (made(dir, "joints.json", "joints")) say("joints", "kept")
  else {
    const out = run("joints", "uv", [
      "run",
      "--quiet",
      "--python",
      "3.12",
      "--with",
      "mediapipe==0.10.14",
      "--with",
      "numpy",
      "--with",
      "pillow",
      "asset-library/pipeline/joints.py",
      dir,
      String(b.height),
      "--write",
      "--force",
    ])
    say("joints", `found, least sure ${last(out, "JOINTS")?.leastSure}`)
  }
  run("joints check", "node", ["asset-library/pipeline/joints-check.mjs", dir])
  if (b.face === "close") {
    if (made(dir, "apose-face.png", "face")) say("face", "kept")
    else {
      const python = (mode: string) => run(`face ${mode}`, "uv", ["run", "--quiet", "--python", "3.12", "--with", "mediapipe==0.10.14", "--with", "numpy", "asset-library/pipeline/face.py", mode, dir])
      python("crop")
      await writeFile(`${dir}/face.png`, await codexPaint(`character face ${b.id}`, facePrompt, [await jpeg(await sharp(`${dir}/head-crop.png`).toBuffer(), 1536)], "square 1:1"))
      say("face", `painted close and fitted: ${JSON.stringify(last(python("warp"), "FACE"))}`)
    }
  }
  const cached = existsSync(`${dir}/tripo.json`) && !redo.includes("model")
  if (made(dir, "source.glb", "model")) say("model", "kept")
  else if (!args.includes("--pay") && !cached) return say("model", `not made: it costs $${MODEL.cost.toFixed(2)} on ${MODEL.name}. Look at ${dir}/joints.jpg, then run again with --pay`)
  else {
    await model(dir, b)
    say("model", cached ? "fetched again from the kept answer, no charge" : `made, $${MODEL.cost.toFixed(2)}`)
  }
  if (made(dir, "lod0.glb", "rig") && !redo.includes("model") && !redo.includes("joints") && !redo.includes("face")) say("rig", "kept")
  else {
    type Report = { weights?: { solve: string; unweighted: number }; lods?: { triangles: number; megabytes: number; joints: number; turnedAtRest: string[] }[] }
    const report = last(run("rig", BLENDER, ["-b", "-P", "asset-library/pipeline/rig.py", "--", `${dir}/source.glb`, `${dir}/joints.json`, dir, "."]), "RIG") as Report | null
    const bad = report?.weights?.solve !== "heat" || report.weights.unweighted || report.lods?.some((l) => l.joints !== 18 || l.turnedAtRest.length)
    say("rig", `${bad ? "LOOK AT rig.json: " : ""}${report?.weights?.solve} solve, ${report?.lods?.map((l) => `${l.triangles} tris ${l.megabytes} MB`).join(", ")}`)
    // A face painted close is fitted to the model's own face, which the rig has just drawn out, and rigged again.
    if (b.face === "close" && existsSync(`${dir}/apose-face.png`) && existsSync(`${dir}/head-own.png`)) {
      const fit = last(run("face fit", "uv", ["run", "--quiet", "--python", "3.12", "--with", "mediapipe==0.10.14", "--with", "numpy", "asset-library/pipeline/face.py", "fit", dir]), "FACE")
      if (fit?.fitted) run("rig", BLENDER, ["-b", "-P", "asset-library/pipeline/rig.py", "--", `${dir}/source.glb`, `${dir}/joints.json`, dir, "."])
      say("face", `fitted to the model's own: ${JSON.stringify(fit)}`)
    }
  }
  await shelve(dir, b)
  say("shelf", `on the shelf: /settings/realm-of-myr/assets?id=${b.cast[0]}`)
}

async function briefs() {
  const out: Brief[] = []
  for (const name of (await readdir(ROOT)).sort()) {
    const text = await readFile(`${ROOT}/${name}/character.json`, "utf8").catch(() => null)
    if (text) out.push(JSON.parse(text) as Brief)
  }
  return out
}

async function main() {
  const all = await briefs()
  if (!id || id === "list") {
    for (const b of all) {
      const dir = `${ROOT}/${b.id}`
      const at = ["apose-front.png", "joints.json", "source.glb", "lod0.glb", "figure.json"].map((f) => (existsSync(`${dir}/${f}`) ? "■" : "□")).join("")
      console.log(`${at}  ${b.id.padEnd(10)} ${b.name}${b.party ? "  (party)" : ""}`)
    }
    return console.log("sheet, joints, model, rig, shelf")
  }
  const b = all.find((x) => x.id === id)
  if (!b) throw new Error(`No ${ROOT}/${id}/character.json`)
  await build(b)
}
main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err))
  process.exit(1)
})
