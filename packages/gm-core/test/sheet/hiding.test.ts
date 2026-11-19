import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { hideRoll } from "../../src/sheet/actions"
import type { ConditionEntry } from "../../src/sheet/condition-entry"
import { isHidden } from "../../src/sheet/conditions"
import { applyStakes } from "../../src/sheet/harm"
import { hiddenFrom, hideTotal, hidingAfterRoll, noticedOnArrival, noticeText, passivePerception, SEARCH_ROLL, searchRoll } from "../../src/sheet/hiding"
import type { Sheet } from "../../src/sheet/sheet"
import type { Side } from "../../src/sheet/sides"
import type { TurnEffect } from "../../src/sheet/turn-effect"

// Every expected value below was worked out by hand from the SRD 5.2.1 (Hide, Search, Passive Perception) and the
// stat blocks, not copied from the function's output.

const sheet = JSON.parse(readFileSync(new URL("../../../../content/settings/realm-of-myr/adventures/the-midnight-summons/characters/thalbern.json", import.meta.url), "utf8")).sheet as Sheet
type Character = { id: string; name: string; type: string; sheet?: Sheet; statBlock?: string; side?: Side; hitPoints?: number; conditions?: ConditionEntry[]; fled?: true; turnEffects?: TurnEffect[] }
// Thalbern, a level 1 Ranger: Perception +3, so Passive Perception 13. Stealth +5.
const thalbern = (...conditions: ConditionEntry[]): Character => ({ id: "thalbern", name: "Thalbern", type: "pc", sheet, hitPoints: 11, ...(conditions.length ? { conditions } : {}) })
// An Owlbear: Perception +5, Passive Perception 15.
const owlbear = (...conditions: ConditionEntry[]): Character => ({ id: "owlbear", name: "Owlbear", type: "npc", statBlock: "owlbear", hitPoints: 59, ...(conditions.length ? { conditions } : {}) })
// A Commoner: Passive Perception 10.
const farmer = (side?: Side): Character => ({ id: "farmer", name: "Farmer", type: "npc", statBlock: "commoner", hitPoints: 4, ...(side ? { side } : {}) })

// Thalbern's Hide as the engine settles it: the stakes give Invisible on a success, then the finding rules read the total.
function hides(total: number, others: Character[]) {
  const roll = hideRoll(thalbern())
  const success = total >= roll.difficulty
  const settled = applyStakes({ characters: [thalbern(), ...others], stakes: roll.stakes, outcome: success ? "success" : "failure", roll: () => 1 })
  return hidingAfterRoll({ characters: settled.characters, rollerId: "thalbern", roll, result: { total, success }, conditions: settled.conditions, facts: settled.facts })
}

test("Passive Perception is 10 plus the Perception bonus, with 5 off for Disadvantage", () => {
  assert.equal(passivePerception(thalbern()), 13)
  assert.equal(passivePerception(owlbear()), 15)
  assert.equal(passivePerception(farmer()), 10)
  // Poisoned: Disadvantage on ability checks, so 5 less.
  assert.equal(passivePerception(owlbear({ id: "poisoned" })), 10)
  // Two levels of Exhaustion take 4 off every d20 Test.
  assert.equal(passivePerception(owlbear({ id: "exhaustion", level: 2 })), 11)
})

test("a Hide keeps its Stealth total, which is what a searcher must meet", () => {
  const hid = hides(17, [owlbear()])
  assert.deepEqual(hid.characters[0].conditions, [{ id: "invisible", dc: 17 }])
  assert.equal(hideTotal(hid.characters[0]), 17)
  assert.deepEqual([hid.conditions, hid.facts, hid.noticed], [[{ target: "thalbern", condition: "invisible" }], ["Thalbern is now Invisible."], undefined])
  // One hidden before totals were kept has the Hide's own DC, 15.
  assert.equal(hideTotal(thalbern({ id: "invisible" })), 15)
  // A failed Hide hides no one.
  assert.equal(isHidden(hides(14, [owlbear()]).characters[0]), false)
})

test("an enemy whose Passive Perception meets the total notices at once, with no roll", () => {
  // 15 against the Owlbear's 15: it notices him. He is not hidden, and the condition the roll gave is taken back.
  const seen = hides(15, [owlbear()])
  assert.equal(seen.characters[0].conditions, undefined)
  assert.deepEqual(seen.noticed, { by: "owlbear", of: "thalbern", passive: 15, total: 15 })
  assert.deepEqual(seen.conditions, [])
  assert.deepEqual(seen.facts, ["Owlbear notices Thalbern without searching: a Passive Perception of 15 meets the Stealth total of 15. Thalbern is not hidden."])
  assert.equal(noticeText(seen.noticed ?? { by: "", of: "", passive: 0, total: 0 }, seen.characters), "Owlbear notices Thalbern. Passive Perception 15 against Stealth 15.")
  // 16 is past it.
  assert.equal(isHidden(hides(16, [owlbear()]).characters[0]), true)
  // A Poisoned Owlbear's is 10, and one that is Unconscious, down or gone notices nothing.
  assert.equal(isHidden(hides(15, [owlbear({ id: "poisoned" })]).characters[0]), true)
  assert.equal(isHidden(hides(15, [owlbear({ id: "unconscious" })]).characters[0]), true)
  assert.equal(isHidden(hides(15, [{ ...owlbear(), hitPoints: 0 }]).characters[0]), true)
  assert.equal(isHidden(hides(15, [{ ...owlbear(), fled: true }]).characters[0]), true)
  // Only an enemy finds him: an ally and a bystander do not, however sharp.
  assert.equal(isHidden(hides(15, [{ ...owlbear(), side: "party" }]).characters[0]), true)
  assert.equal(isHidden(hides(15, [{ ...owlbear(), side: "none" }]).characters[0]), true)
  // With no enemy here, a bare 15 holds.
  assert.deepEqual(hides(15, []).characters[0].conditions, [{ id: "invisible", dc: 15 }])
})

