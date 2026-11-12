import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { deriveSheet, sheetProblems } from "../../src/sheet/derive"
import { levelUp, levelUpOptions } from "../../src/sheet/level-up"
import type { Sheet } from "../../src/sheet/sheet"
import { castCost, castSpell, slotsLeft, spellById, spellsOf, spellWords, targetLimit, withCastSpent } from "../../src/sheet/spells"
import { sheetView } from "../../src/sheet/view"

// Every expected value below was worked out by hand from the SRD 5.2.1 rules, not copied from the function's output.

const sheet = (path: string) => (JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { sheet: Sheet }).sheet
const lyra = sheet("covert-cargo/characters/1749159962941.json")
const thalbern = sheet("covert-cargo/characters/thalbern.json")
const milos = sheet("welcome-to-kordavos/characters/milos-radan.json")
const branka = sheet("welcome-to-kordavos/characters/branka-stoneveil.json")
const ilya = sheet("welcome-to-kordavos/characters/ilya-veles.json")
const spell = (id: string) => spellById.get(id) as NonNullable<ReturnType<typeof spellById.get>>
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() as number
const ok = (result: ReturnType<typeof levelUp>): Sheet => {
  if ("problems" in result) assert.fail(result.problems.join("; "))
  return result.sheet
}

// Milos at level 3, a Life Domain Cleric: 3 cantrips and Thaumaturge's one more, 6 prepared. Bless is now always
// prepared by the Life Domain, so it leaves his list for Command and Spiritual Weapon, a level 2 spell.
const milos3: Sheet = { ...milos, level: 3, subclass: "life-domain", spells: ["healing-word", "guiding-bolt", "shield-of-faith", "sanctuary", "command", "spiritual-weapon"] }

test("a level 3 Life Domain Cleric: a subclass is needed, and its spells are always prepared beside the six of the table", () => {
  assert.deepEqual(sheetProblems(milos3), [])
  assert.deepEqual(sheetProblems({ ...milos3, subclass: undefined }), ["Cleric chooses a subclass at level 3, and the sheet has none"])
  assert.deepEqual(sheetProblems({ ...milos, level: 2, subclass: "life-domain", spells: [...(milos.spells ?? []), "command"] }), ["Cleric chooses a subclass at level 3, and the sheet is level 2"])
  assert.deepEqual(sheetProblems({ ...milos3, subclass: "champion" }), ['"champion" is not a Cleric subclass'])
  // Bless listed again is one prepared spell spent on what the domain already gives.
  assert.deepEqual(sheetProblems({ ...milos3, spells: ["bless", ...(milos3.spells ?? []).slice(1)] }), ['"bless" is always prepared, so it is not listed among the prepared spells'])
  const derived = deriveSheet(milos3)
  // The Life Domain's features of level 3 come after the class's own.
  assert.deepEqual(derived.classFeatures.slice(-4), ["cleric-cleric-subclass", "life-domain-disciple-of-life", "life-domain-life-domain-spells", "life-domain-preserve-life"])
  assert.deepEqual(derived.alwaysPrepared, ["aid", "bless", "cure-wounds", "lesser-restoration"])
  // Six of his own and four of the domain's: ten to cast. A level 3 Cleric has four level 1 slots and two of level 2.
  const caster = { type: "pc", name: "Milos", sheet: milos3 }
  assert.equal(spellsOf(caster).filter((known) => known.prepared && !known.cantrip).length, 10)
  assert.deepEqual(slotsLeft(caster).slice(0, 3), [4, 2, 0])
  const cost = castCost(caster, "aid")
  assert.deepEqual("cost" in cost && cost.cost, { kind: "slot", level: 2 })
  assert.equal(spellWords(caster).split(". ").at(-1), "Spell slots left: 4 of level 1, 2 of level 2")
  assert.deepEqual(sheetView(milos3).spellcasting?.slots, [
    { level: 1, total: 4, left: 4 },
    { level: 2, total: 2, left: 2 },
  ])
  assert.equal(sheetView(milos3).subclassName, "Life Domain")
})

