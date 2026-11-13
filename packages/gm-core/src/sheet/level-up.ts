import { type AbilityId, abilityIds, type SkillId, skillIds } from "@d20/srd"
import { classById } from "@d20/srd/classes"
import { equipment } from "@d20/srd/equipment"
import { feats } from "@d20/srd/feats"
import type { ClassFeature } from "@d20/srd/schema/classes"
import type { Feat } from "@d20/srd/schema/origins"
import { skillById } from "@d20/srd/skills"
import { spellById } from "@d20/srd/spells"
import { subclassById } from "@d20/srd/subclasses"
import {
  alwaysPrepared,
  cantripFits,
  cantripNeed,
  cantripsAllowed,
  deriveSheet,
  evocationSavantSpells,
  expertiseSlots,
  featOfferable,
  featPrerequisiteProblem,
  featuresOf,
  grantsFeatByLevel,
  highestSlotLevel,
  keptOptions,
  LAND_CHOICE,
  needsFeatureChoice,
  optionCantrips,
  pickOptions,
  picksAt,
  preparedLists,
  sheetProblems,
  spellPickSlots,
  subclassLevelOf,
  takesPicks,
  trainedWith,
} from "./derive"
import type { Advancement, FeaturePick, Sheet } from "./sheet"

/**
 * Levelling a hero up by one level, as pure functions: what the next level asks the player to choose, and the sheet
 * those choices make, checked by `sheetProblems`. Hit points are the SRD's fixed average for each level, so nothing is
 * rolled.
 */

export type Named = { id: string; name: string }

/**
 * A feat a level offers, with what taking it asks for: the raises its increase allows, Magic Initiate's spell picks,
 * or Skilled's skills, sent as `featPicks.skills`. The engine holds no tool proficiencies, so Skilled gives skills.
 */
export type FeatOffer = Named & {
  abilityScoreIncrease?: { from: AbilityId[]; choices: { count: number; amount: number }[]; maximum: number }
  spellPicks?: { spellLists: string[]; spellAbility: AbilityId[]; cantrips: number; spellLevel: number }
  skillPicks?: { count: number; from: Named[] }
}

/**
 * An option of a feature's choice. One that brings cantrips (Druidic Warrior) says how many and from which spells. A
 * Circle of the Land's land names the spells it keeps prepared up to the level (`prepares`): one already prepared
 * leaves the list and is replaced.
 */
export type ChoiceOffer = Named & { cantrips?: { count: number; from: Named[] }; prepares?: Named[] }

/**
 * An option of a feature that takes several (an Eldritch Invocation, a Metamagic option), with its prerequisite as
 * printed and what the engine checks of it: a class level, another option of the feature picked, and a cantrip of the
 * kind it names, from `cantrips`, which the hero must know. An option that gives a feat offers `feats`. A repeatable
 * option is picked again with another cantrip or feat.
 */
export type PickOffer = Named & {
  /** A spell's level, for a feature whose picks are spells (Mystic Arcanum). */
  level?: number
  prerequisite?: { text: string; level?: number; option?: string }
  repeatable?: true
  cantrips?: Named[]
  feats?: Named[]
}

/**
 * A feature that takes several options from its list: how many it holds in all at the level, the options picked so
 * far, and whether one of those may be replaced at this level (Eldritch Invocations, Metamagic). A feature whose picks
 * are spells says the spell levels each pick may be, one entry a pick (`slots`): Mystic Arcanum's [[6], [7]] at 13.
 */
export type PicksOffer = { feature: Named; count: number; picked: FeaturePick[]; replace: boolean; options: PickOffer[]; slots?: number[][] }

