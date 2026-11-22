// The runtime's scenes, read from the adventure packages beside it: resources/adventures/<id>/stage, which
// scripts/build-runtime.ts writes. Importing this loads them, so the GM knows each set's named places.
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { type AdventureStage, addScenes, type SceneEntry, sceneFiles } from "../src/scenes"

export * from "../src/scenes"

// Bundled, the runtime sits in resources beside adventures/. Run from source (tests, tsx, from apps/desktop), it reads
// the same folder.
export function stageRoot() {
  const beside = typeof __dirname !== "undefined" ? join(__dirname, "adventures") : ""
  return beside && existsSync(beside) ? beside : join(process.cwd(), "src-tauri/resources/adventures")
}

const read = (file: string) => JSON.parse(readFileSync(file, "utf8")) as unknown

const root = stageRoot()
// In the catalog's order (index.json), which decides where a portrait is found first.
const order = existsSync(join(root, "index.json")) ? (read(join(root, "index.json")) as string[]) : existsSync(root) ? readdirSync(root) : []
for (const id of order) {
  const base = join(root, id, "stage")
  if (!existsSync(join(base, "scenes.json"))) continue
  const scenes = read(join(base, "scenes.json")) as Record<string, SceneEntry>
  const need = sceneFiles(scenes)
  const load = (dir: string, names: string[]) => Object.fromEntries(names.map((n) => [n, read(join(base, dir, `${n}.json`))]))
  const portraits = existsSync(join(base, "portraits.json")) ? (read(join(base, "portraits.json")) as AdventureStage["portraits"]) : undefined
  addScenes({ id, scenes, sets: load("sets", need.sets), stagings: load("stagings", need.stagings), portraits })
}
