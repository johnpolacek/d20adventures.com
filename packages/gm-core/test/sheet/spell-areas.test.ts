import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { floorAreas, floorInPlay, obscuredModes } from "../../src/sheet/floor-areas"
import { takeMove } from "../../src/sheet/moves"
import type { EncounterFloor } from "../../src/sheet/placement"
import { moveWithReactions, opportunityAttacks } from "../../src/sheet/reactions"
import type { Sheet } from "../../src/sheet/sheet"
import { endConcentration, spellEffectsAtEncounterEnd } from "../../src/sheet/spell-effects"
import { spellLabel } from "../../src/sheet/spell-labels"
import { spellsAtRoundEnd } from "../../src/sheet/spell-rounds"
import { castInSpace } from "../../src/sheet/spell-space"
import { castAgain, castSpell, spellById } from "../../src/sheet/spells"
import type { SpellEffect } from "../../src/sheet/turn-effect"

// Every expected value below was worked out by hand from the SRD 5.2.1 spell texts and the engine's reading of space
// (a creature is in a Sphere or Cube when its centre is, and in a wall when the wall cuts its space), not copied from
// the functions' output.

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
  concentration?: { spell: string }
  conditions?: { id: "restrained" | "prone"; source?: string; spell?: string }[]
}
// Lyra, a Wizard with Intelligence 16: spell save DC 13. She casts every spell here at that DC.
const lyra: Character = { id: "lyra", name: "Lyra", type: "pc", sheet: sheet("covert-cargo/characters/1749159962941.json"), hitPoints: 6, position: { x: 0, y: 0 } }
// A Bandit: 11 hit points, Speed 30, Strength, Dexterity and Constitution saves +1.
const bandit = (id: string, x: number, y = 0): Character => ({ id, name: id, type: "npc", statBlock: "bandit", hitPoints: 11, position: { x, y } })
const spell = (id: string) => spellById.get(id) as NonNullable<ReturnType<typeof spellById.get>>
const falls =
  (...dice: number[]) =>
  () => {
    if (!dice.length) throw new Error("no die left")
    return dice.shift() as number
  }
const find = (characters: readonly Character[], id: string) => characters.find((character) => character.id === id) as Character
const open: EncounterFloor = { solids: [], doors: [], places: [{ id: "west", label: "West", at: { x: 0, y: 0 } }], cast: [], party: [], spare: [] }
const holding = (effect: SpellEffect): Character => ({ ...lyra, spellEffects: [effect], concentration: { spell: effect.spell } })
const never = () => false

test("Web stands where it is put, catches those who start a turn or walk into it, and is Difficult Terrain", () => {
  // A 20-foot Cube on a Bandit at 30 feet runs from 20 to 40. The one at 60 is outside it.
  const aimed = castInSpace({ spell: spell("web"), caster: lyra, everyone: [lyra, bandit("a", 30), bandit("b", 60)], named: ["a"], floor: open })
  assert.deepEqual([aimed.targets, aimed.at], [["a"], { x: 30, y: 0 }])
  // No one saves as it is cast: the save comes as a turn starts in it, or on walking into it.
  const webbed = castSpell({ characters: [lyra, bandit("a", 30), bandit("b", 60)], casterId: "lyra", spell: spell("web"), targets: ["a"], at: aimed.at, d20: falls(), roll: falls() })
  assert.deepEqual(
    [webbed.saves, find(webbed.characters, "lyra").spellEffects, find(webbed.characters, "a").spellEffects],
    [[], [{ spell: "web", by: "lyra", amount: 2, at: { x: 30, y: 0 } }], undefined]
  )
  // As the round turns, a starts his turn in it: 4 and +1 is 5 against 13, Restrained. b is outside and rolls nothing.
  const round = spellsAtRoundEnd({ characters: webbed.characters, d20: falls(4), roll: falls() })
  assert.deepEqual(find(round.characters, "a").conditions, [{ id: "restrained", source: "lyra", spell: "web" }])
  // b walks from 60 to 35: into the webs, 12 and +1 is 13, a success. Walking on inside it this turn asks no more.
  const walked = moveWithReactions({
    characters: webbed.characters,
    moverId: "b",
    path: [
      { x: 35, y: 0 },
      { x: 30, y: 5 },
    ],
    ask: never,
    d20: falls(12),
    roll: falls(),
  })
  assert.deepEqual([walked.told.length, find(walked.characters, "b").position], [1, { x: 30, y: 5 }])
  // b's Speed of 30 toward the west: 20 feet to the webs' edge at 40, and the 10 left buy 5 feet in them. He stands at 35.
  const step = takeMove({ floor: open, mover: find(webbed.characters, "b"), others: webbed.characters.filter((one) => one.id !== "b"), ask: { to: "west" } })
  assert.deepEqual([step?.at, step?.feet], [{ x: 35, y: 0 }, 30])
  assert.equal(spellLabel(spell("web")), "partly")
})

