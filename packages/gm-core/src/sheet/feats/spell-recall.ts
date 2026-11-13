import { featById } from "@d20/srd/feats"
import type { ClassRules } from "../class-rules"
import { hasFeat } from "../feature-rules"

/**
 * Boon of Spell Recall (SRD 5.2.1 p. 88), Free Casting: whenever the hero casts a spell with a spell slot of level 1 to
 * 4, they roll 1d4, and on the slot's level the slot is not expended. Read as a cast is paid for (../spells `withCastPaid`).
 */

const BOON = "boon-of-spell-recall"

export const spellRecall: ClassRules = {
  class: BOON,
  keepsSlot: (character, level, roll) => {
    const free = featById.get(BOON)?.benefits?.find((benefit) => benefit.freeCasting)
    const range = free?.freeCasting
    if (!hasFeat(character, BOON) || !range || level < range.minSlotLevel || level > range.maxSlotLevel) return undefined
    const die = roll(4)
    return die === level ? `${free?.name ?? "Free Casting"} rolls a ${die} on the d4: the level ${level} slot is not expended.` : undefined
  },
}
