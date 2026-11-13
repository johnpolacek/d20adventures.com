import type { DamageTypeId } from "@d20/srd"
import { spells } from "@d20/srd/spells"
import { isDead, isDown, isDying, isIncapacitated } from "../utils/turn-actors"
import { DEATH_SAVE, type RollRequirement } from "../validations/roll-requirement-schema"
import { turnEffectsAtRoundStart } from "./actions"
import { type CheckResult, type RollMode, resolveCheck } from "./check"
import { classDeathSave, withDamageEndings } from "./class-rules"
import type { ConditionEntry } from "./condition-entry"
import { conditionsAtRoundStart, d20Penalty, withCondition } from "./conditions"
import { hitPointsOf, withHitPoints } from "./hit-points"
import { isRegenerationStopped, regenerationOf, regenerationStopped, stopsRegeneration } from "./monster-traits"
import { type AnsweredSave, answeredSave, auraOnSave } from "./save-rules"
import type { Sheet } from "./sheet"
import { enduringTraitLeft, enduringTraitOf } from "./species-traits"
import { saveModesFromSpells, spellEffectsAtRoundStart, withDeathWardSpent } from "./spell-effects"
import { heldRule } from "./spell-rules"
import type { SpellEffect, TurnEffect } from "./turn-effect"

/** A hero's Death Saving Throws while at 0 hit points: three successes make them Stable, three failures kill. */
export type DeathSaves = { successes: number; failures: number; stable?: true }

/** The adventure's rule that bears on death: with `playerDeath: false` a hero never dies, and is left Stable instead. */
export type DeathRules = { playerDeath?: boolean }

type Mortal = {
  id?: string
  name?: string
  type: string
  sheet?: Sheet
  statBlock?: string
  hitPoints?: number
  healthPercent?: number
  dead?: true
  fled?: true
  conditions?: readonly ConditionEntry[]
  turnEffects?: readonly TurnEffect[]
  spellEffects?: readonly SpellEffect[]
  tempHitPoints?: number
  deathSaves?: DeathSaves
  featureUses?: Record<string, number>
}

const at = <T extends Mortal>(character: T, current: number) => withHitPoints(character, current) as T

// A hero at 0 hit points is Unconscious. That follows from the hit points (./conditions) and is not stored.
const dying = <T extends Mortal>(character: T, saves: DeathSaves = { successes: 0, failures: 0 }): T => ({ ...at(character, 0), deathSaves: saves })

export const stable = <T extends Mortal>(character: T): T => ({ ...at(character, 0), deathSaves: { ...(character.deathSaves ?? { successes: 0, failures: 0 }), stable: true } })

/**
 * Conscious again at `current` hit points, with their Death Saving Throws cleared. One who was down is left Prone, as
 * the rules have it when Unconscious ends, and stands on their turn.
 */
export function revived<T extends Mortal>(character: T, current: number): T {
  const { deathSaves: _, ...rest } = at(character, current)
  return (isDown(character) && current > 0 ? withCondition(rest as T, { id: "prone" }, { acted: !!(character as TurnFlags).isComplete }).character : rest) as T
}

/** Dead at 0 hit points. Where player death is off, a hero who would die is left Stable at 0 instead, out of the fight. */
export function killed<T extends Mortal>(character: T, rules?: DeathRules): T {
  if (character.type === "pc" && rules?.playerDeath === false) return stable(character)
  const { deathSaves: _, conditions: __, turnEffects: ___, spellEffects: ____, tempHitPoints: _____, ...rest } = at(character, 0)
  return { ...rest, dead: true } as T
}

/**
 * How the rules left someone who took damage or made a save. "endures": a hero who would have dropped to 0 dropped to
 * 1 by a species trait (Relentless Endurance, Hard to Fell). "warded": one who would have dropped to 0 dropped to 1 by
 * a spell that wards them against death, which ends (Death Ward).
 */
export type Fate = "dies" | "dying" | "killed" | "stable" | "revived" | "endures" | "warded"

/** A hero who endured, in words for the game master: the trait that held them at 1 hit point. */
export function enduredWords(name: string, character: Parameters<typeof enduringTraitOf>[0]): string {
  return `${name} would drop to 0 hit points and drops to 1 instead, by ${enduringTraitOf(character)?.name ?? "their endurance"}.`
}

/** One a spell warded against death, in words for the game master: they drop to 1, and the spell ends. */
export function wardedWords(name: string): string {
  const ward = spells.find((spell) => heldRule(spell.id)?.wardsDeath)?.name ?? "a ward against death"
  return `${name} would drop to 0 hit points and drops to 1 instead, by ${ward}, which ends.`
}

