"use client"

import type { StoryBeat } from "@d20/gm-core/story/beats"
import { AlertTriangle, X } from "lucide-react"
import { type AnimationEvent, type CSSProperties, useCallback, useEffect } from "react"
import { createPortal } from "react-dom"
import { Button } from "@d20/ui/button"
import LoadingAnimation from "@d20/ui/loading-animation"
import { Presence, Swap } from "@d20/ui/presence"
import { useTokens } from "@/lib/context/TokenContext"
import { useTurnContext } from "@/lib/context/TurnContext"
import { cn } from "@/lib/utils"
import type { TurnCharacter } from "@/types/adventure"
import StoryviewControls from "./storyview-controls"
import StoryviewPausedNotice from "./storyview-paused-notice"
import StoryviewSlideView from "./storyview-slide"
import { useStoryviewPlayer } from "./use-storyview-player"

export interface StoryviewSnapshot {
  turnId: string
  story: StoryBeat[]
  characters: Array<Pick<TurnCharacter, "id" | "name" | "image">>
}

// `className`, `style` and `onAnimationEnd` go to the overlay itself, so a Presence around it can animate it in and out.
export default function StoryviewOverlay({
  snapshot,
  onClose,
  className,
  style,
  onAnimationEnd,
}: {
  snapshot: StoryviewSnapshot
  onClose: () => void
  className?: string
  style?: CSSProperties
  onAnimationEnd?: (event: AnimationEvent<HTMLElement>) => void
}) {
  const { refreshTokens } = useTokens()
  const { currentTurn } = useTurnContext()
  const player = useStoryviewPlayer({
    turnId: snapshot.turnId,
    story: snapshot.story,
    open: true,
    onGenerated: () => {
      refreshTokens().catch(() => {})
    },
  })

  // The narration stops at once. The overlay itself stays a moment longer to fade out.
  const { pause } = player
  const close = useCallback(() => {
    pause()
    onClose()
  }, [pause, onClose])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [close])

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
    <div className={cn("fixed inset-0 z-screen flex flex-col bg-black", className)} style={style} onAnimationEnd={onAnimationEnd}>
      <div className="flex items-center justify-between px-6 py-4">
        <p className="font-display text-sm tracking-widest text-primary-200/80 uppercase">Storyview</p>
        <div className="flex items-center gap-3">
          <Presence show={Boolean(newTurnAvailable)} motion="pop" asChild>
            <Button variant="outline" size="sm" className="text-xs" onClick={close}>
              A new turn has begun
            </Button>
          </Presence>
          <Button variant="ghost" size="icon" onClick={close} aria-label="Close Storyview">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-y-auto px-6 py-4">
        <Swap id={player.status === "ready" ? `slide-${player.slideIndex}` : player.status} className="flex w-full items-center justify-center">
          {player.status === "loading" && <LoadingAnimation />}
          {player.status === "generating" && (
            <div className="flex flex-col items-center gap-4">
              <LoadingAnimation />
              <p className="font-display text-primary-100">Preparing narration…</p>
            </div>
          )}
          {(player.status === "error" || player.status === "insufficient-tokens") && (
            <div className="flex max-w-md flex-col items-center gap-4 text-center">
              <AlertTriangle className="h-8 w-8 text-red-400" />
              <p className="text-white/85">{player.errorMessage ?? "Narration failed."}</p>
              {player.status === "error" && (
                <Button variant="outline" size="sm" onClick={close}>
                  Close
                </Button>
              )}
              {player.status === "insufficient-tokens" && (
                <Button variant="outline" size="sm" onClick={close}>
                  Close
                </Button>
              )}
            </div>
          )}
          {player.status === "ready" && player.currentSlide && (
            <StoryviewSlideView
              slide={player.currentSlide}
              segmentIndex={player.segmentIndex}
              getSpeaker={getSpeaker}
              // The turn's own characters while it is the current one, for how a dying hero stands. Their names otherwise.
              characters={currentTurn?.id === snapshot.turnId ? currentTurn.characters : snapshot.characters}
            />
          )}
        </Swap>
      </div>

      <Presence show={Boolean(player.storyviewAuto?.enabled && player.storyviewAuto.paused)} motion="fade" asChild>
        {player.storyviewAuto?.enabled && player.storyviewAuto.paused && (
          <div className="flex justify-center px-6 pb-2">
            <StoryviewPausedNotice paused={player.storyviewAuto.paused} />
          </div>
        )}
      </Presence>
      <Presence show={player.status === "ready"} asChild>
        <div className="px-6 pb-8">
          <StoryviewControls
            playing={player.playing}
            finished={player.finished}
            slideCount={player.slides.length}
            slideIndex={player.slideIndex}
            speed={player.speed}
            onPlay={player.play}
            onPause={player.pause}
            onPrev={player.prev}
            onNext={player.next}
            onCycleSpeed={player.cycleSpeed}
          />
        </div>
      </Presence>
    </div>,
    document.body
  )
}
