/**
 * Gathers each adventure into one package: its story, its stage, and every file the stage names
 * (plans/adventure-packages.md).
 *
 *   pnpm packages:build                    every adventure in the catalog, into build/adventures/<id>/
 *   pnpm packages:build covert-cargo       that one alone
 *   pnpm packages:check                    gathers them all and writes nothing: fails on a file named but missing
 *   --stage-only                           writes no files/ and warns of a missing one, for the desktop build
 *
 * A package:
 *   package.json            id, version, title, setting, its encounters, sets and figures, and every file with its hash
 *   story/pack.json         the story pack, as scripts/desktop-packs.ts makes it
 *   story/city-map.json     the city its encounters stand on, if it has one
 *   stage/sets/<setting>/<set>.json, stage/stagings/<encounter>.json, stage/plans/{sets,encounters}/…
 *   stage/scenes.json       each encounter's scene: its set and staging, place name and party spots (the app's scenes.ts)
 *   stage/portraits.json    card portraits for cast whose cards have none, and each character's painted portrait
 *   stage/looks.json        the played looks of its sets, by set id
 *   stage/figures.json      who stands as which figure (packages/stage/src/stagings/<adventure>/figures.json)
 *   files/stage/…           every file its story and stage name, at the path the stage asks for it by
 *
 * Figures are not copied. They are named by id with the hash of their figure.json, and fetched from the shelf every
 * adventure shares. The stage's kit (textures, sounds, crowds, trees, heroes) is the app's own, not a package's.
 */
import { createHash } from "node:crypto"
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { makePack } from "@d20/gm-core/packs"
import { SETS, STAGINGS } from "@d20/stage/sets"
import { LOOKS } from "@/asset-library/looks"
import { cityMapFor } from "@/lib/citymap"
import { CATALOG } from "@/lib/store/catalog"
import { loadLocalWikiAdventureRuntime } from "@/lib/wiki-adventures/local-runtime"

