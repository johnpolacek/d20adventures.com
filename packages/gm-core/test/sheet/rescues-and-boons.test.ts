import assert from "node:assert/strict"
import { test } from "node:test"
import type { GmPorts } from "../../src/ports"
import { createAdventureRollResultService } from "../../src/services/adventure-roll-result-service"
import { attacksOf, defensesAgainst } from "../../src/sheet/attack"
import { rescuedCheck } from "../../src/sheet/class-rules"
import { heroicWarrior } from "../../src/sheet/classes/fighter"
import { autoCreate, type CreationPick, createSheet } from "../../src/sheet/create"
import { thrownDeathSave } from "../../src/sheet/death"
import { deriveSheet } from "../../src/sheet/derive"
import { featRules } from "../../src/sheet/feats"
import { blockRidersOnHit } from "../../src/sheet/hit-riders"
import { raisedTo } from "../../src/sheet/milestone"
import { attackWithReactions } from "../../src/sheet/reactions"
import { withRescueSpent } from "../../src/sheet/save-rules"
import type { Sheet } from "../../src/sheet/sheet"
import { settleConcentration } from "../../src/sheet/spell-effects"
import { type Castee, rollSave, withCastPaid } from "../../src/sheet/spells"
import type { TurnCharacter } from "../../src/types/adventure"

// Every expected value below was worked out by hand from the SRD 5.2.1 text, not copied from the functions' output:
// Indomitable (p. 48), Aura of Protection (p. 81), Death Saving Throws (p. 17), Concentration (p. 179), Heroic
// Inspiration (pp. 8 and 183), Resourceful (p. 86), Heroic Warrior (p. 49), and the Epic Boons (p. 88).
//
// The heroes are made by the creator as Human Soldiers (a Sage for the Wizard) and raised by the choices that need no
// player. A Fighter of level 9 has Constitution 13 and is proficient in Constitution saves: +1 and +4, so +5. A Paladin
// of level 6 has Constitution 14 with no proficiency (+2) and Charisma 14 (+2), so their Aura of Protection adds 2. A
// Fighter of level 19 has Strength 21.

const made = (cls: string, background = "soldier"): Sheet => {
  const pick = { class: cls, species: "human", background } as unknown as CreationPick
  const result = createSheet(pick, autoCreate(pick))
  if ("problems" in result) assert.fail(result.problems.join("; "))
  return result.sheet
}
type Hero = Castee & {
  sheet: Sheet
  hitPoints: number
  position: { x: number; y: number }
  featureUses?: Record<string, number>
  spellSlots?: number[]
  heroicInspiration?: true
}
const hero = (cls: string, level: number, id: string, x = 0, background = "soldier"): Hero => {
  const raised = raisedTo({ id, name: id.charAt(0).toUpperCase() + id.slice(1), type: "pc", sheet: made(cls, background), controlledBy: "ai" as const }, level)
  return { ...raised, hitPoints: deriveSheet(raised.sheet).hitPointMaximum, position: { x, y: 0 } } as unknown as Hero
}
// A Fighter of level 19 with the Epic Boon of their choice in place of the one the creator recommends, the point to Strength.
const boon = (feat: string, id = "branka"): Hero => {
  const fighter = hero("fighter", 19, id)
  const advancements = (fighter.sheet.advancements ?? []).map((entry) => (entry.level === 19 ? { level: 19, feat, abilities: { str: 1 } } : entry))
  return { ...fighter, sheet: { ...fighter.sheet, advancements } }
}
const npc = (id: string, statBlock: string, hitPoints: number, x = 5): Hero => ({ id, name: id, type: "npc", statBlock, hitPoints, position: { x, y: 0 } }) as unknown as Hero
// The dice in the order thrown, and a throw past the end fails the test.
const dice = (...faces: number[]) => {
  const left = [...faces]
  return () => left.shift() ?? assert.fail("a die more than the test gives")
}
const claw = () => attacksOf(npc("ghoul", "ghoul", 22)).find((attack) => attack.id === "claw") ?? assert.fail("no claw")
const ghoulHits = (target: Hero, present: Hero[], faces: number[]) => blockRidersOnHit({ attacker: npc("ghoul", "ghoul", 22), target, attack: claw(), roll: dice(...faces), present })

