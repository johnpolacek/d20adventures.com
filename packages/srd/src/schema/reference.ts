import { z } from "zod"
import { abilityIdSchema, conditionIdSchema, damageTypeIdSchema, entryShape, feetSchema, proseSchema, skillIdSchema } from "./common"

/** One row of the Ability Descriptions, Ability Check Examples and Saving Throw Examples tables, and the skills the Skills table lists under it. */
export const abilitySchema = z.strictObject({
  ...entryShape,
  id: abilityIdSchema,
  measures: proseSchema,
  checkExamples: proseSchema,
  saveExamples: proseSchema,
  skills: z.array(skillIdSchema).min(1).optional(),
})
export type Ability = z.infer<typeof abilitySchema>

export const skillSchema = z.strictObject({
  ...entryShape,
  id: skillIdSchema,
  ability: abilityIdSchema,
  exampleUses: proseSchema,
})
export type Skill = z.infer<typeof skillSchema>

/** The numbers of the Exhaustion condition. Each Exhaustion level costs the penalty and the speed, and the creature dies at `deathLevel`. */
export const exhaustionSchema = z.strictObject({
  deathLevel: z.number().int().positive(),
  d20TestPenaltyPerLevel: z.number().int().positive(),
  speedReductionPerLevel: feetSchema,
  levelsRemovedPerLongRest: z.number().int().positive(),
})
export type Exhaustion = z.infer<typeof exhaustionSchema>

export const conditionSchema = z.strictObject({
  ...entryShape,
  id: conditionIdSchema,
  /** The whole glossary entry: the opening sentence, then one paragraph per effect, each as "Name. Text". */
  description: proseSchema,
  /** The effects as the glossary lists them, one per bold heading. */
  effects: z.array(z.strictObject({ name: z.string().min(1), text: proseSchema })).min(1),
  /** Conditions the entry says you also have. */
  includes: z.array(conditionIdSchema).min(1).optional(),
  /** Only on Exhaustion. */
  exhaustion: exhaustionSchema.optional(),
})
export type Condition = z.infer<typeof conditionSchema>

export const damageTypeSchema = z.strictObject({
  ...entryShape,
  id: damageTypeIdSchema,
  examples: proseSchema,
})
export type DamageType = z.infer<typeof damageTypeSchema>

export const languageSchema = z.strictObject({
  ...entryShape,
  rarity: z.enum(["standard", "rare"]),
  /** The d12 results that give this language on the Standard Languages table. Common has none. */
  roll: z
    .strictObject({ min: z.number().int().min(1).max(12), max: z.number().int().min(1).max(12) })
    .refine((roll) => roll.min <= roll.max)
    .optional(),
  /** The footnote of the table. */
  note: proseSchema.optional(),
  /** Dialects the note names. */
  dialects: z.array(z.string().min(1)).min(1).optional(),
})
export type Language = z.infer<typeof languageSchema>

export const alignmentSchema = z.strictObject({
  ...entryShape,
  /** Absent on Unaligned. */
  abbreviation: z
    .string()
    .regex(/^[A-Z]{1,2}$/)
    .optional(),
  /** Absent on Unaligned. */
  order: z.enum(["lawful", "neutral", "chaotic"]).optional(),
  /** Absent on Unaligned. */
  morality: z.enum(["good", "neutral", "evil"]).optional(),
  description: proseSchema,
})
export type Alignment = z.infer<typeof alignmentSchema>

export const magicSchoolSchema = z.strictObject({
  ...entryShape,
  typicalEffects: proseSchema,
})
export type MagicSchool = z.infer<typeof magicSchoolSchema>
