"use client"

// The GM card: the prototype's "GM note", grown into the turn's input. It sits low and centred over the stage and changes
// with the turn: whose turn it is and what the GM asks (with the party's portraits and a reply box), the dice roll the GM
// calls for, the GM writing, and the end of the encounter.

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { D20Solid } from "./d20"
import { eyebrow, Pill, panel } from "./hud"

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
export type CardMode = { kind: "hold"; prompt: string; suggestion?: string } | { kind: "roll"; roll: CardRoll; prompt?: string } | { kind: "thinking"; note?: string } | { kind: "done"; next: string }

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
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )
  const roll = () => {
    if (started.current) return
    started.current = true
    setRolling(true)
    setTumble((k) => k + 1)
    let elapsed = 0
    let delay = 45
    const tick = () => {
      elapsed += delay
      if (elapsed >= 1200) {
        const n = land ?? 1 + Math.floor(Math.random() * 20)
        setShown(n)
        setRolling(false)
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

// The roll: the GM's roll for the other side first (in a contest), then the player's d20, then how it came out.
function RollPanel({ roll, prompt, actor, compact, forced, onRoll }: { roll: CardRoll; prompt?: string; actor: CardCharacter; compact: boolean; forced?: number; onRoll: (n: number) => void }) {
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
      <div className={eyebrow}>{roll.versus ? "Contest" : "Dice roll needed"}</div>
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
          {side(actor.name.split(" ")[0], roll.skill, `${roll.ability} · +${roll.modifier}${roll.versus ? "" : ` · target ${roll.dc}`}`)}
          <D20
            land={forced}
            compact={compact}
            disabled={!!roll.versus && theirs === null}
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
  onRoll,
  onPick,
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
  onRoll: (n: number) => void
  onPick: (id: string) => void
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
          <div className="relative">
            <textarea
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
            <Pill className="flex-1 font-display text-[13px] font-bold tracking-[0.12em]" active onClick={send} disabled={!draft.trim()}>
              Send
            </Pill>
          </div>
        </>
      )}
      {mode.kind === "roll" && actor && <RollPanel key={`${actor.id}-${mode.roll.skill}`} roll={mode.roll} prompt={mode.prompt} actor={actor} compact={compact} forced={forcedRoll} onRoll={onRoll} />}
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
