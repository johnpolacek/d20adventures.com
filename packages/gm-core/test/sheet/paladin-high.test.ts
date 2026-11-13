import assert from "node:assert/strict"
import { test } from "node:test"
import { attacksOf } from "../../src/sheet/attack"
import { attackRequirement } from "../../src/sheet/attack-roll"
import { choiceRule } from "../../src/sheet/class-rules"
import { abjureFoes } from "../../src/sheet/classes/paladin"
import { cannotAttack, checkModesFrom, withCondition } from "../../src/sheet/conditions"
import { autoCreate, type CreationPick, createSheet } from "../../src/sheet/create"
import { withDamage } from "../../src/sheet/death"
import { bonusActionsOf, useBonusAction } from "../../src/sheet/features"
import { raisedTo } from "../../src/sheet/milestone"
import { attackWithReactions } from "../../src/sheet/reactions"
import { auraOnSave } from "../../src/sheet/save-rules"
import type { Sheet } from "../../src/sheet/sheet"
import { roundTurns } from "../../src/sheet/spell-rounds"
import type { Character } from "../../src/types/character"

// Every expected value below was worked out by hand from the SRD 5.2.1 text, not copied from the function's output.
// Aria is a human Paladin of the Oath of Devotion made by the creator and raised by the choices that need no player:
// Strength 20 (+5) from level 8, Constitution 14 (+2), Charisma 15 (+2) from 8, 17 (+3) from 12, 19 (+4) from 16.
// Proficiency Bonus +4 at 9 to 12, +5 at 13 to 16, +6 from 17. Her spell save DC at 9 is 8 + 4 + 2 = 14. Bram is a
// level 1 Paladin with Constitution 14 (+2) and no proficiency in Constitution saves. Every die falls as 4 unless named.

const pick = { class: "paladin", species: "human", background: "soldier" } as unknown as CreationPick
const made = (): Sheet => {
  const result = createSheet(pick, autoCreate(pick))
  if ("problems" in result) assert.fail(result.problems.join("; "))
  return result.sheet
}
type Hero = Character & { id: string; sheet: Sheet }
const at = (level: number, x = 0, id = "aria", name = "Aria"): Hero => ({ ...raisedTo({ id, name, type: "pc", sheet: made(), controlledBy: "ai" } as Hero, level), position: { x, y: 0 } })
const bram = (x: number) => at(1, x, "bram", "Bram")
const npc = (id: string, statBlock: string, hitPoints: number, x = 5): Character =>
  ({ id, name: id.charAt(0).toUpperCase() + id.slice(1), type: "npc", statBlock, hitPoints, position: { x, y: 0 } }) as Character
const fours = () => 4
const find = (characters: readonly Character[], id: string) => characters.find((character) => character.id === id) as Character & Record<string, unknown>

test("Aura of Protection adds Charisma to a save from a monster's hit and to a save the player rolls", () => {
  // A Ghoul's Claw: +4, a 17 makes 21 against Bram's Armor Class 18 (Chain Mail 16, Shield 2) and hits for 1d4 + 2.
  // Bram's Constitution save is d20 + 2 against DC 10: a 6 makes 8 and fails, so he is Paralyzed. Within 10 feet of a
  // level 9 Aria it is 6 + 2 + 2 = 10, a success. 15 feet away the aura does not reach him.
  const roll = (sides: number) => (sides === 20 ? 6 : 2)
  const claw = (characters: Character[]) => attackWithReactions({ characters, attackerId: "ghoul", targetId: "bram", weapon: "claw", dice: [17], roll, ask: () => false })
  assert.deepEqual(find(claw([at(9), bram(5), npc("ghoul", "ghoul", 22, 10)]).characters, "bram").conditions, undefined)
  assert.equal(find(claw([at(9), bram(15), npc("ghoul", "ghoul", 22, 20)]).characters, "bram").conditions?.length, 1)
  // A save the player rolls takes the same +2. Another check takes nothing.
  const present = [at(9), bram(5)]
  assert.deepEqual([auraOnSave(bram(5), { kind: "save" }, present), auraOnSave(bram(5), { kind: "skill" }, present), auraOnSave(bram(15), { kind: "save" }, present)], [2, 0, 0])
})

