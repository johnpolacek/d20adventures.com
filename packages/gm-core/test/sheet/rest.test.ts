import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { arcaneRecoveryOf } from "../../src/sheet/classes/wizard"
import type { ConditionEntry } from "../../src/sheet/condition-entry"
import { exhaustionOf } from "../../src/sheet/conditions"
import { featureRecharge, hitDiceLeft, hitDiceOf, longRest, shortRest } from "../../src/sheet/rest"
import type { Sheet } from "../../src/sheet/sheet"
import { slotsLeft } from "../../src/sheet/spells"
import type { Concentration, Inspiration, SpellEffect } from "../../src/sheet/turn-effect"

// Every expected value below was worked out by hand from the SRD 5.2.1 rest rules and class features, not copied from the function's output.

const sheet = (path: string, level = 1): Sheet => ({
  ...(JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { sheet: Sheet }).sheet,
  level,
})
type Character = {
  id: string
  name: string
  type: string
  sheet?: Sheet
  statBlock?: string
  hitPoints?: number
  dead?: true
  hitDiceUsed?: number
  featureUses?: Record<string, number>
  spellSlots?: number[]
  tempHitPoints?: number
  inspiration?: Inspiration
  concentration?: Concentration
  conditions?: ConditionEntry[]
  spellEffects?: SpellEffect[]
}
// Thalbern, a level 5 Ranger with Constitution 13 (+1): 10 + 1, and 6 + 1 for each of four more levels, is 39. Five d10s.
const thalbern: Character = { id: "thalbern", name: "Thalbern", type: "pc", sheet: sheet("the-midnight-summons/characters/thalbern.json", 5), hitPoints: 39 }
// Branka, a level 5 Fighter at her 54: three Second Winds by the Fighter table, and one Action Surge.
const branka: Character = { id: "branka", name: "Branka", type: "pc", sheet: sheet("welcome-to-kordavos/characters/branka-stoneveil.json", 5), hitPoints: 54 }
// Ilya, a Bard with Charisma 16 (+3): three Bardic Inspirations. Level 1 has 8 hit points, level 5 has 28.
const ilya = (level: number): Character => ({ id: "ilya", name: "Ilya", type: "pc", sheet: sheet("welcome-to-kordavos/characters/ilya-veles.json", level), hitPoints: level === 1 ? 8 : 28 })
// Milos, a level 5 Cleric at his 33: two Channel Divinities.
const milos: Character = { id: "milos", name: "Milos", type: "pc", sheet: sheet("welcome-to-kordavos/characters/milos-radan.json", 5), hitPoints: 33 }
// Lyra, a Wizard with Constitution 10: 6 hit points, and 4 a level after. Level 4 has 18, level 5 has 22.
const lyra = (level: number, spellSlots?: number[]): Character => ({
  id: "lyra",
  name: "Lyra",
  type: "pc",
  sheet: sheet("covert-cargo/characters/1749159962941.json", level),
  hitPoints: 6 + 4 * (level - 1),
  ...(spellSlots ? { spellSlots } : {}),
})
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() as number

test("a hero has as many Hit Point Dice as their level, of the class's die", () => {
  assert.deepEqual(hitDiceOf({ ...thalbern, hitDiceUsed: 2 }), { die: 10, total: 5, left: 3 })
  assert.deepEqual([hitDiceLeft(thalbern), hitDiceLeft({ ...thalbern, hitDiceUsed: 7 }), hitDiceLeft({ statBlock: "bandit" } as Character)], [5, 0, 0])
})

test("a Short Rest spends Hit Point Dice one at a time while the hero is a die's average or more short", () => {
  // At 25 of 39, 14 short of a d10's 5.5: a 6 and +1 make 7, 32. Still 7 short: a 3 and +1 make 4, 36. 3 short: he stops.
  const rested = shortRest({ ...thalbern, hitPoints: 25 }, { roll: falls(6, 3) })
  assert.deepEqual([rested.character.hitPoints, rested.character.hitDiceUsed, hitDiceLeft(rested.character)], [36, 2, 3])
  assert.deepEqual(rested.facts, ["Thalbern spends 2 Hit Point Dice and regains 11 hit points, now 36 of 39."])
  // With the dice spent he has none to spend: the rest gives nothing.
  const spent = shortRest({ ...thalbern, hitPoints: 25, hitDiceUsed: 5 }, { roll: falls() })
  assert.deepEqual([spent.character.hitPoints, spent.facts], [25, ["Thalbern rests for an hour, and nothing spent comes back."]])
})

