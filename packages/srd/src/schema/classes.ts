import { z } from "zod"
import {
  abilityIdSchema,
  activationSchema,
  classIdSchema,
  conditionIdSchema,
  creatureTypeSchema,
  damageTypeIdSchema,
  diceSchema,
  entryShape,
  equipmentOptionSchema,
  feetSchema,
  forcedSaveShape,
  idSchema,
  pageSchema,
  proseSchema,
  rechargeSchema,
  saveDcSchema,
  skillIdSchema,
  usesCountSchema,
} from "./common"

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
 * A tool proficiency: one tool by equipment id, or a number chosen from kinds of tools. A kind is an equipment id
 * too: "musical-instrument" is the tool whose variants are the instruments, "artisans-tools" every Artisan’s Tools.
 */
const toolProficiencySchema = z.union([z.strictObject({ tool: idSchema }), z.strictObject({ choose: positiveSchema, from: z.array(idSchema).min(1) })])

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
  /**
   * Equipment ids usable as a Spellcasting Focus. One exception: the Wizard's "spellbook" has no equipment entry,
   * because the SRD prints no Spellbook in its equipment lists. The reference check waives it on purpose.
   */
  focus: z.array(idSchema).min(1),
  /** Expended slots return on a Long Rest, or on a Short or Long Rest (Pact Magic). */
  slotsRestore: rechargeSchema,
  /** How class levels count toward the Multiclass Spellcaster table. Absent for Pact Magic, which keeps its own slots. */
  multiclassLevels: z.enum(["all", "half-round-up"]).optional(),
  changePrepared: changeSchema,
  changeCantrip: changeSchema.optional(),
  /** Ritual Adept: any Ritual spell in the spellbook can be cast as a Ritual without being prepared. */
  ritualFromSpellbook: z.literal(true).optional(),
  /**
   * The class spell list, spell ids by spell level: the list the class section prints, plus any spell whose own
   * header in “Spells” names the class where the printed list omits it (Phantasmal Force, Mind Spike). Where the text
   * contradicts itself, the spell’s own block wins.
   */
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
  /**
   * Starting equipment, by equipment id. One exception: the Wizard's "spellbook" has no equipment entry, because the
   * SRD prints no Spellbook in its equipment lists. The reference check waives it on purpose.
   */
  startingEquipment: z.array(equipmentOptionSchema).min(2),
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

/** How many times a feature can be used, and what restores it. */
const usesSchema = z.strictObject({
  count: z.union([
    /** A number, the Proficiency Bonus, or an ability modifier of at least 1. */
    usesCountSchema,
    /** A column of the class table. */
    z.strictObject({ column: z.enum(columnKeys) }),
    /** A count that steps up at the listed class levels. */
    z.strictObject({ byLevel: z.array(z.strictObject({ level: levelSchema, count: positiveSchema })).min(2) }),
  ]),
  /** "spell": the count is for each spell the feature names, as with Mystic Arcanum and Signature Spells. */
  per: z.literal("spell").optional(),
  recharge: rechargeSchema,
  /** Uses regained on a Short Rest when `recharge` is "long-rest". */
  shortRestRegain: z.literal(1).optional(),
  /**
   * A second way to restore the use: spending this resource, as Intimidating Presence’s "unless you expend a use of
   * your Rage (no action required) to restore your use of it". A spell slot names its level in `slotLevel`.
   */
  restoredBy: z
    .strictObject({
      resource: z.enum(["rage", "sorcery-points", "spell-slot", "pact-magic-slot"]),
      amount: positiveSchema,
      /** The spell slot level the text names: exactly that level, not a minimum ("a level 5 spell slot"). */
      slotLevel: z.number().int().min(1).max(9).optional(),
    })
    .optional(),
  /** A later feature changes the recharge from this class level on, as Font of Inspiration does at level 5. */
  rechargeByLevel: z
    .array(z.strictObject({ level: levelSchema, recharge: rechargeSchema }))
    .min(1)
    .optional(),
})

/** A class resource a feature or option spends, such as Focus Points. Not money. */
const resourceCostSchema = z.strictObject({
  resource: z.enum(["bardic-inspiration", "channel-divinity", "focus-points", "rage", "second-wind", "sneak-attack-dice", "sorcery-points", "wild-shape"]),
  amount: positiveSchema,
  /** The text says the resource isn’t expended if the roll it boosts still fails. */
  keptOnFailure: z.literal(true).optional(),
})

