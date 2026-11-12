import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { conditionIds } from "@d20/srd"
import { attacksOf, defensesOf, strike } from "../../src/sheet/attack"
import { type Check, checkBonus, combineModes, resolveCheck } from "../../src/sheet/check"
import type { ConditionEntry } from "../../src/sheet/condition-entry"
import {
  attackModesFrom,
  CONDITION_RULES,
  cannotAttack,
  checkModesFrom,
  conditionsAtEncounterEnd,
  conditionsAtRoundStart,
  conditionsOf,
  conditionWords,
  saveFailedBy,
  withCondition,
  withoutCondition,
} from "../../src/sheet/conditions"
import { atRoundStart } from "../../src/sheet/death"
import { applyStakes } from "../../src/sheet/harm"
import type { Sheet } from "../../src/sheet/sheet"
import { isIncapacitated, takesTurn } from "../../src/utils/turn-actors"

// Every expected value below was worked out by hand from the SRD 5.2.1 conditions, not copied from the function's output.

const sheet = JSON.parse(readFileSync(new URL("../../../../content/settings/realm-of-myr/adventures/the-midnight-summons/characters/thalbern.json", import.meta.url), "utf8")).sheet as Sheet
type Character = {
  id: string
  name: string
  type: string
  sheet?: Sheet
  statBlock?: string
  hitPoints?: number
  conditions?: ConditionEntry[]
  isComplete?: boolean
  hasReplied?: boolean
  dead?: true
}
// Thalbern, a level 1 Ranger: 11 hit points, Armor Class 15, Longbow +5, Perception +3.
const thalbern = (...conditions: ConditionEntry[]): Character => ({ id: "thalbern", name: "Thalbern", type: "pc", sheet, hitPoints: 11, ...(conditions.length ? { conditions } : {}) })
// An Owlbear: 59 hit points, Armor Class 13, Rend +7 for 2d8 + 5.
const owlbear = (...conditions: ConditionEntry[]): Character => ({ id: "owlbear", name: "Owlbear", type: "npc", statBlock: "owlbear", hitPoints: 59, ...(conditions.length ? { conditions } : {}) })
const skeleton: Character = { id: "skeleton", name: "Skeleton", type: "npc", statBlock: "skeleton", hitPoints: 13 }
const stealth: Check = { kind: "skill", skill: "stealth" }
const perception: Check = { kind: "skill", skill: "perception" }
const save = (ability: "str" | "dex" | "con" | "wis"): Check => ({ kind: "save", ability })
const modes = (found: { mode: string }[]) => found.map((source) => source.mode)

test("the rules have the SRD's fifteen conditions, and four of them carry Incapacitated", () => {
  assert.deepEqual(Object.keys(CONDITION_RULES).sort(), [...conditionIds].sort())
  assert.equal(conditionIds.length, 15)
  // Paralyzed, Petrified, Stunned and Unconscious each say "You have the Incapacitated condition". The browser's own
  // test of who is Incapacitated must agree with the rules for every one of the fifteen.
  for (const id of conditionIds) assert.equal(isIncapacitated({ conditions: [{ id }] }), conditionsOf(thalbern({ id })).includes("incapacitated"), id)
  assert.deepEqual(conditionsOf(thalbern({ id: "paralyzed" })), ["incapacitated", "paralyzed"])
  assert.equal(conditionWords(thalbern({ id: "prone" }, { id: "poisoned" })), "Poisoned, Prone")
})

test("Poisoned: Disadvantage on attack rolls and ability checks, and not on saves", () => {
  const poisoned = thalbern({ id: "poisoned" })
  assert.deepEqual(checkModesFrom(poisoned, stealth), [{ mode: "disadvantage", from: "Poisoned" }])
  assert.deepEqual(checkModesFrom(poisoned, save("con")), [])
  assert.deepEqual(attackModesFrom(poisoned, owlbear(), "ranged"), [{ mode: "disadvantage", from: "Poisoned" }])
})

test("Restrained: its own attacks at Disadvantage, attacks against it at Advantage, Disadvantage on Dexterity saves", () => {
  const held = thalbern({ id: "restrained" })
  assert.deepEqual(modes(attackModesFrom(held, owlbear(), "melee")), ["disadvantage"])
  assert.deepEqual(attackModesFrom(owlbear(), held, "melee"), [{ mode: "advantage", from: "Thalbern Restrained" }])
  assert.deepEqual(modes(checkModesFrom(held, save("dex"))), ["disadvantage"])
  assert.deepEqual(checkModesFrom(held, save("str")), [])
  assert.deepEqual(checkModesFrom(held, stealth), [])
})

