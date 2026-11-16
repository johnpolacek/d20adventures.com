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

export async function buildLibrary(root = process.cwd()): Promise<Library> {
  const pub = path.join(root, "public")

  // A figure goes by every cast id its character has: Branka is `branka` at the gates and `branka-stoneveil` at the inn.
  const figures = new Map<string, Figure>()
  const shelved: Figure[] = []
  const shelf = path.join(root, "asset-library/characters")
  for (const id of (await readdir(shelf).catch(() => [] as string[])).sort()) {
    const text = await readFile(path.join(shelf, id, "figure.json"), "utf8").catch(() => null)
    if (!text) continue
    const figure = JSON.parse(text) as Figure
    for (const cast of figure.cast ?? [id]) figures.set(cast, figure)
    shelved.push(figure)
  }

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
        const person: Character = { id: c.id, name: c.name, role: c.role, height: c.height, group: adventure, front: c.art.front, back: c.art.back ?? null, scenes: 1, figure }
        people.set(c.id, person)
        if (figure) shown.set(figure, person)
      }
    }
  }
  // A figure no cast member stands for, a pilot of another way to make one, is listed on its own under its brief's card.
  for (const figure of shelved) {
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