/** What the next level asks of a hero, and from what. A key is present only when the level asks for it. */
export type LevelUpOptions = {
  /** The level the hero reaches. */
  level: number
  /** The Hit Point maximum at that level, with the fixed hit points the level gives. */
  hitPointMaximum: number
  /** The class and subclass features gained at that level. */
  features: Named[]
  /** The subclass to choose: the class's SRD subclasses. Only at the level the class grants one. */
  subclass?: Named[]
  /** The feat an Ability Score Improvement grants: the feats the hero qualifies for, Ability Score Improvement first. */
  feat?: { feature: Named; feats: FeatOffer[] }
  /** New Expertise, for each feature that gives it: how many skills, from those the hero is proficient in without it. */
  expertise?: { feature: Named; count: number; from: Named[] }[]
  /** Skill proficiencies a feature gives (College of Lore's three), from those the hero lacks. */
  skills?: { feature: Named; count: number; from: Named[] }
  /** A choice a new feature keeps on the sheet (Fighting Style, Hunter's Prey): its options, and for a Fighting Style its feats. */
  featureChoices?: { feature: Named; options: ChoiceOffer[] }[]
  /** A feature that takes several options from its list, as it stands at the level: the picks to add, and one to replace. */
  featurePicks?: PicksOffer[]
  /** Cantrips to learn: how many more, from the class's list. Cantrips an option brings are on the option. */
  cantrips?: { count: number; from: Named[] }
  /**
   * Spells to prepare: how many to add, how many are prepared in all at the new level, the highest spell level the
   * hero has slots for, and the class's spells up to it that are not yet prepared. A spell now always prepared leaves
   * the list (`dropped`) and is replaced. A Wizard prepares from the spellbook, with this level's additions. A spell
   * from another class's list, which Magical Secrets allows, names that list (`list`).
   */
  spells?: { count: number; prepared: number; highestLevel: number; from: (Named & { level: number; list?: string })[]; dropped?: Named[] }
  /** Spells to add to a Wizard's spellbook: how many, of which `evocation` must be Evocation spells (Evocation Savant). */
  spellbook?: { count: number; evocation: number; highestLevel: number; from: (Named & { level: number; school: string })[] }
  /** More kinds of weapons to master, up to `count`, from the weapons the class is trained with. */
  weaponMasteries?: { count: number; from: Named[] }
}

/** What a player chose for the next level. Lists are additions to what the sheet has. */
export type LevelUpChoices = {
  subclass?: string
  /** The feat an Ability Score Improvement grants: "ability-score-improvement", or another the hero qualifies for. */
  feat?: string
  /** The scores the feat raises: `{ str: 2 }` or `{ str: 1, con: 1 }`. */
  abilities?: Partial<Record<AbilityId, number>>
  /** The feat's own picks: Magic Initiate's spells, or Skilled's skills. */
  featPicks?: Pick<Advancement, "spellList" | "spellAbility" | "cantrips" | "spell" | "skills">
  expertise?: SkillId[]
  skills?: SkillId[]
  /** A feature's id and the option or feat taken: `{ "ranger-fighting-style": "archery" }`. */
  featureChoices?: Record<string, string>
  /** A feature's id and all its picks at the new level: those kept, those added, and the one in place of one replaced. */
  featurePicks?: Record<string, FeaturePick[]>
  cantrips?: string[]
  spells?: string[]
  spellbook?: string[]
  weaponMasteries?: string[]
}

export const named = (entry: { id: string; name: string }): Named => ({ id: entry.id, name: entry.name })
export const skillNamed = (id: SkillId): Named => ({ id, name: skillById.get(id)?.name ?? id })
export const spellNamed = (id: string): Named => ({ id, name: spellById.get(id)?.name ?? id })

/** A feat as an offer, with what taking it asks for. Skilled's skills come from `unskilled`, those the hero lacks. */
export function featOffer(feat: Feat, unskilled: readonly SkillId[]): FeatOffer {
  const increase = feat.abilityScoreIncrease
  const picks = feat.benefits?.find((benefit) => benefit.cantrips && benefit.spellLists)
  const proficiencies = feat.proficiencyChoice
  return {
    ...named(feat),
    ...(proficiencies ? { skillPicks: { count: proficiencies.count, from: unskilled.map(skillNamed) } } : {}),
    ...(increase
      ? { abilityScoreIncrease: { from: increase.from === "any" ? [...abilityIds] : [...increase.from], choices: increase.choices.map((choice) => ({ ...choice })), maximum: increase.maximum } }
      : {}),
    ...(picks
      ? {
          spellPicks: {
            spellLists: [...(picks.spellLists ?? [])],
            spellAbility: [...(picks.spellcastingAbility ?? [])],
            cantrips: picks.cantrips ?? 0,
            spellLevel: feat.benefits?.find((benefit) => benefit.spellLevel)?.spellLevel ?? 1,
          },
        }
      : {}),
  }
}

