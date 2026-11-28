"use client"
import { SignUpButton, useUser } from "@clerk/nextjs"
import { storyNames, storyText } from "@d20/gm-core/story/render"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import type React from "react"
import { useEffect, useReducer, useRef, useState } from "react"
import { createAdventureWithFirstTurn, resolvePlayerRollResult } from "@/app/_actions/adventure"
import { deferOrSkipTurn } from "@/app/_actions/defer-turn"
import { useGenerateText } from "@/app/_hooks/useGenerateText"
import CharacterDiceRoll from "@/components/adventure/character-dice-roll"
import { initialReplyPhase, replyReducer } from "@/components/adventure/reply-machine"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@d20/ui/alert-dialog"
import { Button, buttonClassName } from "@d20/ui/button"
import { Textarea } from "@d20/ui/textarea"
import type { Id } from "@/convex/_generated/dataModel"
import { useAdventure } from "@/lib/context/AdventureContext"
import { useTurn } from "@/lib/context/TurnContext"
import { hasBooleanProp, hasNumberProp } from "@/lib/utils"
import type { TurnCharacter } from "@/types/adventure"
import LoadingAnimation from "@d20/ui/loading-animation"
import { Presence, Swap } from "@d20/ui/presence"
import { TipCard, useTip, useTour } from "@d20/ui/stage/tips"
import { DEMO_LIMIT_MESSAGE, demoLimitReached } from "@/lib/demo-limit"

type TurnNarrativeReplyProps = {
  character: TurnCharacter
  submitReply?: (args: { turnId: string | Id<"turns">; characterId: string; playerInput: string }) => Promise<unknown>
}

