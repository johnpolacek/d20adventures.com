'use server'

import { api } from "@/convex/_generated/api"
import { convex } from "@/lib/convex/server"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import type { CharacterChoiceMode } from "@/components/adventure/character-selection"
import { readJsonFromS3, updateJsonOnS3 } from "@/lib/s3-utils"
import type { AdventurePlan } from "@/types/adventure-plan"
import type { PCTemplate } from "@/types/character"
import { toPCTemplate } from "@/lib/utils/character-mapping"
import { startAdventure } from "@/app/_actions/start-adventure"

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
      characterId: `characters/${userId}/${choice.characterId}.json`,
    }))

  // Ensure each selected character exists in the user's S3 path
  for (const choice of characterChoices.filter(c => c.mode === "player")) {
    const userCharKey = `characters/${userId}/${choice.characterId}.json`
    let exists = false
    try {
      await readJsonFromS3(userCharKey)
      exists = true
    } catch {}
    if (!exists) {
      // Try to find the character in premade PCs or as a custom character
      let characterData: PCTemplate | unknown = plan.premadePlayerCharacters?.find(pc => pc.id === choice.characterId)
      if (!characterData) {
        // Try to load as a custom character (should not throw if not found)
        try {
          const customChar = await readJsonFromS3(choice.characterId)
          characterData = customChar
        } catch {}
      }
      const pc = toPCTemplate(characterData)
      if (pc) {
        await updateJsonOnS3(userCharKey, pc)
      }
    }
  }

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

  // If only one player character, auto-start the adventure
  if (players.length === 1) {
    // Call startAdventure to create the first turn and redirect to it
    await startAdventure({ settingId, adventurePlanId, adventureId })
    return // startAdventure will handle the redirect
  }

  // For MVP, we'll redirect to the adventure page immediately
  // The adventure page will handle the "no current turn" state
  redirect(`/settings/${settingId}/${adventurePlanId}/${adventureId}`)
} 