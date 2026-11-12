import { type AbilityId, abilityIds, type DamageTypeId, type SkillId, skillIds } from "@d20/srd"
import { backgroundById } from "@d20/srd/backgrounds"
import { classFeatureById } from "@d20/srd/class-features"
import { classById } from "@d20/srd/classes"
import { damageTypeById, damageTypes } from "@d20/srd/damage-types"
import { equipmentById } from "@d20/srd/equipment"
import { featById } from "@d20/srd/feats"
import { languageById } from "@d20/srd/languages"
import type { Class, ClassFeature, FeatureOption, Subclass } from "@d20/srd/schema/classes"
import type { Armor } from "@d20/srd/schema/equipment"
import type { Background, Feat } from "@d20/srd/schema/origins"
import { skillById } from "@d20/srd/skills"
import { spellById } from "@d20/srd/spells"
import { subclassById } from "@d20/srd/subclasses"
import { grantedSkills, type SpeciesEntry, speciesById } from "./house-species"
import type { Advancement, Sheet } from "./sheet"

type ArmorTraining = "light" | "medium" | "heavy" | "shields"
type Sense = { type: "darkvision" | "blindsight" | "tremorsense" | "truesight"; range: number }

/** Everything the rules work out from a sheet. Nothing here is stored: it is derived again whenever the sheet changes. */
export type DerivedSheet = {
  proficiencyBonus: number
  abilityModifiers: Record<AbilityId, number>
  hitDie: number
  hitPointMaximum: number
  armorClass: number
  /** What the Armor Class comes from, for the sheet to show: the armor's name, a feature's name, or "No armor". */
  armorClassFrom: string
  savingThrows: Record<AbilityId, { bonus: number; proficient: boolean }>
  skills: Record<SkillId, { bonus: number; proficient: boolean; expertise: boolean }>
  passivePerception: number
  initiative: number
  /** Feet. */
  speed: number
  senses: Sense[]
  /** Damage types the character always resists. A resistance that holds only under a condition (Rage) is not here. */
  resistances: DamageTypeId[]
  armorTraining: ArmorTraining[]
  weaponProficiencies: Class["weapons"]
  /** The worn armor gives Disadvantage on Dexterity (Stealth) checks. */
  stealthDisadvantage: boolean
  /** The background's Origin feat first, then the sheet's other feats and any feat a class feature grants. */
  feats: string[]
  /** Class feature ids the character has at its level, in class table order, each level's subclass features after the class's. */
  classFeatures: string[]
  /** Cantrips known, by spell id: the sheet's, and any the species gives at this level. */
  cantrips: string[]
  /** The cantrips the species gives at this level, by spell id: a lineage's, a Tiefling's Thaumaturgy. They are cast with `speciesSpellAbility`. */
  speciesCantrips: string[]
  /** Spells prepared, by spell id: the sheet's, and any a class feature or the subclass keeps always prepared (a Ranger's Hunter's Mark). */
  preparedSpells: string[]
  /** Those of the prepared spells a feature or the subclass keeps always prepared, which do not count against the class's number. */
  alwaysPrepared: string[]
  /** A Wizard's spellbook, by spell id. */
  spellbook: string[]
}

type Parts = { class: Class; subclass?: Subclass; species: SpeciesEntry; background: Background; armor?: Armor; features: ClassFeature[]; feats: Feat[] }

const modifier = (score: number) => Math.floor((score - 10) / 2)

/** The class level at which a class chooses its subclass: 3 for every class in the SRD. */
export function subclassLevelOf(cls: Class): number {
  return Math.min(...cls.subclasses.map((id) => subclassById.get(id)?.level ?? 20))
}

/** The highest spell level a class has a slot for at a level: the last filled column, or a Warlock's Pact Magic slot level. */
export function highestSlotLevel(cls: Class, level: number): number {
  const row = cls.levels[level - 1]
  return Math.max(
    row?.slotLevel ?? 0,
    (row?.spellSlots ?? []).reduce((top, count, index) => (count > 0 ? index + 1 : top), 0)
  )
}

/** Whether a class's spell list holds a spell at a spell level from `from` to `to`. */
export function onSpellList(classId: string, id: string, from: number, to: number): boolean {
  return (classById.get(classId)?.spellcasting?.spellList ?? []).some((entry) => entry.level >= from && entry.level <= to && entry.spells.includes(id))
}

/**
 * A feature that grants a feat each time it is gained and lets another feat be taken in its place (Ability Score
 * Improvement, Epic Boon). Its feat is kept in `advancements`, one for each level it is gained at. A feature that grants a
 * feat of one category, once (Fighting Style), keeps it in `featureChoices`.
 */
export const grantsFeatByLevel = (feature: ClassFeature) => feature.feat?.orAnother === true

/** Circle of the Land Spells, whose land the Druid chooses: its always-prepared spells and Nature's Ward follow it. */
export const LAND_CHOICE = "circle-of-the-land-circle-of-the-land-spells"

/**
 * The options of a kept choice that its text names and the SRD data does not type as options, by feature id: Circle
 * of the Land's four lands (the lands of the subclass's spell table), Elemental Affinity's "Acid, Cold, Fire,
 * Lightning, or Poison", and Fiendish Resilience's "one damage type, other than Force". The last two are damage types
 * the hero has Resistance to. Circle of the Land Spells and Fiendish Resilience let the choice change on a rest: the
 * sheet keeps the one standing.
 */
const UNTYPED_OPTIONS: Record<string, { id: string; name: string }[]> = {
  [LAND_CHOICE]: [...new Set((subclassById.get("circle-of-the-land")?.alwaysPrepared ?? []).flatMap((entry) => (entry.land ? [entry.land] : [])))].map((id) => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
  })),
  "draconic-sorcery-elemental-affinity": ["acid", "cold", "fire", "lightning", "poison"].map((id) => ({ id, name: damageTypeById.get(id)?.name ?? id })),
  "fiend-patron-fiendish-resilience": damageTypes.filter((type) => type.id !== "force").map((type) => ({ id: type.id, name: type.name })),
}

/** Kept choices whose option is a damage type the hero has Resistance to. */
const RESISTANCE_CHOICES = ["draconic-sorcery-elemental-affinity", "fiend-patron-fiendish-resilience"]

/**
 * A later feature that strengthens the option chosen for an earlier one and takes no choice of its own: "The option
 * you chose for Blessed Strikes grows more powerful." Its option is the earlier feature's.
 */
const FOLLOWS: Record<string, string> = { "cleric-improved-blessed-strikes": "cleric-blessed-strikes", "druid-improved-elemental-fury": "druid-elemental-fury" }

/**
 * Features whose option is chosen once and kept on the sheet. Other features' options (Channel Divinity, Cunning
 * Strike, Fast Hands, Monk's Focus) are chosen each time they are used.
 */
const KEPT_OPTIONS = new Set([
  "cleric-divine-order",
  "cleric-blessed-strikes",
  "hunter-hunters-prey",
  "hunter-defensive-tactics",
  "ranger-fighting-style",
  "druid-primal-order",
  "druid-elemental-fury",
  ...Object.keys(UNTYPED_OPTIONS),
])

/** Whether the sheet must name a choice for a feature in `featureChoices`. */
export const needsFeatureChoice = (feature: ClassFeature) => KEPT_OPTIONS.has(feature.id) || (!!feature.feat && !grantsFeatByLevel(feature))

