import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { rollAttack, strike, weaponAttack } from "../../src/sheet/attack"
import { attackAfter, attackRequirement, followingRoll, type InScene } from "../../src/sheet/attack-roll"
import { channelDivinity, divinityPicksOf } from "../../src/sheet/channel-divinity"
import { resolveCheck } from "../../src/sheet/check"
import { classCheckModes } from "../../src/sheet/class-rules"
import { inspirationUse, withInspirationSpent } from "../../src/sheet/classes/bard"
import { tacticalMind } from "../../src/sheet/classes/fighter"
import { deriveSheet, sheetProblems } from "../../src/sheet/derive"
import { attacksPerAction, criticalFrom, usesLeft, withFeatureUsed } from "../../src/sheet/feature-rules"
import { bonusActionsOf, useBonusAction } from "../../src/sheet/features"
import { rollInitiative } from "../../src/sheet/initiative"
import { attackWithReactions, checkWithReactions, ordered, reactionsOf } from "../../src/sheet/reactions"
import { memorizeSpell, shortRest } from "../../src/sheet/rest"
import type { Sheet } from "../../src/sheet/sheet"
import { sheetView } from "../../src/sheet/view"
import type { RequiredRoll } from "../../src/validations/roll-requirement-schema"

// Every expected value below was worked out by hand from the SRD 5.2.1 class features and feats, not copied from the
// function's output.

const hero = (path: string) => (JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { sheet: Sheet }).sheet
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() as number
const never = () => false
const always = () => true

const branka = hero("welcome-to-kordavos/characters/branka-stoneveil.json")
const thalbern = hero("covert-cargo/characters/thalbern.json")
const poppen = hero("covert-cargo/characters/1749307435667.json")
const ilya = hero("welcome-to-kordavos/characters/ilya-veles.json")
const milos = hero("welcome-to-kordavos/characters/milos-radan.json")
const lyra = hero("covert-cargo/characters/1749159962941.json")

// Branka at level 5, a Champion: Strength 18 from her Ability Score Improvement, so her Warhammer is +4 and +3, +7.
const fighter5: Sheet = {
  ...branka,
  level: 5,
  subclass: "champion",
  abilityScores: { ...branka.abilityScores, str: 18 },
  advancements: [{ level: 4, feat: "ability-score-improvement", abilities: { str: 2 } }],
}
const fighter2: Sheet = { ...branka, level: 2 }
// Thalbern at level 5, a Hunter with the Archery style and Colossus Slayer: Dexterity 18, Expertise in Stealth.
const ranger5: Sheet = {
  ...thalbern,
  level: 5,
  subclass: "hunter",
  abilityScores: { ...thalbern.abilityScores, dex: 18, con: 14 },
  expertise: ["stealth"],
  featureChoices: { "ranger-fighting-style": "archery", "hunter-hunters-prey": "colossus-slayer" },
  advancements: [{ level: 4, feat: "ability-score-improvement", abilities: { dex: 1, con: 1 } }],
  spells: ["cure-wounds", "speak-with-animals", "goodberry", "entangle", "aid", "pass-without-trace"],
}
// Poppen at level 5, a Thief: Dexterity 18, so +4, and a Proficiency Bonus of 3.
const rogue5: Sheet = {
  ...poppen,
  level: 5,
  subclass: "thief",
  abilityScores: { ...poppen.abilityScores, dex: 18 },
  advancements: [{ level: 4, feat: "ability-score-improvement", abilities: { dex: 2 } }],
}
// Ilya at level 5, of the College of Lore: Charisma 18, four uses of Bardic Inspiration, a d8.
const bard5: Sheet = {
  ...ilya,
  level: 5,
  subclass: "college-of-lore",
  expertise: ["performance", "persuasion"],
  cantrips: ["vicious-mockery", "minor-illusion", "light"],
  spells: ["charm-person", "healing-word", "sleep", "heroism", "dissonant-whispers", "faerie-fire", "hold-person", "invisibility", "bestow-curse"],
  advancements: [
    { level: 3, skills: ["athletics", "stealth", "investigation"] },
    { level: 4, feat: "ability-score-improvement", abilities: { cha: 2 } },
  ],
  abilityScores: { ...ilya.abilityScores, cha: 18 },
}
// Milos at level 5, of the Life Domain: Wisdom 18, so +4, and a spell save DC of 8 + 3 + 4, 15.
const cleric5: Sheet = {
  ...milos,
  level: 5,
  subclass: "life-domain",
  abilityScores: { ...milos.abilityScores, wis: 18 },
  advancements: [{ level: 4, feat: "ability-score-improvement", abilities: { wis: 2 } }],
  cantrips: ["sacred-flame", "guidance", "light", "thaumaturgy", "spare-the-dying"],
  spells: ["healing-word", "guiding-bolt", "shield-of-faith", "command", "spiritual-weapon", "sanctuary", "prayer-of-healing", "dispel-magic", "spirit-guardians"],
}

