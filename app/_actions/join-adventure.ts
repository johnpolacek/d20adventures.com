"use server"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { convex } from "@/lib/convex/server"
import { readJsonFromS3, updateJsonOnS3 } from "@/lib/s3-utils"
import { toPCTemplate } from "@/lib/utils/character-mapping"
import type { AdventurePlan } from "@/types/adventure-plan"
import type { PCTemplate } from "@/types/character"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { decrementUserTokensAction, incrementUserTokensAction } from "./tokens"

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

  let chargedTokens = 0
  try {
    const tokenResult = await decrementUserTokensAction({
      tokensUsed: 1,
      transactionType: "usage_join_adventure",
    })

    if (!tokenResult.success) {
      if (tokenResult.errorCode === "INSUFFICIENT_TOKENS") {
        throw new Error("Insufficient tokens to join adventure. Please purchase more tokens to continue.")
      }
      throw new Error(`Failed to deduct tokens: ${tokenResult.error}`)
    }
    chargedTokens = tokenResult.data.chargedTokens

    const userCharKey = `characters/${userId}/${characterId.split("/").pop()?.replace(".json", "")}.json`
    let exists = false
    try {
      await readJsonFromS3(userCharKey)
      exists = true
    } catch {}
    if (!exists) {
      const planPath = `settings/${settingId}/${adventurePlanId}.json`
      let characterData: PCTemplate | unknown = undefined
      try {
        const plan = (await readJsonFromS3(planPath)) as AdventurePlan
        characterData = plan.premadePlayerCharacters?.find((pc) => pc.id === characterId.split("/").pop()?.replace(".json", ""))
      } catch {}
      if (!characterData) {
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

    await convex.mutation(api.adventure.joinAdventure, {
      adventureId: adventureId as Id<"adventures">,
      userId,
      characterId: userCharKey,
    })
  } catch (error) {
    if (chargedTokens > 0) {
      const refund = await incrementUserTokensAction({
        tokensToCredit: chargedTokens,
        transactionType: "adjustment_refund",
      })
      if (!refund.success) {
        console.error("🎲 Failed to refund tokens after join failure:", refund.error, refund.details)
      }
    }
    console.error("🎲 Failed to join adventure:", error)
    throw error
  }

  console.log("🎲 Successfully joined adventure, redirecting...")
  redirect(`/settings/${settingId}/${adventurePlanId}/${adventureId}`)
}
