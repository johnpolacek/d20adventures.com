// Dev-only asset library: the workspace's own page, read from the disk on every load.
//
//   /dev/assets                                          -> the library's home: its places
//   /dev/assets?tab=characters                           -> the party, then every character
//   /dev/assets?tab=environments&group=covert-cargo      -> the places of one adventure
//   /dev/assets?id=garlan&lod=1&clip=Walk                -> a character: its 3D figure at a detail level and in a clip, or its card
//   /dev/assets?env=realm-of-myr/dragonbone-inn&view=iso -> a place, as the stage shows it or as an isometric cut-away
//
// The page anyone can open is /settings/<setting>/assets, which shows what `pnpm assets:sync` last sent to the bucket.
//
// Gated to development: notFound() elsewhere.

import { notFound } from "next/navigation"
import { buildLibrary } from "@/asset-library/library"
import { AssetLibrary } from "@/asset-library/ui/library"
import { isDev } from "@/lib/auth-utils"

export default async function AssetsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!isDev()) notFound()
  return <AssetLibrary library={await buildLibrary()} config={{ home: "/dev/assets", files: "/dev/assets/file/characters" }} params={await searchParams} />
}
