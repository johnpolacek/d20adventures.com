"use server"

import type { Id } from "@/convex/_generated/dataModel"
import { assertAdventureAccessByTurn } from "@/lib/adventure-access"
import { readJsonFromS3 } from "@/lib/s3-utils"
import type { AdventurePlan } from "@/types/adventure-plan"
import { auth } from "@clerk/nextjs/server"

export async function checkIsEncounterFinal(turnId: Id<"turns">): Promise<boolean> {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")

  // 1. Fetch turn + enforce adventure access
  const { turn, adventure } = await assertAdventureAccessByTurn(userId, turnId)

  // 2. Load the plan from S3
  const plan = (await readJsonFromS3(`settings/${adventure.settingId}/${adventure.planId}.json`)) as AdventurePlan
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
