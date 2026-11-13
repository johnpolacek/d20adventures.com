import type { SpellRules } from "../spell-rules"

/** Spells that change later attack rolls in words their data does not type, each from its text. */
export const attackRiders: SpellRules[] = [
  // "The next attack roll made against it before the end of your next turn has Advantage."
  { spells: ["guiding-bolt"], held: { attacked: "advantage", once: true } },
  // "Attack rolls against an affected creature or object have Advantage if the attacker can see it."
  { spells: ["faerie-fire"], held: { attacked: "advantage" } },
  // Shining Smite: "Until the spell ends, ... attack rolls against it have Advantage". Its light and its bar on the
  // Invisible condition are not read.
  { spells: ["shining-smite"], held: { attacked: "advantage" } },
  // "It has Disadvantage on the next attack roll it makes before the end of its next turn."
  { spells: ["vicious-mockery"], held: { attacks: "disadvantage", once: true } },
  // Blur: "any creature has Disadvantage on attack rolls against you." Blindsight and Truesight are not read.
  { spells: ["blur"], held: { attacked: "disadvantage" } },
]
