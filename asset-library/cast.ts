// Each adventure's cast and the figures they stand as, read from the repo (shipped.ts says where). Node only: the
// browser loads one adventure's through FIGURES in @d20/stage/sets.

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const STAGINGS = "packages/stage/src/stagings"

/** Each adventure's cast and the figure each stands as, read from the repo at `root`. Node only. */
export function castFigures(root: string): Record<string, Record<string, string>> {
  const dir = join(root, STAGINGS)
  const out: Record<string, Record<string, string>> = {}
  for (const adventure of readdirSync(dir)) {
    const file = join(dir, adventure, "figures.json")
    if (existsSync(file)) out[adventure] = JSON.parse(readFileSync(file, "utf8")) as Record<string, string>
  }
  return out
}

