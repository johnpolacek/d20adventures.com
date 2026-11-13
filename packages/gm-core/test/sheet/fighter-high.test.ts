import assert from "node:assert/strict"
import { test } from "node:test"
import { afterRoll, attackModesFromActions } from "../../src/sheet/actions"
import { attackAfter, type InScene } from "../../src/sheet/attack-roll"
import { choiceRule } from "../../src/sheet/class-rules"
import { heroicRally } from "../../src/sheet/classes/fighter"
import { autoCreate, type CreationPick, createSheet } from "../../src/sheet/create"
import { atRoundStart, deathSave } from "../../src/sheet/death"
import { deriveSheet, sheetProblems } from "../../src/sheet/derive"
import { criticalFrom, featureUseCount } from "../../src/sheet/feature-rules"
import { raisedTo } from "../../src/sheet/milestone"
import { attackWithReactions } from "../../src/sheet/reactions"
import type { Sheet } from "../../src/sheet/sheet"
import type { Character } from "../../src/types/character"
import type { RequiredRoll } from "../../src/validations/roll-requirement-schema"

// Every expected value below was worked out by hand from the SRD 5.2.1 text (pp. 47 to 49), not copied from the
// functions' output. The Fighter is a human Soldier made by the creator and raised by the choices that need no player,
// which take the Champion at 3. At level 18 that hero has Constitution 17 (+3) and 166 hit points: 10 + 3 at level 1,
// then 6 + 3 for each of 17 levels.

const made = (): Sheet => {
  const pick = { class: "fighter", species: "human", background: "soldier" } as unknown as CreationPick
  const result = createSheet(pick, autoCreate(pick))
  if ("problems" in result) assert.fail(result.problems.join("; "))
  return result.sheet
}
type Hero = InScene & { type: string; sheet: Sheet; hitPoints: number; deathSaves?: { successes: number; failures: number } }
const fighter = (level: number, id = "fighter"): Hero => {
  const raised = raisedTo({ id, name: "Branka", type: "pc", sheet: made(), controlledBy: "ai" as const }, level)
  assert.equal(raised.sheet.level, level)
  return { ...raised, hitPoints: deriveSheet(raised.sheet).hitPointMaximum } as Hero
}
const ogre = (): Hero => ({ id: "ogre", name: "Ogre", type: "npc", statBlock: "ogre", hitPoints: 68, position: { x: 5, y: 0 } }) as unknown as Hero
const swing = (weapon: string, choices?: Record<string, string>): RequiredRoll =>
  ({ attack: { weapon, target: "ogre", ...(choices ? { choices } : {}) }, rollType: "Attack", difficulty: 11, modifier: 0, mode: "normal" }) as RequiredRoll

test("the tables: three attacks at 11 and four at 20, Action Surge twice from 17, Indomitable by level, Superior Critical", () => {
  // Two Extra Attacks: the Attack action is three attack rolls, so two follow the first. Three Extra Attacks at 20:
  // four, so three follow, and seven with Action Surge's second action.
  assert.equal(attackAfter(fighter(11), { actions: 1 }).attacks, 2)
  assert.equal(attackAfter(fighter(20), { actions: 1 }).attacks, 3)
  assert.equal(attackAfter(fighter(20), { actions: 2 }).attacks, 7)
  // Action Surge: once a Short Rest, twice from 17. Indomitable: once, twice from 13, three times from 17.
  assert.deepEqual(
    [16, 17].map((level) => featureUseCount(fighter(level).sheet, "fighter-action-surge")),
    [1, 2]
  )
  assert.deepEqual(
    [9, 12, 13, 17].map((level) => featureUseCount(fighter(level).sheet, "fighter-indomitable")),
    [1, 1, 2, 3]
  )
  // Improved Critical's 19 from 3, Superior Critical's 18 from 15.
  assert.deepEqual(
    [14, 15].map((level) => criticalFrom(fighter(level))),
    [19, 18]
  )
})

test("Additional Fighting Style: a second Fighting Style feat at 7, kept and checked", () => {
  const sheet = fighter(7).sheet
  assert.ok(sheet.featureChoices?.["champion-additional-fighting-style"])
  assert.notEqual(sheet.featureChoices?.["champion-additional-fighting-style"], sheet.featureChoices?.["fighter-fighting-style"])
  assert.deepEqual(sheetProblems(sheet), [])
})

