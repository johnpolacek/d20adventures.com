// Paints a module-style cover for each bundled adventure: one dramatic portrait scene in the manner of a classic
// tabletop adventure module, conditioned on the adventure's own art so places and people stay recognisable. The desktop
// app frames it in its module trade dress (apps/desktop/src/module-cover.tsx).
//
//   node --env-file=.env.local --import tsx scripts/adventure-covers.ts paint covert-cargo   # new raw paintings
//   node --env-file=.env.local --import tsx scripts/adventure-covers.ts make covert-cargo    # publish the latest
//   node --env-file=.env.local --import tsx scripts/adventure-covers.ts all                  # every adventure
//
// Raw paintings go to COVER_RAW (default: the OS temp dir). Review each before `make`. The API key is read from
// GOOGLE_GENERATIVE_AI_API_KEY and is never printed.

import { appendFile, mkdir, readdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"

const MODEL = "gemini-3.1-flash-image"
const RAW = process.env.COVER_RAW ?? join(tmpdir(), "d20-covers")
const OUT = "public/stage/covers"
const CF = "https://d1dkwd3w4hheqw.cloudfront.net/images/settings/realm-of-myr"
const S3 = "https://d20-public.s3.us-east-1.amazonaws.com/images/settings/realm-of-myr"

type Cover = { scene: string; refs: string[] }
const COVERS: Record<string, Cover> = {
  "the-road-to-kordavos": {
    scene:
      "On a dusty road through rolling green hills at golden late afternoon, a mismatched band of travellers (a human swordsman, a stout dwarf, a slender elf with a bow and a halfling with a pack) meet at a crossroads beside a fortune teller's brightly painted wagon. The old fortune teller holds up a glowing card toward them. Far behind, on a hill, the walled city of Kordavos with its towers and banners.",
    refs: [`${CF}/the-road-to-kordavos/encounters/the-fortune-teller/49675791-4402-4dff-a8d1-bc260a638c03.png`, `${CF}/the-road-to-kordavos/7ec618f4-bcb7-42ea-a94b-cbb27fa42547.png`],
  },
  "the-midnight-summons": {
    scene:
      "Midnight in an ancient forest: Thalbern the ranger (a rugged dark-haired MAN with a short beard, in dark leathers, as in the character references) draws his longbow, and Wollandora the old druid (as in the references) raises a glowing staff beside him, within a ring of moss-covered standing stones lit by a full moon, as a huge snarling owlbear bursts out of the dark trees toward them. Silver moonlight, drifting mist, green glow from the druid's staff.",
    refs: [
      `${S3}/the-midnight-summons/owlbear-confrontation.png`,
      `${S3}/the-midnight-summons/meeting-at-the-stones.png`,
      "public/stage/fixtures/the-midnight-summons/thalbern-front.webp",
      "public/stage/fixtures/the-midnight-summons/wollandora-front.webp",
    ],
  },
  "covert-cargo": {
    scene:
      "Before dawn on a misty river, on the lantern-lit deck of an old riverboat tied to a rickety pier: Lyra (a young WOMAN scholar with round glasses, brown hair and a green coat, as in her reference) and Poppen (a small curly-haired halfling in a patchwork coat, as in his reference) face Silas, a hooded smuggler, and Reinhard, a scarred swordsman in a dark greatcoat (as in their references), across a heavy iron-banded, chained crate. Blades half drawn, warm lamplight from the cabin windows against blue mist, moss-hung trees along the bank.",
    refs: [
      `${CF}/covert-cargo/encounters/the-shipment/dccea2c5-b22d-41e0-9467-95d8ea2301d5.png`,
      `${CF}/covert-cargo/encounters/the-crate/a3a863a9-dca9-48da-b3fe-e8c4ad90af3a.png`,
      "public/stage/fixtures/covert-cargo/lyra-front.webp",
      "public/stage/fixtures/covert-cargo/poppen-front.webp",
      "public/stage/fixtures/covert-cargo/silas-front.webp",
      "public/stage/fixtures/covert-cargo/reinhard-front.webp",
    ],
  },
  "march-of-davos": {
    scene:
      "The great gate of Kordavos during its harvest festival, hung with crimson banners: a chained beast, a huge horned creature, has broken loose and charges through the panicking festival crowd and market stalls, while a party of adventurers (a human knight, a dwarf with an axe, an elven mage casting a spell, a nimble rogue) stand their ground in the foreground.",
    refs: [`${CF}/march-of-davos/80383e3f-940a-41a7-89d5-90b605b6c646.png`, "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726354341751"],
  },
}

const PROMPT = (
  c: Cover
) => `Paint the cover illustration for a classic 1980s tabletop fantasy role-playing adventure module. The reference images show the adventure's own world: keep its places, costumes and mood.

Scene: ${c.scene}

Requirements:
- A single dramatic, action-filled moment with a clear focal point, heroic and slightly menacing, as on the classic painted module covers of that era.
- Traditional media: rich, saturated oil and gouache painting with confident brushwork and strong light and shadow. NOT a photograph, NOT a 3D render, NOT anime.
- Portrait orientation. Keep the top fifth calmer (sky, darkness or foliage) so a title can sit over it, and the bottom tenth calmer for a caption.
- Absolutely no text, letters, numbers, logos, borders, frames or signatures anywhere in the picture.`

// A reference is a URL or a repo path (character standees, flattened onto grey).
const jpeg = async (ref: string) => {
  let input: Buffer
  if (/^https?:/.test(ref)) {
    const res = await fetch(ref)
    if (!res.ok) throw new Error(`reference ${ref}: HTTP ${res.status}`)
    input = Buffer.from(await res.arrayBuffer())
  } else input = await sharp(ref).flatten({ background: "#8a8a8a" }).png().toBuffer()
  return (await sharp(input).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()).toString("base64")
}

async function render(label: string, text: string, images: string[]) {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set")
  const body = JSON.stringify({
    contents: [{ parts: [{ text }, ...images.map((data) => ({ inline_data: { mime_type: "image/jpeg", data } }))] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:4", imageSize: "2K" } },
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
  const c = COVERS[id]
  const png = await render(id, PROMPT(c), await Promise.all(c.refs.map(jpeg)))
  const { n } = await latest(id)
  await writeFile(join(RAW, `${id}-${n + 1}.png`), png)
  await appendFile(join(RAW, "generations.log"), `${new Date().toISOString()} ${id} #${n + 1} ${MODEL}\n`)
  console.log(`${id} #${n + 1}`)
}

async function make(id: string) {
  const { n, path } = await latest(id)
  if (!n) throw new Error(`${id}: no raw painting yet`)
  await mkdir(OUT, { recursive: true })
  await sharp(path)
    .resize(960, 1280, { fit: "cover" })
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(join(OUT, `${id}.jpg`))
  console.log(`${id}: published from #${n}`)
}

async function main() {
  const [cmd, list] = process.argv.slice(2)
  const ids = list ? list.split(",") : Object.keys(COVERS)
  for (const id of ids) if (!COVERS[id]) throw new Error(`Unknown adventure ${id}`)
  await mkdir(RAW, { recursive: true })
  const failed: string[] = []
  const each = async (fn: (id: string) => Promise<void>) => {
    await Promise.all(
      ids.map((id) =>
        fn(id).catch((error) => {
          failed.push(id)
          console.log(String(error))
        })
      )
    )
  }
  if (cmd === "paint") await each(paint)
  else if (cmd === "make") await each(make)
  else if (cmd === "all")
    await each(async (id) => {
      await paint(id)
      await make(id)
    })
  else console.log("usage: adventure-covers.ts paint|make|all [id,...]")
  if (failed.length) console.log(`failed: ${failed.join(",")}`)
}
void main()
