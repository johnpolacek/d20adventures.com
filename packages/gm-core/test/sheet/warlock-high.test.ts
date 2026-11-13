import assert from "node:assert/strict"
import { test } from "node:test"
import { attackAfter, followingRoll, type InScene } from "../../src/sheet/attack-roll"
import { afterClassAttackRoll, failedRollDieOf, resolveChosenCast } from "../../src/sheet/class-rules"
import { autoCreate, type CreationPick, createSheet } from "../../src/sheet/create"
import { deriveSheet } from "../../src/sheet/derive"
import { raisedTo } from "../../src/sheet/milestone"
import { attackWithReactions } from "../../src/sheet/reactions"
import { longRest, magicalCunningOf, shortRest } from "../../src/sheet/rest"
import { withRescueSpent } from "../../src/sheet/save-rules"
import type { Sheet } from "../../src/sheet/sheet"
import { type Castee, castCost, castSpell, rollSave, slotsLeft, spellById, spellsOf, withCastSpent } from "../../src/sheet/spells"
import type { Character } from "../../src/types/character"
import type { RequiredRoll } from "../../src/validations/roll-requirement-schema"

// Every expected value below was worked out by hand from the SRD 5.2.1 text, not copied from the function's output.
// Vex is a human Fiend Warlock made by the creator and raised by the choices that need no player. Her Charisma is 17
// (+3) at 6, 19 (+4) at 8 to 11 and 20 (+5) from 12. Her Proficiency Bonus is +3 at 6, +4 at 9 to 12, +5 at 13 to 16
// and +6 from 17, so her spell save DC at 14 is 8 + 5 + 5 = 18. Strength 8 (-1), Dexterity 16 (+3), Constitution 15
// (+2) to 15. She is not proficient in Dexterity saves. Her Hit Point Die is a d8. An Ogre (a Giant) is Armor Class 11,
// 68 hit points, Charisma save -2. A Hell Hound (a Fiend) is Armor Class 15, 58 hit points, Charisma save -2. A Bandit
// is Armor Class 12, 11 hit points. Every die falls as 4 unless it says otherwise.

const pick = { class: "warlock", species: "human", background: "criminal" } as unknown as CreationPick
const made = (): Sheet => {
  const result = createSheet(pick, autoCreate(pick))
  if ("problems" in result) assert.fail(result.problems.join("; "))
  return result.sheet
}
type Hero = Character & { id: string; sheet: Sheet }
const at = (level: number, extra: Partial<Hero> = {}): Hero => ({ ...raisedTo({ id: "vex", name: "Vex", type: "pc", sheet: made(), controlledBy: "ai" } as Hero, level), ...extra }) as Hero
// Vex at a level with the invocations named in place of the creator's picks.
const invoking = (level: number, picks: { option: string; cantrip?: string }[], extra: Partial<Hero> = {}): Hero => {
  const vex = at(level, extra)
  return { ...vex, sheet: { ...vex.sheet, featurePicks: { ...vex.sheet.featurePicks, "warlock-eldritch-invocations": picks } } } as Hero
}
const npc = (id: string, statBlock: string, hitPoints: number, position?: { x: number; y: number }): Character =>
  ({ id, name: id.charAt(0).toUpperCase() + id.slice(1), type: "npc", statBlock, hitPoints, ...(position ? { position } : {}) }) as Character
const fours = () => 4
const find = (characters: readonly Character[], id: string) => characters.find((character) => character.id === id) as Character & Record<string, unknown>
const spell = (id: string) => spellById.get(id) ?? assert.fail(`no ${id}`)
const HURL = "fiend-patron-hurl-through-hell"
const LUCK = "fiend-patron-dark-ones-own-luck"
const conditionsOf = (character: Character) => ((character as { conditions?: { id: string }[] }).conditions ?? []).map((entry) => entry.id)

