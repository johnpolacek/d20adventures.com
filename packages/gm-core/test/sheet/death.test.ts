import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { strike, strikeFacts } from "../../src/sheet/attack"
import { atRoundStart, type DeathSaves, deathSave, killed, withDamage, withHealing, withStatusWord } from "../../src/sheet/death"
import type { Sheet } from "../../src/sheet/sheet"
import { isDead, isDown, isDying, takesTurn } from "../../src/utils/turn-actors"
import { DEATH_SAVE, type RollRequirement } from "../../src/validations/roll-requirement-schema"

// Every expected value below was worked out by hand from the SRD 5.2.1 rules, not copied from the function's output.

const sheet = JSON.parse(readFileSync(new URL("../../../../content/settings/realm-of-myr/adventures/the-midnight-summons/characters/thalbern.json", import.meta.url), "utf8")).sheet as Sheet
type Character = {
  name: string
  type: string
  sheet?: Sheet
  statBlock?: string
  hitPoints?: number
  healthPercent?: number
  status?: string
  deathSaves?: DeathSaves
  initiative?: number
  hasReplied?: boolean
  isComplete?: boolean
  rollRequired?: RollRequirement
}
// Thalbern, a level 1 Ranger with 11 hit points.
const thalbern = (hitPoints = 11): Character => ({ name: "Thalbern", type: "pc", sheet, hitPoints })
const dying = (successes = 0, failures = 0): Character => ({ ...thalbern(0), status: "Unconscious", deathSaves: { successes, failures } })
const stable = (): Character => ({ ...thalbern(0), status: "Unconscious", deathSaves: { successes: 3, failures: 0, stable: true } })
// An Owlbear has 59 hit points.
const owlbear = (hitPoints = 59): Character => ({ name: "Owlbear", type: "npc", statBlock: "owlbear", hitPoints })
const off = { playerDeath: false }

test("a hero at 0 falls Unconscious and is dying, and an NPC at 0 dies", () => {
  // 11 - 14 is past 0 with 3 left over, less than his 11: dying.
  const fall = withDamage(thalbern(), 14)
  assert.deepEqual([fall.character.hitPoints, fall.character.status, fall.character.deathSaves, fall.fate], [0, "Unconscious", { successes: 0, failures: 0 }, "dying"])
  assert.equal(isDying(fall.character), true)
  // 59 - 60 is past 0: dead.
  const slain = withDamage(owlbear(), 60)
  assert.deepEqual([slain.character.hitPoints, slain.character.status, slain.fate], [0, "dead", "dies"])
  // 11 - 4 is 7: nothing more.
  assert.deepEqual([withDamage(thalbern(), 4).character.hitPoints, withDamage(thalbern(), 4).fate], [7, undefined])
})

test("damage left over at 0 that reaches the hit point maximum kills outright", () => {
  // 11 - 22 leaves 11 over, his whole maximum: dead. 21 leaves 10 over: dying.
  assert.deepEqual([withDamage(thalbern(), 22).character.status, withDamage(thalbern(), 22).fate], ["dead", "killed"])
  assert.equal(withDamage(thalbern(), 21).fate, "dying")
  // With player death off he is left Stable at 0 instead.
  const spared = withDamage(thalbern(), 22, { rules: off })
  assert.deepEqual([spared.character.hitPoints, spared.character.status, spared.character.deathSaves?.stable, spared.fate], [0, "Unconscious", true, "stable"])
})

test("damage at 0 is a failed save, two from a Critical Hit, and kills at the maximum", () => {
  // 0 failures + 1 is 1. With a Critical Hit, + 2 is 2. 1 failure + 2 is 3: dead.
  assert.deepEqual(withDamage(dying(1, 0), 3).character.deathSaves, { successes: 1, failures: 1 })
  assert.deepEqual(withDamage(dying(), 3, { critical: true }).character.deathSaves, { successes: 0, failures: 2 })
  assert.equal(withDamage(dying(0, 1), 3, { critical: true }).character.status, "dead")
  // 11 damage at 0 is his maximum: dead, with any saves.
  assert.equal(withDamage(dying(2, 0), 11).character.status, "dead")
  // A Stable hero who takes damage is dying again, saves from zero, then the failure: 0 and 1.
  const shaken = withDamage(stable(), 3)
  assert.deepEqual([shaken.character.deathSaves, isDying(shaken.character)], [{ successes: 0, failures: 1 }, true])
})

