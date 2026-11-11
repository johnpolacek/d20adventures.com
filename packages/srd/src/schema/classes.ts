import { z } from "zod"
import { abilityIdSchema, classIdSchema, conditionIdSchema, damageTypeIdSchema, diceSchema, entryShape, feetSchema, idSchema, pageSchema, proseSchema, skillIdSchema } from "./common"

const levelSchema = z.number().int().min(1).max(20)
const countSchema = z.number().int().nonnegative()
const positiveSchema = z.number().int().positive()

// Core Traits

/** A weapon proficiency: every weapon of a category, or only those with one of the listed properties. */
const weaponProficiencySchema = z.strictObject({
  category: z.enum(["simple", "martial"]),
  withProperty: z
    .array(z.enum(["finesse", "light"]))
    .min(1)
    .optional(),
})

const armorTrainingSchema = z.array(z.enum(["light", "medium", "heavy", "shields"])).min(1)

/** Skills to choose. Without `from`, any skill. */
const skillChoiceSchema = z.strictObject({ count: positiveSchema, from: z.array(skillIdSchema).min(2).optional() })

/**
 * A kind of tool the text names without naming one tool: "artisans-tools" is any tool in the Artisan’s Tools group,
 * "musical-instrument" is any Musical Instrument.
 */
export const toolKindSchema = z.enum(["artisans-tools", "musical-instrument"])

/** A tool proficiency: one tool by equipment id, or a number chosen from tool kinds. */
const toolProficiencySchema = z.union([z.strictObject({ tool: idSchema }), z.strictObject({ choose: positiveSchema, from: z.array(toolKindSchema).min(1) })])

/** An item of a starting equipment option, by equipment id. `detail` is the printed qualifier, such as "Quarterstaff" or "of your choice". */
const startingItemSchema = z.union([
  z.strictObject({ item: idSchema, quantity: positiveSchema, detail: z.string().min(1).optional() }),
  z.strictObject({ anyOf: z.array(toolKindSchema).min(2), quantity: positiveSchema, detail: z.string().min(1).optional() }),
])

/** One lettered option of the Starting Equipment row. `gp` is the gold it includes. */
const startingEquipmentSchema = z.strictObject({ option: z.enum(["A", "B", "C"]), items: z.array(startingItemSchema).min(1).optional(), gp: positiveSchema })

/** What a multiclass character gains from the Core Traits table. Every class grants its Hit Point Die. */
const multiclassSchema = z.strictObject({
  hitPointDie: z.literal(true),
  weapons: z.array(weaponProficiencySchema).min(1).optional(),
  armor: armorTrainingSchema.optional(),
  skills: skillChoiceSchema.optional(),
  tools: z.array(toolProficiencySchema).min(1).optional(),
})

/** When a list of known or prepared spells may change, and how many at once. Without `count`, the whole list. */
const changeSchema = z.strictObject({ when: z.enum(["level-up", "long-rest"]), count: z.literal(1).optional() })

const spellListSchema = z.array(z.strictObject({ level: z.number().int().min(0).max(9), spells: z.array(idSchema).min(1) })).min(1)

const spellcastingSchema = z.strictObject({
  /** The feature that grants it: "Spellcasting", or "Pact Magic" for the Warlock. */
  feature: idSchema,
  ability: abilityIdSchema,
  /** Equipment ids usable as a Spellcasting Focus. */
  focus: z.array(idSchema).min(1),
  /** Expended slots return on a Long Rest, or on a Short or Long Rest (Pact Magic). */
  slotsRestore: z.enum(["long-rest", "short-rest"]),
  /** How class levels count toward the Multiclass Spellcaster table. Absent for Pact Magic, which keeps its own slots. */
  multiclassLevels: z.enum(["all", "half-round-up"]).optional(),
  changePrepared: changeSchema,
  changeCantrip: changeSchema.optional(),
  /** Ritual Adept: any Ritual spell in the spellbook can be cast as a Ritual without being prepared. */
  ritualFromSpellbook: z.literal(true).optional(),
  /** The class spell list as the class section prints it, spell ids by spell level. */
  spellList: spellListSchema,
})

