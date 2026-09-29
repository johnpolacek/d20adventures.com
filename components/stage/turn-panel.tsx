"use client"

// The docked turn panel: party, the turn's narrative (the paragraph being staged is lit), the GM's prompt and the reply
// composer when a character is up, the roll when one is required, and the earlier turns and chat in their own tabs.
// Every word of the narrative stays here, so the stage never has to carry the text alone.

import { useEffect, useRef, useState } from "react"
import DiceRollResult from "@/components/adventure/dice-roll-result"
import { Button } from "@/components/ui/button"
import DiceRoll from "@/components/ui/dice-roll"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export interface PanelCharacter {
  id: string
  name: string
  role: string
  portrait?: string
  type: "pc" | "npc"
  healthPercent: number
}
export interface PanelRoll {
  skill: string
  ability: string
  dc: number
  modifier: number
}
export interface PanelTurn {
  number: number
  title: string
  paragraphs: string[]
  reply?: { name: string; text: string }
  roll?: { name: string; skill: string; dc: number; base: number; total: number; success: boolean }
}
export interface ChatLine {
  from: string
  text: string
}
export type TurnPhase = "start" | "beats" | "hold" | "roll" | "thinking" | "done"

interface Props {
  adventure: string
  encounter: string
  turn: PanelTurn
  history: PanelTurn[]
  party: PanelCharacter[]
  actorId: string | null
  phase: TurnPhase
  narrated: number
  prompt: string | null
  suggestion: string | null
  roll: PanelRoll | null
  chat: ChatLine[]
  onLook: (id: string) => void
  onReply: (text: string) => void
  onRoll: (base: number) => void
  onReplay: () => void
  compact?: boolean
}

function PartyStrip({ party, actorId, onLook, compact }: { party: PanelCharacter[]; actorId: string | null; onLook: (id: string) => void; compact?: boolean }) {
  return (
    <div className={cn("flex gap-1.5 overflow-x-auto px-3", compact ? "pt-1.5 pb-1" : "pt-3 pb-2")}>
      {party.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onLook(c.id)}
          title={`${c.name} · ${c.role}`}
          className={cn(
            "relative shrink-0 overflow-hidden rounded-lg ring transition-all",
            compact ? "h-10 w-8" : "h-16 w-12",
            c.id === actorId ? "ring-2 ring-amber-300" : c.type === "npc" ? "opacity-80 ring-stone-600" : "opacity-85 ring-primary-700"
          )}
        >
          {c.portrait && (
            // biome-ignore lint/performance/noImgElement: stage portrait fixture
            <img src={c.portrait} alt={c.name} className="h-full w-full object-cover object-top" />
          )}
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/60">
            <div className="h-full bg-green-500" style={{ width: `${c.healthPercent}%` }} />
          </div>
          {c.type === "npc" && !compact && <div className="absolute top-0 right-0 bg-black/70 px-1 font-mono text-xxxs text-stone-300">NPC</div>}
        </button>
      ))}
    </div>
  )
}

function Paragraphs({ paragraphs, lit, dimOthers }: { paragraphs: string[]; lit: number; dimOthers: boolean }) {
  return (
    <>
      {paragraphs.map((p, i) => (
        <p key={i} className={cn("mb-3 font-serif text-sm leading-relaxed transition-colors duration-700 sm:text-base", dimOthers && i !== lit ? "text-primary-200/60" : "text-white")}>
          {p}
        </p>
      ))}
    </>
  )
}

function Replied({ reply }: { reply: NonNullable<PanelTurn["reply"]> }) {
  return (
    <div className="mb-3 border-l-2 border-primary-600 pl-3 font-serif text-sm text-primary-200 italic">
      <span className="not-italic font-display text-xxs uppercase tracking-wider text-primary-300">{reply.name}</span>
      <div>{reply.text}</div>
    </div>
  )
}
function RollLine({ roll }: { roll: NonNullable<PanelTurn["roll"]> }) {
  return (
    <div className="mb-3 flex items-center gap-3 rounded-lg bg-black/40 px-3 py-2 ring ring-primary-700">
      <DiceRollResult result={roll.base} />
      <div className="text-xs">
        <div className="font-display font-bold text-amber-300">
          {roll.name} · {roll.skill}
        </div>
        <div className="font-mono text-primary-300">
          {roll.base} {roll.total - roll.base >= 0 ? "+" : "−"} {Math.abs(roll.total - roll.base)} = {roll.total} vs DC {roll.dc} ·{" "}
          <span className={roll.success ? "text-green-400" : "text-red-400"}>{roll.success ? "success" : "fail"}</span>
        </div>
      </div>
    </div>
  )
}

