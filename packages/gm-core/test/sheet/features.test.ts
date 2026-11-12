import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { strike } from "../../src/sheet/attack"
import { resolveCheck } from "../../src/sheet/check"
import { bonusActionsOf, featuresAtEncounterEnd, inspirationHelps, inspiredCheck, useBonusAction } from "../../src/sheet/features"
import type { Sheet } from "../../src/sheet/sheet"
import type { Inspiration } from "../../src/sheet/turn-effect"

// Every expected value below was worked out by hand from the SRD 5.2.1 class features, not copied from the function's output.

const sheet = (path: string) => (JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { sheet: Sheet }).sheet
type Character = { id: string; name: string; type: string; sheet?: Sheet; statBlock?: string; hitPoints?: number; featureUses?: Record<string, number>; inspiration?: Inspiration; dead?: true }
// Branka, a level 1 Fighter with 14 hit points: Warhammer +5 for 1d8 + 3.
const branka: Character = { id: "branka", name: "Branka", type: "pc", sheet: sheet("welcome-to-kordavos/characters/branka-stoneveil.json"), hitPoints: 14 }
// Ilya, a level 1 Bard with Charisma 16.
const ilya: Character = { id: "ilya", name: "Ilya", type: "pc", sheet: sheet("welcome-to-kordavos/characters/ilya-veles.json"), hitPoints: 8 }
const thalbern: Character = { id: "thalbern", name: "Thalbern", type: "pc", sheet: sheet("the-midnight-summons/characters/thalbern.json"), hitPoints: 11 }
const owlbear: Character = { id: "owlbear", name: "Owlbear", type: "npc", statBlock: "owlbear", hitPoints: 59 }
const find = (characters: Character[], id: string) => characters.find((character) => character.id === id) as Character
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() as number

test("a Fighter has two Second Winds, a Bard as many Bardic Inspirations as their Charisma modifier, a Ranger neither", () => {
  assert.deepEqual(bonusActionsOf(branka), [{ id: "fighter-second-wind", name: "Second Wind", uses: 2, left: 2, targeted: false }])
  // Charisma 16 is +3.
  assert.deepEqual(bonusActionsOf(ilya), [{ id: "bard-bardic-inspiration", name: "Bardic Inspiration", uses: 3, left: 3, targeted: true }])
  assert.deepEqual(bonusActionsOf(thalbern), [])
  assert.deepEqual(bonusActionsOf(owlbear), [])
})

test("Second Wind regains 1d10 plus the Fighter level, twice", () => {
  // At 5 of 14, a 6 on the d10 and her level 1 make 7: 12.
  const first = useBonusAction({ characters: [{ ...branka, hitPoints: 5 }, owlbear], actorId: "branka", feature: "fighter-second-wind", roll: falls(6) })
  assert.deepEqual([find(first.characters, "branka").hitPoints, find(first.characters, "branka").featureUses], [12, { "fighter-second-wind": 1 }])
  assert.deepEqual(first.use, {
    feature: "fighter-second-wind",
    name: "Second Wind",
    harm: [{ target: "branka", kind: "healing", dice: [6], sides: 10, bonus: 1, amount: 7 }],
    fact: "Branka uses Second Wind and regains 7 hit points, now 12 of 14.",
  })
  // A 10 and her level make 11, held to her 14. That is her second and last.
  const second = useBonusAction({ characters: first.characters, actorId: "branka", feature: "fighter-second-wind", roll: falls(10) })
  assert.deepEqual([find(second.characters, "branka").hitPoints, bonusActionsOf(find(second.characters, "branka"))[0].left], [14, 0])
  const third = useBonusAction({ characters: second.characters, actorId: "branka", feature: "fighter-second-wind", roll: falls(10) })
  assert.deepEqual([third.use, third.characters], [undefined, second.characters])
  // A Ranger has no Second Wind to use.
  assert.equal(useBonusAction({ characters: [thalbern], actorId: "thalbern", feature: "fighter-second-wind", roll: falls(5) }).use, undefined)
})

