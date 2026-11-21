"use client"

// The stage's heads-up display, in the Kordavos prototype's language: the painted world full-screen under a soft vignette;
// the encounter's title top-left and icon buttons top-right; a perspective bar along the bottom, and at its right end
// the map with the name of the place under it. Everything else (the narration, the GM card, plates, bubbles, the journal, character cards) is
// layered in as children.

import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react"
import { Button, type ButtonProps } from "../button"
import { Presence } from "../presence"
import { Tip } from "../tooltip"
import { cn } from "../utils"

function useMedia(query: string) {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mq = matchMedia(query)
    const sync = () => setMatches(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [query])
  return matches
}
// Short landscape screens (phones on their side) get compact variants.
export const useCompact = () => useMedia("(max-height: 520px)")
// Screens too short for a tall card keep a dice roll's die beside its words.
export const useShort = () => useMedia("(max-height: 700px)")

/** Says of a keyed part of a list whether it joined after the first render, the same answer every time it is asked. */
export function useJoined() {
  const late = useRef(new Map<string | number, boolean>())
  const settled = useRef(false)
  useEffect(() => {
    settled.current = true
  }, [])
  return (key: string | number) => {
    const known = late.current.get(key)
    if (known !== undefined) return known
    late.current.set(key, settled.current)
    return settled.current
  }
}

export const eyebrow = "font-sans text-4xs font-medium uppercase tracking-label text-accent"
export const panel = "stage-grain rounded-md border border-foreground/25 bg-panel/95 shadow-[0_20px_50px_#0006,inset_0_1px_0_#f0d6b214,inset_0_0_60px_#0000004d] backdrop-blur-xl"

/** The HUD's small button: the outline button at its smallest. `active` marks the chosen one of a set, and `variant="primary"` the
 * action a panel waits on. */
export function Pill({ variant = "outline", size = "xs", ...rest }: ButtonProps) {
  return <Button variant={variant} size={size} type="button" {...rest} />
}

// A chevron, or two, thin and a little uneven, as if drawn by hand: the strokes bow and cross at the tip. It is as tall as
// the capitals beside it, raised from the middle of the line onto them (Cinzel sits high), and outlined in black like the
// epic button's lettering.
const outline = { filter: "drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000)" }
export function Chevron({ double = false, className }: { double?: boolean; className?: string }) {
  return (
    <svg
      viewBox={double ? "1.5 1.7 10.9 8.6" : "3.4 1.9 5.8 8.5"}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("h-[0.74em] shrink-0 -translate-y-[0.1em]", double ? "w-[0.94em]" : "w-[0.5em]", className)}
      style={outline}
    >
      <path d={double ? "M2.2 2.7Q5 3.7 6.4 6.2M6.1 5.8Q4.6 7.7 2.6 9.6M7.4 2.4Q10.3 3.6 11.7 6.1M11.4 5.7Q9.7 7.8 7.8 9.5" : "M4.1 2.6Q7 3.6 8.5 6.3M8.1 5.8Q6.6 7.6 4.6 9.7"} />
    </svg>
  )
}

export function IconButton({ label, active, children, ...rest }: Omit<ButtonProps, "variant" | "size"> & { label: string; active?: boolean }) {
  return (
    <Tip label={label}>
      <Button
        variant="plain"
        type="button"
        aria-label={label}
        className={cn(
          "stage-navy grid h-10 w-10 place-items-center rounded-full border transition-[filter,border-color,background-color,scale] duration-150 ease-snap active:scale-95 [&_svg]:h-4 [&_svg]:w-4",
          active ? "border-accent" : "border-foreground/25 hover:border-accent"
        )}
        {...rest}
      >
        {children}
      </Button>
    </Tip>
  )
}

export interface HudView {
  id: string
  label: string
}

