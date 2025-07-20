'use server'

import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { convex } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { readJsonFromS3, updateJsonOnS3 } from "@/lib/s3-utils"
import type { PCTemplate } from "@/types/character"
import { toPCTemplate } from "@/lib/utils/character-mapping"
import type { AdventurePlan } from "@/types/adventure-plan"
import { decrementUserTokensAction } from "./tokens"

interface JoinAdventureArgs {
  settingId: string
  adventurePlanId: string
  adventureId: string
  characterId: string
}

export async function joinAdventure({ settingId, adventurePlanId, adventureId, characterId }: JoinAdventureArgs) {
  console.log("🎲 Server Action: joinAdventure called", { settingId, adventurePlanId, adventureId, characterId })

  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized: User must be signed in")
  }

  try {
    // Deduct tokens for joining adventure lobby
    const tokenResult = await decrementUserTokensAction({
      tokensUsed: 1, // 1 token to join lobby
      transactionType: "usage_join_adventure",
      description: `Joined adventure lobby: ${adventureId}`,
    })

    if (!tokenResult.success) {
      if (tokenResult.error?.includes("Insufficient tokens")) {
        throw new Error("Insufficient tokens to join adventure. Please purchase more tokens to continue.")
      }
      throw new Error(`Failed to deduct tokens: ${tokenResult.error}`)
    }

    // Ensure the character exists in the user's S3 path
    const userCharKey = `characters/${userId}/${characterId.split('/').pop()?.replace('.json', '')}.json`
    let exists = false
    try {
      await readJsonFromS3(userCharKey)
      exists = true
    } catch {}
    if (!exists) {
      // Load the adventure plan to check for premade PCs
      const planPath = `settings/${settingId}/${adventurePlanId}.json`
      let characterData: PCTemplate | unknown = undefined
      try {
        const plan = (await readJsonFromS3(planPath)) as AdventurePlan
        characterData = plan.premadePlayerCharacters?.find(pc => pc.id === characterId.split('/').pop()?.replace('.json', ''))
      } catch {}
      if (!characterData) {
        // Try to load as a custom character (should not throw if not found)
        try {
          const customChar = await readJsonFromS3(characterId)
          characterData = customChar
        } catch {}
      }
      const pc = toPCTemplate(characterData)
      if (pc) {
        await updateJsonOnS3(userCharKey, pc)
      }
    }

    // Add the player to the adventure
    await convex.mutation(api.adventure.joinAdventure, {
      adventureId: adventureId as Id<"adventures">,
      userId,
      characterId: userCharKey,
    })

    console.log("🎲 Successfully joined adventure, redirecting...")

    // Redirect to the adventure page
    redirect(`/settings/${settingId}/${adventurePlanId}/${adventureId}`)
  } catch (error) {
    console.error("🎲 Failed to join adventure:", error)
    throw error
  }
} 