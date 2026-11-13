import type { AbilityId, ConditionId } from "@d20/srd"
import { classFeatureById } from "@d20/srd/class-features"
import { isDown, isIncapacitated } from "../utils/turn-actors"
import type { Roller } from "./check"
import { auraRules, classEvasion, type SaveRule, saveRules } from "./class-rules"
import { hasFeature, withFeatureUsed } from "./feature-rules"
import { withReaction } from "./reactions"
import { sameSide } from "./sides"
import { feetBetween, type Standing } from "./space"

/**
 * The shared rules of saving throws that many class features lean on, each read where every such save is settled. A
 * class file claims one by having the feature (./class-rules): Evasion by `evasion`, a rescue of a failed save by
 * `saves` (Indomitable), an aura by `auras` (Aura of Protection).
 */

/** Who an aura may reach or come from: a character, where they stand, and whether they are up. */
export type AuraHolder = Standing & { id: string; hitPoints?: number; healthPercent?: number; dead?: true; fled?: true }

/**
 * The damage one who saves takes from an effect that deals `full` damage on a failure, after their defenses: all of it
 * on a failure, and on a success half where the effect allows it (`half`), else none. Evasion, on a Dexterity save for
 * half by one who has it and is not Incapacitated, makes a success take none and a failure half. `evaded` names it
 * where it changed the damage.
 */
export function damageOnSave(character: Roller, save: { ability: AbilityId; success: boolean; half: boolean }, full: number): { amount: number; evaded?: "Evasion" } {
  const halved = Math.floor(full / 2)
  if (save.half && save.ability === "dex" && classEvasion(character) && !isIncapacitated(character)) return { amount: save.success ? 0 : halved, evaded: "Evasion" }
  return { amount: save.success ? (save.half ? halved : 0) : full }
}

/**
 * What the classes may still do for a failed saving throw against harm: the saver's own feature (Indomitable), or one
 * of another present who answers it (Countercharm, whose `by` is that one). The first rule that answers, with the save
 * as it then stands and the feature whose use it spends. None for a save that cost nothing. Each rule checks the
 * feature it needs, so one with no sheet may still be answered by another's.
 */
export function rescuedSave(args: Parameters<SaveRule>[0]): ReturnType<SaveRule> {
  if (args.result.success) return undefined
  if (!args.stakes.conditions?.length && !args.stakes.damage) return undefined
  for (const rule of saveRules()) {
    const answered = rule(args)
    if (answered) return answered
  }
  return undefined
}

/**
 * The one a rescue spent from, as it leaves them: the saver with the use of their feature spent, or where another
 * answered the save (`by`, Countercharm) that one with their Reaction taken. Handed anyone else, it changes nothing.
 */
export function withRescueSpent<T extends object>(character: T, rescued: { feature: string; by?: string }): T {
  if (!rescued.by) return withFeatureUsed(character as T & { featureUses?: Record<string, number> }, rescued.feature)
  const reactor = character as T & { id?: string }
  return reactor.id === rescued.by ? (withReaction(reactor as unknown as Parameters<typeof withReaction>[0]) as unknown as T) : character
}

/**
 * A rescued save in the story's words: "Branka fails the saving throw (9 against DC 15) and calls on Indomitable: 19,
 * a success." The words fit a reroll (Indomitable) and a die turned to a 20 (Stroke of Luck).
 */
export const rescueWords = (name: string, rescued: { name: string; first: number }, save: { total: number; dc: number; success: boolean }): string =>
  `${name} fails the saving throw (${rescued.first} against DC ${save.dc}) and calls on ${rescued.name}: ${save.total}, ${save.success ? "a success" : "still a failure"}.`

/**
 * How far an aura reaches from its bearer in feet: its feature's Emanation, at the size the bearer's level has reached
 * (Aura of Protection's 10 feet, and 30 from level 18). None for a feature with no area.
 */
export function auraReach(bearer: Roller, feature: string): number | undefined {
  const entry = classFeatureById.get(feature)
  const size = entry?.area?.size
  if (size === undefined) return undefined
  const level = bearer.sheet?.level ?? 0
  return (entry?.areaSizeByLevel ?? []).filter((step) => step.level <= level).at(-1)?.size ?? size
}

/**
 * Whether an aura of `bearer`'s reaches `character`: the bearer has the feature, is up and not Incapacitated, and is
 * the one reached or of their side within the aura's reach. One with no place on the floor is reached by their own
 * aura alone.
 */
export function auraReaches(bearer: AuraHolder, feature: string, character: AuraHolder): boolean {
  if (!hasFeature(bearer, feature) || isDown(bearer) || bearer.fled || isIncapacitated(bearer)) return false
  if (bearer.id === character.id) return true
  const reach = auraReach(bearer, feature)
  const apart = feetBetween(bearer, character)
  return reach !== undefined && apart !== undefined && sameSide(bearer, character) && apart <= reach
}

/** What the auras of those present add to one of `character`'s own checks: their bonus on a saving throw, and nothing on any other check. */
export const auraOnSave = (character: object, check: { kind: string }, present: readonly object[]): number =>
  check.kind === "save" ? auraSaveBonus(character as AuraHolder, present as AuraHolder[]).amount : 0

/**
 * The conditions the auras of those present make `character` immune to while they are in them (Aura of Courage's
 * Frightened): one already given has no effect there (./conditions).
 */
export function auraConditionImmunities(character: AuraHolder, present: readonly AuraHolder[]): ConditionId[] {
  const bearers = present.some((other) => other.id === character.id) ? present : [character, ...present]
  const found = new Set<ConditionId>()
  for (const rule of auraRules()) {
    if (!rule.conditionImmunities) continue
    for (const bearer of bearers) if (auraReaches(bearer, rule.feature, character)) for (const id of rule.conditionImmunities(bearer)) found.add(id)
  }
  return [...found]
}

/**
 * What the auras of those present add to `character`'s saving throws, with the names they come from. Each aura gives
 * its best to one it reaches, however many bearers it has: a creature "can benefit from only one Aura of Protection at
 * a time".
 */
export function auraSaveBonus(character: AuraHolder, present: readonly AuraHolder[]): { amount: number; from: string[] } {
  const from: string[] = []
  let amount = 0
  const bearers = present.some((other) => other.id === character.id) ? present : [character, ...present]
  for (const rule of auraRules()) {
    if (!rule.saveBonus) continue
    const best = Math.max(0, ...bearers.filter((bearer) => auraReaches(bearer, rule.feature, character)).map((bearer) => rule.saveBonus?.(bearer) ?? 0))
    if (!best) continue
    amount += best
    from.push(classFeatureById.get(rule.feature)?.name ?? rule.feature)
  }
  return { amount, from }
}
