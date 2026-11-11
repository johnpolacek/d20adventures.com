import { z } from "zod"
import { abilityIdSchema, conditionIdSchema, costSchema, damageTypeIdSchema, diceSchema, entryShape, feetSchema, idSchema, proseSchema, sizeSchema, skillIdSchema } from "./common"

export const classIdSchema = z.enum(["barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"])

export const creatureTypeSchema = z.enum(["aberration", "beast", "celestial", "construct", "dragon", "elemental", "fey", "fiend", "giant", "humanoid", "monstrosity", "ooze", "plant", "undead"])

/** Damage as a dice expression or a fixed amount ("1 Piercing" has no dice). */
export const damageSchema = z
  .strictObject({ dice: diceSchema.optional(), fixed: z.number().int().positive().optional(), type: damageTypeIdSchema })
  .refine((damage) => (damage.dice === undefined) !== (damage.fixed === undefined), "give dice or fixed, not both")
export type Damage = z.infer<typeof damageSchema>

/** A save DC: a fixed number, or "8 plus your <ability> modifier and Proficiency Bonus" for the user of the item. */
export const dcSchema = z.union([z.strictObject({ fixed: z.number().int().positive() }), z.strictObject({ base: z.literal(8), ability: abilityIdSchema, proficiencyBonus: z.literal(true) })])

export const saveSchema = z.strictObject({ ability: abilityIdSchema, dc: dcSchema })

/** A mundane weight in pounds. Fractions are decimals: 1/4 lb. is 0.25. */
const weightSchema = z.number().positive()

const priced = { cost: costSchema.optional(), weight: weightSchema.optional() } as const
const described = { description: proseSchema.optional() } as const

export const weaponCategories = ["simple", "martial"] as const
export const weaponSchema = z.strictObject({
  ...entryShape,
  kind: z.literal("weapon"),
  category: z.enum(weaponCategories),
  /** Melee or Ranged, as the Weapons table groups it. */
  attackType: z.enum(["melee", "ranged"]),
  damage: damageSchema,
  /** Ids in weapon-properties.json. The Range entry is never listed: ranges are typed below. */
  properties: z.array(idSchema),
  mastery: idSchema,
  /** Normal and long range in feet, from the Thrown or Ammunition property. */
  range: z.strictObject({ normal: feetSchema, long: feetSchema }).optional(),
  versatileDamage: diceSchema.optional(),
  /** The id of the ammunition entry the Ammunition property names. */
  ammunition: idSchema.optional(),
  /** Lance: "Two-Handed (unless mounted)". */
  twoHandedUnlessMounted: z.literal(true).optional(),
  cost: costSchema,
  weight: weightSchema.optional(),
})

export const armorCategories = ["light", "medium", "heavy", "shield"] as const
export const armorSchema = z.strictObject({
  ...entryShape,
  kind: z.literal("armor"),
  category: z.enum(armorCategories),
  /** Base AC. A Shield has none and adds `acBonus` instead. */
  baseAc: z.number().int().optional(),
  acBonus: z.number().int().optional(),
  addsDexModifier: z.boolean().optional(),
  /** The most Dex modifier that counts, when the table caps it. */
  dexModifierCap: z.number().int().optional(),
  /** Strength score below which the wearer's Speed drops by 10 feet. */
  strengthRequired: z.number().int().optional(),
  stealthDisadvantage: z.literal(true).optional(),
  donMinutes: z.number().int().optional(),
  doffMinutes: z.number().int().optional(),
  /** A Shield is donned and doffed with the Utilize action. */
  donDoffAction: z.literal("utilize").optional(),
  cost: costSchema,
  weight: weightSchema,
})

const utilizeSchema = z.strictObject({ action: proseSchema, dc: z.number().int().positive() })

const craftCategorySchema = z.strictObject({
  category: z.enum(["melee-weapon", "ranged-weapon", "medium-armor", "heavy-armor"]),
  /** Weapon or armor ids the category leaves out. */
  except: z.array(idSchema).optional(),
})

export const toolSchema = z.strictObject({
  ...entryShape,
  kind: z.literal("tool"),
  group: z.enum(["artisan", "other"]),
  ability: abilityIdSchema,
  utilize: z.array(utilizeSchema).optional(),
  /** Entry ids the tool crafts, and whole categories of weapons and armor it crafts. */
  craft: z.strictObject({ items: z.array(idSchema).optional(), categories: z.array(craftCategorySchema).optional() }).optional(),
  /** Gaming Set and Musical Instrument list their variants as tool entries of their own. */
  variants: z.array(idSchema).optional(),
  variantOf: idSchema.optional(),
  ...priced,
  description: proseSchema.optional(),
})

