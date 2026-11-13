import { abilityIdSchema, abilityIds, classIdSchema, idSchema, sizeSchema, skillIdSchema } from "@d20/srd"
import { z } from "zod"

const scoreSchema = z.number().int().min(1).max(30)

/** The six ability scores as they stand, with the background's increases already added. */
export const abilityScoresSchema = z.strictObject({
  str: scoreSchema,
  dex: scoreSchema,
  con: scoreSchema,
  int: scoreSchema,
  wis: scoreSchema,
  cha: scoreSchema,
})
export type AbilityScores = z.infer<typeof abilityScoresSchema>

const raiseSchema = z.number().int().min(1).max(2)

/**
 * A choice made at a level that has no other home on the sheet. Each is checked by `sheetProblems`.
 *
 * - The feat an Ability Score Improvement feature grants at `level`, and the ability scores it raised. The raises are
 *   already counted in `abilityScores`: `{ level: 4, feat: "ability-score-improvement", abilities: { str: 1, con: 1 } }`.
 * - The skills a feature of `level` gives proficiency in: College of Lore's three at level 3, `{ level: 3, skills: [...] }`.
 * - Magic Initiate's picks, for a Magic Initiate the hero has, at the level it was taken (1 for an Origin feat):
 *   `{ level: 1, feat: "magic-initiate", spellList: "wizard", spellAbility: "int", cantrips: [...], spell: "..." }`.
 */
export const advancementSchema = z.strictObject({
  /** The character level the choice was made at. */
  level: z.number().int().min(1).max(20),
  feat: idSchema.optional(),
  abilities: z.strictObject({ str: raiseSchema, dex: raiseSchema, con: raiseSchema, int: raiseSchema, wis: raiseSchema, cha: raiseSchema }).partial().optional(),
  skills: z.array(skillIdSchema).optional(),
  spellList: classIdSchema.optional(),
  spellAbility: abilityIdSchema.optional(),
  cantrips: z.array(idSchema).optional(),
  spell: idSchema.optional(),
})
export type Advancement = z.infer<typeof advancementSchema>

/**
 * One option picked for a feature that takes several from its list: an Eldritch Invocation, a Metamagic option. An
 * option that names one of the hero's cantrips (Agonizing Blast) keeps it in `cantrip`, and one that grants a feat
 * (Lessons of the First Ones) keeps it in `feat`. A repeatable option is picked again with another of those.
 */
export const featurePickSchema = z.strictObject({ option: idSchema, cantrip: idSchema.optional(), feat: idSchema.optional() })
export type FeaturePick = z.infer<typeof featurePickSchema>

/**
 * A magic item the hero owns, by SRD id: `{ id: "ring-of-protection", attuned: true }`. An item that comes in several
 * versions names the one owned (`variant: "+1"`). A magic weapon, armor or Shield names the equipment it is
 * (`base: "longsword"`), and it is the one wielded or worn whenever the sheet's `weapons`, `armor` or `shield` holds that
 * equipment: a Longsword +1 and `weapons: ["longsword"]` is one magic Longsword. `attuned` is set only on an item that
 * needs Attunement, once the hero is attuned to it. Each entry is one item. Checked by `sheetProblems` (./items).
 */
export const ownedItemSchema = z.strictObject({
  id: idSchema,
  variant: z.string().min(1).optional(),
  base: idSchema.optional(),
  attuned: z.literal(true).optional(),
})
export type OwnedItem = z.infer<typeof ownedItemSchema>

/**
 * What a player chooses for a character. Everything else on a character sheet (hit points, Armor Class, saves, skill
 * bonuses) is worked out from this and the SRD data by `deriveSheet`, so no bonus is ever stored.
 */
export const sheetSchema = z.strictObject({
  class: classIdSchema,
  level: z.number().int().min(1).max(20),
  /** The SRD subclass id, from the level the class grants one (3 for every class): "life-domain". */
  subclass: idSchema.optional(),
  /** A species id from the SRD data: "elf". */
  species: idSchema,
  /** A background id from the SRD data: "soldier". It brings its two skills, its tool and its Origin feat. */
  background: idSchema,
  /** The size chosen, for a species that offers two (a Human is Medium or Small). Absent means the species' first. */
  size: sizeSchema.optional(),
  /**
   * The ability a species trait's spells are cast with, where the trait lets the player pick it: Elven Lineage, Gnomish
   * Lineage, Fiendish Legacy, and the Thaumaturgy of a Tiefling's Otherworldly Presence. Absent, they use the class's.
   */
  speciesSpellAbility: abilityIdSchema.optional(),
  /**
   * The languages chosen, by SRD id, beside Common, which every hero knows, and a Rogue's Thieves' Cant: two from the
   * Standard Languages table, and a Rogue's one more from either table.
   */
  languages: z.array(idSchema).optional(),
  abilityScores: abilityScoresSchema,
  /** The skills chosen from the class's list. The background's two skills are not repeated here. */
  classSkills: z.array(skillIdSchema),
  /** Skills from anywhere else: a Human's Skillful, an Elf's Keen Senses, the Skilled feat taken as an Origin feat. */
  otherSkills: z.array(skillIdSchema).optional(),
  /** Skills with Expertise (a Rogue's two at level 1). */
  expertise: z.array(skillIdSchema).optional(),
  /** A species trait's choice id and the option taken: `{ "elven-lineage": "drow" }`. */
  speciesChoices: z.record(idSchema, idSchema).optional(),
  /**
   * A class feature's id and what was chosen for it: an option id (`{ "cleric-divine-order": "protector" }`) or a
   * feat id (`{ "fighter-fighting-style": "defense" }`).
   */
  featureChoices: z.record(idSchema, idSchema).optional(),
  /**
   * A class feature's id and the options picked for it, where it takes several from its list:
   * `{ "warlock-eldritch-invocations": [{ option: "pact-of-the-tome" }] }`. Each pick is checked by `sheetProblems`.
   */
  featurePicks: z.record(idSchema, z.array(featurePickSchema)).optional(),
  /** Feats beyond the background's Origin feat (a Human's Versatile). */
  feats: z.array(idSchema).optional(),
  /** The armor worn, by equipment id: "chain-mail". Absent means no armor. */
  armor: idSchema.optional(),
  /** Carrying a Shield. */
  shield: z.boolean().optional(),
  /** The weapons carried, by equipment id: "longbow". Every character can also make an Unarmed Strike. */
  weapons: z.array(idSchema).optional(),
  /** The cantrips known, by spell id, from the class's list: "ray-of-frost". */
  cantrips: z.array(idSchema).optional(),
  /** The spells prepared, by spell id, from the class's list. A feature's always-prepared spells are not listed here. */
  spells: z.array(idSchema).optional(),
  /** A Wizard's spellbook, by spell id. The prepared spells are chosen from it, and its Ritual spells need no preparing. */
  spellbook: z.array(idSchema).optional(),
  /** The kinds of weapons whose mastery property the hero can use, by equipment id, from their Weapon Mastery feature. */
  weaponMasteries: z.array(idSchema).optional(),
  /** The choices of each level that have no other home: an Ability Score Improvement's feat and raises, and the like. */
  advancements: z.array(advancementSchema).optional(),
  /** The magic items the hero owns, in the order they were gained. */
  items: z.array(ownedItemSchema).optional(),
})
export type Sheet = z.infer<typeof sheetSchema>

export { abilityIds }