/** The options of a feature's kept choice, by id and name: its own, or those its text names (a Circle of the Land's lands). */
export const keptOptions = (feature: ClassFeature): { id: string; name: string }[] => feature.options ?? UNTYPED_OPTIONS[feature.id] ?? []

/** The option a sheet keeps for a feature: its own choice, or for a feature that follows another, that one's. */
export const keptChoiceOf = (sheet: Sheet, id: string): string | undefined => sheet.featureChoices?.[FOLLOWS[id] ?? id]

/**
 * Features that take several options from their list, and how many at a level: Eldritch Invocations by the Warlock
 * table's Invocations column, and Metamagic two at each level it is gained ("two Metamagic options ... two more at
 * Sorcerer level 10 and two more at Sorcerer level 17"), which the SRD data does not type as a count.
 */
const PICKED: Record<string, (cls: Class, level: number, feature: ClassFeature) => number> = {
  "warlock-eldritch-invocations": (cls, level) => cls.levels[level - 1]?.invocations ?? 0,
  "sorcerer-metamagic": (_, level, feature) => 2 * feature.levels.filter((at) => at <= level).length,
}

/** Whether a feature takes several options from its list, kept in `featurePicks`. */
export const takesPicks = (feature: ClassFeature) => feature.id in PICKED

/** How many options a feature takes at a level. */
export const picksAt = (cls: Class, level: number, feature: ClassFeature): number => PICKED[feature.id]?.(cls, level, feature) ?? 0

/**
 * The cantrip an option's prerequisite asks for, read from its printed words, which the SRD data does not type: "a
 * Warlock Cantrip That Deals Damage", and with "via an Attack Roll" one that makes an attack. The cantrip is the one the
 * option works with, kept on its pick.
 */
export function cantripNeed(option: FeatureOption): { spellList: string; attack: boolean } | undefined {
  const found = /an? (\w+) Cantrip That Deals Damage( via an Attack Roll)?/.exec(option.prerequisite?.text ?? "")
  return found ? { spellList: found[1].toLowerCase(), attack: !!found[2] } : undefined
}

/** Whether a cantrip fits an option's need: on its list and dealing damage, by an attack roll where it asks. */
export function cantripFits(need: { spellList: string; attack: boolean }, id: string): boolean {
  const spell = spellById.get(id)
  return !!spell && onSpellList(need.spellList, id, 0, 0) && !!spell.damage && (!need.attack || !!spell.attack)
}

/**
 * The Origin feats Lessons of the First Ones may give. Magic Initiate and Skilled are left out: the picks they ask for
 * have no home on a feat an invocation gives.
 */
export const featOfferable = (feat: Feat, category: string | undefined) => feat.category === category && !feat.proficiencyChoice && !feat.benefits?.some((benefit) => benefit.cantrips)

/** Druidic Warrior's two Druid cantrips and Blessed Warrior's two Cleric cantrips are in their text and not typed in the SRD data. */
const UNTYPED_EXTRA_CANTRIPS: Record<string, { count: number; spellList: string }> = {
  "druidic-warrior": { count: 2, spellList: "druid" },
  "blessed-warrior": { count: 2, spellList: "cleric" },
}

/** Evocation Savant adds Evocation spells to the book for free. Its text says so, and the SRD data does not type it. */
const EVOCATION_SAVANT = "evoker-evocation-savant"

/** A Bard's Jack of All Trades, which the SRD data names and does not type. */
const JACK_OF_ALL_TRADES = "bard-jack-of-all-trades"

function lookup(sheet: Sheet): { parts?: Parts; problems: string[] } {
  const problems: string[] = []
  const cls = classById.get(sheet.class)
  const species = speciesById.get(sheet.species)
  const background = backgroundById.get(sheet.background)
  if (!species) problems.push(`"${sheet.species}" is not a species`)
  if (!background) problems.push(`"${sheet.background}" is not a background`)
  let armor: Armor | undefined
  if (sheet.armor) {
    const entry = equipmentById.get(sheet.armor)
    if (entry?.kind === "armor" && entry.category !== "shield") armor = entry
    else problems.push(`"${sheet.armor}" is not armor`)
  }
  for (const weapon of sheet.weapons ?? []) if (equipmentById.get(weapon)?.kind !== "weapon") problems.push(`"${weapon}" is not a weapon`)
  if (new Set(sheet.weapons).size !== (sheet.weapons ?? []).length) problems.push("a weapon is listed twice")
  let subclass: Subclass | undefined
  if (sheet.subclass) {
    subclass = subclassById.get(sheet.subclass)
    if (!subclass || subclass.class !== sheet.class) {
      problems.push(`"${sheet.subclass}" is not a ${cls?.name ?? sheet.class} subclass`)
      subclass = undefined
    }
  }
  if (!cls || !species || !background) return { problems }

  // The class table's features up to the level, then the subclass's of each level after the class's, each once.
  const features: ClassFeature[] = []
  const take = (id: string) => {
    const feature = classFeatureById.get(id)
    if (feature && !features.includes(feature)) features.push(feature)
  }
  for (const row of cls.levels) {
    if (row.level > sheet.level) break
    for (const id of row.features ?? []) take(id)
    for (const group of subclass?.features ?? []) if (group.level === row.level) for (const id of group.features) take(id)
  }

  const featIds = [background.feat.id, ...(sheet.feats ?? [])].filter((id): id is string => typeof id === "string")
  for (const feature of features) {
    const chosen = sheet.featureChoices?.[feature.id]
    // Ranger's Fighting Style takes a feat or its own option, Druidic Warrior, which is no feat.
    if (feature.feat && chosen && !feature.options?.some((option) => option.id === chosen)) featIds.push(chosen)
  }
  // The feat each Ability Score Improvement gave, at the levels it was gained.
  for (const level of featLevels(sheet, features)) {
    const taken = sheet.advancements?.find((entry) => entry.level === level && entry.feat)?.feat
    if (taken) featIds.push(taken)
  }
  // The feat a picked option gives: Lessons of the First Ones' Origin feat.
  for (const feature of features)
    for (const pick of sheet.featurePicks?.[feature.id] ?? []) if (pick.feat && feature.options?.find((option) => option.id === pick.option)?.feat) featIds.push(pick.feat)
  const feats: Feat[] = []
  for (const id of featIds) {
    const feat = featById.get(id)
    if (feat) feats.push(feat)
    else problems.push(`"${id}" is not a feat`)
  }
  return { parts: { class: cls, subclass, species, background, armor, features, feats }, problems }
}

/** The levels, up to the sheet's, at which a feature grants a feat kept in `advancements`. */
function featLevels(sheet: Sheet, features: readonly ClassFeature[]): number[] {
  return features.filter(grantsFeatByLevel).flatMap((feature) => feature.levels.filter((level) => level <= sheet.level))
}

/** The cantrips a sheet's species gives at its level: its traits' own (Otherworldly Presence) and its chosen options' (a lineage's). */
function speciesCantripsOf(sheet: Sheet, parts: Parts): string[] {
  const given = [...parts.species.traits, ...chosenOptions(sheet, parts).species].flatMap((source) => source.spells ?? [])
  return [...new Set(given.filter((spell) => spell.cantrip && spell.level <= sheet.level).map((spell) => spell.spell))]
}

/**
 * The options a sheet has taken, as plain records of their mechanics: from species traits, from class features' kept
 * choices (a following feature's being its leader's), and from the picks of a feature that takes several, one for each.
 */
