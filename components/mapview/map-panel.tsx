"use client"

// Player-facing Mapview panel (wiki/plans/mapview.md): a floating "Map" toggle on the
// turn page that opens the encounter's battle-map backdrop. Rendered only when the
// encounter has a stored map; read-only, no game state.

import { useEffect, useState } from "react"
import { EncounterMap2D, type MapTokens } from "@/components/mapview/encounter-map-2d"
import type { Encounter2DMap } from "@/types/encounter-map-2d"

export function MapPanel({ map, encounterTitle, tokens }: { map: Encounter2DMap; encounterTitle?: string; tokens?: MapTokens }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-30 flex items-center gap-2 rounded-full border border-amber-800/60 bg-[#241f18]/90 px-4 py-2 text-sm font-semibold text-amber-200 shadow-lg backdrop-blur transition-colors hover:border-amber-500 hover:text-amber-100"
        aria-label="Open encounter map"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
          <path d="M9 4v14M15 6v14" />
        </svg>
        Map
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex flex-col bg-black/95">
          <header className="flex flex-none items-center justify-between px-5 py-3">
            <p className="font-display text-xl text-amber-200">{encounterTitle || "Encounter Map"}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-stone-700 px-4 py-1.5 text-sm text-stone-300 hover:border-amber-500 hover:text-amber-200"
              aria-label="Close map"
            >
              ✕ Close
            </button>
          </header>
          <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-4">
            <EncounterMap2D map={map} tokens={tokens} fit className="max-h-full" />
          </div>
          {map.summary && <p className="flex-none px-5 pb-4 text-center text-sm italic text-stone-400">{map.summary}</p>}
        </div>
      )}
    </>
  )
}
