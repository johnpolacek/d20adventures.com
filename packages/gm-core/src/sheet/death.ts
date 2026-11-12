import { isDead, isDown, isDying } from "../utils/turn-actors"
import { DEATH_SAVE, type RollRequirement } from "../validations/roll-requirement-schema"
import { hitPointsAt, hitPointsOf, withHitPoints } from "./hit-points"
import type { Sheet } from "./sheet"

/** A hero's Death Saving Throws while at 0 hit points: three successes make them Stable, three failures kill. */
export type DeathSaves = { successes: number; failures: number; stable?: true }

/** The adventure's rule that bears on death: with `playerDeath: false` a hero never dies, and is left Stable instead. */
export type DeathRules = { playerDeath?: boolean }

type Mortal = { name?: string; type: string; sheet?: Sheet; statBlock?: string; hitPoints?: number; healthPercent?: number; status?: string; deathSaves?: DeathSaves }

// The status of a hero at 0 hit points, until substage 8 of stage 4 types the conditions.
export const UNCONSCIOUS = "Unconscious"

const at = <T extends Mortal>(character: T, current: number) => withHitPoints(character, current) as T

const dying = <T extends Mortal>(character: T, saves: DeathSaves = { successes: 0, failures: 0 }): T => ({ ...at(character, 0), status: UNCONSCIOUS, deathSaves: saves })

const stable = <T extends Mortal>(character: T): T => ({ ...at(character, 0), status: UNCONSCIOUS, deathSaves: { ...(character.deathSaves ?? { successes: 0, failures: 0 }), stable: true } })

/** Back on their feet at `current` hit points: conscious, with their Death Saving Throws cleared. */
export function revived<T extends Mortal>(character: T, current: number): T {
  const { deathSaves: _, ...rest } = at(character, current)
  return { ...rest, status: character.status === UNCONSCIOUS ? undefined : character.status } as T
}

/** Dead at 0 hit points. Where player death is off, a hero who would die is left Stable at 0 instead, out of the fight. */
export function killed<T extends Mortal>(character: T, rules?: DeathRules): T {
  if (character.type === "pc" && rules?.playerDeath === false) return stable(character)
  const { deathSaves: _, ...rest } = at(character, 0)
  return { ...rest, status: "dead" } as T
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
  const damage = Math.max(0, Math.round(amount))
  if (isDead(character) || damage === 0) return { character }
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
 * The model's percent writes go through this until substage 6 of stage 4 deletes them.
 */
export function withHitPointsBy<T extends Mortal>(character: T, current: number, rules?: DeathRules): T {
  const now = hitPointsOf(character)?.current
  if (now === undefined) return at(character, current)
  const target = Math.max(0, Math.round(current))
  if (target < now) return withDamage(character, now - target, { rules }).character
  if (target > now) return withHealing(character, target - now)
  return character
}

/**
 * The character at a health percent, for the model's percent writes, by the rules of 0 hit points. A percent write is
 * never the damage that kills outright, so it needs no adventure rules. It goes when substage 6 of stage 4 in
 * plans/srd-rules.md lands and the engine rolls all harm.
 */
export function withHealthPercent<T extends Mortal>(character: T, percent: number): T & { hitPoints: number; healthPercent: number } {
  const maximum = hitPointsOf(character)?.maximum
  if (maximum === undefined) throw new Error(`${character.name ?? "A character"} has no sheet or stat block, so no hit points`)
  return withHitPointsBy(character, hitPointsAt(maximum, percent).current) as T & { hitPoints: number; healthPercent: number }
}

/**
 * The model's word for a character's status. It does not kill a hero: a hero it calls dead drops to 0 hit points and the
 * rules of 0 hit points go on from there. Nor does it change the status of a hero at 0, who stays Unconscious.
 */
export function withStatusWord<T extends Mortal>(character: T, status: string | undefined): T {
  const word = status?.trim() || undefined
  if (character.type !== "pc") return { ...character, status: word }
  if (isDown(character)) return character
  if (word?.toLowerCase() === "dead") return withDamage(character, hitPointsOf(character)?.current ?? 0).character
  return { ...character, status: word }
}

export type DeathSaveResult = { character: Mortal; natural: number; success: boolean; fate?: Fate }

/**
 * A dying hero's Death Saving Throw: a d20 with no bonus. 10 or more is a success and less a failure. A 1 is two
 * failures, and a 20 brings the hero back to 1 hit point, conscious. Three successes make the hero Stable, Unconscious
 * at 0 with no more saves. Three failures kill, or where player death is off leave the hero Stable.
 */
export function deathSave<T extends Mortal>(character: T, die: number, rules?: DeathRules): { character: T; natural: number; success: boolean; fate?: Fate } {
  if (!isDying(character)) throw new Error(`${character.name ?? "The character"} is not dying, so makes no Death Saving Throw.`)
  if (!Number.isInteger(die) || die < 1 || die > 20) throw new Error(`${die} is not a d20 roll.`)
  const success = die >= DEATH_SAVE.difficulty
  if (die === 20) return { character: revived(character, 1), natural: die, success, fate: "revived" }
  const saves = character.deathSaves ?? { successes: 0, failures: 0 }
  if (success) {
    const successes = saves.successes + 1
    if (successes >= 3) return { character: stable({ ...character, deathSaves: { ...saves, successes } }), natural: die, success, fate: "stable" }
    return { character: dying(character, { ...saves, successes }), natural: die, success }
  }
  const failures = saves.failures + (die === 1 ? 2 : 1)
  if (failures >= 3) {
    const done = killed({ ...character, deathSaves: { ...saves, failures: Math.min(3, failures) } }, rules)
    return { character: done, natural: die, success, fate: isDead(done) ? "dies" : "stable" }
  }
  return { character: dying(character, { ...saves, failures }), natural: die, success }
}

type TurnFlags = { hasReplied?: boolean; isComplete?: boolean; rollRequired?: RollRequirement; rollResult?: number }

/**
 * A character as a round begins. A dying hero's turn is their Death Saving Throw, already asked for, so the roll card
 * comes up on it. One who is down otherwise takes no turn. Everyone else has yet to act.
 */
export function atRoundStart<T extends Mortal & TurnFlags>(character: T): T {
  if (isDying(character)) return { ...character, rollRequired: DEATH_SAVE, rollResult: undefined, hasReplied: true, isComplete: false }
  if (isDown(character)) return { ...character, rollRequired: undefined, hasReplied: true, isComplete: true }
  return { ...character, hasReplied: false, isComplete: false }
}

/** A character after harm mid-round: one now down who has no Death Saving Throw to make this round is done with it, and any roll they still owed is dropped. */
export function afterHarm<T extends Mortal & TurnFlags>(character: T): T {
  if (!isDown(character)) return character
  if (isDying(character) && character.rollRequired && "deathSave" in character.rollRequired) return character
  if (character.isComplete && !character.rollRequired) return character
  return { ...character, rollRequired: undefined, hasReplied: true, isComplete: true }
}