test("Aura of Devotion and Aura of Courage: no Charmed or Frightened in the aura, and no effect on one who is", () => {
  const ten = at(10)
  const near = [ten, bram(5), npc("ghoul", "ghoul", 22, 30)]
  // Within 10 feet Bram cannot be Frightened, at 15 he can. Aria herself, with no one else known, cannot either.
  assert.equal(withCondition(bram(5), { id: "frightened", source: "ghoul" }, { present: near }).given, false)
  assert.equal(withCondition(bram(15), { id: "frightened", source: "ghoul" }, { present: [ten, bram(15)] }).given, true)
  assert.equal(withCondition(ten, { id: "frightened", source: "ghoul" }).given, false)
  // Frightened already, in the aura: no Disadvantage on his checks. Out of it: Disadvantage.
  const afraid = (x: number) => ({ ...bram(x), conditions: [{ id: "frightened" as const, source: "ghoul" }] })
  const check = { kind: "skill" as const, skill: "athletics" as const }
  assert.deepEqual(checkModesFrom(afraid(5), check, [ten, afraid(5), npc("ghoul", "ghoul", 22, 30)]), [])
  assert.deepEqual(checkModesFrom(afraid(15), check, [ten, afraid(15), npc("ghoul", "ghoul", 22, 30)]), [{ mode: "disadvantage", from: "Frightened" }])
  // Charmed by the Ghoul, Bram may attack it while in a level 7 aura. A level 6 Aria has no Aura of Devotion.
  const charmed = { ...bram(5), conditions: [{ id: "charmed" as const, source: "ghoul" }] }
  const ghoul = npc("ghoul", "ghoul", 22, 30)
  assert.deepEqual([cannotAttack(charmed, ghoul, [at(7), charmed, ghoul]), cannotAttack(charmed, ghoul, [at(6), charmed, ghoul])], [false, true])
  // An Incapacitated Paladin's aura is inactive.
  const stunned = { ...ten, conditions: [{ id: "stunned" as const }] }
  assert.equal(withCondition(bram(5), { id: "frightened", source: "ghoul" }, { present: [stunned, bram(5)] }).given, true)
})

test("Abjure Foes: Charisma's count of creatures save or are Frightened, until they take damage", () => {
  // Level 9, Charisma +2: two creatures. A Ghoul's Wisdom save is +0: a 10 makes 10 against DC 14 and fails. The third
  // Ghoul named is past the count. One use of Channel Divinity is spent.
  const aria = at(9)
  const ghouls = [npc("one", "ghoul", 22), npc("two", "ghoul", 22, 10), npc("three", "ghoul", 22, 15)]
  const used = abjureFoes({ characters: [aria, ...ghouls], paladinId: "aria", targets: ["one", "two", "three"], d20: () => 10, roll: fours })
  assert.deepEqual(used.targets, ["one", "two"])
  assert.deepEqual(find(used.characters, "one").conditions, [{ id: "frightened", source: "aria", turns: 10, feature: "paladin-abjure-foes" }])
  assert.equal(find(used.characters, "three").conditions, undefined)
  assert.deepEqual(find(used.characters, "aria").featureUses, { "paladin-channel-divinity": 1 })
  // A 14 succeeds. With none named, the nearest enemies are taken.
  const saved = abjureFoes({ characters: [aria, ...ghouls], paladinId: "aria", targets: [], d20: () => 14, roll: fours })
  assert.deepEqual([saved.targets, saved.conditions], [["one", "two"], []])
  // Any damage ends it.
  const hurt = withDamage(find(used.characters, "one") as Character & { hitPoints: number }, 3).character
  assert.equal(hurt.conditions, undefined)
  // The choice is offered at 9 while a use is left, and not at 8.
  assert.deepEqual([choiceRule("abjure")?.offer(aria), choiceRule("abjure")?.offer(at(8))], [true, undefined])
})

test("Radiant Strikes adds 1d8 Radiant to every hit with a melee weapon, doubled on a Critical Hit", () => {
  // Level 11. Longsword 1d8 + 5 = 9, and 1d8 Radiant = 4: 13 of the Ogre's 68. A 20: 8 + 5 + 8 = 21. A Shortbow adds none: 4 + 0.
  const swing = (dice: number[], weapon = "longsword") =>
    attackWithReactions({ characters: [at(11), npc("ogre", "ogre", 68)], attackerId: "aria", targetId: "ogre", weapon, dice, roll: fours, ask: () => false }).blow
  const hit = swing([15])
  assert.deepEqual([hit.taken, hit.features?.includes("Radiant Strikes")], [13, true])
  assert.equal(swing([20]).taken, 21)
  assert.deepEqual([swing([19], "shortbow").taken, swing([15], "longsword").taken], [4, 13])
  assert.equal(
    attackWithReactions({ characters: [at(10), npc("ogre", "ogre", 68)], attackerId: "aria", targetId: "ogre", weapon: "longsword", dice: [15], roll: fours, ask: () => false }).blow.taken,
    9
  )
})