test("a level 4 Fighter's Ability Score Improvement: one score by 2 or two by 1, none past 20", () => {
  // Branka at level 4: the Champion from level 3, and Strength 16 raised by 2 to 18.
  const fighter: Sheet = {
    ...branka,
    level: 4,
    subclass: "champion",
    abilityScores: { ...branka.abilityScores, str: 18 },
    advancements: [{ level: 4, feat: "ability-score-improvement", abilities: { str: 2 } }],
  }
  assert.deepEqual(sheetProblems(fighter), [])
  // Two by 1: Strength 17 and Constitution 17.
  assert.deepEqual(
    sheetProblems({ ...fighter, abilityScores: { ...branka.abilityScores, str: 17, con: 17 }, advancements: [{ level: 4, feat: "ability-score-improvement", abilities: { str: 1, con: 1 } }] }),
    []
  )
  // One by 1 is not a way to spend it, nor is 2 and 1.
  const asi = "Ability Score Improvement raises one score by 2 or 2 scores by 1, at level 4"
  assert.deepEqual(sheetProblems({ ...fighter, advancements: [{ level: 4, feat: "ability-score-improvement", abilities: { str: 1 } }] }), [asi])
  assert.deepEqual(sheetProblems({ ...fighter, advancements: [{ level: 4, feat: "ability-score-improvement", abilities: { str: 2, con: 1 } }] }), [asi])
  // Strength 19 raised by 2 would be 21: the stored 21 is past the feat's maximum of 20.
  assert.deepEqual(sheetProblems({ ...fighter, abilityScores: { ...branka.abilityScores, str: 21 } }), ["Ability Score Improvement at level 4 raises str to 21, past its maximum of 20"])
  // No feat named at level 4.
  assert.deepEqual(sheetProblems({ ...fighter, advancements: undefined }), ["Ability Score Improvement gives one feat at level 4, and the sheet names 0"])
  // Grappler in its place: Level 4+, Strength or Dexterity 13+, and +1 to one of the two.
  assert.deepEqual(sheetProblems({ ...fighter, abilityScores: { ...branka.abilityScores, str: 17 }, advancements: [{ level: 4, feat: "grappler", abilities: { str: 1 } }] }), [])
  assert.deepEqual(sheetProblems({ ...fighter, abilityScores: { ...branka.abilityScores, int: 11 }, advancements: [{ level: 4, feat: "grappler", abilities: { int: 1 } }] }), [
    "Grappler cannot raise int, at level 4",
  ])
  assert.deepEqual(deriveSheet({ ...fighter, abilityScores: { ...branka.abilityScores, str: 17 }, advancements: [{ level: 4, feat: "grappler", abilities: { str: 1 } }] }).feats, [
    "savage-attacker",
    "defense",
    "grappler",
  ])
})

test("a level 2 Bard's Expertise: two skills the Bard is proficient in", () => {
  const bard: Sheet = { ...ilya, level: 2, expertise: ["persuasion", "performance"], spells: [...(ilya.spells ?? []), "bane"] }
  assert.deepEqual(sheetProblems(bard), [])
  assert.deepEqual(deriveSheet(bard).skills.persuasion, { bonus: 7, proficient: true, expertise: true }) // 3 Cha + 2 + 2
  assert.deepEqual(sheetProblems({ ...bard, expertise: ["persuasion"] }), ["the sheet has Expertise in 1 skills, and its class features allow 2"])
  assert.deepEqual(sheetProblems({ ...bard, expertise: ["persuasion", "stealth"] }), ["Expertise in stealth needs proficiency in it"])
  assert.deepEqual(sheetProblems({ ...bard, expertise: ["persuasion", "persuasion"] }), ["a skill with Expertise is listed twice"])
})

