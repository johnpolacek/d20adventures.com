import { damageTypeIdSchema } from "@d20/srd"
import { z } from "zod"

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

/**
 * What a roll puts at stake, settled before the die is thrown: who is hurt or healed, by which dice, and on which
 * outcome. The game master picks it off fixed menus and the engine rolls it.
 */
export const stakeSchema = z.object({
  on: z.enum(["success", "failure", "always"]),
  target: z.string(),
  kind: z.enum(["damage", "healing"]),
  dice: printedDiceSchema,
  type: damageTypeIdSchema.optional(),
})
export type Stake = z.infer<typeof stakeSchema>
