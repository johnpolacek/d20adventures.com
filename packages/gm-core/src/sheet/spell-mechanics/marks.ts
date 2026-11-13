import type { SpellRules } from "../spell-rules"

/**
 * Spells whose effect only marks who is under them, for other rules to read: Bestow Curse, which Remove Curse ends, and
 * Ray of Enfeeblement, whose save is repeated at the end of each turn.
 */
export const marks: SpellRules = { spells: ["bestow-curse", "ray-of-enfeeblement"], held: {} }
