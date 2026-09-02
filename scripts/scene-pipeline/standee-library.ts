/**
 * Scene pipeline: generate the crowd standee library for a setting.
 *
 * Background people in authored sets are painted cutouts (the same die-cut
 * "paper mini" idea as character standees) rather than procedural geometry:
 * one painted figure per crowd type, generated once from the setting's art
 * direction, chroma-keyed and saved under public/standees/<setting>/, with a
 * library.json the kit's standee builder reads at runtime.
 *
 * Named NPCs come from their wiki portrait via the character standee prompt
 * (front and back views), so Bram at the inn is the Bram of his portrait.
 *
 * Usage:
 *   pnpm exec dotenv -e .env.local -e .env -- tsx scripts/scene-pipeline/standee-library.ts [options]
 *
 * Options:
 *   --setting <id>     setting id (default: realm-of-myr)
 *   --only <id>        generate just this type (repeatable)
 *   --force            regenerate types that already exist
 *   --concurrency <n>  parallel renders (default: 3)
 *   --dry-run          list what would be generated, call no models
 */
import fs from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"
import { chromaKeyCutout, generateStandeeRender, type ReferenceImage } from "@/lib/encounterview/standee"

export type StandeePose = "standing" | "seated"

export interface CrowdType {
  id: string
  /** What the figure is, in the art director's words. */
  description: string
  pose: StandeePose
  /** Rendered height in metres (seated types measure from seat to head). */
  height: number
  /** A wiki portrait to render from, for named NPCs; the description then only adds notes. */
  portrait?: string
  /** Also render a rear view (named NPCs only; crowd types mirror the front). */
  back?: boolean
}

export interface StandeeLibraryEntry {
  id: string
  pose: StandeePose
  height: number
  /** Image width / height, for sizing the card. */
  aspect: number
  back?: boolean
}

const VALKARAN = "native Valkaran townsfolk dress: undyed cream and forest-green wool, harvest-orange trim, oak and antler details, homespun and worn"
const ASTERIAN = "Asterian imperial dress: tailored navy-blue and gold, clean and crisp, polished buttons"

