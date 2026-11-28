"use client"

// A dice roll, in the narration as the hero of its paragraph and on the card where the player makes it. The die takes
// the centre, over a pool of light: each face carries its number, and it tumbles and comes to rest on the one rolled,
// with a ring thrown out as it lands. The modifier and the total follow against the DC, or an attack's Armor Class,
// and the verdict slams in under them, with what the roll did. A roll with Advantage or Disadvantage throws two dice:
// the one kept stays lit and the other dims. A Critical Hit turns the kept die gold, with rays behind it. A natural 20
// or 1 has no special look on a check or a save. A Death Saving Throw shows the hero's saves as marks. A die a lasting
// spell adds or takes away is a term of its own, named for the spell: + 3 Bless, − 2 Bane.
// A roll still to make turns slowly and says what the die has to show, and the dice are the button that makes it.
// The roll is one timeline: a quick pace runs it faster, and a tap cuts it short, first to the verdict and then to its
// end. Reduced motion shows the result at once. On a screen too short for all that, the die sits to the left of its
// words, and a compact roll is that at a smaller size.

import { Fragment, useRef, useState } from "react"
import { Button } from "../button"
import { gsap, prefersReducedMotion, useGSAP } from "../motion"
import { Presence } from "../presence"
import { cn } from "../utils"
import { D20Solid } from "./d20"
import { rattle, verdict as sound, type Verdict } from "../sound/dice"
import { eyebrow, useShort } from "./hud"
import type { RollPace } from "./roll-pace"
import type { RollPhase } from "./roll-phase"
import { DeathSaveMarks, RollDetails } from "./roll-parts"
import { againstLabel, askSpeech, isCritical, marginText, modeName, type RollAsk, type RollView, rollHeading, rollNeed, rollSpeech, verdictOf } from "./roll-view"
import { ROLL_CRITICAL, ROLL_FAILURE, ROLL_SUCCESS, ROLL_WAITING } from "./roll-tones"

// When each part arrives, in seconds from the throw: the die lands, the total follows, then the verdict, which is
// given a moment.
const LAND = 1.25
const TOTAL = LAND + 0.35
const VERDICT = TOTAL + 0.45
const HOLD = 0.9
// A quick roll plays this many times faster.
const QUICK = 1.75
// A tap this soon after the throw is the throw's own, not one to cut the roll short.
const TAP_AFTER = 0.25
export const ROLL_SECONDS = VERDICT + HOLD

/** How long a roll is on show at its pace. A Death Saving Throw is never quick, and a Critical Hit is quick only until
 *  its die lands. */
export function rollSeconds(roll: Pick<RollView, "kind" | "success" | "critical">, pace: RollPace = "full") {
  if (pace === "full" || roll.kind === "death") return ROLL_SECONDS
  return isCritical(roll) ? LAND / QUICK + ROLL_SECONDS - LAND : ROLL_SECONDS / QUICK
}

const CRITICAL = ROLL_CRITICAL
// The light under a die still to land.
const WAITING = ROLL_WAITING

