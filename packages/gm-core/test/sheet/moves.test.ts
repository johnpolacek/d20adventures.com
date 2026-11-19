import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { mayHide, takeMove } from "../../src/sheet/moves"
import { type EncounterFloor, type FloorPlanInMetres, floorFromMetres } from "../../src/sheet/placement"
import type { Sheet } from "../../src/sheet/sheet"
import { between } from "../../src/sheet/space"

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
