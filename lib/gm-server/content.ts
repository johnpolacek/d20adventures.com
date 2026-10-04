import type { Content } from "@d20/gm-core"
import { loadEncounterMap2D } from "@/lib/mapview/load"
import { buildMapSpatialContext } from "@/lib/mapview/spatial-summary"
import { readJsonFromS3 } from "@/lib/s3-utils"
import { isLocalWikiAdventure, loadWikiAdventureRuntime } from "@/lib/wiki-adventures/local-runtime"
import { loadAdventurePlanForRuntime } from "@/lib/wiki-adventures/plan-view"
import type { AdventurePlan } from "@/types/adventure-plan"

export const serverContent: Content = {
  isWikiAdventure: isLocalWikiAdventure,
  loadWikiRuntime: loadWikiAdventureRuntime,
  loadPlan: loadAdventurePlanForRuntime,
  loadLegacyPlan: (settingId, planId) => readJsonFromS3(`settings/${settingId}/${planId}.json`) as Promise<AdventurePlan | null>,
  async spatialContext(settingId, planId, encounterId, characters) {
    const map = await loadEncounterMap2D(settingId, planId, encounterId)
    if (!map) return undefined
    return (
      buildMapSpatialContext(map, {
        party: characters.filter((character) => character.type === "pc").map((character) => ({ name: character.name })),
        npcs: Object.fromEntries(characters.filter((character) => character.type === "npc").map((character) => [character.id, { name: character.name }])),
      }) ?? undefined
    )
  },
}
