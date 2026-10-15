"use client"

// The GM card: the prototype's "GM note", grown into the turn's input. It sits low and centred over the stage and changes
// with the turn: whose turn it is and what the GM asks (with the party's portraits and a reply box), the dice roll the GM
// calls for and how it came out while the GM answers it, the GM writing, and the end of the encounter.

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { D20Solid } from "./d20"
import { rattle } from "./dice-sound"
import { eyebrow, Pill, panel } from "./hud"
import { RollResult } from "./roll-result"

export interface CardCharacter {
  id: string
  name: string
  role: string
  portrait?: string
}
export interface CardRoll {
  skill: string
  ability: string
  dc: number
  modifier: number
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
// A roll's `made` is the natural roll once it is made, and `resolving` says the GM is still answering it.
export type CardMode =
  | { kind: "hold"; prompt: string; suggestion?: string; suggestions?: CardSuggestion[] | "loading" }
  | { kind: "roll"; roll: CardRoll; prompt?: string; made?: number; resolving?: boolean }
  | { kind: "thinking"; note?: string }
  | { kind: "done"; next: string }

function PartyRow({ party, actorId, compact, onPick }: { party: CardCharacter[]; actorId: string | null; compact: boolean; onPick: (id: string) => void }) {
  return (
    <div className={cn("flex justify-center", compact ? "gap-1.5" : "gap-3.5")}>
      {party.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onPick(c.id)}
          className={cn("m-0 transition-opacity", c.id === actorId ? "opacity-100" : "opacity-60 hover:opacity-90", compact ? "w-11" : "w-[78px]")}
        >
          <div
            className={cn(
              "relative border bg-stage-ink p-[3px] shadow-[inset_0_0_0_1px_#000a,0_2px_8px_#0006]",
              c.id === actorId ? "border-stage-gold" : "border-stage-brass/60",
              compact ? "h-12" : "h-[92px]"
            )}
          >
            {c.portrait && (
              // biome-ignore lint/performance/noImgElement: portrait art from the stage assets
              <img src={c.portrait} alt="" className="block h-full w-full object-cover object-top [filter:sepia(.2)_saturate(.88)]" />
            )}
          </div>
          {!compact && (
            <div
              className={cn(
                "mt-1.5 truncate border px-1 py-1 text-center font-serif text-[11px] font-semibold",
                "stage-parchment",
                c.id === actorId ? "border-stage-gold text-[#2a1a10]" : "border-stage-brass/60 text-[#2a1a10]/80 opacity-85"
              )}
            >
              {c.name.split(" ")[0]}
            </div>
          )}
        </button>
      ))}
    </div>
  )
}

// A d20 in the stage's colours: a real 3D die that tumbles while the number over its face stays upright and flips in
// place, slowing as it settles; it lands on `land` when given and reports the natural roll. The GM's die rolls itself.
function D20({ onRoll, compact, land, auto = false, disabled = false }: { onRoll: (n: number) => void; compact: boolean; land?: number; auto?: boolean; disabled?: boolean }) {
  const [shown, setShown] = useState<number | null>(null)
  const [rolling, setRolling] = useState(false)
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
    setRolling(true)
    setTumble((k) => k + 1)
    hush.current = rattle()
    let elapsed = 0
    let delay = 45
    const tick = () => {
      elapsed += delay
      if (elapsed >= 1200) {
        const n = land ?? 1 + Math.floor(Math.random() * 20)
        setShown(n)
        setRolling(false)
        hush.current()
        onRoll(n)
        return
      }
      setShown(1 + Math.floor(Math.random() * 20))
      delay *= 1.13
      timer.current = setTimeout(tick, delay)
    }
    tick()
  }
  // The GM's die rolls once, shortly after the card appears.
  useEffect(() => {
    if (!auto) return
    const t = setTimeout(roll, 500)
    return () => clearTimeout(t)
  }, [auto])
  const done = shown !== null && !rolling
  return (
    <button
      type="button"
      onClick={roll}
      disabled={auto || disabled || rolling || done}
      aria-label={auto ? "The GM's roll" : "Roll the d20"}
      className={cn(
        "relative grid place-items-center [filter:drop-shadow(0_0_12px_#e3b67c40)_drop-shadow(0_3px_5px_#000b)] transition-[transform,opacity] enabled:hover:scale-105 disabled:cursor-default",
        disabled && !done && "opacity-40",
        compact ? "h-16 w-16" : "h-[92px] w-[92px]"
      )}
    >
      <D20Solid size={compact ? 64 : 92} roll={tumble} className="absolute inset-0" />
      <span
        key={shown ?? "roll"}
        className={cn(
          "relative font-serif leading-none text-stage-parchment [text-shadow:0_1px_3px_#000d]",
          rolling ? "d20-flip" : done && "d20-land",
          shown === null ? cn("font-sans tracking-[0.2em]", compact ? "text-[8px]" : "text-[10px]") : compact ? "text-base" : "text-[24px]"
        )}
      >
        {shown ?? "ROLL"}
      </span>
    </button>
  )
}

