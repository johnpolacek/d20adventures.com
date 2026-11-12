import { skillIdSchema } from "@d20/srd"
import { z } from "zod"

/** The actions of a turn that take no roll of their own. Hide is a roll, so it is not one of these (./actions). */
export const actionIds = ["dodge", "help", "dash", "disengage"] as const
export type ActionId = (typeof actionIds)[number]

/**
 * What an action leaves on a character until the turn of the one who took it comes round again. "dodging" is on the
 * one who took the Dodge action. "helped" is on an ally given the Help action for a check, and "distracted" is on an
 * enemy an ally's attack was helped against. "vexed" is on a creature hit with a weapon whose Vex mastery the attacker
 * has: their next attack on it has Advantage. Only the engine writes it, through ./actions.
 */
export const turnEffectSchema = z.strictObject({
  id: z.enum(["dodging", "helped", "distracted", "vexed"]),
  /** The id of who took the action. */
  by: z.string(),
  /** For "helped": the skill the help is for. */
  skill: skillIdSchema.optional(),
  /** 2 in the round it was given, 1 in the next, where it lasts until the turn of the one who gave it. */
  turns: z.number().int().min(1).max(2),
})
export type TurnEffect = z.infer<typeof turnEffectSchema>

/** A Bardic Inspiration die a character holds, and whose it is. A character holds one at a time. */
export const inspirationSchema = z.strictObject({ die: z.number().int().min(4).max(12), by: z.string() })
export type Inspiration = z.infer<typeof inspirationSchema>

/** How many times a character has used each feature that has a number of uses, by the feature's id. */
export const featureUsesSchema = z.record(z.string(), z.number().int().min(0))

/**
 * A spell that lasts on a character, by SRD id, with who cast it. The engine reads what it does from the spell's own
 * typed data each time a roll is made: Bless adds a d4, Shield of Faith 2 to Armor Class, Hunter's Mark a d6 to its
 * caster's hits. Only the engine writes it, through ./spell-effects.
 */
export const spellEffectSchema = z.strictObject({
  spell: z.string(),
  /** The id of who cast it. */
  by: z.string(),
  /** How many of the bearer's own turns it still covers. None lasts until something ends it. */
  turns: z.number().int().min(1).optional(),
  /** A number the caster's own sheet sets: Heroism's Temporary Hit Points each turn. */
  amount: z.number().int().optional(),
  /** Guidance: the skill it is for. */
  skill: skillIdSchema.optional(),
})
export type SpellEffect = z.infer<typeof spellEffectSchema>

/** The spell a caster concentrates on, by SRD id. A caster concentrates on one at a time. */
export const concentrationSchema = z.strictObject({ spell: z.string() })
export type Concentration = z.infer<typeof concentrationSchema>
