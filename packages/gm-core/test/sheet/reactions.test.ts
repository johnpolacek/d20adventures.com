import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { turnEffectWords } from "../../src/sheet/actions"
import { againstArmorClass, landBlow, rollAttack, strike } from "../../src/sheet/attack"
import type { ConditionEntry } from "../../src/sheet/condition-entry"
import { atRoundStart } from "../../src/sheet/death"
import {
  attackWithReactions,
  canReact,
  DEFAULT_ORDERS,
  immuneToMagicMissile,
  monsterReactions,
  moveWithReactions,
  offeredAttack,
  opportunityAttacks,
  opportunityWeapon,
  ordered,
  parryOffer,
  type ReactionOffer,
  reactionOfferSchema,
  resolveOpportunityAttack,
  shieldOffer,
  standingOrdersSchema,
  uncannyDodgeMatters,
  withReaction,
  withShield,
} from "../../src/sheet/reactions"
import type { Sheet } from "../../src/sheet/sheet"
import { combatStatsOf } from "../../src/sheet/stat-block"
import type { SpellEffect, TurnEffect } from "../../src/sheet/turn-effect"

// Every expected value below was worked out by hand from the SRD 5.2.1 rules for reactions, not copied from the function's output.

const sheet = (path: string) => (JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { sheet: Sheet }).sheet
type Character = {
  id: string
  name: string
  type: string
  sheet?: Sheet
  statBlock?: string
  hitPoints?: number
  tempHitPoints?: number
  conditions?: ConditionEntry[]
  turnEffects?: TurnEffect[]
  spellEffects?: SpellEffect[]
  spellSlots?: number[]
  featureUses?: Record<string, number>
  isComplete?: boolean
  position?: { x: number; y: number }
}
// Thalbern, a level 1 Ranger: Armor Class 15, 11 hit points, a Longbow, and a Shortsword +5 for 1d6 + 3 and a Dagger +5 for 1d4 + 3.
const thalbern: Character = { id: "thalbern", name: "Thalbern", type: "pc", sheet: sheet("the-midnight-summons/characters/thalbern.json"), hitPoints: 11, position: { x: 0, y: 0 } }
// Lyra, a level 1 Wizard with Dexterity 10 and no armor: Armor Class 10, 6 hit points, two level 1 slots. Shield prepared in place of Magic Missile.
const lyraSheet = sheet("covert-cargo/characters/1749159962941.json")
const lyra: Character = {
  id: "lyra",
  name: "Lyra",
  type: "pc",
  sheet: { ...lyraSheet, spells: ["detect-magic", "fog-cloud", "charm-person", "shield"], spellbook: [...(lyraSheet.spellbook ?? []), "shield"] },
  hitPoints: 6,
}
// A Bandit: Armor Class 12, 11 hit points, a Scimitar +3 for 1d6 + 1, and a Light Crossbow.
const bandit: Character = { id: "bandit", name: "Bandit", type: "npc", statBlock: "bandit", hitPoints: 11, position: { x: 5, y: 0 } }
// A Bandit Captain: Armor Class 15, and Parry for 2 against a melee hit while it holds a weapon.
const captain: Character = { id: "captain", name: "Bandit Captain", type: "npc", statBlock: "bandit-captain", hitPoints: 52 }
// A Mage: Armor Class 15 with Mage Armor, and Protective Magic, which casts Shield or Counterspell 3 times a day.
const mage: Character = { id: "mage", name: "Mage", type: "npc", statBlock: "mage", hitPoints: 81 }
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() as number

test("one Reaction a round: a second is refused, and the next round gives it back", () => {
  assert.equal(canReact(bandit), true)
  const spent = withReaction(bandit)
  assert.deepEqual(spent.turnEffects, [{ id: "reacted", by: "bandit", turns: 1 }])
  assert.equal(canReact(spent), false)
  // Taking it twice leaves one mark, and it is not shown as an effect.
  assert.deepEqual(withReaction(spent).turnEffects, [{ id: "reacted", by: "bandit", turns: 1 }])
  assert.equal(turnEffectWords(spent), "")
  // It stays spent after the Bandit's own turn this round, and the next round's start ends it.
  const done: Character = { ...spent, isComplete: true }
  assert.equal(canReact(done), false)
  const next = atRoundStart(done)
  assert.equal(next.turnEffects, undefined)
  assert.equal(canReact(next), true)
  // One who is down, gone or Incapacitated takes none.
  assert.equal(canReact({ ...bandit, hitPoints: 0 }), false)
  assert.equal(canReact({ ...bandit, conditions: [{ id: "stunned" }] }), false)
  assert.equal(canReact({ ...bandit, conditions: [{ id: "prone" }] }), true)
})

