import { isDead, isDown, isDying, isIncapacitated } from "../utils/turn-actors"
import { DEATH_SAVE, type RollRequirement } from "../validations/roll-requirement-schema"
import { turnEffectsAtRoundStart } from "./actions"
import type { ConditionEntry } from "./condition-entry"
import { conditionsAtRoundStart, d20Penalty, withCondition } from "./conditions"
import { hitPointsOf, withHitPoints } from "./hit-points"
import type { Sheet } from "./sheet"
import { saveModesFromSpells, spellEffectsAtRoundStart } from "./spell-effects"
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
}

const at = <T extends Mortal>(character: T, current: number) => withHitPoints(character, current) as T

// A hero at 0 hit points is Unconscious. That follows from the hit points (./conditions) and is not stored.
const dying = <T extends Mortal>(character: T, saves: DeathSaves = { successes: 0, failures: 0 }): T => ({ ...at(character, 0), deathSaves: saves })

const stable = <T extends Mortal>(character: T): T => ({ ...at(character, 0), deathSaves: { ...(character.deathSaves ?? { successes: 0, failures: 0 }), stable: true } })

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

/** How the rules left someone who took damage or made a save. */
export type Fate = "dies" | "dying" | "killed" | "stable" | "revived"

/**
 * Damage by the rules of 0 hit points. A character who still has hit points loses them. An NPC who reaches 0 dies. A
 * hero who reaches 0 falls Unconscious and is dying, unless the damage left over is at least their hit point maximum,
 * which kills them outright. Damage to a hero already at 0 is a failed Death Saving Throw, two from a Critical Hit, and
 * kills outright when it is at least their maximum. A Stable hero who takes damage is dying again, their saves from zero.
 */
export function withDamage<T extends Mortal>(character: T, amount: number, options: { critical?: boolean; rules?: DeathRules } = {}): { character: T; fate?: Fate } {
  const hitPoints = hitPointsOf(character)
  if (!hitPoints) throw new Error(`${character.name ?? "A character"} has no sheet or stat block, so no hit points`)
  const dealt = Math.max(0, Math.round(amount))
  if (isDead(character) || dealt === 0) return { character }
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
  if (character.type !== "pc") return { character: killed(character), fate: "dies" }
  if (current > 0) {
    if (damage - current >= maximum) return withFate(killed(character, options.rules), "killed")
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
 * 2 off the roll for each level, and the 1 and the 20 are read off the die itself.
 */
export function deathSave<T extends Mortal>(character: T, die: number, rules?: DeathRules): DeathSaveResult<T> {
  if (!isDying(character)) throw new Error(`${character.name ?? "The character"} is not dying, so makes no Death Saving Throw.`)
  if (!Number.isInteger(die) || die < 1 || die > 20) throw new Error(`${die} is not a d20 roll.`)
  const success = die - d20Penalty(character) >= DEATH_SAVE.difficulty
  const before = character.deathSaves ?? { successes: 0, failures: 0 }
  // A 20 wakes the hero and changes no save.
  if (die === 20) return { character: revived(character, 1), natural: die, success, fate: "revived", saves: { successes: before.successes, failures: before.failures } }
  const saves = success ? { successes: Math.min(3, before.successes + 1), failures: before.failures } : { successes: before.successes, failures: Math.min(3, before.failures + (die === 1 ? 2 : 1)) }
  if (saves.successes >= 3) return { character: stable({ ...character, deathSaves: saves }), natural: die, success, fate: "stable", saves }
  if (saves.failures >= 3) {
    const done = killed({ ...character, deathSaves: saves }, rules)
    return { character: done, natural: die, success, fate: isDead(done) ? "dies" : "stable", saves }
  }
  return { character: dying(character, saves), natural: die, success, saves }
}

type TurnFlags = { hasReplied?: boolean; isComplete?: boolean; rollRequired?: RollRequirement; rollResult?: number }

/**
 * A character as a round begins. Their conditions lose a turn each, and those that run out end, as does what last
 * round's actions left on them. A dying hero's turn is
 * their Death Saving Throw, already asked for, so the roll card comes up on it. One who is down otherwise, or
 * Incapacitated, takes no turn. Everyone else has yet to act. Beacon of Hope gives a Death Saving Throw Advantage.
 */
export function atRoundStart<T extends Mortal & TurnFlags>(before: T): T {
  // One who was Prone and is not now has stood, which costs half their Speed this turn (./space).
  const prone = (one: T) => !!one.conditions?.some((entry) => entry.id === "prone")
  const risen = conditionsAtRoundStart(before)
  const eased = turnEffectsAtRoundStart(risen)
  const stood: T = prone(before) && !prone(risen) ? { ...eased, turnEffects: [...(eased.turnEffects ?? []), { id: "stood" as const, by: before.id ?? "", turns: 1 }] } : eased
  const character = spellEffectsAtRoundStart(stood)
  // Beacon of Hope gives the Death Saving Throw Advantage.
  const helped = saveModesFromSpells(character, "death")
  if (isDying(character))
    return {
      ...character,
      rollRequired: { ...DEATH_SAVE, modifier: 0 - d20Penalty(character), ...(helped.length ? { mode: "advantage" as const, reasons: helped.map((source) => source.from) } : {}) },
      rollResult: undefined,
      hasReplied: true,
      isComplete: false,
    }
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
