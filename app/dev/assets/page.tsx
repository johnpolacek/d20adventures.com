// The old link to the asset library. It now lives at /settings/<setting>/assets, in the workspace and on the site.

import { redirect } from "next/navigation"

export default async function AssetsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = new URLSearchParams(Object.entries(await searchParams).filter((e): e is [string, string] => e[1] !== undefined))
  const query = params.toString()
  redirect(`/settings/realm-of-myr/assets${query ? `?${query}` : ""}`)
}
