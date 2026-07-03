"use client"

// Player-facing Mapview panels (wiki/plans/mapview.md). Two entry points share the
// fullscreen overlay: MapPanel is the floating "Map" button (mobile), MapRailPanel is
// the inline mini map docked in the turn page's right rail (desktop). Rendered only
// when the encounter has a stored map; read-only, no game state.

import { Maximize2 } from "lucide-react"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import Parchment from "@/components/graphics/background/Parchment"
import { EncounterMap2D, type MapTokens } from "@/components/mapview/encounter-map-2d"
import { textShadow } from "@/components/typography/styles"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Encounter2DMap } from "@/types/encounter-map-2d"

function MapOverlay({ map, title, tokens, onClose }: { map: Encounter2DMap; title?: string; tokens?: MapTokens; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  // Portal to <body> so the fullscreen overlay escapes any ancestor stacking context
  // (the right rail is position:sticky, which would otherwise trap it under the header).
  return createPortal(
    <div className="fixed inset-0 z-40 flex flex-col bg-black/95">
      <header className="relative flex flex-none items-center justify-center px-5 py-5">
        {/* horizontal texture-line divider behind the title plaque */}
        <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-[1px] -translate-y-1/2 bg-[url('/images/app/art/texture-line.png')] bg-blend-lighten opacity-50" />
        {/* title plaque — matches the in-game encounter banner */}
        <h2 className="relative z-[11] rounded-sm border border-white/20 bg-gradient-to-t from-amber-950 via-amber-950 to-amber-800 px-6 py-1.5 text-center font-display text-lg font-bold contrast-[1.2] saturate-[.4] ring-4 ring-black sm:px-8 sm:py-2 sm:text-xl sm:ring-8">
          <Parchment />
          <span style={textShadow}>{title || "Encounter Map"}</span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-10 top-1/2 inline-flex -translate-y-1/2 items-center gap-3 rounded-full border border-stone-600 bg-black px-5 py-2 font-display text-lg text-stone-200 hover:border-amber-500 hover:text-amber-200"
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
    </div>,
    document.body
  )
}

export function MapPanel({ map, title, tokens }: { map: Encounter2DMap; title?: string; tokens?: MapTokens }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Muted amber at the same value/saturation as Game Chat's primary-700/600 indigo,
          so the two buttons read as equal priority. */}
      <Button size="sm" onClick={() => setOpen(true)} className="bg-[#3d3115] ring-4 ring-[#5f4e24] hover:bg-[#3d3115] hover:scale-105 transition-all duration-300" aria-label="Open encounter map">
        <svg viewBox="0 0 24 24" className="mr-1 h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
          <path d="M9 4v14M15 6v14" />
        </svg>
        Map
      </Button>

      {open && <MapOverlay map={map} title={title} tokens={tokens} onClose={() => setOpen(false)} />}
    </>
  )
}

export function MapRailPanel({ map, title, tokens, className }: { map: Encounter2DMap; title?: string; tokens?: MapTokens; className?: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className={cn("overflow-hidden rounded-xl bg-black/40 ring ring-primary-700", className)}>
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <h3 className="truncate font-display text-sm font-bold text-amber-300">{title || "Encounter Map"}</h3>
          <button type="button" onClick={() => setOpen(true)} className="rounded p-1 text-stone-300 transition-colors hover:bg-white/10 hover:text-amber-200" aria-label="Expand map">
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="group block w-full cursor-zoom-in" aria-label="Expand encounter map">
          <EncounterMap2D map={map} tokens={tokens} className="rounded-none border-0 shadow-none transition-[filter] duration-300 group-hover:brightness-110" />
        </button>
      </div>

      {open && <MapOverlay map={map} title={title} tokens={tokens} onClose={() => setOpen(false)} />}
    </>
  )
}
