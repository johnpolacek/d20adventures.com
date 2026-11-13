import { classInitiativeAdvantage } from "./class-rules"
import { itemInitiativeAdvantage } from "./item-effects"
import { initiativeAdvantageBySpell } from "./spell-effects"
import { initiativeBonusOf } from "./stat-block"

/**
 * A character's Initiative for an encounter: the d20 it rolled as the encounter began, plus its bonus (./stat-block
 * `initiativeBonusOf`). It is kept until the encounter ends. A class may give it Advantage (./classes), and so may a
 * worn magic item (./item-effects), or a spell on it (./spell-effects): a Champion's Remarkable Athlete, a Sentinel
 * Shield or Enhance Ability on Dexterity rolls the higher of `die` and `second`.
 */
export const rollInitiative = (character: Parameters<typeof initiativeBonusOf>[0], die: number, second?: number): number =>
  (second !== undefined && (classInitiativeAdvantage(character) || itemInitiativeAdvantage(character.sheet) || initiativeAdvantageBySpell(character)) ? Math.max(die, second) : die) +
  initiativeBonusOf(character)
