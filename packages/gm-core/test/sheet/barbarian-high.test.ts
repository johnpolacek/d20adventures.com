import assert from "node:assert/strict"
import { test } from "node:test"
import { afterRoll, checkModesFromActions, turnEffectsAtRoundStart } from "../../src/sheet/actions"
import { rollAttack, strike, strikeFacts, weaponAttack } from "../../src/sheet/attack"
import { attackRequirement } from "../../src/sheet/attack-roll"
import { resolveCheck } from "../../src/sheet/check"
import { afterDowned, atInitiative, bonusActionRule, choiceRule, classTotalFloor } from "../../src/sheet/class-rules"
import { barbarian, brutalChoices, brutalDice, isRaging, presenceDc, relentlessDc } from "../../src/sheet/classes/barbarian"
import { withCondition } from "../../src/sheet/conditions"
import { afterHarm, withDamage } from "../../src/sheet/death"
import { sheetProblems } from "../../src/sheet/derive"
import { withUsedThisTurn } from "../../src/sheet/feature-rules"
import { bonusActionsOf, useBonusAction } from "../../src/sheet/features"
import { rollInitiative } from "../../src/sheet/initiative"
import { moveBudget } from "../../src/sheet/moves"
import { attackWithReactions, reactionsOf } from "../../src/sheet/reactions"
import { shortRest } from "../../src/sheet/rest"
import type { Sheet } from "../../src/sheet/sheet"
import { settleConcentration } from "../../src/sheet/spell-effects"
import { rollSave } from "../../src/sheet/spells"

// Every expected value below was worked out by hand from the SRD 5.2.1 rules (Barbarian, pages 28 to 30), not copied
// from the function's output. A Dwarf Barbarian of the Path of the Berserker, Soldier, raised by the choices that need
// no player. Level 20: Str 25 (+7) and Con 24 (+7) with Primal Champion, Dex 13 (+1), Wis 12 (+1), Proficiency Bonus
// +6, saves in Strength and Constitution, Speed 40, Armor Class 10 + 1 + 7 = 18, a Greataxe +13 for 1d12 + 7, 6 Rages
// of +4 Rage Damage. Level 14: Str 20 (+5), Con 18, Proficiency Bonus +5, 5 Rages of +3. The Ogre: Armor Class 11, 68
// hit points, Speed 40, Wis 7 (-2). The Goblin Warrior: Wis 8 (-1).

const ADVANCES: Sheet["advancements"] = [
  { level: 3, skills: ["survival"] },
  { level: 4, feat: "ability-score-improvement", abilities: { str: 2 } },
  { level: 8, feat: "ability-score-improvement", abilities: { str: 1, con: 1 } },
  { level: 12, feat: "ability-score-improvement", abilities: { con: 2 } },
  { level: 16, feat: "ability-score-improvement", abilities: { con: 2 } },
  { level: 19, feat: "boon-of-irresistible-offense", abilities: { str: 1 } },
]
const at = (level: number, scores: { str: number; con: number }): Sheet => ({
  class: "barbarian",
  level,
  species: "dwarf",
  background: "soldier",
  languages: ["dwarvish", "common-sign-language"],
  abilityScores: { str: scores.str, dex: 13, con: scores.con, int: 10, wis: 12, cha: 8 },
  classSkills: ["animal-handling", "perception"],
  weapons: ["greataxe", "handaxe", "spear", "shortbow"],
  weaponMasteries: level >= 10 ? ["greataxe", "handaxe", "shortbow", "spear"] : ["greataxe", "handaxe", "shortbow"],
  subclass: "path-of-the-berserker",
  advancements: (ADVANCES ?? []).filter((advance) => advance.level <= level),
})
const s9 = at(9, { str: 20, con: 16 })
const s13 = at(13, { str: 20, con: 18 })
const s14 = at(14, { str: 20, con: 18 })
const s17 = at(17, { str: 20, con: 20 })
const s20 = at(20, { str: 21, con: 20 })

type Hero = {
  id: string
  name: string
  type: string
  sheet: Sheet
  featureUses?: Record<string, number>
  turnEffects?: { id: string; by: string; turns: number }[]
  conditions?: { id: "stunned" | "unconscious" | "frightened" | "poisoned"; source?: string; turns?: number }[]
  isComplete?: boolean
  hitPoints?: number
  position?: { x: number; y: number }
}
const hero = (sheet: Sheet, extra: Partial<Hero> = {}): Hero => ({ id: "grosk", name: "Grosk", type: "pc", sheet, ...extra })
const ogre: { id: string; name: string; type: string; statBlock: string; hitPoints: number; turnEffects?: Hero["turnEffects"] } = {
  id: "ogre",
  name: "Ogre",
  type: "npc",
  statBlock: "ogre",
  hitPoints: 68,
}
const raged = (one: Hero): Hero => useBonusAction({ characters: [one], actorId: one.id, feature: "barbarian-rage", roll: () => 1 }).characters[0] as Hero
const reckless = (one: Hero): Hero => choiceRule("reckless")?.apply?.([one as never], one.id).characters[0] as unknown as Hero
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() ?? 1

