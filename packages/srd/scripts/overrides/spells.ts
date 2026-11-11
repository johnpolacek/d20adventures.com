import type { Override } from "../lib/data"

/**
 * Corrections to the base source and to the mechanics the builder reads from the official wording. The builder finds
 * saves, damage, conditions and areas by pattern. These entries fix what a pattern cannot read: a damage type named
 * apart from its dice, a save whose success has a stated outcome, a condition the spell ends or prevents rather than
 * gives, and a size that is a limit rather than an area of effect.
 */
export const overrides: Override[] = [
  // Header fields the base source gets wrong.
  { id: "protection-from-evil-and-good", path: "duration.concentration", value: true, reason: "Duration reads “Concentration up to 10 minutes”", page: 157 },

  { id: "wish", path: "damage", value: undefined, reason: "“1d10 Necrotic damage per level of that spell” is the stress on the caster, scaled by other spells", page: 175 },

  // Befuddlement prints the outcome of its first save after the repeated save, in a paragraph of its own.
  {
    id: "befuddlement",
    path: "saves",
    value: [
      { ability: "int", dc: "spell-save-dc", when: "initial", onSuccess: "half" },
      { ability: "int", dc: "spell-save-dc", when: "later", onSuccess: "ends" },
    ],
    reason:
      "“The target makes an Intelligence saving throw”, then “At the end of every 30 days, the target repeats the save, ending the effect on a success”, then “On a successful save, the target takes half as much damage only”",
    page: 112,
  },
]
