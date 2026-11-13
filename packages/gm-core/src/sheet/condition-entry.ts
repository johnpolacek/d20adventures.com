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
  /**
   * The stat block attack that holds the bearer, by id, with `source` its attacker: a grapple and what lasts until the
   * grapple ends. Ending the Grappled condition ends every one the same attack of the same holder gave (./hit-riders).
   */
  attack: z.string().optional(),
  /**
   * The class feature that gave it, by SRD id, with `source` the hero: a Rogue's Knock Out. That class's own rules end
   * it: on a save repeated as the round turns, or when its bearer takes damage (./class-rules `endsOnDamage`).
   */
  feature: z.string().optional(),
  /** An Exhaustion level, 1 to 6. */
  level: z.number().int().min(1).max(6).optional(),
})
export type ConditionEntry = z.infer<typeof conditionEntrySchema>
