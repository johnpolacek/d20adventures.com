import { z } from "zod"
import { checkSchema, rollModes } from "../sheet/check"
import { stakeSchema } from "../sheet/stakes"

// What every asked-for roll carries. The numbers are the engine's.
const asked = {
  rollType: z.string().describe('The roll\'s name on screen and in the story: "Stealth", "Wisdom Saving Throw", "Fog Cloud (Intelligence)", "Longbow"'),
  difficulty: z.number().int().describe("The target: a check's Difficulty Class from the SRD ladder, or the Armor Class an attack is rolled against"),
  modifier: z.number().int().describe("The bonus from the roller's sheet or stat block"),
  mode: z.enum(rollModes),
  reasons: z.array(z.string()).optional().describe("What gives the roll Advantage or Disadvantage, each in a few words"),
}

/**
 * A roll the engine has asked for. The game master picks what is rolled from fixed menus
 * (services/roll-requirement-service.ts): a check with its difficulty, or an attack with one of the roller's own
 * weapons on someone present. Every number here is the engine's.
 */
export const rollRequirementSchema = z.union([
  z.object({
    check: checkSchema,
    ...asked,
    spell: z.string().optional().describe("The roller's own spell this roll casts, as their spell list names it"),
    stakes: z.array(stakeSchema).optional().describe("Who the roll hurts or heals, by which dice, on which outcome"),
  }),
  z.object({
    attack: z.object({ weapon: z.string().describe("The id of one of the roller's own attacks"), target: z.string().describe("The id of the character attacked") }),
    ...asked,
  }),
  // A dying hero's Death Saving Throw, which the engine asks for itself as the round begins (../sheet/death.ts).
  z.object({
    deathSave: z.literal(true),
    ...asked,
  }),
  z.null(),
])

export type RollRequirement = z.infer<typeof rollRequirementSchema>
export type RequiredRoll = NonNullable<RollRequirement>
export type RequiredAttack = Extract<RequiredRoll, { attack: unknown }>
export type RequiredDeathSave = Extract<RequiredRoll, { deathSave: true }>
/** A roll the game master picks from its menus: a check or an attack, never a Death Saving Throw. */
export type ChosenRoll = Exclude<RequiredRoll, RequiredDeathSave>
export const isAttackRoll = (roll: RequiredRoll): roll is RequiredAttack => "attack" in roll
export const isDeathSaveRoll = (roll: RequiredRoll | null | undefined): roll is RequiredDeathSave => !!roll && "deathSave" in roll

/** The Death Saving Throw a dying hero makes on their turn: a d20 with no bonus against 10. */
export const DEATH_SAVE: RequiredDeathSave = { deathSave: true, rollType: "Death Saving Throw", difficulty: 10, modifier: 0, mode: "normal" }
