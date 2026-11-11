import { z } from "zod"
import { classIdSchema, conditionIdSchema, costSchema, damageTypeIdSchema, diceSchema, entryShape, feetSchema, forcedSaveShape, proseSchema, saveDcSchema, schoolIdSchema } from "./common"

const count = z.number().int().positive()

/**
 * "Action", "1 minute", "Reaction, which you take when …". `amount` is set for minutes and hours only. `trigger` is
 * the text after "which you take" on a Reaction or Bonus Action. `option` names the effect a casting time belongs to
 * when a spell prints two (Plant Growth).
 */
export const castingTimeSchema = z.strictObject({
  unit: z.enum(["action", "bonus-action", "reaction", "minute", "hour"]),
  amount: count.optional(),
  trigger: z.string().min(1).optional(),
  option: z.string().min(1).optional(),
})
export type CastingTime = z.infer<typeof castingTimeSchema>

/**
 * An area of effect as the text gives it. `size` is the radius of a Sphere, Cylinder or Emanation, the side of a
 * Cube and the length of a Cone or Line. A Line has a `width` and a Cylinder a `height`.
 */
export const areaSchema = z.strictObject({
  shape: z.enum(["cone", "cube", "cylinder", "emanation", "line", "sphere"]),
  size: feetSchema,
  width: feetSchema.optional(),
  height: feetSchema.optional(),
})
export type Area = z.infer<typeof areaSchema>

/** `distance` is in the unit the kind names: feet or miles. `area` is the spell's area of effect where the text states one size for it. */
export const rangeSchema = z.strictObject({
  kind: z.enum(["self", "touch", "feet", "miles", "sight", "unlimited", "special"]),
  distance: count.optional(),
  area: areaSchema.optional(),
})
export type Range = z.infer<typeof rangeSchema>

/**
 * `costs` are the minimum values the text prints ("worth 25+ GP"), in order, each with whether the spell consumes
 * the part it prices. `consumed` says how much of the material the spell consumes: all of it, some of its parts
 * (Clone's diamond but not its vessel), or none.
 */
export const materialSchema = z.strictObject({
  text: z.string().min(1),
  costs: z
    .array(z.strictObject({ cost: costSchema, consumed: z.boolean() }))
    .min(1)
    .optional(),
  consumed: z.enum(["all", "some", "none"]),
})

export const componentsSchema = z.strictObject({
  verbal: z.boolean(),
  somatic: z.boolean(),
  material: materialSchema.optional(),
})
export type Components = z.infer<typeof componentsSchema>

/** `upTo` is set where the text reads "up to", which every Concentration duration does. */
export const durationSchema = z.strictObject({
  kind: z.enum(["instantaneous", "timed", "until-dispelled", "until-dispelled-or-triggered", "special"]),
  amount: count.optional(),
  unit: z.enum(["round", "minute", "hour", "day"]).optional(),
  upTo: z.literal(true).optional(),
  concentration: z.boolean(),
})
export type Duration = z.infer<typeof durationSchema>

/**
 * Who a save or a damage roll falls on when it is not the spell's targets: the caster alone, or the caster and the
 * creatures travelling with the caster (Dimension Door).
 */
const targetSchema = z.enum(["caster", "caster-and-companions"])

/**
 * One saving throw the spell has a creature make. `dc` is the caster's spell save DC unless the text prints a number.
 *
 * `when` is the moment of the save: "initial" decides whether the effect lands, when the spell takes effect or when a
 * creature meets the spell's trigger (entering an area, ending its turn there). The others are later saves by a
 * creature already affected: "end-of-turn" and "start-of-turn" at the end or start of its turns, "on-damage" when it
 * takes damage, "action" when it takes an action to repeat the save, "later" for a repeated save at another time the
 * text gives (Compulsion's after moving, Befuddlement's every 30 days).
 *
 * `onSuccess`: "none" when a success avoids the effect, "half" when it halves the damage, "ends" when it ends the
 * spell or the effect on that creature, "other" when the text gives another outcome. `target` is set where the caster
 * makes the save.
 */
