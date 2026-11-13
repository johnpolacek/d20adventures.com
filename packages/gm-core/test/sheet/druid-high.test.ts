import assert from "node:assert/strict"
import { test } from "node:test"
import { spellById } from "@d20/srd/spells"
import { defensesOf, strike } from "../../src/sheet/attack"
import { atInitiative, classCovers } from "../../src/sheet/class-rules"
import { druid } from "../../src/sheet/classes/druid"
import { naturesSanctuary } from "../../src/sheet/classes/druid-land"
import { formBarsCasting } from "../../src/sheet/classes/wild-shape"
import { immuneTo } from "../../src/sheet/conditions"
import { autoCreate, type CreationPick, createSheet } from "../../src/sheet/create"
import { sheetProblems } from "../../src/sheet/derive"
import { usesLeft } from "../../src/sheet/feature-rules"
import { useBonusAction } from "../../src/sheet/features"
import { raisedTo } from "../../src/sheet/milestone"
import { longRest, shortRest } from "../../src/sheet/rest"
import type { Sheet } from "../../src/sheet/sheet"
import { speedOf } from "../../src/sheet/space"
import { castCost, castSpell, slotsLeft, spellcastingOf, withCastSpent } from "../../src/sheet/spells"
import type { Character } from "../../src/types/character"

// Every expected value below was worked out by hand from the SRD 5.2.1 text, not copied from the function's output.
// Briar is a human Druid of the Circle of the Land made by the creator with the Sage background and raised by the
// choices that need no player: a Warden, of the arid land (Fire), with Potent Spellcasting for Elemental Fury.
// Strength 8 (-1). Wisdom 19 (+4) from level 4, 20 (+5) from 8. Proficiency Bonus +3 at 5 to 8, +5 at 13 to 16, +6
// from 17. Her Wild Shape uses are 2, 3 from 6, and 4 from 17. Every die falls as 4 unless named.

const pick = { class: "druid", species: "human", background: "sage" } as unknown as CreationPick
const made = (): Sheet => {
  const result = createSheet(pick, autoCreate(pick))
  if ("problems" in result) assert.fail(result.problems.join("; "))
  return result.sheet
}
type Hero = Character & { id: string; sheet: Sheet; featureUses?: Record<string, number>; spellSlots?: number[]; shape?: { form: string; hours: number } }
const at = (level: number, x = 0, id = "briar", name = "Briar"): Hero => ({ ...raisedTo({ id, name, type: "pc", sheet: made(), controlledBy: "ai" } as Hero, level), position: { x, y: 0 } })
const choosing = (hero: Hero, fury: string): Hero => ({ ...hero, sheet: { ...hero.sheet, featureChoices: { ...hero.sheet.featureChoices, "druid-elemental-fury": fury } } })
const shaped = (hero: Hero, form: string): Hero => ({ ...hero, shape: { form, hours: 1 } })
const npc = (id: string, statBlock: string, hitPoints: number, x = 5): Character =>
  ({ id, name: id.charAt(0).toUpperCase() + id.slice(1), type: "npc", statBlock, hitPoints, position: { x, y: 0 } }) as Character
const fours = () => 4
const find = (characters: readonly Character[], id: string) => characters.find((character) => character.id === id) as Hero
const spell = (id: string) => spellById.get(id) ?? assert.fail(id)

test("Known forms: eight at level 8, of Challenge Rating 1 and one may fly, and a Fly Speed moves over the flat floor", () => {
  const eight = at(8).sheet
  assert.equal(eight.featurePicks?.["druid-wild-shape"]?.length, 8)
  // A Giant Bat flies: it may be known at 8, not at 7. A Brown Bear, Challenge Rating 1, is known at 8 by the raise.
  const bat = (sheet: Sheet): Sheet => ({ ...sheet, featurePicks: { "druid-wild-shape": [...(sheet.featurePicks?.["druid-wild-shape"] ?? []).slice(0, -1), { option: "giant-bat" }] } })
  assert.deepEqual(sheetProblems(bat(eight)), [])
  assert.ok(sheetProblems(bat(at(7).sheet)).length > 0)
  assert.ok(eight.featurePicks?.["druid-wild-shape"]?.some((entry) => entry.option === "brown-bear"))
  // The Giant Bat walks 10 and flies 60: it moves 60. A Crocodile walks 20 and swims 30, and there is no water: 20.
  assert.deepEqual([speedOf(shaped(at(8), "giant-bat")), speedOf(shaped(at(8), "crocodile"))], [60, 20])
})

