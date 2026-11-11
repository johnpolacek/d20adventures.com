import { z } from "zod"
import { abilityIdSchema, conditionIdSchema, creatureTypeSchema, damageTypeIdSchema, diceSchema, entryShape, feetSchema, idSchema, proseSchema, sizeSchema, skillIdSchema } from "./common"

const count = z.number().int().positive()
const bonus = z.number().int()

/** Speeds in feet. A mode the creature lacks is absent. */
export const speedSchema = z.strictObject({
  walk: feetSchema,
  burrow: feetSchema.optional(),
  climb: feetSchema.optional(),
  fly: feetSchema.optional(),
  swim: feetSchema.optional(),
  /** The fly speed is marked "(hover)". */
  hover: z.literal(true).optional(),
})
export type Speed = z.infer<typeof speedSchema>

/** One ability column of the stat block: the score, its modifier and the saving throw bonus, as printed. */
export const abilityLineSchema = z.strictObject({ score: z.number().int().min(1).max(30), mod: bonus, save: bonus })

/** One instance of damage the entry prints, such as "12 (2d6 + 5) Bludgeoning damage". */
export const damagePartSchema = z.strictObject({
  /** The fixed number printed before the dice. */
  average: z.number().int().nonnegative(),
  /** Absent when the text prints only a number, as in "1 Slashing damage". */
  dice: diceSchema.optional(),
  /** Absent only when the text names no type, as in "damage of the type chosen for the Draconic Origin trait". */
  type: damageTypeIdSchema.optional(),
  /**
   * The clause the damage belongs to, when it is in the first sentence after "Hit:", "Failure:" and the like: the
   * damage dealt by that outcome. Absent for damage stated elsewhere in the text, such as an aura or damage over time.
   * Alternatives in one sentence ("or 5 (2d4) Piercing damage if the swarm is Bloodied") all carry the outcome, so
   * read the text for which applies.
   */
  on: z.enum(["hit", "miss", "hit-or-miss", "failure", "success", "failure-or-success"]).optional(),
})
export type DamagePart = z.infer<typeof damagePartSchema>

export const attackSchema = z.strictObject({
  kind: z.enum(["melee", "ranged", "melee-or-ranged"]),
  bonus,
  reach: feetSchema.optional(),
  range: z.strictObject({ normal: feetSchema, long: feetSchema.optional() }).optional(),
  /** A printed condition on the bonus, such as "with Advantage if the target is Grappled by the ankheg". */
  bonusNote: z.string().min(1).optional(),
})
export type Attack = z.infer<typeof attackSchema>

export const saveSchema = z.strictObject({
  ability: abilityIdSchema,
  dc: z.number().int().positive(),
  /** Who makes the save, as printed after the DC: "each creature in a 30-foot Cone". */
  targets: proseSchema.optional(),
  failure: proseSchema.optional(),
  success: proseSchema.optional(),
  failureOrSuccess: proseSchema.optional(),
  /** The success clause is "Half damage" or "Half damage only". */
  halfOnSuccess: z.literal(true).optional(),
})
export type Save = z.infer<typeof saveSchema>

export const areaSchema = z.strictObject({
  shape: z.enum(["cone", "cube", "cylinder", "emanation", "line", "sphere"]),
  /** Length of a Cone or Line, side of a Cube, radius of a Sphere or Cylinder, distance of an Emanation. */
  size: feetSchema,
  width: feetSchema.optional(),
  height: feetSchema.optional(),
})
export type Area = z.infer<typeof areaSchema>

export const spellListSchema = z.strictObject({
  /** "at-will", or a number of uses per day. */
  frequency: z.union([z.literal("at-will"), count]),
  /** Each spell has its own uses ("1/Day Each"). */
  each: z.literal(true).optional(),
  spells: z
    .array(
      z.strictObject({
        id: idSchema,
        /** The printed parenthetical, such as "level 4 version" or "self only". */
        note: z.string().min(1).optional(),
      })
    )
    .min(1),
})

export const spellcastingSchema = z.strictObject({
  ability: abilityIdSchema,
  saveDc: z.number().int().positive().optional(),
  attackBonus: bonus.optional(),
  lists: z.array(spellListSchema).min(1),
})
export type Spellcasting = z.infer<typeof spellcastingSchema>

