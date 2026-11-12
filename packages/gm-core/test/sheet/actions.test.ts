import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { afterRoll, attackModesFromActions, checkModesFromActions, hideRoll, takeAction, turnEffectsAtEncounterEnd, turnEffectWords } from "../../src/sheet/actions"
import { masteryOf, strike } from "../../src/sheet/attack"
import type { Check } from "../../src/sheet/check"
import type { ConditionEntry } from "../../src/sheet/condition-entry"
import { attackModesFrom } from "../../src/sheet/conditions"
import { atRoundStart } from "../../src/sheet/death"
import { sheetProblems } from "../../src/sheet/derive"
import { applyStakes } from "../../src/sheet/harm"
import type { Sheet } from "../../src/sheet/sheet"
import type { TurnEffect } from "../../src/sheet/turn-effect"

// Every expected value below was worked out by hand from the SRD 5.2.1 rules for actions, not copied from the function's output.

const sheet = (path: string) => (JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { sheet: Sheet }).sheet
type Character = {
  id: string
  name: string
  type: string
  sheet?: Sheet
  statBlock?: string
  hitPoints?: number
  conditions?: ConditionEntry[]
  turnEffects?: TurnEffect[]
  isComplete?: boolean
  hasReplied?: boolean
}
// Thalbern, a Ranger: proficient in Stealth, Survival, Nature, Perception, Athletics and Intimidation.
const thalbern: Character = { id: "thalbern", name: "Thalbern", type: "pc", sheet: sheet("the-midnight-summons/characters/thalbern.json"), hitPoints: 11 }
// Branka, a Fighter: proficient in Perception, Insight, Athletics and Intimidation, and not in Stealth.
const branka: Character = { id: "branka", name: "Branka", type: "pc", sheet: sheet("welcome-to-kordavos/characters/branka-stoneveil.json"), hitPoints: 14 }
// Poppen, a level 1 Rogue with Dexterity 16: Stealth with Expertise is 3 + 2 + 2, and a Shortbow is +5 for 1d6 + 3.
const poppen: Character = { id: "poppen", name: "Poppen", type: "pc", sheet: sheet("covert-cargo/characters/1749307435667.json"), hitPoints: 10 }
const owlbear: Character = { id: "owlbear", name: "Owlbear", type: "npc", statBlock: "owlbear", hitPoints: 59 }
// A Bandit: Armor Class 12 and 11 hit points.
const bandit: Character = { id: "bandit", name: "Bandit", type: "npc", statBlock: "bandit", hitPoints: 11 }
const modes = (found: { mode: string }[]) => found.map((source) => source.mode)
const find = (characters: Character[], id: string) => characters.find((character) => character.id === id) as Character
const perception: Check = { kind: "skill", skill: "perception" }
const stealth: Check = { kind: "skill", skill: "stealth" }

test("Dodge: attacks against have Disadvantage and Dexterity saves Advantage, until the dodger's next turn begins", () => {
  const taken = takeAction([thalbern, owlbear], "thalbern", { action: "dodge" })
  assert.equal(taken.fact, "Thalbern takes the Dodge action.")
  const dodging = { ...find(taken.characters, "thalbern"), isComplete: true }
  assert.deepEqual(dodging.turnEffects, [{ id: "dodging", by: "thalbern", turns: 2 }])
  assert.deepEqual(attackModesFromActions(owlbear, dodging, [dodging, owlbear]), [{ mode: "disadvantage", from: "Thalbern Dodging" }])
  assert.deepEqual(checkModesFromActions(dodging, { kind: "save", ability: "dex" }), [{ mode: "advantage", from: "Dodging" }])
  assert.deepEqual(checkModesFromActions(dodging, { kind: "save", ability: "con" }), [])
  assert.equal(turnEffectWords(dodging), "Dodging")
  // The next round: it still holds for an Owlbear that goes before him, and ends once his own turn is taken.
  const next = atRoundStart(dodging)
  assert.deepEqual([next.turnEffects, next.isComplete], [[{ id: "dodging", by: "thalbern", turns: 1 }], false])
  assert.deepEqual(modes(attackModesFromActions(owlbear, next, [next, owlbear])), ["disadvantage"])
  assert.deepEqual(attackModesFromActions(owlbear, { ...next, isComplete: true }, [{ ...next, isComplete: true }, owlbear]), [])
  assert.equal(atRoundStart({ ...next, isComplete: true }).turnEffects, undefined)
  // Restrained, his Speed is 0 and the Dodge gives nothing. The condition's own Advantage for the attacker stands.
  const held = { ...dodging, conditions: [{ id: "restrained" as const }] }
  assert.deepEqual(attackModesFromActions(owlbear, held, [held, owlbear]), [])
  assert.deepEqual(modes(attackModesFrom(owlbear, held, "melee")), ["advantage"])
})

