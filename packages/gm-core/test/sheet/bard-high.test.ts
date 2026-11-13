import assert from "node:assert/strict"
import { test } from "node:test"
import { attacksOf } from "../../src/sheet/attack"
import { checkBonus, type Roller, resolveCheck } from "../../src/sheet/check"
import { atInitiative, failedRollDieOf } from "../../src/sheet/class-rules"
import { autoCreate, type CreationPick, createSheet } from "../../src/sheet/create"
import { deriveSheet } from "../../src/sheet/derive"
import { inspiredCheck, useBonusAction } from "../../src/sheet/features"
import { raisedTo } from "../../src/sheet/milestone"
import { attackWithReactions } from "../../src/sheet/reactions"
import { withRescueSpent } from "../../src/sheet/save-rules"
import type { Sheet } from "../../src/sheet/sheet"
import type { Floor } from "../../src/sheet/space"
import { castInSpace } from "../../src/sheet/spell-space"
import { castSpell, rollSave, spellById, targetLimit } from "../../src/sheet/spells"
import { useBlockAction } from "../../src/sheet/stat-block-actions"
import type { Character } from "../../src/types/character"

// Every expected value below was worked out by hand from the SRD 5.2.1 text, not copied from the function's output.
// Lyra is a human College of Lore Bard made by the creator and raised by the choices that need no player: Strength 8
// (-1), Dexterity 14 (+2), Wisdom 10 (+0), Charisma 17 (+3) at 5 to 7, 19 (+4) at 8 to 11, 20 (+5) from 12. Proficiency
// Bonus +3 at 5 to 8, +4 at 9 to 12, +5 at 13 to 16, +6 from 17. She uses Bardic Inspiration as many times as her
// Charisma modifier. She is not trained in Athletics. Wren is a level 1 Bard with Wisdom 10 and no proficiency in Wisdom
// saves, so her Wisdom save is +0.

const pick = { class: "bard", species: "human", background: "sage" } as unknown as CreationPick
const made = (): Sheet => {
  const result = createSheet(pick, autoCreate(pick))
  if ("problems" in result) assert.fail(result.problems.join("; "))
  return result.sheet
}
type Hero = Character & { id: string; sheet: Sheet }
const at = (level: number, x = 0, id = "lyra", name = "Lyra"): Hero => ({ ...raisedTo({ id, name, type: "pc", sheet: made(), controlledBy: "ai" } as Hero, level), position: { x, y: 0 } })
const wren = (x: number) => at(1, x, "wren", "Wren")
const npc = (id: string, statBlock: string, hitPoints: number, x = 5): Character =>
  ({ id, name: id.charAt(0).toUpperCase() + id.slice(1), type: "npc", statBlock, hitPoints, position: { x, y: 0 } }) as Character
const find = (characters: readonly Character[], id: string) => characters.find((character) => character.id === id) as Character & Record<string, unknown>
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() ?? assert.fail("out of dice")
const spell = (id: string) => spellById.get(id) ?? assert.fail(`no ${id}`)
const open: Floor = { solids: [], doors: [] }

test("the Bardic Inspiration die given grows with the Bard: a d6 to 4, a d8 from 5, a d10 from 10, a d12 from 15", () => {
  const given = (level: number) =>
    find(useBonusAction({ characters: [at(level), wren(10)], actorId: "lyra", feature: "bard-bardic-inspiration", target: "wren", roll: falls() }).characters, "wren").inspiration
  assert.deepEqual(
    [4, 5, 9, 10, 14, 15, 20].map((level) => (given(level) as { die: number }).die),
    [6, 8, 8, 10, 10, 12, 12]
  )
})

test("a held Bardic Inspiration die, moved to the Bard's file, rolls and spends as it did", () => {
  // Wren holds Lyra's d8. Her Dagger is +2 Dex and +2 proficiency, +4. A 7 makes 11 against a Bandit's Armor Class 12,
  // short by 1: the d8 falls 5, 16, a hit. The die is the same handed in by the hook as taken from her, and the roll the same.
  const holder = { ...wren(0), inspiration: { die: 8, by: "lyra" } }
  const bandit = npc("bandit", "bandit", 11)
  const strike = (inspiration: { die: number } | undefined) =>
    attackWithReactions({ characters: [holder, bandit], attackerId: "wren", targetId: "bandit", weapon: "dagger", dice: [7], roll: falls(5, 2), ask: () => false, inspiration }).blow
  const die = failedRollDieOf(holder, "attack")
  assert.equal(die?.die, 8)
  assert.deepEqual(strike(die), strike(holder.inspiration))
  assert.deepEqual([strike(die).inspired, strike(die).roll.total, strike(die).roll.hit], [5, 16, true])
  // On any D20 Test, a save among them, and spent once rolled, whether the roll then succeeds or not.
  assert.equal(failedRollDieOf(holder, "save")?.die, 8)
  assert.deepEqual([die?.spend(holder, true).inspiration, die?.spend(holder, false).inspiration], [undefined, undefined])
  // One who holds none, and is no Lore Bard of 14, rolls none.
  assert.equal(failedRollDieOf(wren(0), "check"), undefined)
})

