import assert from "node:assert/strict"
import { test } from "node:test"
import { choiceRule, classConcentrationModes, resolveChosenCast, shapedCast } from "../../src/sheet/class-rules"
import { dragonWingsOut, empoweredRoll, innateSorceryOn } from "../../src/sheet/classes/sorcerer"
import { autoCreate, type CreationPick, createSheet } from "../../src/sheet/create"
import { deriveSheet, sheetProblems } from "../../src/sheet/derive"
import { usesLeft } from "../../src/sheet/feature-rules"
import { bonusActionsOf, useBonusAction } from "../../src/sheet/features"
import { raisedTo } from "../../src/sheet/milestone"
import { longRest } from "../../src/sheet/rest"
import type { Sheet } from "../../src/sheet/sheet"
import { speedOf } from "../../src/sheet/space"
import { type Castee, castSpell, spellById } from "../../src/sheet/spells"
import type { Character } from "../../src/types/character"

// Every expected value below was worked out by hand from the SRD 5.2.1 text, not copied from the function's output.
// Vesna is a human Draconic Sorcerer made by the creator and raised by the choices that need no player. Charisma +3 at
// 6 and 7, +4 at 14, +5 at 20. Proficiency Bonus +3 at 6 and 7, +5 at 14, +6 at 20. Sorcery Points by the table: 6 at 6,
// 7 at 7, 14 at 14, 20 at 20. Her spell attack bonus at 6 is +6, and her save DC at 7 is 8 + 3 + 3 = 14. An Ogre has
// Armor Class 11, 68 hit points and Dexterity save -1. A Guard is a Humanoid with Wisdom save +0 and 11 hit points.
// Every damage die falls as 4 unless named.

const pick = { class: "sorcerer", species: "human", background: "sage" } as unknown as CreationPick
const made = (): Sheet => {
  const result = createSheet(pick, autoCreate(pick))
  if ("problems" in result) assert.fail(result.problems.join("; "))
  return result.sheet
}
type Hero = Character & Castee & { id: string; sheet: Sheet; featureUses?: Record<string, number>; spellSlots?: number[] }
const vesna = (level: number, metamagic?: string[], affinity?: string): Hero => {
  const raised = raisedTo({ id: "vesna", name: "Vesna", type: "pc", sheet: made(), controlledBy: "ai" } as unknown as Hero, level)
  const sheet = {
    ...raised.sheet,
    ...(metamagic ? { featurePicks: { ...raised.sheet.featurePicks, "sorcerer-metamagic": metamagic.map((option) => ({ option })) } } : {}),
    ...(affinity ? { featureChoices: { ...raised.sheet.featureChoices, "draconic-sorcery-elemental-affinity": affinity } } : {}),
  }
  return { ...raised, hitPoints: 80, sheet }
}
// Innate Sorcery on, as its Bonus Action leaves it.
const innate = (hero: Hero): Hero => ({ ...hero, spellEffects: [{ spell: "innate-sorcery", by: hero.id, turns: 10 }] })
const ogre = (): Castee => ({ id: "ogre", name: "Ogre", type: "npc", statBlock: "ogre", hitPoints: 68 }) as Castee
const guard = (id = "guard"): Castee => ({ id, name: id === "guard" ? "Guard" : "Second Guard", type: "npc", statBlock: "guard", hitPoints: 11 }) as Castee
const fours = () => 4
const find = (characters: readonly Castee[], id: string) => characters.find((character) => character.id === id) as Hero
const spell = (id: string) => spellById.get(id) ?? assert.fail(id)
const points = (hero: Hero) => usesLeft(hero, "sorcerer-font-of-magic")
// A die that throws the given numbers in turn.
const throws = (numbers: number[]) => {
  let next = 0
  return () => numbers[next++ % numbers.length]
}

