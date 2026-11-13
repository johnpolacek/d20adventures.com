import assert from "node:assert/strict"
import { test } from "node:test"
import { afterRoll } from "../../src/sheet/actions"
import { defensesOf } from "../../src/sheet/attack"
import { attackRequirement, type InScene } from "../../src/sheet/attack-roll"
import { choiceRule, classAttackModes, type Featured } from "../../src/sheet/class-rules"
import { ranger } from "../../src/sheet/classes/ranger"
import { withoutCondition } from "../../src/sheet/conditions"
import { autoCreate, type CreationPick, createSheet } from "../../src/sheet/create"
import { deriveSheet, sheetProblems } from "../../src/sheet/derive"
import { bonusActionsOf, useBonusAction } from "../../src/sheet/features"
import { raisedTo } from "../../src/sheet/milestone"
import { attackWithReactions, moveWithReactions } from "../../src/sheet/reactions"
import type { Sheet } from "../../src/sheet/sheet"
import { settleConcentration } from "../../src/sheet/spell-effects"
import { spellsAtRoundEnd } from "../../src/sheet/spell-rounds"
import type { Character } from "../../src/types/character"
import type { RequiredFeature, RequiredRoll } from "../../src/validations/roll-requirement-schema"

// Every expected value below was worked out by hand from the SRD 5.2.1 text (pp. 58 to 61), not copied from the
// functions' output. Sylas is an elf Criminal Ranger (Alert, so no Savage Attacker rerolls the weapon) made by the creator and raised by the choices that need no player,
// which take the Hunter at 3 with Colossus Slayer, and Escape the Horde at 7. Dexterity is 18 (+4) at 5 and 6 and 20
// (+5) from 8; Wisdom 14 (+2) to 12, 16 (+3) at 13 to 16 and 18 (+4) from 17. The Proficiency Bonus is +3 at 5 and 6,
// +4 at 7 to 12, +5 at 13 to 16 and +6 from 17. Studded Leather and Dexterity give Armor Class 16 at 5 and 6 and 17
// from 8. The Longbow attacks at Dexterity, the Proficiency Bonus and Archery's 2, for 1d8 + Dexterity Piercing. The
// spell save DC is 8 + Proficiency Bonus + Wisdom: 13 at 5, 14 at 10, 16 at 13 and 18 at 17. An Ogre is Large, Armor
// Class 11, 68 hit points, a Strength save of +4, and a Greatclub of +6 for 2d8 + 4 Bludgeoning. A Bandit is Medium,
// Armor Class 12, 11 hit points, a Strength save of +0.

const pick = { class: "ranger", species: "elf", background: "criminal" } as unknown as CreationPick
const made = (): Sheet => {
  const result = createSheet(pick, autoCreate(pick))
  if ("problems" in result) assert.fail(result.problems.join("; "))
  return result.sheet
}
type Hero = Character & InScene & { sheet: Sheet; hitPoints: number; tempHitPoints?: number; featureUses?: Record<string, number>; spellSlots?: number[] }
const sylas = (level: number, extra: Partial<Hero> = {}, tactics?: string): Hero => {
  const raised = raisedTo({ id: "sylas", name: "Sylas", type: "pc", sheet: made(), controlledBy: "ai" } as Hero, level)
  const sheet = tactics ? { ...raised.sheet, featureChoices: { ...raised.sheet.featureChoices, "hunter-defensive-tactics": tactics } } : raised.sheet
  return { ...raised, sheet, hitPoints: deriveSheet(sheet).hitPointMaximum, position: { x: 0, y: 0 }, ...extra } as Hero
}
const npc = (id: string, statBlock: string, hitPoints: number, x: number, extra: Record<string, unknown> = {}): Hero =>
  ({ id, name: id.charAt(0).toUpperCase() + id.slice(1), type: "npc", statBlock, hitPoints, position: { x, y: 0 }, ...extra }) as unknown as Hero
const marked = { spellEffects: [{ spell: "hunters-mark", by: "sylas" }] }
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() ?? 1
const find = (characters: readonly Hero[], id: string) => characters.find((character) => character.id === id) as Hero
const never = () => false