test("Help against an enemy gives the next attack by an ally Advantage, once", () => {
  const taken = takeAction([branka, thalbern, owlbear, bandit], "branka", { action: "help", target: "owlbear" })
  assert.equal(taken.fact, "Branka takes the Help action against Owlbear.")
  const scene = taken.characters.map((character) => (character.id === "branka" ? { ...character, isComplete: true } : character))
  const beast = find(scene, "owlbear")
  assert.deepEqual(beast.turnEffects, [{ id: "distracted", by: "branka", turns: 2 }])
  // Her ally has Advantage. She does not help herself, and the Owlbear's own side gets nothing from it.
  assert.deepEqual(attackModesFromActions(thalbern, beast, scene), [{ mode: "advantage", from: "Help from Branka" }])
  assert.deepEqual(attackModesFromActions(branka, beast, scene), [])
  assert.deepEqual(attackModesFromActions(bandit, beast, scene), [])
  // Thalbern's attack spends it. Branka's own would not.
  const longbow = { attack: { weapon: "longbow", target: "owlbear" }, rollType: "Longbow", difficulty: 13, modifier: 5, mode: "advantage" as const }
  assert.deepEqual(find(afterRoll(scene, "branka", longbow), "owlbear").turnEffects, [{ id: "distracted", by: "branka", turns: 2 }])
  assert.equal(find(afterRoll(scene, "thalbern", longbow), "owlbear").turnEffects, undefined)
})

test("Help with a check needs the helper's own proficiency in the skill, and is spent by that check", () => {
  // Branka is proficient in Perception.
  const taken = takeAction([branka, thalbern], "branka", { action: "help", target: "thalbern", skill: "perception" })
  assert.equal(taken.fact, "Branka takes the Help action for Thalbern's next Perception check.")
  const helped = find(taken.characters, "thalbern")
  assert.deepEqual(checkModesFromActions(helped, perception, taken.characters), [{ mode: "advantage", from: "Help from Branka" }])
  assert.deepEqual(checkModesFromActions(helped, stealth, taken.characters), [])
  // She is not proficient in Stealth, so she cannot help with it. Help that names no skill, or no one here, does nothing.
  for (const action of [
    { action: "help" as const, target: "thalbern", skill: "stealth" as const },
    { action: "help" as const, target: "thalbern" },
    { action: "help" as const, target: "nobody", skill: "perception" as const },
  ]) {
    const none = takeAction([branka, thalbern], "branka", action)
    assert.deepEqual([none.fact, find(none.characters, "thalbern").turnEffects], [undefined, undefined])
  }
  // A Stealth check leaves the help unspent. The Perception check spends it.
  const roll = (check: Check) => ({ check, rollType: "", difficulty: 15, modifier: 0, mode: "normal" as const })
  assert.equal(find(afterRoll(taken.characters, "thalbern", roll(stealth)), "thalbern").turnEffects?.length, 1)
  assert.equal(find(afterRoll(taken.characters, "thalbern", roll(perception)), "thalbern").turnEffects, undefined)
})

test("Hide: Stealth against 15 for Invisible, which gives the next attack Advantage and ends with it", () => {
  // Poppen's Stealth: Dexterity 16 is +3, proficient +2, Expertise +2.
  const asked = hideRoll(poppen)
  assert.deepEqual([asked.check, asked.difficulty, asked.modifier, asked.stakes], [stealth, 15, 7, [{ on: "success", target: "poppen", kind: "condition", condition: "invisible", span: "lasting" }]])
  // A failure leaves her in plain sight.
  assert.equal(applyStakes({ characters: [poppen, bandit], stakes: asked.stakes, outcome: "failure", roll: () => 1 }).characters[0].conditions, undefined)
  const hidden = applyStakes({ characters: [poppen, bandit], stakes: asked.stakes, outcome: "success", roll: () => 1 })
  assert.deepEqual([hidden.characters[0].conditions, hidden.facts], [[{ id: "invisible" }], ["Poppen is now Invisible."]])
  const unseen = hidden.characters[0]
  // Unseen, her attack has Advantage and one against her Disadvantage.
  assert.deepEqual(attackModesFrom(unseen, bandit, "ranged"), [{ mode: "advantage", from: "Invisible" }])
  assert.deepEqual(modes(attackModesFrom(bandit, unseen, "melee")), ["disadvantage"])
  // Shortbow +5 with Advantage: a 4 and a 12 keep the 12, 17 against Armor Class 12. With Advantage and a Ranged
  // weapon it is a Sneak Attack: 1d6 + 3 rolling 4 is 7, and 1d6 more rolling 5 makes 12. The Bandit's 11 are gone.
  const dice = [4, 5]
  const shot = strike({ attacker: unseen, target: bandit, weapon: "shortbow", dice: [4, 12], mode: "advantage", roll: () => dice.shift() as number })
  assert.deepEqual([shot.roll.total, shot.features, shot.taken, shot.fate], [17, ["Sneak Attack"], 12, "dies"])
  // The shot gives her away.
  const shortbow = { attack: { weapon: "shortbow", target: "bandit" }, rollType: "Shortbow", difficulty: 12, modifier: 5, mode: "advantage" as const }
  assert.equal(find(afterRoll([unseen, bandit], "poppen", shortbow), "poppen").conditions, undefined)
})