const REALM_OF_MYR: CrowdType[] = [
  // seated, for benches and stools
  { id: "seated-man-valkaran", description: `a broad middle-aged man, ${VALKARAN}, holding a pewter tankard on his knee, mid-laugh`, pose: "seated", height: 1.35 },
  { id: "seated-woman-valkaran", description: `a woman in her thirties with braided hair and an ochre shawl, ${VALKARAN}, leaning in to talk`, pose: "seated", height: 1.3 },
  { id: "seated-merchant-asterian", description: `a plump merchant, ${ASTERIAN}, a doublet and a fur-trimmed cap, counting coins on the table`, pose: "seated", height: 1.35 },
  { id: "seated-dockworker", description: "a sun-weathered dockworker in a greased leather apron and rolled sleeves, tankard in fist, slumped and tired", pose: "seated", height: 1.35 },
  { id: "seated-hooded", description: "a hooded figure in a dark undyed cloak, face hidden in shadow, hands around a cup", pose: "seated", height: 1.3 },
  { id: "seated-elder", description: `a white-bearded Valkaran elder, ${VALKARAN}, pipe in hand, listening`, pose: "seated", height: 1.3 },
  { id: "seated-woman-red", description: "a laughing woman with a red kerchief and a patched brown bodice, slapping the table", pose: "seated", height: 1.3 },
  { id: "seated-young-man", description: `a young man, ${VALKARAN}, rolling dice, leaning forward eagerly`, pose: "seated", height: 1.35 },
  // standing
  { id: "standing-man-valkaran", description: `a stocky man, ${VALKARAN}, raising a tankard in a toast`, pose: "standing", height: 1.8 },
  { id: "standing-woman-valkaran", description: `a tall woman, ${VALKARAN}, arms folded, a cup in one hand`, pose: "standing", height: 1.75 },
  { id: "standing-merchant-asterian", description: `a lean merchant, ${ASTERIAN}, one hand on his belt, mid-conversation`, pose: "standing", height: 1.8 },
  { id: "standing-dockworker", description: "a big dockworker in a leather apron and headscarf, thumbs in his belt", pose: "standing", height: 1.85 },
  { id: "standing-hooded", description: "a hooded figure in a dark undyed cloak, face in shadow, standing still with hands clasped", pose: "standing", height: 1.8 },
  { id: "standing-townsman-cap", description: `a townsman in a felt cap and patched jerkin, ${VALKARAN}, tankard in hand`, pose: "standing", height: 1.78 },
  { id: "standing-townswoman-shawl", description: `an older townswoman in a green shawl and apron, ${VALKARAN}, hands on hips`, pose: "standing", height: 1.7 },
  { id: "standing-guard-offduty", description: "an off-duty city guard in a navy tabard bearing a gold tower crest, no helmet, mail sleeves, tankard in hand", pose: "standing", height: 1.85 },
  { id: "standing-traveler-pack", description: `a road-dusty traveler with a bedroll and pack still on their back, ${VALKARAN}, looking around`, pose: "standing", height: 1.78 },
  { id: "standing-child", description: "a barefoot child of about ten in a too-big tunic, holding a bread roll", pose: "standing", height: 1.2 },
  {
    id: "server-woman",
    description: "a tavern serving woman in a cream blouse, brown bodice and long apron, carrying a wooden tray of foaming tankards at shoulder height",
    pose: "standing",
    height: 1.75,
  },
  { id: "server-man", description: "a tavern potboy in an apron carrying two stoneware jugs, sleeves rolled", pose: "standing", height: 1.75 },
  { id: "bard-lute", description: "a bard in a plum doublet and a feathered hat, standing and playing a lute, mouth open in song", pose: "standing", height: 1.8 },
  // named NPCs from portraits
  {
    id: "npc-bram",
    description: "the innkeeper Bram, in a simple sturdy apron over a cream shirt, sleeves rolled, welcoming",
    pose: "standing",
    height: 1.9,
    portrait: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726055418469",
    back: true,
  },
]

const LIBRARIES: Record<string, CrowdType[]> = { "realm-of-myr": REALM_OF_MYR }

const STYLE = `Painted cinematic dark-fantasy illustration style — readable painterly forms, physically believable cloth and leather with wear, warm firelight from the front-left, NOT cartoon, NOT chibi, NOT cute, NOT photographic. Medieval frontier city, autumn harvest festival.`

function crowdPrompt(type: CrowdType): string {
  const pose =
    type.pose === "seated"
      ? "Seated pose as if on a low wooden bench, knees forward, feet on the ground; draw the figure only — NO bench, chair, table or any furniture."
      : "Standing on the ground in a natural relaxed pose, front three-quarter view."
  return `Render ONE background character for a tabletop miniature standee: ${type.description}.

${pose}
${STYLE}

Requirements:
- Entire body visible head to toe, nothing cropped; comfortable margin on all four sides.
- One character only, no props on the ground, no scenery.
- No text, no border, no logo, no lettering anywhere.
- Background: SOLID UNIFORM PURE GREEN (#00FF00) everywhere. No shadows on the background.`
}

function portraitPrompt(type: CrowdType): string {
  return `Using the provided portrait as the exact visual reference, render the SAME character as a COMPLETE full-body standing figure for a tabletop miniature.

Character notes: ${type.description}

Requirements:
- Entire body visible head to toe, nothing cropped; comfortable margin on all four sides.
- Same face, coloring, costume, and mood as the portrait; extend the outfit plausibly below the bust.
- ${STYLE}
- Standing relaxed pose on the ground, front three-quarter view, one character only.
- Background: SOLID UNIFORM PURE GREEN (#00FF00) everywhere. No scenery, no shadows on the background, no text, no border, no logo.`
}

