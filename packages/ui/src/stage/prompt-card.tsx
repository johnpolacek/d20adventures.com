"use client"

// The GM card: the prototype's "GM note", grown into the turn's input. It sits low and centred over the stage and changes
// with the turn: whose turn it is and what the GM asks (with the party's portraits and a reply box), the dice roll the GM
// calls for and how it came out while the GM answers it, the GM writing (with a changing line of what it is up to), and
// the end of the encounter.

import { ArrowUp } from "lucide-react"
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react"
import { Button } from "../button"
import { gsap, prefersReducedMotion } from "../motion"
import { Presence, Swap } from "../presence"
import { Textarea } from "../textarea"
import { Tip } from "../tooltip"
import { cn, entrance, type MotionProps, staggered } from "../utils"
import { D20Solid } from "./d20"
import { rattle } from "../sound/dice"
import { Chevron, eyebrow, Pill } from "./hud"
import type { RollPace } from "./roll-pace"
import { contestReducer, initialContestPhase, type SingleDieState } from "./roll-phase"
import { RollResult } from "./roll-result"
import { type DeathSavesView, keptDie, modeName, type RollAsk, type RollKind, type RollMode, type RollView, thrownView } from "./roll-view"
import { type Standing, standingWords } from "./standing"

export interface CardCharacter {
  id: string
  name: string
  role: string
  portrait?: string
  // How a hero stands: their hit points and Armor Class, or down.
  standing?: Standing
}
export interface CardRoll {
  // A check or a save, an attack, or a Death Saving Throw.
  kind: RollKind
  skill: string
  // A Difficulty Class, or for an attack the Armor Class of who is attacked.
  dc: number
  modifier: number
  // An attack: who is attacked, by name.
  target?: string
  // A spell attack: the spell's name, which is also its `skill`.
  spell?: string
  // A Death Saving Throw: the hero's saves so far.
  deathSaves?: DeathSavesView
  // Advantage or Disadvantage: two d20s, the higher or the lower kept, and what gives it.
  mode?: RollMode
  reasons?: string[]
  // A contest: the opposing roll, made by the GM on the card first; the player has to meet or beat its total (dc).
  versus?: { name: string; skill: string; natural: number; modifier: number }
}
// A reply offered to the player: a few words for its chip, and the reply itself.
export interface CardSuggestion {
  label: string
  text: string
}
// `suggestions` are chips over the reply box that fill it in, blank while they are being written. `suggestion` is
// the demo's one scripted reply, behind its Suggest button.
// A roll's `made` is its d20s once it is made (two with Advantage or Disadvantage), and `resolving` says the GM is still
// answering it. `result` is the engine's answer once it is in: the verdict as the rules read it, and what the roll did.
// A thinking card's `who` is the NPC or AI hero the GM is playing, shown with their portrait, by the name to call them.
export type CardMode =
  | { kind: "hold"; prompt: string; suggestion?: string; suggestions?: CardSuggestion[] | "loading" }
  | { kind: "roll"; roll: CardRoll; prompt?: string; made?: number[]; resolving?: boolean; result?: RollView }
  | { kind: "thinking"; note?: string; who?: CardCharacter }
  | { kind: "done"; next: string }

// What the GM is up to while it writes, one line at a time from a shuffled run, or the card's own note if it has one.
const MUSINGS = [
  "Consulting the ancient tomes…",
  "Rolling behind the screen…",
  "Shuffling the encounter tables…",
  "Sharpening a pencil…",
  "Flipping through the bestiary…",
  "Muttering about initiative…",
  "Checking the map twice…",
  "Weighing what you said…",
  "Asking the dice nicely…",
  "Bribing the fates…",
  "Lighting another candle…",
  "Pouring more ink…",
  "Stroking a long beard…",
  "Rearranging the miniatures…",
  "Hiding a grin…",
  "Counting the torches left…",
  "Reading the tea leaves…",
  "Whispering to the dungeon…",
  "Rerolling, just to be sure…",
  "Consulting the oracle…",
  "Scribbling in the margins…",
  "Checking who is still standing…",
  "Listening at the door…",
  "Polishing the d20…",
  "Moving the monsters around…",
  "Deciding how much it hurts…",
  "Looking up the rules…",
  "Finding an old note…",
  "Sketching the next scene…",
  "Tallying the gold…",
  "Pretending not to cheat…",
  "Asking the tavernkeeper…",
  "Checking for traps…",
  "Weaving the next thread…",
  "Stirring the cauldron…",
  "Unrolling a fresh scroll…",
]
const MUSING_MS = 3200
const MUSING_OUT_MS = 350

