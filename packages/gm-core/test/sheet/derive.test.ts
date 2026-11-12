import assert from "node:assert/strict"
import { test } from "node:test"
import { deriveSheet, sheetProblems } from "../../src/sheet/derive"
import { type Sheet, sheetSchema } from "../../src/sheet/sheet"

// Every expected number below was worked out by hand from the SRD 5.2.1 rules, not copied from the function's output.

const scores = (str: number, dex: number, con: number, int: number, wis: number, cha: number) => ({ str, dex, con, int, wis, cha })

/** One level 1 character for each class, with the numbers the rules give it. */
const heroes: { name: string; sheet: Sheet; hp: number; ac: number; from: string; initiative: number; speed: number; passive: number; saves: Partial<Record<keyof Sheet["abilityScores"], number>> }[] =
  [
    {
      name: "Barbarian, Human Soldier, no armor and a Shield",
      sheet: { class: "barbarian", level: 1, species: "human", background: "soldier", abilityScores: scores(15, 13, 14, 10, 12, 8), classSkills: ["perception", "survival"], shield: true },
      hp: 14, // d12 + 2
      ac: 15, // Unarmored Defense 10 + 1 Dex + 2 Con, + 2 Shield
      from: "Unarmored Defense",
      initiative: 1,
      speed: 30,
      passive: 13, // 10 + 1 Wis + 2
      saves: { str: 4, con: 4, dex: 1, wis: 1 },
    },
    {
      name: "Bard, Drow Criminal, Leather Armor",
      sheet: {
        class: "bard",
        level: 1,
        species: "elf",
        background: "criminal",
        abilityScores: scores(8, 14, 12, 13, 10, 16),
        classSkills: ["perception", "persuasion", "deception"],
        otherSkills: ["insight"],
        speciesChoices: { "elven-lineage": "drow" },
        armor: "leather-armor",
      },
      hp: 9, // d8 + 1
      ac: 13, // 11 + 2 Dex
      from: "Leather Armor",
      initiative: 4, // 2 Dex + 2 from Alert
      speed: 30,
      passive: 12,
      saves: { dex: 4, cha: 5, wis: 0 },
    },
    {
      name: "Cleric, Dwarf Acolyte, Protector in Chain Mail with a Shield",
      sheet: {
        class: "cleric",
        level: 1,
        species: "dwarf",
        background: "acolyte",
        abilityScores: scores(14, 8, 14, 10, 16, 12),
        classSkills: ["history", "medicine"],
        featureChoices: { "cleric-divine-order": "protector" },
        armor: "chain-mail",
        shield: true,
      },
      hp: 11, // d8 + 2, + 1 Dwarven Toughness
      ac: 18, // 16 + 2 Shield, no Dex
      from: "Chain Mail",
      initiative: -1,
      speed: 30,
      passive: 13,
      saves: { wis: 5, cha: 3, con: 2 },
    },
    {
      name: "Druid, Forest Gnome Sage, Leather Armor and a Shield",
      sheet: {
        class: "druid",
        level: 1,
        species: "gnome",
        background: "sage",
        abilityScores: scores(8, 14, 13, 12, 15, 10),
        classSkills: ["nature", "perception"],
        speciesChoices: { "gnomish-lineage": "forest-gnome" },
        armor: "leather-armor",
        shield: true,
      },
      hp: 9,
      ac: 15, // 11 + 2 Dex + 2 Shield
      from: "Leather Armor",
      initiative: 2,
      speed: 30,
      passive: 14, // 10 + 2 Wis + 2
      saves: { int: 3, wis: 4 },
    },
    {
      name: "Fighter, Orc Soldier, Defense style in Chain Mail",
      sheet: {
        class: "fighter",
        level: 1,
        species: "orc",
        background: "soldier",
        abilityScores: scores(16, 12, 15, 8, 13, 10),
        classSkills: ["perception", "survival"],
        featureChoices: { "fighter-fighting-style": "defense" },
        armor: "chain-mail",
      },
      hp: 12, // d10 + 2
      ac: 17, // 16 + 1 Defense
      from: "Chain Mail",
      initiative: 1,
      speed: 30,
      passive: 13,
      saves: { str: 5, con: 4 },
    },
    {
      name: "Monk, Human Criminal, no armor",
      sheet: { class: "monk", level: 1, species: "human", background: "criminal", abilityScores: scores(10, 16, 13, 8, 15, 12), classSkills: ["acrobatics", "insight"] },
      hp: 9,
      ac: 15, // 10 + 3 Dex + 2 Wis
      from: "Unarmored Defense",
      initiative: 5, // 3 Dex + 2 from Alert
      speed: 30,
      passive: 12,
      saves: { str: 2, dex: 5 },
    },
    {
      name: "Paladin, Red Dragonborn Soldier, Chain Mail and a Shield",
      sheet: {
        class: "paladin",
        level: 1,
        species: "dragonborn",
        background: "soldier",
        abilityScores: scores(16, 8, 14, 10, 12, 15),
        classSkills: ["persuasion", "religion"],
        speciesChoices: { "draconic-ancestry": "red" },
        armor: "chain-mail",
        shield: true,
      },
      hp: 12,
      ac: 18,
      from: "Chain Mail",
      initiative: -1,
      speed: 30,
      passive: 11,
      saves: { wis: 3, cha: 4 },
    },
    {
      name: "Ranger, Wood Elf Criminal, Studded Leather",
      sheet: {
        class: "ranger",
        level: 1,
        species: "elf",
        background: "criminal",
        abilityScores: scores(12, 17, 13, 8, 15, 10),
        classSkills: ["perception", "survival", "nature"],
        otherSkills: ["insight"],
        speciesChoices: { "elven-lineage": "wood-elf" },
        armor: "studded-leather-armor",
      },
      hp: 11, // d10 + 1
      ac: 15, // 12 + 3 Dex
      from: "Studded Leather Armor",
      initiative: 5,
      speed: 35,
      passive: 14,
      saves: { str: 3, dex: 5 },
    },
    {
      name: "Rogue, Halfling Criminal, Leather Armor",
      sheet: {
        class: "rogue",
        level: 1,
        species: "halfling",
        background: "criminal",
        abilityScores: scores(8, 17, 14, 13, 12, 10),
        classSkills: ["acrobatics", "deception", "perception", "investigation"],
        expertise: ["stealth", "sleight-of-hand"],
        armor: "leather-armor",
      },
      hp: 10,
      ac: 14,
      from: "Leather Armor",
      initiative: 5,
      speed: 30,
      passive: 13,
      saves: { dex: 5, int: 3 },
    },
    {
      name: "Sorcerer, Infernal Tiefling Sage, no armor",
      sheet: {
        class: "sorcerer",
        level: 1,
        species: "tiefling",
        background: "sage",
        abilityScores: scores(8, 14, 14, 12, 10, 16),
        classSkills: ["persuasion", "deception"],
        speciesChoices: { "fiendish-legacy": "infernal" },
      },
      hp: 8, // d6 + 2
      ac: 12,
      from: "No armor",
      initiative: 2,
      speed: 30,
      passive: 10,
      saves: { con: 4, cha: 5 },
    },
    {
      name: "Warlock, Human Acolyte, Leather Armor",
      sheet: { class: "warlock", level: 1, species: "human", background: "acolyte", abilityScores: scores(8, 14, 13, 12, 10, 16), classSkills: ["arcana", "deception"], armor: "leather-armor" },
      hp: 9,
      ac: 13,
      from: "Leather Armor",
      initiative: 2,
      speed: 30,
      passive: 10,
      saves: { wis: 2, cha: 5 },
    },
    {
      name: "Wizard, Rock Gnome Sage, no armor",
      sheet: {
        class: "wizard",
        level: 1,
        species: "gnome",
        background: "sage",
        abilityScores: scores(8, 14, 13, 16, 12, 10),
        classSkills: ["investigation", "insight"],
        speciesChoices: { "gnomish-lineage": "rock-gnome" },
      },
      hp: 7, // d6 + 1
      ac: 12,
      from: "No armor",
      initiative: 2,
      speed: 30,
      passive: 11,
      saves: { int: 5, wis: 3 },
    },
  ]

