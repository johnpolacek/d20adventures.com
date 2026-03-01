import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { convex } from "@/lib/convex/server"
import { processNpcTurnsAfterCurrent } from "@/lib/services/npc-turn-service"
import type { Turn } from "@/types/adventure"

export async function markAdventureCompleteWithoutNextEncounter(adventureId: Id<"adventures">): Promise<void> {
  await convex.mutation(api.turns.patchAdventure, {
    adventureId,
    patch: { endedAt: Date.now(), updatedAt: Date.now() },
  })
}

export async function persistTurnAndFinalizeAdventure(args: {
  requestId: string
  adventureId: Id<"adventures">
  currentOrder: number
  newTurn: Turn
  isFinalEncounter: boolean
  shouldProcessNpcTurns: boolean
}): Promise<Id<"turns">> {
  console.log(`[advanceTurn:${args.requestId}] Creating new turn in Convex:`, {
    adventureId: args.adventureId.toString(),
    encounterId: args.newTurn.encounterId,
    title: args.newTurn.title,
    narrativeLength: args.newTurn.narrative.length,
    characterCount: args.newTurn.characters.length,
    order: args.currentOrder + 1,
    isFinalEncounter: args.isFinalEncounter,
  })

  const newTurnId = await convex.mutation(api.turns.createTurn, {
    adventureId: args.adventureId,
    encounterId: args.newTurn.encounterId,
    title: args.newTurn.title,
    narrative: args.newTurn.narrative,
    characters: args.newTurn.characters,
    order: args.currentOrder + 1,
    isFinalEncounter: args.isFinalEncounter,
  })

  console.log(`[advanceTurn:${args.requestId}] Created new turn with ID:`, newTurnId)

  let shouldProcessNpcTurns = args.shouldProcessNpcTurns
  if (args.isFinalEncounter) {
    shouldProcessNpcTurns = false
    await convex.mutation(api.turns.patchAdventure, {
      adventureId: args.adventureId,
      patch: {
        currentTurnId: newTurnId,
        endedAt: Date.now(),
        updatedAt: Date.now(),
        status: "completed",
      },
    })
  } else {
    await convex.mutation(api.turns.patchAdventure, {
      adventureId: args.adventureId,
      patch: { currentTurnId: newTurnId },
    })
  }

  if (shouldProcessNpcTurns) {
    console.log(`[advanceTurn:${args.requestId}] Starting NPC turn processing for turnId:`, newTurnId)
    await processNpcTurnsAfterCurrent(newTurnId)
    console.log(`[advanceTurn:${args.requestId}] NPC turn processing completed`)
  } else {
    console.log(`[advanceTurn:${args.requestId}] NPC turns processing was skipped for turnId:`, newTurnId)
  }

  return newTurnId
}
