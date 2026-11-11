import { z } from "zod"
import {
  abilityIdSchema,
  actionKindSchema,
  activationSchema,
  classIdSchema,
  conditionIdSchema,
  costSchema,
  creatureTypeSchema,
  damageEffectSchema,
  damageTypeIdSchema,
  diceSchema,
  entryShape,
  equipmentOptionSchema,
  featGrantSchema,
  feetSchema,
  forcedSaveShape,
  hitPointMaximumSchema,
  idSchema,
  oncePerTurnSchema,
  proseSchema,
  repeatableSchema,
  resistancesSchema,
  saveDcSchema,
  saveOutcomeSchema,
  sensesSchema,
  sizeSchema,
  skillIdSchema,
  spanShape,
  speedBonusSchema,
  targetLimitShape,
  targetSpeedReductionSchema,
  usesSchema,
} from "./common"

export type Uses = z.infer<typeof usesSchema>

/** A spell the origin gives. `level` is the character level at which it is gained. A spell without `cantrip` is always prepared. */
export const grantedSpellSchema = z.strictObject({
  spell: idSchema,
  level: z.number().int().min(1).max(20),
  cantrip: z.literal(true).optional(),
  uses: usesSchema.optional(),
})
export type GrantedSpell = z.infer<typeof grantedSpellSchema>

/** Damage that grows with character level. `level` is the first character level of each step. */
const breathWeaponSchema = z.strictObject({
  /** The areas the breath can fill. They are alternatives: the user chooses one shape each time the breath is used, and it fills only that one. */
  shapeOptions: z.array(z.strictObject({ shape: z.enum(["cone", "line"]), feet: feetSchema, width: feetSchema.optional() })).min(1),
  save: z.strictObject({ ...forcedSaveShape, dc: saveDcSchema }),
  damage: z.array(z.strictObject({ level: z.number().int().min(1).max(20), dice: diceSchema })).min(1),
  onSuccess: saveOutcomeSchema,
})

/**
 * What an engine can compute from a trait or a feat benefit. Every field is optional and appears only where the
 * official text states it. The prose stays in `text`.
 */
