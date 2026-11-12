import assert from "node:assert/strict"
import { test } from "node:test"
import { classFeatures } from "@d20/srd/class-features"
import { feats } from "@d20/srd/feats"
import { deriveSheet, JUDGED_CONDITIONS, sheetProblems } from "../../src/sheet/derive"
import { featureUseCount } from "../../src/sheet/feature-rules"
import { levelUp, levelUpOptions } from "../../src/sheet/level-up"
import { autoChoices } from "../../src/sheet/milestone"
import type { Sheet } from "../../src/sheet/sheet"
import { spellsOf } from "../../src/sheet/spells"
import { sheetView } from "../../src/sheet/view"

// Every expected value below was worked out by hand from the SRD 5.2.1 rules, not copied from the function's output.
// Each hero places the class's Standard Array by Class (p. 21) and takes their background's increase.

const saves = (sheet: Sheet) =>
  Object.entries(deriveSheet(sheet).savingThrows)
    .filter(([, save]) => save.proficient)
    .map(([ability, save]) => `${ability} ${save.bonus}`)
const numbers = (sheet: Sheet) => {
  const derived = deriveSheet(sheet)
  return { hitPoints: derived.hitPointMaximum, armorClass: derived.armorClass, speed: derived.speed, saves: saves(sheet) }
}
const ok = (result: ReturnType<typeof levelUp>): Sheet => {
  if ("problems" in result) assert.fail(result.problems.join("; "))
  return result.sheet
}

// A Dwarf Barbarian, Soldier: 15 13 14 10 12 8, the Soldier's Str +2 and Con +1, then an Ability Score Improvement of
// Str +1 and Con +1 at 4: Str 18, Dex 13, Con 16. Hit points: 12 + 3 at level 1, 7 + 3 for each of four levels after,
// and Dwarven Toughness's 1 a level, 15 + 40 + 5 = 60. Armor Class: Unarmored Defense 10 + Dex 1 + Con 3 and a Shield,
// 16. Speed: 30 and Fast Movement's 10 out of Heavy armor, 40. Saves: Str 4 + 3, Con 3 + 3.
const barbarian: Sheet = {
  class: "barbarian",
  level: 5,
  subclass: "path-of-the-berserker",
  species: "dwarf",
  background: "soldier",
  abilityScores: { str: 18, dex: 13, con: 16, int: 10, wis: 12, cha: 8 },
  classSkills: ["perception", "survival"],
  shield: true,
  weapons: ["greataxe", "handaxe"],
  weaponMasteries: ["greataxe", "handaxe", "javelin"],
  advancements: [
    { level: 3, skills: ["animal-handling"] },
    { level: 4, feat: "ability-score-improvement", abilities: { str: 1, con: 1 } },
  ],
}

// A Wood Elf Monk, Soldier: 12 15 13 10 14 8, Dex +2 and Con +1, then Dex +1 and Wis +1 at 4: Dex 18, Con 14, Wis 15.
// Hit points: 8 + 2, and 5 + 2 for four levels, 38. Armor Class: 10 + Dex 4 + Wis 2, 16. Speed: the Wood Elf's 35 and
// Unarmored Movement's 10 by the Monk table at level 5, 45. Saves: Str 1 + 3, Dex 4 + 3.
const monk: Sheet = {
  class: "monk",
  level: 5,
  subclass: "warrior-of-the-open-hand",
  species: "elf",
  speciesChoices: { "elven-lineage": "wood-elf" },
  background: "soldier",
  abilityScores: { str: 12, dex: 18, con: 14, int: 10, wis: 15, cha: 8 },
  classSkills: ["acrobatics", "stealth"],
  weapons: ["shortsword"],
  advancements: [{ level: 4, feat: "ability-score-improvement", abilities: { dex: 1, wis: 1 } }],
}

