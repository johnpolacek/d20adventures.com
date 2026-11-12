"use client"

// The level a finished adventure gives a hero: what the level brings, and each choice it asks of the player. The
// engine says what is asked and checks what is chosen. Both hosts use it.

import type { LevelUpChoices, LevelUpOptions, Named } from "@d20/gm-core/sheet/level-up"
import type { Sheet } from "@d20/gm-core/sheet/sheet"
import { useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { eyebrow, Pill, panel } from "./hud"
import { ABILITY_NAMES, type AbilityId, emptyPicks, fromChoices, missing, type Picks, preparable, raiseOf, toChoices, toggled } from "./level-up-view"

type Rules = {
  options: LevelUpOptions
  /** Choices that need no player. */
  auto: () => LevelUpChoices
  /** What stops the level with these choices. Empty when it can be taken. */
  problems: (choices: LevelUpChoices) => string[]
  /** A class's spells of one level, for a feat that picks from another class's list. */
  listSpells: (classId: string, level: number) => Named[]
}

/** The rules of a hero's next level. They load on first use, in their own chunk. Null while loading. */
export function useLevelUp(sheet: Sheet | undefined): Rules | null {
  const [rules, setRules] = useState<Rules | null>(null)
  const key = sheet ? JSON.stringify(sheet) : ""
  useEffect(() => {
    let live = true
    setRules(null)
    if (!key) return
    const hero = JSON.parse(key) as Sheet
    Promise.all([import("@d20/gm-core/sheet/level-up"), import("@d20/gm-core/sheet/milestone"), import("@d20/gm-core/sheet/spells")])
      .then(([levels, milestone, spells]) => {
        if (!live) return
        setRules({
          options: levels.levelUpOptions(hero),
          auto: () => milestone.autoChoices(hero),
          problems: (choices) => {
            const result = levels.levelUp(hero, choices)
            return "problems" in result ? result.problems : []
          },
          listSpells: (classId, level) =>
            spells
              .classSpells(classId, level)
              .filter((id) => spells.spellById.get(id)?.level === level)
              .map((id) => ({ id, name: spells.spellById.get(id)?.name ?? id })),
        })
      })
      .catch(() => {
        if (live) setRules(null)
      })
    return () => {
      live = false
    }
  }, [key])
  return rules
}

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function Section({ title, count, children }: { title: string; count?: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className={cn(eyebrow, "mb-2 flex items-baseline justify-between gap-3")}>
        <span>{title}</span>
        {count && <span className="tabular-nums tracking-[0.12em] text-stage-cream/70">{count}</span>}
      </h3>
      {children}
    </section>
  )
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 font-sans text-[10px] uppercase tracking-[0.14em] text-stage-cream/60">{label}</div>
      {children}
    </div>
  )
}

// A row of options to pick `most` of. With `most` 1 it is a radio group.
function Options({ label, from, picked, most, onPick }: { label: string; from: readonly (Named & { note?: string })[]; picked: readonly string[]; most: number; onPick: (ids: string[]) => void }) {
  const one = most === 1
  const pills = from.map((option) => {
    const on = picked.includes(option.id)
    return (
      <Pill
        key={option.id}
        {...(one ? { role: "radio", "aria-checked": on } : { "aria-pressed": on })}
        active={on}
        title={option.note}
        className="px-2 py-1 text-[11px]"
        onClick={() => onPick(one ? (on ? [] : [option.id]) : toggled(picked, option.id, most))}
      >
        {option.name}
      </Pill>
    )
  })
  if (one)
    return (
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {pills}
      </div>
    )
  return (
    <fieldset className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0">
      <legend className="sr-only">{label}</legend>
      {pills}
    </fieldset>
  )
}