/** A trait, action, bonus action, reaction or legendary action: the official text, with the numbers an engine needs. */
export const monsterFeatureSchema = z.strictObject({
  name: z.string().min(1),
  /** The text after "Name. ", with the parenthetical left out of the name. */
  text: proseSchema,
  perDay: count.optional(),
  perDayInLair: count.optional(),
  /** "Recharge 5–6" is { min: 5, max: 6 }. "Recharge 6" is { min: 6, max: 6 }. */
  recharge: z.strictObject({ min: z.number().int().min(1).max(6), max: z.number().int().min(1).max(6) }).optional(),
  rechargeAfterRest: z.literal(true).optional(),
  /** Any other part of the name's parenthetical, such as "Vampire Form Only" or "Requires Soul Bag". */
  note: z.string().min(1).optional(),
  attack: attackSchema.optional(),
  saves: z.array(saveSchema).min(1).optional(),
  /** Every damage instance the text prints, in order. */
  damage: z.array(damagePartSchema).min(1).optional(),
  /**
   * Conditions the text gives a creature: "it has the Prone condition", "exiting with the Prone condition". A
   * condition named only as a precondition ("one creature that has the Prone condition") or a negation is left out.
   */
  conditions: z.array(conditionIdSchema).min(1).optional(),
  escapeDc: z.number().int().positive().optional(),
  area: areaSchema.optional(),
  spellcasting: spellcastingSchema.optional(),
})
export type MonsterFeature = z.infer<typeof monsterFeatureSchema>

export const monsterSchema = z.strictObject({
  ...entryShape,
  /** The part of the Monsters chapter that holds the stat block. */
  section: z.enum(["Monsters A–Z", "Animals"]),
  /** The heading the stat block sits under, when it is not the monster's own name: "Black Dragons", "Animated Objects". */
  group: z.string().min(1).optional(),
  /** One size, or the options to choose from ("Medium or Small"). */
  size: z.array(sizeSchema).min(1),
  type: creatureTypeSchema,
  /** A swarm's line reads "Medium Swarm of Tiny Beasts": the size of the creatures in the swarm. */
  swarmOf: sizeSchema.optional(),
  /** Descriptive tags in parentheses after the type, as ids: "demon", "chromatic", "wizard". */
  tags: z.array(idSchema).min(1).optional(),
  alignment: z.string().min(1),
  ac: z.number().int().positive(),
  initiative: z.strictObject({ modifier: bonus, score: z.number().int() }),
  hp: z.strictObject({ average: z.number().int().positive(), formula: diceSchema }),
  speed: speedSchema,
  /** Speeds that apply only under a printed condition: "40 ft. (bear form only)", "Climb or Fly 20 ft. (GM’s choice)". */
  speedVariants: z
    .array(z.strictObject({ speed: speedSchema.partial(), note: z.string().min(1) }))
    .min(1)
    .optional(),
  abilities: z.strictObject({
    str: abilityLineSchema,
    dex: abilityLineSchema,
    con: abilityLineSchema,
    int: abilityLineSchema,
    wis: abilityLineSchema,
    cha: abilityLineSchema,
  }),
  skills: z.partialRecord(skillIdSchema, bonus).optional(),
  vulnerabilities: z.array(damageTypeIdSchema).min(1).optional(),
  resistances: z.array(damageTypeIdSchema).min(1).optional(),
  immunities: z.array(damageTypeIdSchema).min(1).optional(),
  conditionImmunities: z.array(conditionIdSchema).min(1).optional(),
  /** A defense entry printed with a qualifier, word for word: the whole entry, or the qualified item. */
  defenseNotes: z
    .strictObject({
      vulnerabilities: z.string().min(1).optional(),
      resistances: z.string().min(1).optional(),
      conditionImmunities: z.string().min(1).optional(),
    })
    .optional(),
  /** Equipment ids, singular, with the printed count: "Javelins (6)" is { id: "javelin", quantity: 6 }. */
  gear: z
    .array(z.strictObject({ id: idSchema, quantity: count.optional() }))
    .min(1)
    .optional(),
  senses: z.strictObject({
    blindsight: feetSchema.optional(),
    darkvision: feetSchema.optional(),
    /** "unimpeded by magical Darkness". */
    darkvisionNote: z.string().min(1).optional(),
    tremorsense: feetSchema.optional(),
    truesight: feetSchema.optional(),
    passivePerception: z.number().int().positive(),
  }),
  /** The Languages entry before any telepathy, as printed: "Common, Draconic", "None". */
  languages: z.string().min(1),
  telepathy: feetSchema.optional(),
  /** A note printed after the telepathy range. */
  telepathyNote: z.string().min(1).optional(),
  cr: z.number().nonnegative(),
  xp: z.number().int().nonnegative(),
  xpInLair: z.number().int().positive().optional(),
  pb: z.number().int().positive(),
  traits: z.array(monsterFeatureSchema).min(1).optional(),
  actions: z.array(monsterFeatureSchema).min(1).optional(),
  bonusActions: z.array(monsterFeatureSchema).min(1).optional(),
  reactions: z.array(monsterFeatureSchema).min(1).optional(),
  legendaryActions: z
    .strictObject({
      uses: count,
      usesInLair: count.optional(),
      /** The paragraph that opens the section: "Legendary Action Uses: 3 (4 in Lair). Immediately after …". */
      text: proseSchema,
      actions: z.array(monsterFeatureSchema).min(1),
    })
    .optional(),
})
export type Monster = z.infer<typeof monsterSchema>
