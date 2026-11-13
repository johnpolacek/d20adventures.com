import type { ConditionChange } from "./harm"
import { type Ended, type EndsArgs, spellRule } from "./spell-rules"

/**
 * Spells that end what other spells or conditions do: each by its own rules' `ends` (./spell-rules), from the files of
 * ./spell-mechanics: Lesser Restoration, Remove Curse, Dispel Magic. Each falls on the first of its targets.
 */

/** Whether a spell ends what other spells or conditions do. */
export const endsThings = (spellId: string): boolean => !!spellRule(spellId)?.ends

/**
 * What a spell that ends things does to its target, or nothing for any other spell. A spell ended this way ends wholly:
 * where its caster concentrates on it, that Concentration ends and it leaves everyone it took.
 */
export function endsBySpell<T extends Ended>(args: EndsArgs<T>): { characters: T[]; conditions: ConditionChange[]; facts: string[] } | undefined {
  return spellRule(args.spell.id)?.ends?.(args)
}