/** The spells of a class's list from one spell level to another. */
export function listSpells(classId: string, from: number, to: number): string[] {
  return (classById.get(classId)?.spellcasting?.spellList ?? []).filter((entry) => entry.level >= from && entry.level <= to).flatMap((entry) => entry.spells)
}

/** The Wizard's spellbook size at a level: six, two more each level after the first, and Evocation Savant's. */
export function bookSize(sheet: Sheet): number {
  const cls = classById.get(sheet.class)
  if (!cls?.spellcasting?.ritualFromSpellbook) return 0
  return 4 + 2 * sheet.level + evocationSavantSpells(cls, featuresOf(sheet), sheet.level)
}

/** The kinds of weapons a sheet may master at its level. */
export function masteriesAllowed(sheet: Sheet): number {
  const cls = classById.get(sheet.class)
  return cls?.levels[sheet.level - 1]?.weaponMastery ?? featuresOf(sheet).reduce((most, feature) => Math.max(most, feature.weaponMasteries ?? 0), 0)
}

// The sheet one level on with nothing yet chosen, and the class's one SRD subclass from the level it is granted, so
// the subclass's features of that level can be read.
function nextSheet(sheet: Sheet, subclass?: string): Sheet {
  const level = sheet.level + 1
  const cls = classById.get(sheet.class)
  const granted = cls && level >= subclassLevelOf(cls) ? (subclass ?? sheet.subclass ?? (cls.subclasses.length === 1 ? cls.subclasses[0] : undefined)) : undefined
  return { ...sheet, level, ...(granted ? { subclass: granted } : {}) }
}

/**
 * What the next level asks a hero to choose, and from what, by SRD id and name. Throws for a sheet whose class,
 * species or background is unknown, as `deriveSheet` does, and for a hero already at level 20.
 */
