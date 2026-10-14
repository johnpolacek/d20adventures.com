"use client"

// The journal: every word of the story so far, the replies and the rolls, and the table chat. Opened from the top bar,
// so the stage carries the scene and the text is always one tap away.

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { eyebrow, Pill, panel } from "./hud"

// A dice roll in the story: the natural roll, the total, and the DC or the roll it was against.
export interface JournalRoll {
  name: string
  skill: string
  dc: number
  base: number
  total: number
  success: boolean
  versus?: string
}
export interface JournalTurn {
  number: number
  title: string
  // The story in order, each dice roll where it was called for.
  paragraphs: (string | JournalRoll)[]
  reply?: { name: string; text: string; moved?: number; movedTo?: string }
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
// Indigo, gold for a critical success, charred for a critical failure, as on the roll card.
const DIE = {
  base: { fill: "#26215c", line: "#8f87d6", face: "#2f2a70", number: "#fef3c7" },
  high: { fill: "#b8862e", line: "#ffe3a0", face: "#d8a64c", number: "#3a220c" },
  low: { fill: "#1c1410", line: "#a0301a", face: "#241812", number: "#ff7a5a" },
}

function Die({ natural, crit }: { natural: number; crit: "high" | "low" | null }) {
  const c = DIE[crit ?? "base"]
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="h-10 w-10 shrink-0 drop-shadow-[0_2px_3px_#000a]">
      <polygon points={HEX} fill={c.fill} stroke={c.line} strokeWidth="4" strokeLinejoin="round" />
      <path d={EDGES} stroke={c.line} strokeOpacity="0.55" strokeWidth="2.5" />
      <polygon points={FACE} fill={c.face} stroke={c.line} strokeWidth="2.5" strokeLinejoin="round" />
      <text x="50" y="58" textAnchor="middle" dominantBaseline="middle" fill={c.number} className="font-serif font-bold" fontSize={natural > 9 ? 26 : 30}>
        {natural}
      </text>
    </svg>
  )
}

// A roll as a small card: the die on its natural roll, the sum against the DC, and the verdict stamped at the end.
function RollLine({ roll }: { roll: JournalRoll }) {
  const mod = roll.total - roll.base
  const crit = roll.base === 20 && roll.success ? "high" : roll.base === 1 && !roll.success ? "low" : null
  const verdict = crit === "high" ? "Critical success" : crit === "low" ? "Critical failure" : roll.success ? "Success" : "Failure"
  const tone = roll.success ? (crit ? "#ffd88a" : "#b7d38a") : crit ? "#ff6a4a" : "#e39a7c"
  return (
    <div className="my-3 flex items-center gap-3 rounded-[3px] border border-l-2 border-stage-line/15 bg-black/30 py-2 pr-3 pl-2" style={{ borderLeftColor: tone }}>
      <span className="sr-only">
        {roll.name} rolled {roll.skill}: {roll.base}
        {mod ? ` ${mod < 0 ? "minus" : "plus"} ${Math.abs(mod)} makes ${roll.total}` : ""} against {roll.versus ?? `DC ${roll.dc}`}. {verdict}.
      </span>
      <Die natural={roll.base} crit={crit} />
      <div aria-hidden="true" className="min-w-0 flex-1">
        <div className={cn(eyebrow, "overflow-hidden text-ellipsis whitespace-nowrap")}>
          {roll.name} · {roll.skill}
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <div className="flex items-baseline gap-x-1.5 whitespace-nowrap font-serif tabular-nums text-stage-cream">
            {mod !== 0 && (
              <>
                <span className="text-[14px]">{roll.base}</span>
                <span className="text-[12px] text-stage-muted">{mod < 0 ? "−" : "+"}</span>
                <span className="text-[14px]">{Math.abs(mod)}</span>
                <span className="text-[12px] text-stage-muted">=</span>
              </>
            )}
            <span className="text-[19px] font-bold text-stage-gold">{roll.total}</span>
            <span className="ml-1.5 font-sans text-[9px] tracking-[0.2em] text-stage-muted uppercase">{roll.versus ? "vs" : "DC"}</span>
            <span className="text-[14px]">{roll.versus ?? roll.dc}</span>
          </div>
          <span
            className="shrink-0 rounded-[3px] border px-1.5 py-0.5 font-display text-[10px] font-bold tracking-[0.06em] uppercase"
            style={{ color: tone, borderColor: tone, boxShadow: `inset 0 0 6px ${tone}33`, textShadow: `0 0 6px ${tone}55` }}
          >
            {verdict}
          </span>
        </div>
      </div>
    </div>
  )
}

