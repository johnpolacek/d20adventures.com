import assert from "node:assert/strict"
import { test } from "node:test"
import { afterRoll, attackModesFromActions } from "../../src/sheet/actions"
import { attacksOf } from "../../src/sheet/attack"
import { followingRoll, type InScene } from "../../src/sheet/attack-roll"
import { atInitiative } from "../../src/sheet/class-rules"
import { sheetProblems } from "../../src/sheet/derive"
import { attacksPerAction } from "../../src/sheet/feature-rules"
import { bonusActionsOf, useBonusAction } from "../../src/sheet/features"
import { moveBudget } from "../../src/sheet/moves"
import { attackWithReactions } from "../../src/sheet/reactions"
import { shortRest } from "../../src/sheet/rest"
import type { Sheet } from "../../src/sheet/sheet"
import type { TurnEffect } from "../../src/sheet/turn-effect"
import type { RequiredAttack } from "../../src/validations/roll-requirement-schema"

// Every expected value below was worked out by hand from the SRD 5.2.1 rules (pages 49 to 52), not copied from the
// function's output. A Human Warrior of the Open Hand, Acolyte, level 5: Str 12 (+1), Dex 15 (+2), Wis 18 (+4),
// Proficiency Bonus +3. The Monk table at level 5: Martial Arts 1d8, 5 Focus Points. Focus save DC 8 + 4 + 3 = 15.
// At level 1 the die is 1d6 and the Proficiency Bonus +2.

const level5: Sheet = {
  class: "monk",
  level: 5,
  subclass: "warrior-of-the-open-hand",
  species: "human",
  background: "acolyte",
  size: "Medium",
  languages: ["common-sign-language", "draconic"],
  abilityScores: { str: 12, dex: 15, con: 13, int: 11, wis: 16, cha: 8 },
  classSkills: ["acrobatics", "stealth"],
  otherSkills: ["animal-handling", "medicine", "perception", "survival"],
  feats: ["skilled"],
  weapons: ["spear", "dagger"],
  advancements: [
    { level: 1, feat: "magic-initiate", spellList: "cleric", spellAbility: "wis", cantrips: ["sacred-flame", "guidance"], spell: "cure-wounds" },
    { level: 4, feat: "ability-score-improvement", abilities: { wis: 2 } },
  ],
}
const { subclass: _, ...below3 } = level5
const level1: Sheet = { ...below3, level: 1, abilityScores: level5.abilityScores, advancements: [level5.advancements?.[0] as NonNullable<Sheet["advancements"]>[number]] }

type Hero = InScene & { type: string; sheet: Sheet; featureUses?: Record<string, number>; turnEffects?: TurnEffect[]; hitPoints?: number }
const kaito: Hero = { id: "kaito", name: "Kaito", type: "pc", sheet: level5 }
const bandit = { id: "bandit", name: "Bandit", type: "npc", statBlock: "bandit", hitPoints: 11 } as InScene & { type: string; hitPoints: number }
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() ?? 1
const never = () => false

test("Martial Arts: the die and Dexterity for an Unarmed Strike and a Monk weapon, unarmored, and Extra Attack at level 5", () => {
  assert.deepEqual(sheetProblems(level5), [])
  assert.deepEqual(sheetProblems(level1), [])
  // Level 1: an Unarmed Strike is Dexterity +2 and Proficiency +2 to hit, for 1d6 + 2. The Spear's own 1d6 is no better
  // than the die, and it too takes Dexterity. Without Martial Arts it would be +3 to hit for 1 + 1 = 2.
  const one = attacksOf({ type: "pc", sheet: level1 })
  assert.deepEqual(
    one.map((attack) => [attack.id, attack.bonus, attack.damage]),
    [
      ["spear", 4, [{ dice: "1d6 + 2", type: "piercing" }]],
      ["dagger", 4, [{ dice: "1d6 + 2", type: "piercing" }]],
      ["unarmed-strike", 4, [{ dice: "1d6 + 2", type: "bludgeoning" }]],
    ]
  )
  // Level 5: the die is 1d8, and the Proficiency Bonus +3.
  assert.deepEqual(attacksOf(kaito).find((attack) => attack.id === "unarmed-strike")?.damage, [{ dice: "1d8 + 2", type: "bludgeoning" }])
  // In armor, Martial Arts does not hold: Strength +1 and Proficiency +3, for 1 + 1 Bludgeoning. No Bonus Unarmed Strike.
  const armored = { ...kaito, sheet: { ...level5, armor: "leather-armor" } }
  assert.deepEqual(
    attacksOf(armored).find((attack) => attack.id === "unarmed-strike"),
    { id: "unarmed-strike", name: "Unarmed Strike", kind: "melee", bonus: 4, damage: [{ amount: 2, type: "bludgeoning" }], reach: 5 }
  )
  assert.equal(
    bonusActionsOf(armored).some((entry) => entry.id === "martial-arts-strike"),
    false
  )
  assert.equal(
    bonusActionsOf(kaito).some((entry) => entry.id === "martial-arts-strike"),
    true
  )
  assert.equal(attacksPerAction(kaito), 2)
})