function chosenOptions(sheet: Sheet, parts: Parts) {
  const species = parts.species.traits.flatMap((trait) => {
    if (!trait.choice) return []
    const taken = sheet.speciesChoices?.[trait.choice.id]
    return trait.choice.options.filter((option) => option.id === taken)
  })
  const features = parts.features.flatMap((feature) => (feature.options ?? []).filter((option) => option.id === keptChoiceOf(sheet, feature.id)))
  const picked = parts.features.flatMap((feature) => (sheet.featurePicks?.[feature.id] ?? []).flatMap((pick) => feature.options?.filter((option) => option.id === pick.option) ?? []))
  return { species, features, picked }
}

/** The standing mechanics a sheet's class features and its options give: each feature, kept option and picked option. */
const standingOf = (sheet: Sheet, parts: Parts) => {
  const chosen = chosenOptions(sheet, parts)
  return [...parts.features, ...chosen.features, ...chosen.picked]
}

/**
 * The standing conditions a sheet can judge, in the SRD data's words. A value under any other condition (raging, in
 * an aura, in Dim Light) holds only in play, so the sheet leaves it out.
 */
const JUDGED_WHILE: Record<string, (sheet: Sheet, parts: Parts) => boolean> = { "no-heavy-armor": (_, parts) => parts.armor?.category !== "heavy" }
const JUDGED_WHEN: Record<string, (sheet: Sheet, parts: Parts) => boolean> = {
  "while you aren’t wearing armor or wielding a Shield": (sheet, parts) => !parts.armor && !sheet.shield,
}

/** Whether a standing value holds on the sheet as it stands: no condition, or one the sheet can judge and that holds. */
function holdsOnSheet(value: { while?: string; appliesWhen?: string; unless?: string }, sheet: Sheet, parts: Parts): boolean {
  if (value.unless) return false
  if (value.while && !JUDGED_WHILE[value.while]?.(sheet, parts)) return false
  if (value.appliesWhen && !JUDGED_WHEN[value.appliesWhen]?.(sheet, parts)) return false
  return true
}

/** The words of every condition the sheet can judge, for a check that the data names no other on a Speed bonus. */
export const JUDGED_CONDITIONS = [...Object.keys(JUDGED_WHILE), ...Object.keys(JUDGED_WHEN)]

/**
 * Feet a sheet's features and options add to Speed while their condition holds: Fast Movement's 10 out of Heavy
 * armor, Unarmored Movement's 10 to 30 by the Monk table out of armor and with no Shield.
 */
function speedBonusOf(sheet: Sheet, parts: Parts): number {
  return standingOf(sheet, parts).reduce((sum, source) => {
    const bonus = source.speedBonus
    if (!bonus || !holdsOnSheet(bonus, sheet, parts)) return sum
    return sum + (source.speedBonusByLevel?.filter((step) => step.level <= sheet.level).at(-1)?.feet ?? bonus.feet)
  }, 0)
}

function armorTrainingOf(sheet: Sheet, parts: Parts): ArmorTraining[] {
  const training = new Set<ArmorTraining>(parts.class.armor ?? [])
  for (const option of chosenOptions(sheet, parts).features) for (const kind of option.armorTraining ?? []) training.add(kind)
  return (["light", "medium", "heavy", "shields"] as const).filter((kind) => training.has(kind))
}

function armorClassOf(sheet: Sheet, parts: Parts, mods: Record<AbilityId, number>): { armorClass: number; from: string } {
  const shield = sheet.shield ? 2 : 0
  if (parts.armor) {
    const armor = parts.armor
    const dex = armor.addsDexModifier ? Math.min(mods.dex, armor.dexModifierCap ?? Number.POSITIVE_INFINITY) : 0
    const style = parts.feats.reduce((sum, feat) => sum + (feat.armorClassBonus?.armor.some((kind) => kind === armor.category) ? feat.armorClassBonus.bonus : 0), 0)
    return { armorClass: (armor.baseAc ?? 10) + dex + shield + style, from: armor.name }
  }
  let best = { armorClass: 10 + mods.dex + shield, from: "No armor" }
  for (const feature of parts.features) {
    const formula = feature.armorClass
    if (!formula) continue
    if (sheet.shield && !formula.shield) continue
    const armorClass = formula.base + formula.abilities.reduce((sum, ability) => sum + mods[ability], 0) + shield
    if (armorClass > best.armorClass) best = { armorClass, from: feature.name }
  }
  return best
}

function hitPointMaximumOf(sheet: Sheet, parts: Parts, con: number): number {
  const perLaterLevel = Math.max(1, parts.class.hitDie / 2 + 1 + con)
  let total = Math.max(1, parts.class.hitDie + con) + perLaterLevel * (sheet.level - 1)
  for (const trait of parts.species.traits) {
    if (trait.hitPointMaximum) total += trait.hitPointMaximum.increase + trait.hitPointMaximum.perLevel * (sheet.level - 1)
  }
  // A feature's rise counts from the level it is gained: Draconic Resilience's 3 at Sorcerer level 3, and 1 more at each
  // Sorcerer level after. A hero has one class, so their class level is their level.
  for (const feature of parts.features) {
    if (feature.hitPointMaximum) total += feature.hitPointMaximum.increase + feature.hitPointMaximum.perLevel * (sheet.level - feature.level)
  }
  return total
}

function sensesOf(sheet: Sheet, parts: Parts): Sense[] {
  const best = new Map<Sense["type"], number>()
  const take = (senses: readonly Sense[] | undefined) => {
    for (const sense of senses ?? []) best.set(sense.type, Math.max(best.get(sense.type) ?? 0, sense.range))
  }
  const standing = (senses: readonly (Sense & { appliesWhen?: string; unless?: string })[] | undefined) => take(senses?.filter((sense) => holdsOnSheet(sense, sheet, parts)))
  // A sense a trait gives for a time after it is used (a Dwarf's Stonecunning) is not standing.
  for (const trait of parts.species.traits) if ((trait.level ?? 1) <= sheet.level && !trait.durationMinutes) standing(trait.senses)
  for (const option of chosenOptions(sheet, parts).species) standing(option.senses)
  // A class feature's, an option's (Witch Sight) and a feat's (Boon of Truesight).
  for (const source of standingOf(sheet, parts)) standing(source.senses)
  for (const feat of parts.feats) for (const benefit of feat.benefits ?? []) standing(benefit.senses)
  return [...best].map(([type, range]) => ({ type, range }))
}

function resistancesOf(sheet: Sheet, parts: Parts): DamageTypeId[] {
  const found = new Set<DamageTypeId>()
  const options = chosenOptions(sheet, parts).species
  const take = (resistances: { damageTypes?: readonly DamageTypeId[]; while?: unknown; appliesWhen?: string } | undefined) => {
    if (!resistances || resistances.while || resistances.appliesWhen) return
    for (const type of resistances.damageTypes ?? []) found.add(type)
  }
  for (const trait of parts.species.traits) {
    if ((trait.level ?? 1) > sheet.level) continue
    take(trait.resistances)
    // "Damage Resistance" of a Dragonborn: the type is the one its ancestry names.
    if (trait.name === "Damage Resistance" && trait.damageTypeFromChoice) {
      const taken = sheet.speciesChoices?.[trait.damageTypeFromChoice]
      const source = parts.species.traits.find((other) => other.choice?.id === trait.damageTypeFromChoice)
      const type = source?.choice?.options.find((option) => option.id === taken)?.damageType
      if (type) found.add(type)
    }
  }
  for (const option of options) take(option.resistances)
  for (const source of standingOf(sheet, parts)) take(source.resistances)
  for (const feat of parts.feats) for (const benefit of feat.benefits ?? []) take(benefit.resistances)
  // A kept choice of a damage type (Elemental Affinity, Fiendish Resilience), and Nature's Ward's by the land chosen.
  const held = new Set(parts.features.map((feature) => feature.id))
  for (const id of RESISTANCE_CHOICES) {
    const type = held.has(id) ? sheet.featureChoices?.[id] : undefined
    if (type && damageTypeById.get(type)) found.add(type as DamageTypeId)
  }
  const land = sheet.featureChoices?.[LAND_CHOICE]
  for (const feature of parts.features) {
    const type = feature.landResistances?.find((entry) => entry.land === land)?.damageType
    if (type) found.add(type)
  }
  return [...found].sort()
}

