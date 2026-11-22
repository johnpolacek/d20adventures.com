// A creator's own adventures: packages in the data folder's creator/<id>/, in the layout scripts/adventure-packages.ts
// writes (package.json, story/, stage/, files/). They play beside the bundled and downloaded ones, unsigned, and one
// with a bundled adventure's id takes its place, so a creator can play their changes to it.
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { Pack } from "./game"

export const creatorRoot = (data: string) => join(data, "creator")

/** The creator packages in the data folder, by id. */
export function creatorIds(data: string) {
  const root = creatorRoot(data)
  return existsSync(root) ? readdirSync(root).filter((id) => /^[a-z0-9-]+$/.test(id) && existsSync(join(root, id, "package.json"))).sort() : []
}

/** Each creator package's story, read as it is: a creator's edits change its content, so no version is checked. */
export function creatorPacks(data: string): Record<string, Pack> {
  const out: Record<string, Pack> = {}
  for (const id of creatorIds(data)) {
    try {
      const pack = JSON.parse(readFileSync(join(creatorRoot(data), id, "story/pack.json"), "utf8")) as { runtime?: { definition?: unknown; artifacts?: unknown } }
      if (pack.runtime?.definition && pack.runtime.artifacts) out[id] = pack.runtime as Pack
    } catch {
      // A package that cannot be read is left out.
    }
  }
  return out
}
