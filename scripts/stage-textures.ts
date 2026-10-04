// Paints Stageview surface textures in an adventure's art style with the standee image model, then makes them tile.
// Board textures are one board's grain, flat-lit: the `painted` material lays its own seams, wear and grime over them.
// Cut-out textures (hanging moss) are painted on green and keyed like standees. See wiki/stage-authoring.md.
//
//   node --env-file=.env.local --import tsx scripts/stage-textures.ts paint boards-weathered,crate-oak   # new raw paintings
//   node --env-file=.env.local --import tsx scripts/stage-textures.ts make boards-weathered               # tile and publish
//   node --env-file=.env.local --import tsx scripts/stage-textures.ts all                                # every texture
//
// Raw paintings go to TEXTURE_RAW (default: the OS temp dir). Review each before `make`. The API key is read from
// GOOGLE_GENERATIVE_AI_API_KEY and is never printed.

import { appendFile, mkdir, readdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"

const MODEL = "gemini-3.1-flash-image"
const RAW = process.env.TEXTURE_RAW ?? join(tmpdir(), "d20-textures")
const OUT = "public/stage/textures"
const ART = "https://d1dkwd3w4hheqw.cloudfront.net/images/settings/realm-of-myr/covert-cargo/encounters"
const SHIPMENT = `${ART}/the-shipment/dccea2c5-b22d-41e0-9467-95d8ea2301d5.png`
const CRATE = `${ART}/the-crate/a3a863a9-dca9-48da-b3fe-e8c4ad90af3a.png`

// `crop` is the reference's region to match, as fractions [left, top, width, height] of the art.
type Texture = { subject: string; ref: string; crop: [number, number, number, number]; cutout?: boolean; size?: number }
const TEXTURES: Record<string, Texture> = {
  "boards-weathered": {
    subject:
      "the face of ONE old weathered wooden plank, its grain running straight up and down the frame: silvery grey-tan wood, darker brown in the grain lines, pale sun-bleached streaks, small cracks and splits along the grain",
    ref: CRATE,
    crop: [0.2, 0.72, 0.6, 0.28],
  },
  "crate-oak": {
    subject:
      "the face of ONE rough-sawn oak plank from an old cargo crate, its grain running straight up and down the frame: warm amber and ochre-brown wood with darker umber grain lines, a couple of small knots, worn pale streaks",
    ref: CRATE,
    crop: [0.28, 0.42, 0.45, 0.4],
  },
  "cabin-dark": {
    subject: "the face of ONE dark old cabin wall board, its grain running straight up and down the frame: smoky dark brown and grey-brown wood, soot and grime in the grain, faint warm highlights",
    ref: CRATE,
    crop: [0.15, 0.0, 0.7, 0.35],
  },
  "boat-paint": {
    subject:
      "the face of ONE wooden board painted pale grey-blue long ago, its grain running straight up and down the frame: chipped and flaking paint showing dark wood beneath in places, grime streaks running down, faint grain texture through the paint",
    ref: SHIPMENT,
    crop: [0.3, 0.28, 0.2, 0.22],
  },
  "hull-tar": {
    subject:
      "the face of ONE tarred wooden hull plank of an old river tug, its grain running straight up and down the frame: near-black blue-grey tar over wood, rust-orange streaks running down from old iron, scuffs showing paler wood",
    ref: SHIPMENT,
    crop: [0.3, 0.42, 0.2, 0.15],
  },
  "bark-moss": {
    subject:
      "the bark of a huge old swamp oak trunk seen straight on, its furrows running straight up and down the frame: deep dark grey-brown ridged bark with patches of green moss and pale lichen in the furrows",
    ref: SHIPMENT,
    crop: [0.0, 0.0, 0.3, 0.6],
  },
  "moss-hanging": {
    subject:
      "five separate long hanks of Spanish moss hanging straight down from the top edge of the frame, side by side with gaps between them: tangled grey-green strands, thicker at the top and thinning to wispy ends, the longest reaching most of the way down",
    ref: SHIPMENT,
    crop: [0.0, 0.0, 0.5, 0.5],
    cutout: true,
    size: 1024,
  },
}

const TILE = (t: Texture) => `A square surface texture for a painted 3D game world, matching the reference image's painted art style.

Subject: ${t.subject}.

Requirements:
- The subject fills the ENTIRE frame edge to edge, seen straight on, with no perspective. No background, no border, no vignette.
- Flat, even, shadowless lighting: the 3D engine adds the light. No cast shadows, no highlights from a light source.
- SEAMLESS and TILEABLE: the left edge continues into the right edge and the top into the bottom.
- No seams or gaps between boards, no nails, no metal, no objects, no text, no logo.
- Painted in the reference's manner: an oil painting with visible confident brushwork and its palette. NOT a photograph, NOT a 3D render, NOT cartoon.`

const CUT = (t: Texture) => `A cut-out element for a painted 3D game world, matching the reference image's painted art style.

Subject: ${t.subject}.

Requirements:
- Background: SOLID UNIFORM PURE GREEN (#00FF00) everywhere around and between the strands. No scenery, no branch, no text.
- Painted in the reference's manner: oil painting, visible brushwork, its palette and soft misty light. NOT a photograph, NOT a 3D render.
- Nothing green in the subject itself: the moss is grey-green to silver, never pure green.`

async function reference(t: Texture) {
  const img = sharp(Buffer.from(await (await fetch(t.ref)).arrayBuffer()))
  const { width = 1, height = 1 } = await img.metadata()
  const [l, tp, w, h] = t.crop
  const region = { left: Math.round(l * width), top: Math.round(tp * height), width: Math.round(w * width), height: Math.round(h * height) }
  return (await img.extract(region).jpeg({ quality: 90 }).toBuffer()).toString("base64")
}

async function render(label: string, text: string, images: string[]) {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set")
  const body = JSON.stringify({
    contents: [{ parts: [{ text }, ...images.map((data) => ({ inline_data: { mime_type: "image/jpeg", data } }))] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1", imageSize: "2K" } },
  })
  const call = () =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body })
  let res = await call()
  // Rate limits and high demand return no image and are not billed: wait and retry.
  for (let tries = 0; (res.status === 429 || res.status === 503) && tries < 5; tries++) {
    console.log(`${label}: HTTP ${res.status}, retrying`)
    await new Promise((r) => setTimeout(r, 10_000 * (tries + 1)))
    res = await call()
  }
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${(await res.text()).slice(0, 200).replaceAll(key, "***")}`)
  const json = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string }; inline_data?: { data?: string } }[] } }[] }
  const data = json.candidates?.[0]?.content?.parts?.map((p) => p.inlineData?.data ?? p.inline_data?.data).find(Boolean)
  if (!data) throw new Error(`${label}: no image in the response`)
  return Buffer.from(data, "base64")
}

async function latest(id: string) {
  const files = (await readdir(RAW)).filter((f) => f.startsWith(`${id}-`) && /^\d+\.png$/.test(f.slice(id.length + 1)))
  const n = Math.max(0, ...files.map((f) => Number(f.slice(id.length + 1, -4))))
  return { n, path: join(RAW, `${id}-${n}.png`) }
}

async function paint(id: string) {
  const t = TEXTURES[id]
  const png = await render(id, t.cutout ? CUT(t) : TILE(t), [await reference(t)])
  const { n } = await latest(id)
  await writeFile(join(RAW, `${id}-${n + 1}.png`), png)
  await appendFile(join(RAW, "generations.log"), `${new Date().toISOString()} ${id} #${n + 1} ${MODEL}\n`)
  console.log(`${id} #${n + 1}`)
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// Makes a painting tile: blend it with a copy rolled by half its size, weighting each by its distance from its own seams,
// so the tile's edges come from the copy's continuous middle. Brightness is evened out at large scale first, so a
// lighter corner does not repeat as a pattern.
async function tile(path: string, size: number) {
  const inset = 0.04
  const img = sharp(path)
  const { width = 1, height = 1 } = await img.metadata()
  const side = Math.round(Math.min(width, height) * (1 - 2 * inset))
  const { data } = await img
    .extract({ left: Math.round((width - side) / 2), top: Math.round((height - side) / 2), width: side, height: side })
    .resize(size, size)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const N = size
  // Two pipelines: sharp applies only the last resize of a chain.
  const small = await sharp(data, { raw: { width: N, height: N, channels: 3 } })
    .resize(6, 6, { kernel: "cubic" })
    .raw()
    .toBuffer()
  const blur = await sharp(small, { raw: { width: 6, height: 6, channels: 3 } })
    .resize(N, N, { kernel: "cubic" })
    .raw()
    .toBuffer()
  const mean = [0, 1, 2].map((c) => {
    let s = 0
    for (let i = c; i < data.length; i += 3) s += data[i]
    return s / (N * N)
  })
  const flat = new Float32Array(data.length)
  for (let i = 0; i < data.length; i++) flat[i] = data[i] * (mean[i % 3] / Math.max(8, blur[i])) ** 0.7
  const out = Buffer.alloc(data.length)
  const half = N / 2
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const wo = smooth(0, N * 0.22, Math.min(x, N - 1 - x, y, N - 1 - y))
      const ws = smooth(0, N * 0.22, Math.min(Math.abs(x - half), Math.abs(y - half)))
      const k = wo + ws < 1e-4 ? 0.5 : wo / (wo + ws)
      const sx = (x + half) % N
      const sy = (y + half) % N
      for (let c = 0; c < 3; c++) {
        const v = flat[(y * N + x) * 3 + c] * k + flat[(sy * N + sx) * 3 + c] * (1 - k)
        out[(y * N + x) * 3 + c] = Math.max(0, Math.min(255, Math.round(v)))
      }
    }
  return sharp(out, { raw: { width: N, height: N, channels: 3 } })
}

// Distance from green keys the painting; a two-pixel erode drops the green fringe, then the spill is pulled out.
async function cutout(path: string, size: number) {
  const { data, info } = await sharp(path).resize(size, size).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H } = info
  for (let i = 0; i < data.length; i += 4) data[i + 3] = Math.round(255 * (1 - smooth(40, 120, data[i + 1] - Math.max(data[i], data[i + 2]))))
  let alpha = new Uint8Array(W * H).map((_, p) => data[p * 4 + 3])
  for (let pass = 0; pass < 1; pass++) {
    const src = alpha
    alpha = src.map((v, p) => {
      const x = p % W
      const y = (p - x) / W
      let m = v
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          const yy = y + dy
          m = xx < 0 || yy < 0 || xx >= W || yy >= H ? 0 : Math.min(m, src[yy * W + xx])
        }
      return m
    })
  }
  for (let p = 0; p < W * H; p++) {
    const i = p * 4
    data[i + 3] = alpha[p]
    data[i + 1] = Math.min(data[i + 1], Math.round((data[i] + data[i + 2]) / 2 + 12))
  }
  return sharp(data, { raw: { width: W, height: H, channels: 4 } })
}

