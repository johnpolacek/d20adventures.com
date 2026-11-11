import { z } from "zod"
import {
  abilityIdSchema,
  activationSchema,
  classIdSchema,
  costSchema,
  damageRollShape,
  damageTypeIdSchema,
  diceSchema,
  entryShape,
  forcedSaveShape,
  idSchema,
  isDiceOrAmount,
  proseSchema,
  rechargeSchema,
  skillIdSchema,
  skillIds,
  usesCountSchema,
} from "./common"
import { spellStatBlockSchema } from "./spells"

export const magicItemCategories = ["armor", "potion", "ring", "rod", "scroll", "staff", "wand", "weapon", "wondrous-item"] as const
export const magicItemCategorySchema = z.enum(magicItemCategories)
export type MagicItemCategory = z.infer<typeof magicItemCategorySchema>

export const rarityIds = ["common", "uncommon", "rare", "very-rare", "legendary", "artifact"] as const
export const raritySchema = z.enum(rarityIds)
export type Rarity = z.infer<typeof raritySchema>

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

/**
 * A bonus that holds whenever the item is worn, held or wielded, such as "+2 bonus to Armor Class". `to` is the id of
 * the stated target and `text` the sentence that states it.
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

export const bonusSchema = z.strictObject({ to: bonusTargetSchema, value: z.number().int(), text: proseSchema })
export type Bonus = z.infer<typeof bonusSchema>

/** A bonus that holds only under a condition or trigger the text states. `appliesWhen` is the official wording of it. */
export const conditionalBonusSchema = z.strictObject({ to: bonusTargetSchema, value: z.number().int(), appliesWhen: proseSchema, text: proseSchema })
export type ConditionalBonus = z.infer<typeof conditionalBonusSchema>

export const chargesSchema = z.strictObject({
  /** A number, or dice when the item rolls its charges ("1d3"). */
  max: z.union([z.number().int(), diceSchema]),
  regains: z.strictObject({ amount: z.union([z.number().int(), diceSchema, z.literal("all")]), time: z.literal("dawn") }).optional(),
  /** What happens when the last charge is spent: roll `dice`, and on each listed number the `effect` follows. */
  lastCharge: z.strictObject({ dice: diceSchema, outcomes: z.array(z.strictObject({ on: z.number().int(), effect: proseSchema })).min(1) }).optional(),
})
export type Charges = z.infer<typeof chargesSchema>

/**
 * A saving throw the item's text forces, with the printed DC. Where an item forces several saves with different DCs,
 * `label` says in the official words what each is for.
 */
export const savingThrowSchema = z.strictObject({ ...forcedSaveShape, dc: z.number().int().positive(), label: proseSchema.optional() })
export const checkSchema = z.strictObject({ ability: abilityIdSchema, skill: skillIdSchema.optional(), dc: z.number().int() })
/**
 * Damage the text states, with `dice` or a fixed `amount`. `role` says whose damage it is: "extra" is added to a hit the
 * item helps make, "base" replaces the usual damage of an attack, "effect" is dealt by a property of the item,
 * "to-user" is what the user takes, "to-item" is what the item takes. `appliesWhen`, in the official words, is what limits
 * the roll: a target, a natural 20, an alternative ("or an extra 2d8 ... if the target is a Giant"). Without it the roll
 * applies whenever its role does. `text` is the sentence. A summoned creature's stat block is not here.
 */
export const damageRoles = ["extra", "base", "effect", "to-user", "to-item"] as const
export const damageSchema = z
  .strictObject({ ...damageRollShape, type: damageTypeIdSchema, role: z.enum(damageRoles), appliesWhen: proseSchema.optional(), text: proseSchema })
  .refine(isDiceOrAmount, "give dice or an amount")

/** A spell the item lets its user cast. `charges` is the cost per cast, `level` a fixed spell level the text names. A spell whose effect the item applies without casting is in `spellEffects` instead. */
export const itemSpellSchema = z.strictObject({
  id: idSchema,
  /** The row of the item's table that grants the spell, such as the plane of a Ring of Elemental Command, or the card of the Mysterious Deck that does. */
  group: z.string().min(1).optional(),
  level: z.number().int().min(1).max(9).optional(),
  charges: z.number().int().nonnegative().optional(),
  /** Wand of Fireballs: at most this many charges in one casting, each charge past the first raising the spell level by 1. */
  maxCharges: z.number().int().positive().optional(),
  upcastsWithCharges: z.literal(true).optional(),
  /** Staff of Healing: "1 charge per spell level (maximum 4 for a level 4 spell)". */
  chargesPerSpellLevel: z.literal(true).optional(),
  saveDc: z.number().int().positive().optional(),
})
export type ItemSpell = z.infer<typeof itemSpellSchema>