test("Tactical Master: Push, Sap or Slow in place of a mastered weapon's own, for the attack", () => {
  const tactical = choiceRule("tactical") ?? assert.fail()
  assert.equal(tactical.offer(fighter(8) as unknown as Character), undefined)
  assert.deepEqual(tactical.offer(fighter(9) as unknown as Character), ["push", "sap", "slow"])
  const hero = { ...fighter(9), position: { x: 0, y: 0 } }
  // The greatsword's own mastery is Graze, which the engine does not run: a hit that deals damage leaves nothing.
  assert.ok(hero.sheet.weaponMasteries?.includes("greatsword"))
  assert.deepEqual(afterRoll([hero, ogre()], hero.id, swing("greatsword"), 9)[1].turnEffects, undefined)
  // Sap: the Ogre has Disadvantage on its next attack roll, before the start of the Fighter's next turn.
  const sapped = afterRoll([hero, ogre()], hero.id, swing("greatsword", { tactical: "sap" }), 9)
  assert.deepEqual(sapped[1].turnEffects, [{ id: "sapped", by: hero.id, turns: 2 }])
  assert.deepEqual(attackModesFromActions(sapped[1], sapped[0], sapped), [{ mode: "disadvantage", from: "Sap" }])
  // Its attack roll spends it.
  const swung = afterRoll(sapped, "ogre", { ...swing("greatclub"), attack: { weapon: "greatclub", target: hero.id } } as RequiredRoll)
  assert.equal(swung[1].turnEffects, undefined)
  // Push: the Large Ogre goes 10 feet straight away, from 5 feet to 15.
  assert.deepEqual(afterRoll([hero, ogre()], hero.id, swing("greatsword", { tactical: "push" }), 9)[1].position, { x: 15, y: 0 })
  // Slow, as the mastery: 10 feet off the Ogre's Speed.
  assert.deepEqual(afterRoll([hero, ogre()], hero.id, swing("greatsword", { tactical: "slow" }), 9)[1].turnEffects, [{ id: "slowed", by: hero.id, turns: 2 }])
  // Not with a weapon whose mastery the Fighter cannot use, and not before level 9.
  assert.equal(afterRoll([hero, ogre()], hero.id, swing("longsword", { tactical: "sap" }), 9)[1].turnEffects, undefined)
  const eight = { ...fighter(8), position: { x: 0, y: 0 } }
  assert.equal(afterRoll([eight, ogre()], eight.id, swing("greatsword", { tactical: "sap" }), 9)[1].turnEffects, undefined)
})

test("Studied Attacks: a miss gives the next attack roll against that creature Advantage, and that roll spends it", () => {
  const hero = fighter(13)
  const ally = { ...fighter(13, "ally"), name: "Thalbern" }
  const ask = () => false
  // A 1 misses the Ogre's Armor Class 11.
  const missed = attackWithReactions({ characters: [hero, ally, ogre()], attackerId: hero.id, targetId: "ogre", weapon: "greatsword", dice: [1], roll: () => 1, ask })
  assert.equal(missed.blow.roll.hit, false)
  const marked = missed.characters[2]
  assert.deepEqual(marked.turnEffects, [{ id: "studied", by: hero.id, turns: 2 }])
  assert.deepEqual(attackModesFromActions(missed.characters[0], marked, missed.characters), [{ mode: "advantage", from: "Studied Attacks" }])
  // Only the Fighter's own attack has it.
  assert.deepEqual(attackModesFromActions(missed.characters[1], marked, missed.characters), [])
  // A 20 hits, and spends it.
  const hit = attackWithReactions({ characters: missed.characters, attackerId: hero.id, targetId: "ogre", weapon: "greatsword", dice: [20], roll: () => 1, ask })
  assert.equal(hit.blow.roll.hit, true)
  assert.equal(hit.characters[2].turnEffects, undefined)
  // A level 12 Fighter's miss leaves nothing.
  const twelve = fighter(12)
  assert.equal(attackWithReactions({ characters: [twelve, ogre()], attackerId: twelve.id, targetId: "ogre", weapon: "greatsword", dice: [1], roll: () => 1, ask }).characters[1].turnEffects, undefined)
})

test("Survivor: Defy Death's Advantage and 18 to 20, and Heroic Rally while Bloodied", () => {
  const down = { ...fighter(18), hitPoints: 0, deathSaves: { successes: 0, failures: 0 } }
  const asked = (atRoundStart(down) as { rollRequired?: RequiredRoll }).rollRequired
  assert.deepEqual(asked && [asked.mode, "reasons" in asked ? asked.reasons : undefined], ["advantage", ["Defy Death"]])
  // An 18 counts as a 20: back to 1 hit point. At 17, before Survivor, an 18 is one success.
  const rose = deathSave(down, 18)
  assert.deepEqual([rose.fate, rose.character.hitPoints], ["revived", 1])
  const before = deathSave({ ...fighter(17), hitPoints: 0, deathSaves: { successes: 0, failures: 0 } }, 18)
  assert.deepEqual([before.fate, before.saves], [undefined, { successes: 1, failures: 0 }])
  // Heroic Rally: 5 + 3. Bloodied is 83 of 166 or fewer.
  assert.equal(heroicRally({ ...fighter(18), hitPoints: 83 }).character.hitPoints, 91)
  assert.equal(heroicRally({ ...fighter(18), hitPoints: 1 }).character.hitPoints, 9)
  assert.equal(heroicRally({ ...fighter(18), hitPoints: 84 }).character.hitPoints, 84)
  assert.equal(heroicRally({ ...fighter(18), hitPoints: 0 }).character.hitPoints, 0)
  assert.equal(heroicRally({ ...fighter(17), hitPoints: 50 }).character.hitPoints, 50)
})
