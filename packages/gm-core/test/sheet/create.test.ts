import assert from "node:assert/strict"
import { test } from "node:test"
import { speciesSchema } from "@d20/srd/schema/origins"
import { autoCreate, CREATION_CLASSES, type CreationChoices, type CreationPick, createSheet, creationChoicesSchema, creationMenu, creationOptions, heroRecord, heroRules } from "../../src/sheet/create"
import { enduredWords, withDamage } from "../../src/sheet/death"
import { deriveSheet, sheetProblems } from "../../src/sheet/derive"
import { HOUSE_SPECIES } from "../../src/sheet/house-species"
import { longRest } from "../../src/sheet/rest"
import type { Sheet } from "../../src/sheet/sheet"
import { saveModesFor } from "../../src/sheet/spell-effects"
import { rollSave, slotsLeft, spellcastingFor, spellcastingOf } from "../../src/sheet/spells"

// Every expected value below was worked out by hand from the SRD 5.2.1 rules, not copied from the function's output.

// A High Elf Cleric of the Acolyte background, by named choices. The Cleric's suggested Standard Array (p. 21) is
// Str 14, Dex 8, Con 13, Int 10, Wis 15, Cha 12. The Acolyte lists Int, Wis and Cha, so Con cannot be raised: Wis +2 to
// 17 and Cha +1 to 13.
const pick = { class: "cleric", species: "elf", background: "acolyte" } as const
const choices: CreationChoices = {
  abilityScores: { str: 14, dex: 8, con: 13, int: 10, wis: 15, cha: 12 },
  abilityIncrease: { wis: 2, cha: 1 },
  speciesChoices: { "elven-lineage": "high-elf" },
  speciesSpellAbility: "wis",
  classSkills: ["medicine", "persuasion"],
  speciesSkills: ["perception"],
  backgroundFeatPicks: { spellAbility: "wis", cantrips: ["light", "spare-the-dying"], spell: "command" },
  featureChoices: { "cleric-divine-order": "protector" },
  cantrips: ["guidance", "sacred-flame", "thaumaturgy"],
  spells: ["bless", "cure-wounds", "healing-word", "shield-of-faith"],
  equipment: { class: "A", background: "A", classPicks: { "holy-symbol": "emblem" }, backgroundPicks: { "holy-symbol": "reliquary" } },
  languages: ["elvish", "dwarvish"],
}

test("what a High Elf Cleric of the Acolyte background is asked to choose", () => {
  const options = creationOptions(pick)
  assert.deepEqual(options.abilityScores.increase, {
    from: ["int", "wis", "cha"],
    choices: [
      [2, 1],
      [1, 1, 1],
    ],
    maximum: 20,
  })
  // Two Cleric skills, from the list less the Acolyte's Insight and Religion.
  assert.deepEqual({ count: options.skills.count, from: options.skills.from.map((skill) => skill.id) }, { count: 2, from: ["history", "medicine", "persuasion"] })
  assert.deepEqual(
    options.speciesChoices?.map((entry) => [entry.choice, entry.options.map((option) => option.id)]),
    [["elven-lineage", ["drow", "high-elf", "wood-elf"]]]
  )
  assert.deepEqual(options.speciesSpellAbility?.from, ["int", "wis", "cha"])
  assert.deepEqual(
    options.speciesSkills?.map((entry) => [entry.trait.name, entry.count, entry.from.map((skill) => skill.id)]),
    [["Keen Senses", 1, ["insight", "perception", "survival"]]]
  )
  assert.equal(options.speciesFeat, undefined)
  // Magic Initiate (Cleric): the list is the background's, the ability, two cantrips and a level 1 spell are chosen.
  assert.deepEqual(options.backgroundFeat.spellPicks, { spellLists: ["cleric"], spellAbility: ["int", "wis", "cha"], cantrips: 2, spellLevel: 1 })
  assert.deepEqual(
    options.featureChoices?.[0].options.map((option) => [option.id, option.cantrips?.count]),
    [
      ["protector", undefined],
      ["thaumaturge", 1],
    ]
  )
  assert.equal(options.cantrips?.count, 3)
  assert.equal(options.spells?.count, 4)
  assert.equal(options.spellbook, undefined)
  assert.equal(options.weaponMasteries, undefined)
  // Option B of each is coin alone, so only A is offered.
  assert.deepEqual(
    options.equipment.class.map((offer) => [offer.option, offer.armor?.id, offer.shield, offer.weapons.map((weapon) => weapon.id)]),
    [["A", "chain-shirt", true, ["mace"]]]
  )
  assert.deepEqual(options.languages.count, 2)
})