export const ammunitionSchema = z.strictObject({
  ...entryShape,
  kind: z.literal("ammunition"),
  /** How many pieces one purchase holds. */
  amount: z.number().int().positive(),
  /** Id of the item that usually stores it. */
  storage: idSchema,
  cost: costSchema,
  weight: weightSchema,
})

export const focusSchema = z.strictObject({
  ...entryShape,
  kind: z.literal("focus"),
  focus: z.enum(["arcane", "druidic", "holy"]),
  usedBy: z.array(classIdSchema),
  /** Holy Symbols are worn, held, or borne on fabric or a Shield. */
  carried: z.array(z.enum(["worn", "held", "borne"])).optional(),
  alsoQuarterstaff: z.literal(true).optional(),
  cost: costSchema,
  weight: weightSchema.optional(),
})

/** A heading that stands for several entries: Ammunition, Arcane Focus, Druidic Focus, Holy Symbol, Spell Scroll. */
export const groupSchema = z.strictObject({
  ...entryShape,
  kind: z.literal("group"),
  members: z.array(idSchema),
  usedBy: z.array(classIdSchema).optional(),
  ...described,
})

export const packSchema = z.strictObject({
  ...entryShape,
  kind: z.literal("pack"),
  contents: z.array(z.strictObject({ item: idSchema, quantity: z.number().int().positive() })),
  cost: costSchema,
  weight: weightSchema,
  description: proseSchema,
})

const checkSchema = z.strictObject({
  use: z.enum(["bind", "escape", "burst", "knot", "pick", "catch", "free"]),
  ability: abilityIdSchema,
  skill: skillIdSchema,
  dc: z.number().int().positive(),
  rangeFeet: feetSchema.optional(),
})

const hazardSchema = z.strictObject({
  /** Thrown at a target this far away. */
  rangeFeet: feetSchema.optional(),
  /** Side of the square area covered, and how near the user it is placed. */
  areaSideFeet: feetSchema.optional(),
  withinFeet: feetSchema.optional(),
  save: saveSchema.optional(),
  damage: damageSchema.optional(),
  /** Damage applies only to these creature types. */
  onlyAgainst: z.array(creatureTypeSchema).optional(),
  condition: conditionIdSchema.optional(),
  speedToZero: z.literal(true).optional(),
  burning: z.literal(true).optional(),
  /** Extra damage when the target takes Fire damage while covered in oil. */
  extraFireDamage: damageSchema.optional(),
  dryAfterMinutes: z.number().int().optional(),
  burnsUntilRoundsAfterLit: z.number().int().optional(),
  succeedsAutomaticallyIfSizeAtLeast: sizeSchema.optional(),
  recoverMinutes: z.number().int().optional(),
  chainFeet: z.number().int().optional(),
  /** Damage dealt by each failed attempt to break free. */
  failedFreeAttemptDamage: damageSchema.optional(),
})

const modifierSchema = z.strictObject({
  effect: z.enum(["bonus", "advantage", "automatic-success"]),
  on: z.enum(["check", "save"]),
  ability: abilityIdSchema.optional(),
  skills: z.array(skillIdSchema).optional(),
  amount: z.number().int().optional(),
  durationHours: z.number().int().optional(),
  /** Against this condition, for saves that name one. */
  againstCondition: conditionIdSchema.optional(),
  /** The wording that says when it applies, as the SRD prints it. */
  when: proseSchema,
})

const capacitySchema = z.strictObject({
  pounds: z.number().optional(),
  cubicFeet: z.number().optional(),
  gallons: z.number().optional(),
  pints: z.number().optional(),
  ounces: z.number().optional(),
  /** What a container holds. Several entries are alternatives (a Map or Scroll Case holds paper or parchment). */
  holds: z.array(z.strictObject({ item: idSchema, quantity: z.number().int().positive() })).optional(),
})

