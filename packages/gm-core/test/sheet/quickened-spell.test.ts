import assert from "node:assert/strict"
import { test } from "node:test"
import { useBonus } from "../../src/services/bonus-action"
import { classBonusCast } from "../../src/sheet/class-rules"
import { autoCreate, type CreationPick, createSheet } from "../../src/sheet/create"
import { usesLeft } from "../../src/sheet/feature-rules"
import { raisedTo } from "../../src/sheet/milestone"
import type { Sheet } from "../../src/sheet/sheet"
import { type Castee, slotsLeft, spellById } from "../../src/sheet/spells"
import type { TurnCharacter } from "../../src/types/adventure"

// Every expected value below was worked out by hand from the SRD 5.2.1 text, not copied from the function's output.
// Quickened Spell (page 67), 2 Sorcery Points: "When you cast a spell that has a casting time of an action, you can
// spend 2 Sorcery Points to change the casting time to a Bonus Action for this casting."
// Vesna is a human Sorcerer made by the creator and raised to level 5: 5 Sorcery Points, and level 1 to 3 slots of
// 4, 3 and 2, Charisma 17 (+3) and Proficiency Bonus +3, so her save DC is 14. She prepares Burning Hands, and knows no
// Magic Missile. An Ogre has 68 hit points and a Dexterity save of −1. Every d20 falls 10 and every damage die 4.

const pick = { class: "sorcerer", species: "human", background: "sage" } as unknown as CreationPick
type Hero = TurnCharacter & Castee & { sheet: Sheet; featureUses?: Record<string, number>; spellSlots?: number[] }
const vesna = (metamagic: string[]): Hero => {
  const result = createSheet(pick, autoCreate(pick))
  if ("problems" in result) assert.fail(result.problems.join("; "))
  const raised = raisedTo({ id: "vesna", name: "Vesna", type: "pc", sheet: result.sheet, controlledBy: "ai" } as unknown as Hero, 5)
  return { ...raised, hitPoints: 30, sheet: { ...raised.sheet, featurePicks: { ...raised.sheet.featurePicks, "sorcerer-metamagic": metamagic.map((option) => ({ option })) } } }
}
const ogre = (): Hero => ({ id: "ogre", name: "Ogre", type: "npc", statBlock: "ogre", hitPoints: 68 }) as unknown as Hero
const spell = (id: string) => spellById.get(id) ?? assert.fail(id)
const cast = (hero: Hero, id: string) =>
  useBonus({
    characters: [hero, ogre()],
    actorId: "vesna",
    bonus: { feature: id, target: "ogre" },
    floor: async () => undefined,
    ask: () => false,
    d20: () => 10,
    roll: () => 4,
    by: { step: "reply", character: "vesna" },
    names: { vesna: "Vesna", ogre: "Ogre" },
  })
const find = (characters: readonly TurnCharacter[], id: string) => characters.find((character) => character.id === id) as Hero

test("Quickened Spell takes a spell of an action while 2 Sorcery Points can be paid, and no other", () => {
  const hero = vesna(["quickened-spell", "twinned-spell"])
  assert.equal(classBonusCast(hero, spell("burning-hands"))?.id, "quickened-spell")
  assert.equal(classBonusCast(hero, spell("fire-bolt"))?.id, "quickened-spell")
  // Misty Step already takes a Bonus Action, and Shield a Reaction.
  assert.equal(classBonusCast(hero, spell("misty-step")), undefined)
  assert.equal(classBonusCast(hero, spell("shield")), undefined)
  // Without the option picked, or with no points and no slot to turn into them, none.
  assert.equal(classBonusCast(vesna(["twinned-spell", "careful-spell"]), spell("burning-hands")), undefined)
  assert.equal(classBonusCast({ ...hero, featureUses: { "sorcerer-font-of-magic": 5 }, spellSlots: [4, 3, 2] }, spell("burning-hands")), undefined)
})

test("A quickened Burning Hands is cast with the Bonus Action: 2 Sorcery Points and its level 1 slot are spent", async () => {
  const used = await cast(vesna(["quickened-spell", "twinned-spell"]), "burning-hands")
  // The Ogre's 10 − 1 = 9 fails DC 14, and 3d6 is 12: 68 − 12 = 56. Points 5 − 2 = 3. Level 1 slots 4 − 1 = 3.
  assert.equal(find(used.characters, "ogre").hitPoints, 56)
  const after = find(used.characters, "vesna")
  assert.equal(usesLeft(after, "sorcerer-font-of-magic"), 3)
  assert.deepEqual(slotsLeft(after).slice(0, 3), [3, 3, 2])
  assert.ok(used.fact?.startsWith("Vesna spends 2 Sorcery Points on Quickened Spell: the spell is cast with the Bonus Action."))
  assert.equal(used.beats[0]?.kind === "feature" && used.beats[0].name, "Quickened Spell")
})

test("A spell of an action is not cast with the Bonus Action without Quickened Spell", async () => {
  const hero = vesna(["twinned-spell", "careful-spell"])
  const used = await cast(hero, "burning-hands")
  assert.deepEqual([used.beats, find(used.characters, "ogre").hitPoints, usesLeft(find(used.characters, "vesna"), "sorcerer-font-of-magic")], [[], 68, 5])
})