// The class features table

/** One row of a class features table. Every column the class prints is a field. A "—" cell is left out, except in spell slot columns, where it is 0. */
export const classLevelSchema = z.strictObject({
  level: levelSchema,
  proficiencyBonus: z.number().int().min(2).max(6),
  /** Class feature ids gained at this level. */
  features: z.array(idSchema).min(1).optional(),
  /** The row lists "Subclass feature": the subclass grants features at this level. */
  subclassFeature: z.literal(true).optional(),
  rages: positiveSchema.optional(),
  rageDamage: positiveSchema.optional(),
  weaponMastery: positiveSchema.optional(),
  /** The Bardic Inspiration die size: 6 is a d6. */
  bardicDie: z.union([z.literal(6), z.literal(8), z.literal(10), z.literal(12)]).optional(),
  channelDivinity: positiveSchema.optional(),
  wildShape: positiveSchema.optional(),
  secondWind: positiveSchema.optional(),
  martialArts: diceSchema.optional(),
  focusPoints: positiveSchema.optional(),
  /** Feet added to Speed. */
  unarmoredMovement: feetSchema.optional(),
  favoredEnemy: positiveSchema.optional(),
  sneakAttack: diceSchema.optional(),
  sorceryPoints: positiveSchema.optional(),
  invocations: positiveSchema.optional(),
  cantrips: positiveSchema.optional(),
  preparedSpells: positiveSchema.optional(),
  /** Spell slots by spell level, index 0 is level 1. Half casters print five levels, full casters nine. */
  spellSlots: z.array(countSchema).min(5).max(9).optional(),
  /** Pact Magic: how many slots, all of `slotLevel`. */
  pactSlots: positiveSchema.optional(),
  slotLevel: z.number().int().min(1).max(5).optional(),
})
export type ClassLevel = z.infer<typeof classLevelSchema>

/** The class table columns a feature can count from, by field name. */
export const columnKeys = [
  "rages",
  "rageDamage",
  "weaponMastery",
  "bardicDie",
  "channelDivinity",
  "wildShape",
  "secondWind",
  "martialArts",
  "focusPoints",
  "unarmoredMovement",
  "favoredEnemy",
  "sneakAttack",
  "sorceryPoints",
  "invocations",
] as const