test("Prone: Advantage for an attacker within 5 feet, Disadvantage from farther, until the one down stands on their own turn", () => {
  // Knocked down before his turn this round: Prone until he acts.
  const down = withCondition(thalbern(), { id: "prone" }).character
  assert.deepEqual(down.conditions, [{ id: "prone", turns: 1 }])
  assert.deepEqual(modes(attackModesFrom(owlbear(), down, "melee")), ["advantage"])
  assert.deepEqual(modes(attackModesFrom(owlbear(), down, "ranged")), ["disadvantage"])
  // On his own turn he stands, which costs movement and no action, so his own attack is a plain roll.
  assert.deepEqual(attackModesFrom(down, owlbear(), "ranged"), [])
  // His turn taken, he is up: later attackers get nothing from it.
  assert.deepEqual(attackModesFrom(owlbear(), { ...down, isComplete: true }, "melee"), [])
  // Knocked down after his turn, he is Prone for the rest of this round and until his turn in the next.
  const after = withCondition({ ...thalbern(), isComplete: true }, { id: "prone" }, { acted: true }).character
  assert.deepEqual(modes(attackModesFrom(owlbear(), after, "melee")), ["advantage"])
  const next = conditionsAtRoundStart({ ...after, isComplete: false })
  assert.deepEqual(modes(attackModesFrom(owlbear(), next, "melee")), ["advantage"])
  assert.deepEqual(attackModesFrom(owlbear(), { ...next, isComplete: true }, "melee"), [])
  assert.equal(conditionsAtRoundStart(next).conditions, undefined)
  // Grappled, his Speed is 0 and he cannot stand: Prone stays, and both put Disadvantage on his attack.
  const pinned = { ...down, conditions: [...(down.conditions ?? []), { id: "grappled" as const, source: "owlbear" }], isComplete: true }
  assert.deepEqual(modes(attackModesFrom(owlbear(), pinned, "melee")), ["advantage"])
  assert.deepEqual(
    conditionsAtRoundStart(pinned).conditions?.map((entry) => entry.id),
    ["prone", "grappled"]
  )
  assert.deepEqual(modes(attackModesFrom(pinned, skeleton, "melee")), ["disadvantage", "disadvantage"])
})

test("Unconscious at 0 hit points: attacks against have Advantage, and a hit from within 5 feet is a Critical Hit", () => {
  const out = { ...thalbern(), hitPoints: 0, deathSaves: { successes: 0, failures: 0 } }
  assert.deepEqual(modes(attackModesFrom(owlbear(), out, "melee")), ["advantage", "advantage"])
  // From range, Unconscious gives Advantage and the Prone it carries gives Disadvantage: a plain roll.
  assert.equal(combineModes(modes(attackModesFrom(owlbear(), out, "ranged")) as ("advantage" | "disadvantage")[]), "normal")
  // Rend, +7: an 8 makes 15 against Armor Class 15 and hits. No 20, yet it is a Critical Hit: the dice are doubled,
  // 1 + 1 + 1 + 1 + 5 is 9, less than his 11, and a Critical Hit at 0 is two failed Death Saving Throws.
  const dice = [1, 1, 1, 1]
  const blow = strike({ attacker: owlbear(), target: out, weapon: "rend", dice: [8], roll: () => dice.shift() as number })
  assert.deepEqual([blow.roll.critical, blow.damage?.parts[0].dice.length, blow.taken, blow.target.deathSaves], [true, 4, 9, { successes: 0, failures: 2 }])
  // A miss is still a miss: a 7 makes 14.
  assert.equal(strike({ attacker: owlbear(), target: out, weapon: "rend", dice: [7], roll: () => 1 }).roll.critical, false)
})

test("Paralyzed and Stunned fail Strength and Dexterity saves outright, whatever the dice show", () => {
  const frozen = thalbern({ id: "paralyzed" })
  assert.equal(saveFailedBy(frozen, save("dex")), "Paralyzed")
  assert.equal(saveFailedBy(thalbern({ id: "stunned" }), save("str")), "Stunned")
  assert.equal(saveFailedBy(frozen, save("con")), undefined)
  assert.equal(saveFailedBy(frozen, stealth), undefined)
  // A 20 and +5 against 10 would pass. It fails.
  assert.equal(resolveCheck({ dice: [20], bonus: 5, dc: 10, fails: true }).success, false)
  assert.deepEqual(modes(attackModesFrom(owlbear(), frozen, "ranged")), ["advantage"])
})

