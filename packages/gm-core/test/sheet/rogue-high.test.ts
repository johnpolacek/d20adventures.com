import assert from "node:assert/strict"
import { test } from "node:test"
import { afterRoll } from "../../src/sheet/actions"
import { attacksOf } from "../../src/sheet/attack"
import { attackRequirement, type InScene } from "../../src/sheet/attack-roll"
import { resolveCheck } from "../../src/sheet/check"
import { choiceRule, hitRule, type RoundTurn, rescuedCheck } from "../../src/sheet/class-rules"
import { cunningPicked, cunningStrikeDc, cunningStrikesOf, rogue } from "../../src/sheet/classes/rogue"
import { autoCreate, type CreationPick, createSheet } from "../../src/sheet/create"
import { withDamage } from "../../src/sheet/death"
import { deriveSheet, sheetProblems } from "../../src/sheet/derive"
import { withChargesSpent } from "../../src/sheet/item-spend"
import { attunementLimitOf } from "../../src/sheet/items"
import { raisedTo } from "../../src/sheet/milestone"
import type { Sheet } from "../../src/sheet/sheet"
import { type Castee, rollSave } from "../../src/sheet/spells"
import type { Character } from "../../src/types/character"
import type { RequiredRoll } from "../../src/validations/roll-requirement-schema"

// Every expected value below was worked out by hand from the SRD 5.2.1 text (pp. 62 to 64), not copied from the
// functions' output. The Rogue is a halfling Criminal made by the creator and raised by the choices that need no
// player, which take the Thief at 3. From level 8 on they have Dexterity 20 (+5): 15 from the array, 2 from the
// background, 2 at level 4 and 1 at level 8. Wisdom stays 10 (+0) and Strength 12 (+1), and Speed is 30. The Rogue
// table gives Sneak Attack 5d6 at 9, 6d6 at 11, 7d6 at 13 and 14, 9d6 at 17 and 18. The Proficiency Bonus is +4 at 9,
// +5 at 13 and +6 at 17. The Cunning Strike save DC at 14 is 8 + 5 + 5 = 18. The Ogre is Large, with a Constitution
// save of +3, a Dexterity save of -1 and 68 hit points.

const made = (): Sheet => {
  const pick = { class: "rogue", species: "halfling", background: "criminal" } as unknown as CreationPick
  const result = createSheet(pick, autoCreate(pick))
  if ("problems" in result) assert.fail(result.problems.join("; "))
  return result.sheet
}
type Hero = InScene & { type: string; sheet: Sheet; hitPoints: number; featureUses?: Record<string, number> }
const rogueOf = (level: number, extra: Partial<Hero> = {}): Hero => {
  const raised = raisedTo({ id: "poppen", name: "Poppen", type: "pc", sheet: made(), controlledBy: "ai" as const }, level)
  assert.equal(raised.sheet.level, level)
  return { ...raised, hitPoints: deriveSheet(raised.sheet).hitPointMaximum, position: { x: 0, y: 0 }, ...extra } as Hero
}
const ogre = (extra: Record<string, unknown> = {}): Hero => ({ id: "ogre", name: "Ogre", type: "npc", statBlock: "ogre", hitPoints: 68, position: { x: 5, y: 0 }, ...extra }) as unknown as Hero
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() ?? 1
// The Hide action's Invisible, which no spell gave, and the mark of a Sneak Attack dealt on the Rogue's own turn.
const hidden = { conditions: [{ id: "invisible" as const }] }
const sneaked = { turnEffects: [{ id: "sneak-attack", by: "poppen", turns: 1 as const }] }
const shot = (choices: Record<string, string>, cover?: string): RequiredRoll =>
  ({ attack: { weapon: "shortbow", target: "ogre", ...(cover ? { cover } : {}), choices }, rollType: "Shortbow", difficulty: 9, modifier: 10, mode: "advantage" }) as RequiredRoll

test("the sheet at high level: legal, Slippery Mind's saves at 15, and the Cunning Strike DC", () => {
  for (const level of [9, 11, 13, 14, 15, 18, 20]) assert.deepEqual(sheetProblems(rogueOf(level).sheet), [], `level ${level}`)
  const saves = (level: number) => Object.entries(deriveSheet(rogueOf(level).sheet).savingThrows).flatMap(([id, save]) => (save.proficient ? [id] : []))
  assert.deepEqual(saves(14), ["dex", "int"])
  assert.deepEqual(saves(15), ["dex", "int", "wis", "cha"])
  assert.equal(cunningStrikeDc(rogueOf(14).sheet), 18)
})

