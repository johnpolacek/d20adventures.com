"use server"

import type { AdventurePlan } from "@/types/adventure-plan"

export async function getEncounterImage(adventurePlanId: string, encounterId: string): Promise<string | null> {
  try {
    // Dynamically import the adventure plan JSON file
    const adventurePlan = (await import(`@/data/${adventurePlanId}.json`)).default as AdventurePlan
    
    if (!adventurePlan) {
      console.error(`[getEncounterImage] Adventure plan not found: ${adventurePlanId}`)
      return null
    }

    // Find the encounter in the plan
    for (const section of adventurePlan.sections) {
      for (const scene of section.scenes) {
        for (const encounter of scene.encounters) {
          if (encounter.id === encounterId) {
            return encounter.image || null
          }
        }
      }
    }

    console.error(`[getEncounterImage] Encounter not found: ${encounterId} in ${adventurePlanId}`)
    return null
  } catch (error) {
    console.error(`[getEncounterImage] Error loading adventure plan ${adventurePlanId}:`, error)
    return null
  }
} 