function GmMusing({ note }: { note?: string }) {
  const [order] = useState(() => MUSINGS.map((_, i) => i).sort(() => Math.random() - 0.5))
  const [at, setAt] = useState(0)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    if (note) return
    let out: ReturnType<typeof setTimeout> | undefined
    const every = setInterval(() => {
      setLeaving(true)
      out = setTimeout(() => {
        setAt((n) => n + 1)
        setLeaving(false)
      }, MUSING_OUT_MS)
    }, MUSING_MS)
    return () => {
      clearInterval(every)
      clearTimeout(out)
    }
  }, [note])
  const line = note ?? MUSINGS[order[at % order.length]]
  return (
    <div key={line} className={cn("mt-1.5 font-serif text-sm text-accent-soft italic", leaving ? "gm-musing-out" : "gm-musing-in")}>
      {line}
    </div>
  )
}

// The card's look: dark glass with a warm glow at the top, where the hero's portrait sits.
const candlelit =
  "stage-grain rounded-xl border border-accent/20 bg-panel/95 shadow-[0_30px_60px_#000a,inset_0_1px_0_color-mix(in_srgb,var(--color-accent)_20%,transparent)] backdrop-blur-xl before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:bg-[radial-gradient(ellipse_60%_45%_at_50%_0,color-mix(in_srgb,var(--color-accent)_15%,transparent),transparent_70%)]"
// A hero's choices: ghost pills in the serif.
const choice =
  "rounded-full border border-foreground/20 px-4 py-1.5 font-serif text-sm text-foreground/85 italic transition-[color,background-color,border-color,scale] duration-150 ease-snap hover:border-accent hover:bg-accent/10 hover:text-accent"

// The hero whose turn it is, a gold ring breaking the card's top edge, with the rest of the party in smaller rings
// beside it to switch to.
function HeroRing({ party, actor, compact, onPick }: { party: CardCharacter[]; actor: CardCharacter; compact: boolean; onPick: (id: string) => void }) {
  const ring = (c: CardCharacter, big: boolean) => (
    <Button
      variant="plain"
      key={c.id}
      type="button"
      onClick={() => onPick(c.id)}
      aria-label={c.standing ? `${c.name}, ${standingWords(c.standing)}` : c.name}
      aria-current={big || undefined}
      className={cn(
        "m-0 shrink-0 overflow-hidden rounded-full bg-background transition-[opacity,scale] duration-150 ease-snap active:scale-95",
        big ? "shadow-[0_0_0_2px_#000,0_0_0_3px_var(--color-accent),0_0_36px_color-mix(in_srgb,var(--color-accent)_27%,transparent)]" : "opacity-60 shadow-[0_0_0_2px_#000,0_0_0_3px_color-mix(in_srgb,var(--color-accent)_40%,transparent)] hover:opacity-90",
        big ? (compact ? "h-11 w-11" : "h-[88px] w-[88px]") : compact ? "h-7 w-7" : "h-11 w-11"
      )}
    >
      {c.portrait && (
        <img src={c.portrait} alt="" className="block h-full w-full object-cover object-top [filter:sepia(.2)_saturate(.88)]" />
      )}
    </Button>
  )
  const at = party.findIndex((c) => c.id === actor.id)
  const before = at < 0 ? [] : party.slice(0, at)
  const after = at < 0 ? party : party.slice(at + 1)
  return (
    <div className={cn("absolute inset-x-0 flex items-center justify-center", compact ? "-top-6 gap-2" : "-top-11 gap-3")}>
      {before.map((c) => ring(c, false))}
      {ring(actor, true)}
      {after.map((c) => ring(c, false))}
    </div>
  )
}

