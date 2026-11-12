import assert from "node:assert/strict"
import { test } from "node:test"
import { autoCreate, CREATION_CLASSES, type CreationChoices, createSheet, creationChoicesSchema, creationMenu, creationOptions } from "../../src/sheet/create"
import { deriveSheet, sheetProblems } from "../../src/sheet/derive"
import { slotsLeft, spellcastingFor, spellcastingOf } from "../../src/sheet/spells"

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
    "the Acolyte background raises one of int, wis, cha by 2 and another by 1, or all three by 1",
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
  assert.equal(menu.species.length, 9)
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
