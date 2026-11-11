// Card spike: the cast stay standees, repainted to match a photoreal set. The Codex CLI, on the owner's ChatGPT
// subscription, redraws each card as a photograph of the same person in the same pose on a green screen: the front from
// the painted front, the back from the painted back with the new front as its likeness. Then the cutout: the tool's own
// transparency where it gave one, or a distance-from-green key as scripts/stage-standees.ts does it.
//
//   node --import tsx lab/stage-art/cards.ts paint garlan,branka     # front then back for each, three at a time
//   node --import tsx lab/stage-art/cards.ts paint garlan --back     # the back alone, from the front already made
//   node --import tsx lab/stage-art/cards.ts key garlan              # cut the raws out again
//   node --import tsx lab/stage-art/cards.ts crop garlan,branka      # painted beside photoreal, for review
//   node --import tsx lab/stage-art/cards.ts paint crowd             # the crowd's 16 people, from its atlas
//   node --import tsx lab/stage-art/cards.ts pack                    # their atlas again, in public/stage-lab/crowd
//   node --import tsx lab/stage-art/cards.ts paint heroes/human-a    # a card anywhere under public/stage
//   node --import tsx lab/stage-art/cards.ts publish garlan,heroes/human-a   # into the game, beside the painted card
//
// An id is a card under public/stage: `heroes/human-a` is public/stage/heroes/human-a-front.webp and -back.webp, and a
// bare name is one of public/stage/fixtures/welcome-to-kordavos. Writes raw/<id>-card-front.png and -back.png, and
// public/stage-lab/cards/<id>-front.webp and -back.webp, which the lab shows with &cards=1. In those names a `/` in the
// id is written `--`.
//
// `publish` copies a card's photographs to a `photoreal` folder beside the painted card and lists every such card in
// public/stage/photoreal.json. On a painted set the engine shows the photograph of any card listed there.

import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import sharp from "sharp"
import { codexPaint, DESKTOP, dirs, jpeg, PUB, RAW, smooth } from "./gen"

const FIXTURES = "public/stage/fixtures/welcome-to-kordavos"
const OUT = `${PUB}/cards`
const GREEN = "#00ff00"

const REAL = `Render it as a real person photographed on location for a film: real skin with pores and stubble, real hair, forged and worn metal, woven wool and linen, oiled and scuffed leather, real stitching and wear. Soft overcast daylight from the upper left, gentle and even, with no rim light and no hard shadow.

Full body, head to toe, nothing cropped, about 6% margin on all sides, feet flat near the bottom of the frame, eye-level view without perspective distortion. No outline, no halo, no cast shadow and no ground shadow.

Background: SOLID UNIFORM PURE GREEN (#00FF00) everywhere, edge to edge. No scenery, no floor, no text, no border. One person only. Nothing in the subject itself is bright green.`

