// Environment spike, splat track: World Labs' Marble turns the set's depth panorama into a painted panorama, then into
// a gaussian splat world the lab draws with Spark (?splat=<name>-<style>-<model>).
//
//   node --env-file=.env --env-file=.env.local --import tsx lab/stage-art/marble.ts credits
//   node --env-file=.env --env-file=.env.local --import tsx lab/stage-art/marble.ts pano <name> painterly|photoreal
//   node --env-file=.env --env-file=.env.local --import tsx lab/stage-art/marble.ts world <name> painterly|photoreal [model]
//
// `name` is a depth capture in raw/captures (capture.ts --pano=x,y,z), such as gate-pano. Models: marble-1.0-draft (150
// credits), marble-1.1 (1,500), marble-1.1-plus (1,500 to 3,000). 1,250 credits are $1. Usage past the balance is billed
// later, so `world` refuses to start when the balance cannot cover the model's top price.

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { gunzipSync } from "node:zlib"
import sharp from "sharp"
import { DESKTOP, dirs, log, PUB, RAW } from "./gen"

const API = "https://api.worldlabs.ai/marble/v1"
const TOP = { "marble-1.0-draft": 150, "marble-1.0": 1500, "marble-1.1": 1500, "marble-1.1-plus": 3000 } as const

const PLACE = `the great south gate of a walled fantasy city on a festival morning, seen from the market road outside the walls. A colossal gatehouse fills the view ahead: a tall round-arched gateway with a raised iron portcullis, flanked by two massive round towers with battlements, turrets and long hanging banners, with a small dome above the arch and curtain walls running off to both sides. Through the arch, a sunlit street and a second inner gate. A wide paved road leads to the gate between rope-and-post queue barriers. Market stalls with cloth awnings line both sides of the road, with crates, barrels and sacks. Strings of small triangular festival flags cross overhead. Behind the viewer the road runs on between more stalls and timber-framed houses. There are no people and no animals anywhere.`

const STYLES = {
  painterly: `The scene is ${PLACE} It is rendered as a richly detailed oil painting with visible confident brushwork: deep teal shadows, molten gold light from a low sun breaking through haze, densely carved ornament on weathered stone, heavy embroidered cloth, golden mist glowing through the arch. The 360 scene is faultless.`,
  photoreal: `The scene is ${PLACE} It is rendered in a realistic, photographic style, like a location still from a big-budget fantasy film: weathered sandstone and brick with mortar lines, chips, stains and moss, carved stone trim, woven wool banners with gold embroidery, sun-bleached canvas awnings, rough timber, iron fittings, worn cobbles with dust and straw. Natural low morning sunlight, soft bounced light in the shadows, light haze, a real sky with scattered clouds. The 360 scene is faultless.`,
} as const
type Style = keyof typeof STYLES

