import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { floorFromMetres } from "@d20/gm-core/sheet/placement"
import { joinPlan, parseEncounterPlan, parseSetPlan } from "@d20/stage/spec/plan"
import { stageRoots } from "./scenes-node"

// An encounter's floor in the engine's feet, from the plan generated from its 3D set, as the adventure's package
// carries it (stage/plans), a creator's first. Undefined when no package has a plan for it.
export const encounterFloor = async (encounterId: string) => {
  for (const root of [...stageRoots].reverse()) {
    for (const id of existsSync(root) ? readdirSync(root) : []) {
      const plans = join(root, id, "stage/plans")
      const file = join(plans, "encounters", `${encounterId}.json`)
      if (!existsSync(file)) continue
      const encounter = parseEncounterPlan(JSON.parse(readFileSync(file, "utf8")))
      const setFile = join(plans, "sets", `${encounter.set.replace("/", "-")}.json`)
      if (!existsSync(setFile)) throw new Error(`floor plan ${encounterId} names unknown set ${encounter.set}`)
      return floorFromMetres(joinPlan(encounter, parseSetPlan(JSON.parse(readFileSync(setFile, "utf8")))))
    }
  }
  return undefined
}
