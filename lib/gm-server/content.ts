import type { Content } from "@d20/gm-core"
import { withCityContext } from "@d20/gm-core/citymap"
import { floorFromMetres } from "@d20/gm-core/sheet/placement"
import { floorPlanFor } from "@d20/stage/plans/index"
import { cityMapFor } from "@/lib/citymap"
import { readJsonFromS3 } from "@/lib/s3-utils"
import { isLocalWikiAdventure, loadWikiAdventureRuntime } from "@/lib/wiki-adventures/local-runtime"
import { loadAdventurePlanForRuntime } from "@/lib/wiki-adventures/plan-view"
import type { AdventurePlan } from "@/types/adventure-plan"

// An encounter's floor in the engine's feet, from the plan generated from its 3D set.
export const encounterFloor = async (encounterId: string) => {
  const plan = await floorPlanFor(encounterId)
  return plan && floorFromMetres(plan)
}

export const serverContent: Content = {
  isWikiAdventure: isLocalWikiAdventure,
  loadWikiRuntime: loadWikiAdventureRuntime,
  loadPlan: loadAdventurePlanForRuntime,
  loadLegacyPlan: (settingId, planId) => readJsonFromS3(`settings/${settingId}/${planId}.json`) as Promise<AdventurePlan | null>,
  floor: encounterFloor,
  // The engine's words for where everyone stands, with the scene's place in the city.
  async spatialContext(settingId, planId, encounterId, staging) {
    const cityMap = cityMapFor(planId)
    if (!cityMap || !isLocalWikiAdventure(settingId, planId)) return staging
    return withCityContext(staging, cityMap, (await loadWikiAdventureRuntime(settingId, planId)).artifacts.encounters, encounterId)
  },
}
