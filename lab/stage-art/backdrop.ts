// Spike (a): a painted panorama of the far scenery, on magenta, keyed to alpha. The lab hangs it on a far cylinder in place
// of the set's mountain cones; our sky, moon and stars show through the keyed sky.
//
//   node --env-file=.env --env-file=.env.local --import tsx lab/stage-art/backdrop.ts paint [model]   # raw/stones-backdrop-<n>.png
//   node --env-file=.env --env-file=.env.local --import tsx lab/stage-art/backdrop.ts key [n]         # public/stage-lab/stones-backdrop.webp

import { readdir, writeFile } from "node:fs/promises"
import sharp from "sharp"
import { ART, dirs, gemini, jpeg, PUB, RAW, smooth } from "./gen"

const PROMPT = `A very wide panoramic matte painting, to be used as the far backdrop of a 3D game scene. Paint it in the exact style, palette and moonlit night light of the reference painting.

What it shows: the far end of a deep, forested mountain valley at night, seen from the valley floor. Steep dark mountain walls rise on the left and on the right, as in the reference. Between them, layers of more distant ridges and peaks recede into blue-grey moonlit mist, each farther layer paler and softer. Moonlight catches the ridgelines and rock faces from above and behind.

Layout:
- The lowest fifth of the image is one continuous band of dark, misty conifer and broadleaf forest along the valley floor, across the full width, with no gaps.
- The mountains fill roughly the lower half of the image. The tallest walls are near the left and right ends, lower ridges toward the middle.
- The SKY is SOLID, FLAT, PURE MAGENTA (#FF00FF) everywhere above the mountains: no moon, no stars, no clouds, no glow, no gradient, nothing painted in the sky.

Nothing magenta, pink or purple anywhere except the sky. No river, no standing stones, no people, no animals, no foreground objects, no text, no border. Oil painting with soft, confident brushwork. NOT a photograph, NOT a 3D render.`

async function latest() {
  const files = (await readdir(RAW)).filter((f) => /^stones-backdrop-\d+\.png$/.test(f))
  return Math.max(0, ...files.map((f) => Number(f.slice(16, -4))))
}

async function paint(model: string) {
  const png = await gemini("stones backdrop", model, PROMPT, [await jpeg(ART.stones)], "21:9", "4K")
  const n = (await latest()) + 1
  await writeFile(`${RAW}/stones-backdrop-${n}.png`, png)
  const m = await sharp(png).metadata()
  console.log(`stones-backdrop-${n}.png ${m.width}x${m.height} (${model})`)
}

// Unmixes magenta: each pixel is read as the painted colour blended toward magenta by how far red and blue rise above
// green, so the ridge pixels the painting bled into keep their own grey-blue instead of a violet band.
async function key(n: number) {
  const { data, info } = await sharp(`${RAW}/stones-backdrop-${n}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H } = info
  for (let p = 0; p < W * H; p++) {
    const i = p * 4
    const t = Math.min(1, Math.max(0, (Math.min(data[i], data[i + 2]) - data[i + 1]) / 250))
    const a = 1 - t
    const k = Math.min(t, 0.9)
    data[i + 1] = Math.round(Math.min(255, data[i + 1] / (1 - k)))
    // The model also tints a far ridge lavender near the magenta. Moonlit grey-blue never has red near green here.
    data[i] = Math.round(Math.min(0.9 * data[i + 1], Math.max(0, (data[i] - k * 255) / (1 - k))))
    data[i + 2] = Math.round(Math.min(255, Math.max(0, (data[i + 2] - k * 255) / (1 - k))))
    data[i + 3] = Math.round(255 * smooth(0.1, 0.35, a) * Math.min(1, a / 0.35))
  }
  await sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .webp({ quality: 88, alphaQuality: 90 })
    .toFile(`${PUB}/stones-backdrop.webp`)
  console.log(`${PUB}/stones-backdrop.webp from #${n}, ${W}x${H}`)
}

async function main() {
  const [cmd, opt] = process.argv.slice(2)
  await dirs()
  if (cmd === "paint") await paint(opt ?? "gemini-3.1-flash-image")
  else if (cmd === "key") await key(opt ? Number(opt) : await latest())
  else console.log("usage: backdrop.ts paint [model] | key [n]")
}
void main()
