import type { AdventurePlan } from "@/types/adventure-plan"
import { readJsonFromS3 } from "./s3-utils"

function cloneAdventurePlan(adventurePlan: AdventurePlan): AdventurePlan {
  return {
    ...adventurePlan,
    sections: adventurePlan.sections.map((section) => ({
      ...section,
      scenes: section.scenes.map((scene) => ({
        ...scene,
        encounters: scene.encounters.map((encounter) => ({ ...encounter })),
      })),
    })),
    premadePlayerCharacters: [...adventurePlan.premadePlayerCharacters],
    npcs: { ...adventurePlan.npcs },
  }
}

export function getEncounterMapStorageKey(settingId: string, adventurePlanId: string, encounterId: string) {
  return `settings/${settingId}/maps/${adventurePlanId}/${encounterId}.json`
}

export async function externalizeAdventurePlanMaps(adventurePlan: AdventurePlan, previousPlan?: AdventurePlan | null): Promise<AdventurePlan> {
  void previousPlan
  return cloneAdventurePlan(adventurePlan)
}

export async function hydrateAdventurePlanMaps(adventurePlan: AdventurePlan): Promise<AdventurePlan> {
  return cloneAdventurePlan(adventurePlan)
}

export async function loadAdventurePlanFromStorage(settingId: string, adventurePlanId: string, options?: { includeMaps?: boolean }): Promise<AdventurePlan> {
  const adventurePlan = (await readJsonFromS3(`settings/${settingId}/${adventurePlanId}.json`)) as AdventurePlan
  if (!options?.includeMaps) {
    return adventurePlan
  }
  return hydrateAdventurePlanMaps(adventurePlan)
}
