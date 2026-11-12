import assert from "node:assert/strict"
import { test } from "node:test"
import { healthPercentOf } from "../../src/sheet/hit-points"
import type { Sheet } from "../../src/sheet/sheet"
import { hitPointsOf } from "../../src/sheet/stat-block"

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
