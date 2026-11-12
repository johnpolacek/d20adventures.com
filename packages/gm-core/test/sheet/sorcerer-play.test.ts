import assert from "node:assert/strict"
import { test } from "node:test"
import { choiceRule, resolveChosenCast, shapedCast } from "../../src/sheet/class-rules"
import { innateSorceryOn, paidPoints } from "../../src/sheet/classes/sorcerer"
import { canCounter } from "../../src/sheet/counterspell"
import { autoCreate, type CreationPick, createSheet } from "../../src/sheet/create"
import { deriveSheet } from "../../src/sheet/derive"
import { usesLeft } from "../../src/sheet/feature-rules"
import { bonusActionsOf, useBonusAction } from "../../src/sheet/features"
import { raisedTo } from "../../src/sheet/milestone"
import { longRest, shortRest } from "../../src/sheet/rest"
import type { Sheet } from "../../src/sheet/sheet"
import { type Castee, castCost, castSpell, slotsLeft, spellAttackModes, spellById, spellcastingFor, withCastSpent } from "../../src/sheet/spells"
import type { Character } from "../../src/types/character"

// Every expected value below was worked out by hand from the SRD 5.2.1 text, not copied from the function's output.
// Vesna is a human Sorcerer made by the creator and raised to level 5: Charisma 17 (+3) with her level 4 raise,
// Proficiency Bonus +3, so her spell save DC is 8 + 3 + 3 = 14 and her spell attacks +6. She is a Draconic Sorcerer
// with four level 1 slots, three level 2 and two level 3, and 5 Sorcery Points by the class table. Her Magic Initiate
// (Wizard) gives Shocking Grasp, a spell of a feat and no Sorcerer spell. An Ogre has Armor Class 11, 68 hit points,
// Dexterity −1 and Constitution +3. Every damage die falls as 4.

const pick = { class: "sorcerer", species: "human", background: "sage" } as unknown as CreationPick
const made = (): Sheet => {
  const result = createSheet(pick, autoCreate(pick))
  if ("problems" in result) assert.fail(result.problems.join("; "))
  return result.sheet
}
type Hero = Character & Castee & { id: string; sheet: Sheet }
const vesna = (metamagic: string[] = ["careful-spell", "heightened-spell"]): Hero => {
  const raised = raisedTo({ id: "vesna", name: "Vesna", type: "pc", sheet: made(), controlledBy: "ai" } as unknown as Hero, 5)
  return { ...raised, hitPoints: 42, sheet: { ...raised.sheet, featurePicks: { "sorcerer-metamagic": metamagic.map((option) => ({ option })) } } }
}
const ogre = (id = "ogre"): Castee => ({ id, name: id === "ogre" ? "Ogre" : "Second Ogre", type: "npc", statBlock: "ogre", hitPoints: 68 }) as Castee
const branka = (): Castee => ({ id: "branka", name: "Branka", type: "pc", hitPoints: 20 }) as Castee
const fours = () => 4
const find = (characters: readonly Castee[], id: string) => characters.find((character) => character.id === id) as Hero
const spell = (id: string) => spellById.get(id) ?? assert.fail(id)

test("A made level 5 Sorcerer casts a cantrip and a level 1 spell by the usual path, with the Draconic Spells prepared", () => {
  const hero = vesna()
  // Draconic Spells: Alter Self, Chromatic Orb, Command and Dragon's Breath at 3, Fear and Fly at 5.
  for (const id of ["alter-self", "chromatic-orb", "command", "dragons-breath", "fear", "fly"]) assert.ok(deriveSheet(hero.sheet).preparedSpells.includes(id), id)
  // Fire Bolt at level 5 is 2d10: 15 + 6 hits Armor Class 11 for 8. A cantrip spends nothing.
  const free = castCost(hero, "fire-bolt")
  assert.ok("cost" in free && free.cost.kind === "cantrip")
  const bolt = castSpell({ characters: [hero, ogre()], casterId: "vesna", spell: spell("fire-bolt"), targets: ["ogre"], attackDice: [15], d20: () => 10, roll: fours })
  assert.equal(find(bolt.characters, "ogre").hitPoints, 60)
  // Burning Hands spends a level 1 slot: the Ogre's 5 − 1 = 4 fails DC 14, and 3d6 is 12. 68 − 12 = 56.
  const paid = castCost(hero, "burning-hands")
  assert.ok("cost" in paid && paid.cost.kind === "slot" && paid.cost.level === 1)
  const burnt = castSpell({ characters: [hero, ogre()], casterId: "vesna", spell: spell("burning-hands"), targets: ["ogre"], d20: () => 5, roll: fours })
  assert.equal(find(burnt.characters, "ogre").hitPoints, 56)
  assert.deepEqual(withCastSpent(hero, paid.cost).spellSlots, [1])
})

