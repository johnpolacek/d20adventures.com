import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { checkBonus, checkFromMenu, checkMenuIds, checkName, combineModes, resolveCheck, sheetModes, spellcastingAbilityOf } from "../../src/sheet/check"
import type { Sheet } from "../../src/sheet/sheet"

// Every expected number below was worked out by hand from the SRD 5.2.1 rules, not copied from the function's output.

const hero = (path: string) => JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { name: string; sheet: Sheet }
// Thalbern, the Ranger of The Midnight Summons: Dex 17 (+3), Wis 13 (+1), Str 13 (+1), Cha 10. Proficient in Stealth,
// Survival, Nature, Perception, and the Soldier's Athletics and Intimidation. A Ranger's saves are Strength and Dexterity.
const thalbern = hero("the-midnight-summons/characters/thalbern.json")

test("a hero's bonus comes from the sheet", () => {
  assert.equal(checkBonus(thalbern, { kind: "skill", skill: "stealth" }), 5) // 3 Dex + 2
  assert.equal(checkBonus(thalbern, { kind: "skill", skill: "athletics" }), 3) // 1 Str + 2
  assert.equal(checkBonus(thalbern, { kind: "skill", skill: "persuasion" }), 0) // Cha 10, not proficient
  assert.equal(checkBonus(thalbern, { kind: "ability", ability: "dex" }), 3)
  assert.equal(checkBonus(thalbern, { kind: "save", ability: "dex" }), 5) // 3 Dex + 2
  assert.equal(checkBonus(thalbern, { kind: "save", ability: "con" }), 1) // Con 13, not proficient
})

test("Thalbern's Stealth is +5, so a 9 makes 14", () => {
  const bonus = checkBonus(thalbern, { kind: "skill", skill: "stealth" })
  assert.deepEqual(resolveCheck({ dice: [9], bonus, dc: 15 }), { dice: [9], natural: 9, bonus: 5, total: 14, dc: 15, success: false, mode: "normal" })
  assert.equal(resolveCheck({ dice: [10], bonus, dc: 15 }).success, true) // meeting the target succeeds
})

test("Advantage keeps the higher of two dice and Disadvantage the lower", () => {
  assert.deepEqual(resolveCheck({ dice: [4, 17], bonus: 5, dc: 15, mode: "advantage" }), { dice: [4, 17], natural: 17, bonus: 5, total: 22, dc: 15, success: true, mode: "advantage" })
  assert.deepEqual(resolveCheck({ dice: [4, 17], bonus: 5, dc: 15, mode: "disadvantage" }), { dice: [4, 17], natural: 4, bonus: 5, total: 9, dc: 15, success: false, mode: "disadvantage" })
  // A plain roll takes one die, and a second one sent with it is not rolled.
  assert.deepEqual(resolveCheck({ dice: [4, 17], bonus: 0, dc: 10 }).dice, [4])
})

test("a 20 or a 1 on the die has no special effect on a check", () => {
  assert.equal(resolveCheck({ dice: [20], bonus: -1, dc: 20 }).success, false) // 19 against 20
  assert.equal(resolveCheck({ dice: [1], bonus: 5, dc: 5 }).success, true) // 6 against 5
})

test("Advantage and Disadvantage cancel, however many of each", () => {
  assert.equal(combineModes([]), "normal")
  assert.equal(combineModes(["normal", "advantage"]), "advantage")
  assert.equal(combineModes(["disadvantage", "disadvantage"]), "disadvantage")
  assert.equal(combineModes(["advantage", "advantage", "disadvantage"]), "normal")
})

test("a roll that cannot be made is refused", () => {
  assert.throws(() => resolveCheck({ dice: [12], bonus: 0, dc: 10, mode: "advantage" }), /takes 2 d20/)
  assert.throws(() => resolveCheck({ dice: [21], bonus: 0, dc: 10 }), /not a d20 roll/)
  assert.throws(() => resolveCheck({ dice: [0], bonus: 0, dc: 10 }), /not a d20 roll/)
  assert.throws(() => checkBonus({ name: "Nobody", type: "pc" }, { kind: "skill", skill: "stealth" }), /Nobody has no rules sheet/)
})