test("a Death Saving Throw: 10 or more succeeds, a 1 is two failures, a 20 wakes at 1, and three of either decide", () => {
  assert.deepEqual(deathSave(dying(), 10).character.deathSaves, { successes: 1, failures: 0 })
  assert.deepEqual(deathSave(dying(), 9).character.deathSaves, { successes: 0, failures: 1 })
  assert.deepEqual(deathSave(dying(), 1).character.deathSaves, { successes: 0, failures: 2 })
  // A 20: 1 hit point, conscious, saves cleared. 1 of 11 shows as 9%.
  const up = deathSave(dying(2, 2), 20)
  assert.deepEqual([up.character.hitPoints, up.character.healthPercent, up.character.status, up.character.deathSaves, up.fate], [1, 9, undefined, undefined, "revived"])
  // 2 successes + 1 is 3: Stable, still Unconscious at 0, and no more saves.
  const steady = deathSave(dying(2, 1), 14)
  assert.deepEqual([steady.character.hitPoints, steady.character.status, steady.character.deathSaves, steady.fate], [0, "Unconscious", { successes: 3, failures: 1, stable: true }, "stable"])
  assert.equal(isDying(steady.character), false)
  assert.throws(() => deathSave(steady.character, 12), /not dying/)
  // 2 failures + 1 is 3: dead. With player death off, Stable.
  assert.deepEqual([deathSave(dying(0, 2), 5).character.status, deathSave(dying(0, 2), 5).fate], ["dead", "dies"])
  assert.deepEqual([deathSave(dying(0, 2), 5, off).character.deathSaves?.stable, deathSave(dying(0, 2), 5, off).fate], [true, "stable"])
})

test("healing at 0 wakes a hero at the healed hit points, and the dead stay dead", () => {
  const healed = withHealing(dying(1, 2), 4)
  assert.deepEqual([healed.hitPoints, healed.status, healed.deathSaves], [4, undefined, undefined])
  assert.deepEqual(withHealing(stable(), 2).hitPoints, 2)
  assert.equal(withHealing(killed(thalbern(0)), 5).hitPoints, 0)
  // 6 + 3 is 9. 9 + 5 is 14, held to his 11.
  assert.equal(withHealing(thalbern(6), 3).hitPoints, 9)
  assert.equal(withHealing(thalbern(9), 5).hitPoints, 11)
})

test("the model's word 'dead' drops a hero to 0, and an NPC takes it as written", () => {
  const word = withStatusWord(thalbern(), "dead")
  assert.deepEqual([word.hitPoints, word.status, isDead(word)], [0, "Unconscious", false])
  assert.equal(withStatusWord(owlbear(), "Dead").status, "Dead")
})

test("dead, down and dying are three things, and a dying hero's turn is their Death Saving Throw", () => {
  const dead = killed(thalbern(0))
  assert.deepEqual([isDead(dead), isDown(dead), isDying(dead)], [true, true, false])
  assert.deepEqual([isDead(stable()), isDown(stable()), isDying(stable())], [false, true, false])
  assert.deepEqual([isDead(dying()), isDown(dying()), isDying(dying())], [false, true, true])
  const round = atRoundStart({ ...dying(), initiative: 15, hasReplied: false, isComplete: true })
  assert.deepEqual([round.rollRequired, round.hasReplied, round.isComplete, takesTurn(round)], [DEATH_SAVE, true, false, true])
  assert.deepEqual([atRoundStart({ ...stable(), initiative: 15 }).isComplete, takesTurn(stable())], [true, false])
})

test("a strike says who it dropped and how", () => {
  // Rend is +7: an 8 makes 15 against his Armor Class 15 and hits for 2d8 + 5. 3 + 6 + 5 is 14, 3 left over: dying.
  const rend = (die: number, ...damage: number[]) => strike({ attacker: owlbear(), target: thalbern(), weapon: "rend", dice: [die], roll: () => damage.shift() as number })
  const blow = rend(8, 3, 6)
  assert.deepEqual([blow.target.status, blow.target.deathSaves], ["Unconscious", { successes: 0, failures: 0 }])
  assert.match(strikeFacts("Owlbear", "Thalbern", blow), /Thalbern drops to 0 hit points, falls Unconscious and is dying\.$/)
  // A 20 doubles the dice: 8 + 8 + 8 + 8 + 5 is 37, 26 left over: killed outright.
  assert.match(strikeFacts("Owlbear", "Thalbern", rend(20, 8, 8, 8, 8)), /Thalbern is killed outright\.$/)
  // Longbow, 1d8 + 3: a 14 makes 19 against its Armor Class 13 and hits for 8 + 3, and an Owlbear with 5 left dies.
  const shot = strike({ attacker: thalbern(), target: owlbear(5), weapon: "longbow", dice: [14], roll: () => 8 })
  assert.match(strikeFacts("Thalbern", "Owlbear", shot), /Owlbear drops to 0 hit points and dies\.$/)
})
