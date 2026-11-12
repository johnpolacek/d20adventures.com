import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { applyStakes } from "../../src/sheet/harm"
import type { Sheet } from "../../src/sheet/sheet"
import { HARM_DICE, type HarmStake, printedDiceSchema, type Stake } from "../../src/sheet/stakes"

// Every expected number below was worked out by hand from the SRD 5.2.1 rules, not copied from the function's output.

const sheet = (path: string) => (JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { sheet: Sheet }).sheet
// Thalbern has 11 hit points. Branka, a Dwarf Fighter with Con 16, has 10 + 3 and a Dwarf's 1: 14, and resists Poison.
const thalbern = { id: "thalbern", name: "Thalbern", type: "pc", sheet: sheet("the-midnight-summons/characters/thalbern.json"), hitPoints: 11 }
const branka = { id: "branka", name: "Branka", type: "pc", sheet: sheet("welcome-to-kordavos/characters/branka-stoneveil.json"), hitPoints: 14 }
const skeleton = { id: "skeleton", name: "Skeleton", type: "npc", statBlock: "skeleton", hitPoints: 13 }
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() as number
const stake = (on: HarmStake["on"], target: string, kind: HarmStake["kind"], dice: string, type?: HarmStake["type"]): Stake => ({ on, target, kind, dice, ...(type ? { type } : {}) })

test("the ladder is light 1d4, moderate 1d8, heavy 2d6, severe 4d6", () => {
  assert.deepEqual(HARM_DICE, { light: "1d4", moderate: "1d8", heavy: "2d6", severe: "4d6" })
  assert.equal(printedDiceSchema.safeParse("4d6").success, true)
  assert.equal(printedDiceSchema.safeParse("2d8 + 2").success, true)
  assert.equal(printedDiceSchema.safeParse("1d7").success, false)
  assert.equal(printedDiceSchema.safeParse("12").success, false)
})

test("a stake falls only on its outcome", () => {
  // A trap: on a failed save, heavy fire damage. 2d6 rolls 3 and 5, so Thalbern goes from 11 to 3 and is Bloodied.
  const trap = [stake("failure", "thalbern", "damage", "2d6", "fire")]
  const failed = applyStakes({ characters: [thalbern], stakes: trap, outcome: "failure", roll: falls(3, 5) })
  assert.equal(failed.characters[0].hitPoints, 3)
  assert.deepEqual(failed.harm, [{ target: "thalbern", kind: "damage", dice: [3, 5], sides: 6, bonus: 0, type: "fire", amount: 8 }])
  assert.deepEqual(failed.facts, ["Thalbern takes 8 fire damage. Thalbern has 3 of 11 hit points and is Bloodied."])
  // The save made: nothing is rolled and nothing changes.
  const made = applyStakes({ characters: [thalbern], stakes: trap, outcome: "success", roll: falls() })
  assert.equal(made.characters[0].hitPoints, 11)
  assert.deepEqual(made.harm, [])
})

test("damage meets the target's defenses and the rules of 0 hit points", () => {
  // Branka resists Poison: 2d6 rolling 5 and 4 is 9, halved to 4, so 14 becomes 10.
  assert.equal(applyStakes({ characters: [branka], stakes: [stake("always", "branka", "damage", "2d6", "poison")], outcome: "success", roll: falls(5, 4) }).characters[0].hitPoints, 10)
  // A Skeleton is Vulnerable to Bludgeoning: 1d8 rolling 7 is doubled to 14, more than its 13. An NPC at 0 dies.
  const crushed = applyStakes({ characters: [skeleton], stakes: [stake("success", "skeleton", "damage", "1d8", "bludgeoning")], outcome: "success", roll: falls(7) })
  assert.equal(crushed.characters[0].hitPoints, 0)
  assert.equal((crushed.characters[0] as { dead?: true }).dead, true)
  assert.deepEqual(crushed.facts, ["Skeleton takes 14 bludgeoning damage. Skeleton dies."])
  // 4d6 rolling 6, 6, 5 and 4 is 21 on Thalbern's 11: he is at 0 with 10 left over, less than his maximum of 11, so he is dying, not dead.
  const fallen = applyStakes({ characters: [thalbern], stakes: [stake("failure", "thalbern", "damage", "4d6", "bludgeoning")], outcome: "failure", roll: falls(6, 6, 5, 4) })
  assert.equal(fallen.characters[0].hitPoints, 0)
  assert.deepEqual((fallen.characters[0] as { deathSaves?: unknown }).deathSaves, { successes: 0, failures: 0 })
  assert.equal(fallen.facts[0], "Thalbern takes 21 bludgeoning damage. Thalbern is at 0 hit points, Unconscious and dying.")
})

test("healing restores hit points up to the maximum and wakes one who is down", () => {
  // Thalbern at 4 healed 1d8 rolling 6 has 10. Healed 1d8 rolling 8 from 9 he stops at his 11.
  assert.equal(applyStakes({ characters: [{ ...thalbern, hitPoints: 4 }], stakes: [stake("success", "thalbern", "healing", "1d8")], outcome: "success", roll: falls(6) }).characters[0].hitPoints, 10)
  assert.equal(applyStakes({ characters: [{ ...thalbern, hitPoints: 9 }], stakes: [stake("success", "thalbern", "healing", "1d8")], outcome: "success", roll: falls(8) }).characters[0].hitPoints, 11)
  // Down and dying, healed 1d4 rolling 3: conscious at 3, with the saves cleared.
  const down = { ...thalbern, hitPoints: 0, healthPercent: 0, deathSaves: { successes: 1, failures: 2 } }
  const woken = applyStakes({ characters: [down], stakes: [stake("always", "thalbern", "healing", "1d4")], outcome: "failure", roll: falls(3) })
  assert.equal(woken.characters[0].hitPoints, 3)
  assert.equal(woken.characters[0].deathSaves, undefined)
  assert.deepEqual(woken.facts, ["Thalbern regains 3 hit points. Thalbern has 3 of 11 hit points and is Bloodied."])
  // A stake on someone who is not here is dropped.
  assert.deepEqual(applyStakes({ characters: [thalbern], stakes: [stake("always", "nobody", "damage", "1d4")], outcome: "success", roll: falls() }).harm, [])
})
