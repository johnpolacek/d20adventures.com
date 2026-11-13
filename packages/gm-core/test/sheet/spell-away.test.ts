import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { hurled } from "../../src/sheet/classes/warlock"
import type { ConditionEntry } from "../../src/sheet/condition-entry"
import { takeMove } from "../../src/sheet/moves"
import type { EncounterFloor } from "../../src/sheet/placement"
import type { Sheet } from "../../src/sheet/sheet"
import { endConcentration } from "../../src/sheet/spell-effects"
import { spellsAtRoundEnd } from "../../src/sheet/spell-rounds"
import { castSpell, spellById, spellLabel } from "../../src/sheet/spells"
import type { SpellEffect } from "../../src/sheet/turn-effect"
import { hasFled, isAway, takesTurn } from "../../src/utils/turn-actors"

// Every expected value below was worked out by hand from the SRD 5.2.1 texts of Banishment, Maze and Hurl Through
// Hell, not copied from the functions' output.

const spell = (id: string) => spellById.get(id) as NonNullable<ReturnType<typeof spellById.get>>
const sheet = (path: string) => (JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { sheet: Sheet }).sheet
type Character = {
  id: string
  name: string
  type: string
  sheet?: Sheet
  statBlock?: string
  hitPoints?: number
  fled?: true
  position?: { x: number; y: number }
  spellEffects?: SpellEffect[]
  conditions?: ConditionEntry[]
  concentration?: { spell: string }
}
// Lyra, a Wizard with Intelligence 16: spell save DC 13. A Bandit is a Humanoid with Charisma +0 and Intelligence +0,
// and no Investigation. A Goblin Warrior is a Fey with Charisma −1.
const lyra: Character = { id: "lyra", name: "Lyra", type: "pc", sheet: sheet("covert-cargo/characters/1749159962941.json"), hitPoints: 6, position: { x: 0, y: 0 } }
const bandit: Character = { id: "bandit", name: "Bandit", type: "npc", statBlock: "bandit", hitPoints: 11, position: { x: 20, y: 0 } }
const goblin: Character = { id: "goblin", name: "Goblin", type: "npc", statBlock: "goblin-warrior", hitPoints: 10, position: { x: 0, y: 20 } }
const falls =
  (...dice: number[]) =>
  () => {
    if (!dice.length) throw new Error("no die left")
    return dice.shift() as number
  }
const find = (characters: readonly Character[], id: string) => characters.find((character) => character.id === id) as Character
const open: EncounterFloor = { solids: [], doors: [], places: [{ id: "post", label: "Post", at: { x: 20, y: 0 } }], cast: [], party: [], spare: [] }

test("Banishment takes one who fails a Charisma save away, Incapacitated, until Concentration ends", () => {
  // The Bandit rolls 5 and +0: 5 against 13, a failure. He is away for the minute, 10 turns, and Incapacitated.
  const cast = castSpell({ characters: [lyra, bandit], casterId: "lyra", spell: spell("banishment"), targets: ["bandit"], d20: falls(5), roll: falls() })
  const gone = find(cast.characters, "bandit")
  assert.deepEqual(gone.spellEffects, [{ spell: "banishment", by: "lyra", turns: 10, away: true }])
  assert.deepEqual(
    gone.conditions?.map((entry) => entry.id),
    ["incapacitated"]
  )
  assert.deepEqual([isAway(gone), hasFled(gone), takesTurn({ ...gone, type: "npc" })], [true, true, false])
  // He keeps his place, and is in no one's way: Lyra walks 20 feet to the post he stands on, and stands on it.
  const walk = takeMove({ floor: open, mover: lyra, others: [gone], ask: { to: "post" } })
  assert.deepEqual(walk?.at, { x: 20, y: 0 })
  // As the round turns, no rule reaches him but his own: he is told still away.
  const round = spellsAtRoundEnd({ characters: cast.characters, d20: falls(), roll: falls() })
  assert.deepEqual(
    round.told.map((fact) => fact.character),
    ["bandit"]
  )
  // Lyra's Concentration ends: he is back where he stood, with no Incapacitated, and takes his turn.
  const back = find(endConcentration(round.characters, "lyra").characters, "bandit")
  assert.deepEqual([back.position, back.spellEffects, back.conditions, takesTurn({ ...back, type: "npc" })], [{ x: 20, y: 0 }, undefined, undefined, true])
  // A caster who no longer holds it lets him go as the round turns: Lyra has left the encounter.
  const left = spellsAtRoundEnd({ characters: cast.characters.filter((one) => one.id !== "lyra"), d20: falls(), roll: falls() })
  assert.deepEqual([find(left.characters, "bandit").spellEffects, find(left.characters, "bandit").conditions], [undefined, undefined])
  // Its nearest open space, where its own is taken on its return, is the game master's to tell.
  assert.equal(spellLabel(spell("banishment")), "partly")
})

