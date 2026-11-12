import assert from "node:assert/strict"
import { test } from "node:test"
import { autoCreate, type CreationPick, createSheet } from "../../src/sheet/create"
import { sheetProblems } from "../../src/sheet/derive"
import { raisedTo } from "../../src/sheet/milestone"
import { longRest, shortRest, withMagicalCunning } from "../../src/sheet/rest"
import type { Sheet } from "../../src/sheet/sheet"
import { castCost, slotsLeft, spellcastingOf, withCastSpent } from "../../src/sheet/spells"
import { sheetView } from "../../src/sheet/view"

// Every expected value below was worked out by hand from the SRD 5.2.1 rules, not copied from the function's output.
// The Warlock Features table: one level 1 slot at level 1, two at level 2, two level 2 slots at levels 3 and 4, and two
// level 3 slots at level 5. "To cast the level 1 spell Charm Person, you must spend one of those slots, and you cast it
// as a level 3 spell." Pact Magic slots come back on a Short or Long Rest. Magical Cunning (level 2) gives back
// expended slots, "no more than a number equal to half your maximum (round up)", once a Long Rest.

type Hero = { id: string; name: string; type: string; sheet: Sheet; controlledBy: "ai"; hitPoints?: number; spellSlots?: number[]; featureUses?: Record<string, number> }

const pick = { class: "warlock", species: "human", background: "criminal" } as unknown as CreationPick
const made = (): Sheet => {
  const result = createSheet(pick, autoCreate(pick))
  if ("problems" in result) assert.fail(result.problems.join("; "))
  return result.sheet
}
const at = (level: number): Hero => raisedTo({ id: "vex", name: "Vex", type: "pc", sheet: made(), controlledBy: "ai" }, level)
const ok = <T>(result: { character: T } | { problem: string }): T => {
  if ("problem" in result) assert.fail(result.problem)
  return result.character
}

test("a Warlock's Pact Magic slots by level, made and raised legal", () => {
  const slots = (level: number) => spellcastingOf(at(level))?.slots
  assert.deepEqual([slots(1), slots(2), slots(3), slots(4), slots(5)], [[1], [2], [0, 2], [0, 2], [0, 0, 2]])
  for (const level of [1, 2, 3, 4, 5]) {
    const hero = at(level)
    assert.equal(hero.sheet.level, level)
    assert.deepEqual(sheetProblems(hero.sheet), [], `level ${level}`)
  }
  // Two cantrips to level 3 and three from 4. Prepared spells: 2, 3, 4, 5, 6.
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((level) => [at(level).sheet.cantrips?.length, at(level).sheet.spells?.length]),
    [
      [2, 2],
      [2, 3],
      [2, 4],
      [3, 5],
      [3, 6],
    ]
  )
  assert.deepEqual(sheetView(at(5).sheet, undefined, [0, 0, 1]).spellcasting?.slots, [{ level: 3, total: 2, left: 1 }])
})

test("a level 5 Warlock casts at level 3, regains slots on a Short Rest, and by Magical Cunning once a Long Rest", () => {
  const vex = at(5)
  const spell = vex.sheet.spells?.[0] ?? ""
  const pay = (hero: Hero) => {
    const cost = castCost(hero, spell)
    if ("problem" in cost) return cost.problem
    assert.deepEqual(cost.cost, { kind: "slot", level: 3 })
    return withCastSpent(hero, cost.cost)
  }
  const once = pay(vex) as Hero
  assert.deepEqual(
    [once.spellSlots, slotsLeft(once)],
    [
      [0, 0, 1],
      [0, 0, 1],
    ]
  )
  const twice = pay(once) as Hero
  assert.deepEqual(slotsLeft(twice), [0, 0, 0])
  assert.match(pay(twice) as string, /no spell slot of level \d or higher left/)

  const rested = shortRest(twice, { roll: () => 1 })
  assert.deepEqual([rested.character.spellSlots, slotsLeft(rested.character)], [undefined, [0, 0, 2]])
  assert.ok(rested.facts.includes("Vex regains all expended Pact Magic spell slots."))

  // Half of two, rounded up, is one.
  assert.match((withMagicalCunning(twice, { inFight: true }) as { problem: string }).problem, /not made in a fight/)
  const cunning = ok(withMagicalCunning(twice, { inFight: false }))
  assert.deepEqual([cunning.spellSlots, cunning.featureUses], [[0, 0, 1], { "warlock-magical-cunning": 1 }])
  const spentAgain = pay(cunning) as Hero
  assert.ok("problem" in withMagicalCunning(spentAgain, { inFight: false }))
  // A Short Rest does not give Magical Cunning back. A Long Rest does.
  const afterShort = shortRest(spentAgain, { roll: () => 1 }).character
  assert.deepEqual(afterShort.featureUses, { "warlock-magical-cunning": 1 })
  const slept = longRest(pay(pay(afterShort) as Hero) as Hero).character
  assert.deepEqual([slept.spellSlots, slept.featureUses], [undefined, undefined])
})
