import { z } from "zod"
import { abilityIdSchema, damageTypeIdSchema, diceSchema, entryShape, idSchema, proseSchema, skillIdSchema } from "./common"

export const magicItemCategories = ["armor", "potion", "ring", "rod", "scroll", "staff", "wand", "weapon", "wondrous-item"] as const
export const magicItemCategorySchema = z.enum(magicItemCategories)
export type MagicItemCategory = z.infer<typeof magicItemCategorySchema>

export const rarityIds = ["common", "uncommon", "rare", "very-rare", "legendary", "artifact"] as const
export const raritySchema = z.enum(rarityIds)
export type Rarity = z.infer<typeof raritySchema>

const classIdSchema = z.enum(["barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"])

/** What an item may be built on, from the parenthesis of the official subtitle. Ids are equipment ids. */
export const baseItemSchema = z.strictObject({
  /** "Any Medium or Heavy" is `["medium", "heavy"]`, "Any Melee Weapon" is `["melee"]`. */
  any: z
    .array(z.enum(["light", "medium", "heavy", "simple", "martial", "melee", "ammunition"]))
    .min(1)
    .optional(),
  /** Named equipment, such as `["battleaxe", "greataxe", "halberd"]`. */
  items: z.array(idSchema).min(1).optional(),
  /** Equipment excluded from `any`, such as `["hide-armor"]`. */
  except: z.array(idSchema).min(1).optional(),
})
export type BaseItem = z.infer<typeof baseItemSchema>

/** Who may attune. Absent on an item means attunement is not required. `restriction` is the official wording after "by". */
export const attunementSchema = z.strictObject({
  required: z.literal(true),
  restriction: z.string().min(1).optional(),
  classes: z.array(classIdSchema).min(1).optional(),
  spellcaster: z.literal(true).optional(),
})
export type Attunement = z.infer<typeof attunementSchema>

/** A numeric bonus the text states with a sign, such as "+2 bonus to Armor Class". `to` is the id of the stated target. */
export const bonusSchema = z.strictObject({ to: idSchema, value: z.number().int(), text: proseSchema })
export type Bonus = z.infer<typeof bonusSchema>

/** One named version of an item that has its own rarity. Fields beyond name and rarity are the values the official text gives that version. */
export const variantSchema = z.strictObject({
  name: z.string().min(1),
  rarity: raritySchema,
  /** The bonus a "+1, +2, or +3" item grants, with what it applies to. */
  bonuses: z
    .array(z.strictObject({ to: idSchema, value: z.number().int() }))
    .min(1)
    .optional(),
  strength: z.number().int().optional(),
  healing: diceSchema.optional(),
  spellLevel: z.number().int().min(0).max(9).optional(),
  saveDc: z.number().int().optional(),
  attackBonus: z.number().int().optional(),
})
export type MagicItemVariant = z.infer<typeof variantSchema>

export const chargesSchema = z.strictObject({
  /** A number, or dice when the item rolls its charges ("1d3"). */
  max: z.union([z.number().int(), diceSchema]),
  regains: z.strictObject({ amount: z.union([z.number().int(), diceSchema, z.literal("all")]), time: z.literal("dawn") }).optional(),
  /** What happens when the last charge is spent: roll `dice`, and on each listed number the `effect` follows. */
  lastCharge: z.strictObject({ dice: diceSchema, outcomes: z.array(z.strictObject({ on: z.number().int(), effect: proseSchema })).min(1) }).optional(),
})
export type Charges = z.infer<typeof chargesSchema>

export const savingThrowSchema = z.strictObject({ ability: abilityIdSchema, dc: z.number().int() })
export const checkSchema = z.strictObject({ ability: abilityIdSchema, skill: skillIdSchema.optional(), dc: z.number().int() })
export const damageSchema = z.strictObject({ dice: diceSchema, type: damageTypeIdSchema })

/** A spell the item lets its user cast. `charges` is the cost per cast, `level` a fixed spell level the text names. */
export const itemSpellSchema = z.strictObject({
  id: idSchema,
  level: z.number().int().min(1).max(9).optional(),
  charges: z.number().int().nonnegative().optional(),
  /** Wand of Fireballs: at most this many charges in one casting, each charge past the first raising the spell level by 1. */
  maxCharges: z.number().int().positive().optional(),
  upcastsWithCharges: z.literal(true).optional(),
  /** Staff of Healing: "1 charge per spell level (maximum 4 for a level 4 spell)". */
  chargesPerSpellLevel: z.literal(true).optional(),
  saveDc: z.number().int().optional(),
})
export type ItemSpell = z.infer<typeof itemSpellSchema>

/** A table of the description. Rows keep the PDF's cell text. `dice` and `roll` are present on random tables. */
export const itemTableSchema = z.strictObject({
  caption: z.string().min(1).optional(),
  dice: z
    .string()
    .regex(/^1d\d+$/)
    .optional(),
  columns: z.array(z.string().min(1)).min(1),
  rows: z
    .array(
      z.strictObject({
        roll: z.strictObject({ min: z.number().int(), max: z.number().int() }).optional(),
        cells: z.array(z.string().min(1)).min(1),
      })
    )
    .min(1),
})
export type ItemTable = z.infer<typeof itemTableSchema>

export const magicItemSchema = z.strictObject({
  ...entryShape,
  category: magicItemCategorySchema,
  base: baseItemSchema.optional(),
  /** "varies" when the item comes in several rarities, which `variants` list. */
  rarity: z.union([raritySchema, z.literal("varies")]),
  variants: z.array(variantSchema).min(1).optional(),
  attunement: attunementSchema.optional(),
  cursed: z.literal(true).optional(),
  consumable: z.literal(true).optional(),
  bonuses: z.array(bonusSchema).min(1).optional(),
  charges: chargesSchema.optional(),
  saves: z.array(savingThrowSchema).min(1).optional(),
  checks: z.array(checkSchema).min(1).optional(),
  damage: z.array(damageSchema).min(1).optional(),
  spells: z.array(itemSpellSchema).min(1).optional(),
  tables: z.array(itemTableSchema).min(1).optional(),
  description: proseSchema,
})
export type MagicItem = z.infer<typeof magicItemSchema>

/** One rarity row of the rules: value in gold pieces and the crafting time and cost. Artifacts are priceless and cannot be crafted. */
export const rarityRuleSchema = z.strictObject({
  ...entryShape,
  kind: z.literal("rarity"),
  value: z.number().int().positive().optional(),
  priceless: z.literal(true).optional(),
  craftingDays: z.number().int().positive().optional(),
  craftingCost: z.number().int().positive().optional(),
})

/** What the chapter says about a category, and the tool it needs to craft, as the Magic Item Tools table lists it. */
export const categoryRuleSchema = z.strictObject({
  ...entryShape,
  kind: z.literal("category"),
  category: magicItemCategorySchema,
  tools: z.string().min(1),
  text: proseSchema,
})

/** A named rule of the chapter, in the SRD's own words. */
export const textRuleSchema = z.strictObject({ ...entryShape, kind: z.literal("rule"), text: proseSchema })

/** The attunement limit, from the Equipment chapter. */
export const attunementRuleSchema = z.strictObject({ ...entryShape, kind: z.literal("attunement"), maxItems: z.number().int().positive(), text: proseSchema })

export const magicItemRuleSchema = z.discriminatedUnion("kind", [rarityRuleSchema, categoryRuleSchema, textRuleSchema, attunementRuleSchema])
export type MagicItemRule = z.infer<typeof magicItemRuleSchema>