type Body = InScene & { id: string; name: string; type: string; isComplete?: boolean; initiative?: number; featureUses?: Record<string, number>; spellSlots?: number[] }
const pc = (id: string, name: string, sheet: Sheet, more: Partial<Body> = {}): Body => ({ id, name, type: "pc", sheet, ...more })
const npc = (id: string, name: string, statBlock: string, more: Partial<Body> = {}): Body => ({ id, name, type: "npc", statBlock, ...more })
const find = <T extends { id: string }>(characters: readonly T[], id: string) => characters.find((character) => character.id === id) as T

test("the level 5 sheets of the tests are legal", () => {
  for (const sheet of [fighter5, ranger5, rogue5, bard5, cleric5]) assert.deepEqual(sheetProblems(sheet), [])
})

test("Extra Attack: a level 5 Fighter attacks twice, and Action Surge gives another action's two", () => {
  assert.deepEqual([attacksPerAction({ sheet: fighter5 }), attacksPerAction({ sheet: fighter2 }), attacksPerAction({ sheet: rogue5 })], [2, 1, 1])
  const her = pc("branka", "Branka", fighter5)
  assert.deepEqual([attackAfter(her), attackAfter(her, { actions: 2 }), attackAfter(pc("branka", "Branka", fighter2), { actions: 2 })], [{ attacks: 1 }, { attacks: 3 }, { attacks: 1 }])
  // Action Surge has one use at level 2, and a Short Rest gives it back.
  const surged = withFeatureUsed(pc("branka", "Branka", fighter2, { hitPoints: 24 }), "fighter-action-surge")
  assert.deepEqual([usesLeft(pc("b", "B", fighter2), "fighter-action-surge"), usesLeft(surged, "fighter-action-surge")], [1, 0])
  assert.equal(usesLeft(shortRest(surged, { roll: falls() }).character, "fighter-action-surge"), 1)
})

test("the second attack goes at the same target, or at the nearest the weapon reaches once that one is down, or nowhere", () => {
  // Branka at (0, 0), the Owlbear 5 feet off, a Bandit 5 feet off the other way, and a second Bandit 30 feet off.
  const her = pc("branka", "Branka", fighter5, { position: { x: 0, y: 0 } })
  const owlbear = npc("owlbear", "Owlbear", "owlbear", { position: { x: 7.5, y: 0 } })
  const near = npc("near", "Bandit", "bandit", { position: { x: -5, y: 0 } })
  const far = npc("far", "Bandit", "bandit", { position: { x: 0, y: 30 } })
  const floor = { solids: [], doors: [] }
  const first: RequiredRoll = { attack: { weapon: "warhammer", target: "owlbear" }, rollType: "Warhammer", difficulty: 13, modifier: 7, mode: "normal", after: { attacks: 1 } }
  // The Owlbear still stands: the second swing goes at it, +7 against its Armor Class 13, with nothing more to follow.
  const again = followingRoll({ character: her, made: first, present: [her, owlbear, near, far], floor })
  assert.deepEqual(again, { attack: { weapon: "warhammer", target: "owlbear" }, rollType: "Warhammer", difficulty: 13, modifier: 7, mode: "normal", after: { struck: ["owlbear"] } })
  // That second attack leaves nothing after it.
  assert.equal(followingRoll({ character: her, made: again as RequiredRoll, present: [her, owlbear, near, far], floor }), undefined)
  // The Owlbear is down: the swing goes at the Bandit beside her, Armor Class 12, and never the one 30 feet off.
  const dropped = { ...owlbear, hitPoints: 0 }
  assert.deepEqual(followingRoll({ character: her, made: first, present: [her, dropped, near, far], floor }), {
    attack: { weapon: "warhammer", target: "near" },
    rollType: "Warhammer",
    difficulty: 12,
    modifier: 7,
    mode: "normal",
    after: { struck: ["owlbear"] },
  })
  // With only the far Bandit up, no enemy is in reach: no second attack.
  assert.equal(followingRoll({ character: her, made: first, present: [her, dropped, { ...near, dead: true as const }, far], floor }), undefined)
})

