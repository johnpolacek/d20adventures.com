"use server"

import { loadAdventurePlanForRuntime } from "@/lib/wiki-adventures/plan-view"
import type { AdventurePlan } from "@/types/adventure-plan"

/**
 * Public read of an adventure plan for display (e.g. the next-adventure card on the
 * final-encounter completion screen). Resolves through the wiki runtime for migrated
 * adventures, the legacy S3 `AdventurePlan` JSON otherwise.
 */
export async function getAdventurePlan(settingId: string, adventurePlanId: string): Promise<AdventurePlan | null> {
  try {
    return await loadAdventurePlanForRuntime(settingId, adventurePlanId)
  } catch (error) {
    console.error("Error fetching adventure plan:", error)
    return null
  }
}
