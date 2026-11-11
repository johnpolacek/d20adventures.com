import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { z } from "zod"
import { root } from "./sources"

export const dataPath = (name: string) => resolve(root, "data", `${name}.json`)

/**
 * Validate entries against their schema and write `data/<name>.json`, sorted by id. A build fails rather than
 * write an entry the schema rejects or two entries with one id.
 */
export function writeData<T extends { id: string }>(name: string, schema: z.ZodType<T>, entries: unknown[]): T[] {
  const parsed = entries.map((entry, index) => {
    const result = schema.safeParse(entry)
    if (!result.success) {
      const id = entry && typeof entry === "object" && "id" in entry ? String(entry.id) : `#${index}`
      throw new Error(`${name}: ${id} fails its schema\n${result.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`).join("\n")}`)
    }
    return result.data
  })
  const seen = new Set<string>()
  for (const entry of parsed) {
    if (seen.has(entry.id)) throw new Error(`${name}: duplicate id ${entry.id}`)
    seen.add(entry.id)
  }
  parsed.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  writeFileSync(dataPath(name), `${JSON.stringify(parsed, null, 2)}\n`)
  console.log(`  wrote data/${name}.json (${parsed.length})`)
  return parsed
}

/** Read a generated data file. Checks read these, so they test what ships. */
export function readData<T = any>(name: string): T[] {
  const path = dataPath(name)
  if (!existsSync(path)) throw new Error(`data/${name}.json is missing. Run: pnpm --filter @d20/srd build`)
  return JSON.parse(readFileSync(path, "utf8"))
}

/** Upstream index or display name to our id form: lowercase words joined by hyphens. */
export function toId(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * A recorded correction to the base source. `path` is a dot path into the entry ("components.material",
 * "actions.0.damage.0.dice"). `reason` says what the official text reads, and `page` is where it reads so.
 */
export type Override = { id: string; path: string; value: unknown; reason: string; page: number }

/**
 * Apply overrides to entries before they are validated. An override that names a missing entry, or that changes
 * nothing, is an error, so a stale correction cannot linger after the base source fixes itself.
 */
export function applyOverrides<T extends { id: string }>(name: string, entries: T[], overrides: Override[]): T[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  for (const override of overrides) {
    const entry = byId.get(override.id)
    if (!entry) throw new Error(`${name}: override names unknown id ${override.id}`)
    const keys = override.path.split(".")
    let target: any = entry
    for (const key of keys.slice(0, -1)) {
      if (target[key] === undefined || target[key] === null) throw new Error(`${name}: override ${override.id} ${override.path} has no parent at ${key}`)
      target = target[key]
    }
    const last = keys.at(-1) as string
    if (JSON.stringify(target[last]) === JSON.stringify(override.value)) throw new Error(`${name}: override ${override.id} ${override.path} changes nothing. Remove it.`)
    if (override.value === undefined) delete target[last]
    else target[last] = override.value
  }
  if (overrides.length) console.log(`  applied ${overrides.length} override(s) to ${name}`)
  return entries
}
