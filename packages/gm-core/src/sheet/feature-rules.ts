import { classFeatureById } from "@d20/srd/class-features"
import { classById } from "@d20/srd/classes"
import type { ClassFeature } from "@d20/srd/schema/classes"
import { deriveSheet } from "./derive"
import type { Sheet } from "./sheet"
import type { TurnEffect } from "./turn-effect"

/**
 * The class features of levels 2 to 5 that change the numbers of play, read from the SRD data, as pure functions:
 * how many uses a feature has and how many are left, how many attacks an Attack action makes, the d20 a Critical Hit
 * starts at, and the features a hero may use only once a turn.
 */

type Holder = { sheet?: Sheet; featureUses?: Record<string, number> }

/** Whether a hero has a class or subclass feature at their level, by its SRD id. An NPC with a stat block has none. */
export const hasFeature = (character: { sheet?: Sheet }, id: string): boolean => !!character.sheet && deriveSheet(character.sheet).classFeatures.includes(id)

/** Whether a hero has a feat, by its SRD id: one their background gives or one they took. An NPC with a stat block has none. */
export const hasFeat = (character: { sheet?: Sheet }, id: string): boolean => !!character.sheet && deriveSheet(character.sheet).feats.includes(id)

/** The option a hero keeps for a feature: Hunter's Prey's "colossus-slayer". */
export const featureChoice = (character: { sheet?: Sheet }, id: string): string | undefined => (hasFeature(character, id) ? character.sheet?.featureChoices?.[id] : undefined)

type Count = number | "proficiency-bonus" | { ability: "str" | "dex" | "con" | "int" | "wis" | "cha"; minimum?: number } | { column: string } | { byLevel: { level: number; count: number }[] }

/**
 * How many uses a feature has at a hero's level, by its data: a number, the Proficiency Bonus, an ability modifier with
 * its minimum, a column of the class table, or a count by level. Action Surge is 1 at level 2, Channel Divinity 2, and
 * Bardic Inspiration the Charisma modifier. A pool's points count as uses: Lay on Hands has 25 at level 5. 0 for a
 * feature the hero lacks or one with no uses.
 */
export function featureUseCount(sheet: Sheet, id: string): number {
  const feature = classFeatureById.get(id)
  const derived = deriveSheet(sheet)
  if (!feature || !derived.classFeatures.includes(id)) return 0
  // A pool counts points, not uses: Lay on Hands holds five times the Paladin level, which is the hero's level.
  if (feature.pool) return feature.pool.perLevel * sheet.level
  if (!feature.uses) return 0
  const count = feature.uses.count as Count
  if (typeof count === "number") return count
  if (count === "proficiency-bonus") return derived.proficiencyBonus
  if ("ability" in count) return Math.max(count.minimum ?? 0, derived.abilityModifiers[count.ability])
  if ("column" in count) return Number((classById.get(sheet.class)?.levels[sheet.level - 1] as Record<string, unknown> | undefined)?.[count.column] ?? 0)
  return count.byLevel.filter((step) => step.level <= sheet.level).at(-1)?.count ?? 0
}

/** How many uses of a feature a hero has left. */
export const usesLeft = (character: Holder, id: string): number => (character.sheet ? Math.max(0, featureUseCount(character.sheet, id) - (character.featureUses?.[id] ?? 0)) : 0)

/** A hero with one more use of a feature spent. */
export const withFeatureUsed = <T extends Holder>(character: T, id: string): T => ({ ...character, featureUses: { ...character.featureUses, [id]: (character.featureUses?.[id] ?? 0) + 1 } })

/**
 * How many attacks a hero makes when they take the Attack action: 2 with Extra Attack from level 5 (Fighter, Ranger),
 * and 1 for anyone else.
 */
export function attacksPerAction(character: { sheet?: Sheet }): number {
  if (!character.sheet) return 1
  const features = deriveSheet(character.sheet).classFeatures.map((id) => classFeatureById.get(id))
  return Math.max(1, ...features.map((feature) => (feature as (ClassFeature & { attacks?: number }) | undefined)?.attacks ?? 1))
}

/**
 * The lowest d20 that scores a Critical Hit with an attack: 20, or 19 for a Champion's Improved Critical with a weapon
 * or an Unarmed Strike, which every attack of a hero is.
 */
export function criticalFrom(character: { sheet?: Sheet }): number {
  if (!character.sheet) return 20
  const features = deriveSheet(character.sheet).classFeatures.map((id) => classFeatureById.get(id))
  return Math.min(20, ...features.flatMap((feature) => (feature?.criticalHit?.minRoll !== undefined && feature.attacksWith?.length ? [feature.criticalHit.minRoll] : [])))
}

/** A feature or feat a hero uses at most once a turn, by the turn effect that marks it used: "savage-attacker", or a class's own mark (./class-rules). */
export type OncePerTurn = string

/** Whether a hero has used a once-a-turn feature on this turn, `turnOf` being whose turn it is. */
export const usedThisTurn = (character: { turnEffects?: readonly TurnEffect[] }, id: OncePerTurn, turnOf: string | undefined): boolean =>
  !!character.turnEffects?.some((effect) => effect.id === id && effect.by === (turnOf ?? effect.by))

/** A hero with a once-a-turn feature marked used on `turnOf`'s turn. The mark ends as the next round begins. */
export function withUsedThisTurn<T extends { id?: string; turnEffects?: readonly TurnEffect[] }>(character: T, id: OncePerTurn, turnOf: string | undefined): T {
  const by = turnOf ?? character.id ?? ""
  return { ...character, turnEffects: [...(character.turnEffects ?? []).filter((effect) => effect.id !== id), { id, by, turns: 1 }] }
}
