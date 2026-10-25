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
const COVERT = "https://d1dkwd3w4hheqw.cloudfront.net/images/settings/realm-of-myr/covert-cargo/encounters"

// `scene` says what the far scenery is and how it is laid out. The painting's lowest band must be forest or ground that
// can sit just below the set's horizon: anything painted there reads as giant if it rises above the land. `cool` turns on
// the key's correction for moonlit blue-grey, which would brown a red roof. An `opaque` backdrop has no sky: it is
// painted edge to edge, like the depths of a forest, and not keyed.
type Backdrop = { ref: string; light: string; scene: string; cool?: boolean; opaque?: boolean }
const BACKDROPS: Record<string, Backdrop> = {
  "stones-valley": {
    ref: `${ART}/the-midnight-summons/meeting-at-the-stones.png`,
    light: "moonlit night light",
    cool: true,
    scene: `the far end of a deep, forested mountain valley at night, seen from the valley floor. Steep dark mountain walls rise on the left and on the right, as in the reference. Between them, layers of more distant ridges and peaks recede into blue-grey moonlit mist, each farther layer paler and softer. Moonlight catches the ridgelines and rock faces from above and behind.

Layout:
- The lowest fifth of the image is one continuous band of dark, misty conifer and broadleaf forest along the valley floor, across the full width, with no gaps.
- The mountains fill roughly the lower half of the image. The tallest walls are near the left and right ends, lower ridges toward the middle.`,
  },
  // The other way from the stones, behind Thalbern's close-up: the valley's gentle side. Its left end meets the valley's
  // right-hand mountain wall.
  "stones-woods": {
    ref: `${ART}/the-midnight-summons/meeting-at-the-stones.png`,
    light: "moonlit night light",
    cool: true,
    scene: `the gentle, wooded side of the same valley at night, with the moon high behind the viewer: a long, dark, densely forested ridge beyond the river. The ridge is near enough that its trees read clearly, and its skyline is a crisp, jagged silhouette of individual conifer tips against the sky. Behind it, one lower, paler wooded ridge shows through a little haze. Moonlight from the front catches the tree crowns with cool silver highlights. Almost no mist: no fog banks, no clouds, no pale bands.

Layout:
- The bottom half of the image is solid dark forest canopy, across the full width, with no gaps and no clearings.
- The ridge's skyline runs between 55% and 70% of the image height, rising at the far left, where it climbs to the top edge as the forested shoulder of a mountain.
- Above the skyline is magenta sky only. Every pixel below the skyline is painted forest.
- No water, no river, no lake, no large trees in the foreground.`,
  },
  // Behind the riverfront close-ups, which look away from the river to where the quay's paving ends: the far side of the
  // square. Hung near (70 m), its street line at the paving's edge.
  "riverfront-city": {
    ref: `${COVERT}/return-to-the-city/280cc3ba-f72d-4e91-b839-8cec3778791b.png`,
    light: "bright warm afternoon light",
    scene: `the far side of a wide paved square in the same city, on a bright afternoon with the sun low behind the buildings: a continuous row of three- and four-storey timber-framed townhouses with steep red tile roofs, chimneys and gables, shoulder to shoulder across the full width. Behind them rise two or three slender round stone towers with conical red roofs, and in the far distance the walls of a castle on a hill. The facades face the viewer in soft, warm shadow, with bright warm light along the roof edges.

Layout:
- The houses all stand on one straight, level street line at about 12% of the image height, across the full width. Below it is only the paving of the square, in shadow.
- The rooftops reach about half the image height. The towers and the castle reach about 70%.
- Above the rooftops and towers is magenta sky only.
- Seen straight on, level, with no perspective: the street line is horizontal.
- No people, no carts, no market stalls, no trees in front of the houses.`,
  },
  // Across the Kordavos harbour, behind the moored ships: the far quays and the city on its hill, in golden late light.
  "docks-harbour": {
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726345480155",
    light: "golden late-afternoon sunlight with a warm haze",
    scene: `the far side of a busy city harbour seen across the water in golden late-afternoon light: a long stone quay with tall stone warehouses with arched arcades, timber-framed houses with red tile roofs stacked up a hill behind, round and square towers, a church spire, and a castle with tall pale towers on the hilltop. Along the far quay, many moored ships and boats with tall masts and furled sails, their masts rising above the roofs. Warm haze softens the farthest buildings.

Layout:
- The lowest band of the image, about the bottom 8%, is the dark stone of the far quay wall and the hulls of moored ships right at the waterline, across the full width. No water in the image.
- The buildings fill the lower half of the image, climbing toward a hill in the right half. The castle's towers reach about 70% of the image height. The ships' masts rise to about 55%.
- Above the rooftops, towers and masts is magenta sky only: the WHOLE sky, right up to the top edge, is flat pure magenta (#FF00FF). No clouds, no blue, no haze bands, no ships or buildings floating in the sky, nothing in the top quarter of the image.
- Seen straight on, level, with no perspective: the quay's waterline is horizontal.
- No people large enough to see, no birds, no sun disc.`,
  },
  // Every way the old forest path's close-ups look: giant trunks fading into the green haze, where the scatter ends.
  "forest-path-depths": {
    ref: `${COVERT}/the-end/68166163-ba2c-4387-bfb6-a98343c6c9d7.png`,
    light: "hazy, green-gold afternoon light",
    scene: `the depths of the same ancient forest of giant trees: huge, straight trunks of giant old trees, grey-green with moss, stand in rows that recede into thick, luminous green-gold haze, each farther row paler and softer until the last fade into the haze completely. Ferns and low undergrowth at their feet.

Layout:
- The forest floor runs along the bottom tenth of the image, level, across the full width.
- The trunks rise from it all across the width and run out of the top edge of the image. No canopy and no sky are visible.
- Between and behind the trunks there is only haze, up to the top edge.
- No path, no people, no animals, no fallen logs in front.`,
    opaque: true,
  },
  // Round Thalbern's cottage: the forest edge across the clearing, where the scatter thins to bare ground.
  "home-woods": {
    ref: `${ART}/the-midnight-summons/back-home.png`,
    light: "bright, dappled daylight",
    scene: `the edge of the same forest seen across a sunny clearing: tall broadleaf trees and a few conifers stand along a long, low forest edge, sunlit trunks and rich green crowns, with soft blue-green haze between the trunks deeper in. The light is bright and warm.

Layout:
- The forest floor runs along the bottom eighth of the image, level, across the full width.
- The treetops form a ragged edge of individual crowns at about 35% of the image height across the full width, never higher than 40%.
- Above the treetops is magenta sky only.
- No cottage, no path, no people, no animals, nothing in the foreground.`,
  },
  // The Marquis Road's hill woods (Well Met), round the road both ways: wooded hills of firs under pale rock peaks.
  "marquis-hills": {
    ref: "https://d1dkwd3w4hheqw.cloudfront.net/images/settings/realm-of-myr/the-road-to-kordavos/encounters/well-met/9e37fb3b-cf49-45f8-bc22-7d423e1b460e.png",
    light: "bright, clear morning sunlight",
    scene: `wooded hill country seen from a road in a valley: steep hillsides covered in tall, dark firs and spruces with rounder broadleaf trees among them, rising in two or three layers, each farther layer bluer and softer in the clear air. Above the farther hills stand two pale grey rock peaks with sheer faces, sunlit, as in the reference. The fir tips make a crisp, jagged skyline against the sky.

Layout:
- The lowest fifth of the image is one continuous band of dense forest across the full width, with no gaps, no clearings and no road.
- The wooded hills fill roughly the lower half of the image, their skyline rising and falling between 35% and 55% of the image height.
- The two rock peaks rise to about 70% of the image height, one left of centre and one smaller far to the right. Elsewhere the skyline stays below 55%.
- Above the skyline is magenta sky only.`,
  },
}