test("a rolled attack is read again against a raised Armor Class: a hit turns to a miss, and a 20 on the die still hits", () => {
  // Bandit's Scimitar on Lyra: 9 + 3 is 12 against Armor Class 10, a hit. Against 15 it misses.
  const rolled = rollAttack({ attacker: bandit, target: lyra, weapon: "scimitar", dice: [9], roll: falls() })
  assert.deepEqual([rolled.roll.total, rolled.roll.armorClass, rolled.roll.hit], [12, 10, true])
  const raised = againstArmorClass(rolled, 15)
  assert.deepEqual([raised.roll.armorClass, raised.roll.hit, raised.roll.critical], [15, false, false])
  // A 20 is a Critical Hit, 23, and hits whatever the Armor Class.
  const critical = againstArmorClass(rollAttack({ attacker: bandit, target: lyra, weapon: "scimitar", dice: [20], roll: falls() }), 30)
  assert.deepEqual([critical.roll.hit, critical.roll.critical], [true, true])
  // A miss stays a miss, even against a lower one: 2 + 3 is 5.
  const miss = rollAttack({ attacker: bandit, target: lyra, weapon: "scimitar", dice: [2], roll: falls() })
  assert.equal(againstArmorClass(miss, 4).roll.hit, false)
  // A total equal to the new Armor Class still hits: 12 against 12.
  assert.equal(againstArmorClass(rolled, 12).roll.hit, true)
})

test("strike is rollAttack and then landBlow on the same dice", () => {
  // Thalbern's Shortsword on the Bandit: 10 + 5 is 15 against 12, a hit for 4 + 3, 7, his Savage Attacker's second d6
  // a 1. The Bandit is left with 4.
  const args = { attacker: thalbern, target: bandit, weapon: "shortsword", dice: [10] }
  const whole = strike({ ...args, roll: falls(4, 1) })
  const halves = landBlow({ ...args, roll: falls(4, 1) }, rollAttack({ ...args, roll: falls() }))
  assert.deepEqual(halves, whole)
  assert.deepEqual([whole.taken, whole.hitPoints.after, whole.target.hitPoints], [7, 4, 4])
  // A Critical Hit on a 20 rolls the d6 twice: 4 + 2 + 3 is 9, and the second pair, 1 and 1, is less.
  const critical = strike({ ...args, dice: [20], roll: falls(4, 2, 1, 1) })
  assert.deepEqual(landBlow({ ...args, roll: falls(4, 2, 1, 1) }, rollAttack({ ...args, dice: [20], roll: falls() })), critical)
  assert.equal(critical.taken, 9)
  // A miss turned by a reaction lands nothing.
  const turned = landBlow({ ...args, roll: falls(4) }, againstArmorClass(rollAttack({ ...args, roll: falls() }), 16))
  assert.deepEqual([turned.roll.hit, turned.taken, turned.target.hitPoints], [false, 0, 11])
})

