import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { damageTaken, defensesOf } from "../../src/sheet/attack"
import type { ConditionEntry } from "../../src/sheet/condition-entry"
import { withCondition } from "../../src/sheet/conditions"
import { withDamage } from "../../src/sheet/death"
import { hitPointsOf } from "../../src/sheet/hit-points"
import { longRest, shortRest } from "../../src/sheet/rest"
import type { Sheet } from "../../src/sheet/sheet"
import { attackModesFromSpells, saveModesFor } from "../../src/sheet/spell-effects"
import { castSpell, spellById, spellLabel } from "../../src/sheet/spells"
import type { SpellEffect } from "../../src/sheet/turn-effect"

// Every expected value below was worked out by hand from the SRD 5.2.1 spell texts, not copied from the function's output.

const spell = (id: string) => spellById.get(id) as NonNullable<ReturnType<typeof spellById.get>>
const sheet = (path: string) => (JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { sheet: Sheet }).sheet
type Character = {
  id: string
  name: string
  type: string
  sheet?: Sheet
  statBlock?: string
  hitPoints?: number
  spellEffects?: SpellEffect[]
  conditions?: ConditionEntry[]
  concentration?: { spell: string }
}
// Lyra, a Wizard with Intelligence 16: spell save DC 13. Branka, a level 1 Fighter with 14 hit points. A Bandit has 11,
// and an Imp is a Fiend.
const lyra: Character = { id: "lyra", name: "Lyra", type: "pc", sheet: sheet("covert-cargo/characters/1749159962941.json"), hitPoints: 6 }
const branka: Character = { id: "branka", name: "Branka", type: "pc", sheet: sheet("welcome-to-kordavos/characters/branka-stoneveil.json"), hitPoints: 14 }
const bandit: Character = { id: "bandit", name: "Bandit", type: "npc", statBlock: "bandit", hitPoints: 11 }
const imp: Character = { id: "imp", name: "Imp", type: "npc", statBlock: "imp", hitPoints: 21 }
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() as number
const find = (characters: readonly Character[], id: string) => characters.find((character) => character.id === id) as Character
const hit = (type: Parameters<typeof damageTaken>[0]["parts"][number]["type"], amount: number) => ({ parts: [{ type, dice: [amount], bonus: 0, total: amount }], total: amount })
const on = (character: Character, ...spells: string[]): Character => ({ ...character, spellEffects: spells.map((id) => ({ spell: id, by: "lyra" })) })

test("Stoneskin, Fire Shield and Warding Bond give their bearer Resistance, and Mind Blank Immunity", () => {
  const cast = castSpell({ characters: [lyra, branka], casterId: "lyra", spell: spell("stoneskin"), targets: ["branka"], d20: falls(), roll: falls() })
  const stone = find(cast.characters, "branka")
  // 9 Slashing is halved to 4, and 9 Fire is not.
  assert.deepEqual([damageTaken(hit("slashing", 9), defensesOf(stone)), damageTaken(hit("fire", 9), defensesOf(stone))], [4, 9])
  // The chill shield resists Fire and not Cold.
  const chill = find(castSpell({ characters: [lyra], casterId: "lyra", spell: spell("fire-shield"), targets: [], d20: falls(), roll: falls(), choice: "chill" }).characters, "lyra")
  assert.deepEqual([damageTaken(hit("fire", 9), defensesOf(chill)), damageTaken(hit("cold", 9), defensesOf(chill))], [4, 9])
  // Warding Bond: Resistance to all damage, so 9 Force is 4.
  assert.equal(damageTaken(hit("force", 9), defensesOf(on(branka, "warding-bond"))), 4)
  // Mind Blank: 9 Psychic is none, and the Charmed condition is not given.
  const blank = on(branka, "mind-blank")
  assert.equal(damageTaken(hit("psychic", 9), defensesOf(blank)), 0)
  assert.equal(withCondition(blank, { id: "charmed", source: "bandit" }).given, false)
  assert.deepEqual(
    ["stoneskin", "fire-shield", "warding-bond", "mind-blank"].map((id) => spellLabel(spell(id))),
    ["run", "partly", "partly", "partly"]
  )
})

