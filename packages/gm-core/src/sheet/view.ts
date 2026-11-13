import { type AbilityId, abilityIds, type SkillId, skillIds } from "@d20/srd"
import { abilityById } from "@d20/srd/abilities"
import { backgroundById } from "@d20/srd/backgrounds"
import { classFeatureById } from "@d20/srd/class-features"
import { classById } from "@d20/srd/classes"
import { featById } from "@d20/srd/feats"
import type { ClassFeature } from "@d20/srd/schema/classes"
import { skillById } from "@d20/srd/skills"
import { spellById } from "@d20/srd/spells"
import { subclassById } from "@d20/srd/subclasses"
import type { Shape } from "../types/character"
import { deriveSheet, grantsFeatByLevel, keptChoiceOf, keptOptions, pickOptions } from "./derive"
import { featureUseCount } from "./feature-rules"
import type { HitPoints } from "./hit-points"
import { speciesById } from "./house-species"
import { type ItemView, itemViews } from "./items"
import { reactionsOf } from "./reactions"
import { shapeOf } from "./shape"
import type { Sheet } from "./sheet"
import { speciesUseKey } from "./species-traits"
import { slotsLeft, spellcastingOf, spellsOf } from "./spells"
import { combatStatsOf } from "./stat-block"
import type { ReactionId, SpellEffect } from "./turn-effect"

/**
 * A feature as the sheet lists it. `uses` is how many times it can be used, how many are left, and the rest that
 * restores them. For a pool (Lay on Hands) they are points, and `points` is set.
 */
export type SheetFeature = { name: string; from: string; uses?: { count: number; left: number; recharge: string; points?: true } }

/**
 * A caster's spellcasting as the sheet shows it: the spell save DC, the spell attack bonus, the spell slots of each
 * level the class gives with how many are left, and the spells by name: cantrips, prepared spells, and a Wizard's
 * Ritual spells of the spellbook that are not prepared.
 */
export type SheetSpellcasting = {
  saveDc: number
  attackBonus: number
  slots: { level: number; total: number; left: number }[]
  cantrips: string[]
  prepared: string[]
  rituals: string[]
}

/** A sheet ready to show: every name spelled out and every number worked out. It holds plain values only. */
export type SheetView = {
  className: string
  /** Left out before the level the class chooses one. */
  subclassName?: string
  level: number
  speciesName: string
  backgroundName: string
  proficiencyBonus: number
  hitPoints: HitPoints
  /** The sides of the class's Hit Point Die. A hero has one for each level. */
  hitDie: number
  armorClass: number
  armorClassFrom: string
  initiative: number
  speed: number
  passivePerception: number
  abilities: { id: AbilityId; name: string; score: number; modifier: number; save: number; saveProficient: boolean }[]
  skills: { id: SkillId; name: string; ability: AbilityId; bonus: number; proficient: boolean; expertise: boolean }[]
  senses: { name: string; range: number }[]
  resistances: string[]
  features: SheetFeature[]
  /** The reactions the hero can take, by id: "opportunity-attack", "shield", "uncanny-dodge", "cutting-words". */
  reactions: ReactionId[]
  // Left out for a class with no Spellcasting.
  spellcasting?: SheetSpellcasting
  /** The magic items the hero owns, in the order owned. */
  items: ItemView[]
  /** The Beast form the hero is in, by name: "Wolf". Left out in their own shape. Armor Class and Speed are then the form's. */
  form?: string
}

const RECHARGE: Record<string, string> = {
  "short-rest": "Short Rest",
  "short-or-long-rest": "Short or Long Rest",
  "long-rest": "Long Rest",
  dawn: "Dawn",
  "start-of-next-turn": "Turn",
  "initiative-or-short-or-long-rest": "Initiative or Rest",
}
const titled = (id: string) => id.replace(/(^|-)([a-z])/g, (_, dash: string, letter: string) => (dash ? " " : "") + letter.toUpperCase())

type Count = number | "proficiency-bonus" | { ability: AbilityId; minimum: 1 } | { column: string } | { byLevel: { level: number; count: number }[] }