const FRONT = `The attached image is a painted game character on a green screen. Make a photograph of the SAME person, in the SAME pose and stance, seen from the same angle, at the same scale and position in the frame.

Keep the face: the same features, the same age and lines, the same scars and the same expression. Keep the hair and beard. Keep every piece of the outfit and gear: its shapes, colours, emblems, layers, and what each hand holds.

Keep the body's proportions exactly as painted: the size of the head against the body, the length of the legs and arms, the width of the shoulders and hips. A stocky dwarf stays stocky with a large head and short legs, a halfling stays small, a half-orc stays heavy. Do not make anyone taller, slimmer, younger or more like an ordinary human. Keep the silhouette. Only the finish changes, from painting to photograph.

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

// The crowd: 16 people, front and back, packed four by four into a colour atlas and an alpha atlas. An id of
// `crowd-<variant>` paints one of them, and `pack` lays the results out again as the engine reads them: each figure fitted
// into its cell with a 2 px margin, standing on the cell's bottom-left corner.
const ATLAS = "public/stage/crowd/realm-of-myr"
const CROWD = `${PUB}/crowd`
type Variant = { id: string; uMax: number; vMax: number; aspect: number; srcW: number; srcH: number; back: Variant }
type Atlas = { variants: Variant[]; layer: [number, number]; cols: number; rows: number }
const atlas = async () => JSON.parse(await readFile(`${ATLAS}/atlas.json`, "utf8")) as Atlas

async function crowdCard(variant: string, view: "front" | "back") {
  const meta = await atlas()
  const [LW, LH] = meta.layer
  const k = meta.variants.findIndex((v) => v.id === variant)
  if (k < 0) throw new Error(`No crowd variant ${variant}`)
  const region = { left: (k % meta.cols) * LW, top: Math.floor(k / meta.cols) * LH, width: LW, height: LH }
  const rgb = await sharp(`${ATLAS}/${view}-rgb.webp`).extract(region).removeAlpha().raw().toBuffer()
  const a = await sharp(`${ATLAS}/${view}-a.webp`).extract(region).extractChannel(0).raw().toBuffer()
  const out = Buffer.alloc(LW * LH * 4)
  for (let i = 0; i < LW * LH; i++) {
    out[i * 4] = rgb[i * 3]
    out[i * 4 + 1] = rgb[i * 3 + 1]
    out[i * 4 + 2] = rgb[i * 3 + 2]
    out[i * 4 + 3] = a[i]
  }
  // Trimmed to the figure and set in the middle of a portrait frame, for the painter.
  const cut = await sharp(out, { raw: { width: LW, height: LH, channels: 4 } })
    .trim({ threshold: 1 })
    .resize({ width: 900, height: 1400, fit: "inside" })
    .png()
    .toBuffer()
  return sharp({ create: { width: 1024, height: 1536, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: cut, gravity: "centre" }])
    .png()
    .toBuffer()
}

// Where a card's painted art is under public/stage, without its view: a bare name is one of the gate's fixtures.
const base = (id: string) => (id.includes("/") ? `public/stage/${id}` : `${FIXTURES}/${id}`)
// The name a card's lab files go by.
const slug = (id: string) => id.replaceAll("/", "--")
const source = (id: string, view: "front" | "back") => (id.startsWith("crowd-") ? crowdCard(id.slice(6), view) : `${base(id)}-${view}.webp`)

// Photographs into the game: <dir>/photoreal/<name>-front.webp and -back.webp beside the painted card, and the list of
// every card that has them.
async function publish(ids: string[]) {
  for (const id of ids) {
    const at = base(id)
    const dir = `${at.slice(0, at.lastIndexOf("/"))}/photoreal`
    await mkdir(dir, { recursive: true })
    for (const view of ["front", "back"]) await copyFile(`${OUT}/${slug(id)}-${view}.webp`, `${dir}/${at.slice(at.lastIndexOf("/") + 1)}-${view}.webp`)
    console.log(`${dir}/${at.slice(at.lastIndexOf("/") + 1)}`)
  }
  const listed: string[] = []
  const walk = async (dir: string) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.isDirectory()) await walk(`${dir}/${e.name}`)
      else if (dir.endsWith("/photoreal") && e.name.endsWith("-front.webp")) listed.push(`${dir.slice("public/stage/".length, -"/photoreal".length)}/${e.name.slice(0, -"-front.webp".length)}`)
    }
  }
  await walk("public/stage")
  await writeFile("public/stage/photoreal.json", `${JSON.stringify(listed.sort(), null, 2)}\n`)
  console.log(`public/stage/photoreal.json: ${listed.length} cards`)
}

async function pack() {
  const meta = await atlas()
  const [LW, LH] = meta.layer
  await mkdir(CROWD, { recursive: true })
  for (const view of ["front", "back"] as const) {
    const colour: sharp.OverlayOptions[] = []
    const alpha: sharp.OverlayOptions[] = []
    for (const [k, v] of meta.variants.entries()) {
      const { data, info } = await sharp(`${OUT}/crowd-${v.id}-${view}.webp`)
        .resize({ width: LW - 4, height: LH - 4, fit: "inside" })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      const [w, h] = [info.width, info.height]
      // Under the cutout the cell takes the figure's own average colour, so small copies of the atlas do not pick up a
      // dark fringe from a background that was never meant to show.
      let [r, g, b, n] = [0, 0, 0, 0]
      for (let i = 0; i < w * h; i++)
        if (data[i * 4 + 3] > 200) {
          r += data[i * 4]
          g += data[i * 4 + 1]
          b += data[i * 4 + 2]
          n++
        }
      const mean = { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) }
      const at = { left: (k % meta.cols) * LW, top: Math.floor(k / meta.cols) * LH }
      const figure = sharp(data, { raw: { width: w, height: h, channels: 4 } })
      const cell = (background: { r: number; g: number; b: number }, input: Buffer) =>
        sharp({ create: { width: LW, height: LH, channels: 3, background } })
          .composite([{ input, left: 2, top: LH - 2 - h }])
          .png()
          .toBuffer()
      colour.push({ input: await cell(mean, await figure.clone().png().toBuffer()), ...at })
      alpha.push({ input: await cell({ r: 0, g: 0, b: 0 }, await figure.clone().extractChannel(3).toColourspace("b-w").png().toBuffer()), ...at })
      const m = view === "front" ? v : v.back
      Object.assign(m, { uMax: +((w + 4) / LW).toFixed(5), vMax: +((h + 4) / LH).toFixed(5), aspect: +(w / h).toFixed(5), srcW: w, srcH: h })
    }
    const sheet = () => sharp({ create: { width: LW * meta.cols, height: LH * meta.rows, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    await sheet().composite(colour).webp({ quality: 92, effort: 5 }).toFile(`${CROWD}/${view}-rgb.webp`)
    await sheet().composite(alpha).webp({ quality: 95, effort: 5 }).toFile(`${CROWD}/${view}-a.webp`)
  }
  await writeFile(`${CROWD}/atlas.json`, JSON.stringify(meta, null, 1))
  console.log(`${CROWD}/atlas.json, ${meta.variants.length} people`)
}

async function key(id: string, view: "front" | "back") {
  const cut = await cutout(
    await sharp(`${RAW}/${slug(id)}-card-${view}.png`)
      .png()
      .toBuffer()
  )
  await sharp(cut)
    .webp({ quality: 92, alphaQuality: 100, effort: 5 })
    .toFile(`${OUT}/${slug(id)}-${view}.webp`)
  const { width, height } = await sharp(cut).metadata()
  console.log(`${OUT}/${slug(id)}-${view}.webp ${width}x${height}`)
}

async function paint(id: string, views: ("front" | "back")[]) {
  for (const view of views) {
    const images = view === "front" ? [await onGreen(await source(id, "front"))] : [await onGreen(`${RAW}/${slug(id)}-card-front.png`), await onGreen(await source(id, "back"))]
    // Ask again, twice at most, if the picture comes back with a backdrop that cannot be cut out.
    for (let attempt = 1; ; attempt++) {
      const png = await codexPaint(`card ${id} ${view}`, view === "front" ? FRONT : BACK, images, "portrait 2:3")
      await writeFile(`${RAW}/${slug(id)}-card-${view}.png`, png)
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
    [await source(id, "front"), `${OUT}/${slug(id)}-front.webp`, await source(id, "back"), `${OUT}/${slug(id)}-back.webp`].map(async (f) => {
      const data = await sharp(await sharp(f).trim({ threshold: 1 }).toBuffer())
        .resize({ height: H })
        .flatten({ background: "#6f6a62" })
        .png()
        .toBuffer()
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
    .toFile(`${DESKTOP}/${slug(id)}-card-painted-vs-photoreal.jpg`)
  console.log(`${DESKTOP}/${slug(id)}-card-painted-vs-photoreal.jpg`)
}

async function main() {
  const [cmd, list, ...flags] = process.argv.slice(2)
  if (cmd === "pack") return pack()
  // `crowd` stands for all 16 of the crowd's people.
  const ids = (list === "crowd" ? (await atlas()).variants.map((v) => `crowd-${v.id}`).join(",") : (list ?? "")).split(",").filter(Boolean)
  if (cmd === "publish" && ids.length) return publish(ids)
  if (!ids.length || !["paint", "key", "crop"].includes(cmd)) return console.log("usage: cards.ts paint|key|crop|publish <id,...>|crowd [--back], cards.ts pack")
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