/** The cantrips a feature option adds, from its own spell list: a Thaumaturge's Cleric cantrip, Druidic Warrior's two Druid ones. */
export const optionCantrips = (option: FeatureOption): { count: number; spellList: string } | undefined => option.extraCantrips ?? UNTYPED_EXTRA_CANTRIPS[option.id]

/** The cantrips a sheet's chosen options add, each from its own spell list. */
function extraCantripsOf(sheet: Sheet, parts: Parts): { count: number; spellList: string }[] {
  return chosenOptions(sheet, parts).features.flatMap((option) => {
    const extra = optionCantrips(option)
    return extra ? [extra] : []
  })
}

/** How many cantrips a sheet knows by its class table and its chosen options, and the lists the options' come from. */
export function cantripsAllowed(sheet: Sheet): number {
  const { parts } = lookup(sheet)
  if (!parts) return 0
  return (parts.class.levels[sheet.level - 1]?.cantrips ?? 0) + extraCantripsOf(sheet, parts).reduce((sum, extra) => sum + extra.count, 0)
}

/** The spells a subclass keeps always prepared up to a level: Circle of the Land's, those of the land the sheet keeps. */
function subclassPrepared(sheet: Sheet, subclass: Subclass | undefined): string[] {
  const land = sheet.featureChoices?.[LAND_CHOICE]
  return (subclass?.alwaysPrepared ?? []).filter((entry) => entry.level <= sheet.level && (!entry.land || entry.land === land)).flatMap((entry) => entry.spells)
}

/** Whether a spell id is a cantrip. A land's set holds one (Arid's Fire Bolt): it is known, not prepared. */
const isCantrip = (id: string) => spellById.get(id)?.level === 0

/** Every spell a feature or the subclass keeps always prepared at the sheet's level. They are not listed on the sheet. */
export function alwaysPrepared(sheet: Sheet): string[] {
  const { parts } = lookup(sheet)
  return parts ? alwaysPreparedOf(sheet, parts) : []
}

/**
 * The spells the options a sheet has picked let the hero cast with no spell slot, each with the option it comes from:
 * Armor of Shadows' Mage Armor on themselves, at will, and Gift of the Depths' Water Breathing once a Long Rest, by its
 * `uses`. Pact of the Chain's Find Familiar is one.
 */
export function pickedFreeCasts(sheet: Sheet): { spell: string; option: string; feature: string; selfOnly?: true; usableWhen?: string; uses?: FeatureOption["uses"] }[] {
  const { parts } = lookup(sheet)
  if (!parts) return []
  return parts.features.flatMap((feature) =>
    (sheet.featurePicks?.[feature.id] ?? []).flatMap((pick) => {
      const option = feature.options?.find((entry) => entry.id === pick.option)
      return (option?.freeCast ?? []).map((cast) => ({
        spell: cast.spell,
        option: option?.id ?? pick.option,
        feature: feature.id,
        ...(cast.selfOnly ? { selfOnly: true as const } : {}),
        ...(cast.usableWhen ? { usableWhen: cast.usableWhen } : {}),
        ...(option?.uses ? { uses: option.uses } : {}),
      }))
    })
  )
}

/** The class and subclass features a sheet has at its level, in table order. */
export function featuresOf(sheet: Sheet): ClassFeature[] {
  return lookup(sheet).parts?.features ?? []
}

/** As `alwaysPrepared`, from parts already looked up. A cantrip among them is known, so it is in `alwaysKnownOf`. */
function alwaysPreparedOf(sheet: Sheet, parts: Parts): string[] {
  return [...new Set([...parts.features.flatMap((feature) => feature.alwaysPrepared ?? []), ...subclassPrepared(sheet, parts.subclass)])].filter((id) => !isCantrip(id))
}

/** The cantrips a feature or the subclass gives with its always-prepared spells: a land's. They are not listed on the sheet. */
function alwaysKnownOf(sheet: Sheet, parts: Parts): string[] {
  return [...new Set([...parts.features.flatMap((feature) => feature.alwaysPrepared ?? []), ...subclassPrepared(sheet, parts.subclass)])].filter(isCantrip)
}

/**
 * How many spells Evocation Savant adds to a spellbook by a level: two as it is gained, and one each time a new level of
 * spell slots comes after. Zero without it.
 */
export function evocationSavantSpells(cls: Class, features: readonly ClassFeature[], level: number): number {
  const savant = features.find((feature) => feature.id === EVOCATION_SAVANT)
  if (!savant) return 0
  let count = 2
  for (let at = savant.level + 1; at <= level; at++) if (highestSlotLevel(cls, at) > highestSlotLevel(cls, at - 1)) count++
  return count
}

/**
 * Faults in a sheet's spells. A class with the Spellcasting feature knows as many cantrips as its table gives, and any
 * a chosen option adds from that option's list, and prepares as many spells as its table gives, each from its own list
 * and of a level it has slots for. A spell a feature or the subclass keeps always prepared is not listed and does not
 * count. A Wizard prepares from the spellbook, which holds six level 1 spells and two more for each level after the
 * first, and an Evoker's Evocation Savant spells beside them. A class with no Spellcasting has none of the three.
 */