test("Protection from Poison ends Poisoned and guards against it, and Freedom of Movement shuts out a spell's Restrained", () => {
  const poisoned = { ...branka, conditions: [{ id: "poisoned" as const }] }
  const cast = castSpell({ characters: [lyra, poisoned], casterId: "lyra", spell: spell("protection-from-poison"), targets: ["branka"], d20: falls(), roll: falls() })
  const guarded = find(cast.characters, "branka")
  assert.deepEqual([guarded.conditions ?? [], cast.conditions], [[], [{ target: "branka", condition: "poisoned", ends: true }]])
  // Resistance to Poison: 9 is 4. Advantage on a Constitution save made to avoid Poisoned, beside her Dwarven
  // Resilience, and none on one that is not.
  assert.equal(damageTaken(hit("poison", 9), defensesOf(guarded)), 4)
  assert.deepEqual(
    [saveModesFor(guarded, { kind: "save", ability: "con" }, ["poisoned"]).map((mode) => mode.from), saveModesFor(guarded, { kind: "save", ability: "con" })],
    [["Protection from Poison", "Dwarven Resilience"], []]
  )
  // Freedom of Movement: Web cannot Restrain them, and a grapple that is no spell still can.
  const free = on(branka, "freedom-of-movement")
  assert.deepEqual([withCondition(free, { id: "restrained", spell: "web" }).given, withCondition(free, { id: "restrained", source: "bandit" }).given], [false, true])
})

test("Protection from Evil and Good and Foresight change the attack rolls made against their bearer", () => {
  // An Imp is a Fiend: its attack on the protected has Disadvantage. A Bandit is a Humanoid: none.
  const warded = on(branka, "protection-from-evil-and-good")
  assert.deepEqual([attackModesFromSpells(imp, warded).map((mode) => mode.mode), attackModesFromSpells(bandit, warded)], [["disadvantage"], []])
  // Foresight: Disadvantage on attacks against its bearer, Advantage on their own attacks, checks and saves.
  const seer = on(branka, "foresight")
  assert.deepEqual(
    [
      attackModesFromSpells(bandit, seer).map((mode) => mode.mode),
      attackModesFromSpells(seer, bandit).map((mode) => mode.mode),
      saveModesFor(seer, { kind: "save", ability: "wis" }).map((mode) => mode.mode),
    ],
    [["disadvantage"], ["advantage"], ["advantage"]]
  )
  // Cast again on another, it ends on the first.
  const again = castSpell({ characters: [lyra, { ...seer }, bandit], casterId: "lyra", spell: spell("foresight"), targets: ["bandit"], d20: falls(), roll: falls() })
  assert.deepEqual([find(again.characters, "branka").spellEffects, find(again.characters, "bandit").spellEffects?.map((effect) => effect.spell)], [undefined, ["foresight"]])
})

test("Death Ward holds its bearer at 1 hit point once, a hero or an NPC, and then ends", () => {
  // Branka at 14 takes 20: she would drop to 0, drops to 1, and the ward ends. 5 more drop her to 0, dying.
  const first = withDamage(on(branka, "death-ward"), 20)
  assert.deepEqual([first.character.hitPoints, first.fate, first.character.spellEffects], [1, "warded", undefined])
  assert.equal(withDamage(first.character, 5).fate, "dying")
  // A Bandit at 11 would die at 0: it holds at 1.
  const npc = withDamage(on(bandit, "death-ward"), 30)
  assert.deepEqual([npc.character.hitPoints, npc.fate], [1, "warded"])
  assert.equal(spellLabel(spell("death-ward")), "run")
})

test("Heroes' Feast raises the maximum by its 2d10 and guards against poison and fear until a Long Rest", () => {
  // The 2d10 fall 7 and 5: Branka's maximum and hit points rise by 12, from 14 to 26.
  const cast = castSpell({ characters: [lyra, branka], casterId: "lyra", spell: spell("heroes-feast"), targets: ["branka"], d20: falls(), roll: falls(7, 5) })
  const fed = find(cast.characters, "branka")
  assert.deepEqual(hitPointsOf(fed), { current: 26, maximum: 26 })
  assert.equal(withCondition(fed, { id: "frightened", source: "bandit" }).given, false)
  // A Short Rest leaves it, and a Long Rest, which stands for its day, ends it: the maximum is 14 again.
  const rested = shortRest(fed, { roll: falls() }).character
  assert.deepEqual(
    rested.spellEffects?.map((effect) => effect.spell),
    ["heroes-feast"]
  )
  assert.deepEqual(hitPointsOf(longRest(rested).character), { current: 14, maximum: 14 })
})

test("Greater Invisibility gives the Invisible condition for its minute", () => {
  const cast = castSpell({ characters: [lyra, branka], casterId: "lyra", spell: spell("greater-invisibility"), targets: ["branka"], d20: falls(), roll: falls() })
  assert.deepEqual(find(cast.characters, "branka").conditions, [{ id: "invisible", source: "lyra", turns: 10, spell: "greater-invisibility" }])
  assert.equal(find(cast.characters, "lyra").concentration?.spell, "greater-invisibility")
})
