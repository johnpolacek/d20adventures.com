import type { AbilityId, ConditionId } from "@d20/srd"
import { classFeatureById } from "@d20/srd/class-features"
import { isDown, isIncapacitated } from "../utils/turn-actors"
import { parseDice } from "./attack"
import type { CheckResult, Roller } from "./check"
import { auraRules, classEvasion, type SaveRule, saveRules } from "./class-rules"
import { immuneTo } from "./conditions"
import { hasFeature, withFeatureUsed } from "./feature-rules"
import { HEROIC_INSPIRATION, withoutHeroicInspiration } from "./heroic-inspiration"
import { registerSaveAnswers } from "./late-rules"
import { legendaryResistanceWords, type SaveStakes, spendsLegendaryResistance, withLegendaryResistanceSpent } from "./legendary-resistance"
import { withReaction } from "./reactions"
import { sameSide } from "./sides"
import { feetBetween, type Standing } from "./space"
import type { Stake } from "./stakes"

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
  const { stakes } = args
  if (!stakes.conditions?.length && !stakes.damage && !stakes.concentration && !stakes.death) return undefined
  for (const rule of saveRules()) {
    const answered = rule(args)
    if (answered) return answered
  }
  return undefined
}

/**
 * Whether a failed save costs the one who saves something worth a rescue: damage, a condition they are not immune to,
 * the spell they concentrate on, or a step toward death. The rescues of the saver's own (Indomitable, Heroic
 * Inspiration) are spent on these alone. One that answers only some conditions reads them itself (Countercharm).
 */
export const failureCosts = (character: Parameters<typeof immuneTo>[0], stakes: SaveStakes): boolean =>
  !!stakes.damage || !!stakes.concentration || !!stakes.death || (stakes.conditions ?? []).some((id) => !immuneTo(character, id))

/**
 * The one a rescue spent from, as it leaves them: the saver, or where another answered the save (`by`: Countercharm,
 * Boon of Fate) that one. Their Reaction is taken where the rescue takes one (`reaction`), Heroic Inspiration is
 * expended where it was the rescue, and otherwise the use of the feature is spent. Handed anyone else, it changes nothing.
 */
export function withRescueSpent<T extends object>(character: T, rescued: { feature: string; by?: string; reaction?: true }): T {
  const spender = character as T & { id?: string; featureUses?: Record<string, number> }
  if (rescued.by && spender.id !== rescued.by) return character
  if (rescued.reaction) return withReaction(spender as unknown as Parameters<typeof withReaction>[0]) as unknown as T
  if (rescued.feature === HEROIC_INSPIRATION) return withoutHeroicInspiration(spender)
  return withFeatureUsed(spender, rescued.feature)
}

/**
 * What a save the read asks for puts at stake on the one who makes it, as a rescue judges it: the conditions a failure
 * gives them, and the damage it deals them, at the dice's average. None where a failure costs them nothing.
 */
export function saveStakesOf(stakes: readonly Stake[] | undefined, saverId: string): SaveStakes | undefined {
  const theirs = (stakes ?? []).filter((stake) => stake.on === "failure" && stake.target === saverId)
  const conditions = theirs.flatMap((stake) => (stake.kind === "condition" && !stake.ends ? [stake.condition] : []))
  const damage = theirs.reduce((sum, stake) => {
    if (stake.kind !== "damage") return sum
    const { count, sides, bonus } = parseDice(stake.dice)
    return sum + Math.floor((count * (sides + 1)) / 2) + bonus
  }, 0)
  if (!conditions.length && damage <= 0) return undefined
  return { ...(conditions.length ? { conditions } : {}), ...(damage > 0 ? { damage } : {}) }
}

/**
 * A die of any size thrown with a d20, for a save rolled where only a d20 is handed on (Relentless Rage's): a throw above
 * the largest whole number of the die's faces is thrown again, so each face is as likely as the next.
 */
export const dieByD20 =
  (d20: () => number) =>
  (sides: number): number => {
    if (sides >= 20) return d20()
    const top = 20 - (20 % sides)
    for (;;) {
      const thrown = d20()
      if (thrown <= top) return ((thrown - 1) % sides) + 1
    }
  }