test("Pact Magic's slots, Eldritch Blast's beams, Fiendish Resilience, Contact Patron and Eldritch Master, from shared code", () => {
  // The Warlock table: two slots of level 5 at 9, three at 11, four at 17.
  assert.deepEqual(
    [slotsLeft(at(9)), slotsLeft(at(11)), slotsLeft(at(17))],
    [
      [0, 0, 0, 0, 2],
      [0, 0, 0, 0, 3],
      [0, 0, 0, 0, 4],
    ]
  )
  // Eldritch Blast: three beams at 11 and four at 17.
  const beams = (level: number) =>
    castSpell({ characters: [at(level), npc("ogre", "ogre", 68)], casterId: "vex", spell: spell("eldritch-blast"), targets: ["ogre"], d20: () => 15, roll: fours }).rays?.length
  assert.deepEqual([beams(11), beams(17)], [3, 4])
  // Fiendish Resilience: the kept damage type, other than Force, is resisted.
  const tough = at(10)
  assert.deepEqual(deriveSheet({ ...tough.sheet, featureChoices: { "fiend-patron-fiendish-resilience": "fire" } }).resistances, ["fire"])
  // Contact Patron: Contact Other Plane prepared, cast once a Long Rest with no slot.
  const nine = at(9)
  const contact = spellsOf(nine).find((entry) => entry.spell.id === "contact-other-plane")
  assert.deepEqual([contact?.prepared, contact?.free], [true, 1])
  assert.deepEqual(castCost(nine, "contact-other-plane"), { cost: { kind: "free", feature: "warlock-contact-patron" }, known: contact })
  // Magical Cunning with all four slots spent: half of four, 2, at 19, and all of them with Eldritch Master at 20.
  assert.deepEqual(
    [magicalCunningOf(at(19, { spellSlots: [0, 0, 0, 0, 4] })), magicalCunningOf(at(20, { spellSlots: [0, 0, 0, 0, 4] }))],
    [
      [0, 0, 0, 0, 2],
      [0, 0, 0, 0, 4],
    ]
  )
})

test("Mystic Arcanum: each spell picked is cast once a Long Rest with no slot, at its own level", () => {
  // At 17 the creator's picks fill levels 6, 7, 8 and 9. Finger of Death is cast with no slot, and the slots stay full.
  const vex = at(17)
  assert.deepEqual(
    vex.sheet.featurePicks?.["warlock-mystic-arcanum"]?.map((entry) => spell(entry.option).level),
    [6, 7, 8, 9]
  )
  const known = spellsOf(vex).find((entry) => entry.spell.id === "finger-of-death")
  assert.deepEqual([known?.prepared, known?.free], [false, 1])
  const paid = castCost(vex, "finger-of-death")
  assert.ok(!("problem" in paid))
  assert.deepEqual(paid.cost, { kind: "free", feature: "warlock-mystic-arcanum:finger-of-death" })
  const spent = withCastSpent(vex, paid.cost)
  assert.deepEqual(slotsLeft(spent), [0, 0, 0, 0, 4])
  // Once cast it is not cast again before a Long Rest, not even with a Pact slot, and a Short Rest does not bring it back.
  assert.ok("problem" in castCost(spent, "finger-of-death"))
  assert.ok("problem" in castCost(shortRest(spent, { roll: fours }).character, "finger-of-death"))
  assert.ok(!("problem" in castCost(longRest(spent).character, "finger-of-death")))
})

