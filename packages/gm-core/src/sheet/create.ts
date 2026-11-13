import { type AbilityId, abilityIdSchema, abilityIds, type ClassId, classIdSchema, type EquipmentOption, idSchema, type Size, type SkillId, sizeSchema, skillIdSchema, skillIds } from "@d20/srd"
import { abilityById } from "@d20/srd/abilities"
import { backgroundById, backgrounds } from "@d20/srd/backgrounds"
import { classById } from "@d20/srd/classes"
import { equipment, equipmentById } from "@d20/srd/equipment"
import { featById, feats } from "@d20/srd/feats"
import { languageById, languages } from "@d20/srd/languages"
import type { Background } from "@d20/srd/schema/origins"
import { skillById } from "@d20/srd/skills"
import { spellById } from "@d20/srd/spells"
import { z } from "zod"
import type { HeroRules } from "../character/hero-draft"
import type { PCTemplate } from "../types/character"
import { alwaysPrepared, deriveSheet, expertiseSlots, featuresOf, needsFeatureChoice, sheetProblems, takesPicks, trainedWith } from "./derive"
import { allSpecies, grantedSkills, picksSkills, type SpeciesEntry, speciesById } from "./house-species"
import { type ChoiceOffer, choiceOffers, type FeatOffer, featOffer, listSpells, masteriesAllowed, type Named, named, type PicksOffer, picksOffer, skillNamed, spellNamed } from "./level-up"
import { autoPicks, spellOrder } from "./milestone"
import { type AbilityScores, type Advancement, abilityScoresSchema, featurePickSchema, type Sheet } from "./sheet"
import { spellsOf } from "./spells"

/** The fields of a hero's record that the sheet settles, typed as `PCTemplate` has them. */
export type HeroRecord = Required<Pick<PCTemplate, "race" | "archetype" | "attributes" | "skills" | "equipment" | "spells" | "specialAbilities">>

/**
 * Making a level 1 hero, as pure functions: what a class, species and background ask the player to choose, and from
 * what (`creationOptions`), the sheet those choices make or what stops it (`createSheet`), and choices that need no
 * player (`autoCreate`). Ability scores are the Standard Array, placed by the player, with the background's increase.
 */

/**
 * The classes a hero can be made in: all twelve of the SRD, raised by levels to 20. The
 * menu, the pick a host receives (`creationPickSchema`) and its type hold to it.
 */
export const CREATION_CLASSES = ["barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"] as const
export type CreationClassId = (typeof CREATION_CLASSES)[number]

/** The Standard Array: "Use the following six scores for your abilities: 15, 14, 13, 12, 10, 8." (SRD 5.2.1, p. 21) */
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const

/** The Standard Array by Class table (SRD 5.2.1, p. 21), for every class. The SRD data does not hold it. */
export const SUGGESTED_SCORES: Record<ClassId, AbilityScores> = {
  barbarian: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
  bard: { str: 8, dex: 14, con: 12, int: 13, wis: 10, cha: 15 },
  cleric: { str: 14, dex: 8, con: 13, int: 10, wis: 15, cha: 12 },
  druid: { str: 8, dex: 12, con: 14, int: 13, wis: 15, cha: 10 },
  fighter: { str: 15, dex: 14, con: 13, int: 8, wis: 10, cha: 12 },
  monk: { str: 12, dex: 15, con: 13, int: 10, wis: 14, cha: 8 },
  paladin: { str: 15, dex: 10, con: 13, int: 8, wis: 12, cha: 14 },
  ranger: { str: 12, dex: 15, con: 13, int: 8, wis: 14, cha: 10 },
  rogue: { str: 12, dex: 15, con: 13, int: 14, wis: 10, cha: 8 },
  sorcerer: { str: 10, dex: 13, con: 14, int: 8, wis: 12, cha: 15 },
  warlock: { str: 8, dex: 14, con: 13, int: 12, wis: 10, cha: 15 },
  wizard: { str: 8, dex: 12, con: 13, int: 15, wis: 14, cha: 10 },
}

/**
 * The background's increase: "increase one of those scores by 2 and a different one by 1, or increase all three by
 * 1. None of these increases can raise a score above 20." (SRD 5.2.1, p. 22)
 */
const INCREASE = {
  choices: [
    [2, 1],
    [1, 1, 1],
  ],
  maximum: 20,
}

/** A Wizard's Spellbook, which the SRD prints in the class's starting equipment and not in its equipment lists. */
const SPELLBOOK = "spellbook"

/** A Rogue's Thieves' Cant gives that language and one more of either table. The SRD data does not type it. */
const THIEVES_CANT = "rogue-thieves-cant"

/** The class, species and background a hero is made from. */
export const creationPickSchema = z.strictObject({ class: z.enum(CREATION_CLASSES), species: idSchema, background: idSchema })
export type CreationPick = z.infer<typeof creationPickSchema>

/** One lettered option of starting equipment that gives gear, as the sheet keeps it and by name. */
export type EquipmentOffer = {
  option: string
  /** The armor it gives, which the hero wears. */
  armor?: Named
  shield?: true
  /** The weapons it gives, by equipment id. A Staff is also a Quarterstaff. */
  weapons: Named[]
  /** Every item it gives, by name, with its count or note: "Dagger (2)", "Parchment (10 sheets)". A pick's item is named on the pick. */
  gear: string[]
  /** The same items with their counts and notes apart, as `createSheet` merges them. */
  items: GearItem[]
  /** A line that has the player choose one item of a group or kind (a Holy Symbol, a Musical Instrument), by the group's id. */
  picks?: { id: string; name: string; from: Named[] }[]
}

