"use client"

// The journal: every word of the story so far, the replies and the rolls, and the table chat. Opened from the top bar,
// so the stage carries the scene and the text is always one tap away.

import { Fragment, type RefObject, useEffect, useRef, useState } from "react"
import { Button } from "../button"
import { Input } from "../input"
import { Presence, Swap } from "../presence"
import { Ornament } from "../typography/ornament"
import { dropCapSmall } from "../typography/styles"
import { cn, entrance, type MotionProps, staggered } from "../utils"
import { eyebrow, Pill, panel, useJoined } from "./hud"
import { DeathSaveMarks, FeatureEntry, RollDetails } from "./roll-parts"
import { againstLabel, type FeatureView, isCritical, marginText, modeName, type RollView, rollHeading, rollSpeech, verdictOf } from "./roll-view"
import { ROLL_CRITICAL, ROLL_FAILURE, ROLL_SUCCESS } from "./roll-tones"

// The story in order: its paragraphs, each dice roll where it was called for, and each class feature used.
export type JournalEntry = string | { roll: RollView } | { feature: FeatureView }

// Where a scene's first line of narration sits, for its drop cap.
const firstLine = (paragraphs: JournalEntry[]) => paragraphs.findIndex((p) => typeof p === "string")

export interface JournalTurn {
  number: number
  title: string
  paragraphs: JournalEntry[]
  reply?: { name: string; text: string }
}
export interface ChatLine {
  from: string
  text: string
  // When it was said, where the chat is live.
  at?: number
}
export type JournalTab = "story" | "chat"

// The d20 face-on: a hexagon, its middle face, and the edges running out from that face's corners.
const HEX = "50,3 91,27 91,73 50,97 9,73 9,27"
const FACE = "50,22 19,72 81,72"
const EDGES = "M50 22L50 3M50 22L9 27M50 22L91 27M19 72L9 27M19 72L9 73M19 72L50 97M81 72L91 27M81 72L91 73M81 72L50 97"
// Indigo, as on the roll card, and gold for a Critical Hit.
const DIE = { fill: "#26215c", line: "#8f87d6", face: "#2f2a70", number: "#fef3c7" }
const GOLD = { fill: "#a87a2c", line: ROLL_CRITICAL, face: "#d8a64c", number: "#3a220c" }

// A die not kept is dimmed.
function Die({ natural, dropped = false, critical = false }: { natural: number; dropped?: boolean; critical?: boolean }) {
  const c = critical ? GOLD : DIE
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={cn("h-10 w-10 shrink-0 drop-shadow-[0_2px_3px_#000a]", dropped && "opacity-35 grayscale")}>
      <polygon points={HEX} fill={c.fill} stroke={c.line} strokeWidth="4" strokeLinejoin="round" />
      <path d={EDGES} stroke={c.line} strokeOpacity="0.55" strokeWidth="2.5" />
      <polygon points={FACE} fill={c.face} stroke={c.line} strokeWidth="2.5" strokeLinejoin="round" />
      <text x="50" y="58" textAnchor="middle" dominantBaseline="middle" fill={c.number} className="font-serif font-bold" fontSize={natural > 9 ? 26 : 30}>
        {natural}
      </text>
    </svg>
  )
}