test("Frightened, Grappled and Charmed turn on who they come from", () => {
  const afraid = thalbern({ id: "frightened", source: "owlbear" })
  // Disadvantage on ability checks and attack rolls while the source of fear is in sight.
  assert.deepEqual(modes(checkModesFrom(afraid, perception, [afraid, owlbear()])), ["disadvantage"])
  assert.deepEqual(modes(attackModesFrom(afraid, skeleton, "ranged", [afraid, owlbear(), skeleton])), ["disadvantage"])
  // The Owlbear gone, or dead, nothing is in sight to fear.
  assert.deepEqual(checkModesFrom(afraid, perception, [afraid, skeleton]), [])
  assert.deepEqual(checkModesFrom(afraid, perception, [afraid, { ...owlbear(), hitPoints: 0, dead: true }]), [])
  assert.deepEqual(checkModesFrom(afraid, save("wis"), [afraid, owlbear()]), [])
  // Grappled: Disadvantage on attacks against anyone but the grappler.
  const grabbed = thalbern({ id: "grappled", source: "owlbear" })
  assert.deepEqual(attackModesFrom(grabbed, owlbear(), "melee"), [])
  assert.deepEqual(modes(attackModesFrom(grabbed, skeleton, "melee")), ["disadvantage"])
  // Charmed: the charmer cannot be attacked.
  const charmed = owlbear({ id: "charmed", source: "thalbern" })
  assert.deepEqual([cannotAttack(charmed, thalbern()), cannotAttack(charmed, skeleton)], [true, false])
})

test("Exhaustion takes 2 off every d20 for each level, and the sixth level kills", () => {
  // Two levels: Longbow +5 is +1, and Perception +3 is -1.
  const spent = thalbern({ id: "exhaustion", level: 2 })
  assert.equal(attacksOf(spent).find((attack) => attack.id === "longbow")?.bonus, 1)
  assert.equal(checkBonus(spent, perception), -1)
  assert.equal(conditionWords(spent), "Exhaustion 2")
  // Each giving adds a level, and ending it takes one off.
  const third = withCondition(spent, { id: "exhaustion" })
  assert.deepEqual([third.level, third.character.conditions], [3, [{ id: "exhaustion", level: 3 }]])
  assert.deepEqual(withoutCondition(spent, "exhaustion").character.conditions, [{ id: "exhaustion", level: 1 }])
  assert.equal(withoutCondition(thalbern({ id: "exhaustion", level: 1 }), "exhaustion").character.conditions, undefined)
  // The sixth level kills. With player death off it leaves the hero Stable at 0.
  const stakes = [{ on: "failure" as const, target: "thalbern", kind: "condition" as const, condition: "exhaustion" as const }]
  const last = applyStakes({ characters: [thalbern({ id: "exhaustion", level: 5 })], stakes, outcome: "failure", roll: () => 1 })
  assert.deepEqual([last.characters[0].dead, last.characters[0].hitPoints], [true, 0])
  const spared = applyStakes({ characters: [thalbern({ id: "exhaustion", level: 5 })], stakes, outcome: "failure", roll: () => 1, rules: { playerDeath: false } })
  assert.deepEqual([spared.characters[0].dead, spared.characters[0].hitPoints], [undefined, 0])
})

test("a span is counted in the bearer's own turns", () => {
  // Stunned for a turn, given before his turn this round: it takes that turn and is gone when the next round begins.
  const early = withCondition(thalbern(), { id: "stunned" }).character
  assert.deepEqual(early.conditions, [{ id: "stunned", turns: 1 }])
  assert.equal(conditionsAtRoundStart(early).conditions, undefined)
  // Given after his turn, it takes his next one: 2, then 1, then gone.
  const late = withCondition(thalbern(), { id: "stunned" }, { acted: true }).character
  assert.deepEqual(late.conditions, [{ id: "stunned", turns: 2 }])
  const round = atRoundStart(late)
  assert.deepEqual([round.conditions, round.isComplete, takesTurn(round)], [[{ id: "stunned", turns: 1 }], true, false])
  const free = atRoundStart(round)
  assert.deepEqual([free.conditions, free.isComplete, takesTurn(free)], [undefined, false, true])
  // A minute is ten turns, and a lasting one has no count. Poisoned lasts when no span is named.
  assert.deepEqual(withCondition(thalbern(), { id: "frightened", span: "minute" }).character.conditions, [{ id: "frightened", turns: 10 }])
  assert.deepEqual(withCondition(thalbern(), { id: "poisoned" }).character.conditions, [{ id: "poisoned" }])
  assert.deepEqual(conditionsAtRoundStart(thalbern({ id: "poisoned" })).conditions, [{ id: "poisoned" }])
  // A second giving renews it and does not stack.
  assert.deepEqual(withCondition(thalbern({ id: "poisoned", turns: 3 }), { id: "poisoned", span: "minute" }).character.conditions, [{ id: "poisoned", turns: 10 }])
})

