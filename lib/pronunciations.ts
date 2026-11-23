import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parsePronunciations, type Pronunciations } from "@d20/ui/sound/pronunciations"

/** How the narrator says a setting's names: content/settings/<setting>/pronunciations.md. */
export function settingPronunciations(settingId: string, root = process.cwd()): Pronunciations {
  const file = join(root, "content/settings", settingId, "pronunciations.md")
  return existsSync(file) ? parsePronunciations(readFileSync(file, "utf8")) : {}
}