test("Bardic Inspiration gives another creature on the bard's side a d6", () => {
  const given = useBonusAction({ characters: [ilya, branka, owlbear], actorId: "ilya", feature: "bard-bardic-inspiration", target: "branka", roll: falls() })
  assert.deepEqual([find(given.characters, "branka").inspiration, find(given.characters, "ilya").featureUses], [{ die: 6, by: "ilya" }, { "bard-bardic-inspiration": 1 }])
  assert.deepEqual(given.use, { feature: "bard-bardic-inspiration", name: "Bardic Inspiration", target: "branka", fact: "Ilya gives Branka a Bardic Inspiration die." })
  // Not to herself, not to the Owlbear, and not to no one: nothing is spent.
  for (const target of ["ilya", "owlbear", undefined]) {
    const none = useBonusAction({ characters: [ilya, branka, owlbear], actorId: "ilya", feature: "bard-bardic-inspiration", target, roll: falls() })
    assert.deepEqual([none.use, find(none.characters, "ilya").featureUses], [undefined, undefined])
  }
})

test("a held die is rolled on a failure it could save, and is spent whether it saves it or not", () => {
  const die = { die: 6, by: "ilya" }
  // Short by 3: a d6 could do it. Short by 7: it could not. A success needs none.
  assert.deepEqual([inspirationHelps(die, 3), inspirationHelps(die, 6), inspirationHelps(die, 7), inspirationHelps(die, 0), inspirationHelps(undefined, 3)], [true, true, false, false, false])
  // A 9 and +3 is 12 against 15. A 4 on the die makes 16: a success. A 2 makes 14: still a failure.
  const failed = resolveCheck({ dice: [9], bonus: 3, dc: 15 })
  assert.deepEqual([inspiredCheck(failed, die, falls(4)).total, inspiredCheck(failed, die, falls(4)).success, inspiredCheck(failed, die, falls(4)).inspired], [16, true, 4])
  assert.deepEqual([inspiredCheck(failed, die, falls(2)).total, inspiredCheck(failed, die, falls(2)).success], [14, false])
})

test("an attack that misses by no more than the die rolls it, and never on a 1", () => {
  const inspired = { ...branka, inspiration: { die: 6, by: "ilya" } }
  // Warhammer +5: a 6 makes 11 against the Owlbear's Armor Class 13. A 3 on the d6 makes 14 and hits, for 1d8 + 3 rolling 5: 8.
  const saved = strike({ attacker: inspired, target: owlbear, weapon: "warhammer", dice: [6], roll: falls(3, 5), inspiration: inspired.inspiration })
  assert.deepEqual([saved.roll.total, saved.roll.hit, saved.inspired, saved.taken], [14, true, 3, 8])
  // A 1 on the d6 makes 12: still a miss, and the die is spent.
  const wasted = strike({ attacker: inspired, target: owlbear, weapon: "warhammer", dice: [6], roll: falls(1), inspiration: inspired.inspiration })
  assert.deepEqual([wasted.roll.total, wasted.roll.hit, wasted.inspired, wasted.taken], [12, false, 1, 0])
  // A 1 on the d20 always misses, so the die is kept. A hit needs none.
  assert.equal(strike({ attacker: inspired, target: owlbear, weapon: "warhammer", dice: [1], roll: falls(6), inspiration: inspired.inspiration }).inspired, undefined)
  assert.equal(strike({ attacker: inspired, target: owlbear, weapon: "warhammer", dice: [10], roll: falls(5), inspiration: inspired.inspiration }).inspired, undefined)
})

test("a new encounter gives feature uses back and ends an unspent die", () => {
  const worn = { ...branka, featureUses: { "fighter-second-wind": 2 }, inspiration: { die: 6, by: "ilya" } }
  assert.deepEqual(featuresAtEncounterEnd(worn), branka)
})
