import { type AbilityId, abilityIds, type SkillId, skillIds } from "@d20/srd"
import { classById } from "@d20/srd/classes"
import { equipment } from "@d20/srd/equipment"
import { feats } from "@d20/srd/feats"
import type { ClassFeature } from "@d20/srd/schema/classes"
import { skillById } from "@d20/srd/skills"
import { spellById } from "@d20/srd/spells"
import { subclassById } from "@d20/srd/subclasses"
import {
  alwaysPrepared,
  cantripsAllowed,
  deriveSheet,
  evocationSavantSpells,
  expertiseSlots,
  featPrerequisiteProblem,
  featuresOf,
  grantsFeatByLevel,
  highestSlotLevel,
  needsFeatureChoice,
  optionCantrips,
  sheetProblems,
  subclassLevelOf,
  trainedWith,
} from "./derive"
import type { Advancement, Sheet } from "./sheet"

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

/** An option of a feature's choice. One that brings cantrips (Druidic Warrior) says how many and from which spells. */
export type ChoiceOffer = Named & { cantrips?: { count: number; from: Named[] } }

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
  /** Cantrips to learn: how many more, from the class's list. Cantrips an option brings are on the option. */
  cantrips?: { count: number; from: Named[] }
  /**
   * Spells to prepare: how many to add, how many are prepared in all at the new level, the highest spell level the
   * hero has slots for, and the class's spells up to it that are not yet prepared. A spell now always prepared leaves
   * the list (`dropped`) and is replaced. A Wizard prepares from the spellbook, with this level's additions.
   */
  spells?: { count: number; prepared: number; highestLevel: number; from: (Named & { level: number })[]; dropped?: Named[] }
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
  cantrips?: string[]
  spells?: string[]
  spellbook?: string[]
  weaponMasteries?: string[]
}

const named = (entry: { id: string; name: string }): Named => ({ id: entry.id, name: entry.name })
const skillNamed = (id: SkillId): Named => ({ id, name: skillById.get(id)?.name ?? id })
const spellNamed = (id: string): Named => ({ id, name: spellById.get(id)?.name ?? id })

// The spells of a class's list from one spell level to another.
function listSpells(classId: string, from: number, to: number): string[] {
  return (classById.get(classId)?.spellcasting?.spellList ?? []).filter((entry) => entry.level >= from && entry.level <= to).flatMap((entry) => entry.spells)
}

// The Wizard's spellbook size at a level: six, two more each level after the first, and Evocation Savant's.
function bookSize(sheet: Sheet): number {
  const cls = classById.get(sheet.class)
  if (!cls?.spellcasting?.ritualFromSpellbook) return 0
  return 4 + 2 * sheet.level + evocationSavantSpells(cls, featuresOf(sheet), sheet.level)
}

// The kinds of weapons a sheet may master at its level.
function masteriesAllowed(sheet: Sheet): number {
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

  // Feats: an Ability Score Improvement gained at this level offers every feat the hero qualifies for.
  const granting = gained.find((feature) => grantsFeatByLevel(feature) && feature.levels.includes(level))
  if (granting) {
    const held = new Set(derived.feats)
    const offered = feats.filter((feat) => (!held.has(feat.id) || feat.repeatable) && !featPrerequisiteProblem(feat, level, sheet.abilityScores, featuresOf(next), !!cls.spellcasting))
    offered.sort((a, b) => (a.id === granting.feat?.id ? -1 : b.id === granting.feat?.id ? 1 : 0))
    options.feat = {
      feature: named(granting),
      feats: offered.map((feat): FeatOffer => {
        const increase = feat.abilityScoreIncrease
        const picks = feat.benefits?.find((benefit) => benefit.cantrips && benefit.spellLists)
        const proficiencies = feat.proficiencyChoice
        return {
          ...named(feat),
          ...(proficiencies ? { skillPicks: { count: proficiencies.count, from: skillIds.filter((skill) => !derived.skills[skill].proficient).map(skillNamed) } } : {}),
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
      }),
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
  if (choosing.length) options.featureChoices = choosing.map((feature) => ({ feature: named(feature), options: choiceOffers(feature, derived.feats, derived.cantrips) }))

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
    if (prepared > kept.length)
      options.spells = {
        count: prepared - kept.length,
        prepared,
        highestLevel: highest,
        from: listSpells(cls.id, 1, highest)
          .filter((id) => !kept.includes(id) && !always.includes(id))
          .map((id) => ({ ...spellNamed(id), level: spellById.get(id)?.level ?? 1 })),
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

// The options of a feature's kept choice: its own options, with the cantrips any of them brings, and the feats of the
// category it grants that the hero does not hold.
function choiceOffers(feature: ClassFeature, held: readonly string[], cantrips: readonly string[]): ChoiceOffer[] {
  const own = (feature.options ?? []).map((option): ChoiceOffer => {
    const extra = optionCantrips(option)
    return {
      ...named(option),
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
  if (problems.length) return { problems }

  const next = nextSheet(sheet, choices.subclass)
  if (options.subclass && !choices.subclass) delete next.subclass
  const abilityScores = { ...sheet.abilityScores }
  for (const [ability, amount] of Object.entries(choices.abilities ?? {}) as [AbilityId, number][]) abilityScores[ability] += amount
  const always = alwaysPrepared(next)
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
