import { z } from "zod"

/** Lowercase words joined by hyphens: "fireball", "adult-red-dragon". Stable, and used for every cross reference. */
export const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export const abilityIds = ["str", "dex", "con", "int", "wis", "cha"] as const
export const abilityIdSchema = z.enum(abilityIds)
export type AbilityId = z.infer<typeof abilityIdSchema>

export const skillIds = [
  "acrobatics",
  "animal-handling",
  "arcana",
  "athletics",
  "deception",
  "history",
  "insight",
  "intimidation",
  "investigation",
  "medicine",
  "nature",
  "perception",
  "performance",
  "persuasion",
  "religion",
  "sleight-of-hand",
  "stealth",
  "survival",
] as const
export const skillIdSchema = z.enum(skillIds)
export type SkillId = z.infer<typeof skillIdSchema>

export const damageTypeIds = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"] as const
export const damageTypeIdSchema = z.enum(damageTypeIds)
export type DamageTypeId = z.infer<typeof damageTypeIdSchema>

export const conditionIds = [
  "blinded",
  "charmed",
  "deafened",
  "exhaustion",
  "frightened",
  "grappled",
  "incapacitated",
  "invisible",
  "paralyzed",
  "petrified",
  "poisoned",
  "prone",
  "restrained",
  "stunned",
  "unconscious",
] as const
export const conditionIdSchema = z.enum(conditionIds)
export type ConditionId = z.infer<typeof conditionIdSchema>

export const classIds = ["barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"] as const
export const classIdSchema = z.enum(classIds)
export type ClassId = z.infer<typeof classIdSchema>

export const schoolIds = ["abjuration", "conjuration", "divination", "enchantment", "evocation", "illusion", "necromancy", "transmutation"] as const
export const schoolIdSchema = z.enum(schoolIds)
export type SchoolId = z.infer<typeof schoolIdSchema>

export const creatureTypes = ["aberration", "beast", "celestial", "construct", "dragon", "elemental", "fey", "fiend", "giant", "humanoid", "monstrosity", "ooze", "plant", "undead"] as const
export const creatureTypeSchema = z.enum(creatureTypes)
export type CreatureType = z.infer<typeof creatureTypeSchema>

export const sizes = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"] as const
export const sizeSchema = z.enum(sizes)
export type Size = z.infer<typeof sizeSchema>

/** Dice as the SRD writes them, with ASCII signs and single spaces: "1d8", "20d10 + 40", "2d6 - 1". */
export const diceSchema = z.string().regex(/^\d+d\d+(?: [+-] \d+)?$/)

/** A distance in feet. */
export const feetSchema = z.number().int().nonnegative()

export const coins = ["cp", "sp", "ep", "gp", "pp"] as const
export const costSchema = z.strictObject({ amount: z.number().nonnegative(), unit: z.enum(coins) })
export type Cost = z.infer<typeof costSchema>

/**
 * What restores a spent use, in the SRD's own terms. "short-or-long-rest" is "when you finish a Short or Long
 * Rest". "short-rest" is only for text that names the Short Rest alone.
 */
export const recharges = ["short-rest", "short-or-long-rest", "long-rest", "dawn", "start-of-next-turn", "initiative-or-short-or-long-rest"] as const
export const rechargeSchema = z.enum(recharges)
export type Recharge = z.infer<typeof rechargeSchema>

/** The kinds of action the rules name. "no-action" is for text that says a thing takes no action. */
export const actionKinds = ["action", "bonus-action", "reaction", "magic-action", "utilize-action", "no-action"] as const
export const actionKindSchema = z.enum(actionKinds)
export type ActionKind = z.infer<typeof actionKindSchema>

/** How a feature, trait or item is used: every kind of action its text names for it. Always a list, even of one. */
export const activationSchema = z.array(actionKindSchema).min(1)