test("each Hit Point Die heals at least 1, and the dice run out", () => {
  // Constitution 8 (-1): a level 5 Wizard with 6 - 1, and 3 a level after, has 17. At 5, a 1 on a d6 less 1 is 0, so 1.
  const frail: Character = { ...lyra(5), sheet: { ...(lyra(5).sheet as Sheet), abilityScores: { ...(lyra(5).sheet as Sheet).abilityScores, con: 8 } }, hitPoints: 5 }
  const rested = shortRest(frail, { roll: falls(1, 1, 1, 1, 1) })
  // Five dice, 1 each: 10 of 17, still short, and none left.
  assert.deepEqual([rested.character.hitPoints, hitDiceLeft(rested.character)], [10, 0])
  assert.deepEqual(rested.facts, ["Lyra spends 5 Hit Point Dice and regains 5 hit points, now 10 of 17."])
})

test("a Short Rest gives back what each feature's data says it does", () => {
  // Second Wind regains one of its three. Action Surge comes back whole.
  const fighter = shortRest({ ...branka, featureUses: { "fighter-second-wind": 3, "fighter-action-surge": 1 } }, { roll: falls() })
  assert.deepEqual(fighter.character.featureUses, { "fighter-second-wind": 2 })
  assert.deepEqual(fighter.facts, ["Branka regains one use of Second Wind.", "Branka regains one use of Action Surge."])
  // Channel Divinity regains one of its two.
  assert.deepEqual(shortRest({ ...milos, featureUses: { "cleric-channel-divinity": 2 } }, { roll: falls() }).character.featureUses, { "cleric-channel-divinity": 1 })
  // Bardic Inspiration waits for a Long Rest at level 1, and from level 5 Font of Inspiration brings all three back on a Short Rest.
  assert.deepEqual([featureRecharge("bard-bardic-inspiration", 1), featureRecharge("bard-bardic-inspiration", 5)], ["long-rest", "short-or-long-rest"])
  assert.deepEqual(shortRest({ ...ilya(1), featureUses: { "bard-bardic-inspiration": 3 } }, { roll: falls() }).character.featureUses, { "bard-bardic-inspiration": 3 })
  const font = shortRest({ ...ilya(5), featureUses: { "bard-bardic-inspiration": 3 } }, { roll: falls() })
  assert.deepEqual([font.character.featureUses, font.facts], [undefined, ["Ilya regains all expended uses of Bardic Inspiration."]])
  // Favored Enemy's free Hunter's Marks wait for a Long Rest.
  assert.deepEqual(shortRest({ ...thalbern, featureUses: { "ranger-favored-enemy": 2 } }, { roll: falls() }).character.featureUses, { "ranger-favored-enemy": 2 })
})

test("Arcane Recovery takes back the most slot levels it may, once a Long Rest", () => {
  // A level 4 Wizard recovers up to 2 levels: one level 2 slot or two level 1 slots, and the engine takes the higher slot.
  assert.deepEqual(arcaneRecoveryOf(lyra(4, [2, 1])), [0, 1])
  // A level 5 Wizard recovers 3: the level 2 and one level 1.
  assert.deepEqual(arcaneRecoveryOf(lyra(5, [2, 1])), [1, 1])
  // A level 1 Wizard recovers 1: one level 1 slot. With nothing spent there is nothing to recover. A Bard has no Arcane Recovery.
  assert.deepEqual([arcaneRecoveryOf(lyra(1, [2])), arcaneRecoveryOf(lyra(5)), arcaneRecoveryOf({ ...ilya(5), spellSlots: [4] })], [[1], [], []])
  const first = shortRest(lyra(4, [2, 1]), { roll: falls() })
  // Four level 1 and three level 2 slots, with two level 1 spent and the level 2 back.
  assert.deepEqual([first.character.spellSlots, slotsLeft(first.character).slice(0, 2), first.character.featureUses], [[2, 0], [2, 3], { "wizard-arcane-recovery": 1 }])
  assert.deepEqual(first.facts, ["Lyra uses Arcane Recovery and recovers 1 level 2 spell slot."])
  // Used, it waits for a Long Rest: a second Short Rest recovers nothing.
  assert.deepEqual(shortRest(first.character, { roll: falls() }).character.spellSlots, [2, 0])
  const slept = longRest(first.character).character
  assert.deepEqual([slept.spellSlots, slept.featureUses], [undefined, undefined])
})

