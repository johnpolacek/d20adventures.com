"use client"

// Right-rail Storyview card (desktop): previews the opening of this turn's
// narrative in the display face, cropped with a fade, and opens the cinematic
// Storyview overlay. Sibling of the Map and Encounter rail cards; the floating
// bottom-left Storyview button remains the sub-xl entry point.
//
// When auto-narration is on, the card also shows generation status (ready /
// preparing / paused) fed by the turn-audio manifest, and the adventure owner
// gets the toggle.

import { useUser } from "@clerk/nextjs"
import { Clapperboard, Loader2, Maximize2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { setStoryviewAutoEnabled } from "@/app/_actions/storyview"
import { Switch } from "@/components/ui/switch"
import { useAdventure } from "@/lib/context/AdventureContext"
import { useTurnContext } from "@/lib/context/TurnContext"
import { cn } from "@/lib/utils"
import type { Id } from "@/convex/_generated/dataModel"
import type { TurnAudioManifestResponse } from "@/types/turn-audio"
import StoryviewOverlay, { type StoryviewSnapshot } from "./storyview-overlay"
import StoryviewPausedNotice from "./storyview-paused-notice"

const STATUS_REFRESH_DEBOUNCE_MS = 2000

/** First substantial narrative line — enough for a cropped teaser. */
function previewText(narrative: string): string {
  const line = narrative
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 40)
  return line ?? narrative.slice(0, 240)
}

export default function StoryviewRailPanel({ className }: { className?: string }) {
  const { adventure } = useAdventure()
  const { currentTurn } = useTurnContext()
  const { user } = useUser()
  const [snapshot, setSnapshot] = useState<StoryviewSnapshot | null>(null)
  const [autoEnabled, setAutoEnabled] = useState(adventure.storyview?.autoEnabled ?? false)
  const [manifest, setManifest] = useState<TurnAudioManifestResponse | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const firstFetchRef = useRef(true)

  const isOwner = !!user?.id && adventure.ownerId === user.id
  const turnId = currentTurn?.id
  const narrative = currentTurn?.narrative

  // Poll the manifest when the turn or its narrative settles (SSE turn updates
  // re-run this), debounced so mid-turn patches don't stack requests. This is
  // also how non-owners learn about pause state.
  useEffect(() => {
    if (!turnId || !narrative) return
    let aborted = false
    const delay = firstFetchRef.current ? 0 : STATUS_REFRESH_DEBOUNCE_MS
    firstFetchRef.current = false

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/adventure/turn-audio/${turnId}`)
        if (!response.ok) return
        const data = (await response.json()) as TurnAudioManifestResponse
        if (!aborted) {
          setManifest(data)
          if (data.storyviewAuto) setAutoEnabled(data.storyviewAuto.enabled)
        }
      } catch {
        // Status row is best-effort; the card works without it.
      }
    }, delay)

    return () => {
      aborted = true
      clearTimeout(timer)
    }
  }, [turnId, narrative, refreshTick])

  if (!currentTurn?.narrative) return null

  const open = () => {
    setSnapshot({
      turnId: currentTurn.id,
      narrative: currentTurn.narrative,
      characters: currentTurn.characters.map((c) => ({ id: c.id, name: c.name, image: c.image })),
    })
  }

  const toggleAuto = async (enabled: boolean) => {
    setAutoEnabled(enabled)
    try {
      await setStoryviewAutoEnabled(adventure.id as Id<"adventures">, enabled)
      if (!enabled) setManifest((current) => (current?.storyviewAuto ? { ...current, storyviewAuto: { enabled: false } } : current))
      // Enabling warms the current turn server-side; refetch shortly after so
      // the status row picks up the result without waiting for a turn change.
      if (enabled) setTimeout(() => setRefreshTick((tick) => tick + 1), 4000)
    } catch (error) {
      console.error("Failed to update Storyview auto-narration:", error)
      setAutoEnabled(!enabled)
    }
  }

  const paused = manifest?.storyviewAuto?.enabled ? manifest.storyviewAuto.paused : undefined
  const fresh = manifest && !manifest.stale
  const showReady = autoEnabled && !paused && fresh && manifest.status === "ready"
  const showPreparing = autoEnabled && !paused && fresh && manifest.status === "generating"

  return (
    <>
      <div className={cn("overflow-hidden rounded-xl bg-black/40 ring ring-primary-700", className)}>
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <h3 className="truncate font-display text-sm font-bold text-violet-300">Storyview</h3>
          <div className="flex items-center gap-2">
            {isOwner && (
              <label className="flex cursor-pointer items-center gap-1.5" title="Automatically narrate each turn; the token cost is split among all players.">
                <span className="text-[10px] uppercase tracking-wide text-stone-400">Auto</span>
                <Switch checked={autoEnabled} onCheckedChange={toggleAuto} aria-label="Toggle auto-narration" />
              </label>
            )}
            <button type="button" onClick={open} className="rounded p-1 text-stone-300 transition-colors hover:bg-white/10 hover:text-violet-200" aria-label="Play this turn in Storyview">
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        <button type="button" onClick={open} className="group relative block w-full cursor-pointer bg-gradient-to-b from-[#14101f] via-[#0e0b16] to-[#08060d] text-left" aria-label="Play this turn in Storyview">
          <div className="relative max-h-28 overflow-hidden px-4 pt-3">
            <p className="font-display text-lg leading-snug text-stone-200/30 transition-colors group-hover:text-violet-100/30">{previewText(currentTurn.narrative)}</p>
            {/* crop fade into the caption row */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[#0a0810] to-transparent" />
          </div>
          <div className="flex items-center gap-2 px-4 pb-3 pt-1">
            <Clapperboard className="h-4 w-4 flex-none text-violet-400/90" />
            <p className="text-[11px] text-stone-400">Play this turn cinematically</p>
          </div>
        </button>
        {(paused || showReady || showPreparing) && (
          <div className="border-t border-white/5 px-4 py-2">
            {paused && <StoryviewPausedNotice paused={paused} />}
            {showReady && (
              <p className="text-xs text-emerald-300/80">
                <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 align-middle" />
                Narration ready
              </p>
            )}
            {showPreparing && (
              <p className="flex items-center gap-1.5 text-xs text-indigo-300/80">
                <Loader2 className="h-3 w-3 animate-spin" />
                Preparing narration…
              </p>
            )}
          </div>
        )}
      </div>
      {snapshot && <StoryviewOverlay snapshot={snapshot} onClose={() => setSnapshot(null)} />}
    </>
  )
}
