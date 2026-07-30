"use client"

import { AlertTriangle, X } from "lucide-react"
import { useEffect } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import LoadingAnimation from "@/components/ui/loading-animation"
import { useTokens } from "@/lib/context/TokenContext"
import { useTurnContext } from "@/lib/context/TurnContext"
import type { TurnCharacter } from "@/types/adventure"
import StoryviewControls from "./storyview-controls"
import StoryviewPausedNotice from "./storyview-paused-notice"
import StoryviewSlideView from "./storyview-slide"
import { useStoryviewPlayer } from "./use-storyview-player"

export interface StoryviewSnapshot {
  turnId: string
  narrative: string
  characters: Array<Pick<TurnCharacter, "id" | "name" | "image">>
}

export default function StoryviewOverlay({ snapshot, onClose }: { snapshot: StoryviewSnapshot; onClose: () => void }) {
  const { refreshTokens } = useTokens()
  const { currentTurn } = useTurnContext()
  const player = useStoryviewPlayer({
    turnId: snapshot.turnId,
    narrative: snapshot.narrative,
    open: true,
    onGenerated: () => {
      refreshTokens().catch(() => {})
    },
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  // Start playback automatically once audio is ready (the click that opened the
  // overlay is the user gesture that unlocks audio).
  useEffect(() => {
    if (player.status === "ready" && !player.playing && !player.finished && player.slideIndex === 0 && player.segmentIndex === 0) {
      player.play()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.status])

  const newTurnAvailable = currentTurn && currentTurn.id !== snapshot.turnId

  const getSpeaker = (speakerId: string) => {
    const character = snapshot.characters.find((c) => c.id === speakerId)
    return { name: character?.name, image: character?.image }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-black fade-in">
      <div className="flex items-center justify-between px-6 py-4">
        <p className="font-display text-sm tracking-widest text-primary-200/80 uppercase">Storyview</p>
        <div className="flex items-center gap-3">
          {newTurnAvailable && (
            <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>
              A new turn has begun
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close Storyview">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-y-auto px-6 py-4">
        {player.status === "loading" && <LoadingAnimation />}
        {player.status === "generating" && (
          <div className="flex flex-col items-center gap-4">
            <LoadingAnimation />
            <p className="font-display text-indigo-300">Preparing narration…</p>
          </div>
        )}
        {(player.status === "error" || player.status === "insufficient-tokens") && (
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <AlertTriangle className="h-8 w-8 text-red-400" />
            <p className="text-white/85">{player.errorMessage ?? "Narration failed."}</p>
            {player.status === "error" && (
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
            )}
            {player.status === "insufficient-tokens" && (
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
            )}
          </div>
        )}
        {player.status === "ready" && player.currentSlide && <StoryviewSlideView slide={player.currentSlide} segmentIndex={player.segmentIndex} getSpeaker={getSpeaker} />}
      </div>

      {player.storyviewAuto?.enabled && player.storyviewAuto.paused && (
        <div className="flex justify-center px-6 pb-2">
          <StoryviewPausedNotice paused={player.storyviewAuto.paused} />
        </div>
      )}
      {player.status === "ready" && (
        <div className="px-6 pb-8">
          <StoryviewControls playing={player.playing} finished={player.finished} slideCount={player.slides.length} slideIndex={player.slideIndex} speed={player.speed} onPlay={player.play} onPause={player.pause} onPrev={player.prev} onNext={player.next} onCycleSpeed={player.cycleSpeed} />
        </div>
      )}
    </div>,
    document.body
  )
}