const lightSchema = z.strictObject({
  shape: z.enum(["radius", "cone"]),
  brightFeet: feetSchema,
  /** Dim Light beyond the Bright Light, in feet. */
  dimFeet: feetSchema,
  durationHours: z.number().optional(),
  fuel: idSchema.optional(),
  /** Hooded Lantern with its hood lowered: Dim Light only, in a radius of this many feet. */
  loweredHoodDimRadiusFeet: feetSchema.optional(),
})

/** What the Adventuring Gear descriptions state as mechanics. Every field is optional and appears only where the text states it. */
export const gearMechanics = {
  capacity: capacitySchema.optional(),
  light: lightSchema.optional(),
  /** Hours of light one flask of Oil burns in a Lamp or Lantern. */
  fuelHours: z.number().int().optional(),
  lengthFeet: feetSchema.optional(),
  heightFeet: feetSchema.optional(),
  sleeps: z.number().int().optional(),
  uses: z.number().int().optional(),
  hazard: hazardSchema.optional(),
  /** Oil: dousing a space. */
  spaceHazard: hazardSchema.optional(),
  checks: z.array(checkSchema).optional(),
  /** Chain, Manacles and Rope bind only a creature that already has one of these conditions, and leave it with `appliesCondition`. */
  binding: z.strictObject({ requiresAnyCondition: z.array(conditionIdSchema), appliesCondition: conditionIdSchema, sizes: z.array(sizeSchema).optional() }).optional(),
  modifiers: z.array(modifierSchema).optional(),
  /** Hit Points and defenses of the item itself (Net). */
  object: z.strictObject({ ac: z.number().int(), hp: z.number().int(), immunities: z.array(damageTypeIdSchema) }).optional(),
  audibleFeet: feetSchema.optional(),
  anchorFeet: feetSchema.optional(),
  liftMultiplier: z.number().int().optional(),
  magnification: z.number().int().optional(),
  dig: z.strictObject({ sideFeet: feetSchema, hours: z.number().int() }).optional(),
  ignite: z.strictObject({ action: z.literal("bonus"), otherFireMinutes: z.number().int() }).optional(),
  /** Damage when the item is used as a Simple Melee weapon (Torch). */
  attackDamage: damageSchema.optional(),
  healing: z.strictObject({ dice: diceSchema, action: z.literal("bonus"), rangeFeet: feetSchema }).optional(),
  stabilize: z
    .strictObject({
      requiresCondition: conditionIdSchema,
      atHitPoints: z.number().int(),
      replacesCheck: z.strictObject({ ability: abilityIdSchema, skill: skillIdSchema }),
    })
    .optional(),
  coating: z
    .strictObject({
      action: z.literal("bonus"),
      ammunitionPieces: z.number().int(),
      triggerDamageTypes: z.array(damageTypeIdSchema),
      extraDamage: damageSchema,
      potencyMinutes: z.number().int(),
    })
    .optional(),
  spellScroll: z.strictObject({ spellLevel: z.number().int().min(0).max(1), saveDc: z.number().int(), attackBonus: z.number().int() }).optional(),
  /** Saddles: Advantage text lives in `modifiers`. An Exotic Saddle is required for aquatic or flying mounts. */
  requiredForMounts: z.array(z.enum(["aquatic", "flying"])).optional(),
} as const

export const gearSchema = z.strictObject({
  ...entryShape,
  kind: z.literal("gear"),
  ...priced,
  /** The listed weight is for the item when full (Waterskin). */
  weightWhenFull: z.literal(true).optional(),
  ...gearMechanics,
  description: proseSchema,
})

export const mountSchema = z.strictObject({
  ...entryShape,
  kind: z.literal("mount"),
  carryingCapacityPounds: z.number().int().positive(),
  cost: costSchema,
  /** The monster stat block that holds the animal's other statistics. */
  statBlock: idSchema,
})

export const vehicleSchema = z.strictObject({
  ...entryShape,
  kind: z.literal("vehicle"),
  cost: costSchema,
  weight: weightSchema,
})

export const tackSchema = z.strictObject({
  ...entryShape,
  kind: z.literal("tack"),
  ...priced,
  per: z.literal("day").optional(),
  modifiers: gearMechanics.modifiers,
  requiredForMounts: gearMechanics.requiredForMounts,
  description: proseSchema.optional(),
})

