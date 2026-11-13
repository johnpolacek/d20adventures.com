import type { SpellRules } from "../spell-rules"

/** Phantasmal Force's save decides at the cast whether the phantasm takes hold, though the damage it guards comes later. */
export const phantasmalForce: SpellRules = {
  spells: ["phantasmal-force"],
  held: {},
  savedAtCast: (save, again) => !again && save.when === "initial" && !save.timing,
}