/** What a class, species and background ask of a level 1 hero, and from what. A key is present only when the trio asks for it. */
export type CreationOptions = {
  class: Named
  species: Named
  background: Named
  /** The Hit Point Die: a level 1 hero has its whole size plus the Constitution modifier. */
  hitDie: number
  /** The class features of level 1. */
  features: Named[]
  /** The Standard Array to place, the class's suggested placing, and the background's increase among its three abilities. */
  abilityScores: { standardArray: number[]; suggested: AbilityScores; increase: { from: AbilityId[]; choices: number[][]; maximum: number } }
  /** The sizes a species lets the player choose between (a Human is Medium or Small). */
  size?: Size[]
  /** A species trait that has the player pick one option: a lineage, an ancestry. An option that brings cantrips names them. */
  speciesChoices?: { trait: Named; choice: string; options: (Named & { cantrips?: Named[] })[] }[]
  /** The ability the species' spells are cast with, where its traits let the player pick it. */
  speciesSpellAbility?: { traits: Named[]; from: AbilityId[] }
  /** The class's skills: how many, from its list less the background's two, which are named beside it. */
  skills: { count: number; from: Named[]; background: Named[] }
  /** Skills a species trait gives (a Human's Skillful, an Elf's Keen Senses), from its list or any skill. */
  speciesSkills?: { trait: Named; count: number; from: Named[] }[]
  /** An Origin feat a species trait gives (a Human's Versatile), with what each asks, and the one the SRD recommends. */
  speciesFeat?: { trait: Named; feats: FeatOffer[]; recommended?: string }
  /** The background's Origin feat, with what it asks. Its spell list, where the background names one, is the only one offered. */
  backgroundFeat: FeatOffer
  /** Expertise a class feature gives, from the skills the hero could be proficient in. Only those they are proficient in count. */
  expertise?: { feature: Named; count: number; from: Named[] }[]
  /** A choice a class feature keeps (Fighting Style, Divine Order), with the option the SRD recommends. */
  featureChoices?: { feature: Named; options: ChoiceOffer[]; recommended?: string }[]
  /** A class feature that takes several options from its list (a Warlock's Eldritch Invocations): how many, and from what. */
  featurePicks?: PicksOffer[]
  /** The class's cantrips. An option that adds cantrips (Thaumaturge) says so on the option, and they are sent with these. */
  cantrips?: { count: number; from: Named[] }
  /** Spells to prepare, from the class's level 1 spells less those always prepared. A Wizard prepares from the spellbook. */
  spells?: { count: number; from: (Named & { level: number })[] }
  /** A Wizard's spellbook: how many level 1 spells, from the class's list. */
  spellbook?: { count: number; from: (Named & { level: number; school: string })[] }
  /** Kinds of weapons to master, from those the class is trained with. */
  weaponMasteries?: { count: number; from: Named[] }
  /** The class's and the background's starting equipment options that give gear. An option of coin alone is left out. */
  equipment: { class: EquipmentOffer[]; background: EquipmentOffer[] }
  /** Languages beside those `known`: `count` in all, of which `standard` from the Standard Languages table, the rest from either. */
  languages: { count: number; standard: number; known: Named[]; standardFrom: Named[]; rareFrom?: Named[] }
}

const raise = z.number().int().min(1).max(2)
const featPicksSchema = z.strictObject({ spellList: classIdSchema, spellAbility: abilityIdSchema, cantrips: z.array(idSchema), spell: idSchema, skills: z.array(skillIdSchema) }).partial()

/** A player's choices for a level 1 hero, as a host receives them. `createSheet` checks what they mean. */
export const creationChoicesSchema = z.strictObject({
  /** The Standard Array placed on the six abilities, before the background's increase. */
  abilityScores: abilityScoresSchema,
  /** The background's increase: `{ dex: 2, con: 1 }` or `{ dex: 1, con: 1, int: 1 }`. */
  abilityIncrease: z.strictObject({ str: raise, dex: raise, con: raise, int: raise, wis: raise, cha: raise }).partial(),
  size: sizeSchema.optional(),
  /** A species trait's choice id and the option taken: `{ "elven-lineage": "high-elf" }`. */
  speciesChoices: z.record(idSchema, idSchema).optional(),
  speciesSpellAbility: abilityIdSchema.optional(),
  classSkills: z.array(skillIdSchema),
  /** The skills species traits give, in trait order. */
  speciesSkills: z.array(skillIdSchema).optional(),
  /** The Origin feat a species trait gives, and its picks: Magic Initiate's spells, or Skilled's skills. */
  speciesFeat: idSchema.optional(),
  speciesFeatPicks: featPicksSchema.optional(),
  /** The background's Origin feat's picks. A list the background names is taken from the background. */
  backgroundFeatPicks: featPicksSchema.optional(),
  expertise: z.array(skillIdSchema).optional(),
  /** A feature's id and the option or feat taken: `{ "fighter-fighting-style": "defense" }`. */
  featureChoices: z.record(idSchema, idSchema).optional(),
  /** A feature's id and the options picked for it: `{ "warlock-eldritch-invocations": [{ option: "armor-of-shadows" }] }`. */
  featurePicks: z.record(idSchema, z.array(featurePickSchema)).optional(),
  /** The class's cantrips, with any an option adds. */
  cantrips: z.array(idSchema).optional(),
  spells: z.array(idSchema).optional(),
  spellbook: z.array(idSchema).optional(),
  weaponMasteries: z.array(idSchema).optional(),
  /** The lettered options taken, and for each line that has a pick, the group's id and the item chosen. */
  equipment: z.strictObject({
    class: z.string().min(1),
    background: z.string().min(1),
    classPicks: z.record(idSchema, idSchema).optional(),
    backgroundPicks: z.record(idSchema, idSchema).optional(),
  }),
  languages: z.array(idSchema),
})
export type CreationChoices = z.infer<typeof creationChoicesSchema>
type FeatPicks = z.infer<typeof featPicksSchema>

/** The classes, species and backgrounds a hero can be made from, by SRD id and name. */
export function creationMenu(): { classes: Named[]; species: Named[]; backgrounds: Named[] } {
  return {
    classes: CREATION_CLASSES.map((id) => named(classById.get(id) as Named)),
    species: allSpecies.map(named),
    backgrounds: backgrounds.map(named),
  }
}

type Parts = { cls: NonNullable<ReturnType<typeof classById.get>>; species: SpeciesEntry; background: Background }

