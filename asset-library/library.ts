// Gathers the asset library from the repo: every character and every place, as its pages show them.
//
// Characters are the cast of every staging (packages/stage/src/stagings) and the player hero looks (public/stage/heroes).
// One with a figure in the workspace (asset-library/characters, built by `pnpm assets <id>`) has a 3D figure.
// Places are the built sets (packages/stage/src/sets), a place's variants kept together, each placed in its adventure's
// story by the encounters played there (content/settings/<setting>/adventures).
// Pictures are the setting's own (named in its data, in the data bucket) and the art under public/stage.
//
// This reads the disk, so it runs on a developer's machine: the dev page calls it on every load, and `pnpm assets:sync`
// writes what it returns to library.json, which the public page reads.

import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { SETS, STAGINGS } from "@d20/stage/sets"
import { LOOKS } from "./looks"
import { SHIPPED } from "./shipped"
import type { Character, Environment, Figure, Library, Picture, Place } from "./types"

interface SetSpec {
  title: string
  locationId?: string
  rooms?: { box: number[] }[]
  objects: unknown[]
  shots?: Record<string, unknown>
  painted?: { points?: Record<string, { paintings?: { map: string }[] }> }
}
interface StagingSpec {
  set?: string
  cast?: { id: string; name: string; role: string; height: number; art?: { front?: string; back?: string } }[]
}

const PICTURE = /\.(webp|jpe?g|png)$/i
const words = (s: string) => s.replace(PICTURE, "").replaceAll("-", " ")

// Every picture under a folder of public/, as a site path, in name order.
async function under(pub: string, dir: string): Promise<string[]> {
  const entries = await readdir(path.join(pub, dir), { withFileTypes: true }).catch(() => [])
  const nested = await Promise.all(entries.map((e) => (e.isDirectory() ? under(pub, `${dir}/${e.name}`) : PICTURE.test(e.name) ? [`/${dir}/${e.name}`] : [])))
  return nested.flat().sort()
}

// The setting's own pictures are named in its data, which lives in the data bucket. Read once for the life of the
// process: the dev page gathers the library on every load.
let settingPictures: Promise<Picture[]> | null = null
function fromSetting(setting: string): Promise<Picture[]> {
  settingPictures ??= (async () => {
    const { AWS_BUCKET_DATA, AWS_REGION, AWS_KEY, AWS_SECRET } = process.env
    if (!AWS_BUCKET_DATA || !AWS_REGION || !AWS_KEY || !AWS_SECRET) return []
    const s3 = new S3Client({ region: AWS_REGION, credentials: { accessKeyId: AWS_KEY, secretAccessKey: AWS_SECRET } })
    const res = await s3.send(new GetObjectCommand({ Bucket: AWS_BUCKET_DATA, Key: `settings/${setting}/setting-data.json` })).catch(() => null)
    const data = res?.Body ? (JSON.parse(await res.Body.transformToString()) as { name?: string; image?: string; locations?: { name: string; image?: string }[] }) : null
    if (!data) return []
    const site = (image: string) => (image.startsWith("http") ? image : `/${image.replace(/^\//, "")}`)
    return [
      ...(data.image ? [{ src: site(data.image), title: data.name ?? setting, kind: "Setting" }] : []),
      ...(data.locations ?? []).filter((l) => l.image).map((l) => ({ src: site(l.image as string), title: l.name, kind: "Setting" })),
    ]
  })()
  return settingPictures
}

// Where an encounter falls in its adventure, as its page says: its order, and the chapter it is in.
async function told(root: string, setting: string, staging: string): Promise<{ order: number; chapter: string } | null> {
  const [adventure, encounter] = staging.split("/")
  const text = await readFile(path.join(root, "content/settings", setting, "adventures", adventure, "encounters", `${encounter}.md`), "utf8").catch(() => null)
  const order = Number(text?.match(/^moduleOrder:\s*(\d+)/m)?.[1])
  return Number.isFinite(order) ? { order, chapter: text?.match(/^sectionTitle:\s*"(.*)"/m)?.[1] ?? "" } : null
}

const HEROES = "heroes"
const UNUSED = "unused"

