import assert from "node:assert/strict"
import { test } from "node:test"
import { classById } from "@d20/srd/classes"
import { resolveCheck } from "../../src/sheet/check"
import { classD20Floor } from "../../src/sheet/class-rules"
import { autoCreate, CREATION_CLASSES, type CreationPick, createSheet } from "../../src/sheet/create"
import { deriveSheet, sheetProblems, slotsAt } from "../../src/sheet/derive"
import { attacksPerAction, usesLeft } from "../../src/sheet/feature-rules"
import { levelUp, levelUpOptions } from "../../src/sheet/level-up"
import { autoChoices, LEVEL_CAP, levelOwed, raisedTo, takeLevel } from "../../src/sheet/milestone"
import { auraSaveBonus, damageOnSave, withRescueSpent } from "../../src/sheet/save-rules"
import type { Sheet } from "../../src/sheet/sheet"
import { type Castee, castSpell, rollSave, spellById } from "../../src/sheet/spells"

// Every expected value below was worked out by hand from the SRD 5.2.1 text, not copied from the functions' output.
// Each hero is a human made by the creator with the choices that need no player: a Sage for the Bard, Sorcerer,
// Warlock and Wizard, a Soldier for the rest.

const made = (cls: string): Sheet => {
  const pick = { class: cls, species: "human", background: ["bard", "sorcerer", "warlock", "wizard"].includes(cls) ? "sage" : "soldier" } as unknown as CreationPick
  const result = createSheet(pick, autoCreate(pick))
  if ("problems" in result) assert.fail(`${cls}: ${result.problems.join("; ")}`)
  return result.sheet
}
type Hero = Castee & { sheet: Sheet; hitPoints: number; position?: { x: number; y: number }; featureUses?: Record<string, number> }
const hero = (cls: string, level: number, id = cls): Hero => {
  const raised = raisedTo({ id, name: id, type: "pc", sheet: made(cls), controlledBy: "ai" as const }, level)
  assert.equal(raised.sheet.level, level, cls)
  return { ...raised, hitPoints: deriveSheet(raised.sheet).hitPointMaximum } as Hero
}
const fours = () => 4
const spell = (id: string) => spellById.get(id) ?? assert.fail(id)
const ogre = (): Castee => ({ id: "ogre", name: "Ogre", type: "npc", statBlock: "ogre", hitPoints: 68 }) as Castee

test("the cap is 20, and every class takes each level from 1 to 20 by the choices that need no player, legal at each", () => {
  assert.equal(LEVEL_CAP, 20)
  for (const cls of CREATION_CLASSES) {
    let character = { type: "pc", name: cls, sheet: made(cls), levelDue: 20 }
    while (character.sheet.level < 20) {
      const taken = takeLevel(character, autoChoices(character.sheet))
      if ("problems" in taken) assert.fail(`${cls} to level ${character.sheet.level + 1}: ${taken.problems.join("; ")}`)
      character = taken.character
      assert.deepEqual(sheetProblems(character.sheet), [], `${cls} at level ${character.sheet.level}`)
    }
    assert.equal(levelOwed(character), false)
    assert.throws(() => levelUpOptions(character.sheet), /already level 20/)
    // An AI companion owed level 20 takes every level at once.
    assert.equal(raisedTo({ type: "pc", name: cls, sheet: made(cls), controlledBy: "ai" as const }, 20).sheet.level, 20, cls)
  }
})

test("the tables at high level: a Wizard's slots, a Fighter's attacks, the Proficiency Bonus", () => {
  // Wizard Features, level 20: four level 1 slots, three each of 2 to 4, three of 5, two of 6 and 7, one of 8 and 9.
  assert.deepEqual(slotsAt(classById.get("wizard") ?? assert.fail(), 20), [4, 3, 3, 3, 3, 2, 2, 1, 1])
  // Two Extra Attacks at Fighter level 11: three attacks with the Attack action, and Three Extra Attacks at 20 four.
  assert.equal(attacksPerAction(hero("fighter", 10)), 2)
  assert.equal(attacksPerAction(hero("fighter", 11)), 3)
  assert.equal(attacksPerAction(hero("fighter", 20)), 4)
  // The Proficiency Bonus is +6 from level 17.
  assert.equal(deriveSheet(hero("cleric", 16).sheet).proficiencyBonus, 5)
  assert.equal(deriveSheet(hero("cleric", 17).sheet).proficiencyBonus, 6)
})

