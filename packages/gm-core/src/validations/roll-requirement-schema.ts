import { z } from "zod"
import { checkSchema, rollModes } from "../sheet/check"

/**
 * A roll the engine has asked for. The game master picks `check`, the difficulty and any Advantage or Disadvantage
 * from fixed menus (services/roll-requirement-service.ts). Every number here is the engine's.
 */
export const rollRequirementSchema = z.union([
  z.object({
    check: checkSchema,
    rollType: z.string().describe('The check\'s name on screen and in the story: "Stealth", "Wisdom Saving Throw", "Fog Cloud (Intelligence)"'),
    difficulty: z.number().int().describe("The target: a Difficulty Class from the SRD ladder"),
    modifier: z.number().int().describe("The bonus from the roller's sheet or stat block"),
    mode: z.enum(rollModes),
    reasons: z.array(z.string()).optional().describe("What gives the roll Advantage or Disadvantage, each in a few words"),
    spell: z.string().optional().describe("The roller's own spell this roll casts, as their spell list names it"),
  }),
  z.null(),
])

export type RollRequirement = z.infer<typeof rollRequirementSchema>
export type RequiredRoll = NonNullable<RollRequirement>
