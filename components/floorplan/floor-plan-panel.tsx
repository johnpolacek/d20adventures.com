"use client"

// The floor plan's two entry points on the turn page, in the grid map panel's chrome: FloorPlanButton is the floating
// "Map" button below xl, FloorPlanRailPanel the card docked in the right rail. Both expand to the same fullscreen view.

import { Maximize2 } from "lucide-react"
import { type AnimationEvent, type CSSProperties, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import Parchment from "@d20/ui/graphics/parchment"
import { textShadow } from "@d20/ui/typography/styles"
import { Button } from "@d20/ui/button"
import { Presence } from "@d20/ui/presence"
import { cn } from "@/lib/utils"
import { FloorPlan } from "./floor-plan"
import type { FloorToken, FloorView } from "./view"

type PlanProps = { floor: FloorView; characters: readonly FloorToken[]; activeId?: string; title?: string }

// `className`, `style` and `onAnimationEnd` go to the overlay itself, so a Presence around it can animate it in and out.
function FloorPlanOverlay({
  floor,
  characters,
  activeId,
  title,
  onClose,
  className,
  style,
  onAnimationEnd,
}: PlanProps & { onClose: () => void; className?: string; style?: CSSProperties; onAnimationEnd?: (event: AnimationEvent<HTMLElement>) => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  // Portalled to <body> above the turn page's fixed chrome, as the grid map's overlay is.
  return createPortal(
    <div className={cn("fixed inset-0 z-[60] flex flex-col bg-black/95", className)} style={style} onAnimationEnd={onAnimationEnd}>
      <header className="relative flex flex-none items-center justify-center px-5 py-5">
        <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-[1px] -translate-y-1/2 bg-[url('/images/app/art/texture-line.png')] bg-blend-lighten opacity-50" />
        <h2 className="relative z-[11] rounded-sm border border-white/20 bg-gradient-to-t from-amber-950 via-amber-950 to-amber-800 px-6 py-1.5 text-center font-display text-lg font-bold contrast-[1.2] saturate-[.4] ring-4 ring-black sm:px-8 sm:py-2 sm:text-xl sm:ring-8">
          <Parchment />
          <span style={textShadow}>{title || floor.location || floor.title}</span>
        </h2>
        <Button
          variant="plain"
          type="button"
          onClick={onClose}
          className="absolute right-4 top-1/2 inline-flex -translate-y-1/2 items-center gap-3 rounded-full border border-stone-600 bg-black px-3 py-2 font-display text-lg text-stone-200 transition-[color,border-color,scale] duration-150 ease-snap hover:border-amber-500 hover:text-amber-200 active:scale-95 sm:right-10 sm:px-5"
          aria-label="Close map"
        >
          <span className="hidden sm:inline">Close Map</span>
          <span aria-hidden>✕</span>
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-4">
        <FloorPlan floor={floor} characters={characters} activeId={activeId} fit className="max-h-full" />
      </div>
    </div>,
    document.body
  )
}

/** Floating "Map" button: the entry point below xl. */
export function FloorPlanButton(props: PlanProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className="bg-[#3d3115] ring-4 ring-[#5f4e24] hover:bg-[#3d3115]">
        <svg viewBox="0 0 24 24" className="mr-1 h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
          <path d="M9 4v14M15 6v14" />
        </svg>
        Map
      </Button>
      <Presence show={open} motion="fade" asChild>
        <FloorPlanOverlay {...props} onClose={() => setOpen(false)} />
      </Presence>
    </>
  )
}

/** Right-rail card: the desktop entry point, docked with the chat. */
export function FloorPlanRailPanel({ className, ...props }: PlanProps & { className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className={cn("overflow-hidden rounded-xl bg-black/40 ring ring-primary-700", className)}>
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <h3 className="truncate font-display text-sm font-bold text-amber-300">{props.title || props.floor.location || props.floor.title}</h3>
          <Button variant="plain" type="button" onClick={() => setOpen(true)} className="rounded p-1 text-stone-300 transition-[color,background-color,scale] duration-150 ease-snap hover:bg-white/10 hover:text-amber-200 active:scale-90" aria-label="Expand map">
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="plain" type="button" onClick={() => setOpen(true)} className="group block w-full cursor-zoom-in transition-opacity duration-100 active:opacity-80" aria-label="Expand encounter map">
          <FloorPlan floor={props.floor} characters={props.characters} activeId={props.activeId} className="transition-[filter] duration-150 group-hover:brightness-110" />
        </Button>
      </div>
      <Presence show={open} motion="fade" asChild>
        <FloorPlanOverlay {...props} onClose={() => setOpen(false)} />
      </Presence>
    </>
  )
}