test("Improved Critical: a Champion's 19 is a Critical Hit, and hits whatever the Armor Class", () => {
  assert.deepEqual([criticalFrom({ sheet: fighter5 }), criticalFrom({ sheet: fighter2 })], [19, 20])
  const target = { type: "npc", statBlock: "owlbear" }
  const champion = rollAttack({ attacker: { type: "pc", sheet: fighter5 }, target, weapon: "warhammer", dice: [19], roll: falls(), cover: "three-quarters" })
  assert.deepEqual([champion.roll.hit, champion.roll.critical, champion.roll.criticalFrom], [true, true, 19])
  // At level 2 a 19 makes 19 + 5, 24, a plain hit on 13.
  const plain = rollAttack({ attacker: { type: "pc", sheet: fighter2 }, target, weapon: "warhammer", dice: [19], roll: falls() })
  assert.deepEqual([plain.roll.hit, plain.roll.critical], [true, false])
})

test("Remarkable Athlete: Advantage on Athletics and on Initiative", () => {
  const her = { type: "pc", sheet: fighter5 }
  assert.deepEqual(classCheckModes(her, { kind: "skill", skill: "athletics" }), [{ mode: "advantage", from: "Remarkable Athlete" }])
  assert.deepEqual(classCheckModes({ type: "pc", sheet: fighter2 }, { kind: "skill", skill: "athletics" }), [])
  // Dexterity 10 adds nothing: of a 4 and a 15 she keeps the 15. At level 2 the first die is all she has.
  assert.deepEqual([rollInitiative(her, 4, 15), rollInitiative({ type: "pc", sheet: fighter2 }, 4, 15)], [15, 4])
})

test("Tactical Mind: a failed ability check takes a d10, paid for with Second Wind only when it then succeeds", () => {
  const her = pc("branka", "Branka", fighter2)
  const failed = resolveCheck({ dice: [7], bonus: 5, dc: 15 })
  // 12 against 15: a 4 makes 16, a success, and a use of Second Wind is spent.
  const turned = tacticalMind(her, { kind: "skill", skill: "athletics" }, failed, falls(4))
  assert.deepEqual([turned?.result.total, turned?.result.success, turned?.result.adds, turned?.spent], [16, true, [{ from: "Tactical Mind", amount: 4 }], true])
  // A 2 makes 14: still a failure, and the use is kept.
  assert.deepEqual(
    [tacticalMind(her, { kind: "skill", skill: "athletics" }, failed, falls(2))?.result.success, tacticalMind(her, { kind: "skill", skill: "athletics" }, failed, falls(2))?.spent],
    [false, false]
  )
  // Short by 11 a d10 cannot save it. A saving throw is no ability check. A level 1 Fighter has no Tactical Mind, and one with no Second Wind left cannot use it.
  assert.equal(tacticalMind(her, { kind: "ability", ability: "str" }, resolveCheck({ dice: [1], bonus: 3, dc: 15 }), falls(10)), undefined)
  assert.equal(tacticalMind(her, { kind: "save", ability: "con" }, failed, falls(4)), undefined)
  assert.equal(tacticalMind(pc("b", "B", branka), { kind: "skill", skill: "athletics" }, failed, falls(4)), undefined)
  assert.equal(tacticalMind({ ...her, featureUses: { "fighter-second-wind": 2 } }, { kind: "skill", skill: "athletics" }, failed, falls(4)), undefined)
})

test("Archery adds 2 to a Ranged weapon, and Great Weapon Fighting counts a 1 or 2 on a Two-Handed weapon's die as 3", () => {
  // Longbow: Dexterity 18 is +4, the Proficiency Bonus 3, Archery 2: +9. The Shortsword is a melee weapon: +7.
  assert.deepEqual([weaponAttack(ranger5, "longbow").bonus, weaponAttack(ranger5, "shortsword").bonus], [9, 7])
  // A Fighter with a Greatsword and Great Weapon Fighting: 2d6 + 3. A 1 and a 2 count as 3 and 3: 9. Savage Attacker's
  // second pair, 1 and 1, also counts as 9.
  const greatsword: Sheet = { ...branka, shield: false, weapons: ["greatsword"], featureChoices: { "fighter-fighting-style": "great-weapon-fighting" } }
  const blow = strike({ attacker: { type: "pc", sheet: greatsword }, target: { type: "npc", statBlock: "owlbear" }, weapon: "greatsword", dice: [15], roll: falls(1, 2, 1, 1) })
  assert.deepEqual([blow.damage?.parts[0].dice, blow.taken], [[3, 3], 9])
})