test("Innate Sorcery: a Bonus Action, twice a Long Rest, raises her own spells' save DC by 1 and gives their attacks Advantage", () => {
  const hero = vesna()
  const used = useBonusAction({ characters: [hero, ogre()], actorId: "vesna", feature: "sorcerer-innate-sorcery", roll: fours })
  const on = find(used.characters, "vesna")
  assert.ok(innateSorceryOn(on))
  assert.equal(usesLeft(on, "sorcerer-innate-sorcery"), 1)
  // DC 14 becomes 15 for a Sorcerer spell. Fire Bolt's attack has Advantage, and Shocking Grasp, from her feat, has none.
  assert.equal(spellcastingFor(on, "burning-hands")?.saveDc, 15)
  assert.deepEqual(spellAttackModes(on, ogre(), spell("fire-bolt")), [{ mode: "advantage", from: "Innate Sorcery" }])
  assert.deepEqual(spellAttackModes(on, ogre(), spell("shocking-grasp")), [])
  // While it lasts it is not offered again. A Long Rest ends it and gives both uses back.
  assert.ok(!bonusActionsOf(on).some((action) => action.id === "sorcerer-innate-sorcery"))
  const rested = longRest(on).character
  assert.ok(!innateSorceryOn(rested))
  assert.equal(usesLeft(rested, "sorcerer-innate-sorcery"), 2)
})

test("Font of Magic: points make a slot that lasts to a Long Rest, a slot is turned to points when a Metamagic option needs them, and Sorcerous Restoration gives half the level back", () => {
  const hero = vesna()
  // 5 points. A level 1 slot costs 2, a level 2 slot 3 and a level 3 slot 5, all open at level 5. Slots are counted by level, the first for level 1.
  const menu = bonusActionsOf(hero).filter((action) => action.id.startsWith("font-of-magic"))
  assert.deepEqual(
    menu.map((action) => [action.id, action.left]),
    [
      ["font-of-magic-slot-1", 5],
      ["font-of-magic-slot-2", 5],
      ["font-of-magic-slot-3", 5],
    ]
  )
  const made = find(useBonusAction({ characters: [hero], actorId: "vesna", feature: "font-of-magic-slot-2", roll: fours }).characters, "vesna")
  assert.equal(usesLeft(made, "sorcerer-font-of-magic"), 2)
  assert.deepEqual(slotsLeft(made).slice(0, 3), [4, 4, 2])
  // With 2 points left a level 3 slot is not offered.
  assert.ok(!bonusActionsOf(made).some((action) => action.id === "font-of-magic-slot-3"))
  // A Short Rest keeps the made slot. Sorcerous Restoration gives back 3 spent, but no more than 5 / 2 = 2: 4 of 5.
  const short = shortRest(made, { roll: fours })
  assert.equal(usesLeft(short.character, "sorcerer-font-of-magic"), 4)
  assert.deepEqual(slotsLeft(short.character).slice(0, 3), [4, 4, 2])
  assert.ok(short.facts.some((fact) => fact.includes("Sorcerous Restoration and regains 2 Sorcery Points")))
  // Once a Long Rest: a second Short Rest gives none.
  assert.equal(usesLeft(shortRest(short.character, { roll: fours }).character, "sorcerer-font-of-magic"), 4)
  // A Long Rest clears the made slot and gives every point back.
  const long = longRest(short.character).character
  assert.deepEqual([slotsLeft(long).slice(0, 3), usesLeft(long, "sorcerer-font-of-magic")], [[4, 3, 2], 5])
  // With every point spent, 2 for Heightened Spell come from the lowest slot that covers them, level 2, never the slot
  // the cast spends: the 2 points it gives are spent at once.
  const dry = { ...hero, featureUses: { "sorcerer-font-of-magic": 5 } }
  const paid = paidPoints(dry, 2, 1)
  assert.deepEqual([paid?.converted, paid?.character.spellSlots, paid?.character.featureUses], [2, [0, 1], { "sorcerer-font-of-magic": 5 }])
})

