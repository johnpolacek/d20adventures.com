import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { mayHide, takeMove } from "../../src/sheet/moves"
import { type EncounterFloor, type FloorPlanInMetres, floorFromMetres } from "../../src/sheet/placement"
import type { Sheet } from "../../src/sheet/sheet"
import { between, FEET_PER_METRE, inWater, walkOver } from "../../src/sheet/space"

// Expected spots are worked out by hand from the plans' metres (a metre is 3.28084 feet), not copied from the output.

const plan = (path: string) => JSON.parse(readFileSync(new URL(`../../../stage/src/plans/${path}`, import.meta.url), "utf8"))
// Broken Silence: Thalbern alone on the forest trail at night, at (-1.2 m, 12.5 m).
const trail = (): EncounterFloor => floorFromMetres({ ...plan("sets/realm-of-myr-valkarr-forest-trail.json"), ...plan("encounters/broken-silence.json") } as FloorPlanInMetres)
const place = (floor: EncounterFloor, id: string) => floor.places.find((entry) => entry.id === id)?.at as { x: number; y: number }
// Thalbern's sheet: a human ranger, Medium, Speed 30.
const sheet = (JSON.parse(readFileSync(new URL("../../../../content/settings/realm-of-myr/adventures/the-midnight-summons/characters/thalbern.json", import.meta.url), "utf8")) as { sheet: Sheet })
  .sheet
const thalbern = (floor: EncounterFloor) => ({ id: "thalbern", name: "Thalbern", type: "pc", sheet, position: floor.party[0].at })

test("a hero who hides and names no place walks into the nearest cover", () => {
  const floor = trail()
  const mover = thalbern(floor)
  // The mossy boulders: a place 0.5 m from the edge of a boulder 1.08 m tall, 3.5 feet, more than half his 6. It is
  // 3.28 m off, about 11 feet, within his 30.
  const moved = takeMove({ floor, mover, others: [], hide: { from: [] } })
  assert.ok(moved)
  assert.ok(between(moved.at, place(floor, "boulders")) < 0.01)
  assert.equal(moved.feet, 11)
  assert.deepEqual(moved.path.at(-1), moved.at)
})

test("a hero who hides goes to the place named when the move reaches it", () => {
  const floor = trail()
  // The thick ferns, 4.7 m off: no solid thing stands there, but the set marks them thick growth, which hides him.
  const moved = takeMove({ floor, mover: thalbern(floor), others: [], ask: { to: "ferns" }, hide: { from: [] } })
  assert.ok(moved && between(moved.at, place(floor, "ferns")) < 0.01)
  // The clearing is 60 feet off, past his 30: he goes into the nearest cover instead.
  const far = takeMove({ floor, mover: thalbern(floor), others: [], ask: { to: "clearing" }, hide: { from: [] } })
  assert.ok(far && between(far.at, place(floor, "boulders")) < 0.01)
})

test("a hero who hides keeps the cover between them and an enemy", () => {
  // A pillar 2 feet wide and 8 tall at (10, 0). Lyra at the origin, an Orc at (30, 0). The pillar's far side from the
  // Orc is the spot that hides her: (10 - 1 - 2.5, 0), 6.5 feet off.
  const floor: EncounterFloor = { solids: [{ kind: "circle", x: 10, y: 0, radius: 1, top: 8 }], doors: [], places: [], cast: [], party: [], spare: [] }
  const lyra = { id: "lyra", name: "Lyra", type: "pc", sheet, position: { x: 0, y: 0 } }
  const orc = { id: "orc", name: "Orc", type: "npc", statBlock: "orc", position: { x: 30, y: 0 } }
  const moved = takeMove({ floor, mover: lyra, others: [orc], hide: { from: ["orc"] } })
  assert.ok(moved && between(moved.at, { x: 6.5, y: 0 }) < 0.01)
  // Standing there already, she does not move.
  assert.equal(takeMove({ floor, mover: { ...lyra, position: { x: 6.5, y: 0 } }, others: [orc], hide: { from: ["orc"] } }), undefined)
  // With nothing in reach to hide behind, she stays where she is.
  const open: EncounterFloor = { ...floor, solids: [{ kind: "circle", x: 100, y: 0, radius: 1, top: 8 }] }
  assert.equal(takeMove({ floor: open, mover: lyra, others: [orc], hide: { from: ["orc"] } }), undefined)
  // A crate 2 feet tall is less than half her height, and hides no one.
  const low: EncounterFloor = { ...floor, solids: [{ kind: "circle", x: 10, y: 0, radius: 1, top: 2 }] }
  assert.equal(takeMove({ floor: low, mover: lyra, others: [orc], hide: { from: ["orc"] } }), undefined)
})