// Between the turns of one scene: a rule with the turn's place in it, 2 of 5.
function Divider({ n, of }: { n: number; of: number }) {
  return (
    <div className="my-3 flex items-center gap-3 font-sans text-[9px] tracking-[0.26em] text-stage-muted uppercase">
      <span className="h-px flex-1 bg-stage-line/15" />
      {n} of {of}
      <span className="h-px flex-1 bg-stage-line/15" />
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
      className="flex gap-2 border-t border-stage-line/20 px-5 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
    >
      <input
        value={draft}
        maxLength={1000}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Say something"
        aria-label="Table chat message"
        className="min-w-0 flex-1 rounded-[3px] border border-stage-line/25 bg-black/35 px-3 py-2 font-serif text-[13px] text-stage-cream placeholder:text-stage-muted/60 focus:border-stage-gold/70 focus:outline-none"
      />
      <Pill type="submit" disabled={sending || !draft.trim()}>
        Send
      </Pill>
    </form>
  )
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
}: {
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
  // The chat stays on its newest line.
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (tab === "chat" && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight
  }, [tab, chat.length])
  // Turns in a row under one title are one scene: the title once, then the turns numbered.
  const scenes = turns.reduce<JournalTurn[][]>((all, t) => {
    const last = all.at(-1)
    if (last && last[0].title === t.title) last.push(t)
    else all.push([t])
    return all
  }, [])
  return (
    <section className={cn(panel, "fade-in absolute z-40 flex flex-col", compact ? "top-12 right-3 bottom-12 w-[min(380px,60vw)]" : "top-[86px] right-10 bottom-[118px] w-[380px]")}>
      <div className="flex items-center justify-between border-b border-stage-line/20 px-5 pt-4 pb-2">
        <div className="flex gap-4">
          {(["story", "chat"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(eyebrow, "pb-1 transition-colors", tab === t ? "border-b border-stage-gold" : "text-stage-muted hover:text-stage-gold")}
            >
              {t === "story" ? "The story so far" : "Table chat"}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} aria-label="Close the journal" className="text-xl leading-none text-stage-muted hover:text-stage-cream">
          ×
        </button>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-width:thin]">
        {tab === "story" &&
          scenes.map((scene) => (
            <section key={scene[0].number} className="mb-6">
              <h3 className="mb-2 font-display text-[17px] text-[#f3d6a6]">{scene[0].title}</h3>
              {scene.map((t, n) => (
                <article key={t.number}>
                  {scene.length > 1 && <Divider n={n + 1} of={scene.length} />}
                  {t.reply && (
                    <div className="mb-2 border-l border-stage-brass/50 pl-3 font-serif text-[13px] text-stage-muted italic">
                      <span className="not-italic text-[9px] tracking-[0.2em] text-stage-gold uppercase">{t.reply.name}</span>
                      {t.reply.moved ? (
                        <div className="text-[11px] text-[#e8c898] not-italic">
                          Moves {t.reply.moved.toFixed(1)} m{t.reply.movedTo ? `, ${t.reply.movedTo}` : ""}
                        </div>
                      ) : null}
                      <div>{t.reply.text}</div>
                    </div>
                  )}
                  {t.paragraphs.map((p, i) =>
                    typeof p === "string" ? (
                      <p key={i} className="mb-2.5 font-serif text-[13.5px] leading-[1.65] text-stage-sage">
                        {p}
                      </p>
                    ) : (
                      <RollLine key={i} roll={p} />
                    )
                  )}
                </article>
              ))}
            </section>
          ))}
        {tab === "chat" &&
          chat.map((m, i) => (
            <p key={i} className="mb-2 text-[12px] leading-relaxed">
              <span className="font-serif text-[#f3d6a6]">{m.from}</span> <span className="text-stage-sage">{m.text}</span>
            </p>
          ))}
      </div>
      {tab === "chat" && onChat && <ChatBox onSend={onChat} />}
    </section>
  )
}