// A d20 in the stage's colours: a real 3D die with its numbers on its faces, which turns slowly until it is thrown,
// then tumbles and comes to rest on its roll; it lands on `land` when given and reports the natural roll. The GM's die
// rolls itself.
// The second die of a pair rolls with the first: `onStart` says one was thrown and `go` throws the other. A `dropped`
// die, the one not kept, dims once it lands.
function D20({
  onRoll,
  compact,
  land,
  auto = false,
  disabled = false,
  go = false,
  onStart,
  dropped = false,
}: {
  onRoll: (n: number) => void
  compact: boolean
  land?: number
  auto?: boolean
  disabled?: boolean
  go?: boolean
  onStart?: () => void
  dropped?: boolean
}) {
  const [dieState, setDieState] = useState<SingleDieState>({ kind: "ready" })
  const [tumble, setTumble] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const started = useRef(false)
  const hush = useRef(() => {})
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      hush.current()
    },
    []
  )
  const roll = () => {
    if (started.current) return
    started.current = true
    onStart?.()
    const n = land ?? 1 + Math.floor(Math.random() * 20)
    const settle = () => {
      setDieState({ kind: "landed", face: n })
      hush.current()
      onRoll(n)
    }
    // With reduced motion the die shows its face at once.
    if (prefersReducedMotion()) return settle()
    setDieState({ kind: "rolling", face: n })
    setTumble((k) => k + 1)
    hush.current = rattle()
    timer.current = setTimeout(settle, 1200)
  }
  // The GM's die rolls once, shortly after the card appears.
  useEffect(() => {
    if (!auto) return
    const t = setTimeout(roll, 500)
    return () => clearTimeout(t)
  }, [auto])
  useEffect(() => {
    if (go) roll()
  }, [go])
  const face = dieState.kind === "ready" ? null : dieState.face
  const rolling = dieState.kind === "rolling"
  const done = dieState.kind === "landed"
  return (
    <Button
      variant="plain"
      type="button"
      onClick={roll}
      disabled={auto || disabled || rolling || done}
      aria-label={auto ? "The GM's roll" : "Roll the d20"}
      className={cn(
        "relative grid place-items-center [filter:drop-shadow(0_0_12px_#e3b67c40)_drop-shadow(0_3px_5px_#000b)] transition-[scale,opacity] duration-150 ease-snap enabled:hover:scale-105 enabled:active:scale-100 disabled:cursor-default",
        disabled && !done && "opacity-40",
        done && dropped && "opacity-35 grayscale",
        compact ? "h-16 w-16" : "h-[92px] w-[92px]"
      )}
    >
      <D20Solid size={compact ? 64 : 92} roll={tumble} numbered face={face ?? undefined} idle={face === null && !disabled} className={cn("absolute inset-0", done && "die-land")} />
      <Presence show={face === null && !auto} motion="fade" initial={false} asChild>
        <span className={cn(eyebrow, "pointer-events-none absolute inset-x-0", compact ? "-bottom-2.5 text-4xs" : "-bottom-3.5")}>Roll</span>
      </Presence>
    </Button>
  )
}

const signed = (n: number) => (n < 0 ? `\u2212${-n}` : `+${n}`)

function Total({ natural, modifier }: { natural: number | null; modifier: number }) {
  return (
    <div className="mt-2 font-serif text-xs text-accent-soft tabular-nums">
      {natural === null ? "\u00a0" : `${natural} ${modifier < 0 ? "\u2212" : "+"} ${Math.abs(modifier)} = ${natural + modifier}`}
    </div>
  )
}