test("Potent Spellcasting: Wisdom on a Druid cantrip's hit, and 300 feet more on one that reaches 10 feet or more from 15", () => {
  // Starry Wisp at level 7: 2d8 from level 5, 4 + 4, and Wisdom's 4: 12 Radiant to the Ogre.
  const cast = castSpell({ characters: [at(7), npc("ogre", "ogre", 68)], casterId: "briar", spell: spell("starry-wisp"), targets: ["ogre"], d20: () => 15, roll: fours })
  assert.equal(find(cast.characters, "ogre").hitPoints, 68 - 12)
  // Starry Wisp 60 + 300, Spare the Dying 60 at 15 (doubled at 5 and 11) + 300. Not by touch, and not before 15.
  const fifteen = at(15)
  assert.deepEqual(
    [
      druid.spellRange?.(fifteen, spell("starry-wisp")),
      druid.spellRange?.(fifteen, spell("spare-the-dying")),
      druid.spellRange?.(fifteen, spell("guidance")),
      druid.spellRange?.(at(14), spell("starry-wisp")),
    ],
    [360, 360, undefined, undefined]
  )
  // A Druid who took Primal Strike adds nothing to the cantrip: 8.
  const plain = castSpell({ characters: [choosing(at(7), "primal-strike"), npc("ogre", "ogre", 68)], casterId: "briar", spell: spell("starry-wisp"), targets: ["ogre"], d20: () => 15, roll: fours })
  assert.equal(find(plain.characters, "ogre").hitPoints, 68 - 8)
})

test("Primal Strike: 1d8 more on a weapon or a Beast form's hit once on the Druid's own turn, 2d8 from 15", () => {
  const ogre = npc("ogre", "ogre", 68)
  const hit = (briar: Hero, weapon: string, turnOf: string) => strike({ attacker: briar, target: ogre, weapon, dice: [18], turnOf, roll: fours })
  // A Quarterstaff, 1d6 - 1 = 3, and the d8's 4: 7. At 15, 2d8: 3 + 8 = 11.
  const staff = hit(choosing(at(7), "primal-strike"), "quarterstaff", "briar")
  assert.deepEqual([staff.taken, staff.used], [7, ["primal-strike"]])
  assert.equal(hit(choosing(at(15), "primal-strike"), "quarterstaff", "briar").taken, 11)
  // An Unarmed Strike is no weapon, so nothing rides it.
  assert.deepEqual(hit(choosing(at(7), "primal-strike"), "unarmed-strike", "briar").features, undefined)
  // A Wolf's Bite, 1d6 + 2 = 6, and the d8's 4: 10. Thunder harms an Ogre as much as any, and goes first.
  const bite = hit(shaped(choosing(at(7), "primal-strike"), "wolf"), "bite", "briar")
  assert.deepEqual([bite.taken, bite.features, bite.damage?.parts.map((part) => part.type)], [10, ["Primal Strike"], ["piercing", "thunder"]])
  // Not on another's turn, and not for a Druid with Potent Spellcasting.
  assert.equal(hit(shaped(choosing(at(7), "primal-strike"), "wolf"), "bite", "ogre").taken, 6)
  assert.equal(hit(shaped(at(7), "wolf"), "bite", "briar").taken, 6)
})

test("Beast Spells: from 18 a form casts, but not a spell whose Material component has a cost or is consumed", () => {
  const seventeen = shaped(at(17), "wolf")
  const eighteen = shaped(at(18), "wolf")
  assert.ok(formBarsCasting(seventeen))
  assert.ok("problem" in castCost(seventeen, "starry-wisp"))
  assert.equal(formBarsCasting(eighteen), undefined)
  assert.equal(formBarsCasting(eighteen, spell("cure-wounds")), undefined)
  const cantrip = castCost(eighteen, "starry-wisp")
  assert.ok(!("problem" in cantrip) && cantrip.cost.kind === "cantrip")
  // Revivify consumes its 300 GP diamond. Augury's 25 GP tokens are priced and kept.
  assert.match(formBarsCasting(eighteen, spell("revivify")) ?? "", /is consumed/)
  assert.match(formBarsCasting(eighteen, spell("augury")) ?? "", /has a cost/)
})

test("Archdruid: a use of Wild Shape back on Initiative with none left, and once a Long Rest uses become a slot of 2 levels each", () => {
  const twenty = at(20)
  // Four uses at 20. All spent: one back. One left: none.
  assert.equal(usesLeft(atInitiative({ ...twenty, featureUses: { "druid-wild-shape": 4 } }, fours), "druid-wild-shape"), 1)
  assert.equal(usesLeft(atInitiative({ ...twenty, featureUses: { "druid-wild-shape": 3 } }, fours), "druid-wild-shape"), 1)
  // Every slot spent, four uses left: a level 8 slot, and no use left. Two left: a level 4 slot.
  const table = spellcastingOf(twenty)?.slots ?? []
  const empty = { ...twenty, spellSlots: [...table] }
  const four = druid.roundStart?.(empty).character as Hero
  assert.deepEqual([slotsLeft(four)[7], usesLeft(four, "druid-wild-shape"), usesLeft(four, "druid-archdruid")], [1, 0, 0])
  const two = druid.roundStart?.({ ...empty, featureUses: { "druid-wild-shape": 2 } }).character as Hero
  assert.deepEqual(
    slotsLeft(two).map((left) => left),
    [0, 0, 0, 1, 0, 0, 0, 0, 0]
  )
  // Once a Long Rest: the next round, with no slot again, Wild Resurgence's level 1 slot comes instead, for the last use.
  const again = druid.roundStart?.({ ...two, spellSlots: table.map((count, index) => (index === 3 ? count + 1 : count)), featureUses: { ...two.featureUses, "druid-wild-shape": 3 } }).character as Hero
  assert.deepEqual([slotsLeft(again)[0], usesLeft(again, "druid-wild-shape")], [1, 0])
  // A Long Rest clears the slot made.
  assert.equal(slotsLeft(longRest(four).character as Hero)[7], table[7])
})

