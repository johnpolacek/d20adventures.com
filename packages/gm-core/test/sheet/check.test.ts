import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { checkBonus, checkName, combineModes, resolveCheck } from "../../src/sheet/check"
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
