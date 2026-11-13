import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import type { ConditionEntry } from "../../src/sheet/condition-entry"
import { boundWords } from "../../src/sheet/masters"
import type { EncounterFloor } from "../../src/sheet/placement"
import { ruledReading } from "../../src/sheet/ruled-turns"
import type { Sheet } from "../../src/sheet/sheet"
import { areEnemies, sideOf } from "../../src/sheet/sides"
import { endConcentration, settleConcentration } from "../../src/sheet/spell-effects"
import { castSpell, spellById, spellLabel } from "../../src/sheet/spells"
import type { Concentration, SpellEffect } from "../../src/sheet/turn-effect"
import type { Master } from "../../src/types/character"
import { hasPendingAutonomousAction, playsForMaster } from "../../src/utils/turn-actors"

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
  isComplete?: boolean
  master?: Master
  position?: { x: number; y: number }
  conditions?: ConditionEntry[]
  spellEffects?: SpellEffect[]
  concentration?: Concentration
}
// Lyra, a level 1 Wizard: spell save DC 13, at the floor's west end. Branka, a Fighter of her party. A Bandit, a
// Humanoid with Speed 30 and 11 hit points, 30 feet east of Lyra.
const lyra: Character = { id: "lyra", name: "Lyra", type: "pc", sheet: sheet("covert-cargo/characters/1749159962941.json"), hitPoints: 6, position: { x: 0, y: 0 } }
const branka: Character = { id: "branka", name: "Branka", type: "pc", sheet: sheet("welcome-to-kordavos/characters/branka-stoneveil.json"), hitPoints: 14, position: { x: 0, y: 20 } }
const bandit: Character = { id: "bandit", name: "Bandit", type: "npc", statBlock: "bandit", hitPoints: 11, position: { x: 30, y: 0 } }
const floor: EncounterFloor = { solids: [], doors: [], places: [], cast: [], party: [], spare: [] }
const find = (characters: readonly Character[], id: string) => characters.find((character) => character.id === id) as Character
const cast = (id: string, characters: Character[], targets: string[], choice?: string, d20 = 1) =>
  castSpell({ characters, casterId: "lyra", spell: spell(id), targets, choice, d20: () => d20, roll: () => 1 })

test("A dominated creature acts for its master's side until the spell ends", () => {
  // The Bandit fails its Wisdom save on a 1: Charmed, and Lyra's to command. It is with the party now, no enemy of Branka.
  const done = cast("dominate-person", [lyra, branka, bandit], ["bandit"])
  const thrall = find(done.characters, "bandit")
  assert.deepEqual(
    [thrall.conditions?.map((entry) => entry.id), thrall.master, sideOf(thrall), areEnemies(thrall, branka)],
    [["charmed"], { id: "lyra", spell: "dominate-person", side: "party" }, "party", false]
  )
  assert.match(boundWords(thrall, done.characters) ?? "", /dominated by Lyra's Dominate Person.*protecting itself/)
  // "Whenever the target takes damage, it repeats the save, ending the spell on itself on a success": hurt for 3, it
  // rolls a 20 and is its own again, a foe of the party.
  const hurt = settleConcentration({ before: done.characters, after: done.characters.map((each) => (each.id === "bandit" ? { ...each, hitPoints: 8 } : each)), bonus: () => 0, d20: () => 20 })
  assert.deepEqual([find(hurt.characters, "bandit").master, sideOf(find(hurt.characters, "bandit"))], [undefined, "foe"])
  // Lyra's Concentration lost frees it too.
  assert.equal(find(endConcentration(done.characters, "lyra").characters, "bandit").master, undefined)
  // A hero dominated is played for their master, and the server takes their turn.
  const hero = find(cast("dominate-person", [lyra, branka], ["branka"]).characters, "branka")
  assert.deepEqual([playsForMaster(hero), hasPendingAutonomousAction({ ...hero, isComplete: false })], [true, true])
  for (const id of ["dominate-beast", "dominate-person", "dominate-monster"]) assert.equal(spellLabel(spell(id)), "partly")
})

test("Command's word rules its target's next turn", () => {
  // Halt: "the target doesn't move and takes no action or Bonus Action". The word waits on the Bandit, who has not
  // acted this round, through this round's turn.
  const halted = find(cast("command", [lyra, bandit], ["bandit"], "halt").characters, "bandit")
  assert.deepEqual(halted.spellEffects, [{ spell: "command", by: "lyra", turns: 1, choice: "halt" }])
  assert.deepEqual(ruledReading(halted, [lyra, halted], floor), {
    roll: null,
    ruling: { name: "Command", text: 'Bandit obeys Lyra\'s command "Halt": they do not move and take no action or Bonus Action.' },
  })
  // Flee: "moving away from you by the fastest available means": the Dash action, twice its Speed of 30, so 60 feet
  // straight east, from 30 to 90.
  const fled = find(cast("command", [lyra, bandit], ["bandit"], "flee").characters, "bandit")
  const flight = ruledReading(fled, [lyra, fled], floor)
  assert.deepEqual([flight?.action, flight?.move?.at, flight?.move?.feet], [{ action: "dash" }, { x: 90, y: 0 }, 60])
  // Approach: "moves toward you by the shortest and most direct route": 25 feet, to stand 5 feet from Lyra.
  const near = find(cast("command", [lyra, bandit], ["bandit"], "approach").characters, "bandit")
  assert.deepEqual(ruledReading(near, [lyra, near], floor)?.move?.at, { x: 5, y: 0 })
  // Grovel: "The target has the Prone condition".
  assert.deepEqual(
    find(cast("command", [lyra, bandit], ["bandit"], "grovel").characters, "bandit").conditions?.map((entry) => entry.id),
    ["prone"]
  )
  // One who saves follows no command: a 20 passes DC 13.
  assert.equal(ruledReading(find(cast("command", [lyra, bandit], ["bandit"], "halt", 20).characters, "bandit"), [lyra, bandit], floor), undefined)
  assert.equal(spellLabel(spell("command")), "partly")
})

test("Fear's Frightened flee on each of their turns, with the Dash action", () => {
  // The Bandit fails in the Cone and "takes the Dash action and moves away from you by the safest route": 60 feet east.
  const afraid = find(cast("fear", [lyra, bandit], ["bandit"]).characters, "bandit")
  const flight = ruledReading(afraid, [lyra, afraid], floor)
  assert.deepEqual([flight?.ruling.name, flight?.action, flight?.move?.at], ["Fear", { action: "dash" }, { x: 90, y: 0 }])
  assert.equal(spellLabel(spell("fear")), "partly")
})