test("Primal Champion and Body and Mind raise two scores by 4, to at most 25, and the sheet keeps its own", () => {
  // The Barbarian: Standard Array Str 15, Con 14, the Soldier's Str +2 and Con +1, 17 and 15. Raises of 2 at 4 (Str
  // 19), 8 (Str 20, Con 16), 12 (Con 18) and 16 (Con 20), and Boon of Irresistible Offense's Str +1 at 19: 21 and 20.
  // Primal Champion at 20: Str 25, the maximum, and Con 24. Hit points follow Constitution's +7.
  const barbarian = hero("barbarian", 20)
  assert.deepEqual([barbarian.sheet.abilityScores.str, barbarian.sheet.abilityScores.con], [21, 20])
  const derived = deriveSheet(barbarian.sheet)
  assert.deepEqual([derived.abilityScores.str, derived.abilityScores.con, derived.abilityModifiers.con], [25, 24, 7])
  // 12 + 7 at level 1, and 7 + 7 for each of nineteen levels after.
  assert.equal(derived.hitPointMaximum, 19 + 19 * 14)
  // One level below, no raise.
  assert.deepEqual([deriveSheet(hero("barbarian", 19).sheet).abilityScores.str, deriveSheet(hero("barbarian", 19).sheet).abilityScores.con], [21, 20])
  // Body and Mind: a Monk's Dexterity and Wisdom 4 more.
  const monk = hero("monk", 20)
  const scores = deriveSheet(monk.sheet).abilityScores
  assert.deepEqual([scores.dex, scores.wis], [Math.min(25, monk.sheet.abilityScores.dex + 4), Math.min(25, monk.sheet.abilityScores.wis + 4)])
})

test("a cantrip's dice at levels 5, 11 and 17: Fire Bolt's 2d10, 3d10 and 4d10", () => {
  // Every die falls as 4, and a 15 hits the Ogre's Armor Class 11.
  for (const [level, dealt] of [
    [4, 4],
    [5, 8],
    [11, 12],
    [17, 16],
  ] as const) {
    const wizard = hero("wizard", level)
    const bolt = castSpell({ characters: [wizard, ogre()], casterId: wizard.id, spell: spell("fire-bolt"), targets: ["ogre"], attackDice: [15], d20: () => 10, roll: fours })
    assert.equal(68 - (bolt.characters.find((character) => character.id === "ogre")?.hitPoints ?? 0), dealt, `level ${level}`)
  }
})

test("the Epic Boon at 19: the class's recommended boon first, with its one point, and a boon a class cannot take is not offered", () => {
  const fighter = hero("fighter", 18)
  const options = levelUpOptions(fighter.sheet)
  assert.equal(options.feat?.feature.name, "Epic Boon")
  assert.equal(options.feat?.feats[0].id, "boon-of-combat-prowess")
  assert.deepEqual(options.feat?.feats[0].abilityScoreIncrease?.maximum, 30)
  // Boon of Spell Recall needs the Spellcasting feature.
  assert.ok(!options.feat?.feats.some((feat) => feat.id === "boon-of-spell-recall"))
  const choices = autoChoices(fighter.sheet)
  assert.equal(choices.feat, "boon-of-combat-prowess")
  assert.equal(
    Object.values(choices.abilities ?? {}).reduce((sum, amount) => sum + amount, 0),
    1
  )
  // An Epic Boon cannot be taken at an Ability Score Improvement below 19, nor two points from a boon.
  const sixteen = levelUp(hero("fighter", 15).sheet, { ...autoChoices(hero("fighter", 15).sheet), feat: "boon-of-fate", abilities: { con: 1 } })
  assert.ok("problems" in sixteen && sixteen.problems.some((problem) => problem.includes("needs level 19")))
  const greedy = levelUp(fighter.sheet, { ...choices, abilities: { str: 1, con: 1 } })
  assert.ok("problems" in greedy && greedy.problems.some((problem) => problem.includes("raises one score by 1")))
})

