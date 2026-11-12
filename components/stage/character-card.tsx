"use client"

// A character's card, opened by clicking them on the stage or in the party row (the prototype's cards). Under the name,
// how they stand: a hero's hit points with any Temporary Hit Points and Armor Class, an NPC's wound word, Dying with the
// saves, Stable or Dead. Then their conditions, turn effects and lasting spells in words, and a caster's spellcasting:
// spell save DC, spell attack bonus, the slots of each level left as marks, and the spells they can cast. A hero the
// player plays shows their standing orders for reactions.

import type { SheetSpellcasting } from "@d20/gm-core/sheet/view"
import { cn } from "@/lib/utils"
import { eyebrow, panel } from "./hud"
import { StandingOrders } from "./reaction-card"
import type { Order, OrderRow, ReactionId } from "./reaction-view"
import { DeathSaveMarks } from "./roll-parts"
import { type Standing, standingWords, WOUND_TONE } from "./standing"

export interface CardInfo {
  id: string
  name: string
  role: string
  portrait?: string
  about?: string
  // Left out where the game has none, as in the scripted demo, and for a hero whose sheet is not read yet.
  standing?: Standing
  // In words: "Prone, Poisoned, Dodging, Bless, Concentrating On Bless".
  conditions?: string
  // A hero's, from their sheet. An NPC shows none.
  spellcasting?: SheetSpellcasting
  // A hero the player plays: each reaction they have and the order they follow for it.
  reactions?: OrderRow[]
  lines?: string[]
  details?: Array<{ label: string; items: string[] }>
}