test("Roving: Speed 10 more at 6, with a Climb and Swim Speed equal to it, and the sheet legal at high level", () => {
  for (const level of [6, 10, 14, 17, 20]) assert.deepEqual(sheetProblems(sylas(level).sheet), [], `level ${level}`)
  // An elf's Speed is 30. Roving: 40 out of Heavy armor, and Climb and Swim Speeds of 40.
  assert.deepEqual([deriveSheet(sylas(5).sheet).speed, deriveSheet(sylas(5).sheet).speeds], [30, {}])
  assert.deepEqual([deriveSheet(sylas(6).sheet).speed, deriveSheet(sylas(6).sheet).speeds], [40, { climb: 40, swim: 40 }])
})

test("Precise Hunter: Advantage on attack rolls against the one marked, from 17", () => {
  const ogre = npc("ogre", "ogre", 68, 30, marked)
  assert.deepEqual(classAttackModes({ attacker: sylas(17), target: ogre }), [{ mode: "advantage", from: "Precise Hunter" }])
  assert.deepEqual(classAttackModes({ attacker: sylas(16), target: ogre }), [])
  // Another's mark gives nothing.
  assert.deepEqual(classAttackModes({ attacker: sylas(17), target: npc("ogre", "ogre", 68, 30, { spellEffects: [{ spell: "hunters-mark", by: "someone" }] }) }), [])
  // The read's roll: Longbow at 17, +6 + 5 + 2 = 13, against Armor Class 11, with Advantage.
  const hero = sylas(17)
  const asked = attackRequirement({
    character: hero,
    target: ogre,
    attack: { id: "longbow", name: "Longbow", kind: "ranged", bonus: 13, damage: [], range: { normal: 150, long: 600 } } as never,
    present: [hero, ogre],
  })
  assert.ok("roll" in asked)
  assert.deepEqual([asked.roll.mode, asked.roll.reasons], ["advantage", ["Precise Hunter"]])
})

test("Escape the Horde: an Opportunity Attack at the Ranger has Disadvantage", () => {
  // The Ogre's Greatclub is +6 against Armor Class 17. With Disadvantage the 18 and the 3 keep the 3: 9 misses. With
  // Multiattack Defense in its place the first die stands: 24 hits, for 2d8 + 4 = 5 + 5 + 4 = 14.
  const leave = (tactics: string) =>
    moveWithReactions({
      characters: [sylas(8, {}, tactics), npc("ogre", "ogre", 68, 5)],
      moverId: "sylas",
      path: [{ x: -30, y: 0 }],
      ask: () => true,
      d20: falls(18, 3),
      roll: () => 5,
    })
  const escaped = leave("escape-the-horde")
  assert.deepEqual([escaped.attacks.length, escaped.attacks[0]?.blow.roll.mode, escaped.attacks[0]?.blow.roll.hit], [1, "disadvantage", false])
  const struck = leave("multiattack-defense")
  assert.deepEqual([struck.attacks[0]?.blow.roll.hit, struck.attacks[0]?.blow.taken], [true, 14])
  assert.deepEqual(classAttackModes({ attacker: npc("ogre", "ogre", 68, 5), target: sylas(8), opportunity: true }), [{ mode: "disadvantage", from: "Escape the Horde" }])
  assert.deepEqual(classAttackModes({ attacker: npc("ogre", "ogre", 68, 5), target: sylas(8) }), [])
})

test("Multiattack Defense: one who hits the Ranger has Disadvantage on its other attack rolls at them this turn", () => {
  // The Ogre's 15 + 6 = 21 hits Armor Class 17 for 2d8 + 4 = 4 + 4 + 4 = 12.
  const ogre = npc("ogre", "ogre", 68, 5)
  const hit = attackWithReactions({ characters: [sylas(7, {}, "multiattack-defense"), ogre], attackerId: "ogre", targetId: "sylas", weapon: "greatclub", dice: [15], roll: () => 4, ask: never })
  assert.equal(hit.blow.taken, 12)
  const club = { id: "greatclub", name: "Greatclub", kind: "melee", bonus: 6, damage: [], reach: 5 } as never
  const next = (characters: Hero[], attacker = "ogre") => attackRequirement({ character: find(characters, attacker), target: find(characters, "sylas"), attack: club, present: characters })
  const second = next(hit.characters as Hero[])
  assert.ok("roll" in second)
  assert.deepEqual([second.roll.mode, second.roll.reasons], ["disadvantage", ["Multiattack Defense"]])
  // Its turn over, the mark no longer holds. Another attacker never had it.
  const over = (hit.characters as Hero[]).map((character) => (character.id === "ogre" ? { ...character, isComplete: true } : character))
  const later = next(over)
  assert.ok("roll" in later)
  assert.equal(later.roll.mode, "normal")
  const other = next([...(hit.characters as Hero[]), npc("brute", "ogre", 68, -5)], "brute")
  assert.ok("roll" in other)
  assert.equal(other.roll.mode, "normal")
  // Escape the Horde leaves no such mark.
  assert.equal(attackWithReactions({ characters: [sylas(7), ogre], attackerId: "ogre", targetId: "sylas", weapon: "greatclub", dice: [15], roll: () => 4, ask: never }).target.turnEffects, undefined)
})

