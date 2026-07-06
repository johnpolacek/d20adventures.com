"use client"

// Right-rail Storyview card (desktop): previews the opening of this turn's
// narrative in the display face, cropped with a fade, and opens the cinematic
// Storyview overlay. Sibling of the Map and Encounter rail cards; the floating
// bottom-left Storyview button remains the sub-xl entry point.

import { Clapperboard, Maximize2 } from "lucide-react"
import { useState } from "react"
import { useTurnContext } from "@/lib/context/TurnContext"
import { cn } from "@/lib/utils"
import StoryviewOverlay, { type StoryviewSnapshot } from "./storyview-overlay"

/** First substantial narrative line — enough for a cropped teaser. */
function previewText(narrative: string): string {
  const line = narrative
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 40)
  return line ?? narrative.slice(0, 240)
}

export default function StoryviewRailPanel({ className }: { className?: string }) {
  const { currentTurn } = useTurnContext()
  const [snapshot, setSnapshot] = useState<StoryviewSnapshot | null>(null)

  if (!currentTurn?.narrative) return null

  const open = () => {
    setSnapshot({
      turnId: currentTurn.id,
      narrative: currentTurn.narrative,
      characters: currentTurn.characters.map((c) => ({ id: c.id, name: c.name, image: c.image })),
    })
  }

  return (
    <>
      <div className={cn("overflow-hidden rounded-xl bg-black/40 ring ring-primary-700", className)}>
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <h3 className="truncate font-display text-sm font-bold text-violet-300">Storyview</h3>
          <button type="button" onClick={open} className="rounded p-1 text-stone-300 transition-colors hover:bg-white/10 hover:text-violet-200" aria-label="Play this turn in Storyview">
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
        <button type="button" onClick={open} className="group relative block w-full cursor-pointer bg-gradient-to-b from-[#14101f] via-[#0e0b16] to-[#08060d] text-left" aria-label="Play this turn in Storyview">
          <div className="relative max-h-28 overflow-hidden px-4 pt-3">
            <p className="font-display text-lg leading-snug text-stone-200 transition-colors group-hover:text-violet-100">{previewText(currentTurn.narrative)}</p>
            {/* crop fade into the caption row */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[#0a0810] to-transparent" />
          </div>
          <div className="flex items-center gap-2 px-4 pb-3 pt-1">
            <Clapperboard className="h-4 w-4 flex-none text-violet-400/90" />
            <p className="text-[11px] text-stone-400">Play this turn cinematically</p>
          </div>
        </button>
      </div>
      {snapshot && <StoryviewOverlay snapshot={snapshot} onClose={() => setSnapshot(null)} />}
    </>
  )
}
