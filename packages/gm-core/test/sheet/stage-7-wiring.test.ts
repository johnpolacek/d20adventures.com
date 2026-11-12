import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { strike } from "../../src/sheet/attack"
import type { ConditionEntry } from "../../src/sheet/condition-entry"
import { costWhenCountered, reactionsToCast } from "../../src/sheet/counterspell"
import { atRoundStart } from "../../src/sheet/death"
import { type LevelUpChoices, levelUp, levelUpOptions } from "../../src/sheet/level-up"
import { withMove } from "../../src/sheet/moves"
import { type Ask, canReact } from "../../src/sheet/reactions"
import type { Sheet } from "../../src/sheet/sheet"
import { saveBonusFor, saveModesFor } from "../../src/sheet/spell-effects"
import { roundTurns } from "../../src/sheet/spell-rounds"
import { castCost, castSpell, spellById, spellcastingFor, spellsOf, withCastSpent } from "../../src/sheet/spells"
import { combatStatsOf } from "../../src/sheet/stat-block"
import type { SpellEffect, TurnEffect } from "../../src/sheet/turn-effect"
import { storyNames } from "../../src/story/render"
import { castBeats } from "../../src/story/turn"
import type { RollRequirement } from "../../src/validations/roll-requirement-schema"

// Every expected value below was worked out by hand from the SRD 5.2.1 text, not copied from the function's output.

const sheet = (path: string) => (JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { sheet: Sheet }).sheet
type Character = {
  id: string
  name: string
  type: string
  sheet?: Sheet
  statBlock?: string
  hitPoints?: number
  conditions?: ConditionEntry[]
  spellEffects?: SpellEffect[]
  turnEffects?: TurnEffect[]
  featureUses?: Record<string, number>
  spellSlots?: number[]
  position?: { x: number; y: number }
}
// Lyra, a level 1 Wizard: 6 hit points, spell attack +5, Constitution save +0.
const lyra: Character = { id: "lyra", name: "Lyra", type: "pc", sheet: sheet("covert-cargo/characters/1749159962941.json"), hitPoints: 6 }
// Branka, a level 1 Fighter: Strength 16, Intelligence 10, a Warhammer at +5 for 1d8 + 3, and Savage Attacker.
const branka: Character = { id: "branka", name: "Branka", type: "pc", sheet: sheet("welcome-to-kordavos/characters/branka-stoneveil.json"), hitPoints: 14 }
// A Bandit: Armor Class 12, 11 hit points. A Mage: Protective Magic three times a day, Counterspell's DC 14.
const bandit: Character = { id: "bandit", name: "Bandit", type: "npc", statBlock: "bandit", hitPoints: 11 }
const mage: Character = { id: "mage", name: "Kaeleth", type: "npc", statBlock: "mage", hitPoints: 81 }
const spell = (id: string) => spellById.get(id) as NonNullable<ReturnType<typeof spellById.get>>
const falls =
  (...dice: number[]) =>
  () => {
    if (!dice.length) throw new Error("no die left")
    return dice.shift() as number
  }
const sides =
  (...dice: number[]) =>
  (_: number) => {
    if (!dice.length) throw new Error("no die left")
    return dice.shift() as number
  }

test("Aid's 5 raises the hit point maximum everywhere it is read", () => {
  // Lyra's 6, and Aid at level 2 adds 5.
  assert.equal(combatStatsOf({ ...lyra, spellEffects: [{ spell: "aid", by: "milos", amount: 5 }] })?.hitPointMaximum, 11)
})

test("Slow keeps a creature from reacting, and gives −2 to its Dexterity saves", () => {
  const slowed = { ...bandit, spellEffects: [{ spell: "slow", by: "lyra" }] }
  assert.equal(canReact(bandit), true)
  assert.equal(canReact(slowed), false)
  assert.equal(saveBonusFor(slowed, { kind: "save", ability: "dex" }), -2)
  // Haste gives Advantage on Dexterity saves, and not on a Dexterity check.
  const hasted = { ...branka, spellEffects: [{ spell: "haste", by: "lyra" }] }
  assert.deepEqual(saveModesFor(hasted, { kind: "save", ability: "dex" }), [{ mode: "advantage", from: "Haste" }])
  assert.deepEqual(saveModesFor(hasted, { kind: "ability", ability: "dex" }), [])
})