function Total({ natural, modifier }: { natural: number | null; modifier: number }) {
  return <div className="mt-2 font-serif text-[13px] text-stage-parchment tabular-nums">{natural === null ? "\u00a0" : `${natural} + ${modifier} = ${natural + modifier}`}</div>
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
  onRoll,
  onContinue,
}: {
  roll: CardRoll
  prompt?: string
  actor: CardCharacter
  compact: boolean
  forced?: number
  made?: number
  resolving?: boolean
  onRoll: (n: number) => void
  onContinue?: () => void
}) {
  const [mine, setMine] = useState<number | null>(null)
  const [verdict, setVerdict] = useState(false)
  const natural = made ?? mine
  const ask = { character: actor.name, check: roll.skill, modifier: roll.modifier, dc: roll.dc, portrait: actor.portrait }
  const total = natural === null ? 0 : natural + roll.modifier
  return (
    <div>
      <div className={eyebrow}>{natural === null ? "Dice roll needed" : "Dice roll"}</div>
      {prompt && !compact && <p className="mx-auto mt-2 max-w-[440px] font-serif text-[14px] leading-[1.5] text-stage-cream">{prompt}</p>}
      <div className={cn("mx-auto max-w-[440px] text-left", compact ? "mt-1.5" : "mt-3")}>
        <RollResult
          compact={compact}
          roll={natural === null ? ask : { ...ask, natural, total, success: total >= roll.dc }}
          onRoll={() => {
            const n = forced ?? 1 + Math.floor(Math.random() * 20)
            setMine(n)
            onRoll(n)
          }}
          onVerdict={() => setVerdict(true)}
        />
      </div>
      {natural !== null && (
        <div className={cn("grid place-items-center", compact ? "mt-1.5 h-8" : "mt-3 h-11")}>
          {verdict &&
            (resolving ? (
              <div className={cn(eyebrow, "animate-pulse")}>The GM is resolving the roll…</div>
            ) : (
              onContinue && (
                <Button variant="epic" size="xs" className={cn("fade-in", compact ? "px-6" : "px-8 py-1.5 text-sm")} onClick={onContinue}>
                  Continue
                </Button>
              )
            ))}
        </div>
      )}
    </div>
  )
}

