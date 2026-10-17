// Paints a set's backdrop: a very wide panorama of its far scenery in the encounter art's style, on magenta, then keys the
// magenta to alpha. A set shows it with `backdrop` (see packages/stage/src/backdrop.ts and wiki/stage-authoring.md).
//
//   node --env-file=.env.local --import tsx scripts/stage-backdrops.ts paint stones-valley            # a new raw painting
//   node --env-file=.env.local --import tsx scripts/stage-backdrops.ts key stones-valley [raw.png]    # key and publish
//
// Raw paintings go to TEXTURE_RAW (default: the OS temp dir). Review each before `key`, which takes the latest unless
// given one. The API key is read from GOOGLE_GENERATIVE_AI_API_KEY and is never printed.

import { appendFile, mkdir, readdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"

const MODEL = "gemini-3-pro-image"
const RAW = process.env.TEXTURE_RAW ?? join(tmpdir(), "d20-textures")
const OUT = "public/stage/textures"
// 4096 px across: about one texel per screen pixel at DPR 2, and within every GPU's texture limit.
const WIDTH = 4096
const ART = "https://d20-public.s3.us-east-1.amazonaws.com/images/settings/realm-of-myr"

// `scene` says what the far scenery is and how it is laid out. The painting's lowest band must be forest or ground that
// can sit just below the set's horizon: anything painted there reads as giant if it rises above the land.
type Backdrop = { ref: string; light: string; scene: string }
const BACKDROPS: Record<string, Backdrop> = {
  "stones-valley": {
    ref: `${ART}/the-midnight-summons/meeting-at-the-stones.png`,
    light: "moonlit night light",
    scene: `the far end of a deep, forested mountain valley at night, seen from the valley floor. Steep dark mountain walls rise on the left and on the right, as in the reference. Between them, layers of more distant ridges and peaks recede into blue-grey moonlit mist, each farther layer paler and softer. Moonlight catches the ridgelines and rock faces from above and behind.

Layout:
- The lowest fifth of the image is one continuous band of dark, misty conifer and broadleaf forest along the valley floor, across the full width, with no gaps.
- The mountains fill roughly the lower half of the image. The tallest walls are near the left and right ends, lower ridges toward the middle.`,
  },
}

const prompt = (b: Backdrop) => `A very wide panoramic matte painting, to be used as the far backdrop of a 3D game scene. Paint it in the exact style, palette and ${b.light} of the reference painting.

What it shows: ${b.scene}
- The SKY is SOLID, FLAT, PURE MAGENTA (#FF00FF) everywhere above the scenery: no moon, no sun, no stars, no clouds, no glow, no gradient, nothing painted in the sky.

Nothing magenta, pink or purple anywhere except the sky. No people, no animals, no foreground objects, no text, no border. Oil painting with soft, confident brushwork. NOT a photograph, NOT a 3D render.`

async function paint(id: string) {
  const b = BACKDROPS[id]
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set")
  const res0 = await fetch(b.ref)
  if (!res0.ok) throw new Error(`${b.ref}: HTTP ${res0.status}`)
  const ref = await sharp(Buffer.from(await res0.arrayBuffer()))
    .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer()
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt(b) }, { inline_data: { mime_type: "image/jpeg", data: ref.toString("base64") } }] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "21:9", imageSize: "4K" } },
  })
  const call = () =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body })
  let res = await call()
  for (let tries = 0; (res.status === 429 || res.status === 503) && tries < 5; tries++) {
    console.log(`${id}: HTTP ${res.status}, retrying`)
    await new Promise((r) => setTimeout(r, 10_000 * (tries + 1)))
    res = await call()
  }
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status} ${(await res.text()).slice(0, 400).replaceAll(key, "***")}`)
  const json = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[] }
  const data = json.candidates?.[0]?.content?.parts?.map((p) => p.inlineData?.data).find(Boolean)
  if (!data) throw new Error(`${id}: no image in the response`)
  await mkdir(RAW, { recursive: true })
  const n = (await latest(id)) + 1
  const file = join(RAW, `${id}-backdrop-${n}.png`)
  await writeFile(file, Buffer.from(data, "base64"))
  await appendFile(join(RAW, "generations.log"), `${new Date().toISOString()} ${id} backdrop ${MODEL}\n`)
  console.log(file)
}

async function latest(id: string) {
  const files = await readdir(RAW).catch(() => [] as string[])
  const re = new RegExp(`^${id}-backdrop-(\\d+)\\.png$`)
  return Math.max(0, ...files.map((f) => Number(re.exec(f)?.[1] ?? 0)))
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// Unmixes magenta: each pixel is read as the painted colour blended toward magenta by how far red and blue rise above
// green, so the edge pixels the painting bled into keep their own colour instead of a violet fringe. The model also
// tints far ridges lavender near the magenta, so red is held down by as much as blue rises above green: moonlit grey-blue
// and white snow keep their colour, lavender turns blue-grey. Blue is held near green too. Right for moonlit scenery only.
async function key(id: string, raw: string) {
  const { data, info } = await sharp(raw).resize({ width: WIDTH }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H } = info
  for (let p = 0; p < W * H; p++) {
    const i = p * 4
    const t = Math.min(1, Math.max(0, (Math.min(data[i], data[i + 2]) - data[i + 1]) / 250))
    const a = 1 - t
    const k = Math.min(t, 0.9)
    const g = Math.min(255, data[i + 1] / (1 - k))
    const b = Math.min(255, 1.28 * g + 8, Math.max(0, (data[i + 2] - k * 255) / (1 - k)))
    data[i] = Math.round(Math.max(0, Math.min(g - 0.6 * (b - g), (data[i] - k * 255) / (1 - k))))
    data[i + 1] = Math.round(g)
    data[i + 2] = Math.round(b)
    data[i + 3] = Math.round(255 * smooth(0.1, 0.35, a) * Math.min(1, a / 0.35))
  }
  const out = `${OUT}/${id}.webp`
  await sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .webp({ quality: 88, alphaQuality: 90 })
    .toFile(out)
  console.log(`${out} ${W}x${H} from ${raw}`)
}

async function main() {
  const [cmd, id, raw] = process.argv.slice(2)
  if (!id || !BACKDROPS[id]) throw new Error(`backdrops: ${Object.keys(BACKDROPS).join(", ")}`)
  if (cmd === "paint") await paint(id)
  else if (cmd === "key") await key(id, raw ?? join(RAW, `${id}-backdrop-${await latest(id)}.png`))
  else console.log("usage: stage-backdrops.ts paint|key <id> [raw.png]")
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
