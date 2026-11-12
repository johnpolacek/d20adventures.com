import { floorFromMetres } from "@d20/gm-core/sheet/placement"
import { floorPlanFor } from "@d20/stage/plans/index"

// An encounter's floor in the engine's feet, from the plan generated from its 3D set.
export const encounterFloor = async (encounterId: string) => {
  const plan = await floorPlanFor(encounterId)
  return plan && floorFromMetres(plan)
}
