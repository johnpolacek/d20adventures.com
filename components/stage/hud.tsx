"use client"

// The stage's heads-up display, in the Kordavos prototype's language: the painted world full-screen under a soft vignette;
// the encounter's title top-left and icon buttons top-right; where the party stands bottom-right; and a perspective bar
// along the bottom. Everything else (the narration, the GM card, plates, bubbles, the journal, character cards) is
// layered in as children.

import { type ReactNode, type RefObject, useEffect, useState } from "react"
import { cn } from "@/lib/utils"

// Short landscape screens (phones on their side) get compact variants.
export function useCompact() {
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const mq = matchMedia("(max-height: 520px)")
    const sync = () => setCompact(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])
  return compact
}

export const eyebrow = "font-sans text-[9px] font-medium uppercase tracking-[0.26em] text-stage-gold"
export const panel = "stage-grain rounded-md border border-stage-line/25 bg-stage-panel/95 shadow-[0_20px_50px_#0006,inset_0_1px_0_#f0d6b214,inset_0_0_60px_#0000004d] backdrop-blur-xl"

export function Pill({ active, className, children, ...rest }: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-[3px] border px-3 py-2 font-sans text-[11px] tracking-wide transition-[filter,border-color] disabled:cursor-default disabled:opacity-40",
        active ? "stage-brass" : "stage-leather border-stage-line/25 text-stage-cream hover:border-stage-gold/60",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function IconButton({ label, active, children, ...rest }: React.ComponentProps<"button"> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "stage-leather grid h-10 w-10 place-items-center rounded-full border transition-[filter,border-color] [&_svg]:h-4 [&_svg]:w-4",
        active ? "border-stage-gold" : "border-stage-line/25 hover:border-stage-gold"
      )}
      {...rest}
    >
      {children}
    </button>
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
  children,
}: {
  containerRef: RefObject<HTMLDivElement | null>
  title: { eyebrow: string; text: string }
  location: { eyebrow: string; title: string; status?: string; hidden?: boolean }
  views: HudView[]
  activeView: string | null
  onView: (id: string) => void
  actions?: ReactNode
  hidden?: boolean
  compact?: boolean
  children?: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-[100] overflow-clip bg-stage-ink font-sans text-stage-cream">
      <div ref={containerRef} className="absolute inset-0" />
      <div
        className={cn("pointer-events-none absolute inset-0 transition-opacity duration-500", hidden && "opacity-0")}
        style={{ background: "linear-gradient(180deg,rgba(28,18,12,.42),transparent 18%,transparent 58%,rgba(22,13,9,.84))" }}
      />
      <div className={cn("pointer-events-none absolute inset-0 transition-opacity duration-500 [&>*]:pointer-events-auto", hidden && "opacity-0 [&>*]:pointer-events-none")}>
        <header className={cn("absolute flex items-center justify-between", compact ? "top-3 right-4 left-4" : "top-7 right-10 left-10")}>
          <div className="flex min-w-0 items-center gap-3.5">
            <svg viewBox="0 0 50 58" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.2" className={cn("flex-none text-stage-gold", compact ? "h-8 w-7" : "h-12 w-10")}>
              <path d="M25 2 46 14v28L25 56 4 42V14Z" />
              <path d="M12 39V20h8v19m10 0V20h8v19M20 39V27l5-6 5 6v12M9 20h14m4 0h14M17 16v-4m16 4v-4M25 6v8M20 10h10M9 43h32" />
            </svg>
            {/* Kept clear of the turn order centred at the top. */}
            <div className={compact ? "max-w-[calc(50vw-158px)]" : "max-w-[calc(50vw-244px)]"}>
              <div className={cn(eyebrow, compact && "text-[8px]")}>{title.eyebrow}</div>
              <h1 className={cn("font-display leading-[1.12] [text-shadow:0_2px_18px_#1a0e08c0]", compact ? "mt-0.5 text-[15px]" : "mt-1.5 text-[clamp(20px,2vw,28px)]")}>{title.text}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2.5">{actions}</div>
        </header>

        <aside className={cn("pointer-events-none absolute text-right transition-opacity duration-300", compact ? "hidden" : "right-10 bottom-[130px]", location.hidden && "opacity-0")}>
          <svg viewBox="0 0 60 60" aria-hidden="true" className="mb-3 ml-auto h-12 w-12 fill-none stroke-stage-gold" strokeWidth=".8">
            <circle cx="30" cy="30" r="23" opacity=".4" />
            <path d="m30 1 4 25 25 4-25 4-4 25-4-25-25-4 25-4Z" />
            <circle cx="30" cy="30" r="4" />
          </svg>
          <div className="text-[8px] tracking-[0.25em] text-stage-sage uppercase">{location.eyebrow}</div>
          <p className="mt-2 font-serif text-[17px] text-stage-sage">{location.title}</p>
          {location.status && <div className="mt-2 text-[10px] tracking-wide text-[#e8c898]">{location.status}</div>}
        </aside>

        {/* The rule over the perspective bar runs edge to edge. */}
        {views.length > 0 && (
          <>
            <div aria-hidden="true" className={cn("stage-rule pointer-events-none absolute inset-x-0 h-px opacity-60", compact ? "bottom-11" : "bottom-24")} />
            <nav className={cn("absolute flex items-center justify-between gap-6", compact ? "right-4 bottom-0 left-4 h-11" : "right-10 bottom-0 left-10 h-24")} aria-label="Perspectives">
              {!compact && <span className="hidden shrink-0 text-[8px] tracking-[0.25em] text-[#c0c9be] xl:block">CHOOSE A PERSPECTIVE</span>}
              <div className="flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none]">
                {views.map((v, i) => (
                  <button
                    key={v.id}
                    type="button"
                    aria-pressed={activeView === v.id}
                    onClick={() => onView(v.id)}
                    className={cn(
                      "flex shrink-0 items-center gap-2.5 rounded-[3px] border whitespace-nowrap transition-colors",
                      compact ? "px-2 py-1 text-[10px]" : "px-4 py-3 text-[11px]",
                      activeView === v.id ? "stage-leather border-stage-brass/50 text-[#fbe7c9]" : "border-transparent text-[#bfc5b9] hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <small className={cn("text-[8px]", activeView === v.id ? "text-stage-gold" : "text-[#a6a58c]")}>{String(i + 1).padStart(2, "0")}</small>
                    {v.label}
                  </button>
                ))}
              </div>
              {!compact && <span className="hidden shrink-0 text-[10px] text-[#b9c2b8] lg:block">Drag to look · Scroll to zoom</span>}
            </nav>
          </>
        )}
      </div>
      {children}
    </div>
  )
}