export function CharacterCard({
  info,
  compact = false,
  onClose,
  onOrders,
}: {
  info: CardInfo
  compact?: boolean
  onClose: () => void
  // Hears the orders changed on the card, for the caller to save.
  onOrders?: (changed: Partial<Record<ReactionId, Order>>) => void
}) {
  return (
    <section
      className={cn(panel, "fade-in absolute z-40 overflow-y-auto px-6 pt-6 pb-5", compact ? "top-12 right-3 bottom-12 w-[min(330px,55vw)]" : "top-24 right-10 max-h-[calc(100%-230px)] w-[330px]")}
    >
      <button type="button" onClick={onClose} aria-label="Close card" className="absolute top-2.5 right-3 text-[22px] leading-none text-stage-muted hover:text-stage-cream">
        ×
      </button>
      {info.portrait && (
        // biome-ignore lint/performance/noImgElement: portrait art from the stage assets
        <img src={info.portrait} alt="" className="-mt-1 mb-3 block h-[132px] w-full border border-stage-brass/50 object-cover object-[50%_15%] [filter:sepia(.2)_saturate(.88)]" />
      )}
      <div className={eyebrow}>{info.role}</div>
      <h2 className="mt-1.5 mb-2.5 font-display text-[24px] font-normal leading-tight">{info.name}</h2>
      {info.standing && <StandingRow standing={info.standing} />}
      {info.conditions && <p className="mb-2.5 font-serif text-[13px] text-stage-cream italic">{info.conditions}</p>}
      {info.spellcasting && <Spellcasting casting={info.spellcasting} />}
      {info.reactions && onOrders && <StandingOrders key={info.id} rows={info.reactions} compact={compact} className="mt-4 mb-2.5" onChange={onOrders} />}
      {info.about && <p className="mb-2 text-[12px] leading-[1.7] text-[#e6dac6]">{info.about}</p>}
      {info.details?.map((section) => (
        <div key={section.label}>
          <h3 className={cn(eyebrow, "mt-4 mb-2")}>{section.label}</h3>
          <ul className="space-y-2 text-xs leading-relaxed text-stage-cream">
            {section.items.map((item, index) => (
              <li key={`${index}:${item}`}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
      {info.lines && info.lines.length > 0 && (
        <>
          <h3 className={cn(eyebrow, "mt-4 mb-2")}>Says</h3>
          <ul>
            {info.lines.map((l) => (
              <li key={l} className="font-serif text-[13px] leading-[1.75] text-[#eee1ca] italic">
                “{l}”
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

const stat = (label: string, value: string) => (
  <span className="flex items-baseline gap-1.5 rounded-[3px] border border-stage-line/25 bg-black/30 px-2 py-1">
    <span className={cn(eyebrow, "text-stage-muted")}>{label}</span>
    <span className="font-serif text-[15px] font-semibold tabular-nums text-stage-cream">{value}</span>
  </span>
)
const signed = (n: number) => (n < 0 ? `\u2212${-n}` : `+${n}`)

// The numbers a caster's spells use, each level's slots as marks, filled for those left, and the spells by kind.
function Spellcasting({ casting }: { casting: SheetSpellcasting }) {
  const lists: [string, string[]][] = [
    ["Cantrips", casting.cantrips],
    ["Prepared", casting.prepared],
    ["Rituals", casting.rituals],
  ]
  const speech = [
    `Spell Save DC ${casting.saveDc}, Spell Attack ${signed(casting.attackBonus)}`,
    ...casting.slots.map((s) => `Level ${s.level} Spell Slots, ${s.left} of ${s.total} left`),
    ...lists.filter(([, names]) => names.length).map(([label, names]) => `${label}: ${names.join(", ")}`),
  ].join(". ")
  return (
    <div className="mb-2.5">
      <h3 className={cn(eyebrow, "mt-4 mb-2")}>Spellcasting</h3>
      <span className="sr-only">{speech}.</span>
      <div aria-hidden="true">
        <div className="flex flex-wrap items-center gap-2">
          {stat("Spell Save DC", String(casting.saveDc))}
          {stat("Spell Attack", signed(casting.attackBonus))}
        </div>
        {casting.slots.map((s) => (
          <div key={s.level} className="mt-2 flex items-center gap-2">
            <span className={cn(eyebrow, "text-stage-muted")}>Level {s.level} Slots</span>
            <span className="inline-flex items-center gap-1.5">
              {Array.from({ length: s.total }, (_, i) => (
                <span
                  key={i}
                  className="inline-block h-2 w-2 rotate-45 border border-stage-gold"
                  style={{ backgroundColor: i < s.left ? "var(--color-stage-gold)" : "transparent", boxShadow: i < s.left ? "0 0 6px #fcd34d66" : undefined }}
                />
              ))}
            </span>
            <span className="font-serif text-[13px] tabular-nums text-stage-cream">
              {s.left} / {s.total}
            </span>
          </div>
        ))}
        <ul className="mt-2 space-y-1 text-xs leading-relaxed text-stage-cream">
          {lists
            .filter(([, names]) => names.length)
            .map(([label, names]) => (
              <li key={label}>
                <span className={cn(eyebrow, "mr-2 text-stage-muted")}>{label}</span>
                {names.join(", ")}
              </li>
            ))}
        </ul>
      </div>
    </div>
  )
}

function StandingRow({ standing: s }: { standing: Standing }) {
  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-2">
      <span className="sr-only">{standingWords(s)}</span>
      <span aria-hidden="true" className="contents">
        {s.kind === "hero" ? (
          <>
            {stat("Hit Points", `${s.hitPoints} / ${s.maximum}`)}
            {s.temporary ? stat("Temporary Hit Points", String(s.temporary)) : null}
            {stat("Armor Class", String(s.armorClass))}
          </>
        ) : (
          <span
            className="font-display text-[13px] font-bold tracking-[0.1em] uppercase"
            style={{ color: s.kind === "wound" ? WOUND_TONE[s.word] : s.kind === "stable" ? "#b7d38a" : WOUND_TONE.Dead }}
          >
            {standingWords(s).split(",")[0]}
          </span>
        )}
        {s.kind === "dying" && <DeathSaveMarks saves={s} compact />}
      </span>
    </div>
  )
}