/**
 * A spell whose effect the item applies without the user casting it: "gain the effect of", "as if you had cast",
 * "detonates as a level 3 Fireball (save DC 15)", or a spell the item casts on its own user. `level` and `saveDc` are
 * set where the text states them. No charges: the user does not cast it.
 */
export const spellEffectSchema = z.strictObject({ id: idSchema, level: z.number().int().min(1).max(9).optional(), saveDc: z.number().int().positive().optional() })

/** One named version of an item that has its own rarity. Fields beyond name and rarity are the values the official text gives that version. */
export const variantSchema = z.strictObject({
  name: z.string().min(1),
  rarity: raritySchema,
  /** The bonus a "+1, +2, or +3" item grants, with what it applies to. */
  bonuses: z
    .array(z.strictObject({ to: bonusTargetSchema, value: z.number().int() }))
    .min(1)
    .optional(),
  strength: z.number().int().optional(),
  healing: diceSchema.optional(),
  spellLevel: z.number().int().min(0).max(9).optional(),
  saveDc: z.number().int().optional(),
  attackBonus: z.number().int().optional(),
  /** What the variant's own paragraphs state, for variants that are figurines, tokens or stones with properties of their own. */
  charges: chargesSchema.optional(),
  saves: z.array(savingThrowSchema).min(1).optional(),
  checks: z.array(checkSchema).min(1).optional(),
  damage: z.array(damageSchema).min(1).optional(),
  spells: z.array(itemSpellSchema).min(1).optional(),
  spellEffects: z.array(spellEffectSchema).min(1).optional(),
  conditionalBonuses: z.array(conditionalBonusSchema).min(1).optional(),
})
export type MagicItemVariant = z.infer<typeof variantSchema>

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
        /** Spells the user of the item casts as this result: "You cast ...". A spell cast by a creature the result calls is in neither list. */
        spells: z.array(idSchema).min(1).optional(),
        /** Spells whose effect this result applies without the user casting them: "as if you had cast ...". */
        spellEffects: z.array(spellEffectSchema).min(1).optional(),
        /** Damage whose dice are printed only in this row, such as the lightning damage by number of spheres. */
        damage: z
          .array(z.strictObject({ dice: diceSchema, type: damageTypeIdSchema, role: z.enum(damageRoles) }))
          .min(1)
          .optional(),
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
  /** The kinds of action the text names for using the item: "Magic action", "Bonus Action", "Utilize action", "Reaction". */
  activation: activationSchema.optional(),
  /**
   * What restores a use of a property that "can’t be used again", where the text names the dawn or a rest, and how many
   * uses it allows first where the text says ("three fuzzy objects"). No count means one use. Other waits (hours, days)
   * stay in the prose.
   */
  uses: z
    .array(z.strictObject({ count: usesCountSchema.optional(), recharge: rechargeSchema }))
    .min(1)
    .optional(),
  bonuses: z.array(bonusSchema).min(1).optional(),
  conditionalBonuses: z.array(conditionalBonusSchema).min(1).optional(),
  charges: chargesSchema.optional(),
  saves: z.array(savingThrowSchema).min(1).optional(),
  checks: z.array(checkSchema).min(1).optional(),
  damage: z.array(damageSchema).min(1).optional(),
  spells: z.array(itemSpellSchema).min(1).optional(),
  /** Spells whose effect the item applies without the user casting: "you gain the effect of the X spell". */
  spellEffects: z.array(spellEffectSchema).min(1).optional(),
  tables: z.array(itemTableSchema).min(1).optional(),
  /**
   * Stat blocks the text prints for creatures the item makes, in the shape the spells use. The Giant Fly of the
   * Figurine of Wondrous Power has no traits or actions, so `actions` is optional here. Initiative is not kept.
   */
  statBlocks: z
    .array(spellStatBlockSchema.extend({ actions: spellStatBlockSchema.shape.actions.optional() }))
    .min(1)
    .optional(),
  description: proseSchema,
})
export type MagicItem = z.infer<typeof magicItemSchema>

