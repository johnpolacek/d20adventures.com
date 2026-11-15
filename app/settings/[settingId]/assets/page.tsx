// The asset library, for anyone with the link: /settings/realm-of-myr/assets.
//
// It shows what `pnpm assets:sync` last published to the public bucket under asset-library/: the index, library.json,
// and the figures, which next.config.ts rewrites /asset-library/... to. A sync shows here within a minute, with no
// deploy. A place is assembled in the visitor's browser from the sets and stagings this deploy carries. The page is
// left out of search.

import type { Metadata } from "next"
import { notFound } from "next/navigation"
import type { Library } from "@/asset-library/types"
import { AssetLibrary } from "@/asset-library/ui/library"

export const metadata: Metadata = { title: "Asset Library · The Realm of Myr", robots: { index: false, follow: false } }

export default async function SettingAssets(props: { params: Promise<{ settingId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { settingId } = await props.params
  const cdn = process.env.CLOUDFRONT_DOMAIN
  const res = cdn ? await fetch(`${cdn}/asset-library/library.json`, { next: { revalidate: 60 } }).catch(() => null) : null
  const library = res?.ok ? ((await res.json()) as Library) : null
  if (!library || library.setting !== settingId) notFound()
  return <AssetLibrary library={library} config={{ home: `/settings/${settingId}/assets`, files: "/asset-library/characters" }} params={await props.searchParams} />
}
