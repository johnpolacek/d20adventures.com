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
import { Loader2 } from "lucide-react"
import { SparklesIcon } from "@heroicons/react/24/solid"
import { useGenerateText } from "@/app/_hooks/useGenerateText"
import { deferOrSkipTurn } from "@/app/_actions/defer-turn"
// removed dropdown in favor of modal
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"

type TurnNarrativeReplyProps = {
  character: TurnCharacter
  submitReply?: (args: { turnId: string | Id<"turns">; characterId: string; narrativeAction: string }) => Promise<unknown>
}

export default function TurnNarrativeReply({ character, submitReply }: TurnNarrativeReplyProps) {
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [deferring, setDeferring] = useState(false)
  // no deferTarget state needed
  const [skipOpen, setSkipOpen] = useState(false)
  const router = useRouter()
  const { user } = useUser()
  const currentTurn = useTurn()
  const { settingId, adventurePlanId, adventure } = useAdventure()
  const { streamText } = useGenerateText()

  if (!currentTurn) {
    return null
  }

  const characterState = currentTurn.characters.find((c: { id: string }) => c.id === character.id) as TurnCharacter | undefined
  const isComplete = hasBooleanProp(characterState, "isComplete") ? characterState.isComplete : undefined
  const rollResult = hasNumberProp(characterState, "rollResult") ? characterState.rollResult : null
  if (isComplete) return null

  // Build lower-initiative candidates to defer behind (PCs or NPCs)
  const playerInitiative = characterState?.initiative ?? 0
  const lowerCandidates = (currentTurn.characters as TurnCharacter[])
    .filter((c) => !c.isComplete && c.id !== character.id && (c.initiative ?? -Infinity) < playerInitiative)
    .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))

  const handleDefer = async (afterId?: string, skipEntire?: boolean) => {
    if (!currentTurn || typeof currentTurn.id !== "string") return
    console.log("[TurnNarrativeReply] handleDefer clicked", { afterId, skipEntire, turnId: currentTurn?.id, characterId: character.id })
    setError(null)
    setDeferring(true)
    try {
      const turnId = currentTurn.id as Id<"turns">
      const res = await deferOrSkipTurn({ turnId, characterId: character.id, afterCharacterId: afterId, skipEntire })
      console.log("[TurnNarrativeReply] deferOrSkipTurn result", res)
      if (res.status === "deferred" || res.status === "skipped") {
        setInput("")
        setHasSubmitted(true)
        // Force a refresh in case SSE hasn't pushed the update yet
        try {
          router.refresh()
        } catch {}
      }
    } catch (err) {
      console.error("[handleDefer] Error:", err)
      setError(err instanceof Error ? err.message : "Failed to defer/skip turn. Please try again.")
    } finally {
      setDeferring(false)
    }
  }

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
          gender: character.gender,
          playerInput: input,
          narrativeContext,
          characterInfo: {
            archetype: character.archetype,
            race: character.race,
            appearance: character.appearance,
            personality: character.personality,
            motivation: character.motivation,
            specialAbilities: character.specialAbilities,
            skills: character.skills,
            equipment: character.equipment?.map((e) => ({ name: e.name })) || [],
          },
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
      setHasSubmitted(true)
      const res = await createAdventureWithFirstTurn(payload)
      if (res && res.adventureId) {
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
        gender: character.gender,
        playerInput: input,
        narrativeContext,
        characterInfo: {
          archetype: character.archetype,
          race: character.race,
          appearance: character.appearance,
          personality: character.personality,
          motivation: character.motivation,
          specialAbilities: character.specialAbilities,
          skills: character.skills,
          equipment: character.equipment?.map((e) => ({ name: e.name })) || [],
        },
      })
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

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      handleReply()
    }
  }

  const handleRollResult = async (result: number) => {
    let turnId: Id<"turns"> | undefined = undefined
    if (currentTurn && typeof currentTurn.id === "string") {
      turnId = currentTurn.id as Id<"turns">
    }
    if (!turnId) {
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

  const handleGenerate = async () => {
    if (!characterState) return
    setGenerating(true)
    setError(null)
    setInput("") // Clear textarea at start
    try {
      // Build the LLM prompt
      const prompt = `You are roleplaying as the player character below in a tabletop RPG. Given the recent narrative and any player input, write a short narrative describing what the character does next. Include a character action and 1-2 sentences of dialogue in the character's voice. Use third person for actions and put dialogue in quotes. Be creative, stay in character, and keep the reply concise (3-5 sentences max).

Constraints:
- Do not restate character traits, equipment, or special abilities unless they are directly relevant in this moment.
- Mention an ability only if it clearly influences the current action or dialogue; otherwise omit it.
- Focus on concrete actions and dialogue happening now; avoid listing capabilities or background info.
- Example guidance (do not include literally): if it is not dark, do not mention night vision (e.g., darkvision/infravision).

Character:
Name: ${characterState.name}
${characterState.personality ? `Personality: ${characterState.personality}\n` : ""}${characterState.background ? `Background: ${characterState.background}\n` : ""}${characterState.motivation ? `Motivation: ${characterState.motivation}\n` : ""}${characterState.appearance ? `Appearance: ${characterState.appearance}\n` : ""}${characterState.specialAbilities ? `Special Abilities (reference only; mention only if used): ${characterState.specialAbilities}\n` : ""}

Recent Narrative:
${currentTurn.narrative}
${input ? `\nPlayer Input: ${input}` : ""}`
      await streamText(prompt, (output) => {
        setInput(output)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate reply. Please try again.")
    } finally {
      setGenerating(false)
    }
  }

  const showDiceRoll = characterState?.rollRequired && rollResult == null

  return (
    <form onSubmit={handleReply} className="flex flex-col gap-4 min-h-[100px]">
      {!loading && !hasSubmitted && !showDiceRoll && (
        <>
          <Textarea
            className="md:text-lg border-white/30"
            value={input}
            onChange={handleInputChange}
            placeholder="Write your character's actions and dialogue here, in the third person..."
            onKeyDown={handleInputKeyDown}
          />
          <div className="flex justify-start -mt-1">
            {generating ? (
              <div className="flex items-center justify-center w-[80px] h-8">
                <Loader2 className="animate-spin w-4 h-4 text-primary-400" />
              </div>
            ) : (
              <Button variant="outline" size="sm" className="text-xs" type="button" onClick={handleGenerate} disabled={generating}>
                <SparklesIcon className="w-4 h-4 text-amber-400 mr-0.5" />
                Generate
              </Button>
            )}
          </div>
          {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
          <div className="flex justify-center md:justify-end mt-2 gap-8">
            <SignedIn>
              <>
                {/* Unified Skip menu */}
                <AlertDialog open={skipOpen} onOpenChange={setSkipOpen}>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-sm font-display" type="button" disabled={deferring} onClick={() => console.log("[TurnNarrativeReply] Skip button clicked")}>
                      {deferring ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="animate-spin w-3 h-3" />
                          Loading...
                        </span>
                      ) : (
                        "Skip"
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="sm:max-w-sm">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-amber-300 font-bold text-center">Skip turn</AlertDialogTitle>
                      <AlertDialogDescription>Choose to skip to after another player with lower initiative, or skip your entire turn.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="flex flex-col gap-2">
                      {lowerCandidates.length > 0 && (
                        <div className="flex flex-col gap-1">
                          {lowerCandidates.map((c) => (
                            <AlertDialogAction
                              key={c.id}
                              className="justify-start"
                              onClick={() => {
                                console.log("[TurnNarrativeReply] Skip after selected", c.id)
                                void handleDefer(c.id, false)
                                setSkipOpen(false)
                              }}
                            >
                              {`Skip to after ${c.name}`}
                            </AlertDialogAction>
                          ))}
                        </div>
                      )}
                      <AlertDialogAction
                        className="justify-start"
                        onClick={() => {
                          console.log("[TurnNarrativeReply] Skip entire turn selected")
                          void handleDefer(undefined, true)
                          setSkipOpen(false)
                        }}
                      >
                        Skip entire turn
                      </AlertDialogAction>
                      <AlertDialogCancel className="mt-2">Cancel</AlertDialogCancel>
                    </div>
                  </AlertDialogContent>
                </AlertDialog>
                <Button type="submit" disabled={!input.trim() || loading} variant="epic" size="lg">
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="animate-spin w-4 h-4" />
                      Sending...
                    </span>
                  ) : (
                    "Send Reply"
                  )}
                </Button>
              </>
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
      {showDiceRoll && characterState?.rollRequired && (
        <CharacterDiceRoll character={characterState as TurnCharacter} rollRequired={characterState.rollRequired} rollResult={rollResult ?? null} onRoll={handleRollResult} inputKey={input} />
      )}
      {loading && <LoadingAnimation />}
    </form>
  )
}
