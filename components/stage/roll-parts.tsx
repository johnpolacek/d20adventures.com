"use client"

// The parts of a roll under its verdict, shared by the roll card, the narration, the journal and the site's turn view:
// damage as the dice fell, what a check or save hurt or healed, the conditions it gave or ended, and a dying hero's
// Death Saving Throws. And a feature used, as a small entry of its own. Each part is seen, not read: the caller's
// screen-reader sentence (./roll-view) says it all.

import { cn } from "@/lib/utils"
import { eyebrow } from "./hud"
import { conditionSentence, type DamageView, type DeathSavesView, type FeatureView, featureSpeech, type HarmView, harmSentence, type RollView, takenDiffers } from "./roll-view"

const SUCCESS = "#b7d38a"
const FAILURE = "#e39a7c"

// Each die as it fell, its flat bonus, the damage type, and the sum.
function DiceSum({ dice, bonus, type, total, compact }: { dice: number[]; bonus: number; type?: string; total: number; compact: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1 tabular-nums">
      {dice.map((d, i) => (
        <span
          key={i}
          className={cn(
            "inline-grid place-items-center self-center rounded-[3px] border border-stage-line/30 bg-black/35 font-serif font-semibold leading-none text-stage-parchment",
            compact ? "h-4 min-w-4 px-0.5 text-[10px]" : "h-5 min-w-5 px-1 text-[12px]"
          )}
        >
          {d}
        </span>
      ))}
      {bonus !== 0 && (
        <span>
          <span className="text-stage-muted">{bonus < 0 ? "−" : "+"}</span> {Math.abs(bonus)}
        </span>
      )}
      <span className="text-stage-muted">=</span>
      <span className="font-semibold text-stage-gold">{total}</span>
      {type && <span className="text-stage-muted italic">{type}</span>}
    </span>
  )
}

const line = (compact: boolean) => cn("flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-serif text-stage-cream", compact ? "text-[11px]" : "text-[13px]")

function DamageLines({ damage, compact }: { damage: DamageView[]; compact: boolean }) {
  return (
    <>
      {damage.map((d, i) => (
        <div key={i} className={line(compact)}>
          <DiceSum dice={d.dice} bonus={d.bonus} type={`${d.type} Damage`} total={d.total} compact={compact} />
        </div>
      ))}
    </>
  )
}

export function HarmLines({ harm, compact }: { harm: HarmView[]; compact: boolean }) {
  return (
    <>
      {harm.map((h, i) => (
        <div key={i} className={line(compact)}>
          {h.dice.length > 0 && <DiceSum dice={h.dice} bonus={h.bonus} type={h.type} total={h.dice.reduce((n, d) => n + d, 0) + h.bonus} compact={compact} />}
          <span style={{ color: h.kind === "healing" ? SUCCESS : FAILURE }}>{harmSentence(h)}</span>
        </div>
      ))}
    </>
  )
}

/** Three marks for successes and three for failures, labelled unless `label` is false. */
export function DeathSaveMarks({ saves, compact = false, label = true }: { saves: DeathSavesView; compact?: boolean; label?: boolean }) {
  const marks = (count: number, tone: string, name: string) => (
    <span className="inline-flex items-center gap-1">
      {label && <span className={cn(eyebrow, "text-stage-muted", compact && "text-[8px]")}>{name}</span>}
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn("inline-block rotate-45 border", compact ? "h-1.5 w-1.5" : "h-2 w-2")}
          style={{ borderColor: tone, backgroundColor: i < count ? tone : "transparent", boxShadow: i < count ? `0 0 6px ${tone}66` : undefined }}
        />
      ))}
    </span>
  )
  return (
    <span className={cn("inline-flex items-center", !label ? "gap-1.5" : compact ? "gap-2" : "gap-3")}>
      {marks(saves.successes, SUCCESS, "Successes")}
      {marks(saves.failures, FAILURE, "Failures")}
    </span>
  )
}

/** Everything under a roll's verdict: the damage of a hit, what the target lost, harm, conditions, and saves. */
export function RollDetails({ roll, compact = false, className }: { roll: RollView; compact?: boolean; className?: string }) {
  const damage = roll.success ? (roll.damage ?? []) : []
  const lost = roll.success && takenDiffers(roll)
  const harm = roll.harm ?? []
  const conditions = roll.conditions ?? []
  if (!damage.length && !lost && !harm.length && !conditions.length) return null
  return (
    <div aria-hidden="true" className={cn("flex flex-col", compact ? "gap-0.5" : "gap-1", className)}>
      <DamageLines damage={damage} compact={compact} />
      {lost && (
        <div className={line(compact)}>
          <span style={{ color: FAILURE }}>{harmSentence({ target: roll.target ?? "", kind: "damage", dice: [], bonus: 0, amount: roll.taken ?? 0 })}</span>
        </div>
      )}
      <HarmLines harm={harm} compact={compact} />
      {conditions.map((c, i) => (
        <div key={i} className={cn(line(compact), "italic")}>
          {conditionSentence(c)}
        </div>
      ))}
    </div>
  )
}

/** A class feature used: its name, who used it and on whom, and the dice it rolled. */
export function FeatureEntry({ feature, compact = false, className }: { feature: FeatureView; compact?: boolean; className?: string }) {
  return (
    <div className={cn("rounded-[3px] border border-l-2 border-stage-line/15 border-l-stage-gold bg-black/30", compact ? "px-2 py-1.5" : "px-3 py-2", className)}>
      <span className="sr-only">{featureSpeech(feature)}</span>
      <div aria-hidden="true">
        <div className={cn(eyebrow, "truncate")}>
          {feature.character} · {feature.name}
          {feature.target ? ` → ${feature.target}` : ""}
        </div>
        {feature.harm && feature.harm.length > 0 && (
          <div className={cn("flex flex-col", compact ? "mt-0.5 gap-0.5" : "mt-1 gap-1")}>
            <HarmLines harm={feature.harm} compact={compact} />
          </div>
        )}
      </div>
    </div>
  )
}