test("Peerless Skill adds a Bardic Inspiration die to a failed check or attack roll, spent only on a success", () => {
  // Level 14: Charisma 20, five uses, a d10. Athletics is Strength -1 and half of +5 by Jack of All Trades, +1. A 9
  // makes 10 against DC 15, short by 5: the d10 falls 6, 16, a success, and a use is spent. A 3 makes 13, still a
  // failure, and none is.
  const lyra = at(14)
  const die = failedRollDieOf(lyra, "check")
  assert.equal(die?.die, 10)
  const failed = resolveCheck({ dice: [9], bonus: checkBonus(lyra, { kind: "skill", skill: "athletics" }), dc: 15 })
  assert.equal(failed.total, 10)
  const lifted = inspiredCheck(failed, { die: 10 }, () => 6)
  assert.deepEqual([lifted.total, lifted.success], [16, true])
  assert.deepEqual(die?.spend(lyra, lifted.success).featureUses, { "bard-bardic-inspiration": 1 })
  assert.equal(die?.spend(lyra, inspiredCheck(failed, { die: 10 }, () => 3).success).featureUses, undefined)
  // An attack roll: her Dagger is +2 Dex and +5 proficiency, +7. A 3 makes 10 against a Bandit's 12: the d10 falls 4, 14.
  assert.equal(attacksOf(lyra).find((attack) => attack.id === "dagger")?.bonus, 7)
  const bandit = npc("bandit", "bandit", 11)
  const blow = attackWithReactions({
    characters: [lyra, bandit],
    attackerId: "lyra",
    targetId: "bandit",
    weapon: "dagger",
    dice: [3],
    roll: falls(4, 2),
    ask: () => false,
    inspiration: failedRollDieOf(lyra, "attack"),
  }).blow
  assert.deepEqual([blow.inspired, blow.roll.total, blow.roll.hit], [4, 14, true])
  // Not on a save, not at level 13, and not with every use spent.
  assert.equal(failedRollDieOf(lyra, "save"), undefined)
  assert.equal(failedRollDieOf(at(13), "check"), undefined)
  assert.equal(failedRollDieOf({ ...lyra, featureUses: { "bard-bardic-inspiration": 5 } }, "attack"), undefined)
})

test("Countercharm rerolls a failed save against Frightened with Advantage, for one of the Bard's side within 30 feet", () => {
  // A Lion's Roar: a Wisdom save, DC 11, or Frightened. Wren at 0 rolls a 4, 4 and fails. Lyra, level 7, 20 feet off,
  // takes her Reaction: the reroll has Advantage, 9 and 14, so 14, a success. Wren keeps no condition and spends
  // nothing, and Lyra's Reaction is taken.
  const lion = npc("lion", "lion", 22, 10)
  const roar = (characters: Character[], ...dice: number[]) => useBlockAction({ characters, actorId: "lion", action: "roar", targets: ["wren"], d20: falls(...dice), roll: falls() })
  const saved = roar([at(7, 20), wren(0), lion], 4, 9, 14)
  assert.deepEqual(
    [saved.saves[0].dice, saved.saves[0].total, saved.saves[0].success, saved.saves[0].mode, saved.saves[0].rescued],
    [[9, 14], 14, true, "advantage", { feature: "bard-countercharm", name: "Lyra's Countercharm", first: 4, by: "lyra" }]
  )
  assert.equal(find(saved.characters, "wren").conditions, undefined)
  assert.equal(find(saved.characters, "wren").turnEffects, undefined)
  assert.deepEqual(find(saved.characters, "lyra").turnEffects, [{ id: "reacted", by: "lyra", turns: 1 }])
  // 35 feet off she cannot, and a level 6 Bard has no Countercharm: Wren is Frightened.
  assert.equal(roar([at(7, 35), wren(0), lion], 4).saves[0].rescued, undefined)
  assert.equal(roar([at(6, 20), wren(0), lion], 4).saves[0].rescued, undefined)
  // A Bard who has reacted this round cannot again.
  const reacted = { ...at(7, 20), turnEffects: [{ id: "reacted", by: "lyra", turns: 1 }] }
  assert.equal(roar([reacted, wren(0), lion], 4).saves[0].rescued, undefined)
})