test("a level 2 Wizard's Scholar takes one skill off its own list", () => {
  const wizard: Sheet = { ...lyra, level: 2, expertise: ["arcana"], spellbook: [...(lyra.spellbook ?? []), "sleep", "thunderwave"], spells: [...(lyra.spells ?? []), "sleep"] }
  assert.deepEqual(sheetProblems(wizard), [])
  // Insight is hers, from Skillful, and not one of Arcana, History, Investigation, Medicine, Nature or Religion.
  assert.deepEqual(sheetProblems({ ...wizard, expertise: ["insight"] }), [
    "Scholar gives Expertise in one of arcana, history, investigation, medicine, nature, religion, and the sheet has none of them",
  ])
})

test("a level 2 Ranger's Fighting Style: a Fighting Style feat or Druidic Warrior with two Druid cantrips", () => {
  const ranger: Sheet = { ...thalbern, level: 2, expertise: ["stealth"], featureChoices: { "ranger-fighting-style": "archery" }, spells: [...(thalbern.spells ?? []), "entangle"] }
  assert.deepEqual(sheetProblems(ranger), [])
  assert.deepEqual(deriveSheet(ranger).feats, ["savage-attacker", "alert", "archery"])
  assert.deepEqual(sheetProblems({ ...ranger, featureChoices: undefined }), ["Fighting Style needs a choice, and the sheet has none"])
  assert.deepEqual(sheetProblems({ ...ranger, featureChoices: { "ranger-fighting-style": "skilled" } }), ["Skilled is not a fighting-style feat, which Fighting Style needs"])
  const druidic: Sheet = { ...ranger, featureChoices: { "ranger-fighting-style": "druidic-warrior" }, cantrips: ["guidance", "starry-wisp"] }
  assert.deepEqual(sheetProblems(druidic), [])
  assert.deepEqual(sheetProblems({ ...druidic, cantrips: undefined }), ["Ranger knows 2 cantrips at level 2, and the sheet has 0"])
  assert.deepEqual(sheetProblems({ ...druidic, cantrips: ["guidance", "fire-bolt"] }), ['"fire-bolt" is not a Ranger cantrip'])
  // Deft Explorer's Expertise is not yet chosen.
  assert.deepEqual(sheetProblems({ ...ranger, expertise: undefined }), ["the sheet has Expertise in 0 skills, and its class features allow 1"])
})

test("a level 3 Lore Bard's three skills, and Magic Initiate's picks for a Sage", () => {
  const bard: Sheet = { ...ilya, level: 3, subclass: "college-of-lore", expertise: ["persuasion", "performance"], spells: [...(ilya.spells ?? []), "bane", "silence"] }
  const lore: Sheet = { ...bard, advancements: [{ level: 3, skills: ["stealth", "medicine", "nature"] }] }
  assert.deepEqual(sheetProblems(lore), [])
  assert.equal(deriveSheet(lore).skills.stealth.bonus, 4) // 2 Dex + 2
  assert.deepEqual(sheetProblems(bard), ["Bonus Proficiencies gives 3 skill proficiencies at level 3, and the sheet has 0"])
  assert.deepEqual(sheetProblems({ ...bard, advancements: [{ level: 3, skills: ["stealth", "medicine", "persuasion"] }] }), [
    "persuasion is already a proficiency, so Bonus Proficiencies cannot give it",
  ])
  // A Sage's Magic Initiate is from the Wizard list: two cantrips, a level 1 spell, and Intelligence, Wisdom or Charisma.
  const picks = { level: 1, feat: "magic-initiate", spellList: "wizard" as const, spellAbility: "int" as const, cantrips: ["fire-bolt", "prestidigitation"], spell: "shield" }
  assert.deepEqual(sheetProblems({ ...lyra, advancements: [picks] }), [])
  assert.deepEqual(sheetProblems({ ...lyra, advancements: [{ ...picks, spellList: "cleric", cantrips: ["guidance", "light"], spell: "bless" }] }), [
    "Magic Initiate picks its spells from the wizard list, and the sheet names cleric",
  ])
  assert.deepEqual(sheetProblems({ ...lyra, advancements: [{ ...picks, spell: "misty-step" }] }), ["Magic Initiate takes one level 1 spell of the wizard list, and the sheet has misty-step"])
  // A Soldier has no Magic Initiate to keep picks for.
  assert.deepEqual(sheetProblems({ ...branka, advancements: [picks] }), ["the sheet keeps picks for Magic Initiate at level 1, and the hero has no Magic Initiate to keep them for"])
})

