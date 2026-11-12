import type { Content } from "@d20/gm-core"
import { withCityContext } from "@d20/gm-core/citymap"
import { floorFromMetres } from "@d20/gm-core/sheet/placement"
import { floorPlanFor } from "@d20/stage/plans/index"
import { cityMapFor } from "@/lib/citymap"
import { loadEncounterMap2D } from "@/lib/mapview/load"
import { buildMapSpatialContext } from "@/lib/mapview/spatial-summary"
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
  async spatialContext(settingId, planId, encounterId, characters) {
    const map = await loadEncounterMap2D(settingId, planId, encounterId)
    const staging = map
      ? (buildMapSpatialContext(map, {
          party: characters.filter((character) => character.type === "pc").map((character) => ({ name: character.name })),
          npcs: Object.fromEntries(characters.filter((character) => character.type === "npc").map((character) => [character.id, { name: character.name }])),
        }) ?? undefined)
      : undefined
    const cityMap = cityMapFor(planId)
    if (!cityMap || !isLocalWikiAdventure(settingId, planId)) return staging
    return withCityContext(staging, cityMap, (await loadWikiAdventureRuntime(settingId, planId)).artifacts.encounters, encounterId)
  },
}