// Spells to pick from, a row for each spell level.
function SpellOptions({
  label,
  from,
  picked,
  most,
  onPick,
}: {
  label: string
  from: readonly (Named & { level: number; school?: string })[]
  picked: readonly string[]
  most: number
  onPick: (ids: string[]) => void
}) {
  const levels = [...new Set(from.map((spell) => spell.level))].sort((a, b) => b - a)
  return (
    <div className="space-y-2">
      {levels.map((level) => (
        <div key={level} className="flex gap-2">
          <span className="w-12 shrink-0 pt-1 font-sans text-[10px] uppercase tracking-[0.14em] text-stage-cream/60">Level {level}</span>
          <Options
            label={`${label}, level ${level}`}
            from={from.filter((spell) => spell.level === level).map((spell) => ({ ...spell, note: spell.school ? sentence(spell.school) : undefined }))}
            picked={picked}
            most={most}
            onPick={onPick}
          />
        </div>
      ))}
    </div>
  )
}

/**
 * The level-up screen for one hero. `onTake` sends the choices to the host, and answers with what stopped the level,
 * or nothing when it was taken.
 */
export function LevelUp({
  hero,
  portrait,
  sheet,
  compact = false,
  className,
  onTake,
  onClose,
}: {
  hero: string
  portrait?: string
  sheet: Sheet
  compact?: boolean
  className?: string
  onTake: (choices: LevelUpChoices) => Promise<string | undefined>
  onClose: () => void
}) {
  const rules = useLevelUp(sheet)
  const options = rules?.options
  const [picks, setPicks] = useState<Picks | null>(null)
  const [sending, setSending] = useState(false)
  const [stopped, setStopped] = useState<string | null>(null)
  useEffect(() => {
    setPicks(options ? emptyPicks(options) : null)
    setStopped(null)
  }, [options])
  const left = useMemo(() => (options && picks ? missing(options, picks) : []), [options, picks])

  if (!rules || !options || !picks) {
    return (
      <div className={cn(panel, "p-6 text-center font-serif text-stage-cream", className)} role="dialog" aria-label={`${hero} Levels Up`}>
        Loading…
      </div>
    )
  }

  const set = (changed: Partial<Picks>) => {
    setStopped(null)
    setPicks({ ...picks, ...changed })
  }
  const feat = options.feat?.feats.find((offer) => offer.id === picks.feat)
  const raise = raiseOf(feat)
  const spent = Object.values(picks.abilities).reduce((sum, amount) => sum + (amount ?? 0), 0)
  const raiseAbility = (ability: AbilityId) => {
    if (!raise || !feat?.abilityScoreIncrease) return
    const now = picks.abilities[ability] ?? 0
    const room = feat.abilityScoreIncrease.maximum - sheet.abilityScores[ability]
    // One more point, or back to none when the score or the feat allows no more.
    const next = now < Math.min(raise.most, room) && spent < raise.total ? now + 1 : 0
    set({ abilities: { ...picks.abilities, [ability]: next } })
  }
  const book = sheet.spellbook
  const toPrepare = preparable(options, book, picks)
  const take = async () => {
    const choices = toChoices(options, picks)
    const faults = rules.problems(choices)
    if (faults.length) return setStopped(faults.map(sentence).join(". "))
    setSending(true)
    const refused = await onTake(choices).catch((error: unknown) => (error instanceof Error ? error.message : "The level could not be taken."))
    setSending(false)
    if (refused) setStopped(refused)
  }

  return (
    <div className={cn(panel, "flex max-h-full flex-col text-stage-cream", compact ? "p-4" : "p-6", className)} role="dialog" aria-label={`${hero} Levels Up`}>
      <header className="flex items-center gap-3">
        {portrait && (
          // biome-ignore lint/performance/noImgElement: portrait art from the stage assets
          <img src={portrait} alt="" className="h-12 w-12 shrink-0 rounded-full border border-stage-gold/60 object-cover object-top" />
        )}
        <div className="min-w-0">
          <div className={eyebrow}>Level Up</div>
          <h2 className={cn("font-display leading-tight", compact ? "text-xl" : "text-2xl")}>
            {hero} Reaches Level {options.level}
          </h2>
        </div>
      </header>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
        <p className="font-serif text-[13px] text-stage-cream/85">
          Hit Point Maximum {options.hitPointMaximum}
          {options.features.length > 0 && <> · {options.features.map((feature) => feature.name).join(", ")}</>}
        </p>

        {options.subclass && (
          <Section title="Subclass">
            <Options label="Subclass" from={options.subclass} picked={picks.subclass ? [picks.subclass] : []} most={1} onPick={([id]) => set({ subclass: id ?? picks.subclass })} />
          </Section>
        )}

        {options.feat && (
          <Section title={options.feat.feature.name}>
            <Options
              label="Feat"
              from={options.feat.feats}
              picked={picks.feat ? [picks.feat] : []}
              most={1}
              onPick={([id]) => set({ feat: id, abilities: {}, featList: undefined, featAbility: undefined, featCantrips: [], featSpell: undefined, featSkills: [] })}
            />
            {raise && feat?.abilityScoreIncrease && (
              <fieldset className="m-0 mt-2 flex min-w-0 flex-wrap gap-1.5 border-0 p-0">
                <legend className="sr-only">Ability Scores</legend>
                {feat.abilityScoreIncrease.from.map((ability) => {
                  const added = picks.abilities[ability as AbilityId] ?? 0
                  return (
                    <Pill
                      key={ability}
                      active={added > 0}
                      className="px-2 py-1 text-[11px] tabular-nums"
                      aria-label={`${ABILITY_NAMES[ability as AbilityId]} ${sheet.abilityScores[ability]} plus ${added}`}
                      onClick={() => raiseAbility(ability as AbilityId)}
                    >
                      {ABILITY_NAMES[ability as AbilityId]} {sheet.abilityScores[ability] + added}
                      {added > 0 && ` (+${added})`}
                    </Pill>
                  )
                })}
              </fieldset>
            )}
            {feat?.skillPicks && (
              <div className="mt-3">
                <Labeled label={`Skills · ${picks.featSkills.length} of ${feat.skillPicks.count}`}>
                  <Options label="Skills" from={feat.skillPicks.from} picked={picks.featSkills} most={feat.skillPicks.count} onPick={(ids) => set({ featSkills: ids })} />
                </Labeled>
              </div>
            )}
            {feat?.spellPicks && (
              <div className="mt-3 space-y-2">
                <Labeled label="Spell List">
                  <Options
                    label="Spell List"
                    from={feat.spellPicks.spellLists.map((id) => ({ id, name: sentence(id) }))}
                    picked={picks.featList ? [picks.featList] : []}
                    most={1}
                    onPick={([id]) => set({ featList: id, featCantrips: [], featSpell: undefined })}
                  />
                </Labeled>
                <Labeled label="Spellcasting Ability">
                  <Options
                    label="Spellcasting Ability"
                    from={feat.spellPicks.spellAbility.map((id) => ({ id, name: ABILITY_NAMES[id as AbilityId] }))}
                    picked={picks.featAbility ? [picks.featAbility] : []}
                    most={1}
                    onPick={([id]) => set({ featAbility: id as AbilityId | undefined })}
                  />
                </Labeled>
                {picks.featList && (
                  <>
                    <Labeled label={`Cantrips · ${picks.featCantrips.length} of ${feat.spellPicks.cantrips}`}>
                      <Options label="Cantrips" from={rules.listSpells(picks.featList, 0)} picked={picks.featCantrips} most={feat.spellPicks.cantrips} onPick={(ids) => set({ featCantrips: ids })} />
                    </Labeled>
                    <Labeled label={`Level ${feat.spellPicks.spellLevel} Spell`}>
                      <Options
                        label="Spell"
                        from={rules.listSpells(picks.featList, feat.spellPicks.spellLevel)}
                        picked={picks.featSpell ? [picks.featSpell] : []}
                        most={1}
                        onPick={([id]) => set({ featSpell: id })}
                      />
                    </Labeled>
                  </>
                )}
              </div>
            )}
          </Section>
        )}

        {options.expertise?.map((entry) => {
          const mine = picks.expertise[entry.feature.id] ?? []
          return (
            <Section key={entry.feature.id} title={entry.feature.name === "Expertise" ? "Expertise" : `Expertise · ${entry.feature.name}`} count={`${mine.length} of ${entry.count}`}>
              <Options label="Expertise" from={entry.from} picked={mine} most={entry.count} onPick={(ids) => set({ expertise: { ...picks.expertise, [entry.feature.id]: ids } })} />
            </Section>
          )
        })}

        {options.skills && (
          <Section title={`Skills · ${options.skills.feature.name}`} count={`${picks.skills.length} of ${options.skills.count}`}>
            <Options label="Skills" from={options.skills.from} picked={picks.skills} most={options.skills.count} onPick={(ids) => set({ skills: ids })} />
          </Section>
        )}

        {options.featureChoices?.map((entry) => {
          const chosen = entry.options.find((option) => option.id === picks.featureChoices[entry.feature.id])
          const extra = picks.optionCantrips[entry.feature.id] ?? []
          return (
            <Section key={entry.feature.id} title={entry.feature.name}>
              <Options
                label={entry.feature.name}
                from={entry.options}
                picked={chosen ? [chosen.id] : []}
                most={1}
                onPick={([id]) => {
                  const { [entry.feature.id]: _, ...others } = picks.featureChoices
                  set({ featureChoices: id ? { ...others, [entry.feature.id]: id } : others, optionCantrips: { ...picks.optionCantrips, [entry.feature.id]: [] } })
                }}
              />
              {chosen?.cantrips && (
                <div className="mt-2">
                  <Options
                    label={`${chosen.name} Cantrips`}
                    from={chosen.cantrips.from}
                    picked={extra}
                    most={chosen.cantrips.count}
                    onPick={(ids) => set({ optionCantrips: { ...picks.optionCantrips, [entry.feature.id]: ids } })}
                  />
                </div>
              )}
            </Section>
          )
        })}

        {options.cantrips && (
          <Section title="Cantrips" count={`${picks.cantrips.length} of ${options.cantrips.count}`}>
            <Options label="Cantrips" from={options.cantrips.from} picked={picks.cantrips} most={options.cantrips.count} onPick={(ids) => set({ cantrips: ids })} />
          </Section>
        )}

        {options.spellbook && (
          <Section title={options.spellbook.evocation ? `Spellbook · ${options.spellbook.evocation} Evocation` : "Spellbook"} count={`${picks.spellbook.length} of ${options.spellbook.count}`}>
            <SpellOptions
              label="Spellbook"
              from={options.spellbook.from}
              picked={picks.spellbook}
              most={options.spellbook.count}
              onPick={(ids) => set({ spellbook: ids, spells: picks.spells.filter((id) => book?.includes(id) || ids.includes(id)) })}
            />
          </Section>
        )}

        {options.spells && (
          <Section title="Prepared Spells" count={`${picks.spells.length} of ${options.spells.count}`}>
            {options.spells.dropped && <p className="mb-2 font-serif text-[12px] text-stage-cream/70">Now always prepared: {options.spells.dropped.map((spell) => spell.name).join(", ")}</p>}
            <SpellOptions label="Prepared Spells" from={toPrepare} picked={picks.spells} most={options.spells.count} onPick={(ids) => set({ spells: ids })} />
          </Section>
        )}

        {options.weaponMasteries && (
          <Section title="Weapon Mastery" count={`${picks.weaponMasteries.length} of ${options.weaponMasteries.count}`}>
            <Options label="Weapon Mastery" from={options.weaponMasteries.from} picked={picks.weaponMasteries} most={options.weaponMasteries.count} onPick={(ids) => set({ weaponMasteries: ids })} />
          </Section>
        )}
      </div>

      <footer className="mt-4 border-t border-stage-line/20 pt-3">
        {(stopped || left.length > 0) && (
          <p className={cn("mb-2 font-serif text-[12px]", stopped ? "text-[#e39a7c]" : "text-stage-cream/70")} role={stopped ? "alert" : undefined}>
            {stopped ?? `Still to choose: ${left.join(", ")}.`}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex gap-2">
            <Pill disabled={sending} onClick={onClose}>
              Later
            </Pill>
            <Pill disabled={sending} onClick={() => set(fromChoices(options, rules.auto()))}>
              Choose For Me
            </Pill>
          </span>
          <Pill active disabled={sending || left.length > 0} onClick={() => void take()}>
            {sending ? "Taking…" : `Take Level ${options.level}`}
          </Pill>
        </div>
      </footer>
    </div>
  )
}
