// Character spike: what a 3D generator needs before it can build a cast member. `sheet` has the Codex CLI, on the owner's
// ChatGPT subscription, redraw a standee as a photoreal figure in an A-pose, front and back side by side, and splits it.
// A generator and a rig both want arms clear of the body and nothing held, which the standees' story poses are not.
//
//   node --import tsx lab/stage-art/character.ts sheet garlan "Garlan Ironfist, sergeant of the Kordavos gate watch"
//   node --env-file=.env --env-file=.env.local --import tsx lab/stage-art/character.ts model garlan 1.94
//
// Reads public/stage/fixtures/welcome-to-kordavos/<id>-front.webp and -back.webp. Writes raw/<id>-sheet.png, and
// raw/<id>-apose-front.png and -back.png, with copies in ~/Desktop/kordavos-gate-spike.

import { mkdir, readFile, writeFile } from "node:fs/promises"
import sharp from "sharp"
import { codexPaint, DESKTOP, dataUri, dirs, fal, fetchBuffer, jpeg, PUB, RAW } from "./gen"

const FIXTURES = "public/stage/fixtures/welcome-to-kordavos"

const prompt = (
  who: string
) => `The attached images are the front and the back of a painted game character: ${who}. Make one landscape reference sheet of the SAME person as a photorealistic costume photograph, for building a 3D model.

Two full-body views side by side at the same scale, each filling the frame's height from the top of the head to the soles: on the left the front view, on the right the back view from directly behind with no face visible.

Pose, in both views: standing straight, feet a little apart, both arms held out from the body at about 40 degrees, hands open with fingers apart, palms toward the thighs. Nothing in the hands. The sword stays sheathed at the hip. Neutral face, mouth closed, looking straight ahead.

Keep his face, hair and beard, and every piece of the outfit: its shapes, colours, emblems and layers. Render it as real materials: forged and worn steel with brass trim, woven wool, riveted mail, oiled leather, real skin and hair.

Lighting: soft, even, shadowless studio light from the front, the same in both views, with no rim light and no cast shadow. Background: flat, plain mid-grey, edge to edge. No text, no labels, no props, no floor line.`

async function sheet(id: string, who: string) {
  const images = [
    await jpeg(await sharp(`${FIXTURES}/${id}-front.webp`).flatten({ background: "#808080" }).toBuffer(), 1536),
    await jpeg(await sharp(`${FIXTURES}/${id}-back.webp`).flatten({ background: "#808080" }).toBuffer(), 1536),
  ]
  const png = await codexPaint(`character sheet ${id}`, prompt(who), images)
  const { width = 0, height = 0 } = await sharp(png).metadata()
  await writeFile(`${RAW}/${id}-sheet.png`, png)
  const half = Math.floor(width / 2)
  for (const [view, left] of [
    ["front", 0],
    ["back", half],
  ] as const) {
    await sharp(png).extract({ left, top: 0, width: half, height }).png().toFile(`${RAW}/${id}-apose-${view}.png`)
    await sharp(png).extract({ left, top: 0, width: half, height }).jpeg({ quality: 92 }).toFile(`${DESKTOP}/${id}-apose-${view}.jpg`)
  }
  await sharp(png).jpeg({ quality: 92 }).toFile(`${DESKTOP}/${id}-sheet.jpg`)
  console.log(`${RAW}/${id}-sheet.png ${width}x${height}`)
}

// `model` sends the A-pose front to Meshy 7.1 on fal: a textured mesh, a rig, and an idle, in one paid call ($1.52 on
// 2026-11-10). The whole response is kept in raw/, so a finished run is read again and not paid for again.
type MeshyFile = { url?: string } | null | undefined
type Meshy = { model_glb?: MeshyFile; rigged_character_glb?: MeshyFile; animation_glb?: MeshyFile; basic_animations?: Record<string, MeshyFile>; thumbnail?: MeshyFile }

async function model(id: string, height: number) {
  const saved = `${RAW}/${id}-meshy.json`
  let res = await readFile(saved, "utf8").then(
    (t) => JSON.parse(t) as Meshy,
    () => null
  )
  if (!res) {
    const front = await sharp(`${RAW}/${id}-apose-front.png`).png().toBuffer()
    res = await fal<Meshy>(`character model ${id}`, "fal-ai/meshy/v7.1/image-to-3d", {
      image_url: dataUri(front),
      pose_mode: "a-pose",
      target_polycount: 60000,
      should_texture: true,
      enable_pbr: true,
      enable_rigging: true,
      rigging_height_meters: height,
      enable_animation: true,
      animation_action_id: 0,
    })
    await writeFile(saved, JSON.stringify(res, null, 2))
  }
  const files: [string, MeshyFile][] = [
    ["model", res.model_glb],
    ["rigged", res.rigged_character_glb],
    ["idle", res.animation_glb],
    ...Object.entries(res.basic_animations ?? {}).map(([k, v]) => [k.replace(/_glb$/, "").replaceAll("_", "-"), k.endsWith("glb") ? v : null] as [string, MeshyFile]),
  ]
  for (const [name, file] of files) {
    if (!file?.url) continue
    const buf = await fetchBuffer(file.url)
    await writeFile(`${PUB}/${id}-${name}.glb`, buf)
    console.log(`${PUB}/${id}-${name}.glb ${(buf.length / 1e6).toFixed(1)} MB`)
  }
  if (res.thumbnail?.url) await writeFile(`${DESKTOP}/${id}-model-thumb.png`, await fetchBuffer(res.thumbnail.url))
}

async function main() {
  const [cmd, id, who] = process.argv.slice(2)
  await dirs()
  await mkdir(DESKTOP, { recursive: true })
  if (cmd === "sheet" && id && who) return sheet(id, who)
  if (cmd === "model" && id) return model(id, Number(who) || 1.8)
  console.log('usage: character.ts sheet <id> "<who they are>" | model <id> <height in metres>')
}
main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err))
  process.exit(1)
})