export function StageHud({
  containerRef,
  title,
  location,
  views,
  activeView,
  onView,
  actions,
  hidden,
  compact,
  backdrop,
  map,
  children,
}: {
  containerRef: RefObject<HTMLDivElement | null>
  title: { eyebrow: string; text: string }
  // The name of the place, under the map.
  location: { name: string; status?: string; hidden?: boolean }
  views: HudView[]
  activeView: string | null
  onView: (id: string) => void
  actions?: ReactNode
  hidden?: boolean
  compact?: boolean
  // Shown where the stage would be when there is none, such as story view's painting.
  backdrop?: ReactNode
  // A small map at the right end of the perspective bar, standing a little over its rule. Without one a compass.
  map?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-screen overflow-clip bg-background font-sans text-foreground">
      {backdrop}
      <div ref={containerRef} className="absolute inset-0" />
      <div
        className={cn("pointer-events-none absolute inset-0 transition-opacity duration-200 ease-snap", hidden && "opacity-0")}
        style={{ background: "linear-gradient(180deg,rgba(28,18,12,.42),transparent 18%,transparent 58%,rgba(22,13,9,.84))" }}
      />
      <div className={cn("pointer-events-none absolute inset-0 transition-opacity duration-200 ease-snap [&>*]:pointer-events-auto", hidden && "opacity-0 [&>*]:pointer-events-none")}>
        <header className={cn("absolute flex items-center justify-between", compact ? "top-3 right-4 left-4" : "top-7 right-10 left-10")}>
          <div className="flex min-w-0 items-center gap-3.5">
            <svg viewBox="0 0 50 58" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.2" className={cn("flex-none text-accent", compact ? "h-8 w-7" : "h-12 w-10")}>
              <path d="M25 2 46 14v28L25 56 4 42V14Z" />
              <path d="M12 39V20h8v19m10 0V20h8v19M20 39V27l5-6 5 6v12M9 20h14m4 0h14M17 16v-4m16 4v-4M25 6v8M20 10h10M9 43h32" />
            </svg>
            {/* Kept clear of the turn order centred at the top. */}
            <div style={{ maxWidth: compact ? "calc(50vw - var(--turn-order-half, 100px) - 58px)" : "calc(50vw - var(--turn-order-half, 134px) - 110px)" }}>
              <div className={cn(eyebrow, compact && "text-4xs")}>{title.eyebrow}</div>
              <h1 className={cn("font-display leading-[1.12] [text-shadow:0_2px_18px_#1a0e08c0]", compact ? "mt-0.5 text-sm" : "mt-1.5 text-[clamp(20px,2vw,28px)]")}>{title.text}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2.5">{actions}</div>
        </header>

        {/* The rule over the perspective bar runs edge to edge. */}
        <Presence show={views.length > 0} motion="fade" asChild>
          <div aria-hidden="true" className={cn("stage-rule pointer-events-none absolute inset-x-0 h-px opacity-60", compact ? "bottom-11" : "bottom-24")} />
        </Presence>
        {!compact && (
          <aside className={cn("absolute right-10 bottom-2.5 flex flex-col items-center gap-1.5 transition-opacity duration-200 ease-snap", location.hidden && "pointer-events-none opacity-0")}>
            {map ?? (
              <svg viewBox="0 0 60 60" aria-hidden="true" className="h-12 w-12 fill-none stroke-accent" strokeWidth=".8">
                <circle cx="30" cy="30" r="23" opacity=".4" />
                <path d="m30 1 4 25 25 4-25 4-4 25-4-25-25-4 25-4Z" />
                <circle cx="30" cy="30" r="4" />
              </svg>
            )}
            <div className="max-w-[200px] truncate text-4xs tracking-label text-soft-foreground uppercase [text-shadow:0_1px_6px_#000]">{location.name}</div>
            <Presence show={Boolean(location.status)} motion="fade" asChild>
              <div className="text-4xs tracking-wide text-[#e8c898] [text-shadow:0_1px_6px_#000]">{location.status}</div>
            </Presence>
          </aside>
        )}

        <Presence show={views.length > 0} motion="rise" asChild>
          <nav className={cn("absolute flex items-center justify-between gap-6", compact ? "right-4 bottom-0 left-4 h-11" : "right-10 bottom-0 left-10 h-24")} aria-label="Perspectives">
            {!compact && <div className="hidden flex-1 lg:block" />}
            <div className="flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none]">
              {views.map((v, i) => (
                <Button
                  variant="plain"
                  key={v.id}
                  type="button"
                  aria-pressed={activeView === v.id}
                  onClick={() => onView(v.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-2.5 rounded-hud border whitespace-nowrap transition-[color,background-color,border-color,scale] duration-150 ease-snap active:scale-[0.97]",
                    compact ? "px-2 py-1 text-4xs" : "px-4 py-3 text-3xs",
                    activeView === v.id ? "stage-navy border-primary/50 text-[#fbe7c9]" : "border-transparent text-[#bfc5b9] hover:bg-white/5 hover:text-white"
                  )}
                >
                  <small className={cn("text-4xs", activeView === v.id ? "text-accent" : "text-[#a6a58c]")}>{String(i + 1).padStart(2, "0")}</small>
                  {v.label}
                </Button>
              ))}
            </div>
            {/* Room for the map and the place's name at the right end. */}
            {!compact && <div className={cn("flex-1", map ? "min-w-[216px] shrink-0" : "hidden lg:block")} />}
          </nav>
        </Presence>
      </div>
      {children}
    </div>
  )
}