test("Cunning Strike's menu by level: Withdraw at 5, Stealth Attack while hidden at 9, Obscure and Knock Out at 14, a second at 11", () => {
  const offered = (hero: Hero) => [choiceRule("cunning")?.offer(hero as unknown as Character), choiceRule("cunning2")?.offer(hero as unknown as Character)]
  assert.deepEqual(offered(rogueOf(5)), [["trip", "withdraw"], undefined])
  assert.deepEqual(offered(rogueOf(9)), [["trip", "withdraw"], undefined])
  assert.deepEqual(offered(rogueOf(9, hidden)), [["trip", "withdraw", "stealth-attack"], undefined])
  // Invisible from a spell is not the Hide action's.
  assert.deepEqual(cunningStrikesOf(rogueOf(9, { conditions: [{ id: "invisible", spell: "invisibility" }] })), ["trip", "withdraw"])
  assert.deepEqual(offered(rogueOf(11)), [
    ["trip", "withdraw"],
    ["trip", "withdraw"],
  ])
  assert.deepEqual(offered(rogueOf(14)), [
    ["trip", "withdraw", "obscure", "knock-out"],
    ["trip", "withdraw", "obscure", "knock-out"],
  ])
})

test("each effect forgoes its dice, and two need Improved Cunning Strike and the dice to pay for both", () => {
  const sneak = rogue.hits?.find((rule) => rule.id === "sneak-attack") ?? assert.fail()
  const dice = (hero: Hero, choices: Record<string, string>) =>
    sneak.damage?.({
      attacker: hero,
      attack: attacksOf(hero).find((attack) => attack.id === "shortbow") ?? assert.fail(),
      weapon: { attackType: "ranged", properties: [], damage: { type: "piercing" } },
      roll: { mode: "advantage" } as never,
      allyBeside: false,
      hurt: false,
      turnOf: "poppen",
      choices,
    })?.damage
  // Level 14, 7d6: Knock Out costs 6, so 1d6 is left. Trip (1) and Obscure (3) leave 3d6.
  assert.deepEqual(dice(rogueOf(14), { cunning: "knock-out" }), { dice: "1d6", type: "piercing" })
  assert.deepEqual(dice(rogueOf(14), { cunning: "trip", cunning2: "obscure" }), { dice: "3d6", type: "piercing" })
  // Knock Out and Obscure cost 9, more than 7: the second is not taken.
  assert.deepEqual(cunningPicked(rogueOf(14), { cunning: "knock-out", cunning2: "obscure" }), ["knock-out"])
  // The same effect twice is one.
  assert.deepEqual(cunningPicked(rogueOf(14), { cunning: "trip", cunning2: "trip" }), ["trip"])
  // Level 11, 6d6: Trip and Withdraw leave 4d6. At 10 there is no second: Trip alone leaves 4d6 of 5d6.
  assert.deepEqual(dice(rogueOf(11), { cunning: "trip", cunning2: "withdraw" }), { dice: "4d6", type: "piercing" })
  assert.deepEqual(dice(rogueOf(10), { cunning: "trip", cunning2: "withdraw" }), { dice: "4d6", type: "piercing" })
  // Obscure is not a level 13 Rogue's: nothing is forgone for it.
  assert.deepEqual(dice(rogueOf(13), { cunning: "obscure" }), { dice: "7d6", type: "piercing" })
})

