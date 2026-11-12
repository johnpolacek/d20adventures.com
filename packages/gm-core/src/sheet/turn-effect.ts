import { skillIdSchema } from "@d20/srd"
import { z } from "zod"

/** The actions of a turn that take no roll of their own. Hide is a roll, so it is not one of these (./actions). */
export const actionIds = ["dodge", "help", "dash", "disengage"] as const
export type ActionId = (typeof actionIds)[number]

/**
 * What an action leaves on a character until the turn of the one who took it comes round again. "dodging" is on the
 * one who took the Dodge action. "helped" is on an ally given the Help action for a check, and "distracted" is on an
 * enemy an ally's attack was helped against. Only the engine writes it, through ./actions.
 */
export const turnEffectSchema = z.strictObject({
  id: z.enum(["dodging", "helped", "distracted"]),
  /** The id of who took the action. */
  by: z.string(),
  /** For "helped": the skill the help is for. */
  skill: skillIdSchema.optional(),
  /** 2 in the round it was given, 1 in the next, where it lasts until the turn of the one who gave it. */
  turns: z.number().int().min(1).max(2),
})
export type TurnEffect = z.infer<typeof turnEffectSchema>
