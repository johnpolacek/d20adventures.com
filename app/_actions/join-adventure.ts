"use server"

import { auth, currentUser } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { convex } from "@/lib/convex/server"
import { serverSecret } from "@/lib/convex/server-secret"
import { openLeft, openSeats, seatHero, sheetId, thrownMessage } from "@/lib/host/seats"
import { readJsonFromS3, updateJsonOnS3 } from "@/lib/s3-utils"
import { toPCTemplate } from "@/lib/utils/character-mapping"
import { loadAdventurePlanForRuntime } from "@/lib/wiki-adventures/plan-view"
import type { PCTemplate } from "@/types/character"
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
  // Joining a hosted game is free: the host's app runs its GM.
  const joining = await convex.query(api.adventure.getAdventureById, { adventureId: adventureId as Id<"adventures"> })
  const hosted = Boolean(joining?.host)
  // With held seats, a guest joins only as one of the heroes the host invited, and only while it is open.
  const held = Boolean(joining?.host?.seats?.length)
  const seat = joining && held ? openSeats(joining).find((s) => s.id === sheetId(characterId)) : undefined
  if (held && !seat) throw new Error("That hero is not open in this game.")
  try {
    if (!hosted) {
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
    }

    const userCharKey = `characters/${userId}/${sheetId(characterId)}.json`
    let exists = false
    try {
      await readJsonFromS3(userCharKey)
      exists = true
    } catch {}
    if (!exists) {
      let characterData: PCTemplate | unknown
      try {
        const plan = await loadAdventurePlanForRuntime(settingId, adventurePlanId)
        characterData = seat ? await seatHero(seat, plan.premadePlayerCharacters) : plan.premadePlayerCharacters?.find((pc) => pc.id === sheetId(characterId))
      } catch {}
      if (!characterData && !held) {
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

// A guest takes an open seat with a hero from their own account. They are seated at once, unless the host approves
// heroes: then the host answers in their app, and the lobby shows the answer. Returns whether they were seated, or
// why it could not be done.
export async function requestSeat({ adventureId, characterId }: { adventureId: string; characterId: string }): Promise<{ seated?: boolean; error?: string }> {
  const user = await currentUser()
  if (!user) return { error: "Sign in to ask for a seat." }
  const adventure = await convex.query(api.adventure.getAdventureById, { adventureId: adventureId as Id<"adventures"> }).catch(() => null)
  if (!adventure?.host || openLeft(adventure) < 1) return { error: "This game has no open seat." }
  const key = `characters/${user.id}/${sheetId(characterId)}.json`
  const hero = toPCTemplate(await readJsonFromS3(key).catch(() => null))
  if (!hero) return { error: "That hero is not in your account." }
  const request = { userId: user.id, player: user.username ?? user.firstName ?? "A guest", characterId: key, name: hero.name, race: hero.race, archetype: hero.archetype }
  return convex.mutation(api.hosting.requestSeat, { secret: serverSecret(), adventureId: adventure._id, ...request }).then(
    (res) => ({ seated: res.seated }),
    (e) => ({ error: thrownMessage(e, "That seat could not be taken.") })
  )
}