/** The official words of a condition a typed value holds under: one unbroken span of the text. */
const appliesWhenSchema = z.string().min(1)

/**
 * A condition a passive benefit holds under, as the text states it. "raging": while your Rage is active.
 * "no-heavy-armor": while you aren’t wearing Heavy armor. "in-aura-of-protection": while in your Aura of Protection.
 */
const whileSchema = z.enum(["raging", "no-heavy-armor", "in-aura-of-protection"])

/**
 * Mechanics stated plainly in a feature's or option's text. Each field is checked against the official wording.
 * What is not here stays in the prose.
 *
 * Standing and triggered values. `attacks`, `pactWeaponAttacks`, `criticalHit`, `freeCast`, `speedBonus` and
 * `armorClass` are standing: they hold whenever the character has the feature, so any limit the text puts on them
 * (one weapon, on yourself, only in Dim Light) is typed. `dice`, `damageTypes` and `save` are triggered: they
 * describe what happens when the feature takes effect, and the feature's own text says when that is (which hit,
 * which weapon, which action), so the trigger is not repeated on them. A further condition on the target, or a
 * choice within the feature, is still a condition and is carried (`appliesWhen`, `onlyCreatureTypes`, `selective`),
 * or the value is not typed. What a familiar or summoned creature does is not typed on the feature.
 */
