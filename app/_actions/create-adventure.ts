'use server'

import { api } from "@/convex/_generated/api"
import { convex } from "@/lib/convex/server"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import type { CharacterChoiceMode } from "@/components/adventure/character-selection"
import { readJsonFromS3 } from "@/lib/s3-utils"
import type { AdventurePlan } from "@/types/adventure-plan"

interface CreateAdventureInput {
  settingId: string
  adventurePlanId: string
  characterChoices: CharacterChoiceMode[]
}

export async function createAdventure(input: CreateAdventureInput) {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }

  const { settingId, adventurePlanId } = input
  // TODO: Use characterChoices in later stages for lobby state

  // Read the adventure plan to get the proper title
  const planPath = `settings/${settingId}/${adventurePlanId}.json`
  const plan = (await readJsonFromS3(planPath)) as AdventurePlan
  if (!plan || !plan.title) {
    throw new Error("Adventure plan not found or is invalid")
  }

  // Extract character choices and create the players array
  const { characterChoices } = input
  const players = characterChoices
    .filter(choice => choice.mode === "player") // Only include characters selected as "player"
    .map(choice => ({
      userId: userId,
      characterId: choice.characterId,
    }))

  // Create adventure in waiting state
  const now = Date.now()
  
  // Create the adventure using the existing Convex mutation
  const adventureId = await convex.mutation(api.adventure.createAdventure, {
    planId: adventurePlanId,
    settingId,
    ownerId: userId,
    playerIds: [userId], // Keep for backwards compatibility
    players,
    status: "waitingForPlayers", // Start in lobby state
    title: plan.title, // Use the actual adventure title from the plan
    startedAt: now,
  })

  // For MVP, we'll redirect to the adventure page immediately
  // The adventure page will handle the "no current turn" state
  redirect(`/settings/${settingId}/${adventurePlanId}/${adventureId}`)
} 