const ROOT = process.cwd()
const PUBLIC = join(ROOT, "public")
const STAGE = join(ROOT, "packages/stage/src")
const OUT = join(ROOT, "build/adventures")
// The paths the stage fetches through served() (packages/stage/src/served.ts).
const NAMED = /^\/(stage|stage-lab|hero-art|images\/app\/backgrounds)\/[^\s"']+$/
// The app's own: every adventure's stage uses them.
const KIT = ["stage/textures", "stage/sounds", "stage/crowd", "stage/trees", "stage/realm", "stage/heroes", "stage/photoreal.json"]

const args = process.argv.slice(2)
const check = args.includes("--check")
const stageOnly = args.includes("--stage-only")
const named = args.filter((a) => !a.startsWith("--"))

const sha = (body: Buffer | string) => createHash("sha256").update(body).digest("hex")
const kit = (path: string) => KIT.some((k) => path === k || path.startsWith(`${k}/`))

function strings(value: unknown, out: Set<string>) {
  if (typeof value === "string") {
    if (NAMED.test(value)) out.add(value.split(/[?#]/)[0])
  } else if (Array.isArray(value)) for (const v of value) strings(v, out)
  else if (value && typeof value === "object") for (const v of Object.values(value)) strings(v, out)
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith(".")) return []
    const path = join(dir, e.name)
    return e.isDirectory() ? filesUnder(path) : [path]
  })
}

async function gather(id: string, settingId: string) {
  const missing: string[] = []
  const runtime = loadLocalWikiAdventureRuntime(settingId, id)
  const story = await makePack(id, runtime)
  const cityMap = cityMapFor(id)

  // Its encounters' stagings, and the sets they and their looks stand on.
  const stagings: Record<string, unknown> = {}
  for (const [key, load] of Object.entries(STAGINGS)) if (key.startsWith(`${id}/`)) stagings[key.slice(id.length + 1)] = await load()
  const scenesFile = join(STAGE, "stagings", id, "scenes.json")
  const scenes = existsSync(scenesFile) ? (JSON.parse(readFileSync(scenesFile, "utf8")) as Record<string, { set: string; staging: string }>) : {}
  for (const [encounter, scene] of Object.entries(scenes)) if (!stagings[scene.staging]) missing.push(`staging ${id}/${scene.staging} (scene ${encounter})`)
  const setIds = new Set([...Object.values(stagings).map((s) => (s as { set?: string }).set), ...Object.values(scenes).map((s) => s.set)].filter((s): s is string => !!s))
  for (const set of [...setIds]) for (const j of LOOKS[set]?.join ?? []) setIds.add(j.set)
  const sets: Record<string, unknown> = {}
  for (const set of setIds) {
    if (SETS[set]) sets[set] = await SETS[set]()
    else missing.push(`set ${set}`)
  }
  const looks = Object.fromEntries([...setIds].filter((s) => LOOKS[s]).map((s) => [s, LOOKS[s]]))

  // The floor plans the rules read (packages/stage/AGENTS.md): one a set, one an encounter.
  const plans: Record<string, unknown> = {}
  for (const set of setIds) {
    const file = join(STAGE, "plans/sets", `${set.replace("/", "-")}.json`)
    if (existsSync(file)) plans[`sets/${set.replace("/", "-")}.json`] = JSON.parse(readFileSync(file, "utf8"))
  }
  for (const encounter of new Set([...Object.keys(stagings), ...Object.keys(scenes)])) {
    const file = join(STAGE, "plans/encounters", `${encounter}.json`)
    if (existsSync(file)) plans[`encounters/${encounter}.json`] = JSON.parse(readFileSync(file, "utf8"))
  }

  // Who stands as which figure: the adventure's own, and any a played look names.
  const castFile = join(STAGE, "stagings", id, "figures.json")
  const cast = existsSync(castFile) ? (JSON.parse(readFileSync(castFile, "utf8")) as Record<string, string>) : {}
  const figureIds = new Set([...Object.values(cast), ...Object.values(looks).flatMap((l) => Object.values(l.figures ?? {}))])
  const figures: Record<string, string> = {}
  // The files of each figure the app downloads, sized from its figure.json: the models are not in the workspace.
  const figureFiles: Record<string, { bytes: number }> = {}
  const figurePaths = (f: string) => [`asset-library/characters/${f}/figure.json`, `asset-library/characters/${f}/lod0.glb`, `asset-library/characters/${f}/lod1.glb`]
  for (const f of [...figureIds].sort()) {
    const file = join(ROOT, "asset-library/characters", f, "figure.json")
    if (!existsSync(file)) {
      missing.push(`figure ${f}`)
      continue
    }
    const body = readFileSync(file)
    figures[f] = sha(body)
    const lods = (JSON.parse(body.toString("utf8")) as { lods?: { file: string; megabytes: number }[] }).lods ?? []
    figureFiles[`asset-library/characters/${f}/figure.json`] = { bytes: body.length }
    for (const l of lods.filter((l) => l.file === "lod0.glb" || l.file === "lod1.glb")) figureFiles[`asset-library/characters/${f}/${l.file}`] = { bytes: Math.round(l.megabytes * 1e6) }
  }

  // Every file named anywhere in it, and the adventure's own art by where it is kept.
  const paths = new Set<string>()
  strings([runtime, cityMap, stagings, sets, looks], paths)
  const files = new Set<string>()
  const take = (rel: string) => {
    if (kit(rel)) return
    const full = join(PUBLIC, rel)
    if (!existsSync(full)) return void missing.push(`/${rel}`)
    if (statSync(full).isDirectory()) for (const f of filesUnder(full)) files.add(f.slice(PUBLIC.length + 1))
    else files.add(rel)
  }
  for (const p of paths) take(p.slice(1))
  for (const own of [`stage/fixtures/${id}`, `stage/art/${id}`]) if (existsSync(join(PUBLIC, own))) take(own)
  // Portraits. A cast member's card portrait, for one whose card has none (stagings/<adventure>/portraits.json), and
  // each character's painted one, at stage/portraits/<id>.webp (scripts/stage-encounter-art.ts).
  const cardsFile = join(STAGE, "stagings", id, "portraits.json")
  const cards = existsSync(cardsFile) ? (JSON.parse(readFileSync(cardsFile, "utf8")) as Record<string, string>) : {}
  const characters = new Set<string>()
  const ids = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(ids)
    else if (v && typeof v === "object") {
      if (typeof (v as { id?: unknown }).id === "string") characters.add((v as { id: string }).id)
      Object.values(v).forEach(ids)
    }
  }
  const artifacts = (runtime as { artifacts?: { characterSheets?: unknown; entities?: unknown } }).artifacts
  ids([artifacts?.characterSheets, artifacts?.entities])
  for (const staging of Object.values(stagings)) for (const c of (staging as { cast?: { id: string }[] }).cast ?? []) characters.add(c.id)
  const npcs = Object.fromEntries([...characters].sort().filter((c) => existsSync(join(PUBLIC, `stage/portraits/${c}.webp`))).map((c) => [c, `/stage/portraits/${c}.webp`]))
  const portraits = { cards, npcs }
  for (const p of Object.values(npcs)) take(p.slice(1))
  for (const p of Object.values(cards)) take(p.slice(1))
  for (const ext of ["jpg", "webp", "png"]) if (existsSync(join(PUBLIC, `stage/covers/${id}.${ext}`))) take(`stage/covers/${id}.${ext}`)

  const hashed = Object.fromEntries(
    [...files].sort().map((rel) => {
      const body = readFileSync(join(PUBLIC, rel))
      return [rel, { sha256: sha(body), bytes: body.length }]
    })
  )
  // What each scene needs before it shows: the files its set, staging and looks name, its art, and its cast's
  // portraits and figures. The app downloads these first (apps/desktop/runtime/files.ts).
  const needs: Record<string, string[]> = {}
  for (const [encounter, scene] of Object.entries(scenes)) {
    const staging = stagings[scene.staging] as { cast?: { id: string }[] } | undefined
    const setsOf = [scene.set, ...(LOOKS[scene.set]?.join ?? []).map((j) => j.set)]
    const named = new Set<string>()
    strings([staging, setsOf.map((s) => sets[s]), setsOf.map((s) => looks[s])], named)
    const want = new Set([...named].map((p) => p.slice(1)))
    want.add(`stage/art/${id}/${encounter}.webp`)
    // As asset-library/play.ts stands them: full detail for three figures or fewer, the middle level for more.
    const standing = (staging?.cast ?? []).map((c) => looks[scene.set]?.figures?.[c.id] ?? cast[c.id]).filter((f): f is string => !!f)
    const detail = standing.length <= 3 ? "lod0.glb" : "lod1.glb"
    for (const f of standing) for (const p of figurePaths(f).filter((p) => p.endsWith("figure.json") || p.endsWith(detail))) want.add(p)
    for (const c of staging?.cast ?? []) {
      if (npcs[c.id]) want.add(npcs[c.id].slice(1))
      if (cards[c.id]) want.add(cards[c.id].slice(1))
    }
    needs[encounter] = [...want].filter((p) => hashed[p] || figureFiles[p]).sort()
  }
  const source = readFileSync(join(ROOT, "content/settings", settingId, "adventures", id, "adventure.md"), "utf8")
  const title = /^title:\s*"?([^"\n]+)"?\s*$/m.exec(source)?.[1] ?? id
  const contents = { story: story.version, scenes, portraits, stagings, sets, looks, plans, cast, figures, files: hashed, cityMap }
  const manifest = {
    format: "d20.adventure",
    formatVersion: 1,
    id,
    settingId,
    version: sha(JSON.stringify(contents)).slice(0, 16),
    title,
    story: story.version,
    encounters: Object.keys(stagings),
    sets: [...setIds].sort(),
    figures,
    files: hashed,
    figureFiles,
    needs,
  }
  return { manifest, story, cityMap, stagings, sets, looks, plans, cast, scenes, portraits, missing }
}