/**
 * Damage by the rules of 0 hit points. A character who still has hit points loses them. An NPC who reaches 0 dies,
 * unless its Regeneration says it dies only when it starts its turn at 0 and does not regenerate (a Troll): then it is
 * down at 0, and `regenerate` settles it. A
 * hero who reaches 0 falls Unconscious and is dying, unless the damage left over is at least their hit point maximum,
 * which kills them outright, or a species trait holds them at 1 (`enduringTraitLeft`). Damage to a hero already at 0 is a failed Death Saving Throw, two from a Critical Hit, and
 * kills outright when it is at least their maximum. A Stable hero who takes damage is dying again, their saves from zero.
 * `types` are the damage types the blow dealt: one that stops the target's Regeneration (a Troll's Acid or Fire) is
 * marked on it until its next turn has begun.
 */
export function withDamage<T extends Mortal>(character: T, amount: number, options: { critical?: boolean; rules?: DeathRules; types?: readonly DamageTypeId[] } = {}): { character: T; fate?: Fate } {
  const hitPoints = hitPointsOf(character)
  if (!hitPoints) throw new Error(`${character.name ?? "A character"} has no sheet or stat block, so no hit points`)
  const dealt = Math.max(0, Math.round(amount))
  if (isDead(character) || dealt === 0) return { character }
  // A condition a class feature gave that ends on any damage, Temporary Hit Points' among it: Knock Out's Unconscious.
  const stirred = withDamageEndings(character)
  if (stirred !== character) return withDamage(stirred, amount, options)
  if (options.types && !isRegenerationStopped(character) && stopsRegeneration(character, options.types)) {
    const { types: _, ...rest } = options
    return withDamage({ ...character, turnEffects: [...(character.turnEffects ?? []), regenerationStopped(character)] }, dealt, rest)
  }
  // Temporary Hit Points are lost first, and what is left over comes off the hit points.
  const shield = Math.min(character.tempHitPoints ?? 0, dealt)
  if (shield > 0) {
    const { tempHitPoints: _, ...rest } = character
    const left = (character.tempHitPoints ?? 0) - shield
    return withDamage((left > 0 ? { ...rest, tempHitPoints: left } : rest) as T, dealt - shield, options)
  }
  const damage = dealt
  const { current, maximum } = hitPoints
  if (current > damage) return { character: at(character, current - damage) }
  // A spell that wards against death (Death Ward): the first time they would drop to 0, they drop to 1, and it ends.
  const warded = current > 0 ? withDeathWardSpent(character) : undefined
  if (warded) return { character: at(warded.character, 1), fate: "warded" }
  if (character.type !== "pc") return regenerationOf(character)?.diesAtTurnStart ? { character: at(character, 0) } : { character: killed(character), fate: "dies" }
  if (current > 0) {
    if (damage - current >= maximum) return withFate(killed(character, options.rules), "killed")
    // Relentless Endurance and its like: 1 hit point in place of 0, once until a Long Rest gives the use back.
    const enduring = enduringTraitLeft(character)
    if (enduring) return { character: { ...at(character, 1), featureUses: { ...character.featureUses, [enduring.key]: (character.featureUses?.[enduring.key] ?? 0) + 1 } }, fate: "endures" }
    return { character: dying(character), fate: "dying" }
  }
  if (damage >= maximum) return withFate(killed(character, options.rules), "killed")
  const saves = character.deathSaves?.stable ? { successes: 0, failures: 0 } : (character.deathSaves ?? { successes: 0, failures: 0 })
  const failures = saves.failures + (options.critical ? 2 : 1)
  if (failures >= 3) return withFate(killed(character, options.rules), "killed")
  return { character: dying(character, { successes: saves.successes, failures }), fate: "dying" }
}

const withFate = <T extends Mortal>(character: T, fate: Fate): { character: T; fate: Fate } => ({ character, fate: isDead(character) ? fate : "stable" })

/** Healing by the rules of 0 hit points: a hero at 0 who is not dead comes back conscious at the healed hit points. The dead stay dead. */
export function withHealing<T extends Mortal>(character: T, amount: number): T {
  const hitPoints = hitPointsOf(character)
  if (!hitPoints) throw new Error(`${character.name ?? "A character"} has no sheet or stat block, so no hit points`)
  const healing = Math.max(0, Math.round(amount))
  if (isDead(character) || healing === 0) return character
  return hitPoints.current === 0 ? revived(character, healing) : at(character, hitPoints.current + healing)
}

