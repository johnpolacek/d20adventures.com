import assert from "node:assert/strict"
import { test } from "node:test"
import { afterRoll, attackModesFromActions, turnEffectsAtRoundStart } from "../../src/sheet/actions"
import { damageTaken, defensesOf, strike, weaponAttack } from "../../src/sheet/attack"
import { choiceRule, classCastingBar, classCheckBonus, classCheckModes } from "../../src/sheet/class-rules"
import { barbarian, isRaging, usesStrength } from "../../src/sheet/classes/barbarian"
import { sheetProblems } from "../../src/sheet/derive"
import { attacksPerAction, withUsedThisTurn } from "../../src/sheet/feature-rules"
import { bonusActionsOf, useBonusAction } from "../../src/sheet/features"
import { shortRest } from "../../src/sheet/rest"
import type { Sheet } from "../../src/sheet/sheet"
import type { TurnEffect } from "../../src/sheet/turn-effect"

// Every expected value below was worked out by hand from the SRD 5.2.1 rules (pages 28 to 30), not copied from the
// function's output. A Dwarf Barbarian of the Path of the Berserker, level 5, Soldier: Str 18 (+4), Dex 13 (+1), Wis
// 12 (+1), Proficiency Bonus +3, trained in Perception, Survival, Athletics, Intimidation and Animal Handling. The
// Barbarian table at level 5: 3 Rages and a Rage Damage of +2. A Greataxe is +7 to hit for 1d12 + 4 Slashing.

const sheet: Sheet = {
  class: "barbarian",
  level: 5,
  subclass: "path-of-the-berserker",
  species: "dwarf",
  background: "soldier",
  abilityScores: { str: 18, dex: 13, con: 16, int: 10, wis: 12, cha: 8 },
  classSkills: ["perception", "survival"],
  shield: true,
  weapons: ["greataxe", "handaxe", "dagger"],
  weaponMasteries: ["greataxe", "handaxe", "javelin"],
  advancements: [
    { level: 3, skills: ["animal-handling"] },
    { level: 4, feat: "ability-score-improvement", abilities: { str: 1, con: 1 } },
  ],
}

type Hero = {
  id: string
  name: string
  type: string
  sheet: Sheet
  featureUses?: Record<string, number>
  turnEffects?: TurnEffect[]
  isComplete?: boolean
  conditions?: { id: "stunned" }[]
  concentration?: { spell: string }
}
const grosk: Hero = { id: "grosk", name: "Grosk", type: "pc", sheet }
const ogre = { id: "ogre", name: "Ogre", type: "npc", statBlock: "ogre", hitPoints: 68 }
const raged = (hero: Hero = grosk): Hero => useBonusAction({ characters: [hero], actorId: hero.id, feature: "barbarian-rage", roll: () => 1 }).characters[0] as Hero
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() ?? 1

test("Rage: three uses at level 5, Resistance while it holds, extended by an attack, and one use back on a Short Rest", () => {
  assert.deepEqual(sheetProblems(sheet), [])
  assert.deepEqual(
    bonusActionsOf(grosk).find((entry) => entry.id === "barbarian-rage"),
    { id: "barbarian-rage", name: "Rage", uses: 3, left: 3, targeted: false }
  )
  // Entering it spends a use, lasts to the end of the next turn, and ends Concentration.
  const used = useBonusAction({ characters: [{ ...grosk, concentration: { spell: "bless" } }], actorId: "grosk", feature: "barbarian-rage", roll: () => 1 })
  const rage = used.characters[0] as Hero
  assert.deepEqual([rage.featureUses, rage.turnEffects, rage.concentration], [{ "barbarian-rage": 1 }, [{ id: "rage", by: "grosk", turns: 2 }], undefined])
  assert.match(used.use?.fact ?? "", /flies into a Rage\. Their Concentration on Bless ends\./)
  // Taken again while raging, it extends the Rage and spends nothing.
  const again = useBonusAction({ characters: [rage], actorId: "grosk", feature: "barbarian-rage", roll: () => 1 }).characters[0] as Hero
  assert.deepEqual(again.featureUses, { "barbarian-rage": 1 })

  // Resistance to Bludgeoning, Piercing and Slashing halves 13 to 6, rounded down. Without Rage, only the Dwarf's
  // standing Resistance to Poison.
  assert.deepEqual(defensesOf(rage).resistances, ["poison", "bludgeoning", "piercing", "slashing"])
  assert.deepEqual(defensesOf(grosk).resistances, ["poison"])
  assert.equal(damageTaken({ parts: [{ type: "bludgeoning", dice: [], bonus: 13, total: 13 }], total: 13 }, defensesOf(rage)), 6)
  assert.match(classCastingBar(rage) ?? "", /Grosk cannot cast spells while raging/)
  // Incapacitated, the Rage ends.
  assert.equal(isRaging({ ...rage, conditions: [{ id: "stunned" }] }), false)

  // The next round: the Rage holds through Grosk's next turn. An attack roll on an enemy then extends it a round more.
  const next = { ...turnEffectsAtRoundStart(rage), isComplete: false }
  assert.deepEqual([next.turnEffects, isRaging(next)], [[{ id: "rage", by: "grosk", turns: 1 }], true])
  const swung = afterRoll([next, ogre] as Hero[], "grosk", { attack: { weapon: "greataxe", target: "ogre" }, rollType: "Greataxe", difficulty: 11, modifier: 7, mode: "normal" })[0]
  assert.deepEqual(swung.turnEffects, [{ id: "rage", by: "grosk", turns: 2 }])
  // With no attack and the turn over, it no longer holds, and it ends as the round gives way.
  const idle = { ...next, isComplete: true }
  assert.equal(isRaging(idle), false)
  const ended = barbarian.roundStart?.(idle)
  assert.deepEqual([ended?.character.turnEffects, ended?.told?.text], [[], "Grosk's Rage ends."])

  // One expended use comes back on a Short Rest: 3 spent leaves 2.
  assert.deepEqual(shortRest({ ...grosk, featureUses: { "barbarian-rage": 3 } }, { roll: () => 1 }).character.featureUses, { "barbarian-rage": 2 })
})

