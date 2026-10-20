// Paints portraits for NPCs whose sheets have only the stock avatar, in the style of the painted NPC portraits, and
// publishes them where story view and the turn order look for them (public/stage/portraits, see
// scripts/stage-encounter-art.ts, which lists them in apps/desktop/src/npc-portraits.ts).
//
//   node --env-file=.env.local --import tsx scripts/stage-npc-portraits.ts paint [id,id...]     # new raw portraits
//   node --env-file=.env.local --import tsx scripts/stage-npc-portraits.ts publish [id,id...]   # crop the latest raw
//
// Without ids, every NPC sheet with the stock avatar. Raw paintings go to PORTRAIT_RAW (default: the OS temp dir).
// Review each before publishing. The API key is read from GOOGLE_GENERATIVE_AI_API_KEY and is never printed.

import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"

const MODEL = "gemini-3-pro-image"
const RAW = process.env.PORTRAIT_RAW ?? join(tmpdir(), "d20-portraits")
const NPCS = "content/settings/realm-of-myr/npcs"
const OUT = "public/stage/portraits"
// Painted NPC portraits whose finish the new ones match. Both men: a woman's reference lent its face to every woman
// painted from it.
const STYLE = ["bram", "garlan-ironfist"]

// What the sheets leave out, from the encounters they appear in.
const NOTES: Record<string, string> = {
  "astrid-blackthorn":
    "Lady Astrid Blackthorn, early thirties, heir of the richest noble house in Kordavos and a hunter at heart. A long, weathered face with high cheekbones, grey-green eyes, a thin pale scar through her left eyebrow, wind-burned skin. A noblewoman's bearing in a ranger's fitted dark leather armour with fine tooled details and a dark green cloak clasped with a silver brooch of a black tree twisted into a circle.",
  "thaddeus-blackthorn":
    "Lord Thaddeus Blackthorn, late forties, head of House Blackthorn, rich and proud, a confident, charming smile that does not reach his eyes. A black velvet doublet in the Asterian court fashion, with silver embroidery and the black tree crest.",
  "joran-antonov":
    "Joran Antonov, late twenties, a scholar's lean face hardened by grief and purpose, dark hair, a short beard, burning eyes. Dark hooded robes of the Covenant of the Cowl over a scholar's clothes, the hood pushed back, an old iron key on a cord at his throat.",
  silverhand: "Silverhand, a crime lord of the Lower Districts, forties. The hood leaves the upper face in shadow, a thin-lipped smirk, the silver gauntlet raised near his face.",
  "covenant-assassin": "One assassin of the Covenant of the Cowl, the hood deep, a cloth mask over the lower face, only the eyes showing.",
  "covenant-cultist": "One zealot of the Covenant of the Cowl, a hooded man in rough brown robes, a wild, fervent stare, soot on his face.",
  "covenant-rogue": "One agent of the Covenant of the Cowl, a hooded woman in dark leathers, a hand crossbow at her shoulder.",
  "warehouse-thug": "One dockside mercenary posing as a warehouse worker, a broken nose, stubble, a sleeveless work tunic.",
  "blackthorn-guard": "One house guard, a stern man in his thirties, an open-faced helmet.",
  auctioneer:
    "A smooth black leather Venetian half-mask over the eyes and nose, with plain almond eyeholes, no ears, horns or points, tied behind the head. Greying hair swept back, a thin, practised smile.",
  "ancient-undead": "The head and shoulders of one risen Valkaran warrior: a skull in a corroded bronze helm with faint pale-blue light in the empty eye sockets.",
  "forest-drake": "The head and neck of a forest drake, a wingless-looking wyrm head with horns like old roots, moss in the seams of its scales.",
  aelindor: "An elf of the Valkarr Forest, ageless, calm and courteous.",
  "mira-hearthstone": "Her notepad is a small leather-bound book of rough paper and a pencil of graphite in wood, nothing modern, no spiral binding.",
}

const STOCK = (image?: string) => !image || image.includes("/avatar/")

type Sheet = { id: string; name: string; race?: string; gender?: string; archetype?: string; appearance?: string; image?: string }
const sheet = async (id: string) => JSON.parse(await readFile(join(NPCS, `${id}.json`), "utf8")) as Sheet

function prompt(s: Sheet) {
  const creature = /monster/i.test(s.archetype ?? "")
  const who = creature ? `${s.name}, a creature` : [s.gender && s.gender !== "Unknown" ? s.gender : "", s.race, s.archetype ? `(${s.archetype.toLowerCase()})` : ""].filter(Boolean).join(" ")
  return `Paint a portrait of ${s.name}, ${who}, for a fantasy role-playing game set in a frontier city of a medieval realm.

${s.appearance ?? ""}
${NOTES[s.id] ?? ""}

The reference portraits show the painting style only. Do not copy their faces, hair, jewellery or clothes: give ${s.name} a face of their own, as described.
Match the reference portraits exactly in finish: a richly detailed digital oil painting, realistic proportions, a carefully painted, expressive face with clear eyes and natural skin, dramatic warm side light with deep shadows, muted earthy colours.
- Composition: square, ${creature ? "the creature's head filling most of the frame" : "head and shoulders, the face in the upper half of the frame, looking toward the viewer"}.
- Background: dark and softly out of focus, a hint of a setting that suits the character, never busy.
- One figure only. No text, no border, no frame, no logo.`
}

async function render(label: string, text: string, images: string[]) {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set")
  const body = JSON.stringify({
    contents: [{ parts: [{ text }, ...images.map((data) => ({ inline_data: { mime_type: "image/jpeg", data } }))] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1", imageSize: "1K" } },
  })
  const call = () =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body })
  let res = await call()
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

async function main() {
  const [step, list] = process.argv.slice(2)
  await mkdir(RAW, { recursive: true })
  const all = (await readdir(NPCS)).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5))
  const ids = list ? list.split(",") : (await Promise.all(all.map(async (id) => ((await sheet(id)).image && !STOCK((await sheet(id)).image) ? null : id)))).filter((id): id is string => Boolean(id))
  if (step === "paint") {
    const style = await Promise.all(
      STYLE.map(async (id) => {
        const res = await fetch((await sheet(id)).image!)
        return (
          await sharp(Buffer.from(await res.arrayBuffer()))
            .jpeg({ quality: 88 })
            .toBuffer()
        ).toString("base64")
      })
    )
    // Three at a time keeps clear of the image model's rate limit.
    for (let i = 0; i < ids.length; i += 3)
      await Promise.all(
        ids.slice(i, i + 3).map(async (id) => {
          const png = await render(id, prompt(await sheet(id)), style)
          const { n } = await latest(id)
          const path = join(RAW, `${id}-${n + 1}.png`)
          await writeFile(path, png)
          await appendFile(join(RAW, "generations.log"), `${new Date().toISOString()} ${id} #${n + 1} ${MODEL}\n`)
          console.log(`painted  ${path}`)
        })
      )
  } else if (step === "publish") {
    await mkdir(OUT, { recursive: true })
    for (const id of ids) {
      const { n, path } = await latest(id)
      if (!n) {
        console.log(`no raw   ${id}`)
        continue
      }
      await sharp(path)
        .resize({ width: 360, height: 432, fit: "cover", position: "north" })
        .webp({ quality: 80 })
        .toFile(join(OUT, `${id}.webp`))
      console.log(`published ${id} from #${n}`)
    }
    console.log("Run scripts/stage-encounter-art.ts to list them for the app.")
  } else throw new Error("step: paint or publish")
}
void main()