async function make(id: string) {
  const t = TEXTURES[id]
  const { n, path } = await latest(id)
  if (!n) throw new Error(`${id}: no raw painting yet`)
  await mkdir(OUT, { recursive: true })
  if (t.cutout) await (await cutout(path, t.size ?? 1024)).webp({ quality: 88, alphaQuality: 90 }).toFile(join(OUT, `${id}.webp`))
  else await (await tile(path, t.size ?? 1024)).jpeg({ quality: 86 }).toFile(join(OUT, `${id}.jpg`))
  console.log(`${id}: published from #${n}`)
}

async function main() {
  const [cmd, list] = process.argv.slice(2)
  const ids = list ? list.split(",") : Object.keys(TEXTURES)
  for (const id of ids) if (!TEXTURES[id]) throw new Error(`Unknown texture ${id}`)
  await mkdir(RAW, { recursive: true })
  const failed: string[] = []
  const queue = [...ids]
  const run = (fn: (id: string) => Promise<void>) =>
    Promise.all(
      Array.from({ length: 4 }, async () => {
        for (let id = queue.shift(); id; id = queue.shift())
          await fn(id).catch((error) => {
            failed.push(id)
            console.log(String(error))
          })
      })
    )
  if (cmd === "paint") await run(paint)
  else if (cmd === "make") await run(make)
  else if (cmd === "all")
    await run(async (id) => {
      await paint(id)
      await make(id)
    })
  else console.log("usage: stage-textures.ts paint|make|all [id,...]")
  if (failed.length) console.log(`failed: ${failed.join(",")}`)
}
void main()
