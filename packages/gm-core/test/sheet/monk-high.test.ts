import assert from "node:assert/strict"
import { test } from "node:test"
import { afterRoll } from "../../src/sheet/actions"
import { followingRoll, type InScene } from "../../src/sheet/attack-roll"
import { atInitiative, bonusActionRule, choiceRule, classResistances, reactionRule, roundStartRules } from "../../src/sheet/class-rules"
import { quiveringPalm } from "../../src/sheet/classes/monk"
import { autoCreate, type CreationPick, createSheet } from "../../src/sheet/create"
import { deriveSheet } from "../../src/sheet/derive"
import { featureUseCount } from "../../src/sheet/feature-rules"
import { useBonusAction } from "../../src/sheet/features"
import { raisedTo } from "../../src/sheet/milestone"
import { attackWithReactions } from "../../src/sheet/reactions"
import type { Sheet } from "../../src/sheet/sheet"
import { rollSave } from "../../src/sheet/spells"
import type { SpellEffect, TurnEffect } from "../../src/sheet/turn-effect"
import type { Character } from "../../src/types/character"
import type { RequiredAttack, RequiredRoll } from "../../src/validations/roll-requirement-schema"

// Every expected value below was worked out by hand from the SRD 5.2.1 text (pp. 49 to 52), not copied from the
// functions' output. The Monk is a human Acolyte made by the creator and raised by the choices that need no player,
// which take the Warrior of the Open Hand at 3. Dexterity 15 (+2) to 11, 17 (+3) from 12 and 19 (+4) from 16. Wisdom
// 18 (+4) from 4 and 20 (+5) from 8. Constitution 13 (+1). The Monk table: Martial Arts 1d8 from 5, 1d10 from 11 and
// 1d12 from 17, Focus Points equal to the level. Focus save DC 8 + Wisdom + Proficiency: 15 at 5, 19 at 17 and 18.

const made = (): Sheet => {
  const pick = { class: "monk", species: "human", background: "acolyte" } as unknown as CreationPick
  const result = createSheet(pick, autoCreate(pick))
  if ("problems" in result) assert.fail(result.problems.join("; "))
  return result.sheet
}
type Hero = InScene & {
  type: string
  name: string
  sheet: Sheet
  hitPoints: number
  featureUses?: Record<string, number>
  turnEffects?: TurnEffect[]
  spellEffects?: SpellEffect[]
  tempHitPoints?: number
}
const monk = (level: number): Hero => {
  const raised = raisedTo({ id: "kaito", name: "Kaito", type: "pc", sheet: made(), controlledBy: "ai" as const }, level)
  assert.equal(raised.sheet.level, level)
  return { ...raised, hitPoints: deriveSheet(raised.sheet).hitPointMaximum } as Hero
}
type Foe = InScene & { type: string; name: string; hitPoints: number }
const bandit = (): Foe => ({ id: "bandit", name: "Bandit", type: "npc", statBlock: "bandit", hitPoints: 11 }) as Foe
const ogre = (): Foe => ({ id: "ogre", name: "Ogre", type: "npc", statBlock: "ogre", hitPoints: 68 }) as Foe
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() ?? 1
const never = () => false
// Deflect Attacks' answer to damage, asked directly.
const onDamage = (args: Record<string, unknown>) => (reactionRule("deflect-attacks")?.onDamage as unknown as (args: Record<string, unknown>) => { taken: number } | undefined)(args)
const find = (characters: readonly { id: string }[], id: string): Hero => characters.find((character) => character.id === id) as Hero