function partsOf(pick: CreationPick): { parts?: Parts; problems: string[] } {
  const problems: string[] = []
  const cls = classById.get(pick.class)
  const species = speciesById.get(pick.species)
  const background = backgroundById.get(pick.background)
  if (!cls) problems.push(`"${pick.class}" is not a class`)
  if (!species) problems.push(`"${pick.species}" is not a species`)
  if (!background) problems.push(`"${pick.background}" is not a background`)
  return cls && species && background ? { parts: { cls, species, background }, problems } : { problems }
}

// The level 1 sheet with nothing chosen, so the class's features and lists can be read.
const bareSheet = (pick: CreationPick): Sheet => ({
  class: pick.class,
  level: 1,
  species: pick.species,
  background: pick.background,
  abilityScores: SUGGESTED_SCORES[pick.class],
  classSkills: [],
})

/** One line of gear: an item's name, how many, and the note the SRD prints beside it ("prayers", "sheets"). */
type GearItem = { name: string; quantity: number; note?: string }

function gearItem(id: string, quantity: number, note?: string): GearItem {
  const name = id === SPELLBOOK ? "Spellbook" : equipmentById.get(id)?.name
  if (!name) throw new Error(`"${id}" is not equipment`)
  return { name, quantity, ...(note && note.toLowerCase() !== name.toLowerCase() ? { note } : {}) }
}

// An item in words, with its count and note: "Parchment (10 sheets)", "Dagger (4)".
function gearLine(item: GearItem): string {
  const extra = [item.quantity > 1 ? String(item.quantity) : "", item.note ?? ""].filter(Boolean).join(" ")
  return extra ? `${item.name} (${extra})` : item.name
}

// The same item from two places is one line with both counts: a Rogue's two Daggers and a Criminal's two are four.
function mergedGear(items: readonly GearItem[]): string[] {
  const merged: GearItem[] = []
  for (const item of items) {
    const same = merged.find((each) => each.name === item.name && each.note === item.note)
    if (same) same.quantity += item.quantity
    else merged.push({ ...item })
  }
  return merged.map(gearLine)
}

// The items a "choose one" line may be: a group's members, a tool's variants, or the item itself.
function pickFrom(ids: readonly string[]): Named[] {
  return ids.flatMap((id) => {
    const entry = equipmentById.get(id) as { members?: string[]; variants?: string[]; id: string; name: string } | undefined
    if (!entry) return []
    const members = entry.members ?? entry.variants
    return members ? members.flatMap((member) => (equipmentById.get(member) ? [named(equipmentById.get(member) as Named)] : [])) : [named(entry)]
  })
}

function equipmentOffer(option: EquipmentOption): EquipmentOffer {
  const offer: EquipmentOffer = { option: option.option, weapons: [], gear: [], items: [] }
  for (const line of option.items ?? []) {
    if (line.chooseFrom) {
      const id = line.chooseFrom[0]
      offer.picks = [...(offer.picks ?? []), { id, name: equipmentById.get(id)?.name ?? id, from: pickFrom(line.chooseFrom) }]
      continue
    }
    const id = line.item as string
    const item = gearItem(id, line.quantity, line.note)
    offer.items.push(item)
    offer.gear.push(gearLine(item))
    const entry = equipmentById.get(id)
    if (entry?.kind === "armor" && entry.category === "shield") offer.shield = true
    else if (entry?.kind === "armor") offer.armor = named(entry)
    else if (entry?.kind === "weapon") offer.weapons.push(named(entry))
    else if (entry && "alsoQuarterstaff" in entry && entry.alsoQuarterstaff) offer.weapons.push(named(equipmentById.get("quarterstaff") as Named))
  }
  return offer
}

const gearOffers = (options: readonly EquipmentOption[]) => options.filter((option) => option.items?.length).map(equipmentOffer)

// The languages a hero knows without choosing: Common, and a Rogue's Thieves' Cant.
const knownLanguages = (features: readonly { id: string }[]) => ["common", ...(features.some((feature) => feature.id === THIEVES_CANT) ? ["thieves-cant"] : [])]

/**
 * What a class, species and background ask the player to choose at level 1, and from what, by SRD id and name. Throws
 * for a class a hero cannot be made in, or a species or background the SRD data lacks.
 */