test("Tireless: Temporary Hit Points of 1d8 plus Wisdom as the action, Wisdom times a Long Rest, and Exhaustion off on a Short Rest", () => {
  const rule = choiceRule("tireless")
  assert.equal(rule?.offer(sylas(9)), undefined)
  assert.equal(rule?.offer(sylas(10)), true)
  const feature = { id: "tireless", targets: ["sylas"] } as RequiredFeature["feature"]
  const use = (hero: Hero, die: number) => rule?.resolve?.({ characters: [hero as unknown as Featured], actorId: "sylas", feature, d20: () => 10, roll: () => die })
  // Level 10, Wisdom +2: a 3 gives 5, and spends one of 2 uses.
  const first = use(sylas(10), 3)
  assert.deepEqual([(first?.characters[0] as Hero).tempHitPoints, (first?.characters[0] as Hero).featureUses?.["ranger-tireless"]], [5, 1])
  // Temporary Hit Points do not add: 8 held beats a new 5.
  assert.equal((use(sylas(10, { tempHitPoints: 8 }), 3)?.characters[0] as Hero).tempHitPoints, 8)
  // Both uses spent: none left.
  assert.ok(use(sylas(10, { featureUses: { "ranger-tireless": 2 } }), 3)?.problem)
  // A Short Rest takes Exhaustion 2 to 1. Before level 10 it does not.
  const tired = { conditions: [{ id: "exhaustion" as const, level: 2 as const }] }
  assert.deepEqual(ranger.shortRest?.(sylas(10, tired)).character.conditions, [{ id: "exhaustion", level: 1 }])
  assert.deepEqual(ranger.shortRest?.(sylas(9, tired)).character.conditions, [{ id: "exhaustion", level: 2 }])
})

test("Nature's Veil: a Bonus Action, Invisible through the Ranger's next turn, which an attack does not end", () => {
  // Level 14, Wisdom +3: three uses. Given on the Ranger's own turn, it covers that turn and the next: 2.
  const hero = sylas(14)
  assert.equal(bonusActionsOf(hero).find((action) => action.id === "ranger-natures-veil")?.uses, 3)
  const veiled = useBonusAction({ characters: [hero as unknown as Featured], actorId: "sylas", feature: "ranger-natures-veil", roll: () => 1 })
  const now = veiled.characters[0] as Hero
  assert.deepEqual([now.conditions, now.featureUses?.["ranger-natures-veil"]], [[{ id: "invisible", source: "sylas", turns: 2, feature: "ranger-natures-veil" }], 1])
  // A shot keeps it. A hide's Invisible goes.
  const shot = { attack: { weapon: "longbow", target: "ogre" }, rollType: "Longbow", difficulty: 11, modifier: 13, mode: "advantage" } as RequiredRoll
  const ogre = npc("ogre", "ogre", 68, 30)
  assert.equal(find(afterRoll([now, ogre], "sylas", shot, 10) as Hero[], "sylas").conditions?.length, 1)
  assert.equal(find(afterRoll([{ ...now, conditions: [{ id: "invisible" }] }, ogre], "sylas", shot, 10) as Hero[], "sylas").conditions, undefined)
})