test("a High Elf Cleric made by named choices, checked by hand against the SRD", () => {
  const result = createSheet(pick, choices)
  if ("problems" in result) assert.fail(result.problems.join("; "))
  const { sheet, gear } = result
  assert.deepEqual(sheetProblems(sheet), [])
  assert.deepEqual(sheet.abilityScores, { str: 14, dex: 8, con: 13, int: 10, wis: 17, cha: 13 })
  assert.deepEqual(sheet.advancements, [{ level: 1, feat: "magic-initiate", spellList: "cleric", spellAbility: "wis", cantrips: ["light", "spare-the-dying"], spell: "command" }])
  const derived = deriveSheet(sheet)
  // A d8 and Con 13's +1.
  assert.equal(derived.hitPointMaximum, 9)
  // Chain Shirt 13, plus Dex 8's -1 (a Medium armor caps a bonus, not a penalty), plus the Shield's 2.
  assert.equal(derived.armorClass, 14)
  // Perception by Keen Senses: Wis 17's +3 and the Proficiency Bonus of 2. Religion by the Acolyte, with Int 10: +2.
  assert.equal(derived.skills.perception.bonus, 5)
  assert.equal(derived.skills.religion.bonus, 2)
  assert.equal(derived.passivePerception, 15)
  // Protector's Heavy armor training.
  assert.deepEqual(derived.armorTraining, ["light", "medium", "heavy", "shields"])
  // A level 1 Cleric has two level 1 slots. Spell save DC 8 + 2 + 3.
  const caster = { type: "pc", name: "Sister Hale", sheet }
  assert.deepEqual(slotsLeft(caster).slice(0, 2), [2, 0])
  assert.equal(spellcastingOf(caster)?.saveDc, 13)
  // The High Elf's Prestidigitation is known beside the three Cleric cantrips, and cast with the Wisdom chosen for it.
  assert.deepEqual(derived.cantrips, ["guidance", "sacred-flame", "thaumaturgy", "prestidigitation"])
  assert.equal(spellcastingFor(caster, "prestidigitation")?.ability, "wis")
  assert.deepEqual(gear, ["Chain Shirt", "Shield", "Mace", "Priest’s Pack", "Emblem", "Calligrapher’s Supplies", "Book (prayers)", "Parchment (10 sheets)", "Robe", "Reliquary"])
})

test("an illegal score assignment and an illegal pick are refused", () => {
  const refused = (changes: Partial<CreationChoices>) => {
    const result = createSheet(pick, { ...choices, ...changes })
    return "problems" in result ? result.problems : []
  }
  // Two 15s and no 8: not the Standard Array.
  assert.deepEqual(refused({ abilityScores: { ...choices.abilityScores, dex: 15 } }), [
    "the ability scores are the Standard Array, 15, 14, 13, 12, 10, 8, each placed once, and the choices place 15, 15, 14, 13, 12, 10",
  ])
  // The Acolyte cannot raise Constitution, and +2 twice is neither of its ways.
  assert.deepEqual(refused({ abilityIncrease: { wis: 2, con: 2 } }), [
    "the Acolyte background cannot raise con",
    "the Acolyte background raises one of Intelligence, Wisdom, Charisma by 2 and another by 1, or all three by 1",
  ])
  // Keen Senses gives Insight, Perception or Survival, and Stealth is no Cleric skill.
  assert.deepEqual(refused({ speciesSkills: ["arcana"] }), ["Keen Senses gives one of insight, perception, survival, and the choices name none of them"])
  assert.deepEqual(refused({ classSkills: ["medicine", "stealth"] }), ["stealth is not on the Cleric skill list"])
  // A Tiefling knows Thaumaturgy by Otherworldly Presence, so a Tiefling Cleric does not choose it again.
  const tiefling = { ...pick, species: "tiefling" }
  const chosen = autoCreate(tiefling)
  const result = createSheet(tiefling, { ...chosen, cantrips: ["guidance", "sacred-flame", "thaumaturgy"] })
  assert.deepEqual("problems" in result && result.problems, ["the Tiefling already knows Thaumaturgy"])
})

