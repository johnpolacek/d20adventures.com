"use client"

// A reaction offered to a hero in the middle of an NPC's turn: the offer in words, Take It and Let It Pass, and the
// seconds left before the hero's standing order answers. The player of another hero sees one line with the same
// countdown. And a hero's standing orders, one row for each reaction they have. Both hosts use them.

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Chevron, eyebrow, Pill, panel } from "./hud"
import { ORDERS, type Order, type OrderRow, REACTION_WAIT_MS, type ReactionId, reactionName } from "./reaction-view"

/** The milliseconds left until `expiresAt`, renewed a few times a second until it runs out. */
export function useTimeLeft(expiresAt: number | undefined): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (expiresAt === undefined) return
    setNow(Date.now())
    const timer = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= expiresAt) clearInterval(timer)
    }, 100)
    return () => clearInterval(timer)
  }, [expiresAt])
  return expiresAt === undefined ? 0 : Math.max(0, expiresAt - now)
}

/** Whether `expiresAt` has passed. It changes once, as it passes. */
export function useExpired(expiresAt: number | undefined): boolean {
  const [expired, setExpired] = useState(() => expiresAt !== undefined && Date.now() >= expiresAt)
  useEffect(() => {
    if (expiresAt === undefined) return setExpired(false)
    const left = expiresAt - Date.now()
    setExpired(left <= 0)
    if (left <= 0) return
    const timer = setTimeout(() => setExpired(true), left)
    return () => clearTimeout(timer)
  }, [expiresAt])
  return expiresAt !== undefined && expired
}

function Countdown({ left, compact }: { left: number; compact: boolean }) {
  const share = Math.min(1, left / REACTION_WAIT_MS)
  const low = left <= 5000
  return (
    <div className={cn("h-[3px] w-full overflow-hidden rounded-full bg-black/40", compact ? "mt-1.5" : "mt-2.5")} aria-hidden="true">
      <div className="h-full origin-left rounded-full transition-[width] duration-100 ease-linear" style={{ width: `${share * 100}%`, backgroundColor: low ? "#e39a7c" : "var(--color-stage-gold)" }} />
    </div>
  )
}

// `mine` is whether this player answers for the hero: only then are there buttons. `answered` shows the line a player
// of another hero sees, after the answer is in.
export function ReactionCard({
  reaction,
  hero,
  portrait,
  expiresAt,
  text,
  mine,
  answered = false,
  compact = false,
  className,
  onTake,
  onPass,
}: {
  reaction: string
  hero: string
  portrait?: string
  expiresAt: number
  text: string
  mine: boolean
  answered?: boolean
  compact?: boolean
  className?: string
  onTake?: () => void
  onPass?: () => void
}) {
  const left = useTimeLeft(expiresAt)
  const seconds = Math.ceil(left / 1000)
  const [chosen, setChosen] = useState<"take" | "pass" | null>(null)
  const asking = mine && !answered
  const pick = (choice: "take" | "pass") => {
    if (chosen) return
    setChosen(choice)
    ;(choice === "take" ? onTake : onPass)?.()
  }
  const clock = (
    <span className={cn("shrink-0 font-serif font-semibold tabular-nums", left <= 5000 ? "text-[#e39a7c]" : "text-stage-cream", compact ? "text-[13px]" : "text-[15px]")} aria-hidden="true">
      {seconds}s
    </span>
  )
  if (!asking)
    return (
      <section aria-live="polite" className={cn(panel, "fade-in border-stage-brass/50", compact ? "px-3 py-2" : "px-4 py-3", className)}>
        <div className="flex items-center gap-3">
          <span className={cn(eyebrow, "min-w-0 flex-1 truncate")}>{`${hero} Is Deciding`}</span>
          {clock}
        </div>
        <Countdown left={left} compact={compact} />
      </section>
    )
  return (
    <section
      role="alertdialog"
      aria-label={`${reactionName(reaction)} for ${hero}`}
      className={cn(panel, "fade-in border-stage-brass/50 text-left", compact ? "px-3 py-2" : "px-5 pt-4 pb-4", className)}
    >
      <div className="flex items-center gap-2.5">
        {portrait && (
          // biome-ignore lint/performance/noImgElement: portrait art from the stage assets
          <img src={portrait} alt="" className={cn("shrink-0 rounded-full border border-stage-gold/60 object-cover object-top", compact ? "h-5 w-5" : "h-7 w-7")} />
        )}
        <span className={cn(eyebrow, "min-w-0 flex-1 truncate")}>
          {reactionName(reaction)} · {hero.split(" ")[0]}
        </span>
        {clock}
      </div>
      <p className={cn("font-serif text-stage-cream", compact ? "mt-1 line-clamp-2 text-[12px] leading-snug" : "mt-2 text-[15px] leading-[1.5]")}>{text}</p>
      <Countdown left={left} compact={compact} />
      <div className={cn("flex items-center justify-end gap-2", compact ? "mt-1.5 [&>button]:py-1" : "mt-3")}>
        <Pill disabled={Boolean(chosen)} active={chosen === "pass"} onClick={() => pick("pass")}>
          Let It Pass
        </Pill>
        <Button variant="epic" size="xs" disabled={Boolean(chosen)} className={cn("shrink-0 gap-1.5", compact ? "px-5" : "px-7 py-1.5 text-sm")} onClick={() => pick("take")}>
          Take It
          <Chevron />
        </Button>
      </div>
    </section>
  )
}

// A hero's standing orders: for each reaction they have, Always, When It Matters or Never, the default shown where
// none is set. A change shows at once. `onChange` hears every order changed here so far, for the caller to lay over
// the hero's stored orders, so two quick changes do not undo each other.
export function StandingOrders({
  rows,
  compact = false,
  className,
  onChange,
}: {
  rows: OrderRow[]
  compact?: boolean
  className?: string
  onChange: (changed: Partial<Record<ReactionId, Order>>) => void
}) {
  const [picked, setPicked] = useState<Partial<Record<ReactionId, Order>>>({})
  return (
    <div className={className}>
      <h3 className={cn(eyebrow, "mb-2")}>Reactions</h3>
      <div className="space-y-2">
        {rows.map((row) => {
          const order = picked[row.id] ?? row.order
          return (
            <div key={row.id} role="radiogroup" aria-label={row.name} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5", compact && "gap-x-2")}>
              <span className="min-w-[8.5rem] font-serif text-[13px] text-stage-cream">{row.name}</span>
              <span className="flex gap-1">
                {ORDERS.map((o) => (
                  <Pill
                    key={o.id}
                    role="radio"
                    aria-checked={order === o.id}
                    active={order === o.id}
                    className="px-2 py-1 text-[10px]"
                    onClick={() => {
                      if (order === o.id) return
                      const changed = { ...picked, [row.id]: o.id }
                      setPicked(changed)
                      onChange(changed)
                    }}
                  >
                    {o.name}
                  </Pill>
                ))}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