export function creationOptions(pick: CreationPick): CreationOptions {
  const { parts, problems } = partsOf(pick)
  if (!parts) throw new Error(problems.join(", "))
  const { cls, species, background } = parts
  const sheet = bareSheet(pick)
  const features = featuresOf(sheet)
  const row = cls.levels[0]
  const backgroundSkills = new Set<SkillId>(background.skills)
  const options: CreationOptions = {
    class: named(cls),
    species: named(species),
    background: named(background),
    hitDie: cls.hitDie,
    features: features.map(named),
    abilityScores: {
      standardArray: [...STANDARD_ARRAY],
      suggested: { ...SUGGESTED_SCORES[pick.class] },
      increase: { from: [...background.abilityScores], choices: INCREASE.choices.map((choice) => [...choice]), maximum: INCREASE.maximum },
    },
    skills: {
      count: cls.skills.count,
      from: (cls.skills.from ?? skillIds).filter((skill) => !backgroundSkills.has(skill) && !grantedSkills(species).includes(skill)).map(skillNamed),
      background: background.skills.map(skillNamed),
    },
    backgroundFeat: backgroundFeatOffer(background, [...skillIds]),
    equipment: { class: gearOffers(cls.startingEquipment), background: gearOffers(background.equipment) },
    languages: languageOffer(features),
  }

  if (species.sizes.length > 1) options.size = species.sizes.map((entry) => entry.size)
  const choosing = species.traits.filter((trait) => trait.choice)
  if (choosing.length)
    options.speciesChoices = choosing.map((trait) => ({
      trait: { id: trait.choice?.id as string, name: trait.name },
      choice: trait.choice?.id as string,
      options: (trait.choice?.options ?? []).map((option) => {
        const cantrips = (option.spells ?? []).filter((spell) => spell.cantrip && spell.level <= 1).map((spell) => spellNamed(spell.spell))
        return { ...named(option), ...(cantrips.length ? { cantrips } : {}) }
      }),
    }))
  const casting = species.traits.filter((trait) => trait.spellcastingAbility)
  if (casting.length) options.speciesSpellAbility = { traits: casting.map((trait) => traitNamed(trait.name)), from: [...new Set(casting.flatMap((trait) => trait.spellcastingAbility ?? []))] }
  const skilled = species.traits.filter(picksSkills)
  const granted = new Set<SkillId>(grantedSkills(species))
  if (skilled.length)
    options.speciesSkills = skilled.map((trait) => ({
      trait: traitNamed(trait.name),
      count: trait.skillChoice?.count ?? 0,
      from: (trait.skillChoice?.from === "any" ? skillIds : (trait.skillChoice?.from ?? [])).map(skillNamed),
    }))
  const featTrait = species.traits.find((trait) => trait.feat)
  if (featTrait?.feat) {
    const grant = featTrait.feat
    const offered = feats.filter((feat) => feat.category === grant.category && (feat.id !== background.feat.id || feat.repeatable))
    options.speciesFeat = {
      trait: traitNamed(featTrait.name),
      feats: offered.map((feat) => {
        const offer = featOffer(feat, skillIds)
        // Magic Initiate twice takes a different list each time: the background's is not offered again.
        if (offer.spellPicks && feat.id === background.feat.id && background.feat.spellList)
          offer.spellPicks = { ...offer.spellPicks, spellLists: offer.spellPicks.spellLists.filter((list) => list !== background.feat.spellList) }
        return offer
      }),
      ...(grant.recommended ? { recommended: grant.recommended } : {}),
    }
  }

  // Expertise from the skills the hero could be proficient in: the background's, the class's list, and those a
  // species trait or a feat may give.
  const slots = expertiseSlots(features, 1)
  if (slots.length) {
    const any = species.traits.some((trait) => trait.skillChoice?.from === "any" || trait.feat)
    const reachable = new Set<SkillId>([
      ...background.skills,
      ...granted,
      ...(cls.skills.from ?? skillIds),
      ...skilled.flatMap((trait) => (trait.skillChoice?.from === "any" ? [] : (trait.skillChoice?.from ?? []))),
    ])
    const from = any ? skillIds : skillIds.filter((skill) => reachable.has(skill))
    options.expertise = [...new Set(slots.map((slot) => slot.feature))].map((feature) => ({
      feature: named(feature),
      count: slots.filter((slot) => slot.feature === feature).length,
      from: from.filter((skill) => !feature.expertise?.from || feature.expertise.from.includes(skill)).map(skillNamed),
    }))
  }

  const kept = features.filter(needsFeatureChoice)
  if (kept.length)
    options.featureChoices = kept.map((feature) => ({
      feature: named(feature),
      options: choiceOffers(
        feature,
        [background.feat.id].filter((id): id is string => !!id),
        []
      ),
      ...(feature.feat?.recommended ? { recommended: feature.feat.recommended } : {}),
    }))

  const picking = features.filter(takesPicks)
  if (picking.length) options.featurePicks = picking.map((feature) => picksOffer(feature, sheet, [], false))

  if (cls.spellcasting) {
    if (row.cantrips) options.cantrips = { count: row.cantrips, from: listSpells(cls.id, 0, 0).map(spellNamed) }
    const always = alwaysPrepared(sheet)
    const level1 = listSpells(cls.id, 1, 1)
    if (row.preparedSpells)
      options.spells = {
        count: row.preparedSpells,
        from: level1.filter((id) => !always.includes(id)).map((id) => ({ ...spellNamed(id), level: 1 })),
      }
    if (cls.spellcasting.ritualFromSpellbook) options.spellbook = { count: 6, from: level1.map((id) => ({ ...spellNamed(id), level: 1, school: spellById.get(id)?.school ?? "" })) }
  }

  const masteries = masteriesAllowed(sheet)
  if (masteries > 0) options.weaponMasteries = { count: masteries, from: equipment.filter((entry) => entry.kind === "weapon" && trainedWith(cls.weapons, entry)).map(named) }
  return options
}

const traitNamed = (name: string): Named => ({
  id: name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, ""),
  name,
})

// The background's Origin feat as an offer, with its spell list fixed where the background names one.
function backgroundFeatOffer(background: Background, unskilled: readonly SkillId[]): FeatOffer {
  const feat = featById.get(background.feat.id ?? "")
  if (!feat) throw new Error(`${background.name} names no Origin feat`)
  const offer = featOffer(feat, unskilled)
  if (offer.spellPicks && background.feat.spellList) offer.spellPicks = { ...offer.spellPicks, spellLists: [background.feat.spellList] }
  return offer
}

function languageOffer(features: readonly { id: string }[]): CreationOptions["languages"] {
  const known = knownLanguages(features)
  const extra = known.length - 1
  const left = languages.filter((language) => !known.includes(language.id))
  return {
    count: 2 + extra,
    standard: 2,
    known: known.map((id) => named(languageById.get(id) as Named)),
    standardFrom: left.filter((language) => language.rarity === "standard").map(named),
    ...(extra ? { rareFrom: left.filter((language) => language.rarity !== "standard").map(named) } : {}),
  }
}