test("a check is named as the rules name it", () => {
  assert.equal(checkName({ kind: "skill", skill: "sleight-of-hand" }), "Sleight of Hand")
  assert.equal(checkName({ kind: "ability", ability: "str" }), "Strength")
  assert.equal(checkName({ kind: "save", ability: "wis" }), "Wisdom Saving Throw")
})

test("an NPC's bonus comes from its stat block", () => {
  // Owlbear: Str 20 (+5), Wis 12 (+1), Int 3 (-4), and the block prints Perception +5.
  const owlbear = { name: "Owlbear", type: "npc", statBlock: "owlbear" }
  assert.equal(checkBonus(owlbear, { kind: "skill", skill: "perception" }), 5)
  assert.equal(checkBonus(owlbear, { kind: "skill", skill: "athletics" }), 5) // no printed Athletics, so Strength
  assert.equal(checkBonus(owlbear, { kind: "ability", ability: "int" }), -4)
  assert.equal(checkBonus(owlbear, { kind: "save", ability: "con" }), 3)
  // Priest: the block prints Medicine +7, and Wis 16 gives a save of +3.
  assert.equal(checkBonus({ type: "npc", statBlock: "priest" }, { kind: "skill", skill: "medicine" }), 7)
  assert.equal(checkBonus({ type: "npc", statBlock: "priest" }, { kind: "save", ability: "wis" }), 3)
  // An NPC that names no stat block is a Commoner: 10 in every score.
  assert.equal(checkBonus({ type: "npc" }, { kind: "skill", skill: "stealth" }), 0)
})

test("the menu is the eighteen skills, six abilities and six saves", () => {
  assert.equal(checkMenuIds.length, 30)
  assert.deepEqual(checkFromMenu("sleight-of-hand"), { kind: "skill", skill: "sleight-of-hand" })
  assert.deepEqual(checkFromMenu("strength"), { kind: "ability", ability: "str" })
  assert.deepEqual(checkFromMenu("wisdom-save"), { kind: "save", ability: "wis" })
  assert.equal(checkFromMenu("lockpicking"), undefined)
  assert.equal(checkFromMenu("attack"), undefined)
})

test("a hero casts with its class's ability", () => {
  assert.equal(spellcastingAbilityOf(thalbern), "wis") // Ranger
  assert.equal(spellcastingAbilityOf(hero("covert-cargo/characters/1749159962941.json")), "int") // Lyra, Wizard
  assert.equal(spellcastingAbilityOf(hero("covert-cargo/characters/1749307435667.json")), undefined) // Poppen, Rogue
})

test("armor that hinders Stealth gives Disadvantage with no model", () => {
  // A Fighter in Chain Mail, which the SRD marks Stealth: Disadvantage. Dex 12, not proficient in Stealth: +1.
  const sheet: Sheet = {
    class: "fighter",
    level: 1,
    species: "human",
    background: "soldier",
    abilityScores: { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 8 },
    classSkills: ["perception", "survival"],
    armor: "chain-mail",
  }
  const fighter = { name: "Fighter", type: "pc", sheet }
  assert.deepEqual(sheetModes(fighter, { kind: "skill", skill: "stealth" }), [{ mode: "disadvantage", from: "Chain Mail" }])
  // Only Stealth: a bare Dexterity check or Acrobatics in the same armor rolls plain.
  assert.deepEqual(sheetModes(fighter, { kind: "ability", ability: "dex" }), [])
  assert.deepEqual(sheetModes(fighter, { kind: "skill", skill: "acrobatics" }), [])
  // Thalbern's Studded Leather Armor hinders nothing, and an NPC has no sheet to read.
  assert.deepEqual(sheetModes(thalbern, { kind: "skill", skill: "stealth" }), [])
  assert.deepEqual(sheetModes({ type: "npc", statBlock: "guard" }, { kind: "skill", skill: "stealth" }), [])
  // The armor's Disadvantage and the moment's Advantage cancel: 8 and 15 rolled, and only the first die counts, for 9.
  const mode = combineModes(["advantage", ...sheetModes(fighter, { kind: "skill", skill: "stealth" }).map((source) => source.mode)])
  assert.equal(mode, "normal")
  assert.equal(resolveCheck({ dice: [8, 15], bonus: checkBonus(fighter, { kind: "skill", skill: "stealth" }), dc: 10, mode }).total, 9)
})
