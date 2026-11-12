import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import type { ConditionEntry } from "../../src/sheet/condition-entry"
import { attackModesFrom, conditionsOf } from "../../src/sheet/conditions"
import { counterspellSave } from "../../src/sheet/counterspell"
import { atRoundStart, regenerate, withDamage } from "../../src/sheet/death"
import { applyStakes } from "../../src/sheet/harm"
import { magicSaveModes, monsterTraitsOf, regenerationOf } from "../../src/sheet/monster-traits"
import type { Sheet } from "../../src/sheet/sheet"
import { roundTurns } from "../../src/sheet/spell-rounds"
import { rollSave } from "../../src/sheet/spells"
import type { TurnEffect } from "../../src/sheet/turn-effect"

// Every expected value below was worked out by hand from the SRD 5.2.1 stat blocks and their trait text, not copied
// from the functions' output.

type Character = {
  id: string
  name: string
  type: string
  sheet?: Sheet
  statBlock?: string
  hitPoints: number
  dead?: true
  position?: { x: number; y: number }
  conditions?: ConditionEntry[]
  turnEffects?: TurnEffect[]
  isComplete?: boolean
}
const sheetAt = (path: string) => (JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { sheet: Sheet }).sheet
const thalbern: Character = { id: "thalbern", name: "Thalbern", type: "pc", sheet: sheetAt("the-midnight-summons/characters/thalbern.json"), hitPoints: 11 }
const npc = (id: string, statBlock: string, hitPoints: number, x?: number): Character => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  type: "npc",
  statBlock,
  hitPoints,
  ...(x === undefined ? {} : { position: { x, y: 0 } }),
})
const at = (one: Character, x: number): Character => ({ ...one, position: { x, y: 0 } })
const falls =
  (...dice: number[]) =>
  () => {
    if (!dice.length) throw new Error("no die left")
    return dice.shift() as number
  }

test("which traits a character has, off its own stat block", () => {
  assert.deepEqual(monsterTraitsOf(npc("a", "tough", 32)), ["pack-tactics"])
  assert.deepEqual(monsterTraitsOf(npc("a", "warrior-infantry", 9)), ["pack-tactics"])
  assert.deepEqual(monsterTraitsOf(npc("a", "imp", 21)), ["magic-resistance"])
  // A Kobold Warrior prints Pack Tactics and Sunlight Sensitivity.
  assert.deepEqual(monsterTraitsOf(npc("a", "kobold-warrior", 7)), ["pack-tactics", "sunlight-sensitivity"])
  assert.deepEqual(monsterTraitsOf(npc("a", "troll", 94)), ["regeneration"])
  assert.deepEqual(monsterTraitsOf(npc("a", "bandit", 11)), [])
  // A hero carries a sheet and no stat block's traits, whatever else is on them.
  assert.deepEqual(monsterTraitsOf(thalbern), [])
  assert.deepEqual(monsterTraitsOf({ ...thalbern, statBlock: "tough" }), [])
})

test("Regeneration's numbers, read from each block's text", () => {
  // "The troll regains 15 Hit Points at the start of each of its turns. If the troll takes Acid or Fire damage, this
  // trait doesn't function on the troll's next turn. The troll dies only if it starts its turn with 0 Hit Points and
  // doesn't regenerate."
  assert.deepEqual(regenerationOf(npc("a", "troll", 94)), { name: "Regeneration", amount: 15, stoppedBy: ["acid", "fire"], needsHitPoint: false, diesAtTurnStart: true })
  assert.deepEqual(regenerationOf(npc("a", "troll-limb", 14)), { name: "Regeneration", amount: 5, stoppedBy: ["acid", "fire"], needsHitPoint: false, diesAtTurnStart: true })
  // "The oni regains 10 Hit Points at the start of each of its turns if it has at least 1 Hit Point." So does the Shield Guardian.
  assert.deepEqual(regenerationOf(npc("a", "oni", 119)), { name: "Regeneration", amount: 10, stoppedBy: [], needsHitPoint: true, diesAtTurnStart: false })
  assert.deepEqual(regenerationOf(npc("a", "shield-guardian", 142)), { name: "Regeneration", amount: 10, stoppedBy: [], needsHitPoint: true, diesAtTurnStart: false })
  assert.equal(regenerationOf(thalbern), undefined)
})