test("Rage Damage, Reckless Attack and Frenzy on the hits of a turn, and Extra Attack from the data", () => {
  assert.equal(attacksPerAction(grosk), 2)
  const greataxe = weaponAttack(sheet, "greataxe")
  // A Greataxe and a Dagger at Str 18 over Dex 13 use Strength. A Shortbow does not.
  assert.deepEqual([usesStrength(sheet, greataxe), usesStrength(sheet, weaponAttack(sheet, "dagger")), usesStrength(sheet, weaponAttack(sheet, "shortbow"))], [true, true, false])

  // Reckless Attack, chosen with the first attack: Advantage on it, and on the turn's later attacks using Strength.
  assert.deepEqual(choiceRule("reckless")?.attackModes?.(grosk, greataxe), [{ mode: "advantage", from: "Reckless Attack" }])
  const applied = choiceRule("reckless")?.apply?.([raged()], "grosk")
  const reckless = applied?.characters[0] as Hero
  assert.deepEqual(reckless.turnEffects, [
    { id: "rage", by: "grosk", turns: 2 },
    { id: "reckless", by: "grosk", turns: 2 },
  ])
  assert.deepEqual(attackModesFromActions(reckless, ogre, [reckless, ogre], greataxe), [{ mode: "advantage", from: "Reckless Attack" }])
  // Attack rolls against Grosk have Advantage until his next turn, also once the round has turned.
  const later = { ...turnEffectsAtRoundStart(reckless), isComplete: false }
  assert.deepEqual(attackModesFromActions(ogre, later, [later, ogre]), [{ mode: "advantage", from: "Grosk Attacking Recklessly" }])
  assert.deepEqual(attackModesFromActions(later, ogre, [later, ogre], greataxe), [])

  // The Soldier's Savage Attacker is taken as used this turn, so the weapon's dice are rolled once.
  const swinging = (hero: Hero) => withUsedThisTurn(hero, "savage-attacker", "grosk")
  // Raging and reckless, the first hit of his turn: 10 with Advantage and +7 is 17 against the Ogre's Armor Class 11.
  // The Greataxe's d12 rolls 6, + 4 is 10. Rage Damage adds 2. Frenzy adds 2d6, as many as the Rage Damage bonus,
  // rolling 3 and 4: 7. 10 + 2 + 7 is 19 Slashing.
  const first = strike({ attacker: swinging(reckless), target: ogre, weapon: "greataxe", dice: [10, 5], mode: "advantage", turnOf: "grosk", roll: falls(6, 3, 4) })
  assert.deepEqual([first.roll.hit, first.features, first.taken, first.used], [true, ["Rage", "Frenzy"], 19, ["frenzy"]])
  // The second hit of the turn has Rage Damage and no Frenzy: 6 + 4 + 2 is 12.
  const second = strike({ attacker: withUsedThisTurn(swinging(reckless), "frenzy", "grosk"), target: ogre, weapon: "greataxe", dice: [12, 3], mode: "advantage", turnOf: "grosk", roll: falls(6) })
  assert.deepEqual([second.features, second.taken], [["Rage"], 12])
  // Not raging, a hit adds nothing: 6 + 4 is 10.
  const plain = strike({ attacker: swinging(grosk), target: ogre, weapon: "greataxe", dice: [15], turnOf: "grosk", roll: falls(6) })
  assert.deepEqual([plain.features, plain.taken], [undefined, 10])
})

test("Danger Sense, Rage's Strength Advantage and Primal Knowledge's Strength checks", () => {
  const dexSave = { kind: "save" as const, ability: "dex" as const }
  assert.deepEqual(classCheckModes(grosk, dexSave), [{ mode: "advantage", from: "Danger Sense" }])
  assert.deepEqual(classCheckModes({ ...grosk, conditions: [{ id: "stunned" }] }, dexSave), [])
  const rage = raged()
  assert.deepEqual(classCheckModes(rage, { kind: "save", ability: "str" }), [{ mode: "advantage", from: "Rage" }])
  assert.deepEqual(classCheckModes(rage, { kind: "skill", skill: "athletics" }), [{ mode: "advantage", from: "Rage" }])
  assert.deepEqual(classCheckModes(grosk, { kind: "save", ability: "str" }), [])
  // Stealth, untrained, is Dex +1, and raging it is made with Str +4, with Rage's Advantage. Perception, trained, is Wis
  // 1 + 3 = 4, and raging Str 4 + 3 = 7. Insight is not on the list: Wis 1 either way.
  const stealth = { kind: "skill" as const, skill: "stealth" as const }
  assert.deepEqual(
    [classCheckBonus(grosk, stealth), classCheckBonus(rage, stealth), classCheckBonus(grosk, { kind: "skill", skill: "perception" }), classCheckBonus(rage, { kind: "skill", skill: "perception" })],
    [1, 4, 4, 7]
  )
  assert.equal(classCheckBonus(rage, { kind: "skill", skill: "insight" }), 1)
  assert.deepEqual(classCheckModes(rage, stealth), [{ mode: "advantage", from: "Rage" }])
})
