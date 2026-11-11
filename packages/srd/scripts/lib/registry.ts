import type { z } from "zod"
import { classFeatureSchema, classSchema, subclassSchema } from "../../src/schema/classes"
import { coinSchema, equipmentRuleSchema, equipmentSchema, poisonSchema, poisonTypeSchema, weaponMasterySchema, weaponPropertySchema } from "../../src/schema/equipment"
import { magicItemRuleSchema, magicItemSchema } from "../../src/schema/magic-items"
import { monsterRuleSchema, monsterSchema } from "../../src/schema/monsters"
import { backgroundSchema, featSchema, originRuleSchema, speciesSchema } from "../../src/schema/origins"
import { abilitySchema, alignmentSchema, conditionSchema, damageTypeSchema, languageSchema, magicSchoolSchema, skillSchema } from "../../src/schema/reference"
import { spellSchema } from "../../src/schema/spells"

/** One data file: its schema, the list its `src/<file>.ts` module exports, and the check in `scripts/verify` that guards it. */
type Registered = { schema: z.ZodType<{ id: string }>; exportName: string; check: string }

/**
 * Every data file the package ships, by file name. A data file that is not listed here fails the package check,
 * and so does a listed file that is missing, so the set cannot drift.
 */
export const registry: Record<string, Registered> = {
  abilities: { schema: abilitySchema, exportName: "abilities", check: "reference" },
  alignments: { schema: alignmentSchema, exportName: "alignments", check: "reference" },
  backgrounds: { schema: backgroundSchema, exportName: "backgrounds", check: "origins" },
  "class-features": { schema: classFeatureSchema, exportName: "classFeatures", check: "classes" },
  classes: { schema: classSchema, exportName: "classes", check: "classes" },
  coins: { schema: coinSchema, exportName: "coins", check: "equipment" },
  conditions: { schema: conditionSchema, exportName: "conditions", check: "reference" },
  "damage-types": { schema: damageTypeSchema, exportName: "damageTypes", check: "reference" },
  equipment: { schema: equipmentSchema, exportName: "equipment", check: "equipment" },
  "equipment-rules": { schema: equipmentRuleSchema, exportName: "equipmentRules", check: "equipment" },
  feats: { schema: featSchema, exportName: "feats", check: "origins" },
  languages: { schema: languageSchema, exportName: "languages", check: "reference" },
  "magic-item-rules": { schema: magicItemRuleSchema, exportName: "magicItemRules", check: "magic-items" },
  "magic-items": { schema: magicItemSchema, exportName: "magicItems", check: "magic-items" },
  "magic-schools": { schema: magicSchoolSchema, exportName: "magicSchools", check: "reference" },
  "monster-rules": { schema: monsterRuleSchema, exportName: "monsterRules", check: "monsters" },
  monsters: { schema: monsterSchema, exportName: "monsters", check: "monsters" },
  "origin-rules": { schema: originRuleSchema, exportName: "originRules", check: "origins" },
  "poison-types": { schema: poisonTypeSchema, exportName: "poisonTypes", check: "equipment" },
  poisons: { schema: poisonSchema, exportName: "poisons", check: "equipment" },
  skills: { schema: skillSchema, exportName: "skills", check: "reference" },
  species: { schema: speciesSchema, exportName: "species", check: "origins" },
  spells: { schema: spellSchema, exportName: "spells", check: "spells" },
  subclasses: { schema: subclassSchema, exportName: "subclasses", check: "classes" },
  "weapon-masteries": { schema: weaponMasterySchema, exportName: "weaponMasteries", check: "equipment" },
  "weapon-properties": { schema: weaponPropertySchema, exportName: "weaponProperties", check: "equipment" },
}
