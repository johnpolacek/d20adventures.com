"use client"
import React from "react"
import { useAdventure } from "@/lib/context/AdventureContext"
import { SignedIn, SignedOut, SignUpButton, useUser } from "@clerk/nextjs"
import { useTurn } from "@/lib/context/TurnContext"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import type { TurnCharacter } from "@/types/adventure"
import type { Id } from "@/convex/_generated/dataModel"
import CharacterDiceRoll from "@/components/adventure/character-dice-roll"
import LoadingAnimation from "../ui/loading-animation"
import { hasBooleanProp, hasNumberProp } from "@/lib/utils"
import { formatNarrativeAction } from "@/lib/services/narrative-service"
import { resolvePlayerRollResult } from "@/app/_actions/adventure"
import { createAdventureWithFirstTurn } from "@/app/_actions/adventure"

type TurnNarrativeReplyProps = {
  character: TurnCharacter
  submitReply?: (args: { turnId: string | Id<"turns">; characterId: string; narrativeAction: string }) => Promise<unknown>
}

export default function TurnNarrativeReply({ character, submitReply }: TurnNarrativeReplyProps) {
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const { user } = useUser()
  const currentTurn = useTurn()
  const { settingId, adventurePlanId, adventure } = useAdventure()

  if (!currentTurn) {
    return null
  }

  const characterState = currentTurn.characters.find((c: { id: string }) => c.id === character.id) as TurnCharacter | undefined
  const isComplete = hasBooleanProp(characterState, "isComplete") ? characterState.isComplete : undefined
  const rollResult = hasNumberProp(characterState, "rollResult") ? characterState.rollResult : null
  if (isComplete) return null

  const handleDemoReply = async () => {
    if (!user || !user.id || !currentTurn) return
    const userId = user.id
    let narrativeAction = input.trim()
    setError(null)
    try {
      if (character) {
        const paragraphs = (currentTurn.narrative || "").split(/\\n\\n+/).filter(Boolean)
        const narrativeContext = paragraphs.slice(-2).join("\\n\\n")
        narrativeAction = await formatNarrativeAction({
          characterName: character.name,
          playerInput: input,
          narrativeContext,
        })
      }
      const prev = currentTurn.narrative || ""
      const newNarrative = prev ? `${prev}\\n\\n${narrativeAction}` : narrativeAction
      const payload = {
        planId: adventurePlanId,
        settingId,
        title: adventure.title,
        ownerId: userId,
        playerIds: [userId],
        startedAt: Date.now(),
        playerInput: input,
        turn: {
          encounterId: currentTurn.encounterId,
          narrative: newNarrative,
          characters: (currentTurn.characters as TurnCharacter[]).map((c) => ({
            ...c,
            hasReplied: c.id === character.id,
            isComplete: c.id === character.id,
            rollRequired: undefined,
            rollResult: undefined,
          })),
          order: 0,
        },
      }
      console.log("[handleDemoReply] Calling createAdventureWithFirstTurn with payload:", JSON.stringify(payload, null, 2))
      setHasSubmitted(true)
      const res = await createAdventureWithFirstTurn(payload)
      console.log("[handleDemoReply] createAdventureWithFirstTurn result:", JSON.stringify(res, null, 2))
      if (res && res.adventureId) {
        console.log("[handleDemoReply] Navigating to new adventure:", `/${settingId}/${adventurePlanId}/${res.adventureId}`)
        router.push(`/${settingId}/${adventurePlanId}/${res.adventureId}`, { scroll: false })
        return
      }
    } catch (err) {
      console.error("[handleDemoReply] Error calling createAdventureWithFirstTurn:", err)
      setError(err instanceof Error ? err.message : "Failed to create adventure. Please try again.")
      setLoading(false)
    }
  }

  const handleCharacterReply = async () => {
    if (!currentTurn || !currentTurn.id || !submitReply) return
    setError(null)
    try {
      const paragraphs = (currentTurn.narrative || "").split(/\\n\\n+/).filter(Boolean)
      const narrativeContext = paragraphs.slice(-2).join("\\n\\n")
      const aiResult = await formatNarrativeAction({
        characterName: character.name,
        playerInput: input,
        narrativeContext,
      })
      console.log("[handleCharacterReply] aiResult:", JSON.stringify(aiResult, null, 2))
      if (typeof aiResult !== "string") {
        console.error("[handleCharacterReply] aiResult is not a string:", aiResult)
        setError("Failed to format reply. Please try again.")
        setLoading(false)
        return
      }
      if (typeof currentTurn.id !== "string") {
        console.error("[handleCharacterReply] currentTurn.id is not a string:", currentTurn.id)
        setError("Invalid turn ID. Please try again.")
        setLoading(false)
        return
      }
      setHasSubmitted(true)
      await submitReply({
        turnId: currentTurn.id,
        characterId: character.id,
        narrativeAction: aiResult,
      })
    } catch (err) {
      console.error("[handleCharacterReply] Error:", err)
      setError(err instanceof Error ? err.message : "Failed to submit reply. Please try again.")
      setLoading(false)
    }
  }

  const handleReply = async (e?: React.FormEvent) => {
    console.log("[handleReply] FUNCTION CALLED with input:", input)
    if (e) e.preventDefault()
    if (!input.trim()) return
    setLoading(true)
    setError(null)
    const isDemoTurn = currentTurn && currentTurn.id.includes("demo")
    try {
      if (isDemoTurn) {
        await handleDemoReply()
      } else {
        await handleCharacterReply()
      }
    } catch (err) {
      console.error("[handleReply] Error:", err)
      if (!error) {
        setError(err instanceof Error ? err.message : "An unexpected error occurred. Please try again.")
      }
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    setError(null)
  }

  const handleRollResult = async (result: number) => {
    console.log("[handleRollResult] FUNCTION CALLED with result:", result)
    let turnId: Id<"turns"> | undefined = undefined
    if (currentTurn && typeof currentTurn.id === "string") {
      turnId = currentTurn.id as Id<"turns">
    }
    console.log("[handleRollResult] Computed turnId:", turnId)
    if (!turnId) {
      console.log("[handleRollResult] No turnId found, aborting.")
      setError("Cannot process roll: current turn ID is missing.")
      return
    }
    setLoading(true)
    setError(null)
    try {
      await resolvePlayerRollResult({
        turnId,
        characterId: character.id,
        result,
      })
    } catch (err) {
      console.error("[handleRollResult] Error in resolvePlayerRollResult:", err)
      if (err instanceof Error && err.message.includes("Insufficient tokens")) {
        setError("You do not have enough tokens to perform this action. Please add more tokens to your account.")
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("Failed to process roll result. Please try again.")
      }
    } finally {
      setInput("")
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleReply} className="flex flex-col gap-4 min-h-[100px]">
      {!loading && !hasSubmitted && (
        <>
          <Textarea className="text-lg border-white/30" value={input} onChange={handleInputChange} placeholder="Write your character's actions and dialogue here, in the third person..." />
          {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
          <div className="flex justify-end mt-2">
            <SignedIn>
              <Button type="submit" disabled={!input.trim()} variant="epic" size="lg">
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
      )}
      {characterState?.rollRequired && rollResult == null && (
        <CharacterDiceRoll character={characterState as TurnCharacter} rollRequired={characterState.rollRequired} rollResult={rollResult ?? null} onRoll={handleRollResult} inputKey={input} />
      )}
      {loading && <LoadingAnimation />}
    </form>
  )
}
