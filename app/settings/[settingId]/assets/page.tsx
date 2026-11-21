// The asset library: /settings/realm-of-myr/assets, the same link in the workspace and on the site.
//
//   ?tab=characters                           -> the party, then every character
//   ?tab=environments&group=covert-cargo      -> the places of one adventure
//   ?id=garlan&lod=1&clip=Walk                -> a character: its 3D figure at a detail level and in a clip, or its card
//   ?env=dragonbone-inn&view=iso -> a place, as the stage shows it or as an isometric cut-away
//
// In development it is read from the disk on every load, and next.config.ts sends /asset-library/characters to the
// workspace's own figures. On the site it shows what `pnpm assets:sync` last published to the public bucket under
// asset-library/: the index, library.json, and the figures. A sync shows there within a minute, with no deploy. A
// place is assembled in the visitor's browser from the sets and stagings this deploy carries. The page is left out
// of search.

import type { Metadata } from "next"
import { notFound } from "next/navigation"
import type { Library } from "@/asset-library/types"
import { AssetLibrary } from "@/asset-library/ui/library"
import { isDev } from "@/lib/auth-utils"

export const metadata: Metadata = { title: "Asset Library · The Realm of Myr", robots: { index: false, follow: false } }

async function published(): Promise<Library | null> {
  const cdn = process.env.CLOUDFRONT_DOMAIN
  const res = cdn ? await fetch(`${cdn}/asset-library/library.json`, { next: { revalidate: 60 } }).catch(() => null) : null
  return res?.ok ? ((await res.json()) as Library) : null
}

export default async function SettingAssets(props: { params: Promise<{ settingId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { settingId } = await props.params
  const library = isDev() ? await (await import("@/asset-library/library")).buildLibrary() : await published()
  if (!library || library.setting !== settingId) notFound()
  return <AssetLibrary library={library} config={{ home: `/settings/${settingId}/assets`, files: "/asset-library/characters" }} params={await props.searchParams} />
}