const mechanicsShape = {
  /**
   * The kinds of action it takes to use the feature, including "no-action" where using it takes none. An action, or
   * "no action required", that only ends or moves an effect already in place, or restores a use of this same feature,
   * is not listed: Quivering Palm's ending of the vibrations, Nature's Sanctuary's Bonus Action to move the Cube,
   * Intimidating Presence's "(no action required)" to restore its use, which `uses.restoredBy` holds.
   */
  activation: activationSchema.optional(),
  uses: usesSchema.optional(),
  spend: resourceCostSchema.optional(),
  /**
   * The main roll, such as the extra damage or the healing, rolled each time the feature takes effect as its own
   * text sets out (on the hit it names, once per turn where it says so). A roll that needs a further condition on
   * the target ("if it’s missing any of its Hit Points") is not typed.
   */
  dice: diceSchema.optional(),
  /** The main roll is the die of a class table column, such as the Martial Arts die or Sneak Attack. */
  diceFromColumn: z.enum(["martialArts", "sneakAttack"]).optional(),
  /** `dice` from the listed class levels on. */
  diceByLevel: z
    .array(z.strictObject({ level: levelSchema, dice: diceSchema }))
    .min(1)
    .optional(),
  /** Added to `dice` for each level of the spell slot expended, as Eldritch Smite’s "another 1d8 per level of the spell slot". */
  dicePerSlotLevel: diceSchema.optional(),
  /** What the text adds to the roll: an ability modifier, or "class-level" for your level in the class. */
  rollAdds: z
    .array(z.union([abilityIdSchema, z.literal("class-level")]))
    .min(1)
    .optional(),
  /** Damage types the feature deals or lets you choose from. */
  damageTypes: z.array(damageTypeIdSchema).min(1).optional(),
  /** Creature types the damage is not dealt to, as Hurl Through Hell’s "if it isn’t a Fiend". */
  damageNotTo: z.array(creatureTypeSchema).min(1).optional(),
  /** The only creature types the damage is dealt to, as Sear Undead’s "Each Undead that fails its saving throw". */
  damageOnlyTo: z.array(creatureTypeSchema).min(1).optional(),
  /**
   * A saving throw the feature forces. Without `dc`, the DC is the one `saveDc` of another feature of the class sets.
   * `onlyCreatureTypes`: only creatures of these types make it. `selective`: you choose which creatures make it, where
   * the feature has no `area` to carry the choice (an `area` with `selective` covers the save made in it).
   * `appliesWhen`: the official words of the condition under which it is forced.
   */
  save: z
    .strictObject({
      ...forcedSaveShape,
      onlyCreatureTypes: z.array(creatureTypeSchema).min(1).optional(),
      selective: z.literal(true).optional(),
      appliesWhen: appliesWhenSchema.optional(),
    })
    .optional(),
  /** A saving throw you make yourself, with a DC that rises with each use until a rest resets it (Relentless Rage). */
  selfSave: z.strictObject({ ability: abilityIdSchema, dc: positiveSchema, increasePerUse: positiveSchema.optional(), resetOn: rechargeSchema.optional() }).optional(),
  /**
   * Damage the feature deals to you between Long Rests (Overchannel). The first use deals none. The second deals
   * `dicePerSlotLevel` for each level of the spell slot. Each use after the second adds `increaseAfterSecondUse` more
   * per slot level: 2d12 on the second use, 3d12 on the third, 4d12 on the fourth.
   */
  selfDamage: z.strictObject({ from: z.literal("second-use"), dicePerSlotLevel: diceSchema, damageType: damageTypeIdSchema, increaseAfterSecondUse: diceSchema }).optional(),
  /** Added to your Hit Point maximum when you gain the feature, and more each time you gain another level in the class (Draconic Resilience). */
  hitPointMaximum: z.strictObject({ increase: positiveSchema, perLaterClassLevel: positiveSchema }).optional(),
  /** The DC this feature sets for the saves its options and related features force. */
  saveDc: saveDcSchema.optional(),
  /** A pool of points: `perLevel` times the class level, restored by `recharge`. */
  pool: z.strictObject({ perLevel: positiveSchema, recharge: rechargeSchema }).optional(),
  /** The one distance from you the text names ("within 60 feet of yourself"). Left out where the text names none, or several. */
  range: feetSchema.optional(),
  /**
   * The area the feature affects. `selective`: you choose which creatures in it are affected ("each creature of your
   * choice in"). `allies`: its benefit is for you and your allies only ("You and your allies in the aura").
   */
  area: z.strictObject({ shape: z.enum(["emanation", "sphere", "cube"]), size: feetSchema, selective: z.literal(true).optional(), allies: z.literal(true).optional() }).optional(),
  /** Attacks per Attack action, with any weapon. */
  attacks: z.number().int().min(2).max(4).optional(),
  /** Attacks per Attack action with your pact weapon only (Thirsting Blade, Devouring Blade). */
  pactWeaponAttacks: z.number().int().min(2).max(3).optional(),
  /** Spells always prepared, by spell id. */
  alwaysPrepared: z.array(idSchema).min(1).optional(),
  /**
   * Spells castable without a spell slot. `selfOnly`: only on yourself. `appliesWhen`: the official words of the
   * condition the slotless casting holds under. `uses` limits them where the text does.
   */
  freeCast: z
    .array(z.strictObject({ spell: idSchema, selfOnly: z.literal(true).optional(), appliesWhen: appliesWhenSchema.optional() }))
    .min(1)
    .optional(),
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
  /** Expertise gained each time the feature is gained: how many skills, and the skills to choose from where the text limits them. */
  expertise: z.strictObject({ count: positiveSchema, from: z.array(skillIdSchema).min(2).optional() }).optional(),
  /** Kinds of weapons whose mastery properties you can use, where no table column counts them. */
  weaponMasteries: positiveSchema.optional(),
  /** Feet added to Speed, and the condition it holds under. */
  speedBonus: z.strictObject({ feet: feetSchema, while: whileSchema.optional() }).optional(),
  abilityIncrease: z.strictObject({ abilities: z.array(abilityIdSchema).min(1), amount: positiveSchema, maximum: positiveSchema }).optional(),
  /** Base Armor Class without armor: 10 plus the listed modifiers. */
  armorClass: z.strictObject({ base: z.literal(10), abilities: z.array(abilityIdSchema).length(2), shield: z.boolean().optional() }).optional(),
  /** The lowest d20 roll that scores a Critical Hit, on the attacks named: attack rolls with weapons and Unarmed Strikes (Champion). */
  criticalHit: z.strictObject({ minRoll: z.number().int().min(18).max(19), attacks: z.literal("weapons-and-unarmed-strikes") }).optional(),
  sense: z.strictObject({ type: z.enum(["blindsight", "truesight"]), range: feetSchema }).optional(),
  /** Resistances, and the condition they hold under. */
  resistances: z.strictObject({ damageTypes: z.array(damageTypeIdSchema).min(1), while: whileSchema.optional() }).optional(),
  /** Condition immunities, the condition they hold under, and whether your allies share them. */
  conditionImmunities: z.strictObject({ conditions: z.array(conditionIdSchema).min(1), while: whileSchema.optional(), allies: z.literal(true).optional() }).optional(),
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
