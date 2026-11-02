// Spike (b): an image model paints over our render of a shot, in the encounter art's style, keeping every edge in place.
// The lab projects the result from that shot's camera. An overlay of the render's edges on the painting shows drift.
//
//   node --env-file=.env --env-file=.env.local --import tsx lab/stage-art/paintover.ts paint gemini|gpt [plate]
//   node --env-file=.env --env-file=.env.local --import tsx lab/stage-art/paintover.ts overlay gemini|gpt [plate]
//
// `plate` is a capture name in raw/captures (default plate-stones, from capture.ts --name=plate --camera --q=cast=off).
// Writes public/stage-lab/stones-paint-<model>.png with the plate's camera as .json, and raw/stones-paint-<model>-edges.jpg.

import { copyFile } from "node:fs/promises"
import sharp from "sharp"
import { ART, dirs, edgeDrift, gemini, gptEdit, jpeg, PUB, RAW } from "./gen"

const PROMPT = `The first image is a render from a 3D game. Repaint it as a finished painting in the style of the second image.

Keep the composition exactly. Every standing stone, tree, rock, flagstone, the river, the grass, the mountains and the horizon stay in the same place, at the same size, with the same outline, so the painting lines up with the render pixel for pixel. Do not add, move or remove anything. Do not add people or animals.

Match the second image: its palette, its moonlit night light, its mist, its brushwork and its level of detail on stone, moss, bark, leaves and grass. Oil painting, not a photograph, not a 3D render. No text.`

const MODELS = { gemini: "gemini-3-pro-image", gpt: "gpt-image-2" } as const

async function paint(which: keyof typeof MODELS, plate: string) {
  const src = `${RAW}/captures/${plate}.png`
  const { width = 0, height = 0 } = await sharp(src).metadata()
  const png =
    which === "gemini"
      ? await gemini(`paint-over ${plate}`, MODELS.gemini, PROMPT, [await jpeg(src), await jpeg(ART.stones)], "3:2", "2K")
      : await gptEdit(`paint-over ${plate}`, MODELS.gpt, PROMPT, [await jpeg(src, 1536), await jpeg(ART.stones, 1536)], "1536x1024")
  const out = `${PUB}/stones-paint-${which}`
  // Exactly the plate's size: the projector maps the painting's corners to the camera's frustum.
  await sharp(png).resize(width, height, { fit: "fill" }).png().toFile(`${out}.png`)
  await copyFile(`${RAW}/captures/${plate}.json`, `${out}.json`)
  const m = await sharp(png).metadata()
  console.log(`${out}.png from ${m.width}x${m.height} (${MODELS[which]})`)
}

// The render's edges in red over the painting, and how many of them have a painted edge within a few pixels.
async function overlay(which: keyof typeof MODELS, plate: string) {
  const src = `${RAW}/captures/${plate}.png`
  const painted = `${PUB}/stones-paint-${which}.png`
  const d = await edgeDrift(src, painted, `${RAW}/stones-paint-${which}-edges.jpg`)
  console.log(`${which}: render edges with a painted edge within 2 px ${d.within2}%, within 8 px ${d.within8}% (${RAW}/stones-paint-${which}-edges.jpg)`)
}

async function main() {
  const [cmd, which = "gemini", plate = "plate-stones"] = process.argv.slice(2)
  if (which !== "gemini" && which !== "gpt") throw new Error("model: gemini or gpt")
  await dirs()
  if (cmd === "paint") await paint(which, plate)
  else if (cmd === "overlay") await overlay(which, plate)
  else console.log("usage: paintover.ts paint|overlay gemini|gpt [plate]")
}
void main()