test("the Hide action needs thick growth, or cover out of every enemy's sight", () => {
  const floor = trail()
  const at = (id: string) => ({ ...thalbern(floor), position: place(floor, id) })
  // An Owlbear 10 feet from the ferns, looking straight at them.
  const owlbear = { id: "owlbear", name: "Owlbear", type: "npc", statBlock: "owlbear", position: { x: place(floor, "ferns").x + 10, y: place(floor, "ferns").y } }
  // In the thick ferns he is Heavily Obscured: he may hide whoever looks on.
  assert.equal(mayHide({ floor, mover: at("ferns"), others: [owlbear], from: ["owlbear"] }), true)
  // By the mossy boulders, 3.5 feet tall and 1.6 feet off, with no enemy to see him: he may.
  assert.equal(mayHide({ floor, mover: at("boulders"), others: [], from: [] }), true)
  // In the open clearing the nearest thing is 22 feet away: he may not, enemy or none.
  assert.equal(mayHide({ floor, mover: at("clearing"), others: [], from: [] }), false)
  // Where a move took him is what counts, not where he stood.
  assert.equal(mayHide({ floor, mover: at("clearing"), others: [], from: [], at: place(floor, "ferns") }), true)
  // One with no position stands on no floor, and may.
  assert.equal(mayHide({ floor, mover: { id: "thalbern", name: "Thalbern", type: "pc", sheet }, others: [], from: [] }), true)

  // A pillar 2 feet wide and 8 tall at (10, 0), an Orc at (30, 0).
  const hall: EncounterFloor = {
    solids: [{ kind: "circle", x: 10, y: 0, radius: 1, top: 8 }],
    doors: [],
    places: [{ id: "open", label: "the open floor", at: { x: 0, y: 20 } }],
    cast: [],
    party: [],
    spare: [],
  }
  const lyra = (x: number, y: number) => ({ id: "lyra", name: "Lyra", type: "pc", sheet, position: { x, y } })
  const orc = { id: "orc", name: "Orc", type: "npc", statBlock: "orc", position: { x: 30, y: 0 } }
  // Behind the pillar from the Orc she may hide. On its side of the pillar, a step from it, the Orc sees her.
  assert.equal(mayHide({ floor: hall, mover: lyra(6.5, 0), others: [orc], from: ["orc"] }), true)
  assert.equal(mayHide({ floor: hall, mover: lyra(13.5, 0), others: [orc], from: ["orc"] }), false)
  // An ally who sees her is no matter: only the enemies named are.
  assert.equal(mayHide({ floor: hall, mover: lyra(13.5, 0), others: [orc], from: [] }), true)
  // Out on the open floor she may not, and a Hide that names the open floor takes her behind the pillar instead:
  // from (0, 10) it is 10 feet to the pillar's near side.
  assert.equal(mayHide({ floor: hall, mover: lyra(0, 20), others: [orc], from: ["orc"] }), false)
  const moved = takeMove({ floor: hall, mover: lyra(0, 10), others: [orc], ask: { to: "open" }, hide: { from: ["orc"] } })
  assert.ok(moved && mayHide({ floor: hall, mover: lyra(0, 10), others: [orc], from: ["orc"], at: moved.at }))
  assert.ok(moved && between(moved.at, { x: 0, y: 20 }) > 5)
})

