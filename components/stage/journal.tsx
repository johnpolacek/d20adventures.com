"use client"

// The journal: every word of the story so far, the replies and the rolls, and the table chat. Opened from the top bar,
// so the stage carries the scene and the text is always one tap away.

import { useState } from "react"
import { cn } from "@/lib/utils"
import { eyebrow, panel } from "./hud"

export interface JournalTurn {
  number: number
  title: string
  paragraphs: string[]
  reply?: { name: string; text: string; moved?: number; movedTo?: string }
  roll?: { name: string; skill: string; dc: number; base: number; total: number; success: boolean }
}
export interface ChatLine {
  from: string
  text: string
}

export function Journal({ turns, chat, compact = false, onClose }: { turns: JournalTurn[]; chat: ChatLine[]; compact?: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"story" | "chat">("story")
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
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-width:thin]">
        {tab === "story" &&
          turns.map((t) => (
            <article key={t.number} className="mb-6">
              <h3 className="mb-2 font-display text-[17px] text-[#f3d6a6]">{t.title}</h3>
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
              {t.roll && (
                <div className="mb-2 text-[11px] tracking-wide text-[#e8c898]">
                  {t.roll.name} · {t.roll.skill}: {t.roll.base} + {t.roll.total - t.roll.base} = {t.roll.total} against {t.roll.dc},{" "}
                  <span className={t.roll.success ? "text-[#b7d38a]" : "text-[#e39a7c]"}>{t.roll.success ? "success" : "failure"}</span>
                </div>
              )}
              {t.paragraphs.map((p, i) => (
                <p key={i} className="mb-2.5 font-serif text-[13.5px] leading-[1.65] text-stage-sage">
                  {p}
                </p>
              ))}
            </article>
          ))}
        {tab === "chat" &&
          chat.map((m, i) => (
            <p key={i} className="mb-2 text-[12px] leading-relaxed">
              <span className="font-serif text-[#f3d6a6]">{m.from}</span> <span className="text-stage-sage">{m.text}</span>
            </p>
          ))}
      </div>
    </section>
  )
}