// Faults in the ability scores: the Standard Array placed once each, and the background's increase by its rule.
function scoreProblems(choices: CreationChoices, background: Background): string[] {
  const problems: string[] = []
  const placed = abilityIds.map((ability) => choices.abilityScores[ability]).sort((a, b) => b - a)
  if (placed.join() !== STANDARD_ARRAY.join()) problems.push(`the ability scores are the Standard Array, ${STANDARD_ARRAY.join(", ")}, each placed once, and the choices place ${placed.join(", ")}`)
  const raises = Object.entries(choices.abilityIncrease) as [AbilityId, number][]
  for (const [ability] of raises) if (!background.abilityScores.includes(ability)) problems.push(`the ${background.name} background cannot raise ${ability}`)
  const amounts = raises.map(([, amount]) => amount).sort((a, b) => b - a)
  if (!INCREASE.choices.some((choice) => choice.join() === amounts.join()))
    problems.push(
      `the ${background.name} background raises one of ${background.abilityScores.map((ability) => abilityById.get(ability)?.name ?? ability).join(", ")} by 2 and another by 1, or all three by 1`
    )
  for (const [ability, amount] of raises) if (choices.abilityScores[ability] + amount > INCREASE.maximum) problems.push(`the background's increase cannot raise ${ability} above ${INCREASE.maximum}`)
  return problems
}

// Each chosen skill matched to a trait that gives one: those with their own list first, then those that take any.
function speciesSkillProblems(chosen: readonly SkillId[], species: SpeciesEntry): string[] {
  const slots = species.traits.flatMap((trait) =>
    trait.skillChoice && picksSkills(trait)
      ? Array.from({ length: trait.skillChoice.count }, () => ({ trait: trait.name, from: trait.skillChoice?.from === "any" ? undefined : trait.skillChoice?.from }))
      : []
  )
  if (chosen.length !== slots.length) return [`the ${species.name}'s traits give ${slots.length} skills, and the choices name ${chosen.length}`]
  const problems: string[] = []
  const spare = [...chosen]
  for (const slot of [...slots].sort((a, b) => Number(!a.from) - Number(!b.from))) {
    const index = spare.findIndex((skill) => !slot.from || slot.from.includes(skill))
    if (index < 0) problems.push(`${slot.trait} gives one of ${slot.from?.join(", ")}, and the choices name none of them`)
    else spare.splice(index, 1)
  }
  return problems
}

// An Origin feat's own picks, kept on the sheet: Magic Initiate's in an advancement, Skilled's among the other skills.
function featEntry(featId: string, picks: FeatPicks | undefined, fixedList: string | undefined): { entry?: Advancement; skills: SkillId[]; problems: string[] } {
  const feat = featById.get(featId)
  if (!feat) return { skills: [], problems: [`"${featId}" is not a feat`] }
  const problems: string[] = []
  const spells = feat.benefits?.some((benefit) => benefit.cantrips && benefit.spellLists)
  const skills = picks?.skills ?? []
  if (feat.proficiencyChoice) {
    if (skills.length !== feat.proficiencyChoice.count) problems.push(`${feat.name} gives ${feat.proficiencyChoice.count} skill proficiencies, and the choices name ${skills.length}`)
  } else if (skills.length) problems.push(`${feat.name} gives no skills to choose`)
  if (!spells) {
    if (picks?.spellList || picks?.spellAbility || picks?.cantrips || picks?.spell) problems.push(`${feat.name} takes no spell picks`)
    return { skills, problems }
  }
  if (fixedList && picks?.spellList && picks.spellList !== fixedList) problems.push(`the background's ${feat.name} takes its spells from the ${fixedList} list`)
  const spellList = fixedList ?? picks?.spellList
  const entry: Advancement = {
    level: 1,
    feat: feat.id,
    ...(spellList ? { spellList: spellList as Advancement["spellList"] } : {}),
    ...(picks?.spellAbility ? { spellAbility: picks.spellAbility } : {}),
    ...(picks?.cantrips ? { cantrips: [...picks.cantrips] } : {}),
    ...(picks?.spell ? { spell: picks.spell } : {}),
  }
  return { entry, skills, problems }
}

/**
 * The level 1 sheet a class, species and background make with the player's choices, and the gear the hero starts
 * with by name, or the problems that keep it from being legal: the ability score rule, every pick the trio asks for
 * made from what it offers, and then every fault `sheetProblems` finds in the sheet.
 */
