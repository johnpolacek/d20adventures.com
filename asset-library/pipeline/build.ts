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
}

const args = process.argv.slice(2)
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const [id] = args.filter((a) => !a.startsWith("--"))
const redo = (flag("redo") ?? "").split(",")
const made = (dir: string, file: string, step: string) => existsSync(`${dir}/${file}`) && !redo.includes(step)

const prompt = (
  b: Brief
) => `The attached images are the front and the back of a painted game character: ${b.who}. Make one landscape reference sheet of the SAME person as a photorealistic costume photograph, for building a 3D model.

Two full-body views side by side at the same scale, each filling the frame's height from the top of the head to the soles: on the left the front view, on the right the back view from directly behind with no face visible.

Pose, in both views: standing straight, feet a little apart, both arms held out from the body at about ${b.arms} degrees with a clear gap of background between each arm and the body, hands open with fingers apart, palms toward the thighs. Nothing in the hands. ${b.stow} Neutral face, mouth closed, looking straight ahead.

Keep this person's face, hair, build and proportions, and every piece of the outfit: its shapes, colours, emblems and layers. Render it as real materials: worn metal, woven cloth, mail, oiled leather, real skin and hair.

Lighting: soft, even, shadowless studio light from the front, the same in both views, with no rim light and no cast shadow. Background: flat, plain mid-grey, edge to edge. No text, no labels, no props, no floor line.`

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
  const png = await codexPaint(`character sheet ${b.id}`, prompt(b), [await card(b.card.front), await card(b.card.back)])
  const { width = 0, height = 0 } = await sharp(png).metadata()
  await writeFile(`${dir}/sheet.png`, png)
  const half = Math.floor(width / 2)
  await sharp(png).extract({ left: 0, top: 0, width: half, height }).png().toFile(`${dir}/apose-front.png`)
  await sharp(png).extract({ left: half, top: 0, width: half, height }).png().toFile(`${dir}/apose-back.png`)
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
  const before = existsSync(`${dir}/figure.json`) ? (JSON.parse(await readFile(`${dir}/figure.json`, "utf8")) as { source?: { made?: string } }) : null
  const figure = {
    id: b.id,
    name: b.name,
    role: b.role,
    cast: b.cast,
    party: !!b.party,
    height: b.height,
    front: "front.webp",
    source: { generator: MODEL.name, triangles: rig.sourceTriangles, cost: MODEL.cost, made: before?.source?.made ?? new Date().toISOString().slice(0, 10) },
    rig: { bones: rig.bones.length, weights: rig.weights.solve },
    clips: CLIPS,
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
  const cached = existsSync(`${dir}/tripo.json`) && !redo.includes("model")
  if (made(dir, "source.glb", "model")) say("model", "kept")
  else if (!args.includes("--pay") && !cached) return say("model", `not made: it costs $${MODEL.cost.toFixed(2)} on ${MODEL.name}. Look at ${dir}/joints.jpg, then run again with --pay`)
  else {
    await model(dir, b)
    say("model", cached ? "fetched again from the kept answer, no charge" : `made, $${MODEL.cost.toFixed(2)}`)
  }
  if (made(dir, "lod0.glb", "rig") && !redo.includes("model") && !redo.includes("joints")) say("rig", "kept")
  else {
    type Report = { weights?: { solve: string; unweighted: number }; lods?: { triangles: number; megabytes: number; joints: number; turnedAtRest: string[] }[] }
    const report = last(run("rig", BLENDER, ["-b", "-P", "asset-library/pipeline/rig.py", "--", `${dir}/source.glb`, `${dir}/joints.json`, dir, "."]), "RIG") as Report | null
    const bad = report?.weights?.solve !== "heat" || report.weights.unweighted || report.lods?.some((l) => l.joints !== 18 || l.turnedAtRest.length)
    say("rig", `${bad ? "LOOK AT rig.json: " : ""}${report?.weights?.solve} solve, ${report?.lods?.map((l) => `${l.triangles} tris ${l.megabytes} MB`).join(", ")}`)
  }
  await shelve(dir, b)
  say("shelf", `on the shelf: /dev/assets?id=${b.cast[0]}`)
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
