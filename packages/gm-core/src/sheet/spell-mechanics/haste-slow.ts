import type { SpellRules } from "../spell-rules"

/**
 * Haste: Advantage on Dexterity saves while it lasts. As it ends, "the target is Incapacitated and has a Speed of 0
 * until the end of its next turn".
 */
export const haste: SpellRules = {
  spells: ["haste"],
  held: { saveAdvantage: ["dex"] },
  ended: (bearer, casterId) =>
    bearer.spellEffects?.some((effect) => effect.spell === "haste" && effect.by === casterId)
      ? { ...bearer, conditions: [...(bearer.conditions ?? []).filter((entry) => entry.id !== "incapacitated"), { id: "incapacitated" as const, turns: bearer.isComplete ? 2 : 1 }] }
      : bearer,
}

/** Slow: "a −2 penalty to AC and Dexterity saving throws", and "can't take Reactions". */
export const slow: SpellRules = { spells: ["slow"], held: { armorClassLess: 2, saveBonus: { dex: -2 }, noReactions: true } }