test("Magic Weapon adds 1 to a Warhammer's damage, and Mirror Image's duplicate takes a hit", () => {
  // A 15 and 5 hits Armor Class 12. Savage Attacker rolls the d8 twice and keeps 4: 4 + 3, and Magic Weapon's 1 is 8.
  const enchanted = { ...branka, spellEffects: [{ spell: "magic-weapon", by: "branka", amount: 1 }] }
  const blow = strike({ attacker: enchanted, target: bandit, weapon: "warhammer", dice: [15], roll: sides(4, 2) })
  assert.deepEqual([blow.taken, blow.hitPoints.after], [8, 3])
  // Three duplicates roll three d6: a 3 is a duplicate hit, and two are left. The Bandit takes nothing.
  const imaged = { ...bandit, spellEffects: [{ spell: "mirror-image", by: "bandit", amount: 3 }] }
  const missed = strike({ attacker: branka, target: imaged, weapon: "warhammer", dice: [15], roll: sides(3, 1, 1) })
  assert.deepEqual([missed.deflected, missed.taken, missed.target.hitPoints, missed.target.spellEffects?.[0]?.amount], [true, 0, 11, 2])
})

test("Beacon of Hope gives a dying hero's Death Saving Throw Advantage", () => {
  const dying = atRoundStart<Character & { rollRequired?: RollRequirement }>({ ...lyra, hitPoints: 0, spellEffects: [{ spell: "beacon-of-hope", by: "milos" }] })
  assert.deepEqual([dying.rollRequired && "deathSave" in dying.rollRequired, dying.rollRequired?.mode], [true, "advantage"])
})

test("Scorching Ray is told as one attack for each ray, each with its own damage", () => {
  // Three rays at +5 against Armor Class 12: 15, 15 and 15 hit, each for 2d6 fire, ones on the dice: 2 each.
  const cast = castSpell({ characters: [lyra, bandit], casterId: "lyra", spell: spell("scorching-ray"), targets: ["bandit"], attackDice: [15], d20: falls(15, 15), roll: () => 1 })
  const beats = castBeats({ step: "roll", character: "lyra" }, lyra, spell("scorching-ray"), cast, storyNames([lyra, bandit]))
  assert.deepEqual(
    beats.map((beat) => (beat.kind === "roll" ? beat.attack?.taken : beat.kind)),
    [2, 2, 2]
  )
})

test("a step out of a Web leaves it", () => {
  const caught = { ...bandit, position: { x: 0, y: 0 }, spellEffects: [{ spell: "web", by: "lyra" }] }
  assert.equal(withMove(caught, { at: { x: 5, y: 0 }, feet: 5, path: [{ x: 5, y: 0 }] }).spellEffects, undefined)
})

test("Shield turns Magic Missile, and Counterspell stops it without spending the slot", () => {
  // Kaeleth lets Counterspell pass and casts Shield: a use of Protective Magic, and the darts do nothing.
  const shieldOnly: Ask = (offer) => offer.id === "shield"
  const answered = reactionsToCast({ characters: [lyra, mage], casterId: "lyra", spell: spell("magic-missile"), targets: ["mage"], ask: shieldOnly, d20: falls(), roll: () => 1 })
  assert.deepEqual([answered.countered, answered.reactions.map((taken) => taken.id), answered.characters[1].featureUses], [false, ["shield"], { "Protective Magic": 1 }])
  const cast = castSpell({ characters: answered.characters, casterId: "lyra", spell: spell("magic-missile"), targets: ["mage"], d20: falls(), roll: () => 1 })
  assert.equal(cast.characters[1].hitPoints, 81)
  // Countered: Lyra's Constitution save of 5 + 0 falls short of 14, and a slot spends nothing.
  const countered = reactionsToCast({ characters: [lyra, mage], casterId: "lyra", spell: spell("magic-missile"), targets: ["mage"], ask: () => true, d20: falls(5), roll: () => 1 })
  assert.deepEqual([countered.countered, costWhenCountered({ kind: "slot", level: 1 })], [true, { kind: "cantrip" }])
})