// A Human Paladin, Soldier: 15 10 13 8 12 14, Str +2 and Con +1, then Str +1 and Cha +1 at 4: Str 18, Con 14, Wis 12,
// Cha 15. Hit points: 10 + 2, and 6 + 2 for four levels, 44. Armor Class: Chain Mail 16 and a Shield, 18. Speed 30.
// Saves: Wis 1 + 3, Cha 2 + 3. Blessed Warrior brings two Cleric cantrips, and the table six prepared spells beside
// the Oath of Devotion's, Paladin's Smite's Divine Smite and Faithful Steed's Find Steed.
const paladin: Sheet = {
  class: "paladin",
  level: 5,
  subclass: "oath-of-devotion",
  species: "human",
  background: "soldier",
  abilityScores: { str: 18, dex: 10, con: 14, int: 8, wis: 12, cha: 15 },
  classSkills: ["insight", "persuasion"],
  featureChoices: { "paladin-fighting-style": "blessed-warrior" },
  armor: "chain-mail",
  shield: true,
  weapons: ["longsword", "javelin"],
  weaponMasteries: ["longsword", "javelin"],
  cantrips: ["guidance", "sacred-flame"],
  spells: ["bless", "command", "cure-wounds", "heroism", "lesser-restoration", "magic-weapon"],
  advancements: [{ level: 4, feat: "ability-score-improvement", abilities: { str: 1, cha: 1 } }],
}

// A Human Druid of the Land, Criminal: 8 12 14 13 15 10, Con +2 and Dex +1, then Wis +2 at 4: Dex 13, Con 16, Wis 17.
// Hit points: 8 + 3, and 5 + 3 for four levels, 43. Armor Class: the Warden's Medium armor training lets her wear Hide,
// 12 + Dex 1, and a Shield, 15. Speed 30. Saves: Int 1 + 3, Wis 3 + 3. The polar land keeps Fog Cloud, Hold Person and
// Sleet Storm prepared and Ray of Frost known.
const druid: Sheet = {
  class: "druid",
  level: 5,
  subclass: "circle-of-the-land",
  species: "human",
  background: "criminal",
  abilityScores: { str: 8, dex: 13, con: 16, int: 13, wis: 17, cha: 10 },
  classSkills: ["perception", "nature"],
  featureChoices: { "druid-primal-order": "warden", "circle-of-the-land-circle-of-the-land-spells": "polar" },
  armor: "hide-armor",
  shield: true,
  weapons: ["quarterstaff"],
  cantrips: ["druidcraft", "guidance", "produce-flame"],
  spells: ["cure-wounds", "entangle", "healing-word", "thunderwave", "barkskin", "moonbeam", "spike-growth", "call-lightning", "dispel-magic"],
  advancements: [{ level: 4, feat: "ability-score-improvement", abilities: { wis: 2 } }],
}

// A Human Draconic Sorcerer, Criminal: 10 13 14 8 12 15, Con +2 and Dex +1, then Cha +2 at 4: Dex 14, Con 16, Cha 17.
// Hit points: 6 + 3, 4 + 3 for four levels, and Draconic Resilience's 3 at level 3 and 1 at each Sorcerer level after,
// 9 + 28 + 5 = 42. Armor Class: Draconic Resilience's 10 + Dex 2 + Cha 3, 15. Speed 30. Saves: Con 3 + 3, Cha 3 + 3.
const sorcerer: Sheet = {
  class: "sorcerer",
  level: 5,
  subclass: "draconic-sorcery",
  species: "human",
  background: "criminal",
  abilityScores: { str: 10, dex: 14, con: 16, int: 8, wis: 12, cha: 17 },
  classSkills: ["arcana", "persuasion"],
  weapons: ["dagger"],
  featurePicks: { "sorcerer-metamagic": [{ option: "quickened-spell" }, { option: "twinned-spell" }] },
  cantrips: ["fire-bolt", "light", "mage-hand", "prestidigitation", "ray-of-frost"],
  spells: ["burning-hands", "magic-missile", "shield", "sleep", "misty-step", "scorching-ray", "counterspell", "fireball", "haste"],
  advancements: [{ level: 4, feat: "ability-score-improvement", abilities: { cha: 2 } }],
}

