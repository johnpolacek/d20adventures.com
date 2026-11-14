// Dev-only asset library: every character and every place the game has, in one page.
//
//   /dev/assets                                          -> the characters, as a grid
//   /dev/assets?tab=environments&group=covert-cargo      -> the places of one adventure
//   /dev/assets?id=garlan&lod=1&clip=Walk                -> a character: its 3D figure at a detail level and in a clip, or its card
//   /dev/assets?env=realm-of-myr/dragonbone-inn&view=iso -> a place, as the stage shows it or as an isometric cut-away
//
// Characters are the cast of every staging (packages/stage/src/stagings) and the player hero looks (public/stage/heroes).
// One with a folder on the shelf (public/stage-lab/figures, filled by lab/stage-art/library.ts) has a 3D figure.
// Places are the built sets (packages/stage/src/sets), a place's variants kept together.
//
// Gated to development: notFound() elsewhere.

import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { SETS, STAGINGS } from "@d20/stage/sets"
import { notFound } from "next/navigation"
import { isDev } from "@/lib/auth-utils"
import { AssetLibrary, type Character, type Environment, type Figure, type Place } from "./asset-library"

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
  cast?: { id: string; name: string; role: string; height: number; art?: { front?: string; back?: string; portrait?: string } }[]
}

const HEROES = "heroes"
const UNUSED = "unused"

export default async function AssetsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!isDev()) notFound()
  const pub = path.join(process.cwd(), "public")

  const figures = new Map<string, Figure>()
  const shelf = path.join(pub, "stage-lab/figures")
  for (const id of await readdir(shelf).catch(() => [] as string[])) {
    const text = await readFile(path.join(shelf, id, "figure.json"), "utf8").catch(() => null)
    if (text) figures.set(id, JSON.parse(text) as Figure)
  }

  // The cast of every staging, each person once, under the adventure they first appear in.
  const people = new Map<string, Character>()
  const used: Record<string, string[]> = {}
  const adventures: string[] = []
  for (const [key, load] of Object.entries(STAGINGS)) {
    const staging = (await load()) as StagingSpec
    const adventure = key.split("/")[0]
    if (!adventures.includes(adventure)) adventures.push(adventure)
    if (staging.set) (used[staging.set] ??= []).push(key)
    for (const c of staging.cast ?? []) {
      const known = people.get(c.id)
      if (known) known.scenes++
      else if (c.art?.front)
        people.set(c.id, { id: c.id, name: c.name, role: c.role, height: c.height, group: adventure, front: c.art.front, back: c.art.back ?? null, scenes: 1, figure: figures.get(c.id) ?? null })
    }
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
      figure: figures.get(`hero-${id}`) ?? null,
    })
  const characters = [...people.values()].sort((a, b) => Number(!!b.figure) - Number(!!a.figure) || b.scenes - a.scenes || a.name.localeCompare(b.name))

  const environments: (Environment & { location: string })[] = []
  for (const [key, load] of Object.entries(SETS)) {
    const set = (await load()) as SetSpec
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
  for (const e of environments) {
    const base = places.find((p) => p.location === e.location && e.key.startsWith(`${p.id}-`))
    if (base) base.variants.push(e)
    else places.push({ id: e.key, location: e.location, title: e.title, picture: null, groups: [], variants: [e] })
  }
  for (const p of places) {
    p.picture = p.variants.find((v) => v.picture)?.picture ?? null
    const groups = [...new Set(p.variants.flatMap((v) => v.stagings.map((s) => s.split("/")[0])))]
    p.groups = groups.length ? groups : [UNUSED]
  }
  places.sort((a, b) => a.title.localeCompare(b.title))

  const groups = [...adventures, HEROES, UNUSED].filter((g) => characters.some((c) => c.group === g) || places.some((p) => p.groups.includes(g)))
  return <AssetLibrary characters={characters} places={places} groups={groups} params={await searchParams} />
}
