"use server"

import { auth } from "@clerk/nextjs/server"
import type { Id } from "@/convex/_generated/dataModel"
import { assertAdventureAccessByTurn } from "@/lib/adventure-access"
import { loadAdventurePlanForRuntime } from "@/lib/wiki-adventures/plan-view"

export async function checkIsEncounterFinal(turnId: Id<"turns">): Promise<boolean> {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")

  // 1. Fetch turn + enforce adventure access
  const { turn, adventure } = await assertAdventureAccessByTurn(userId, turnId)

  // 2. Load the plan (wiki runtime for migrated adventures, legacy S3 JSON otherwise)
  const plan = await loadAdventurePlanForRuntime(adventure.settingId, adventure.planId)
  if (!plan || !plan.sections) throw new Error("Adventure plan not found")

  // 3. Find current encounter
  const currentEncounter = plan.sections
    .flatMap((section) => section.scenes)
    .flatMap((scene) => scene.encounters)
    .find((encounter) => encounter.id === turn.encounterId)

  if (!currentEncounter) throw new Error("Current encounter not found in plan")

  // 4. Check if encounter has no transitions (indicating it's the final encounter)
  return !currentEncounter.transitions || currentEncounter.transitions.length === 0
}
