"use server"

import { loadAdventurePlanForRuntime } from "@/lib/wiki-adventures/plan-view"
import type { AdventurePlan } from "@/types/adventure-plan"

/**
 * Public read of an adventure plan for display (e.g. the next-adventure card on the
 * final-encounter completion screen). Resolves through the wiki runtime for migrated
 * adventures, the legacy S3 `AdventurePlan` JSON otherwise.
 */
export async function getAdventurePlan(settingId: string, adventurePlanId: string): Promise<AdventurePlan | null> {
  // Both name a folder and file in storage, so only plain slugs are read.
  if (![settingId, adventurePlanId].every((id) => /^[\w-]+$/.test(id))) return null
  try {
    return await loadAdventurePlanForRuntime(settingId, adventurePlanId)
  } catch (error) {
    console.error("Error fetching adventure plan:", error)
    return null
  }
}
