import type { Override } from "../lib/data"

const one = (item: string, note?: string) => ({ item, quantity: 1, ...(note ? { note } : {}) })

export const classOverrides: Override[] = [
  // Core traits
  { id: "bard", path: "skills", value: { count: 3 }, reason: "Skill Proficiencies reads: Choose any 3 skills. Any skill, so no list.", page: 31 },
  { id: "bard", path: "tools", value: [{ choose: 3, from: ["musical-instrument"] }], reason: "Tool Proficiencies reads: Choose 3 Musical Instruments. The base source leaves it out.", page: 31 },
  {
    id: "bard",
    path: "startingEquipment.0.items",
    value: [one("leather-armor"), { item: "dagger", quantity: 2 }, { chooseFrom: ["musical-instrument"], quantity: 1 }, one("entertainers-pack")],
    reason: "Option A includes a Musical Instrument of your choice. The base source leaves it out.",
    page: 31,
  },
  { id: "bard", path: "multiclass.skills", value: { count: 1 }, reason: "A multiclass Bard gains proficiency in one skill of your choice: any skill, so no list.", page: 31 },
  {
    id: "bard",
    path: "multiclass.tools",
    value: [{ choose: 1, from: ["musical-instrument"] }],
    reason: "A multiclass Bard gains proficiency with one Musical Instrument of your choice. The base source leaves it out.",
    page: 31,
  },
  {
    id: "cleric",
    path: "startingEquipment.0.items.3",
    value: { chooseFrom: ["holy-symbol"], quantity: 1 },
    reason: "Option A reads Holy Symbol, a choice of the Holy Symbol forms. The base source names holy-symbols.",
    page: 36,
  },
  {
    id: "druid",
    path: "startingEquipment.0.items.3",
    value: one("wooden-staff", "Quarterstaff"),
    reason: "Option A reads Druidic Focus (Quarterstaff): the Wooden staff, also a Quarterstaff. The base source has a plain Quarterstaff.",
    page: 41,
  },
  {
    id: "fighter",
    path: "skills.from",
    value: ["acrobatics", "animal-handling", "athletics", "history", "insight", "intimidation", "perception", "persuasion", "survival"],
    reason: "The Fighter skill list includes Persuasion. The base source leaves it out.",
    page: 47,
  },
  { id: "fighter", path: "startingEquipment.0.items.4.item", value: "dungeoneers-pack", reason: "Option A reads Dungeoneer’s Pack. The base source misspells the id.", page: 47 },
  { id: "fighter", path: "startingEquipment.1.items.6.item", value: "dungeoneers-pack", reason: "Option B reads Dungeoneer’s Pack. The base source misspells the id.", page: 47 },
  {
    id: "monk",
    path: "weapons",
    value: [{ category: "simple" }, { category: "martial", withProperty: ["light"] }],
    reason: "Weapon Proficiencies reads: Simple weapons and Martial weapons that have the Light property. The base source lists three weapons.",
    page: 49,
  },
  {
    id: "monk",
    path: "tools",
    value: [{ choose: 1, from: ["artisans-tools", "musical-instrument"] }],
    reason: "Tool Proficiencies reads: Choose one type of Artisan’s Tools or Musical Instrument. The base source leaves it out.",
    page: 49,
  },
  {
    id: "monk",
    path: "startingEquipment.0.items",
    value: [one("spear"), { item: "dagger", quantity: 5 }, { chooseFrom: ["artisans-tools", "musical-instrument"], quantity: 1, note: "chosen for the tool proficiency above" }, one("explorers-pack")],
    reason: "Option A includes Artisan’s Tools or Musical Instrument chosen for the tool proficiency above. The base source leaves it out.",
    page: 49,
  },
  {
    id: "paladin",
    path: "startingEquipment.0.items.4",
    value: { chooseFrom: ["holy-symbol"], quantity: 1 },
    reason: "Option A reads Holy Symbol, a choice of the Holy Symbol forms. The base source names holy-symbols.",
    page: 53,
  },
  { id: "ranger", path: "startingEquipment.0.items.6.note", value: "sprig of mistletoe", reason: "Option A reads Druidic Focus (sprig of mistletoe).", page: 57 },
  { id: "fighter", path: "startingEquipment.1.items.4.unit", value: "single", reason: "Option B reads 20 Arrows: twenty single arrows, one bundle.", page: 47 },
  { id: "ranger", path: "startingEquipment.0.items.4.unit", value: "single", reason: "Option A reads 20 Arrows: twenty single arrows, one bundle.", page: 57 },
  { id: "rogue", path: "startingEquipment.0.items.4.unit", value: "single", reason: "Option A reads 20 Arrows: twenty single arrows, one bundle.", page: 61 },
  {
    id: "rogue",
    path: "skills.from",
    value: ["acrobatics", "athletics", "deception", "insight", "intimidation", "investigation", "perception", "persuasion", "sleight-of-hand", "stealth"],
    reason: "The Rogue skill list has no Performance. The base source adds it.",
    page: 61,
  },
  {
    id: "rogue",
    path: "weapons",
    value: [{ category: "simple" }, { category: "martial", withProperty: ["finesse", "light"] }],
    reason: "Weapon Proficiencies reads: Simple weapons and Martial weapons that have the Finesse or Light property. The base source lists six weapons.",
    page: 61,
  },
  {
    id: "rogue",
    path: "multiclass.skills.from",
    value: ["acrobatics", "athletics", "deception", "insight", "intimidation", "investigation", "perception", "persuasion", "sleight-of-hand", "stealth"],
    reason: "A multiclass Rogue picks one skill from the Rogue’s skill list, which has no Performance.",
    page: 61,
  },
  {
    id: "sorcerer",
    path: "startingEquipment.0.items",
    value: [one("spear"), { item: "dagger", quantity: 2 }, one("crystal", "crystal"), one("dungeoneers-pack")],
    reason: "Option A reads Spear, 2 Daggers, Arcane Focus (crystal), Dungeoneer’s Pack. The base source has Leather Armor for the Spear.",
    page: 64,
  },
  { id: "warlock", path: "startingEquipment.0.items.3.note", value: "orb", reason: "Option A reads Arcane Focus (orb).", page: 70 },
  { id: "warlock", path: "startingEquipment.0.items.4.note", value: "occult lore", reason: "Option A reads Book (occult lore).", page: 70 },
  {
    id: "wizard",
    path: "skills.from",
    value: ["arcana", "history", "insight", "investigation", "medicine", "nature", "religion"],
    reason: "The Wizard skill list includes Nature. The base source leaves it out.",
    page: 77,
  },
  { id: "wizard", path: "startingEquipment.0.items.1", value: one("staff", "Quarterstaff"), reason: "Option A reads Arcane Focus (Quarterstaff): the Staff, also a Quarterstaff.", page: 77 },
  {
    id: "wizard",
    path: "spellcasting.focus",
    value: ["arcane-focus", "spellbook"],
    reason: "Spellcasting Focus reads: an Arcane Focus or your spellbook. The base source drops the spellbook.",
    page: 78,
  },

  // The features tables
  { id: "druid", path: "levels.6.cantrips", value: 3, reason: "The Druid Features table gives 3 cantrips at level 7.", page: 41 },
  { id: "druid", path: "levels.15.cantrips", value: 4, reason: "The Druid Features table gives 4 cantrips at level 16.", page: 41 },
  ...[18, 19, 21, 22, 23, 24, 25].map((value, index) => ({
    id: "wizard",
    path: `levels.${13 + index}.preparedSpells`,
    value,
    reason: `The Wizard Features table gives ${value} prepared spells at level ${14 + index}.`,
    page: 77,
  })),
]

export const featureOverrides: Override[] = []

export const subclassOverrides: Override[] = [
  {
    id: "circle-of-the-land",
    path: "alwaysPrepared.4.spells",
    value: ["fog-cloud", "hold-person", "ray-of-frost"],
    reason: "The Polar Land table gives Fog Cloud, Hold Person, Ray of Frost at level 3. The base source drops Ray of Frost.",
    page: 46,
  },
  {
    id: "circle-of-the-land",
    path: "alwaysPrepared.8.spells",
    value: ["misty-step", "shocking-grasp", "sleep"],
    reason: "The Temperate Land table gives Misty Step, Shocking Grasp, Sleep at level 3. The base source drops the last two.",
    page: 46,
  },
  { id: "oath-of-devotion", path: "alwaysPrepared.0.spells.1", value: "shield-of-faith", reason: "The Oath of Devotion Spells table reads Shield of Faith. The base source misspells it.", page: 56 },
]
