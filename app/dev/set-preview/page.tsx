// Dev-only viewer for authored scene-kit sets.
//
//   /dev/set-preview                         -> the first set in the manifest
//   /dev/set-preview?set=kordavos-outer-gate -> a named set
//   /dev/set-preview?set=...&time=night      -> same set, relit
//
// Gated to development like /dev/scene-preview: notFound() elsewhere.

import { notFound } from "next/navigation"
import { isDev } from "@/lib/auth-utils"
import { SET_MANIFEST } from "@/lib/scene-sets/manifest"
import { SetViewer } from "./set-viewer"

export default async function SetPreviewPage({ searchParams }: { searchParams: Promise<{ set?: string; time?: string }> }) {
  if (!isDev()) notFound()
  const params = await searchParams
  const entry = SET_MANIFEST.find((item) => item.id === params.set) ?? SET_MANIFEST[0]
  if (!entry) notFound()
  const timeOfDay = params.time === "night" || params.time === "dusk" ? params.time : "day"
  return <SetViewer setId={entry.id} title={entry.title} timeOfDay={timeOfDay} sets={SET_MANIFEST.map((item) => ({ id: item.id, title: item.title }))} />
}