// The roll, start to finish on one card: the player's d20, how it came out, the GM answering it, and Continue once
// the answer is in.
function SingleRoll({
  roll,
  prompt,
  actor,
  compact,
  forced,
  made,
  resolving,
  result,
  pace,
  onRoll,
  onContinue,
}: {
  roll: CardRoll
  prompt?: string
  actor: CardCharacter
  compact: boolean
  forced?: number[]
  made?: number[]
  resolving?: boolean
  result?: RollView
  pace?: RollPace
  onRoll: (dice: number[]) => void
  onContinue?: () => void
}) {
  const [mine, setMine] = useState<number[] | null>(null)
  const [verdict, setVerdict] = useState(false)
  const dice = made ?? mine
  // A Death Saving Throw shows no modifier unless it has one.
  const ask: RollAsk = {
    kind: roll.kind,
    character: actor.name,
    check: roll.skill,
    ...(roll.kind === "death" && roll.modifier === 0 ? {} : { modifier: roll.modifier }),
    dc: roll.dc,
    portrait: actor.portrait,
    mode: roll.mode,
    reasons: roll.reasons,
    target: roll.target,
    deathSaves: roll.deathSaves,
    ...(roll.spell ? { spell: roll.spell } : {}),
  }
  // The verdict as the dice read until the engine's answer is in.
  const shown: RollAsk | RollView = dice === null ? ask : result ? { ...result, portrait: actor.portrait, reasons: roll.reasons } : thrownView(ask, dice)
  const title = roll.kind === "attack" ? (roll.spell ? "Spell Attack" : "Attack Roll") : roll.kind === "death" ? "Death Saving Throw" : "Dice Roll"
  return (
    <div>
      <div className={eyebrow}>{dice === null ? `${title} Needed` : title}</div>
      {prompt && !compact && <p className="mx-auto mt-2 max-w-[440px] font-serif text-sm leading-[1.5] text-foreground">{prompt}</p>}
      <div className={cn("mx-auto max-w-[440px] text-left", compact ? "mt-1.5" : "mt-3")}>
        <RollResult
          compact={compact}
          roll={shown}
          pace={pace}
          onRoll={() => {
            const thrown = Array.from({ length: roll.mode ? 2 : 1 }, (_, i) => forced?.[i] ?? 1 + Math.floor(Math.random() * 20))
            setMine(thrown)
            onRoll(thrown)
          }}
          onVerdict={() => setVerdict(true)}
        />
      </div>
      {dice !== null && (
        <div className={cn("grid place-items-center", compact ? "mt-1.5 h-8" : "mt-3 h-11")}>
          {verdict && (
            <Swap id={resolving ? "resolving" : "continue"}>
              {resolving ? (
                <div className={cn(eyebrow, "animate-pulse")}>The GM is resolving the roll…</div>
              ) : (
                onContinue && (
                  <Button variant="epic" size="xs" className={cn("gap-1.5", compact ? "px-6" : "px-8 py-1.5 text-sm")} onClick={onContinue}>
                    Continue
                    <Chevron />
                  </Button>
                )
              )}
            </Swap>
          )}
        </div>
      )}
    </div>
  )
}

