// Environment spike, painted track: GPT Image 2 repaints a clean plate of a shot, in a named style, keeping every edge in
// place. The lab projects the result from that shot's camera (?project=<plate>-<style>).
//
//   node --env-file=.env --env-file=.env.local --import tsx lab/stage-art/repaint.ts <plate> painterly|photoreal [size]
//   node --env-file=.env --env-file=.env.local --import tsx lab/stage-art/repaint.ts pano <name> painterly|photoreal
//
// `pano` repaints the 360 colour panorama raw/captures/<name>-rgb.png (capture.ts --pano) into raw/<name>-<style>-pano-in.jpg,
// the picture marble.ts turns into a splat world. World Labs' own depth-to-panorama call lost the gate's turrets and
// added street lamps (2026-11-10), so the panorama is painted here instead.
//
// `plate` is a capture in raw/captures with its camera (capture.ts --camera --q=cast=off), such as gate-plate-gate.
// Writes public/stage-lab/<plate>-<style>.png and .json, and a copy to ~/Desktop/kordavos-gate-spike.

import { copyFile, mkdir } from "node:fs/promises"
import sharp from "sharp"
import { DESKTOP, dirs, gptEdit, jpeg, PUB, RAW } from "./gen"

const ART = "public/stage/art/welcome-to-kordavos/the-gates-of-kordavos.webp"

const KEEP = `Keep the composition exactly. Every tower, wall, arch, battlement, window, banner, awning, stall, pole, crate, barrel and the line of the ground stay in the same place, at the same size, with the same outline, so the result lines up with the render pixel for pixel. Do not add, move or remove buildings or objects. Do not add people or animals. No text.`

const STYLES = {
  painterly: {
    art: true,
    prompt: `The first image is a render from a 3D game: the great south gate of the city of Kordavos on a festival morning, seen from the market road. Repaint it as a finished painting in the style of the second image.

${KEEP}

Take from the second image its palette of deep teal shadow and molten gold light, its low sun breaking through haze, its dense carved ornament on stone, its rich cloth, and its brushwork and level of detail. Give the stone carved reliefs, weathering and depth. Give the awnings folds and wear. Let golden haze glow through the arch. Oil painting, not a photograph, not a 3D render.`,
  },
  photoreal: {
    art: false,
    prompt: `The image is a rough render from a 3D game: the great south gate of a medieval city on a festival morning, seen from the market road. Turn it into a photorealistic film still, as if shot on location for a big-budget fantasy film.

${KEEP}

Real materials at full detail: weathered sandstone and brick with mortar lines, chips, stains and moss, carved stone trim, heavy woven wool banners with embroidered gold, sun-bleached canvas awnings with stitching and sag, rough timber poles, iron fittings, a worn cobbled road with dust and straw. Natural low morning sunlight from the left, soft bounced light in the shadows, light haze in the air, real sky with clouds. Shot on a 24 mm lens, deep focus, fine film grain. A photograph, not a painting, not a 3D render.`,
  },
} as const

const PANO = `This picture is a full 360 degree equirectangular panorama, twice as wide as it is tall. Keep that projection exactly: the horizon stays a level line at mid height, straight lines stay curved the way they are, and the left edge must join the right edge without a seam. The rope-and-post barriers on the road stay where they are.`

async function pano(name: string, style: keyof typeof STYLES) {
  const s = STYLES[style]
  const src = `${RAW}/captures/${name}-rgb.png`
  const images = [await jpeg(src, 3840), ...(s.art ? [await jpeg(ART, 1600)] : [])]
  const png = await gptEdit(`repaint pano ${name} ${style}`, "gpt-image-2", `${s.prompt}\n\n${PANO}`, images, "3840x1920")
  await sharp(png).jpeg({ quality: 94 }).toFile(`${RAW}/${name}-${style}-pano-in.jpg`)
  await sharp(png).jpeg({ quality: 92 }).toFile(`${DESKTOP}/${name}-${style}-pano-gpt.jpg`)
  const m = await sharp(png).metadata()
  console.log(`${RAW}/${name}-${style}-pano-in.jpg ${m.width}x${m.height}`)
}

async function main() {
  const argv = process.argv.slice(2)
  await mkdir(DESKTOP, { recursive: true })
  if (argv[0] === "pano" && argv[1] && (argv[2] ?? "painterly") in STYLES) return pano(argv[1], (argv[2] ?? "painterly") as keyof typeof STYLES)
  const [plate, style = "painterly", size = "2880x1920"] = argv
  if (!plate || !(style in STYLES)) return console.log("usage: repaint.ts <plate> painterly|photoreal [size]")
  const s = STYLES[style as keyof typeof STYLES]
  await dirs()
  const src = `${RAW}/captures/${plate}.png`
  const { width = 0, height = 0 } = await sharp(src).metadata()
  const images = [await jpeg(src, 2880), ...(s.art ? [await jpeg(ART, 1600)] : [])]
  const png = await gptEdit(`repaint ${plate} ${style}`, "gpt-image-2", s.prompt, images, size)
  const out = `${PUB}/${plate}-${style}`
  // Exactly the plate's size: the projector maps the painting's corners to the camera's frustum.
  await sharp(png).resize(width, height, { fit: "fill" }).png().toFile(`${out}.png`)
  await copyFile(`${RAW}/captures/${plate}.json`, `${out}.json`)
  await sharp(png).jpeg({ quality: 92 }).toFile(`${DESKTOP}/${plate}-${style}.jpg`)
  const m = await sharp(png).metadata()
  console.log(`${out}.png from ${m.width}x${m.height}`)
}
main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err))
  process.exit(1)
})