function write(dir: string, rel: string, value: unknown) {
  const file = join(dir, rel)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

async function main() {
  const entries = named.length ? named.map((id) => CATALOG.find((e) => e.id === id) ?? { id, settingId: "realm-of-myr" }) : CATALOG
  let failed = false
  for (const { id, settingId } of entries) {
    const p = await gather(id, settingId)
    const bytes = Object.values(p.manifest.files).reduce((n, f) => n + f.bytes, 0)
    if (p.missing.length) {
      failed = !stageOnly || p.missing.some((m) => !m.startsWith("/"))
      console.error(`${id}: ${p.missing.length} named but missing:\n${p.missing.map((m) => `  ${m}`).join("\n")}`)
      if (failed) continue
    }
    const summary = `${p.manifest.encounters.length} encounters, ${p.manifest.sets.length} sets, ${Object.keys(p.manifest.figures).length} figures, ${Object.keys(p.manifest.files).length} files (${(bytes / 1e6).toFixed(1)} MB)`
    if (check) {
      console.log(`${id} ${p.manifest.version}: ${summary}`)
      continue
    }
    const dir = join(OUT, id)
    rmSync(dir, { recursive: true, force: true })
    write(dir, "package.json", p.manifest)
    write(dir, "story/pack.json", p.story)
    if (p.cityMap) write(dir, "story/city-map.json", p.cityMap)
    for (const [encounter, staging] of Object.entries(p.stagings)) write(dir, `stage/stagings/${encounter}.json`, staging)
    for (const [set, spec] of Object.entries(p.sets)) write(dir, `stage/sets/${set}.json`, spec)
    for (const [rel, plan] of Object.entries(p.plans)) write(dir, `stage/plans/${rel}`, plan)
    write(dir, "stage/scenes.json", p.scenes)
    write(dir, "stage/portraits.json", p.portraits)
    write(dir, "stage/looks.json", p.looks)
    write(dir, "stage/figures.json", p.cast)
    for (const rel of stageOnly ? [] : Object.keys(p.manifest.files)) {
      mkdirSync(dirname(join(dir, "files", rel)), { recursive: true })
      cpSync(join(PUBLIC, rel), join(dir, "files", rel))
    }
    console.log(`${id} ${p.manifest.version}: ${summary} -> ${resolve(dir)}`)
  }
  if (failed) process.exit(1)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