test("A level 20 Sorcerer raised with no player is legal and has every feature of levels 6 to 20", () => {
  const sheet = vesna(20).sheet
  assert.deepEqual(sheetProblems(sheet), [])
  const features = deriveSheet(sheet).classFeatures
  for (const id of ["draconic-sorcery-elemental-affinity", "sorcerer-sorcery-incarnate", "draconic-sorcery-dragon-wings", "draconic-sorcery-dragon-companion", "sorcerer-arcane-apotheosis"])
    assert.ok(features.includes(id), id)
  assert.equal(sheet.featurePicks?.["sorcerer-metamagic"]?.length, 6)
})

test("Elemental Affinity adds the Charisma modifier to one damage roll of a spell of the chosen type", () => {
  // Fire Bolt at 6 is 2d10: 4 + 4 = 8, and with Fire chosen 8 + 3 = 11. The Ogre is left 57. With Cold chosen, 8: 60.
  const bolt = (affinity: string) =>
    castSpell({ characters: [vesna(6, undefined, affinity), ogre()], casterId: "vesna", spell: spell("fire-bolt"), targets: ["ogre"], attackDice: [15], d20: () => 15, roll: fours })
  assert.equal(find(bolt("fire").characters, "ogre").hitPoints, 57)
  assert.ok(bolt("fire").facts.includes("Elemental Affinity adds 3 to the fire damage."))
  assert.equal(find(bolt("cold").characters, "ogre").hitPoints, 60)
  // Scorching Ray's three rays each hit for 2d6, 8: one roll of the spell takes the 3. 68 − (8 + 3 + 8 + 8) = 41.
  const rays = castSpell({ characters: [vesna(6, undefined, "fire"), ogre()], casterId: "vesna", spell: spell("scorching-ray"), targets: ["ogre"], d20: () => 15, roll: fours, level: 2 })
  assert.equal(find(rays.characters, "ogre").hitPoints, 41)
  // Burning Hands: the Ogre's 5 − 1 = 4 fails DC 14, and 3d6 is 12 + 3 = 15. 68 − 15 = 53.
  const burnt = castSpell({ characters: [vesna(6, undefined, "fire"), ogre()], casterId: "vesna", spell: spell("burning-hands"), targets: ["ogre"], d20: () => 5, roll: fours })
  assert.equal(find(burnt.characters, "ogre").hitPoints, 53)
})

test("Empowered Spell rerolls the lowest damage dice below average, up to the Charisma modifier, and is paid only when it does", () => {
  // The plain rule by itself: 2d10 of 1 and 6 with a count of 1 reroll the 1, which falls 9: 15.
  const one = empoweredRoll({ parts: [{ type: "fire", dice: [1, 6], sides: 10, bonus: 0, total: 7 }], total: 7 }, 1, () => 9)
  assert.deepEqual([one?.from, one?.rolled.total], [[1], 15])
  assert.equal(
    empoweredRoll({ parts: [{ type: "fire", dice: [4, 6], sides: 6, bonus: 0, total: 10 }], total: 10 }, 3, () => 1),
    undefined
  )
  // Fireball's 8d6 fall 1, 2, 3, 1, 2, 3, 5, 6. Charisma +5 rerolls the five furthest below 3.5: the two 1s, the two 2s
  // and the first 3, each now 6. 6 × 5 + 3 + 5 + 6 = 44. The Ogre fails on a 1 and is left 68 − 44 = 24, and 1 of 20 points is spent.
  const hero = vesna(20, ["empowered-spell", "twinned-spell"], "cold")
  assert.equal(choiceRule("empowered")?.offer(hero), true)
  const dice = [1, 2, 3, 1, 2, 3, 5, 6, 6, 6, 6, 6, 6]
  const cast = (roll: () => number) =>
    resolveChosenCast({
      choices: { empowered: true },
      input: { characters: [hero, ogre()], casterId: "vesna", spell: spell("fireball"), targets: ["ogre"], d20: () => 1, roll, level: 3 },
      slot: 3,
      resolve: (input) => castSpell(input),
    })
  const empowered = cast(throws(dice))
  assert.deepEqual([find(empowered.characters, "ogre").hitPoints, points(find(empowered.characters, "vesna"))], [24, 19])
  assert.equal(find(empowered.characters, "vesna").turnEffects, undefined)
  // With every die a 4 none is below average: 8 × 4 = 32, 68 − 32 = 36, and no point is spent.
  const level = cast(fours)
  assert.deepEqual([find(level.characters, "ogre").hitPoints, points(find(level.characters, "vesna"))], [36, 20])
})