// A Human Fiend Warlock, Criminal: 8 14 13 12 10 15, Con +2 and Dex +1, then Cha +2 at 4: Dex 15, Con 15, Cha 17.
// Hit points: 8 + 2, and 5 + 2 for four levels, 38. Armor Class: Leather 11 + Dex 2, 13. Speed 30. Saves: Wis 0 + 3,
// Cha 3 + 3. Five invocations at level 5 by the Warlock table.
const warlock: Sheet = {
  class: "warlock",
  level: 5,
  subclass: "fiend-patron",
  species: "human",
  background: "criminal",
  abilityScores: { str: 8, dex: 15, con: 15, int: 12, wis: 10, cha: 17 },
  classSkills: ["arcana", "deception"],
  armor: "leather-armor",
  weapons: ["dagger"],
  featurePicks: {
    "warlock-eldritch-invocations": [
      { option: "pact-of-the-blade" },
      { option: "eldritch-smite" },
      { option: "agonizing-blast", cantrip: "eldritch-blast" },
      { option: "armor-of-shadows" },
      { option: "lessons-of-the-first-ones", feat: "savage-attacker" },
    ],
  },
  cantrips: ["eldritch-blast", "chill-touch", "mage-hand"],
  spells: ["hex", "hellish-rebuke", "misty-step", "hold-person", "counterspell", "fly"],
  advancements: [{ level: 4, feat: "ability-score-improvement", abilities: { cha: 2 } }],
}

test("a level 5 hero of each of the six other classes: Speed, hit points, Armor Class and saves by hand", () => {
  for (const sheet of [barbarian, monk, paladin, druid, sorcerer, warlock]) assert.deepEqual(sheetProblems(sheet), [], sheet.class)
  assert.deepEqual(numbers(barbarian), { hitPoints: 60, armorClass: 16, speed: 40, saves: ["str 7", "con 6"] })
  assert.deepEqual(numbers(monk), { hitPoints: 38, armorClass: 16, speed: 45, saves: ["str 4", "dex 7"] })
  assert.deepEqual(numbers(paladin), { hitPoints: 44, armorClass: 18, speed: 30, saves: ["wis 4", "cha 5"] })
  assert.deepEqual(numbers(druid), { hitPoints: 43, armorClass: 15, speed: 30, saves: ["int 4", "wis 6"] })
  assert.deepEqual(numbers(sorcerer), { hitPoints: 42, armorClass: 15, speed: 30, saves: ["con 6", "cha 6"] })
  assert.deepEqual(numbers(warlock), { hitPoints: 38, armorClass: 13, speed: 30, saves: ["wis 3", "cha 6"] })

  // Fast Movement holds out of Heavy armor only, and Unarmored Movement out of armor and with no Shield.
  assert.equal(deriveSheet({ ...barbarian, armor: "chain-mail", shield: false }).speed, 30)
  assert.equal(deriveSheet({ ...barbarian, armor: "breastplate" }).speed, 40)
  assert.equal(deriveSheet({ ...monk, shield: true }).speed, 35)
  // Unarmored Movement grows by the Monk table: 15 at level 6, so a level 6 Wood Elf Monk walks 50.
  assert.equal(deriveSheet({ ...monk, level: 6 }).speed, 50)
  // Draconic Resilience counts from level 3: 3 then, 4 at level 4.
  assert.equal(deriveSheet({ ...sorcerer, level: 3 }).hitPointMaximum, 9 + 2 * 7 + 3)
  assert.equal(deriveSheet({ ...sorcerer, level: 4 }).hitPointMaximum, 9 + 3 * 7 + 4)

  // The land's spells are prepared and its cantrip known, none of them listed on the sheet.
  const land = deriveSheet(druid)
  for (const id of ["fog-cloud", "hold-person", "sleet-storm", "speak-with-animals"]) assert.ok(land.alwaysPrepared.includes(id), id)
  assert.ok(land.cantrips.includes("ray-of-frost"))
  assert.ok(!land.preparedSpells.includes("ray-of-frost"))
  assert.deepEqual(
    spellsOf({ type: "pc", sheet: druid })
      .filter((known) => known.spell.id === "ray-of-frost")
      .map((known) => known.cantrip),
    [true]
  )
  assert.deepEqual(sheetProblems({ ...druid, spells: ["fog-cloud", ...(druid.spells ?? []).slice(1)] }), ['"fog-cloud" is always prepared, so it is not listed among the prepared spells'])

  // Lessons of the First Ones gives its Origin feat.
  assert.ok(deriveSheet(warlock).feats.includes("savage-attacker"))
})

