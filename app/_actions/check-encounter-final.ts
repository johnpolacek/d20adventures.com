"use server"

import { convex } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"
import { readJsonFromS3 } from "@/lib/s3-utils"
import type { Id } from "@/convex/_generated/dataModel"
import type { AdventurePlan } from "@/types/adventure-plan"

export async function checkIsEncounterFinal(turnId: Id<"turns">): Promise<boolean> {
  // 1. Fetch the turn from Convex
  const turn = await convex.query(api.adventure.getTurnById, { turnId })
  if (!turn) throw new Error("Turn not found")

  // 2. Fetch the adventure to get settingId and planId
  const adventure = await convex.query(api.adventure.getAdventureById, { adventureId: turn.adventureId })
  if (!adventure) throw new Error("Adventure not found")

  // 3. Load the plan from S3
  const plan = (await readJsonFromS3(`settings/${adventure.settingId}/${adventure.planId}.json`)) as AdventurePlan
  if (!plan || !plan.sections) throw new Error("Adventure plan not found")

  // 4. Find current encounter
  const currentEncounter = plan.sections
    .flatMap(section => section.scenes)
    .flatMap(scene => scene.encounters)
    .find(encounter => encounter.id === turn.encounterId)

  if (!currentEncounter) throw new Error("Current encounter not found in plan")

  // 5. Check if encounter has no transitions (indicating it's the final encounter)
  return !currentEncounter.transitions || currentEncounter.transitions.length === 0
} 