/**
 * A character set to `current` hit points by the rules of 0 hit points: less than now is damage and more is healing.
 */
export function withHitPointsBy<T extends Mortal>(character: T, current: number, rules?: DeathRules): T {
  const now = hitPointsOf(character)?.current
  if (now === undefined) return at(character, current)
  const target = Math.max(0, Math.round(current))
  if (target < now) return withDamage(character, now - target, { rules }).character
  if (target > now) return withHealing(character, target - now)
  return character
}

/** A Death Saving Throw as it fell: the hero after it, the saves once it was made, and how it ended their dying, if it did. */
export type DeathSaveResult<T> = { character: T; natural: number; success: boolean; fate?: Fate; saves: { successes: number; failures: number } }

/**
 * A dying hero's Death Saving Throw: a d20 with no bonus. 10 or more is a success and less a failure. A 1 is two
 * failures, and a 20 brings the hero back to 1 hit point, conscious. Three successes make the hero Stable, Unconscious
 * at 0 with no more saves. Three failures kill, or where player death is off leave the hero Stable. Exhaustion takes
 * 2 off the roll for each level, and the 1 and the 20 are read off the die itself. A class feature may count a lower die
 * as a 20 (Defy Death's 18 to 20).
 */
export function deathSave<T extends Mortal>(character: T, die: number, rules?: DeathRules, total?: number): DeathSaveResult<T> {
  if (!isDying(character)) throw new Error(`${character.name ?? "The character"} is not dying, so makes no Death Saving Throw.`)
  if (!Number.isInteger(die) || die < 1 || die > 20) throw new Error(`${die} is not a d20 roll.`)
  // `total` is the throw's where more than the die and Exhaustion count: an aura's bonus, a rescue's addition.
  const success = (total ?? die - d20Penalty(character)) >= DEATH_SAVE.difficulty
  const before = character.deathSaves ?? { successes: 0, failures: 0 }
  // A 20 wakes the hero and changes no save.
  if (die >= classDeathSave(character).twentyFrom)
    return { character: revived(character, 1), natural: die, success, fate: "revived", saves: { successes: before.successes, failures: before.failures } }
  const saves = success ? { successes: Math.min(3, before.successes + 1), failures: before.failures } : { successes: before.successes, failures: Math.min(3, before.failures + (die === 1 ? 2 : 1)) }
  if (saves.successes >= 3) return { character: stable({ ...character, deathSaves: saves }), natural: die, success, fate: "stable", saves }
  if (saves.failures >= 3) {
    const done = killed({ ...character, deathSaves: saves }, rules)
    return { character: done, natural: die, success, fate: isDead(done) ? "dies" : "stable", saves }
  }
  return { character: dying(character, saves), natural: die, success, saves }
}

/**
 * A Death Saving Throw as it is thrown, from the d20s the hero rolled: the die that counts by Advantage or
 * Disadvantage, less 2 for each level of Exhaustion, plus what an aura of one near adds to a saving throw (Aura of
 * Protection: the dying hero is no bearer, being Unconscious). A failure is a step toward death, so it is answered as
 * every save is (./save-rules `answeredSave`): a feature may still rescue it (Indomitable's reroll, Stroke of Luck's 20,
 * Heroic Inspiration), and the new roll's die and total settle it. A Death Saving Throw is tied to no ability, and is
 * handed on as Constitution, which none of those rules reads. The caller spends what answered it.
 */
export function thrownDeathSave<T extends Mortal & { id: string }>(args: {
  character: T
  dice: readonly number[]
  mode: RollMode
  present: readonly object[]
  rules?: DeathRules
  d20: () => number
  roll: (sides: number) => number
}): { saved: DeathSaveResult<T>; result: CheckResult; answer: AnsweredSave } {
  const { character } = args
  const bonus = auraOnSave(character, { kind: "save" }, args.present) - d20Penalty(character)
  const result = resolveCheck({ dice: args.dice, bonus, dc: DEATH_SAVE.difficulty, mode: args.mode })
  const answer = answeredSave({
    character: character as Parameters<typeof answeredSave>[0]["character"],
    ability: "con",
    result,
    stakes: { death: true },
    d20: args.d20,
    roll: args.roll,
    present: args.present as Parameters<typeof answeredSave>[0]["present"],
  })
  const settled = answer.result
  return { saved: deathSave(character, settled.natural, args.rules, settled.total), result: settled, answer }
}