test("the typed Speed, save, hit point and sense fields of every class feature and option are read", () => {
  // Every condition a Speed bonus holds under is one the sheet judges, or one it leaves to play (raging, an aura).
  const conditions = classFeatures
    .flatMap((feature) => [feature, ...(feature.options ?? [])])
    .flatMap((entry) => (entry.speedBonus ? [entry.speedBonus.while ?? entry.speedBonus.appliesWhen ?? ""] : []))
  assert.deepEqual(
    conditions.filter((words) => words && !JUDGED_CONDITIONS.includes(words)),
    []
  )
  // Ranger’s Roving, 10 out of Heavy armor from level 6; Feral Senses’ Blindsight at 18; a Rogue’s Slippery Mind at 15,
  // Dex 1, Int 0, Wis 1 and Cha -1 with a Proficiency Bonus of 5,
  // and a Monk's Disciplined Survivor at 14.
  const ranger: Sheet = { class: "ranger", level: 18, species: "human", background: "soldier", abilityScores: barbarian.abilityScores, classSkills: [] }
  assert.equal(deriveSheet({ ...ranger, level: 6 }).speed, 40)
  assert.deepEqual(deriveSheet(ranger).senses, [{ type: "blindsight", range: 30 }])
  assert.deepEqual(saves({ ...ranger, class: "rogue", level: 15 }), ["dex 6", "int 5", "wis 6", "cha 4"])
  assert.equal(saves({ ...monk, level: 14 }).length, 6)
  // Witch Sight, an invocation of level 15, gives Truesight 30; Boon of Truesight gives 60.
  const sighted: Sheet = { ...warlock, level: 15, featurePicks: { "warlock-eldritch-invocations": [{ option: "witch-sight" }] } }
  assert.deepEqual(deriveSheet(sighted).senses, [{ type: "truesight", range: 30 }])
  assert.ok(feats.some((feat) => feat.id === "boon-of-truesight"))
  assert.deepEqual(deriveSheet({ ...barbarian, species: "human", level: 19, advancements: [{ level: 19, feat: "boon-of-truesight", abilities: { str: 1 } }] }).senses, [
    { type: "truesight", range: 60 },
  ])
})