// A roll as a small card: the die on its natural roll (both dice with Advantage or Disadvantage, the other dimmed), the
// sum against the DC or the Armor Class with any die of Inspiration or of a lasting spell named, the verdict stamped at the end, and what the roll did under it. A Critical Hit
// is gold. The site's turn view shows its rolls with it too.
export function RollLine({ roll, className }: { roll: RollView; className?: string }) {
  const crit = isCritical(roll)
  const verdict = verdictOf(roll)
  const tone = crit ? ROLL_CRITICAL : roll.success ? ROLL_SUCCESS : ROLL_FAILURE
  const dice = roll.dice && roll.dice.length > 1 ? roll.dice : [roll.natural]
  const kept = dice.indexOf(roll.natural)
  const mode = roll.mode ? modeName(roll.mode) : null
  const margin = roll.kind === "death" ? marginText(roll) : ""
  const term = (sign: string, n: number) => (
    <>
      <span className="text-[12px] text-muted-foreground">{sign}</span>
      <span className="text-[14px]">{n}</span>
    </>
  )
  return (
    <div className={cn("my-3 flex items-start gap-3 rounded-hud border border-l-2 border-foreground/15 bg-black/30 py-2 pr-3 pl-2", className)} style={{ borderLeftColor: tone }}>
      <span className="sr-only">{rollSpeech(roll)}</span>
      <div className="flex shrink-0 gap-0.5">
        {dice.map((d, i) => (
          <Die key={i} natural={d} dropped={dice.length > 1 && i !== kept} critical={crit && i === kept} />
        ))}
      </div>
      <div aria-hidden="true" className="min-w-0 flex-1">
        <div className={cn(eyebrow, "overflow-hidden text-ellipsis whitespace-nowrap")}>{rollHeading(roll, roll.character)}</div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <div className="flex items-baseline gap-x-1.5 whitespace-nowrap font-serif tabular-nums text-foreground">
            <span className="text-[14px]">{roll.natural}</span>
            {roll.modifier !== undefined && term(roll.modifier < 0 ? "−" : "+", Math.abs(roll.modifier))}
            {roll.inspired !== undefined && (
              <>
                {term("+", roll.inspired)}
                <span className="font-sans text-[8px] tracking-[0.2em] text-muted-foreground uppercase">Inspiration</span>
              </>
            )}
            {(roll.adds ?? []).map((a, i) => (
              <Fragment key={i}>
                {term(a.amount < 0 ? "−" : "+", Math.abs(a.amount))}
                <span className="font-sans text-[8px] tracking-[0.2em] text-muted-foreground uppercase">{a.from}</span>
              </Fragment>
            ))}
            <span className="text-[12px] text-muted-foreground">=</span>
            <span className="text-[19px] font-bold text-accent">{roll.total}</span>
            <span className="ml-1.5 font-sans text-[9px] tracking-[0.2em] text-muted-foreground uppercase">{roll.versus ? "vs" : againstLabel(roll.kind)}</span>
            <span className="text-[14px]">{roll.versus ?? roll.dc}</span>
          </div>
          <span className="flex shrink-0 items-center gap-2">
            {mode && <span className="font-serif text-[12px] font-semibold text-accent">{mode}</span>}
            <span
              className="rounded-hud border px-1.5 py-0.5 font-display text-[10px] font-bold tracking-[0.06em] uppercase"
              style={{ color: tone, borderColor: tone, boxShadow: `${crit ? `0 0 10px ${tone}55, ` : ""}inset 0 0 6px ${tone}33`, textShadow: `0 0 6px ${tone}55` }}
            >
              {verdict}
            </span>
          </span>
        </div>
        {margin && <div className="mt-1 font-serif text-[12px] text-muted-foreground italic">{margin}</div>}
        {roll.kind === "death" && roll.deathSaves && (
          <div className="mt-1.5">
            <DeathSaveMarks saves={roll.deathSaves} compact />
          </div>
        )}
        <RollDetails roll={roll} compact className="mt-1.5" />
      </div>
    </div>
  )
}

// Between the turns of one scene: a rule with the turn's place in it, 2 of 5.
function Divider({ n, of }: { n: number; of: number }) {
  return (
    <div className="my-3 flex items-center gap-3 font-sans text-[9px] tracking-[0.26em] text-muted-foreground uppercase">
      <span className="h-px flex-1 bg-foreground/15" />
      {n} of {of}
      <span className="h-px flex-1 bg-foreground/15" />
    </div>
  )
}

