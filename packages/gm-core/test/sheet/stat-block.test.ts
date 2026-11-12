import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { hitPointsOf } from "../../src/sheet/hit-points"
import type { Sheet } from "../../src/sheet/sheet"
import { combatStatsOf, initiativeBonusOf, isStatBlock, rollInitiative } from "../../src/sheet/stat-block"

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

test("Initiative is the d20 plus the bonus from the sheet or the stat block", () => {
  // Thalbern: Dex 17 (+3), and his Alert feat adds his Proficiency Bonus (+2). A 10 on the die makes 15.
  const thalbern = JSON.parse(readFileSync(new URL("../../../../content/settings/realm-of-myr/adventures/the-midnight-summons/characters/thalbern.json", import.meta.url), "utf8"))
  assert.equal(initiativeBonusOf(thalbern), 5)
  assert.equal(rollInitiative(thalbern, 10), 15)
  // An Owlbear's block prints Initiative +1, and a Commoner's +0.
  assert.equal(rollInitiative({ type: "npc", statBlock: "owlbear" }, 10), 11)
  assert.equal(rollInitiative({ type: "npc" }, 10), 10)
  assert.throws(() => initiativeBonusOf({ name: "Nobody", type: "pc" }), /Nobody has no rules sheet/)
})