test("Empowered Strikes: an Unarmed Strike deals Force where its Bludgeoning is resisted, from level 6", () => {
  // An Awakened Tree resists Bludgeoning. The strike is 1d8 + 2: a 5 makes 7. At 5 it is halved to 3, at 6 it is Force
  // and all 7 land.
  const tree = { id: "tree", name: "Tree", type: "npc", statBlock: "awakened-tree", hitPoints: 59 } as Foe
  const strike = (level: number) =>
    attackWithReactions({ characters: [{ ...monk(level), id: "kaito" }, tree], attackerId: "kaito", targetId: "tree", weapon: "unarmed-strike", dice: [19], roll: falls(5), ask: never })
  const plain = strike(5)
  assert.deepEqual([plain.blow.taken, plain.blow.damage?.parts[0]?.type], [3, "bludgeoning"])
  const empowered = strike(6)
  assert.deepEqual([empowered.blow.taken, empowered.blow.damage?.parts[0]?.type], [7, "force"])
  // A Bandit resists nothing: the strike stays Bludgeoning.
  const bare = attackWithReactions({ characters: [monk(6), bandit()], attackerId: "kaito", targetId: "bandit", weapon: "unarmed-strike", dice: [19], roll: falls(5), ask: never })
  assert.equal(bare.blow.damage?.parts[0]?.type, "bludgeoning")
})

test("Deflect Attacks' redirect at 0 damage, and Deflect Energy from level 13", () => {
  // The Bandit's Scimitar hits for 6 + 1 = 7 Slashing. Deflect Attacks cuts 3 + 2 + 5 = 10, so 0 is taken. The force
  // goes back for a Focus Point: the Bandit's Dexterity save is 10 + 1 = 11 against DC 15, a failure, and 2d8 + 2 is
  // 4 + 5 + 2 = 11 Slashing, all its 11 hit points.
  const struck = attackWithReactions({ characters: [bandit(), monk(5)], attackerId: "bandit", targetId: "kaito", weapon: "scimitar", dice: [18], roll: falls(6, 3, 10, 4, 5), ask: () => true })
  assert.equal(struck.blow.taken, 0)
  assert.deepEqual(
    struck.reactions.map((reaction) => reaction.id),
    ["deflect-attacks", "deflect-attacks"]
  )
  assert.equal(find(struck.characters, "bandit").hitPoints, 0)
  assert.equal(find(struck.characters, "kaito").featureUses?.["monk-monks-focus"], 1)
  // A save of 17 + 1 = 18 takes nothing, and the point is spent all the same.
  const saved = attackWithReactions({ characters: [bandit(), monk(5)], attackerId: "bandit", targetId: "kaito", weapon: "scimitar", dice: [18], roll: falls(6, 3, 17), ask: () => true })
  assert.deepEqual([find(saved.characters, "bandit").hitPoints, find(saved.characters, "kaito").featureUses?.["monk-monks-focus"]], [11, 1])
  // A Light Crossbow from 70 feet: 6 + 1 = 7 Piercing cut to 0, but the Bandit is beyond 60 feet, so no redirect.
  const far = attackWithReactions({
    characters: [
      { ...bandit(), position: { x: 70, y: 0 } },
      { ...monk(5), position: { x: 0, y: 0 } },
    ],
    attackerId: "bandit",
    targetId: "kaito",
    weapon: "light-crossbow",
    dice: [18],
    roll: falls(6, 3),
    ask: () => true,
  })
  assert.deepEqual([far.blow.taken, far.reactions.length, find(far.characters, "kaito").featureUses], [0, 1, undefined])

  // Fire is answered from 13 only. At 13: 1d10 + 3 + 13, so a 1 cuts 17 of 20.
  const deflect = (level: number, types: ("fire" | "slashing")[]) => onDamage({ target: monk(level), attacker: bandit(), taken: 20, hit: "A hit.", ask: () => true, types, roll: () => 1 })
  assert.equal(deflect(12, ["fire"]), undefined)
  assert.equal(deflect(13, ["fire"])?.taken, 3)
  assert.equal(deflect(12, ["slashing"])?.taken, 20 - (1 + 3 + 12))
})