test("the made sheets are legal at each level", () => {
  for (const sheet of [s9, s13, s14, s17, s20]) assert.deepEqual(sheetProblems(sheet), [])
})

test("Feral Instinct's Advantage on Initiative, and Persistent Rage's uses back as it is rolled", () => {
  // 4 and 15 with Advantage keep 15, + Dex 1 is 16.
  assert.equal(rollInitiative(hero(s20), 4, 15), 16)
  // Every spent Rage comes back the first time, and then not until a Long Rest. A level 14 hero has no Persistent Rage.
  assert.deepEqual(atInitiative(hero(s20, { featureUses: { "barbarian-rage": 3 } }), () => 1).featureUses, { "barbarian-persistent-rage": 1 })
  const once = { "barbarian-rage": 2, "barbarian-persistent-rage": 1 }
  assert.deepEqual(atInitiative(hero(s20, { featureUses: once }), () => 1).featureUses, once)
  assert.deepEqual(atInitiative(hero(s14, { featureUses: { "barbarian-rage": 3 } }), () => 1).featureUses, { "barbarian-rage": 3 })
})

test("Persistent Rage holds with no attack, through Incapacitated, and ends with Unconscious", () => {
  // The round after it was entered, turn over and no attack made: a level 14 Rage has ended, a level 20 one holds.
  const idle = (sheet: Sheet) => ({ ...turnEffectsAtRoundStart(raged(hero(sheet))), isComplete: true })
  assert.deepEqual([isRaging(idle(s14)), isRaging(idle(s20))], [false, true])
  assert.equal(isRaging({ ...idle(s20), conditions: [{ id: "stunned" }] }), true)
  assert.equal(isRaging({ ...idle(s20), conditions: [{ id: "unconscious" }] }), false)
  // As the next round begins it is kept going, and nothing is told.
  const kept = barbarian.roundStart?.(idle(s20))
  assert.deepEqual([kept?.character.turnEffects, kept?.told], [[{ id: "rage", by: "grosk", turns: 2 }], undefined])
})

test("Mindless Rage ends Frightened and keeps out Charmed, and Instinctive Pounce moves half the Speed", () => {
  const scared = hero(s14, { conditions: [{ id: "frightened", source: "ogre", turns: 5 }] })
  const used = useBonusAction({ characters: [scared], actorId: "grosk", feature: "barbarian-rage", roll: () => 1 })
  assert.equal((used.characters[0] as Hero).conditions, undefined)
  assert.match(used.use?.fact ?? "", /flies into a Rage\. They are no longer Frightened\.$/)
  assert.equal(withCondition(used.characters[0] as Hero, { id: "charmed", source: "ogre" }).given, false)
  assert.equal(withCondition(hero(s14), { id: "charmed", source: "ogre" }).given, true)
  // Speed 40 with Fast Movement: half is 20 more with the Rage entered, and none with one already going.
  const pounce = bonusActionRule("barbarian-rage")?.moveBonus
  assert.deepEqual([pounce?.(hero(s14)), pounce?.(raged(hero(s14))), pounce?.(hero(at(5, { str: 18, con: 16 })))], [20, 0, 0])
})

