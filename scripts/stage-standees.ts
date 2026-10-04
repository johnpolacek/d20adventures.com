// Paints Stageview standees with the stage authoring pipeline: a full-body front on a green screen, a back conditioned
// on that front, a distance-from-green key, and a portrait cropped from the keyed front. See wiki/stage-authoring.md.
//
//   node --env-file=.env.local --import tsx scripts/stage-standees.ts front human-a,elf-b   # new raw fronts
//   node --env-file=.env.local --import tsx scripts/stage-standees.ts back human-a           # back from the latest front
//   node --env-file=.env.local --import tsx scripts/stage-standees.ts key human-a            # cutouts and portrait
//   node --env-file=.env.local --import tsx scripts/stage-standees.ts all                    # every figure, all three steps
//
// Raw renders go to STANDEE_RAW (default: the OS temp dir). The API key is read from GOOGLE_GENERATIVE_AI_API_KEY and is
// never printed. Review every front against its description before keying: a pose or costume can come back wrong.

import { existsSync } from "node:fs"
import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"

const MODEL = "gemini-3.1-flash-image"
const RAW = process.env.STANDEE_RAW ?? join(tmpdir(), "d20-standees")
const STAGE = "public/stage"
const STYLE = "design/stage/styleref.jpg"
// A finished standee, for finish and detail only.
const FINISH = "public/stage/fixtures/march-of-davos/yeva-front.webp"
const PORTRAIT_BG = "#3b4256"