test("Mystic Arcanum: a Warlock spell of each level from 6 to 9, kept on the sheet, one swapped at a level", () => {
  const warlock = hero("warlock", 17)
  const arcana = warlock.sheet.featurePicks?.["warlock-mystic-arcanum"] ?? []
  assert.deepEqual(
    arcana.map((pick) => spellById.get(pick.option)?.level),
    [6, 7, 8, 9]
  )
  // They are cast by the arcanum, not prepared.
  for (const pick of arcana) assert.ok(!deriveSheet(warlock.sheet).preparedSpells.includes(pick.option))
  // Two of level 6 do not fill the slots of 6 and 7.
  const eleven = hero("warlock", 13).sheet
  const sixes = { ...eleven, featurePicks: { ...eleven.featurePicks, "warlock-mystic-arcanum": [{ option: "circle-of-death" }, { option: "eyebite" }] } }
  assert.ok(sheetProblems(sixes).some((problem) => problem.includes("Mystic Arcanum takes spells of levels 6, 7")))
  // At 18 one may be replaced with another of its level.
  const choices = autoChoices(warlock.sheet)
  const swapped = (choices.featurePicks?.["warlock-mystic-arcanum"] ?? []).map((pick) => (spellById.get(pick.option)?.level === 6 ? { option: "eyebite" } : pick))
  const taken = levelUp(warlock.sheet, { ...choices, featurePicks: { ...choices.featurePicks, "warlock-mystic-arcanum": swapped } })
  if ("problems" in taken) assert.fail(taken.problems.join("; "))
})

test("Magical Secrets lets a Bard prepare from the Cleric, Druid and Wizard lists, and Magical Discoveries keeps two such spells prepared", () => {
  const bard = hero("bard", 10)
  // Spirit Guardians is a level 3 Cleric spell, on no Bard list.
  const swap = (sheet: Sheet) => ({ ...sheet, spells: [...(sheet.spells ?? []).slice(1), "spirit-guardians"] })
  assert.deepEqual(sheetProblems(swap(bard.sheet)), [])
  assert.ok(sheetProblems(swap(hero("bard", 9).sheet)).some((problem) => problem.includes('"spirit-guardians"')))
  const options = levelUpOptions(bard.sheet)
  assert.equal(options.spells?.from.find((entry) => entry.id === "spirit-guardians")?.list, "cleric")
  // The College of Lore's Magical Discoveries at 6: two spells of those lists, always prepared and not counted.
  const six = hero("bard", 6).sheet
  const found = six.featurePicks?.["college-of-lore-magical-discoveries"] ?? []
  assert.equal(found.length, 2)
  for (const pick of found) assert.ok(deriveSheet(six).alwaysPrepared.includes(pick.option) || deriveSheet(six).cantrips.includes(pick.option), pick.option)
  // A level 6 Bard has slots to level 3, so a level 4 spell is no Discovery.
  const far = { ...six, featurePicks: { ...six.featurePicks, "college-of-lore-magical-discoveries": [found[0], { option: "polymorph" }] } }
  assert.ok(sheetProblems(far).some((problem) => problem.includes('"polymorph"')))
})

