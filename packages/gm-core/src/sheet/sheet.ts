import { abilityIds, classIdSchema, idSchema, skillIdSchema } from "@d20/srd"
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

/**
 * What a player chooses for a character. Everything else on a character sheet (hit points, Armor Class, saves, skill
 * bonuses) is worked out from this and the SRD data by `deriveSheet`, so no bonus is ever stored.
 */
export const sheetSchema = z.strictObject({
  class: classIdSchema,
  level: z.number().int().min(1).max(20),
  /** A species id from the SRD data: "elf". */
  species: idSchema,
  /** A background id from the SRD data: "soldier". It brings its two skills, its tool and its Origin feat. */
  background: idSchema,
  abilityScores: abilityScoresSchema,
  /** The skills chosen from the class's list. The background's two skills are not repeated here. */
  classSkills: z.array(skillIdSchema),
  /** Skills from anywhere else: a Human's Skillful, an Elf's Keen Senses, the Skilled feat. */
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
})
export type Sheet = z.infer<typeof sheetSchema>

export { abilityIds }
