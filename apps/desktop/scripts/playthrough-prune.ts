import { readdirSync, rmSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

// Playthrough videos run about 3 GB each. record-playthrough.ts and `pnpm clean:space` delete those older than 3 days
// from ~/Desktop/d20-playthroughs, which is time enough to post one to YouTube. Move a video out of the folder to keep it.
export const PLAYTHROUGHS = join(homedir(), "Desktop", "d20-playthroughs")
const DAYS = 3

export function prunePlaythroughs(days = DAYS) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  let files = 0
  let bytes = 0
  let names: string[] = []
  try {
    names = readdirSync(PLAYTHROUGHS)
  } catch {
    return { files, bytes }
  }
  for (const name of names) {
    if (!/\.(mp4|mov|wav)$/.test(name)) continue
    const path = join(PLAYTHROUGHS, name)
    const s = statSync(path)
    if (!s.isFile() || s.mtimeMs > cutoff) continue
    rmSync(path)
    files++
    bytes += s.size
  }
  if (files) console.log(`pruned ${files} playthrough files older than ${days} days, ${(bytes / 1e9).toFixed(1)} GB`)
  return { files, bytes }
}