export const classSchema = z.strictObject({
  ...entryShape,
  id: classIdSchema,
  /** "Strength and Charisma" is `all`. "Strength or Dexterity" is `any`. Multiclassing needs 13 in these (page 24). */
  primaryAbility: z.union([z.strictObject({ all: z.array(abilityIdSchema).min(1) }), z.strictObject({ any: z.array(abilityIdSchema).min(2) })]),
  /** The Hit Point Die size: 12 is a d12. */
  hitDie: z.union([z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
  savingThrows: z.array(abilityIdSchema).length(2),
  skills: skillChoiceSchema,
  weapons: z.array(weaponProficiencySchema).min(1),
  armor: armorTrainingSchema.optional(),
  tools: z.array(toolProficiencySchema).min(1).optional(),
  startingEquipment: z.array(startingEquipmentSchema).min(2),
  multiclass: multiclassSchema,
  spellcasting: spellcastingSchema.optional(),
  levels: z.array(classLevelSchema).length(20),
  subclasses: z.array(idSchema).min(1),
  /** Boxed text the class section prints beside its features. */
  sidebars: z
    .array(z.strictObject({ name: z.string().min(1), page: pageSchema, text: proseSchema }))
    .min(1)
    .optional(),
})
export type Class = z.infer<typeof classSchema>

// Features

/** How many times a feature can be used, and what restores it. "short-rest" restores all uses on a Short or Long Rest. */
const usesSchema = z.strictObject({
  count: z.union([
    positiveSchema,
    /** A column of the class table. */
    z.strictObject({ column: z.enum(columnKeys) }),
    /** An ability modifier, at least 1. */
    z.strictObject({ ability: abilityIdSchema, minimum: z.literal(1) }),
    /** A count that steps up at the listed class levels. */
    z.strictObject({ byLevel: z.array(z.strictObject({ level: levelSchema, count: positiveSchema })).min(2) }),
  ]),
  recharge: z.enum(["short-rest", "long-rest"]),
  /** Uses regained on a Short Rest when `recharge` is "long-rest". */
  shortRestRegain: z.literal(1).optional(),
})

/** A resource a feature or option spends. */
const costSchema = z.strictObject({
  resource: z.enum(["bardic-inspiration", "channel-divinity", "focus-points", "rage", "second-wind", "sneak-attack-dice", "sorcery-points", "wild-shape"]),
  amount: positiveSchema,
})

/** A save DC: the spell save DC, a number, or 8 plus an ability modifier and the Proficiency Bonus. */
const dcSchema = z.union([z.literal("spell"), positiveSchema, z.strictObject({ ability: abilityIdSchema })])

/** A saving throw the feature forces. Without `dc`, the DC is the one the class sets in `saveDc` of another feature. */
const saveSchema = z.strictObject({ ability: abilityIdSchema, dc: dcSchema.optional() })

/**
 * Mechanics stated plainly in a feature's or option's text. Each field is checked against the official wording.
 * What is not here stays in the prose.
 */
const mechanicsShape = {
  activation: z.enum(["action", "bonus-action", "reaction", "magic-action", "no-action"]).optional(),
  uses: usesSchema.optional(),
  cost: costSchema.optional(),
  /** The main roll, such as the extra damage or the healing. */
  dice: diceSchema.optional(),
  /** `dice` from the listed class levels on. */
  diceByLevel: z
    .array(z.strictObject({ level: levelSchema, dice: diceSchema }))
    .min(1)
    .optional(),
  /** Damage types the feature deals or lets you choose from. */
  damageTypes: z.array(damageTypeIdSchema).min(1).optional(),
  save: saveSchema.optional(),
  /** The DC this feature sets for the saves its options and related features force. */
  saveDc: dcSchema.optional(),
  /** A pool of points: `perLevel` times the class level, restored by `recharge`. */
  pool: z.strictObject({ perLevel: positiveSchema, recharge: z.enum(["short-rest", "long-rest"]) }).optional(),
  range: feetSchema.optional(),
  area: z.strictObject({ shape: z.enum(["emanation", "sphere", "cube"]), size: feetSchema }).optional(),
  /** Attacks per Attack action. */
  attacks: z.number().int().min(2).max(4).optional(),
  /** Spells always prepared, by spell id. */
  alwaysPrepared: z.array(idSchema).min(1).optional(),
  /** Spells castable without a spell slot, by spell id. `uses` limits them where the text does. */
  freeCast: z.array(idSchema).min(1).optional(),
  /** A feat granted: one by id, or one of a category. `orAnother` allows another feat you qualify for. */
  feat: z
    .strictObject({
      id: idSchema.optional(),
      category: z.enum(["origin", "fighting-style", "epic-boon"]).optional(),
      recommended: idSchema.optional(),
      orAnother: z.literal(true).optional(),
    })
    .optional(),
  savingThrowProficiencies: z.array(abilityIdSchema).min(1).optional(),
  /** Skill proficiencies gained. Without `from`, any skill. */
  skillProficiencies: z.strictObject({ count: positiveSchema, from: z.array(skillIdSchema).min(2).optional() }).optional(),
  /** Skills in which you gain Expertise each time the feature is gained. */
  expertise: positiveSchema.optional(),
  /** Kinds of weapons whose mastery properties you can use, where no table column counts them. */
  weaponMasteries: positiveSchema.optional(),
  /** Feet added to Speed. */
  speedBonus: feetSchema.optional(),
  abilityIncrease: z.strictObject({ abilities: z.array(abilityIdSchema).min(1), amount: positiveSchema, maximum: positiveSchema }).optional(),
  /** Base Armor Class without armor: 10 plus the listed modifiers. */
  armorClass: z.strictObject({ base: z.literal(10), abilities: z.array(abilityIdSchema).length(2), shield: z.boolean().optional() }).optional(),
  /** The lowest d20 roll that scores a Critical Hit. */
  criticalRange: z.number().int().min(18).max(19).optional(),
  sense: z.strictObject({ type: z.enum(["blindsight", "truesight"]), range: feetSchema }).optional(),
  resistances: z.array(damageTypeIdSchema).min(1).optional(),
  conditionImmunities: z.array(conditionIdSchema).min(1).optional(),
} as const

/** A choice a feature offers: an effect, a style, an invocation, a Metamagic option. */
export const featureOptionSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1),
  page: pageSchema,
  description: proseSchema,
  /** As printed after "Prerequisite:", with the class level and invocation it names. */
  prerequisite: z.strictObject({ text: z.string().min(1), level: levelSchema.optional(), invocation: idSchema.optional() }).optional(),
  repeatable: z.literal(true).optional(),
  ...mechanicsShape,
})
export type FeatureOption = z.infer<typeof featureOptionSchema>