test("an Opportunity Attack falls to the Bandit whose reach a hero walks out of, and not when it cannot be made", () => {
  const scene = [thalbern, bandit]
  // Thalbern 5 feet from the Bandit walks 20 feet away: he leaves its 5-foot reach.
  const away = { mover: thalbern, from: { x: 0, y: 0 }, to: { x: -20, y: 0 }, everyone: scene }
  assert.deepEqual(
    opportunityAttacks(away).map(({ attacker, weapon }) => [attacker.id, weapon]),
    [["bandit", "scimitar"]]
  )
  // Disengaged, forced or teleported: none.
  assert.deepEqual(opportunityAttacks({ ...away, disengaged: true }), [])
  assert.deepEqual(opportunityAttacks({ ...away, forced: true }), [])
  assert.deepEqual(opportunityAttacks({ ...away, teleport: true }), [])
  // A Bandit that has reacted, is Blinded, or cannot see an Invisible hero: none.
  assert.deepEqual(opportunityAttacks({ ...away, everyone: [thalbern, withReaction(bandit)] }), [])
  assert.deepEqual(opportunityAttacks({ ...away, everyone: [thalbern, { ...bandit, conditions: [{ id: "blinded" }] }] }), [])
  const unseen = { ...thalbern, conditions: [{ id: "invisible" as const }] }
  assert.deepEqual(opportunityAttacks({ ...away, mover: unseen, everyone: [unseen, bandit] }), [])
  // Stepping round inside its reach, to 3 feet off, leaves nothing. An ally hero does not attack.
  assert.deepEqual(opportunityAttacks({ ...away, to: { x: 5, y: 3 } }), [])
  const ally: Character = { ...lyra, position: { x: 5, y: 0 } }
  assert.deepEqual(opportunityAttacks({ ...away, everyone: [thalbern, ally] }), [])
  // Thalbern's own Opportunity Attack is made with his Shortsword, 1d6 + 3, over the Dagger's 1d4 + 3 and never the Longbow.
  assert.equal(opportunityWeapon(thalbern)?.id, "shortsword")
})

test("an Opportunity Attack is one melee attack by the usual rules, and spends the attacker's Reaction", () => {
  // The Bandit's Scimitar on Thalbern: 13 + 3 is 16 against Armor Class 15, a hit for 5 + 1, 6. He has 5 of 11 left.
  const made = resolveOpportunityAttack({ attacker: bandit, target: thalbern, weapon: "scimitar", dice: [13], roll: falls(5) })
  assert.deepEqual([made.blow.roll.total, made.blow.roll.hit, made.blow.taken, made.target.hitPoints], [16, true, 6, 5])
  assert.equal(canReact(made.attacker), false)
  assert.equal(
    made.fact,
    "Bandit makes an Opportunity Attack. Bandit's Scimitar attack on Thalbern HITS (16 against Armor Class 15) for 6 slashing damage. Thalbern has 5 of 11 hit points left and is Bloodied."
  )
  // A miss spends it too: 11 + 3 is 14.
  const missed = resolveOpportunityAttack({ attacker: bandit, target: thalbern, weapon: "scimitar", dice: [11], roll: falls() })
  assert.deepEqual([missed.blow.taken, missed.target.hitPoints, canReact(missed.attacker)], [0, 11, false])
})

test("a Glaive reaches 10 feet: a mover leaving 10 feet away provokes, and one that stays within it does not", () => {
  // Branka, a Fighter, holds a Glaive (1d10 + 3, reach 10) and a Dagger. A Bandit 10 feet from her steps back 5 feet.
  const branka: Character = {
    id: "branka",
    name: "Branka",
    type: "pc",
    sheet: { ...sheet("welcome-to-kordavos/characters/branka-stoneveil.json"), weapons: ["glaive", "dagger"] },
    position: { x: 10, y: 0 },
  }
  const mover = { ...bandit, position: { x: 0, y: 0 } }
  const back = { mover, from: { x: 0, y: 0 }, to: { x: -5, y: 0 }, everyone: [mover, branka] }
  assert.deepEqual(
    opportunityAttacks(back).map(({ attacker, weapon }) => [attacker.id, weapon]),
    [["branka", "glaive"]]
  )
  // To 8 feet aside, √(10² + 8²) ≈ 12.8 feet from her: out of reach. To 2 feet nearer: still within it.
  assert.equal(opportunityAttacks({ ...back, to: { x: 0, y: 8 } }).length, 1)
  assert.deepEqual(opportunityAttacks({ ...back, to: { x: 2, y: 0 } }), [])
  // With only a Dagger she reaches 5 feet, and the Bandit 10 feet off is not in it to leave.
  const short = { ...branka, sheet: { ...(branka.sheet as Sheet), weapons: ["dagger"] } }
  assert.deepEqual(opportunityAttacks({ ...back, everyone: [mover, short] }), [])
})