test("Choose For Me makes a legal hero of every class with every species and background", () => {
  const menu = creationMenu()
  assert.deepEqual(
    menu.classes.map((entry) => entry.id),
    [...CREATION_CLASSES]
  )
  // The SRD's nine, then the game's own Half-Elf and Half-Orc.
  assert.equal(menu.species.length, 11)
  assert.equal(menu.backgrounds.length, 4)
  const faults: string[] = []
  for (const cls of CREATION_CLASSES)
    for (const species of menu.species)
      for (const background of menu.backgrounds) {
        const each = { class: cls, species: species.id, background: background.id }
        const result = createSheet(each, creationChoicesSchema.parse(autoCreate(each)))
        if ("problems" in result) faults.push(`${cls} ${species.id} ${background.id}: ${result.problems.join("; ")}`)
        else if (sheetProblems(result.sheet).length) faults.push(`${cls} ${species.id} ${background.id}: ${sheetProblems(result.sheet).join("; ")}`)
      }
  assert.deepEqual(faults, [])
})

const made = (each: CreationPick): { sheet: Sheet; gear: string[] } => {
  const result = createSheet(each, autoCreate(each))
  if ("problems" in result) assert.fail(result.problems.join("; "))
  return result
}
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() as number

test("the game's own species take the SRD's shape, and a Half-Orc's Intimidation is given, not chosen", () => {
  for (const entry of HOUSE_SPECIES) speciesSchema.omit({ page: true }).parse(entry)
  const options = creationOptions({ class: "fighter", species: "half-orc", background: "criminal" })
  assert.equal(options.speciesSkills, undefined)
  assert.equal(
    options.skills.from.some((skill) => skill.id === "intimidation"),
    false
  )
  const { sheet } = made({ class: "fighter", species: "half-orc", background: "criminal" })
  assert.equal(sheet.otherSkills, undefined)
  assert.equal(deriveSheet(sheet).skills.intimidation.proficient, true)
  // A Half-Elf's one skill of any kind is a pick, kept with the other skills.
  assert.deepEqual(
    creationOptions({ class: "fighter", species: "half-elf", background: "criminal" }).speciesSkills?.map((entry) => [entry.trait.name, entry.count, entry.from.length]),
    [["Two Worlds", 1, 18]]
  )
})

test("Advantage on a save to avoid or end Charmed, for a Half-Elf and an Elf, and on no other save", () => {
  for (const [species, trait] of [
    ["half-elf", "Fey Blood"],
    ["elf", "Fey Ancestry"],
  ] as const) {
    const { sheet } = made({ class: "bard", species, background: "sage" })
    const hero = { id: "hero", name: "Hero", type: "pc", sheet }
    assert.deepEqual(saveModesFor(hero, { kind: "save", ability: "wis" }, ["charmed"]), [{ mode: "advantage", from: trait }])
    assert.deepEqual(saveModesFor(hero, { kind: "save", ability: "wis" }, ["frightened"]), [])
    // Charm Person's Wisdom save, DC 13: a 4 and a 15, with Advantage the 15 counts. Wis 10 adds nothing.
    const charmed = rollSave({ target: hero, ability: "wis", dc: 13, d20: falls(4, 15), roll: falls(), characters: [hero], against: ["charmed"] })
    assert.deepEqual([charmed.mode, charmed.dice, charmed.natural, charmed.success], ["advantage", [4, 15], 15, true])
    const plain = rollSave({ target: hero, ability: "wis", dc: 13, d20: falls(4, 15), roll: falls(), characters: [hero] })
    assert.deepEqual([plain.mode, plain.dice, plain.success], ["normal", [4], false])
  }
})