export const mechanicsShape = {
  /** The character's senses, each with its range in feet. A limit on one sense sits on its entry. */
  senses: sensesSchema.optional(),
  /** The character has Resistance, as `resistancesSchema` says. */
  resistances: resistancesSchema.optional(),
  /** The damage type of the Breath Weapon, or the type the Damage Resistance covers, is the one on the option the player chose in the choice trait with this id (Draconic Ancestry). */
  damageTypeFromChoice: idSchema.optional(),
  /** The character has Advantage on saving throws against these conditions, or on saving throws with these abilities. */
  savingThrowAdvantage: z.strictObject({ conditions: z.array(conditionIdSchema).min(1).optional(), abilities: z.array(abilityIdSchema).min(1).optional() }).optional(),
  /** The character's Hit Point maximum rises, as `hitPointMaximumSchema` says. */
  hitPointMaximum: hitPointMaximumSchema.optional(),
  /** The kinds of action the trait takes to use. */
  activation: activationSchema.optional(),
  /** The moment that lets the trait act. */
  trigger: z.enum(["hit-with-attack-roll-and-deal-damage", "hit-with-weapon", "take-damage", "after-attack-or-magic-action"]).optional(),
  /** Limits on which targets the condition or damage affects: their size or creature type. */
  ...targetLimitShape,
  /** The character level at which the trait starts. */
  level: z.number().int().min(1).max(20).optional(),
  /** How long the trait's effect lasts after the character uses it. */
  durationMinutes: z.number().int().positive().optional(),
  /** How often the trait can be used before it recharges. */
  uses: usesSchema.optional(),
  /** Spells the character gains, by character level. */
  spells: z.array(grantedSpellSchema).min(1).optional(),
  /** The player picks one of these as the spellcasting ability. */
  spellcastingAbility: z.array(abilityIdSchema).min(1).optional(),
  /** The character gains proficiency in `count` skills chosen from this list, or from any skill. */
  skillChoice: z.strictObject({ count: z.number().int().positive(), from: z.union([z.array(skillIdSchema).min(1), z.literal("any")]) }).optional(),
  /** The character's own Speed becomes this many feet. */
  speed: feetSchema.optional(),
  /** The character's own Speed rises by this many feet for `durationMinutes` after using the trait. */
  speedBonus: speedBonusSchema.optional(),
  /** The target's Speed, not the character's, is reduced by `feet` until the start of the character's next turn. */
  targetSpeedReduction: targetSpeedReductionSchema.optional(),
  /** A Fly Speed equal to the character's Speed. */
  flySpeed: z.literal("speed").optional(),
  /** The character becomes this size while the trait lasts. */
  sizeChange: sizeSchema.optional(),
  /** The character can finish a Long Rest in this many hours. */
  longRestHours: z.number().int().positive().optional(),
  /** The character gains Temporary Hit Points equal to its Proficiency Bonus when it uses the trait. */
  temporaryHitPoints: z.literal("proficiency-bonus").optional(),
  /** The character gains Heroic Inspiration whenever it finishes this kind of rest. */
  heroicInspiration: z.literal("long-rest").optional(),
  /** The character's Breath Weapon: the areas it fills, the save it forces, and its damage by character level. */
  breathWeapon: breathWeaponSchema.optional(),
  /** Extra damage the character deals to the target or triggering creature, when `trigger` happens. */
  damage: damageEffectSchema.optional(),
  /** The character reduces damage it takes by the roll plus its ability modifier, when `trigger` happens. */
  damageReduction: z.strictObject({ dice: diceSchema, ability: abilityIdSchema }).optional(),
  /** The character teleports up to this many feet to an unoccupied space it can see. */
  teleportFeet: feetSchema.optional(),
  /** The distance in feet within which the creature that triggers or is affected by the trait must be. */
  range: feetSchema.optional(),
  /** A condition the trait gives its target, when `trigger` happens. */
  targetCondition: z.strictObject({ condition: conditionIdSchema, ...spanShape }).optional(),
  /** A condition the trait gives the character itself. Its duration is in the text. */
  selfCondition: z
    .strictObject({
      condition: conditionIdSchema,
      /** The condition ends on the character immediately after it takes one of these kinds of action. */
      endsAfter: z.array(actionKindSchema).min(1).optional(),
      ...spanShape,
    })
    .optional(),
  /** The official words of a precondition on using the trait, such as being in a big enough space. It gates the use, not the effect after it begins. */
  usableWhen: z.string().min(1).optional(),
  /** The character gains a feat, as `featGrantSchema` says. */
  feat: featGrantSchema.optional(),
  /** The Rock Gnome device: its AC and HP, how many can exist, the casting time and how long each lasts. */
  clockworkDevice: z.strictObject({ armorClass: z.number().int(), hitPoints: z.number().int(), maximum: z.number().int(), castMinutes: z.number().int(), durationHours: z.number().int() }).optional(),
  /** Magic Initiate: cantrips learned, the level of the one spell, and the lists to choose from. */
  cantrips: z.number().int().positive().optional(),
  spellLevel: z.number().int().min(1).max(9).optional(),
  spellLists: z.array(classIdSchema).min(1).optional(),
  /** Skilled: proficiencies in any mix of skills and tools. */
  proficiencyChoice: z.strictObject({ count: z.number().int().positive(), kinds: z.array(z.enum(["skill", "tool"])).min(1) }).optional(),
  /** The character gets this bonus to attack rolls with this kind of weapon. */
  attackBonus: z.strictObject({ bonus: z.number().int(), weapon: z.enum(["melee", "ranged"]) }).optional(),
  /** The character gets this bonus to Armor Class while wearing armor of these categories. */
  armorClassBonus: z.strictObject({ bonus: z.number().int(), armor: z.array(z.enum(["light", "medium", "heavy"])).min(1) }).optional(),
  /** Great Weapon Fighting: when rolling damage with a Melee weapon held in two hands, a 1 or 2 on a damage die counts as `minimum`. The weapon needs one of these properties. */
  damageDieMinimum: z.strictObject({ minimum: z.number().int(), weapon: z.literal("melee"), heldWith: z.literal("two-hands"), properties: z.array(idSchema).min(1) }).optional(),
  /** Boon of Spell Recall: casting with a slot of these levels rolls `dice`, and the slot is kept if the roll equals its level. */
  freeCasting: z.strictObject({ minSlotLevel: z.number().int(), maxSlotLevel: z.number().int() }).optional(),
  /** Alert: add the Proficiency Bonus to Initiative rolls. */
  initiativeBonus: z.literal("proficiency-bonus").optional(),
  /** Alert: swap Initiative with this many willing allies, unless the character or the ally has the condition. */
  initiativeSwap: z.strictObject({ allies: z.number().int().positive(), blockedByCondition: conditionIdSchema, ...spanShape }).optional(),
  /** The effect happens at most once on each of the character's turns. */
  oncePerTurn: oncePerTurnSchema.optional(),
  /** Savage Attacker: when a weapon hits, roll the weapon's damage dice twice and use either roll. */
  damageDiceRolledTwice: z.literal(true).optional(),
  /** Two-Weapon Fighting: the extra attack from a weapon with this property adds the ability modifier to its damage. */
  addAbilityModifierToExtraAttack: z.strictObject({ weaponProperty: idSchema }).optional(),
  /** Luck: when the d20 of a D20 Test shows this number, the die may be rerolled and the new roll must be used. */
  rerollD20On: z.number().int().min(1).max(20).optional(),
  /** Halfling Nimbleness: the character can move through the space of a creature exactly this many size categories larger ("a size larger than you"), but cannot stop there. The text does not extend it to creatures larger still. */
  moveThroughCreatures: z.strictObject({ sizesLarger: z.number().int().positive(), canStop: z.literal(false) }).optional(),
  /** Naturally Stealthy: the Hide action works when obscured only by a creature at least this many size categories larger ("at least one size larger"), so any larger creature also counts. */
  hideBehindCreatures: z.strictObject({ minSizesLarger: z.number().int().positive() }).optional(),
  /** Powerful Build: Advantage on ability checks to end the Grappled condition. */
  grappledEscapeAdvantage: z.literal(true).optional(),
  /** Powerful Build: counts as this many sizes larger for carrying capacity. */
  carryingCapacitySizeBonus: z.number().int().positive().optional(),
  /** Trance: no need to sleep and magic cannot put the character to sleep. */
  sleepImmunity: z.literal(true).optional(),
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
  creatureType: creatureTypeSchema,
  /** One size, or two when the player picks one. `height` is the SRD's own words, "about 5–7 feet tall". */
  sizes: z.array(z.strictObject({ size: sizeSchema, height: z.string().min(1) })).min(1),
  speed: feetSchema,
  traits: z.array(speciesTraitSchema).min(1),
})
export type Species = z.infer<typeof speciesSchema>

