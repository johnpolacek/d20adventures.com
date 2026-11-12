import assert from "node:assert/strict"
import { test } from "node:test"
import { attacksOf } from "../../src/sheet/attack"
import { choiceRule } from "../../src/sheet/class-rules"
import { smiteDamage, smitesOf } from "../../src/sheet/classes/paladin"
import { autoCreate, type CreationPick, createSheet } from "../../src/sheet/create"
import { attacksPerAction } from "../../src/sheet/feature-rules"
import { useBonusAction } from "../../src/sheet/features"
import { raisedTo } from "../../src/sheet/milestone"
import { attackWithReactions } from "../../src/sheet/reactions"
import type { Sheet } from "../../src/sheet/sheet"
import { attackModesFromSpells, markDamage } from "../../src/sheet/spell-effects"
import { spellsAtRoundEnd } from "../../src/sheet/spell-rounds"
import { castableOnTurn, castCost, castSpell, spellById } from "../../src/sheet/spells"
import type { Character } from "../../src/types/character"

// Every expected value below was worked out by hand from the SRD 5.2.1 text, not copied from the function's output.
// Aria is a human Paladin made by the creator: Strength 17 (19 from level 4, +4), Charisma 14 (+2), a Longsword
// (1d8 + Strength), Proficiency Bonus +2 to level 4 and +3 at 5, so her spell save DC at 5 is 8 + 3 + 2 = 13. She
// prepares Searing Smite at 3 and Shining Smite at 5, and takes the Oath of Devotion. Every die below falls as 4.

const pick = { class: "paladin", species: "human", background: "soldier" } as unknown as CreationPick
const made = (): Sheet => {
  const result = createSheet(pick, autoCreate(pick))
  if ("problems" in result) assert.fail(result.problems.join("; "))
  return result.sheet
}
type Hero = Character & { id: string; sheet: Sheet }
const at = (level: number, id = "aria", name = "Aria"): Hero => raisedTo({ id, name, type: "pc", sheet: made(), controlledBy: "ai" } as Hero, level)
const npc = (id: string, statBlock: string, hitPoints: number, position?: { x: number; y: number }): Character =>
  ({ id, name: id.charAt(0).toUpperCase() + id.slice(1), type: "npc", statBlock, hitPoints, ...(position ? { position } : {}) }) as Character
const fours = () => 4
const find = (characters: readonly Character[], id: string) => characters.find((character) => character.id === id) as Character & Record<string, unknown>
const swing = (characters: Character[], targetId: string, dice: number[], choices?: Record<string, string>, weapon = "longsword") =>
  attackWithReactions({ characters, attackerId: "aria", targetId, weapon, dice, roll: fours, choices, ask: () => false })