test("Heightened Focus: three strikes in a Flurry from level 10, and Patient Defense's Temporary Hit Points", () => {
  const flurried = (level: number) => {
    const hero = monk(level)
    const present = [hero, bandit()]
    const made: RequiredAttack = { attack: { weapon: "unarmed-strike", target: "bandit" }, rollType: "Unarmed Strike", difficulty: 12, modifier: 5, mode: "normal", after: { flurry: true } }
    const strikes: RequiredAttack[] = []
    let last: RequiredAttack | undefined = made
    while (last) {
      last = followingRoll({ character: hero, made: last, present }) as RequiredAttack | undefined
      if (last) strikes.push(last)
    }
    return strikes.map((strike) => strike.attack.weapon)
  }
  assert.deepEqual(flurried(9), ["unarmed-strike", "unarmed-strike"])
  assert.deepEqual(flurried(10), ["unarmed-strike", "unarmed-strike", "unarmed-strike"])

  // Patient Defense with a point at 10: two rolls of the d8, 3 and 5, give 8 Temporary Hit Points. At 9 it gives none.
  const guarded = useBonusAction({ characters: [monk(10)], actorId: "kaito", feature: "patient-defense-focus", roll: falls(3, 5) })
  assert.equal(find(guarded.characters, "kaito").tempHitPoints, 8)
  const plain = useBonusAction({ characters: [monk(9)], actorId: "kaito", feature: "patient-defense-focus", roll: falls(3, 5) })
  assert.equal(find(plain.characters, "kaito").tempHitPoints, undefined)
  // They do not stack: 10 held stand over the 8.
  const held = useBonusAction({ characters: [{ ...monk(10), tempHitPoints: 10 }], actorId: "kaito", feature: "patient-defense-focus", roll: falls(3, 5) })
  assert.equal(find(held.characters, "kaito").tempHitPoints, 10)
  // The read is told of the three strikes only from 10.
  const note = bonusActionRule("flurry-of-blows")?.note as (character: Hero) => string
  assert.match(note(monk(9)), /two Unarmed Strikes/)
  assert.match(note(monk(10)), /three Unarmed Strikes/)
})

test("Self-Restoration ends Charmed, Frightened or Poisoned as the round turns, from level 10", () => {
  const turned = (hero: Hero) => roundStartRules().reduce((now, rule) => rule(now).character, hero)
  const shaken = (level: number) => ({ ...monk(level), conditions: [{ id: "frightened" as const }, { id: "poisoned" as const }] })
  // Frightened comes before Poisoned in the SRD's order, so it is the one ended. Poisoned waits for the next round.
  assert.deepEqual(turned(shaken(10)).conditions, [{ id: "poisoned" }])
  assert.deepEqual(turned(shaken(9)).conditions, [{ id: "frightened" }, { id: "poisoned" }])
})

test("Disciplined Survivor: every save proficient, and a failed save against harm rerolled for a Focus Point", () => {
  // Constitution +1 and Proficiency +5 at 14: +6. A 10 makes 16 against DC 20, a failure, and the reroll of 15 makes 21.
  const hero = monk(14)
  assert.equal(deriveSheet(hero.sheet).savingThrows.con.bonus, 6)
  const save = rollSave({ target: hero, ability: "con", dc: 20, d20: falls(10, 15), roll: falls(), characters: [hero], stakes: { damage: 10 } })
  assert.deepEqual([save.success, save.total, save.rescued], [true, 21, { feature: "monk-monks-focus", name: "Disciplined Survivor", first: 16 }])
  // A save that costs nothing is not rerolled, and at 13 there is no reroll.
  assert.equal(rollSave({ target: hero, ability: "con", dc: 20, d20: falls(10, 15), roll: falls(), characters: [hero] }).rescued, undefined)
  const younger = monk(13)
  assert.equal(rollSave({ target: younger, ability: "con", dc: 20, d20: falls(10, 15), roll: falls(), characters: [younger], stakes: { damage: 10 } }).success, false)
})

