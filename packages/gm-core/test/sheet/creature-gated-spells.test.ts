import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { noOneToWorkOnNote, spellsWithNoOneToWorkOn } from "../../src/sheet/creature-gated-spells"
import type { Sheet } from "../../src/sheet/sheet"

// Thalbern, the level 1 Ranger of The Midnight Summons, knows Cure Wounds and Speak with Animals.
const sheet = (JSON.parse(readFileSync(new URL("../../../../content/settings/realm-of-myr/adventures/the-midnight-summons/characters/thalbern.json", import.meta.url), "utf8")) as { sheet: Sheet }).sheet
const thalbern = { id: "thalbern", name: "Thalbern", type: "pc", sheet, hitPoints: 11 }
const owlbear = { id: "owlbear", name: "Owlbear", type: "npc", statBlock: "owlbear", hitPoints: 59 }
const wolf = { id: "wolf", name: "Wolf", type: "npc", statBlock: "wolf", hitPoints: 11 }
const wollandora = { id: "wollandora", name: "Wollandora", type: "npc", hitPoints: 30 }

test("Speak with Animals has no one to work on before an Owlbear, a Monstrosity", () => {
  assert.deepEqual(spellsWithNoOneToWorkOn(thalbern, [thalbern, owlbear]), ["Speak with Animals works only on Beasts, and none is here"])
  assert.match(noOneToWorkOnNote(thalbern, [thalbern, owlbear]), /^Spells with no one here to work on, so do not use them now: Speak with Animals/)
})

test("a Wolf, a Beast, gives Speak with Animals someone to work on", () => {
  assert.deepEqual(spellsWithNoOneToWorkOn(thalbern, [thalbern, owlbear, wolf]), [])
  assert.equal(noOneToWorkOnNote(thalbern, [thalbern, owlbear, wolf]), "")
})

test("the caster is not counted, and a Humanoid is no Beast", () => {
  assert.deepEqual(spellsWithNoOneToWorkOn(thalbern, [thalbern, wollandora]), ["Speak with Animals works only on Beasts, and none is here"])
})
