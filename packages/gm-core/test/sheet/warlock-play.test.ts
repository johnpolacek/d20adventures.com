import assert from "node:assert/strict"
import { test } from "node:test"
import { attacksOf } from "../../src/sheet/attack"
import { attackAfter, followingRoll, type InScene } from "../../src/sheet/attack-roll"
import { afterFelled, type ChoiceContext, choiceRule, classConcentrationModes, effectChoice, type Featured } from "../../src/sheet/class-rules"
import { autoCreate, type CreationPick, createSheet } from "../../src/sheet/create"
import { deriveSheet } from "../../src/sheet/derive"
import { raisedTo } from "../../src/sheet/milestone"
import { attackWithReactions } from "../../src/sheet/reactions"
import type { Sheet } from "../../src/sheet/sheet"
import { settleConcentration } from "../../src/sheet/spell-effects"
import { castInSpace } from "../../src/sheet/spell-space"
import { castCost, castSpell, spellById, spellsOf, withCastSpent } from "../../src/sheet/spells"
import type { Character } from "../../src/types/character"
import type { RequiredRoll } from "../../src/validations/roll-requirement-schema"

// Every expected value below was worked out by hand from the SRD 5.2.1 text, not copied from the function's output.
// Vex is a human Warlock made by the creator, of the Fiend Patron from level 3. At level 5 her Charisma modifier is +3
// and her Proficiency Bonus +3, so her spell attacks are +6, and she has two level 3 Pact Magic slots. Her Strength
// modifier is -1. An Ogre is Large, Armor Class 11, 68 hit points. A Bandit is Armor Class 12, 11 hit points. Every
// die below falls as 4 unless it says otherwise.

const pick = { class: "warlock", species: "human", background: "criminal" } as unknown as CreationPick
const made = (): Sheet => {
  const result = createSheet(pick, autoCreate(pick))
  if ("problems" in result) assert.fail(result.problems.join("; "))
  return result.sheet
}
type Hero = Character & { id: string; sheet: Sheet }
const at = (level: number): Hero => raisedTo({ id: "vex", name: "Vex", type: "pc", sheet: made(), controlledBy: "ai" } as Hero, level)
// Vex at a level with the invocations named in place of the creator's picks, each with the cantrip it is taken for.
const invoking = (level: number, picks: { option: string; cantrip?: string }[], extra: Partial<Hero> = {}): Hero => {
  const vex = at(level)
  return { ...vex, ...extra, sheet: { ...vex.sheet, featurePicks: { "warlock-eldritch-invocations": picks } } } as Hero
}
const npc = (id: string, statBlock: string, hitPoints: number, position?: { x: number; y: number }): Character =>
  ({ id, name: id.charAt(0).toUpperCase() + id.slice(1), type: "npc", statBlock, hitPoints, ...(position ? { position } : {}) }) as Character
const fours = () => 4
const find = (characters: readonly Character[], id: string) => characters.find((character) => character.id === id) as Character & Record<string, unknown>
const blast = (characters: Character[], targets: string[], floor?: { solids: []; doors: [] }) => {
  const spell = spellById.get("eldritch-blast")
  if (!spell) assert.fail("no Eldritch Blast")
  return castSpell({ characters, casterId: "vex", spell, targets, attackDice: [15], d20: () => 15, roll: fours, floor })
}