export const saveSchema = z.strictObject({
  ...forcedSaveShape,
  dc: saveDcSchema,
  when: z.enum(["initial", "end-of-turn", "start-of-turn", "on-damage", "action", "later"]),
  onSuccess: z.enum(["none", "half", "ends", "other"]),
  target: targetSchema.optional(),
})
export type Save = z.infer<typeof saveSchema>

/** Damage at the cantrip upgrade levels, as printed: "levels 5 (2d6), 11 (3d6), and 17 (4d6)". */
const cantripDiceSchema = z.strictObject({ 5: diceSchema, 11: diceSchema, 17: diceSchema })

/**
 * One damage roll the text states, as dice or as a fixed `amount`. Several `types` mean one of them, chosen as the
 * text says, or, where `table` names one of the spell's tables, the type that table's row gives. `modifier` adds the
 * caster's spellcasting ability modifier. `perSlot` is the dice added for each slot level above the spell's level.
 * `target` is set where the damage falls on the caster. `trigger` and `save` link the roll to what its sentence
 * says it follows: a hit, or a failed save (`save` is an index into `saves`). A roll left unlinked has no such
 * condition in its sentence.
 */
export const damageSchema = z
  .strictObject({
    dice: diceSchema.optional(),
    amount: count.optional(),
    types: z.array(damageTypeIdSchema).min(1),
    modifier: z.literal(true).optional(),
    perSlot: diceSchema.optional(),
    cantrip: cantripDiceSchema.optional(),
    table: z.string().min(1).optional(),
    target: targetSchema.optional(),
    trigger: z.enum(["hit", "failed-save"]).optional(),
    save: z.number().int().nonnegative().optional(),
  })
  .refine((damage) => (damage.dice === undefined) !== (damage.amount === undefined), "give dice or an amount")
export type Damage = z.infer<typeof damageSchema>

/** Hit Points regained as dice or as a fixed `amount`. `temporary` marks Temporary Hit Points. `perSlot` and `perSlotAmount` are added for each slot level above the spell's level. */
export const healingSchema = z.strictObject({
  dice: diceSchema.optional(),
  amount: count.optional(),
  modifier: z.literal(true).optional(),
  temporary: z.literal(true).optional(),
  perSlot: diceSchema.optional(),
  perSlotAmount: count.optional(),
})
export type Healing = z.infer<typeof healingSchema>

/**
 * A table printed in the spell, as rows of cells under its column headings. Some tables print no title.
 * `damageTypes` maps a row's first cell to the damage type that row deals, for rows that deal damage.
 */
export const spellTableSchema = z.strictObject({
  title: z.string().min(1).optional(),
  columns: z.array(z.string().min(1)).min(2),
  rows: z.array(z.array(proseSchema).min(2)).min(1),
  damageTypes: z.record(z.string().min(1), damageTypeIdSchema).optional(),
})
export type SpellTable = z.infer<typeof spellTableSchema>

const namedTextSchema = z.strictObject({ name: z.string().min(1), text: proseSchema })
const abilityLineSchema = z.strictObject({ score: z.number().int().positive(), modifier: z.number().int(), save: z.number().int() })

/**
 * A stat block a spell prints for the creature it makes. AC, HP and the other lines stay as printed, since many
 * scale with the spell's level. Ability scores are numbers.
 */
