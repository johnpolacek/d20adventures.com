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
import { codexPaint, DESKTOP, dirs, edgeDrift, gptEdit, jpeg, PUB, RAW } from "./gen"

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
    prompt: `The image is a rough render from a 3D game: PLACE. Turn it into a photorealistic film still, as if shot on location for a big-budget fantasy film.

${KEEP}

DETAIL Shot on a 24 mm lens, deep focus, fine film grain. A photograph, not a painting, not a 3D render.`,
  },
} as const

// For a second view of a place: the plate already shows an earlier painting projected onto what that painting covered.
const FILL = `Parts of this image are already finished at full detail, from an earlier pass. Leave those parts exactly as they are: same stone, same colours, same light. Finish every part that still looks like a flat, rough 3D render so it matches the finished parts in material, colour, wear and lighting, as one continuous place. Where a finished surface is smeared or stretched, redraw it cleanly in the same material.`

// What the photoreal prompt says of the place and of its materials and light, unless --place= and --detail= say otherwise.
const GATE = {
  place: "the great south gate of a medieval city on a festival morning, seen from the market road",
  detail:
    "Real materials at full detail: weathered sandstone and brick with mortar lines, chips, stains and moss, carved stone trim, heavy woven wool banners with embroidered gold, sun-bleached canvas awnings with stitching and sag, rough timber poles, iron fittings, a worn cobbled road with dust and straw. Natural low morning sunlight from the left, soft bounced light in the shadows, light haze in the air, real sky with clouds.",
}
const worded = (prompt: string, flags: string[]) =>
  prompt.replace("PLACE", flags.find((f) => f.startsWith("--place="))?.slice(8) ?? GATE.place).replace("DETAIL", flags.find((f) => f.startsWith("--detail="))?.slice(9) ?? GATE.detail)

// For a closer plate from the same point as an earlier painting: the plate shows that painting enlarged, so it is soft.
const SHARPEN = `This image is an enlargement of a finished photograph of this place, so it is soft. Redraw it at full sharpness, as the same photograph taken with a longer lens: fine real detail in the stone, mortar, wood grain, cloth weave, metal and straw. Every object, edge, colour, shadow and the lighting stay exactly where they are.`

const PANO = `This picture is a full 360 degree equirectangular panorama, twice as wide as it is tall. Keep that projection exactly: the horizon stays a level line at mid height, straight lines stay curved the way they are, and the left edge must join the right edge without a seam. The rope-and-post barriers on the road stay where they are.`

async function pano(name: string, style: keyof typeof STYLES) {
  const s = STYLES[style]
  const src = `${RAW}/captures/${name}-rgb.png`
  const images = [await jpeg(src, 3840), ...(s.art ? [await jpeg(ART, 1600)] : [])]
  const png = await gptEdit(`repaint pano ${name} ${style}`, "gpt-image-2", `${worded(s.prompt, [])}\n\n${PANO}`, images, "3840x1920")
  await sharp(png).jpeg({ quality: 94 }).toFile(`${RAW}/${name}-${style}-pano-in.jpg`)
  await sharp(png).jpeg({ quality: 92 }).toFile(`${DESKTOP}/${name}-${style}-pano-gpt.jpg`)
  const m = await sharp(png).metadata()
  console.log(`${RAW}/${name}-${style}-pano-in.jpg ${m.width}x${m.height}`)
}

async function main() {
  const argv = process.argv.slice(2)
  await mkdir(DESKTOP, { recursive: true })
  // drift <plate> <painting in public/stage-lab, no extension>...: how well each painting kept the plate's edges.
  if (argv[0] === "drift" && argv[1]) {
    for (const name of argv.slice(2)) {
      const d = await edgeDrift(`${RAW}/captures/${argv[1]}.png`, `${PUB}/${name}.png`, `${RAW}/${name}-edges.jpg`)
      console.log(`${name}: within 2 px ${d.within2}%, within 8 px ${d.within8}%`)
    }
    return
  }
  if (argv[0] === "pano" && argv[1] && (argv[2] ?? "painterly") in STYLES) return pano(argv[1], (argv[2] ?? "painterly") as keyof typeof STYLES)
  // --cli paints through the Codex CLI on the owner's ChatGPT subscription, not the metered API. --as=<name> names the
  // result. --fill tells the painter that parts of the plate are already finished and must stay as they are. --sharpen
  // tells it the plate is a soft enlargement of a finished painting.
  const flags = argv.filter((a) => a.startsWith("--"))
  const [plate, style = "painterly", size = "2880x1920"] = argv.filter((a) => !a.startsWith("--"))
  if (!plate || !(style in STYLES)) return console.log("usage: repaint.ts <plate> painterly|photoreal [size] [--cli] [--fill] [--sharpen] [--as=name]")
  const s = STYLES[style as keyof typeof STYLES]
  const cli = flags.includes("--cli")
  const prompt = `${worded(s.prompt, flags)}${flags.includes("--fill") ? `\n\n${FILL}` : ""}${flags.includes("--sharpen") ? `\n\n${SHARPEN}` : ""}`
  await dirs()
  const src = `${RAW}/captures/${plate}.png`
  const { width = 0, height = 0 } = await sharp(src).metadata()
  const images = [await jpeg(src, cli ? 2048 : 2880), ...(s.art ? [await jpeg(ART, 1600)] : [])]
  const png = cli ? await codexPaint(`repaint ${plate} ${style}`, prompt, images) : await gptEdit(`repaint ${plate} ${style}`, "gpt-image-2", prompt, images, size)
  const name = flags.find((f) => f.startsWith("--as="))?.slice(5) ?? `${plate}-${style}${cli ? "-cli" : ""}`
  const out = `${PUB}/${name}`
  // Exactly the plate's size: the projector maps the painting's corners to the camera's frustum.
  await sharp(png).resize(width, height, { fit: "fill" }).png().toFile(`${out}.png`)
  await copyFile(`${RAW}/captures/${plate}.json`, `${out}.json`)
  await sharp(png).jpeg({ quality: 92 }).toFile(`${DESKTOP}/${name}.jpg`)
  const m = await sharp(png).metadata()
  console.log(`${out}.png from ${m.width}x${m.height}`)
}
main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err))
  process.exit(1)
})