test("Dark One's Own Luck adds a d10 to a failed check or save it could turn, as many times a Long Rest as the Charisma modifier", () => {
  // At 6 Vex has Charisma +3, three uses. The read's own failed check or save takes the d10; an attack roll does not.
  const vex = at(6)
  const die = failedRollDieOf(vex, "check")
  assert.deepEqual([die?.die, failedRollDieOf(vex, "save")?.die, failedRollDieOf(vex, "attack")], [10, 10, undefined])
  assert.equal(die?.spend(vex, false).featureUses?.[LUCK], 1)
  assert.equal(failedRollDieOf(at(6, { featureUses: { [LUCK]: 3 } }), "check"), undefined)
  // A held Bardic Inspiration die is rolled first: one die a roll.
  assert.equal(failedRollDieOf({ ...vex, inspiration: { die: 8, by: "lyra" } }, "check")?.die, 8)
  // A Dexterity save the engine rolls against harm: 5 + 3 = 8 against DC 15, short by 7. The d10 falls 7: 15, a
  // success. A 6 makes 14, still a failure. Against DC 20, short by 12, the d10 cannot turn it and is not rolled. A save
  // that puts nothing at stake is not answered.
  const save = (dc: number, d10: number, stakes?: { damage: number }) =>
    rollSave({ target: vex as unknown as Castee, ability: "dex", dc, d20: () => 5, roll: () => d10, characters: [vex as unknown as Castee], ...(stakes ? { stakes } : {}) })
  const lucky = save(15, 7, { damage: 10 })
  assert.deepEqual([lucky.total, lucky.success, lucky.rescued?.feature], [15, true, LUCK])
  assert.deepEqual([save(15, 6, { damage: 10 }).total, save(15, 6, { damage: 10 }).success], [14, false])
  assert.deepEqual([save(20, 7, { damage: 10 }).rescued, save(15, 7).rescued], [undefined, undefined])
  assert.equal(lucky.rescued && withRescueSpent(vex, lucky.rescued).featureUses?.[LUCK], 1)
})

test("Hurl Through Hell: a Charisma save on a hit, 8d10 Psychic and Incapacitated on a failure, once a turn, then by a Pact slot", () => {
  // At 14 Vex's Sickle is Strength -1 and proficiency +5, +4, 1d4 - 1. A 15 makes 19 and hits the Ogre's 11: 3
  // Slashing. The Ogre saves 4 - 2 = 2 against DC 18 and fails: 8d10 is 32 Psychic, and it is Incapacitated. 68 - 35 =
  // 33. The use is spent.
  const vex = at(14)
  const swing = (characters: Character[], target: string) =>
    attackWithReactions({ characters, attackerId: "vex", targetId: target, weapon: "sickle", dice: [15], roll: fours, choices: { [HURL]: "hurl" }, ask: () => false })
  const first = swing([vex, npc("ogre", "ogre", 68)], "ogre")
  assert.deepEqual([first.target.hitPoints, conditionsOf(first.target), find(first.characters, "vex").featureUses], [33, ["incapacitated"], { [HURL]: 1 }])
  assert.equal(first.blow.riders?.[0]?.save?.total, 2)
  // Once a turn: a second hit this turn deals its 3 and no more.
  assert.equal(swing(first.characters, "ogre").target.hitPoints, 30)
  // A Hell Hound is a Fiend: 15 + 4 = 19 hits its 15 for 3, it fails the save and is Incapacitated, and takes no Psychic.
  const fiend = swing([vex, npc("hound", "hell-hound", 58)], "hound")
  assert.deepEqual([fiend.target.hitPoints, conditionsOf(fiend.target)], [55, ["incapacitated"]])
  // With the use spent, on a later turn, a Pact slot restores it: one of the three level 5 slots is spent, and the use
  // stays spent.
  const again = swing([at(14, { featureUses: { [HURL]: 1 } }), npc("ogre", "ogre", 68)], "ogre")
  const paid = afterClassAttackRoll(find(again.characters, "vex") as Hero, again.target)
  assert.deepEqual([again.target.hitPoints, slotsLeft(paid), paid.featureUses?.[HURL]], [33, [0, 0, 0, 0, 2], 1])
  // With neither, it is not offered and does nothing.
  const none = swing([at(14, { featureUses: { [HURL]: 1 }, spellSlots: [0, 0, 0, 0, 3] }), npc("ogre", "ogre", 68)], "ogre")
  assert.deepEqual([none.target.hitPoints, conditionsOf(none.target)], [65, []])
})