test("Restoring Touch ends conditions for 5 points each, the worst first as far as the pool goes", () => {
  // Level 14: a pool of 70. Bram Paralyzed, Blinded and Poisoned: 15 points end all three, and 55 are left.
  const aria = at(14)
  const ids = bonusActionsOf(aria).map((entry) => entry.id)
  assert.deepEqual([ids.includes("lay-on-hands-restore"), ids.includes("lay-on-hands-poison")], [true, false])
  const sick = { ...bram(5), conditions: [{ id: "poisoned" as const }, { id: "blinded" as const }, { id: "paralyzed" as const }] }
  const cured = useBonusAction({ characters: [aria, sick], actorId: "aria", feature: "lay-on-hands-restore", target: "bram", roll: fours })
  assert.deepEqual([find(cured.characters, "bram").conditions, find(cured.characters, "aria").featureUses], [undefined, { "paladin-lay-on-hands": 15 }])
  // With 10 points left: Paralyzed and Blinded end, Poisoned stays.
  const low = { ...aria, featureUses: { "paladin-lay-on-hands": 60 } }
  const part = useBonusAction({ characters: [low, sick], actorId: "aria", feature: "lay-on-hands-restore", target: "bram", roll: fours })
  assert.deepEqual(find(part.characters, "bram").conditions, [{ id: "poisoned" }])
})

test("Smite of Protection: a Divine Smite gives Half Cover in the aura until Aria's next turn", () => {
  // Level 15. Divine Smite on the Ogre by the free cast, then the Ogre's Greatclub at Bram 5 feet from Aria: Armor Class
  // 18 and 2 for Half Cover is 20. At 15 feet from her he is out of the aura and has none.
  const smote = attackWithReactions({
    characters: [at(15), npc("ogre", "ogre", 68)],
    attackerId: "aria",
    targetId: "ogre",
    weapon: "longsword",
    dice: [15],
    roll: fours,
    choices: { smite: "divine-smite" },
    ask: () => false,
  })
  const aria = find(smote.characters, "aria") as Hero
  assert.ok(aria.turnEffects?.some((effect) => effect.id === "smite-of-protection" && effect.turns === 2))
  const ogre = npc("ogre", "ogre", 68, 10)
  const greatclub = attacksOf(ogre)[0]
  const against = (target: Hero) => attackRequirement({ character: ogre as never, target: target as never, attack: greatclub, present: [aria, target, ogre] as never })
  const near = against(bram(5))
  const far = against(bram(15))
  assert.ok("roll" in near && "roll" in far)
  if ("roll" in near && "roll" in far) assert.deepEqual([near.roll.difficulty, near.roll.attack.cover, far.roll.difficulty], [20, "half", 18])
})

test("Holy Nimbus burns an enemy that starts its turn in the aura, once a Long Rest or for a level 5 slot", () => {
  // Level 20: Charisma +4 and Proficiency Bonus +6 make 10 Radiant. The aura is 30 feet from level 18. The Ogre at 20
  // feet goes from 68 to 58. At 40 feet it is untouched.
  const lit = useBonusAction({ characters: [at(20)], actorId: "aria", feature: "holy-nimbus", roll: fours })
  const aria = find(lit.characters, "aria") as Hero
  assert.deepEqual(aria.featureUses, { "oath-of-devotion-holy-nimbus": 1 })
  const turned = roundTurns({ characters: [aria, npc("ogre", "ogre", 68, 20), npc("far", "ogre", 68, 40)] as never[], d20: () => 10, roll: fours })
  assert.deepEqual([find(turned.characters, "ogre").hitPoints, find(turned.characters, "far").hitPoints], [58, 68])
  // Spent and ended, a level 5 slot buys it again: two level 5 slots, one left.
  const again = useBonusAction({ characters: [{ ...aria, spellEffects: [] }], actorId: "aria", feature: "holy-nimbus", roll: fours })
  assert.deepEqual((find(again.characters, "aria").spellSlots as number[])[4], 1)
})