test("Knock Out: a failed Constitution save is Unconscious for a minute, ended by any damage or the repeated save", () => {
  const hero = rogueOf(14)
  const after = hitRule("cunning-strike")?.after ?? assert.fail()
  const attack = attacksOf(hero)[0] ?? assert.fail()
  // A 5 and +3 is 8 against DC 18: Unconscious for ten of the Ogre's turns, kept by the feature that gave it.
  const struck = after({ attacker: hero, target: ogre(), added: ["Sneak Attack"], choices: { cunning: "knock-out" }, roll: falls(5), attack }) ?? assert.fail()
  assert.deepEqual(struck.target.conditions, [{ id: "unconscious", source: "poppen", turns: 10, feature: "rogue-devious-strikes" }])
  assert.deepEqual([struck.rider.effect, struck.rider.took, struck.rider.save?.total], ["knock-out", true, 8])
  // An Ogre that has already acted this round keeps it through one more turn.
  const late = after({ attacker: hero, target: ogre({ isComplete: true }), added: ["Sneak Attack"], choices: { cunning: "knock-out" }, roll: falls(5), attack })
  assert.equal(late?.target.conditions?.[0]?.turns, 11)
  // A 15 and +3 is 18: it stays awake.
  const missed = after({ attacker: hero, target: ogre(), added: ["Sneak Attack"], choices: { cunning: "knock-out" }, roll: falls(15), attack })
  assert.deepEqual([missed?.rider.took, missed?.target.conditions], [false, undefined])
  // No Sneak Attack, no effect.
  assert.equal(after({ attacker: hero, target: ogre(), added: [], choices: { cunning: "knock-out" }, roll: falls(5), attack }), undefined)
  // One point of damage wakes it: 67 hit points, and no condition.
  const hurt = withDamage(struck.target, 1).character
  assert.deepEqual([hurt.hitPoints, hurt.conditions], [67, undefined])
  // The repeated save as the round turns: a 14 and +3 is 17, still asleep. A 15 makes 18, and it wakes.
  const turn = (d20: number): RoundTurn => ({ everyone: [hero, struck.target as Hero], d20: () => d20, roll: () => 1 })
  const asleep = rogue.roundStart?.(struck.target as Hero, turn(14)) ?? assert.fail()
  assert.deepEqual([asleep.character.conditions?.length, asleep.told?.text], [1, "Ogre repeats the Constitution save against Knock Out (17 against DC 18) and fails: they stay Unconscious."])
  const woken = rogue.roundStart?.(struck.target as Hero, turn(15)) ?? assert.fail()
  assert.deepEqual([woken.character.conditions, woken.told?.text], [undefined, "Ogre repeats the Constitution save against Knock Out (18 against DC 18) and succeeds: they wake."])
})

test("Obscure and Trip: a Dexterity save or Blinded to the end of the next turn, or Prone", () => {
  const hero = rogueOf(14)
  const attack = attacksOf(hero)[0] ?? assert.fail()
  const second = hitRule("cunning-strike-2")?.after ?? assert.fail()
  // The second effect falls by its own rule. A 10 and -1 is 9 against 18: Blinded for the Ogre's next turn.
  const blinded = second({ attacker: hero, target: ogre(), added: ["Sneak Attack"], choices: { cunning: "trip", cunning2: "obscure" }, roll: falls(10), attack })
  assert.deepEqual(blinded?.target.conditions, [{ id: "blinded", source: "poppen", turns: 1 }])
  // Trip, the first: the Large Ogre fails on a 10 and falls Prone.
  const first = hitRule("cunning-strike")?.after ?? assert.fail()
  const tripped = first({ attacker: hero, target: ogre(), added: ["Sneak Attack"], choices: { cunning: "trip", cunning2: "obscure" }, roll: falls(10), attack })
  assert.deepEqual(tripped?.target.conditions, [{ id: "prone", turns: 1 }])
})

test("Withdraw moves the Rogue half their Speed straight back, and Stealth Attack keeps them hidden behind Three-Quarters Cover", () => {
  // From 5 feet west of the Ogre, 15 feet farther west.
  const back = afterRoll([rogueOf(5, sneaked), ogre()], "poppen", shot({ cunning: "withdraw" }), 12)
  assert.deepEqual(back[0].position, { x: -15, y: 0 })
  // A miss deals nothing, and moves no one. Without the Sneak Attack dealt, nor does a hit.
  assert.deepEqual(afterRoll([rogueOf(5, sneaked), ogre()], "poppen", shot({ cunning: "withdraw" }), 0)[0].position, { x: 0, y: 0 })
  assert.deepEqual(afterRoll([rogueOf(5), ogre()], "poppen", shot({ cunning: "withdraw" }), 12)[0].position, { x: 0, y: 0 })
  // Stealth Attack from behind Three-Quarters Cover: still Invisible. From behind Half Cover, seen.
  const unseen = afterRoll([rogueOf(9, { ...hidden, ...sneaked }), ogre()], "poppen", shot({ cunning: "stealth-attack" }, "three-quarters"), 12)
  assert.deepEqual(unseen[0].conditions, [{ id: "invisible" }])
  const seen = afterRoll([rogueOf(9, { ...hidden, ...sneaked }), ogre()], "poppen", shot({ cunning: "stealth-attack" }, "half"), 12)
  assert.equal(seen[0].conditions, undefined)
})