function backPrompt(type: CrowdType): string {
  return `Two reference images are provided: (1) the character's face portrait, (2) the finished FRONT view of the character's tabletop miniature standee. Render the SAME character seen directly FROM BEHIND — a full-body rear view of the exact figure in image 2, as if the camera walked 180 degrees around the same frozen figure.

Requirements:
- Entire body visible head to toe, nothing cropped; comfortable margin on all four sides.
- Match image 2 exactly in silhouette, height, build, stance, and footprint.
- Back of the head/hair and costume continued plausibly from the front design. Do NOT show the face.
- ${STYLE}
- Background: SOLID UNIFORM PURE GREEN (#00FF00) everywhere. No scenery, no shadows on the background, no text, no border, no logo. One character only.`
}

function parseArgs(argv: string[]) {
  let settingId = "realm-of-myr"
  const only: string[] = []
  let force = false
  let dryRun = false
  let concurrency = 3
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--setting") settingId = argv[++i]
    else if (arg === "--only") only.push(argv[++i])
    else if (arg === "--force") force = true
    else if (arg === "--dry-run") dryRun = true
    else if (arg === "--concurrency") concurrency = Number(argv[++i])
  }
  return { settingId, only, force, dryRun, concurrency }
}

async function fetchImage(url: string): Promise<ReferenceImage> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`fetch failed ${response.status}: ${url}`)
  return { data: Buffer.from(await response.arrayBuffer()), mimeType: response.headers.get("content-type") ?? "image/png" }
}

async function exists(file: string): Promise<boolean> {
  return fs
    .access(file)
    .then(() => true)
    .catch(() => false)
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const types = LIBRARIES[args.settingId]
  if (!types) throw new Error(`No crowd library defined for setting "${args.settingId}"`)
  const dir = path.join("public", "standees", args.settingId)
  await fs.mkdir(dir, { recursive: true })
  const wanted = args.only.length ? types.filter((t) => args.only.includes(t.id)) : types

  const todo: CrowdType[] = []
  for (const type of wanted) {
    const have = await exists(path.join(dir, `${type.id}.png`))
    if (have && !args.force) continue
    todo.push(type)
  }
  console.log(`${wanted.length} types, ${todo.length} to generate${args.dryRun ? " (dry run)" : ""}`)
  for (const type of todo) console.log(`  - ${type.id}${type.portrait ? " (from portrait)" : ""}${type.back ? " +back" : ""}`)
  if (args.dryRun) return

  await mapWithConcurrency(todo, args.concurrency, async (type) => {
    const file = path.join(dir, `${type.id}.png`)
    try {
      let front: Buffer
      let portrait: ReferenceImage | null = null
      if (type.portrait) {
        portrait = await fetchImage(type.portrait)
        front = await chromaKeyCutout(await generateStandeeRender([portrait], portraitPrompt(type)))
      } else {
        front = await chromaKeyCutout(await generateStandeeRender([], crowdPrompt(type)))
      }
      await fs.writeFile(file, front)
      console.log(`wrote ${file}`)
      if (type.back && portrait) {
        const back = await chromaKeyCutout(await generateStandeeRender([portrait, { data: front, mimeType: "image/png" }], backPrompt(type)))
        await fs.writeFile(path.join(dir, `${type.id}-back.png`), back)
        console.log(`wrote ${path.join(dir, `${type.id}-back.png`)}`)
      }
    } catch (error) {
      console.error(`[standee-library] ${type.id} failed: ${error instanceof Error ? error.message : error}`)
    }
  })

  // library.json describes every type that has an image on disk
  const entries: StandeeLibraryEntry[] = []
  for (const type of types) {
    const file = path.join(dir, `${type.id}.png`)
    if (!(await exists(file))) continue
    const meta = await sharp(file).metadata()
    const aspect = meta.width && meta.height ? meta.width / meta.height : 0.5
    entries.push({ id: type.id, pose: type.pose, height: type.height, aspect: Number(aspect.toFixed(4)), back: type.back && (await exists(path.join(dir, `${type.id}-back.png`))) ? true : undefined })
  }
  await fs.writeFile(path.join(dir, "library.json"), `${JSON.stringify(entries, null, 2)}\n`)
  console.log(`wrote ${path.join(dir, "library.json")} (${entries.length} entries)`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
