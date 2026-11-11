import type { z } from "zod"
import { classFeatureSchema, classSchema, subclassSchema } from "../../src/schema/classes"
import { coinSchema, equipmentRuleSchema, equipmentSchema, poisonSchema, poisonTypeSchema, weaponMasterySchema, weaponPropertySchema } from "../../src/schema/equipment"
import { magicItemRuleSchema, magicItemSchema } from "../../src/schema/magic-items"
import { monsterRuleSchema, monsterSchema } from "../../src/schema/monsters"
import { backgroundSchema, featSchema, originRuleSchema, speciesSchema } from "../../src/schema/origins"
import { abilitySchema, alignmentSchema, conditionSchema, damageTypeSchema, languageSchema, magicSchoolSchema, skillSchema } from "../../src/schema/reference"
import { spellSchema } from "../../src/schema/spells"

/** One data file: its schema, and the list its `src/<file>.ts` module exports. */
type Registered = { schema: z.ZodType<{ id: string }>; exportName: string }

/**
 * Every data file the package ships, by file name. A data file that is not listed here fails the package check,
 * and so does a listed file that is missing, so the set cannot drift.
 */
export const registry: Record<string, Registered> = {
  abilities: { schema: abilitySchema, exportName: "abilities" },
  alignments: { schema: alignmentSchema, exportName: "alignments" },
  backgrounds: { schema: backgroundSchema, exportName: "backgrounds" },
  "class-features": { schema: classFeatureSchema, exportName: "classFeatures" },
  classes: { schema: classSchema, exportName: "classes" },
  coins: { schema: coinSchema, exportName: "coins" },
  conditions: { schema: conditionSchema, exportName: "conditions" },
  "damage-types": { schema: damageTypeSchema, exportName: "damageTypes" },
  equipment: { schema: equipmentSchema, exportName: "equipment" },
  "equipment-rules": { schema: equipmentRuleSchema, exportName: "equipmentRules" },
  feats: { schema: featSchema, exportName: "feats" },
  languages: { schema: languageSchema, exportName: "languages" },
  "magic-item-rules": { schema: magicItemRuleSchema, exportName: "magicItemRules" },
  "magic-items": { schema: magicItemSchema, exportName: "magicItems" },
  "magic-schools": { schema: magicSchoolSchema, exportName: "magicSchools" },
  "monster-rules": { schema: monsterRuleSchema, exportName: "monsterRules" },
  monsters: { schema: monsterSchema, exportName: "monsters" },
  "origin-rules": { schema: originRuleSchema, exportName: "originRules" },
  "poison-types": { schema: poisonTypeSchema, exportName: "poisonTypes" },
  poisons: { schema: poisonSchema, exportName: "poisons" },
  skills: { schema: skillSchema, exportName: "skills" },
  species: { schema: speciesSchema, exportName: "species" },
  spells: { schema: spellSchema, exportName: "spells" },
  subclasses: { schema: subclassSchema, exportName: "subclasses" },
  "weapon-masteries": { schema: weaponMasterySchema, exportName: "weaponMasteries" },
  "weapon-properties": { schema: weaponPropertySchema, exportName: "weaponProperties" },
}