type Figure = { out: string; who: string; look: string; ref?: string; head: number }
const stock = (who: string, look: string, head = 0.13): Figure => ({ out: "", who, look, head })
// Stock figures stand in for created heroes: one per race and build, dressed for travel with no class gear, so any class
// reads true. Heads are the share of figure height a portrait frames around.
const FIGURES: Record<string, Figure> = {
  "human-a": stock(
    "Human man",
    "In his thirties, short dark-brown hair and a trimmed beard, weathered tan skin. A hooded oak-brown travelling cloak over a moss-green wool tunic and a leather jerkin, a belt with pouches, brown trousers and worn boots, a satchel at one hip."
  ),
  "human-b": stock(
    "Human woman",
    "In her late twenties, auburn hair in a long braid, freckles. A rust-orange hooded cloak over an undyed cream linen shirt, a laced brown leather bodice, a belt with pouches, dark trousers and tall boots."
  ),
  "elf-a": stock(
    "Elf man",
    "Tall and slender, pointed ears, long straight silver-blond hair tied back, fair skin, calm grey eyes. A long forest-green cloak, a fitted grey-green tunic with fine leaf embroidery, a slim belt with a pouch, soft leather boots."
  ),
  "elf-b": stock(
    "Elf woman",
    "Tall and graceful, pointed ears, long black hair in a loose plait, warm brown skin, amber eyes. A sage-green hooded mantle, an ochre travelling dress over leggings, a leather belt with a pouch, soft boots."
  ),
  "half-elf-a": stock(
    "Half-Elf man",
    "Slightly pointed ears, wavy chestnut hair to the jaw, light stubble, olive skin. A dusty navy short cloak, an ochre doublet, a leather belt with pouches, grey trousers and boots."
  ),
  "half-elf-b": stock(
    "Half-Elf woman",
    "Slightly pointed ears, shoulder-length copper-red hair, green eyes, fair freckled skin. A forest-green cloak with the hood down, a cream blouse, a brown leather vest, a belt with pouches, trousers and tall boots."
  ),
  "dwarf-a": stock(
    "Dwarf man",
    "Very short and very broad, about 1.4 m tall, with stout dwarf proportions, not a short human. A long braided black beard with iron rings, a bald crown with a fringe of hair, ruddy skin. A heavy brown leather coat over a rust-red tunic, a thick belt with an iron buckle, sturdy boots.",
    0.17
  ),
  "dwarf-b": stock(
    "Dwarf woman",
    "Very short and very broad, about 1.35 m tall, with stout dwarf proportions, not a short human. Thick blond hair in two braids, rosy cheeks, a strong jaw. An olive-green cloak, a quilted leather jerkin over a cream shirt, a wide belt with pouches, heavy boots.",
    0.17
  ),
  "halfling-a": stock(
    "Halfling man",
    "Only about 1.1 m tall, a child-sized body with an adult face. Curly sandy hair, a round cheerful face, bare hairy feet. A mustard-yellow waistcoat over a cream shirt, brown breeches, a short green cloak, a satchel.",
    0.19
  ),
  "halfling-b": stock(
    "Halfling woman",
    "About 1.05 m tall, a child-sized body with an adult face. Dark curly hair tied up with a ribbon, warm brown skin, bare feet. A rust-orange hooded short cloak, a green dress with a brown apron skirt, belt pouches.",
    0.19
  ),
  "gnome-a": stock(
    "Gnome man",
    "Only about 1 m tall, small with a large head and an adult face. A big nose, bushy white eyebrows and a short white beard, bright blue eyes, a brown pointed cap. A patched teal coat with many pockets, a leather belt with pouches, tall boots. Hands empty and relaxed.",
    0.22
  ),
  "gnome-b": stock(
    "Gnome woman",
    "About 0.95 m tall, small with a large head and an adult face. Wild auburn hair in two puffs held by a leather headband, big hazel eyes, freckles. A short ochre coat with wooden buttons and many pockets, striped stockings, little boots.",
    0.22
  ),
  "half-orc-a": stock(
    "Half-Orc man",
    "Tall and heavily muscled, about 1.95 m, grey-green skin, small tusks from the lower jaw, black hair in a topknot, old scars on his arms. A sleeveless brown leather jerkin, a fur-trimmed mantle over one shoulder, a wide belt, dark trousers and boots."
  ),
  "half-orc-b": stock(
    "Half-Orc woman",
    "Tall and strong, about 1.85 m, olive-green skin, small tusks, black hair shaved on one side and braided on the other, gold earrings. A rust-red sleeveless tunic over a leather vest, bracers, a wide belt, dark trousers and boots."
  ),
  // Premades whose web portraits predate Stageview, painted from those portraits.
  wrenna: {
    out: "fixtures/march-of-davos/wrenna",
    who: "Wrenna of Faelendar, Elf female ranger",
    look: "A tall, watchful elf woman with moss-green eyes and ash-blonde hair in braids. Grey-green scout leathers of the Valkarr Forest with a dark green cloak and leather bracers, a quiver of arrows on her back and a pale yew longbow held in her left hand.",
    ref: "https://d20-public.s3.us-east-1.amazonaws.com/images/settings/realm-of-myr/march-of-davos/pcs/wrenna-faelendar.png",
    head: 0.13,
  },
  ilya: {
    out: "fixtures/march-of-davos/ilya",
    who: "Ilya Veles, Half-Elf male bard",
    look: "A graceful half-elf man with laughing grey eyes, dark hair worn loose past his collar, and a warm smile. A long festival coat of green and black Valkaran embroidery in gold over an Asterian cut, an orange sash, dark trousers and boots. A seven-stringed gusle slung across his back.",
    ref: "https://d20-public.s3.us-east-1.amazonaws.com/images/settings/realm-of-myr/march-of-davos/pcs/ilya-veles.png",
    head: 0.13,
  },
  lyra: {
    out: "fixtures/covert-cargo/lyra",
    who: "Lyra Silvanus, Asterian female arcanist",
    look: "A young scholarly woman with neat dark hair tied back, intelligent eyes behind round wire spectacles, a few freckles. A teal-blue scholar's coat over a white cravat and waistcoat, a worn leather satchel of scrolls at her hip, a thick leather-bound book held against her side.",
    ref: "https://d20-public.s3.us-east-1.amazonaws.com/images/settings/realm-of-myr/covert-cargo/pcs/dc23c6a6-6247-4384-bccc-2eeed66a7b0c.png",
    head: 0.13,
  },
  poppen: {
    out: "fixtures/covert-cargo/poppen",
    who: "Poppen Quickfoot, Halfling male rogue",
    look: "Just over three feet tall, a child-sized body with an adult face. Curly chestnut hair cropped short, bright hazel eyes, a mischievous grin. A patchwork waistcoat of red, blue and ochre squares full of hidden pockets over a cream shirt, brown breeches, scuffed pale leather boots.",
    ref: "https://d20-public.s3.us-east-1.amazonaws.com/images/settings/realm-of-myr/covert-cargo/pcs/b44179ad-0e8e-4d1e-8b17-8c436dbeb15a.png",
    head: 0.19,
  },
}
for (const [id, f] of Object.entries(FIGURES)) f.out ||= `heroes/${id}`

