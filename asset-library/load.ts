// The asset library as a page reads it: gathered from the disk in development, and on the site what
// `pnpm assets:sync` last published to the public bucket. A sync shows there within a minute, with no deploy.

import { isDev } from "@/lib/auth-utils"
import type { Library } from "./types"

export async function loadLibrary(): Promise<Library | null> {
  if (isDev()) return (await import("./library")).buildLibrary()
  const cdn = process.env.CLOUDFRONT_DOMAIN
  const res = cdn ? await fetch(`${cdn}/asset-library/library.json`, { next: { revalidate: 60 } }).catch(() => null) : null
  return res?.ok ? ((await res.json()) as Library) : null
}
