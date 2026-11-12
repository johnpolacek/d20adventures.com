"use client"

// The rules choices of a new hero: scores, skills, what their species and background ask, feature choices, spells and
// starting gear. It opens filled in with choices that need no player, and the player changes what they care about.
// The engine says what is asked and checks what is chosen. Both hosts use it.

import type { CreationChoices, CreationOptions, CreationPick, EquipmentOffer } from "@d20/gm-core/sheet/create"
import type { FeatOffer, Named } from "@d20/gm-core/sheet/level-up"
import { useMemo } from "react"
import { ABILITY_NAMES, type AbilityId, toggled } from "@/components/stage/level-up-view"
import { Option, siteField, siteLabel } from "@/components/ui/site"
import { cn } from "@/lib/utils"
import type { HeroRulesKit } from "./use-hero-rules"

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const
type FeatPicks = NonNullable<CreationChoices["backgroundFeatPicks"]>
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function Section({ title, count, children }: { title: string; count?: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className={cn(siteLabel, "mb-2 flex items-baseline justify-between gap-3")}>
        <span>{title}</span>
        {count && <span className="tabular-nums text-white/60">{count}</span>}
      </h3>
      {children}
    </section>
  )
}

// A row of options to pick `most` of. With `most` 1 it is a radio group, and a pick there cannot be taken back, only changed.
function Picks({
  label,
  from,
  picked,
  most,
  fixed,
  onPick,
}: {
  label: string
  from: readonly Named[]
  picked: readonly string[]
  most: number
  fixed?: readonly Named[]
  onPick: (ids: string[]) => void
}) {
  const one = most === 1
  const options = (
    <>
      {fixed?.map((option) => (
        <Option key={`fixed-${option.id}`} active disabled className="opacity-70">
          {option.name}
        </Option>
      ))}
      {from.map((option) => {
        const on = picked.includes(option.id)
        return (
          <Option key={option.id} {...(one ? { role: "radio", "aria-checked": on } : { "aria-pressed": on })} active={on} onClick={() => onPick(one ? [option.id] : toggled(picked, option.id, most))}>
            {option.name}
          </Option>
        )
      })}
    </>
  )
  if (one)
    return (
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options}
      </div>
    )
  return (
    <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
      <legend className="sr-only">{label}</legend>
      {options}
    </fieldset>
  )
}

function Sub({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-white/50">{label}</div>
      {children}
    </div>
  )
}

// What a feat asks beyond taking it: Magic Initiate's list, ability, cantrips and spell, or Skilled's skills.
function FeatChoices({ feat, picks, kit, onChange }: { feat: FeatOffer; picks: FeatPicks; kit: HeroRulesKit; onChange: (picks: FeatPicks) => void }) {
  const spells = feat.spellPicks
  const list = spells ? (spells.spellLists.length === 1 ? spells.spellLists[0] : picks.spellList) : undefined
  return (
    <>
      {spells && spells.spellLists.length > 1 && (
        <Sub label="Spell List">
          <Picks
            label="Spell List"
            from={spells.spellLists.map((id) => ({ id, name: sentence(id) }))}
            picked={picks.spellList ? [picks.spellList] : []}
            most={1}
            onPick={([id]) => onChange({ ...picks, spellList: id as FeatPicks["spellList"], cantrips: [], spell: undefined })}
          />
        </Sub>
      )}
      {spells && (
        <Sub label="Spellcasting Ability">
          <Picks
            label="Spellcasting Ability"
            from={spells.spellAbility.map((id) => ({ id, name: ABILITY_NAMES[id as AbilityId] }))}
            picked={picks.spellAbility ? [picks.spellAbility] : []}
            most={1}
            onPick={([id]) => onChange({ ...picks, spellAbility: id as AbilityId })}
          />
        </Sub>
      )}
      {spells && list && (
        <>
          <Sub label={`Cantrips · ${picks.cantrips?.length ?? 0} of ${spells.cantrips}`}>
            <Picks label="Cantrips" from={kit.listSpells(list, 0)} picked={picks.cantrips ?? []} most={spells.cantrips} onPick={(ids) => onChange({ ...picks, cantrips: ids })} />
          </Sub>
          <Sub label={`Level ${spells.spellLevel} Spell`}>
            <Picks label="Spell" from={kit.listSpells(list, spells.spellLevel)} picked={picks.spell ? [picks.spell] : []} most={1} onPick={([id]) => onChange({ ...picks, spell: id })} />
          </Sub>
        </>
      )}
      {feat.skillPicks && (
        <Sub label={`Skills · ${picks.skills?.length ?? 0} of ${feat.skillPicks.count}`}>
          <Picks label="Skills" from={feat.skillPicks.from} picked={picks.skills ?? []} most={feat.skillPicks.count} onPick={(ids) => onChange({ ...picks, skills: ids as FeatPicks["skills"] })} />
        </Sub>
      )}
    </>
  )
}