test("Perfect Focus: 3 Focus Points or fewer become 4 as Initiative is rolled, when Uncanny Metabolism is not used", () => {
  // 15 points at 15. 13 spent leave 2: 2 more come back, 11 spent. Uncanny Metabolism is spent already.
  const tired = { ...monk(15), featureUses: { "monk-monks-focus": 13, "monk-uncanny-metabolism": 1 } }
  assert.deepEqual(atInitiative(tired, () => 1).featureUses, { "monk-monks-focus": 11, "monk-uncanny-metabolism": 1 })
  // 4 left: nothing. At 14: nothing.
  const four = { ...monk(15), featureUses: { "monk-monks-focus": 11, "monk-uncanny-metabolism": 1 } }
  assert.deepEqual(atInitiative(four, () => 1).featureUses, four.featureUses)
  assert.deepEqual(atInitiative({ ...tired, sheet: monk(14).sheet }, () => 1).featureUses, tired.featureUses)
  // Uncanny Metabolism unspent is used first: every point back.
  assert.deepEqual(atInitiative({ ...tired, featureUses: { "monk-monks-focus": 13 } }, () => 1).featureUses, { "monk-uncanny-metabolism": 1 })
})

test("Superior Defense: 3 Focus Points while Bloodied for Resistance to all but Force, ended when Incapacitated", () => {
  // 111 hit points at 18, Bloodied at 55 or fewer.
  const hero = { ...monk(18), hitPoints: 55 }
  assert.equal(deriveSheet(hero.sheet).hitPointMaximum, 111)
  const turned = (character: Hero, everyone: readonly Hero[] | readonly Foe[]) =>
    roundStartRules().reduce((now, rule) => rule(now, { everyone: everyone as never, d20: () => 10, roll: () => 1 }).character, character)
  const braced = turned(hero, [hero, ogre()] as never)
  assert.equal(braced.featureUses?.["monk-monks-focus"], 3)
  assert.deepEqual(braced.spellEffects, [{ spell: "monk-superior-defense", by: "kaito", turns: 11 }])
  assert.deepEqual(classResistances(braced), ["acid", "bludgeoning", "cold", "fire", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"])
  // Not Bloodied at 56, or with no enemy here, it is not taken. At 17 it is not had.
  assert.equal(turned({ ...hero, hitPoints: 56 }, [hero, ogre()] as never).spellEffects, undefined)
  assert.equal(turned(hero, [hero] as never).spellEffects, undefined)
  assert.equal(turned({ ...monk(17), hitPoints: 50 }, [hero, ogre()] as never).spellEffects, undefined)
  // Stunned is Incapacitated: no Resistance, and it ends as the round turns.
  const stunned = { ...braced, conditions: [{ id: "stunned" as const }] }
  assert.deepEqual(classResistances(stunned), [])
  assert.equal(turned(stunned, [stunned, ogre()] as never).spellEffects, undefined)
})

test("Wholeness of Body: a Bonus Action to heal the Martial Arts die plus Wisdom, Wisdom times a Long Rest", () => {
  // At 6, Wisdom +4: four uses, and a 3 on the d8 heals 7, from 20 to 27 of 39.
  const hero = { ...monk(6), hitPoints: 20 }
  assert.equal(featureUseCount(hero.sheet, "warrior-of-the-open-hand-wholeness-of-body"), 4)
  const healed = useBonusAction({ characters: [hero], actorId: "kaito", feature: "wholeness-of-body", roll: () => 3 })
  const after = find(healed.characters, "kaito")
  assert.deepEqual([after.hitPoints, after.featureUses], [27, { "warrior-of-the-open-hand-wholeness-of-body": 1 }])
  assert.equal(useBonusAction({ characters: [{ ...monk(5), hitPoints: 20 }], actorId: "kaito", feature: "wholeness-of-body", roll: () => 3 }).use, undefined)
})

test("Open Hand Technique's Push: a Strength save or 15 feet straight away", () => {
  // The Bandit's Strength save, 4 + 0 against 15, fails: 1 + 2 = 3 damage, and it goes from 5 to 20 feet east.
  const hero = { ...monk(5), position: { x: 0, y: 0 } }
  const target = { ...bandit(), position: { x: 5, y: 0 } }
  const pushed = attackWithReactions({
    characters: [hero, target],
    attackerId: "kaito",
    targetId: "bandit",
    weapon: "unarmed-strike",
    dice: [19],
    roll: falls(1, 4),
    choices: { "open-hand": "push" },
    ask: never,
  })
  assert.deepEqual([pushed.blow.taken, pushed.blow.riders?.[0]?.took], [3, true])
  const roll: RequiredRoll = { attack: { weapon: "unarmed-strike", target: "bandit", choices: { "open-hand": "push" } }, rollType: "Unarmed Strike", difficulty: 12, modifier: 5, mode: "normal" }
  const moved = afterRoll(pushed.characters, "kaito", roll, 3)
  assert.deepEqual([find(moved, "bandit").position, find(moved, "bandit").turnEffects], [{ x: 20, y: 0 }, undefined])
  // A save of 18 holds it in place.
  const held = attackWithReactions({
    characters: [hero, target],
    attackerId: "kaito",
    targetId: "bandit",
    weapon: "unarmed-strike",
    dice: [19],
    roll: falls(1, 18),
    choices: { "open-hand": "push" },
    ask: never,
  })
  assert.deepEqual(find(afterRoll(held.characters, "kaito", roll, 3), "bandit").position, { x: 5, y: 0 })
})

test("Quivering Palm: 4 Focus Points on an Unarmed Strike hit, and 10d12 Force as the action, half on a success", () => {
  const offered = choiceRule("quivering-palm")?.offer
  assert.equal(offered?.(monk(16) as unknown as Character), undefined)
  assert.deepEqual(offered?.(monk(17) as unknown as Character), ["palm"])
  // The strike hits for 1 + 4 = 5, and the vibrations are set: 4 of 17 points, kept 17 days in rounds of 6 seconds.
  const choices = { "quivering-palm": "palm" }
  const hit = attackWithReactions({ characters: [monk(17), ogre()], attackerId: "kaito", targetId: "ogre", weapon: "unarmed-strike", dice: [19], roll: falls(1), choices, ask: never })
  assert.deepEqual(
    hit.blow.riders?.map((rider) => rider.id),
    ["quivering-palm"]
  )
  const roll: RequiredRoll = { attack: { weapon: "unarmed-strike", target: "ogre", choices }, rollType: "Unarmed Strike", difficulty: 12, modifier: 10, mode: "normal" }
  const set = afterRoll(hit.characters, "kaito", roll, hit.blow.taken)
  const palm = find(set, "kaito")
  assert.deepEqual([palm.featureUses, palm.spellEffects], [{ "monk-monks-focus": 4 }, [{ spell: "warrior-of-the-open-hand-quivering-palm", by: "kaito", choice: "ogre", turns: 17 * 14_400 }]])
  // The action to end them is offered for the one who bears them.
  assert.deepEqual(choiceRule("vibrations")?.offer(palm as unknown as Character), ["ogre"])

  // Ten d12s of 6 are 60 Force. The Ogre's Constitution save, 5 + 3 = 8 against DC 19, fails: 63 - 60 = 3 left.
  const ended = quiveringPalm({ characters: set as never, monkId: "kaito", d20: falls(5), roll: () => 6 })
  assert.deepEqual([ended.saves[0]?.success, ended.harm[0]?.amount], [false, 60])
  assert.equal(find(ended.characters as Hero[], "ogre").hitPoints, 63 - 60)
  assert.equal(find(ended.characters as Hero[], "kaito").spellEffects, undefined)
  // A save of 18 + 3 = 21 halves it to 30.
  const halved = quiveringPalm({ characters: set as never, monkId: "kaito", d20: falls(18), roll: () => 6 })
  assert.equal(halved.harm[0]?.amount, 30)
  // With no vibrations set, nothing happens.
  assert.ok(quiveringPalm({ characters: [monk(17), ogre()] as never, monkId: "kaito", d20: falls(5), roll: () => 6 }).problem)
})