export function createSheet(pick: CreationPick, choices: CreationChoices): { sheet: Sheet; gear: string[] } | { problems: string[] } {
  const found = partsOf(pick)
  if (!found.parts) return { problems: found.problems }
  const { cls, species, background } = found.parts
  const options = creationOptions(pick)
  const problems = scoreProblems(choices, background)

  if (options.size && !choices.size) problems.push(`a ${species.name} is ${options.size.join(" or ")}, and the choices name neither`)
  if (!options.size && choices.size) problems.push(`a ${species.name} has one size, so none is chosen`)
  for (const entry of options.speciesChoices ?? []) if (!choices.speciesChoices?.[entry.choice]) problems.push(`${entry.trait.name} needs a choice, and the choices have none`)
  for (const id of Object.keys(choices.speciesChoices ?? {})) if (!options.speciesChoices?.some((entry) => entry.choice === id)) problems.push(`"${id}" is not a choice of the ${species.name}`)
  if (options.speciesSpellAbility && !choices.speciesSpellAbility)
    problems.push(`${options.speciesSpellAbility.traits.map((trait) => trait.name).join(" and ")} needs a spellcasting ability, and the choices have none`)
  if (!options.speciesSpellAbility && choices.speciesSpellAbility) problems.push(`no ${species.name} trait takes a spellcasting ability`)
  problems.push(...speciesSkillProblems(choices.speciesSkills ?? [], species))

  // The Origin feats: the background's, and one a species trait gives.
  const background_ = featEntry(background.feat.id ?? "", choices.backgroundFeatPicks, background.feat.spellList)
  problems.push(...background_.problems)
  let species_: ReturnType<typeof featEntry> | undefined
  if (options.speciesFeat) {
    if (!choices.speciesFeat) problems.push(`${options.speciesFeat.trait.name} gives an Origin feat, and the choices name none`)
    else if (!options.speciesFeat.feats.some((feat) => feat.id === choices.speciesFeat)) problems.push(`${options.speciesFeat.trait.name} cannot give "${choices.speciesFeat}"`)
    else {
      species_ = featEntry(choices.speciesFeat, choices.speciesFeatPicks, undefined)
      problems.push(...species_.problems)
    }
  } else if (choices.speciesFeat || choices.speciesFeatPicks) problems.push(`no ${species.name} trait gives a feat`)

  // No skill comes from two places.
  const otherSkills = [...(choices.speciesSkills ?? []), ...background_.skills, ...(species_?.skills ?? [])]
  const held = new Set<SkillId>([...background.skills, ...grantedSkills(species), ...choices.classSkills])
  for (const skill of choices.classSkills) if (grantedSkills(species).includes(skill)) problems.push(`${skillById.get(skill)?.name ?? skill} already comes from the ${species.name}`)
  for (const skill of otherSkills) {
    if (held.has(skill)) problems.push(`${skillById.get(skill)?.name ?? skill} is chosen twice`)
    held.add(skill)
  }

  // A cantrip the species already gives is not chosen again.
  const lineage = new Set(
    species.traits.flatMap((trait) => {
      const option = trait.choice?.options.find((each) => each.id === choices.speciesChoices?.[trait.choice?.id ?? ""])
      return [...(trait.spells ?? []), ...(option?.spells ?? [])].filter((spell) => spell.cantrip && spell.level <= 1).map((spell) => spell.spell)
    })
  )
  for (const id of choices.cantrips ?? []) if (lineage.has(id)) problems.push(`the ${species.name} already knows ${spellById.get(id)?.name ?? id}`)
  for (const id of Object.keys(choices.featurePicks ?? {})) if (!options.featurePicks?.some((entry) => entry.feature.id === id)) problems.push(`"${id}" takes no picks at level 1`)
  if (options.weaponMasteries && (choices.weaponMasteries ?? []).length !== options.weaponMasteries.count)
    problems.push(`${cls.name} masters ${options.weaponMasteries.count} kinds of weapons, and the choices name ${(choices.weaponMasteries ?? []).length}`)

  // Starting equipment: one option of each that gives gear, and an item for each of its picks.
  const gear: GearItem[] = []
  const take = (from: EquipmentOffer[], letter: string, picks: Record<string, string> | undefined, whose: string) => {
    const offer = from.find((each) => each.option === letter)
    if (!offer) {
      problems.push(`${whose} starting equipment has no option ${letter} that gives gear: ${from.map((each) => each.option).join(", ")}`)
      return undefined
    }
    gear.push(...offer.items)
    for (const line of offer.picks ?? []) {
      const chosen = picks?.[line.id]
      const item = line.from.find((each) => each.id === chosen)
      if (!item) problems.push(`${whose} option ${letter} has a ${line.name} to choose, one of ${line.from.map((each) => each.id).join(", ")}, and the choices name ${chosen ?? "none"}`)
      else gear.push({ name: item.name, quantity: 1 })
    }
    for (const id of Object.keys(picks ?? {})) if (!offer.picks?.some((line) => line.id === id)) problems.push(`${whose} option ${letter} has no ${id} to choose`)
    return offer
  }
  const classGear = take(options.equipment.class, choices.equipment.class, choices.equipment.classPicks, `the ${cls.name}'s`)
  const backgroundGear = take(options.equipment.background, choices.equipment.background, choices.equipment.backgroundPicks, `the ${background.name}'s`)
  const weapons = [...new Set([...(classGear?.weapons ?? []), ...(backgroundGear?.weapons ?? [])].map((weapon) => weapon.id))]
  const armor = classGear?.armor ?? backgroundGear?.armor

  const advancements = [background_.entry, species_?.entry].filter((entry): entry is Advancement => !!entry)
  const abilityScores = { ...choices.abilityScores }
  for (const [ability, amount] of Object.entries(choices.abilityIncrease) as [AbilityId, number][]) abilityScores[ability] += amount
  const built: Sheet = {
    class: pick.class,
    level: 1,
    species: pick.species,
    background: pick.background,
    ...(choices.size ? { size: choices.size } : {}),
    ...(choices.speciesSpellAbility ? { speciesSpellAbility: choices.speciesSpellAbility } : {}),
    languages: [...choices.languages],
    abilityScores,
    classSkills: [...choices.classSkills],
    ...(otherSkills.length ? { otherSkills } : {}),
    ...(choices.expertise?.length ? { expertise: [...choices.expertise] } : {}),
    ...(choices.speciesChoices && Object.keys(choices.speciesChoices).length ? { speciesChoices: { ...choices.speciesChoices } } : {}),
    ...(choices.featureChoices && Object.keys(choices.featureChoices).length ? { featureChoices: { ...choices.featureChoices } } : {}),
    ...(choices.featurePicks && Object.keys(choices.featurePicks).length ? { featurePicks: structuredClone(choices.featurePicks) } : {}),
    ...(choices.speciesFeat ? { feats: [choices.speciesFeat] } : {}),
    ...(armor ? { armor: armor.id } : {}),
    ...(classGear?.shield || backgroundGear?.shield ? { shield: true } : {}),
    ...(weapons.length ? { weapons } : {}),
    ...(choices.cantrips?.length ? { cantrips: [...choices.cantrips] } : {}),
    ...(choices.spells?.length ? { spells: [...choices.spells] } : {}),
    ...(choices.spellbook?.length ? { spellbook: [...choices.spellbook] } : {}),
    ...(choices.weaponMasteries?.length ? { weaponMasteries: [...choices.weaponMasteries] } : {}),
    ...(advancements.length ? { advancements } : {}),
  }
  const all = [...new Set([...problems, ...sheetProblems(built)])]
  return all.length ? { problems: all } : { sheet: built, gear: mergedGear(gear) }
}

/** A sheet's skill bonuses, for picking the skills a hero is best at. */
const bonusesOf = (sheet: Sheet) => deriveSheet(sheet).skills

/** Spells in the order a pick that needs no player takes them, by `spellOrder`. */
const bySpellOrder = <T extends { id: string }>(from: readonly T[]) => [...from].map((entry) => ({ ...entry, level: spellById.get(entry.id)?.level ?? 0 })).sort(spellOrder)

