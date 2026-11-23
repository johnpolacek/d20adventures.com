// A set painting's versions, from paintings.json: when the current one was made and what changed, and the ones it
// replaced. The earlier files sit in an `earlier` folder beside the painting, out of git, and the public bucket keeps
// them (`pnpm stage:sync public/stage/paintings`). Old ones can also be had from git history.
//
// To keep a version when a painting is replaced: copy the old file to
// public/stage/paintings/<set>/earlier/<name>-<the day it was made>.webp, add it here under the painting, and sync.
// No dots inside the name: the set's schema refuses them, and the painted view would not open.

import manifest from "./paintings.json"

export interface PaintingVersion {
  src: string
  made: string
  note?: string
}
export interface PaintingHistory {
  made?: string
  note?: string
  // Newest first.
  earlier?: PaintingVersion[]
}

export const EARLIER_PAINTINGS = manifest as Record<string, PaintingHistory>

// The days a set has earlier paintings from, newest first: what its painted view can be switched back to.
export function paintedDays(setId: string): string[] {
  const days = new Set<string>()
  for (const [src, h] of Object.entries(EARLIER_PAINTINGS)) if (src.split("/")[3] === setId) for (const v of h.earlier ?? []) days.add(v.made)
  return [...days].sort().reverse()
}

// A set's painting maps as they stood on a day: each painting that has changed since takes the newest version made on
// or before it. A painting with nothing earlier stays as it is.
export function paintingsOn(day: string | null): (map: string) => string {
  return (map) => {
    if (!day) return map
    const h = EARLIER_PAINTINGS[map]
    if (!h?.earlier?.length || (h.made && h.made <= day)) return map
    return h.earlier.find((v) => v.made <= day)?.src ?? h.earlier[h.earlier.length - 1].src
  }
}
