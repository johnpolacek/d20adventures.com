"use client"

// Turn order across the top of the stage, as in Baldur's Gate 3: everyone in initiative order, whoever the story is
// about larger and framed in gold. Whoever's turn the game waits on is lit in gold and carries a small brass marker,
// also while the story of an earlier turn is still read. Clicking a portrait takes the camera to that character. A
// hero's portrait carries their hit points as numbers with any Temporary Hit Points, a bar under it, and their Armor
// Class on a shield. An NPC shows
// one wound word instead, never a number. A dying hero shows their Death Saving Throws, and the Stable and the dead say
// so. The name under the strip carries that character's conditions and lasting spells, and who the turn passed over to
// reach its actor.

import { useEffect, useLayoutEffect, useRef } from "react"
import { Button } from "../button"
import { Presence, Swap } from "../presence"
import { Tip } from "../tooltip"
import { cn, entrance, type MotionProps } from "../utils"
import { DeathSaveMarks } from "./roll-parts"
import { hitPointsShort, type Standing, standingWords, WOUND_TONE } from "./standing"

export interface OrderEntry {
  id: string
  name: string
  portrait?: string
  npc?: boolean
  // Left out for a hero whose sheet is not read yet.
  standing?: Standing
  // In words: "Prone, Poisoned, Dodging, Bless, Concentrating On Bless".
  conditions?: string
}

const healthColor = (health: number) => (health <= 25 ? "#c8452f" : health <= 50 ? "#d98a3a" : health <= 75 ? "#d9b44a" : "#7fb069")

type Chip = { entry: OrderEntry; here: boolean; step: number }

// The strip's portraits: everyone in the order, and whoever just left it, kept in their place while they go. Those
// there from the start come in one after another, and one who joins later comes in at once.
function useChips(order: OrderEntry[]): Chip[] {
  const last = useRef<Chip[]>([])
  const before = last.current
  const known = new Map(before.map((chip) => [chip.entry.id, chip]))
  const ids = new Set(order.map((c) => c.id))
  const chips: Chip[] = order.map((entry, i) => {
    const was = known.get(entry.id)
    return { entry, here: true, step: was?.here ? was.step : before.length ? 0 : i }
  })
  before.forEach((chip, i) => {
    if (ids.has(chip.entry.id)) return
    const ahead = i > 0 ? chips.findIndex((c) => c.entry.id === before[i - 1].entry.id) : -1
    chips.splice(ahead + 1, 0, { ...chip, here: false })
  })
  last.current = chips
  // Whoever left is forgotten once they are gone from the screen.
  const gone = chips
    .filter((chip) => !chip.here)
    .map((chip) => chip.entry.id)
    .join()
  useEffect(() => {
    if (!gone) return
    const timer = setTimeout(() => {
      last.current = last.current.filter((chip) => chip.here)
    }, 400)
    return () => clearTimeout(timer)
  }, [gone])
  return chips
}

