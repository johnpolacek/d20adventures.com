"use client"
import { SignedIn, SignedOut, SignUpButton } from "@clerk/nextjs"
import { useState } from "react"
import { useTurnStore } from "@/lib/store/turn-store"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { TurnCharacter } from "@/types/adventure"
import CharacterDiceRoll from "@/components/adventure/character-dice-roll"
import LoadingAnimation from "@/components/ui/loading-animation"

// Mock AI analysis function
function getRollRequired(reply: string) {
  // Example: If reply contains certain keywords, require a roll
  if (/jump|attack|climb|sneak/i.test(reply)) {
    return {
      rollType: "Stealth Check",
      difficulty: 15,
    }
  }
  return null
}

export default function TurnNarrativeReply({ character }: { character: TurnCharacter }) {
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const submitReply = useTurnStore((state) => state.submitReply)
  const rollForCharacter = useTurnStore((state) => state.rollForCharacter)
  const currentTurn = useTurnStore((state) => state.currentTurn)
  // Find the up-to-date character state from the store
  const characterState = currentTurn?.characters.find((c) => c.id === character.id)

  if (characterState?.isComplete) return null

  const handleReply = async () => {
    if (input.trim()) {
      setLoading(true)
      await submitReply(character.id, input)
      setInput("")
      setLoading(false)
    }
  }

  // Clear roll state on input change
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    // No need to clear roll state, store handles it
  }

  // Handle d20 roll
  const handleRollResult = (result: number) => {
    rollForCharacter(character.id, result)
  }

  return (
    <div className="flex flex-col gap-4">
      {loading ? (
        <LoadingAnimation />
      ) : (
        !characterState?.hasReplied && (
          <>
            <Textarea className="text-lg border-white/30" value={input} onChange={handleInputChange} placeholder="Write your character's actions and dialogue here, in the third person..." />
            <div className="flex justify-end">
              <SignedIn>
                <Button onClick={handleReply} disabled={!input.trim()} variant="epic" size="lg">
                  Send Reply
                </Button>
              </SignedIn>
              <SignedOut>
                <SignUpButton mode="modal">
                  <Button className="tracking-normal" variant="epic" size="lg">
                    Sign Up to Reply
                  </Button>
                </SignUpButton>
              </SignedOut>
            </div>
          </>
        )
      )}
      {characterState?.rollRequired && characterState.rollResult == null && (
        <CharacterDiceRoll
          character={characterState}
          rollType={characterState.rollRequired.rollType}
          difficulty={characterState.rollRequired.difficulty}
          rollResult={characterState.rollResult ?? null}
          onRoll={handleRollResult}
          inputKey={input}
        />
      )}
    </div>
  )
}
