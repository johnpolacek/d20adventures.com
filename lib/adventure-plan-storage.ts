import type { AdventurePlan } from "@/types/adventure-plan"
import { deleteS3Object, readJsonFromS3, updateJsonOnS3 } from "./s3-utils"

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
  const nextPlan = cloneAdventurePlan(adventurePlan)
  const previousMapKeys = new Map<string, string>()

  if (previousPlan) {
    for (const section of previousPlan.sections) {
      for (const scene of section.scenes) {
        for (const encounter of scene.encounters) {
          if (encounter.map3dKey) {
            previousMapKeys.set(encounter.id, encounter.map3dKey)
          }
        }
      }
    }
  }

  const retainedKeys = new Set<string>()

  for (const section of nextPlan.sections) {
    for (const scene of section.scenes) {
      for (const encounter of scene.encounters) {
        if (encounter.map3d) {
          const mapKey = getEncounterMapStorageKey(nextPlan.settingId, nextPlan.id, encounter.id)
          await updateJsonOnS3(mapKey, encounter.map3d)
          encounter.map3dKey = mapKey
          retainedKeys.add(mapKey)
          delete encounter.map3d
          continue
        }

        if (encounter.map3dKey) {
          retainedKeys.add(encounter.map3dKey)
        }
      }
    }
  }

  for (const previousKey of previousMapKeys.values()) {
    if (!retainedKeys.has(previousKey)) {
      try {
        await deleteS3Object(previousKey)
      } catch (error) {
        console.warn("Failed to delete removed encounter map from S3:", previousKey, error)
      }
    }
  }

  return nextPlan
}

export async function hydrateAdventurePlanMaps(adventurePlan: AdventurePlan): Promise<AdventurePlan> {
  const nextPlan = cloneAdventurePlan(adventurePlan)
  const pendingLoads: Array<Promise<void>> = []

  for (const section of nextPlan.sections) {
    for (const scene of section.scenes) {
      for (const encounter of scene.encounters) {
        if (!encounter.map3dKey) continue

        pendingLoads.push(
          readJsonFromS3(encounter.map3dKey)
            .then((map3d) => {
              encounter.map3d = map3d as NonNullable<typeof encounter.map3d>
            })
            .catch((error) => {
              console.warn("Failed to hydrate encounter map from S3:", encounter.map3dKey, error)
            })
        )
      }
    }
  }

  await Promise.all(pendingLoads)
  return nextPlan
}

export async function loadAdventurePlanFromStorage(settingId: string, adventurePlanId: string, options?: { includeMaps?: boolean }): Promise<AdventurePlan> {
  const adventurePlan = (await readJsonFromS3(`settings/${settingId}/${adventurePlanId}.json`)) as AdventurePlan
  if (!options?.includeMaps) {
    return adventurePlan
  }
  return hydrateAdventurePlanMaps(adventurePlan)
}