function spellProblems(sheet: Sheet, parts: Parts): string[] {
  const problems: string[] = []
  const cls = parts.class
  const cantrips = sheet.cantrips ?? []
  const prepared = sheet.spells ?? []
  const book = sheet.spellbook ?? []
  const extras = extraCantripsOf(sheet, parts)
  const extraCount = extras.reduce((sum, extra) => sum + extra.count, 0)
  if (!cls.spellcasting) return cantrips.length || prepared.length || book.length ? [`${cls.name} has no Spellcasting at level ${sheet.level}, and the sheet lists spells`] : []
  const row = cls.levels[sheet.level - 1]
  const highest = highestSlotLevel(cls, sheet.level)
  const onList = (id: string, from: number, to: number) => onSpellList(cls.id, id, from, to)
  const cantripsAllowed = (row?.cantrips ?? 0) + extraCount
  if (cantrips.length !== cantripsAllowed) problems.push(`${cls.name} knows ${cantripsAllowed} cantrips at level ${sheet.level}, and the sheet has ${cantrips.length}`)
  for (const id of cantrips) if (!onList(id, 0, 0) && !extras.some((extra) => onSpellList(extra.spellList, id, 0, 0))) problems.push(`"${id}" is not a ${cls.name} cantrip`)
  const preparedAllowed = row?.preparedSpells ?? 0
  if (prepared.length !== preparedAllowed) problems.push(`${cls.name} prepares ${preparedAllowed} spells at level ${sheet.level}, and the sheet has ${prepared.length}`)
  for (const id of prepared) if (!onList(id, 1, highest)) problems.push(`"${id}" is not a ${cls.name} spell of a level the sheet has slots for`)
  const always = alwaysPreparedOf(sheet, parts)
  for (const id of prepared) if (always.includes(id)) problems.push(`"${id}" is always prepared, so it is not listed among the prepared spells`)
  for (const id of cantrips) if (alwaysKnownOf(sheet, parts).includes(id)) problems.push(`"${id}" is always known, so it is not listed among the cantrips`)
  for (const [name, ids] of [
    ["cantrip", cantrips],
    ["prepared spell", prepared],
    ["spellbook spell", book],
  ] as const)
    if (new Set(ids).size !== ids.length) problems.push(`a ${name} is listed twice`)
  if (cls.spellcasting.ritualFromSpellbook) {
    const savant = evocationSavantSpells(cls, parts.features, sheet.level)
    const pages = 4 + 2 * sheet.level + savant
    if (book.length !== pages) problems.push(`a ${cls.name}'s spellbook holds ${pages} spells at level ${sheet.level}, and the sheet has ${book.length}`)
    for (const id of book) if (!onList(id, 1, highest)) problems.push(`"${id}" is not a ${cls.name} spell of a level the sheet has slots for`)
    for (const id of prepared) if (!book.includes(id)) problems.push(`"${id}" is prepared and is not in the spellbook`)
    // The book is one list, so the Savant's free spells are checked as Evocation spells enough to cover them.
    const evocations = book.filter((id) => spellById.get(id)?.school === "evocation").length
    if (evocations < savant) problems.push(`Evocation Savant adds ${savant} Evocation spells to the spellbook by level ${sheet.level}, and the book has ${evocations}`)
  } else if (book.length) problems.push(`${cls.name} keeps no spellbook`)
  return problems
}

/** Whether weapon training covers a weapon: its category, and any property the training is limited to. */
export function trainedWith(training: Class["weapons"], weapon: { category: string; properties?: readonly string[] }): boolean {
  return training.some((entry) => entry.category === weapon.category && (!entry.withProperty || entry.withProperty.some((property) => (weapon.properties ?? []).includes(property))))
}

/** The skill proficiencies a sheet has: the background's, the species' own, the class's, any others, and those a level's choice gave. */
function proficientSkills(sheet: Sheet, parts: Parts): Set<SkillId> {
  return new Set<SkillId>([
    ...parts.background.skills,
    ...grantedSkills(parts.species),
    ...sheet.classSkills,
    ...(sheet.otherSkills ?? []),
    ...(sheet.advancements ?? []).flatMap((entry) => entry.skills ?? []),
  ])
}

/** The Expertise a sheet's features give: one entry for each skill, with the skills it must come from where a feature limits them. */
export function expertiseSlots(features: readonly ClassFeature[], level: number): { feature: ClassFeature; from?: readonly SkillId[] }[] {
  return features.flatMap((feature) =>
    feature.expertise ? Array.from({ length: feature.expertise.count * feature.levels.filter((at) => at <= level).length }, () => ({ feature, from: feature.expertise?.from })) : []
  )
}

/** Whether a sheet qualifies for a feat at a level, with its scores as they stood then. The fault in words, or nothing. */
export function featPrerequisiteProblem(feat: Feat, level: number, scores: Record<AbilityId, number>, features: readonly ClassFeature[], spellcasting: boolean): string | undefined {
  const need = feat.prerequisite
  if (!need) return undefined
  if (need.level && level < need.level) return `${feat.name} needs level ${need.level}, and it was taken at level ${level}`
  if (need.abilityMinimum && !need.abilityMinimum.abilities.some((ability) => scores[ability] >= need.abilityMinimum!.minimum))
    return `${feat.name} needs ${need.abilityMinimum.abilities.join(" or ")} of ${need.abilityMinimum.minimum} or more`
  for (const kind of need.features ?? []) {
    const has = kind === "spellcasting" ? spellcasting : features.some((feature) => feature.id.endsWith(`-${kind}`) && feature.level <= level)
    if (!has) return `${feat.name} needs the ${kind === "spellcasting" ? "Spellcasting" : "Fighting Style"} feature`
  }
  return undefined
}

/** Whether ability raises fit a feat's increase: one of its ways to spend it, on abilities it allows. The fault in words, or nothing. */
export function raiseProblem(feat: Feat, abilities: Partial<Record<AbilityId, number>>): string | undefined {
  const increase = feat.abilityScoreIncrease
  const raises = Object.entries(abilities) as [AbilityId, number][]
  if (!increase) return raises.length ? `${feat.name} raises no ability scores` : undefined
  if (!raises.length) return `${feat.name} raises ability scores, and none are named`
  const off = raises.find(([ability]) => increase.from !== "any" && !increase.from.includes(ability))
  if (off) return `${feat.name} cannot raise ${off[0]}`
  const amounts = raises.map(([, amount]) => amount).sort()
  const fits = increase.choices.some((choice) => choice.count === amounts.length && amounts.every((amount) => amount === choice.amount))
  return fits ? undefined : `${feat.name} raises ${increase.choices.map((choice) => `${choice.count === 1 ? "one score" : `${choice.count} scores`} by ${choice.amount}`).join(" or ")}`
}

/** Faults in a feat's spell picks (Magic Initiate): a list it offers, an ability, its cantrips and its spell from that list. */
function featPickProblems(feat: Feat, entry: Advancement, lists?: readonly string[]): string[] {
  const picks = feat.benefits?.find((benefit) => benefit.cantrips && benefit.spellLists)
  const spellLevel = feat.benefits?.find((benefit) => benefit.spellLevel)?.spellLevel
  const named = entry.spellList || entry.spellAbility || entry.cantrips || entry.spell
  if (!picks) return named ? [`${feat.name} takes no spell picks`] : []
  const problems: string[] = []
  const allowed = lists ?? picks.spellLists ?? []
  if (!entry.spellList || !allowed.includes(entry.spellList)) problems.push(`${feat.name} picks its spells from the ${allowed.join(", ")} list, and the sheet names ${entry.spellList ?? "none"}`)
  if (!entry.spellAbility || !picks.spellcastingAbility?.includes(entry.spellAbility))
    problems.push(`${feat.name} casts with ${picks.spellcastingAbility?.join(", ")}, and the sheet names ${entry.spellAbility ?? "none"}`)
  const cantrips = entry.cantrips ?? []
  if (cantrips.length !== picks.cantrips || new Set(cantrips).size !== cantrips.length) problems.push(`${feat.name} learns ${picks.cantrips} cantrips, and the sheet has ${cantrips.length}`)
  if (entry.spellList) {
    for (const id of cantrips) if (!onSpellList(entry.spellList, id, 0, 0)) problems.push(`"${id}" is not a cantrip of the ${entry.spellList} list`)
    if (!entry.spell || !onSpellList(entry.spellList, entry.spell, spellLevel ?? 1, spellLevel ?? 1))
      problems.push(`${feat.name} takes one level ${spellLevel ?? 1} spell of the ${entry.spellList} list, and the sheet has ${entry.spell ?? "none"}`)
  }
  return problems
}

