// The runtime's scenes, read from the adventure packages beside it: resources/adventures/<id>/stage, which
// scripts/build-runtime.ts writes. Importing this loads them, so the GM knows each set's named places.
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { addScenes, type SceneEntry, sceneFiles } from "../src/scenes"

export * from "../src/scenes"

// Bundled, the runtime sits in resources beside adventures/. Run from source (tests, tsx), it reads the same folder.
function stageRoot() {
  const beside = typeof __dirname !== "undefined" ? join(__dirname, "adventures") : ""
  return beside && existsSync(beside) ? beside : fileURLToPath(new URL("../src-tauri/resources/adventures", import.meta.url))
}

const read = (file: string) => JSON.parse(readFileSync(file, "utf8")) as unknown

const root = stageRoot()
for (const id of existsSync(root) ? readdirSync(root) : []) {
  const base = join(root, id, "stage")
  if (!existsSync(join(base, "scenes.json"))) continue
  const scenes = read(join(base, "scenes.json")) as Record<string, SceneEntry>
  const need = sceneFiles(scenes)
  const load = (dir: string, names: string[]) => Object.fromEntries(names.map((n) => [n, read(join(base, dir, `${n}.json`))]))
  addScenes({ scenes, sets: load("sets", need.sets), stagings: load("stagings", need.stagings) })
}