/**
 * Regeneration as a creature's turn begins (./monster-traits): it regains the hit points its text gives, up to its
 * maximum. Damage of a type that stops it, taken since its last turn, keeps it from working this turn. One that works
 * only with at least 1 hit point does nothing at 0. One that "dies only if it starts its turn with 0 Hit Points and
 * doesn't regenerate" (a Troll) comes back from 0 when it regenerates, Prone as one does when Unconscious ends, and
 * dies when it does not. `fact` says what happened, in words for the game master, and is absent when nothing did.
 */
export function regenerate<T extends Mortal>(character: T): { character: T; fact?: string; trait?: string } {
  const trait = regenerationOf(character)
  const hitPoints = hitPointsOf(character)
  if (!trait || !hitPoints || isDead(character) || character.fled) return { character }
  const name = character.name ?? "The creature"
  const stoppedBy = trait.stoppedBy.join(" or ")
  if (isRegenerationStopped(character)) {
    if (hitPoints.current === 0 && trait.diesAtTurnStart)
      return {
        character: killed(character),
        trait: trait.name,
        fact: `${name} starts its turn at 0 hit points and does not regenerate, having taken ${stoppedBy} damage since its last turn. ${name} dies.`,
      }
    return { character, trait: trait.name, fact: `${name}'s ${trait.name} does not work this turn: it took ${stoppedBy} damage since its last turn.` }
  }
  if (hitPoints.current === 0 && trait.needsHitPoint) return { character }
  const gained = Math.min(trait.amount, hitPoints.maximum - hitPoints.current)
  if (gained <= 0) return { character }
  const healed = withHealing(character, gained)
  const after = hitPointsOf(healed)
  const rose = hitPoints.current === 0 ? ` ${name} is up again from 0 hit points, Prone.` : ""
  return { character: healed, trait: trait.name, fact: `${name} regains ${gained} hit points by ${trait.name}.${rose} ${name} has ${after?.current} of ${after?.maximum} hit points.` }
}

type TurnFlags = { hasReplied?: boolean; isComplete?: boolean; rollRequired?: RollRequirement; rollResult?: number }

/**
 * A character as a round begins. Their conditions lose a turn each, and those that run out end, as does what last
 * round's actions left on them. A dying hero's turn is
 * their Death Saving Throw, already asked for, so the roll card comes up on it. One who is down otherwise, or
 * Incapacitated, takes no turn. Everyone else has yet to act. Beacon of Hope gives a Death Saving Throw Advantage, as
 * Defy Death does (./classes).
 */
export function atRoundStart<T extends Mortal & TurnFlags>(before: T): T {
  // One who was Prone and is not now has stood, which costs half their Speed this turn (./space).
  const prone = (one: T) => !!one.conditions?.some((entry) => entry.id === "prone")
  const risen = conditionsAtRoundStart(before)
  const eased = turnEffectsAtRoundStart(risen)
  const stood: T = prone(before) && !prone(risen) ? { ...eased, turnEffects: [...(eased.turnEffects ?? []), { id: "stood" as const, by: before.id ?? "", turns: 1 }] } : eased
  const character = spellEffectsAtRoundStart(stood)
  // Beacon of Hope gives the Death Saving Throw Advantage, and so may a class feature (Defy Death).
  const helped = [...saveModesFromSpells(character, "death"), ...classDeathSave(character).modes]
  if (isDying(character))
    return {
      ...character,
      rollRequired: { ...DEATH_SAVE, modifier: 0 - d20Penalty(character), ...(helped.length ? { mode: "advantage" as const, reasons: helped.map((source) => source.from) } : {}) },
      rollResult: undefined,
      hasReplied: true,
      isComplete: false,
    }
  // A creature down at 0 by its Regeneration (a Troll) has had its turn's start settled as the round turned (./spell-rounds
  // `roundTurns`): one still here at 0 takes no turn.
  if (isDown(character) || isIncapacitated(character)) return { ...character, rollRequired: undefined, hasReplied: true, isComplete: true }
  return { ...character, hasReplied: false, isComplete: false }
}

/**
 * A character after harm or a condition mid-round: one now down or Incapacitated who has no Death Saving Throw to make
 * this round is done with it, and any roll they still owed is dropped.
 */
export function afterHarm<T extends Mortal & TurnFlags>(character: T): T {
  if (!isDown(character) && !isIncapacitated(character)) return character
  if (isDying(character) && character.rollRequired && "deathSave" in character.rollRequired) return character
  if (character.isComplete && !character.rollRequired) return character
  return { ...character, rollRequired: undefined, hasReplied: true, isComplete: true }
}
