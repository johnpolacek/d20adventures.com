import { z } from "zod"
import {
  bonusTargetSchema,
  classIdSchema,
  conditionIdSchema,
  costSchema,
  damageRollShape,
  damageTypeIdSchema,
  diceSchema,
  entryShape,
  feetSchema,
  forcedSaveShape,
  isDiceOrAmount,
  oncePerTurnSchema,
  proseSchema,
  saveDcSchema,
  schoolIdSchema,
  spanShape,
} from "./common"

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
  /** The caster chooses which creatures in the region are affected or spared ("up to six creatures of your choice in"). */
  selective: z.literal(true).optional(),
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
 * One saving throw the spell has a creature make, in text order. A first save and a repeated save are two entries, and
 * so are saves that differ in ability, moment, outcome or what they guard. `label` is the printed name of the option,
 * effect or table rows the save belongs to (Symbol's Death, Discord, Fear …; a Prismatic row). `dc` is the
 * caster's spell save DC unless the text prints a number.
 *
 * `when`: "initial" decides whether the effect lands, when the spell takes effect or when a creature enters an area or
 * ends its turn there. "end-of-turn" and "start-of-turn" are repeated saves at the end or start of each of the
 * affected creature's own turns, "on-damage" when it takes damage, "action" when it uses an action to repeat it, and
 * "later" any other stated time, including a single save at the start of the caster's next turn and saves at a time set
 * by the caster's turns ("at the end of each of your turns").
 *
 * `onSuccess`: "none" when a success means the creature is not affected or takes no damage (for an initial save, even
 * where the text adds that the spell then ends), "half" when it takes half
 * damage, "ends" when it ends the spell or the effect on that creature, "other" for any other stated outcome, including
 * a count of successes to reach. `target` is set only where the caster makes the save.
 *
 * `appliesWhen` and `unless` hold the official words of a condition the save is made under, or not made under (Fear's
 * repeated save: "If the creature ends its turn in a space where it doesn’t have line of sight to you"). A save made by
 * a creature other than the spell's targets (Holy Aura's Fiend or Undead attacker) carries the words that say who.
 */
export const saveSchema = z.strictObject({
  ...forcedSaveShape,
  dc: saveDcSchema,
  ...spanShape,
  label: z.string().min(1).optional(),
  when: z.enum(["initial", "end-of-turn", "start-of-turn", "on-damage", "action", "later"]),
  onSuccess: z.enum(["none", "half", "ends", "other"]),
  target: targetSchema.optional(),
  /** "any-turn": a creature makes this save at most once during each turn, whoever's turn it is ("A creature makes this save only once per turn"). */
  oncePerTurn: oncePerTurnSchema.optional(),
  /**
   * The words of when the save is made, only where nothing linked to the save can carry them: a save that guards no
   * typed roll or condition (Contagion's "Whenever the Poisoned target receives an effect that would end the Poisoned
   * condition"). Where a roll or condition is linked, the time is that entry's `timing` instead.
   */
  timing: z.string().min(1).optional(),
})
export type Save = z.infer<typeof saveSchema>

/** Damage at the cantrip upgrade levels, as printed: "levels 5 (2d6), 11 (3d6), and 17 (4d6)". */
const cantripDiceSchema = z.strictObject({ 5: diceSchema, 11: diceSchema, 17: diceSchema })

/** The words of when a roll is dealt or an effect happens, where that is not the moment the spell takes effect ("At the start of each of its turns"). One unbroken span of the entry's text. */
const timingSchema = z.string().min(1)

/**
 * One distinct damage roll the text states, in text order, as `dice` or a fixed `amount`. A roll dealt again on a
 * different save or at a different time is its own entry; only a restatement with the same save and time is not.
 * Several `types` mean one of them, chosen as the text says, or by the row of the table `table` names. `modifier` adds
 * the caster's spellcasting ability modifier. `perSlot` is the dice added per slot level above the spell's level, on
 * the roll its sentence names. `target` is set where the damage falls on the caster. `label` is the printed name of
 * the option or table row the roll belongs to.
 *
 * Links are by meaning, not by sentence: `trigger: "failed-save"` with `save` (an index into `saves`) where the roll is
 * dealt on that failed save, even when the save is stated a sentence earlier; `trigger: "hit"` where it is dealt when
 * an attack by the creature the spell arms hits ("when you hit", "whenever you hit it with an attack roll"). Damage to
 * a creature because it hits the caster (Fire Shield) is not a hit of the spell's. A linked roll takes its save's
 * `onSuccess` unless it carries its own ("none" where a success avoids this roll though it halves another: Vitriolic
 * Sphere's later 5d4).
 *
 * `appliesWhen` and `unless` hold the official words of any other condition the roll needs or is withheld under
 * (Power Word Kill's 12d12 is dealt `unless` "If the target has 100 Hit Points or fewer"). `timing` holds the words of
 * when it is dealt where that is later or repeated ("at the end of its next turn"). A roll with none of `appliesWhen`,
 * `unless`, `timing`, `trigger` and `save` is dealt once, when the spell takes effect.
 */