test("Extended Spell doubles a spell's minute and gives Advantage on saves to keep Concentration on it", () => {
  // Hold Person, 1 minute: the Guard's 1 fails DC 14. The 10 rounds of its Paralyzed condition become 20, and so does
  // the mark on Vesna. 1 of 7 points.
  const hero = vesna(7, ["extended-spell", "twinned-spell"])
  const held = resolveChosenCast({
    choices: { metamagic: "extended-spell" },
    input: { characters: [hero, guard()], casterId: "vesna", spell: spell("hold-person"), targets: ["guard"], d20: () => 1, roll: fours, level: 2 },
    slot: 2,
    resolve: (input) => castSpell(input),
  })
  const target = find(held.characters, "guard")
  const caster = find(held.characters, "vesna")
  assert.deepEqual(
    caster.spellEffects?.map((effect) => [effect.spell, effect.choice, effect.turns]),
    [["extended-spell", "hold-person", 20]]
  )
  assert.deepEqual(
    target.conditions?.filter((entry) => entry.id === "paralyzed").map((entry) => entry.turns),
    [20]
  )
  assert.equal(points(caster), 6)
  assert.deepEqual(classConcentrationModes(caster), [{ mode: "advantage", from: "Extended Spell" }])
  assert.ok(held.facts[0].includes("Hold Person lasts 2 minutes"))
  // A new spell that takes Concentration, cast plainly, ends the old one and its mark.
  const again = castSpell({ characters: held.characters, casterId: "vesna", spell: spell("hold-person"), targets: ["guard"], d20: () => 1, roll: fours, level: 2 })
  assert.deepEqual(classConcentrationModes(find(again.characters, "vesna")), [])
  // It fits a spell of 1 minute or more, and not an instantaneous one.
  assert.equal(choiceRule("metamagic")?.cast?.fits(hero, { spell: spell("fly"), level: 3 }, "extended-spell"), true)
  assert.equal(choiceRule("metamagic")?.cast?.fits(hero, { spell: spell("fire-bolt"), level: 0 }, "extended-spell"), false)
})

test("Sorcery Incarnate: Innate Sorcery for 2 points with no use left, and two Metamagic options while it is on", () => {
  const spent = { ...vesna(7, ["twinned-spell", "distant-spell", "heightened-spell"]), featureUses: { "sorcerer-innate-sorcery": 2 } }
  // Not before level 7.
  assert.ok(!bonusActionsOf({ ...vesna(6), featureUses: { "sorcerer-innate-sorcery": 2 } }).some((action) => action.id === "innate-sorcery-incarnate"))
  const used = find(useBonusAction({ characters: [spent], actorId: "vesna", feature: "innate-sorcery-incarnate", roll: fours }).characters, "vesna")
  assert.ok(innateSorceryOn(used))
  assert.equal(points(used), 5)
  // While it is on, a second option is offered. Twinned and Distant on Hold Person: level 3, two creatures, 120 feet.
  assert.equal(choiceRule("secondMetamagic")?.offer(vesna(7, ["twinned-spell", "distant-spell"])), undefined)
  assert.deepEqual(choiceRule("secondMetamagic")?.offer(used), ["twinned-spell", "distant-spell", "heightened-spell"])
  const both = shapedCast({ metamagic: "twinned-spell", secondMetamagic: "distant-spell" }, { spell: spell("hold-person"), level: 2, slot: 2 })
  assert.deepEqual([both.level, both.spell.range.distance], [3, 120])
  // The same option twice counts once: 120 feet, not 240.
  assert.equal(shapedCast({ metamagic: "distant-spell", secondMetamagic: "distant-spell" }, { spell: spell("hold-person"), level: 2 }).spell.range.distance, 120)
  const choices = { metamagic: "twinned-spell", secondMetamagic: "distant-spell" }
  const cast = (hero: Hero) =>
    resolveChosenCast({
      choices,
      input: { characters: [hero, guard(), guard("guard-2")], casterId: "vesna", spell: spell("hold-person"), targets: ["guard", "guard-2"], d20: () => 1, roll: fours, level: 2 },
      slot: 2,
      resolve: (input) => castSpell(input),
    })
  // Both paid: 5 − 2 = 3, and both Guards are held.
  const twice = cast(used)
  assert.deepEqual([twice.targets, points(find(twice.characters, "vesna"))], [["guard", "guard-2"], 3])
  // With 1 point and every slot spent only the second is paid: Twinned is dropped and one Guard is held.
  const poor = { ...used, featureUses: { ...used.featureUses, "sorcerer-font-of-magic": 6 }, spellSlots: [4, 3, 3, 1] }
  const once = cast(poor)
  assert.deepEqual([once.targets, points(find(once.characters, "vesna"))], [["guard"], 0])
})