test("Monk's Focus: Focus Points counted and spent, Patient Defense's Dodge, and every point back on a Short Rest", () => {
  const menu = bonusActionsOf(kaito)
  // Five points at level 5. Flurry of Blows counts them, with an Open Hand Monk's Addle and Topple, and the free
  // Disengage and Dash count none.
  assert.deepEqual(
    menu.filter((entry) => entry.id !== "martial-arts-strike").map((entry) => [entry.id, entry.left]),
    [
      ["flurry-of-blows", 5],
      ["flurry-of-blows-addle", 5],
      ["flurry-of-blows-topple", 5],
      ["patient-defense", undefined],
      ["patient-defense-focus", 5],
      ["step-of-the-wind", undefined],
      ["step-of-the-wind-focus", 5],
    ]
  )
  const defended = useBonusAction({ characters: [kaito], actorId: "kaito", feature: "patient-defense-focus", roll: () => 1 }).characters[0] as Hero
  assert.deepEqual([defended.featureUses, defended.turnEffects], [{ "monk-monks-focus": 1 }, [{ id: "dodging", by: "kaito", turns: 2 }]])
  // With none left, only the free ones are offered.
  const spent = { ...kaito, featureUses: { "monk-monks-focus": 5 } }
  assert.deepEqual(
    bonusActionsOf(spent)
      .filter((entry) => entry.left === undefined || entry.left > 0)
      .map((entry) => entry.id),
    ["martial-arts-strike", "patient-defense", "step-of-the-wind"]
  )
  assert.equal(shortRest(spent, { roll: () => 1 }).character.featureUses?.["monk-monks-focus"], undefined)
})

test("Flurry of Blows: two Unarmed Strikes after the action's attacks, with Topple on each hit", () => {
  // The Attack action's first attack with a Spear, with Extra Attack's second and the Flurry to come.
  const made: RequiredAttack = {
    attack: { weapon: "spear", target: "bandit" },
    rollType: "Spear",
    difficulty: 12,
    modifier: 5,
    mode: "normal",
    after: { attacks: 1, "flurry-topple": true },
  }
  const present = [kaito, bandit]
  const second = followingRoll({ character: kaito, made, present }) as RequiredAttack
  assert.deepEqual([second.attack.weapon, second.after], ["spear", { struck: ["bandit"], "flurry-topple": true }])
  const third = followingRoll({ character: kaito, made: second, present }) as RequiredAttack
  assert.deepEqual(
    [third.attack, third.after],
    [
      { weapon: "unarmed-strike", target: "bandit", choices: { "open-hand": "topple" } },
      { struck: ["bandit"], "flurry-topple-again": true },
    ]
  )
  const fourth = followingRoll({ character: kaito, made: third, present }) as RequiredAttack
  assert.deepEqual([fourth.attack.weapon, fourth.attack.choices, fourth.after], ["unarmed-strike", { "open-hand": "topple" }, { struck: ["bandit"] }])
  assert.equal(followingRoll({ character: kaito, made: fourth, present }), undefined)

  // Topple: the Bandit's Dexterity save, 4 + 1 = 5 against 15, fails and it falls Prone. The hit is 1 + 2 = 3.
  const toppled = attackWithReactions({
    characters: present,
    attackerId: "kaito",
    targetId: "bandit",
    weapon: "unarmed-strike",
    dice: [15],
    roll: falls(1, 4),
    choices: { "open-hand": "topple" },
    ask: never,
  })
  assert.deepEqual([toppled.blow.taken, toppled.blow.conditions], [3, [{ target: "bandit", condition: "prone" }]])
})

