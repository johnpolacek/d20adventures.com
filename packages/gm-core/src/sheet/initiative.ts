import { classInitiativeAdvantage } from "./class-rules"
import { initiativeBonusOf } from "./stat-block"

/**
 * A character's Initiative for an encounter: the d20 it rolled as the encounter began, plus its bonus (./stat-block
 * `initiativeBonusOf`). It is kept until the encounter ends. A class may give it Advantage (./classes): a Champion's
 * Remarkable Athlete rolls the higher of `die` and `second`.
 */
export const rollInitiative = (character: Parameters<typeof initiativeBonusOf>[0], die: number, second?: number): number =>
  (second !== undefined && classInitiativeAdvantage(character) ? Math.max(die, second) : die) + initiativeBonusOf(character)