for (const hero of heroes) {
  test(hero.name, () => {
    assert.deepEqual(sheetSchema.parse(hero.sheet), hero.sheet)
    assert.deepEqual(sheetProblems(hero.sheet), [])
    const derived = deriveSheet(hero.sheet)
    assert.equal(derived.proficiencyBonus, 2)
    assert.equal(derived.hitPointMaximum, hero.hp, "hit points")
    assert.equal(derived.armorClass, hero.ac, "Armor Class")
    assert.equal(derived.armorClassFrom, hero.from)
    assert.equal(derived.initiative, hero.initiative, "initiative")
    assert.equal(derived.speed, hero.speed, "speed")
    assert.equal(derived.passivePerception, hero.passive, "passive Perception")
    for (const [ability, bonus] of Object.entries(hero.saves)) assert.equal(derived.savingThrows[ability as keyof Sheet["abilityScores"]].bonus, bonus, `${ability} save`)
  })
}

const by = (className: string) => heroes.find((hero) => hero.sheet.class === className)!.sheet

test("all twelve classes are covered", () => {
  assert.equal(new Set(heroes.map((hero) => hero.sheet.class)).size, 12)
})

test("skills: background and class proficiency, and a Rogue's Expertise", () => {
  const rogue = deriveSheet(by("rogue"))
  assert.deepEqual(rogue.skills.stealth, { bonus: 7, proficient: true, expertise: true }) // 3 Dex + 2 + 2
  assert.deepEqual(rogue.skills["sleight-of-hand"], { bonus: 7, proficient: true, expertise: true })
  assert.deepEqual(rogue.skills.acrobatics, { bonus: 5, proficient: true, expertise: false })
  assert.deepEqual(rogue.skills.athletics, { bonus: -1, proficient: false, expertise: false })
  assert.deepEqual(rogue.skills.arcana, { bonus: 1, proficient: false, expertise: false })
  const bard = deriveSheet(by("bard"))
  assert.equal(bard.skills.insight.bonus, 2, "Keen Senses") // 0 Wis + 2
  assert.equal(bard.skills.persuasion.bonus, 5)
})