export const spellStatBlockSchema = z.strictObject({
  name: z.string().min(1),
  type: z.string().min(1),
  ac: z.string().min(1),
  hp: z.string().min(1),
  speed: z.string().min(1),
  abilities: z.strictObject({ str: abilityLineSchema, dex: abilityLineSchema, con: abilityLineSchema, int: abilityLineSchema, wis: abilityLineSchema, cha: abilityLineSchema }),
  resistances: z.string().min(1).optional(),
  immunities: z.string().min(1).optional(),
  senses: z.string().min(1),
  languages: z.string().min(1),
  cr: z.string().min(1),
  traits: z.array(namedTextSchema).min(1).optional(),
  actions: z.array(namedTextSchema).min(1),
  bonusActions: z.array(namedTextSchema).min(1).optional(),
})
export type SpellStatBlock = z.infer<typeof spellStatBlockSchema>

/** A condition the spell gives, and, where its sentence says so, the hit or the failed save (an index into `saves`) it follows. */
export const conditionLinkSchema = z.strictObject({
  condition: conditionIdSchema,
  trigger: z.enum(["hit", "failed-save"]).optional(),
  save: z.number().int().nonnegative().optional(),
})

export const spellSchema = z.strictObject({
  ...entryShape,
  /** 0 for a cantrip. */
  level: z.number().int().min(0).max(9),
  school: schoolIdSchema,
  classes: z.array(classIdSchema).min(1),
  castingTime: castingTimeSchema,
  /** Plant Growth's second casting time. */
  alternateCastingTime: castingTimeSchema.optional(),
  ritual: z.boolean(),
  range: rangeSchema,
  components: componentsSchema,
  duration: durationSchema,
  description: proseSchema,
  /** The "Using a Higher-Level Spell Slot" paragraph, without its label. */
  higherLevel: proseSchema.optional(),
  /** The "Cantrip Upgrade" paragraph, without its label. */
  cantripUpgrade: proseSchema.optional(),
  tables: z.array(spellTableSchema).min(1).optional(),
  statBlocks: z.array(spellStatBlockSchema).min(1).optional(),
  attack: z.enum(["melee", "ranged"]).optional(),
  saves: z.array(saveSchema).min(1).optional(),
  damage: z.array(damageSchema).min(1).optional(),
  healing: healingSchema.optional(),
  /** Conditions the spell can give its targets, each linked like a damage roll where its sentence ties it to a hit or a failed save. */
  conditions: z.array(conditionLinkSchema).min(1).optional(),
  /** Conditions the spell gives the caster. */
  casterConditions: z.array(conditionIdSchema).min(1).optional(),
  /** Beams, darts or rays, each its own attack or hit: the base count, the count added per slot level above the spell's level, and the count at cantrip upgrade levels. */
  projectiles: z
    .strictObject({
      count: count,
      perSlot: count.optional(),
      cantrip: z.strictObject({ 5: count, 11: count, 17: count }).optional(),
    })
    .optional(),
  /** Creatures the spell can target for each slot level above the spell's level. */
  extraTargetsPerSlot: count.optional(),
  /** Armor Class the spell gives: a `bonus`, a `base` that adds the Dexterity modifier, or a `minimum`. */
  ac: z.strictObject({ bonus: count.optional(), base: count.optional(), minimum: count.optional() }).optional(),
  /** Dice or an amount added to, or with `subtract` taken from, the named rolls. */
  rollModifier: z
    .strictObject({
      dice: diceSchema.optional(),
      amount: count.optional(),
      subtract: z.literal(true).optional(),
      rolls: z.array(z.enum(["attack-roll", "saving-throw", "ability-check", "damage-roll"])).min(1),
    })
    .refine((modifier) => (modifier.dice === undefined) !== (modifier.amount === undefined), "give dice or an amount")
    .optional(),
  /** Dice taken off damage of the chosen type. */
  damageReduction: diceSchema.optional(),
  /** The increase to the Hit Point maximum, which the target also gains as Hit Points. `perSlotAmount` is added for each slot level above the spell's level. */
  hitPointMaximum: z.strictObject({ dice: diceSchema.optional(), amount: count.optional(), perSlotAmount: count.optional() }).optional(),
})
export type Spell = z.infer<typeof spellSchema>