/**
 * The sheet as a screen shows it, at the character's stored hit points (its maximum when none are given) and with the
 * spell slots they have used, by spell level (none when none are given). Throws when the class, species or background
 * is unknown, as `deriveSheet` does.
 */
export function sheetView(sheet: Sheet, hitPoints?: number, spellSlots?: readonly number[], spellEffects?: readonly SpellEffect[], featureUses?: Record<string, number>, shape?: Shape): SheetView {
  const derived = deriveSheet(sheet)
  // A Beast's shape the hero holds (Wild Shape): its Armor Class and Speed are theirs while it lasts (./shape).
  const form = shapeOf({ sheet, shape, hitPoints })
  const stats = combatStatsOf({ sheet, spellEffects, shape: form ? shape : undefined }) ?? { hitPointMaximum: derived.hitPointMaximum, armorClass: derived.armorClass, from: derived.armorClassFrom }
  const cls = classById.get(sheet.class)
  const species = speciesById.get(sheet.species)
  const background = backgroundById.get(sheet.background)
  if (!cls || !species || !background) throw new Error("The sheet names a class, species or background the SRD data lacks")
  const row = cls.levels[sheet.level - 1] as unknown as Record<string, unknown>

  const countOf = (count: Count): number | undefined => {
    if (typeof count === "number") return count
    if (count === "proficiency-bonus") return derived.proficiencyBonus
    if ("ability" in count) return Math.max(count.minimum, derived.abilityModifiers[count.ability])
    if ("column" in count) return typeof row[count.column] === "number" ? (row[count.column] as number) : undefined
    return count.byLevel.filter((step) => step.level <= sheet.level).at(-1)?.count
  }
  // `used` is how many of them the hero has spent, by the feature's id.
  const usesOf = (uses: { count: Count; recharge: string; rechargeByLevel?: { level: number; recharge: string }[] } | undefined, used = 0) => {
    if (!uses) return undefined
    const count = countOf(uses.count)
    const recharge = uses.rechargeByLevel?.filter((step) => step.level <= sheet.level).at(-1)?.recharge ?? uses.recharge
    return count === undefined ? undefined : { count, left: Math.max(0, count - used), recharge: RECHARGE[recharge] ?? titled(recharge) }
  }

  const subclass = sheet.subclass ? subclassById.get(sheet.subclass) : undefined
  // What an Ability Score Improvement gave at each level: the scores it raised, or the feat taken in its place.
  const advanced = (feature: ClassFeature) =>
    (sheet.advancements ?? [])
      .filter((entry) => entry.feat && feature.levels.includes(entry.level) && entry.level <= sheet.level)
      .map((entry) => {
        const raises = Object.entries(entry.abilities ?? {}).map(([ability, amount]) => `${abilityById.get(ability)?.name ?? ability} +${amount}`)
        return entry.feat === "ability-score-improvement" && raises.length ? raises.join(", ") : [featById.get(entry.feat ?? "")?.name ?? entry.feat, ...raises].join(", ")
      })
      .join("; ")
  // The options picked for a feature that takes several, by name, with the cantrip or feat each works with.
  const picked = (feature: ClassFeature) =>
    (sheet.featurePicks?.[feature.id] ?? [])
      .map((pick) => {
        const name = pickOptions(feature, sheet.level).find((option) => option.id === pick.option)?.name ?? pick.option
        const with_ = pick.cantrip ? spellById.get(pick.cantrip)?.name : pick.feat ? featById.get(pick.feat)?.name : undefined
        return with_ ? `${name} (${with_})` : name
      })
      .join(", ")
  const features: SheetFeature[] = []
  for (const id of derived.classFeatures) {
    const feature = classFeatureById.get(id)
    if (!feature) continue
    // A later feature that strengthens an earlier one's option (Improved Blessed Strikes) shows the option it keeps.
    const chosen = keptChoiceOf(sheet, id)
    const optionName = (taken: string) => keptOptions(feature).find((option) => option.id === taken)?.name ?? featById.get(taken)?.name
    const choice = grantsFeatByLevel(feature) ? advanced(feature) : sheet.featurePicks?.[id] ? picked(feature) : chosen ? optionName(chosen) : undefined
    const from = feature.subclass && subclass ? subclass.name : cls.name
    const pool = feature.pool && featureUseCount(sheet, id)
    const uses = pool
      ? { count: pool, left: Math.max(0, pool - (featureUses?.[id] ?? 0)), recharge: RECHARGE[feature.pool?.recharge ?? ""] ?? titled(feature.pool?.recharge ?? ""), points: true as const }
      : usesOf(feature.uses as Parameters<typeof usesOf>[0], featureUses?.[id])
    features.push({ name: choice ? `${feature.name}: ${choice}` : feature.name, from, uses })
  }
  for (const trait of species.traits) {
    if ((trait.level ?? 1) > sheet.level) continue
    const taken = trait.choice ? sheet.speciesChoices?.[trait.choice.id] : undefined
    const choice = trait.choice?.options.find((option) => option.id === taken)?.name
    features.push({ name: choice ? `${trait.name}: ${choice}` : trait.name, from: species.name, uses: usesOf(trait.uses as Parameters<typeof usesOf>[0], featureUses?.[speciesUseKey(trait.name)]) })
  }
  derived.feats.forEach((id, index) => {
    const feat = featById.get(id)
    // A feat a class feature grants is already listed with that feature.
    if (feat && feat.category === "origin") features.push({ name: feat.name, from: index === 0 ? background.name : "Feat" })
  })

  const caster = { type: "pc", sheet, spellSlots }
  const casting = spellcastingOf(caster)
  const left = slotsLeft(caster)
  const known = spellsOf(caster)
  const names = (keep: (entry: (typeof known)[number]) => boolean) => known.filter(keep).map((entry) => entry.spell.name)
  const spellcasting: SheetSpellcasting | undefined = casting && {
    saveDc: casting.saveDc,
    attackBonus: casting.attackBonus,
    slots: casting.slots.flatMap((total, index) => (total > 0 ? [{ level: index + 1, total, left: left[index] ?? total }] : [])),
    cantrips: names((entry) => entry.cantrip),
    prepared: names((entry) => !entry.cantrip && entry.prepared),
    rituals: names((entry) => !entry.prepared && !entry.given),
  }

  return {
    className: cls.name,
    ...(subclass ? { subclassName: subclass.name } : {}),
    level: sheet.level,
    speciesName: species.name,
    backgroundName: background.name,
    proficiencyBonus: derived.proficiencyBonus,
    hitDie: derived.hitDie,
    // With the spells that last on the hero: Aid's higher maximum, Shield of Faith's 2, or Mage Armor's 13 and Dexterity.
    hitPoints: { current: Math.min(stats.hitPointMaximum, Math.max(0, hitPoints ?? stats.hitPointMaximum)), maximum: stats.hitPointMaximum },
    armorClass: stats.armorClass,
    armorClassFrom: form ? stats.from : derived.armorClassFrom,
    initiative: derived.initiative,
    speed: form ? form.speed.walk : derived.speed,
    passivePerception: derived.passivePerception,
    abilities: abilityIds.map((id) => ({
      id,
      name: abilityById.get(id)?.name ?? titled(id),
      // With a worn item's set score: Gauntlets of Ogre Power's Strength 19.
      score: derived.abilityScores[id],
      modifier: derived.abilityModifiers[id],
      save: derived.savingThrows[id].bonus,
      saveProficient: derived.savingThrows[id].proficient,
    })),
    skills: skillIds.map((id) => ({ id, name: skillById.get(id)?.name ?? titled(id), ability: skillById.get(id)?.ability as AbilityId, ...derived.skills[id] })),
    senses: derived.senses.map((sense) => ({ name: titled(sense.type), range: sense.range })),
    resistances: derived.resistances.map(titled),
    features,
    reactions: reactionsOf({ id: "", type: "pc", sheet }),
    items: itemViews(sheet),
    ...(spellcasting ? { spellcasting } : {}),
    ...(form ? { form: form.name } : {}),
  }
}