test("Evasion: a Dexterity save for half takes none on a success and half on a failure, and not while Incapacitated", () => {
  const rogue = hero("rogue", 7)
  const fighter = hero("fighter", 7)
  const dex = (success: boolean) => ({ ability: "dex" as const, success, half: true })
  assert.deepEqual(damageOnSave(rogue, dex(true), 28), { amount: 0, evaded: "Evasion" })
  assert.deepEqual(damageOnSave(rogue, dex(false), 28), { amount: 14, evaded: "Evasion" })
  assert.deepEqual(damageOnSave(fighter, dex(true), 28), { amount: 14 })
  assert.deepEqual(damageOnSave(fighter, dex(false), 28), { amount: 28 })
  // A Constitution save, and a save that is all or nothing, are not Evasion's.
  assert.deepEqual(damageOnSave(rogue, { ability: "con", success: true, half: true }, 28), { amount: 14 })
  assert.deepEqual(damageOnSave(rogue, { ability: "dex", success: false, half: false }, 28), { amount: 28 })
  const held = { ...rogue, conditions: [{ id: "incapacitated" as const }] }
  assert.deepEqual(damageOnSave(held, dex(true), 28), { amount: 14 })
  assert.deepEqual(damageOnSave(hero("rogue", 6), dex(true), 28), { amount: 14 })
  // A Monk has it too, from level 7.
  assert.deepEqual(damageOnSave(hero("monk", 7), dex(true), 28), { amount: 0, evaded: "Evasion" })
  // Through a cast: Fireball's 8d6, each die a 4, is 32. A Rogue who fails takes 16, and one who succeeds none.
  const wizard = hero("wizard", 5, "lyra")
  const fireball = (d20: number) => castSpell({ characters: [wizard, rogue], casterId: "lyra", spell: spell("fireball"), targets: [rogue.id], d20: () => d20, roll: fours })
  const failed = fireball(1)
  assert.equal(failed.characters.find((character) => character.id === rogue.id)?.hitPoints, rogue.hitPoints - 16)
  assert.ok(failed.facts.some((fact) => fact.includes("halved by Evasion")))
  assert.equal(fireball(20).characters.find((character) => character.id === rogue.id)?.hitPoints, rogue.hitPoints)
})

test("Reliable Talent: a d20 of 9 or lower counts as a 10 on a check with a skill the Rogue is trained in", () => {
  const rogue = hero("rogue", 7)
  const trained = deriveSheet(rogue.sheet).skills
  const skill = (Object.keys(trained) as (keyof typeof trained)[]).find((id) => trained[id].proficient) ?? assert.fail()
  const untrained = (Object.keys(trained) as (keyof typeof trained)[]).find((id) => !trained[id].proficient) ?? assert.fail()
  assert.equal(classD20Floor(rogue, { kind: "skill", skill }), 10)
  assert.equal(classD20Floor(rogue, { kind: "skill", skill: untrained }), undefined)
  assert.equal(classD20Floor(rogue, { kind: "save", ability: "dex" }), undefined)
  assert.equal(classD20Floor(hero("rogue", 6), { kind: "skill", skill }), undefined)
  // A 3 counts as a 10 and a 14 as itself.
  assert.deepEqual([resolveCheck({ dice: [3], bonus: 5, dc: 15, least: 10 }).total, resolveCheck({ dice: [14], bonus: 5, dc: 15, least: 10 }).total], [15, 19])
})

test("Indomitable: a failed save against harm rerolled with the Fighter level, by uses a Long Rest", () => {
  // A level 9 Fighter's Wisdom save: Wisdom 10, no proficiency, +0. A 2 fails DC 18, and the reroll's 15 + 9 is 24.
  const fighter = hero("fighter", 9)
  assert.equal(deriveSheet(fighter.sheet).savingThrows.wis.bonus, 0)
  const dice = [2, 15]
  const save = rollSave({ target: fighter, ability: "wis", dc: 18, d20: () => dice.shift() ?? 1, roll: fours, characters: [fighter], stakes: { damage: 10 } })
  assert.deepEqual([save.success, save.total, save.rescued?.first, save.rescued?.feature], [true, 24, 2, "fighter-indomitable"])
  const spent = withRescueSpent(fighter, save.rescued ?? assert.fail())
  assert.equal(usesLeft(spent, "fighter-indomitable"), 0)
  // No use left, nothing at stake, or a reroll that cannot reach the DC: the failure stands.
  assert.equal(rollSave({ target: spent, ability: "wis", dc: 18, d20: () => 2, roll: fours, characters: [spent], stakes: { damage: 10 } }).rescued, undefined)
  assert.equal(rollSave({ target: fighter, ability: "wis", dc: 18, d20: () => 2, roll: fours, characters: [fighter] }).rescued, undefined)
  assert.equal(rollSave({ target: fighter, ability: "wis", dc: 30, d20: () => 2, roll: fours, characters: [fighter], stakes: { damage: 10 } }).rescued, undefined)
  // Two uses from level 13, three from 17.
  assert.deepEqual([usesLeft(hero("fighter", 13), "fighter-indomitable"), usesLeft(hero("fighter", 17), "fighter-indomitable")], [2, 3])
})