test("Pack Tactics: Advantage with an ally of the attacker within 5 feet of the target, not Incapacitated", () => {
  // Two Toughs, both Medium, at Thalbern, Medium, who stands at 0. Centres 5 feet apart are 5 feet away; 10 apart, 10.
  const hero = at(thalbern, 0)
  const attacker = npc("tough-a", "tough", 32, -5)
  const pack = (ally: Character) => attackModesFrom(attacker, hero, true, [attacker, hero, ally])
  assert.deepEqual(pack(npc("tough-b", "tough", 32, 5)), [{ mode: "advantage", from: "Pack Tactics" }])
  // Any ally will do: a Bandit beside the target counts for the Tough.
  assert.deepEqual(pack(npc("bandit", "bandit", 11, 5)), [{ mode: "advantage", from: "Pack Tactics" }])
  // Withheld: the ally 10 feet off, Stunned (which carries Incapacitated), at 0 hit points (Unconscious), or dead.
  assert.deepEqual(pack(npc("tough-b", "tough", 32, 10)), [])
  assert.deepEqual(pack({ ...npc("tough-b", "tough", 32, 5), conditions: [{ id: "stunned" }] }), [])
  assert.deepEqual(pack({ ...npc("tough-b", "tough", 32, 5), hitPoints: 0 }), [])
  assert.deepEqual(pack({ ...npc("tough-b", "tough", 32, 5), hitPoints: 0, dead: true }), [])
  // The attacker beside its own target is no ally of itself, and the target's own ally is not the attacker's.
  assert.deepEqual(attackModesFrom(at(attacker, 5), hero, true, [at(attacker, 5), hero]), [])
  assert.deepEqual(pack({ ...thalbern, id: "lyra", name: "Lyra", position: { x: 5, y: 0 } }), [])
  // Withheld: a Bandit has no Pack Tactics, and with no positions no ally is known to be beside anyone.
  const bandit = npc("bandit", "bandit", 11, -5)
  assert.deepEqual(attackModesFrom(bandit, hero, true, [bandit, hero, npc("tough-b", "tough", 32, 5)]), [])
  assert.deepEqual(attackModesFrom(npc("tough-a", "tough", 32), thalbern, true, [npc("tough-b", "tough", 32)]), [])
  // It joins the target's conditions: a Prone hero within 5 feet gives Advantage too, each named.
  const prone = { ...hero, conditions: [{ id: "prone" as const }] }
  assert.deepEqual(attackModesFrom(attacker, prone, true, [attacker, prone, npc("tough-b", "tough", 32, 5)]), [
    { mode: "advantage", from: "Thalbern Prone" },
    { mode: "advantage", from: "Pack Tactics" },
  ])
})

test("Magic Resistance: Advantage on a save against a spell", () => {
  assert.deepEqual(magicSaveModes(npc("imp", "imp", 21)), [{ mode: "advantage", from: "Magic Resistance" }])
  assert.deepEqual(magicSaveModes(npc("bandit", "bandit", 11)), [])
  // An Imp's Dexterity save is +3. With Advantage the d20s fall 4 and 15: 15 + 3 is 18 against DC 13, a success.
  const imp = npc("imp", "imp", 21)
  const saved = rollSave({ target: imp, ability: "dex", dc: 13, d20: falls(4, 15), roll: falls(), characters: [imp] })
  assert.deepEqual([saved.mode, saved.dice, saved.total, saved.success], ["advantage", [4, 15], 18, true])
  // A Bandit's is +1, with one die: 4 + 1 is 5, a failure.
  const bandit = npc("bandit", "bandit", 11)
  const failed = rollSave({ target: bandit, ability: "dex", dc: 13, d20: falls(4, 15), roll: falls(), characters: [bandit] })
  assert.deepEqual([failed.mode, failed.dice, failed.total, failed.success], ["normal", [4], 5, false])
})

test("Magic Resistance on the caster's save against Counterspell, itself a spell", () => {
  // Lyra at level 5 counters with DC 14 (8 + 3 + Intelligence 3). An Archmage saves Constitution at +1: with Advantage
  // 5 and 13 fall, 13 + 1 is 14, and its spell stands. A Mage, +0 and no trait, keeps the 5 and is countered.
  const base = sheetAt("covert-cargo/characters/1749159962941.json")
  const lyra = {
    id: "lyra",
    name: "Lyra",
    type: "pc",
    sheet: { ...base, level: 5, subclass: "evoker", spells: [...(base.spells ?? []), "counterspell"], spellbook: [...(base.spellbook ?? []), "counterspell"] },
    hitPoints: 22,
  }
  const archmage = npc("archmage", "archmage", 170)
  const kept = counterspellSave({ caster: archmage, counterer: lyra, characters: [archmage, lyra], d20: falls(5, 13), roll: falls() })
  assert.deepEqual([kept.mode, kept.total, kept.dc, kept.countered], ["advantage", 14, 14, false])
  const mage = npc("mage", "mage", 81)
  const lost = counterspellSave({ caster: mage, counterer: lyra, characters: [mage, lyra], d20: falls(5, 13), roll: falls() })
  assert.deepEqual([lost.mode, lost.total, lost.countered], ["normal", 5, true])
})