export function levelUpOptions(sheet: Sheet): LevelUpOptions {
  const cls = classById.get(sheet.class)
  if (!cls) throw new Error(`"${sheet.class}" is not a class`)
  if (sheet.level >= 20) throw new Error("The hero is already level 20")
  const next = nextSheet(sheet)
  const level = next.level
  const before = new Set(featuresOf(sheet).map((feature) => feature.id))
  const gained = featuresOf(next).filter((feature) => !before.has(feature.id) || (feature.levels.includes(level) && feature.level < level))
  const derived = deriveSheet(next)
  const options: LevelUpOptions = { level, hitPointMaximum: derived.hitPointMaximum, features: gained.map(named) }

  if (level === subclassLevelOf(cls)) options.subclass = cls.subclasses.flatMap((id) => (subclassById.get(id) ? [named(subclassById.get(id) as Named)] : []))

  // Feats: an Ability Score Improvement or an Epic Boon gained at this level offers every feat the hero qualifies for,
  // the feature's own feat or its recommended one first, then the rest of its category.
  const granting = gained.find((feature) => grantsFeatByLevel(feature) && feature.levels.includes(level))
  if (granting) {
    const held = new Set(derived.feats)
    const offered = feats.filter((feat) => (!held.has(feat.id) || feat.repeatable) && !featPrerequisiteProblem(feat, level, sheet.abilityScores, featuresOf(next), !!cls.spellcasting))
    const rank = (feat: Feat) => (feat.id === (granting.feat?.id ?? granting.feat?.recommended) ? 0 : feat.category === granting.feat?.category ? 1 : 2)
    offered.sort((a, b) => rank(a) - rank(b))
    options.feat = {
      feature: named(granting),
      feats: offered.map((feat) =>
        featOffer(
          feat,
          skillIds.filter((skill) => !derived.skills[skill].proficient)
        )
      ),
    }
  }

  // Expertise: the slots the new level adds, for each feature, from the skills the hero has without Expertise.
  const proficient = skillIds.filter((skill) => derived.skills[skill].proficient && !derived.skills[skill].expertise)
  const now = expertiseSlots(featuresOf(sheet), sheet.level)
  const then = expertiseSlots(featuresOf(next), level)
  const expertise = [...new Set(then.map((slot) => slot.feature))].flatMap((feature) => {
    const count = then.filter((slot) => slot.feature === feature).length - now.filter((slot) => slot.feature === feature).length
    const from = proficient.filter((skill) => !feature.expertise?.from || feature.expertise.from.includes(skill))
    return count > 0 ? [{ feature: named(feature), count, from: from.map(skillNamed) }] : []
  })
  if (expertise.length) options.expertise = expertise

  const skilled = gained.find((feature) => feature.skillProficiencies && feature.levels.includes(level))
  if (skilled?.skillProficiencies) {
    const from = skillIds.filter((skill) => !derived.skills[skill].proficient && (!skilled.skillProficiencies?.from || skilled.skillProficiencies.from.includes(skill)))
    options.skills = { feature: named(skilled), count: skilled.skillProficiencies.count, from: from.map(skillNamed) }
  }

  // A choice a new feature keeps: its options, and for a feature that grants a feat of a category, those feats.
  const choosing = gained.filter((feature) => needsFeatureChoice(feature) && !sheet.featureChoices?.[feature.id])
  if (choosing.length) options.featureChoices = choosing.map((feature) => ({ feature: named(feature), options: choiceOffers(feature, derived.feats, derived.cantrips, next) }))

  // A feature that takes several options: offered at every level it is held, for the picks a level adds and the one
  // it may replace.
  const picking = featuresOf(next).filter(takesPicks)
  if (picking.length) options.featurePicks = picking.map((feature) => picksOffer(feature, next, before.has(feature.id) ? (sheet.featurePicks?.[feature.id] ?? []) : [], before.has(feature.id)))

  if (cls.spellcasting) {
    const highest = highestSlotLevel(cls, level)
    const cantrips = cantripsAllowed(next) - cantripsAllowed(sheet)
    if (cantrips > 0)
      options.cantrips = {
        count: cantrips,
        from: listSpells(cls.id, 0, 0)
          .filter((id) => !derived.cantrips.includes(id))
          .map(spellNamed),
      }
    const always = alwaysPrepared(next)
    const kept = (sheet.spells ?? []).filter((id) => !always.includes(id))
    const prepared = cls.levels[level - 1]?.preparedSpells ?? 0
    const dropped = (sheet.spells ?? []).filter((id) => always.includes(id))
    // The class's own list first, then the lists Magical Secrets adds, each spell once.
    const lists = preparedLists(cls, featuresOf(next))
    const listed = new Map<string, string>()
    for (const list of lists) for (const id of listSpells(list, 1, highest)) if (!listed.has(id)) listed.set(id, list)
    if (prepared > kept.length)
      options.spells = {
        count: prepared - kept.length,
        prepared,
        highestLevel: highest,
        from: [...listed]
          .filter(([id]) => !kept.includes(id) && !always.includes(id))
          .map(([id, list]) => ({ ...spellNamed(id), level: spellById.get(id)?.level ?? 1, ...(list !== cls.id ? { list } : {}) })),
        ...(dropped.length ? { dropped: dropped.map(spellNamed) } : {}),
      }
    const pages = bookSize(next) - bookSize(sheet)
    if (pages > 0) {
      const savant = evocationSavantSpells(cls, featuresOf(next), level) - evocationSavantSpells(cls, featuresOf(sheet), sheet.level)
      options.spellbook = {
        count: pages,
        evocation: savant,
        highestLevel: highest,
        from: listSpells(cls.id, 1, highest)
          .filter((id) => !(sheet.spellbook ?? []).includes(id))
          .map((id) => ({ ...spellNamed(id), level: spellById.get(id)?.level ?? 1, school: spellById.get(id)?.school ?? "" })),
      }
    }
  }

  const masteries = masteriesAllowed(next) - (sheet.weaponMasteries?.length ?? 0)
  if (masteries > 0 && masteriesAllowed(next) > masteriesAllowed(sheet))
    options.weaponMasteries = {
      count: masteries,
      from: equipment.filter((entry) => entry.kind === "weapon" && trainedWith(cls.weapons, entry) && !(sheet.weaponMasteries ?? []).includes(entry.id)).map(named),
    }
  return options
}