test("Countercharm answers the Bard's own save, and not a save against another condition or a foe's", () => {
  // Lyra's own Wisdom save is +0. A 2 fails against DC 11, the reroll falls 15 and 3 with Advantage: 15, a success.
  const own = rollSave({ target: at(7), ability: "wis", dc: 11, d20: falls(2, 15, 3), roll: falls(), characters: [at(7)], stakes: { conditions: ["charmed"] } })
  assert.deepEqual([own.total, own.rescued], [15, { feature: "bard-countercharm", name: "Countercharm", first: 2, by: "lyra" }])
  assert.deepEqual(withRescueSpent(at(7), { feature: "bard-countercharm", by: "lyra" }).turnEffects, [{ id: "reacted", by: "lyra", turns: 1 }])
  // A save against Poisoned is not one it answers, nor a save by a foe of the Bard's.
  const poisoned = rollSave({ target: wren(0), ability: "con", dc: 11, d20: falls(2), roll: falls(), characters: [at(7, 10), wren(0)], stakes: { conditions: ["poisoned"] } })
  assert.equal(poisoned.rescued, undefined)
  const foe = npc("bandit", "bandit", 11, 10)
  const theirs = rollSave({ target: foe, ability: "wis", dc: 11, d20: falls(2), roll: falls(), characters: [at(7), foe], stakes: { conditions: ["charmed"] } })
  assert.equal(theirs.rescued, undefined)
  // A reroll that cannot reach the DC is not taken: +0 and a 20 make 20 against 21.
  assert.equal(rollSave({ target: wren(0), ability: "wis", dc: 21, d20: falls(2), roll: falls(), characters: [at(7, 10), wren(0)], stakes: { conditions: ["charmed"] } }).rescued, undefined)
})

test("Superior Inspiration: as Initiative is rolled, uses of Bardic Inspiration come back up to two", () => {
  // Level 18, Charisma 20: five uses. All spent leaves two left. Four spent, one left, leaves two. Two spent, three left,
  // stays. A level 17 Bard has no Superior Inspiration.
  const spent = (level: number, used: number) => atInitiative({ ...at(level), featureUses: { "bard-bardic-inspiration": used } }, () => 1).featureUses
  assert.deepEqual(
    [spent(18, 5), spent(18, 4), spent(18, 2), spent(17, 5)],
    [{ "bard-bardic-inspiration": 3 }, { "bard-bardic-inspiration": 3 }, { "bard-bardic-inspiration": 2 }, { "bard-bardic-inspiration": 5 }]
  )
})

test("Words of Creation: Power Word Heal and Power Word Kill take a second creature within 10 feet of the first", () => {
  // A level 20 Bard's Power Word Kill takes two, a level 19's one, and her Hold Person still one.
  const lyra = at(20)
  assert.deepEqual(
    [
      targetLimit(spell("power-word-kill"), 9, 20, lyra),
      targetLimit(spell("power-word-heal"), 9, 20, lyra),
      targetLimit(spell("power-word-kill"), 9, 19, at(19)),
      targetLimit(spell("hold-person"), 2, 20, lyra),
    ],
    [2, 2, 1, 1]
  )
  // On a floor the second stands within 10 feet of the first: one 10 feet from it is taken, one 15 feet from it is not.
  const everyone = [lyra, npc("a", "bandit", 11, 30), npc("b", "bandit", 11, 40), npc("c", "bandit", 11, 45)]
  assert.deepEqual(castInSpace({ spell: spell("power-word-kill"), caster: lyra, everyone, named: ["a", "b"], floor: open }).targets, ["a", "b"])
  assert.deepEqual(castInSpace({ spell: spell("power-word-kill"), caster: lyra, everyone, named: ["a", "c"], floor: open }).targets, ["a"])
  // Two Bandits of 11 hit points, 100 or fewer, both die.
  const cast = castSpell({
    characters: [lyra, npc("a", "bandit", 11, 30), npc("b", "bandit", 11, 40)],
    casterId: "lyra",
    spell: spell("power-word-kill"),
    targets: ["a", "b"],
    d20: falls(),
    roll: falls(),
  })
  assert.deepEqual([find(cast.characters, "a").dead, find(cast.characters, "b").dead], [true, true])
})

test("Jack of All Trades reaches a skill check the Bard is not trained in, and not a plain ability check or Initiative", () => {
  // Level 14: Athletics is Strength -1 and half of +5, 2, so +1. A plain Strength check is -1. Initiative is a Dexterity
  // check that uses no skill, so it is Dexterity's +2 alone.
  const lyra = at(14) as Roller
  assert.deepEqual([checkBonus(lyra, { kind: "skill", skill: "athletics" }), checkBonus(lyra, { kind: "ability", ability: "str" }), deriveSheet((lyra as Hero).sheet).initiative], [1, -1, 2])
})