test("Thalbern levels from 1 to 2 by the options his next level offers, and a bad choice is refused by name", () => {
  const options = levelUpOptions(thalbern)
  // 11, and 6 + 1 Con for level 2.
  assert.equal(options.hitPointMaximum, 18)
  assert.deepEqual(
    options.features.map((feature) => feature.id),
    ["ranger-deft-explorer", "ranger-fighting-style"]
  )
  assert.deepEqual(
    options.expertise?.map((entry) => [entry.feature.id, entry.count, entry.from.map((skill) => skill.id)]),
    [["ranger-deft-explorer", 1, ["athletics", "intimidation", "nature", "perception", "stealth", "survival"]]]
  )
  assert.deepEqual(
    options.featureChoices?.[0].options.map((option) => option.id),
    ["archery", "defense", "great-weapon-fighting", "two-weapon-fighting", "druidic-warrior"]
  )
  assert.equal(options.featureChoices?.[0].options.at(-1)?.cantrips?.count, 2)
  // Three prepared at level 2: one more than his two.
  assert.deepEqual([options.spells?.count, options.spells?.prepared, options.spells?.highestLevel], [1, 3, 1])
  assert.equal(options.subclass, undefined)
  assert.equal(options.feat, undefined)
  const two = ok(levelUp(thalbern, { expertise: ["stealth"], featureChoices: { "ranger-fighting-style": "archery" }, spells: ["entangle"] }))
  assert.deepEqual(sheetProblems(two), [])
  assert.deepEqual([two.level, two.expertise, two.featureChoices, two.spells], [2, ["stealth"], { "ranger-fighting-style": "archery" }, ["cure-wounds", "speak-with-animals", "entangle"]])
  assert.equal(deriveSheet(two).skills.stealth.bonus, 7) // 3 Dex + 2 + 2
  // Druidic Warrior with no cantrips, and a subclass a level early.
  assert.deepEqual(levelUp(thalbern, { expertise: ["stealth"], featureChoices: { "ranger-fighting-style": "druidic-warrior" }, spells: ["entangle"] }), {
    problems: ["Ranger knows 2 cantrips at level 2, and the sheet has 0"],
  })
  assert.deepEqual(levelUp(thalbern, { subclass: "hunter" }), { problems: ["level 2 grants no subclass"] })
})