export const damageSchema = z
  .strictObject({
    ...damageRollShape,
    types: z.array(damageTypeIdSchema).min(1),
    modifier: z.literal(true).optional(),
    perSlot: diceSchema.optional(),
    cantrip: cantripDiceSchema.optional(),
    table: z.string().min(1).optional(),
    target: targetSchema.optional(),
    trigger: z.enum(["hit", "failed-save"]).optional(),
    save: z.number().int().nonnegative().optional(),
    onSuccess: z.enum(["none", "half"]).optional(),
    label: z.string().min(1).optional(),
    ...spanShape,
    timing: timingSchema.optional(),
  })
  .refine(isDiceOrAmount, "give dice or an amount")
export type Damage = z.infer<typeof damageSchema>

/**
 * Hit Points each target regains, as dice or as a fixed `amount`. `temporary` marks Temporary Hit Points. `perSlot` and
 * `perSlotAmount` are added for each slot level above the spell's level. A pool shared out among targets is not typed.
 * `label` names the option it belongs to (Conjure Celestial's Healing Light). `appliesWhen`, `unless` and `timing` carry
 * the words that limit it or say when it happens ("If an ally with 0 Hit Points starts its turn in the aura").
 */
export const healingSchema = z.strictObject({
  dice: diceSchema.optional(),
  amount: count.optional(),
  modifier: z.literal(true).optional(),
  temporary: z.literal(true).optional(),
  perSlot: diceSchema.optional(),
  perSlotAmount: count.optional(),
  label: z.string().min(1).optional(),
  ...spanShape,
  timing: timingSchema.optional(),
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

/**
 * A condition the spell gives, once for each distinct way it gives it, in text order. Linked by meaning like a damage
 * roll: `trigger: "failed-save"` with `save` where one failed save applies it, `trigger: "hit"` where a hit does. A
 * condition applied only after several failures, or under another stated condition, carries `appliesWhen` (or
 * `unless`), the official words that say when it applies. `target: "caster"` where the caster gets it. A condition on
 * a creature that is neither a target nor the caster carries the words that say who. `label` is the printed name of
 * the option or table row it belongs to.
 */
export const conditionLinkSchema = z.strictObject({
  condition: conditionIdSchema,
  target: z.literal("caster").optional(),
  trigger: z.enum(["hit", "failed-save"]).optional(),
  save: z.number().int().nonnegative().optional(),
  label: z.string().min(1).optional(),
  ...spanShape,
  /** The words of when the condition is given, where that is not when the spell takes effect: the save that gives it is made on entering an area or at the start or end of a turn there ("When a creature enters the Cylinder for the first time on a turn or starts its turn there"). */
  timing: z.string().min(1).optional(),
})

/** The kinds of effect whose typed list does not hold everything the text states. An engine reads the prose for these. */
export const untypedKinds = ["saves", "damage", "conditions", "healing"] as const

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
  /**
   * "melee" or "ranged" where the spell has the caster make a melee or ranged spell attack. The attack may belong to one
   * labelled option only (Arcane Hand's Clenched Fist); the damage roll it deals carries that `label` and the hit link.
   */
  attack: z.enum(["melee", "ranged"]).optional(),
  saves: z.array(saveSchema).min(1).optional(),
  damage: z.array(damageSchema).min(1).optional(),
  healing: healingSchema.optional(),
  /** Conditions the spell gives, each linked like a damage roll where the text ties it to a hit or a failed save. */
  conditions: z.array(conditionLinkSchema).min(1).optional(),
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
  /** Armor Class the spell gives: a `bonus`, a `base` that adds the Dexterity modifier, or a `minimum`, with the words that limit it. */
  ac: z.strictObject({ bonus: count.optional(), base: count.optional(), minimum: count.optional(), ...spanShape }).optional(),
  /**
   * Dice or an amount added to, or with `subtract` taken from, the rolls `to` names, in the words magic item bonuses
   * use (`attack-rolls`, `saving-throws`, `stealth-checks`). `appliesWhen` and `unless` carry the words that limit it
   * ("using the chosen skill").
   */
  rollModifier: z
    .strictObject({
      dice: diceSchema.optional(),
      amount: count.optional(),
      subtract: z.literal(true).optional(),
      to: z.array(bonusTargetSchema).min(1),
      ...spanShape,
    })
    .refine((modifier) => (modifier.dice === undefined) !== (modifier.amount === undefined), "give dice or an amount")
    .optional(),
  /** Dice taken off damage of the chosen type: `timing` for when it applies ("When the creature takes damage of the chosen type before the spell ends"), `appliesWhen`/`unless` for a limit, and `oncePerTurn` where it applies at most once each turn ("A creature can benefit from this spell only once per turn"). */
  damageReduction: z.strictObject({ dice: diceSchema, ...spanShape, timing: z.string().min(1).optional(), oncePerTurn: oncePerTurnSchema.optional() }).optional(),
  /** The increase to the Hit Point maximum, which the target also gains as Hit Points. `perSlotAmount` is added for each slot level above the spell's level. */
  hitPointMaximum: z.strictObject({ dice: diceSchema.optional(), amount: count.optional(), perSlotAmount: count.optional() }).optional(),
  /** Each kind of effect the typed lists do not fully hold. See `untypedKinds`. */
  untyped: z.array(z.enum(untypedKinds)).min(1).optional(),
})
export type Spell = z.infer<typeof spellSchema>
