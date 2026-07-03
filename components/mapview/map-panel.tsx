"use client"

// Player-facing Mapview panel (wiki/plans/mapview.md): a floating "Map" toggle on the
// turn page that opens the encounter's battle-map backdrop. Rendered only when the
// encounter has a stored map; read-only, no game state.

import { useEffect, useState } from "react"
import { EncounterMap2D, type MapTokens } from "@/components/mapview/encounter-map-2d"
import { Button } from "@/components/ui/button"
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
      {/* Muted amber at the same value/saturation as Game Chat's primary-700/600 indigo,
          so the two buttons read as equal priority. */}
      <Button size="sm" onClick={() => setOpen(true)} className="bg-[#5a4a26] ring-4 ring-[#7d6635] hover:bg-[#5a4a26] hover:scale-105 transition-all duration-300" aria-label="Open encounter map">
        <svg viewBox="0 0 24 24" className="mr-1 h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
          <path d="M9 4v14M15 6v14" />
        </svg>
        Map
      </Button>

      {open && (
        <div className="fixed inset-0 z-40 flex flex-col bg-black/95">
          <header className="relative flex flex-none items-center justify-center px-5 py-3">
            <p className="font-display text-2xl text-amber-200 text-center">{encounterTitle || "Encounter Map"}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-5 top-1/2 -translate-y-1/2 rounded-full border border-stone-600 px-5 py-2 font-display text-lg text-stone-200 hover:border-amber-500 hover:text-amber-200"
              aria-label="Close map"
            >
              ✕ Close Map
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
