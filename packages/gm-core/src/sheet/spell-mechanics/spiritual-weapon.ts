import type { SpellRules } from "../spell-rules"

/**
 * Spiritual Weapon, held by its caster with the slot it was cast at, and used again "As a Bonus Action on your later
 * turns". Its force is not placed on the floor, so the one it strikes is not measured from it.
 */
export const spiritualWeapon: SpellRules = { spells: ["spiritual-weapon"], held: { byCaster: true }, again: { takes: "bonus-action", unplaced: true } }