// `onRoll` makes a roll still to make, and `onVerdict` hears when the verdict is in.
export function RollResult({
  roll,
  compact = false,
  pace = "full",
  onRoll,
  onVerdict,
}: {
  roll: RollView | RollAsk
  compact?: boolean
  pace?: RollPace
  onRoll?: () => void
  onVerdict?: () => void
}) {
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
  const [phase, setPhase] = useState<RollPhase>("rolling")
  const [tumble, setTumble] = useState(0)
  const verdictRef = useRef(onVerdict)
  verdictRef.current = onVerdict
  // The verdict's cue, read when it sounds: the engine's answer can change a verdict made on the card.
  const cue = useRef<Verdict>("success")
  cue.current = crit ? "critical-success" : made?.success ? "success" : "failure"
  // The engine's answer can make a roll thrown on the card a Critical Hit, so this too is read as the die lands.
  const critNow = useRef(crit)
  critNow.current = crit
  const speed = pace === "quick" && roll.kind !== "death" ? QUICK : 1
  const root = useRef<HTMLDivElement>(null)
  const run = useRef<gsap.core.Timeline | null>(null)
  // The total counts up from the die to itself as it arrives.
  const [counted, setCounted] = useState<number>()
  useGSAP(
    () => {
      if (natural === undefined || total === undefined) return
      const done = () => {
        setPhase("verdict")
        sound(cue.current)
        verdictRef.current?.()
      }
      // Nothing is hidden first, and the die shows its face itself when there is no tumble.
      if (prefersReducedMotion()) return done()
      setPhase("rolling")
      setTumble((k) => k + 1)
      const hush = rattle()
      const q = gsap.utils.selector(root)
      // What arrives later is out of sight until its moment.
      gsap.set(q("[data-late]"), { autoAlpha: 0 })
      const tl = gsap.timeline({ defaults: { overwrite: "auto", immediateRender: false } }).timeScale(speed)
      run.current = tl
      tl.addLabel("land", LAND)
        .call(
          () => {
            setPhase("landed")
            hush()
            // A Critical Hit is given its full time from here.
            if (critNow.current) tl.timeScale(1)
          },
          [],
          "land"
        )
        .fromTo(q("[data-late=shock]"), { autoAlpha: 1, scale: 0.5 }, { autoAlpha: 0, scale: 2.1, duration: 0.55, ease: "power1.out" }, "land")
        .fromTo(q("[data-roll=kept]"), { scale: 1.16 }, { scale: 1, duration: 0.34, ease: "back.out(2.6)", clearProps: "transform" }, "land")
      const count = { n: natural }
      tl.addLabel("total", TOTAL)
        .call(() => setPhase("totalled"), [], "total")
        .to(q("[data-late=term]"), { autoAlpha: 1, duration: 0.3, ease: "power1.out", clearProps: "opacity,visibility" }, "total")
        .fromTo(q("[data-roll=total]"), { y: 6, scale: 0.9 }, { y: 0, scale: 1, duration: 0.35, ease: "back.out(1.7)", clearProps: "transform" }, "total")
        .to(count, { n: total, duration: 0.3, ease: "none", onUpdate: () => setCounted(Math.round(count.n)) }, "total")
      tl.addLabel("verdict", VERDICT)
        .call(done, [], "verdict")
        .fromTo(
          q("[data-late=verdict]"),
          { autoAlpha: 0, scale: 1.7, filter: "blur(5px)" },
          { autoAlpha: 1, scale: 1, filter: "blur(0px)", duration: 0.4, ease: "back.out(1.7)", clearProps: "opacity,visibility,transform,filter" },
          "verdict"
        )
      const after = q("[data-late=after]")
      if (after.length) tl.to(after, { autoAlpha: 1, duration: 0.2, ease: "power1.out", clearProps: "opacity,visibility" }, "verdict")
      return () => {
        hush()
        run.current = null
      }
    },
    { dependencies: [natural, diceKey], scope: root, revertOnUpdate: true }
  )
  // Rays fade in behind a Critical Hit and turn a little way, slowing to a stop. With reduced motion they are there
  // and still.
  const verdictIn = phase === "verdict"
  const shining = crit && verdictIn
  useGSAP(
    () => {
      const rays = gsap.utils.toArray<HTMLElement>("[data-roll=rays]", root.current)
      if (!shining || !rays.length || prefersReducedMotion()) return
      gsap.from(rays, { autoAlpha: 0, duration: 1.4, ease: "power1.out" })
      gsap.to(rays, { rotation: 90, duration: 5, ease: "power1.out" })
    },
    { dependencies: [shining], scope: root, revertOnUpdate: true }
  )
  // A tap cuts the roll short: to the verdict, and a tap on the verdict to its end.
  const skip = () => {
    const tl = run.current
    if (!tl || tl.progress() === 1 || tl.time() < TAP_AFTER) return
    if (tl.time() < tl.labels.verdict) tl.seek("verdict", false)
    else tl.progress(1)
  }

  const verdict = made ? verdictOf(made) : ""
  const margin = made ? marginText(made) : ""
  const tone = crit ? CRITICAL : made?.success ? ROLL_SUCCESS : ROLL_FAILURE
  const landed = phase !== "rolling"
  const two = dice.length > 1
  const size = two ? (compact ? 56 : row ? 84 : 104) : compact ? 72 : row ? 112 : 132
  const mod = roll.modifier ?? 0
  const inspired = made?.inspired
  const adds = made?.adds ?? []
  const first = roll.character.split(" ")[0]
  const need = made ? null : rollNeed(roll)
  const waiting = !made && Boolean(onRoll)
  // A Death Saving Throw's marks: the saves so far before the roll, and after it once the verdict is in.
  const saves = roll.kind === "death" ? (made ? (verdictIn ? made.deathSaves : undefined) : roll.deathSaves) : undefined
  // A `late` term arrives with the total.
  const term = (sign: string, n: number, label?: string, late = true) => (
    <span data-late={late ? "term" : undefined}>
      <span className={cn("text-muted-foreground", compact ? "text-sm" : "text-base")}>{sign}</span>
      <span className={cn("ml-2", compact ? "text-base" : "text-xl", label && "text-accent")}>{n}</span>
      {label && <span className={cn(eyebrow, "ml-1 align-middle text-muted-foreground", compact && "text-4xs")}>{label}</span>}
    </span>
  )
  // Who rolls what, and what gives the roll Advantage or Disadvantage.
  const heading = (
    <>
      <div className={cn("flex items-center gap-2", row ? eyebrow : "justify-center font-serif text-sm leading-[1.4] text-foreground")}>
        {roll.portrait && (
          <img src={roll.portrait} alt="" className="h-6 w-6 shrink-0 rounded-full border border-accent/60 object-cover object-top" />
        )}
        <span className={cn("line-clamp-2", row && "leading-[1.5]")}>{rollHeading(roll, first)}</span>
      </div>
      {roll.mode && (
        <div className={cn("truncate font-serif text-muted-foreground italic", compact ? "text-3xs" : row ? "mt-1 text-xs" : "mt-0.5 text-xs")}>
          <span className="font-semibold text-accent not-italic">{modeName(roll.mode)}</span>
          {roll.reasons?.length ? ` · ${roll.reasons.join(", ")}` : ""}
        </div>
      )}
    </>
  )

  return (
    <div ref={root} onClick={skip} className={cn("flex", compact ? "items-center gap-3" : row ? "items-center gap-5" : "flex-col items-center text-center")}>
      {made && <span className="sr-only">{rollSpeech(made)}</span>}
      {!row && (
        <div className="max-w-full" aria-hidden="true">
          {heading}
        </div>
      )}
      {/* The dice, each over its pool of light, which takes the verdict's colour under the one kept. Before the roll they are the button. */}
      <Button
        variant="plain"
        type="button"
        onClick={onRoll}
        disabled={!onRoll || Boolean(made)}
        aria-label={made ? undefined : `Roll ${two ? "two d20s" : "the d20"} for ${first}'s ${askSpeech(roll)}`}
        aria-hidden={made ? true : undefined}
        className={cn("relative flex shrink-0 justify-center disabled:cursor-default", compact ? "gap-1" : row ? "gap-2" : "mt-1 gap-3", waiting && "transition-transform enabled:hover:scale-105", made && "pointer-events-none")}
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
              {gold && verdictIn && <span data-roll="rays" className="roll-rays absolute -inset-6 rounded-full" />}
              {waiting && <span className="roll-pulse pointer-events-none absolute top-0 left-0 rounded-full border border-accent/55" style={{ width: size, height: size }} />}
              {made && i === kept && <span data-late="shock" className="pointer-events-none absolute top-0 left-0 rounded-full border-2" style={{ width: size, height: size, borderColor: tone }} />}
              <span data-roll={i === kept ? "kept" : undefined} className="absolute top-0 left-0 transition-[filter] duration-500" style={{ filter: `${glow}drop-shadow(0 3px 6px #000c)` }}>
                <D20Solid size={size} roll={tumble} seconds={LAND / speed} tone={gold ? "gold" : undefined} numbered face={n || undefined} idle={!made} landed={landed} />
              </span>
            </span>
          )
        })}
        <Presence show={waiting} motion="fade" initial={false} asChild>
          <span className={cn(eyebrow, "pointer-events-none absolute inset-x-0", compact ? "-bottom-2.5 text-4xs" : row ? "-bottom-3.5" : "bottom-0.5 text-3xs")}>Roll</span>
        </Presence>
      </Button>

      <div className={cn("min-w-0", row ? "flex-1" : "w-full")} aria-hidden="true">
        {row && heading}
        {/* Before the roll, what the die has to show. After it: natural + modifier + an Inspiration die + the dice of
            lasting spells = total. Both against the DC or the Armor Class. */}
        <div
          className={cn(
            "flex gap-2 font-serif font-semibold tabular-nums text-foreground",
            compact ? "mt-0.5 items-baseline" : row ? "mt-1.5 items-baseline" : "min-h-11 flex-wrap items-baseline justify-center gap-y-0"
          )}
        >
          {need ? (
            <span className={cn("font-normal", compact ? "text-2xs" : "text-sm")}>
              Roll <span className={cn("mx-0.5 font-bold text-accent", compact ? "text-base" : "text-xl")}>{need.number}</span> {need.words}
            </span>
          ) : (
            <>
              <span className={cn(compact ? "text-base" : "text-xl", !landed && "opacity-30")}>{landed ? natural : "?"}</span>
              {roll.modifier !== undefined && term(mod < 0 ? "−" : "+", Math.abs(mod), undefined, !asked)}
              {inspired !== undefined && term("+", inspired, "Inspiration")}
              {adds.map((a, i) => (
                <Fragment key={i}>{term(a.amount < 0 ? "−" : "+", Math.abs(a.amount), a.from)}</Fragment>
              ))}
              <span data-late="term">
                <span className={cn("text-muted-foreground", compact ? "text-sm" : "text-base")}>=</span>
                <span data-roll="total" className={cn("ml-2 inline-block font-bold text-accent", compact ? "text-2xl" : "text-4xl")}>
                  {verdictIn ? total : (counted ?? natural)}
                </span>
              </span>
            </>
          )}
          <span
            className={cn(
              "shrink-0 self-center rounded-sm border border-foreground/25 font-sans font-normal tracking-label text-muted-foreground uppercase",
              compact ? "ml-auto px-1.5 py-0.5 text-4xs" : row ? "ml-auto px-2 py-1 text-4xs" : "ml-1.5 px-2 py-1 text-4xs"
            )}
          >
            {againstLabel(roll.kind)} <span className={cn("font-serif font-semibold tracking-normal text-foreground", compact ? "text-xs" : "text-base")}>{roll.dc}</span>
          </span>
        </div>
        {/* The verdict, slammed in between two rules, and by how much the roll made or missed its number. Silent until the die has landed. */}
        {made && (
          <>
            <div className={cn("flex items-center", compact ? "mt-1 gap-3" : row ? "mt-2 gap-3" : "h-10 justify-center gap-3.5")}>
              {!row && <span data-late="after" className="h-px w-12 shrink" style={{ background: `linear-gradient(90deg, transparent, ${tone})` }} />}
              <span
                data-late="verdict"
                className={cn("inline-block shrink-0 whitespace-nowrap font-display font-bold tracking-wide uppercase", compact ? "text-xs" : row ? "text-base" : crit ? "text-xl" : "text-2xl")}
                style={{ color: tone, textShadow: `0 0 ${row ? 10 : 20}px ${tone}8c` }}
              >
                {verdict}
              </span>
              {!row && <span data-late="after" className="h-px w-12 shrink" style={{ background: `linear-gradient(270deg, transparent, ${tone})` }} />}
              {row && margin && <span data-late="after" className={cn("min-w-0 truncate font-serif text-muted-foreground italic", compact ? "text-3xs" : "text-xs")}>{margin}</span>}
            </div>
            {!row && <div data-late="after" className="min-h-[18px] font-serif text-xs leading-[18px] text-muted-foreground italic">{margin}</div>}
          </>
        )}
        {saves && (
          <div className={cn("flex", compact ? "mt-1" : row ? "mt-2" : "mt-2 justify-center")}>
            <DeathSaveMarks saves={saves} compact={compact} />
          </div>
        )}
        {made && verdictIn && <RollDetails roll={made} compact={compact} className={cn("enter-fade", compact ? "mt-1" : row ? "mt-2" : "mt-1.5 items-center")} />}
      </div>
    </div>
  )
}