test("Eldritch Blast: one beam to level 4 and two at 5, each its own roll and target, with Agonizing Blast on each", () => {
  // The creator gave Vex Agonizing Blast for Eldritch Blast at level 3. Each beam: 15 + 6 = 21 hits, 1d10 is 4, and
  // the Charisma modifier 3 is added: 7. The Ogre falls to 61 and the Bandit to 4.
  const five = blast([at(5), npc("ogre", "ogre", 68), npc("bandit", "bandit", 11)], ["ogre", "bandit"])
  assert.deepEqual(
    five.rays?.map((ray) => [ray.target, ray.roll.total, ray.taken]),
    [
      ["ogre", 21, 7],
      ["bandit", 21, 7],
    ]
  )
  assert.deepEqual([find(five.characters, "ogre").hitPoints, find(five.characters, "bandit").hitPoints], [61, 4])
  // At level 3 one beam, on the first named, with Charisma +2 (15 + 4 = 19 hits): 4 + 2 = 6.
  const three = blast([at(3), npc("ogre", "ogre", 68), npc("bandit", "bandit", 11)], ["ogre", "bandit"])
  assert.deepEqual([three.rays, three.attack?.taken, find(three.characters, "bandit").hitPoints], [undefined, 6, 11])
  // With no Agonizing Blast a beam is the die alone: 4.
  const bare = blast([invoking(5, []), npc("ogre", "ogre", 68)], ["ogre"])
  assert.deepEqual(
    bare.rays?.map((ray) => ray.taken),
    [4, 4]
  )
})

test("Repelling Blast pushes a Large creature 10 feet a beam over the floor, and Eldritch Spear reaches 270 feet at level 5", () => {
  const vex = invoking(
    5,
    [
      { option: "repelling-blast", cantrip: "eldritch-blast" },
      { option: "eldritch-spear", cantrip: "eldritch-blast" },
    ],
    { position: { x: 0, y: 0 } }
  )
  const floor = { solids: [] as [], doors: [] as [] }
  // Both beams hit the Ogre 20 feet off, and each pushes it 10 feet straight away: it ends 40 feet off.
  const pushed = blast([vex, npc("ogre", "ogre", 68, { x: 20, y: 0 })], ["ogre"], floor)
  assert.deepEqual(find(pushed.characters, "ogre").position, { x: 40, y: 0 })
  // With no floor nothing says what stands in the way, so it is not pushed.
  assert.deepEqual(find(blast([vex, npc("ogre", "ogre", 68, { x: 20, y: 0 })], ["ogre"]).characters, "ogre").position, { x: 20, y: 0 })
  // Eldritch Spear: 120 feet and 30 times the Warlock level, 150, so an Ogre 200 feet off is in range. Without it, out of it.
  const spell = spellById.get("eldritch-blast")
  if (!spell) assert.fail("no Eldritch Blast")
  const far = { ...npc("ogre", "ogre", 68, { x: 200, y: 0 }), id: "ogre" }
  assert.deepEqual(castInSpace({ spell, caster: vex, everyone: [vex, far], named: ["ogre"], floor }).targets, ["ogre"])
  const plain = { ...vex, sheet: { ...vex.sheet, featurePicks: {} } }
  assert.equal(castInSpace({ spell, caster: plain, everyone: [plain, far], named: ["ogre"], floor }).problem?.name, "Out Of Range")
})

test("An invocation's spells are cast with no slot: at will, Fiendish Vigor at the die's highest, Gift of the Depths once", () => {
  const vex = invoking(5, [{ option: "armor-of-shadows" }, { option: "fiendish-vigor" }, { option: "one-with-shadows" }, { option: "gift-of-the-depths" }])
  const known = spellsOf(vex)
  const of = (id: string) => known.find((entry) => entry.spell.id === id)
  assert.deepEqual([of("mage-armor")?.atWill, of("mage-armor")?.selfOnly, of("false-life")?.atWill], [true, true, true])
  // One with Shadows' Invisibility needs Dim Light or Darkness, which the engine does not know: it is not given.
  assert.equal(of("invisibility"), undefined)
  const paid = (id: string, hero: Hero = vex, slot?: number) => {
    const cost = castCost(hero, id, false, slot)
    return "problem" in cost ? cost.problem : cost.cost
  }
  assert.deepEqual(paid("mage-armor"), { kind: "cantrip" })
  // Water Breathing once a Long Rest, counted under the invocation, and then not at all.
  const water = paid("water-breathing")
  assert.deepEqual(water, { kind: "free", feature: "gift-of-the-depths" })
  assert.match(paid("water-breathing", withCastSpent(vex, water as { kind: "free"; feature: string })) as string, /no casting left/)
  // False Life is 2d4 + 4 Temporary Hit Points. Cast with Fiendish Vigor each die counts its most: 4 + 4 + 4 = 12, though
  // the dice fall as 2. Cast with a level 3 slot the dice are rolled, 2 + 2 + 4, and 5 more for each of the two slot
  // levels above 1: 18.
  const spell = spellById.get("false-life")
  if (!spell) assert.fail("no False Life")
  const twos = () => 2
  assert.equal(find(castSpell({ characters: [vex], casterId: "vex", spell, targets: ["vex"], d20: () => 10, roll: twos }).characters, "vex").tempHitPoints, 12)
  assert.deepEqual(paid("false-life", vex, 3), { kind: "slot", level: 3 })
  assert.equal(find(castSpell({ characters: [vex], casterId: "vex", spell, targets: ["vex"], d20: () => 10, roll: twos, level: 3 }).characters, "vex").tempHitPoints, 18)
})

