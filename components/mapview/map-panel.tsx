"use client"

// Player-facing Mapview panel (wiki/plans/mapview.md): a floating "Map" toggle on the
// turn page that opens the encounter's battle-map backdrop. Rendered only when the
// encounter has a stored map; read-only, no game state.

import { useEffect, useState } from "react"
import Parchment from "@/components/graphics/background/Parchment"
import { EncounterMap2D, type MapTokens } from "@/components/mapview/encounter-map-2d"
import { textShadow } from "@/components/typography/styles"
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
          <header className="relative flex flex-none items-center justify-center px-5 py-5">
            {/* horizontal texture-line divider behind the title plaque */}
            <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-[1px] -translate-y-1/2 bg-[url('/images/app/art/texture-line.png')] bg-blend-lighten opacity-50" />
            {/* title plaque — matches the in-game encounter banner */}
            <h2 className="relative z-[11] rounded-sm border border-white/20 bg-gradient-to-t from-amber-950 via-amber-950 to-amber-800 px-6 py-1.5 text-center font-display text-lg font-bold contrast-[1.2] saturate-[.4] ring-4 ring-black sm:px-8 sm:py-2 sm:text-xl sm:ring-8">
              <Parchment />
              <span style={textShadow}>{encounterTitle || "Encounter Map"}</span>
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-5 top-1/2 inline-flex -translate-y-1/2 items-center gap-3 rounded-full border border-stone-600 bg-black/40 px-5 py-2 font-display text-lg text-stone-200 hover:border-amber-500 hover:text-amber-200"
              aria-label="Close map"
            >
              Close Map
              <span aria-hidden>✕</span>
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