test("Colossus Slayer adds 1d8 to a hurt creature once a turn, as Savage Attacker rolls the weapon's dice twice once a turn", () => {
  const ranger = pc("thalbern", "Thalbern", ranger5, { initiative: 20 })
  const owlbear = npc("owlbear", "Owlbear", "owlbear", { hitPoints: 50, initiative: 5 })
  // A 15 and +9 hit Armor Class 13. The Longbow's d8: 5 and then 1, the 5 kept, and 4: 9. The Owlbear is missing hit
  // points, so Colossus Slayer's d8 adds 6: 15, from 50 to 35.
  const first = attackWithReactions({ characters: [ranger, owlbear], attackerId: "thalbern", targetId: "owlbear", weapon: "longbow", dice: [15], roll: falls(5, 1, 6), ask: never })
  assert.deepEqual([first.blow.taken, first.blow.features, first.target.hitPoints], [15, ["Colossus Slayer", "Savage Attacker"], 35])
  assert.deepEqual(find(first.characters, "thalbern").turnEffects, [
    { id: "colossus-slayer", by: "thalbern", turns: 1 },
    { id: "savage-attacker", by: "thalbern", turns: 1 },
  ])
  // His second attack this turn has neither: a 5 and 4 is 9, from 35 to 26.
  const second = attackWithReactions({ characters: first.characters, attackerId: "thalbern", targetId: "owlbear", weapon: "longbow", dice: [15], roll: falls(5), ask: never })
  assert.deepEqual([second.blow.taken, second.blow.features, second.target.hitPoints], [9, undefined, 26])
  // A creature at its full hit points takes no Colossus Slayer.
  assert.deepEqual(strike({ attacker: ranger, target: { ...owlbear, hitPoints: 59 }, weapon: "longbow", dice: [15], roll: falls(5, 1) }).features, ["Savage Attacker"])
})

test("Horde Breaker: after the Attack action, one more attack at a creature beside the one attacked", () => {
  const hunter: Sheet = { ...ranger5, featureChoices: { ...ranger5.featureChoices, "hunter-hunters-prey": "horde-breaker" } }
  const ranger = pc("thalbern", "Thalbern", hunter, { position: { x: 0, y: 0 } })
  const first = npc("first", "Bandit", "bandit", { position: { x: 30, y: 0 } })
  const second = npc("second", "Bandit", "bandit", { position: { x: 35, y: 0 } })
  const away = npc("away", "Bandit", "bandit", { position: { x: 30, y: 40 } })
  const present = [ranger, first, second, away]
  const floor = { solids: [], doors: [] }
  assert.deepEqual(attackAfter(ranger), { attacks: 1, horde: true })
  const shot: RequiredRoll = { attack: { weapon: "longbow", target: "first" }, rollType: "Longbow", difficulty: 12, modifier: 9, mode: "normal", after: { attacks: 1, horde: true } }
  // The Extra Attack first, at the same Bandit.
  const again = followingRoll({ character: ranger, made: shot, present, floor }) as RequiredRoll
  assert.deepEqual(["attack" in again && again.attack.target, again.after], ["first", { horde: true, struck: ["first"] }])
  // Then Horde Breaker, at the Bandit 5 feet from the first, and never the one 40 feet from it.
  const horde = followingRoll({ character: ranger, made: again, present, floor }) as RequiredRoll
  assert.deepEqual(["attack" in horde && horde.attack.target, horde.after], ["second", { struck: ["first", "second"] }])
  assert.equal(followingRoll({ character: ranger, made: horde, present, floor }), undefined)
})