test("Dash and Disengage are taken and change no roll, and nothing an action left outlasts the encounter", () => {
  for (const action of ["dash", "disengage"] as const) {
    const taken = takeAction([thalbern, owlbear], "thalbern", { action })
    assert.deepEqual([taken.characters, taken.fact], [[thalbern, owlbear], `Thalbern takes the ${action === "dash" ? "Dash" : "Disengage"} action.`])
  }
  assert.equal(turnEffectsAtEncounterEnd({ ...thalbern, turnEffects: [{ id: "dodging" as const, by: "thalbern", turns: 2 }] }).turnEffects, undefined)
})

test("Weapon Mastery: a Ranger and a Rogue master two kinds of weapons they are trained with, a Fighter three, a Wizard none", () => {
  assert.deepEqual(sheetProblems(thalbern.sheet as Sheet), [])
  assert.deepEqual(sheetProblems({ ...(thalbern.sheet as Sheet), weaponMasteries: ["longbow", "shortsword", "dagger"] }), [
    "the sheet has mastery of 3 kinds of weapons, and Ranger allows 2 at level 1",
  ])
  assert.deepEqual(sheetProblems({ ...(branka.sheet as Sheet), weaponMasteries: ["warhammer", "longsword", "longbow"] }), [])
  // A Rogue is trained with Simple weapons and with Martial weapons that are Finesse or Light. A Longbow is neither.
  assert.deepEqual(sheetProblems({ ...(poppen.sheet as Sheet), weaponMasteries: ["shortbow", "longbow"] }), ["Rogue is not trained with the Longbow, so cannot master it"])
  const lyra = sheet("covert-cargo/characters/1749159962941.json")
  assert.deepEqual(sheetProblems({ ...lyra, weaponMasteries: ["quarterstaff"] }), ["the sheet has mastery of 1 kinds of weapons, and Wizard allows 0 at level 1"])
  // The property is the weapon's own, and only for a kind the hero has mastered. Thalbern carries a Dagger and has not mastered it.
  assert.deepEqual([masteryOf(thalbern, "shortsword"), masteryOf(thalbern, "longbow"), masteryOf(thalbern, "dagger"), masteryOf(owlbear, "rend")], ["vex", "slow", undefined, undefined])
})

test("Vex: a hit that deals damage gives the attacker's next attack on that creature Advantage, once", () => {
  const blade = { attack: { weapon: "shortsword", target: "owlbear" }, rollType: "Shortsword", difficulty: 13, modifier: 5, mode: "normal" as const }
  const scene = [{ ...thalbern, isComplete: true }, branka, owlbear]
  // A hit for 6 with his mastered Shortsword.
  const after = afterRoll(scene, "thalbern", blade, 6)
  const beast = find(after, "owlbear")
  assert.deepEqual(beast.turnEffects, [{ id: "vexed", by: "thalbern", turns: 2 }])
  assert.deepEqual(attackModesFromActions(find(after, "thalbern"), beast, after), [{ mode: "advantage", from: "Vex" }])
  assert.deepEqual(attackModesFromActions(branka, beast, after), [])
  // It lasts through his next turn: the round turns, and it is still there for the attack he makes then.
  const next = after.map(atRoundStart)
  assert.deepEqual(modes(attackModesFromActions(find(next, "thalbern"), find(next, "owlbear"), next)), ["advantage"])
  // That attack spends it. A miss sets up nothing, and another hit sets it up again.
  assert.equal(find(afterRoll(next, "thalbern", blade, 0), "owlbear").turnEffects, undefined)
  assert.deepEqual(find(afterRoll(next, "thalbern", blade, 4), "owlbear").turnEffects, [{ id: "vexed", by: "thalbern", turns: 2 }])
  // A Longbow's mastery is Slow, and his Dagger is not mastered: neither gives it.
  for (const weapon of ["longbow", "dagger"]) assert.equal(find(afterRoll(scene, "thalbern", { ...blade, attack: { weapon, target: "owlbear" } }, 6), "owlbear").turnEffects, undefined)
})
