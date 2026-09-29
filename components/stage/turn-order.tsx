"use client"

// Turn order across the top of the stage, as in Baldur's Gate 3: everyone in initiative order, whoever is acting larger
// and framed in gold. Clicking a portrait takes the camera to that character.

import { cn } from "@/lib/utils"

export interface OrderEntry {
  id: string
  name: string
  portrait?: string
  npc?: boolean
}

export function TurnOrder({ order, activeId, label, compact = false, onPick }: { order: OrderEntry[]; activeId: string | null; label?: string; compact?: boolean; onPick: (id: string) => void }) {
  return (
    <div className={cn("pointer-events-auto absolute left-1/2 z-20 flex -translate-x-1/2 flex-col items-center", compact ? "top-2" : "top-6")}>
      <div className="flex items-end gap-1.5">
        {order.map((c) => {
          const active = c.id === activeId
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c.id)}
              title={c.name}
              aria-current={active ? "true" : undefined}
              className={cn(
                "relative overflow-hidden border bg-stage-ink p-[2px] shadow-[0_4px_14px_#0008] transition-all duration-300",
                active ? "border-stage-gold shadow-[0_0_0_2px_#1c1410,0_0_18px_#e3b67c55]" : "border-stage-brass/50 opacity-75 hover:opacity-100",
                compact ? (active ? "h-12 w-10" : "h-9 w-7") : active ? "h-[78px] w-[62px]" : "h-[58px] w-[46px]",
                c.npc && !active && "border-[#8a4a3a]/70"
              )}
            >
              {c.portrait && (
                // biome-ignore lint/performance/noImgElement: portrait art from the stage assets
                <img src={c.portrait} alt="" className="block h-full w-full object-cover object-top [filter:sepia(.2)_saturate(.88)]" />
              )}
              {c.npc && !compact && <span className="absolute inset-x-0 bottom-0 bg-[#3a1a12]/85 text-[7px] tracking-[0.2em] text-[#f0c9a8]">NPC</span>}
            </button>
          )
        })}
      </div>
      {label && !compact && <div className="mt-1.5 font-display text-[11px] tracking-[0.12em] text-stage-parchment [text-shadow:0_1px_6px_#000]">{label}</div>}
    </div>
  )
}