/** One rarity row of the rules: value in gold pieces and the crafting time and cost. Artifacts are priceless and cannot be crafted. */
export const rarityRuleSchema = z.strictObject({
  ...entryShape,
  kind: z.literal("rarity"),
  value: costSchema.optional(),
  priceless: z.literal(true).optional(),
  craftingDays: z.number().int().positive().optional(),
  craftingCost: costSchema.optional(),
})

/** What the chapter says about a category, and the tool it needs to craft, as the Magic Item Tools table lists it. */
export const categoryRuleSchema = z.strictObject({
  ...entryShape,
  kind: z.literal("category"),
  category: magicItemCategorySchema,
  tools: z.string().min(1),
  text: proseSchema,
  tables: z.array(itemTableSchema).min(1).optional(),
})

/** A named rule of the chapter, in the SRD's own words, with the tables printed in it. */
export const textRuleSchema = z.strictObject({ ...entryShape, kind: z.literal("rule"), text: proseSchema, tables: z.array(itemTableSchema).min(1).optional() })

/** The attunement rules of the Equipment chapter. */
export const attunementRuleSchema = z.strictObject({
  ...entryShape,
  kind: z.literal("attunement"),
  /** "You can be attuned to no more than three magic items at a time." */
  maxItems: z.number().int().positive(),
  /** Attuning takes one Short Rest spent focused on the item. */
  restsToAttune: z.literal("short-rest"),
  /** Attunement ends if the item has been more than this many feet away for at least `endsAfterAwayHours`. */
  endsWhenAwayFeet: z.number().int().positive(),
  endsAfterAwayHours: z.number().int().positive(),
  text: proseSchema,
})

/** How Sentient Magic Items get their ability scores: roll `dice` for each, dropping the lowest `dropLowest` rolls. */
export const sentientAbilitiesRuleSchema = z.strictObject({
  ...entryShape,
  kind: z.literal("sentient-abilities"),
  abilityRoll: z.strictObject({ dice: diceSchema, dropLowest: z.number().int().positive() }),
  text: proseSchema,
})

/**
 * Conflict between a sentient item and its bearer. Both saving throws are Charisma saves with a DC of `dcBase` plus
 * the item's Charisma modifier. The bearer who fails while taking control is Charmed for `charmedHours` (dice).
 */
export const sentientConflictRuleSchema = z.strictObject({
  ...entryShape,
  kind: z.literal("sentient-conflict"),
  /** `dc` is left out: the DC is `dcBase` plus the Charisma modifier of the item, which is not a printed number. */
  save: z.strictObject({ ...forcedSaveShape, dcBase: z.number().int().positive(), plusItemModifierOf: abilityIdSchema }),
  demands: z.array(z.strictObject({ name: z.string().min(1), text: proseSchema })).min(4),
  /** The line before the refusals: "If its bearer refuses to comply with the item’s demands, the item can do any of the following:". */
  refusalLead: proseSchema,
  refusals: z.array(proseSchema).min(3),
  charmedHours: diceSchema,
  text: proseSchema,
})

/**
 * A change to what an item is worth or costs to make, from a footnote. `factor` multiplies the value (or crafting
 * time and cost) of `appliesTo`, except `except`. A Spell Scroll's value is `factor` times its scribing cost.
 */
export const valueRuleSchema = z.strictObject({
  ...entryShape,
  kind: z.literal("value-rule"),
  scope: z.enum(["value", "crafting"]),
  appliesTo: z.enum(["consumable", "spell-scroll"]),
  factor: z.number().positive(),
  basis: z.enum(["rarity-value", "scribing-cost"]),
  except: z.array(z.literal("spell-scroll")).min(1).optional(),
  text: proseSchema,
})

export const magicItemRuleSchema = z.discriminatedUnion("kind", [
  rarityRuleSchema,
  categoryRuleSchema,
  textRuleSchema,
  attunementRuleSchema,
  sentientAbilitiesRuleSchema,
  sentientConflictRuleSchema,
  valueRuleSchema,
])
export type MagicItemRule = z.infer<typeof magicItemRuleSchema>