// A contest: the GM's roll for the other side first, then the player's d20, then how it came out.
function ContestRoll({ roll, prompt, actor, compact, forced, onRoll }: { roll: CardRoll; prompt?: string; actor: CardCharacter; compact: boolean; forced?: number; onRoll: (n: number) => void }) {
  const [theirs, setTheirs] = useState<number | null>(null)
  const [mine, setMine] = useState<number | null>(null)
  const total = mine === null ? null : mine + roll.modifier
  const side = (name: string, skill: string, detail: string) => (
    <>
      <div className="text-[9px] tracking-[0.2em] text-stage-gold uppercase">{name}</div>
      <div className={cn("font-display text-[#f3d6a6]", compact ? "text-base" : "mt-0.5 text-[22px]")}>{skill}</div>
      <div className="mb-2.5 text-[10px] tracking-wider text-stage-muted uppercase">{detail}</div>
    </>
  )
  return (
    <div>
      <div className={eyebrow}>Contest</div>
      {prompt && !compact && <p className="mx-auto mt-2 max-w-[440px] font-serif text-[14px] leading-[1.5] text-stage-cream">{prompt}</p>}
      <div className={cn("flex items-start justify-center", compact ? "mt-1 gap-4" : "mt-3 gap-7")}>
        {roll.versus && (
          <>
            <div className="flex flex-col items-center">
              {side(roll.versus.name, roll.versus.skill, `the GM rolls · +${roll.versus.modifier}`)}
              <D20 auto land={roll.versus.natural} compact={compact} onRoll={setTheirs} />
              <Total natural={theirs} modifier={roll.versus.modifier} />
            </div>
            <div className={cn("self-center font-display text-stage-muted", compact ? "text-sm" : "text-lg")}>vs</div>
          </>
        )}
        <div className="flex flex-col items-center">
          {side(actor.name.split(" ")[0], roll.skill, `${roll.ability} · +${roll.modifier}`)}
          <D20
            land={forced}
            compact={compact}
            disabled={theirs === null}
            onRoll={(n) => {
              setMine(n)
              onRoll(n)
            }}
          />
          <Total natural={mine} modifier={roll.modifier} />
        </div>
      </div>
      <div className={cn("mt-1 h-4 text-[11px] tracking-[0.18em] uppercase", total === null ? "opacity-0" : total >= roll.dc ? "text-[#b7d38a]" : "text-[#e39a7c]")}>
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
  demo = false,
}: {
  mode: CardMode
  actor: CardCharacter | null
  party: CardCharacter[]
  compact?: boolean
  onReply: (text: string) => void
  // Ends the hero's turn with no reply. Without it there is no Skip button.
  onSkip?: () => void
  onRoll: (n: number) => void
  onPick: (id: string) => void
  // Leaves a roll once the GM has answered it. Without it the roll's card has no Continue button.
  onContinue?: () => void
  // The card's top edge, in px from the bottom of the screen (so the stage can frame shots above it).
  onTop?: (px: number) => void
  // The reply can be held by the caller (so it survives the card closing while the turn is replayed).
  draft?: string
  onDraft?: (text: string) => void
  // Stageview checks: the player's natural roll, fixed.
  forcedRoll?: number
  // A scripted demo: the reply can't be typed. The box stays disabled, with a note over it, until Suggest fills it in,
  // and the suggestion then can't be edited.
  demo?: boolean
}) {
  const [ownDraft, setOwnDraft] = useState("")
  const draft = onDraft ? (draftProp ?? "") : ownDraft
  const setDraft = onDraft ?? setOwnDraft
  const ref = useRef<HTMLElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !onTop) return
    const report = () => onTop(innerHeight - el.getBoundingClientRect().top)
    const ro = new ResizeObserver(report)
    ro.observe(el)
    report()
    return () => {
      ro.disconnect()
      onTop(0)
    }
  }, [onTop])
  const key = mode.kind === "hold" ? mode.prompt : mode.kind
  // A new prompt clears the card's own draft.
  useEffect(() => {
    if (!onDraft) setOwnDraft("")
  }, [key, onDraft])
  const send = () => draft.trim() && onReply(draft.trim())
  return (
    <section
      ref={ref}
      className={cn(
        panel,
        "fade-in absolute left-1/2 z-30 -translate-x-1/2 border-stage-brass/50 text-center",
        compact ? "bottom-[50px] w-[min(430px,calc(100%-24px))] px-3 py-2" : "bottom-[118px] w-[min(520px,calc(100%-40px))] px-5 pt-4 pb-4"
      )}
    >
      {mode.kind === "hold" && actor && (
        <>
          <div className={eyebrow}>GM · {actor.name.split(" ")[0]}'s turn</div>
          {!compact && (
            <div className="mt-3">
              <PartyRow party={party} actorId={actor.id} compact={compact} onPick={onPick} />
            </div>
          )}
          <p className={cn("font-serif text-stage-cream", compact ? "my-1.5 line-clamp-3 text-[12px] leading-snug" : "mt-3 mb-3 text-[15px] leading-[1.55]")}>{mode.prompt}</p>
          {mode.suggestions && mode.suggestions.length > 0 && (
            <div className={cn("flex gap-1.5", compact ? "mb-1.5 [&>button]:py-1" : "mb-2")}>
              {mode.suggestions === "loading"
                ? [0, 1, 2].map((i) => (
                    <Pill key={i} className="flex-1 animate-pulse" disabled aria-hidden>
                      &nbsp;
                    </Pill>
                  ))
                : mode.suggestions.map((s) => (
                    <Pill
                      key={s.text}
                      className="min-w-0 flex-1 truncate px-2"
                      active={draft === s.text}
                      title={s.text}
                      onClick={() => {
                        setDraft(s.text)
                        box.current?.focus()
                      }}
                    >
                      {s.label}
                    </Pill>
                  ))}
            </div>
          )}
          <div className="relative">
            <textarea
              ref={box}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send()
              }}
              disabled={demo && !draft}
              readOnly={demo}
              rows={compact ? 1 : 3}
              placeholder={`What does ${actor.name.split(" ")[0]} say and do?`}
              className={cn(
                "block w-full resize-none rounded-[3px] border border-stage-line/25 bg-black/35 px-3 py-2 text-left font-serif text-stage-cream placeholder:text-stage-muted/60 focus:border-stage-gold/70 focus:outline-none disabled:cursor-not-allowed",
                compact ? "text-[12px]" : "text-[14px]"
              )}
            />
            {demo && !draft && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <span className={cn("font-sans font-medium tracking-[0.22em] text-stage-gold/90 uppercase [text-shadow:0_1px_4px_#000]", compact ? "text-[9px]" : "text-[11px]")}>
                  Demo only · Click Suggest for a reply
                </span>
              </div>
            )}
          </div>
          <div className={cn("flex gap-2", compact ? "mt-1.5 [&>button]:py-1" : "mt-2")}>
            {mode.suggestion && (
              <Pill className="flex-1" onClick={() => mode.suggestion && setDraft(mode.suggestion)}>
                Suggest
              </Pill>
            )}
            {/* Half the card wide, so it grows less than the epic button's usual hover. */}
            <Button variant="epic" size="xs" className={cn("ml-auto w-1/2 shrink-0 gap-1.5 scale-100 hover:scale-105", !compact && "py-1.5 text-sm")} onClick={send} disabled={!draft.trim()}>
              Send
              <svg viewBox="0 0 14 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-2.5 w-3">
                <path d="M2.5 2.5 6 6 2.5 9.5M7.5 2.5 11 6 7.5 9.5" />
              </svg>
            </Button>
            {onSkip && (
              <button type="button" onClick={onSkip} className="ml-3 pl-2 font-sans text-[11px] tracking-wide text-stage-muted transition-colors hover:text-stage-cream">
                Skip
              </button>
            )}
          </div>
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
            onRoll={onRoll}
            onContinue={onContinue}
          />
        ))}
      {mode.kind === "thinking" && (
        <div className="py-1">
          <div className={cn(eyebrow, "animate-pulse")}>The GM is writing…</div>
          {mode.note && <div className="mt-1.5 font-serif text-[13px] text-stage-sage italic">{mode.note}</div>}
        </div>
      )}
      {mode.kind === "done" && (
        <>
          <div className={eyebrow}>Encounter complete</div>
          <div className={cn("font-display text-[#f3d6a6]", compact ? "text-lg" : "mt-1 text-[24px]")}>{mode.next}</div>
        </>
      )}
    </section>
  )
}