test("Arcane Apotheosis: while Innate Sorcery is on, one option a turn costs no points", () => {
  // Every point and slot spent. Heightened Spell is still offered, and is free on Hold Person, once this turn.
  const dry = { ...innate(vesna(20, ["heightened-spell", "twinned-spell"])), featureUses: { "sorcerer-font-of-magic": 20 }, spellSlots: [4, 3, 3, 3, 3, 2, 2, 1, 1] }
  assert.deepEqual(choiceRule("metamagic")?.offer(dry), ["heightened-spell", "twinned-spell"])
  const cast = resolveChosenCast({
    choices: { metamagic: "heightened-spell" },
    input: { characters: [dry, guard()], casterId: "vesna", spell: spell("hold-person"), targets: ["guard"], d20: () => 1, roll: fours, level: 2 },
    slot: 2,
    resolve: (input) => castSpell(input),
  })
  const after = find(cast.characters, "vesna")
  assert.ok(cast.facts[0].startsWith("Vesna uses Heightened Spell with no Sorcery Points spent, by Arcane Apotheosis"))
  assert.equal(choiceRule("metamagic")?.offer(after), undefined)
  // Without Innate Sorcery it is not free.
  assert.equal(choiceRule("metamagic")?.offer({ ...dry, spellEffects: [] }), undefined)
})

test("Dragon Wings: a Bonus Action for a Fly Speed of 60, once a Long Rest or for 3 points", () => {
  const hero = vesna(14)
  assert.equal(speedOf(hero), 30)
  const menu = bonusActionsOf(hero).find((action) => action.id === "draconic-sorcery-dragon-wings")
  assert.deepEqual([menu?.uses, menu?.left], [1, 1])
  const winged = find(useBonusAction({ characters: [hero], actorId: "vesna", feature: "draconic-sorcery-dragon-wings", roll: fours }).characters, "vesna")
  assert.ok(dragonWingsOut(winged))
  assert.equal(speedOf(winged), 60)
  // Once they are gone, the use spent: 3 of 14 points spread them again.
  const folded = { ...winged, spellEffects: [] }
  assert.deepEqual(
    bonusActionsOf(folded)
      .filter((action) => action.id.includes("dragon-wings"))
      .map((action) => [action.id, action.left]),
    [
      ["draconic-sorcery-dragon-wings", 0],
      ["dragon-wings-restored", undefined],
    ]
  )
  const again = find(useBonusAction({ characters: [folded], actorId: "vesna", feature: "dragon-wings-restored", roll: fours }).characters, "vesna")
  assert.deepEqual([dragonWingsOut(again), points(again)], [true, 11])
  // A Long Rest ends them.
  const rested = longRest(again).character
  assert.deepEqual([dragonWingsOut(rested), speedOf(rested)], [false, 30])
  // Not before level 14.
  assert.ok(!bonusActionsOf(vesna(13)).some((action) => action.id.includes("dragon-wings")))
})