export const shipSchema = z.strictObject({
  ...entryShape,
  kind: z.literal("ship"),
  travel: z.enum(["air", "water"]),
  speedMph: z.number().positive(),
  crew: z.number().int().positive(),
  /** Small and Medium passengers in hammocks. */
  passengers: z.number().int().positive().optional(),
  cargoTons: z.number().positive().optional(),
  ac: z.number().int(),
  hp: z.number().int(),
  damageThreshold: z.number().int().optional(),
  cost: costSchema,
  /** A Rowboat can be carried and weighs 100 pounds. */
  weight: weightSchema.optional(),
})

export const tiers = ["wretched", "squalid", "poor", "modest", "comfortable", "wealthy", "aristocratic"] as const
export const lifestyleSchema = z.strictObject({
  ...entryShape,
  kind: z.literal("lifestyle"),
  tier: z.enum(tiers),
  /** Wretched is free and has no cost. */
  costPerDay: costSchema.optional(),
  description: proseSchema,
})

export const foodSchema = z.strictObject({
  ...entryShape,
  kind: z.literal("food"),
  /** The serving the price covers: "mug", "loaf", "wedge", "bottle". */
  unit: z.string().min(1),
  cost: costSchema,
})

/** An Inn Stay per Day or a Meal, priced by lifestyle tier. */
export const lodgingSchema = z.strictObject({
  ...entryShape,
  kind: z.enum(["inn-stay", "meal"]),
  tier: z.enum(tiers),
  cost: costSchema,
})

export const serviceSchema = z.strictObject({
  ...entryShape,
  kind: z.literal("service"),
  cost: costSchema,
  per: z.enum(["day", "mile"]).optional(),
  description: proseSchema.optional(),
})

export const spellcastingServiceSchema = z.strictObject({
  ...entryShape,
  kind: z.literal("spellcasting-service"),
  minSpellLevel: z.number().int().min(0).max(9),
  maxSpellLevel: z.number().int().min(0).max(9),
  /** The smallest settlement where the spell can be found. */
  availableFrom: z.enum(["village", "town", "city"]),
  cost: costSchema,
})

export const equipmentSchema = z.discriminatedUnion("kind", [
  weaponSchema,
  armorSchema,
  toolSchema,
  ammunitionSchema,
  focusSchema,
  groupSchema,
  packSchema,
  gearSchema,
  mountSchema,
  vehicleSchema,
  tackSchema,
  shipSchema,
  lifestyleSchema,
  foodSchema,
  lodgingSchema,
  serviceSchema,
  spellcastingServiceSchema,
])
export type Equipment = z.infer<typeof equipmentSchema>
export type Weapon = z.infer<typeof weaponSchema>
export type Armor = z.infer<typeof armorSchema>

export const weaponPropertySchema = z.strictObject({
  ...entryShape,
  description: proseSchema,
  /** Heavy: the ability score a wielder needs, for Melee (Strength) and Ranged (Dexterity) weapons. */
  minimumScore: z.number().int().optional(),
  /** Reach: feet added to your reach. */
  reachBonusFeet: feetSchema.optional(),
})
export type WeaponProperty = z.infer<typeof weaponPropertySchema>

export const weaponMasterySchema = z.strictObject({
  ...entryShape,
  description: proseSchema,
  /** Push: feet the target moves, and the largest size it can be. */
  pushFeet: feetSchema.optional(),
  maxSize: sizeSchema.optional(),
  /** Slow: feet the target's Speed drops. */
  speedReductionFeet: feetSchema.optional(),
  /** Topple: the save, DC 8 plus the attack ability modifier and Proficiency Bonus. */
  save: z.strictObject({ ability: abilityIdSchema, dc: z.strictObject({ base: z.literal(8), attackAbilityModifier: z.literal(true), proficiencyBonus: z.literal(true) }) }).optional(),
  condition: conditionIdSchema.optional(),
})
export type WeaponMastery = z.infer<typeof weaponMasterySchema>

export const poisonTypes = ["contact", "ingested", "inhaled", "injury"] as const
const durationSchema = z.strictObject({ amount: z.union([z.number().int().positive(), diceSchema]), unit: z.enum(["minute", "hour"]) })