// A river 40 feet wide, from x = 10 to x = 50 and from y = -100 to y = 100, on an open floor.
const river = (): EncounterFloor => ({
  solids: [],
  doors: [],
  places: [{ id: "midstream", label: "midstream", at: { x: 40, y: 0 } }, { id: "far-bank", label: "the far bank", at: { x: 70, y: 0 } }],
  cast: [],
  party: [],
  spare: [],
  water: [
    [
      { x: 10, y: -100 },
      { x: 50, y: -100 },
      { x: 50, y: 100 },
      { x: 10, y: 100 },
    ],
  ],
})
const lyra = { id: "lyra", name: "Lyra", type: "pc", sheet, position: { x: 0, y: 0 } }

test("a hero backing away up the bank stops at the water and does not swim", () => {
  // The Mordava pier, Battle on the Boat: Thalbern on the bank at (-1.4 m, -6.4 m) backs straight away from a foe at
  // (-5.8 m, 0 m), toward the trees, which is up the river. His 30 feet would end at (3.8 m, -13.9 m), in the water, since
  // the river there runs from x = 2 m. He stops on the bank.
  const floor = floorFromMetres({ ...plan("sets/realm-of-myr-mordava-river-pier.json"), ...plan("encounters/battle-on-the-boat.json") } as FloorPlanInMetres)
  const at = { x: -1.4 * FEET_PER_METRE, y: -6.4 * FEET_PER_METRE }
  const mover = { id: "thalbern", name: "Thalbern", type: "pc", sheet, position: at }
  const foe = { id: "foe", name: "Bandit", type: "npc", statBlock: "bandit", position: { x: -5.8 * FEET_PER_METRE, y: 0 } }
  assert.ok(floor.water?.length)
  const moved = takeMove({ floor, mover, others: [foe], ask: { away: "foe" } })
  assert.ok(moved && moved.feet > 5)
  assert.equal(inWater(floor.water, moved.at), false)
  assert.ok(moved.path.every((point) => !inWater(floor.water, point)))
  // The same move on a floor with no water walks the whole 30 feet, out into the river.
  const dry = takeMove({ floor: { ...floor, water: undefined }, mover, others: [foe], ask: { away: "foe" } })
  assert.equal(dry?.feet, 30)
  assert.ok(inWater(floor.water, dry?.at as { x: number; y: number }))
})

test("a hero on the Mordava's boat is on dry ground, and the pier's deck is not water", () => {
  const floor = floorFromMetres({ ...plan("sets/realm-of-myr-mordava-river-pier.json"), ...plan("encounters/battle-on-the-boat.json") } as FloorPlanInMetres)
  for (const spot of [...floor.cast, ...floor.party]) assert.equal(inWater(floor.water, spot.at), false, spot.id)
  // Out in the river, past the bank, it is.
  assert.equal(inWater(floor.water, { x: 5.3 * FEET_PER_METRE, y: -14.4 * FEET_PER_METRE }), true)
})

test("swimming costs 1 extra foot for each foot moved in water", () => {
  // Lyra, Speed 30, bound for midstream at (40, 0): 10 feet of bank, then the water at 2 feet for each foot. Her last 20
  // feet of movement carry her 10 feet into it, to (20, 0), and she has spent all 30.
  const moved = takeMove({ floor: river(), mover: lyra, others: [], ask: { to: "midstream" } })
  assert.ok(moved && between(moved.at, { x: 20, y: 0 }) < 0.01)
  assert.equal(moved.feet, 30)
  // With Dash, 60 feet: 10 on the bank, and 50 spent swimming 25 feet, to (35, 0), short of midstream.
  const dashed = takeMove({ floor: river(), mover: lyra, others: [], ask: { to: "midstream" }, dash: true })
  assert.ok(dashed && between(dashed.at, { x: 35, y: 0 }) < 0.01)
  assert.equal(dashed.feet, 60)
})