test("1 hit point in place of 0, once a Long Rest, for a Half-Orc and an Orc", () => {
  for (const [species, trait] of [
    ["half-orc", "Hard to Fell"],
    ["orc", "Relentless Endurance"],
  ] as const) {
    const { sheet } = made({ class: "fighter", species, background: "soldier" })
    const maximum = deriveSheet(sheet).hitPointMaximum
    const hero: { id: string; name: string; type: string; sheet: Sheet; hitPoints: number; featureUses?: Record<string, number> } = { id: "hero", name: "Hero", type: "pc", sheet, hitPoints: 5 }
    // 8 damage takes 5 to 0, not killed outright since 3 left over is less than the maximum: held at 1.
    const held = withDamage(hero, 8)
    assert.equal(held.fate, "endures")
    assert.equal(held.character.hitPoints, 1)
    assert.deepEqual(held.character.featureUses, { [`species-${trait.toLowerCase().replace(/ /g, "-")}`]: 1 })
    assert.equal(enduredWords("Hero", held.character), `Hero would drop to 0 hit points and drops to 1 instead, by ${trait}.`)
    // Spent: the next blow drops them, dying.
    assert.equal(withDamage(held.character, 8).fate, "dying")
    // Damage that leaves the maximum over kills outright, and the trait does not hold.
    assert.equal(withDamage(hero, 5 + maximum).fate, "killed")
    // A Long Rest gives the use back.
    const rested = longRest(held.character).character
    assert.equal(rested.featureUses, undefined)
    assert.equal(withDamage({ ...rested, hitPoints: 5 }, 8).fate, "endures")
  }
})

test("a repeated item is one line with its count", () => {
  const { gear } = made({ class: "rogue", species: "halfling", background: "criminal" })
  // The Rogue's two Daggers and Thieves' Tools, and the Criminal's two Daggers and Thieves' Tools.
  assert.equal(gear.filter((line) => line.startsWith("Dagger")).join(), "Dagger (4)")
  assert.equal(gear.filter((line) => line.startsWith("Thieves")).join(), "Thieves’ Tools (2)")
})

test("a hero's record and rules in words, read off the High Elf Cleric's sheet", () => {
  const result = createSheet(pick, choices)
  if ("problems" in result) assert.fail(result.problems.join("; "))
  const { sheet, gear } = result
  assert.deepEqual(heroRecord(sheet, gear), {
    race: "Elf",
    archetype: "Cleric",
    attributes: { strength: 14, dexterity: 8, constitution: 13, intelligence: 10, wisdom: 17, charisma: 13 },
    // The Acolyte's Insight and Religion, Medicine and Persuasion of the Cleric's, Keen Senses' Perception.
    skills: ["Insight", "Medicine", "Perception", "Persuasion", "Religion"],
    equipment: gear.map((name) => ({ name })),
    spells: [],
    specialAbilities: [],
  })
  assert.deepEqual(heroRules(sheet, gear), {
    background: "Acolyte",
    // Wisdom 17 and Strength 14 the highest, Dexterity 8 the lowest.
    strongest: ["Wisdom", "Strength"],
    weakest: "Dexterity",
    skills: ["Insight", "Medicine", "Perception", "Persuasion", "Religion"],
    gear,
    // The three Cleric cantrips and the High Elf's, the four prepared, then Magic Initiate's two cantrips and its spell.
    spells: ["Guidance", "Sacred Flame", "Thaumaturgy", "Prestidigitation", "Bless", "Cure Wounds", "Healing Word", "Shield of Faith", "Light", "Spare the Dying", "Command"],
  })
})
