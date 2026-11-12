import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { deriveSheet, sheetProblems } from "../../src/sheet/derive"
import { autoChoices, LEVEL_CAP, levelOwed, raisedTo, takeLevel, withLevelDue } from "../../src/sheet/milestone"
import type { Sheet } from "../../src/sheet/sheet"

const sheet = (path: string) => (JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { sheet: Sheet }).sheet
const premades = {
  wizard: sheet("covert-cargo/characters/1749159962941.json"),
  rogue: sheet("covert-cargo/characters/1749307435667.json"),
  ranger: sheet("covert-cargo/characters/thalbern.json"),
  cleric: sheet("welcome-to-kordavos/characters/milos-radan.json"),
  fighter: sheet("welcome-to-kordavos/characters/branka-stoneveil.json"),
  bard: sheet("welcome-to-kordavos/characters/ilya-veles.json"),
}

test("a living hero below the level due to them is owed a level, up to the cap", () => {
  const hero = { type: "pc", name: "Thalbern", sheet: premades.ranger }
  // A level 1 hero in a level 1 adventure is owed nothing, and in a level 2 adventure one level.
  assert.equal(levelOwed(hero), false)
  assert.equal(levelOwed(withLevelDue(hero, 1)), false)
  assert.deepEqual(withLevelDue(hero, 1), hero)
  assert.equal(levelOwed(withLevelDue(hero, 2)), true)
  assert.equal(levelOwed({ ...withLevelDue(hero, 2), dead: true as const }), false)
  // One who has reached what was due is marked no longer.
  assert.equal(withLevelDue({ ...hero, levelDue: 2, sheet: { ...premades.ranger, level: 2 } }, 2).levelDue, undefined)
  assert.equal(levelOwed({ ...hero, levelDue: 9, sheet: { ...premades.ranger, level: LEVEL_CAP } }), false)
  assert.equal(levelOwed({ type: "npc", name: "Garlan", levelDue: 2 }), false)
})

test("a level taken: the sheet one level on, hit points up by what the level adds, and no more owed", () => {
  // Thalbern, a Ranger with Constitution 13: 11 hit points at level 1, and 6 + 1 more at level 2. Hurt to 3, he
  // stands at 10 of 18.
  const hurt = { type: "pc", name: "Thalbern", sheet: premades.ranger, hitPoints: 3, healthPercent: 27, levelDue: 2 }
  const taken = takeLevel(hurt, autoChoices(premades.ranger))
  if ("problems" in taken) assert.fail(taken.problems.join("; "))
  assert.equal(taken.character.sheet.level, 2)
  assert.deepEqual([taken.character.hitPoints, deriveSheet(taken.character.sheet).hitPointMaximum], [10, 18])
  assert.equal(taken.character.levelDue, undefined)
  assert.deepEqual(takeLevel(taken.character, {}), { problems: ["no level is owed to this hero"] })
  // A choice the level does not ask for is refused by the engine.
  assert.deepEqual(takeLevel(hurt, { subclass: "hunter" }), { problems: ["level 2 grants no subclass"] })
  // One at 0 hit points stays there, and one owed two levels is still owed one.
  const down = takeLevel({ ...hurt, hitPoints: 0, healthPercent: 0, levelDue: 3 }, autoChoices(premades.ranger))
  assert.deepEqual("character" in down && [down.character.hitPoints, down.character.levelDue], [0, 3])
})

test("brought to a level: an AI companion takes every level at once, and a player's hero is marked for it", () => {
  const companion: { sheet: Sheet; hitPoints?: number; levelDue?: number } = raisedTo(
    { type: "pc", name: "Poppen", sheet: premades.rogue, controlledBy: "ai" as const, hitPoints: 10, healthPercent: 100 },
    3
  )
  // A Rogue with Constitution 14: 8 + 2 hit points at level 1, and 5 + 2 more at each level after.
  assert.deepEqual([companion.sheet.level, companion.sheet.subclass, companion.hitPoints, companion.levelDue], [3, "thief", 24, undefined])
  const player: { sheet: Sheet; levelDue?: number } = raisedTo({ type: "pc", name: "Lyra", sheet: premades.wizard }, 3)
  assert.deepEqual([player.sheet.level, player.levelDue], [1, 3])
  // Nothing changes for one already there.
  assert.deepEqual(raisedTo({ type: "pc", name: "Lyra", sheet: premades.wizard }, 1), { type: "pc", name: "Lyra", sheet: premades.wizard })
})

test("choices that need no player make a legal sheet for every class, from level 1 to the cap", () => {
  for (const [name, start] of Object.entries(premades)) {
    const raised = raisedTo({ type: "pc", name, sheet: start, controlledBy: "ai" as const }, LEVEL_CAP)
    const current = raised.sheet
    assert.equal(current.level, LEVEL_CAP, name)
    assert.deepEqual(sheetProblems(current), [], name)
    // Level 3 gave the class's subclass, and level 4 an Ability Score Improvement.
    assert.ok(current.subclass, name)
    assert.equal(current.advancements?.find((entry) => entry.level === 4)?.feat, "ability-score-improvement", name)
    assert.ok(deriveSheet(current).hitPointMaximum > deriveSheet(start).hitPointMaximum)
  }
})
