import { z } from "zod"
import {
  abilityIdSchema,
  conditionIdSchema,
  creatureTypeSchema,
  damageTypeIdSchema,
  diceSchema,
  entryShape,
  feetSchema,
  forcedSaveShape,
  idSchema,
  proseSchema,
  rechargeSchema,
  saveDcSchema,
  sizeSchema,
  skillIdSchema,
} from "./common"

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

/** The outcome labels the SRD prints: "Hit:", "Failure:", "Second Failure:" and the rest. */
export const outcomes = ["hit", "miss", "hit-or-miss", "failure", "first-failure", "second-failure", "subsequent-failures", "success", "failure-or-success"] as const

/**
 * One instance of damage the entry prints, such as "12 (2d6 + 5) Bludgeoning damage". A part with no `condition`
 * is dealt by its outcome, at once and without a further condition. Every other part carries the printed words
 * that limit it.
 */
export const damagePartSchema = z.strictObject({
  /** The fixed number printed before the dice. */
  average: z.number().int().nonnegative(),
  /** Absent when the text prints only a number, as in "1 Slashing damage". */
  dice: diceSchema.optional(),
  /** Absent only when the text names no type, as in "damage of the type chosen for the Draconic Origin trait". */
  type: damageTypeIdSchema.optional(),
  /** The outcome whose paragraph holds the damage ("Hit:", "Failure:"). Absent when no outcome label precedes it in its paragraph. */
  on: z.enum(outcomes).optional(),
  /**
   * The printed words that limit this part: the "if …" or "unless …" clause right after it ("if the swarm is
   * Bloodied"), or, for damage outside the first sentence of its outcome or outside any outcome, the whole sentence
   * that states it ("At the start of each of its turns, the Restrained target takes 21 (6d6) Thunder damage.").
   */
  condition: z.string().min(1).optional(),
  /** The index in `damage` of the part this one replaces when its condition holds: "5 (2d4) …, or 2 (1d4) … if the swarm is Bloodied". */
  alternativeTo: z.number().int().nonnegative().optional(),
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
  ...forcedSaveShape,
  /** Every monster save prints its DC. */
  dc: saveDcSchema,
  /** Who makes the save, as printed after the DC: "each creature in a 30-foot Cone". */
  targets: proseSchema.optional(),
  failure: proseSchema.optional(),
  /**
   * A staged save prints "First Failure:" (or "Failure:") and "Second Failure:" or "Subsequent Failures:". Each stage
   * is its own field, and `failure` is then absent, so the first failed save never reads as the last stage.
   */
  firstFailure: proseSchema.optional(),
  secondFailure: proseSchema.optional(),
  subsequentFailures: proseSchema.optional(),
  success: proseSchema.optional(),
  failureOrSuccess: proseSchema.optional(),
  /** The success clause is "Half damage" or "Half damage only". */
  halfOnSuccess: z.literal(true).optional(),
})
export type Save = z.infer<typeof saveSchema>

export const areaSchema = z.strictObject({
  shape: z.enum(["cone", "cube", "cylinder", "emanation", "line", "sphere"]),
  /** An area of effect the text puts creatures "in" or that something "fills". Length of a Cone or Line, side of a Cube, radius of a Sphere or Cylinder, distance of an Emanation. */
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
  /**
   * Limited uses. "2/Day" is { count: 2, recharge: "long-rest" }, as the chapter's X/Day rule says. "3/Day, or
   * 4/Day in Lair" adds countInLair. "Recharge after a Short or Long Rest" is { count: 1, recharge: "short-or-long-rest" }.
   */
  uses: z.strictObject({ count, countInLair: count.optional(), recharge: rechargeSchema }).optional(),
  /** "Recharge 5–6" is { min: 5, max: 6 }: the d6 roll at the start of each turn that restores the one use. */
  rechargeRoll: z.strictObject({ min: z.number().int().min(1).max(6), max: z.number().int().min(1).max(6) }).optional(),
  /** Any other part of the name's parenthetical, such as "Vampire Form Only" or "Requires Soul Bag". */
  note: z.string().min(1).optional(),
  attack: attackSchema.optional(),
  saves: z.array(saveSchema).min(1).optional(),
  /** Every damage instance the text prints, in order. */
  damage: z.array(damagePartSchema).min(1).optional(),
  /**
   * Conditions the text gives a creature: "it has the Prone condition", "gives it the Grappled condition", "exiting
   * with the Prone condition", "exiting Prone", "gains 1 Exhaustion level". A condition named in a clause that is a
   * precondition or a negation ("if the target has …", "that has …", "doesn’t have …", "no longer has …") is left out.
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
  /**
   * Defenses the stat block qualifies, kept out of the plain lists above: "Piercing damage from weapons wielded by
   * creatures under the effect of a Bless spell", "Charmed (with Mind Blank)". `value` is absent when the text names
   * no type ("Damage type chosen for the Draconic Origin trait below"). `condition` is the qualifying words as printed.
   */
  conditionalDefenses: z
    .array(
      z.strictObject({
        kind: z.enum(["vulnerability", "resistance", "immunity", "condition-immunity"]),
        value: z.union([damageTypeIdSchema, conditionIdSchema]).optional(),
        condition: z.string().min(1),
      })
    )
    .min(1)
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

/** A row of Experience Points by Challenge Rating. CR 0 is worth 0 or 10 XP, so `xp` lists every value printed. */
const xpRow = z.strictObject({ cr: z.number().nonnegative(), xp: z.array(z.number().int().nonnegative()).min(1) })
/** A row of Proficiency Bonus by Challenge Rating: the CR range, inclusive, and its bonus. */
const pbRow = z.strictObject({ minCr: z.number().nonnegative(), maxCr: z.number().nonnegative(), pb: z.number().int().positive() })
/** A row of Hit Dice by Size: the die and the average Hit Points per die (2½ is 2.5). */
const hitDieRow = z.strictObject({ size: sizeSchema, die: z.number().int().positive(), averagePerDie: z.number().positive() })

/** The three tables of the Monsters chapter's stat block rules, one entry each. */
export const monsterRuleSchema = z.union([
  z.strictObject({ ...entryShape, id: z.literal("experience-points-by-challenge-rating"), xpByCr: z.array(xpRow).min(1) }),
  z.strictObject({ ...entryShape, id: z.literal("proficiency-bonus-by-challenge-rating"), pbByCr: z.array(pbRow).min(1) }),
  z.strictObject({ ...entryShape, id: z.literal("hit-dice-by-size"), hitDiceBySize: z.array(hitDieRow).min(1) }),
])
export type MonsterRule = z.infer<typeof monsterRuleSchema>