test("an enemy who comes into the scene notices one already hidden", () => {
  const hidden = thalbern({ id: "invisible", dc: 15 })
  const arrived = noticedOnArrival([hidden, owlbear()])
  assert.deepEqual(arrived.noticed, [{ by: "owlbear", of: "thalbern", passive: 15, total: 15 }])
  assert.equal(arrived.characters[0].conditions, undefined)
  // A total past its Passive Perception holds, and so does one against a Commoner's 10.
  const held = noticedOnArrival([thalbern({ id: "invisible", dc: 16 }), owlbear()])
  assert.deepEqual([held.noticed, held.characters[0].conditions], [[], [{ id: "invisible", dc: 16 }]])
  assert.deepEqual(noticedOnArrival([hidden, farmer()]).noticed, [])
  // Invisible by a spell is no Hide: no one notices it away.
  assert.deepEqual(noticedOnArrival([thalbern({ id: "invisible", spell: "invisibility" }), owlbear()]).noticed, [])
})

test("the Search action is a Perception check against the hider's total", () => {
  const scene = [thalbern({ id: "invisible", dc: 17 }), owlbear()]
  assert.deepEqual(
    hiddenFrom(scene[1], scene).map((other) => other.id),
    ["thalbern"]
  )
  // The Owlbear: Perception +5 against his 17.
  const roll = searchRoll(scene[1], scene)
  assert.deepEqual(roll, { check: { kind: "skill", skill: "perception" }, rollType: SEARCH_ROLL, difficulty: 17, modifier: 5, mode: "normal" })
  if (!roll) return
  // A 16 finds no one, and the story is told so.
  const missed = hidingAfterRoll({ characters: scene, rollerId: "owlbear", roll, result: { total: 16, success: false } })
  assert.deepEqual(missed.characters[0].conditions, [{ id: "invisible", dc: 17 }])
  assert.deepEqual([missed.conditions, missed.facts], [[], ["Owlbear finds no one. Thalbern stays hidden, and Owlbear does not learn where."]])
  // A 17 finds him.
  const hit = hidingAfterRoll({ characters: scene, rollerId: "owlbear", roll, result: { total: 17, success: true } })
  assert.equal(hit.characters[0].conditions, undefined)
  assert.deepEqual([hit.conditions, hit.facts], [[{ target: "thalbern", condition: "invisible", ends: true }], ["Owlbear finds Thalbern, who is no longer hidden."]])
  // A Poisoned searcher rolls with Disadvantage.
  const sick = [scene[0], owlbear({ id: "poisoned" })]
  assert.deepEqual([searchRoll(sick[1], sick)?.mode, searchRoll(sick[1], sick)?.reasons], ["disadvantage", ["Poisoned"]])
  // An ally's Help with Perception gives the search Advantage, as it gives any check.
  const helped = [scene[0], { ...owlbear(), turnEffects: [{ id: "helped", by: "wolf", skill: "perception", turns: 2 }] }, { id: "wolf", name: "Wolf", type: "npc", statBlock: "wolf", hitPoints: 11 }]
  assert.deepEqual([searchRoll(helped[1], helped)?.mode, searchRoll(helped[1], helped)?.reasons], ["advantage", ["Help from Wolf"]])
  // No one hides from it: there is nothing to search for. An ally's hiding is not searched out.
  assert.equal(searchRoll(owlbear(), [thalbern(), owlbear()]), undefined)
  assert.equal(searchRoll({ ...owlbear(), side: "party" }, scene), undefined)
})

test("one Search finds everyone whose total it meets, and a spell's Invisible is not searched away", () => {
  const lyra: Character = { ...thalbern({ id: "invisible", dc: 20 }), id: "lyra", name: "Lyra" }
  const mage: Character = { ...thalbern({ id: "invisible", spell: "invisibility" }), id: "mage", name: "Mage" }
  const scene = [thalbern({ id: "invisible", dc: 16 }), lyra, mage, owlbear()]
  const roll = searchRoll(scene[3], scene)
  // The lowest total among those hidden is what the roll is made against.
  assert.equal(roll?.difficulty, 16)
  if (!roll) return
  const hit = hidingAfterRoll({ characters: scene, rollerId: "owlbear", roll, result: { total: 18, success: true } })
  assert.deepEqual(
    hit.characters.map((character) => character.conditions),
    [undefined, [{ id: "invisible", dc: 20 }], [{ id: "invisible", spell: "invisibility" }], undefined]
  )
  assert.deepEqual(hit.facts, ["Owlbear finds Thalbern, who is no longer hidden."])
  // A roll that is neither a Hide nor a Search changes nothing.
  const other = hidingAfterRoll({ characters: scene, rollerId: "owlbear", roll: { ...roll, rollType: "Perception" }, result: { total: 30, success: true } })
  assert.deepEqual(other.characters, scene)
})