test("Lyra levels from 1 to 3: Scholar at 2, and the Evoker with Evocation Savant at 3", () => {
  const options = levelUpOptions(lyra)
  assert.deepEqual(
    options.expertise?.[0].from.map((skill) => skill.id),
    ["arcana", "history", "investigation", "religion"]
  )
  assert.deepEqual([options.spellbook?.count, options.spellbook?.evocation, options.spells?.count], [2, 0, 1])
  // Insight is off Scholar's list.
  assert.deepEqual(levelUp(lyra, { expertise: ["insight"], spellbook: ["sleep", "thunderwave"], spells: ["sleep"] }), {
    problems: ["Scholar gives Expertise in one of arcana, history, investigation, medicine, nature, religion, and the sheet has none of them"],
  })
  const two = ok(levelUp(lyra, { expertise: ["arcana"], spellbook: ["sleep", "thunderwave"], spells: ["sleep"] }))
  // Level 3: the Evoker, two more spells for the book and two Evocation spells of level 2 or lower for free, and six prepared.
  const three = levelUpOptions(two)
  assert.deepEqual(three.subclass, [{ id: "evoker", name: "Evoker" }])
  assert.deepEqual(
    three.features.map((feature) => feature.id),
    ["wizard-wizard-subclass", "evoker-evocation-savant", "evoker-potent-cantrip"]
  )
  assert.deepEqual([three.spellbook?.count, three.spellbook?.evocation, three.spellbook?.highestLevel, three.spells?.count], [4, 2, 2, 1])
  // A d6 and Constitution 10: 6 at level 1, then 4 for each level after.
  assert.equal(three.hitPointMaximum, 14)
  const done = ok(levelUp(two, { subclass: "evoker", spellbook: ["misty-step", "invisibility", "scorching-ray", "shatter"], spells: ["scorching-ray"] }))
  assert.deepEqual(sheetProblems(done), [])
  assert.deepEqual([done.level, done.subclass, done.spellbook?.length, done.spells?.length], [3, "evoker", 12, 6])
  // No subclass is refused, and so is a book that leaves out the Savant's two.
  assert.deepEqual(levelUp(two, { spellbook: ["misty-step", "invisibility", "scorching-ray", "shatter"], spells: ["scorching-ray"] }), {
    // With no subclass there is no Evocation Savant, so the book counts ten, not twelve.
    problems: ["Wizard chooses a subclass at level 3, and the sheet has none", "a Wizard's spellbook holds 10 spells at level 3, and the sheet has 12"],
  })
  assert.deepEqual(levelUp(two, { subclass: "evoker", spellbook: ["misty-step", "invisibility"], spells: ["misty-step"] }), {
    problems: ["a Wizard's spellbook holds 12 spells at level 3, and the sheet has 10"],
  })
})

test("a level 4 hero's options: Ability Score Improvement first, and the feats the hero qualifies for", () => {
  const three: Sheet = { ...branka, level: 3, subclass: "champion" }
  assert.deepEqual(sheetProblems(three), [])
  const options = levelUpOptions(three)
  assert.equal(options.feat?.feats[0].id, "ability-score-improvement")
  assert.deepEqual(options.feat?.feats[0].abilityScoreIncrease?.choices, [
    { count: 1, amount: 2 },
    { count: 2, amount: 1 },
  ])
  // Fighting Style feats are open to a Fighter, Defense is already hers, and no Epic Boon before level 19.
  const ids = options.feat?.feats.map((feat) => feat.id) ?? []
  assert.ok(ids.includes("grappler") && ids.includes("archery") && !ids.includes("defense") && !ids.some((id) => id.startsWith("boon-")))
  assert.equal(options.weaponMasteries?.count, 3) // four at level 4, and she has one
  const four = ok(levelUp(three, { feat: "ability-score-improvement", abilities: { str: 2 } }))
  assert.deepEqual([four.abilityScores.str, four.advancements], [18, [{ level: 4, feat: "ability-score-improvement", abilities: { str: 2 } }]])
  assert.deepEqual(levelUp(three, { feat: "ability-score-improvement", abilities: { str: 1 } }), { problems: ["Ability Score Improvement raises one score by 2 or 2 scores by 1, at level 4"] })
})

test("Cure Wounds with a level 2 slot heals 4d8 and the modifier", () => {
  // 2d8, and 2d8 more for the slot level above 1. Dice of 1, 2, 3 and 4 are 10, and Milos's Wisdom 16 adds 3: 13.
  // The Owlbear at 30 of 59 comes to 43.
  const caster = { id: "milos", name: "Milos", type: "pc", sheet: milos3, hitPoints: 24 }
  const owlbear = { id: "owlbear", name: "Owlbear", type: "npc", statBlock: "owlbear", hitPoints: 30 }
  const cast = castSpell({ characters: [caster, owlbear], casterId: "milos", spell: spell("cure-wounds"), targets: ["owlbear"], d20: falls(), roll: falls(1, 2, 3, 4), level: 2 })
  assert.deepEqual(cast.harm, [{ target: "owlbear", kind: "healing", dice: [1, 2, 3, 4], sides: 8, bonus: 3, amount: 13 }])
})

