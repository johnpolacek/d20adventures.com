import { resolveAttack } from "./attack"
import { type CheckResult, resolveCheck } from "./check"
import { type AttackRescue, type CheckRule, type ClassRules, classD20Floor, classTotalFloor, type SaveRule } from "./class-rules"
import { failureCosts } from "./save-rules"
import { areEnemies } from "./sides"

/**
 * Heroic Inspiration (SRD 5.2.1 pp. 8 and 183): a hero has it or does not, never two, and may expend it to reroll any
 * one die immediately after rolling it, using the new roll. Kept on the character as `heroicInspiration`. It is given
 * by a Human's Resourceful as a Long Rest ends (./rest), and by a Champion's Heroic Warrior as each round of a fight
 * turns (./classes/fighter). The SRD 5.2.1 has no Musician feat, and no Epic Boon gives it.
 *
 * The engine spends it by a plain rule, as a careful player would, since asking after every die would stall play: the
 * d20 of the hero's own attack roll that missed an enemy, or of their own check or save that failed where the failure
 * costs them something (harm, a condition, the spell they hold, a step toward death), and where a new d20 could still
 * turn it. Every other rescue is asked first, so it is spent only when none of them turned the roll. One reroll, of the
 * lowest d20 where two were rolled, and the new roll stands.
 */

export const HEROIC_INSPIRATION = "heroic-inspiration"
const NAME = "Heroic Inspiration"

type Inspired = { heroicInspiration?: true }

/** Whether a character has Heroic Inspiration. */
export const hasHeroicInspiration = (character: object): boolean => !!(character as Inspired).heroicInspiration

/** A character with Heroic Inspiration. One who has it already gains nothing: no one holds two. */
export const withHeroicInspiration = <T extends object>(character: T): T => (hasHeroicInspiration(character) ? character : { ...character, heroicInspiration: true })

/** A character with their Heroic Inspiration expended. */
export function withoutHeroicInspiration<T extends object>(character: T): T {
  if (!hasHeroicInspiration(character)) return character
  const { heroicInspiration: _, ...rest } = character as T & Inspired
  return rest as T
}

// The d20s with the lowest rerolled: with Advantage it is the one not kept, with Disadvantage the one kept, and either
// way the reroll that may lift the roll most.
function rerolled(dice: readonly number[], d20: () => number): number[] {
  const lowest = dice.indexOf(Math.min(...dice))
  return dice.map((die, index) => (index === lowest ? d20() : die))
}

// A failed check or save with its lowest d20 rolled again: what was added to it is kept, a Bardic Inspiration die among it.
function checkRerolled(result: CheckResult, d20: () => number, floors: { least?: number; leastTotal?: number } = {}): CheckResult {
  const adds = [...(result.adds ?? []), ...(result.inspired !== undefined ? [{ from: "Bardic Inspiration", amount: result.inspired }] : [])]
  return resolveCheck({ dice: rerolled(result.dice, d20), bonus: result.bonus, dc: result.dc, mode: result.mode, adds, ...floors })
}

// Whether a new d20 could turn a failed check or save: a 20 with what was added meets the DC.
const turnable = (result: CheckResult): boolean => 20 + result.bonus + (result.adds ?? []).reduce((sum, add) => sum + add.amount, 0) + (result.inspired ?? 0) >= result.dc

const inspiredSave: SaveRule = ({ character, result, stakes, d20 }) => {
  if (!hasHeroicInspiration(character) || !failureCosts(character, stakes) || !turnable(result)) return undefined
  return { result: checkRerolled(result, d20), feature: HEROIC_INSPIRATION, name: NAME }
}

const inspiredCheck: CheckRule = ({ character, check, result, roll, staked }) => {
  // A save is answered by `inspiredSave`, after every other rescue of a save.
  if (!staked || check.kind === "save" || !hasHeroicInspiration(character) || !turnable(result)) return undefined
  const floor = classD20Floor(character, check)
  const total = classTotalFloor(character, check)
  const again = checkRerolled(result, () => roll(20), { ...(floor !== undefined ? { least: floor } : {}), ...(total !== undefined ? { leastTotal: total } : {}) })
  return { result: again, after: (spender) => withoutHeroicInspiration(spender) }
}

const inspiredAttack: AttackRescue = {
  feature: HEROIC_INSPIRATION,
  name: NAME,
  rescue: ({ attacker, target, roll, extra, d20 }) => {
    if (!hasHeroicInspiration(attacker) || !areEnemies(attacker, target)) return undefined
    const again = resolveAttack({ dice: rerolled(roll.dice, d20), bonus: roll.bonus, armorClass: roll.armorClass, mode: roll.mode, adds: roll.adds, criticalFrom: roll.criticalFrom })
    const total = again.total + extra
    return { ...again, total, hit: again.critical || (again.natural !== 1 && total >= again.armorClass) }
  },
  spend: (attacker) => withoutHeroicInspiration(attacker),
  words: (name, first, now) =>
    `${name}'s attack misses (${first.total} against Armor Class ${first.armorClass}), and ${name} expends Heroic Inspiration to roll the d20 again: ${now.total}, ${now.hit ? "a hit" : "still a miss"}.`,
}

/** Heroic Inspiration's plain rule, read after every class's and feat's rescue (./classes). */
export const heroicInspirationRules: ClassRules = {
  class: HEROIC_INSPIRATION,
  saves: [inspiredSave],
  checks: [inspiredCheck],
  attackRescues: [inspiredAttack],
}
