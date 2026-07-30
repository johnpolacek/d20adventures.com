"use server"

import { auth } from "@clerk/nextjs/server"
import { after } from "next/server"
import type { Id } from "@/convex/_generated/dataModel"
import { assertAdventureAccessByTurn } from "@/lib/adventure-access"
import { processNpcTurnsAfterCurrent } from "@/lib/services/npc-turn-service"
import { maybeTriggerStoryviewAutoGeneration } from "@/lib/services/turn-audio-service"
import { findCurrentActor, hasPendingAutonomousAction } from "@/lib/utils/turn-actors"

export async function ensureNpcProcessed(turnId: Id<"turns">): Promise<{ status: string }> {
  const { userId } = await auth()
  if (!userId) {
    console.error("[ensureNpcProcessed] Unauthorized access attempt.")
    throw new Error("Unauthorized")
  }

  console.log(`[ensureNpcProcessed] Checking turn ${turnId} for pending NPC actions.`)
  const { turn } = await assertAdventureAccessByTurn(userId, turnId)

  const characters = turn.characters || []
  const currentActor = findCurrentActor(characters)

  console.log(`[ensureNpcProcessed] Turn analysis:`, {
    turnId: turn._id.toString(),
    totalCharacters: characters.length,
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

  // Nobody acts autonomously in the final encounter's epilogue turn.
  if (!turn.isFinalEncounter && currentActor && hasPendingAutonomousAction(currentActor)) {
    console.log(`[ensureNpcProcessed] Pending autonomous actor ${currentActor.id} (${currentActor.name}) found in turn ${turnId}. Processing...`)
    try {
      await processNpcTurnsAfterCurrent(turnId)
      console.log(`[ensureNpcProcessed] Finished processing NPCs for turn ${turnId}.`)
      after(() => maybeTriggerStoryviewAutoGeneration(turnId))
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
