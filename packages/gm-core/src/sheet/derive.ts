import { type AbilityId, abilityIds, type DamageTypeId, type SkillId, skillIds } from "@d20/srd"
import { backgroundById } from "@d20/srd/backgrounds"
import { classFeatureById } from "@d20/srd/class-features"
import { classById } from "@d20/srd/classes"
import { equipmentById } from "@d20/srd/equipment"
import { featById } from "@d20/srd/feats"
import type { Class, ClassFeature } from "@d20/srd/schema/classes"
import type { Armor } from "@d20/srd/schema/equipment"
import type { Background, Feat, Species } from "@d20/srd/schema/origins"
import { skillById } from "@d20/srd/skills"
import { speciesById } from "@d20/srd/species"
import type { Sheet } from "./sheet"

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
  /** Class feature ids the character has at its level, in class table order. */
  classFeatures: string[]
}

type Parts = { class: Class; species: Species; background: Background; armor?: Armor; features: ClassFeature[]; feats: Feat[] }

const modifier = (score: number) => Math.floor((score - 10) / 2)

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
  if (!cls || !species || !background) return { problems }

  const features: ClassFeature[] = []
  for (const row of cls.levels) {
    if (row.level > sheet.level) break
    for (const id of row.features ?? []) {
      const feature = classFeatureById.get(id)
      if (feature) features.push(feature)
    }
  }

  const featIds = [background.feat.id, ...(sheet.feats ?? [])].filter((id): id is string => typeof id === "string")
  for (const feature of features) {
    const chosen = sheet.featureChoices?.[feature.id]
    if (feature.feat && chosen) featIds.push(chosen)
  }
  const feats: Feat[] = []
  for (const id of featIds) {
    const feat = featById.get(id)
    if (feat) feats.push(feat)
    else problems.push(`"${id}" is not a feat`)
  }
  return { parts: { class: cls, species, background, armor, features, feats }, problems }
}

/** The options a sheet has taken, from species traits and class features, as plain records of their mechanics. */
function chosenOptions(sheet: Sheet, parts: Parts) {
  const species = parts.species.traits.flatMap((trait) => {
    if (!trait.choice) return []
    const taken = sheet.speciesChoices?.[trait.choice.id]
    return trait.choice.options.filter((option) => option.id === taken)
  })
  const features = parts.features.flatMap((feature) => (feature.options ?? []).filter((option) => option.id === sheet.featureChoices?.[feature.id]))
  return { species, features }
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
  return total
}

function sensesOf(sheet: Sheet, parts: Parts): Sense[] {
  const best = new Map<Sense["type"], number>()
  const take = (senses: readonly Sense[] | undefined) => {
    for (const sense of senses ?? []) best.set(sense.type, Math.max(best.get(sense.type) ?? 0, sense.range))
  }
  for (const trait of parts.species.traits) if ((trait.level ?? 1) <= sheet.level) take(trait.senses)
  for (const option of chosenOptions(sheet, parts).species) take(option.senses)
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
  return [...found].sort()
}

/** Faults in a sheet's choices: an id the SRD data lacks, a skill outside the class's list, armor the class is not trained in. */
export function sheetProblems(sheet: Sheet): string[] {
  const { parts, problems } = lookup(sheet)
  if (!parts) return problems
  const { class: cls, background } = parts

  const wanted = cls.skills.count
  if (sheet.classSkills.length !== wanted) problems.push(`${cls.name} chooses ${wanted} skills, and the sheet has ${sheet.classSkills.length}`)
  if (new Set(sheet.classSkills).size !== sheet.classSkills.length) problems.push("a class skill is listed twice")
  for (const skill of sheet.classSkills) {
    if (cls.skills.from && !cls.skills.from.includes(skill)) problems.push(`${skill} is not on the ${cls.name} skill list`)
    if (background.skills.includes(skill)) problems.push(`${skill} already comes from the ${background.name} background`)
  }

  const proficient = new Set<SkillId>([...background.skills, ...sheet.classSkills, ...(sheet.otherSkills ?? [])])
  for (const skill of sheet.expertise ?? []) if (!proficient.has(skill)) problems.push(`Expertise in ${skill} needs proficiency in it`)
  const expertiseAllowed = parts.features.reduce((sum, feature) => sum + (feature.expertise ? feature.expertise.count * feature.levels.filter((level) => level <= sheet.level).length : 0), 0)
  if ((sheet.expertise?.length ?? 0) > expertiseAllowed) problems.push(`the sheet has Expertise in ${sheet.expertise?.length} skills, and its class features allow ${expertiseAllowed}`)

  const training = armorTrainingOf(sheet, parts)
  if (parts.armor && !training.some((kind) => kind === parts.armor?.category)) problems.push(`${cls.name} has no training with ${parts.armor.category} armor`)
  if (sheet.shield && !training.includes("shields")) problems.push(`${cls.name} has no training with Shields`)

  for (const trait of parts.species.traits) {
    if (!trait.choice) continue
    const taken = sheet.speciesChoices?.[trait.choice.id]
    if (taken && !trait.choice.options.some((option) => option.id === taken)) problems.push(`"${taken}" is not an option of ${trait.name}`)
  }
  for (const [featureId, chosen] of Object.entries(sheet.featureChoices ?? {})) {
    const feature = parts.features.find((entry) => entry.id === featureId)
    if (!feature) {
      problems.push(`"${featureId}" is not a ${cls.name} feature at level ${sheet.level}`)
      continue
    }
    if (feature.options && !feature.options.some((option) => option.id === chosen)) problems.push(`"${chosen}" is not an option of ${feature.name}`)
    if (feature.feat) {
      const feat = featById.get(chosen)
      if (feat && "category" in feature.feat && feat.category !== feature.feat.category) problems.push(`${feat.name} is not a ${feature.feat.category} feat, which ${feature.name} needs`)
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

  const savingThrows = Object.fromEntries(
    abilityIds.map((ability) => {
      const proficient = parts.class.savingThrows.includes(ability)
      return [ability, { bonus: abilityModifiers[ability] + (proficient ? proficiencyBonus : 0), proficient }]
    })
  ) as DerivedSheet["savingThrows"]

  const proficientSkills = new Set<SkillId>([...parts.background.skills, ...sheet.classSkills, ...(sheet.otherSkills ?? [])])
  const expertSkills = new Set<SkillId>(sheet.expertise ?? [])
  const skills = Object.fromEntries(
    skillIds.map((skill) => {
      const ability = skillById.get(skill)?.ability as AbilityId
      const proficient = proficientSkills.has(skill)
      const expertise = proficient && expertSkills.has(skill)
      return [skill, { bonus: abilityModifiers[ability] + (proficient ? proficiencyBonus : 0) + (expertise ? proficiencyBonus : 0), proficient, expertise }]
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
    speed: baseSpeed - (tooHeavy ? 10 : 0),
    senses: sensesOf(sheet, parts),
    resistances: resistancesOf(sheet, parts),
    armorTraining: armorTrainingOf(sheet, parts),
    weaponProficiencies: [...parts.class.weapons, ...options.flatMap((option) => option.weaponProficiencies ?? [])],
    stealthDisadvantage: parts.armor?.stealthDisadvantage === true,
    feats: parts.feats.map((feat) => feat.id),
    classFeatures: parts.features.map((feature) => feature.id),
  }
}