test("Cunning Action and Steady Aim are a Rogue's Bonus Actions", () => {
  assert.deepEqual(
    bonusActionsOf({ sheet: rogue5 }).map((entry) => entry.id),
    ["cunning-action-dash", "cunning-action-disengage", "cunning-action-hide", "rogue-steady-aim"]
  )
  assert.deepEqual(
    bonusActionsOf({ sheet: { ...poppen, level: 2 } }).map((entry) => entry.id),
    ["cunning-action-dash", "cunning-action-disengage", "cunning-action-hide"]
  )
  const used = useBonusAction({ characters: [pc("poppen", "Poppen", rogue5)], actorId: "poppen", feature: "cunning-action-hide", roll: falls() })
  assert.equal(used.use?.fact, "Poppen takes the Hide action as a Bonus Action.")
  // A Hide taken with Cunning Action is the Stealth check after the turn's own roll: Stealth with Expertise, +4 + 6, against 15.
  const her = pc("poppen", "Poppen", rogue5)
  const shot: RequiredRoll = { attack: { weapon: "shortbow", target: "bandit" }, rollType: "Shortbow", difficulty: 12, modifier: 7, mode: "normal", after: { hide: true } }
  const hide = followingRoll({ character: her, made: shot, present: [her, npc("bandit", "Bandit", "bandit")] })
  assert.deepEqual(hide && "check" in hide && [hide.check, hide.difficulty, hide.modifier], [{ kind: "skill", skill: "stealth" }, 15, 10])
})

test("Steady Aim gives the attack Advantage, and Grappler gives it on one the attacker holds", () => {
  const her = pc("poppen", "Poppen", rogue5)
  const bandit = npc("bandit", "Bandit", "bandit")
  const made = attackRequirement({ character: her, target: bandit, attack: weaponAttack(rogue5, "shortbow"), present: [her, bandit], modes: [{ mode: "advantage", from: "Steady Aim" }] })
  assert.deepEqual("roll" in made && [made.roll.mode, made.roll.reasons, made.roll.difficulty, made.roll.modifier], ["advantage", ["Steady Aim"], 12, 7])
  const grappler: Sheet = { ...fighter5, abilityScores: { ...fighter5.abilityScores, str: 17 }, advancements: [{ level: 4, feat: "grappler", abilities: { str: 1 } }] }
  assert.deepEqual(sheetProblems(grappler), [])
  const held = { ...bandit, conditions: [{ id: "grappled" as const, source: "branka" }] }
  const grip = attackRequirement({ character: pc("branka", "Branka", grappler), target: held, attack: weaponAttack(grappler, "warhammer"), present: [] })
  assert.deepEqual("roll" in grip && [grip.roll.mode, grip.roll.reasons], ["advantage", ["Grappler"]])
})

test("Cunning Strike's Trip takes a Sneak Attack die, and the target saves with Dexterity against 15 or falls Prone", () => {
  // With Advantage the 15 makes 22 against the Owlbear's 13. The Shortbow's d6, 3, and 4, and the Sneak Attack's 3d6
  // less one: 4 and 5. 16 in all, from 59 to 43. The Owlbear is Large: its Dexterity save, a 6 and +1, is 7 against
  // 8 + 4 + 3, 15. It falls Prone.
  const owlbear: Body = { id: "owlbear", name: "Owlbear", type: "npc", statBlock: "owlbear" }
  const blow = strike({ attacker: { type: "pc", sheet: rogue5 }, target: owlbear, weapon: "shortbow", dice: [4, 15], mode: "advantage", roll: falls(3, 4, 5, 6), choices: { cunning: "trip" } })
  assert.deepEqual([blow.taken, blow.hitPoints.after, blow.damage?.parts.map((part) => part.dice)], [16, 43, [[3], [4, 5]]])
  assert.deepEqual([blow.riders?.[0]?.save?.total, blow.riders?.[0]?.save?.dc, blow.riders?.[0]?.took, blow.conditions], [7, 15, true, [{ target: "owlbear", condition: "prone" }]])
  // Prone lasts until its bearer's own turn begins.
  assert.deepEqual(blow.target.conditions, [{ id: "prone", turns: 1 }])
  // A 14 on the save makes 15: it stays standing.
  assert.equal(
    strike({ attacker: { type: "pc", sheet: rogue5 }, target: owlbear, weapon: "shortbow", dice: [4, 15], mode: "advantage", roll: falls(3, 4, 5, 14), choices: { cunning: "trip" } }).riders?.[0]
      ?.took,
    false
  )
  // With no Sneak Attack there is no Cunning Strike.
  assert.equal(strike({ attacker: { type: "pc", sheet: rogue5 }, target: owlbear, weapon: "shortbow", dice: [15], roll: falls(3), choices: { cunning: "trip" } }).riders, undefined)
})

