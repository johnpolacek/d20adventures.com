"use client"

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

export default function TurnNarrative({ onTurnAdvanced }: { onTurnAdvanced?: () => void }) {
  const currentTurn = useTurn()
  const { settingId, adventurePlanId } = useAdventure()
  const bottomRef = React.useRef<HTMLDivElement>(null)
  const [advancing, setAdvancing] = React.useState(false)

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

  console.log(
    "[TurnNarrative] Pre-render state:",
    JSON.stringify(
      {
        currentTurnExists: !!currentTurn,
        isFinalEncounter: currentTurn?.isFinalEncounter,
        condition_not_isFinalEncounter: currentTurn ? !currentTurn.isFinalEncounter : undefined,
        currentCharacterName: currentCharacter?.name,
        currentCharacterType: currentCharacter?.type,
        currentCharacterIsComplete: currentCharacter?.isComplete,
        isNpcProcessing: isNpcProcessing,
        isTurnComplete: isTurnComplete,
        shouldShowReply: shouldShowReplyCondition,
        rawCurrentTurn: currentTurn, // No need to stringify currentTurn again here as the whole object is being stringified
      },
      null,
      2
    )
  )

  return (
    <div className="grow max-w-2xl fade-in">
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
          <p className="text-indigo-300/70 font-display">{currentCharacter.name} is rolling…</p>
        </div>
      )}

      {/* Show reply form only if current character is a PC */}
      {shouldShowReplyCondition && (
        <TurnNarrativeReply
          character={currentCharacter!}
          submitReply={async ({ turnId, characterId, narrativeAction }) => {
            // Cast turnId to Id<'turns'>
            console.log("[TurnNarrative] processTurnReply called with:", JSON.stringify({ turnId, characterId, narrativeAction }, null, 2))
            const result = await processTurnReply({ turnId: turnId as Id<"turns">, characterId, narrativeAction })
            console.log("[TurnNarrative] processTurnReply result:", JSON.stringify(result, null, 2))
            return result
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
              try {
                console.log("[advanceTurn] calling advanceTurn with:", JSON.stringify({ currentTurn }, null, 2))
                const result = await advanceTurn({ turnId: currentTurn?.id as Id<"turns">, settingId, adventurePlanId })
                console.log("[advanceTurn] result:", JSON.stringify(result, null, 2))
                if (onTurnAdvanced) {
                  console.log("[advanceTurn] calling onTurnAdvanced()")
                  onTurnAdvanced()
                }
              } finally {
                setAdvancing(false)
              }
            }}
          />
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