test("Indomitable rerolls a failed save against a Ghoul's paralysis, with the Fighter level added", () => {
  // A 4 and +5 is 9 against DC 10: Paralyzed. Indomitable rerolls: 12, +5, +9 for the level, is 26, a success.
  const fighter = hero("fighter", 9, "branka")
  const hit = ghoulHits(fighter, [fighter], [4, 12])
  assert.deepEqual([hit.target.conditions, hit.target.featureUses, hit.riders[0]?.save?.total, hit.riders[0]?.took], [undefined, { "fighter-indomitable": 1 }, 26, false])
  assert.match(hit.riders[0]?.effect ?? "", /fails the saving throw \(9 against DC 10\) and calls on Indomitable: 26, a success/)
})

test("an aura and Legendary Resistance reach a save from a monster's hit", () => {
  // The Paladin's own Aura of Protection: a 6 and +2 is 8, and the aura's +2 makes 10, a success against DC 10.
  const paladin = hero("paladin", 6, "aric")
  const aided = ghoulHits(paladin, [paladin], [6])
  assert.deepEqual([aided.riders[0]?.save?.total, aided.target.conditions], [10, undefined])
  // A Sphinx of Lore is a Celestial, so the claw's gate holds, with Constitution +3: a 3 is 6 against 10. Paralyzed
  // would take its turns, so it spends one of its 3 uses of Legendary Resistance and succeeds.
  const sphinx = npc("sphinx", "sphinx-of-lore", 170)
  const resisted = ghoulHits(sphinx, [sphinx], [3])
  assert.deepEqual([resisted.target.conditions, resisted.target.featureUses], [undefined, { "Legendary Resistance": 1 }])
  assert.match(resisted.riders[0]?.effect ?? "", /chooses to succeed instead \(Legendary Resistance, 2 of 3 left today\)/)
})

test("Indomitable answers a save the player rolled, before the result is told", async () => {
  // A DC 15 Constitution save that poisons on a failure. The player's 3 and +5 is 8. Indomitable rerolls the d20, here a
  // 15 (Math.random 0.7), and adds 9: 29, a success. The use is spent and told before the roll.
  const fighter = hero("fighter", 9, "branka")
  const rollRequired = {
    check: { kind: "save", ability: "con" },
    rollType: "Constitution Saving Throw",
    difficulty: 15,
    modifier: 5,
    mode: "normal",
    stakes: [{ on: "failure", target: "branka", kind: "condition", condition: "poisoned" }],
  }
  const character = { ...fighter, isComplete: false, hasReplied: true, rollRequired } as unknown as TurnCharacter & { rollRequired: never }
  const ports = { llm: { generateObject: async () => ({ object: { beats: [] } }) }, content: {}, sleep: async () => {} } as unknown as GmPorts
  const random = Math.random
  Math.random = () => 0.7
  try {
    const done = await createAdventureRollResultService(ports).resolvePlayerRollNarrativeAndCharacters({
      turn: { _id: "turn", encounterId: "here", title: "Here", story: [], characters: [character], adventureId: "adventure" },
      character,
      characterId: "branka",
      dice: [3],
      encounterInstructions: "",
    })
    const after = done.characters[0] as TurnCharacter & Hero
    assert.deepEqual([after.featureUses, after.conditions], [{ "fighter-indomitable": 1 }, undefined])
    const told = done.story.filter((beat) => beat.kind === "feature" || beat.kind === "roll") as { kind: string; name?: string; total?: number; success?: boolean }[]
    assert.deepEqual(
      told.map((beat) => [beat.kind, beat.name, beat.total, beat.success]),
      [
        ["feature", "Indomitable", undefined, undefined],
        ["roll", "Branka", 29, true],
      ]
    )
  } finally {
    Math.random = random
  }
})