/**
 * Faults in the choices of each level kept in `advancements`: a feat for each Ability Score Improvement gained, one the
 * hero qualified for when it was taken, with raises its typed increase allows and no score raised past its maximum;
 * the skills a feature gives (College of Lore's three); and a feat's spell picks (Magic Initiate). The stored scores
 * hold the raises, so the scores before them are the stored ones less every raise, and each raise is walked in level
 * order from there.
 */
function advancementProblems(sheet: Sheet, parts: Parts): string[] {
  const problems: string[] = []
  const entries = [...(sheet.advancements ?? [])].sort((a, b) => a.level - b.level)
  const grants = parts.features.filter(grantsFeatByLevel).flatMap((feature) => feature.levels.filter((level) => level <= sheet.level).map((level) => ({ level, feature })))
  const skillGrants = parts.features.flatMap((feature) => (feature.skillProficiencies ? feature.levels.filter((level) => level <= sheet.level).map((level) => ({ level, feature })) : []))
  for (const entry of entries) if (entry.level > sheet.level) problems.push(`a choice of level ${entry.level} is on a level ${sheet.level} sheet`)

  for (const { level, feature } of grants) {
    const named = entries.filter((entry) => entry.level === level && entry.feat).length
    if (named !== 1) problems.push(`${feature.name} gives one feat at level ${level}, and the sheet names ${named}`)
  }
  const proficient = new Set<SkillId>([...parts.background.skills, ...grantedSkills(parts.species), ...sheet.classSkills, ...(sheet.otherSkills ?? [])])
  for (const { level, feature } of skillGrants) {
    const wanted = feature.skillProficiencies?.count ?? 0
    const skills = entries.find((entry) => entry.level === level && entry.skills)?.skills ?? []
    if (skills.length !== wanted) problems.push(`${feature.name} gives ${wanted} skill proficiencies at level ${level}, and the sheet has ${skills.length}`)
    for (const skill of skills) {
      if (feature.skillProficiencies?.from && !feature.skillProficiencies.from.includes(skill)) problems.push(`${skill} is not one of ${feature.name}'s skills`)
      if (proficient.has(skill)) problems.push(`${skill} is already a proficiency, so ${feature.name} cannot give it`)
      proficient.add(skill)
    }
  }
  // A feat that gives skill proficiencies (Skilled), taken at a level: its skills are kept on its entry. The engine
  // holds no tool proficiencies, so its three are skills.
  for (const entry of entries) {
    const choice = entry.feat ? featById.get(entry.feat)?.proficiencyChoice : undefined
    if (!choice || !grants.some((grant) => grant.level === entry.level)) continue
    const skills = entry.skills ?? []
    if (skills.length !== choice.count) problems.push(`${featById.get(entry.feat ?? "")?.name} gives ${choice.count} skill proficiencies at level ${entry.level}, and the sheet has ${skills.length}`)
    for (const skill of skills) {
      if (proficient.has(skill)) problems.push(`${skill} is already a proficiency, so ${featById.get(entry.feat ?? "")?.name} cannot give it`)
      proficient.add(skill)
    }
  }
  for (const entry of entries) {
    const byFeat = !!entry.feat && !!featById.get(entry.feat)?.proficiencyChoice && grants.some((grant) => grant.level === entry.level)
    if (entry.skills && !byFeat && !skillGrants.some((grant) => grant.level === entry.level)) problems.push(`no feature of level ${entry.level} gives skill proficiencies`)
  }

  // The scores before any raise, then each raise in level order.
  const scores = { ...sheet.abilityScores }
  for (const entry of entries) for (const [ability, amount] of Object.entries(entry.abilities ?? {}) as [AbilityId, number][]) scores[ability] -= amount
  // The origin feats a hero holds, which an entry may carry the picks of: the background's, the sheet's, a feature's.
  const origin = [parts.background.feat.id, ...(sheet.feats ?? [])].filter((id): id is string => !!id)
  const carried = new Map<string, number>()
  const listsTaken = new Map<string, string[]>()
  const spellcasting = !!parts.class.spellcasting
  for (const entry of entries) {
    if (!entry.feat) {
      if (entry.abilities) problems.push(`the ability raises of level ${entry.level} name no feat`)
      if (entry.spellList || entry.spellAbility || entry.cantrips || entry.spell) problems.push(`the spell picks of level ${entry.level} name no feat`)
      continue
    }
    const feat = featById.get(entry.feat)
    if (!feat) {
      problems.push(`"${entry.feat}" is not a feat`)
      continue
    }
    const grant = grants.find((each) => each.level === entry.level)
    let lists: readonly string[] | undefined
    if (grant) {
      const before = featPrerequisiteProblem(feat, entry.level, scores, parts.features, spellcasting)
      if (before) problems.push(before)
      const raise = raiseProblem(feat, entry.abilities ?? {})
      if (raise) problems.push(`${raise}, at level ${entry.level}`)
    } else {
      // Picks for a feat the hero holds from its origin. A background that names the list sets it, when the feat is held once.
      const held = origin.filter((id) => id === feat.id).length
      const count = (carried.get(feat.id) ?? 0) + 1
      carried.set(feat.id, count)
      if (count > held) problems.push(`the sheet keeps picks for ${feat.name} at level ${entry.level}, and the hero has no ${feat.name} to keep them for`)
      if (parts.background.feat.id === feat.id && parts.background.feat.spellList && held === 1) lists = [parts.background.feat.spellList]
      if (entry.abilities) problems.push(`${feat.name}, held from the hero's origin, raises no ability scores`)
      if (!feat.benefits?.some((benefit) => benefit.cantrips && benefit.spellLists)) problems.push(`${feat.name} takes no picks to keep`)
    }
    problems.push(...featPickProblems(feat, entry, lists))
    if (entry.spellList) {
      const taken = listsTaken.get(feat.id) ?? []
      if (taken.includes(entry.spellList) && feat.repeatable?.differentSpellList) problems.push(`${feat.name} is taken twice with the ${entry.spellList} list`)
      listsTaken.set(feat.id, [...taken, entry.spellList])
    }
    const maximum = feat.abilityScoreIncrease?.maximum ?? 20
    for (const [ability, amount] of Object.entries(entry.abilities ?? {}) as [AbilityId, number][]) {
      scores[ability] += amount
      if (scores[ability] > maximum) problems.push(`${feat.name} at level ${entry.level} raises ${ability} to ${scores[ability]}, past its maximum of ${maximum}`)
    }
  }
  // A feat that is not repeatable is held once.
  const seen = new Set<string>()
  for (const feat of parts.feats) {
    if (seen.has(feat.id) && !feat.repeatable) problems.push(`${feat.name} is taken twice, and it is not repeatable`)
    seen.add(feat.id)
  }
  return problems
}

/** A Rogue's Thieves' Cant gives that language and one more, by its text. The SRD data names it and does not type it. */
const THIEVES_CANT = "rogue-thieves-cant"

/**
 * Faults in the origin choices a sheet names: a size its species does not offer, a species spell ability no trait
 * lets it pick, and languages that are not two from the Standard Languages table, with a Rogue's one more from
 * either. Common is known by every hero and Thieves' Cant by every Rogue, so neither is listed. Each is checked only
 * when the sheet names it.
 */