test("Aura of Protection: the Paladin's Charisma modifier on the saves of their side within 10 feet, 30 from level 18", () => {
  // The Paladin's Charisma is the Standard Array's 14, +2: the Soldier's increase and every raise go to Strength and Constitution.
  const paladin = { ...hero("paladin", 6, "paladin"), position: { x: 0, y: 0 } }
  assert.equal(deriveSheet(paladin.sheet).abilityModifiers.cha, 2)
  const near = { ...hero("rogue", 5, "near"), position: { x: 10, y: 0 } }
  const far = { ...hero("rogue", 5, "far"), position: { x: 15, y: 0 } }
  const foe = { ...ogre(), position: { x: 0, y: 10 } }
  const present = [paladin, near, far, foe]
  assert.deepEqual(auraSaveBonus(paladin, present), { amount: 2, from: ["Aura of Protection"] })
  assert.deepEqual(auraSaveBonus(near, present), { amount: 2, from: ["Aura of Protection"] })
  assert.deepEqual(auraSaveBonus(far, present).amount, 0)
  assert.deepEqual(auraSaveBonus(foe, present).amount, 0)
  // Not while the Paladin is Incapacitated, nor before level 6.
  assert.equal(auraSaveBonus(near, [{ ...paladin, conditions: [{ id: "stunned" as const }] }, near]).amount, 0)
  assert.equal(auraSaveBonus(near, [{ ...hero("paladin", 5, "paladin"), position: { x: 0, y: 0 } }, near]).amount, 0)
  // Aura Expansion at 18: 30 feet.
  const wide = { ...hero("paladin", 18, "paladin"), position: { x: 0, y: 0 } }
  assert.ok(auraSaveBonus({ ...far, position: { x: 30, y: 0 } }, [wide, far]).amount > 0)
  // It reaches a save through `rollSave`: a 10 and the near Rogue's +0 Wisdom save is 12 against DC 12.
  assert.equal(deriveSheet(near.sheet).savingThrows.wis.bonus, 0)
  assert.equal(rollSave({ target: near, ability: "wis", dc: 12, d20: () => 10, roll: fours, characters: present }).success, true)
  assert.equal(rollSave({ target: far, ability: "wis", dc: 12, d20: () => 10, roll: fours, characters: present }).success, false)
})

test("the picks of C2 rise with the level: Invocations by the table, Metamagic at 10 and 17, Wild Shape's forms, Challenge Rating and flight", () => {
  // Warlock Features: ten Invocations at 18 and after. Metamagic: two at 2, two more at 10 and at 17.
  assert.equal(hero("warlock", 20).sheet.featurePicks?.["warlock-eldritch-invocations"]?.length, 10)
  assert.deepEqual(
    [9, 10, 16, 17].map((level) => hero("sorcerer", level).sheet.featurePicks?.["sorcerer-metamagic"]?.length),
    [2, 4, 4, 6]
  )
  // Beast Shapes: eight forms of Challenge Rating 1 at Druid level 8, and from then a form may fly.
  const options = (level: number) => levelUpOptions(hero("druid", level - 1).sheet).featurePicks?.find((offer) => offer.feature.id === "druid-wild-shape")
  // A Brown Bear is Challenge Rating 1, and a Giant Wasp, Challenge Rating 1/2, flies.
  assert.deepEqual([options(7)?.count, options(8)?.count], [6, 8])
  for (const [level, id, offered] of [
    [7, "brown-bear", false],
    [8, "brown-bear", true],
    [7, "giant-wasp", false],
    [8, "giant-wasp", true],
  ] as const)
    assert.equal(
      options(level)?.options.some((option) => option.id === id),
      offered,
      `${id} at ${level}`
    )
})
