"use client"

// A short tip the first time a player meets each part of play: typing an action, a roll, an attack, a reaction and a
// hero's sheet. Each shows once on this device, and No More Tips hides them all. Both hosts use it.

import { useCallback, useEffect, useState } from "react"
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

// The first-look tour: the very first time the game opens on a device, a welcome, then a short stop at each part of the
// screen, ending at the feedback button. Each stop is found by its `data-tour` mark. A stop whose part is not on screen
// is taken out.
export type TourStop = { at?: string; title: string; text: string }
export const TOUR: TourStop[] = [
  {
    title: "Welcome to D20 Adventures",
    text: "A fantasy adventure run by an AI game master. It tells the story and plays everyone else. You say what your hero does, and the dice decide how it goes. Here is a quick look around.",
  },
  { at: "story", title: "The Story", text: "The game master tells what happens here, a part at a time. Read on with the arrows, or let the narrator read it aloud." },
  { at: "turns", title: "Who Acts", text: "Everyone in the scene, in the order they act. Click a portrait to look at them, and again to open their sheet." },
  { at: "views", title: "Camera", text: "Change how you see the scene." },
  { at: "map", title: "Map", text: "Where you are, and the places you have been." },
  { at: "journal", title: "Journal", text: "The whole story so far, to read back any time." },
  { at: "settings", title: "Scene Settings", text: "Step through the story or let it play, and set the sound, the narrator and the graphics." },
  { at: "feedback", title: "Give Us Feedback", text: "D20 Adventures is new and growing. Tell us what works and what doesn’t, any time, right here." },
]

/** Whether the tour has yet to be seen on this device, and the way to mark it seen. */
export function useTour() {
  const [seen, setSeen] = useState(() => {
    const s = seenNow()
    return s.includes(ALL) || s.includes("tour")
  })
  const done = useCallback(() => {
    const next = [...new Set([...seenNow(), "tour"])]
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {}
    setSeen(true)
  }, [])
  return { open: !seen, done }
}

const findStop = (at: string) => document.querySelector<HTMLElement>(`[data-tour="${at}"]`)

/** The tour itself, over the play screen. `onDone` is called when it is finished or skipped. */
export function Tour({ onDone, compact }: { onDone: () => void; compact?: boolean }) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  // The stops, from the welcome on. One whose part is not on screen when it comes up is taken out, so the count is true.
  const [stops, setStops] = useState(TOUR)
  const stop = stops[step]
  const last = step === stops.length - 1
  const next = useCallback(() => (step >= stops.length - 1 ? onDone() : setStep((n) => n + 1)), [step, stops.length, onDone])

  // The stop's part, measured now and while the screen settles. One not on screen is passed over.
  useEffect(() => {
    if (!stop.at) return setRect(null)
    const at = stop.at
    const measure = () => {
      const el = findStop(at)
      const r = el?.getBoundingClientRect()
      return r && r.width > 0 && r.height > 0 ? r : null
    }
    const first = measure()
    if (!first) {
      setRect(null)
      if (step >= stops.length - 1) onDone()
      else setStops((all) => all.filter((t) => t !== stop))
      return
    }
    setRect(first)
    const again = () => setRect(measure())
    const timer = setInterval(again, 250)
    addEventListener("resize", again)
    return () => {
      clearInterval(timer)
      removeEventListener("resize", again)
    }
  }, [stop, step, stops.length, onDone])

  const width = compact ? 300 : 360
  const pad = 8
  const below = rect ? rect.top + rect.height / 2 < innerHeight / 2 : false
  const card = rect
    ? {
        left: Math.min(Math.max(16, rect.left + rect.width / 2 - width / 2), innerWidth - width - 16),
        ...(below ? { top: rect.bottom + pad + 10 } : { bottom: innerHeight - rect.top + pad + 10 }),
      }
    : null
  const count = stops.length - 1
  const box = (
    <aside key={step} className={cn(panel, "enter-rise p-5", card ? "fixed" : "text-center")} style={card ? { ...card, width } : { width: compact ? 340 : 460 }}>
      <div className={eyebrow}>{stop.at ? `${step} of ${count}` : "First Time Here"}</div>
      <p className={cn("mt-1 font-display", stop.at ? "text-xl" : "text-2xl")}>{stop.title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{stop.text}</p>
      <div className={cn("mt-4 flex gap-2", stop.at ? "justify-end" : "justify-center")}>
        <Pill onClick={onDone}>{stop.at ? "Skip Tour" : "Skip"}</Pill>
        <Pill variant="primary" onClick={next}>
          {!stop.at ? "Show Me Around" : last ? "Start Playing" : "Next"}
        </Pill>
      </div>
    </aside>
  )

  return (
    <div className="pointer-events-auto fixed inset-0 z-overlay" role="dialog" aria-modal="true" aria-label="A Look Around">
      {rect ? (
        // The part, lit, and the rest of the screen dimmed around it.
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-lg border border-accent/80 transition-all duration-300 ease-snap"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: "0 0 0 9999px rgba(10,6,4,.55)" }}
        />
      ) : (
        <div aria-hidden="true" className="fixed inset-0 bg-[rgba(10,6,4,.55)]" />
      )}
      {card ? box : <div className="fixed inset-0 flex items-center justify-center p-4">{box}</div>}
    </div>
  )
}
