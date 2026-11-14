// Dev-only asset library: the figures on the shelf (public/stage-lab/figures, filled by lab/stage-art/library.ts) and
// the built sets (packages/stage/src/sets), which are shown by the stage's own dev pages.
//
//   /dev/assets                                         -> the first asset
//   /dev/assets?id=garlan&lod=1&clip=Walk               -> a figure, a detail level and a clip
//   /dev/assets?env=realm-of-myr/dragonbone-inn&view=iso -> a set, as the stage shows it or as an isometric cut-away
//
// Gated to development: notFound() elsewhere.

import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { SETS, STAGINGS } from "@d20/stage/sets"
import { notFound } from "next/navigation"
import { isDev } from "@/lib/auth-utils"
import { type Asset, AssetLibrary, type Environment } from "./asset-library"

interface SetSpec {
  title: string
  rooms?: { box: number[] }[]
  objects: unknown[]
  shots?: Record<string, unknown>
  painted?: { points?: Record<string, { paintings?: { map: string }[] }> }
}

export default async function AssetsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!isDev()) notFound()
  const shelf = path.join(process.cwd(), "public/stage-lab/figures")
  const ids = await readdir(shelf).catch(() => [] as string[])
  const assets: Asset[] = []
  for (const id of ids.sort()) {
    const text = await readFile(path.join(shelf, id, "figure.json"), "utf8").catch(() => null)
    if (text) assets.push(JSON.parse(text) as Asset)
  }
  const used: Record<string, string[]> = {}
  for (const [key, load] of Object.entries(STAGINGS)) {
    const set = ((await load()) as { set?: string }).set
    if (set) (used[set] ??= []).push(key)
  }
  const environments: Environment[] = []
  for (const [key, load] of Object.entries(SETS)) {
    const set = (await load()) as SetSpec
    const points = Object.values(set.painted?.points ?? {})
    const box = set.rooms?.[0]?.box
    environments.push({
      key,
      title: set.title,
      objects: set.objects.length,
      shots: Object.keys(set.shots ?? {}).length,
      paintings: points.reduce((n, p) => n + (p.paintings?.length ?? 0), 0),
      picture: points.find((p) => p.paintings?.length)?.paintings?.[0]?.map ?? null,
      room: box ? [box[3] - box[0], box[5] - box[2]] : null,
      stagings: used[key] ?? [],
    })
  }
  environments.sort((a, b) => a.title.localeCompare(b.title))
  return <AssetLibrary assets={assets} environments={environments} params={await searchParams} />
}
