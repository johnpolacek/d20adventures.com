"use client"

// The reusable core of the turn UI: narrative history, NPC processing state,
// reply form, waiting/game-over/final-encounter blocks, and turn advance.
// Rendered by the turn page (variant="page") and the encounter view's turn
// drawer (variant="drawer"). Render-only plus action handlers — the singleton
// page effects (NPC trigger, auto-navigate) stay in TurnNarrative.

import { useUser } from "@clerk/nextjs"
import { AlertTriangle } from "lucide-react"
import Link from "next/link"
import React from "react"
import CharacterDiceRollResultDisplay from "@/components/adventure/character-dice-roll-result-display"
import TurnAdvanceButton from "@/components/adventure/turn-advance-button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useAdventure } from "@/lib/context/AdventureContext"
import { cn } from "@/lib/utils"
import { parseNarrative } from "@/lib/utils/parse-narrative"
import { Button } from "../ui/button"
import LoadingAnimation from "../ui/loading-animation"
import FinalEncounterCompleteMessage from "./final-encounter-complete-message"
import TurnNarrativeReply from "./turn-narrative-reply"
import { useTurnActions } from "./use-turn-actions"
import { useTurnActor } from "./use-turn-actor"

export default function TurnNarrativeBody({ variant, showOriginalReplies = false, nextAdventure }: { variant: "page" | "drawer"; showOriginalReplies?: boolean; nextAdventure?: string }) {
  const { currentTurn, disableSSE, currentCharacter, isTurnComplete, isNpcProcessing, shouldShowReply, isPlayerTurnComplete, allPCsDead } = useTurnActor()
  const { advancing, tokenError, handleAdvanceOrNavigate, submitReply } = useTurnActions()
  const { settingId, adventurePlanId } = useAdventure()
  const { isSignedIn } = useUser()

  // Drawer variant scrolls its own container (the page variant's window scroll
  // lives in TurnNarrative): jump to the latest content + reply form on open,
  // follow along as new narrative streams in.
  const bottomRef = React.useRef<HTMLDivElement>(null)
  const hasScrolledRef = React.useRef(false)
  React.useEffect(() => {
    if (variant !== "drawer" || !currentTurn?.narrative) return
    bottomRef.current?.scrollIntoView({ block: "end", behavior: hasScrolledRef.current ? "smooth" : "instant" })
    hasScrolledRef.current = true
  }, [variant, currentTurn?.narrative])

  if (!currentTurn) {
    return null
  }

  const parsed = parseNarrative(currentTurn?.narrative || "")

  return (
    <div className="w-full grow max-w-3xl mx-auto fade-in">
      {tokenError && (
        <Alert variant="destructive" className="mb-8">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Action Failed</AlertTitle>
          <AlertDescription>{tokenError}</AlertDescription>
        </Alert>
      )}
      {parsed.map((part, idx) => {
        if (part.type === "original-reply") {
          if (!showOriginalReplies) return null
          return (
            <div key={`original-${idx}`} className="text-base italic text-primary-200 mb-6 whitespace-pre-line">
              Player Reply: {part.value}
            </div>
          )
        }
        if (part.type === "paragraph") {
          return (
            <p key={idx} className="text-sm sm:text-base md:text-lg whitespace-pre-line mb-4">
              {part.value}
            </p>
          )
        }
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
      })}

      {/* Show loading animation if an NPC is processing their turn */}
      {isNpcProcessing && !currentTurn?.isFinalEncounter && !disableSSE && (
        <div className="flex flex-col items-center gap-4 py-8">
          <LoadingAnimation />
          <p className="text-indigo-300 font-display">{currentCharacter?.name} is rolling…</p>
        </div>
      )}

      {/* Show reply form only if current character is a PC and not in historical mode */}
      {shouldShowReply && currentCharacter ? (
        <TurnNarrativeReply character={currentCharacter} submitReply={submitReply} />
      ) : allPCsDead ? (
        <div id="turn-indicator" className="flex flex-col gap-2 justify-center border mt-6 border-red-800/50 items-center p-8 rounded-lg bg-red-900/20">
          <h4 className="text-xl font-display text-red-400">Game Over</h4>
          <p className="italic text-red-300">All player characters have fallen</p>
          <Link href={`/settings/${settingId}/play`} className="mt-4">
            <Button variant="epic" size="sm" className="text-sm">
              Return to Setting
            </Button>
          </Link>
        </div>
      ) : !currentTurn?.isFinalEncounter ? (
        <div
          id="turn-indicator"
          className={cn(
            "flex flex-col gap-2 justify-center border mt-4 border-white/20 items-center p-8 rounded-lg",
            isPlayerTurnComplete ? "bg-neutral-900" : "bg-primary-800/70 border-dashed",
            isTurnComplete && "hidden"
          )}
        >
          <h4 className={cn("text-xl font-display", isPlayerTurnComplete ? "text-green-300/70" : "text-primary-200")}>{isPlayerTurnComplete ? "Your Turn is Complete" : "Waiting for Your Turn"}</h4>
          <div className="flex gap-3 mt-3 mb-4 scale-75">
            <span className={cn("w-2 h-2 rounded-full animate-pulse", isPlayerTurnComplete ? "bg-neutral-600" : "bg-primary-200")} style={{ animationDelay: "0ms", animationDuration: "2s" }} />
            <span className={cn("w-2 h-2 rounded-full animate-pulse", isPlayerTurnComplete ? "bg-neutral-600" : "bg-primary-200")} style={{ animationDelay: "200ms", animationDuration: "2s" }} />
            <span className={cn("w-2 h-2 rounded-full animate-pulse", isPlayerTurnComplete ? "bg-neutral-600" : "bg-primary-200")} style={{ animationDelay: "400ms", animationDuration: "2s" }} />
          </div>
          <p className="italic text-white/70">It is currently {currentCharacter?.name}&apos;s turn</p>
        </div>
      ) : null}

      {currentTurn?.isFinalEncounter && (
        <div className="flex flex-col items-center justify-center mt-8 md:mt-16 text-center px-2 py-4 md:py-6 border-double border-8 border-primary-800 rounded-lg">
          <FinalEncounterCompleteMessage isSignedIn={Boolean(isSignedIn)} settingId={settingId} adventurePlanId={adventurePlanId} nextAdventure={nextAdventure} />
        </div>
      )}
      {isTurnComplete && !currentTurn?.isFinalEncounter && (
        <div className="flex justify-center mt-8">
          <TurnAdvanceButton advancing={advancing} navigationMode={disableSSE} navigationLabel={disableSSE ? "Go to Next Turn" : undefined} onAdvance={handleAdvanceOrNavigate} />
        </div>
      )}
      {variant === "drawer" && <div ref={bottomRef} />}
    </div>
  )
}