/**
 * What a feature that takes several options offers on a sheet at its level: the count it holds there, the picks kept
 * from before, whether one may be replaced, and each option with its prerequisite, the cantrips of its class's list
 * that meet one that names a cantrip, and the feats one that gives a feat may give.
 */
export function picksOffer(feature: ClassFeature, sheet: Sheet, picked: readonly FeaturePick[], replace: boolean): PicksOffer {
  const cls = classById.get(sheet.class)
  const slots = spellPickSlots(feature, sheet.level)
  return {
    feature: named(feature),
    count: cls ? picksAt(cls, sheet.level, feature) : 0,
    picked: picked.map((pick) => ({ ...pick })),
    replace,
    ...(slots ? { slots } : {}),
    // Options from elsewhere are offered by name, with nothing more to them: Wild Shape's Beast forms, and a spell with its level.
    options: !feature.options
      ? pickOptions(feature, sheet.level).map((option) => ({ ...named(option), ...(option.level !== undefined ? { level: option.level } : {}) }))
      : feature.options.map((option): PickOffer => {
          const need = cantripNeed(option)
          const grant = option.feat
          return {
            ...named(option),
            ...(option.prerequisite
              ? {
                  prerequisite: {
                    text: option.prerequisite.text,
                    ...(option.prerequisite.level ? { level: option.prerequisite.level } : {}),
                    ...(option.prerequisite.invocation ? { option: option.prerequisite.invocation } : {}),
                  },
                }
              : {}),
            ...(option.repeatable ? { repeatable: true as const } : {}),
            ...(need
              ? {
                  cantrips: listSpells(need.spellList, 0, 0)
                    .filter((id) => cantripFits(need, id))
                    .map(spellNamed),
                }
              : {}),
            ...(grant ? { feats: feats.filter((feat) => featOfferable(feat, grant.category)).map(named) } : {}),
          }
        }),
  }
}

/**
 * The options of a feature's kept choice: its own options, or those its text names (a Circle of the Land's lands),
 * with the cantrips any of them brings and the spells a land keeps prepared on `sheet`, and the feats of the category
 * it grants that the hero does not hold.
 */
export function choiceOffers(feature: ClassFeature, held: readonly string[], cantrips: readonly string[], sheet?: Sheet): ChoiceOffer[] {
  const own = keptOptions(feature).map((entry): ChoiceOffer => {
    const option = feature.options?.find((each) => each.id === entry.id)
    const extra = option && optionCantrips(option)
    const prepares =
      feature.id === LAND_CHOICE && sheet ? alwaysPrepared({ ...sheet, featureChoices: { ...sheet.featureChoices, [LAND_CHOICE]: entry.id } }).filter((id) => !alwaysPrepared(sheet).includes(id)) : []
    return {
      ...named(entry),
      ...(prepares.length ? { prepares: prepares.map(spellNamed) } : {}),
      ...(extra
        ? {
            cantrips: {
              count: extra.count,
              from: listSpells(extra.spellList, 0, 0)
                .filter((id) => !cantrips.includes(id))
                .map(spellNamed),
            },
          }
        : {}),
    }
  })
  const grant = feature.feat
  const category = grant && "category" in grant ? grant.category : undefined
  const offered = category ? feats.filter((feat) => feat.category === category && (!held.includes(feat.id) || feat.repeatable)).map(named) : []
  return [...offered, ...own]
}

/** Whether two picks are the same option with the same cantrip and feat. */
export const samePick = (a: FeaturePick, b: FeaturePick) => a.option === b.option && a.cantrip === b.cantrip && a.feat === b.feat

/**
 * The sheet one level on, with the player's choices for it, or the problems that keep it from being legal: a choice
 * the level does not ask for, and every fault `sheetProblems` finds in the sheet it would make. Hit points are the
 * fixed average, worked out from the level. A spell the new level keeps always prepared leaves the prepared list.
 */