test("Shield is offered with the spell, a slot and a hit it would turn, and lasts until the next round", () => {
  // The Bandit's Scimitar: 9 + 3 is 12 against Lyra's 10. With Shield, 15: it misses, so it matters.
  const rolled = rollAttack({ attacker: bandit, target: lyra, weapon: "scimitar", dice: [9], roll: falls() })
  assert.deepEqual(shieldOffer(lyra, rolled), { cost: { kind: "slot", level: 1 }, armorClass: 15, matters: true })
  // 14 + 3 is 17: Shield is offered and does not turn it. A 20 on the die cannot be turned.
  assert.equal(shieldOffer(lyra, rollAttack({ attacker: bandit, target: lyra, weapon: "scimitar", dice: [14], roll: falls() }))?.matters, false)
  assert.equal(shieldOffer(lyra, rollAttack({ attacker: bandit, target: lyra, weapon: "scimitar", dice: [20], roll: falls() }))?.matters, false)
  // No offer on a miss, with no slot left, without the spell, or with the Reaction spent.
  assert.equal(shieldOffer(lyra, rollAttack({ attacker: bandit, target: lyra, weapon: "scimitar", dice: [5], roll: falls() })), undefined)
  assert.equal(shieldOffer({ ...lyra, spellSlots: [2] }, rolled), undefined)
  assert.equal(shieldOffer({ ...lyra, sheet: lyraSheet }, rolled), undefined)
  assert.equal(shieldOffer(withReaction(lyra), rolled), undefined)
  // Cast: one slot spent, the Reaction taken, Armor Class 15 against the rest, and no damage from Magic Missile.
  const shielded = withShield(lyra)
  assert.deepEqual([shielded.spellSlots, canReact(shielded), combatStatsOf(shielded)?.armorClass, immuneToMagicMissile(shielded)], [[1], false, 15, true])
  assert.equal(againstArmorClass(rolled, 15).roll.hit, false)
  // A second Scimitar this round rolls against 15: 11 + 3 is 14, a miss.
  assert.equal(rollAttack({ attacker: bandit, target: shielded, weapon: "scimitar", dice: [11], roll: falls() }).roll.hit, false)
  // The next round begins: Shield is gone, Armor Class 10 again, and her Reaction is back.
  const next = atRoundStart(shielded)
  assert.deepEqual([combatStatsOf(next)?.armorClass, immuneToMagicMissile(next), canReact(next), next.spellSlots], [10, false, true, [1]])
})

test("a Mage casts Shield by Protective Magic, three times a day", () => {
  assert.deepEqual(monsterReactions(mage), [{ id: "shield", name: "Protective Magic", uses: 3, left: 3 }])
  // Thalbern's Shortsword: 12 + 5 is 17 against 15. With Shield, 20: it misses.
  const rolled = rollAttack({ attacker: thalbern, target: mage, weapon: "shortsword", dice: [12], roll: falls() })
  assert.deepEqual(shieldOffer(mage, rolled), { cost: { kind: "free", feature: "Protective Magic" }, armorClass: 20, matters: true })
  const shielded = withShield(mage)
  assert.deepEqual([shielded.featureUses, combatStatsOf(shielded)?.armorClass, canReact(shielded)], [{ "Protective Magic": 1 }, 20, false])
  assert.equal(shieldOffer({ ...mage, featureUses: { "Protective Magic": 3 } }, rolled), undefined)
})

test("Parry: a Bandit Captain adds 2 against a melee hit", () => {
  assert.deepEqual(monsterReactions(captain), [{ id: "parry", name: "Parry", bonus: 2 }])
  assert.deepEqual(monsterReactions(bandit), [])
  // Thalbern's Shortsword: 11 + 5 is 16 against 15, a hit. Parried, 17: a miss.
  const rolled = rollAttack({ attacker: thalbern, target: captain, weapon: "shortsword", dice: [11], roll: falls() })
  assert.deepEqual(parryOffer(captain, rolled), { bonus: 2, armorClass: 17, matters: true })
  assert.equal(againstArmorClass(rolled, 17).roll.hit, false)
  // 13 + 5 is 18: parried to 17, still a hit. A 20 cannot be parried away.
  assert.equal(parryOffer(captain, rollAttack({ attacker: thalbern, target: captain, weapon: "shortsword", dice: [13], roll: falls() }))?.matters, false)
  assert.equal(parryOffer(captain, rollAttack({ attacker: thalbern, target: captain, weapon: "shortsword", dice: [20], roll: falls() }))?.matters, false)
  // Not a ranged hit: the Longbow, 11 + 5. Not a Dagger thrown from 20 feet. Not with the Reaction spent.
  assert.equal(parryOffer(captain, rollAttack({ attacker: thalbern, target: captain, weapon: "longbow", dice: [11], roll: falls() })), undefined)
  const thrown = rollAttack({ attacker: thalbern, target: captain, weapon: "dagger", dice: [11], roll: falls() })
  assert.equal(parryOffer({ ...captain, position: { x: 20, y: 0 } }, thrown, thalbern), undefined)
  assert.equal(parryOffer({ ...captain, position: { x: 5, y: 0 } }, thrown, thalbern)?.matters, true)
  assert.equal(parryOffer(withReaction(captain), rolled), undefined)
})