test("Natural Recovery: a land spell once with no slot, and slots of half the Druid level back on a Short Rest, once each a Long Rest", () => {
  const six = at(6)
  // Arid at 6: Burning Hands (1), Blur (2) and Fireball (3). Her Sage's Magic Initiate already casts Burning Hands once
  // with no slot, so it keeps that. Blur first costs no slot, then the next costs one. Named at a level 3 slot, Blur
  // spends the slot.
  const free = castCost(six, "blur")
  assert.ok(!("problem" in free) && free.cost.kind === "free" && free.cost.feature === "circle-of-the-land-natural-recovery")
  const upcast = castCost(six, "blur", false, 3)
  assert.ok(!("problem" in upcast) && upcast.cost.kind === "slot" && upcast.cost.level === 3)
  const spent = withCastSpent(six, free.cost)
  const then = castCost(spent, "fireball")
  assert.ok(!("problem" in then) && then.cost.kind === "slot" && then.cost.level === 3)
  // A cantrip and a spell not of the land are cast as ever.
  const cure = castCost(six, "cure-wounds")
  assert.ok(!("problem" in cure) && cure.cost.kind === "slot")
  // Two level 1, a level 2 and a level 3 slot spent. Half of 6 is 3 levels: the level 3 slot comes back, and the next
  // Short Rest brings none.
  const tired = { ...six, spellSlots: [2, 1, 1] }
  const rested = shortRest(tired, { roll: fours }).character as Hero
  assert.deepEqual(rested.spellSlots, [2, 1, 0])
  assert.deepEqual((shortRest(rested, { roll: fours }).character as Hero).spellSlots, [2, 1, 0])
  // Level 7: 4 levels, a level 3 and a level 1.
  assert.deepEqual((shortRest({ ...at(7), spellSlots: [2, 1, 1] }, { roll: fours }).character as Hero).spellSlots, [1, 1, 0])
})

test("Nature's Ward: immune to the Poisoned condition from 10, and the land's Resistance kept in a Beast form", () => {
  assert.deepEqual([immuneTo(at(10), "poisoned"), immuneTo(at(9), "poisoned")], [true, false])
  // A Wolf resists nothing, and the arid land's Fire stays hers.
  assert.ok(defensesOf(shaped(at(10), "wolf")).resistances?.includes("fire"))
  assert.ok(!defensesOf(shaped(at(9), "wolf")).resistances?.includes("fire"))
})

test("Nature's Sanctuary: a 15-foot Cube for a use of Wild Shape, Half Cover and the Ward's Resistance for allies in it, moved by a Bonus Action", () => {
  const briar = at(14, 0)
  const ally = at(1, 5, "mira", "Mira")
  const ogre = npc("ogre", "ogre", 68, 20)
  const raised = naturesSanctuary({ characters: [briar, ally, ogre] as never[], druidId: "briar", targets: [] })
  assert.equal(raised.problem, undefined)
  const [druidAfter, mira, ogreAfter] = ["briar", "mira", "ogre"].map((id) => find(raised.characters as Character[], id))
  // One of three uses spent, the Cube kept on her for 10 rounds at her feet.
  assert.equal(usesLeft(druidAfter, "druid-wild-shape"), 2)
  // Briar at its centre and Mira 5 feet off are within its 7.5 feet: Half Cover. The Ogre 20 feet off is not, nor a foe.
  const present = [druidAfter, mira, ogreAfter]
  assert.deepEqual(
    present.map((one) => classCovers(one, present)),
    [["half"], ["half"], []]
  )
  assert.ok(defensesOf(mira).resistances?.includes("fire"))
  // Moved 20 feet to stand around the Ogre: Mira leaves it and loses its Resistance and cover.
  const moved = useBonusAction({ characters: present as never[], actorId: "briar", feature: "natures-sanctuary-move", target: "ogre", roll: fours })
  const miraOut = find(moved.characters as Character[], "mira")
  assert.ok(moved.use)
  assert.ok(!defensesOf(miraOut).resistances?.includes("fire"))
  assert.deepEqual(classCovers(miraOut, moved.characters as never[]), [])
  // Out of its 120 feet it is not raised, and nothing is spent.
  const far = naturesSanctuary({ characters: [briar, { ...ally, position: { x: 130, y: 0 } }] as never[], druidId: "briar", targets: ["mira"] })
  assert.ok(far.problem)
  // It ends as the round turns once she is Incapacitated.
  const stunned = { ...druidAfter, conditions: [{ id: "stunned" as const }] }
  assert.ok(!(druid.roundStart?.(stunned).character as Hero).spellEffects?.some((effect) => effect.spell === "natures-sanctuary"))
})
