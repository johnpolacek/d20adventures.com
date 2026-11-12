"use client"

// A dice roll, in the narration as the hero of its paragraph and on the card where the player makes it: the d20
// tumbles and lands on the natural roll, the modifier and the total follow against the DC, or an attack's Armor Class,
// and the verdict stamps in, with what the roll did under it. A roll with Advantage or Disadvantage throws two dice: the
// one kept glows and the other dims, struck through. A Critical Hit turns the kept die gold, with rays behind it. A
// natural 20 or 1 has no special look on a check or a save. A Death Saving Throw shows the hero's saves as marks. A die
// a lasting spell adds or takes away is a term of its own, named for the spell: + 3 Bless, − 2 Bane.
// Reduced motion shows the result at once. A roll still to make shows the dice as a button that makes it.

import { Fragment, useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { D20Solid } from "./d20"
import { rattle, verdict as sound, type Verdict } from "./dice-sound"
import { eyebrow } from "./hud"
import { DeathSaveMarks, RollDetails } from "./roll-parts"
import { againstLabel, askSpeech, isCritical, marginText, modeName, type RollAsk, type RollView, rollHeading, rollSpeech, verdictOf } from "./roll-view"

// When each part arrives, in ms from the start: the die lands, the total follows, then the verdict.
const LAND = 1250
const TOTAL = LAND + 350
const VERDICT = TOTAL + 450
export const ROLL_SECONDS = (VERDICT + 900) / 1000

const CRITICAL = "#ffd88a"

// `onRoll` makes a roll still to make, and `onVerdict` hears when the verdict is in.
export function RollResult({ roll, compact = false, onRoll, onVerdict }: { roll: RollView | RollAsk; compact?: boolean; onRoll?: () => void; onVerdict?: () => void }) {
  const made = "natural" in roll ? roll : null
  const natural = made?.natural
  const dice = made ? (made.dice && made.dice.length > 1 ? made.dice : [made.natural]) : roll.mode ? [0, 0] : [0]
  const kept = made ? dice.indexOf(made.natural) : 0
  const diceKey = dice.join()
  const crit = made ? isCritical(made) : false
  // A roll the player made here keeps its modifier in view from the start.
  const [asked] = useState(!made)
  const [step, setStep] = useState(0)
  const [faces, setFaces] = useState(() => dice.map(() => 1 + Math.floor(Math.random() * 20)))
  const [tumble, setTumble] = useState(0)
  const verdictRef = useRef(onVerdict)
  verdictRef.current = onVerdict
  // The verdict's cue, read when it sounds: the engine's answer can change a verdict made on the card.
  const cue = useRef<Verdict>("success")
  cue.current = crit ? "critical-success" : made?.success ? "success" : "failure"
  useEffect(() => {
    if (natural === undefined) return
    const landing = diceKey.split(",").map(Number)
    const done = () => {
      setStep(3)
      sound(cue.current)
      verdictRef.current?.()
    }
    if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFaces(landing)
      return done()
    }
    setTumble((k) => k + 1)
    const hush = rattle()
    // The number flickers while the die tumbles, slowing as it settles.
    const timers: ReturnType<typeof setTimeout>[] = []
    let at = 0
    for (let delay = 45; at + delay < LAND; delay *= 1.14) {
      at += delay
      timers.push(setTimeout(() => setFaces(landing.map(() => 1 + Math.floor(Math.random() * 20))), at))
    }
    timers.push(
      setTimeout(() => {
        setFaces(landing)
        setStep(1)
        hush()
      }, LAND)
    )
    timers.push(setTimeout(() => setStep(2), TOTAL))
    timers.push(setTimeout(done, VERDICT))
    return () => {
      for (const t of timers) clearTimeout(t)
      hush()
    }
  }, [natural, diceKey])

  const verdict = made ? verdictOf(made) : ""
  const margin = made ? marginText(made) : ""
  const tone = crit ? CRITICAL : made?.success ? "#b7d38a" : "#e39a7c"
  const landed = step >= 1
  const two = dice.length > 1
  const size = two ? (compact ? 56 : 84) : compact ? 72 : 112
  const mod = roll.modifier ?? 0
  const inspired = made?.inspired
  const adds = made?.adds ?? []
  // A Death Saving Throw's marks: the saves so far before the roll, and after it once the verdict is in.
  const saves = roll.kind === "death" ? (made ? (step >= 3 ? made.deathSaves : undefined) : roll.deathSaves) : undefined
  const term = (sign: string, n: number, label?: string, show = true) => (
    <span className={cn("transition-opacity duration-300", show ? "opacity-100" : "opacity-0")}>
      <span className={cn("text-stage-muted", compact ? "text-[14px]" : "text-[18px]")}>{sign}</span>
      <span className={cn("ml-2", compact ? "text-[18px]" : "text-[24px]", label && "text-stage-gold")}>{n}</span>
      {label && <span className={cn(eyebrow, "ml-1 align-middle text-stage-muted", compact && "text-[7px]")}>{label}</span>}
    </span>
  )

  return (
    <div className={cn("flex items-center", compact ? "gap-3" : "gap-5")}>
      {made && <span className="sr-only">{rollSpeech(made)}</span>}
      {/* The dice, the kept one glowing in the verdict's colour once it lands and the other dimmed. Before the roll they are the button. */}
      <button
        type="button"
        onClick={onRoll}
        disabled={!onRoll || Boolean(made)}
        aria-label={made ? undefined : `Roll ${two ? "two d20s" : "the d20"} for ${roll.character.split(" ")[0]}'s ${askSpeech(roll)}`}
        aria-hidden={made ? true : undefined}
        className={cn("flex shrink-0 disabled:cursor-default", compact ? "gap-1" : "gap-2", !made && "transition-transform enabled:hover:scale-105")}
      >
        {dice.map((_, i) => {
          const dropped = landed && two && i !== kept
          const gold = crit && landed && !dropped
          return (
            <span key={i} className={cn("relative grid place-items-center transition-[opacity,filter] duration-500", dropped && "opacity-35 grayscale")} style={{ width: size, height: size }}>
              {gold && step >= 3 && <span className="roll-rays absolute -inset-6 rounded-full" />}
              <span
                className="absolute inset-0 transition-[filter] duration-500"
                style={{
                  filter:
                    landed && !dropped
                      ? `drop-shadow(0 0 ${crit ? 22 : 12}px ${tone}${crit ? "cc" : "80"}) drop-shadow(0 3px 6px #000c)`
                      : made
                        ? "drop-shadow(0 3px 6px #000c)"
                        : "drop-shadow(0 0 12px #e3b67c40) drop-shadow(0 3px 6px #000c)",
                }}
              >
                <D20Solid size={size} roll={tumble} tone={gold ? "gold" : undefined} />
              </span>
              {made ? (
                <span
                  key={landed ? "landed" : faces[i]}
                  className={cn(
                    "relative font-serif font-bold leading-none tabular-nums",
                    // Dark on the gold die.
                    gold ? "text-[#3a220c] [text-shadow:0_1px_0_#ffe8b080]" : "text-stage-parchment [text-shadow:0_1px_4px_#000,0_0_2px_#000]",
                    landed ? "d20-land" : "d20-flip",
                    dropped && "line-through decoration-2",
                    two ? (compact ? "text-[20px]" : "text-[32px]") : compact ? "text-[24px]" : "text-[40px]"
                  )}
                >
                  {faces[i]}
                </span>
              ) : (
                <span className={cn("relative font-sans leading-none tracking-[0.2em] text-stage-parchment [text-shadow:0_1px_3px_#000d]", compact ? "text-[9px]" : "text-[11px]")}>ROLL</span>
              )}
            </span>
          )
        })}
      </button>

      <div className="min-w-0 flex-1" aria-hidden="true">
        <div className={cn(eyebrow, "flex items-center gap-2")}>
          {roll.portrait && (
            // biome-ignore lint/performance/noImgElement: portrait art from the stage assets
            <img src={roll.portrait} alt="" className="h-6 w-6 shrink-0 rounded-full border border-stage-gold/60 object-cover object-top" />
          )}
          <span className="line-clamp-2 leading-[1.5]">{rollHeading(roll, roll.character.split(" ")[0])}</span>
        </div>
        {roll.mode && (
          <div className={cn("truncate font-serif text-stage-muted italic", compact ? "text-[11px]" : "mt-1 text-[13px]")}>
            <span className="font-semibold text-stage-gold not-italic">{modeName(roll.mode)}</span>
            {roll.reasons?.length ? ` · ${roll.reasons.join(", ")}` : ""}
          </div>
        )}
        {/* natural + modifier + an Inspiration die + the dice of lasting spells = total, against the DC or the Armor Class. */}
        <div className={cn("flex items-baseline gap-2 font-serif font-semibold tabular-nums text-stage-cream", compact ? "mt-0.5" : "mt-1.5")}>
          <span className={cn(compact ? "text-[18px]" : "text-[24px]", !landed && "opacity-30")}>{landed ? natural : "?"}</span>
          {roll.modifier !== undefined && term(mod < 0 ? "−" : "+", Math.abs(mod), undefined, step >= 2 || asked)}
          {inspired !== undefined && term("+", inspired, "Inspiration", step >= 2)}
          {adds.map((a, i) => (
            <Fragment key={i}>{term(a.amount < 0 ? "−" : "+", Math.abs(a.amount), a.from, step >= 2)}</Fragment>
          ))}
          <span className={cn("transition-opacity duration-300", step >= 2 ? "opacity-100" : "opacity-0")}>
            <span className={cn("text-stage-muted", compact ? "text-[14px]" : "text-[18px]")}>=</span>
            <span className={cn("ml-2 font-bold text-stage-gold", compact ? "text-[26px]" : "text-[38px]", step >= 2 && "roll-rise")}>{made?.total}</span>
          </span>
          <span
            className={cn(
              "ml-auto shrink-0 self-center rounded-sm border border-stage-line/25 font-sans tracking-[0.2em] text-stage-muted uppercase",
              compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]"
            )}
          >
            {againstLabel(roll.kind)} <span className={cn("font-serif font-semibold tracking-normal text-stage-cream", compact ? "text-[13px]" : "text-[17px]")}>{roll.dc}</span>
          </span>
        </div>
        {/* The verdict, stamped in, and by how much the roll made or missed its number. Silent until the die has landed. */}
        {made && (
          <div className={cn("flex items-center gap-3", compact ? "mt-1" : "mt-2", step >= 3 ? "opacity-100" : "opacity-0")}>
            <span
              className={cn(
                "roll-stamp inline-block shrink-0 whitespace-nowrap rounded-[3px] border-2 font-display font-bold tracking-[0.1em] [word-spacing:0.35em] uppercase",
                compact ? "px-2 py-0 text-[10px]" : crit ? "px-2.5 py-0.5 text-[15px]" : "px-3 py-0.5 text-[15px]",
                step >= 3 && "roll-stamp-in"
              )}
              style={{ color: tone, borderColor: tone, boxShadow: `0 0 ${crit ? 18 : 10}px ${tone}55, inset 0 0 8px ${tone}33`, textShadow: `0 0 8px ${tone}66` }}
            >
              {verdict}
            </span>
            {margin && <span className={cn("min-w-0 truncate font-serif text-stage-muted italic", compact ? "text-[11px]" : "text-[13px]")}>{margin}</span>}
          </div>
        )}
        {saves && (
          <div className={compact ? "mt-1" : "mt-2"}>
            <DeathSaveMarks saves={saves} compact={compact} />
          </div>
        )}
        {made && step >= 3 && <RollDetails roll={made} compact={compact} className={cn("fade-in", compact ? "mt-1" : "mt-2")} />}
      </div>
    </div>
  )
}
