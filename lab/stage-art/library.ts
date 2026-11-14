// The asset library's shelf: one folder a figure under public/stage-lab/figures, which /dev/assets lists and shows.
//
//   node --import tsx lab/stage-art/library.ts add garlan garlan-rig "Garlan Ironfist" "Sergeant of the Gate Watch" --generator="Tripo H3.1 on fal" --cost=0.6
//
// <id> is the character's cast id, which is how /dev/assets joins the figure to the character. --sheet=<name> names the
// sheet when it was painted under another: raw/<name>-apose-front.png.
//
// In:  what rig.py wrote for <rig> (public/stage-lab/<rig>.json and its -lod copies) and the A-pose front the model was
//      made from (raw/<id>-apose-front.png).
// Out: public/stage-lab/figures/<id>/figure.json, lod0.glb, lod1.glb, lod2.glb and front.webp.

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import sharp from "sharp"
import { PUB, RAW } from "./gen"

const args = process.argv.slice(2)
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const [cmd, id, rig, name, role] = args.filter((a) => !a.startsWith("--"))

interface Report {
  source: string
  height: number
  sourceTriangles: number
  weights: { solve: string }
  bones: string[]
  lods: { file: string; megabytes: number; triangles: number; texture: number }[]
}

async function add() {
  const report = JSON.parse(await readFile(`${PUB}/${rig}.json`, "utf8")) as Report
  const dir = `${PUB}/figures/${id}`
  await mkdir(dir, { recursive: true })
  const lods = []
  for (const [i, lod] of report.lods.entries()) {
    await copyFile(`${PUB}/${lod.file}`, `${dir}/lod${i}.glb`)
    lods.push({ file: `lod${i}.glb`, triangles: lod.triangles, megabytes: lod.megabytes, texture: lod.texture })
  }
  await sharp(`${RAW}/${flag("sheet") ?? id}-apose-front.png`)
    .resize({ height: 640 })
    .webp({ quality: 85 })
    .toFile(`${dir}/front.webp`)
  const figure = {
    id,
    kind: "character",
    name,
    role: role ?? "",
    status: "review",
    height: report.height,
    front: "front.webp",
    source: { generator: flag("generator") ?? "", model: report.source, triangles: report.sourceTriangles, cost: Number(flag("cost") ?? 0), made: new Date().toISOString().slice(0, 10) },
    rig: { bones: report.bones.length, weights: report.weights.solve },
    clips: ["Idle", "Walk", "Hit"],
    lods,
  }
  await writeFile(`${dir}/figure.json`, `${JSON.stringify(figure, null, 2)}\n`)
  console.log(`${dir}: ${lods.map((l) => `${l.triangles} tris ${l.megabytes} MB`).join(", ")}`)
}

if (cmd === "add" && id && rig && name)
  add().catch((err) => {
    console.error(String(err instanceof Error ? err.message : err))
    process.exit(1)
  })
else console.log('usage: library.ts add <id> <rig> "<name>" "<role>" [--generator=] [--cost=] [--sheet=]')