test("an aura reaches a Death Saving Throw and a Concentration save, and Indomitable a Concentration save", () => {
  // A dying Fighter beside the Paladin: an 8 fails alone, and the aura's +2 makes 10, a success.
  const paladin = hero("paladin", 6, "aric", 5)
  const dying = { ...hero("fighter", 1, "branka"), hitPoints: 0, deathSaves: { successes: 0, failures: 0 } }
  const thrown = thrownDeathSave({ character: dying, dice: [8], mode: "normal", present: [dying, paladin], d20: dice(), roll: dice() })
  assert.deepEqual([thrown.result.total, thrown.saved.success, thrown.saved.saves], [10, true, { successes: 1, failures: 0 }])
  // The Paladin holds Bless and takes 10 damage: DC 10. A 7 and +2 is 9, and their own aura's +2 makes 11.
  const holding = { ...paladin, concentration: { spell: "bless" } }
  const kept = settleConcentration({ before: [holding], after: [{ ...holding, hitPoints: holding.hitPoints - 10 }], bonus: () => 2, d20: dice(7) })
  assert.deepEqual([kept.saves[0]?.total, kept.saves[0]?.success, kept.characters[0]?.concentration], [11, true, { spell: "bless" }])
  // A Fighter holding a spell fails with a 2 (+5 is 7), and Indomitable's 14 with +5 and +9 makes 28.
  const fighter = { ...hero("fighter", 9, "branka"), concentration: { spell: "bless" } }
  const saved = settleConcentration({ before: [fighter], after: [{ ...fighter, hitPoints: fighter.hitPoints - 10 }], bonus: () => 5, d20: dice(2, 14) })
  assert.deepEqual([saved.saves[0]?.total, saved.characters[0]?.concentration, (saved.characters[0] as Hero).featureUses], [28, { spell: "bless" }, { "fighter-indomitable": 1 }])
  assert.match(saved.facts.join(" "), /fails the saving throw \(7 against DC 10\) and calls on Indomitable: 28, a success/)
})

test("Heroic Inspiration: given by Heroic Warrior, spent once on a save, an attack and a check, and never twice", () => {
  // Heroic Warrior is the Champion's at 10: a Fighter of 9 gains nothing as the round turns, one of 10 gains it.
  assert.equal(heroicWarrior(hero("fighter", 9, "a")).heroicInspiration, undefined)
  assert.equal(heroicWarrior(hero("fighter", 10, "b")).heroicInspiration, true)
  // A Wisdom save against harm, DC 15, by a level 1 Fighter with Wisdom 10 and no proficiency: a 4 fails, and the
  // reroll's 17 makes 17, a success. The new roll stands, and Heroic Inspiration is expended.
  const inspired = { ...hero("fighter", 1, "branka"), heroicInspiration: true as const }
  const save = rollSave({ target: inspired, ability: "wis", dc: 15, d20: dice(4, 17), roll: dice(), characters: [inspired], stakes: { conditions: ["frightened"] } })
  assert.deepEqual([save.total, save.success, save.rescued?.feature], [17, true, "heroic-inspiration"])
  const spent = withRescueSpent(inspired, save.rescued ?? assert.fail())
  assert.equal(spent.heroicInspiration, undefined)
  // Without it, a failure stands.
  assert.equal(rollSave({ target: spent, ability: "wis", dc: 15, d20: dice(4), roll: dice(), characters: [spent], stakes: { conditions: ["frightened"] } }).success, false)
  // Nor is it spent where nothing is at stake.
  assert.equal(rollSave({ target: inspired, ability: "wis", dc: 15, d20: dice(4), roll: dice(), characters: [inspired] }).rescued, undefined)
  // An attack that misses an Ogre (Armor Class 11) on a 1 is rolled again: a 15 hits. The reroll is told as a reaction.
  const ogre = npc("ogre", "ogre", 68)
  const weapon = attacksOf(inspired)[0] ?? assert.fail()
  const made = attackWithReactions({ characters: [inspired, ogre], attackerId: "branka", targetId: "ogre", weapon: weapon.id, dice: [1], roll: dice(15, 6, 6, 6, 6), ask: () => false })
  assert.deepEqual([made.blow.roll.natural, made.blow.roll.hit, (made.characters[0] as Hero).heroicInspiration], [15, true, undefined])
  assert.match(made.reactions[0]?.text ?? "", /expends Heroic Inspiration to roll the d20 again/)
  // A check the read put something at stake on: a 3 and +2 against DC 12 is rerolled, a 10 makes 12.
  const check = rescuedCheck({
    character: inspired,
    check: { kind: "ability", ability: "str" },
    result: { dice: [3], natural: 3, bonus: 2, total: 5, dc: 12, success: false, mode: "normal" },
    roll: dice(10),
    staked: true,
  })
  assert.deepEqual([check?.result.total, check?.result.success, check?.after?.(inspired).heroicInspiration], [12, true, undefined])
})

