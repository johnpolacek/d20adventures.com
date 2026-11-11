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

/** Body text in the SRD's own words. Paragraphs are separated by one "\n". Apostrophes and quotes are typographic (’ “ ”), as printed. */
export const proseSchema = z
  .string()
  .min(1)
  .refine((text) => !/['"]/.test(text), "use typographic quotes (’ “ ”), as the SRD prints them")
  .refine((text) => text === text.trim() && !/\n\s*\n| {2,}|\n /.test(text), "one newline between paragraphs, no doubled or leading spaces")