test("Eldritch Mind keeps Concentration with Advantage, and Magical Cunning is a rite out of a fight", () => {
  // 10 damage asks a Constitution save against DC 10. The d20s fall 3, then 17. With Advantage the 17 counts.
  const save = (hero: Hero) => {
    const dice = [3, 17]
    return settleConcentration({
      before: [{ ...hero, hitPoints: 38, concentration: { spell: "hex" } }],
      after: [{ ...hero, hitPoints: 28, concentration: { spell: "hex" } }],
      bonus: () => 2,
      modes: classConcentrationModes,
      d20: () => dice.shift() ?? 1,
    }).saves[0]
  }
  assert.deepEqual([save(invoking(5, [{ option: "eldritch-mind" }])).natural, save(invoking(5, [{ option: "eldritch-mind" }])).success], [17, true])
  assert.deepEqual([save(invoking(5, [])).natural, save(invoking(5, [])).success], [3, false])

  // Both level 3 slots spent. Magical Cunning gives back half of two, rounded up: one.
  const spent = { ...at(5), spellSlots: [0, 0, 2] } as Hero
  const rule = choiceRule("magical-cunning")
  assert.equal(rule?.offer(spent), true)
  const context = (fight: boolean) => ({ character: spent, self: "vex", everyone: [], pick: { check: "magical-cunning", fight }, named: () => false, also: {} }) as unknown as ChoiceContext
  assert.equal(rule?.act?.(undefined, context(true)).ruling?.name, "Too Long For A Fight")
  const reading = rule?.act?.(undefined, context(false))
  const feature = reading?.feature
  if (!feature) assert.fail("Magical Cunning made no reading")
  const used = effectChoice(feature.feature.id)?.resolve?.({ characters: [spent as Featured], actorId: "vex", feature: feature.feature, d20: () => 10, roll: fours })
  const after = used?.characters[0] as Hero & { spellSlots?: number[] }
  assert.deepEqual([after.spellSlots, after.featureUses], [[0, 0, 1], { "warlock-magical-cunning": 1 }])
  assert.equal(rule?.offer(after), undefined)
})

test("Dark One's Blessing: Temporary Hit Points of Charisma and Warlock level, on her kill or one within 10 feet", () => {
  // Level 5, Charisma +3: 3 + 5 = 8.
  const vex = { ...at(5), position: { x: 0, y: 0 } }
  const ally = { id: "ally", name: "Ally", type: "pc" } as Character
  const fall = (by: string, at: { x: number; y: number }, hero: Hero = vex) =>
    find(afterFelled({ before: [hero, ally, npc("ogre", "ogre", 5, at)], after: [hero, ally, npc("ogre", "ogre", 0, at)], by }).characters, "vex").tempHitPoints
  assert.equal(fall("vex", { x: 60, y: 0 }), 8)
  assert.equal(fall("ally", { x: 10, y: 0 }), 8)
  assert.equal(fall("ally", { x: 60, y: 0 }), undefined)
  // Before level 3 she has no patron, and so no blessing.
  assert.equal(fall("vex", { x: 5, y: 0 }, { ...at(2), position: { x: 0, y: 0 } }), undefined)
  // The Fiend Spells are always prepared: four at level 3, and Fireball and Stinking Cloud at 5.
  const fiend = ["burning-hands", "command", "scorching-ray", "suggestion", "fireball", "stinking-cloud"]
  assert.deepEqual(
    [3, 5].map((level) => fiend.filter((id) => deriveSheet(at(level).sheet).preparedSpells.includes(id)).length),
    [4, 6]
  )
})

