// Dev-only asset library: the figures on the shelf (public/stage-lab/figures, filled by lab/stage-art/library.ts).
//
//   /dev/assets                              -> the first asset
//   /dev/assets?id=garlan&lod=1&clip=Walk    -> one asset, a detail level and a clip
//
// Gated to development: notFound() elsewhere.

import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { notFound } from "next/navigation"
import { isDev } from "@/lib/auth-utils"
import { type Asset, AssetLibrary } from "./asset-library"

export default async function AssetsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!isDev()) notFound()
  const shelf = path.join(process.cwd(), "public/stage-lab/figures")
  const ids = await readdir(shelf).catch(() => [] as string[])
  const assets: Asset[] = []
  for (const id of ids.sort()) {
    const text = await readFile(path.join(shelf, id, "figure.json"), "utf8").catch(() => null)
    if (text) assets.push(JSON.parse(text) as Asset)
  }
  return <AssetLibrary assets={assets} params={await searchParams} />
}