const ART = `Art direction (critical):
- A finished, richly detailed PAINTED character illustration in the painterly manner of the game world screenshot (oil-painting brushwork, muted earthy palette), with the detail of a hand-finished character portrait.
- FACE: carefully painted and expressive. Clear eyes with visible irises, defined brows, nose and mouth, a readable expression, natural skin modelling.
- HANDS: readable, well-drawn hands with individual fingers.
- COSTUME AND GEAR: visible fabric weave, stitching, folds, worn leather and metal. Every prop reads as a distinct object.
- VISIBLE PAINTERLY BRUSHWORK throughout. MUTED, earthy palette: umber, ochre, dusty navy, olive, sage, warm stone. No saturated or neon colours.
- LIGHTING: soft neutral daylight from the upper left, gentle even modelling, no rim light, no vignette.
- NO OUTLINE of any kind: no ink line, no dark contour, no rim glow, no halo. NO cast shadow and no ground contact shadow.
- NOT photorealistic, NOT cartoon, NOT chibi, NOT a 3D render.
- Pose: full body, head to toe, standing, facing straight toward the camera in a relaxed front-facing stance, eye-level view without perspective distortion, hands relaxed or holding gear close to the body. Nothing cropped, about 6% margin on all sides, feet flat near the bottom of the frame.
- Background: SOLID UNIFORM PURE GREEN (#00FF00) everywhere, edge to edge. No scenery, no ground, no text, no border, no logo. One character only.`

const frontPrompt = (f: Figure) =>
  `${
    f.ref
      ? "Three reference images are provided. Image 1 is the character's existing portrait: use it for face, hair, colouring, costume and mood, painted as an original character rather than a photographic likeness. Image 2 is a finished standee from this game: match its finish and detail only, it is a different character. Image 3 is a screenshot of the painted game world: it is the art direction."
      : "Two reference images are provided. Image 1 is a finished standee from this game: match its finish and detail only, it is a different character. Image 2 is a screenshot of the painted game world: it is the art direction."
  }

Character: ${f.who}
Appearance: ${f.look}

${ART}`

const BACK = `Two reference images are provided. Image 1 is the finished FRONT view of a character. Image 2 is a screenshot of a painted game world: it is the ART DIRECTION to match.

Render the SAME character seen from directly behind: same outfit, colours, gear, hair and proportions; back of head, no face visible; same standing pose from behind; same painted finish, light and palette; full body head to toe with margins; solid green background; no outline, no ground shadow. It is the exact figure of image 1 as if the camera walked 180 degrees around it while it stood frozen.

Requirements:
- Match image 1 in silhouette, height, build, stance and footprint. Whatever is held stays in the same hand (the figure's own left and right are unchanged, so from behind they swap sides on screen). A cloak, pack, quiver, hood or hair continues plausibly from the front design, as carefully finished as the front.
- The head is seen from behind. No face, no profile, no glance over the shoulder.
- Same painterly manner as image 1: oil-painting brushwork, muted earthy palette. Soft neutral daylight from the upper left. NOT photorealistic, NOT cartoon, NOT a 3D render.
- NO outline of any kind and NO cast shadow on the ground.
- Full body, head to toe, standing, eye-level view, nothing cropped, about 6% margin on all sides, feet flat near the bottom of the frame.
- Background: SOLID UNIFORM PURE GREEN (#00FF00) everywhere, edge to edge. No scenery, no text, no border, no logo. One character only.`