test("the choices a feature keeps, given and refused", () => {
  // Primal Order at level 1: the Warden's training, or the Magician's one more Druid cantrip.
  const druid1: Sheet = {
    ...druid,
    level: 1,
    subclass: undefined,
    armor: "leather-armor",
    cantrips: ["druidcraft", "guidance"],
    spells: ["cure-wounds", "entangle", "healing-word", "thunderwave"],
    advancements: [],
  }
  delete druid1.subclass
  const { "circle-of-the-land-circle-of-the-land-spells": _, ...primal } = druid.featureChoices ?? {}
  druid1.featureChoices = primal
  assert.deepEqual(sheetProblems(druid1), [])
  assert.deepEqual(sheetProblems({ ...druid1, featureChoices: {} }), ["Primal Order needs a choice, and the sheet has none"])
  assert.deepEqual(sheetProblems({ ...druid1, featureChoices: { "druid-primal-order": "berserker" } }), ['"berserker" is not an option of Primal Order'])
  // A Magician knows three cantrips at level 1, and has no Medium armor training for Hide.
  assert.deepEqual(sheetProblems({ ...druid1, featureChoices: { "druid-primal-order": "magician" }, cantrips: ["druidcraft", "guidance", "shillelagh"] }), [])
  assert.deepEqual(sheetProblems({ ...druid1, armor: "hide-armor", featureChoices: { "druid-primal-order": "magician" }, cantrips: ["druidcraft", "guidance", "shillelagh"] }), [
    "Druid has no training with medium armor",
  ])

  // Circle of the Land's land, one of four, needed from level 3.
  const { "circle-of-the-land-circle-of-the-land-spells": __, ...noLand } = druid.featureChoices ?? {}
  assert.deepEqual(sheetProblems({ ...druid, featureChoices: noLand }), ["Circle of the Land Spells needs a choice, and the sheet has none"])
  assert.deepEqual(sheetProblems({ ...druid, featureChoices: { ...druid.featureChoices, "circle-of-the-land-circle-of-the-land-spells": "volcanic" } }), [
    '"volcanic" is not an option of Circle of the Land Spells',
  ])
  // Nature's Ward at level 10: Resistance by the land, Cold for the polar.
  assert.deepEqual(deriveSheet({ ...druid, level: 10 }).resistances, ["cold"])

  // Blessed Warrior's two Cleric cantrips: one is too few.
  assert.deepEqual(sheetProblems({ ...paladin, cantrips: ["guidance"] }), ["Paladin knows 2 cantrips at level 5, and the sheet has 1"])
  assert.deepEqual(sheetProblems({ ...paladin, cantrips: ["guidance", "fire-bolt"] }), ['"fire-bolt" is not a Paladin cantrip'])

  // Elemental Affinity's type among the five of dragons, and its Resistance.
  const sorcerer6: Sheet = { ...sorcerer, level: 6, featureChoices: { "draconic-sorcery-elemental-affinity": "fire" } }
  assert.deepEqual(deriveSheet(sorcerer6).resistances, ["fire"])
  assert.deepEqual(
    sheetProblems({ ...sorcerer, level: 6 }).filter((problem) => problem.includes("Elemental")),
    ["Elemental Affinity needs a choice, and the sheet has none"]
  )
  assert.deepEqual(
    sheetProblems({ ...sorcerer6, featureChoices: { "draconic-sorcery-elemental-affinity": "force" } }).filter((problem) => problem.includes("Elemental")),
    ['"force" is not an option of Elemental Affinity']
  )
  // Fiendish Resilience takes any type but Force.
  assert.deepEqual(deriveSheet({ ...warlock, level: 10, featureChoices: { "fiend-patron-fiendish-resilience": "psychic" } }).resistances, ["psychic"])
  assert.deepEqual(
    sheetProblems({ ...warlock, level: 10, featureChoices: { "fiend-patron-fiendish-resilience": "force" } }).filter((problem) => problem.includes("Fiendish")),
    ['"force" is not an option of Fiendish Resilience']
  )

  // Blessed Strikes is chosen at 7, and Improved Blessed Strikes keeps that option, taking none of its own.
  const cleric: Sheet = { class: "cleric", level: 14, subclass: "life-domain", species: "human", background: "acolyte", abilityScores: paladin.abilityScores, classSkills: [] }
  const named = (sheet: Sheet) =>
    sheetView(sheet)
      .features.filter((feature) => feature.name.includes("Blessed Strikes"))
      .map((feature) => feature.name)
  const struck: Sheet = { ...cleric, featureChoices: { "cleric-blessed-strikes": "divine-strike" } }
  assert.ok(!sheetProblems(struck).some((problem) => problem.includes("Blessed")))
  assert.deepEqual(named(struck), ["Blessed Strikes: Divine Strike", "Improved Blessed Strikes: Divine Strike"])
  assert.ok(sheetProblems(cleric).includes("Blessed Strikes needs a choice, and the sheet has none"))
  assert.ok(
    sheetProblems({ ...struck, featureChoices: { ...struck.featureChoices, "cleric-improved-blessed-strikes": "potent-spellcasting" } }).includes(
      "Improved Blessed Strikes keeps the option chosen for Blessed Strikes, and takes none of its own"
    )
  )
  // Elemental Fury likewise, and a Hunter's Defensive Tactics at 7.
  assert.ok(sheetProblems({ ...druid, level: 7 }).includes("Elemental Fury needs a choice, and the sheet has none"))
  const hunter: Sheet = { class: "ranger", level: 7, subclass: "hunter", species: "human", background: "soldier", abilityScores: paladin.abilityScores, classSkills: [] }
  assert.ok(sheetProblems(hunter).includes("Defensive Tactics needs a choice, and the sheet has none"))
  assert.ok(!sheetProblems({ ...hunter, featureChoices: { "hunter-defensive-tactics": "escape-the-horde" } }).some((problem) => problem.includes("Defensive")))
})