test("species: senses, resistances and hit points", () => {
  assert.deepEqual(deriveSheet(by("bard")).senses, [{ type: "darkvision", range: 120 }]) // Drow
  assert.deepEqual(deriveSheet(by("ranger")).senses, [{ type: "darkvision", range: 60 }])
  assert.deepEqual(deriveSheet(by("barbarian")).senses, [])
  assert.deepEqual(deriveSheet(by("cleric")).resistances, ["poison"])
  assert.deepEqual(deriveSheet(by("paladin")).resistances, ["fire"]) // Red ancestry
  assert.deepEqual(deriveSheet(by("sorcerer")).resistances, ["fire"]) // Infernal legacy
  assert.deepEqual(deriveSheet(by("barbarian")).resistances, [], "Rage's resistances hold only while raging")
})

test("feats and features come from the background, the class table and the choices", () => {
  const fighter = deriveSheet(by("fighter"))
  assert.deepEqual(fighter.feats, ["savage-attacker", "defense"])
  assert.deepEqual(fighter.classFeatures, ["fighter-fighting-style", "fighter-second-wind", "fighter-weapon-mastery"])
  assert.deepEqual(deriveSheet(by("cleric")).armorTraining, ["light", "medium", "heavy", "shields"])
  assert.deepEqual(deriveSheet(by("cleric")).weaponProficiencies, [{ category: "simple" }, { category: "martial" }])
  assert.deepEqual(deriveSheet(by("monk")).armorTraining, [])
})