// A contest: the GM's roll for the other side first, then the player's d20, then how it came out.
function ContestRoll({
  roll,
  prompt,
  actor,
  compact,
  forced,
  onRoll,
}: {
  roll: CardRoll
  prompt?: string
  actor: CardCharacter
  compact: boolean
  forced?: number[]
  onRoll: (dice: number[]) => void
}) {
  const [contest, dispatch] = useReducer(contestReducer, Boolean(roll.versus), initialContestPhase)
  const reported = useRef(false)
  const onRollRef = useRef(onRoll)
  onRollRef.current = onRoll
  const count = roll.mode ? 2 : 1
  useEffect(() => {
    if (contest.kind === "resolved" && !reported.current) {
      reported.current = true
      onRollRef.current(contest.mine)
    }
  }, [contest])
  const theirs = contest.kind === "gm_rolling" ? null : contest.theirs
  const mine = contest.kind === "resolved" ? contest.mine : null
  const thrown = contest.kind === "player_rolling" || contest.kind === "resolved"
  const natural = mine === null ? null : keptDie(roll.mode, mine)
  const keep = mine === null ? -1 : mine.indexOf(natural ?? 0)
  const total = natural === null ? null : natural + roll.modifier
  const side = (name: string, skill: string, detail: string) => (
    <>
      <div className="text-4xs tracking-label text-accent uppercase">{name}</div>
      <div className={cn("font-display text-[#f3d6a6]", compact ? "text-base" : "mt-0.5 text-xl")}>{skill}</div>
      <div className="mb-2.5 text-4xs tracking-wide text-muted-foreground uppercase">{detail}</div>
    </>
  )
  return (
    <div>
      <div className={eyebrow}>Contest</div>
      {prompt && !compact && <p className="mx-auto mt-2 max-w-[440px] font-serif text-sm leading-[1.5] text-foreground">{prompt}</p>}
      <div className={cn("flex items-start justify-center", compact ? "mt-1 gap-4" : "mt-3 gap-7")}>
        {roll.versus && (
          <>
            <div className="flex flex-col items-center">
              {side(roll.versus.name, roll.versus.skill, `the GM rolls · ${signed(roll.versus.modifier)}`)}
              <D20 auto land={roll.versus.natural} compact={compact} onRoll={(natural) => dispatch({ type: "gm_landed", natural })} />
              <Total natural={theirs} modifier={roll.versus.modifier} />
            </div>
            <div className={cn("self-center font-display text-muted-foreground", compact ? "text-sm" : "text-lg")}>vs</div>
          </>
        )}
        <div className="flex flex-col items-center">
          {side(actor.name.split(" ")[0], roll.skill, signed(roll.modifier))}
          {roll.mode && (
            <div className="-mt-1.5 mb-2 max-w-[200px] truncate font-serif text-2xs text-muted-foreground italic">
              <span className="font-semibold text-accent not-italic">{modeName(roll.mode)}</span>
              {roll.reasons?.length ? ` · ${roll.reasons.join(", ")}` : ""}
            </div>
          )}
          <div className="flex gap-2">
            {Array.from({ length: count }, (_, i) => (
              <D20
                key={i}
                land={forced?.[i]}
                compact={compact}
                disabled={contest.kind === "gm_rolling"}
                go={thrown}
                onStart={() => dispatch({ type: "player_started", count })}
                dropped={count > 1 && keep !== -1 && i !== keep}
                onRoll={(n) => dispatch({ type: "player_die_landed", index: i, natural: n, count })}
              />
            ))}
          </div>
          <Total natural={natural} modifier={roll.modifier} />
        </div>
      </div>
      <div className={cn("mt-1 h-4 text-3xs tracking-label uppercase transition-opacity duration-150", total === null ? "opacity-0" : total >= roll.dc ? "text-roll-success" : "text-roll-failure")}>
        {total === null ? "" : `${total} against ${roll.dc} · ${total >= roll.dc ? "success" : "failure"}`}
      </div>
    </div>
  )
}