function originProblems(sheet: Sheet, parts: Parts): string[] {
  const problems: string[] = []
  const species = parts.species
  if (sheet.size && !species.sizes.some((entry) => entry.size === sheet.size)) problems.push(`a ${species.name} is not ${sheet.size}`)
  if (sheet.speciesSpellAbility && !species.traits.some((trait) => trait.spellcastingAbility?.includes(sheet.speciesSpellAbility as AbilityId)))
    problems.push(`no ${species.name} trait casts its spells with ${sheet.speciesSpellAbility}`)
  if (sheet.languages) {
    const known = ["common", ...(parts.features.some((feature) => feature.id === THIEVES_CANT) ? ["thieves-cant"] : [])]
    const extra = known.length - 1
    const wanted = 2 + extra
    const named = sheet.languages
    if (named.length !== wanted) problems.push(`the hero chooses ${wanted} languages beside ${known.map((id) => languageById.get(id)?.name ?? id).join(" and ")}, and the sheet has ${named.length}`)
    if (new Set(named).size !== named.length) problems.push("a language is listed twice")
    for (const id of named) {
      if (!languageById.get(id)) problems.push(`"${id}" is not a language`)
      else if (known.includes(id)) problems.push(`${languageById.get(id)?.name} is already known, so it is not chosen`)
    }
    const standard = named.filter((id) => languageById.get(id)?.rarity === "standard" && !known.includes(id)).length
    if (standard < 2) problems.push(`two of the hero's languages come from the Standard Languages table, and the sheet has ${standard}`)
  }
  return problems
}

/**
 * Faults in the options picked for features that take several (`featurePicks`): as many as the feature takes at the
 * level, each an option of the feature whose prerequisite the hero meets (the class level, another option picked, a
 * cantrip of the kind it names, which the pick keeps and the hero knows), none taken twice unless it is repeatable and
 * then with another cantrip or feat each time, and a feat an option gives of its category (Lessons of the First Ones'
 * Origin feat). A feature the hero lacks, or one that takes no picks, has none.
 */
function pickProblems(sheet: Sheet, parts: Parts): string[] {
  const problems: string[] = []
  for (const [featureId, picks] of Object.entries(sheet.featurePicks ?? {})) {
    const feature = parts.features.find((entry) => entry.id === featureId)
    if (!feature) problems.push(`"${featureId}" is not a ${parts.class.name} feature at level ${sheet.level}`)
    else if (!takesPicks(feature)) problems.push(`${feature.name} takes no picks`)
    else if (!picks.length) problems.push(`${feature.name} lists no picks`)
  }
  for (const feature of parts.features.filter(takesPicks)) {
    const picks = sheet.featurePicks?.[feature.id] ?? []
    const wanted = picksAt(parts.class, sheet.level, feature)
    if (picks.length !== wanted) problems.push(`${feature.name} takes ${wanted} options at level ${sheet.level}, and the sheet has ${picks.length}`)
    const taken = new Set(picks.map((pick) => pick.option))
    const seen = new Map<string, string[]>()
    for (const pick of picks) {
      const option = feature.options?.find((entry) => entry.id === pick.option)
      if (!option) {
        problems.push(`"${pick.option}" is not an option of ${feature.name}`)
        continue
      }
      const need = option.prerequisite
      if (need?.level && sheet.level < need.level) problems.push(`${option.name} needs level ${need.level}, and the sheet is level ${sheet.level}`)
      if (need?.invocation && !taken.has(need.invocation))
        problems.push(`${option.name} needs ${feature.options?.find((entry) => entry.id === need.invocation)?.name ?? need.invocation}, and the sheet has not picked it`)
      const cantrip = cantripNeed(option)
      if (cantrip && !pick.cantrip) problems.push(`${option.name} works with one of the hero's cantrips, and the pick names none`)
      if (!cantrip && pick.cantrip) problems.push(`${option.name} takes no cantrip`)
      if (cantrip && pick.cantrip) {
        if (!(sheet.cantrips ?? []).includes(pick.cantrip)) problems.push(`${option.name} works with ${spellById.get(pick.cantrip)?.name ?? pick.cantrip}, which the hero does not know`)
        else if (!cantripFits(cantrip, pick.cantrip)) problems.push(`${spellById.get(pick.cantrip)?.name ?? pick.cantrip} does not meet ${option.name}'s prerequisite: ${need?.text}`)
      }
      const grant = option.feat
      if (grant && !pick.feat) problems.push(`${option.name} gives a feat, and the pick names none`)
      if (!grant && pick.feat) problems.push(`${option.name} gives no feat`)
      if (grant && pick.feat) {
        const feat = featById.get(pick.feat)
        if (!feat || feat.category !== grant.category) problems.push(`${option.name} gives ${grant.category ?? "a"} feat, and "${pick.feat}" is not one`)
        else if (!featOfferable(feat, grant.category)) problems.push(`${feat.name} asks for picks that have no home when ${option.name} gives it`)
      }
      const again = seen.get(option.id)
      const mark = pick.cantrip ?? pick.feat ?? ""
      if (again && !option.repeatable) problems.push(`${option.name} is picked twice, and it is not repeatable`)
      else if (again?.includes(mark)) problems.push(`${option.name} is picked twice with the same ${pick.feat ? "feat" : "cantrip"}`)
      seen.set(option.id, [...(again ?? []), mark])
    }
  }
  return problems
}

/**
 * Faults in a sheet's choices, at any level: an id the SRD data lacks, a skill outside the class's list, armor the class
 * is not trained in, a subclass missing from the level the class grants one or present before it, Expertise in more or
 * fewer skills than the features give or off a feature's list, a feature's choice left out, a feat or ability raise a
 * level does not allow, spells against the class table, and a size, species spell ability or languages the origin does
 * not allow. Pure and cheap, so any host can run it as a sheet loads or saves.
 */