const key = () => {
  const v = process.env.WORLDLABS_API_KEY
  if (!v) throw new Error("WORLDLABS_API_KEY is not set")
  return v
}
async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "WLT-Api-Key": key(), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${text.slice(0, 500).replaceAll(key(), "***")}`)
  return JSON.parse(text) as T
}
type Op<T> = { operation_id: string; done: boolean; error?: unknown; cost?: unknown; metadata?: { progress?: { status?: string; description?: string } }; response?: T }
async function wait<T>(label: string, op: Op<T>) {
  for (let i = 0; !op.done; i++) {
    if (i > 240) throw new Error(`${label}: timed out`)
    await new Promise((r) => setTimeout(r, 10_000))
    op = await call<Op<T>>(`/operations/${op.operation_id}`)
    if (i % 6 === 0) console.log(`${label}: ${op.metadata?.progress?.description ?? (op.done ? "done" : "running")}`)
  }
  // Kept whole: a finished operation's result can be read again from here without paying twice.
  await writeFile(`${RAW}/op-${label.replaceAll(" ", "-")}.json`, JSON.stringify(op, null, 2))
  if (op.error) throw new Error(`${label}: ${JSON.stringify(op.error).slice(0, 500)}`)
  console.log(`${label}: cost ${JSON.stringify(op.cost ?? null)}`)
  return op.response as T
}
const credits = async () => (await call<{ remaining_credits: number }>("/credits")).remaining_credits
const download = async (url: string) => Buffer.from(await (await fetch(url)).arrayBuffer())

async function pano(name: string, style: Style) {
  const depth = await readFile(`${RAW}/captures/${name}-depth.png`)
  const { zMin, zMax } = JSON.parse(await readFile(`${RAW}/captures/${name}-depth.json`, "utf8")) as { zMin: number; zMax: number }
  const before = await credits()
  type PanoResult = { pano_url?: string; assets?: { imagery?: { pano_url?: string } } }
  // A finished run's saved operation is read again, not paid for again.
  const saved = await readFile(`${RAW}/op-pano-${name}-${style}.json`, "utf8").then(
    (t) => JSON.parse(t) as Op<PanoResult>,
    () => null
  )
  const res =
    saved?.done && !saved.error && saved.response
      ? saved.response
      : await wait(
          `pano ${name} ${style}`,
          await call<Op<PanoResult>>("/pano:depth_to_rgb", {
            depth_pano_image: { source: "data_base64", data_base64: depth.toString("base64"), extension: "png" },
            text_prompt: STYLES[style],
            z_min: zMin,
            z_max: zMax,
          })
        )
  // The docs put pano_url on the result. The service returns it under assets.imagery (2026-11-10).
  const url = res.assets?.imagery?.pano_url ?? res.pano_url
  if (!url) throw new Error(`no panorama in the result: ${JSON.stringify(res).slice(0, 300)}`)
  const img = await download(url)
  const m = await sharp(img).metadata()
  await writeFile(`${RAW}/${name}-${style}-pano.${m.format === "png" ? "png" : "jpg"}`, img)
  await sharp(img).jpeg({ quality: 92 }).toFile(`${DESKTOP}/${name}-${style}-pano.jpg`)
  await sharp(img).jpeg({ quality: 92 }).toFile(`${RAW}/${name}-${style}-pano-in.jpg`)
  await log(`marble pano ${name} ${style} ${m.width}x${m.height} credits ${before - (await credits())}`)
  console.log(`${RAW}/${name}-${style}-pano ${m.width}x${m.height}, credits used ${before - (await credits())}`)
}

type World = {
  id: string
  world_marble_url?: string
  assets?: {
    caption?: string
    thumbnail_url?: string
    mesh?: { collider_mesh_url?: string }
    imagery?: { pano_url?: string }
    splats?: { spz_urls?: Record<string, string>; semantics_metadata?: { metric_scale_factor?: number; ground_plane_offset?: number } }
  }
}

// How far the ground lies below the panorama point, in the splat file's own units: the median height of the splats
// straight under it. An SPZ is gzip over a 16 byte header and 24 bit fixed-point positions, y down. Draft worlds come
// without World Labs' scale metadata, so the lab sizes every world from this and the height the panorama was taken at.
function eyeHeight(spz: Buffer) {
  const raw = gunzipSync(spz)
  const n = raw.readUInt32LE(8)
  const unit = 1 << raw[13]
  const at = (i: number, a: number) => {
    const o = 16 + i * 9 + a * 3
    const v = raw[o] | (raw[o + 1] << 8) | (raw[o + 2] << 16)
    return (v & 0x800000 ? v - (1 << 24) : v) / unit
  }
  const ys: number[] = []
  for (let i = 0; i < n; i++) if (Math.hypot(at(i, 0), at(i, 2)) < 0.5 && at(i, 1) > 0) ys.push(at(i, 1))
  ys.sort((a, b) => a - b)
  return { eye: ys[Math.floor(ys.length / 2)], splats: n }
}

async function world(name: string, style: Style, model: keyof typeof TOP) {
  const before = await credits()
  if (before < TOP[model]) throw new Error(`${model} can cost ${TOP[model]} credits and the balance is ${before}`)
  const image = await readFile(`${RAW}/${name}-${style}-pano-in.jpg`)
  const { position } = JSON.parse(await readFile(`${RAW}/captures/${name}-depth.json`, "utf8")) as { position: number[] }
  const op = await call<Op<World>>("/worlds:generate", {
    display_name: `${name} ${style} ${model}`.slice(0, 64),
    model,
    world_prompt: {
      type: "image",
      image_prompt: { source: "data_base64", data_base64: image.toString("base64"), extension: "jpg" },
      is_pano: true,
      text_prompt: STYLES[style],
      disable_recaption: true,
    },
  })
  const w = await wait(`world ${name} ${style} ${model}`, op)
  const out = `${name}-${style}-${model.replace("marble-", "m").replaceAll(".", "")}`
  await writeFile(`${RAW}/${out}.json`, JSON.stringify(w, null, 2))
  const urls = w.assets?.splats?.spz_urls ?? {}
  const pick = urls.full_res ?? urls["500k"] ?? Object.values(urls)[0]
  if (!pick) throw new Error(`no splats in the response: ${JSON.stringify(w).slice(0, 400)}`)
  const spz = await download(pick)
  await writeFile(`${PUB}/${out}.spz`, spz)
  if (w.assets?.mesh?.collider_mesh_url) await writeFile(`${PUB}/${out}-collider.glb`, await download(w.assets.mesh.collider_mesh_url))
  await writeFile(`${PUB}/${out}.json`, JSON.stringify({ position, ...eyeHeight(spz), ...w.assets?.splats?.semantics_metadata, marble: w.world_marble_url }))
  const used = before - (await credits())
  await log(`marble world ${out} ${(spz.length / 1e6).toFixed(1)} MB credits ${used}`)
  console.log(`${PUB}/${out}.spz ${(spz.length / 1e6).toFixed(1)} MB, credits used ${used}, ${w.world_marble_url}`)
}

async function main() {
  const [cmd, name, style = "painterly", model = "marble-1.0-draft"] = process.argv.slice(2)
  await dirs()
  await mkdir(DESKTOP, { recursive: true })
  if (cmd === "credits") return console.log(`${await credits()} credits`)
  // measure <file in public/stage-lab, no extension>: rewrite a downloaded world's eye height.
  if (cmd === "measure" && name) {
    const meta = JSON.parse(await readFile(`${PUB}/${name}.json`, "utf8")) as Record<string, unknown>
    await writeFile(`${PUB}/${name}.json`, JSON.stringify({ ...meta, ...eyeHeight(await readFile(`${PUB}/${name}.spz`)) }))
    return console.log(await readFile(`${PUB}/${name}.json`, "utf8"))
  }
  if (!name || !(style in STYLES)) return console.log("usage: marble.ts credits | pano <name> <style> | world <name> <style> [model]")
  if (cmd === "pano") await pano(name, style as Style)
  else if (cmd === "world") {
    if (!(model in TOP)) throw new Error(`model: ${Object.keys(TOP).join(", ")}`)
    await world(name, style as Style, model as keyof typeof TOP)
  }
}
main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err))
  process.exit(1)
})