test("Relentless Hunter: damage does not break Concentration on Hunter's Mark from 13", () => {
  // 20 damage asks a Constitution save against DC 10. The die falls 1: 1 + 2 fails.
  const settle = (level: number, spell: string) => {
    const was = sylas(level, { concentration: { spell } })
    return settleConcentration({ before: [was], after: [{ ...was, hitPoints: was.hitPoints - 20 }], bonus: () => 2, d20: () => 1 })
  }
  const kept = settle(13, "hunters-mark")
  assert.deepEqual([kept.saves.length, kept.characters[0].concentration], [0, { spell: "hunters-mark" }])
  assert.deepEqual(settle(12, "hunters-mark").characters[0].concentration, undefined)
  assert.deepEqual([settle(13, "entangle").saves.length, settle(13, "entangle").characters[0].concentration], [1, undefined])
})

test("Foe Slayer: Hunter's Mark's die is a d10 at 20", () => {
  // Longbow at 20: 1d8 + 5. The 15 hits Armor Class 11. A 4 on the d8 and a 9 on the mark's d10: 4 + 5 + 9 = 18.
  const shoot = (level: number, dice: number[]) =>
    attackWithReactions({ characters: [sylas(level), npc("ogre", "ogre", 68, 30, marked)], attackerId: "sylas", targetId: "ogre", weapon: "longbow", dice: [15], roll: falls(...dice), ask: never })
  const twenty = shoot(20, [4, 9])
  assert.deepEqual([twenty.blow.damage?.parts[1]?.sides, twenty.blow.taken, twenty.target.hitPoints], [10, 18, 50])
  // At 19 it is a d6: 4 + 5 + 6 = 15.
  const nineteen = shoot(19, [4, 6])
  assert.deepEqual([nineteen.blow.damage?.parts[1]?.sides, nineteen.blow.taken], [6, 15])
})

test("Superior Hunter's Prey: the mark's damage also strikes another within 30 feet of the first, once a turn", () => {
  // Level 11: Longbow 1d8 + 5. The 15 hits the marked Ogre (Armor Class 11) for 4 + 5 + 3 = 12, leaving 56. The
  // Bandit 10 feet past it takes the mark's 1d6, a 5: 6 of 11 left. One 70 feet past it is out of reach.
  const characters = [sylas(11), npc("ogre", "ogre", 68, 30, marked), npc("bandit", "bandit", 11, 40), npc("far", "bandit", 11, 100)]
  const shot = attackWithReactions({ characters, attackerId: "sylas", targetId: "ogre", weapon: "longbow", dice: [15], roll: falls(4, 3, 5), ask: never })
  assert.deepEqual(
    ["ogre", "bandit", "far"].map((id) => find(shot.characters as Hero[], id).hitPoints),
    [56, 6, 11]
  )
  assert.deepEqual(
    shot.reactions.map((told) => told.name),
    ["Superior Hunter's Prey"]
  )
  // The second shot of the turn deals the mark to the Ogre alone. Hurt now, it takes Colossus Slayer's 1d8 too: the d8s
  // fall 4 and 3, the mark's d6 5, for 4 + 5 + 3 + 5 = 17, leaving 39.
  const again = attackWithReactions({ characters: shot.characters, attackerId: "sylas", targetId: "ogre", weapon: "longbow", dice: [15], roll: falls(4, 3, 5), ask: never })
  assert.deepEqual([find(again.characters as Hero[], "ogre").hitPoints, find(again.characters as Hero[], "bandit").hitPoints, again.reactions.length], [39, 6, 0])
  // Before level 11 nothing spills.
  const ten = attackWithReactions({ characters: [sylas(10), ...characters.slice(1)], attackerId: "sylas", targetId: "ogre", weapon: "longbow", dice: [15], roll: falls(4, 3, 5), ask: never })
  assert.equal(find(ten.characters as Hero[], "bandit").hitPoints, 11)
})

test("Superior Hunter's Defense: a Reaction for Resistance to the hit's damage type for the rest of the turn", () => {
  // The Ogre's 21 hits for 2d8 + 4 = 5 + 6 + 4 = 15 Bludgeoning, halved to 7. A second hit of 15 is halved by the
  // Resistance kept, with no Reaction left: 7 again.
  const club = (characters: Hero[]) => attackWithReactions({ characters, attackerId: "ogre", targetId: "sylas", weapon: "greatclub", dice: [15], roll: falls(5, 6), ask: () => true })
  const hero = sylas(15)
  const first = club([hero, npc("ogre", "ogre", 68, 5)])
  assert.deepEqual([first.blow.taken, first.reactions.map((taken) => taken.name)], [7, ["Superior Hunter's Defense"]])
  assert.ok(defensesOf(first.target).resistances?.includes("bludgeoning"))
  const second = club(first.characters as Hero[])
  assert.deepEqual([second.blow.taken, second.reactions.length, second.target.hitPoints], [7, 0, hero.hitPoints - 14])
  // At 14 there is none.
  assert.equal(club([sylas(14), npc("ogre", "ogre", 68, 5)]).blow.taken, 15)
})