const prompt = (b: Backdrop) => `A very wide panoramic matte painting, to be used as the far backdrop of a 3D game scene. Paint it in the exact style, palette and ${b.light} of the reference painting.

What it shows: ${b.scene}
${
  b.opaque
    ? "- The image is painted edge to edge. No sky shows anywhere. Nothing magenta, pink or purple."
    : "- The SKY is SOLID, FLAT, PURE MAGENTA (#FF00FF) everywhere above the scenery: no moon, no sun, no stars, no clouds, no glow, no gradient, nothing painted in the sky.\n\nNothing magenta, pink or purple anywhere except the sky."
} No people, no animals, no foreground objects, no text, no border. Oil painting with soft, confident brushwork. NOT a photograph, NOT a 3D render.`

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
// and white snow keep their colour, lavender turns blue-grey. Blue is held near green too. Only for `cool` backdrops.
async function key(id: string, raw: string) {
  const cool = !!BACKDROPS[id].cool
  const out = `${OUT}/${id}.webp`
  if (BACKDROPS[id].opaque) {
    await sharp(raw).resize({ width: WIDTH }).webp({ quality: 88 }).toFile(out)
    return console.log(`${out} from ${raw}, opaque`)
  }
  const { data, info } = await sharp(raw).resize({ width: WIDTH }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H } = info
  const N = W * H
  const t = new Float32Array(N)
  for (let p = 0; p < N; p++) t[p] = Math.min(1, Math.max(0, (Math.min(data[p * 4], data[p * 4 + 2]) - data[p * 4 + 1]) / 250))
  // Flood fill over 4-neighbours from `seeds`, through pixels `pass` allows.
  const flood = (seeds: number[], pass: (p: number) => boolean) => {
    const hit = new Uint8Array(N)
    const stack = seeds.filter(pass)
    for (const p of stack) hit[p] = 1
    while (stack.length) {
      const p = stack.pop() as number
      const x = p % W
      for (const q of [p - W, p + W, x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1])
        if (q >= 0 && q < N && !hit[q] && pass(q)) {
          hit[q] = 1
          stack.push(q)
        }
    }
    return hit
  }
  const row = (y: number) => Array.from({ length: W }, (_, x) => y * W + x)
  // Land is paint joined to the bottom edge. Paint floating in the sky (a ghost ridge, a moon) is dropped. Magenta that
  // land encloses, out of reach of the sky, is mist the model painted magenta: it is filled from the paint above and
  // below it, and stays solid.
  const land = flood(row(H - 1), (p) => t[p] <= 0.5)
  const sky = flood(row(0), (p) => !land[p])
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++) {
      if (land[y * W + x] || sky[y * W + x]) continue
      const top = Math.max(y - 1, 0)
      while (y < H && !land[y * W + x] && !sky[y * W + x]) y++
      const bottom = Math.min(y, H - 1)
      for (let f = top + 1; f < y; f++) {
        const u = (f - top) / (bottom - top)
        for (let c = 0; c < 3; c++) data[(f * W + x) * 4 + c] = Math.round(data[(top * W + x) * 4 + c] * (1 - u) + data[(bottom * W + x) * 4 + c] * u)
        t[f * W + x] = 0
      }
    }
  // Sky keeps only the soft edge within 3 px of land.
  const edge = new Uint8Array(N)
  for (let p = 0; p < N; p++)
    if (land[p])
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          const x = (p % W) + dx
          const q = p + dy * W + dx
          if (x >= 0 && x < W && q >= 0 && q < N) edge[q] = 1
        }
  for (let p = 0; p < N; p++) {
    const i = p * 4
    const a = 1 - t[p]
    const k = Math.min(t[p], 0.9)
    const g = Math.min(255, data[i + 1] / (1 - k))
    const b = Math.min(255, cool ? 1.28 * g + 8 : 255, Math.max(0, (data[i + 2] - k * 255) / (1 - k)))
    data[i] = Math.round(Math.max(0, Math.min(cool ? g - 0.6 * (b - g) : 255, (data[i] - k * 255) / (1 - k))))
    data[i + 1] = Math.round(g)
    data[i + 2] = Math.round(b)
    data[i + 3] = sky[p] && !edge[p] ? 0 : Math.round(255 * smooth(0.1, 0.35, a) * Math.min(1, a / 0.35))
  }
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
