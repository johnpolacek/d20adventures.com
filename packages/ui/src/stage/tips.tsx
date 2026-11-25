"use client"

// A short tip the first time a player meets each part of play: typing an action, a roll, an attack, a reaction and a
// hero's sheet. Each shows once on this device, and No More Tips hides them all. Both hosts use it.

import { useCallback, useState } from "react"
import { cn, type MotionProps } from "../utils"
import { eyebrow, Pill, panel } from "./hud"

export type TipId = "act" | "roll" | "attack" | "reaction" | "sheet"

export const TIPS: Record<TipId, { title: string; text: string }> = {
  act: { title: "Your Turn", text: "Type what your hero does, as you would tell a friend at the table. Anything goes. The game master decides what happens." },
  roll: { title: "Roll the Die", text: "The game master asked for a roll. Your bonus and the number you need are on the card. Roll the d20 to see if you make it." },
  attack: { title: "An Attack", text: "An attack rolls against the target’s Armor Class. Heroes and foes take turns in the order shown at the top." },
  reaction: { title: "A Reaction", text: "Once a round you can act out of turn. Take it or let it pass before the time runs out." },
  sheet: { title: "Your Hero", text: "Click a portrait at the top to look at that hero. Click it again to open their sheet, with gear, spells and hit points." },
}

const KEY = "d20-tips-seen"
const ALL = "all"

function seenNow(): string[] {
  try {
    return typeof localStorage === "undefined" ? [ALL] : (JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[])
  } catch {
    return []
  }
}

/**
 * The first of `wanted` the player has not seen yet, in the order given, and the way to mark it seen. Mark one seen
 * and the next waiting tip takes its place.
 */
export function useTip(wanted: TipId[]) {
  const [seen, setSeen] = useState(seenNow)
  const mark = useCallback((id: string) => {
    const next = [...new Set([...seenNow(), id])]
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {}
    setSeen(next)
  }, [])
  const tip = seen.includes(ALL) ? null : (wanted.find((id) => !seen.includes(id)) ?? null)
  return { tip, seen: (id: TipId) => mark(id), none: () => mark(ALL) }
}

/** A tip's card: its name, a line or two, Got It and No More Tips. */
export function TipCard({ tip, onSeen, onNone, compact, className, ...motion }: { tip: TipId; onSeen: () => void; onNone: () => void; compact?: boolean; className?: string } & MotionProps) {
  const { title, text } = TIPS[tip]
  return (
    <aside {...motion} role="status" className={cn(panel, "pointer-events-auto", compact ? "w-[min(360px,calc(100%-24px))] p-3" : "w-[min(400px,calc(100%-40px))] p-4", className)}>
      <div className={eyebrow}>Tip</div>
      <p className="mt-1 font-serif text-lg">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      <div className="mt-3 flex justify-end gap-2">
        <Pill onClick={onNone}>No More Tips</Pill>
        <Pill variant="primary" onClick={onSeen}>
          Got It
        </Pill>
      </div>
    </aside>
  )
}
