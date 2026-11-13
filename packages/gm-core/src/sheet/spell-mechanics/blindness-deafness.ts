import type { SpellRules } from "../spell-rules"

/** Blindness/Deafness gives "the Blinded or Deafened condition (your choice)": the one the caster chose. */
export const blindnessDeafness: SpellRules = {
  spells: ["blindness-deafness"],
  choice: { values: ["blinded", "deafened"], field: "spellChoice", words: "the condition it gives" },
  applies: (part, choice) => part.condition === choice,
}
