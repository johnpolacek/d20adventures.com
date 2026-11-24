// Deletes captures in raw/captures older than a week, so a run of capture.ts does not pile up gigabytes of frames.
// A plate to keep longer gets a line in raw/captures/keep.txt: a file name, or a pattern with `*`, such as inn-*-view*.
// capture.ts runs this on every start. `pnpm clean:space` runs it too.

import { readdir, readFile, rm, stat } from "node:fs/promises"
import { join } from "node:path"

export const CAPTURES = "lab/stage-art/raw/captures"
const WEEK = 7 * 24 * 60 * 60 * 1000

const glob = (pattern: string) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`)

export async function pruneCaptures(maxAge = WEEK) {
  const names = await readdir(CAPTURES).catch(() => [] as string[])
  const keep = (await readFile(join(CAPTURES, "keep.txt"), "utf8").catch(() => ""))
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map(glob)
  const cutoff = Date.now() - maxAge
  let files = 0
  let bytes = 0
  for (const name of names) {
    if (name === "keep.txt" || keep.some((k) => k.test(name))) continue
    const path = join(CAPTURES, name)
    const s = await stat(path).catch(() => null)
    if (!s?.isFile() || s.mtimeMs > cutoff) continue
    await rm(path)
    files++
    bytes += s.size
  }
  if (files) console.log(`pruned ${files} captures older than ${Math.round(maxAge / 86400000)} days, ${(bytes / 1e6).toFixed(0)} MB`)
  return { files, bytes }
}

if (process.argv[1]?.endsWith("prune.ts")) void pruneCaptures()