export function TurnOrder({
  order,
  activeId,
  turnId = null,
  label,
  passed,
  compact = false,
  onPick,
  className,
  style,
  onAnimationEnd,
}: MotionProps & {
  order: OrderEntry[]
  activeId: string | null
  // Whose turn the game is on.
  turnId?: string | null
  label?: string
  // Who the turn passed over to reach whose turn it is, in words: "Thalbern, Stunned".
  passed?: string
  compact?: boolean
  onPick: (id: string) => void
}) {
  const labelled = order.find((c) => c.id === activeId)
  const chips = useChips(order)
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
    <div
      data-tour="turns"
      className={cn("pointer-events-auto absolute left-1/2 z-20 flex -translate-x-1/2 flex-col items-center", compact ? "top-2" : "top-6", entrance("enter-drop", className))}
      style={style}
      onAnimationEnd={onAnimationEnd}
    >
      <div ref={strip} className="flex items-end gap-1.5">
        {chips.map(({ entry: c, here, step }) => {
          const active = c.id === activeId
          const turn = c.id === turnId
          const s = c.standing
          const hero = s?.kind === "hero" ? s : undefined
          const health = hero ? Math.max(0, Math.min(100, Math.round((hero.hitPoints / Math.max(1, hero.maximum)) * 100))) : undefined
          const band = hero ? hitPointsShort(hero) : s && s.kind !== "wound" ? standingWords(s).split(",")[0] : undefined
          const name = `${c.name}${c.npc ? " (NPC)" : ""}${s ? `, ${standingWords(s)}` : ""}${c.conditions ? `, ${c.conditions}` : ""}${turn ? ", their turn" : ""}`
          return (
            <Presence key={c.id} show={here} motion="pop" index={step} asChild>
              <div className="relative flex flex-col items-center">
                <Presence show={turn} motion="pop" initial={false} asChild>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "stage-stone pointer-events-none absolute left-1/2 z-10 grid -translate-x-1/2 place-items-center rounded-full border shadow-[0_0_0_2px_#1c1410,0_2px_6px_#000a]",
                      compact ? "-top-1.5 h-3 w-3" : "-top-2 h-4 w-4"
                    )}
                  >
                    <svg viewBox="0 0 10 10" fill="currentColor" className={compact ? "h-1.5 w-1.5" : "h-2 w-2"}>
                      <path d="M1.5 3h7L5 8z" />
                    </svg>
                  </span>
                </Presence>
                <Tip label={name}>
                  <Button
                    variant="plain"
                    type="button"
                    onClick={() => onPick(c.id)}
                    aria-label={name}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "relative overflow-hidden border bg-background p-[2px] shadow-[0_4px_14px_#0008] transition-[opacity,border-color,scale] duration-150 ease-snap active:scale-95",
                      active || turn ? "border-accent shadow-[0_0_0_2px_#1c1410,0_0_18px_#e3b67c55]" : "border-primary/50 opacity-75 hover:opacity-100",
                      s?.kind === "dead" && "grayscale",
                      compact ? (active ? "h-12 w-10" : "h-9 w-7") : active ? "h-[78px] w-[62px]" : "h-[58px] w-[46px]",
                      c.npc && !active && !turn && "border-[#8a4a3a]/70"
                    )}
                  >
                    {c.portrait ? (
                      <img src={c.portrait} alt="" className="block h-full w-full object-cover object-top [filter:sepia(.2)_saturate(.88)]" />
                    ) : (
                      <span aria-hidden="true" className="grid h-full place-items-center font-display text-sm text-accent">
                        {c.name
                          .split(" ")
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join("")}
                      </span>
                    )}
                    {band && (
                      <span
                        className={cn(
                          "absolute inset-x-0 bottom-0 bg-background/85 font-sans tabular-nums leading-tight",
                          hero ? "text-foreground" : "tracking-wide text-roll-failure",
                          compact ? "text-4xs" : active ? "text-3xs" : "text-4xs"
                        )}
                      >
                        {band}
                      </span>
                    )}
                  </Button>
                </Tip>
                {/* Armor Class on a shield at the portrait's corner. */}
                <Presence show={Boolean(hero)} motion="fade" initial={false} asChild>
                  {hero && (
                    <span aria-hidden="true" className={cn("pointer-events-none absolute z-10 grid place-items-center", compact ? "-top-1 -left-1.5 h-4 w-3.5" : "-top-1.5 -left-2 h-[22px] w-[19px]")}>
                      <svg viewBox="0 0 20 23" className="absolute inset-0 h-full w-full drop-shadow-[0_1px_2px_#000c]">
                        <path d="M10 1 19 4v7c0 6-4 9.5-9 11C5 20.5 1 17 1 11V4Z" fill="#1c1410" stroke="#e3b67c" strokeWidth="1.2" />
                      </svg>
                      <span className={cn("relative font-serif font-semibold tabular-nums leading-none text-accent-soft", compact ? "text-4xs" : "text-4xs")}>{hero.armorClass}</span>
                    </span>
                  )}
                </Presence>
                <Presence show={health !== undefined} motion="fade" initial={false} asChild>
                  {health !== undefined && (
                    <div className={cn("w-full border border-primary/50 bg-background", compact ? "mt-0.5 h-[4px]" : "mt-1 h-[6px]")}>
                      {/* The bar is scaled, not resized, so a wound costs no layout. */}
                      <div className="h-full origin-left transition-[transform,background-color] duration-300 ease-out" style={{ transform: `scaleX(${health / 100})`, backgroundColor: healthColor(health) }} />
                    </div>
                  )}
                </Presence>
                {s?.kind === "wound" && (
                  <span
                    aria-hidden="true"
                    // Unhurt goes unsaid. It keeps its room, so the portrait does not shift at the first wound.
                    className={cn(
                      "font-sans tracking-label uppercase leading-none [text-shadow:0_1px_3px_#000]",
                      compact ? "mt-0.5 text-4xs" : "mt-1 text-4xs",
                      s.word === "Unhurt" && "invisible"
                    )}
                    style={{ color: WOUND_TONE[s.word] }}
                  >
                    {s.word}
                  </span>
                )}
                <Presence show={s?.kind === "dying"} motion="fade" initial={false} asChild>
                  {s?.kind === "dying" && (
                    <span aria-hidden="true" className={compact ? "mt-0.5 scale-75" : "mt-1"}>
                      <DeathSaveMarks saves={s} compact label={false} />
                    </span>
                  )}
                </Presence>
              </div>
            </Presence>
          )
        })}
      </div>
      {label && (
        <Swap id={label} asChild>
          <div className={cn("font-display tracking-wide text-accent-soft [text-shadow:0_1px_8px_#000,0_0_2px_#000]", compact ? "mt-1 text-xs" : "mt-2 text-base")}>{label}</div>
        </Swap>
      )}
      <Presence show={Boolean(label && labelled?.conditions)} motion="fade" initial={false} asChild>
        {label && labelled?.conditions && (
          <div className={cn("font-serif text-foreground italic [text-shadow:0_1px_6px_#000,0_0_2px_#000]", compact ? "text-4xs" : "text-xs")}>{labelled.conditions}</div>
        )}
      </Presence>
      <Presence show={Boolean(passed)} motion="fade" initial={false} asChild>
        {passed && (
          <div className={cn("flex items-baseline gap-2 [text-shadow:0_1px_6px_#000,0_0_2px_#000]", compact ? "mt-0.5" : "mt-1")}>
            <span className={cn("font-sans font-medium tracking-label text-muted-foreground uppercase", compact ? "text-4xs" : "text-4xs")}>Passed Over</span>
            <span className={cn("font-serif text-roll-failure", compact ? "text-4xs" : "text-xs")}>{passed}</span>
          </div>
        )}
      </Presence>
    </div>
  )
}