test("Moonbeam burns once a turn, as one walks in and as a turn ends, and moves up to 60 feet onto the one named", () => {
  // Cast on a at 50: a fails with 3 and +1, 2d10 of 2 and 3, 11 to 6.
  const cast = castSpell({ characters: [lyra, bandit("a", 50), bandit("b", 60)], casterId: "lyra", spell: spell("moonbeam"), targets: ["a"], at: { x: 50, y: 0 }, d20: falls(3), roll: falls(2, 3) })
  assert.equal(find(cast.characters, "a").hitPoints, 6)
  // b walks into the 5-foot Cylinder: 15 and +1 succeeds, half of 4 and 4, 4. 11 to 7.
  const walked = moveWithReactions({ characters: cast.characters, moverId: "b", path: [{ x: 52, y: 0 }], ask: never, d20: falls(15), roll: falls(4, 4) })
  assert.equal(find(walked.characters, "b").hitPoints, 7)
  // As turns end, a saves again, 10 and +1 fails, 1 and 1, 6 to 4. b has saved this turn already, and rolls nothing.
  const round = spellsAtRoundEnd({ characters: walked.characters, d20: falls(10), roll: falls(1, 1) })
  assert.deepEqual([find(round.characters, "a").hitPoints, find(round.characters, "b").hitPoints], [4, 7])
  // Used again: one at 100 is 50 feet from the beam, and it moves onto him. One at 115 is 65 feet from it, out of reach,
  // though within 120 of Lyra.
  const everyone = [find(cast.characters, "lyra"), bandit("c", 100), bandit("d", 115)]
  const moved = castInSpace({ spell: spell("moonbeam"), caster: everyone[0], everyone, named: ["c"], floor: open, again: true })
  assert.deepEqual([moved.targets, moved.at], [["c"], { x: 100, y: 0 }])
  assert.equal(castInSpace({ spell: spell("moonbeam"), caster: everyone[0], everyone, named: ["d"], floor: open, again: true }).problem?.name, "Out Of Range")
  // c saves as it moves into his space: 2 and +1 fails, 2d10 of 5 and 5, 11 to 1. The beam now stands on him.
  const again = castAgain({ characters: everyone, casterId: "lyra", spellId: "moonbeam", targets: ["c"], at: { x: 100, y: 0 }, d20: falls(2), roll: falls(5, 5) })
  assert.deepEqual([find(again.characters, "c").hitPoints, find(again.characters, "lyra").spellEffects?.[0].at], [1, { x: 100, y: 0 }])
})

test("Cloudkill drifts 10 feet away from its caster as their turn starts, and burns the one it moves onto", () => {
  // The Sphere at 40 reaches to 60: a at 65 is outside. It drifts to 50, and reaches 70: a makes the save, 2 and +1
  // fails, 5d8 of ones, 11 to 6.
  const characters = [holding({ spell: "cloudkill", by: "lyra", amount: 5, at: { x: 40, y: 0 } }), bandit("a", 65)]
  const round = spellsAtRoundEnd({ characters, d20: falls(2), roll: falls(1, 1, 1, 1, 1) })
  assert.deepEqual([find(round.characters, "lyra").spellEffects?.[0].at, find(round.characters, "a").hitPoints], [{ x: 50, y: 0 }, 6])
})