export function levelUp(sheet: Sheet, choices: LevelUpChoices): { sheet: Sheet } | { problems: string[] } {
  if (sheet.level >= 20) return { problems: ["the hero is already level 20"] }
  const options = levelUpOptions(sheet)
  const level = options.level
  const problems: string[] = []
  if (choices.subclass && !options.subclass) problems.push(`level ${level} grants no subclass`)
  if ((choices.feat || choices.abilities || choices.featPicks) && !options.feat) problems.push(`level ${level} grants no feat`)
  if (choices.skills?.length && !options.skills) problems.push(`level ${level} gives no skill proficiencies`)
  if (choices.expertise?.length && !options.expertise) problems.push(`level ${level} gives no Expertise`)
  for (const id of Object.keys(choices.featureChoices ?? {})) if (!options.featureChoices?.some((entry) => entry.feature.id === id)) problems.push(`"${id}" asks for no choice at level ${level}`)
  // Picks: those kept from before stay, but for one a level may replace.
  for (const [id, picks] of Object.entries(choices.featurePicks ?? {})) {
    const offer = options.featurePicks?.find((entry) => entry.feature.id === id)
    if (!offer) {
      problems.push(`"${id}" takes no picks at level ${level}`)
      continue
    }
    const left = [...picks]
    const dropped = offer.picked.filter((pick) => {
      const index = left.findIndex((each) => samePick(each, pick))
      if (index < 0) return true
      left.splice(index, 1)
      return false
    })
    if (dropped.length > (offer.replace ? 1 : 0))
      problems.push(`${offer.feature.name} may replace ${offer.replace ? "one option" : "no option"} at level ${level}, and the choices replace ${dropped.length}`)
  }
  if (problems.length) return { problems }

  const next = nextSheet(sheet, choices.subclass)
  if (options.subclass && !choices.subclass) delete next.subclass
  const abilityScores = { ...sheet.abilityScores }
  for (const [ability, amount] of Object.entries(choices.abilities ?? {}) as [AbilityId, number][]) abilityScores[ability] += amount
  // A choice made now (a Circle of the Land's land) may keep more spells prepared.
  const always = alwaysPrepared({ ...next, featureChoices: { ...sheet.featureChoices, ...choices.featureChoices } })
  const add = <T>(have: readonly T[] | undefined, more: readonly T[] | undefined): T[] | undefined => {
    const all = [...(have ?? []), ...(more ?? [])]
    return all.length ? all : undefined
  }
  const entry: Advancement = {
    level,
    ...(choices.feat ? { feat: choices.feat } : {}),
    ...(choices.abilities && Object.keys(choices.abilities).length ? { abilities: { ...choices.abilities } } : {}),
    ...(choices.skills?.length ? { skills: [...choices.skills] } : {}),
    ...(choices.featPicks ?? {}),
  }
  const built: Sheet = {
    ...next,
    abilityScores,
    expertise: add(sheet.expertise, choices.expertise),
    featureChoices: choices.featureChoices || sheet.featureChoices ? { ...sheet.featureChoices, ...choices.featureChoices } : undefined,
    featurePicks: choices.featurePicks || sheet.featurePicks ? { ...sheet.featurePicks, ...choices.featurePicks } : undefined,
    cantrips: add(sheet.cantrips, choices.cantrips),
    spells: add(
      (sheet.spells ?? []).filter((id) => !always.includes(id)),
      choices.spells
    ),
    spellbook: add(sheet.spellbook, choices.spellbook),
    weaponMasteries: add(sheet.weaponMasteries, choices.weaponMasteries),
    advancements: add(sheet.advancements, Object.keys(entry).length > 1 ? [entry] : []),
  }
  // Keys with nothing in them are left off, as a sheet written by hand would leave them.
  for (const key of Object.keys(built) as (keyof Sheet)[]) if (built[key] === undefined) delete built[key]
  const faults = sheetProblems(built)
  return faults.length ? { problems: faults } : { sheet: built }
}
