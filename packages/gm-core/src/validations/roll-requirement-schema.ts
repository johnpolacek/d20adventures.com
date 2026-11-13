import { damageTypeIdSchema, skillIdSchema } from "@d20/srd"
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
  // What the turn still holds once this roll is resolved, which the engine asks for next (../sheet/attack-roll.ts
  // `followingRoll`): the rest of an Attack action with Extra Attack or Action Surge, the rest of an NPC's Multiattack,
  // a Hide taken with Cunning Action, and a class's follow-ups, each true under its key (../sheet/class-rules.ts
  // `FollowRule`): Horde Breaker's "horde".
  after: z
    .object({
      attacks: z.number().int().min(1).optional().describe("Attacks of the Attack action still to make after this one, with the same weapon"),
      multiattack: z.array(z.array(z.string()).min(1)).min(1).optional().describe("The attacks of an NPC's Multiattack still to make after this one, each the ids of the attacks it may be made with"),
      struck: z.array(z.string()).optional().describe("Who has been attacked this turn, by id"),
      hide: z.literal(true).optional().describe("A Hide taken with Cunning Action is still to roll"),
    })
    .catchall(z.unknown())
    .optional(),
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
    stakes: z.array(stakeSchema).optional().describe("Who the roll hurts or heals, by which dice, on which outcome"),
  }),
  z.object({
    attack: z.object({
      weapon: z.string().describe("The id of one of the roller's own attacks"),
      target: z.string().describe("The id of the character attacked"),
      cover: z.enum(["half", "three-quarters"]).optional().describe("The cover the target has from the attacker. The difficulty already counts it"),
      choices: z
        .record(z.string(), z.string())
        .optional()
        .describe("What class features the attacker chose for this attack, by the key of each choice (../sheet/class-rules.ts): a Cunning Strike's cunning"),
      charge: z.number().optional().describe("Feet the attacker moved straight toward the target immediately before this attack, for a stat block's charge"),
    }),
    ...asked,
  }),
  // A spell cast, by its SRD id, on the targets named. One with a spell attack is thrown by the caster: `difficulty`
  // is then the first target's Armor Class and `modifier` the spell attack bonus. Any other asks for no throw and is
  // resolved as it is read, so it is never left waiting on a character.
  z.object({
    cast: z.object({
      spell: z.string().describe("The spell's SRD id"),
      targets: z.array(z.string()).describe("The ids of who it is cast on"),
      ritual: z.literal(true).optional().describe("Cast slowly as a Ritual, which spends no slot"),
      damageType: damageTypeIdSchema.optional().describe("For a spell that deals one of several damage types, the one chosen"),
      skill: skillIdSchema.optional().describe("For a spell cast for one skill (Guidance), the skill"),
      choice: z.string().optional().describe("For a spell that asks its caster a choice, what they chose: Hex's ability, Protection from Energy's damage type (../sheet/spell-rules.ts)"),
      level: z.number().int().min(1).max(9).optional().describe("The slot level it is cast at: the slot a hero spends, the level an NPC's stat block prints, or the level a magic item casts it at"),
      item: z.literal(true).optional().describe("Cast from a magic item the hero owns, which spends the item's charges or use in place of a slot"),
      cover: z
        .record(z.string(), z.enum(["half", "three-quarters"]))
        .optional()
        .describe("The cover each target has from where the spell comes, by id"),
      measured: z.literal(true).optional().describe("An area was measured on the floor, so the spell takes everyone named, however many"),
      again: z.literal(true).optional().describe("A spell the caster holds, used again on a later turn with no cost: Spiritual Weapon's attack, Heat Metal's burn"),
      choices: z
        .record(z.string(), z.union([z.string(), z.literal(true)]))
        .optional()
        .describe("What class features the caster chose for this cast, by the key of each choice (../sheet/class-rules.ts): Metamagic's metamagic"),
    }),
    ...asked,
  }),
  // A class feature used as the turn's action that the engine resolves with no throw of the hero's, as it resolves a
  // spell that asks for none: a Cleric's Channel Divinity (../sheet/classes/cleric.ts), or an action of a stat block
  // that is a save, a breath weapon's (../sheet/stat-block-actions.ts). `difficulty` is the save DC.
  z.object({
    feature: z.object({
      id: z.string().describe("The effect, by the id its class feature resolves it under: Channel Divinity's turn-undead"),
      targets: z.array(z.string()).describe("The ids of who it is used on"),
      heal: z.literal(true).optional().describe("Divine Spark restores hit points in place of harming"),
      damageType: z.enum(["necrotic", "radiant"]).optional().describe("Divine Spark's damage type"),
      cover: z
        .record(z.string(), z.enum(["half", "three-quarters"]))
        .optional()
        .describe("For a stat block's action over an area: the cover each target has from where it comes, by id"),
    }),
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
export type RequiredCast = Extract<RequiredRoll, { cast: unknown }>
export type RequiredFeature = Extract<RequiredRoll, { feature: unknown }>
/** A roll the game master picks from its menus: a check or an attack, never a Death Saving Throw. */
export type ChosenRoll = Exclude<RequiredRoll, RequiredDeathSave | RequiredFeature>
export const isAttackRoll = (roll: RequiredRoll): roll is RequiredAttack => "attack" in roll
export const isCastRoll = (roll: RequiredRoll | null | undefined): roll is RequiredCast => !!roll && "cast" in roll
export const isFeatureRoll = (roll: RequiredRoll | null | undefined): roll is RequiredFeature => !!roll && "feature" in roll
export const isDeathSaveRoll = (roll: RequiredRoll | null | undefined): roll is RequiredDeathSave => !!roll && "deathSave" in roll

/** The Death Saving Throw a dying hero makes on their turn: a d20 with no bonus against 10. */
export const DEATH_SAVE: RequiredDeathSave = { deathSave: true, rollType: "Death Saving Throw", difficulty: 10, modifier: 0, mode: "normal" }