test("each standing order's answer, and the defaults", () => {
  assert.deepEqual(DEFAULT_ORDERS, {
    "opportunity-attack": "always",
    shield: "when-it-matters",
    parry: "when-it-matters",
    "uncanny-dodge": "when-it-matters",
    counterspell: "when-it-matters",
    "cutting-words": "when-it-matters",
  })
  assert.deepEqual([ordered(undefined, "shield", true), ordered(undefined, "shield", false)], [true, false])
  assert.deepEqual([ordered({ shield: "always" }, "shield", false), ordered({ shield: "never" }, "shield", true)], [true, false])
  // An Opportunity Attack always matters, so when-it-matters takes it. Never refuses it.
  assert.deepEqual([ordered(undefined, "opportunity-attack", false), ordered({ "opportunity-attack": "when-it-matters" }, "opportunity-attack", false)], [true, true])
  assert.equal(ordered({ "opportunity-attack": "never" }, "opportunity-attack", true), false)
  assert.equal(standingOrdersSchema.safeParse({ shield: "always" }).success, true)
  assert.equal(standingOrdersSchema.safeParse({ shield: "sometimes" }).success, false)
  assert.equal(standingOrdersSchema.safeParse({ dodge: "always" }).success, false)
})

test("Uncanny Dodge matters on a hit of a quarter of the hit point maximum, or one that would drop the hero", () => {
  // Thalbern has 11 of 11: a quarter is 2.75, so 3 matters and 2 does not.
  assert.deepEqual([uncannyDodgeMatters(thalbern, 3), uncannyDodgeMatters(thalbern, 2)], [true, false])
  // With 2 left, 2 drops him. 3 Temporary Hit Points hold 2 off, and 1 does not matter.
  assert.equal(uncannyDodgeMatters({ ...thalbern, hitPoints: 2 }, 2), true)
  assert.equal(uncannyDodgeMatters({ ...thalbern, hitPoints: 2, tempHitPoints: 3 }, 2), false)
  assert.equal(uncannyDodgeMatters({ ...thalbern, hitPoints: 2 }, 1), false)
})

test("an offer is plain data that makes the rolled attack whole again", () => {
  const rolled = rollAttack({ attacker: bandit, target: lyra, weapon: "scimitar", dice: [9], roll: falls() })
  const offer: ReactionOffer = { id: "shield", to: "lyra", from: "bandit", weapon: "scimitar", roll: rolled.roll, matters: true }
  const stored = reactionOfferSchema.parse(JSON.parse(JSON.stringify(offer)))
  assert.deepEqual(offeredAttack(stored, bandit), rolled)
  assert.equal(offeredAttack({ id: "opportunity-attack", to: "bandit", from: "thalbern", weapon: "scimitar", matters: true }, bandit), undefined)
  assert.equal(reactionOfferSchema.safeParse({ ...offer, id: "dodge" }).success, false)
})

