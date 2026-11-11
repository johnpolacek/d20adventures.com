import { z } from "zod"
import { abilityIdSchema, conditionIdSchema, damageTypeIdSchema, diceSchema, entryShape, feetSchema, idSchema, proseSchema, sizeSchema, skillIdSchema } from "./common"

const spellListSchema = z.enum(["cleric", "druid", "wizard"])

/** When spent uses come back. "initiative-or-short-or-long-rest" is Boon of Fate: roll Initiative or finish a Short or Long Rest. */
export const rechargeSchema = z.enum(["long-rest", "short-or-long-rest", "start-of-next-turn", "initiative-or-short-or-long-rest"])

/** Uses between recharges. `count` is a number, or "proficiency-bonus" for "a number of times equal to your Proficiency Bonus". */
export const usesSchema = z.strictObject({ count: z.union([z.number().int().positive(), z.literal("proficiency-bonus")]), recharge: rechargeSchema })
export type Uses = z.infer<typeof usesSchema>

/** A spell the origin gives. `level` is the character level at which it is gained. A spell without `cantrip` is always prepared. */
export const grantedSpellSchema = z.strictObject({
  spell: idSchema,
  level: z.number().int().min(1).max(20),
  cantrip: z.literal(true).optional(),
  uses: usesSchema.optional(),
})
export type GrantedSpell = z.infer<typeof grantedSpellSchema>

/** "8 plus your Constitution modifier and Proficiency Bonus" is { base: 8, abilities: ["con"], proficiencyBonus: true }. */
const saveDcSchema = z.strictObject({ base: z.number().int(), abilities: z.array(abilityIdSchema).min(1), proficiencyBonus: z.literal(true) })

/** Damage that grows with character level. `level` is the first character level of each step. */
const breathWeaponSchema = z.strictObject({
  shapes: z.array(z.strictObject({ shape: z.enum(["cone", "line"]), feet: feetSchema, width: feetSchema.optional() })).min(1),
  save: z.strictObject({ ability: abilityIdSchema, dc: saveDcSchema }),
  damage: z.array(z.strictObject({ level: z.number().int().min(1).max(20), dice: diceSchema })).min(1),
  onSave: z.literal("half"),
})

/**
 * What an engine can compute from a trait or a feat benefit. Every field is optional and appears only where the
 * official text states it. The prose stays in `text`.
 */
export const mechanicsShape = {
  darkvision: feetSchema.optional(),
  tremorsense: feetSchema.optional(),
  truesight: feetSchema.optional(),
  /** Resistance to these damage types. */
  resistance: z.array(damageTypeIdSchema).min(1).optional(),
  /** Resistance to all damage except these types. */
  resistanceExcept: z.array(damageTypeIdSchema).min(1).optional(),
  /** The damage type is the one on the option the player chose in the choice trait with this id (Draconic Ancestry). */
  damageTypeFromChoice: idSchema.optional(),
  savingThrowAdvantage: z.strictObject({ conditions: z.array(conditionIdSchema).min(1).optional(), abilities: z.array(abilityIdSchema).min(1).optional() }).optional(),
  hitPointBonus: z.strictObject({ initial: z.number().int(), perLevel: z.number().int() }).optional(),
  activation: z.enum(["bonus-action", "reaction"]).optional(),
  /** The character level at which the trait starts. */
  level: z.number().int().min(1).max(20).optional(),
  durationMinutes: z.number().int().positive().optional(),
  uses: usesSchema.optional(),
  spells: z.array(grantedSpellSchema).min(1).optional(),
  /** The player picks one of these as the spellcasting ability. */
  spellcastingAbility: z.array(abilityIdSchema).min(1).optional(),
  skillChoice: z.strictObject({ count: z.number().int().positive(), from: z.union([z.array(skillIdSchema).min(1), z.literal("any")]) }).optional(),
  /** A new Speed in feet. */
  speed: feetSchema.optional(),
  speedBonus: feetSchema.optional(),
  speedReduction: feetSchema.optional(),
  /** A Fly Speed equal to the character's Speed. */
  flySpeed: z.literal("speed").optional(),
  /** The character becomes this size while the trait lasts. */
  sizeChange: sizeSchema.optional(),
  longRestHours: z.number().int().positive().optional(),
  temporaryHitPoints: z.literal("proficiency-bonus").optional(),
  heroicInspiration: z.literal("long-rest").optional(),
  breathWeapon: breathWeaponSchema.optional(),
  /** Extra damage dealt. */
  damage: z.strictObject({ dice: diceSchema, type: damageTypeIdSchema }).optional(),
  /** Reduce damage taken by the roll plus the ability modifier. */
  damageReduction: z.strictObject({ dice: diceSchema, ability: abilityIdSchema }).optional(),
  teleportFeet: feetSchema.optional(),
  rangeFeet: feetSchema.optional(),
  /** A condition the trait can impose. */
  condition: conditionIdSchema.optional(),
  featChoice: z.strictObject({ category: z.literal("origin"), recommended: idSchema }).optional(),
  clockworkDevice: z.strictObject({ armorClass: z.number().int(), hitPoints: z.number().int(), maximum: z.number().int(), castMinutes: z.number().int(), durationHours: z.number().int() }).optional(),
  /** Magic Initiate: cantrips learned, the level of the one spell, and the lists to choose from. */
  cantrips: z.number().int().positive().optional(),
  spellLevel: z.number().int().min(1).max(9).optional(),
  spellLists: z.array(spellListSchema).min(1).optional(),
  /** Skilled: proficiencies in any mix of skills and tools. */
  proficiencyChoice: z.strictObject({ count: z.number().int().positive(), kinds: z.array(z.enum(["skill", "tool"])).min(1) }).optional(),
  attackBonus: z.strictObject({ bonus: z.number().int(), weapon: z.enum(["melee", "ranged"]) }).optional(),
  armorClassBonus: z.strictObject({ bonus: z.number().int(), armor: z.array(z.enum(["light", "medium", "heavy"])).min(1) }).optional(),
  /** Great Weapon Fighting: a 1 or 2 on a damage die counts as `minimum`. The weapon needs one of these properties. */
  damageDieMinimum: z.strictObject({ minimum: z.number().int(), properties: z.array(idSchema).min(1) }).optional(),
  /** Boon of Spell Recall: casting with a slot of these levels rolls `dice`, and the slot is kept if the roll equals its level. */
  freeCasting: z.strictObject({ minSlotLevel: z.number().int(), maxSlotLevel: z.number().int() }).optional(),
  /** The dice the benefit rolls, such as the 2d4 of Boon of Fate. */
  dice: diceSchema.optional(),
}

