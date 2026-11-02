// Card spike: the cast stay standees, repainted to match a photoreal set. The Codex CLI, on the owner's ChatGPT
// subscription, redraws each card as a photograph of the same person in the same pose on a green screen: the front from
// the painted front, the back from the painted back with the new front as its likeness. Then the cutout: the tool's own
// transparency where it gave one, or a distance-from-green key as scripts/stage-standees.ts does it.
//
//   node --import tsx lab/stage-art/cards.ts paint garlan,branka     # front then back for each, three at a time
//   node --import tsx lab/stage-art/cards.ts paint garlan --back     # the back alone, from the front already made
//   node --import tsx lab/stage-art/cards.ts key garlan              # cut the raws out again
//   node --import tsx lab/stage-art/cards.ts crop garlan,branka      # painted beside photoreal, for review
//
// Reads public/stage/fixtures/welcome-to-kordavos/<id>-front.webp and -back.webp. Writes raw/<id>-card-front.png and
// -back.png, and public/stage-lab/cards/<id>-front.webp and -back.webp, which the lab shows with &cards=1.

import { mkdir, writeFile } from "node:fs/promises"
import sharp from "sharp"
import { codexPaint, DESKTOP, dirs, jpeg, PUB, RAW, smooth } from "./gen"

const FIXTURES = "public/stage/fixtures/welcome-to-kordavos"
const OUT = `${PUB}/cards`
const GREEN = "#00ff00"

const REAL = `Render it as a real person photographed on location for a film: real skin with pores and stubble, real hair, forged and worn metal, woven wool and linen, oiled and scuffed leather, real stitching and wear. Natural proportions. Soft overcast daylight from the upper left, gentle and even, with no rim light and no hard shadow.

Full body, head to toe, nothing cropped, about 6% margin on all sides, feet flat near the bottom of the frame, eye-level view without perspective distortion. No outline, no halo, no cast shadow and no ground shadow.

Background: SOLID UNIFORM PURE GREEN (#00FF00) everywhere, edge to edge. No scenery, no floor, no text, no border. One person only. Nothing in the subject itself is bright green.`

const FRONT = `The attached image is a painted game character on a green screen. Make a photograph of the SAME person, in the SAME pose and stance, seen from the same angle, at the same scale and position in the frame.

Keep the face, the age, the hair and beard, the build and height, and every piece of the outfit and gear: its shapes, colours, emblems, layers, and what each hand holds. Keep the silhouette. Only the finish changes, from painting to photograph.

${REAL}`

const BACK = `Two images are attached. Image 1 is a photograph of a character from the front. Image 2 is a painting of the same character seen from directly behind.

Make a photograph of the SAME person from directly behind, in the pose, stance, scale and position of image 2, with the materials, colours and photographic finish of image 1, on the same green screen as both. Back of the head, with the hair colour of image 1, no face and no profile. Whatever is held stays in the same hand as in image 2. Keep the silhouette of image 2.

${REAL}`