test("an attack is answered by Shield or Parry when the one hit is asked and says yes", () => {
  const yes = () => true
  const no = () => false
  // A Bandit, Scimitar +3 for 1d6 + 1, rolls an 11: 14 hits Lyra's Armor Class 10. Shield makes it 15: a miss. She has
  // one slot fewer, no Reaction left, and Shield on her. Said no to, the blow lands: a 4 on the d6 and 1 is 5 of her 6.
  const robber: Character = { id: "bandit", name: "Bandit", type: "npc", statBlock: "bandit", hitPoints: 11, position: { x: 5, y: 0 } }
  const mage: Character = { ...lyra, position: { x: 0, y: 0 } }
  const blocked = attackWithReactions({ characters: [mage, robber], attackerId: "bandit", targetId: "lyra", weapon: "scimitar", dice: [11], roll: () => 4, ask: yes })
  assert.deepEqual([blocked.blow.roll.hit, blocked.blow.roll.armorClass, blocked.target.hitPoints, blocked.target.spellSlots, canReact(blocked.target)], [false, 15, 6, [1], false])
  assert.deepEqual(blocked.reactions, [{ by: "lyra", id: "shield", name: "Shield", text: "Lyra casts Shield: Armor Class 15 until their next turn." }])
  const taken = attackWithReactions({ characters: [mage, robber], attackerId: "bandit", targetId: "lyra", weapon: "scimitar", dice: [11], roll: () => 4, ask: no })
  assert.deepEqual([taken.blow.roll.hit, taken.target.hitPoints, taken.target.spellSlots, taken.reactions], [true, 1, undefined, []])
  // What is asked says whether it matters: a 14 against 10 does, and a 17 would hit 15 all the same.
  const asked: boolean[] = []
  const note = (offer: ReactionOffer) => asked.push(offer.matters) > 0 && false
  attackWithReactions({ characters: [mage, robber], attackerId: "bandit", targetId: "lyra", weapon: "scimitar", dice: [11], roll: () => 4, ask: note })
  attackWithReactions({ characters: [mage, robber], attackerId: "bandit", targetId: "lyra", weapon: "scimitar", dice: [14], roll: () => 4, ask: note })
  assert.deepEqual(asked, [true, false])
  // A miss asks nothing.
  assert.equal(
    attackWithReactions({ characters: [mage, robber], attackerId: "bandit", targetId: "lyra", weapon: "scimitar", dice: [3], roll: () => 4, ask: () => assert.fail("asked on a miss") }).blow.roll.hit,
    false
  )
})

test("a move draws an Opportunity Attack from each whose reach it leaves, and a blow that drops the mover stops it", () => {
  const yes = () => true
  // Thalbern at the origin beside a Bandit 5 feet east walks 20 feet west in two legs. The Bandit strikes as he
  // leaves its reach on the first leg: Scimitar +3 with a 15 is 18 against Armor Class 15, a hit for 4 + 1. He goes on
  // with 6 hit points, and the Bandit has no Reaction left.
  const robber: Character = { id: "bandit", name: "Bandit", type: "npc", statBlock: "bandit", hitPoints: 11, position: { x: 5, y: 0 } }
  const path = [
    { x: -10, y: 0 },
    { x: -20, y: 0 },
  ]
  const went = moveWithReactions({ characters: [thalbern, robber], moverId: "thalbern", path, ask: yes, d20: () => 15, roll: () => 4 })
  const find = (characters: Character[], id: string) => characters.find((character) => character.id === id) as Character
  assert.deepEqual([went.attacks.length, went.attacks[0].attacker, went.attacks[0].blow.taken, went.stopped], [1, "bandit", 5, false])
  assert.deepEqual([find(went.characters, "thalbern").position, find(went.characters, "thalbern").hitPoints, canReact(find(went.characters, "bandit"))], [{ x: -20, y: 0 }, 6, false])
  // One who Disengaged draws none, and one the Bandit is told not to strike is let go.
  assert.equal(moveWithReactions({ characters: [thalbern, robber], moverId: "thalbern", path, disengaged: true, ask: yes, d20: () => 15, roll: () => 4 }).attacks.length, 0)
  assert.equal(moveWithReactions({ characters: [thalbern, robber], moverId: "thalbern", path, ask: () => false, d20: () => 15, roll: () => 4 }).attacks.length, 0)
  // With 5 hit points left the blow drops him, and he falls where he stood.
  const hurt = { ...thalbern, hitPoints: 5 }
  const fell = moveWithReactions({ characters: [hurt, robber], moverId: "thalbern", path, ask: yes, d20: () => 15, roll: () => 4 })
  assert.deepEqual([fell.stopped, find(fell.characters, "thalbern").position, find(fell.characters, "thalbern").hitPoints], [true, { x: 0, y: 0 }, 0])
})