// The box under the table chat. It keeps the line until the chat takes it.
function ChatBox({ onSend }: { onSend: (text: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const send = async () => {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    if (await onSend(text).catch(() => false)) setDraft("")
    setSending(false)
  }
  return (
    <form
      className="flex gap-2 border-t border-foreground/20 px-5 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
    >
      <Input
        plain
        value={draft}
        maxLength={1000}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Say something"
        aria-label="Table chat message"
        className="min-w-0 flex-1 rounded-hud border border-foreground/25 bg-black/35 px-3 py-2 font-serif text-[13px] text-foreground transition-colors duration-150 placeholder:text-muted-foreground/60 focus:border-accent/70 focus:outline-none"
      />
      <Pill type="submit" disabled={sending || !draft.trim()}>
        Send
      </Pill>
    </form>
  )
}

// The story so far. Its first scenes rise in one after another as it opens, and a scene told while it is open rises in.
function Story({ turns }: { turns: JournalTurn[] }) {
  const joined = useJoined()
  // Turns in a row under one title are one scene: the title once, then the turns numbered.
  const scenes = turns.reduce<JournalTurn[][]>((all, t) => {
    const last = all.at(-1)
    if (last && last[0].title === t.title) last.push(t)
    else all.push([t])
    return all
  }, [])
  return scenes.map((scene, at) => {
    const late = joined(scene[0].number)
    return (
      <section key={scene[0].number} className={cn("mb-6", (late || at < 8) && "enter-rise")} style={late ? undefined : staggered(at)}>
        <h3 className="text-center font-display text-[17px] text-[#f3d6a6]">{scene[0].title}</h3>
        <Ornament className="mt-1 mb-3 scale-75" />
        {scene.map((t, n) => (
          <article key={t.number}>
            {scene.length > 1 && <Divider n={n + 1} of={scene.length} />}
            {t.reply && (
              <div className="mb-2 border-l border-primary/50 pl-3 font-serif text-[13px] text-muted-foreground italic">
                <span className="not-italic text-[9px] tracking-[0.2em] text-accent uppercase">{t.reply.name}</span>
                <div>{t.reply.text}</div>
              </div>
            )}
            {t.paragraphs.map((p, i) =>
              typeof p === "string" ? (
                <p key={i} className={cn("mb-2.5 font-serif text-[13.5px] leading-[1.65] text-soft-foreground", n === 0 && i === firstLine(t.paragraphs) && dropCapSmall)}>
                  {p}
                </p>
              ) : "roll" in p ? (
                <RollLine key={i} roll={p.roll} />
              ) : (
                <FeatureEntry key={i} feature={p.feature} compact className="my-3" />
              )
            )}
          </article>
        ))}
      </section>
    )
  })
}

// The table chat, kept on its newest line. A line said while it is open rises in.
function Chat({ chat, scroller }: { chat: ChatLine[]; scroller: RefObject<HTMLDivElement | null> }) {
  const joined = useJoined()
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight
  }, [chat.length, scroller])
  return chat.map((m, i) => (
    <p key={i} className={cn("mb-2 text-[12px] leading-relaxed", joined(i) && "enter-rise")}>
      <span className="font-serif text-[#f3d6a6]">{m.from}</span> <span className="text-soft-foreground">{m.text}</span>
    </p>
  ))
}

// The caller may own which tab shows, to open on the chat and to know when it is read. With onChat, the chat takes
// new lines.
export function Journal({
  turns,
  chat,
  compact = false,
  onClose,
  tab: shown,
  onTab,
  onChat,
  className,
  style,
  onAnimationEnd,
}: MotionProps & {
  turns: JournalTurn[]
  chat: ChatLine[]
  compact?: boolean
  onClose: () => void
  tab?: JournalTab
  onTab?: (tab: JournalTab) => void
  onChat?: (text: string) => Promise<boolean>
}) {
  const [own, setOwn] = useState<JournalTab>("story")
  const tab = shown ?? own
  const setTab = onTab ?? setOwn
  const scroller = useRef<HTMLDivElement>(null)
  return (
    <section
      className={cn(panel, "absolute z-panel flex flex-col", compact ? "top-12 right-3 bottom-12 w-[min(380px,60vw)]" : "top-[86px] right-10 bottom-[118px] w-[380px]", entrance("enter-right", className))}
      style={style}
      onAnimationEnd={onAnimationEnd}
    >
      <div className="flex items-center justify-between border-b border-foreground/20 px-5 pt-4 pb-2">
        <div className="flex gap-4">
          {(["story", "chat"] as const).map((t) => (
            <Button
              variant="plain"
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(eyebrow, "pb-1 transition-colors duration-150", tab === t ? "border-b border-accent" : "text-muted-foreground hover:text-accent")}
            >
              {t === "story" ? "The story so far" : "Table chat"}
            </Button>
          ))}
        </div>
        <Button variant="plain" type="button" onClick={onClose} aria-label="Close the journal" className="text-xl leading-none text-muted-foreground transition-[color,scale] duration-150 ease-snap hover:text-foreground active:scale-90">
          ×
        </Button>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-width:thin]">
        <Swap id={tab}>{tab === "story" ? <Story turns={turns} /> : <Chat chat={chat} scroller={scroller} />}</Swap>
      </div>
      <Presence show={tab === "chat" && Boolean(onChat)} motion="rise">
        {onChat && <ChatBox onSend={onChat} />}
      </Presence>
    </section>
  )
}
