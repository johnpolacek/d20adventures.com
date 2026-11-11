import type { Override } from "../lib/data"

/**
 * Stat blocks the base source lacks, written in the base source's own shape so they pass through the same mapping.
 * Each is transcribed from the official page it names. Only the fields the builder reads are given.
 */
export const additions: { page: number; entry: Record<string, unknown> }[] = [
  {
    // The base source has Giant Octopus but no Octopus.
    page: 357,
    entry: {
      index: "octopus",
      name: "Octopus",
      armor_class: [{ value: 12 }],
      hit_points: 3,
      hit_points_roll: "1d6",
      speed: { walk: "5 ft.", swim: "30 ft." },
      strength: 4,
      dexterity: 15,
      constitution: 11,
      intelligence: 3,
      wisdom: 10,
      charisma: 4,
      proficiencies: [
        { value: 2, proficiency: { index: "skill-perception" } },
        { value: 6, proficiency: { index: "skill-stealth" } },
      ],
      damage_vulnerabilities: [],
      damage_resistances: [],
      damage_immunities: [],
      condition_immunities: [],
      senses: { darkvision: "30 ft.", passive_perception: 12 },
      languages: "None",
      challenge_rating: 0,
      xp: 10,
      proficiency_bonus: 2,
      special_abilities: [{ name: "Compression" }, { name: "Water Breathing" }],
      actions: [{ name: "Tentacles" }],
      reactions: [{ name: "Ink Cloud" }],
    },
  },
]

/**
 * Corrections to the base source's feature names, which the builder uses to split each official block into its
 * features. `add` names a feature the base source lacks, `remove` a name that is not a feature.
 */
export const featureFixes: { id: string; add?: string[]; remove?: string[]; reason: string; page: number }[] = [
  { id: "ancient-copper-dragon", remove: ["Spike"], reason: "“Spike (level 5 version)” is the end of a sentence of the Mind Jolt legendary action, not a feature", page: 277 },
  ...["vampire", "vampire-spawn"].map((id) => ({
    id,
    remove: ["Forbiddance", "Running Water", "Stake to the Heart", "Sunlight"],
    reason: "these are the items of the Vampire Weakness trait, which lists them after “The vampire has these weaknesses:”",
    page: 335,
  })),
  { id: "sphinx-of-valor", remove: ["First Roar", "Second Roar", "Third Roar"], reason: "the three roars are the items of the Roar action, which lists them “as detailed below”", page: 328 },
  { id: "unicorn", add: ["Unicorn’s Blessing"], reason: "the official block has a Unicorn’s Blessing bonus action", page: 334 },
  {
    id: "mule",
    add: ["Beast of Burden", "Hooves"],
    remove: ["Compression", "Water Breathing", "Tentacles", "Ink Cloud"],
    reason: "the base source gives the mule the octopus’s features; the official mule has Beast of Burden and Hooves",
    page: 357,
  },
  { id: "pirate-captain", add: ["Captain’s Charm"], reason: "the official block has a Captain’s Charm action", page: 314 },
]

const darkness = (id: string, page: number): Override => ({
  id,
  path: "senses.darkvisionNote",
  value: "unimpeded by magical Darkness",
  reason: "the Senses entry reads “Darkvision … (unimpeded by magical Darkness)”, with a capital D",
  page,
})

/** Lycanthropes print one stat block whose Speed adds a faster form, which the base source spreads over its forms. */
const formSpeed = (id: string, form: string, page: number, climb?: number): Override => ({
  id,
  path: "speedVariants",
  value: [{ speed: { walk: 40, ...(climb ? { climb } : {}) }, note: `${form} form only` }],
  reason: `the Speed entry reads “30 ft., 40 ft. (${form} form only)${climb ? `, Climb ${climb} ft. (${form} form only)` : ""}”`,
  page,
})

export const overrides: Override[] = [
  darkness("barbed-devil", 262),
  darkness("bearded-devil", 262),
  darkness("bone-devil", 267),
  darkness("chain-devil", 273),
  darkness("horned-devil", 299),
  darkness("imp", 301),
  darkness("lemure", 304),
  {
    id: "half-dragon",
    path: "conditionalDefenses",
    value: [{ kind: "resistance", condition: "Damage type chosen for the Draconic Origin trait below" }],
    reason: "the Resistances entry reads “Damage type chosen for the Draconic Origin trait below”",
    page: 297,
  },
  {
    id: "archmage",
    path: "conditionImmunities",
    value: undefined,
    reason: "the Immunities entry reads “Psychic; Charmed (with Mind Blank)”: the archmage is immune to Charmed only with Mind Blank",
    page: 305,
  },
  {
    id: "archmage",
    path: "conditionalDefenses",
    value: [{ kind: "condition-immunity", value: "charmed", condition: "with Mind Blank" }],
    reason: "the Immunities entry reads “Psychic; Charmed (with Mind Blank)”",
    page: 305,
  },
  {
    id: "rakshasa",
    path: "conditionalDefenses",
    value: [{ kind: "vulnerability", value: "piercing", condition: "from weapons wielded by creatures under the effect of a Bless spell" }],
    reason: "the Vulnerabilities entry reads “Piercing damage from weapons wielded by creatures under the effect of a Bless spell”",
    page: 317,
  },
  {
    id: "vampire-familiar",
    path: "conditionImmunities",
    value: undefined,
    reason: "the Immunities entry reads “Charmed (except from its vampire master)”: the immunity is qualified",
    page: 334,
  },
  {
    id: "vampire-familiar",
    path: "conditionalDefenses",
    value: [{ kind: "condition-immunity", value: "charmed", condition: "except from its vampire master" }],
    reason: "the Immunities entry reads “Charmed (except from its vampire master)”",
    page: 334,
  },
  {
    id: "young-white-dragon",
    path: "abilities.int.save",
    value: -2,
    reason: "the PDF prints the save as “2” with no sign. The modifier is −2 and the dragon has no Intelligence proficiency, so the save is −2",
    page: 340,
  },
  formSpeed("werebear", "bear", 337, 30),
  formSpeed("wereboar", "boar", 338),
  formSpeed("weretiger", "tiger", 339),
  formSpeed("werewolf", "wolf", 339),
  {
    id: "swarm-of-insects",
    path: "speedVariants",
    value: [
      { speed: { climb: 20 }, note: "GM’s choice" },
      { speed: { fly: 20 }, note: "GM’s choice" },
    ],
    reason: "the Speed entry reads “20 ft., Climb or Fly 20 ft. (GM’s choice)”",
    page: 361,
  },
]
