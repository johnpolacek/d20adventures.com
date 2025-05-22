"use client"

import { useTurnStore, useIsTurnComplete, advanceToNextTurn } from "@/lib/store/turn-store"
import TurnNarrativeReply from "./turn-narrative-reply"
import { parseNarrative } from "@/lib/utils/parse-narrative"
import CharacterDiceRollResultDisplay from "@/components/adventure/character-dice-roll-result-display"
import { Button } from "@/components/ui/button"
import type { AdventurePlan } from "@/types/adventure-plan"

export default function TurnNarrative({ canReply, adventurePlan }: { canReply?: boolean; adventurePlan: AdventurePlan }) {
  const currentTurn = useTurnStore((state) => state.currentTurn)
  const isTurnComplete = useIsTurnComplete()

  if (!currentTurn) {
    return null
  }

  // For now, assume the first character is the current actor
  const currentCharacter = currentTurn.characters[0]
  const parsed = parseNarrative(currentTurn.narrative || "")

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
              <CharacterDiceRollResultDisplay character={part.character} rollType={part.rollType} difficulty={part.difficulty} result={part.result} image={part.image} />
            </div>
          )
        }
      })}
      {canReply && currentCharacter && <TurnNarrativeReply character={currentCharacter} />}
      {isTurnComplete && (
        <div className="flex justify-center mt-8">
          <Button size="lg" variant="epic" onClick={() => advanceToNextTurn(adventurePlan, currentTurn)}>
            Go to Next Turn
          </Button>
        </div>
      )}
    </div>
  )
}