/** Languages a species' people are likely to speak, for a pick that needs no player. The SRD ties no language to a species. */
const SPECIES_LANGUAGE: Record<string, string> = { dragonborn: "draconic", dwarf: "dwarvish", elf: "elvish", gnome: "gnomish", goliath: "giant", halfling: "halfling", orc: "orc" }

/**
 * Choices for a level 1 hero that need no player, for Choose For Me: the class's suggested scores, the background's
 * increase into the class's main ability (2, then 1 to its next best), the species' first options, the recommended
 * feat and Fighting Style, the skills the hero is best at, the spells the engine resolves first, the class's first
 * gear, and the weapons carried to master.
 */
export function autoCreate(pick: CreationPick): CreationChoices {
  const options = creationOptions(pick)
  const cls = classById.get(pick.class) as NonNullable<ReturnType<typeof classById.get>>
  const background = backgroundById.get(pick.background) as Background
  const suggested = options.abilityScores.suggested
  const primary = "all" in cls.primaryAbility ? cls.primaryAbility.all : cls.primaryAbility.any
  const order = [...options.abilityScores.increase.from].sort((a, b) => Number(primary.includes(b)) - Number(primary.includes(a)) || suggested[b] - suggested[a])
  const abilityIncrease = { [order[0]]: 2, [order[1]]: 1 } as CreationChoices["abilityIncrease"]
  const scores = { ...suggested }
  for (const [ability, amount] of Object.entries(abilityIncrease) as [AbilityId, number][]) scores[ability] += amount

  const speciesChoices = Object.fromEntries((options.speciesChoices ?? []).map((entry) => [entry.choice, entry.options[0].id]))
  const casting = cls.spellcasting?.ability
  const bestOf = (from: readonly AbilityId[]) => (casting && from.includes(casting) ? casting : [...from].sort((a, b) => scores[b] - scores[a])[0])

  // Skills by the bonus the hero would have with them, from the scores alone.
  const bonuses = bonusesOf({ ...bareSheet(pick), abilityScores: scores })
  const granted = grantedSkills(speciesById.get(pick.species) as SpeciesEntry)
  const taken = new Set<string>([...background.skills, ...granted])
  const best = (from: readonly Named[], count: number) => {
    const picked = [...from]
      .filter((entry) => !taken.has(entry.id))
      .sort((a, b) => bonuses[b.id as SkillId].bonus - bonuses[a.id as SkillId].bonus)
      .slice(0, count)
      .map((entry) => entry.id as SkillId)
    for (const id of picked) taken.add(id)
    return picked
  }
  // A species trait's short list first (Keen Senses), so the class's longer one cannot use up its skills.
  const speciesSkills = [...(options.speciesSkills ?? [])].sort((a, b) => a.from.length - b.from.length).flatMap((entry) => best(entry.from, entry.count))
  const classSkills = best(options.skills.from, options.skills.count)

  const choices: CreationChoices = {
    abilityScores: { ...suggested },
    abilityIncrease,
    classSkills,
    equipment: { class: options.equipment.class[0].option, background: options.equipment.background[0].option },
    languages: [],
  }
  if (options.size) choices.size = options.size[0]
  if (Object.keys(speciesChoices).length) choices.speciesChoices = speciesChoices
  if (options.speciesSpellAbility) choices.speciesSpellAbility = bestOf(options.speciesSpellAbility.from)
  if (speciesSkills.length) choices.speciesSkills = speciesSkills

  // Class features' choices: the recommended option, or the first that brings no cantrips.
  if (options.featureChoices)
    choices.featureChoices = Object.fromEntries(
      options.featureChoices.map((entry) => [
        entry.feature.id,
        (entry.options.find((option) => option.id === entry.recommended) ?? entry.options.find((option) => !option.cantrips) ?? entry.options[0]).id,
      ])
    )

  // Spells: the class's first, then a feat's from what is left.
  const known = new Set<string>(
    (options.speciesChoices ?? []).flatMap((entry) => entry.options.find((option) => option.id === speciesChoices[entry.choice])?.cantrips?.map((cantrip) => cantrip.id) ?? [])
  )
  for (const trait of speciesById.get(pick.species)?.traits ?? []) for (const spell of trait.spells ?? []) if (spell.cantrip) known.add(spell.spell)
  const firstSpells = <T extends { id: string }>(from: readonly T[], count: number) => {
    const picked = bySpellOrder(from.filter((entry) => !known.has(entry.id)))
      .slice(0, count)
      .map((entry) => entry.id)
    for (const id of picked) known.add(id)
    return picked
  }
  if (options.cantrips) choices.cantrips = firstSpells(options.cantrips.from, options.cantrips.count)
  const chosenOption = options.featureChoices?.flatMap((entry) => entry.options.filter((option) => option.id === choices.featureChoices?.[entry.feature.id] && option.cantrips))[0]
  if (chosenOption?.cantrips) choices.cantrips = [...(choices.cantrips ?? []), ...firstSpells(chosenOption.cantrips.from, chosenOption.cantrips.count)]
  if (options.spellbook) choices.spellbook = firstSpells(options.spellbook.from, options.spellbook.count)
  if (options.featurePicks) {
    const feats = [background.feat.id ?? "", ...(choices.speciesFeat ? [choices.speciesFeat] : [])]
    choices.featurePicks = Object.fromEntries(options.featurePicks.map((offer) => [offer.feature.id, autoPicks(offer, 1, choices.cantrips ?? [], feats, [...known])]))
  }
  // A Book of Shadows' spells are the hero's already, so they are not prepared again.
  const shadows = Object.values(choices.featurePicks ?? {}).flatMap((picks) => picks.flatMap((entry) => entry.spells ?? []))
  if (options.spells) {
    const from = (choices.spellbook ? options.spells.from.filter((entry) => choices.spellbook?.includes(entry.id)) : options.spells.from).filter((entry) => !shadows.includes(entry.id))
    choices.spells = bySpellOrder(from)
      .slice(0, options.spells.count)
      .map((entry) => entry.id)
    for (const id of choices.spells) known.add(id)
  }

  // An Origin feat's picks: Magic Initiate's spells, Skilled's skills.
  const featPicks = (offer: FeatOffer, list: string | undefined): FeatPicks | undefined => {
    if (offer.skillPicks) return { skills: best(offer.skillPicks.from, offer.skillPicks.count) }
    if (!offer.spellPicks) return undefined
    const spellList = list ?? offer.spellPicks.spellLists[0]
    return {
      ...(list ? {} : { spellList: spellList as FeatPicks["spellList"] }),
      spellAbility: bestOf(offer.spellPicks.spellAbility),
      cantrips: firstSpells(listSpells(spellList, 0, 0).map(spellNamed), offer.spellPicks.cantrips),
      spell: firstSpells(listSpells(spellList, offer.spellPicks.spellLevel, offer.spellPicks.spellLevel).map(spellNamed), 1)[0],
    }
  }
  const backgroundPicks = featPicks(options.backgroundFeat, options.backgroundFeat.spellPicks?.spellLists[0])
  if (backgroundPicks) choices.backgroundFeatPicks = backgroundPicks
  if (options.speciesFeat) {
    const feat = options.speciesFeat.feats.find((each) => each.id === options.speciesFeat?.recommended) ?? options.speciesFeat.feats[0]
    choices.speciesFeat = feat.id
    const picks = featPicks(feat, undefined)
    if (picks) choices.speciesFeatPicks = picks
  }

  // Expertise in the skills the hero is now proficient in and best at.
  if (options.expertise) {
    const proficient = new Set<string>([
      ...background.skills,
      ...granted,
      ...classSkills,
      ...speciesSkills,
      ...(choices.speciesFeatPicks?.skills ?? []),
      ...(choices.backgroundFeatPicks?.skills ?? []),
    ])
    const used = new Set<string>()
    choices.expertise = options.expertise.flatMap((entry) => {
      const picked = [...entry.from]
        .filter((skill) => proficient.has(skill.id) && !used.has(skill.id))
        .sort((a, b) => bonuses[b.id as SkillId].bonus - bonuses[a.id as SkillId].bonus)
        .slice(0, entry.count)
        .map((skill) => skill.id as SkillId)
      for (const id of picked) used.add(id)
      return picked
    })
  }

  // Gear: each pick's first item. Masteries: the weapons carried first.
  const classOffer = options.equipment.class[0]
  const backgroundOffer = options.equipment.background[0]
  const firstPicks = (offer: EquipmentOffer) => Object.fromEntries((offer.picks ?? []).map((line) => [line.id, line.from[0].id]))
  if (classOffer.picks) choices.equipment.classPicks = firstPicks(classOffer)
  if (backgroundOffer.picks) choices.equipment.backgroundPicks = firstPicks(backgroundOffer)
  if (options.weaponMasteries) {
    const carried = [...classOffer.weapons, ...backgroundOffer.weapons].map((weapon) => weapon.id)
    const rank = (id: string) => (carried.includes(id) ? carried.indexOf(id) : carried.length)
    choices.weaponMasteries = [...options.weaponMasteries.from]
      .sort((a, b) => rank(a.id) - rank(b.id))
      .slice(0, options.weaponMasteries.count)
      .map((weapon) => weapon.id)
  }

  // Languages: the species' own where it has one, then the Standard table in order.
  const wanted = [SPECIES_LANGUAGE[pick.species], ...options.languages.standardFrom.map((language) => language.id)].filter((id): id is string => !!id)
  choices.languages = [...new Set(wanted)].slice(0, options.languages.count)
  return choices
}

