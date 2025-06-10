'use server'

import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { convex } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { readJsonFromS3 } from "@/lib/s3-utils"
import type { AdventurePlan } from "@/types/adventure-plan"

interface StartAdventureArgs {
  settingId: string
  adventurePlanId: string
  adventureId: string
}

export async function startAdventure({ settingId, adventurePlanId, adventureId }: StartAdventureArgs) {
  console.log("🎲 Server Action: startAdventure called", { settingId, adventurePlanId, adventureId })

  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized: User must be signed in")
  }

  try {
    // Load adventure plan
    const planPath = `settings/${settingId}/${adventurePlanId}.json`
    const adventurePlan = (await readJsonFromS3(planPath)) as AdventurePlan
    if (!adventurePlan) {
      throw new Error("Adventure plan not found")
    }

    console.log("🎲 Adventure plan loaded:", JSON.stringify({
      title: adventurePlan.title,
      party: adventurePlan.party,
      premadeCharacterCount: adventurePlan.premadePlayerCharacters?.length || 0
    }, null, 2))

    // Get the current adventure to access player data
    const adventure = await convex.query(api.adventure.getAdventureById, {
      adventureId: adventureId as Id<"adventures">
    })

    if (!adventure) {
      throw new Error("Adventure not found")
    }

    console.log("🎲 Current adventure data:", JSON.stringify({
      id: adventure._id,
      title: adventure.title,
      status: adventure.status,
      players: adventure.players,
      playerIds: adventure.playerIds
    }, null, 2))

    // Get the first encounter from the adventure plan
    const firstSection = adventurePlan.sections[0]
    const firstScene = firstSection.scenes[0]
    const firstEncounter = firstScene.encounters[0]

    if (!firstEncounter) {
      throw new Error("No encounters found in adventure plan")
    }

    console.log("🎲 First encounter:", JSON.stringify({
      id: firstEncounter.id,
      title: firstEncounter.title,
      skipInitialNpcTurns: firstEncounter.skipInitialNpcTurns
    }, null, 2))

    // Build the characters array from adventure players + NPCs
    const characters = []

    // Add player characters
    if (adventure.players) {
      for (const player of adventure.players) {
        const characterTemplate = adventurePlan.premadePlayerCharacters.find(pc => pc.id === player.characterId)
        if (characterTemplate) {
          const pcCharacter = {
            ...characterTemplate,
            type: "pc" as const,
            userId: player.userId,
            initiative: Math.floor(Math.random() * 20) + 1, // Random initiative for now
            hasReplied: false,
            isComplete: false
          }
          characters.push(pcCharacter)
        }
      }
    }

    // Add NPC characters from the encounter
    if (firstEncounter.npc) {
      for (const npcRef of firstEncounter.npc) {
        const npcTemplate = adventurePlan.npcs[npcRef.id]
        if (npcTemplate) {
          const npcCharacter = {
            ...npcTemplate,
            type: "npc" as const,
            initiative: npcRef.initialInitiative || Math.floor(Math.random() * 20) + 1,
            hasReplied: false,
            isComplete: false,
            behavior: npcRef.behavior
          }
          characters.push(npcCharacter)
        }
      }
    }

    console.log("🎲 Turn characters being created:", JSON.stringify(characters.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      initiative: c.initiative,
      userId: c.type === "pc" ? c.userId : undefined
    })), null, 2))

    // Create the first turn
    const turnId = await convex.mutation(api.adventure.createTurn, {
      adventureId: adventureId as Id<"adventures">,
      encounterId: firstEncounter.id,
      title: firstEncounter.title,
      narrative: firstEncounter.intro,
      characters: characters,
      order: 1,
    })

    console.log("🎲 Successfully started adventure with first turn:", turnId)
    console.log("🎲 Turn created with", characters.length, "characters")

    // Redirect to the adventure page (which will show the first turn)
    redirect(`/settings/${settingId}/${adventurePlanId}/${adventureId}`)
  } catch (error) {
    console.error("🎲 Failed to start adventure:", error)
    throw error
  }
} 