test("Divine Smite rides a melee hit: the free cast first, then a slot, its dice doubled on a Critical Hit", () => {
  const aria = at(5)
  // Level 5: four level 1 slots and two level 2, and Paladin's Smite's one free Divine Smite.
  assert.deepEqual(smitesOf(aria), ["divine-smite", "divine-smite-level-2", "searing-smite", "searing-smite-level-2", "shining-smite"])
  // A Ghoul is Undead (22 hit points, Armor Class 12). 15 + 7 hits. Longsword 4 + 4 = 8, and Divine Smite at level 1
  // is 2d8 and 1d8 more on an Undead: 12 Radiant. 22 - 20 = 2. The free cast is spent, and no slot.
  const first = swing([aria, npc("ghoul", "ghoul", 22)], "ghoul", [15], { smite: "divine-smite" })
  // Her Soldier's Savage Attacker rolls the weapon's dice twice, and with every die a 4 changes nothing.
  assert.deepEqual(first.blow.features, ["Divine Smite", "Savage Attacker"])
  assert.equal(first.blow.taken, 20)
  assert.equal(first.target.hitPoints, 2)
  const spent = find(first.characters, "aria")
  assert.deepEqual([spent.featureUses, spent.spellSlots], [{ "paladin-paladins-smite": 1 }, undefined])
  // It is one Bonus Action a turn: a second hit this turn adds none.
  const again = swing(first.characters, "ghoul", [15], { smite: "divine-smite" })
  assert.deepEqual([again.blow.features, again.blow.taken], [undefined, 8])
  // On a later turn, at level 2 on an Ogre, a Giant: 3d8, 12, and the weapon's 8. A level 2 slot is spent.
  const rested = { ...spent, turnEffects: [] } as Hero
  const ogre = swing([rested, npc("ogre", "ogre", 68)], "ogre", [15], { smite: "divine-smite-level-2" })
  assert.deepEqual([ogre.blow.taken, find(ogre.characters, "aria").spellSlots], [20, [0, 1]])
  // A 20 is a Critical Hit: every die twice. Longsword 2d8 + 4 = 12, and with the free cast gone a level 1 slot's
  // 2d8 thrown as 4d8 = 16.
  const critical = swing([rested, npc("ogre", "ogre", 68)], "ogre", [20], { smite: "divine-smite" })
  assert.deepEqual([critical.blow.roll.critical, critical.blow.taken, find(critical.characters, "aria").spellSlots], [true, 28, [1]])
  // A miss casts nothing and spends nothing. A Shortbow is no melee weapon, so no smite rides it.
  const miss = swing([aria, npc("ogre", "ogre", 68)], "ogre", [2], { smite: "divine-smite" })
  assert.deepEqual([miss.blow.taken, find(miss.characters, "aria").featureUses], [0, undefined])
  const shot = swing([aria, npc("ogre", "ogre", 68)], "ogre", [15], { smite: "divine-smite" }, "shortbow")
  assert.deepEqual([shot.blow.features?.includes("Divine Smite"), find(shot.characters, "aria").featureUses], [false, undefined])
  // An Imp is a Fiend: 3d8 at level 1. A smite is never cast on a turn of its own, and leaves no mark on later hits.
  const smite = spellById.get("divine-smite")
  if (!smite) assert.fail("no Divine Smite")
  assert.deepEqual(smiteDamage(smite, 1, npc("imp", "imp", 21)), { dice: "3d8", type: "radiant" })
  assert.equal(castableOnTurn(smite), false)
})

test("Searing Smite burns at each turn's start until a save, and Shining Smite holds Advantage under Concentration", () => {
  const aria = at(5)
  // Searing Smite with a level 1 slot: 1d6 Fire on the hit, 4, and the weapon's 8. 68 - 12 = 56.
  const seared = swing([aria, npc("ogre", "ogre", 68)], "ogre", [15], { smite: "searing-smite" })
  assert.deepEqual([seared.blow.taken, find(seared.characters, "aria").spellSlots], [12, [1]])
  assert.deepEqual(find(seared.characters, "ogre").spellEffects, [{ spell: "searing-smite", by: "aria", turns: 10, amount: 1 }])
  assert.deepEqual(markDamage("aria", seared.target), [])
  // As the round turns: 1d6 Fire, 4, then a Constitution save, +3 against DC 13. A 1 fails and it burns on; a 20 ends it.
  const burnt = spellsAtRoundEnd({ characters: seared.characters, d20: () => 1, roll: fours })
  assert.deepEqual([find(burnt.characters, "ogre").hitPoints, find(burnt.characters, "ogre").spellEffects?.length], [52, 1])
  const ended = spellsAtRoundEnd({ characters: burnt.characters, d20: () => 20, roll: fours })
  assert.deepEqual([find(ended.characters, "ogre").hitPoints, find(ended.characters, "ogre").spellEffects], [48, undefined])
  // Shining Smite takes a level 2 slot: 2d6 Radiant, 8, and the weapon's 8. Aria concentrates, and attacks on the Ogre have Advantage.
  const shone = swing([aria, npc("ogre", "ogre", 68)], "ogre", [15], { smite: "shining-smite" })
  assert.deepEqual([shone.blow.taken, find(shone.characters, "aria").spellSlots, find(shone.characters, "aria").concentration], [16, [0, 1], { spell: "shining-smite" }])
  assert.deepEqual(attackModesFromSpells(aria, shone.target), [{ mode: "advantage", from: "Shining Smite" }])
})