export function sheetProblems(sheet: Sheet): string[] {
  const { parts, problems } = lookup(sheet)
  if (!parts) return problems
  const { class: cls, background } = parts

  const subclassLevel = subclassLevelOf(cls)
  if (sheet.level >= subclassLevel && !sheet.subclass) problems.push(`${cls.name} chooses a subclass at level ${subclassLevel}, and the sheet has none`)
  if (sheet.subclass && sheet.level < subclassLevel) problems.push(`${cls.name} chooses a subclass at level ${subclassLevel}, and the sheet is level ${sheet.level}`)

  const wanted = cls.skills.count
  if (sheet.classSkills.length !== wanted) problems.push(`${cls.name} chooses ${wanted} skills, and the sheet has ${sheet.classSkills.length}`)
  if (new Set(sheet.classSkills).size !== sheet.classSkills.length) problems.push("a class skill is listed twice")
  for (const skill of sheet.classSkills) {
    if (cls.skills.from && !cls.skills.from.includes(skill)) problems.push(`${skill} is not on the ${cls.name} skill list`)
    if (background.skills.includes(skill)) problems.push(`${skill} already comes from the ${background.name} background`)
  }

  // Expertise: as many skills as the features give, each one the hero is proficient in. A feature with its own list
  // (a Wizard's Scholar) takes one of those, matched first since the others take any.
  const proficient = proficientSkills(sheet, parts)
  const expertise = sheet.expertise ?? []
  for (const skill of expertise) if (!proficient.has(skill)) problems.push(`Expertise in ${skill} needs proficiency in it`)
  if (new Set(expertise).size !== expertise.length) problems.push("a skill with Expertise is listed twice")
  const slots = expertiseSlots(parts.features, sheet.level)
  if (expertise.length !== slots.length) problems.push(`the sheet has Expertise in ${expertise.length} skills, and its class features allow ${slots.length}`)
  const spare = [...expertise]
  for (const slot of slots.filter((each) => each.from)) {
    const index = spare.findIndex((skill) => slot.from?.includes(skill))
    if (index < 0) problems.push(`${slot.feature.name} gives Expertise in one of ${slot.from?.join(", ")}, and the sheet has none of them`)
    else spare.splice(index, 1)
  }

  // Weapon Mastery: as many kinds of weapons as the class's table or feature gives, each one the class is trained in.
  const masteriesAllowed = cls.levels[sheet.level - 1]?.weaponMastery ?? parts.features.reduce((most, feature) => Math.max(most, feature.weaponMasteries ?? 0), 0)
  const masteries = sheet.weaponMasteries ?? []
  if (masteries.length > masteriesAllowed) problems.push(`the sheet has mastery of ${masteries.length} kinds of weapons, and ${cls.name} allows ${masteriesAllowed} at level ${sheet.level}`)
  if (new Set(masteries).size !== masteries.length) problems.push("a weapon mastery is listed twice")
  for (const id of masteries) {
    const weapon = equipmentById.get(id)
    if (weapon?.kind !== "weapon") problems.push(`"${id}" is not a weapon to master`)
    else if (!trainedWith(cls.weapons, weapon)) problems.push(`${cls.name} is not trained with the ${weapon.name}, so cannot master it`)
  }

  problems.push(...spellProblems(sheet, parts))
  problems.push(...advancementProblems(sheet, parts))

  const training = armorTrainingOf(sheet, parts)
  if (parts.armor && !training.some((kind) => kind === parts.armor?.category)) problems.push(`${cls.name} has no training with ${parts.armor.category} armor`)
  if (sheet.shield && !training.includes("shields")) problems.push(`${cls.name} has no training with Shields`)

  problems.push(...originProblems(sheet, parts))

  for (const trait of parts.species.traits) {
    if (!trait.choice) continue
    const taken = sheet.speciesChoices?.[trait.choice.id]
    if (taken && !trait.choice.options.some((option) => option.id === taken)) problems.push(`"${taken}" is not an option of ${trait.name}`)
  }
  for (const feature of parts.features) if (needsFeatureChoice(feature) && !sheet.featureChoices?.[feature.id]) problems.push(`${feature.name} needs a choice, and the sheet has none`)
  problems.push(...pickProblems(sheet, parts))
  for (const [featureId, chosen] of Object.entries(sheet.featureChoices ?? {})) {
    const feature = parts.features.find((entry) => entry.id === featureId)
    if (!feature) {
      problems.push(`"${featureId}" is not a ${cls.name} feature at level ${sheet.level}`)
      continue
    }
    if (grantsFeatByLevel(feature)) {
      problems.push(`${feature.name}'s feat is kept in the sheet's advancements, by level`)
      continue
    }
    if (FOLLOWS[feature.id]) {
      problems.push(`${feature.name} keeps the option chosen for ${classFeatureById.get(FOLLOWS[feature.id])?.name}, and takes none of its own`)
      continue
    }
    const offered = keptOptions(feature)
    const option = offered.some((entry) => entry.id === chosen)
    if (!option && !feature.feat) problems.push(offered.length ? `"${chosen}" is not an option of ${feature.name}` : `${feature.name} takes no choice`)
    if (!option && feature.feat) {
      const feat = featById.get(chosen)
      if (feat && "category" in feature.feat && feature.feat.category && feat.category !== feature.feat.category)
        problems.push(`${feat.name} is not a ${feature.feat.category} feat, which ${feature.name} needs`)
    }
  }
  return problems
}

/** Work out the whole sheet from the choices on it. Throws when the class, species or background is unknown. */
export function deriveSheet(sheet: Sheet): DerivedSheet {
  const { parts, problems } = lookup(sheet)
  if (!parts) throw new Error(`The sheet cannot be derived: ${problems.join(", ")}`)
  const row = parts.class.levels[sheet.level - 1]
  const proficiencyBonus = row.proficiencyBonus

  const abilityModifiers = Object.fromEntries(abilityIds.map((ability) => [ability, modifier(sheet.abilityScores[ability])])) as Record<AbilityId, number>
  const standing = standingOf(sheet, parts)

  const savingThrows = Object.fromEntries(
    abilityIds.map((ability) => {
      const proficient = parts.class.savingThrows.includes(ability) || standing.some((source) => source.savingThrowProficiencies?.includes(ability))
      return [ability, { bonus: abilityModifiers[ability] + (proficient ? proficiencyBonus : 0), proficient }]
    })
  ) as DerivedSheet["savingThrows"]

  const proficient = proficientSkills(sheet, parts)
  const expertSkills = new Set<SkillId>(sheet.expertise ?? [])
  // Jack of All Trades: half the Proficiency Bonus, rounded down, on a check with a skill the Bard lacks.
  const jack = parts.features.some((feature) => feature.id === JACK_OF_ALL_TRADES) ? Math.floor(proficiencyBonus / 2) : 0
  const skills = Object.fromEntries(
    skillIds.map((skill) => {
      const ability = skillById.get(skill)?.ability as AbilityId
      const has = proficient.has(skill)
      const expertise = has && expertSkills.has(skill)
      return [skill, { bonus: abilityModifiers[ability] + (has ? proficiencyBonus : jack) + (expertise ? proficiencyBonus : 0), proficient: has, expertise }]
    })
  ) as DerivedSheet["skills"]

  const { armorClass, from } = armorClassOf(sheet, parts, abilityModifiers)
  const initiativeFeat = parts.feats.some((feat) => feat.benefits?.some((benefit) => benefit.initiativeBonus === "proficiency-bonus"))
  const tooHeavy = parts.armor?.strengthRequired !== undefined && sheet.abilityScores.str < parts.armor.strengthRequired
  const chosen = chosenOptions(sheet, parts)
  const options = chosen.features
  // A Wood Elf's lineage sets its Speed to 35 feet.
  const baseSpeed = Math.max(parts.species.speed, ...chosen.species.map((option) => option.speed ?? 0))

  return {
    proficiencyBonus,
    abilityModifiers,
    hitDie: parts.class.hitDie,
    hitPointMaximum: hitPointMaximumOf(sheet, parts, abilityModifiers.con),
    armorClass,
    armorClassFrom: from,
    savingThrows,
    skills,
    passivePerception: 10 + skills.perception.bonus,
    initiative: abilityModifiers.dex + (initiativeFeat ? proficiencyBonus : 0),
    speed: baseSpeed + speedBonusOf(sheet, parts) - (tooHeavy ? 10 : 0),
    senses: sensesOf(sheet, parts),
    resistances: resistancesOf(sheet, parts),
    armorTraining: armorTrainingOf(sheet, parts),
    weaponProficiencies: [...parts.class.weapons, ...options.flatMap((option) => option.weaponProficiencies ?? [])],
    stealthDisadvantage: parts.armor?.stealthDisadvantage === true,
    feats: parts.feats.map((feat) => feat.id),
    classFeatures: parts.features.map((feature) => feature.id),
    cantrips: [...new Set([...(sheet.cantrips ?? []), ...speciesCantripsOf(sheet, parts), ...alwaysKnownOf(sheet, parts)])],
    speciesCantrips: speciesCantripsOf(sheet, parts),
    preparedSpells: [...new Set([...(sheet.spells ?? []), ...alwaysPreparedOf(sheet, parts)])],
    alwaysPrepared: alwaysPreparedOf(sheet, parts),
    spellbook: [...(sheet.spellbook ?? [])],
  }
}
