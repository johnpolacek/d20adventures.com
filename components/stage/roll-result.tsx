"use client"

// A dice roll, in the narration as the hero of its paragraph and on the card where the player makes it. The die takes
// the centre, over a pool of light: each face carries its number, and it tumbles and comes to rest on the one rolled,
// with a ring thrown out as it lands. The modifier and the total follow against the DC, or an attack's Armor Class,
// and the verdict slams in under them, with what the roll did. A roll with Advantage or Disadvantage throws two dice:
// the one kept stays lit and the other dims. A Critical Hit turns the kept die gold, with rays behind it. A natural 20
// or 1 has no special look on a check or a save. A Death Saving Throw shows the hero's saves as marks. A die a lasting
// spell adds or takes away is a term of its own, named for the spell: + 3 Bless, − 2 Bane.
// A roll still to make turns slowly and says what the die has to show, and the dice are the button that makes it.
// Reduced motion shows the result at once. On a screen too short for all that, the die sits to the left of its words,
// and a compact roll is that at a smaller size.

import { Fragment, useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { D20Solid } from "./d20"
import { rattle, verdict as sound, type Verdict } from "./dice-sound"
import { eyebrow, useShort } from "./hud"
import { DeathSaveMarks, RollDetails } from "./roll-parts"
import { againstLabel, askSpeech, isCritical, marginText, modeName, type RollAsk, type RollView, rollHeading, rollNeed, rollSpeech, verdictOf } from "./roll-view"

// When each part arrives, in ms from the start: the die lands, the total follows, then the verdict.
const LAND = 1250
const TOTAL = LAND + 350
const VERDICT = TOTAL + 450
export const ROLL_SECONDS = (VERDICT + 900) / 1000

const CRITICAL = "#ffd88a"
// The light under a die still to land.
const WAITING = "#fef3c7"

// `onRoll` makes a roll still to make, and `onVerdict` hears when the verdict is in.
export function RollResult({ roll, compact = false, onRoll, onVerdict }: { roll: RollView | RollAsk; compact?: boolean; onRoll?: () => void; onVerdict?: () => void }) {
  // The die beside its words, not over them: a compact roll, and any roll on a short screen.
  const short = useShort()
  const row = compact || short
  const made = "natural" in roll ? roll : null
  const natural = made?.natural
  const total = made?.total
  const dice = made ? (made.dice && made.dice.length > 1 ? made.dice : [made.natural]) : roll.mode ? [0, 0] : [0]
  const kept = made ? dice.indexOf(made.natural) : 0
  const diceKey = dice.join()
  const crit = made ? isCritical(made) : false
  // A roll the player made here keeps its modifier in view from the start.
  const [asked] = useState(!made)
  const [step, setStep] = useState(0)
  const [tumble, setTumble] = useState(0)
  const verdictRef = useRef(onVerdict)
  verdictRef.current = onVerdict
  // The verdict's cue, read when it sounds: the engine's answer can change a verdict made on the card.
  const cue = useRef<Verdict>("success")
  cue.current = crit ? "critical-success" : made?.success ? "success" : "failure"
  useEffect(() => {
    if (natural === undefined) return
    const done = () => {
      setStep(3)
      sound(cue.current)
      verdictRef.current?.()
    }
    // The die shows its face itself when there is no tumble.
    if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) return done()
    setTumble((k) => k + 1)
    const hush = rattle()
    const timers = [
      setTimeout(() => {
        setStep(1)
        hush()
      }, LAND),
      setTimeout(() => setStep(2), TOTAL),
      setTimeout(done, VERDICT),
    ]
    return () => {
      for (const t of timers) clearTimeout(t)
      hush()
    }
  }, [natural, diceKey])

  // The total counts up from the die to itself as it arrives.
  const [counted, setCounted] = useState<number>()
  useEffect(() => {
    if (step !== 2 || natural === undefined || total === undefined) return
    let raf = 0
    const t0 = performance.now()
    const frame = () => {
      const t = Math.min(1, (performance.now() - t0) / 300)
      setCounted(Math.round(natural + (total - natural) * t))
      if (t < 1) raf = requestAnimationFrame(frame)
    }
    frame()
    return () => cancelAnimationFrame(raf)
  }, [step, natural, total])

  const verdict = made ? verdictOf(made) : ""
  const margin = made ? marginText(made) : ""
  const tone = crit ? CRITICAL : made?.success ? "#b7d38a" : "#e39a7c"
  const landed = step >= 1
  const two = dice.length > 1
  const size = two ? (compact ? 56 : row ? 84 : 104) : compact ? 72 : row ? 112 : 132
  const mod = roll.modifier ?? 0
  const inspired = made?.inspired
  const adds = made?.adds ?? []
  const first = roll.character.split(" ")[0]
  const need = made ? null : rollNeed(roll)
  const waiting = !made && Boolean(onRoll)
  // A Death Saving Throw's marks: the saves so far before the roll, and after it once the verdict is in.
  const saves = roll.kind === "death" ? (made ? (step >= 3 ? made.deathSaves : undefined) : roll.deathSaves) : undefined
  const term = (sign: string, n: number, label?: string, show = true) => (
    <span className={cn("transition-opacity duration-300", show ? "opacity-100" : "opacity-0")}>
      <span className={cn("text-stage-muted", compact ? "text-[14px]" : "text-[18px]")}>{sign}</span>
      <span className={cn("ml-2", compact ? "text-[18px]" : "text-[24px]", label && "text-stage-gold")}>{n}</span>
      {label && <span className={cn(eyebrow, "ml-1 align-middle text-stage-muted", compact && "text-[7px]")}>{label}</span>}
    </span>
  )
  // Who rolls what, and what gives the roll Advantage or Disadvantage.
  const heading = (
    <>
      <div className={cn("flex items-center gap-2", row ? eyebrow : "justify-center font-serif text-[15px] leading-[1.4] text-stage-cream")}>
        {roll.portrait && (
          // biome-ignore lint/performance/noImgElement: portrait art from the stage assets
          <img src={roll.portrait} alt="" className="h-6 w-6 shrink-0 rounded-full border border-stage-gold/60 object-cover object-top" />
        )}
        <span className={cn("line-clamp-2", row && "leading-[1.5]")}>{rollHeading(roll, first)}</span>
      </div>
      {roll.mode && (
        <div className={cn("truncate font-serif text-stage-muted italic", compact ? "text-[11px]" : row ? "mt-1 text-[13px]" : "mt-0.5 text-[13px]")}>
          <span className="font-semibold text-stage-gold not-italic">{modeName(roll.mode)}</span>
          {roll.reasons?.length ? ` · ${roll.reasons.join(", ")}` : ""}
        </div>
      )}
    </>
  )

  return (
    <div className={cn("flex", compact ? "items-center gap-3" : row ? "items-center gap-5" : "flex-col items-center text-center")}>
      {made && <span className="sr-only">{rollSpeech(made)}</span>}
      {!row && (
        <div className="max-w-full" aria-hidden="true">
          {heading}
        </div>
      )}
      {/* The dice, each over its pool of light, which takes the verdict's colour under the one kept. Before the roll they are the button. */}
      <button
        type="button"
        onClick={onRoll}
        disabled={!onRoll || Boolean(made)}
        aria-label={made ? undefined : `Roll ${two ? "two d20s" : "the d20"} for ${first}'s ${askSpeech(roll)}`}
        aria-hidden={made ? true : undefined}
        className={cn("relative flex shrink-0 justify-center disabled:cursor-default", compact ? "gap-1" : row ? "gap-2" : "mt-1 gap-3", waiting && "transition-transform enabled:hover:scale-105")}
      >
        {dice.map((n, i) => {
          const dropped = landed && two && i !== kept
          const lit = landed && !dropped
          const gold = crit && lit
          const glow = lit && (row || crit) ? `drop-shadow(0 0 ${crit ? 22 : 12}px ${tone}${crit ? "cc" : "80"}) ` : !made && row ? "drop-shadow(0 0 12px #e3b67c40) " : ""
          return (
            <span key={i} className={cn("relative transition-[opacity,filter] duration-500", dropped && "opacity-35 grayscale")} style={{ width: size, height: row ? size : size + 18 }}>
              {!row && (
                <>
                  <span
                    className="absolute bottom-0 left-1/2 h-10 -translate-x-1/2 rounded-[50%] transition-[background] duration-500"
                    style={{ width: size * 1.5, background: `radial-gradient(closest-side, ${lit ? `${tone}8c` : `${WAITING}40`}, transparent)` }}
                  />
                  <span className="absolute bottom-2.5 left-1/2 h-4 -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,#000d,transparent)]" style={{ width: size * 0.8 }} />
                </>
              )}
              {gold && step >= 3 && <span className="roll-rays absolute -inset-6 rounded-full" />}
              {waiting && <span className="roll-pulse pointer-events-none absolute top-0 left-0 rounded-full border border-stage-gold/55" style={{ width: size, height: size }} />}
              {lit && <span className="roll-shock pointer-events-none absolute top-0 left-0 rounded-full border-2" style={{ width: size, height: size, borderColor: tone }} />}
              <span className={cn("absolute top-0 left-0 transition-[filter] duration-500", lit && "die-land")} style={{ filter: `${glow}drop-shadow(0 3px 6px #000c)` }}>
                <D20Solid size={size} roll={tumble} seconds={LAND / 1000} tone={gold ? "gold" : undefined} numbered face={n || undefined} idle={!made} />
              </span>
            </span>
          )
        })}
        {waiting && <span className={cn(eyebrow, "pointer-events-none absolute inset-x-0", compact ? "-bottom-2.5 text-[7px]" : row ? "-bottom-3.5" : "bottom-0.5 text-[11px]")}>Roll</span>}
      </button>

      <div className={cn("min-w-0", row ? "flex-1" : "w-full")} aria-hidden="true">
        {row && heading}
        {/* Before the roll, what the die has to show. After it: natural + modifier + an Inspiration die + the dice of
            lasting spells = total. Both against the DC or the Armor Class. */}
        <div
          className={cn(
            "flex gap-2 font-serif font-semibold tabular-nums text-stage-cream",
            compact ? "mt-0.5 items-baseline" : row ? "mt-1.5 items-baseline" : "min-h-11 flex-wrap items-baseline justify-center gap-y-0"
          )}
        >
          {need ? (
            <span className={cn("font-normal", compact ? "text-[12px]" : "text-[15px]")}>
              Roll <span className={cn("mx-0.5 font-bold text-stage-gold", compact ? "text-[18px]" : "text-[24px]")}>{need.number}</span> {need.words}
            </span>
          ) : (
            <>
              <span className={cn(compact ? "text-[18px]" : "text-[24px]", !landed && "opacity-30")}>{landed ? natural : "?"}</span>
              {roll.modifier !== undefined && term(mod < 0 ? "−" : "+", Math.abs(mod), undefined, step >= 2 || asked)}
              {inspired !== undefined && term("+", inspired, "Inspiration", step >= 2)}
              {adds.map((a, i) => (
                <Fragment key={i}>{term(a.amount < 0 ? "−" : "+", Math.abs(a.amount), a.from, step >= 2)}</Fragment>
              ))}
              <span className={cn("transition-opacity duration-300", step >= 2 ? "opacity-100" : "opacity-0")}>
                <span className={cn("text-stage-muted", compact ? "text-[14px]" : "text-[18px]")}>=</span>
                <span className={cn("ml-2 font-bold text-stage-gold", compact ? "text-[26px]" : "text-[38px]", step >= 2 && "roll-rise")}>{step >= 3 ? total : (counted ?? total)}</span>
              </span>
            </>
          )}
          <span
            className={cn(
              "shrink-0 self-center rounded-sm border border-stage-line/25 font-sans font-normal tracking-[0.2em] text-stage-muted uppercase",
              compact ? "ml-auto px-1.5 py-0.5 text-[9px]" : row ? "ml-auto px-2 py-1 text-[10px]" : "ml-1.5 px-2 py-1 text-[10px]"
            )}
          >
            {againstLabel(roll.kind)} <span className={cn("font-serif font-semibold tracking-normal text-stage-cream", compact ? "text-[13px]" : "text-[17px]")}>{roll.dc}</span>
          </span>
        </div>
        {/* The verdict, slammed in between two rules, and by how much the roll made or missed its number. Silent until the die has landed. */}
        {made && (
          <>
            <div className={cn("flex items-center", compact ? "mt-1 gap-3" : row ? "mt-2 gap-3" : "h-10 justify-center gap-3.5", step >= 3 ? "opacity-100" : "opacity-0")}>
              {!row && <span className="h-px w-12 shrink" style={{ background: `linear-gradient(90deg, transparent, ${tone})` }} />}
              <span
                className={cn(
                  "shrink-0 whitespace-nowrap font-display font-bold tracking-[0.08em] uppercase",
                  compact ? "text-[13px]" : row ? "text-[18px]" : crit ? "text-[22px]" : "text-[28px]",
                  step >= 3 && "roll-slam"
                )}
                style={{ color: tone, textShadow: `0 0 ${row ? 10 : 20}px ${tone}8c` }}
              >
                {verdict}
              </span>
              {!row && <span className="h-px w-12 shrink" style={{ background: `linear-gradient(270deg, transparent, ${tone})` }} />}
              {row && margin && <span className={cn("min-w-0 truncate font-serif text-stage-muted italic", compact ? "text-[11px]" : "text-[13px]")}>{margin}</span>}
            </div>
            {!row && <div className={cn("min-h-[18px] font-serif text-[13px] leading-[18px] text-stage-muted italic", step >= 3 ? "fade-in" : "opacity-0")}>{margin}</div>}
          </>
        )}
        {saves && (
          <div className={cn("flex", compact ? "mt-1" : row ? "mt-2" : "mt-2 justify-center")}>
            <DeathSaveMarks saves={saves} compact={compact} />
          </div>
        )}
        {made && step >= 3 && <RollDetails roll={made} compact={compact} className={cn("fade-in", compact ? "mt-1" : row ? "mt-2" : "mt-1.5 items-center")} />}
      </div>
    </div>
  )
}
