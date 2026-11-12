import { conditionIdSchema } from "@d20/srd"
import { z } from "zod"

/**
 * How long a condition lasts, by name: the bearer's next turn, about a minute of a fight, or until something ends it.
 * The numbers are the bearer's own turns.
 */
export const CONDITION_SPANS = { turn: 1, minute: 10, lasting: undefined } as const
export type ConditionSpan = keyof typeof CONDITION_SPANS
export const conditionSpans = Object.keys(CONDITION_SPANS) as [ConditionSpan, ...ConditionSpan[]]

/**
 * One of the SRD's fifteen conditions as a character bears it. Only the engine writes it, through ./conditions.
 * Unconscious at 0 hit points is not stored: it follows from the hit points.
 */
export const conditionEntrySchema = z.strictObject({
  id: conditionIdSchema,
  /** The id of who it comes from, where the rules turn on that: the charmer, the source of fear, the grappler. */
  source: z.string().optional(),
  /** How many of the bearer's own turns it still covers. None lasts until something ends it. */
  turns: z.number().int().min(1).optional(),
  /** The spell that gave it, by SRD id. It ends with that spell: when its caster's Concentration on it breaks. */
  spell: z.string().optional(),
  /** An Exhaustion level, 1 to 6. */
  level: z.number().int().min(1).max(6).optional(),
})
export type ConditionEntry = z.infer<typeof conditionEntrySchema>