test("armor: the Dexterity cap, a Strength requirement, Stealth and the Defense style", () => {
  const fighter = by("fighter")
  assert.equal(deriveSheet({ ...fighter, armor: "breastplate" }).armorClass, 16) // 14 + 1 Dex + 1 Defense
  assert.equal(deriveSheet({ ...fighter, armor: "breastplate", abilityScores: { ...fighter.abilityScores, dex: 18 } }).armorClass, 17) // Dex capped at 2
  assert.equal(deriveSheet({ ...fighter, armor: undefined }).armorClass, 11, "Defense needs armor") // 10 + 1 Dex
  assert.equal(deriveSheet(fighter).stealthDisadvantage, true)
  assert.equal(deriveSheet(fighter).speed, 30)
  assert.equal(deriveSheet({ ...fighter, abilityScores: { ...fighter.abilityScores, str: 12 } }).speed, 20, "Chain Mail needs Strength 13")
  const monk = by("monk")
  assert.equal(deriveSheet({ ...monk, shield: true }).armorClass, 15, "a Monk's Unarmored Defense does not work with a Shield") // 10 + 3 Dex + 2 Shield
  assert.equal(deriveSheet({ ...monk, shield: true }).armorClassFrom, "No armor")
})

test("levels: proficiency bonus and fixed hit points", () => {
  const fighter = by("fighter")
  assert.equal(deriveSheet({ ...fighter, level: 3 }).hitPointMaximum, 28) // 12, then 6 + 2 twice
  assert.equal(deriveSheet({ ...fighter, level: 5 }).proficiencyBonus, 3)
  assert.equal(deriveSheet({ ...by("cleric"), level: 3 }).hitPointMaximum, 27) // 10, then 5 + 2 twice, + 3 Dwarven Toughness
  assert.equal(deriveSheet({ ...by("rogue"), level: 5 }).skills.stealth.bonus, 9) // 3 Dex + 3 + 3
})

test("problems are named", () => {
  const cleric = by("cleric")
  assert.deepEqual(sheetProblems({ ...cleric, featureChoices: undefined }), ["Cleric has no training with heavy armor"])
  assert.deepEqual(sheetProblems({ ...by("monk"), shield: true }), ["Monk has no training with Shields"])
  assert.deepEqual(sheetProblems({ ...cleric, classSkills: ["history", "stealth"] }), ["stealth is not on the Cleric skill list"])
  assert.deepEqual(sheetProblems({ ...cleric, classSkills: ["history", "insight"] }), ["insight already comes from the Acolyte background"])
  assert.deepEqual(sheetProblems({ ...cleric, classSkills: ["history"] }), ["Cleric chooses 2 skills, and the sheet has 1"])
  assert.deepEqual(sheetProblems({ ...by("rogue"), expertise: ["arcana", "stealth"] }), ["Expertise in arcana needs proficiency in it"])
  assert.deepEqual(sheetProblems({ ...by("bard"), expertise: ["stealth"] }), ["the sheet has Expertise in 1 skills, and its class features allow 0"])
  assert.deepEqual(sheetProblems({ ...cleric, species: "ogre" }), ['"ogre" is not a species'])
  assert.deepEqual(sheetProblems({ ...cleric, armor: "longsword" }), ['"longsword" is not armor'])
  assert.deepEqual(sheetProblems({ ...by("fighter"), featureChoices: { "fighter-fighting-style": "alert" } }), ["Alert is not a fighting-style feat, which Fighting Style needs"])
  assert.deepEqual(sheetProblems({ ...by("bard"), speciesChoices: { "elven-lineage": "red" } }), ['"red" is not an option of Elven Lineage'])
  assert.throws(() => deriveSheet({ ...cleric, species: "ogre" }), /not a species/)
})