test("Hurl Through Hell with a spell attack: the first creature Eldritch Blast hits", () => {
  // Three beams at 14, each 15 + 10 against Armor Class 11, each 1d10 + 5 by Agonizing Blast: 9, 27 Force. Then the
  // save, 15 - 2 = 13 against 18, fails: 32 Psychic. 68 - 27 - 32 = 9. The use is spent and a beam's slot is none.
  const vex = at(14)
  const input = { characters: [vex, npc("ogre", "ogre", 68)], casterId: "vex", spell: spell("eldritch-blast"), targets: ["ogre"], attackDice: [15], d20: () => 15, roll: fours }
  const cast = resolveChosenCast({ choices: { "hurl-through-hell-cast": true }, input, resolve: (given) => castSpell(given) })
  assert.deepEqual([find(cast.characters, "ogre").hitPoints, conditionsOf(find(cast.characters, "ogre")), find(cast.characters, "vex").featureUses], [9, ["incapacitated"], { [HURL]: 1 }])
  assert.ok(cast.facts.some((fact) => fact.startsWith("Vex hurls Ogre through the Lower Planes")))
  // Beams that all miss, each a natural 1, hurl no one.
  const missed = resolveChosenCast({ choices: { "hurl-through-hell-cast": true }, input: { ...input, attackDice: [1], d20: () => 1 }, resolve: (given) => castSpell(given) })
  assert.equal(find(missed.characters, "vex").featureUses, undefined)
})

test("Lifedrinker and Devouring Blade with the pact weapon", () => {
  // At 12 the Sickle is the pact weapon: Charisma +5 for Strength -1, +4 proficiency: +9, 1d4 + 5. A 15 hits the Ogre:
  // 4 + 5 = 9 Slashing, and Lifedrinker's 1d6 is 4 Necrotic: 13, 68 - 13 = 55. Vex at 40 of 87 is missing more than
  // a d8's average, so a Hit Point Die is spent: 4 + 2 = 6, now 46.
  const blade = [{ option: "pact-of-the-blade" }, { option: "thirsting-blade" }, { option: "devouring-blade" }, { option: "lifedrinker" }]
  const vex = invoking(12, blade, { hitPoints: 40 })
  const struck = attackWithReactions({ characters: [vex, npc("ogre", "ogre", 68)], attackerId: "vex", targetId: "ogre", weapon: "sickle", dice: [15], roll: fours, ask: () => false })
  assert.deepEqual([struck.blow.taken, struck.target.hitPoints, find(struck.characters, "vex").hitPoints, find(struck.characters, "vex").hitDiceUsed], [13, 55, 46, 1])
  // Once a turn: the next hit is 9.
  const next = attackWithReactions({ characters: struck.characters, attackerId: "vex", targetId: "ogre", weapon: "sickle", dice: [15], roll: fours, ask: () => false })
  assert.equal(next.blow.taken, 9)
  // At full hit points no Hit Point Die is spent.
  const whole = attackWithReactions({ characters: [invoking(12, blade), npc("ogre", "ogre", 68)], attackerId: "vex", targetId: "ogre", weapon: "sickle", dice: [15], roll: fours, ask: () => false })
  assert.equal(find(whole.characters, "vex").hitDiceUsed, undefined)
  // Devouring Blade: the Attack action with the pact weapon makes three attacks, Thirsting Blade's and two more.
  const scene = { ...vex, position: { x: 0, y: 0 } } as unknown as InScene
  const ogre = npc("ogre", "ogre", 68, { x: 5, y: 0 }) as unknown as InScene
  const floor = { solids: [], doors: [] }
  assert.deepEqual(attackAfter(scene), { "thirsting-blade": true, "devouring-blade": true })
  const swung = (after: RequiredRoll["after"]): RequiredRoll => ({ attack: { weapon: "sickle", target: "ogre" }, rollType: "sickle", difficulty: 11, modifier: 9, mode: "normal", after })
  const second = followingRoll({ character: scene, made: swung(attackAfter(scene)), present: [scene, ogre], floor })
  assert.deepEqual(second && "attack" in second ? [second.attack.weapon, second.after] : undefined, ["sickle", { "devouring-blade": true, struck: ["ogre"] }])
  const third = second && followingRoll({ character: scene, made: second, present: [scene, ogre], floor })
  assert.deepEqual(third && "attack" in third ? [third.attack.weapon, third.after] : undefined, ["sickle", { struck: ["ogre"] }])
  assert.equal(third && followingRoll({ character: scene, made: third, present: [scene, ogre], floor }), undefined)
})
