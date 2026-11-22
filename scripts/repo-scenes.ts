// The desktop app's scenes, read straight from the repo's stage source (packages/stage/src), for scripts that run
// before any package is built, such as stage-plans.ts. The app itself reads them from its packages (stage-data.ts).
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { addScenes, type SceneEntry, SCENES, sceneFiles } from "../apps/desktop/src/scenes"

const STAGE = "packages/stage/src"
// One object a file, so two adventures on the same set share it, as the compiled imports did.
const files = new Map<string, unknown>()
const read = (file: string) => {
  if (!files.has(file)) files.set(file, JSON.parse(readFileSync(file, "utf8")))
  return files.get(file)
}

for (const id of readdirSync(join(STAGE, "stagings")).sort()) {
  const file = join(STAGE, "stagings", id, "scenes.json")
  if (!existsSync(file)) continue
  const scenes = read(file) as Record<string, SceneEntry>
  const need = sceneFiles(scenes)
  addScenes({
    scenes,
    sets: Object.fromEntries(need.sets.map((s) => [s, read(join(STAGE, "sets", `${s}.json`))])),
    stagings: Object.fromEntries(need.stagings.map((k) => [k, read(join(STAGE, "stagings", id, `${k}.json`))])),
  })
}

export { SCENES }