test("Regeneration as a turn begins, up to the maximum", () => {
  // A Troll has 94 hit points. At 50 it regains 15: 65.
  const troll = npc("troll", "troll", 50)
  const healed = regenerate(troll)
  assert.equal(healed.character.hitPoints, 65)
  assert.equal(healed.fact, "Troll regains 15 hit points by Regeneration. Troll has 65 of 94 hit points.")
  // At 90 it regains only the 4 to its maximum. At 94 nothing happens and nothing is told.
  assert.deepEqual([regenerate(npc("troll", "troll", 90)).character.hitPoints, regenerate(npc("troll", "troll", 94)).fact], [94, undefined])
  // An Oni has 119: at 50 it regains 10. A hero has no Regeneration.
  assert.equal(regenerate(npc("oni", "oni", 50)).character.hitPoints, 60)
  assert.deepEqual(regenerate(thalbern), { character: thalbern })
})

test("Acid or Fire damage stops a Troll's Regeneration on its next turn, and other damage does not", () => {
  // 10 Fire takes the Troll from 50 to 40 and stops it: at its turn it stays at 40.
  const burned = withDamage(npc("troll", "troll", 50), 10, { types: ["fire"] }).character
  assert.deepEqual([burned.hitPoints, burned.turnEffects], [40, [{ id: "regeneration-stopped", by: "troll", turns: 1 }]])
  const stopped = regenerate(burned)
  assert.deepEqual([stopped.character.hitPoints, stopped.fact], [40, "Troll's Regeneration does not work this turn: it took acid or fire damage since its last turn."])
  // The turn after, with no new burn, it works again: 40 + 15 is 55.
  assert.equal(regenerate(atRoundStart(stopped.character)).character.hitPoints, 55)
  // 10 Slashing stops nothing: 40, then 55.
  const cut = withDamage(npc("troll", "troll", 50), 10, { types: ["slashing"] }).character
  assert.deepEqual([cut.turnEffects, regenerate(cut).character.hitPoints], [undefined, 55])
  // An Oni's Regeneration names no damage that stops it.
  assert.equal(withDamage(npc("oni", "oni", 50), 10, { types: ["fire"] }).character.turnEffects, undefined)
  // A check's stake of 2d6 Fire, rolling 3 and 4, takes the Troll from 50 to 43 and stops it.
  const trap = applyStakes({ characters: [npc("troll", "troll", 50)], stakes: [{ on: "always", target: "troll", kind: "damage", dice: "2d6", type: "fire" }], outcome: "success", roll: falls(3, 4) })
  assert.deepEqual([trap.characters[0].hitPoints, regenerate(trap.characters[0]).character.hitPoints], [43, 43])
})

test("a Troll dies only if it starts its turn at 0 and does not regenerate", () => {
  // 30 Slashing on a Troll at 10 leaves it at 0, down and not dead, Unconscious.
  const felled = withDamage(npc("troll", "troll", 10), 30, { types: ["slashing"] })
  assert.deepEqual([felled.character.hitPoints, felled.character.dead, felled.fate], [0, undefined, undefined])
  assert.deepEqual(conditionsOf(felled.character), ["incapacitated", "prone", "unconscious"])
  // More Slashing at 0 keeps it there. As its turn begins it regains 15 and is up, Prone.
  const rises = regenerate(withDamage(felled.character, 8, { types: ["slashing"] }).character)
  assert.deepEqual([rises.character.hitPoints, rises.character.dead, conditionsOf(rises.character)], [15, undefined, ["prone"]])
  // Fire at 0, or Fire that drops it there, means no Regeneration as its turn begins: it dies.
  const burned = withDamage(felled.character, 5, { types: ["fire"] }).character
  const ends = regenerate(burned)
  assert.deepEqual([ends.character.dead, ends.fact], [true, "Troll starts its turn at 0 hit points and does not regenerate, having taken acid or fire damage since its last turn. Troll dies."])
  assert.equal(regenerate(withDamage(npc("troll", "troll", 10), 30, { types: ["fire"] }).character).character.dead, true)
  // An Oni has no such words: at 0 it dies as any NPC does.
  const oni = withDamage(npc("oni", "oni", 10), 30)
  assert.deepEqual([oni.character.dead, oni.fate], [true, "dies"])
})

test("Regeneration is told as the round turns, under the trait's name", () => {
  // No die is thrown: nothing at the round's turn rolls. The Troll goes from 50 to 65, the hero is untouched.
  const turned = roundTurns({ characters: [npc("troll", "troll", 50), thalbern], d20: falls(), roll: falls() })
  assert.deepEqual(
    turned.characters.map((character) => character.hitPoints),
    [65, 11]
  )
  assert.deepEqual(turned.told, [{ character: "troll", spell: "Regeneration", text: "Troll regains 15 hit points by Regeneration. Troll has 65 of 94 hit points." }])
})