const LONG_NAMES: Record<AbilityId, keyof HeroRecord["attributes"]> = { str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" }

// The skills a sheet is proficient in, by name, in the SRD's order.
const proficientSkillNames = (sheet: Sheet) => {
  const skills = deriveSheet(sheet).skills
  return skillIds.filter((skill) => skills[skill].proficient).map((skill) => skillById.get(skill)?.name ?? skill)
}

/**
 * A hero's record in the words the game's prompts and screens read, taken off their sheet and gear so the two cannot
 * disagree: the species' and the class's names, the six scores, the skills they are proficient in, and the gear as
 * items, one line for each kind of item (`createSheet` merges repeats). Their spells are on the sheet, so `spells` is
 * empty, as are `specialAbilities`.
 */
export function heroRecord(sheet: Sheet, gear: readonly string[]): HeroRecord {
  const species = speciesById.get(sheet.species)
  const cls = classById.get(sheet.class)
  if (!species || !cls) throw new Error(`The sheet names a class or species the rules lack: ${sheet.class}, ${sheet.species}`)
  return {
    race: species.name,
    archetype: cls.name,
    attributes: Object.fromEntries(abilityIds.map((ability) => [LONG_NAMES[ability], sheet.abilityScores[ability]])) as HeroRecord["attributes"],
    skills: proficientSkillNames(sheet),
    equipment: gear.map((name) => ({ name })),
    spells: [],
    specialAbilities: [],
  }
}

/**
 * What the rules make of a hero, in words, for the prompt that writes their story: the background's name, the two
 * abilities with the highest scores and the one with the lowest (ties go to the SRD's order), the skills they are
 * proficient in, their gear, and every cantrip and spell they can cast, by name.
 */
export function heroRules(sheet: Sheet, gear: readonly string[]): HeroRules {
  const background = backgroundById.get(sheet.background)
  if (!background) throw new Error(`"${sheet.background}" is not a background`)
  const name = (ability: AbilityId) => abilityById.get(ability)?.name ?? ability
  const ranked = [...abilityIds].sort((a, b) => sheet.abilityScores[b] - sheet.abilityScores[a])
  const lowest = [...abilityIds].sort((a, b) => sheet.abilityScores[a] - sheet.abilityScores[b])[0]
  return {
    background: background.name,
    strongest: ranked.slice(0, 2).map(name),
    weakest: name(lowest),
    skills: proficientSkillNames(sheet),
    gear: [...gear],
    spells: spellsOf({ type: "pc", sheet }).map((known) => known.spell.name),
  }
}