test("Uncanny Dodge halves a hit's damage, by default when it matters", () => {
  // The Bandit's Scimitar, +3: a 14 makes 17 against Poppen's 15, for 1d6 + 1 rolling 5: 6.
  const rogue = pc("poppen", "Poppen", rogue5, { hitPoints: 38 })
  const bandit = npc("bandit", "Bandit", "bandit")
  const asked = (characters: Body[]) => (offer: { to: string; id: Parameters<typeof ordered>[1]; matters: boolean }) => ordered(undefined, offer.id, offer.matters) && !!characters
  // 6 is less than a quarter of his 38: by default he lets it land.
  const whole = attackWithReactions({ characters: [rogue, bandit], attackerId: "bandit", targetId: "poppen", weapon: "scimitar", dice: [14], roll: falls(5), ask: asked([]) })
  assert.deepEqual([whole.blow.taken, whole.reactions], [6, []])
  // At 5 hit points the 6 would drop him: he halves it to 3, and his Reaction is spent.
  const dodged = attackWithReactions({ characters: [{ ...rogue, hitPoints: 5 }, bandit], attackerId: "bandit", targetId: "poppen", weapon: "scimitar", dice: [14], roll: falls(5), ask: asked([]) })
  assert.deepEqual(
    [dodged.blow.taken, dodged.blow.reduced, dodged.target.hitPoints, dodged.reactions.map((taken) => taken.text)],
    [3, { id: "uncanny-dodge", from: 6 }, 2, ["Poppen uses Uncanny Dodge and takes 3 of 6."]]
  )
  assert.deepEqual(dodged.target.turnEffects, [{ id: "reacted", by: "poppen", turns: 1 }])
  // A level 4 Rogue has no Uncanny Dodge.
  const four = attackWithReactions({
    characters: [{ ...rogue, sheet: { ...poppen, level: 4, subclass: "thief", abilityScores: rogue5.abilityScores, advancements: rogue5.advancements }, hitPoints: 5 }, bandit],
    attackerId: "bandit",
    targetId: "poppen",
    weapon: "scimitar",
    dice: [14],
    roll: falls(5),
    ask: always,
  })
  assert.equal(four.blow.reduced, undefined)
})

test("Cutting Words takes the Bard's die off an enemy's attack roll or check, and Font of Inspiration buys a use with a slot", () => {
  // The Bandit's Scimitar: a 15 makes 18 against Branka's 17 (Breastplate 14, Shield 2, Defense 1). It hits by 1, less
  // than Ilya's d8: it matters. Her 5 takes it to 13, a miss.
  const bard = pc("ilya", "Ilya", bard5)
  const fighter = pc("branka", "Branka", branka)
  const bandit = npc("bandit", "Bandit", "bandit")
  const cut = attackWithReactions({
    characters: [bard, fighter, bandit],
    attackerId: "bandit",
    targetId: "branka",
    weapon: "scimitar",
    dice: [15],
    roll: falls(5),
    ask: (offer) => ordered(undefined, offer.id, offer.matters),
  })
  assert.deepEqual([cut.blow.roll.total, cut.blow.roll.hit, cut.blow.roll.adds, cut.blow.taken], [13, false, [{ from: "Cutting Words", amount: -5 }], 0])
  assert.deepEqual([find(cut.characters, "ilya").featureUses, find(cut.characters, "ilya").turnEffects], [{ "bard-bardic-inspiration": 1 }, [{ id: "reacted", by: "ilya", turns: 1 }]])
  // A 20 hits whatever is taken off, so it does not matter.
  const sure = attackWithReactions({
    characters: [bard, fighter, bandit],
    attackerId: "bandit",
    targetId: "branka",
    weapon: "scimitar",
    dice: [20],
    roll: falls(1, 1),
    ask: (offer) => ordered(undefined, offer.id, offer.matters),
  })
  assert.deepEqual([sure.blow.roll.hit, sure.reactions], [true, []])
  // A check: 16 against 15, and a 3 off it is 13.
  const check = checkWithReactions({ characters: [bard, bandit], rollerId: "bandit", result: resolveCheck({ dice: [14], bonus: 2, dc: 15 }), roll: falls(3), ask: always })
  assert.deepEqual([check.result.total, check.result.success], [13, false])
  // Not on a save.
  assert.equal(
    checkWithReactions({ characters: [bard, bandit], rollerId: "bandit", result: resolveCheck({ dice: [14], bonus: 2, dc: 15 }), roll: falls(3), ask: always, save: true }).result.success,
    true
  )
  // Font of Inspiration: with all four uses spent, a level 1 slot buys one.
  const spent = { ...bard, featureUses: { "bard-bardic-inspiration": 4 } }
  assert.deepEqual(inspirationUse(spent), { slot: 1 })
  assert.deepEqual(withInspirationSpent(spent).spellSlots, [1])
  assert.deepEqual(
    bonusActionsOf(spent).find((entry) => entry.id === "bard-bardic-inspiration"),
    { id: "bard-bardic-inspiration", name: "Bardic Inspiration", uses: 4, left: 0, targeted: true, slot: 1 }
  )
  assert.equal(inspirationUse({ ...spent, sheet: { ...ilya, level: 4 } as Sheet }), undefined)
  // And from level 5 a Short Rest gives every use back.
  assert.equal(shortRest({ ...spent, hitPoints: 33 }, { roll: falls() }).character.featureUses, undefined)
})

