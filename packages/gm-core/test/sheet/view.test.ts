import assert from "node:assert/strict"
import { test } from "node:test"
import type { Sheet } from "../../src/sheet/sheet"
import { sheetView } from "../../src/sheet/view"

const scores = (str: number, dex: number, con: number, int: number, wis: number, cha: number) => ({ str, dex, con, int, wis, cha })

const fighter: Sheet = {
  class: "fighter",
  level: 1,
  species: "orc",
  background: "soldier",
  abilityScores: scores(16, 12, 15, 8, 13, 10),
  classSkills: ["perception", "survival"],
  featureChoices: { "fighter-fighting-style": "defense" },
  armor: "chain-mail",
}

test("the view spells out names and numbers", () => {
  const view = sheetView(fighter, 9)
  assert.equal(`${view.speciesName} ${view.className} ${view.level}, ${view.backgroundName}`, "Orc Fighter 1, Soldier")
  assert.deepEqual(view.hitPoints, { current: 9, maximum: 12 })
  assert.equal(view.armorClass, 17)
  assert.deepEqual(view.abilities[0], { id: "str", name: "Strength", score: 16, modifier: 3, save: 5, saveProficient: true })
  assert.deepEqual(
    view.skills.find((skill) => skill.id === "sleight-of-hand"),
    { id: "sleight-of-hand", name: "Sleight of Hand", ability: "dex", bonus: 1, proficient: false, expertise: false }
  )
  assert.deepEqual(view.senses, [{ name: "Darkvision", range: 120 }])
  assert.equal(view.skills.length, 18)
})

test("level 1 features are listed with their uses", () => {
  const names = (sheet: Sheet) => sheetView(sheet).features.map((feature) => (feature.uses ? `${feature.name} (${feature.uses.count} per ${feature.uses.recharge})` : feature.name))
  // Second Wind: 2 uses at level 1, by the Fighter table. An Orc's Adrenaline Rush: Proficiency Bonus uses.
  assert.deepEqual(names(fighter), [
    "Fighting Style: Defense",
    "Second Wind (2 per Long Rest)",
    "Weapon Mastery",
    "Adrenaline Rush (2 per Short or Long Rest)",
    "Darkvision",
    "Relentless Endurance (1 per Long Rest)",
    "Savage Attacker",
  ])
  // Rage: 2 uses at level 1. Bardic Inspiration: Charisma modifier uses.
  const barbarian: Sheet = {
    class: "barbarian",
    level: 1,
    species: "human",
    background: "soldier",
    abilityScores: scores(15, 13, 14, 10, 12, 8),
    classSkills: ["perception", "survival"],
    feats: ["alert"],
  }
  assert.deepEqual(names(barbarian), ["Rage (2 per Long Rest)", "Unarmored Defense", "Weapon Mastery", "Resourceful", "Skillful", "Versatile", "Savage Attacker", "Alert"])
  const bard: Sheet = {
    class: "bard",
    level: 1,
    species: "elf",
    background: "criminal",
    abilityScores: scores(8, 14, 12, 13, 10, 16),
    classSkills: ["perception", "persuasion", "deception"],
    speciesChoices: { "elven-lineage": "drow" },
  }
  assert.deepEqual(names(bard).slice(0, 4), ["Bardic Inspiration (3 per Long Rest)", "Spellcasting", "Darkvision", "Elven Lineage: Drow"])
  assert.equal(sheetView(barbarian).features.at(-1)?.from, "Feat")
  assert.equal(sheetView(barbarian).features.at(-2)?.from, "Soldier")
})

test("every class lists its level 1 features", () => {
  const classes = ["barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"] as const
  const counts = classes.map(
    (id) =>
      sheetView({ class: id, level: 1, species: "human", background: "sage", abilityScores: scores(10, 10, 10, 10, 10, 10), classSkills: [] }).features.filter(
        (feature) => feature.from !== "Human" && feature.from !== "Sage"
      ).length
  )
  // The count of level 1 features in each class table of SRD 5.2.1.
  assert.deepEqual(counts, [3, 2, 2, 3, 3, 2, 3, 3, 4, 2, 2, 3])
})