/**
 * The DC of a saving throw something forces: a printed number, the user's spell save DC, or 8 plus an ability
 * modifier and the Proficiency Bonus. `plusModifierOf` names that ability, a choice of abilities, or
 * "attack-ability" for the ability used for the attack roll.
 */
export const saveDcSchema = z.union([
  z.number().int().positive(),
  z.literal("spell-save-dc"),
  z.strictObject({ plusModifierOf: z.union([abilityIdSchema, z.array(abilityIdSchema).min(2), z.literal("attack-ability")]) }),
])
export type SaveDc = z.infer<typeof saveDcSchema>

/**
 * The core of every typed saving throw: `ability` and `dc`. A category adds its own outcome fields beside them.
 * `dc` is left out only where another entry sets it, and that schema says which.
 */
export const forcedSaveShape = { ability: abilityIdSchema, dc: saveDcSchema.optional() } as const

/**
 * How many times a thing can be used between recharges, where the count needs no table: a number, the user's
 * Proficiency Bonus, or an ability modifier with a minimum of 1. A category with other counts adds them to this.
 */
export const usesCountSchema = z.union([z.number().int().positive(), z.literal("proficiency-bonus"), z.strictObject({ ability: abilityIdSchema, minimum: z.literal(1) })])

/**
 * The core of every typed damage roll: `dice`, or a fixed `amount` where the text gives a number with no dice.
 * Exactly one is set, which `isDiceOrAmount` tests. A category adds the damage type and its own fields beside them.
 */
export const damageRollShape = { dice: diceSchema.optional(), amount: z.number().int().positive().optional() } as const
export const isDiceOrAmount = (roll: { dice?: string; amount?: number }) => (roll.dice === undefined) !== (roll.amount === undefined)

/**
 * One line of a starting equipment option: an item, or a choice of one item from a group.
 * Exactly one of `item` and `chooseFrom` is set.
 */
export const startingItemSchema = z
  .strictObject({
    /** An equipment id. */
    item: idSchema.optional(),
    /** One item of the player's choice from these equipment groups or kinds of tool, such as "musical-instrument". */
    chooseFrom: z.array(idSchema).min(1).optional(),
    quantity: z.number().int().positive(),
    /** Ammunition is sold in bundles. "single" says `quantity` counts single pieces, so 20 arrows are one bundle of 20. */
    unit: z.literal("single").optional(),
    /** The qualifier the text prints in parentheses, such as "crystal" or "occult lore". */
    note: z.string().min(1).optional(),
  })
  .refine((line) => (line.item === undefined) !== (line.chooseFrom === undefined), "set exactly one of item and chooseFrom")
export type StartingItem = z.infer<typeof startingItemSchema>

/** One lettered option of starting equipment, for a class or a background: its items and the money it includes. */
export const equipmentOptionSchema = z.strictObject({
  option: z.enum(["A", "B", "C"]),
  items: z.array(startingItemSchema).min(1).optional(),
  money: costSchema.optional(),
})
export type EquipmentOption = z.infer<typeof equipmentOptionSchema>

/** A page of the official SRD 5.2.1 PDF, 1 to 364. The printed page number and the PDF page are the same. */
export const pageSchema = z.number().int().min(1).max(364)

/**
 * What every entry carries. `page` is the page of the official PDF where the entry's own text begins, so any
 * value can be traced to its source. Extend it with `entryShape` spread into a z.strictObject.
 */
export const entryShape = {
  id: idSchema,
  name: z.string().min(1),
  page: pageSchema,
} as const

/** A target's Speed, not the user's, is reduced by `feet` until the start of the user's next turn ("reduce its Speed by 10 feet until the start of your next turn"). */
export const targetSpeedReductionSchema = z.strictObject({
  feet: feetSchema,
  until: z.literal("start-of-user-next-turn"),
  /** The most the target's Speed drops in total when hit more than once by weapons that give this reduction ("doesn’t exceed 10 feet"). */
  capAcrossHits: feetSchema.optional(),
})

