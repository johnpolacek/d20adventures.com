import type { GmPorts } from "../ports"
import type { Turn } from "../types/adventure"
import { createNpcTurnService } from "./npc-turn-service"

export function createAdvanceTurnFinalizationService(ports: GmPorts) {
  const { processNpcTurnsAfterCurrent } = createNpcTurnService(ports)
  async function markAdventureCompleteWithoutNextEncounter(adventureId: string): Promise<void> {
    await ports.store.patchAdventure({
      adventureId,
      patch: { endedAt: Date.now(), updatedAt: Date.now() },
    })
  }

  async function persistTurnAndFinalizeAdventure(args: {
    requestId: string
    adventureId: string
    currentOrder: number
    newTurn: Turn
    isFinalEncounter: boolean
    shouldProcessNpcTurns: boolean
  }): Promise<string> {
    console.log(`[advanceTurn:${args.requestId}] Creating new turn in Convex:`, {
      adventureId: args.adventureId.toString(),
      encounterId: args.newTurn.encounterId,
      title: args.newTurn.title,
      narrativeLength: args.newTurn.narrative.length,
      characterCount: args.newTurn.characters.length,
      order: args.currentOrder + 1,
      isFinalEncounter: args.isFinalEncounter,
    })

    const newTurnId = await ports.store.createTurn({
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
      await ports.store.patchAdventure({
        adventureId: args.adventureId,
        patch: {
          currentTurnId: newTurnId,
          currentEncounterId: args.newTurn.encounterId,
          endedAt: Date.now(),
          updatedAt: Date.now(),
          status: "completed",
        },
      })
    } else {
      await ports.store.patchAdventure({
        adventureId: args.adventureId,
        patch: { currentTurnId: newTurnId, currentEncounterId: args.newTurn.encounterId },
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
  return { markAdventureCompleteWithoutNextEncounter, persistTurnAndFinalizeAdventure }
}