test("Fog Cloud hides those in it: no Opportunity Attack on one walking out, and attacks through it cancel out", () => {
  // A level 2 Fog Cloud is 40 feet across from its centre at 30. Lyra at 30 walks out to 80 past a Bandit at 35.
  const fog = { spell: "fog-cloud", by: "lyra", amount: 2, at: { x: 30, y: 0 } }
  const mover = { ...lyra, position: { x: 30, y: 0 } }
  const watcher = bandit("a", 35)
  assert.equal(floorAreas([{ ...mover, spellEffects: [fog] }])[0]?.area.size, 40)
  assert.equal(opportunityAttacks({ mover, from: mover.position, to: { x: 80, y: 0 }, everyone: [mover, watcher] }).length, 1)
  const hidden = { ...mover, spellEffects: [fog] }
  assert.equal(opportunityAttacks({ mover: hidden, from: hidden.position, to: { x: 80, y: 0 }, everyone: [hidden, watcher] }).length, 0)
  // Neither sees the other: Disadvantage for the unseen target and Advantage for the unseen attacker.
  assert.deepEqual(
    obscuredModes(watcher, hidden, [hidden, watcher]).map((source) => source.mode),
    ["disadvantage", "advantage"]
  )
})

test("Spike Growth pricks for every 5 feet walked in it, and Grease touches each time one enters it", () => {
  // From 30 to the centre at 0 of a 20-foot Sphere is 20 feet inside: four times 2d4, eight ones, 11 to 3.
  const spikes = [holding({ spell: "spike-growth", by: "lyra", amount: 2, at: { x: 0, y: 10 } }), bandit("a", 30, 10)]
  const pricked = moveWithReactions({ characters: spikes, moverId: "a", path: [{ x: 0, y: 10 }], ask: never, d20: falls(), roll: () => 1 })
  assert.equal(find(pricked.characters, "a").hitPoints, 3)
  // A 10-foot square of grease about 10 runs from 5 to 15. Walking through it and back is two entries: two saves.
  const grease = [{ ...lyra, spellEffects: [{ spell: "grease", by: "lyra", amount: 1, at: { x: 10, y: 20 } }] }, bandit("b", 0, 20)]
  const slid = moveWithReactions({
    characters: grease,
    moverId: "b",
    path: [
      { x: 20, y: 20 },
      { x: 0, y: 21 },
    ],
    ask: never,
    d20: falls(15, 15),
    roll: falls(),
  })
  assert.equal(slid.told.length, 2)
  assert.equal(spellLabel(spell("grease")), "run")
})

test("Guardian of Faith strikes each enemy that starts a turn near it, and vanishes once it has dealt 60", () => {
  // Three Bandits within 15 feet of the guardian's centre fail with ones: 20 each, 60 in all. Lyra is no enemy.
  const characters = [{ ...lyra, spellEffects: [{ spell: "guardian-of-faith", by: "lyra", amount: 60, at: { x: 0, y: 10 } }] }, bandit("a", 5, 10), bandit("b", -5, 10), bandit("c", 0, 20)]
  const round = spellsAtRoundEnd({ characters, d20: falls(1, 1, 1), roll: falls() })
  assert.deepEqual(
    ["a", "b", "c"].map((id) => find(round.characters, id).hitPoints),
    [0, 0, 0]
  )
  assert.equal(find(round.characters, "lyra").spellEffects, undefined)
})