// One side's starting equipment: the lettered options, and the items a line leaves to the player.
function Gear({
  label,
  offers,
  option,
  picks,
  onChange,
}: {
  label: string
  offers: EquipmentOffer[]
  option: string
  picks: Record<string, string>
  onChange: (option: string, picks: Record<string, string>) => void
}) {
  const chosen = offers.find((offer) => offer.option === option)
  return (
    <Sub label={label}>
      <div role="radiogroup" aria-label={label} className="grid gap-2">
        {offers.map((offer) => (
          <Option
            key={offer.option}
            role="radio"
            aria-checked={offer.option === option}
            active={offer.option === option}
            className="justify-start text-left"
            onClick={() => onChange(offer.option, {})}
          >
            {[...offer.gear, ...(offer.picks ?? []).map((pick) => pick.name)].join(", ")}
          </Option>
        ))}
      </div>
      {chosen?.picks?.map((pick) => (
        <Sub key={pick.id} label={pick.name}>
          <Picks label={pick.name} from={pick.from} picked={picks[pick.id] ? [picks[pick.id]] : []} most={1} onPick={([id]) => onChange(option, { ...picks, [pick.id]: id })} />
        </Sub>
      ))}
    </Sub>
  )
}

/** The rules choices for one class, species and background. `choices` starts as the kit's `auto(pick)`. */
export function HeroRules({ kit, pick, choices, onChange }: { kit: HeroRulesKit; pick: CreationPick; choices: CreationChoices; onChange: (choices: CreationChoices) => void }) {
  const options: CreationOptions = useMemo(() => kit.options(pick), [kit, pick])
  const set = (changed: Partial<CreationChoices>) => onChange({ ...choices, ...changed })
  const scores = options.abilityScores

  // A score taken from another ability changes places with it, so the array stays placed once each.
  const place = (ability: AbilityId, value: number) => {
    const other = ABILITIES.find((each) => choices.abilityScores[each] === value)
    set({ abilityScores: { ...choices.abilityScores, ...(other ? { [other]: choices.abilityScores[ability] } : {}), [ability]: value } })
  }
  // The background's increase, a point at a time: none, one, two, and round again.
  const raise = (ability: AbilityId) => {
    const { [ability]: now = 0, ...others } = choices.abilityIncrease
    set({ abilityIncrease: now >= 2 ? others : { ...others, [ability]: now + 1 } })
  }

  // The skills the hero has so far, for Expertise to choose among.
  const proficient = new Set<string>([
    ...options.skills.background.map((skill) => skill.id),
    ...choices.classSkills,
    ...(choices.speciesSkills ?? []),
    ...(choices.speciesFeatPicks?.skills ?? []),
    ...(choices.backgroundFeatPicks?.skills ?? []),
  ])
  // Species skills are sent in trait order: each trait's own slice of the list.
  const speciesSkillsOf = (index: number) => {
    const start = (options.speciesSkills ?? []).slice(0, index).reduce((sum, entry) => sum + entry.count, 0)
    return (choices.speciesSkills ?? []).slice(start, start + (options.speciesSkills?.[index].count ?? 0))
  }
  const setSpeciesSkills = (index: number, ids: string[]) => {
    const all = (options.speciesSkills ?? []).flatMap((_, each) => (each === index ? ids : speciesSkillsOf(each)))
    set({ speciesSkills: all as CreationChoices["speciesSkills"] })
  }

  // Cantrips an option adds (a Thaumaturge's) are chosen with the class's own.
  const extra = (options.featureChoices ?? []).flatMap((entry) => {
    const option = entry.options.find((each) => each.id === choices.featureChoices?.[entry.feature.id])
    return option?.cantrips ? [option.cantrips] : []
  })
  const cantripCount = (options.cantrips?.count ?? 0) + extra.reduce((sum, each) => sum + each.count, 0)
  const cantripFrom = [...new Map([...(options.cantrips?.from ?? []), ...extra.flatMap((each) => each.from)].map((spell) => [spell.id, spell])).values()]
  // A Wizard prepares from the spellbook.
  const preparable = options.spellbook ? (options.spells?.from ?? []).filter((spell) => choices.spellbook?.includes(spell.id)) : (options.spells?.from ?? [])
  const speciesFeat = options.speciesFeat?.feats.find((feat) => feat.id === choices.speciesFeat)
  const languages = [...options.languages.standardFrom, ...(options.languages.rareFrom ?? [])]

  return (
    <div className="grid gap-5">
      <Section title="Ability Scores">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {ABILITIES.map((ability) => {
            const added = choices.abilityIncrease[ability] ?? 0
            const raises = scores.increase.from.includes(ability)
            return (
              <div key={ability} className="grid gap-1 text-center">
                <span className="font-mono text-[10px] uppercase tracking-wider text-white/60">{ABILITY_NAMES[ability].slice(0, 3)}</span>
                <select
                  aria-label={ABILITY_NAMES[ability]}
                  className={cn(siteField, "bg-black/30 px-1 text-center")}
                  value={choices.abilityScores[ability]}
                  onChange={(event) => place(ability, Number(event.target.value))}
                >
                  {scores.standardArray.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                {raises ? (
                  <Option active={added > 0} aria-label={`${ABILITY_NAMES[ability]} Increase, ${added}`} className="px-1 tabular-nums" onClick={() => raise(ability)}>
                    +{added}
                  </Option>
                ) : (
                  <span className="py-1.5 text-sm text-white/30">+0</span>
                )}
                <span className="font-display text-lg text-amber-300 tabular-nums">{choices.abilityScores[ability] + added}</span>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-sm text-white/60">
          {options.background.name} raises {scores.increase.from.map((ability) => ABILITY_NAMES[ability]).join(", ")}: one by 2 and one by 1, or all three by 1.
        </p>
      </Section>

      {options.size && (
        <Section title="Size">
          <Picks
            label="Size"
            from={options.size.map((size) => ({ id: size, name: size }))}
            picked={choices.size ? [choices.size] : []}
            most={1}
            onPick={([id]) => set({ size: id as CreationChoices["size"] })}
          />
        </Section>
      )}

      {options.speciesChoices?.map((entry) => (
        <Section key={entry.choice} title={entry.trait.name}>
          <Picks
            label={entry.trait.name}
            from={entry.options.map((option) => ({ id: option.id, name: option.cantrips?.length ? `${option.name} · ${option.cantrips.map((spell) => spell.name).join(", ")}` : option.name }))}
            picked={choices.speciesChoices?.[entry.choice] ? [choices.speciesChoices[entry.choice]] : []}
            most={1}
            onPick={([id]) => set({ speciesChoices: { ...choices.speciesChoices, [entry.choice]: id } })}
          />
        </Section>
      ))}
      {options.speciesSpellAbility && (
        <Section title={`${options.species.name} Spellcasting Ability`}>
          <Picks
            label="Species Spellcasting Ability"
            from={options.speciesSpellAbility.from.map((id) => ({ id, name: ABILITY_NAMES[id] }))}
            picked={choices.speciesSpellAbility ? [choices.speciesSpellAbility] : []}
            most={1}
            onPick={([id]) => set({ speciesSpellAbility: id as AbilityId })}
          />
        </Section>
      )}

      <Section title="Skills" count={`${choices.classSkills.length} of ${options.skills.count}`}>
        <Picks
          label="Skills"
          fixed={options.skills.background}
          from={options.skills.from}
          picked={choices.classSkills}
          most={options.skills.count}
          onPick={(ids) => set({ classSkills: ids as CreationChoices["classSkills"] })}
        />
      </Section>
      {options.speciesSkills?.map((entry, index) => (
        <Section key={entry.trait.id} title={`${entry.trait.name} Skill`} count={entry.count > 1 ? `${speciesSkillsOf(index).length} of ${entry.count}` : undefined}>
          <Picks label={entry.trait.name} from={entry.from} picked={speciesSkillsOf(index)} most={entry.count} onPick={(ids) => setSpeciesSkills(index, ids)} />
        </Section>
      ))}

      {options.speciesFeat && (
        <Section title={`${options.speciesFeat.trait.name} Feat`}>
          <Picks
            label="Feat"
            from={options.speciesFeat.feats}
            picked={choices.speciesFeat ? [choices.speciesFeat] : []}
            most={1}
            onPick={([id]) => set({ speciesFeat: id, speciesFeatPicks: undefined })}
          />
          {speciesFeat && <FeatChoices feat={speciesFeat} picks={choices.speciesFeatPicks ?? {}} kit={kit} onChange={(picks) => set({ speciesFeatPicks: picks })} />}
        </Section>
      )}
      {(options.backgroundFeat.spellPicks || options.backgroundFeat.skillPicks) && (
        <Section title={`${options.background.name} Feat · ${options.backgroundFeat.name}`}>
          <FeatChoices feat={options.backgroundFeat} picks={choices.backgroundFeatPicks ?? {}} kit={kit} onChange={(picks) => set({ backgroundFeatPicks: picks })} />
        </Section>
      )}

      {options.featureChoices?.map((entry) => (
        <Section key={entry.feature.id} title={entry.feature.name}>
          <Picks
            label={entry.feature.name}
            from={entry.options}
            picked={choices.featureChoices?.[entry.feature.id] ? [choices.featureChoices[entry.feature.id]] : []}
            most={1}
            onPick={([id]) => set({ featureChoices: { ...choices.featureChoices, [entry.feature.id]: id } })}
          />
        </Section>
      ))}
      {options.expertise?.map((entry) => (
        <Section key={entry.feature.id} title="Expertise" count={`${choices.expertise?.length ?? 0} of ${entry.count}`}>
          <Picks
            label="Expertise"
            from={entry.from.filter((skill) => proficient.has(skill.id))}
            picked={choices.expertise ?? []}
            most={entry.count}
            onPick={(ids) => set({ expertise: ids as CreationChoices["expertise"] })}
          />
        </Section>
      ))}
      {options.weaponMasteries && (
        <Section title="Weapon Mastery" count={`${choices.weaponMasteries?.length ?? 0} of ${options.weaponMasteries.count}`}>
          <Picks
            label="Weapon Mastery"
            from={options.weaponMasteries.from}
            picked={choices.weaponMasteries ?? []}
            most={options.weaponMasteries.count}
            onPick={(ids) => set({ weaponMasteries: ids })}
          />
        </Section>
      )}

      {cantripCount > 0 && (
        <Section title="Cantrips" count={`${choices.cantrips?.length ?? 0} of ${cantripCount}`}>
          <Picks label="Cantrips" from={cantripFrom} picked={choices.cantrips ?? []} most={cantripCount} onPick={(ids) => set({ cantrips: ids })} />
        </Section>
      )}
      {options.spellbook && (
        <Section title="Spellbook" count={`${choices.spellbook?.length ?? 0} of ${options.spellbook.count}`}>
          <Picks
            label="Spellbook"
            from={options.spellbook.from}
            picked={choices.spellbook ?? []}
            most={options.spellbook.count}
            onPick={(ids) => set({ spellbook: ids, spells: (choices.spells ?? []).filter((id) => ids.includes(id)) })}
          />
        </Section>
      )}
      {options.spells && (
        <Section title="Prepared Spells" count={`${choices.spells?.length ?? 0} of ${options.spells.count}`}>
          <Picks label="Prepared Spells" from={preparable} picked={choices.spells ?? []} most={options.spells.count} onPick={(ids) => set({ spells: ids })} />
        </Section>
      )}

      <Section title="Starting Gear">
        <Gear
          label={options.class.name}
          offers={options.equipment.class}
          option={choices.equipment.class}
          picks={choices.equipment.classPicks ?? {}}
          onChange={(option, picks) => set({ equipment: { ...choices.equipment, class: option, classPicks: picks } })}
        />
        <Gear
          label={options.background.name}
          offers={options.equipment.background}
          option={choices.equipment.background}
          picks={choices.equipment.backgroundPicks ?? {}}
          onChange={(option, picks) => set({ equipment: { ...choices.equipment, background: option, backgroundPicks: picks } })}
        />
      </Section>

      <Section title="Languages" count={`${choices.languages.length} of ${options.languages.count}`}>
        <Picks label="Languages" fixed={options.languages.known} from={languages} picked={choices.languages} most={options.languages.count} onPick={(ids) => set({ languages: ids })} />
      </Section>
    </div>
  )
}
