import { ownBlockOf } from "../blocks"
import type { Roller } from "../check"
import type { SpellRules } from "../spell-rules"

// A hero is of a playable species, every one of them a Humanoid. An NPC is of its stat block's type.
export function creatureTypeOf(character: Roller): string {
  if (character.sheet || character.type !== "npc") return "humanoid"
  return ownBlockOf(character)?.type ?? "humanoid"
}

// "Choose a Humanoid", "One Humanoid", "Target a Beast": the one creature type a spell takes.
export const only =
  (type: "humanoid" | "beast"): SpellRules["takes"] =>
  (target, spell) =>
    creatureTypeOf(target) === type ? undefined : `${target.name} is not a ${type === "humanoid" ? "Humanoid" : "Beast"}, so ${spell.name} does not take them.`

/** Hold Person takes a Humanoid. */
export const holdPerson: SpellRules = { spells: ["hold-person"], takes: only("humanoid") }

/**
 * Charm Person takes a Humanoid and Animal Friendship a Beast. Their Charmed holds "until you or your allies damage it":
 * a blow from the bearer's own side leaves it.
 */
export const charmPerson: SpellRules = { spells: ["charm-person"], takes: only("humanoid"), endsOnDamage: "from-caster-side" }
export const animalFriendship: SpellRules = { spells: ["animal-friendship"], takes: only("beast"), endsOnDamage: "from-caster-side" }

/**
 * Spells that end on a creature when it takes damage: "The spell ends for an affected creature if it takes any damage"
 * (Hypnotic Pattern). The Charmed of Suggestion and Mass Suggestion lasts "until you or your allies deal damage to the
 * target": only damage from the caster's side ends it.
 */
export const endOnDamage: SpellRules = { spells: ["hypnotic-pattern"], endsOnDamage: true }
export const suggestion: SpellRules = { spells: ["suggestion", "mass-suggestion"], endsOnDamage: "from-caster-side" }