test("Wall of Force stands just before the one named, stops a walk and a spell, and pushes one it cuts aside", () => {
  // Before a Bandit at 30, a wall 100 feet long across the line, half a foot clear of his space: at x 26.99.
  const everyone = [lyra, bandit("a", 30), bandit("b", 27.5, 10)]
  const placed = castInSpace({ spell: spell("wall-of-force"), caster: lyra, everyone, named: ["a"], floor: open })
  assert.deepEqual(placed.targets, ["b"])
  assert.ok(placed.at && placed.to && Math.abs(placed.at.x - 26.99) < 0.01 && placed.at.y === 50 && placed.to.y === -50)
  const walled = castSpell({
    characters: everyone,
    casterId: "lyra",
    spell: spell("wall-of-force"),
    targets: placed.targets,
    at: placed.at,
    to: placed.to,
    measured: true,
    d20: falls(),
    roll: falls(),
  })
  // b stood half a foot past the wall on the far side, and is pushed out to clear it: his centre 3 feet past it, at 30.
  assert.ok(Math.abs((find(walled.characters, "b").position?.x ?? 0) - 30) < 0.01)
  // a cannot walk through it to Lyra, and Lyra's Ray of Frost cannot pass it.
  const step = takeMove({ floor: open, mover: find(walled.characters, "a"), others: walled.characters.filter((one) => one.id !== "a"), ask: { to: "west" } })
  assert.ok(step && step.at.x > 26.98)
  assert.equal(castInSpace({ spell: spell("ray-of-frost"), caster: find(walled.characters, "lyra"), everyone: walled.characters, named: ["a"], floor: open }).problem?.name, "Total Cover")
  assert.equal(floorInPlay(open, walled.characters).solids.length, 1)
})

test("Wall of Fire burns those it cuts as it appears, and those who end a turn on its burning side", () => {
  // Through a Bandit at 30: a fails with 2 and +1, 5d8 of ones, 11 to 6.
  const everyone = [lyra, bandit("a", 30), bandit("b", 38), bandit("c", 22)]
  const placed = castInSpace({ spell: spell("wall-of-fire"), caster: lyra, everyone, named: ["a"], floor: open })
  const cast = castSpell({ characters: everyone, casterId: "lyra", spell: spell("wall-of-fire"), targets: placed.targets, at: placed.at, to: placed.to, measured: true, d20: falls(2), roll: () => 1 })
  assert.equal(find(cast.characters, "a").hitPoints, 6)
  // As turns end: a inside the wall, and b 8 feet past it on the side away from Lyra, each take 5d8 of ones. c on her side does not.
  const round = spellsAtRoundEnd({ characters: cast.characters, d20: falls(), roll: () => 1 })
  assert.deepEqual(
    ["a", "b", "c"].map((id) => find(round.characters, id).hitPoints),
    [1, 6, 11]
  )
})

test("Call Lightning's bolt strikes within 5 feet of the point, under a cloud that stays where it formed", () => {
  // The cloud forms over Lyra at the origin. A bolt on a at 50 takes him and b 3 feet off, not c 8 feet off.
  const everyone = [lyra, bandit("a", 50), bandit("b", 53), bandit("c", 58), bandit("d", 70)]
  const bolt = castInSpace({ spell: spell("call-lightning"), caster: lyra, everyone, named: ["a"], floor: open })
  assert.deepEqual([bolt.targets, bolt.at], [["a", "b"], { x: 0, y: 0 }])
  // A point is "under the cloud" within its 60-foot radius: d at 70 is not.
  assert.equal(castInSpace({ spell: spell("call-lightning"), caster: lyra, everyone, named: ["d"], floor: open }).problem?.name, "Out Of Range")
  // Lyra walks off to 100; the cloud stays at the origin, and a bolt called again reaches d at 55 from it, not from her.
  const away = { ...lyra, position: { x: 100, y: 0 }, spellEffects: [{ spell: "call-lightning", by: "lyra", amount: 3, at: { x: 0, y: 0 } }] }
  assert.deepEqual(castInSpace({ spell: spell("call-lightning"), caster: away, everyone: [away, bandit("d", 55)], named: ["d"], floor: open, again: true }).targets, ["d"])
})

test("an area ends with its spell: Concentration lost, or the story moving on", () => {
  const webbed = holding({ spell: "web", by: "lyra", amount: 2, at: { x: 30, y: 0 } })
  assert.equal(floorAreas([webbed]).length, 1)
  assert.equal(floorAreas(endConcentration([webbed], "lyra").characters).length, 0)
  const moved = spellEffectsAtEncounterEnd({ ...webbed, spellEffects: [...(webbed.spellEffects ?? []), { spell: "mage-armor", by: "lyra" }] })
  assert.deepEqual([moved.spellEffects, moved.concentration], [[{ spell: "mage-armor", by: "lyra" }], undefined])
})