test("immunity: a Skeleton cannot be Poisoned or Exhausted, and one Petrified resists all damage", () => {
  assert.equal(withCondition(skeleton, { id: "poisoned" }).given, false)
  assert.equal(withCondition(skeleton, { id: "exhaustion" }).given, false)
  assert.equal(withCondition(skeleton, { id: "prone" }).given, true)
  const stone = thalbern({ id: "petrified" })
  assert.equal(withCondition(stone, { id: "poisoned" }).given, false)
  assert.equal(defensesOf(stone).resistances?.length, 13)
  // 2d6 of fire rolling 5 and 4 is 9, halved to 4: 11 becomes 7.
  const dice = [5, 4]
  const burned = applyStakes({ characters: [stone], stakes: [{ on: "always", target: "thalbern", kind: "damage", dice: "2d6", type: "fire" }], outcome: "success", roll: () => dice.shift() as number })
  assert.equal(burned.characters[0].hitPoints, 7)
})

test("a new encounter ends the conditions of a fight's moment and keeps the lasting ones", () => {
  const worn = thalbern({ id: "prone", turns: 1 }, { id: "frightened", turns: 6 }, { id: "poisoned" }, { id: "exhaustion", level: 1 }, { id: "restrained" })
  assert.deepEqual(conditionsAtEncounterEnd(worn).conditions, [{ id: "poisoned" }, { id: "exhaustion", level: 1 }])
  assert.equal(conditionsAtEncounterEnd(thalbern({ id: "prone", turns: 1 })).conditions, undefined)
  // A condition from a spell that outlasts a minute goes on: Charm Person's hour. One counted in turns ends.
  const charmed = { id: "charmed" as const, source: "lyra", spell: "charm-person" }
  assert.deepEqual(conditionsAtEncounterEnd(thalbern(charmed, { id: "charmed", source: "lyra" }, { id: "incapacitated", spell: "sleep", turns: 9 })).conditions, [charmed])
})

test("a roll's stakes give a condition and end one, and the story is told what happened", () => {
  // A poisoned dart: on a failed save he is Poisoned. On a success, nothing.
  const dart = [{ on: "failure" as const, target: "thalbern", kind: "condition" as const, condition: "poisoned" as const }]
  const failed = applyStakes({ characters: [thalbern()], stakes: dart, outcome: "failure", roll: () => 1 })
  assert.deepEqual([failed.characters[0].conditions, failed.conditions, failed.facts], [[{ id: "poisoned" }], [{ target: "thalbern", condition: "poisoned" }], ["Thalbern is now Poisoned."]])
  assert.deepEqual(applyStakes({ characters: [thalbern()], stakes: dart, outcome: "success", roll: () => 1 }).conditions, [])
  // Tearing out of a net: on a success Restrained ends. Ending what he does not have changes nothing.
  const tear = [{ on: "success" as const, target: "thalbern", kind: "condition" as const, condition: "restrained" as const, ends: true as const }]
  const freed = applyStakes({ characters: [thalbern({ id: "restrained" })], stakes: tear, outcome: "success", roll: () => 1 })
  assert.deepEqual([freed.characters[0].conditions, freed.conditions, freed.facts], [undefined, [{ target: "thalbern", condition: "restrained", ends: true }], ["Thalbern is no longer Restrained."]])
  assert.deepEqual(applyStakes({ characters: [thalbern()], stakes: tear, outcome: "success", roll: () => 1 }).conditions, [])
  // A Skeleton is immune to Poisoned: it is not given, and the story is told so.
  const immune = applyStakes({ characters: [skeleton], stakes: [{ ...dart[0], on: "success", target: "skeleton" }], outcome: "success", roll: () => 1 })
  assert.deepEqual([immune.characters[0].conditions, immune.conditions, immune.facts], [undefined, [], ["Skeleton cannot be Poisoned and is not."]])
  // Stunned before its turn this round, the Owlbear loses that turn.
  const stun = [{ on: "success" as const, target: "owlbear", kind: "condition" as const, condition: "stunned" as const }]
  const reeling = applyStakes({ characters: [{ ...owlbear(), hasReplied: false, isComplete: false }], stakes: stun, outcome: "success", roll: () => 1 })
  assert.deepEqual([reeling.characters[0].conditions, reeling.characters[0].isComplete], [[{ id: "stunned", turns: 1 }], true])
})