test("a Short Rest's hour ends the spells that run out in it and a held die, and keeps Temporary Hit Points", () => {
  const before: Character = {
    ...thalbern,
    tempHitPoints: 4,
    inspiration: { die: 6, by: "ilya" },
    concentration: { spell: "hunters-mark" },
    spellEffects: [
      { spell: "bless", by: "milos", turns: 8 },
      { spell: "mage-armor", by: "lyra" },
    ],
  }
  // Bless lasts a minute and Hunter's Mark an hour: both end. Mage Armor's 8 hours go on.
  const after = shortRest(before, { roll: falls() }).character
  assert.deepEqual([after.tempHitPoints, after.inspiration, after.concentration, after.spellEffects], [4, undefined, undefined, [{ spell: "mage-armor", by: "lyra" }]])
})

test("a Long Rest gives back everything, and one level of Exhaustion", () => {
  const worn: Character = {
    ...thalbern,
    hitPoints: 20,
    hitDiceUsed: 3,
    spellSlots: [3, 1],
    featureUses: { "ranger-favored-enemy": 3 },
    tempHitPoints: 5,
    inspiration: { die: 6, by: "ilya" },
    concentration: { spell: "shield-of-faith" },
    conditions: [{ id: "exhaustion", level: 2 }],
    spellEffects: [{ spell: "mage-armor", by: "lyra" }],
  }
  const rested = longRest(worn)
  // Mage Armor's 8 hours are over, and the sleep ends Concentration. Thalbern is Human: Resourceful gives Heroic
  // Inspiration as the rest ends (SRD 5.2.1 p. 86).
  assert.deepEqual(rested.character, { ...thalbern, healthPercent: 100, conditions: [{ id: "exhaustion", level: 1 }], heroicInspiration: true })
  assert.deepEqual([hitDiceLeft(rested.character), slotsLeft(rested.character).slice(0, 2), exhaustionOf(rested.character)], [5, [4, 2], 1])
  assert.deepEqual(rested.facts, [
    "Thalbern finishes a Long Rest: 39 of 39 hit points, every Hit Point Die, spell slot and feature use back.",
    "Thalbern's Exhaustion falls to level 1.",
    "Thalbern gains Heroic Inspiration by Resourceful.",
  ])
  // A last level of Exhaustion ends the condition.
  const fresh = longRest({ ...thalbern, conditions: [{ id: "exhaustion", level: 1 }] })
  assert.deepEqual([fresh.character.conditions, fresh.facts[1]], [undefined, "Thalbern is no longer Exhausted."])
  // Heroic Inspiration already held is kept, never doubled, and told no more.
  const held = longRest({ ...thalbern, heroicInspiration: true })
  assert.deepEqual([held.character.heroicInspiration, held.facts.length], [true, 1])
})

test("a rest needs at least 1 hit point to start, and the dead are not restored", () => {
  const down: Character = { ...thalbern, hitPoints: 0, hitDiceUsed: 1, featureUses: { "ranger-favored-enemy": 1 } }
  for (const rested of [shortRest(down, { roll: falls(10) }), longRest(down)]) {
    assert.deepEqual(rested, { character: down, facts: ["Thalbern is at 0 hit points and cannot start a rest, so gains nothing from it."] })
  }
  const dead: Character = { ...thalbern, hitPoints: 0, dead: true }
  assert.deepEqual(longRest(dead), { character: dead, facts: ["Thalbern is dead, and a rest restores nothing."] })
})

test("an NPC's day's casts come back on a Long Rest and not a Short one", () => {
  // A Priest Acolyte has 11 hit points (2d8 + 2) and Divine Aid once a day.
  const acolyte: Character = { id: "acolyte", name: "Acolyte", type: "npc", statBlock: "priest-acolyte", hitPoints: 4, featureUses: { "Divine Aid": 1 } }
  const short = shortRest(acolyte, { roll: falls() })
  assert.deepEqual([short.character.featureUses, short.character.hitPoints], [{ "Divine Aid": 1 }, 4])
  const long = longRest(acolyte)
  assert.deepEqual([long.character.featureUses, long.character.hitPoints, long.facts], [undefined, 11, ["Acolyte finishes a Long Rest: 11 of 11 hit points, every daily use back."]])
})