const jpeg = async (input: Buffer | string, bg: string) => (await sharp(input).flatten({ background: bg }).jpeg({ quality: 90 }).toBuffer()).toString("base64")
async function render(label: string, text: string, images: string[]) {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set")
  const body = JSON.stringify({
    contents: [{ parts: [{ text }, ...images.map((data) => ({ inline_data: { mime_type: "image/jpeg", data } }))] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "9:16", imageSize: "2K" } },
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

async function latest(kind: "front" | "back", id: string) {
  const files = (await readdir(RAW)).filter((f) => f.startsWith(`${kind}-${id}-`) && f.endsWith(".png"))
  const n = Math.max(0, ...files.map((f) => Number(f.slice(`${kind}-${id}-`.length, -4))))
  return { n, path: join(RAW, `${kind}-${id}-${n}.png`) }
}
async function keep(kind: "front" | "back", id: string, png: Buffer) {
  const { n } = await latest(kind, id)
  const path = join(RAW, `${kind}-${id}-${n + 1}.png`)
  await writeFile(path, png)
  await appendFile(join(RAW, "generations.log"), `${new Date().toISOString()} ${kind} ${id} #${n + 1} ${MODEL}\n`)
  console.log(`${kind} ${id} #${n + 1}`)
}

async function front(id: string) {
  const f = FIGURES[id]
  const ref = f.ref ? [await jpeg(Buffer.from(await (await fetch(f.ref)).arrayBuffer()), "#8a8a8a")] : []
  await keep("front", id, await render(id, frontPrompt(f), [...ref, await jpeg(FINISH, "#8a8a8a"), await jpeg(STYLE, "#000")]))
}
async function back(id: string) {
  const { path } = await latest("front", id)
  if (!existsSync(path)) throw new Error(`No front for ${id}. Run front first.`)
  await keep("back", id, await render(`${id} back`, BACK, [await jpeg(path, "#00ff00"), await jpeg(STYLE, "#000")]))
}

// Distance-from-green key (olive cloaks survive), eroded two pixels and despilled at the edge, cropped to the figure.
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
async function cutout(path: string) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H } = info
  for (let i = 0; i < data.length; i += 4) data[i + 3] = Math.round(255 * (1 - smooth(45, 125, data[i + 1] - Math.max(data[i], data[i + 2]))))
  let alpha = new Uint8Array(W * H).map((_, p) => data[p * 4 + 3])
  for (let pass = 0; pass < 2; pass++) {
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
    if (alpha[p] < 250) data[i + 1] = Math.min(data[i + 1], Math.max(data[i], data[i + 2]))
    if (alpha[p] > 40) {
      const x = p % W
      const y = (p - x) / W
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX <= minX) throw new Error(`Empty cutout: ${path}`)
  const pad = 6
  const left = Math.max(0, minX - pad)
  const top = Math.max(0, minY - pad)
  const region = { left, top, width: Math.min(W - left, maxX - minX + 2 * pad), height: Math.min(H - top, maxY - minY + 2 * pad) }
  return sharp(
    await sharp(data, { raw: { width: W, height: H, channels: 4 } })
      .extract(region)
      .png()
      .toBuffer()
  )
}
async function key(id: string) {
  const f = FIGURES[id]
  const out = join(STAGE, f.out)
  await mkdir(join(out, ".."), { recursive: true })
  const fr = await cutout((await latest("front", id)).path)
  await fr.clone().resize({ height: 2048, fit: "inside", withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 100, effort: 5 }).toFile(`${out}-front.webp`)
  const bk = await cutout((await latest("back", id)).path)
  await bk.resize({ height: 2048, fit: "inside", withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 100, effort: 5 }).toFile(`${out}-back.webp`)
  // Head and shoulders, centred on the head: the alpha-weighted middle of the figure's top rows.
  const { data, info } = await fr.clone().raw().toBuffer({ resolveWithObject: true })
  const rows = Math.round(info.height * f.head * 0.8)
  let [sum, weight] = [0, 0]
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < info.width; x++) {
      const a = data[(y * info.width + x) * 4 + 3]
      sum += a * x
      weight += a
    }
  const h = Math.round(info.height * f.head * 2.3)
  const w = Math.round(h * 1.27)
  const cx = Math.round(sum / weight)
  const left = cx - Math.round(w / 2)
  const top = -Math.round(info.height * 0.02)
  const extend = { top: Math.max(0, -top), left: Math.max(0, -left), right: Math.max(0, left + w - info.width), bottom: 0, background: PORTRAIT_BG }
  const padded = await fr.clone().extend(extend).flatten({ background: PORTRAIT_BG }).toBuffer()
  await sharp(padded)
    .extract({ left: Math.max(0, left), top: Math.max(0, top), width: w, height: h })
    .resize({ width: 512 })
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(`${out}-portrait.jpg`)
  console.log(`keyed ${id} -> ${out}-{front,back}.webp, portrait`)
}

async function main() {
  const [cmd, list] = process.argv.slice(2)
  const ids = list ? list.split(",") : Object.keys(FIGURES)
  for (const id of ids) if (!FIGURES[id]) throw new Error(`Unknown figure ${id}`)
  await mkdir(RAW, { recursive: true })
  // Four at a time keeps clear of the image model's rate limit.
  async function each(fn: (id: string) => Promise<void>) {
    const queue = [...ids]
    const failed: string[] = []
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        for (let id = queue.shift(); id; id = queue.shift())
          await fn(id).catch((error) => {
            failed.push(id)
            console.log(String(error))
          })
      })
    )
    if (failed.length) console.log(`failed: ${failed.join(",")}`)
  }
  if (cmd === "front") await each(front)
  else if (cmd === "back") await each(back)
  else if (cmd === "key") await each(key)
  else if (cmd === "all")
    await each(async (id) => {
      await front(id)
      await back(id)
      await key(id)
    })
  else console.log("usage: stage-standees.ts front|back|key|all [id,...]")
}
void main()