test("Elusive: no Advantage against the Rogue at 18 while they are not Incapacitated", () => {
  const club = attacksOf(ogre())[0] ?? assert.fail()
  const mode = (hero: Hero) => {
    const asked = attackRequirement({ character: ogre(), target: hero, attack: club, present: [ogre(), hero] })
    return "roll" in asked ? [asked.roll.mode, asked.roll.reasons] : assert.fail()
  }
  // Prone, and the Ogre within 5 feet: Advantage at 17, none at 18, and the read's own Advantage is dropped too.
  const prone = { conditions: [{ id: "prone" as const }] }
  assert.deepEqual(mode(rogueOf(17, prone)), ["advantage", ["Poppen Prone"]])
  assert.deepEqual(mode(rogueOf(18, prone)), ["normal", ["Elusive"]])
  const read = attackRequirement({ character: ogre(), target: rogueOf(18), attack: club, present: [ogre(), rogueOf(18)], mode: "advantage", reason: "flanked" })
  assert.equal("roll" in read && read.roll.mode, "normal")
  // Stunned is Incapacitated: Elusive does not hold.
  assert.equal(mode(rogueOf(18, { conditions: [{ id: "stunned" }] }))[0], "advantage")
})

test("Stroke of Luck: a failed save against harm or a staked check turned into a 20, once a Short Rest", () => {
  // A Wisdom save at level 20: +6 by Slippery Mind. A 5 is 11 against DC 20, turned to 20 + 6 = 26.
  const hero = rogueOf(20) as unknown as Castee
  const save = (character: Castee) => rollSave({ target: character, ability: "wis", dc: 20, d20: () => 5, roll: () => 1, characters: [character], stakes: { damage: 10 } })
  const lucky = save(hero)
  assert.deepEqual([lucky.natural, lucky.total, lucky.success, lucky.rescued], [20, 26, true, { feature: "rogue-stroke-of-luck", name: "Stroke of Luck", first: 11 }])
  // Spent, it waits for a rest. At 19 there is none.
  assert.equal(save({ ...hero, featureUses: { "rogue-stroke-of-luck": 1 } } as Castee).success, false)
  assert.equal(save(rogueOf(19) as unknown as Castee).success, false)
  // Against DC 27, a 20 and +6 still fail: it is kept.
  assert.equal(rollSave({ target: hero, ability: "wis", dc: 27, d20: () => 5, roll: () => 1, characters: [hero], stakes: { damage: 10 } }).rescued, undefined)
  // The read's Athletics check, +7, a 3 against 15: turned to 27, and the use spent, where failing costs something.
  const check = { kind: "skill" as const, skill: "athletics" as const }
  const failed = resolveCheck({ dice: [3], bonus: 7, dc: 15 })
  const turned = rescuedCheck({ character: rogueOf(20), check, result: failed, roll: () => 1, staked: true }) ?? assert.fail()
  assert.deepEqual([turned.result.natural, turned.result.total, turned.result.success], [20, 27, true])
  assert.deepEqual(turned.after?.({ featureUses: {} }), { featureUses: { "rogue-stroke-of-luck": 1 } })
  assert.equal(rescuedCheck({ character: rogueOf(20), check, result: failed, roll: () => 1, staked: false }), undefined)
})

test("Use Magic Device: four attuned at 13, and a 6 on the d6 keeps an item's charges", () => {
  assert.equal(attunementLimitOf(rogueOf(12).sheet), 3)
  assert.equal(attunementLimitOf(rogueOf(13).sheet), 4)
  const sheet = { ...rogueOf(13).sheet, items: [{ id: "wand-of-magic-missiles" }] }
  assert.deepEqual(
    withChargesSpent(sheet, 0, 2, () => 6),
    { sheet, facts: ["Use Magic Device's d6 rolls 6: no charge is spent."] }
  )
  assert.equal(withChargesSpent(sheet, 0, 2, () => 5).sheet.items?.[0]?.spent, 2)
  // A level 12 Rogue rolls no d6.
  const twelve = { ...rogueOf(12).sheet, items: [{ id: "wand-of-magic-missiles" }] }
  assert.equal(withChargesSpent(twelve, 0, 2, () => 6).sheet.items?.[0]?.spent, 2)
})
