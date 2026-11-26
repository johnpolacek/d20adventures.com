"use client"

// A short tip the first time a player meets each part of play: typing an action, a roll, an attack, a reaction and a
// hero's sheet. Each shows once on this device, and No More Tips hides them all. Both hosts use it.

import { useCallback, useEffect, useRef, useState } from "react"
import { gsap, prefersReducedMotion, useGSAP } from "../motion"
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

// Every hook on the page hears a mark, so a tour finished in one place lets the tips in another show.
const MARKED = "d20-tips-marked"
function mark(id: string) {
  const next = [...new Set([...seenNow(), id])]
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {}
  dispatchEvent(new Event(MARKED))
}

/** What has been seen on this device. Before the page has read it, everything counts as seen, so a page drawn on the
 * server and the one in the browser agree. */
function useSeen() {
  const [seen, setSeen] = useState<string[]>([ALL])
  useEffect(() => {
    const read = () => setSeen(seenNow())
    read()
    addEventListener(MARKED, read)
    return () => removeEventListener(MARKED, read)
  }, [])
  return seen
}

/**
 * The first of `wanted` the player has not seen yet, in the order given, and the way to mark it seen. Mark one seen
 * and the next waiting tip takes its place.
 */
export function useTip(wanted: TipId[]) {
  const seen = useSeen()
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

// The tour asked for again, by a player starting an adventure with it. It shows once more, whatever has been seen.
const AGAIN = "d20-tour-again"
const againNow = () => {
  try {
    return localStorage.getItem(AGAIN) === "1"
  } catch {
    return false
  }
}

/** Show the tour the next time the play screen opens, even on a device that has seen it. */
export function tourAgain() {
  try {
    localStorage.setItem(AGAIN, "1")
  } catch {}
  dispatchEvent(new Event(MARKED))
}

/** Whether the tour has yet to be seen on this device, or was asked for again, and the way to mark it seen. */
export function useTour() {
  const seen = useSeen()
  const [again, setAgain] = useState(false)
  useEffect(() => {
    const read = () => setAgain(againNow())
    read()
    addEventListener(MARKED, read)
    return () => removeEventListener(MARKED, read)
  }, [])
  const done = useCallback(() => {
    try {
      localStorage.removeItem(AGAIN)
    } catch {}
    mark("tour")
  }, [])
  return { open: again || (!seen.includes(ALL) && !seen.includes("tour")), done }
}

// The first mark on screen for a stop: a page may mark two places for one part, one of them hidden at its width.
const findStop = (at: string) =>
  [...document.querySelectorAll<HTMLElement>(`[data-tour="${at}"]`)].find((el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }) ?? null

// A part that glides to wherever it is sent next, and turns mid-way when sent elsewhere. The first place it is sent,
// or any place under reduced motion, it is simply put.
function glider(el: HTMLElement, props: string[], seconds: number) {
  const quick = props.map((p) => gsap.quickTo(el, p, { duration: seconds, ease: "power3.out" }))
  let sent: number[] | null = null
  return (to: number[]) => {
    if (!sent || !seconds) {
      gsap.set(el, Object.fromEntries(props.map((p, i) => [p, to[i]])))
      sent = to
      return
    }
    // Sent again only on a real change, so a part at rest is not started over every frame.
    to.forEach((v, i) => {
      if (Math.abs(v - sent![i]) > 0.5) {
        quick[i](v)
        sent![i] = v
      }
    })
  }
}

/** The tour itself, over the play screen. `onDone` is called when it is finished or skipped. */
export function Tour({ onDone, compact, stops: given = TOUR }: { onDone: () => void; compact?: boolean; stops?: TourStop[] }) {
  const [step, setStep] = useState(0)
  // The stops, from the welcome on. One whose part is not on screen when it comes up is taken out, so the count is true.
  const [stops, setStops] = useState(given)
  const stop = stops[step]
  const last = step === stops.length - 1
  const next = useCallback(() => (step >= stops.length - 1 ? onDone() : setStep((n) => n + 1)), [step, stops.length, onDone])
  const root = useRef<HTMLDivElement>(null)
  const spot = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const send = useRef<{ spot: (to: number[]) => void; card: (to: number[]) => void } | null>(null)

  const width = stop.at ? (compact ? 300 : 360) : compact ? 340 : 460
  const pad = 8

  // The lit box and the card are made once and glide from stop to stop. The tour fades in over the screen.
  useGSAP(
    () => {
      const seconds = prefersReducedMotion() ? 0 : 0.55
      send.current = { spot: glider(spot.current!, ["x", "y", "width", "height"], seconds), card: glider(card.current!, ["x", "y", "width"], seconds) }
      if (seconds) gsap.from(root.current, { autoAlpha: 0, duration: 0.3, ease: "power2.out" })
    },
    { scope: root },
  )

  // Each stop's words come in once the card is on its way.
  useGSAP(
    () => {
      if (step === 0 || prefersReducedMotion()) return
      gsap.fromTo(body.current, { autoAlpha: 0, y: 4 }, { autoAlpha: 1, y: 0, duration: 0.3, delay: 0.12, ease: "power2.out" })
    },
    { dependencies: [step], scope: root },
  )

  // Where the box and the card belong, read every frame, so they follow a part while the page scrolls or settles.
  // The welcome lights its own card, and the first stop's box grows out of it. One not on screen is passed over.
  useEffect(() => {
    const at = stop.at
    if (at) {
      const el = findStop(at)
      // A part below the fold, on a page that scrolls, is brought into view first.
      el?.scrollIntoView({ block: "center", behavior: "smooth" })
      if (!el) {
        if (step >= stops.length - 1) onDone()
        else setStops((all) => all.filter((t) => t !== stop))
        return
      }
    }
    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      const movers = send.current
      const box = card.current
      if (!movers || !box) return
      const w = Math.min(width, innerWidth - 32)
      const h = box.offsetHeight
      if (!at) {
        const x = (innerWidth - w) / 2
        const y = (innerHeight - h) / 2
        movers.spot([x, y, w, h])
        movers.card([x, y, w])
        return
      }
      const r = findStop(at)?.getBoundingClientRect()
      // A part gone for a moment holds the box where it was.
      if (!r) return
      movers.spot([r.left - pad, r.top - pad, r.width + pad * 2, r.height + pad * 2])
      const below = r.top + r.height / 2 < innerHeight / 2
      const x = Math.min(Math.max(16, r.left + r.width / 2 - w / 2), innerWidth - w - 16)
      // Kept on screen beside a part taller than the window.
      const y = below ? Math.min(r.bottom + pad + 10, innerHeight - 260) : innerHeight - Math.min(innerHeight - r.top + pad + 10, innerHeight - 260) - h
      movers.card([x, y, w])
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [stop, step, stops.length, onDone, width])

  const count = stops.length - 1
  return (
    <div ref={root} className="pointer-events-auto fixed inset-0 z-overlay" role="dialog" aria-modal="true" aria-label="A Look Around">
      {/* The part, lit, and the rest of the screen dimmed around it. */}
      <div
        ref={spot}
        aria-hidden="true"
        className={cn("pointer-events-none fixed left-0 top-0 rounded-lg border transition-[border-color] duration-300", stop.at ? "border-accent/80" : "border-transparent")}
        style={{ boxShadow: "0 0 0 9999px rgba(10,6,4,.55)" }}
      />
      <aside ref={card} className={cn(panel, "fixed left-0 top-0 p-5", !stop.at && "text-center")}>
        <div ref={body}>
          <div className={eyebrow}>{stop.at ? `${step} of ${count}` : "First Time Here"}</div>
          <p className={cn("mt-1 font-display", stop.at ? "text-xl" : "text-2xl")}>{stop.title}</p>
          <p className="mt-2 text-sm text-muted-foreground">{stop.text}</p>
          <div className={cn("mt-4 flex gap-2", stop.at ? "justify-end" : "justify-center")}>
            <Pill onClick={onDone}>{stop.at ? "Skip Tour" : "Skip"}</Pill>
            <Pill variant="primary" onClick={next}>
              {!stop.at ? "Show Me Around" : last ? "Start Playing" : "Next"}
            </Pill>
          </div>
        </div>
      </aside>
    </div>
  )
}
