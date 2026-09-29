"use client"

// The GM card: the prototype's "GM note", grown into the turn's input. It sits low and centred over the stage and changes
// with the turn: whose turn it is and what the GM asks (with the party's portraits and a reply box), the dice roll the GM
// calls for, the GM writing, and the end of the encounter.

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
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
}
export type CardMode = { kind: "hold"; prompt: string; suggestion?: string } | { kind: "roll"; roll: CardRoll } | { kind: "thinking" } | { kind: "done"; next: string }

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
                c.id === actorId ? "border-stage-gold bg-stage-parchment text-[#2a1a10]" : "border-stage-brass/60 bg-stage-parchment/80 text-[#2a1a10]/80"
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

// A d20 in the stage's colours: spins for a moment, lands, and reports the natural roll.
function D20({ onRoll, compact }: { onRoll: (n: number) => void; compact: boolean }) {
  const [shown, setShown] = useState<number | null>(null)
  const [rolling, setRolling] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current)
    },
    []
  )
  const roll = () => {
    setRolling(true)
    let t = 0
    timer.current = setInterval(() => {
      t += 60
      setShown(1 + Math.floor(Math.random() * 20))
      if (t >= 1200 && timer.current) {
        clearInterval(timer.current)
        const n = 1 + Math.floor(Math.random() * 20)
        setShown(n)
        setRolling(false)
        onRoll(n)
      }
    }, 60)
  }
  const done = shown !== null && !rolling
  return (
    <button
      type="button"
      onClick={roll}
      disabled={rolling || done}
      aria-label="Roll the d20"
      className={cn(
        "grid place-items-center rounded-full border-2 border-stage-gold bg-[radial-gradient(circle_at_35%_30%,#4a3222,#1c1410)] font-serif text-stage-parchment shadow-[0_0_0_4px_#1c1410,0_0_0_5px_#c79a5a66,0_0_24px_#e3b67c44] transition-transform enabled:hover:scale-105 disabled:cursor-default",
        compact ? "h-14 w-14 text-xl" : "h-20 w-20 text-3xl",
        rolling && "animate-spin [animation-duration:1.2s]"
      )}
    >
      {shown ?? <span className={cn("font-sans tracking-[0.2em]", compact ? "text-[9px]" : "text-[10px]")}>ROLL</span>}
    </button>
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
}) {
  const [draft, setDraft] = useState("")
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
  // A new prompt clears the draft.
  useEffect(() => setDraft(""), [key])
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
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send()
            }}
            rows={compact ? 1 : 3}
            placeholder={`What does ${actor.name.split(" ")[0]} say and do?`}
            className={cn(
              "w-full resize-none rounded-[3px] border border-stage-line/25 bg-black/35 px-3 py-2 text-left font-serif text-stage-cream placeholder:text-stage-muted/60 focus:border-stage-gold/70 focus:outline-none",
              compact ? "text-[12px]" : "text-[14px]"
            )}
          />
          <div className={cn("flex gap-2", compact ? "mt-1.5 [&>button]:py-1" : "mt-2")}>
            <Pill className="flex-1" onClick={() => mode.suggestion && setDraft(mode.suggestion)} disabled={!mode.suggestion}>
              Suggest
            </Pill>
            <Pill className="flex-1" active onClick={send} disabled={!draft.trim()}>
              Send reply
            </Pill>
          </div>
        </>
      )}
      {mode.kind === "roll" && actor && (
        <div className={cn("flex items-center justify-center", compact ? "gap-4" : "flex-col gap-2")}>
          <div>
            <div className={eyebrow}>Dice roll needed</div>
            <div className={cn("font-serif text-[#f3d6a6]", compact ? "text-lg" : "mt-1 text-[28px]")}>{mode.roll.skill}</div>
            <div className="text-[10px] tracking-wider text-stage-muted uppercase">
              {actor.name} · {mode.roll.ability} · target {mode.roll.dc} · +{mode.roll.modifier}
            </div>
          </div>
          <div className={compact ? "" : "my-2"}>
            <D20 onRoll={onRoll} compact={compact} />
          </div>
        </div>
      )}
      {mode.kind === "thinking" && <div className={cn(eyebrow, "animate-pulse py-1")}>The GM is writing…</div>}
      {mode.kind === "done" && (
        <>
          <div className={eyebrow}>Encounter complete</div>
          <div className={cn("font-serif text-[#f3d6a6]", compact ? "text-lg" : "mt-1 text-[26px]")}>{mode.next}</div>
        </>
      )}
    </section>
  )
}