test("Magic Missile with a level 2 slot throws a fourth dart", () => {
  // Three darts and one for the level above 1, each 1d4 + 1: 2, 3, 4 and 5 from dice of 1, 2, 3 and 4, 14 in all.
  const caster = { id: "lyra", name: "Lyra", type: "pc", sheet: lyra, hitPoints: 6 }
  const owlbear = { id: "owlbear", name: "Owlbear", type: "npc", statBlock: "owlbear", hitPoints: 59 }
  const cast = castSpell({ characters: [caster, owlbear], casterId: "lyra", spell: spell("magic-missile"), targets: ["owlbear"], d20: falls(), roll: falls(1, 2, 3, 4), level: 2 })
  assert.deepEqual(
    cast.harm.map((dart) => dart.amount),
    [2, 3, 4, 5]
  )
  assert.equal(cast.characters.find((character) => character.id === "owlbear")?.hitPoints, 45)
  assert.equal(targetLimit(spell("magic-missile"), 2), 4)
})

test("Bless with a level 2 slot takes four creatures", () => {
  // Three, and one more for the slot level above 1.
  assert.deepEqual([targetLimit(spell("bless")), targetLimit(spell("bless"), 2)], [3, 4])
  const caster = { id: "milos", name: "Milos", type: "pc", sheet: milos3, hitPoints: 24 }
  const allies = ["a", "b", "c", "d"].map((id) => ({ id, name: id, type: "pc", sheet: branka, hitPoints: 12 }))
  const cast = castSpell({ characters: [caster, ...allies], casterId: "milos", spell: spell("bless"), targets: ["milos", "a", "b", "c", "d"], d20: falls(), roll: falls(), level: 2 })
  assert.deepEqual(cast.targets, ["milos", "a", "b", "c"])
  assert.equal(castSpell({ characters: [caster, ...allies], casterId: "milos", spell: spell("bless"), targets: ["milos", "a", "b", "c", "d"], d20: falls(), roll: falls() }).targets.length, 3)
})

test("a level 1 spell with no level 1 slot left spends a level 2 slot, and a named higher slot is spent when it is there", () => {
  const caster = { type: "pc", name: "Milos", sheet: milos3 }
  const cost = (who: typeof caster & { spellSlots?: number[] }, id: string, slot?: number) => {
    const found = castCost(who, id, false, slot)
    return "problem" in found ? found.problem : found.cost
  }
  // All four level 1 slots spent: Healing Word takes one of the two level 2 slots.
  const spent = { ...caster, spellSlots: [4] }
  assert.deepEqual(cost(spent, "healing-word"), { kind: "slot", level: 2 })
  assert.deepEqual(slotsLeft(withCastSpent(spent, { kind: "slot", level: 2 })).slice(0, 2), [0, 1])
  // With level 1 slots left, the lowest is spent, unless a level 2 slot is named.
  assert.deepEqual(cost(caster, "healing-word"), { kind: "slot", level: 1 })
  assert.deepEqual(cost(caster, "healing-word", 2), { kind: "slot", level: 2 })
  // A level 3 slot he does not have, or a slot below Aid's level 2, falls to the lowest that can pay.
  assert.deepEqual(cost(caster, "healing-word", 3), { kind: "slot", level: 1 })
  assert.deepEqual(cost(caster, "aid", 1), { kind: "slot", level: 2 })
  // Every slot spent.
  assert.equal(cost({ ...caster, spellSlots: [4, 2] }, "healing-word"), "Milos has no spell slot of level 1 or higher left for Healing Word.")
})