test("a Druid of the Land takes her land at level 3, and its spells leave her prepared list", () => {
  const druid2: Sheet = { ...druid, level: 2, subclass: undefined, armor: "leather-armor", featureChoices: { "druid-primal-order": "warden" }, cantrips: ["druidcraft", "guidance"], advancements: [] }
  delete druid2.subclass
  druid2.spells = ["cure-wounds", "entangle", "healing-word", "thunderwave", "fog-cloud"]
  druid2.abilityScores = { ...druid.abilityScores, wis: 15 }
  assert.deepEqual(sheetProblems(druid2), [])
  const options = levelUpOptions(druid2)
  const land = options.featureChoices?.find((entry) => entry.feature.id === "circle-of-the-land-circle-of-the-land-spells")
  assert.deepEqual(
    land?.options.map((option) => option.id),
    ["arid", "polar", "temperate", "tropical"]
  )
  // The polar land keeps Fog Cloud and Hold Person prepared: Fog Cloud leaves her list and is replaced, so she picks
  // the one the table adds (5 to 6) and one more.
  assert.deepEqual(
    land?.options.find((option) => option.id === "polar")?.prepares?.map((spell) => spell.id),
    ["fog-cloud", "hold-person"]
  )
  assert.equal(options.spells?.count, 1)
  const taken = ok(levelUp(druid2, { subclass: "circle-of-the-land", featureChoices: { "circle-of-the-land-circle-of-the-land-spells": "polar" }, spells: ["barkskin", "moonbeam"] }))
  assert.deepEqual(taken.spells, ["cure-wounds", "entangle", "healing-word", "thunderwave", "barkskin", "moonbeam"])
  assert.ok(deriveSheet(taken).cantrips.includes("ray-of-frost"))
  // Choose For Me does the same.
  assert.ok(ok(levelUp(druid2, autoChoices(druid2))).featureChoices?.["circle-of-the-land-circle-of-the-land-spells"])
})

test("Lay on Hands is a pool of five points a Paladin level, shown as points left of a total", () => {
  assert.equal(featureUseCount(paladin, "paladin-lay-on-hands"), 25)
  assert.equal(featureUseCount({ ...paladin, level: 1, subclass: undefined }, "paladin-lay-on-hands"), 5)
  const shown = sheetView(paladin, undefined, undefined, undefined, { "paladin-lay-on-hands": 7 }).features.find((feature) => feature.name === "Lay On Hands")
  assert.deepEqual(shown?.uses, { count: 25, left: 18, recharge: "Long Rest", points: true })
})