/** A saving throw as a plain check result, for a rider or a feature that keeps it: the dice, the bonus, the total and what was added. */
export const saveCheck = (save: CheckResult): CheckResult => ({
  dice: save.dice,
  natural: save.natural,
  bonus: save.bonus,
  total: save.total,
  dc: save.dc,
  success: save.success,
  mode: save.mode,
  ...(save.adds?.length ? { adds: save.adds } : {}),
})

/** A failed save that a rescue answered: the feature, its name, the total that failed, and who answered it if another did. */
export type Rescued = { feature: string; name: string; first: number; by?: string; reaction?: true }

/** A saving throw as the rules leave it once its dice have fallen: chosen to succeed by Legendary Resistance (`legendary`), or rescued. */
export type AnsweredSave = { result: CheckResult; legendary?: true; rescued?: Rescued }

/**
 * What the rules may still do for a saving throw once its dice have fallen, the one place every save the engine rolls
 * or a player throws is answered: a Legendary creature that fails may choose to succeed, judged on `stakes`, and
 * otherwise a feature may rescue it (`rescuedSave`), though not a save a condition fails outright (`failedBy`). Nothing
 * for a save that passed, or one with nothing at stake. The caller spends what answered it (`withSaveAnswered`).
 */
export function answeredSave(args: Omit<Parameters<SaveRule>[0], "stakes"> & { stakes?: SaveStakes; failedBy?: boolean }): AnsweredSave {
  const { result, stakes } = args
  if (result.success || !stakes) return { result }
  if (spendsLegendaryResistance(args.character, stakes)) return { result: { ...result, success: true }, legendary: true }
  if (args.failedBy) return { result }
  const rescue = rescuedSave({ ...args, stakes })
  if (!rescue) return { result }
  const rescued: Rescued = { feature: rescue.feature, name: rescue.name, first: result.total, ...(rescue.by ? { by: rescue.by } : {}), ...(rescue.reaction ? { reaction: true as const } : {}) }
  return { result: rescue.result, rescued }
}

/**
 * Everyone once what answered a save is spent, with it in the story's words: the saver's use of Legendary Resistance,
 * or the rescue of the saver or of the one who answered it (`withRescueSpent`). `name` is the saver's.
 */
export function withSaveAnswered<T extends { id?: string }>(
  characters: readonly T[],
  saverId: string,
  answer: { legendary?: true; rescued?: Rescued },
  save: { total: number; dc: number; success: boolean },
  name: string
): { characters: T[]; facts: string[] } {
  const facts: string[] = []
  let after = [...characters]
  if (answer.legendary) {
    after = after.map((character) => (character.id === saverId ? (withLegendaryResistanceSpent(character as T & { type: string }) as T) : character))
    const saver = after.find((character) => character.id === saverId)
    if (saver) facts.push(legendaryResistanceWords(name, saver as T & { type: string }))
  }
  const rescued = answer.rescued
  if (rescued) {
    after = after.map((character) => (character.id === (rescued.by ?? saverId) ? withRescueSpent(character, rescued) : character))
    facts.push(rescueWords(name, rescued, save))
  }
  return { characters: after, facts }
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

// A Concentration save is rolled low in the load order (./spell-effects `settleConcentration`), so it reads the aura and
// the answer to a failure through ./late-rules.
registerSaveAnswers({
  aura: (character, present) => auraSaveBonus(character as AuraHolder, present as AuraHolder[]).amount,
  answer: (args) => {
    const saver = args.characters.find((character) => (character as { id?: string }).id === args.saverId) as Parameters<SaveRule>[0]["character"] | undefined
    if (!saver) return { characters: [...args.characters], result: args.result, facts: [] }
    const answer = answeredSave({ character: saver, ability: "con", result: args.result, stakes: args.stakes, d20: args.d20, present: args.characters as Parameters<SaveRule>[0]["present"] })
    const answered = withSaveAnswered(args.characters as { id?: string }[], args.saverId, answer, answer.result, args.name)
    return { characters: answered.characters, result: { ...args.result, ...answer.result }, facts: answered.facts }
  },
})
