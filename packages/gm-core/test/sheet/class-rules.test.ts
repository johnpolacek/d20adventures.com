import assert from "node:assert/strict"
import { test } from "node:test"
import { bonusActionRule, reactionRule, turnEffectRule } from "../../src/sheet/class-rules"

test("a class file's Bonus Action, reaction and turn effect are found through the registry", () => {
  assert.equal(bonusActionRule("fighter-second-wind")?.feature, "fighter-second-wind")
  assert.equal(bonusActionRule("cunning-action-hide")?.follow, "hide")
  assert.equal(reactionRule("cutting-words")?.name, "Cutting Words")
  assert.deepEqual(turnEffectRule("sneak-attack"), { id: "sneak-attack", span: 1 })
  assert.equal(bonusActionRule("rage"), undefined)
})
