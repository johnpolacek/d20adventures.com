// Whether a model made as one skin can be had as parts: a pilot figure's model sent to Tripo's segmentation on fal,
// and what comes back counted. A figure whose plates are the same skin as the sleeve under them cannot be bound so
// the plate stays on the shoulder and the sleeve goes with the arm (the README's pilot notes). Parts could be.
//
//   pnpm assets:parts thalbern-rodin          what it would send, and what it costs
//   pnpm assets:parts thalbern-rodin --pay    sends it, keeps the answer, and counts the parts
//
// In:  pilot-model.json, the maker's answer with the model's address (pilot.ts).
// Out: pilot-parts.json, the answer, kept so nothing is paid for twice. pilot/parts.glb, the model in parts.
//
// fal lists the price as "$0.01 per units" and does not say how many units a model is. Tripo's own price for the
// same call is 40 credits, $0.40, so that is what is expected until fal's bill says otherwise.

import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { NodeIO } from "@gltf-transform/core"
import { ALL_EXTENSIONS } from "@gltf-transform/extensions"
import { fal, fetchBuffer } from "../../lab/stage-art/gen"

const ENDPOINT = "tripo3d/tripo/segment"
const EXPECTED = 0.4
type Remote = { url?: string; file_name?: string } | null
type Answer = { part_names?: string[] | null; model_mesh?: Remote; model_urls?: Record<string, Remote> | null }

const args = process.argv.slice(2)
const id = args.find((a) => !a.startsWith("--"))
const dir = `asset-library/characters/${id}`
const say = (what: string, text: string) => console.log(`${id}`.padEnd(15), what.padEnd(7), text)

// What a GLB is made of: each mesh by name, how many triangles, where it lies in the figure, and whether it is
// textured. Heights and widths are shares of the whole figure's, feet at 0 and crown at 100.
async function count(file: string) {
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file)
  const rows: { name: string; tris: number; low: number[]; high: number[]; textured: boolean; skinned: boolean }[] = []
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const m = node.getWorldMatrix()
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION")
      if (!pos) continue
      const [low, high] = [
        [9e9, 9e9, 9e9],
        [-9e9, -9e9, -9e9],
      ]
      for (let i = 0; i < pos.getCount(); i++) {
        const p = pos.getElement(i, [0, 0, 0])
        for (let r = 0; r < 3; r++) {
          const v = m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]
          low[r] = Math.min(low[r], v)
          high[r] = Math.max(high[r], v)
        }
      }
      rows.push({
        name: node.getName() || mesh.getName() || "(unnamed)",
        tris: (prim.getIndices()?.getCount() ?? pos.getCount()) / 3,
        low,
        high,
        textured: !!prim.getAttribute("TEXCOORD_0") && !!prim.getMaterial()?.getBaseColorTexture(),
        skinned: !!prim.getAttribute("JOINTS_0"),
      })
    }
  }
  const all = [0, 1, 2].map((k) => [Math.min(...rows.map((r) => r.low[k])), Math.max(...rows.map((r) => r.high[k]))])
  const share = (v: number, k: number) => Math.round(((v - all[k][0]) / (all[k][1] - all[k][0] || 1)) * 100)
  say(
    "parts",
    `${rows.length} meshes, ${rows.reduce((sum, r) => sum + r.tris, 0)} triangles, ${rows.filter((r) => r.textured).length} textured, ${doc.getRoot().listTextures().length} textures in the file`
  )
  console.log(`  ${"name".padEnd(28)} ${"triangles".padStart(9)}  height %   across %   textured`)
  for (const r of rows.sort((a, b) => b.high[1] - a.high[1]))
    console.log(
      `  ${r.name.slice(0, 28).padEnd(28)} ${String(r.tris).padStart(9)}  ${`${share(r.low[1], 1)}-${share(r.high[1], 1)}`.padEnd(9)}  ${`${share(r.low[0], 0)}-${share(r.high[0], 0)}`.padEnd(9)}  ${r.textured ? "yes" : "no"}`
    )
}

async function main() {
  if (!id) throw new Error("Name a character: pnpm assets:parts <id>")
  const kept = `${dir}/pilot-parts.json`
  let answer = existsSync(kept) ? (JSON.parse(await readFile(kept, "utf8")) as Answer) : null
  if (!answer) {
    if (!existsSync(`${dir}/pilot-model.json`)) throw new Error(`No model: run pnpm assets:pilot ${id} first`)
    const model = (JSON.parse(await readFile(`${dir}/pilot-model.json`, "utf8")) as { model_mesh?: Remote }).model_mesh
    if (!model?.url) throw new Error(`No model in ${dir}/pilot-model.json`)
    if (!args.includes("--pay")) {
      say(
        "cost",
        `about $${EXPECTED.toFixed(2)} to split ${model.file_name ?? "the model"} into parts: fal lists $0.01 a unit and not how many units, Tripo's own price is $0.40. Run again with --pay`
      )
      return
    }
    answer = await fal<Answer>(`parts ${id}`, ENDPOINT, { mesh_url: model.url })
    await writeFile(kept, `${JSON.stringify(answer, null, 2)}\n`)
    say("split", `made, about $${EXPECTED.toFixed(2)}: look at fal's bill for what it took`)
  } else say("split", "kept")
  say("names", answer.part_names?.length ? `${answer.part_names.length}: ${answer.part_names.join(", ")}` : "none given")
  const remote = answer.model_mesh ?? Object.values(answer.model_urls ?? {}).find((r) => !!r?.url) ?? null
  if (!remote?.url) throw new Error(`No model in ${kept}`)
  const kind = (remote.file_name ?? remote.url).split("?")[0].split(".").pop()?.toLowerCase() ?? "glb"
  await mkdir(`${dir}/pilot`, { recursive: true })
  const file = `${dir}/pilot/parts.${kind}`
  if (!existsSync(file)) await writeFile(file, await fetchBuffer(remote.url))
  say("file", `${file}, ${((await readFile(file)).length / 1e6).toFixed(1)} MB`)
  if (kind === "glb") await count(file)
  else say("parts", `not counted: the answer is ${kind}, and only a GLB is read here`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