test("Acid Arrow burns again as the round turns, told about the one it burns", () => {
  // 2d4 at a level 2 slot, ones on the dice: 2 acid damage, 11 to 9.
  const burning = { ...bandit, spellEffects: [{ spell: "acid-arrow", by: "lyra", turns: 1, amount: 2 }] }
  const turned = roundTurns({ characters: [lyra, burning], d20: falls(), roll: () => 1 })
  assert.equal(turned.characters[1].hitPoints, 9)
  assert.deepEqual(
    turned.told.map((fact) => [fact.character, fact.spell]),
    [["bandit", "Acid Arrow"]]
  )
})

test("Magic Initiate (Wizard) on a Fighter: its cantrips, its spell once a Long Rest, cast with Intelligence", () => {
  const four: Character = {
    ...branka,
    sheet: {
      ...(branka.sheet as Sheet),
      level: 4,
      subclass: "champion",
      advancements: [{ level: 4, feat: "magic-initiate", spellList: "wizard", spellAbility: "int", cantrips: ["fire-bolt", "prestidigitation"], spell: "magic-missile" }],
    },
  }
  assert.deepEqual(
    spellsOf(four).map((known) => [known.spell.id, known.cantrip, known.free]),
    [
      ["fire-bolt", true, 0],
      ["prestidigitation", true, 0],
      ["magic-missile", false, 1],
    ]
  )
  // Intelligence 10 and a Proficiency Bonus of 2: DC 10, +2.
  assert.deepEqual([spellcastingFor(four, "fire-bolt")?.saveDc, spellcastingFor(four, "fire-bolt")?.attackBonus], [10, 2])
  const cost = castCost(four, "magic-missile")
  assert.deepEqual("cost" in cost && cost.cost, { kind: "free", feature: "magic-initiate-wizard" })
  // Spent, with no slot to fall back on.
  assert.ok("problem" in castCost(withCastSpent(four, { kind: "free", feature: "magic-initiate-wizard" }), "magic-missile"))
})

test("every feat a level 4 Fighter is offered can be taken, Skilled with its three skills", () => {
  const three: Sheet = { ...(branka.sheet as Sheet), level: 3, subclass: "champion" }
  const offered = levelUpOptions(three).feat?.feats ?? []
  const skilled = offered.find((feat) => feat.id === "skilled")
  assert.equal(skilled?.skillPicks?.count, 3)
  for (const feat of offered) {
    const increase = feat.abilityScoreIncrease
    const choices: LevelUpChoices = {
      feat: feat.id,
      ...(increase ? { abilities: { [increase.from.includes("con") ? "con" : increase.from[0]]: increase.choices[0].amount } } : {}),
      ...(feat.skillPicks ? { featPicks: { skills: feat.skillPicks.from.slice(0, 3).map((skill) => skill.id) as NonNullable<LevelUpChoices["skills"]> } } : {}),
      ...(feat.spellPicks ? { featPicks: { spellList: "wizard", spellAbility: "int", cantrips: ["fire-bolt", "light"], spell: "shield" } } : {}),
    }
    const made = levelUp(three, choices)
    assert.ok("sheet" in made, `${feat.id}: ${"problems" in made ? made.problems.join("; ") : ""}`)
  }
  // Two skills for Skilled's three is refused.
  assert.deepEqual(levelUp(three, { feat: "skilled", featPicks: { skills: ["arcana", "history"] } }), {
    problems: ["Skilled gives 3 skill proficiencies at level 4, and the sheet has 2"],
  })
})
