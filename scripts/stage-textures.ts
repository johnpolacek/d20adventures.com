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
const DISTURBANCE = `${ART}/the-disturbance/e304a481-79a3-4c8d-a8da-ba9044991495.png`
const BATTLE = `${ART}/battle-on-the-boat/088f0e14-cd0f-4312-821b-fac650a518f6.png`
const FAKE = `${ART}/the-fake/7b96ca3c-db72-4559-8f8d-59dacbba3185.png`

// `crop` is the reference's region to match, as fractions [left, top, width, height] of the art. Cut-outs are painted on
// green, or on magenta when the subject itself is green (leaves).
// `whole` paintings are one picture laid once on a surface (a rug, a fresco, a door), not tiled: `aspect` is the model's
// frame and `out` the published size, width by height. `tileX` makes only the left and right edges meet (a dome's band).
type Texture = {
  subject: string
  ref: string
  crop: [number, number, number, number]
  cutout?: boolean
  key?: "green" | "magenta"
  size?: number
  whole?: boolean
  aspect?: string
  out?: [number, number]
  tileX?: boolean
}
const LIBRARY = "public/stage/art/march-of-davos/the-old-grand-library.webp"
const SERPENT = "public/stage/art/march-of-davos/the-silver-serpent-tavern.webp"
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
  "leaves-oak": {
    subject:
      "ONE dense rounded clump of small oval live-oak leaves on short twigs, filling most of the frame, its outer edge broken into separate leaf sprays with background showing between them: deep green leaves, dark blue-green in the hollows, yellow-green light on the leaf tips",
    ref: SHIPMENT,
    crop: [0.62, 0.0, 0.38, 0.5],
    cutout: true,
    key: "magenta",
    size: 1024,
  },
  "leaves-broad": {
    subject:
      "ONE dense rounded clump of broad undergrowth leaves, heart-shaped and ivy-like, overlapping in layers and filling most of the frame, its outer edge broken into separate leaves with background showing between them: deep green with paler veins, dark in the hollows, soft highlights on the upper leaves",
    ref: DISTURBANCE,
    crop: [0.0, 0.45, 1.0, 0.55],
    cutout: true,
    key: "magenta",
    size: 1024,
  },
  // The tug's saloon, from the paintings inside it: the battle's red-brown wall boards, the hold's massive timbers, the
  // fake's oak door and the hold's worn floor. Painted larger, since the camera comes close indoors.
  "cabin-planks": {
    subject:
      "the face of ONE old ship's cabin wall plank, its grain running straight up and down the frame: rich red-brown and mahogany wood with darker umber grain lines and streaks, one small dark knot, warm amber light catching the raised grain, worn and scuffed, thick visible brushstrokes",
    ref: BATTLE,
    crop: [0.8, 0.2, 0.2, 0.7],
    size: 1536,
  },
  "timber-hold": {
    subject:
      "the face of ONE massive old weathered ship's timber, its grain running straight up and down the frame: grey-brown and smoky olive wood, deep dark cracks and checks along the grain, rough adze marks, worn pale ridges of grain catching warm light, grime packed in the cracks",
    ref: CRATE,
    crop: [0.25, 0.0, 0.4, 0.55],
    size: 1536,
  },
  "door-oak": {
    subject:
      "the face of ONE old oak door plank, its grain running straight up and down the frame: warm honey and copper-brown wood with dark brown grain lines, dents and scratches, a weathered sheen, thick visible brushstrokes",
    ref: FAKE,
    crop: [0.2, 0.0, 0.25, 0.9],
    size: 1536,
  },
  "floor-worn": {
    subject:
      "the face of ONE worn old floorboard in a ship's hold, its grain running straight up and down the frame: pale warm tan and honey wood worn smooth along the middle, darker brown grain lines and grime toward the edges, small splits and dents",
    ref: CRATE,
    crop: [0.35, 0.82, 0.5, 0.18],
    size: 1536,
  },
  "rope-hemp": {
    subject:
      "the twisted strands of a thick old hemp rope, unrolled flat so they fill the frame: strands spiralling diagonally in parallel bands, worn tan-brown fibres with frayed hairs, dark grime in the grooves between strands",
    ref: CRATE,
    crop: [0.0, 0.0, 0.3, 0.7],
  },
  // The Old Grand Library, from its painting: dark gilt-carved wood, a red rug, a painted dome, warm lamps and daylight.
  "book-spine": {
    subject:
      "the spine of ONE old leather-bound book standing upright, filling the whole frame edge to edge: pale undyed tan calf leather, five raised bands across it with gilt rules, gilt floral tooling between the bands, a small dark title label near the top with faint gilt lettering-like marks (no readable text), scuffed and worn at the head and tail",
    ref: LIBRARY,
    crop: [0.7, 0.35, 0.12, 0.3],
    whole: true,
    aspect: "1:4",
    out: [256, 1024],
  },
  "book-spine-cloth": {
    subject:
      "the spine of ONE old cloth-bound book standing upright, filling the whole frame edge to edge: pale linen-grey bookcloth, faded, two thin gilt rules near the head and two near the tail, a square paper label in the upper third with faint inked marks (no readable text), frayed and soiled at the head and tail",
    ref: LIBRARY,
    crop: [0.86, 0.3, 0.12, 0.3],
    whole: true,
    aspect: "1:4",
    out: [256, 1024],
  },
  "library-rug": {
    subject:
      "an old oriental rug seen from straight above, filling the whole frame edge to edge: a deep crimson field with a large ornate central medallion in cream, navy and gold, matching corner pieces, a wide navy-and-gold border of interlaced vines, worn thin and faded in the middle where people walk, painterly",
    ref: LIBRARY,
    crop: [0.3, 0.75, 0.45, 0.25],
    whole: true,
    aspect: "16:9",
    out: [2048, 1152],
  },
  "vault-fresco": {
    subject:
      "a painted barrel-vault ceiling panel seen straight on: a deep blue-green ground with rich gilt baroque ornament, scrolling acanthus and cartouches framing a small faded painting of a cloudy sky with a saint, ornate and dark, gilded mouldings",
    ref: LIBRARY,
    crop: [0.18, 0.0, 0.6, 0.35],
  },
  "dome-fresco": {
    subject:
      "the inside of a painted dome unrolled into a flat horizontal band: at the bottom a ring of robed Valkaran saints and angels standing on clouds holding books and lanterns, above them swirling golden clouds, at the top a pale luminous sky, in the rich warm baroque style of the reference, gilded frame lines at the bottom edge",
    ref: LIBRARY,
    crop: [0.28, 0.0, 0.3, 0.12],
    whole: true,
    tileX: true,
    aspect: "21:9",
    out: [2048, 878],
  },
  "stained-saint": {
    subject:
      "a tall round-topped stained glass window seen straight on from inside, filling the whole frame: a robed Valkaran saint holding an open book and a lantern under a crescent moon and a stylised tree, deep blue, ruby red, amber gold and green glass pieces in black lead cames, the background sky of the window blue glass, a border of small coloured squares, glowing with daylight behind it",
    ref: LIBRARY,
    crop: [0.73, 0.0, 0.1, 0.24],
    whole: true,
    aspect: "9:16",
    out: [576, 1024],
  },
  "stained-thyra": {
    subject:
      "a tall round-topped stained glass window seen straight on from inside, filling the whole frame: a great silver-white tree whose branches intertwine with a large crescent moon, stars among the leaves, roots spreading over a green hill, the symbol of the goddess Thyra the Wayfinder, deep midnight blue, violet, emerald and amber glass pieces in black lead cames, a border of small coloured squares, glowing with daylight behind it",
    ref: LIBRARY,
    crop: [0.73, 0.0, 0.1, 0.24],
    whole: true,
    aspect: "9:16",
    out: [576, 1024],
  },
  // The Silver Serpent, from its painting: dark tarred timber, amber lamplight, sea fog through the far arch.
  "sea-map-carved": {
    subject:
      "a large old map of a sea CARVED in low relief into dark weathered oak planks, seen straight on: raised coastlines with harbours and rocky islands, carved waves filling the sea, a coiling sea serpent among the waves, two small sailing ships, a compass rose in one corner, rhumb lines cut into the wood, worn smooth and dark with age and pipe smoke, faint traces of old blue and gold paint in the grooves, the plank seams running across it",
    ref: SERPENT,
    crop: [0.0, 0.2, 0.3, 0.4],
    whole: true,
    aspect: "16:9",
    out: [2048, 1152],
  },
  "fishing-net": {
    subject:
      "an old knotted fishing net hanging from the top edge of the frame in loose folds and sags, filling most of the frame: brown tarred hemp cord in a diamond mesh about a hand wide, knots at every crossing, a few cork floats and one small glass float tied along the top, frayed at the bottom edge",
    ref: SERPENT,
    crop: [0.7, 0.05, 0.3, 0.4],
    cutout: true,
    key: "magenta",
    size: 1024,
  },
  "amber-panel-serpent": {
    subject:
      "a backlit painted panel of amber-coloured horn and oiled parchment in a dark wooden frame, glowing warm orange from a lamp behind it, painted on it in dark brown: a great sea serpent coiling round a sailing ship on stormy waves, the light glowing brightest in the middle",
    ref: SERPENT,
    crop: [0.3, 0.1, 0.1, 0.12],
    whole: true,
    aspect: "3:4",
    out: [768, 1024],
  },
  "amber-panel-sailors": {
    subject:
      "a backlit painted panel of amber-coloured horn and oiled parchment in a dark wooden frame, glowing warm orange from a lamp behind it, painted on it in dark brown: a crowd of sailors and smugglers drinking and singing round a table, a ship's lantern above them, the light glowing brightest in the middle",
    ref: SERPENT,
    crop: [0.1, 0.25, 0.1, 0.15],
    whole: true,
    aspect: "4:3",
    out: [1024, 768],
  },
  "door-thyra": {
    subject:
      "a tall pair of old carved wooden double doors seen straight on, filling the whole frame edge to edge: deep red lacquered wood, with carved gilt panels of interlaced leaves and stars, and in the middle of each leaf a gilt roundel of a tree intertwined with a crescent moon, iron ring handles, worn gold",
    ref: LIBRARY,
    crop: [0.33, 0.48, 0.12, 0.25],
    whole: true,
    aspect: "9:16",
    out: [576, 1024],
  },
  "globe-map": {
    subject:
      "an old hand-painted parchment sea chart of the fantasy Realm of Myr: one huge irregular landmass with deep bays, a long hooked peninsula and a great inland lake, filling the middle, a scatter of small rocky islands, wide empty parchment seas with faint wave lines, ochre and sepia land with tiny painted mountains and forests, a compass rose and a sea serpent, cracked varnish. NOT a map of Earth: no Africa, no Americas, no Europe, no real coastlines",
    ref: LIBRARY,
    crop: [0.0, 0.7, 0.3, 0.3],
    whole: true,
    aspect: "16:9",
    out: [1024, 512],
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
- Background: SOLID UNIFORM PURE ${t.key === "magenta" ? "MAGENTA (#FF00FF)" : "GREEN (#00FF00)"} everywhere around and between the ${t.key === "magenta" ? "leaves" : "strands"}. No scenery, no branch, no text.
- Even, soft light from above. No cast shadow on the background.
- Painted in the reference's manner: oil painting, visible brushwork, its palette and soft misty light. NOT a photograph, NOT a 3D render.
- ${t.key === "magenta" ? "Nothing pink, purple or magenta in the subject itself." : "Nothing green in the subject itself: the moss is grey-green to silver, never pure green."}`

const WHOLE = (t: Texture) => `A painted surface for a painted 3D game world, matching the reference image's painted art style.

Subject: ${t.subject}.

Requirements:
- The subject fills the ENTIRE frame edge to edge, seen straight on, with no perspective. No background, no border, no vignette, no hands, no table.${t.tileX ? "\n- The LEFT edge continues seamlessly into the RIGHT edge." : ""}
- Flat, even lighting: the 3D engine adds the light. No cast shadows.
- No text, no letters, no logo, no signature.
- Painted in the reference's manner: an oil painting with visible confident brushwork and its palette. NOT a photograph, NOT a 3D render, NOT cartoon.`

async function reference(t: Texture) {
  const img = sharp(t.ref.startsWith("http") ? Buffer.from(await (await fetch(t.ref)).arrayBuffer()) : t.ref)
  const { width = 1, height = 1 } = await img.metadata()
  const [l, tp, w, h] = t.crop
  const region = { left: Math.round(l * width), top: Math.round(tp * height), width: Math.round(w * width), height: Math.round(h * height) }
  return (await img.extract(region).jpeg({ quality: 90 }).toBuffer()).toString("base64")
}

async function render(label: string, text: string, images: string[], aspectRatio = "1:1") {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set")
  const body = JSON.stringify({
    contents: [{ parts: [{ text }, ...images.map((data) => ({ inline_data: { mime_type: "image/jpeg", data } }))] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio, imageSize: "2K" } },
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
  const png = await render(id, t.cutout ? CUT(t) : t.whole ? WHOLE(t) : TILE(t), [await reference(t)], t.aspect)
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
async function cutout(path: string, size: number, key: "green" | "magenta" = "green") {
  const { data, info } = await sharp(path).resize(size, size).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H } = info
  // How far each pixel leans toward the backdrop: green over red and blue, or red and blue over green.
  const lean = (i: number) => (key === "green" ? data[i + 1] - Math.max(data[i], data[i + 2]) : Math.min(data[i], data[i + 2]) - data[i + 1])
  for (let i = 0; i < data.length; i += 4) data[i + 3] = Math.round(255 * (1 - smooth(40, 120, lean(i))))
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
    if (key === "green") data[i + 1] = Math.min(data[i + 1], Math.round((data[i] + data[i + 2]) / 2 + 12))
    else {
      const cap = Math.round(data[i + 1] * 1.05 + 10)
      data[i] = Math.min(data[i], cap)
      data[i + 2] = Math.min(data[i + 2], cap)
    }
  }
  return sharp(data, { raw: { width: W, height: H, channels: 4 } })
}

// Closes a band's left-right seam: the last tenth is cross-faded over the first and cut off, so the new right edge runs
// straight on into the new left edge.
async function seamX(img: sharp.Sharp, w: number, h: number) {
  const { data } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const band = Math.round(w * 0.1)
  const W = w - band
  const out = Buffer.alloc(W * h * 3)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < W; x++)
      for (let c = 0; c < 3; c++) {
        const v = data[(y * w + x) * 3 + c]
        out[(y * W + x) * 3 + c] = x < band ? Math.round(data[(y * w + W + x) * 3 + c] * (1 - x / band) + v * (x / band)) : v
      }
  return sharp(
    await sharp(out, { raw: { width: W, height: h, channels: 3 } })
      .resize(w, h, { fit: "fill" })
      .raw()
      .toBuffer(),
    { raw: { width: w, height: h, channels: 3 } }
  )
}

async function make(id: string) {
  const t = TEXTURES[id]
  const { n, path } = await latest(id)
  if (!n) throw new Error(`${id}: no raw painting yet`)
  await mkdir(OUT, { recursive: true })
  if (t.whole) {
    const [w, h] = t.out ?? [1024, 1024]
    let img = sharp(path).resize(w, h, { fit: "fill" })
    // A dome's band: blend the outer tenth of each side into the other so the seam closes.
    if (t.tileX) img = await seamX(img, w, h)
    await img.jpeg({ quality: 88 }).toFile(join(OUT, `${id}.jpg`))
  } else if (t.cutout) await (await cutout(path, t.size ?? 1024, t.key)).webp({ quality: 88, alphaQuality: 90 }).toFile(join(OUT, `${id}.webp`))
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