test("Brutal Strike: its effects by level, the Advantage forgone, its dice and what each effect does", () => {
  assert.deepEqual(brutalChoices(hero(s9)), ["forceful-blow", "hamstring-blow"])
  assert.deepEqual(brutalChoices(hero(s13)), ["forceful-blow", "hamstring-blow", "staggering-blow", "sundering-blow"])
  // At 17 two different effects of the four: 4 alone and 6 pairs.
  assert.equal(brutalChoices(hero(s17)).length, 10)
  assert.ok(brutalChoices(hero(s17)).includes("hamstring-blow+sundering-blow"))
  assert.deepEqual([brutalDice(s13), brutalDice(s17)], ["1d10", "2d10"])

  const greataxe = weaponAttack(s20, "greataxe")
  const rule = choiceRule("brutal")
  assert.deepEqual(
    [
      rule?.forgoesAdvantage?.(hero(s20), greataxe, { reckless: true }),
      rule?.forgoesAdvantage?.(hero(s20), greataxe, undefined),
      rule?.forgoesAdvantage?.(hero(s20), weaponAttack(s20, "shortbow"), { reckless: true }),
    ],
    [true, false, false]
  )
  // Reckless Attack's Advantage is given up: the roll is made with none. With Disadvantage too (Poisoned), the choice goes.
  const ask = (attacker: Hero) =>
    attackRequirement({
      character: attacker as never,
      target: ogre as never,
      attack: greataxe,
      present: [attacker, ogre] as never,
      modes: [{ mode: "advantage", from: "Reckless Attack" }],
      choices: { brutal: "hamstring-blow" },
      forgo: ["brutal"],
    })
  const given = ask(hero(s20))
  assert.ok("roll" in given)
  assert.deepEqual([given.roll.mode, given.roll.attack.choices, given.roll.reasons], ["normal", { brutal: "hamstring-blow" }, ["Advantage Forgone"]])
  const poisoned = ask(hero(s20, { conditions: [{ id: "poisoned" }] }))
  assert.ok("roll" in poisoned)
  assert.equal(poisoned.roll.attack.choices, undefined)

  // Raging and reckless at 20, Savage Attacker taken as used: 10 + 13 is 23 against 11, a hit. The d12 rolls 6, + 7 is
  // 13. Rage Damage 4. Brutal Strike's 2d10 roll 3 and 4: 7. Frenzy's 4d6 roll 1, 2, 3, 4: 10. 13 + 4 + 7 + 10 is 34.
  const grosk = withUsedThisTurn(reckless(raged(hero(s20))), "savage-attacker", "grosk")
  const blow = strike({ attacker: grosk, target: ogre, weapon: "greataxe", dice: [10], turnOf: "grosk", choices: { brutal: "hamstring-blow+sundering-blow" }, roll: falls(6, 3, 4, 1, 2, 3, 4) })
  assert.deepEqual([blow.roll.hit, blow.features, blow.taken, blow.used], [true, ["Rage", "Brutal Strike", "Frenzy"], 34, ["brutal-strike", "frenzy"]])
  assert.deepEqual(blow.target.turnEffects, [
    { id: "hamstrung", by: "grosk", turns: 2 },
    { id: "sundered", by: "grosk", turns: 2 },
  ])
  assert.match(strikeFacts("Grosk", "Ogre", blow), /Hamstring Blow takes 15 feet off Ogre's Speed until Grosk's next turn\. Sundering Blow breaks/)
  // Hamstring Blow: the Ogre's 40 feet less 15 is 25.
  const struck = { ...ogre, ...blow.target }
  assert.equal(moveBudget(struck as never, [grosk] as never), 25)
  // Sundering Blow: another's attack on the Ogre gains 5, and it is spent. A level 9 ally's Greataxe is +9: 10 + 9 + 5
  // is 24. Grosk's own is not helped (10 + 13 = 23), and his roll does not spend it.
  const ally = hero(s9, { id: "brakka", name: "Brakka" })
  const helped = rollAttack({ attacker: ally, target: struck, weapon: "greataxe", dice: [10], roll: () => 1 })
  assert.deepEqual([helped.roll.total, rollAttack({ attacker: grosk, target: struck, weapon: "greataxe", dice: [10], roll: () => 1 }).roll.total], [24, 23])
  const roll = (by: string) => ({ attack: { weapon: "greataxe", target: "ogre" }, rollType: "Greataxe", difficulty: 11, modifier: 9, mode: "normal" as const, by })
  const sundered = (after: Hero[]) => after.find((one) => one.id === "ogre")?.turnEffects?.some((effect) => effect.id === "sundered")
  assert.equal(sundered(afterRoll([ally, grosk, struck] as Hero[], "brakka", roll("brakka"), 0)), false)
  assert.equal(sundered(afterRoll([ally, grosk, struck] as Hero[], "grosk", roll("grosk"), 0)), true)
  // Staggering Blow: Disadvantage on the Ogre's saves, and no Opportunity Attacks.
  const staggered = { ...ogre, turnEffects: [{ id: "staggered", by: "grosk", turns: 2 }] }
  assert.deepEqual(checkModesFromActions(staggered as never, { kind: "save", ability: "wis" }, [staggered, grosk] as never), [{ mode: "disadvantage", from: "Staggering Blow" }])
  // Forceful Blow: 15 feet straight away, from 5 feet to 20, and the mark is spent.
  const shoved = { ...ogre, position: { x: 5, y: 0 }, turnEffects: [{ id: "forceful-blow", by: "grosk", turns: 1 }] }
  const pushed = afterRoll([{ ...grosk, position: { x: 0, y: 0 } }, shoved] as Hero[], "grosk", roll("grosk"), 34).find((one) => one.id === "ogre")
  assert.deepEqual([pushed?.position, pushed?.turnEffects], [{ x: 20, y: 0 }, undefined])
})