test("Sacred Weapon adds Charisma to a melee weapon's attack rolls and deals Radiant where it harms more", () => {
  const aria = at(3)
  const sacred = choiceRule("sacred")
  assert.equal(sacred?.offer(aria), true)
  // A use of Channel Divinity, of two. Longsword +5 becomes +7 with Charisma +2. An Unarmed Strike is no weapon.
  const applied = sacred?.apply?.([aria], "aria")
  const imbued = applied?.characters[0] as Hero
  assert.deepEqual(imbued.featureUses, { "paladin-channel-divinity": 1 })
  assert.equal(sacred?.offer(imbued), undefined)
  const bonus = (hero: Hero, id: string) => attacksOf(hero).find((attack) => attack.id === id)?.bonus
  assert.deepEqual([bonus(aria, "longsword"), bonus(imbued, "longsword"), bonus(imbued, "unarmed-strike")], [5, 7, 5])
  // A Ghost resists Slashing, not Radiant: the Longsword's 4 + 3 = 7 is dealt as Radiant, all of it, not 3.
  const ghost = attackWithReactions({ characters: [imbued, npc("ghost", "ghost", 45)], attackerId: "aria", targetId: "ghost", weapon: "longsword", dice: [15], roll: fours, ask: () => false })
  assert.deepEqual([ghost.blow.damage?.parts[0]?.type, ghost.blow.taken], ["radiant", 7])
})

test("Lay on Hands heals what is missing from a pool of five points a level, or spends 5 to end Poisoned", () => {
  // Level 3: 15 points. Brom, a level 3 Paladin, has 10 + 2 + 2 × (6 + 2) = 28 hit points at most and 10 now: he is
  // missing 18, and the pool gives its 15.
  const aria = at(3)
  const brom = { ...at(3, "brom", "Brom"), hitPoints: 10 }
  const healed = useBonusAction({ characters: [aria, brom], actorId: "aria", feature: "paladin-lay-on-hands", target: "brom", roll: fours })
  assert.deepEqual([find(healed.characters, "brom").hitPoints, find(healed.characters, "aria").featureUses, healed.use?.harm?.[0]?.amount], [25, { "paladin-lay-on-hands": 15 }, 15])
  // With none given, she touches herself: at 20 of 28 she regains 8, and 7 are left.
  const self = useBonusAction({ characters: [{ ...aria, hitPoints: 20 }], actorId: "aria", feature: "paladin-lay-on-hands", roll: fours })
  assert.deepEqual([find(self.characters, "aria").hitPoints, find(self.characters, "aria").featureUses], [28, { "paladin-lay-on-hands": 8 }])
  // Poisoned Brom: 5 points end it, and heal nothing.
  const poisoned = { ...brom, conditions: [{ id: "poisoned" as const }] }
  const cured = useBonusAction({ characters: [aria, poisoned], actorId: "aria", feature: "lay-on-hands-poison", target: "brom", roll: fours })
  assert.deepEqual([find(cured.characters, "brom").conditions, find(cured.characters, "brom").hitPoints, find(cured.characters, "aria").featureUses], [undefined, 10, { "paladin-lay-on-hands": 5 }])
})

test("Divine Sense names the Celestials, Fiends and Undead within 60 feet, for a use of Channel Divinity", () => {
  const aria = { ...at(3), position: { x: 0, y: 0 } }
  const sensed = useBonusAction({
    characters: [aria, npc("ghoul", "ghoul", 22, { x: 30, y: 0 }), npc("imp", "imp", 21, { x: 90, y: 0 }), npc("bandit", "bandit", 11, { x: 10, y: 0 })],
    actorId: "aria",
    feature: "divine-sense",
    roll: fours,
  })
  assert.match(sensed.use?.fact ?? "", /within 60 feet is: Ghoul \(Undead\)\./)
  assert.deepEqual(find(sensed.characters, "aria").featureUses, { "paladin-channel-divinity": 1 })
})

test("a level 5 Paladin attacks twice, casts a level 1 spell with a slot, and Find Steed once with none", () => {
  const aria = at(5)
  assert.equal(attacksPerAction(aria), 2)
  // Bless takes a level 1 slot and goes on the three she names, here herself.
  const cost = castCost(aria, "bless")
  if ("problem" in cost) assert.fail(cost.problem)
  assert.deepEqual(cost.cost, { kind: "slot", level: 1 })
  const bless = spellById.get("bless")
  if (!bless) assert.fail("no Bless")
  const cast = castSpell({ characters: [aria], casterId: "aria", spell: bless, targets: ["aria"], d20: () => 10, roll: fours })
  assert.deepEqual(find(cast.characters, "aria").spellEffects, [{ spell: "bless", by: "aria", turns: 10 }])
  // Faithful Steed: Find Steed always prepared, cast once a Long Rest with no slot.
  const steed = castCost(aria, "find-steed")
  if ("problem" in steed) assert.fail(steed.problem)
  assert.deepEqual(steed.cost, { kind: "free", feature: "paladin-faithful-steed" })
})