export function TurnPanel(p: Props) {
  const [tab, setTab] = useState<"turn" | "story" | "chat">("turn")
  const [draft, setDraft] = useState("")
  const scroller = useRef<HTMLDivElement>(null)
  const actor = p.party.find((c) => c.id === p.actorId)
  const visible = p.phase === "beats" ? p.turn.paragraphs.slice(0, p.narrated + 1) : p.turn.paragraphs

  useEffect(() => {
    // Scroll only the panel (scrollIntoView would also scroll the clipped page shell).
    const el = scroller.current
    if (tab === "turn" && el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [tab, visible.length, p.phase])
  useEffect(() => {
    if (p.phase === "hold") setDraft("")
  }, [p.phase])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("border-b border-primary-800 px-3", p.compact ? "py-1" : "pt-2 pb-1")}>
        {!p.compact && <div className="font-display text-xxs uppercase tracking-widest text-primary-300">{p.adventure}</div>}
        <div className="flex items-baseline justify-between gap-2">
          <h1 className={cn("truncate font-display font-bold text-amber-300", p.compact ? "text-sm" : "text-lg")}>{p.encounter}</h1>
          <span className="shrink-0 font-mono text-xxs text-primary-300">Turn {p.turn.number}</span>
        </div>
      </div>
      <PartyStrip party={p.party} actorId={p.actorId} onLook={p.onLook} compact={p.compact} />
      <div className="flex gap-1 border-b border-primary-800 px-3 text-xs" role="tablist">
        {(["turn", "story", "chat"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 px-2 font-display capitalize transition-colors",
              p.compact ? "py-1" : "py-1.5",
              tab === t ? "border-amber-300 text-amber-300" : "border-transparent text-primary-300 hover:text-white"
            )}
          >
            {t}
            {t === "story" && p.history.length > 0 && <span className="ml-1 font-mono text-xxs opacity-70">{p.history.length}</span>}
          </button>
        ))}
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-4 [scrollbar-width:thin]">
        {tab === "turn" && (
          <>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="font-display text-sm font-bold text-white">{p.turn.title}</h2>
              {(p.phase === "hold" || p.phase === "done") && (
                <button type="button" onClick={p.onReplay} className="shrink-0 font-display text-xxs uppercase tracking-wider text-primary-300 hover:text-white">
                  Replay
                </button>
              )}
            </div>
            {p.turn.reply && p.phase !== "start" && <Replied reply={p.turn.reply} />}
            {p.turn.roll && p.phase !== "start" && <RollLine roll={p.turn.roll} />}
            {p.phase !== "start" && <Paragraphs paragraphs={visible} lit={p.phase === "beats" ? p.narrated : -1} dimOthers={p.phase === "beats"} />}

            {p.phase === "hold" && actor && p.prompt && (
              <div className="mt-2 rounded-xl bg-primary-900/60 p-3 ring ring-primary-600" id="reply">
                <div className="mb-1 font-display text-xs font-bold text-amber-300">{actor.name}, it's your turn</div>
                <p className="mb-2 font-serif text-sm text-primary-100">{p.prompt}</p>
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && draft.trim()) p.onReply(draft.trim())
                  }}
                  rows={3}
                  placeholder="Write your character's actions and dialogue, in present tense, third person…"
                  className={cn("resize-none bg-black/50 font-serif text-sm", p.compact ? "min-h-14" : "min-h-20")}
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <Button variant="outline" className="text-xs" onClick={() => p.suggestion && setDraft(p.suggestion)}>
                    Suggest
                  </Button>
                  <Button variant="epic" className="px-5 py-1.5 text-sm" disabled={!draft.trim()} onClick={() => p.onReply(draft.trim())}>
                    Send Reply
                  </Button>
                </div>
              </div>
            )}
            {p.phase === "roll" && actor && p.roll && (
              <div className="mt-2 flex flex-col items-center gap-2 rounded-xl bg-primary-900/60 p-3 text-center ring ring-primary-600">
                <div className="font-display text-xs">Dice Roll Needed</div>
                <div className="font-display text-xl font-bold text-amber-300">{p.roll.skill}</div>
                <div className="-mt-1 font-mono text-xxs uppercase tracking-wider text-primary-300">
                  {actor.name} · {p.roll.ability} · Target {p.roll.dc} <span className="text-green-400">+{p.roll.modifier} bonus</span>
                </div>
                <DiceRoll className="my-1 scale-90" iconSize={40} id="d20-roll" onRoll={p.onRoll} />
              </div>
            )}
            {p.phase === "thinking" && (
              <div className="mt-3 flex items-center gap-2 font-display text-sm text-indigo-300">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-indigo-300" />
                The GM is writing…
              </div>
            )}
            {p.phase === "beats" && (
              <div className="mt-1 flex items-center gap-2 font-display text-xxs uppercase tracking-wider text-primary-300">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />
                On stage
              </div>
            )}
            {p.phase === "done" && (
              <div className="mt-3 rounded-xl bg-black/40 p-3 text-center ring ring-primary-700">
                <div className="font-display text-xs text-primary-300">Encounter complete</div>
                <div className="font-display text-base font-bold text-amber-300">Next: The Harvest Festival</div>
              </div>
            )}
          </>
        )}
        {tab === "story" && (
          <div>
            {p.history.length === 0 && <p className="font-serif text-sm text-primary-300">The story so far will gather here.</p>}
            {p.history.map((t) => (
              <section key={t.number} className="mb-5">
                <h3 className="mb-2 font-display text-xs font-bold text-amber-300">
                  {t.number}. {t.title}
                </h3>
                {t.reply && <Replied reply={t.reply} />}
                {t.roll && <RollLine roll={t.roll} />}
                <Paragraphs paragraphs={t.paragraphs} lit={-1} dimOthers={false} />
              </section>
            ))}
          </div>
        )}
        {tab === "chat" && (
          <div className="space-y-2">
            {p.chat.map((m, i) => (
              <div key={i} className="text-sm">
                <span className="font-display text-xs font-bold text-amber-300">{m.from}</span> <span className="text-primary-100">{m.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
