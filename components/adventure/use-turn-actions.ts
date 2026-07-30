"use client"

// Turn action handlers (advance + reply) shared by the turn page narrative and
// the encounter turn modal. Each consumer gets its own advancing/tokenError
// state; the server actions underneath are the same, and Convex updates flow
// back to every consumer over SSE.

import { useParams, useRouter } from "next/navigation"
import React from "react"
import { advanceTurn } from "@/app/_actions/advance-turn"
import { processTurnReply } from "@/app/_actions/adventure"
import type { Id } from "@/convex/_generated/dataModel"
import { useAdventure } from "@/lib/context/AdventureContext"
import { useTurnContext } from "@/lib/context/TurnContext"

export function useTurnActions() {
  const params = useParams()
  const router = useRouter()
  const { currentTurn, disableSSE } = useTurnContext()
  const { settingId, adventurePlanId } = useAdventure()
  const [advancing, setAdvancing] = React.useState(false)
  const [tokenError, setTokenError] = React.useState<string | null>(null)

  const handleAdvanceOrNavigate = async () => {
    if (disableSSE) {
      // Navigation mode: just go to the next turn
      const currentTurnOrder = params.turnOrder ? Number.parseInt(params.turnOrder as string, 10) : 1
      const nextTurnOrder = currentTurnOrder + 1
      const basePath = `/settings/${settingId}/${adventurePlanId}/${params.adventureId}`

      setAdvancing(true)
      router.push(`${basePath}/${nextTurnOrder}`)
      // Reset advancing state after a delay since navigation doesn't complete immediately
      setTimeout(() => setAdvancing(false), 1000)
    } else {
      setAdvancing(true)
      setTokenError(null) // Clear previous errors
      try {
        const result = await advanceTurn({
          turnId: currentTurn?.id as Id<"turns">,
          settingId,
          adventurePlanId,
        })

        // Navigate to the new turn URL after successful advancement
        if (result.status === "turn_advanced") {
          const currentTurnOrder = params.turnOrder ? Number.parseInt(params.turnOrder as string, 10) : 1
          const newTurnOrder = currentTurnOrder + 1
          const basePath = `/settings/${settingId}/${adventurePlanId}/${params.adventureId}`
          router.replace(`${basePath}/${newTurnOrder}`, { scroll: false })
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : ""

        // Check for race condition: another user already advanced this turn
        const expectedTurnOrder = params.turnOrder ? Number.parseInt(params.turnOrder as string, 10) : 1
        const currentTurnOrder = currentTurn ? (currentTurn as { order?: number }).order : undefined
        const turnAlreadyAdvanced = currentTurnOrder !== undefined && currentTurnOrder > expectedTurnOrder

        // Known race-condition error messages
        const isRaceConditionError = errorMessage.includes("Turn not found") || errorMessage.includes("Turn already") || errorMessage.includes("order mismatch")

        if (turnAlreadyAdvanced || isRaceConditionError) {
          // Another user already advanced - navigate silently to the current turn
          const basePath = `/settings/${settingId}/${adventurePlanId}/${params.adventureId}`
          if (turnAlreadyAdvanced && currentTurnOrder !== undefined) {
            router.replace(`${basePath}/${currentTurnOrder}`, {
              scroll: false,
            })
          } else {
            router.refresh()
          }
          return
        }

        // Show actual errors
        if (errorMessage.includes("Insufficient tokens")) {
          setTokenError("You do not have enough tokens to perform this action. Please add more tokens to your account.")
        } else {
          setTokenError("An unexpected error occurred while advancing the turn. Please try again.")
        }
      } finally {
        setAdvancing(false)
      }
    }
  }

  const submitReply = async ({ turnId, characterId, narrativeAction, originalPlayerInput }: { turnId: string | Id<"turns">; characterId: string; narrativeAction: string; originalPlayerInput?: string }) => {
    setTokenError(null) // Clear previous errors
    try {
      const result = await processTurnReply({
        turnId: turnId as Id<"turns">,
        characterId,
        narrativeAction,
        originalPlayerInput,
      })
      return result
    } catch (error) {
      if (error instanceof Error && error.message.includes("Insufficient tokens")) {
        setTokenError("You do not have enough tokens to perform this action. Please add more tokens to your account.")
      } else if (error instanceof Error) {
        setTokenError(error.message)
      } else {
        setTokenError("An unexpected error occurred while processing your action. Please try again.")
      }
      // Re-throw so TurnNarrativeReply can run its own error handling too
      throw error
    }
  }

  return { advancing, tokenError, setTokenError, handleAdvanceOrNavigate, submitReply }
}
