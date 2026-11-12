import assert from "node:assert/strict"
import { test } from "node:test"
import { hitPointsOf } from "../../src/sheet/hit-points"
import type { Sheet } from "../../src/sheet/sheet"
import { combatStatsOf, isStatBlock } from "../../src/sheet/stat-block"

// The numbers are the ones the SRD 5.2.1 stat blocks print.

test("an NPC takes its hit points and Armor Class from its stat block", () => {
  assert.deepEqual(combatStatsOf({ type: "npc", statBlock: "owlbear" }), { hitPointMaximum: 59, armorClass: 13, from: "Owlbear" })
  assert.deepEqual(combatStatsOf({ type: "npc", statBlock: "guard" }), { hitPointMaximum: 11, armorClass: 16, from: "Guard" })
  assert.deepEqual(combatStatsOf({ type: "npc", statBlock: "bandit-captain" }), { hitPointMaximum: 52, armorClass: 15, from: "Bandit Captain" })
})

test("an NPC that names no stat block, or one the SRD lacks, is a Commoner", () => {
  assert.deepEqual(combatStatsOf({ type: "npc" }), { hitPointMaximum: 4, armorClass: 10, from: "Commoner" })
  assert.deepEqual(combatStatsOf({ type: "npc", statBlock: "tavern-keeper" }), { hitPointMaximum: 4, armorClass: 10, from: "Commoner" })
  assert.equal(isStatBlock("guard"), true)
  assert.equal(isStatBlock("tavern-keeper"), false)
})

test("a hero's numbers come from its sheet, and a hero with no sheet has none", () => {
  const fighter: Sheet = {
    class: "fighter",
    level: 1,
    species: "orc",
    background: "soldier",
    abilityScores: { str: 16, dex: 12, con: 15, int: 8, wis: 13, cha: 10 },
    classSkills: ["perception", "survival"],
    armor: "chain-mail",
  }
  assert.deepEqual(combatStatsOf({ type: "pc", sheet: fighter }), { hitPointMaximum: 12, armorClass: 16, from: "Chain Mail" })
  assert.equal(combatStatsOf({ type: "pc" }), undefined)
})

test("an NPC's hit points follow its health percent", () => {
  assert.deepEqual(hitPointsOf({ type: "npc", statBlock: "owlbear", healthPercent: 50 }), { current: 30, maximum: 59 })
  assert.deepEqual(hitPointsOf({ type: "npc", healthPercent: 100 }), { current: 4, maximum: 4 })
  assert.deepEqual(hitPointsOf({ type: "npc", statBlock: "guard", healthPercent: 0 }), { current: 0, maximum: 11 })
})