test("Ensnaring Strike rides a weapon's hit: a Strength save or Restrained, the slot spent, and its burn as a round turns", () => {
  // Level 5: Longbow +9 for 1d8 + 4, spell save DC 13, slots 4 and 2. The 15 hits the Bandit's Armor Class 12 for 4 + 4
  // = 8, leaving 3. Its Strength save is d20 + 0: a 5 fails, and it is Restrained.
  const shoot = (choices: Record<string, string>, target: Hero, dice: number[]) =>
    attackWithReactions({ characters: [sylas(5), target], attackerId: "sylas", targetId: target.id, weapon: "longbow", dice: [15], roll: falls(...dice), ask: never, choices })
  assert.deepEqual(choiceRule("ensnare")?.offer(sylas(5)), ["ensnaring-strike", "ensnaring-strike-level-2"])
  const caught = shoot({ ensnare: "ensnaring-strike" }, npc("bandit", "bandit", 11, 30), [4, 5])
  const bandit = find(caught.characters as Hero[], "bandit")
  const hero = find(caught.characters as Hero[], "sylas")
  assert.deepEqual([bandit.hitPoints, bandit.conditions?.map((entry) => [entry.id, entry.spell])], [3, [["restrained", "ensnaring-strike"]]])
  assert.deepEqual([hero.spellSlots, hero.concentration], [[1], { spell: "ensnaring-strike" }])
  // As the round turns it takes 1d6 Piercing, a 2: 1 left.
  const burnt = spellsAtRoundEnd({ characters: caught.characters as Hero[], d20: () => 10, roll: () => 2 })
  assert.equal(find(burnt.characters as Hero[], "bandit").hitPoints, 1)
  // Broken free by a check, the spell ends as the round turns, and so does Concentration.
  const freed = (caught.characters as Hero[]).map((character) => (character.id === "bandit" ? withoutCondition(character, "restrained").character : character))
  const ended = spellsAtRoundEnd({ characters: freed, d20: () => 10, roll: () => 2 })
  assert.deepEqual([find(ended.characters as Hero[], "bandit").hitPoints, find(ended.characters as Hero[], "sylas").concentration], [3, undefined])
  // With a level 2 slot the burn is 2d6: 2 + 2, and the Bandit at 3 drops.
  const stronger = shoot({ ensnare: "ensnaring-strike-level-2" }, npc("bandit", "bandit", 11, 30), [4, 5])
  assert.deepEqual(find(stronger.characters as Hero[], "sylas").spellSlots, [0, 1])
  assert.equal(find(spellsAtRoundEnd({ characters: stronger.characters as Hero[], d20: () => 10, roll: () => 2 }).characters as Hero[], "bandit").hitPoints, 0)
  // The Large Ogre saves with Advantage: a 3 and a 12 keep 12, + 4 = 16 against 13. The vines shrivel, the slot is
  // still spent, and no Concentration begins. 4 + 4 = 8 leaves it 60.
  const missed = shoot({ ensnare: "ensnaring-strike" }, npc("ogre", "ogre", 68, 30), [4, 3, 12])
  const ogre = find(missed.characters as Hero[], "ogre")
  assert.deepEqual([ogre.hitPoints, ogre.conditions, find(missed.characters as Hero[], "sylas").spellSlots, find(missed.characters as Hero[], "sylas").concentration], [60, undefined, [1], undefined])
  // A miss casts nothing.
  const wide = attackWithReactions({
    characters: [sylas(5), npc("bandit", "bandit", 11, 30)],
    attackerId: "sylas",
    targetId: "bandit",
    weapon: "longbow",
    dice: [1],
    roll: () => 4,
    ask: never,
    choices: { ensnare: "ensnaring-strike" },
  })
  assert.equal(find(wide.characters as Hero[], "sylas").spellSlots, undefined)
})
