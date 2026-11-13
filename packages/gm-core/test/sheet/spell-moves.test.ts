import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import type { ConditionEntry } from "../../src/sheet/condition-entry"
import { shovedTo } from "../../src/sheet/floor-areas"
import { takeTeleport } from "../../src/sheet/moves"
import type { EncounterFloor } from "../../src/sheet/placement"
import { moveWithReactions } from "../../src/sheet/reactions"
import type { Sheet } from "../../src/sheet/sheet"
import { areasForced } from "../../src/sheet/spell-rounds"
import { castSpell, spellById, spellLabel } from "../../src/sheet/spells"
import type { SpellEffect } from "../../src/sheet/turn-effect"

// Every expected value below was worked out by hand from the SRD 5.2.1 texts of Thunderwave, Misty Step and Dimension
// Door and the engine's reading of space (a wall stops one at its face, a Cube holds one whose centre is in it), not
// copied from the functions' output.

const spell = (id: string) => spellById.get(id) as NonNullable<ReturnType<typeof spellById.get>>
const sheet = (path: string) => (JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { sheet: Sheet }).sheet
type Character = {
  id: string
  name: string
  type: string
  sheet?: Sheet
  statBlock?: string
  hitPoints?: number
  position?: { x: number; y: number }
  spellEffects?: SpellEffect[]
  conditions?: ConditionEntry[]
  concentration?: { spell: string }
}
// Lyra, a Wizard with Intelligence 16: spell save DC 13. A Bandit has 11 hit points and Constitution and Dexterity +1.
const lyra: Character = { id: "lyra", name: "Lyra", type: "pc", sheet: sheet("covert-cargo/characters/1749159962941.json"), hitPoints: 6, position: { x: 0, y: 0 } }
const bandit = (x: number, id = "bandit"): Character => ({ id, name: id, type: "npc", statBlock: "bandit", hitPoints: 11, position: { x, y: 0 } })
const falls =
  (...dice: number[]) =>
  () => {
    if (!dice.length) throw new Error("no die left")
    return dice.shift() as number
  }
const find = (characters: readonly Character[], id: string) => characters.find((character) => character.id === id) as Character
const open: EncounterFloor = { solids: [], doors: [], places: [], cast: [], party: [], spare: [] }
// Lyra holding a Wall of Force across the way at x = 20, a sheet of force 1/48 of a foot thick.
const walled = (x: number): Character => ({
  ...lyra,
  spellEffects: [{ spell: "wall-of-force", by: "lyra", at: { x, y: -50 }, to: { x, y: 50 } }],
  concentration: { spell: "wall-of-force" },
})
// Lyra holding a Web, a 20-foot Cube about (20, 0): from 10 to 30 feet east.
const webbed: Character = { ...lyra, spellEffects: [{ spell: "web", by: "lyra", amount: 2, at: { x: 20, y: 0 } }], concentration: { spell: "web" } }

test("Thunderwave pushes one who fails 10 feet away, and a pushed one stops at a wall a spell raised", () => {
  // The Bandit at 5 feet is in the 15-foot Cube from Lyra. 2 and +1 is 3 against 13: 2d8 of 1s is 2 Thunder, and 10 feet back to 15.
  const wave = castSpell({ characters: [lyra, bandit(5)], casterId: "lyra", spell: spell("thunderwave"), targets: ["bandit"], measured: true, d20: falls(2), roll: falls(1, 1), floor: open })
  assert.deepEqual([find(wave.characters, "bandit").hitPoints, find(wave.characters, "bandit").position], [9, { x: 15, y: 0 }])
  // Behind a Wall of Force at 10 feet he stops at its face, short of 10.
  const stopped = castSpell({ characters: [walled(10), bandit(5)], casterId: "lyra", spell: spell("thunderwave"), targets: ["bandit"], measured: true, d20: falls(2), roll: falls(1, 1), floor: open })
  const at = find(stopped.characters, "bandit").position?.x ?? 0
  assert.ok(at > 9.9 && at < 10)
  // Every push takes the one way: 10 feet from 5 is 15 on an open floor, and to the wall's face with it raised.
  assert.deepEqual(shovedTo(open, [lyra], { x: 5, y: 0 }, { x: 0, y: 0 }, 10), { x: 15, y: 0 })
  assert.ok(shovedTo(open, [walled(10)], { x: 5, y: 0 }, { x: 0, y: 0 }, 10).x < 10)
  assert.equal(spellLabel(spell("thunderwave")), "run")
})

test("a creature pushed into an area takes what the area does to one who enters it", () => {
  // Pushed from 5 to 15, the Bandit comes into the Web at 10. Its Dexterity save: 4 and +1 is 5 against 13, Restrained.
  const before = [webbed, bandit(5)]
  const after = [webbed, { ...bandit(5), position: { x: 15, y: 0 } }]
  const forced = areasForced({ before, after, d20: falls(4), roll: falls() })
  assert.deepEqual(
    find(forced.characters, "bandit").conditions?.map((entry) => entry.id),
    ["restrained"]
  )
  assert.deepEqual(
    forced.told.map((fact) => fact.text),
    ["bandit FAILS the saving throw against Lyra's Web (5 against DC 13).", "bandit is now Restrained."]
  )
})

test("Misty Step teleports up to 30 feet to a space its caster can see, and Dimension Door through a wall", () => {
  // Named to a Bandit 50 feet off, Lyra goes 30 feet toward the space beside him.
  const far = bandit(50)
  assert.deepEqual(takeTeleport({ floor: open, mover: lyra, others: [far], ask: { to: "bandit" }, feet: 30, sees: true })?.at, { x: 30, y: 0 })
  // A Wall of Force at 20 feet: she cannot see past it, so she lands short of it.
  const short = takeTeleport({ floor: open, mover: walled(20), others: [far], ask: { to: "bandit" }, feet: 30, sees: true })?.at.x ?? 0
  assert.ok(short > 15 && short < 20)
  // Dimension Door needs no sight: 500 feet takes her through the wall to the space 5 feet short of him, at 45.
  assert.deepEqual(takeTeleport({ floor: open, mover: walled(20), others: [far], ask: { to: "bandit" }, feet: 500 })?.at, { x: 45, y: 0 })
  assert.deepEqual([spellLabel(spell("misty-step")), spellLabel(spell("dimension-door"))], ["run", "partly"])
})

test("a teleport draws no Opportunity Attack and touches only an area it lands in", () => {
  // A Bandit beside Lyra would strike as she walks away. She teleports 40 feet east, across the Web: no attack, no save.
  const across = moveWithReactions({ characters: [webbed, bandit(5)], moverId: "lyra", path: [{ x: 40, y: 0 }], teleport: true, ask: () => true, d20: falls(), roll: falls() })
  assert.deepEqual([across.attacks, across.told, find(across.characters, "lyra").position], [[], [], { x: 40, y: 0 }])
  // The Bandit teleports from 5 into the Web at 20: he enters it as he lands. 4 and +1 is 5 against 13, Restrained.
  const into = moveWithReactions({ characters: [webbed, bandit(5)], moverId: "bandit", path: [{ x: 20, y: 0 }], teleport: true, ask: () => true, d20: falls(4), roll: falls() })
  assert.deepEqual(
    find(into.characters, "bandit").conditions?.map((entry) => entry.id),
    ["restrained"]
  )
})