const toolProficiencySchema = z.union([
  z.strictObject({ tool: idSchema }),
  /** "Choose one kind of Gaming Set": the player picks one tool of this group. It is the id `chooseFrom` uses in the equipment lines. */
  z.strictObject({ oneOfKind: idSchema }),
])

export const backgroundSchema = z.strictObject({
  ...entryShape,
  /** The three ability scores the background lists. */
  abilityScores: z.array(abilityIdSchema).length(3),
  /** The Origin feat. `spellList` is the list for Magic Initiate, "Magic Initiate (Cleric)". */
  feat: featGrantSchema,
  skills: z.array(skillIdSchema).length(2),
  toolProficiency: toolProficiencySchema,
  /** Option A is the package with its gold, and option B is gold alone. */
  equipment: z.array(equipmentOptionSchema).length(2),
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
  repeatable: repeatableSchema.optional(),
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

/** A general rule from the Character Origins and Feats chapters, with the numbers an engine needs. */
export const originRuleSchema = z.strictObject({
  ...entryShape,
  text: proseSchema,
  /** Background ability score rule: the number of listed scores, the ways to spend the increase, and the cap. */
  abilityScoreIncrease: z.strictObject({ listed: z.number().int().positive(), options: z.array(z.array(z.number().int().positive()).min(1)).min(1), maximum: z.number().int() }).optional(),
  /** What a background or species gives, and how many of it. */
  grants: z.strictObject({ kind: z.enum(["feat", "skill-proficiency", "tool-proficiency"]), count: z.number().int().positive(), featCategory: z.literal("origin").optional() }).optional(),
  /** Gold taken instead of the equipment package. */
  moneyInsteadOfEquipment: costSchema.optional(),
  creatureType: creatureTypeSchema.optional(),
  /** Most species live about this many years. */
  typicalLifeSpanYears: z.number().int().positive().optional(),
  /** A prerequisite that names a class needs at least this many levels in it. */
  minimumClassLevels: z.number().int().positive().optional(),
  /** A feat can be taken this many times unless its description says it is Repeatable. */
  defaultTimesTaken: z.number().int().positive().optional(),
  /** When no category is named, a feat may come from any category. */
  anyCategoryWhenUnspecified: z.literal(true).optional(),
})
export type OriginRule = z.infer<typeof originRuleSchema>