test("Boon of Combat Prowess: a miss hits instead, once until the next round", () => {
  // The Fighter of 19 takes it by default. A 1 misses, and Peerless Aim makes it hit. Not a Critical Hit.
  const fighter = hero("fighter", 19, "branka")
  const ogre = npc("ogre", "ogre", 200)
  const weapon = attacksOf(fighter)[0] ?? assert.fail()
  const first = attackWithReactions({ characters: [fighter, ogre], attackerId: "branka", targetId: "ogre", weapon: weapon.id, dice: [1], roll: () => 3, ask: () => false })
  assert.deepEqual([first.blow.roll.hit, first.blow.roll.critical, first.reactions[0]?.name], [true, false, "Peerless Aim"])
  // Marked, so the next miss this round stays a miss.
  const second = attackWithReactions({ characters: first.characters, attackerId: "branka", targetId: "ogre", weapon: weapon.id, dice: [1], roll: () => 3, ask: () => false })
  assert.equal(second.blow.roll.hit, false)
})

test("Boon of Fate: 2d4 on a failed save of the hero or one of their side within 60 feet, back at Initiative", () => {
  // An ally 30 feet away, with Wisdom 10 and no proficiency, makes a DC 15 Wisdom save. A 6 is 9 short, more than the 8
  // the dice could bring, so it is not used. An 11 is 4 short, and the 2d4's 3 and 2 make 16, a success.
  const holder = boon("boon-of-fate")
  const ally = hero("fighter", 1, "wren", 30)
  const far = rollSave({ target: ally, ability: "wis", dc: 15, d20: dice(6), roll: dice(), characters: [ally, holder], stakes: { conditions: ["frightened"] } })
  assert.deepEqual([far.total, far.success, far.rescued], [6, false, undefined])
  const near = rollSave({ target: ally, ability: "wis", dc: 15, d20: dice(11), roll: dice(3, 2), characters: [ally, holder], stakes: { conditions: ["frightened"] } })
  assert.deepEqual([near.total, near.success, near.rescued?.by, near.rescued?.name], [16, true, "branka", "Branka's Improve Fate"])
  const spent = withRescueSpent(holder, near.rescued ?? assert.fail())
  assert.deepEqual(spent.featureUses, { "boon-of-fate": 1 })
  // Used, it answers no other save until Initiative is rolled.
  assert.equal(rollSave({ target: ally, ability: "wis", dc: 15, d20: dice(11), roll: dice(), characters: [ally, spent], stakes: { conditions: ["frightened"] } }).rescued, undefined)
  const fate = featRules().find((rules) => rules.class === "boon-of-fate") ?? assert.fail()
  assert.equal(fate.initiative?.(spent, dice()).featureUses, undefined)
})

test("Boon of Irresistible Offense: Bludgeoning, Piercing and Slashing ignore Resistance, and a 20 adds the raised score", () => {
  // A Clay Golem resists all three. Against the boon's bearer it resists none of them.
  const golem = npc("golem", "clay-golem", 123)
  const bearer = boon("boon-of-irresistible-offense")
  assert.deepEqual([defensesAgainst(golem, hero("fighter", 19, "other")).resistances, defensesAgainst(golem, bearer).resistances], [["bludgeoning", "piercing", "slashing"], []])
  // A 20 on the d20: Overwhelming Strike adds the Strength the feat raised, 21, of the weapon's type.
  const weapon = attacksOf(bearer)[0] ?? assert.fail()
  const ogre = npc("ogre", "ogre", 200)
  const struck = attackWithReactions({ characters: [bearer, ogre], attackerId: "branka", targetId: "ogre", weapon: weapon.id, dice: [20], roll: () => 1, ask: () => false })
  assert.ok(struck.blow.features?.includes("Overwhelming Strike"))
  const extra = struck.blow.damage?.parts.find((part) => part.total === 21 && part.dice.length === 0)
  assert.equal(extra?.type, weapon.damage[0]?.type)
})

test("Boon of Spell Recall: a slot of level 1 to 4 is kept on a d4 of its level", () => {
  // A Wizard of 19 takes it by default. A level 3 slot and a 3 on the d4: kept. A 2: spent. A level 5 slot rolls no d4.
  const wizard = hero("wizard", 19, "lyra", 0, "sage")
  assert.equal(deriveSheet(wizard.sheet).feats.at(-1), "boon-of-spell-recall")
  const kept = withCastPaid(wizard, { kind: "slot", level: 3 }, () => 3)
  assert.deepEqual([kept.character.spellSlots, kept.facts], [undefined, ["Free Casting rolls a 3 on the d4: the level 3 slot is not expended."]])
  assert.deepEqual(withCastPaid(wizard, { kind: "slot", level: 3 }, () => 2).character.spellSlots, [0, 0, 1])
  assert.deepEqual(withCastPaid(wizard, { kind: "slot", level: 5 }, dice()).character.spellSlots, [0, 0, 0, 0, 1])
})