test("Metamagic rides the cast: Careful spares allies, Heightened gives a foe Disadvantage, Twinned takes one more", () => {
  const hero = vesna()
  // The read offers the options she picked that the engine runs: Quickened is not one.
  assert.deepEqual(choiceRule("metamagic")?.offer(vesna(["quickened-spell", "twinned-spell"])), ["twinned-spell"])
  // Careful Spell on Burning Hands: Branka is left out of it and takes nothing. The Ogre fails and takes 12. 1 point.
  const careful = resolveChosenCast({
    choices: { metamagic: "careful-spell" },
    input: { characters: [hero, ogre(), branka()], casterId: "vesna", spell: spell("burning-hands"), targets: ["ogre", "branka"], d20: () => 5, roll: fours },
    slot: 1,
    resolve: (input) => castSpell(input),
  })
  assert.deepEqual([find(careful.characters, "ogre").hitPoints, find(careful.characters, "branka").hitPoints], [56, 20])
  assert.equal(usesLeft(find(careful.characters, "vesna"), "sorcerer-font-of-magic"), 4)
  // Heightened Spell on Shatter: the Ogre throws 18 and 3 and keeps the 3: 3 + 3 = 6 fails DC 14, and 3d8 is 12. With
  // no Metamagic the 18 makes 21 and halves it to 6. 2 points.
  const heightened = resolveChosenCast({
    choices: { metamagic: "heightened-spell" },
    input: { characters: [hero, ogre()], casterId: "vesna", spell: spell("shatter"), targets: ["ogre"], d20: throws([18, 3]), roll: fours, level: 2 },
    slot: 2,
    resolve: (input) => castSpell(input),
  })
  const after = find(heightened.characters, "ogre")
  assert.deepEqual([after.hitPoints, after.turnEffects], [56, undefined])
  assert.equal(usesLeft(find(heightened.characters, "vesna"), "sorcerer-font-of-magic"), 3)
  const plain = castSpell({ characters: [hero, ogre()], casterId: "vesna", spell: spell("shatter"), targets: ["ogre"], d20: throws([18, 3]), roll: fours, level: 2 })
  assert.equal(find(plain.characters, "ogre").hitPoints, 62)
  // Twinned Spell on Command with a level 1 slot: it takes effect as level 2, which takes two creatures.
  const twinned = resolveChosenCast({
    choices: { metamagic: "twinned-spell" },
    input: { characters: [hero, ogre(), ogre("ogre-2")], casterId: "vesna", spell: spell("command"), targets: ["ogre", "ogre-2"], d20: () => 1, roll: fours, level: 1 },
    slot: 1,
    resolve: (input) => castSpell(input),
  })
  assert.deepEqual(twinned.targets, ["ogre", "ogre-2"])
  assert.equal(
    castSpell({ characters: [hero, ogre(), ogre("ogre-2")], casterId: "vesna", spell: spell("command"), targets: ["ogre", "ogre-2"], d20: () => 1, roll: fours, level: 1 }).targets.length,
    1
  )
})

test("Metamagic that shapes the spell: Distant, Subtle and Transmuted, and Seeking Spell paid only on a miss", () => {
  const hero = vesna(["distant-spell", "seeking-spell"])
  // Distant Spell doubles Fire Bolt's 120 feet, and makes Chill Touch's touch 30 feet.
  assert.deepEqual(shapedCast({ metamagic: "distant-spell" }, { spell: spell("fire-bolt"), level: 0 }).spell.range, { kind: "feet", distance: 240 })
  assert.deepEqual(shapedCast({ metamagic: "distant-spell" }, { spell: spell("chill-touch"), level: 0 }).spell.range, { kind: "feet", distance: 30 })
  // Subtle Spell drops Fireball's components, its bat guano consumed by nothing, so a Mage cannot see it cast to counter it.
  const subtle = shapedCast({ metamagic: "subtle-spell" }, { spell: spell("fireball"), level: 3 }).spell
  const mage = { id: "mage", name: "Mage", type: "npc", statBlock: "mage", hitPoints: 81 } as Castee
  assert.deepEqual([canCounter(mage, hero, spell("fireball")), canCounter(mage, hero, subtle)], [true, false])
  // Transmuted Spell makes Fire Bolt's fire cold.
  const cold = shapedCast({ metamagic: "transmuted-spell" }, { spell: spell("fire-bolt"), level: 0, damageType: "cold" }).spell
  assert.deepEqual(cold.damage?.[0]?.types, ["cold"])
  // Seeking Spell: 2 + 6 = 8 misses Armor Class 11, the d20 is thrown again, 15 hits for 8, and a point is spent. A
  // first throw that hits spends none.
  const seek = (dice: number[]) =>
    resolveChosenCast({
      choices: { seeking: true },
      input: { characters: [hero, ogre()], casterId: "vesna", spell: spell("fire-bolt"), targets: ["ogre"], attackDice: dice, d20: () => 15, roll: fours },
      resolve: (input) => castSpell(input),
    })
  const missed = seek([2])
  assert.deepEqual([find(missed.characters, "ogre").hitPoints, usesLeft(find(missed.characters, "vesna"), "sorcerer-font-of-magic")], [60, 4])
  const hit = seek([15])
  assert.deepEqual([find(hit.characters, "ogre").hitPoints, usesLeft(find(hit.characters, "vesna"), "sorcerer-font-of-magic")], [60, 5])
})

// A d20 that throws the given numbers in turn.
function throws(numbers: number[]): () => number {
  let next = 0
  return () => numbers[next++ % numbers.length]
}
