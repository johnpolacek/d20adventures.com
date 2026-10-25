import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const encountersDir = "content/settings/realm-of-myr/adventures/march-of-davos/encounters"
const files = readdirSync(encountersDir)
  .filter((file) => file.endsWith(".md"))
  .sort()

let moduleOrder = 1
let changed = 0

for (const file of files) {
  const path = join(encountersDir, file)
  const content = readFileSync(path, "utf8")
  const sectionTitle = metadataValue(content, "sectionTitle") || migrationContextValue(content, "Legacy section")
  const sceneTitle = metadataValue(content, "sceneTitle") || migrationContextValue(content, "Legacy scene")
  if (!sectionTitle && !sceneTitle && metadataValue(content, "moduleOrder")) {
    moduleOrder += 1
    continue
  }
  let next = content
  if (sectionTitle && !metadataValue(content, "sectionTitle")) next = insertFrontmatterValue(next, "sectionTitle", sectionTitle)
  if (sceneTitle && !metadataValue(content, "sceneTitle")) next = insertFrontmatterValue(next, "sceneTitle", sceneTitle)
  if (!metadataValue(content, "moduleOrder")) next = insertFrontmatterValue(next, "moduleOrder", String(moduleOrder), false)
  if (next !== content) {
    writeFileSync(path, next)
    changed += 1
  }
  moduleOrder += 1
}

console.log(`Promoted module metadata in ${changed} March of Davos encounter files.`)

function metadataValue(content: string, key: string) {
  return content.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]?.replace(/^["']|["']$/g, "") ?? ""
}

function migrationContextValue(content: string, label: string) {
  return content.match(new RegExp(`^${escapeRegExp(label)}:\\s*(.+)$`, "m"))?.[1]?.trim() ?? ""
}

function insertFrontmatterValue(content: string, key: string, value: string, quote = true) {
  const line = `${key}: ${quote ? JSON.stringify(value) : value}`
  return content.replace(/^---\n/, `---\n${line}\n`)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