/** Body text in the SRD's own words. Paragraphs are separated by one "\n". Apostrophes and quotes are typographic (’ “ ”), as printed. */
export const proseSchema = z
  .string()
  .min(1)
  .refine((text) => !/['"]/.test(text), "use typographic quotes (’ “ ”), as the SRD prints them")
  .refine((text) => text === text.trim() && !/\n\s*\n| {2,}|\n /.test(text), "one newline between paragraphs, no doubled or leading spaces")

// ---------------------------------------------------------------------------------------------------------
// Shared effect shapes. A category that types one of these ideas uses the shape and the field name given here.

/**
 * One unbroken span of the entry's own text, in its official words, that states a limit on a typed value.
 * `appliesWhen`: the value holds only when this is true ("while you aren’t wearing armor or wielding a Shield").
 * `unless`: the value does not hold when this is true. Use a typed field instead where one exists for the limit
 * (`targetLimitShape`, `whileSchema`, `activation`, `uses`). Spread into any object that holds a typed effect.
 */
export const spanShape = { appliesWhen: z.string().min(1).optional(), unless: z.string().min(1).optional() } as const

/**
 * `whileSchema`: a standing condition some benefits hold under, as the text states it. "raging": while your Rage is
 * active. "no-heavy-armor": while you aren’t wearing Heavy armor. "in-aura-of-protection": while in your Aura of Protection.
 */
export const whileSchema = z.enum(["raging", "no-heavy-armor", "in-aura-of-protection"])

export const senseTypes = ["darkvision", "blindsight", "tremorsense", "truesight"] as const

/**
 * Field name `senses`. The senses the character has, one entry for each: its type and its range in feet. The senses
 * belong to the character. A limit on one sense (it works only on stone, only for a time) sits on that entry in
 * `appliesWhen`, and the entry's duration is the feature's own `durationMinutes` where it has one.
 */
export const sensesSchema = z.array(z.strictObject({ type: z.enum(senseTypes), range: feetSchema, ...spanShape })).min(1)

/** Field name `onSuccess`, beside `forcedSaveShape`. What a successful save does: "none" (not affected, no damage), "half" (half damage), "other" (anything else the text states). */
export const saveOutcomeSchema = z.enum(["none", "half", "other"])

/**
 * Typed limits on which targets an effect affects, beside the effect, on the same object. `targetMaxSize`: only
 * targets of this size or smaller ("a Large or smaller creature"). `onlyCreatureTypes`: only creatures of these
 * types. `notCreatureTypes`: creatures of these types are not affected ("if it isn’t a Fiend"). A limit that is
 * none of these goes in `appliesWhen`, never one of these and `appliesWhen` for the same fact.
 */
export const targetLimitShape = {
  targetMaxSize: sizeSchema.optional(),
  onlyCreatureTypes: z.array(creatureTypeSchema).min(1).optional(),
  notCreatureTypes: z.array(creatureTypeSchema).min(1).optional(),
} as const

/**
 * Field name `oncePerTurn`. How often the effect can happen, as the text says. The two printed forms differ in play:
 * "any-turn" is "once per turn" or "only once per turn": at most once during each turn, whoever's turn it is, so it
 * can happen again on another creature's turn (a Sneak Attack on an Opportunity Attack). "own-turn" is "once on each
 * of your turns" or "once on a turn" said of the user's own turn: at most once, and only on the user's own turns.
 * Absent where the text sets no such limit.
 */
export const oncePerTurnSchema = z.enum(["any-turn", "own-turn"])

/**
 * Field name `hitPointMaximum`. The user's Hit Point maximum rises by `increase`, and by `perLevel` more each time the
 * user gains a level. `levelsCounted`: "character" for any level, "class" for a level in the class that gave the feature.
 */
export const hitPointMaximumSchema = z.strictObject({
  increase: z.number().int().positive(),
  perLevel: z.number().int().positive(),
  levelsCounted: z.enum(["character", "class"]),
})

/**
 * Field name `damage`. Damage the effect deals to its target, or to the creature that triggers it: `dice` or a fixed
 * `amount` (not both, and neither where the text only names the type), and `types`, which is one type, or the
 * types the user may choose from. Healing and other rolls that are not damage are not this shape.
 * `orNormalType` is set where the user may instead keep the attack's normal damage type ("its normal damage type"),
 * so `types` alone does not read as replacing it.
 * `timing` is the official words of when the damage is dealt, where that is later than the use of the thing itself
 * ("When you end them"). It is one unbroken span of the entry's text.
 * A limit on which targets take the damage (`targetMaxSize`, `onlyCreatureTypes`, `notCreatureTypes`) sits on the damage
 * itself, so it does not read as limiting a save or a condition beside it.
 */
export const damageEffectSchema = z
  .strictObject({ ...damageRollShape, types: z.array(damageTypeIdSchema).min(1), orNormalType: z.literal(true).optional(), timing: z.string().min(1).optional(), ...targetLimitShape, ...spanShape })
  .refine((damage) => damage.dice === undefined || damage.amount === undefined, "dice or amount, not both")

/**
 * Field name `feat`. A feat the feature gives: one by `id`, or one of a `category`. `recommended`: the feat the text
 * recommends. `orAnother`: any other feat the character qualifies for is allowed. `spellList`: Magic Initiate’s spell list.
 */
export const featGrantSchema = z.strictObject({
  id: idSchema.optional(),
  category: z.enum(["origin", "general", "fighting-style", "epic-boon"]).optional(),
  recommended: idSchema.optional(),
  orAnother: z.literal(true).optional(),
  spellList: classIdSchema.optional(),
})

/**
 * Field name `repeatable`. The thing can be taken more than once. `text`: the official words of its Repeatable
 * paragraph. `differentSpellList`: each time must use a different spell list.
 */
export const repeatableSchema = z.strictObject({ text: proseSchema, differentSpellList: z.literal(true).optional() })

/**
 * Field name `resistances`. The user has Resistance to `damageTypes`, or to all damage except `allExcept` (exactly one
 * of the two). `while` and `appliesWhen`/`unless` carry the condition it holds under.
 */
export const resistancesSchema = z
  .strictObject({ damageTypes: z.array(damageTypeIdSchema).min(1).optional(), allExcept: z.array(damageTypeIdSchema).min(1).optional(), while: whileSchema.optional(), ...spanShape })
  .refine((resistances) => (resistances.damageTypes === undefined) !== (resistances.allExcept === undefined), "set exactly one of damageTypes and allExcept")

/** Field name `speedBonus`. Feet added to the user’s own Speed, and the condition it holds under. */
export const speedBonusSchema = z.strictObject({ feet: feetSchema, while: whileSchema.optional(), ...spanShape })

/**
 * Field name `uses`. How often the effect can be used and what restores it. A category with more kinds of count
 * (a table column, a count by level) builds its own object from `usesShape` and a wider `count`.
 */
export const usesShape = { recharge: rechargeSchema } as const
export const usesSchema = z.strictObject({ count: usesCountSchema, ...usesShape })

/**
 * What a bonus, a penalty or added dice apply to: the vocabulary of a magic item's `to` and a spell's
 * `rollModifier.to`. One skill's checks are `<skill id>-checks`, so a bonus to Dexterity (Stealth) checks is
 * `stealth-checks`, never `ability-checks`.
 */
export const bonusTargets = [
  "armor-class",
  "attack-rolls",
  "damage-rolls",
  "spell-attack-rolls",
  "spell-save-dc",
  "saving-throws",
  "ability-checks",
  "initiative",
  "proficiency-bonus",
  ...skillIds.map((skill) => `${skill}-checks` as const),
] as const
export const bonusTargetSchema = z.enum(bonusTargets)