test("Pact of the Blade attacks with Charisma, Thirsting Blade twice, and Eldritch Smite spends a slot on a hit", () => {
  const blade = [{ option: "pact-of-the-blade" }, { option: "thirsting-blade" }, { option: "eldritch-smite" }]
  const vex = invoking(5, blade)
  const sworn = { ...vex, sheet: { ...vex.sheet, weapons: ["longsword", "dagger"] } } as Hero
  // The Longsword is her pact weapon: Charisma +3 for Strength -1, and proficiency, +3, though a Warlock is not trained
  // in Martial weapons: +6, 1d8 + 3. The Dagger is not: Finesse with Dexterity +3, trained: +6, 1d4 + 3.
  const own = attacksOf(sworn)
  assert.deepEqual(
    own.filter((entry) => entry.id !== "unarmed-strike").map((entry) => [entry.id, entry.bonus, entry.damage[0]?.dice]),
    [
      ["longsword", 6, "1d8 + 3"],
      ["dagger", 6, "1d4 + 3"],
    ]
  )
  // A Ghost resists Slashing and is immune to Necrotic, so the pact weapon deals Psychic: 4 + 3 = 7, in full.
  const ghost = attackWithReactions({ characters: [sworn, npc("ghost", "ghost", 45)], attackerId: "vex", targetId: "ghost", weapon: "longsword", dice: [15], roll: fours, ask: () => false })
  assert.deepEqual([ghost.blow.taken, ghost.target.hitPoints], [7, 38])
  // Eldritch Smite with a level 3 slot: 1d8 and 1d8 a slot level, 4d8, 16 Force, and the Longsword's 7: 23. The Ogre,
  // Large, falls Prone, and one slot is spent.
  const smite = attackWithReactions({
    characters: [sworn, npc("ogre", "ogre", 68)],
    attackerId: "vex",
    targetId: "ogre",
    weapon: "longsword",
    dice: [15],
    roll: fours,
    choices: { "eldritch-smite": "smite" },
    ask: () => false,
  })
  assert.deepEqual([smite.blow.taken, smite.target.hitPoints, find(smite.characters, "vex").spellSlots], [23, 45, [0, 0, 1]])
  assert.ok((smite.target as Character & { conditions?: { id: string }[] }).conditions?.some((entry) => entry.id === "prone"))
  // Thirsting Blade: a second attack with the pact weapon, and none after the Dagger.
  const scene = { ...sworn, position: { x: 0, y: 0 } } as unknown as InScene
  const ogre = npc("ogre", "ogre", 68, { x: 5, y: 0 }) as unknown as InScene
  assert.deepEqual(attackAfter(scene), { "thirsting-blade": true })
  const swung = (weapon: string): RequiredRoll => ({ attack: { weapon, target: "ogre" }, rollType: weapon, difficulty: 11, modifier: 6, mode: "normal", after: { "thirsting-blade": true } })
  const second = followingRoll({ character: scene, made: swung("longsword"), present: [scene, ogre], floor: { solids: [], doors: [] } })
  assert.deepEqual(second && "attack" in second ? [second.attack.weapon, second.attack.target] : undefined, ["longsword", "ogre"])
  assert.equal(followingRoll({ character: scene, made: swung("dagger"), present: [scene, ogre], floor: { solids: [], doors: [] } }), undefined)
})
