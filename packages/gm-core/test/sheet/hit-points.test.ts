import assert from "node:assert/strict"
import { test } from "node:test"
import { healthPercentOf, hitPointsOf, withHealthPercent, withHitPoints, withStartingHitPoints } from "../../src/sheet/hit-points"
import type { Sheet } from "../../src/sheet/sheet"

// A Fighter with Constitution 15 has 12 hit points at level 1: d10 + 2.
const fighter: Sheet = {
  class: "fighter",
  level: 1,
  species: "orc",
  background: "soldier",
  abilityScores: { str: 16, dex: 12, con: 15, int: 8, wis: 13, cha: 10 },
  classSkills: ["perception", "survival"],
}

test("hit points follow health percent", () => {
  assert.deepEqual(hitPointsOf({ sheet: fighter, healthPercent: 100 }), { current: 12, maximum: 12 })
  assert.deepEqual(hitPointsOf({ sheet: fighter, healthPercent: 75 }), { current: 9, maximum: 12 })
  assert.deepEqual(hitPointsOf({ sheet: fighter, healthPercent: 50 }), { current: 6, maximum: 12 })
  assert.deepEqual(hitPointsOf({ sheet: fighter }), { current: 12, maximum: 12 }, "no health percent means unhurt")
})

test("only 0 percent is 0 hit points", () => {
  assert.deepEqual(hitPointsOf({ sheet: fighter, healthPercent: 1 }), { current: 1, maximum: 12 })
  assert.deepEqual(hitPointsOf({ sheet: fighter, healthPercent: 0 }), { current: 0, maximum: 12 })
  assert.deepEqual(hitPointsOf({ sheet: fighter, healthPercent: 140 }), { current: 12, maximum: 12 })
  assert.deepEqual(hitPointsOf({ sheet: fighter, healthPercent: -5 }), { current: 0, maximum: 12 })
})

test("a character with no sheet has no hit points yet", () => {
  assert.equal(hitPointsOf({ healthPercent: 80 }), undefined)
})

test("health percent from hit points", () => {
  assert.equal(healthPercentOf({ current: 12, maximum: 12 }), 100)
  assert.equal(healthPercentOf({ current: 9, maximum: 12 }), 75)
  assert.equal(healthPercentOf({ current: 1, maximum: 200 }), 1, "any hit points left is at least 1 percent")
  assert.equal(healthPercentOf({ current: 0, maximum: 12 }), 0)
  for (let current = 0; current <= 12; current++) {
    const percent = healthPercentOf({ current, maximum: 12 })
    assert.equal(hitPointsOf({ sheet: fighter, healthPercent: percent })?.current, current, `${current} hit points survives the round trip`)
  }
})

// Thalbern, a level 1 Ranger with Constitution 13, has d10 + 1 = 11 hit points. An Owlbear has 59 and a Commoner 4,
// as their stat blocks print.
const thalbern = {
  type: "pc",
  sheet: {
    class: "ranger",
    level: 1,
    species: "human",
    background: "soldier",
    abilityScores: { str: 13, dex: 17, con: 13, int: 11, wis: 13, cha: 10 },
    classSkills: ["stealth", "survival", "nature"],
  } satisfies Sheet,
}
const owlbear = { type: "npc", statBlock: "owlbear" }
const commoner = { type: "npc" }

test("stored hit points are the value, and health percent is their copy", () => {
  // 7 of 11 is 63.6%, shown as 64. 20 is past the maximum, and -3 below 0.
  assert.deepEqual([withHitPoints(thalbern, 7).hitPoints, withHitPoints(thalbern, 7).healthPercent], [7, 64])
  assert.deepEqual([withHitPoints(thalbern, 20).hitPoints, withHitPoints(thalbern, 20).healthPercent], [11, 100])
  assert.deepEqual([withHitPoints(owlbear, -3).hitPoints, withHitPoints(owlbear, -3).healthPercent], [0, 0])
  assert.deepEqual(hitPointsOf({ ...thalbern, hitPoints: 7, healthPercent: 100 }), { current: 7, maximum: 11 }, "the stored hit points win")
})

test("a character enters play at its maximum, or with the hit points it has", () => {
  assert.deepEqual([withStartingHitPoints(commoner).hitPoints, withStartingHitPoints(commoner).healthPercent], [4, 100])
  assert.equal(withStartingHitPoints({ ...thalbern, hitPoints: 5 }).hitPoints, 5)
  assert.throws(() => withStartingHitPoints({ type: "pc" }), /no sheet or stat block/)
})

test("a percent write sets hit points, and health percent follows them", () => {
  // Half of the Owlbear's 59 is 29.5, so 30, and 30 of 59 shows as 51%.
  assert.deepEqual([withHealthPercent(owlbear, 50).hitPoints, withHealthPercent(owlbear, 50).healthPercent], [30, 51])
  // 10% of a Commoner's 4 is 0.4, but any health left is at least 1 hit point, which shows as 25%.
  assert.deepEqual([withHealthPercent(commoner, 10).hitPoints, withHealthPercent(commoner, 10).healthPercent], [1, 25])
  assert.deepEqual([withHealthPercent(thalbern, 0).hitPoints, withHealthPercent(thalbern, 0).healthPercent], [0, 0])
})