test("a creature with a Swim Speed pays no extra in water", () => {
  // A Giant Frog, Speed 30 and Swim 30, goes the whole 30 feet toward midstream, to (30, 0).
  const frog = { id: "frog", name: "Giant Frog", type: "npc", statBlock: "giant-frog", position: { x: 0, y: 0 } }
  const moved = takeMove({ floor: river(), mover: frog, others: [], ask: { to: "midstream" } })
  assert.ok(moved && between(moved.at, { x: 30, y: 0 }) < 0.01)
  assert.equal(moved.feet, 30)
})

test("a move that is not bound for water stops at its edge, though a swimmer would not mind", () => {
  // Lyra bound for the far bank at (70, 0), across the river with no way round: she stops at the water's edge, 10 feet
  // off, a tenth of a foot short of it, and swims no part of it.
  const moved = takeMove({ floor: river(), mover: lyra, others: [], ask: { to: "far-bank" } })
  assert.ok(moved && moved.at.x > 9.5 && moved.at.x < 10)
  assert.equal(inWater(river().water, moved.at), false)
  // A frog on the same errand stops there too: it was not sent into the river.
  const frog = { id: "frog", name: "Giant Frog", type: "npc", statBlock: "giant-frog", position: { x: 0, y: 0 } }
  const hopped = takeMove({ floor: river(), mover: frog, others: [], ask: { to: "far-bank" } })
  assert.ok(hopped && hopped.at.x < 10)
  // Backing straight away from a foe stops at the edge, too: the move named no water.
  const bandit = { id: "bandit", name: "Bandit", type: "npc", statBlock: "bandit", position: { x: -20, y: 0 } }
  const backed = takeMove({ floor: river(), mover: lyra, others: [bandit], ask: { away: "bandit" } })
  assert.ok(backed && backed.at.x < 10 && backed.at.x > 9.5)
})

test("a creature in the water can be gone to, and one already swimming may swim back out", () => {
  // Reinhard at (30, 0) in the river: Lyra goes to within 5 feet of him, to (25, 0). That is 10 feet of bank and 15 of
  // water, 40 feet of movement, past her 30: she gets 10 feet along the bank and 10 into the water, to (20, 0).
  const reinhard = { id: "reinhard", name: "Reinhard", type: "npc", statBlock: "thug", position: { x: 30, y: 0 } }
  const moved = takeMove({ floor: river(), mover: lyra, others: [reinhard], ask: { to: "reinhard" } })
  assert.ok(moved && between(moved.at, { x: 20, y: 0 }) < 0.01)
  assert.equal(moved.feet, 30)
  // Lyra in the river at (30, 0), bound for the bank at (0, 0): 20 feet of water to its edge cost 40, past her 30. She
  // swims 15 feet, to (15, 0). One who sets out in water is not stopped at its edge.
  const swimmer = { ...lyra, position: { x: 30, y: 0 } }
  const out = takeMove({ floor: { ...river(), places: [{ id: "bank", label: "the bank", at: { x: 0, y: 0 } }] }, mover: swimmer, others: [], ask: { to: "bank" } })
  assert.ok(out && between(out.at, { x: 15, y: 0 }) < 0.01)
  assert.equal(out.feet, 30)
})

test("swimming in Difficult Terrain costs 2 extra for each foot, a total of 3", () => {
  // Water that is also rough: the floor in play holds a Web over the river. Here walkOver reads it directly.
  const ring = river().water as NonNullable<EncounterFloor["water"]>
  const rough = [{ shape: { kind: "rect" as const, x: 30, y: 0, halfWidth: 20, halfDepth: 100, turn: 0 }, cost: 2 }]
  const walked = walkOver([], { x: 0, y: 0 }, { x: 40, y: 0 }, 40, rough, undefined, { water: ring })
  // 10 on the bank, then 30 spent at 3 for each foot is 10 feet more: to (20, 0) and 40 spent.
  assert.ok(between(walked.at, { x: 20, y: 0 }) < 0.01)
  assert.equal(walked.used, 40)
})
