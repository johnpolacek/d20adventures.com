"use client"

import { useEffect } from "react"
import { useTurn } from "@/lib/context/TurnContext"
import TurnNarrativeReply from "./turn-narrative-reply"
import { parseNarrative } from "@/lib/utils/parse-narrative"
import CharacterDiceRollResultDisplay from "@/components/adventure/character-dice-roll-result-display"
import type { TurnCharacter } from "@/types/adventure"
import type { Id } from "@/convex/_generated/dataModel"
import { advanceTurn } from "@/app/_actions/advance-turn"
import React from "react"
import TurnAdvanceButton from "@/components/adventure/turn-advance-button"
import { processTurnReply } from "@/app/_actions/adventure"
import { useAdventure } from "@/lib/context/AdventureContext"
import LoadingAnimation from "../ui/loading-animation"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertTriangle } from "lucide-react"

export default function TurnNarrative() {
  const currentTurn = useTurn()
  const { settingId, adventurePlanId } = useAdventure()
  const bottomRef = React.useRef<HTMLDivElement>(null)
  const [advancing, setAdvancing] = React.useState(false)
  const [initialNarrative, setInitialNarrative] = React.useState("")
  const [tokenError, setTokenError] = React.useState<string | null>(null)

  useEffect(() => {
    // scroll to bottom of page when currentTurn.narrative changes after the first render
    if (currentTurn?.narrative) {
      if (!initialNarrative) {
        setInitialNarrative(currentTurn.narrative)
      } else if (initialNarrative !== currentTurn.narrative) {
        // scrollToBottom()
      }
    }
  }, [currentTurn?.narrative])

  if (!currentTurn) {
    console.log("[TurnNarrative] currentTurn is null, returning null")
    return null
  }

  const isTurnComplete = currentTurn.characters.every((c: TurnCharacter) => c.isComplete)

  // Sort characters by initiative (highest first) and find the current actor
  const charactersByInitiative = (currentTurn?.characters || []).slice().sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))

  // Find the current actor: highest initiative, not complete
  const currentCharacter = charactersByInitiative.find((c: TurnCharacter) => !c.isComplete)

  // Check if we're waiting for an NPC to process their turn
  const isNpcProcessing = currentCharacter && currentCharacter.type === "npc" && !currentCharacter.hasReplied

  const parsed = parseNarrative(currentTurn?.narrative || "")

  const shouldShowReplyCondition = currentTurn && !currentTurn.isFinalEncounter && currentCharacter && currentCharacter.type === "pc" && !isNpcProcessing

  return (
    <div className="grow max-w-2xl fade-in">
      {tokenError && (
        <Alert variant="destructive" className="my-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Action Failed</AlertTitle>
          <AlertDescription>{tokenError}</AlertDescription>
        </Alert>
      )}
      {parsed.map((part, idx) => {
        if (part.type === "paragraph") {
          return (
            <p key={idx} className="text-sm sm:text-base md:text-lg whitespace-pre-line mb-4">
              {part.value}
            </p>
          )
        } else {
          // Use a more unique key if available, otherwise fallback to idx
          const key = part.character ? `${part.character}-${part.rollType}-${part.result}-${part.difficulty}` : idx
          return (
            <div className="pb-6" key={key}>
              <CharacterDiceRollResultDisplay
                character={part.character}
                rollType={part.rollType}
                difficulty={part.difficulty}
                result={part.result}
                image={part.image}
                modifier={part.modifier}
                baseRoll={part.baseRoll}
              />
            </div>
          )
        }
      })}

      {/* Show loading animation if an NPC is processing their turn */}
      {isNpcProcessing && !currentTurn?.isFinalEncounter && (
        <div className="flex flex-col items-center gap-4 py-8">
          <LoadingAnimation />
          <p className="text-indigo-300 font-display">{currentCharacter.name} is rolling…</p>
        </div>
      )}

      {/* Show reply form only if current character is a PC */}
      {shouldShowReplyCondition && (
        <TurnNarrativeReply
          character={currentCharacter!}
          submitReply={async ({ turnId, characterId, narrativeAction }) => {
            setTokenError(null) // Clear previous errors
            try {
              // Cast turnId to Id<'turns'>
              console.log("[TurnNarrative] processTurnReply called with:", JSON.stringify({ turnId, characterId, narrativeAction }, null, 2))
              const result = await processTurnReply({ turnId: turnId as Id<"turns">, characterId, narrativeAction })
              console.log("[TurnNarrative] processTurnReply result:", JSON.stringify(result, null, 2))
              // If the action was implausible, set the feedback as a tokenError to display it.
              if (result?.actionImplausible && result.feedback) {
                setTokenError(result.feedback)
                // Potentially return a different structure or throw an error to prevent further processing in TurnNarrativeReply
                return result // Or throw new Error(result.feedback) if TurnNarrativeReply should stop hard.
              }
              return result
            } catch (error) {
              console.error("[TurnNarrative] Error processing turn reply:", error)
              if (error instanceof Error && error.message.includes("Insufficient tokens")) {
                setTokenError("You do not have enough tokens to perform this action. Please add more tokens to your account.")
              } else if (error instanceof Error) {
                // Handle other specific errors from processTurnReply if needed
                setTokenError(error.message) // Display the error message from the caught error
              } else {
                setTokenError("An unexpected error occurred while processing your action. Please try again.")
              }
              // When an error occurs, you might want to throw it or return a specific structure
              // to let TurnNarrativeReply know that the submission failed.
              // For now, it will fall through and TurnNarrativeReply might proceed as if successful depending on its logic.
              // Consider throwing the error to be caught by TurnNarrativeReply's own error handling if it has one.
              throw error // Re-throw the error so TurnNarrativeReply can also handle it if needed
            }
          }}
        />
      )}

      {isTurnComplete && currentTurn?.isFinalEncounter && (
        <div className="flex flex-col items-center justify-center mt-8 text-center p-6 bg-green-100 border border-green-300 rounded-lg shadow-md">
          <h2 className="text-2xl font-semibold text-green-700 mb-2">Adventure Complete!</h2>
          <p className="text-green-600">Congratulations on reaching the end of your journey.</p>
          {/* You could add a button here to navigate away or view a summary */}
        </div>
      )}
      {isTurnComplete && !currentTurn?.isFinalEncounter && (
        <div className="flex justify-center mt-8">
          <TurnAdvanceButton
            advancing={advancing}
            onAdvance={async () => {
              console.log("[advanceTurn] currentTurn before:", JSON.stringify(currentTurn, null, 2))
              console.log("[advanceTurn] turnId:", currentTurn?.id)
              setAdvancing(true)
              setTokenError(null) // Clear previous errors
              try {
                console.log("[advanceTurn] calling advanceTurn with:", JSON.stringify({ currentTurn }, null, 2))
                const result = await advanceTurn({ turnId: currentTurn?.id as Id<"turns">, settingId, adventurePlanId })
                console.log("[advanceTurn] result:", JSON.stringify(result, null, 2))
                // If successful, scroll to top
                if (!tokenError) {
                  // Check if an error was NOT set from this operation
                  // scrollToTop(); // Re-enable if desired, or use a more specific scroll target
                }
              } catch (error) {
                console.error("[TurnNarrative] Error advancing turn:", error)
                if (error instanceof Error && error.message.includes("Insufficient tokens")) {
                  setTokenError("You do not have enough tokens to perform this action. Please add more tokens to your account.")
                } else {
                  // Handle other types of errors or re-throw if necessary
                  setTokenError("An unexpected error occurred while advancing the turn. Please try again.")
                }
              } finally {
                setAdvancing(false)
                // scrollToTop() // Removed from here
              }
            }}
          />
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