test("Retaliation: hurt from within 5 feet, one melee attack back as a Reaction", () => {
  const grosk = hero(s20, { position: { x: 0, y: 0 } })
  const club = { ...ogre, position: { x: 5, y: 0 } }
  assert.ok(reactionsOf(grosk).includes("retaliation"))
  // The Ogre's 15 + 6 is 21 against 18, a hit: 2d8 roll 3 and 4, + 4 is 11, and Grosk has 305 - 11 = 294. He strikes
  // back with his Greataxe: 12 + 13 is 25 against 11. Savage Attacker rolls the d12 twice, 6 and 5, and keeps 6: 13, and
  // the Ogre has 68 - 13 = 55.
  const made = attackWithReactions({ characters: [grosk, club] as never[], attackerId: "ogre", targetId: "grosk", weapon: "greatclub", dice: [15], roll: falls(3, 4, 12, 6, 5), ask: () => true })
  const after = (id: string) => (made.characters as Hero[]).find((one) => one.id === id)
  assert.deepEqual([after("grosk")?.hitPoints, after("ogre")?.hitPoints], [294, 55])
  assert.deepEqual(
    made.reactions.map((taken) => [taken.by, taken.id, taken.name]),
    [["grosk", "retaliation", "Retaliation"]]
  )
  assert.match(made.reactions[0].text, /^Grosk strikes back\. Grosk's Greataxe attack on Ogre HITS/)
  assert.ok(after("grosk")?.turnEffects?.some((effect) => effect.id === "reacted"))
  // Declined, or with the Ogre 10 feet off, there is no strike back.
  assert.deepEqual(
    attackWithReactions({ characters: [grosk, club] as never[], attackerId: "ogre", targetId: "grosk", weapon: "greatclub", dice: [15], roll: falls(3, 4), ask: () => false }).reactions,
    []
  )
  const far = attackWithReactions({
    characters: [grosk, { ...club, position: { x: 10, y: 0 } }] as never[],
    attackerId: "ogre",
    targetId: "grosk",
    weapon: "greatclub",
    dice: [15],
    roll: falls(3, 4),
    ask: () => true,
  })
  assert.deepEqual(far.reactions, [])
})

test("Relentless Rage: a Constitution save at 0 hit points, its DC rising by 5, back to 10 with a rest", () => {
  // Raging at 5 hit points, Grosk takes 20 and drops, dying. His Con save is +7 + 6 = +13: 10 + 13 is 23 against DC 10,
  // a success, and he stands at twice his level, 40, his turn not yet taken as it was.
  const was = { ...raged(hero(s20)), hitPoints: 5, isComplete: false }
  const now = afterHarm(withDamage(was, 20).character)
  assert.deepEqual([now.hitPoints, now.isComplete], [0, true])
  const stood = afterDowned({ before: [was], after: [now], d20: () => 10 })
  const up = stood.characters[0] as Hero & { deathSaves?: unknown }
  assert.deepEqual([up.hitPoints, up.isComplete, up.deathSaves, up.featureUses], [40, false, undefined, { "barbarian-rage": 1, "barbarian-relentless-rage": 1 }])
  assert.equal(stood.told[0]?.text, "Grosk makes a DC 10 Constitution saving throw for Relentless Rage: 23, a success. Grosk stays on their feet with 40 hit points.")
  assert.equal(relentlessDc(up), 15)
  // Three uses since the last rest make DC 25: 11 + 13 is 24, a failure. He stays down, and the use is counted.
  const worn = { ...was, featureUses: { "barbarian-rage": 1, "barbarian-relentless-rage": 3 } }
  const fell = afterDowned({ before: [worn], after: [afterHarm(withDamage(worn, 20).character)], d20: () => 11 })
  assert.deepEqual([fell.characters[0].hitPoints, (fell.characters[0] as Hero).featureUses?.["barbarian-relentless-rage"]], [0, 4])
  // Settling a roll's harm runs it too, and tells it.
  const settled = settleConcentration({ before: [was], after: [now], bonus: () => 0, d20: () => 10 })
  assert.deepEqual([settled.characters[0].hitPoints, settled.facts], [40, [stood.told[0]?.text]])
  // Not raging, nothing answers.
  const calm = { ...hero(s20), hitPoints: 5 }
  assert.deepEqual(afterDowned({ before: [calm], after: [withDamage(calm, 20).character], d20: () => 20 }).told, [])
  // A Short Rest puts the DC back to 10.
  const rested = shortRest({ ...hero(s20), featureUses: { "barbarian-relentless-rage": 2 } }, { roll: () => 1 })
  assert.deepEqual([rested.character.featureUses, rested.facts], [undefined, ["Grosk's Relentless Rage is back to DC 10."]])
})

test("Intimidating Presence: a Wisdom save in 30 feet, once a Long Rest or for a Rage, and saved again as rounds turn", () => {
  // DC 8 + Str 5 + Proficiency 5 is 18.
  assert.equal(presenceDc(s14), 18)
  const grosk = hero(s14, { position: { x: 0, y: 0 } })
  const near = { id: "gob", name: "Goblin", type: "npc", statBlock: "goblin-warrior", hitPoints: 10, position: { x: 20, y: 0 } }
  const far = { ...near, id: "gob-far", name: "Far Goblin", position: { x: 35, y: 0 } }
  assert.deepEqual(
    bonusActionsOf(grosk).find((entry) => entry.id === "intimidating-presence"),
    { id: "intimidating-presence", name: "Intimidating Presence", targeted: false }
  )
  // The near Goblin rolls 10 - 1 = 9 and is Frightened for a minute, 10 of its turns. The far one is out of reach.
  const used = useBonusAction({ characters: [grosk, near, far] as never[], actorId: "grosk", feature: "intimidating-presence", roll: falls(10) })
  const find = (id: string) => (used.characters as unknown as Hero[]).find((one) => one.id === id)
  assert.deepEqual([find("gob")?.conditions, find("gob-far")?.conditions], [[{ id: "frightened", source: "grosk", turns: 10 }], undefined])
  assert.equal(used.use?.fact, "Grosk strikes terror with Intimidating Presence: a DC 18 Wisdom saving throw. Goblin fails (9) and is Frightened of Grosk.")
  assert.deepEqual(find("grosk")?.featureUses, { "path-of-the-berserker-intimidating-presence": 1 })
  // Used again, a use of Rage restores it.
  const again = useBonusAction({ characters: used.characters, actorId: "grosk", feature: "intimidating-presence", roll: falls(10) })
  assert.deepEqual((again.characters[0] as Hero).featureUses, { "path-of-the-berserker-intimidating-presence": 2, "barbarian-rage": 1 })
  // With all five Rages spent and its use too, it is off the menu.
  assert.equal(
    bonusActionsOf({ ...grosk, featureUses: { "path-of-the-berserker-intimidating-presence": 1, "barbarian-rage": 5 } }).find((entry) => entry.id === "intimidating-presence"),
    undefined
  )
  // As the round turns, the Goblin saves again: 20 - 1 = 19 against 18 ends it, 5 - 1 = 4 does not.
  const scared = find("gob") as Hero
  const everyone = [grosk, scared] as never[]
  const shaken = barbarian.roundStart?.(scared, { everyone, d20: () => 20, roll: () => 1 })
  assert.deepEqual(shaken?.character.conditions, undefined)
  assert.match(shaken?.told?.text ?? "", /Goblin makes a DC 18 Wisdom saving throw against Grosk's Intimidating Presence: 19, a success/)
  assert.deepEqual(barbarian.roundStart?.(scared, { everyone, d20: () => 5, roll: () => 1 })?.character.conditions, scared.conditions)
  // Frightened after its own turn this round (11 turns), its first save waits for the end of its next turn.
  const late = { ...scared, conditions: [{ id: "frightened" as const, source: "grosk", turns: 11 }] }
  assert.deepEqual(barbarian.roundStart?.(late, { everyone, d20: () => 20, roll: () => 1 })?.character.conditions, late.conditions)
})

test("Indomitable Might: a Strength check or save totals at least the Strength score", () => {
  assert.deepEqual(
    [
      classTotalFloor(hero(s20), { kind: "save", ability: "str" }),
      classTotalFloor(hero(s20), { kind: "skill", skill: "athletics" }),
      classTotalFloor(hero(s20), { kind: "save", ability: "dex" }),
      classTotalFloor(hero(s17), { kind: "save", ability: "str" }),
    ],
    [25, 25, undefined, undefined]
  )
  // A 1 + 13 is 14, and the score 25 stands in for it.
  assert.equal(resolveCheck({ dice: [1], bonus: 13, dc: 24, leastTotal: 25 }).total, 25)
  const saved = rollSave({ target: hero(s20) as never, ability: "str", dc: 24, d20: () => 1, roll: () => 1, characters: [] })
  assert.deepEqual([saved.total, saved.success], [25, true])
})