test("Stunning Strike: a Focus Point on the first hit, Stunned on a failed save, and Speed halved with Advantage on a success", () => {
  const ready: Hero = { ...kaito, turnEffects: [{ id: "stunning-strike-ready", by: "kaito", turns: 1 }] }
  // A failed Constitution save, 5 + 1 = 6 against 15: Stunned through the Bandit's turn, and a Focus Point spent.
  const failed = attackWithReactions({ characters: [ready, bandit], attackerId: "kaito", targetId: "bandit", weapon: "unarmed-strike", dice: [15], roll: falls(1, 5), ask: never })
  const stunned = failed.characters.find((character) => character.id === "bandit") as typeof bandit
  assert.deepEqual(stunned.conditions, [{ id: "stunned", source: "kaito", turns: 1 }])
  const monk = failed.characters.find((character) => character.id === "kaito") as Hero
  assert.equal(monk.featureUses?.["monk-monks-focus"], 1)
  // Once a turn: the next hit tries no other.
  const again = attackWithReactions({ characters: failed.characters, attackerId: "kaito", targetId: "bandit", weapon: "unarmed-strike", dice: [15], roll: falls(1, 5), ask: never })
  assert.equal(again.blow.spent, undefined)

  // A save of 18 + 1 = 19: the Bandit's Speed of 30 is halved to 15, and the next attack on it has Advantage.
  const saved = attackWithReactions({ characters: [ready, bandit], attackerId: "kaito", targetId: "bandit", weapon: "unarmed-strike", dice: [15], roll: falls(1, 18), ask: never })
  const reeling = saved.characters.find((character) => character.id === "bandit") as typeof bandit & { turnEffects: TurnEffect[] }
  assert.equal(moveBudget(reeling as Parameters<typeof moveBudget>[0]), 15)
  const ally = { id: "ally", name: "Ally", type: "pc" } as InScene & { type: string }
  assert.deepEqual(attackModesFromActions(ally, reeling), [{ mode: "advantage", from: "Stunning Strike" }])
  // That attack spends the Advantage, and the halved Speed stays.
  const after = afterRoll([ally, reeling], "ally", { attack: { weapon: "unarmed-strike", target: "bandit" }, rollType: "Unarmed Strike", difficulty: 12, modifier: 2, mode: "advantage" })
  assert.deepEqual(
    (after[1] as typeof reeling).turnEffects.map((effect) => effect.id),
    ["stunning-strike-slowed"]
  )
})

test("Deflect Attacks and Uncanny Metabolism", () => {
  // The Bandit's Scimitar hits for 6 + 1 = 7 Slashing. Deflect Attacks cuts 1d10 + 2 + 5: a 3 makes 10, so 0 is taken.
  const placed = { ...kaito, hitPoints: 33 }
  const struck = attackWithReactions({ characters: [bandit, placed], attackerId: "bandit", targetId: "kaito", weapon: "scimitar", dice: [18], roll: falls(6, 3), ask: () => true })
  assert.deepEqual([struck.blow.taken, struck.blow.reduced, struck.reactions[0]?.id], [0, { id: "deflect-attacks", from: 7 }, "deflect-attacks"])

  // Uncanny Metabolism with 3 Focus Points spent and 20 of 33 hit points: every point back, and 4 on the d8 plus 5
  // heals 9. Once a Long Rest, so the next Initiative changes nothing.
  const tired = { ...kaito, hitPoints: 20, featureUses: { "monk-monks-focus": 3 } }
  const restored = atInitiative(tired, () => 4)
  assert.deepEqual([restored.hitPoints, restored.featureUses], [29, { "monk-uncanny-metabolism": 1 }])
  const later = { ...restored, featureUses: { ...restored.featureUses, "monk-monks-focus": 2 } }
  assert.deepEqual(
    atInitiative(later, () => 4),
    later
  )
})