// The image tool mostly answers a green-screen request with a real transparent background: then its own alpha is the
// cutout. When it does paint the green, alpha comes from how far each pixel leans toward green, eroded two pixels, with
// the green spill taken off the soft edge.
async function cutout(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H } = info
  const clear = data[3] < 40 && data[(W - 1) * 4 + 3] < 40
  let alpha = new Uint8Array(W * H).map((_, p) => (clear ? data[p * 4 + 3] : Math.round(255 * (1 - smooth(45, 125, data[p * 4 + 1] - Math.max(data[p * 4], data[p * 4 + 2]))))))
  for (let pass = 0; pass < (clear ? 0 : 2); pass++) {
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
  let [minX, minY, maxX, maxY] = [W, H, 0, 0]
  for (let p = 0; p < W * H; p++) {
    const i = p * 4
    data[i + 3] = alpha[p]
    if (alpha[p] < 250 && !clear) data[i + 1] = Math.min(data[i + 1], Math.max(data[i], data[i + 2]))
    if (alpha[p] > 40) {
      const x = p % W
      const y = (p - x) / W
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX <= minX) throw new Error("Empty cutout")
  // A picture that came back on some other backdrop keeps its whole frame: the top corners are still solid.
  if (alpha[0] > 40 || alpha[W - 1] > 40) throw new Error("No green screen and no transparency")
  const pad = 6
  const left = Math.max(0, minX - pad)
  const top = Math.max(0, minY - pad)
  const region = { left, top, width: Math.min(W - left, maxX - minX + 2 * pad), height: Math.min(H - top, maxY - minY + 2 * pad) }
  return sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .extract(region)
    .png()
    .toBuffer()
}

const onGreen = async (path: string | Buffer) => jpeg(await sharp(path).flatten({ background: GREEN }).toBuffer(), 1536)

async function key(id: string, view: "front" | "back") {
  const cut = await cutout(await sharp(`${RAW}/${id}-card-${view}.png`).png().toBuffer())
  await sharp(cut).webp({ quality: 92, alphaQuality: 100, effort: 5 }).toFile(`${OUT}/${id}-${view}.webp`)
  const { width, height } = await sharp(cut).metadata()
  console.log(`${OUT}/${id}-${view}.webp ${width}x${height}`)
}

async function paint(id: string, views: ("front" | "back")[]) {
  for (const view of views) {
    const images = view === "front" ? [await onGreen(`${FIXTURES}/${id}-front.webp`)] : [await onGreen(`${RAW}/${id}-card-front.png`), await onGreen(`${FIXTURES}/${id}-back.webp`)]
    // Ask again, twice at most, if the picture comes back with a backdrop that cannot be cut out.
    for (let attempt = 1; ; attempt++) {
      const png = await codexPaint(`card ${id} ${view}`, view === "front" ? FRONT : BACK, images, "portrait 2:3")
      await writeFile(`${RAW}/${id}-card-${view}.png`, png)
      const keyed = await key(id, view).then(
        () => true,
        (error) => (attempt < 3 ? false : Promise.reject(error))
      )
      if (keyed) break
    }
  }
}

// The painted card beside the photoreal one, front and back, at one height on the set's stone grey.
async function crop(id: string) {
  const H = 1400
  const tiles = await Promise.all(
    [`${FIXTURES}/${id}-front.webp`, `${OUT}/${id}-front.webp`, `${FIXTURES}/${id}-back.webp`, `${OUT}/${id}-back.webp`].map(async (f) => {
      const data = await sharp(f).resize({ height: H }).flatten({ background: "#6f6a62" }).png().toBuffer()
      return { data, width: (await sharp(data).metadata()).width ?? 0 }
    })
  )
  let left = 0
  const layers = tiles.map((t) => {
    const at = { input: t.data, left, top: 0 }
    left += t.width + 12
    return at
  })
  await sharp({ create: { width: left - 12, height: H, channels: 3, background: "#6f6a62" } })
    .composite(layers)
    .jpeg({ quality: 90 })
    .toFile(`${DESKTOP}/${id}-card-painted-vs-photoreal.jpg`)
  console.log(`${DESKTOP}/${id}-card-painted-vs-photoreal.jpg`)
}

async function main() {
  const [cmd, list, ...flags] = process.argv.slice(2)
  const ids = (list ?? "").split(",").filter(Boolean)
  if (!ids.length || !["paint", "key", "crop"].includes(cmd)) return console.log("usage: cards.ts paint|key|crop <id,...> [--back]")
  await dirs()
  await mkdir(OUT, { recursive: true })
  await mkdir(DESKTOP, { recursive: true })
  const views: ("front" | "back")[] = flags.includes("--back") ? ["back"] : flags.includes("--front") ? ["front"] : ["front", "back"]
  const queue = [...ids]
  const failed: string[] = []
  // Three at a time: each is one image call on the subscription, a minute or two long.
  await Promise.all(
    Array.from({ length: cmd === "paint" ? 3 : 1 }, async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        const run = cmd === "paint" ? paint(id, views) : cmd === "key" ? Promise.all(views.map((v) => key(id as string, v))) : crop(id)
        await run.catch((error) => {
          failed.push(id as string)
          console.log(`${id}: ${error instanceof Error ? error.message : String(error)}`)
        })
      }
    })
  )
  if (failed.length) console.log(`failed: ${failed.join(",")}`)
}
void main()
