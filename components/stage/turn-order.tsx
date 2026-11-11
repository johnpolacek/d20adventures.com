"use client"

// Turn order across the top of the stage, as in Baldur's Gate 3: everyone in initiative order, whoever the story is
// about larger and framed in gold. Whoever's turn the game waits on is lit in gold and carries a small brass marker,
// also while the story of an earlier turn is still read. Clicking a portrait takes the camera to that character. A bar
// under each portrait is that character's health, and a hero's portrait carries the number.

import { useLayoutEffect, useRef } from "react"
import { cn } from "@/lib/utils"

export interface OrderEntry {
  id: string
  name: string
  portrait?: string
  npc?: boolean
  // 0 to 100. Left out, the portrait has no bar.
  health?: number
  status?: string
}

const healthColor = (health: number) => (health <= 25 ? "#c8452f" : health <= 50 ? "#d98a3a" : health <= 75 ? "#d9b44a" : "#7fb069")

export function TurnOrder({
  order,
  activeId,
  turnId = null,
  label,
  compact = false,
  onPick,
}: {
  order: OrderEntry[]
  activeId: string | null
  // Whose turn the game is on.
  turnId?: string | null
  label?: string
  compact?: boolean
  onPick: (id: string) => void
}) {
  // Half the strip's width, for the encounter's title at the top left to keep clear of it however many take turns.
  const strip = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = strip.current
    if (!el) return
    const root = document.documentElement.style
    const ro = new ResizeObserver(() => root.setProperty("--turn-order-half", `${Math.ceil(el.offsetWidth / 2)}px`))
    ro.observe(el)
    return () => {
      ro.disconnect()
      root.removeProperty("--turn-order-half")
    }
  }, [])
  return (
    <div className={cn("pointer-events-auto absolute left-1/2 z-20 flex -translate-x-1/2 flex-col items-center", compact ? "top-2" : "top-6")}>
      <div ref={strip} className="flex items-end gap-1.5">
        {order.map((c) => {
          const active = c.id === activeId
          const turn = c.id === turnId
          const health = c.health === undefined ? undefined : Math.max(0, Math.min(100, Math.round(c.health)))
          const name = `${c.name}${health === undefined ? "" : `, ${health}% health${c.status ? `, ${c.status}` : ""}`}${turn ? ", their turn" : ""}`
          return (
            <div key={c.id} className="relative flex flex-col items-center">
              {turn && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "stage-brass pointer-events-none absolute left-1/2 z-10 grid -translate-x-1/2 place-items-center rounded-full border shadow-[0_0_0_2px_#1c1410,0_2px_6px_#000a]",
                    compact ? "-top-1.5 h-3 w-3" : "-top-2 h-4 w-4"
                  )}
                >
                  <svg viewBox="0 0 10 10" fill="currentColor" className={compact ? "h-1.5 w-1.5" : "h-2 w-2"}>
                    <path d="M1.5 3h7L5 8z" />
                  </svg>
                </span>
              )}
              <button
                type="button"
                onClick={() => onPick(c.id)}
                title={name}
                aria-label={name}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "relative overflow-hidden border bg-stage-ink p-[2px] shadow-[0_4px_14px_#0008] transition-all duration-300",
                  active || turn ? "border-stage-gold shadow-[0_0_0_2px_#1c1410,0_0_18px_#e3b67c55]" : "border-stage-brass/50 opacity-75 hover:opacity-100",
                  compact ? (active ? "h-12 w-10" : "h-9 w-7") : active ? "h-[78px] w-[62px]" : "h-[58px] w-[46px]",
                  c.npc && !active && !turn && "border-[#8a4a3a]/70"
                )}
              >
                {c.portrait ? (
                  // biome-ignore lint/performance/noImgElement: portrait art from the stage assets
                  <img src={c.portrait} alt="" className="block h-full w-full object-cover object-top [filter:sepia(.2)_saturate(.88)]" />
                ) : (
                  <span aria-hidden="true" className="grid h-full place-items-center font-display text-sm text-stage-gold">
                    {c.name
                      .split(" ")
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join("")}
                  </span>
                )}
                {c.npc && !compact && <span className="absolute inset-x-0 bottom-0 bg-[#3a1a12]/85 text-[7px] tracking-[0.2em] text-[#f0c9a8]">NPC</span>}
                {!c.npc && health !== undefined && (
                  <span
                    className={cn("absolute inset-x-0 bottom-0 bg-stage-ink/85 font-sans tabular-nums leading-tight text-stage-cream", compact ? "text-[8px]" : active ? "text-[11px]" : "text-[9px]")}
                  >
                    {health}%
                  </span>
                )}
              </button>
              {health !== undefined && (
                <div className={cn("w-full border border-stage-brass/50 bg-stage-ink", compact ? "mt-0.5 h-[4px]" : "mt-1 h-[6px]")}>
                  <div className="h-full transition-[width,background-color] duration-700" style={{ width: `${health}%`, backgroundColor: healthColor(health) }} />
                </div>
              )}
            </div>
          )
        })}
      </div>
      {label && <div className={cn("font-display tracking-[0.08em] text-stage-parchment [text-shadow:0_1px_8px_#000,0_0_2px_#000]", compact ? "mt-1 text-[13px]" : "mt-2 text-[19px]")}>{label}</div>}
    </div>
  )
}