export const classFeatureSchema = z.strictObject({
  ...entryShape,
  class: classIdSchema,
  subclass: idSchema.optional(),
  /** The level of the feature's heading. */
  level: levelSchema,
  /** Every level at which the feature is gained: the class table rows that list it, or the levels its text names. */
  levels: z.array(levelSchema).min(1),
  description: proseSchema,
  options: z.array(featureOptionSchema).min(1).optional(),
  /** A later heading with the same name, such as Improved Brutal Strike at level 17. */
  laterText: z
    .array(z.strictObject({ level: levelSchema, page: pageSchema, description: proseSchema }))
    .min(1)
    .optional(),
  ...mechanicsShape,
  /** Wild Shape: the Beast Shapes table. `maxCr` is a number, 0.25 for 1/4. */
  forms: z
    .array(z.strictObject({ level: levelSchema, known: positiveSchema, maxCr: z.number().positive(), flySpeed: z.boolean() }))
    .min(1)
    .optional(),
  /** Font of Magic: the Creating Spell Slots table. */
  slotCreation: z
    .array(z.strictObject({ slotLevel: z.number().int().min(1).max(5), cost: positiveSchema, minLevel: levelSchema }))
    .min(1)
    .optional(),
  /** Mystic Arcanum: the spell level gained at each class level. */
  spellLevels: z
    .array(z.strictObject({ level: levelSchema, spellLevel: z.number().int().min(6).max(9) }))
    .min(1)
    .optional(),
  /** Nature’s Ward: the resistance for each land type. */
  landResistances: z
    .array(z.strictObject({ land: z.enum(["arid", "polar", "temperate", "tropical"]), damageType: damageTypeIdSchema }))
    .length(4)
    .optional(),
})
export type ClassFeature = z.infer<typeof classFeatureSchema>

// Subclasses

export const subclassSchema = z.strictObject({
  ...entryShape,
  class: classIdSchema,
  /** The class level at which the subclass is chosen. */
  level: levelSchema,
  tagline: z.string().min(1),
  description: proseSchema,
  features: z.array(z.strictObject({ level: levelSchema, features: z.array(idSchema).min(1) })).min(1),
  /** Spells always prepared from the class level on. Circle of the Land lists one set per land type. */
  alwaysPrepared: z
    .array(z.strictObject({ level: levelSchema, spells: z.array(idSchema).min(1), land: z.enum(["arid", "polar", "temperate", "tropical"]).optional() }))
    .min(1)
    .optional(),
})
export type Subclass = z.infer<typeof subclassSchema>