export const traitSchema = z.strictObject({ name: z.string().min(1), text: proseSchema, ...mechanicsShape })
export type Trait = z.infer<typeof traitSchema>

/** One pick from a choice trait: a dragon ancestry, a lineage, a giant ancestry. `id` is `toId(name)`, unique within the species. */
export const optionSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1),
  text: proseSchema.optional(),
  /** The damage type of a dragon ancestry. */
  damageType: damageTypeIdSchema.optional(),
  /** The giant of a goliath ancestry, as the SRD prints it in parentheses: "Cloud Giant". */
  giant: z.string().min(1).optional(),
  ...mechanicsShape,
})
export type Option = z.infer<typeof optionSchema>

export const speciesTraitSchema = z.strictObject({
  ...traitSchema.shape,
  /** Present on a trait that has the player pick one option. `id` is `toId(trait name)`. */
  choice: z.strictObject({ id: idSchema, options: z.array(optionSchema).min(2) }).optional(),
})
export type SpeciesTrait = z.infer<typeof speciesTraitSchema>

export const speciesSchema = z.strictObject({
  ...entryShape,
  creatureType: z.literal("Humanoid"),
  /** One size, or two when the player picks one. `height` is the SRD's own words, "about 5–7 feet tall". */
  sizes: z.array(z.strictObject({ size: sizeSchema, height: z.string().min(1) })).min(1),
  speed: feetSchema,
  traits: z.array(speciesTraitSchema).min(1),
})
export type Species = z.infer<typeof speciesSchema>

const toolProficiencySchema = z.union([
  z.strictObject({ tool: idSchema }),
  /** "Choose one kind of Gaming Set": the player picks one tool of this equipment kind. */
  z.strictObject({ oneOfKind: idSchema }),
])

const equipmentItemSchema = z.strictObject({
  id: idSchema,
  quantity: z.number().int().positive(),
  /** "Book (prayers)". */
  note: z.string().min(1).optional(),
  /** "Gaming Set (same as above)": the kind the player chose for the tool proficiency. */
  sameAsTool: z.literal(true).optional(),
})

const equipmentOptionSchema = z.strictObject({ items: z.array(equipmentItemSchema), gp: z.number().int().nonnegative() })

export const backgroundSchema = z.strictObject({
  ...entryShape,
  /** The three ability scores the background lists. */
  abilityScores: z.array(abilityIdSchema).length(3),
  /** The Origin feat. `spellList` is the list for Magic Initiate, "Magic Initiate (Cleric)". */
  feat: z.strictObject({ id: idSchema, spellList: spellListSchema.optional() }),
  skills: z.array(skillIdSchema).length(2),
  toolProficiency: toolProficiencySchema,
  /** Option A is the package and option B is gold alone. */
  equipment: z.strictObject({ a: equipmentOptionSchema, b: equipmentOptionSchema }),
})
export type Background = z.infer<typeof backgroundSchema>

export const featCategories = ["origin", "general", "fighting-style", "epic-boon"] as const
export const featCategorySchema = z.enum(featCategories)

export const featSchema = z.strictObject({
  ...entryShape,
  category: featCategorySchema,
  prerequisite: z
    .strictObject({
      /** The SRD's own words inside the parentheses, "Level 4+, Strength or Dexterity 13+". */
      text: z.string().min(1),
      level: z.number().int().min(1).max(20).optional(),
      /** The character needs this score in at least one of these abilities. */
      abilityMinimum: z.strictObject({ abilities: z.array(abilityIdSchema).min(1), minimum: z.number().int() }).optional(),
      /** Class features the character must have: "fighting-style", "spellcasting". */
      features: z
        .array(z.enum(["fighting-style", "spellcasting"]))
        .min(1)
        .optional(),
    })
    .optional(),
  repeatable: z.strictObject({ text: proseSchema, differentSpellList: z.literal(true).optional() }).optional(),
  /** The score increase the feat gives. `choices` are the ways to spend it, and `from` the abilities allowed. */
  abilityScoreIncrease: z
    .strictObject({
      from: z.union([z.array(abilityIdSchema).min(1), z.literal("any")]),
      choices: z.array(z.strictObject({ count: z.number().int().positive(), amount: z.number().int().positive() })).min(1),
      maximum: z.number().int(),
    })
    .optional(),
  /** The description before any named benefit, or the whole description when the feat has no named benefits. */
  text: proseSchema.optional(),
  benefits: z
    .array(z.strictObject({ name: z.string().min(1), text: proseSchema, ...mechanicsShape }))
    .min(1)
    .optional(),
  /** Mechanics of a feat whose description has no named benefits. */
  ...mechanicsShape,
})
export type Feat = z.infer<typeof featSchema>
