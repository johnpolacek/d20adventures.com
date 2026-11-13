import type { AbilityId, DamageTypeId } from "@d20/srd"
import { abilityById } from "@d20/srd/abilities"
import { spellById } from "@d20/srd/spells"
import { type Check, checkAbility } from "../check"
import type { SpellRules } from "../spell-rules"

/**
 * Spells that ask a choice of their caster as they are cast, kept on the spell's effect (`choice`) where it lasts, and
 * what the spell does follows it.
 */

// The ability of an ability check, or none for a save: a skill's check is its ability's.
const checkedWith = (check: Check): AbilityId | undefined => (check.kind === "save" ? undefined : checkAbility(check))

// "Choose Acid, Cold, Fire, Lightning, Poison, or Thunder": the types its data offers for its damage.
const ORB_TYPES = spellById.get("chromatic-orb")?.damage?.[0]?.types ?? []

/** Chromatic Orb: "Choose Acid, Cold, Fire, Lightning, Poison, or Thunder for the type of orb you create." */
export const chromaticOrb: SpellRules = { spells: ["chromatic-orb"], choice: { values: ORB_TYPES, field: "damageType", words: "the orb's damage type" } }

/**
 * Protection from Energy: "the willing creature you touch has Resistance to one damage type of your choice: Acid, Cold,
 * Fire, Lightning, or Thunder."
 */
export const protectionFromEnergy: SpellRules = {
  spells: ["protection-from-energy"],
  choice: { values: ["acid", "cold", "fire", "lightning", "thunder"], field: "damageType", words: "the damage type it resists" },
  held: { resistances: (effect) => (effect.choice ? [effect.choice as DamageTypeId] : []) },
}

/**
 * Enhance Ability: "choose Strength, Dexterity, Intelligence, Wisdom, or Charisma. For the duration, the target has
 * Advantage on ability checks using the chosen ability." Initiative is a Dexterity check.
 */
export const enhanceAbility: SpellRules = {
  spells: ["enhance-ability"],
  choice: { values: ["str", "dex", "int", "wis", "cha"], field: "spellChoice", words: "the ability whose checks have Advantage" },
  held: {
    checkModes: (effect, check) =>
      effect.choice && checkedWith(check) === effect.choice ? [{ mode: "advantage", from: `Enhance Ability (${abilityById.get(effect.choice as AbilityId)?.name})` }] : [],
  },
}

/** Hex: "choose one ability when you cast the spell. The target has Disadvantage on ability checks made with the chosen ability." */
export const hex: SpellRules = {
  spells: ["hex"],
  choice: { values: ["str", "dex", "con", "int", "wis", "cha"], field: "spellChoice", words: "the ability whose checks have Disadvantage" },
  held: {
    checkModes: (effect, check) => (effect.choice && checkedWith(check) === effect.choice ? [{ mode: "disadvantage", from: `Hex (${abilityById.get(effect.choice as AbilityId)?.name})` }] : []),
  },
}
