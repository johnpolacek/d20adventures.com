// Character spike, 2026-11-10: a cast member as a rigged figure from Meshy 7.1, the generator first tried. Kept for the
// comparison. Characters are now made in the asset library: `pnpm assets <id>` (asset-library/pipeline/build.ts).
//
//   node --env-file=.env --env-file=.env.local --import tsx lab/stage-art/character.ts model garlan 1.94   # paid: $1.52 on fal
//
// Reads raw/<id>-apose-front.png. Writes public/stage-lab/<id>-*.glb and the whole answer to raw/<id>-meshy.json.

import { mkdir, readFile, writeFile } from "node:fs/promises"
import sharp from "sharp"
import { DESKTOP, dataUri, dirs, fal, fetchBuffer, PUB, RAW } from "./gen"

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
  const [cmd, id, who] = process.argv.slice(2).filter((a) => !a.startsWith("--"))
  await dirs()
  await mkdir(DESKTOP, { recursive: true })
  if (cmd === "model" && id) return model(id, Number(who) || 1.8)
  console.log("usage: character.ts model <id> <height in metres>")
}
main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err))
  process.exit(1)
})