export default function TurnNarrativeReply({ character, submitReply }: TurnNarrativeReplyProps) {
  const router = useRouter()
  const { user, isSignedIn } = useUser()
  const currentTurn = useTurn()
  const { settingId, adventurePlanId, adventure } = useAdventure()
  const { streamText } = useGenerateText()

  const characterState = currentTurn?.characters.find((c: { id: string }) => c.id === character.id) as TurnCharacter | undefined
  const isComplete = hasBooleanProp(characterState, "isComplete") ? characterState.isComplete : undefined
  const rollResult = hasNumberProp(characterState, "rollResult") ? characterState.rollResult : null
  const showDiceRoll = Boolean(characterState?.rollRequired && rollResult == null)

  const [state, dispatch] = useReducer(replyReducer, showDiceRoll, initialReplyPhase)
  const [skipOpen, setSkipOpen] = useState(false)
  const genAbortRef = useRef<AbortController | null>(null)
  const slotKey = `${currentTurn?.id ?? ""}:${character.id}`
  const prevSlotKeyRef = useRef(slotKey)

  const abortGeneration = () => {
    if (genAbortRef.current) {
      genAbortRef.current.abort()
      genAbortRef.current = null
    }
  }

  useEffect(() => () => abortGeneration(), [])

  useEffect(() => {
    if (prevSlotKeyRef.current !== slotKey) {
      prevSlotKeyRef.current = slotKey
      abortGeneration()
      dispatch({ type: "reset", needsRoll: showDiceRoll })
      return
    }
    dispatch({ type: "sync_server", needsRoll: showDiceRoll })
  }, [slotKey, showDiceRoll])

  if (!currentTurn || isComplete) {
    return null
  }

  const input = "input" in state ? state.input : ""
  const isBusy = state.kind === "submitting" || state.kind === "submittingRoll"
  const isDeferring = state.kind === "submitting" && state.mode === "defer"
  const isGenerating = state.kind === "generating"
  const error = state.kind === "composing" || state.kind === "awaitingRoll" ? state.error : null

  // Build lower-initiative candidates to defer behind (PCs or NPCs)
  const playerInitiative = characterState?.initiative ?? 0
  const lowerCandidates = (currentTurn.characters as TurnCharacter[])
    .filter((c) => !c.isComplete && c.id !== character.id && (c.initiative ?? Number.NEGATIVE_INFINITY) < playerInitiative)
    .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))

  const handleDefer = async (afterId?: string, skipEntire?: boolean) => {
    if (!currentTurn || typeof currentTurn.id !== "string" || isBusy) return
    abortGeneration()
    console.log("[TurnNarrativeReply] handleDefer clicked", {
      afterId,
      skipEntire,
      turnId: currentTurn?.id,
      characterId: character.id,
    })
    dispatch({ type: "submit_started", mode: "defer" })
    try {
      const turnId = currentTurn.id as Id<"turns">
      const res = await deferOrSkipTurn({
        turnId,
        characterId: character.id,
        afterCharacterId: afterId,
        skipEntire,
      })
      console.log("[TurnNarrativeReply] deferOrSkipTurn result", res)
      if (res.status === "deferred" || res.status === "skipped") {
        dispatch({ type: "submit_succeeded" })
        // Force a refresh in case SSE hasn't pushed the update yet
        try {
          router.refresh()
        } catch {}
      } else {
        dispatch({ type: "submit_failed", error: null })
      }
    } catch (err) {
      console.error("[handleDefer] Error:", err)
      dispatch({ type: "submit_failed", error: err instanceof Error ? err.message : "Failed to defer/skip turn. Please try again." })
    }
  }

  const handleDemoReply = async (replyText: string) => {
    if (!user || !user.id || !currentTurn) return false
    const userId = user.id
    const payload = {
      planId: adventurePlanId,
      settingId,
      title: adventure.title,
      ownerId: userId,
      playerIds: [userId],
      startedAt: Date.now(),
      playerInput: replyText,
      turn: {
        encounterId: currentTurn.encounterId,
        // The intro. The server writes the player's words into it as their hero's beats.
        story: currentTurn.story,
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
    const res = await createAdventureWithFirstTurn(payload)
    if (res?.adventureId) {
      dispatch({ type: "submit_succeeded" })
      router.push(`/${settingId}/${adventurePlanId}/${res.adventureId}`, {
        scroll: false,
      })
      return true
    }
    return false
  }

  const handleReply = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || (state.kind !== "composing" && state.kind !== "generating")) return
    abortGeneration()
    dispatch({ type: "submit_started", mode: "reply" })
    const isDemoTurn = currentTurn?.id.includes("demo")
    try {
      if (isDemoTurn) {
        const created = await handleDemoReply(input)
        if (!created) dispatch({ type: "submit_failed", error: "Failed to create adventure. Please try again." })
      } else {
        if (!currentTurn || typeof currentTurn.id !== "string" || !submitReply) {
          dispatch({ type: "submit_failed", error: "Invalid turn ID. Please try again." })
          return
        }
        // The GM writes the reply into the story on the server, as the hero's beats.
        await submitReply({ turnId: currentTurn.id, characterId: character.id, playerInput: trimmed })
        dispatch({ type: "submit_succeeded" })
      }
    } catch (err) {
      console.error("[handleReply] Error:", err)
      if (isDemoTurn) {
        dispatch({ type: "submit_failed", error: err instanceof Error ? err.message : "Failed to create adventure. Please try again." })
      } else if (await demoLimitReached()) {
        dispatch({ type: "submit_failed", error: DEMO_LIMIT_MESSAGE })
      } else if (err instanceof Error && err.message.includes("Insufficient tokens")) {
        // Being out of tokens is told by the turn's own alert.
        dispatch({ type: "submit_failed", error: null })
      } else {
        dispatch({ type: "submit_failed", error: "The game master could not read that reply. Send it again." })
      }
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isGenerating) abortGeneration()
    dispatch({ type: "input_changed", value: e.target.value })
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      void handleReply()
    }
  }

  const handleRollResult = async (result: number, second?: number) => {
    if (state.kind !== "awaitingRoll") return
    let turnId: Id<"turns"> | undefined
    if (currentTurn && typeof currentTurn.id === "string") {
      turnId = currentTurn.id as Id<"turns">
    }
    if (!turnId) {
      dispatch({ type: "roll_submit_failed", error: "Cannot process roll: current turn ID is missing." })
      return
    }
    dispatch({ type: "roll_submit_started" })
    try {
      await resolvePlayerRollResult({
        turnId,
        characterId: character.id,
        result,
        second,
      })
      dispatch({ type: "roll_submit_succeeded" })
    } catch (err) {
      console.error("[handleRollResult] Error in resolvePlayerRollResult:", err)
      let msg = "Failed to process roll result. Please try again."
      if (await demoLimitReached()) {
        msg = DEMO_LIMIT_MESSAGE
      } else if (err instanceof Error && err.message.includes("Insufficient tokens")) {
        msg = "You do not have enough tokens to perform this action. Please add more tokens to your account."
      } else if (err instanceof Error) {
        msg = err.message
      }
      dispatch({ type: "roll_submit_failed", error: msg })
    }
  }

  const handleGenerate = async () => {
    if (!characterState || state.kind !== "composing") return
    abortGeneration()
    const controller = new AbortController()
    genAbortRef.current = controller
    const priorInput = input
    dispatch({ type: "generate_started" })
    try {
      // Build the LLM prompt
      const prompt = `You are the PLAYER (not the GM) roleplaying as the character below. Players describe their character's intent and attempt only. The GM determines all outcomes, results, and perceptions.

Given the recent narrative and any player input, write a short narrative describing what the character does next. Include a character action and, only when natural, one brief line of dialogue in the character's voice. Use third person for actions and put dialogue in quotes. Be creative, stay in character, and keep the reply concise, 1-2 short sentences total.

Constraints:
- Read the narrative to identify what the character is expected to do, then describe them actively taking that action.
- When characters have magical or special abilities, describe them casting spells or invoking powers with visible effects.
- Show concrete actions that others in the scene could observe.
- Do not restate character traits, equipment, or special abilities unless they are directly relevant in this moment.
- Focus on what is happening now; avoid listing capabilities or background info.
- Do not use em dashes, en dashes, or semicolons. Use commas or periods instead.
- CRITICAL: Stop the narrative BEFORE any result, outcome, or feedback from the action.
- Do NOT describe what the character perceives, senses, learns, or discovers.
- Do NOT describe effects, reactions, or consequences of the action.
- GAME RULE: You are the PLAYER, not the GM. Players can only describe their character's INTENT and ATTEMPT. The GM (not you) determines outcomes, results, and what the character perceives. Never write the GM's part.

WRONG: "She casts detect magic and feels ancient vibrations emanating from the crate."
RIGHT: "She traces a complex sigil in the air, violet light gathering at her fingertips as she begins to cast detect magic."

WRONG: "He swings his sword and feels the blade connect with armor."
RIGHT: "He raises his blade and lunges forward with a powerful overhead strike."

Character:
Name: ${characterState.name}
${characterState.archetype ? `Class/Archetype: ${characterState.archetype}\n` : ""}${characterState.race ? `Race: ${characterState.race}\n` : ""}${characterState.personality ? `Personality: ${characterState.personality}\n` : ""}${characterState.background ? `Background: ${characterState.background}\n` : ""}${characterState.motivation ? `Motivation: ${characterState.motivation}\n` : ""}${characterState.appearance ? `Appearance: ${characterState.appearance}\n` : ""}${characterState.specialAbilities ? `Special Abilities: ${characterState.specialAbilities}\n` : ""}${characterState.spells?.length ? `Spells: ${characterState.spells.map((s) => s.name).join(", ")}\n` : ""}${characterState.skills?.length ? `Skills: ${characterState.skills.join(", ")}\n` : ""}${characterState.equipment?.length ? `Equipment: ${characterState.equipment.map((e) => e.name).join(", ")}\n` : ""}

Recent Narrative:
${storyText(currentTurn.story, storyNames(currentTurn.characters))}
${priorInput ? `\nPlayer Input: ${priorInput}` : ""}`
      await streamText(
        prompt,
        (output) => {
          if (!controller.signal.aborted) dispatch({ type: "generate_chunk", value: output })
        },
        controller.signal
      )
      if (!controller.signal.aborted) dispatch({ type: "generate_finished" })
    } catch (err) {
      if (controller.signal.aborted) return
      dispatch({ type: "generate_failed", error: err instanceof Error ? err.message : "Failed to generate reply. Please try again." })
    } finally {
      if (genAbortRef.current === controller) genAbortRef.current = null
    }
  }

  // An attack's target, by name, for the roll card. A spell attack is thrown at the spell's first target.
  const asked = characterState?.rollRequired
  const attackTargetId = asked && "attack" in asked ? asked.attack.target : asked && "cast" in asked ? asked.cast.targets[0] : undefined
  const attackTarget = attackTargetId ? currentTurn.characters.find((c: { id: string }) => c.id === attackTargetId)?.name : undefined

  // One mutually-exclusive view at a time: compose, roll, sending (never simultaneous with roll), or sent.
  const view =
    state.kind === "awaitingRoll"
      ? "roll"
      : state.kind === "submittingRoll" || (state.kind === "submitting" && state.mode === "reply")
        ? "sending"
        : state.kind === "awaitingServer"
          ? "sent"
          : "compose"
  // A first-time tip for what the box asks: typing an action, a roll or an attack.
  // Tips wait while the first-look tour is up.
  const touring = useTour().open
  const tips = useTip(touring ? [] : view === "roll" ? [asked && ("attack" in asked || "cast" in asked) ? "attack" : "roll"] : view === "compose" ? ["act"] : [])

  return (
    <form onSubmit={handleReply} data-tour="reply" className="min-h-[100px]">
      <Presence show={Boolean(tips.tip)} motion="drop" asChild>
        {tips.tip && <TipCard key={tips.tip} tip={tips.tip} className="mx-auto mb-4" onSeen={() => tips.tip && tips.seen(tips.tip)} onNone={tips.none} />}
      </Presence>
      <Swap id={view} motion="rise" exit="fade" className="flex flex-col gap-4">
        {view === "compose" && (
          <>
            <Textarea
              className="md:text-lg border-white/30 whitespace-pre-wrap"
              value={input}
              onChange={handleInputChange}
              placeholder="Write your character's actions and dialogue, in present tense, third person…"
              onKeyDown={handleInputKeyDown}
            />
            <div className="flex justify-start -mt-1">
              <Button variant="ai" size="sm" className="enter-fade text-xs" type="button" loading={isGenerating} onClick={handleGenerate} disabled={isGenerating || isBusy}>
                {isGenerating ? "Generating…" : "Generate"}
              </Button>
            </div>
            <Presence show={Boolean(error)} motion="drop" asChild>
              <p className="text-sm text-red-500 mt-2">{error}</p>
            </Presence>
            <div className="flex justify-center md:justify-end mt-2 gap-8">
              {isSignedIn ? (
                <>
                  {/* Unified Skip menu */}
                  <AlertDialog open={skipOpen} onOpenChange={setSkipOpen}>
                    <AlertDialogTrigger className={buttonClassName("ghost", "sm", "text-sm font-display disable:bg-transparent")} disabled={isDeferring || isBusy}>
                      {isDeferring ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="animate-spin w-3 h-3" />
                          Loading...
                        </span>
                      ) : (
                        "Skip"
                      )}
                    </AlertDialogTrigger>
                    <AlertDialogContent className="sm:max-w-sm">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-center">Skip Turn</AlertDialogTitle>
                        <AlertDialogDescription>Choose to skip to after another player with lower initiative, or skip your entire turn.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <div className="flex flex-col gap-2">
                        {lowerCandidates.length > 0 && (
                          <div className="flex flex-col gap-1">
                            {lowerCandidates.map((c) => (
                              <AlertDialogAction
                                key={c.id}
                                variant="outline"
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
                          variant="outline"
                          className="justify-start"
                          onClick={() => {
                            console.log("[TurnNarrativeReply] Skip entire turn selected")
                            void handleDefer(undefined, true)
                            setSkipOpen(false)
                          }}
                        >
                          Skip entire turn
                        </AlertDialogAction>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                      </div>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button type="submit" disabled={!input.trim() || isBusy} variant="epic" size="lg">
                    {isBusy ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="animate-spin w-4 h-4" />
                        Sending...
                      </span>
                    ) : (
                      "Send Reply"
                    )}
                  </Button>
                </>
              ) : (
                <SignUpButton mode="modal">
                  <Button className="tracking-normal" variant="epic" size="lg">
                    Sign Up to Reply
                  </Button>
                </SignUpButton>
              )}
            </div>
          </>
        )}
        {view === "roll" && characterState?.rollRequired && (
          <>
            <CharacterDiceRoll
              character={characterState as TurnCharacter}
              rollRequired={characterState.rollRequired}
              target={attackTarget}
              rollResult={rollResult ?? null}
              onRoll={handleRollResult}
              inputKey={input}
            />
            <Presence show={Boolean(error)} motion="drop" asChild>
              <p className="text-sm text-red-500 text-center mt-2">{error}</p>
            </Presence>
          </>
        )}
        {view === "sending" && <LoadingAnimation />}
      </Swap>
    </form>
  )
}