export const poisonSchema = z.strictObject({
  ...entryShape,
  type: z.enum(poisonTypes),
  /** Price of one dose. */
  cost: costSchema,
  save: z.strictObject({ ability: z.literal("con"), dc: z.number().int().positive() }).optional(),
  damage: z.strictObject({ average: z.number().int().positive(), dice: diceSchema, type: z.literal("poison") }).optional(),
  halfDamageOnSave: z.literal(true).optional(),
  conditions: z
    .array(
      z.strictObject({
        condition: conditionIdSchema,
        duration: durationSchema.optional(),
        /** Held only while the creature is Poisoned by this poison. */
        whilePoisoned: z.literal(true).optional(),
        /** Held only if the creature fails the save by this much or more. */
        failedByAtLeast: z.number().int().optional(),
      })
    )
    .optional(),
  /** Saves repeated after the first, and the damage of each failed one. */
  repeat: z
    .strictObject({
      when: z.enum(["start-of-turn", "end-of-turn", "every-24-hours"]),
      damage: z.strictObject({ average: z.number().int().positive(), dice: diceSchema, type: z.literal("poison") }).optional(),
      endsAfterSuccesses: z.number().int().positive(),
    })
    .optional(),
  delayedUntilMidnight: z.literal(true).optional(),
  /** Any effect that ends the Poisoned condition neutralizes the poison (Midnight Tears). */
  neutralizedByEndingPoisoned: z.literal(true).optional(),
  speedHalved: z.literal(true).optional(),
  cannotKnowinglyLie: z.literal(true).optional(),
  damageCannotBeHealed: z.literal(true).optional(),
  description: proseSchema,
})
export type Poison = z.infer<typeof poisonSchema>

export const coinSchema = z.strictObject({
  ...entryShape,
  abbreviation: z.enum(["cp", "sp", "ep", "gp", "pp"]),
  /** Value in gold pieces. */
  gpValue: z.number().positive(),
})
export type Coin = z.infer<typeof coinSchema>

const ruleShape = { ...entryShape, ...described } as const
export const equipmentRuleSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...ruleShape,
    kind: z.literal("armor-training"),
    /** Armor categories the rule covers. */
    covers: z.array(z.enum(armorCategories)),
    /** Untrained: Disadvantage on D20 Tests with these abilities, and no spellcasting. */
    untrainedDisadvantageOn: z.array(abilityIdSchema).optional(),
    untrainedCannotCast: z.literal(true).optional(),
    /** Shield: the AC benefit needs training. */
    benefitRequiresTraining: z.literal(true).optional(),
  }),
  z.strictObject({ ...ruleShape, kind: z.literal("one-at-a-time"), maxArmor: z.literal(1), maxShield: z.literal(1) }),
  z.strictObject({ ...ruleShape, kind: z.literal("selling"), resaleFraction: z.number().positive() }),
  z.strictObject({ ...ruleShape, kind: z.literal("coin-weight"), coinsPerPound: z.number().int().positive() }),
  z.strictObject({ ...ruleShape, kind: z.literal("barding"), costMultiplier: z.number().int().positive(), weightMultiplier: z.number().int().positive() }),
  z.strictObject({ ...ruleShape, kind: z.literal("draft-cargo"), capacityMultiplier: z.number().int().positive() }),
  z.strictObject({
    ...ruleShape,
    kind: z.literal("crafting"),
    /** Raw materials are this fraction of the purchase cost, rounded down. */
    rawMaterialsFraction: z.number().positive(),
    workHoursPerDay: z.number().int().positive(),
    /** Days needed are the purchase cost in GP divided by this, rounded up. */
    costGpPerDay: z.number().int().positive(),
    maxAssistants: z.number().int().positive(),
  }),
  z.strictObject({
    ...ruleShape,
    kind: z.literal("potion-brewing"),
    tool: idSchema,
    rawMaterialsGp: z.number().int().positive(),
    days: z.number().int().positive(),
    workHoursPerDay: z.number().int().positive(),
  }),
  z.strictObject({
    ...ruleShape,
    kind: z.literal("ship-repair"),
    hitPointsPerDay: z.number().int().positive(),
    costGpPerHitPoint: z.number().int().positive(),
    shipyardFraction: z.number().positive(),
  }),
  z.strictObject({
    ...ruleShape,
    kind: z.literal("ship-passengers"),
    privateAccommodationsFraction: z.number().positive(),
    hammockCostPerDay: costSchema,
    cabinCostPerDay: costSchema,
  }),
  z.strictObject({ ...ruleShape, kind: z.literal("scribing"), spellLevel: z.number().int().min(0).max(9), days: z.number().int().positive(), cost: costSchema }),
])
export type EquipmentRule = z.infer<typeof equipmentRuleSchema>