export function PromptCard({
  mode,
  actor,
  party,
  compact = false,
  onReply,
  onSkip,
  onRoll,
  onPick,
  onContinue,
  onTop,
  draft: draftProp,
  onDraft,
  forcedRoll,
  rollPace,
  demo = false,
  unworkable,
  className,
  style,
  onAnimationEnd,
}: MotionProps & {
  mode: CardMode
  actor: CardCharacter | null
  party: CardCharacter[]
  compact?: boolean
  onReply: (text: string) => void
  // Ends the hero's turn with no reply. Without it there is no Skip button.
  onSkip?: () => void
  // The d20s thrown: one, or two with Advantage or Disadvantage.
  onRoll: (dice: number[]) => void
  onPick: (id: string) => void
  // Leaves a roll once the GM has answered it. Without it the roll's card has no Continue button.
  onContinue?: () => void
  // The card's top edge, in px from the bottom of the screen, and its box (so the stage can frame shots around it).
  onTop?: (px: number, rect?: DOMRect) => void
  // The reply can be held by the caller (so it survives the card closing while the turn is replayed).
  draft?: string
  onDraft?: (text: string) => void
  // The player's d20s, fixed: a roll already made and kept, shown again, or a Stageview check's.
  forcedRoll?: number[]
  // How fast the roll on the card plays. In full without it.
  rollPace?: RollPace
  // A scripted demo: the reply can't be typed. The box stays disabled, with a note over it, until Suggest fills it in,
  // and the suggestion then can't be edited.
  demo?: boolean
  // The hero's spells with no one here to work on, each with why: "Speak with Animals works only on Beasts, and none is
  // here". A reply that names one asks first, so the player can keep the spell slot.
  unworkable?: readonly { spell: string; why: string }[]
}) {
  const [ownDraft, setOwnDraft] = useState("")
  const draft = onDraft ? (draftProp ?? "") : ownDraft
  const setDraft = onDraft ?? setOwnDraft
  const ref = useRef<HTMLElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !onTop) return
    // The card is reported where it comes to rest: its entrance moves it a little on the way in.
    const report = () => {
      const rect = el.getBoundingClientRect()
      const moved = new DOMMatrixReadOnly(getComputedStyle(el).transform)
      onTop(innerHeight - rect.top + moved.m42, new DOMRect(rect.x - moved.m41, rect.y - moved.m42, rect.width, rect.height))
    }
    const ro = new ResizeObserver(report)
    ro.observe(el)
    report()
    const settled = (e: AnimationEvent) => e.target === el && report()
    el.addEventListener("animationend", settled)
    return () => {
      ro.disconnect()
      el.removeEventListener("animationend", settled)
      onTop(0)
    }
  }, [onTop])
  const key = mode.kind === "hold" ? mode.prompt : mode.kind
  // A new prompt clears the card's own draft.
  useEffect(() => {
    if (!onDraft) setOwnDraft("")
  }, [key, onDraft])
  // The spell a reply names that has no one here to work on, held until the player edits the reply or sends it anyway.
  const [asking, setAsking] = useState<{ draft: string; why: string } | null>(null)
  const warning = asking?.draft === draft ? asking.why : null
  const send = (anyway = false) => {
    const text = draft.trim()
    if (!text) return
    const said = text.toLowerCase()
    const named = anyway ? undefined : unworkable?.find((entry) => said.includes(entry.spell.toLowerCase()))
    if (named) return setAsking({ draft, why: named.why })
    setAsking(null)
    onReply(text)
  }
  // When the suggestions change, as when the loading pills give way to real ones that wrap to a second row, the row
  // grows or shrinks to its new height and the new pills fade up, rather than the card jumping.
  const row = useRef<HTMLDivElement>(null)
  const rowHeight = useRef<number | null>(null)
  const suggestions = mode.kind === "hold" ? mode.suggestions : undefined
  const rowKey = suggestions === "loading" ? "loading" : (suggestions?.map((s) => s.text).join("\n") ?? "")
  // Pills that come with the card rise in one after another. Pills that take the place of others are tweened below.
  const first = useRef<string | null>(rowKey)
  if (rowHeight.current === null) first.current = rowKey
  else if (first.current !== rowKey) first.current = null
  const rising = first.current === rowKey
  useLayoutEffect(() => {
    const el = row.current
    if (!el) {
      rowHeight.current = null
      return
    }
    const from = rowHeight.current
    const to = el.offsetHeight
    rowHeight.current = to
    if (from === null || prefersReducedMotion()) return
    const tl = gsap.timeline()
    if (from !== to) tl.fromTo(el, { height: from, overflow: "hidden" }, { height: to, duration: 0.2, ease: "power2.out", clearProps: "height,overflow" }, 0)
    if (rowKey !== "loading") tl.from(el.children, { opacity: 0, y: 6, duration: 0.18, stagger: 0.03, ease: "power2.out", clearProps: "opacity,transform" }, 0.05)
    return () => {
      // Cut short by the next change: start that one from wherever this one got to. The new pills are in by now, so a
      // finished tween leaves the height it measured, which an inline height still mid-tween would overrule.
      if (tl.isActive()) rowHeight.current = el.offsetHeight
      tl.kill()
      gsap.set([el, ...el.children], { clearProps: "height,overflow,opacity,transform" })
    }
  }, [rowKey])
  return (
    <section
      ref={ref}
      className={cn(
        candlelit,
        "absolute left-1/2 z-raised -translate-x-1/2 text-center",
        compact ? "bottom-[50px] w-[min(430px,calc(100%-24px))] px-3 py-2" : "bottom-[118px] w-[min(520px,calc(100%-40px))] px-6 pt-4 pb-4",
        mode.kind === "hold" && actor && (compact ? "pt-7" : "pt-[50px]"),
        entrance("enter-rise", className)
      )}
      style={style}
      onAnimationEnd={onAnimationEnd}
    >
      {mode.kind === "hold" && actor && (
        <>
          <HeroRing party={party} actor={actor} compact={compact} onPick={onPick} />
          {/* A short question reads well in the capitals of the display face. A longer ask from the GM stays in the serif. */}
          <p
            className={cn(
              mode.prompt.length <= 60 ? "font-display text-accent [text-shadow:0_1px_6px_#000]" : "font-serif text-foreground",
              compact ? "my-1 line-clamp-3 text-sm leading-snug" : cn("mb-4 leading-[1.35]", mode.prompt.length <= 60 ? "text-xl" : "text-base")
            )}
          >
            {mode.prompt}
          </p>
          {mode.suggestions && mode.suggestions.length > 0 && (
            <div ref={row} className={cn("flex flex-wrap justify-center", compact ? "mb-1.5 gap-1" : "mb-3 gap-2")}>
              {mode.suggestions === "loading"
                ? // Three pills the size of real ones, each with a faint bar where its words will go, pulsing in turn.
                  [0, 1, 2].map((i) => (
                    <span
                      key={i}
                      aria-hidden
                      style={{ animationDelay: `${i * 200}ms` }}
                      className={cn(choice, "flex w-[30%] animate-pulse items-center justify-center not-italic hover:border-foreground/20 hover:bg-transparent", compact && "px-3 py-0.5 text-2xs")}
                    >
                      &nbsp;
                      <span className="h-[0.5em] w-2/3 rounded-full bg-foreground/15" />
                      &nbsp;
                    </span>
                  ))
                : mode.suggestions.map((s, i) => (
                    <Tip key={s.text} label={s.text}>
                      <Button
                        variant="plain"
                        type="button"
                        className={cn(
                          choice,
                          "max-w-full truncate active:scale-[0.97]",
                          compact && "px-3 py-0.5 text-2xs",
                          draft === s.text && "border-accent bg-accent/10 text-accent",
                          rising && "enter-rise"
                        )}
                        style={rising ? staggered(i) : undefined}
                        onClick={() => {
                          setDraft(s.text)
                          box.current?.focus()
                        }}
                      >
                        {s.label}
                      </Button>
                    </Tip>
                  ))}
            </div>
          )}
          <div className="relative flex items-end gap-2 rounded-[22px] border border-foreground/15 bg-black/55 p-1.5 pl-4 transition-[border-color,box-shadow] focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/35">
            <Textarea
              plain
              ref={box}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  send()
                }
              }}
              disabled={demo && !draft}
              readOnly={demo}
              rows={1}
              placeholder={demo && !draft ? "" : `What does ${actor.name.split(" ")[0]} say and do?`}
              className={cn(
                "field-sizing-content block max-h-32 min-w-0 flex-1 resize-none self-center bg-transparent py-1.5 text-left font-serif text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:cursor-not-allowed",
                compact ? "text-xs" : "text-sm"
              )}
            />
            <Button
              variant="plain"
              type="button"
              aria-label="Send"
              onClick={() => send()}
              disabled={!draft.trim()}
              className={cn(
                "grid shrink-0 place-items-center rounded-full bg-accent text-black transition-[opacity,filter,scale] duration-150 ease-snap hover:brightness-110 enabled:active:scale-90 disabled:opacity-35",
                compact ? "h-7 w-7" : "h-9 w-9"
              )}
            >
              <ArrowUp className={compact ? "h-4 w-4" : "h-5 w-5"} strokeWidth={2.25} />
            </Button>
            <Presence show={demo && !draft} motion="fade" initial={false} asChild>
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <span className={cn("font-sans font-medium tracking-label text-accent/90 uppercase [text-shadow:0_1px_4px_#000]", compact ? "text-4xs" : "text-3xs")}>
                  Demo only · Click Suggest for a reply
                </span>
              </div>
            </Presence>
          </div>
          <Presence show={Boolean(warning)} motion="rise" asChild>
            {warning && (
              <div role="alert" className={cn("rounded-lg border border-accent/30 bg-black/50 text-left font-serif text-foreground", compact ? "mt-1.5 px-3 py-2 text-2xs" : "mt-2.5 px-4 py-3 text-sm")}>
                <p>
                  {warning}. {actor.name.split(" ")[0]} would spend a spell slot for nothing.
                </p>
                <div className="mt-2 flex justify-end gap-2">
                  <Pill
                    onClick={() => {
                      setAsking(null)
                      box.current?.focus()
                    }}
                  >
                    Edit Reply
                  </Pill>
                  <Pill onClick={() => send(true)}>Send Anyway</Pill>
                </div>
              </div>
            )}
          </Presence>
          {(mode.suggestion || onSkip) && (
            <div className={cn("flex items-center gap-2", compact ? "mt-1" : "mt-2")}>
              {mode.suggestion && (
                <Pill className="flex-1" onClick={() => mode.suggestion && setDraft(mode.suggestion)}>
                  Suggest
                </Pill>
              )}
              {onSkip && (
                <Button variant="plain" type="button" onClick={onSkip} className="ml-auto px-2 font-sans text-3xs tracking-wide text-muted-foreground transition-colors duration-150 hover:text-foreground">
                  Skip
                </Button>
              )}
            </div>
          )}
        </>
      )}
      {mode.kind === "roll" &&
        actor &&
        (mode.roll.versus ? (
          <ContestRoll key={`${actor.id}-${mode.roll.skill}`} roll={mode.roll} prompt={mode.prompt} actor={actor} compact={compact} forced={forcedRoll} onRoll={onRoll} />
        ) : (
          <SingleRoll
            key={`${actor.id}-${mode.roll.skill}`}
            roll={mode.roll}
            prompt={mode.prompt}
            actor={actor}
            compact={compact}
            forced={forcedRoll}
            made={mode.made}
            resolving={mode.resolving}
            result={mode.result}
            pace={rollPace}
            onRoll={onRoll}
            onContinue={onContinue}
          />
        ))}
      {mode.kind === "thinking" && !mode.who && (
        <div className="py-1">
          <div className={cn(eyebrow, "animate-pulse")}>The GM</div>
          <GmMusing note={mode.note} />
        </div>
      )}
      {mode.kind === "thinking" && mode.who && (
        <div className="flex items-center justify-center gap-3 py-1 text-left">
          {mode.who.portrait && (
            <div className={cn("shrink-0 border border-accent bg-background p-[2px] shadow-[inset_0_0_0_1px_#000a,0_2px_8px_#0006]", compact ? "h-9 w-8" : "h-14 w-12")}>
              <img src={mode.who.portrait} alt="" className="block h-full w-full object-cover object-top [filter:sepia(.2)_saturate(.88)]" />
            </div>
          )}
          <div className="min-w-0">
            <div className={cn(eyebrow, "animate-pulse")}>{mode.who.name}&apos;s turn</div>
            {mode.note && <div className="mt-1 font-serif text-xs text-soft-foreground italic">{mode.note}</div>}
          </div>
        </div>
      )}
      {mode.kind === "done" && (
        <>
          <div className={eyebrow}>Encounter complete</div>
          <div className={cn("font-display text-[#f3d6a6]", compact ? "text-lg" : "mt-1 text-xl")}>{mode.next}</div>
        </>
      )}
    </section>
  )
}