test("Banishment that lasts its full minute sends a Fey home for good, and a Humanoid back", () => {
  // The Goblin rolls 10 and −1: 9 against 13, a failure. The Bandit rolls 12: 12 against 13, a failure too (level 5 takes two).
  const cast = castSpell({ characters: [lyra, goblin, bandit], casterId: "lyra", spell: spell("banishment"), level: 5, targets: ["goblin", "bandit"], d20: falls(10, 12), roll: falls() })
  // The last round of the minute: one turn left on each.
  const last = cast.characters.map((character) => (character.spellEffects ? { ...character, spellEffects: character.spellEffects.map((effect) => ({ ...effect, turns: 1 })) } : character))
  const round = spellsAtRoundEnd({ characters: last, d20: falls(), roll: falls() })
  const fey = find(round.characters, "goblin")
  assert.deepEqual([fey.fled, fey.spellEffects, fey.conditions], [true, undefined, undefined])
  // The Bandit is a Humanoid: he returns as the effect's last turn runs out.
  assert.equal(isAway(find(round.characters, "bandit")), true)
})

test("Maze takes one away with no save, and they escape on a DC 20 Intelligence (Investigation) check", () => {
  const cast = castSpell({ characters: [lyra, bandit], casterId: "lyra", spell: spell("maze"), targets: ["bandit"], d20: falls(), roll: falls() })
  // No save, and it lasts until it ends: no count of turns.
  assert.deepEqual([cast.saves, find(cast.characters, "bandit").spellEffects], [[], [{ spell: "maze", by: "lyra", away: true }]])
  assert.deepEqual(find(cast.characters, "lyra").concentration, { spell: "maze" })
  // As the round turns he searches: 19 and +0 is 19 against 20, still away.
  const lost = spellsAtRoundEnd({ characters: cast.characters, d20: falls(19), roll: falls() })
  assert.equal(isAway(find(lost.characters, "bandit")), true)
  // Next round 20 and +0 is 20: he escapes, the spell ends, and Lyra's Concentration with it.
  const out = spellsAtRoundEnd({ characters: lost.characters, d20: falls(20), roll: falls() })
  assert.deepEqual([find(out.characters, "bandit").spellEffects, find(out.characters, "lyra").concentration], [undefined, undefined])
  // Its nearest open space, where its own is taken on its return, is the game master's to tell.
  assert.equal(spellLabel(spell("maze")), "partly")
  // Named on no one, it falls on no one: never on its caster.
  const unnamed = castSpell({ characters: [lyra, bandit], casterId: "lyra", spell: spell("maze"), targets: [], d20: falls(), roll: falls() })
  assert.equal(find(unnamed.characters, "lyra").spellEffects, undefined)
})

test("Hurl Through Hell takes the one who fails its save away while they are Incapacitated", () => {
  // DC 13 by Lyra's casting. The Bandit rolls 3 and +0: a failure. 8d10 of 1s is 8 Psychic, and 11 less 8 leaves 3.
  const done = hurled(lyra as Character & { id: string }, bandit, falls(3), falls(1, 1, 1, 1, 1, 1, 1, 1))
  assert.deepEqual([done.taken, done.target.hitPoints], [8, 3])
  // Incapacitated through his next turn, and away as long: one turn.
  assert.deepEqual(done.target.spellEffects, [{ spell: "fiend-patron-hurl-through-hell", by: "lyra", turns: 1, away: true }])
  assert.equal(takesTurn({ ...done.target, type: "npc" }), false)
})