// `leave` names characters left off the shelf: what is published leaves out a figure tried and not kept (sync.ts).
export async function buildLibrary(root = process.cwd(), leave: string[] = []): Promise<Library> {
  const pub = path.join(root, "public")

  // Every figure on the shelf. One tried on another's model (its brief's `body`) is a trial of that figure, and what
  // its name says in brackets is what was tried: "Thalbern (Rodin pilot, shell skinning)".
  const shelved: Figure[] = []
  const shelf = path.join(root, "asset-library/characters")
  for (const id of (await readdir(shelf).catch(() => [] as string[])).sort()) {
    const text = leave.includes(id) ? null : await readFile(path.join(shelf, id, "figure.json"), "utf8").catch(() => null)
    if (!text) continue
    const figure = JSON.parse(text) as Figure
    const brief = JSON.parse(await readFile(path.join(shelf, id, "character.json"), "utf8").catch(() => "{}")) as { body?: string }
    const said = /^(.*?)\s*\((.*)\)$/.exec(figure.name)
    if (said) Object.assign(figure, { name: said[1], note: said[2] })
    if (brief.body) figure.trial = brief.body
    shelved.push(figure)
  }
  // A character's figures are kept together: those that share a cast id, and the trials of each. Branka is `branka`
  // at the gates and `branka-stoneveil` at the inn, and her one figure goes by both.
  const versions = new Map<string, Figure[]>()
  const together = new Map<Figure, Figure[]>()
  for (const figure of shelved.filter((f) => !f.trial)) {
    const ids = figure.cast?.length ? figure.cast : [figure.id]
    const all = ids.map((cast) => versions.get(cast)).find(Boolean) ?? []
    all.push(figure)
    together.set(figure, all)
    for (const cast of ids) versions.set(cast, all)
  }
  for (const figure of shelved.filter((f) => f.trial)) {
    const body = shelved.find((f) => f.id === figure.trial)
    const all = (body && together.get(body)) ?? []
    all.push(figure)
    together.set(figure, all)
    if (!body) versions.set(figure.id, all)
  }
  // Where the game stands each: a played look's own choice for a cast member, or else the one shipped (play.ts).
  for (const [key, load] of Object.entries(STAGINGS)) {
    const staging = (await load()) as StagingSpec
    const look = staging.set ? LOOKS[staging.set] : undefined
    if (!look?.play) continue
    for (const c of staging.cast ?? []) {
      const figure = shelved.find((f) => f.id === (look.figures?.[c.id] ?? SHIPPED[c.id]))
      const adventure = key.split("/")[0]
      if (figure && !figure.plays?.includes(adventure)) figure.plays = [...(figure.plays ?? []), adventure]
    }
  }
  // The one that stands for a character now is the one shipped, or else the newest that is no trial. It is first, then
  // the others from the newest, then the trials.
  const shipped = new Set(Object.values(SHIPPED))
  const rank = (f: Figure) => (shipped.has(f.id) ? 0 : f.trial ? 2 : 1)
  for (const all of new Set(versions.values())) all.sort((a, b) => rank(a) - rank(b) || b.source.made.localeCompare(a.source.made) || Number(!!b.thumb) - Number(!!a.thumb) || a.id.localeCompare(b.id))
  const figures = new Map([...versions].map(([cast, all]) => [cast, all[0]]))

  // The cast of every staging, each person once, under the adventure they first appear in. Someone a figure already
  // stands for under another id is not listed twice.
  const people = new Map<string, Character>()
  const shown = new Map<Figure, Character>()
  const used: Record<string, string[]> = {}
  const adventures: string[] = []
  for (const [key, load] of Object.entries(STAGINGS)) {
    const staging = (await load()) as StagingSpec
    const adventure = key.split("/")[0]
    if (!adventures.includes(adventure)) adventures.push(adventure)
    if (staging.set) (used[staging.set] ??= []).push(key)
    for (const c of staging.cast ?? []) {
      const figure = figures.get(c.id) ?? null
      const known = people.get(c.id) ?? (figure ? shown.get(figure) : undefined)
      if (known) known.scenes++
      else if (c.art?.front) {
        const person: Character = { id: c.id, name: c.name, role: c.role, height: c.height, group: adventure, front: c.art.front, back: c.art.back ?? null, scenes: 1, figure, ...(figure ? { versions: versions.get(c.id) } : {}) }
        people.set(c.id, person)
        if (figure) shown.set(figure, person)
      }
    }
  }
  // A character no staging's cast has is listed on its own, under its brief's card.
  for (const all of new Set(versions.values())) {
    const figure = all[0]
    if (shown.has(figure) || people.has(figure.id)) continue
    const brief = JSON.parse(await readFile(path.join(shelf, figure.id, "character.json"), "utf8").catch(() => "{}")) as { card?: { front?: string; back?: string } }
    if (!brief.card?.front) continue
    people.set(figure.id, {
      id: figure.id,
      name: figure.name,
      role: figure.role ?? "",
      height: figure.height,
      group: UNUSED,
      front: brief.card.front,
      back: brief.card.back ?? null,
      scenes: 0,
      figure,
      versions: all,
    })
  }
  const looks = (await readdir(path.join(pub, "stage/heroes")).catch(() => [] as string[])).filter((f) => f.endsWith("-front.webp")).map((f) => f.replace("-front.webp", ""))
  for (const id of looks.sort())
    people.set(`hero-${id}`, {
      id: `hero-${id}`,
      name: id.replaceAll("-", " "),
      role: "Player hero",
      height: 0,
      group: HEROES,
      front: `/stage/heroes/${id}-front.webp`,
      back: existsSync(path.join(pub, `stage/heroes/${id}-back.webp`)) ? `/stage/heroes/${id}-back.webp` : null,
      scenes: 0,
      figure: null,
    })
  const characters = [...people.values()].sort((a, b) => Number(!!b.figure) - Number(!!a.figure) || b.scenes - a.scenes || a.name.localeCompare(b.name))

  const environments: (Environment & { location: string })[] = []
  let setting = "realm-of-myr"
  for (const [key, load] of Object.entries(SETS)) {
    const set = (await load()) as SetSpec
    setting = key.split("/")[0]
    const points = Object.values(set.painted?.points ?? {})
    const box = set.rooms?.[0]?.box
    const stagings = used[key] ?? []
    const art = stagings.map((s) => `/stage/art/${s}.webp`).find((file) => existsSync(path.join(pub, file)))
    environments.push({
      key,
      title: set.title,
      location: set.locationId ?? key,
      objects: set.objects.length,
      shots: Object.keys(set.shots ?? {}).length,
      paintings: points.reduce((n, p) => n + (p.paintings?.length ?? 0), 0),
      picture: points.find((p) => p.paintings?.length)?.paintings?.[0]?.map ?? art ?? null,
      room: box ? [box[3] - box[0], box[5] - box[2]] : null,
      stagings,
    })
  }
  // A place's variants are the sets of its location whose names begin with its own: the inn, and the inn at dawn.
  environments.sort((a, b) => a.key.length - b.key.length)
  const places: Place[] = []
  for (const { location, ...e } of environments) {
    const base = places.find((p) => p.location === location && e.key.startsWith(`${p.id}-`))
    if (base) base.variants.push(e)
    else places.push({ id: e.key, location, title: e.title, picture: null, groups: [], variants: [e] })
  }
  for (const p of places) {
    p.picture = p.variants.find((v) => v.picture)?.picture ?? null
    const groups = [...new Set(p.variants.flatMap((v) => v.stagings.map((s) => s.split("/")[0])))]
    p.groups = groups.length ? groups : [UNUSED]
    p.story = {}
    for (const staging of p.variants.flatMap((v) => v.stagings)) {
      const at = await told(root, setting, staging)
      const adventure = staging.split("/")[0]
      if (at && at.order < (p.story[adventure]?.order ?? Number.POSITIVE_INFINITY)) p.story[adventure] = at
    }
  }
  places.sort((a, b) => a.title.localeCompare(b.title))

  // Pictures, by kind. A place's title stands for its set's folder of paintings.
  const titles = new Map(environments.map((e) => [e.key.split("/")[1], e.title]))
  const pictures: Picture[] = [
    ...(await fromSetting(setting)),
    ...(await under(pub, "stage/realm")).map((src) => ({ src, title: words(path.basename(src)), kind: "Setting" })),
    ...(await under(pub, "stage/covers")).map((src) => ({ src, title: words(path.basename(src)), kind: "Adventure Covers" })),
    ...(await under(pub, "stage/art")).map((src) => ({ src, title: words(path.basename(src)), kind: "Scene Art", of: src.split("/")[3] })),
    ...(await under(pub, "stage/maps")).map((src) => ({ src, title: words(path.basename(src)), kind: "Maps", of: src.split("/")[3] })),
    ...(await under(pub, "stage/portraits")).map((src) => ({ src, title: words(path.basename(src)), kind: "Portraits" })),
    ...(await under(pub, "stage/paintings")).map((src) => ({
      src,
      title: `${titles.get(src.split("/")[3]) ?? words(src.split("/")[3])}: ${words(path.basename(src))}`,
      kind: "Set Paintings",
      of: src.split("/")[3],
    })),
    ...(await under(pub, "images/app/backgrounds")).map((src) => ({ src, title: words(path.basename(src)), kind: "Backgrounds" })),
  ]
  const kinds = [...new Set(pictures.map((p) => p.kind))]

  const groups = [...adventures, HEROES, UNUSED].filter((g) => characters.some((c) => c.group === g) || places.some((p) => p.groups.includes(g)))
  return { setting, settingName: "The Realm of Myr", characters, places, groups, pictures, kinds }
}
