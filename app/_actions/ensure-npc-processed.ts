"use server"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { convex } from "@/lib/convex/server"
import { processNpcTurnsAfterCurrent } from "@/lib/services/npc-turn-service"
import { auth } from "@clerk/nextjs/server"

export async function ensureNpcProcessed(turnId: Id<"turns">): Promise<{ status: string }> {
  const { userId } = await auth()
  if (!userId) {
    console.error("[ensureNpcProcessed] Unauthorized access attempt.")
    throw new Error("Unauthorized")
  }

  console.log(`[ensureNpcProcessed] Checking turn ${turnId} for pending NPC actions.`)
  const turn = await convex.query(api.adventure.getTurnById, { turnId })

  if (!turn) {
    console.error(`[ensureNpcProcessed] Turn ${turnId} not found.`)
    return { status: "error_turn_not_found" }
  }

  const characters = turn.characters || []
  // Sort by initiative (highest first) to find the current actor
  // Skip dead characters (healthPercent === 0 or status === "dead")
  const sortedCharacters = [...characters]
    .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))
    .filter((c) => c.healthPercent !== 0 && c.status !== "dead")
  const currentActor = sortedCharacters.find((c) => !c.isComplete)

  console.log(`[ensureNpcProcessed] Turn analysis:`, {
    turnId: turn._id.toString(),
    totalCharacters: characters.length,
    aliveCharacters: sortedCharacters.length,
    characters: characters.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      initiative: c.initiative,
      hasReplied: c.hasReplied,
      isComplete: c.isComplete,
      healthPercent: c.healthPercent,
      status: c.status,
    })),
    currentActor: currentActor
      ? {
          id: currentActor.id,
          name: currentActor.name,
          type: currentActor.type,
          hasReplied: currentActor.hasReplied,
          isComplete: currentActor.isComplete,
        }
      : null,
  })

  if (currentActor && currentActor.type === "npc" && !currentActor.hasReplied) {
    console.log(`[ensureNpcProcessed] Pending NPC ${currentActor.id} (${currentActor.name}) found in turn ${turnId}. Processing...`)
    try {
      await processNpcTurnsAfterCurrent(turnId)
      console.log(`[ensureNpcProcessed] Finished processing NPCs for turn ${turnId}.`)
      return { status: "npc_processing_triggered" }
    } catch (error) {
      console.error(`[ensureNpcProcessed] Error during processNpcTurnsAfterCurrent for turn ${turnId}:`, error)
      return { status: "error_processing_npc" }
    }
  } else {
    console.log(`[ensureNpcProcessed] No pending NPC actions found for turn ${turnId}.`, {
      currentActor: currentActor
        ? {
            type: currentActor.type,
            hasReplied: currentActor.hasReplied,
            isComplete: currentActor.isComplete,
          }
        : "none",
    })
    return { status: "no_pending_npc" }
  }
}
