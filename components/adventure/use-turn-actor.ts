"use client"

// Whose-turn derivation shared by the turn page narrative, the encounter view's
// bottom strip, and the encounter turn modal. Pure derivation from TurnContext —
// no effects, so consumers can't accidentally double-trigger NPC processing.

import { useUser } from "@clerk/nextjs"
import { useTurnContext } from "@/lib/context/TurnContext"
import { findCurrentActor, hasPendingAutonomousAction, isAiControlledPc } from "@/lib/utils/turn-actors"
import type { TurnCharacter } from "@/types/adventure"

export function useTurnActor() {
  const { currentTurn, disableSSE } = useTurnContext()
  const { user } = useUser()

  const isTurnComplete = currentTurn?.characters.every((c: TurnCharacter) => c.isComplete)

  // Sort characters by initiative (highest first) and find the current actor
  const charactersByInitiative = (currentTurn?.characters || []).slice().sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))

  // Find the current actor: highest initiative, not complete, and not dead
  const currentCharacter = findCurrentActor(currentTurn?.characters || [])

  // Waiting on the server to play an autonomous actor (an NPC or an
  // AI-controlled companion). Name kept for the many existing consumers.
  const isNpcProcessing = Boolean(currentCharacter && hasPendingAutonomousAction(currentCharacter))

  const shouldShowReply = Boolean(
    currentTurn &&
      !currentTurn.isFinalEncounter &&
      currentCharacter &&
      currentCharacter.type === "pc" &&
      currentCharacter.userId === user?.id &&
      !isAiControlledPc(currentCharacter) &&
      !isNpcProcessing &&
      !disableSSE &&
      currentCharacter.healthPercent !== 0
  )

  // Find the player's character and check if their turn is complete.
  // AI companions carry the owner's userId, so exclude them explicitly.
  const playerCharacter = currentTurn?.characters.find((c: TurnCharacter) => c.type === "pc" && c.userId === user?.id && !isAiControlledPc(c))
  const isPlayerTurnComplete = playerCharacter?.isComplete

  // Check if all PCs are dead
  const pcs = currentTurn?.characters.filter((c: TurnCharacter) => c.type === "pc") || []
  const allPCsDead = pcs.length > 0 && pcs.every((c) => c.healthPercent === 0)

  return {
    currentTurn,
    disableSSE,
    charactersByInitiative,
    currentCharacter,
    isTurnComplete,
    isNpcProcessing,
    shouldShowReply,
    playerCharacter,
    isPlayerTurnComplete,
    allPCsDead,
  }
}
