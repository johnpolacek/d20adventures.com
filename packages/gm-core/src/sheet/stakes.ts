import { conditionIdSchema, damageTypeIdSchema } from "@d20/srd"
import { z } from "zod"
import { conditionSpans } from "./condition-entry"

/**
 * How much something that is not an attack hurts or heals: a short ladder the game master picks from by name, and the
 * engine rolls. Owner decision, 2026-11-12. A spell that hurts or heals uses it too, until stage 5 of
 * plans/srd-rules.md gives spells their own dice.
 */
export const HARM_DICE = { light: "1d4", moderate: "1d8", heavy: "2d6", severe: "4d6" } as const
export type HarmSize = keyof typeof HARM_DICE
export const harmSizes = Object.keys(HARM_DICE) as [HarmSize, ...HarmSize[]]

/** Dice an encounter's notes print for a hazard: "4d6", "2d8 + 2". */
export const printedDiceSchema = z.string().regex(/^\d{1,2}d(?:4|6|8|10|12)(?: [+-] \d{1,2})?$/)

const on = z.enum(["success", "failure", "always"])

/**
 * What a roll puts at stake, settled before the die is thrown, and on which outcome: who is hurt or healed and by
 * which dice, or who is given a condition, or freed of one, and for how long. The game master picks it off fixed menus
 * and the engine applies it.
 */
export const stakeSchema = z.union([
  z.object({ on, target: z.string(), kind: z.enum(["damage", "healing"]), dice: printedDiceSchema, type: damageTypeIdSchema.optional() }),
  z.object({
    on,
    target: z.string(),
    kind: z.literal("condition"),
    condition: conditionIdSchema,
    /** The condition ends for the target rather than begins. */
    ends: z.literal(true).optional(),
    span: z.enum(conditionSpans).optional(),
    /** The id of who the condition comes from: the charmer, the source of fear, the grappler. */
    source: z.string().optional(),
  }),
])
export type Stake = z.infer<typeof stakeSchema>
export type HarmStake = Extract<Stake, { dice: string }>
export type ConditionStake = Extract<Stake, { kind: "condition" }>
