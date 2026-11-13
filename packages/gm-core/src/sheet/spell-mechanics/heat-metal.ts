import type { SpellRules } from "../spell-rules"

/**
 * Heat Metal, held by its caster with the slot it was cast at, and used again as a Bonus Action on their later turns.
 * Its burn falls on the one named, who is taken to hold or wear the metal, and its save follows the burn, at the cast
 * and each time it is used again. One who fails must drop the metal or have Disadvantage until the caster's next turn,
 * which the game master tells.
 */
export const heatMetal: SpellRules = {
  spells: ["heat-metal"],
  held: { byCaster: true },
  again: { takes: "bonus-action" },
  applies: (part) => !("condition" in part),
  savedAtCast: (save, again, later) => again || (save.when === "initial" && !later) || save.when === "on-damage",
  failedSave: (cast, target) => {
    cast.facts.push(
      `${target.name} must drop the burning metal if they can. If they do not, they have Disadvantage on attack rolls and ability checks until the start of ${cast.caster.name}'s next turn.`
    )
  },
}
