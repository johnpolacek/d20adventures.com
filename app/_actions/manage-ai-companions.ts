"use server"

import { auth } from "@clerk/nextjs/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { convex } from "@/lib/convex/server"
import { readJsonFromS3, updateJsonOnS3 } from "@/lib/s3-utils"
import { toPCTemplate } from "@/lib/utils/character-mapping"
import { loadAdventurePlanForRuntime } from "@/lib/wiki-adventures/plan-view"

// Lobby management of AI companions. Owner-only (enforced again by the Convex
// mutations). No token charge — the join fee is for humans joining.

export async function addAiCompanionAction({ adventureId, characterId }: { adventureId: Id<"adventures">; characterId: string }) {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")

  const adventure = await convex.query(api.adventure.getAdventureById, { adventureId })
  if (!adventure) throw new Error("Adventure not found")
  if (adventure.ownerId !== userId) throw new Error("Only the adventure owner can manage AI companions")

  const plan = await loadAdventurePlanForRuntime(adventure.settingId, adventure.planId)
  const premade = plan?.premadePlayerCharacters?.find((pc) => pc.id === characterId)
  if (!premade) throw new Error("AI companions must be premade characters from this adventure")

  // Copy the sheet into the owner's S3 namespace so turn creation and party
  // resolution load it the same way as any player character.
  const companionKey = `characters/${userId}/${characterId}.json`
  let exists = false
  try {
    await readJsonFromS3(companionKey)
    exists = true
  } catch {}
  if (!exists) {
    const pc = toPCTemplate(premade)
    if (!pc) throw new Error("Invalid companion character sheet")
    await updateJsonOnS3(companionKey, pc)
  }

  const maxParty = plan?.party?.[1]
  await convex.mutation(api.adventure.addAiCompanion, {
    adventureId,
    requesterId: userId,
    characterId: companionKey,
    maxParty,
  })

  return { status: "added", characterId: companionKey }
}

export async function removeAiCompanionAction({ adventureId, characterId }: { adventureId: Id<"adventures">; characterId: string }) {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")

  const adventure = await convex.query(api.adventure.getAdventureById, { adventureId })
  if (!adventure) throw new Error("Adventure not found")

  // The lobby UI passes the sheet id from the party card; player entries store
  // the full S3 key, so match either form.
  const entry = adventure.players?.find((p) => p.controlledBy === "ai" && (p.characterId === characterId || p.characterId === `characters/${adventure.ownerId}/${characterId}.json`))
  if (!entry) throw new Error("Companion not found")

  await convex.mutation(api.adventure.removeAiCompanion, {
    adventureId,
    requesterId: userId,
    characterId: entry.characterId,
  })

  return { status: "removed" }
}