test("Jack of All Trades adds half the Proficiency Bonus to a check with a skill the Bard lacks", () => {
  // Strength 8 is -1. Athletics at level 1 is -1, and at level 2 half of 2 makes it 0. Persuasion, proficient, stays +5.
  assert.deepEqual([deriveSheet(ilya).skills.athletics.bonus, deriveSheet({ ...ilya, level: 2, expertise: ["performance", "persuasion"] }).skills.athletics.bonus], [-1, 0])
  assert.equal(deriveSheet({ ...ilya, level: 2, expertise: ["performance", "persuasion"] }).skills.survival.bonus, 1)
})

test("Channel Divinity: Divine Spark heals or harms, Turn Undead turns and Sear Undead burns, Preserve Life heals the Bloodied", () => {
  const cleric = pc("milos", "Milos", cleric5)
  const owlbear = npc("owlbear", "Owlbear", "owlbear")
  const zombie = npc("zombie", "Zombie", "zombie")
  const bandit = npc("bandit", "Bandit", "bandit")
  const fighter = pc("branka", "Branka", branka, { hitPoints: 2 })
  const ranger = pc("thalbern", "Thalbern", thalbern, { hitPoints: 1 })
  assert.deepEqual(divinityPicksOf(cleric), ["divine-spark-heal", "divine-spark-harm", "turn-undead", "preserve-life"])
  assert.deepEqual(divinityPicksOf({ sheet: { ...milos, level: 2 } as Sheet }), ["divine-spark-heal", "divine-spark-harm", "turn-undead"])
  // Divine Spark harms: 1d8 rolling 5 and Wisdom's 4 is 9. The Owlbear's Constitution save, a 6 and +3, is 9 against 15:
  // it takes all 9, from 59 to 50. One use of two is spent.
  const spark = channelDivinity({ characters: [cleric, owlbear], clericId: "milos", effect: "divine-spark", targets: ["owlbear"], d20: falls(6), roll: falls(5) })
  assert.deepEqual([spark.saves[0].total, find(spark.characters, "owlbear").hitPoints, spark.harm[0].amount, spark.harm[0].type], [9, 50, 9, "radiant"])
  assert.deepEqual([find(spark.characters, "milos").featureUses, usesLeft(find(spark.characters, "milos"), "cleric-channel-divinity")], [{ "cleric-channel-divinity": 1 }, 1])
  // On a 12, 15, it saves and takes half of 9: 4.
  assert.equal(
    find(channelDivinity({ characters: [cleric, owlbear], clericId: "milos", effect: "divine-spark", targets: ["owlbear"], d20: falls(12), roll: falls(5) }).characters, "owlbear").hitPoints,
    55
  )
  // It heals Branka from 2 by the same 9: 11.
  assert.equal(
    find(channelDivinity({ characters: [cleric, fighter], clericId: "milos", effect: "divine-spark", heal: true, targets: ["branka"], d20: falls(), roll: falls(5) }).characters, "branka").hitPoints,
    11
  )
  // Turn Undead takes the Zombie and not the Bandit. Sear Undead rolls Wisdom's four d8s first: 1, 2, 3 and 4, 10. The
  // Zombie's Wisdom save, a 10 and +0, fails against 15: Frightened and Incapacitated, and burned from 15 to 5.
  const turned = channelDivinity({ characters: [cleric, zombie, bandit], clericId: "milos", effect: "turn-undead", targets: ["zombie", "bandit"], d20: falls(10), roll: falls(1, 2, 3, 4) })
  assert.deepEqual(turned.targets, ["zombie"])
  assert.deepEqual(find(turned.characters, "zombie").conditions, [
    { id: "frightened", source: "milos", turns: 10 },
    { id: "incapacitated", source: "milos", turns: 10 },
  ])
  assert.equal(find(turned.characters, "zombie").hitPoints, 5)
  // Preserve Life: 25 hit points. Branka (14 at most, half 7) at 2 takes 5, Thalbern (11, half 5) at 1 takes 4.
  const preserved = channelDivinity({ characters: [cleric, fighter, ranger, owlbear], clericId: "milos", effect: "preserve-life", targets: [], d20: falls(), roll: falls() })
  assert.deepEqual([find(preserved.characters, "branka").hitPoints, find(preserved.characters, "thalbern").hitPoints, preserved.targets], [7, 5, ["thalbern", "branka"]])
  // With no use left, nothing happens.
  const empty = channelDivinity({
    characters: [{ ...cleric, featureUses: { "cleric-channel-divinity": 2 } }, owlbear],
    clericId: "milos",
    effect: "divine-spark",
    targets: ["owlbear"],
    d20: falls(),
    roll: falls(),
  })
  assert.equal(empty.problem, "Milos has no use of Channel Divinity left.")
})

