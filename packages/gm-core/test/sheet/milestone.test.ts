import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { deriveSheet, sheetProblems } from "../../src/sheet/derive"
import { autoChoices, LEVEL_CAP, levelOwed, takeLevel } from "../../src/sheet/milestone"
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

test("an adventure owes its level once, to a living hero below the cap", () => {
  const hero = { type: "pc", name: "Thalbern", sheet: premades.ranger }
  assert.equal(levelOwed(hero, "the-midnight-summons", true), true)
  assert.equal(levelOwed(hero, "the-midnight-summons", false), false)
  assert.equal(levelOwed({ ...hero, dead: true as const }, "the-midnight-summons", true), false)
  assert.equal(levelOwed({ ...hero, milestones: ["the-midnight-summons"] }, "the-midnight-summons", true), false)
  assert.equal(levelOwed({ ...hero, milestones: ["the-midnight-summons"] }, "covert-cargo", true), true)
  assert.equal(levelOwed({ ...hero, sheet: { ...premades.ranger, level: LEVEL_CAP } }, "covert-cargo", true), false)
  assert.equal(levelOwed({ type: "npc", name: "Garlan" }, "covert-cargo", true), false)
})

test("a level taken: the sheet one level on, whole at the new maximum, and the adventure gives no second", () => {
  // Thalbern, a Ranger with Constitution 13: 11 hit points at level 1, and 6 + 1 more at level 2.
  const hurt = { type: "pc", name: "Thalbern", sheet: premades.ranger, hitPoints: 3, healthPercent: 27 }
  const taken = takeLevel(hurt, "the-midnight-summons", autoChoices(premades.ranger))
  if ("problems" in taken) assert.fail(taken.problems.join("; "))
  assert.equal(taken.character.sheet?.level, 2)
  assert.equal(taken.character.hitPoints, 18)
  assert.equal(taken.character.healthPercent, 100)
  assert.deepEqual(taken.character.milestones, ["the-midnight-summons"])
  assert.deepEqual(takeLevel(taken.character, "the-midnight-summons", {}), { problems: ["this adventure has already given its level"] })
  // A choice the level does not ask for is refused by the engine.
  assert.deepEqual(takeLevel(hurt, "the-midnight-summons", { subclass: "hunter" }), { problems: ["level 2 grants no subclass"] })
})

test("choices that need no player make a legal sheet for every class, from level 1 to the cap", () => {
  for (const [name, start] of Object.entries(premades)) {
    let current = start
    for (let level = 2; level <= LEVEL_CAP; level++) {
      const taken = takeLevel({ type: "pc", name, sheet: current }, `adventure-${level}`, autoChoices(current))
      if ("problems" in taken) assert.fail(`${name} to level ${level}: ${taken.problems.join("; ")}`)
      current = taken.character.sheet as Sheet
      assert.equal(current.level, level)
      assert.deepEqual(sheetProblems(current), [], `${name} at level ${level}`)
    }
    // Level 3 gave the class's subclass, and level 4 raised the class's main ability by 2.
    assert.ok(current.subclass, name)
    assert.equal(current.advancements?.find((entry) => entry.level === 4)?.feat, "ability-score-improvement", name)
    assert.ok(deriveSheet(current).hitPointMaximum > deriveSheet(start).hitPointMaximum)
  }
})
