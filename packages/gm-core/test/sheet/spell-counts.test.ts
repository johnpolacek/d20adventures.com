import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import type { ConditionEntry } from "../../src/sheet/condition-entry"
import type { Sheet } from "../../src/sheet/sheet"
import type { Floor } from "../../src/sheet/space"
import { spellsAtRoundEnd } from "../../src/sheet/spell-rounds"
import { castInSpace } from "../../src/sheet/spell-space"
import { castSpell, conditionSpanOf, spellById, spellLabel, targetLimit } from "../../src/sheet/spells"

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
  conditions?: ConditionEntry[]
  position?: { x: number; y: number }
  isComplete?: boolean
}
// Lyra, a Wizard with Intelligence 16: spell save DC 13.
const lyra: Character = { id: "lyra", name: "Lyra", type: "pc", sheet: sheet("covert-cargo/characters/1749159962941.json"), hitPoints: 6, position: { x: 0, y: 0 } }
const open: Floor = { solids: [], doors: [] }
const who = (id: string, x: number, y = 0): Character => ({ id, name: id, type: "npc", statBlock: "bandit", hitPoints: 11, position: { x, y } })
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() as number

test("how many a spell takes: its words' count, and one more for each slot level above where its data says so", () => {
  // Mass Suggestion "twelve or fewer creatures". Chain Lightning its first target and three more, and one more bolt for
  // each slot level above 6. Bless three, four with a level 2 slot. Meteor Swarm's four 40-foot Spheres, eight each.
  assert.deepEqual(
    [targetLimit(spell("mass-suggestion")), targetLimit(spell("chain-lightning")), targetLimit(spell("chain-lightning"), 8), targetLimit(spell("bless"), 2), targetLimit(spell("meteor-swarm"))],
    [12, 4, 6, 4, 32]
  )
  // "You and up to eight willing creatures": nine, the caster among them.
  assert.equal(targetLimit(spell("teleport")), 9)
})

test("a range in miles is read as miles: Meteor Swarm's four Spheres a mile off, each creature taken once", () => {
  // Points 2,000 feet off are within its mile. The Bandits at 2,000 and 2,030 are both in the first Sphere and the
  // second, centred on the one at 2,030, and are taken once each. The one at 2,060 is in the second alone. One 6,000
  // feet off is past 5,280 feet, and makes no Sphere.
  const everyone = [lyra, who("a", 2000), who("b", 2030), who("c", 2060), who("far", 6000)]
  const swarm = castInSpace({ spell: spell("meteor-swarm"), caster: lyra, everyone, named: ["a", "b", "far"], floor: open })
  assert.deepEqual(swarm.targets, ["a", "b", "c"])
  assert.deepEqual(castInSpace({ spell: spell("meteor-swarm"), caster: lyra, everyone, named: ["far"], floor: open }).problem, {
    name: "Out Of Range",
    text: "Lyra is 6000 feet from far, out of Meteor Swarm's range of 1 mile. The spell is not cast.",
  })
})

test("Chain Lightning's bolts leap only to those within 30 feet of the first target", () => {
  // The first at 100 feet, one 20 feet from it, one 50 feet from it, and one 150 feet off and 25 from the first.
  const everyone = [lyra, who("first", 100), who("near", 120), who("far", 150), who("edge", 100, 25)]
  assert.deepEqual(castInSpace({ spell: spell("chain-lightning"), caster: lyra, everyone, named: ["first", "near", "far", "edge"], floor: open }).targets, ["first", "near", "edge"])
})

test("a condition lasts the span its spell gives it: Sunburst's Blinded for a minute, with a save at the end of each turn", () => {
  assert.deepEqual(
    ["color-spray", "ray-of-sickness", "hold-person", "blindness-deafness"].map((id) => conditionSpanOf(spell(id), spell(id).conditions?.[0]?.condition ?? "blinded")),
    ["turn", "turn", undefined, undefined]
  )
  assert.equal(conditionSpanOf(spell("sunburst"), "blinded"), "minute")
  // Sunburst at DC 13 on an Owlbear (59 hit points, Constitution +3) who rolls 5: 12d6 of 1s and 2s is 18 Radiant, and
  // Blinded for a minute: ten of its turns.
  const owlbear: Character = { id: "owlbear", name: "Owlbear", type: "npc", statBlock: "owlbear", hitPoints: 59, position: { x: 60, y: 0 } }
  const burst = castSpell({ characters: [lyra, owlbear], casterId: "lyra", spell: spell("sunburst"), targets: ["owlbear"], d20: falls(5), roll: falls(1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2) })
  const struck = burst.characters.find((character) => character.id === "owlbear") as Character
  assert.deepEqual([struck.hitPoints, struck.conditions], [41, [{ id: "blinded", source: "lyra", turns: 10, spell: "sunburst" }]])
  // At the end of its turn it saves again: a 15 and +3 is 18 against 13, and the Blinded ends.
  const round = spellsAtRoundEnd({ characters: burst.characters, d20: falls(15), roll: falls() })
  assert.equal(round.characters.find((character) => character.id === "owlbear")?.conditions, undefined)
  assert.deepEqual([spellLabel(spell("sunburst")), spellLabel(spell("meteor-swarm")), spellLabel(spell("chain-lightning")), spellLabel(spell("mass-suggestion"))], ["partly", "run", "run", "partly"])
})