test("Memorize Spell swaps a prepared spell for another in the book as a Short Rest ends", () => {
  const book = [
    "detect-magic",
    "identify",
    "comprehend-languages",
    "fog-cloud",
    "charm-person",
    "magic-missile",
    "shield",
    "burning-hands",
    "misty-step",
    "scorching-ray",
    "invisibility",
    "web",
    "fireball",
    "counterspell",
    "lightning-bolt",
    "hold-person",
    "thunderwave",
  ]
  const wizard5: Sheet = {
    ...lyra,
    level: 5,
    subclass: "evoker",
    cantrips: ["mage-hand", "light", "ray-of-frost", "fire-bolt"],
    spellbook: book,
    spells: ["detect-magic", "fog-cloud", "charm-person", "magic-missile", "burning-hands", "misty-step", "scorching-ray", "fireball", "counterspell"],
    abilityScores: { ...lyra.abilityScores, int: 18 },
    advancements: [{ level: 4, feat: "ability-score-improvement", abilities: { int: 2 } }],
    expertise: ["investigation"],
  }
  assert.deepEqual(sheetProblems(wizard5), [])
  // Scholar: Expertise in Investigation, Intelligence 18 is +4 and the Proficiency Bonus 3 twice: +10.
  assert.equal(deriveSheet(wizard5).skills.investigation.bonus, 10)
  const swapped = memorizeSpell(wizard5, "magic-missile", "shield")
  assert.deepEqual("sheet" in swapped && swapped.sheet.spells?.[3], "shield")
  assert.deepEqual(memorizeSpell(wizard5, "magic-missile", "fireball"), { problem: "Fireball is already prepared." })
  assert.deepEqual(memorizeSpell(wizard5, "fire-bolt", "shield"), { problem: "Fire Bolt is not a prepared spell of level 1 or higher." })
  assert.deepEqual(memorizeSpell({ ...wizard5, level: 4 }, "magic-missile", "shield"), { problem: "Only a Wizard of level 5 or higher has Memorize Spell." })
})

test("the sheet shows uses left and the reactions a hero can take", () => {
  const view = sheetView(fighter5, undefined, undefined, undefined, { "fighter-action-surge": 1, "fighter-second-wind": 1 })
  assert.deepEqual(
    view.features.filter((feature) => feature.uses).map((feature) => [feature.name, feature.uses]),
    [
      ["Second Wind", { count: 3, left: 2, recharge: "Long Rest" }],
      ["Action Surge", { count: 1, left: 0, recharge: "Short or Long Rest" }],
      // A Dwarf's Stonecunning, as many as the Proficiency Bonus. Species traits keep no count of uses.
      ["Stonecunning", { count: 3, left: 3, recharge: "Long Rest" }],
    ]
  )
  assert.deepEqual(
    [view.reactions, sheetView(rogue5).reactions, sheetView(bard5).reactions],
    [["opportunity-attack"], ["opportunity-attack", "uncanny-dodge"], ["opportunity-attack", "cutting-words"]]
  )
  assert.deepEqual(reactionsOf({ id: "bandit", type: "npc", statBlock: "bandit-captain" }), ["opportunity-attack", "parry"])
})
