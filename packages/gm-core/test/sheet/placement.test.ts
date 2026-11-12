import assert from "node:assert/strict"
import { test } from "node:test"
import { type EncounterFloor, floorFromMetres, placeCharacters } from "../../src/sheet/placement"
import { FEET_PER_METRE } from "../../src/sheet/space"

// Every expected value below was worked out by hand, not copied from the function's output.

const close = (actual: number | undefined, expected: number) => assert.ok(actual !== undefined && Math.abs(actual - expected) < 1e-6, `${actual} is not ${expected}`)

test("a stage's floor plan is read in feet", () => {
  // 2 metres is 6.56168 feet. The stage's z is the floor's y. A solid with no height stays a wall to the ceiling.
  const floor = floorFromMetres({
    solids: [
      { kind: "rect", x: 2, z: -1, hw: 1, hd: 0.5, ry: 0.3, height: 1 },
      { kind: "circle", x: 0, z: 4, r: 0.5 },
    ],
    doors: [
      [
        { x: 1, z: 0 },
        { x: 3, z: 0 },
      ],
    ],
    places: [{ id: "gangway", label: "the gangway", x: 10, z: 0 }],
    cast: [{ id: "reinhard", name: "Reinhard", x: 2, z: 2 }],
    party: [{ id: "lyra", x: 0, z: 0 }],
    spare: [{ x: 1, z: 1 }],
  })
  const [crate, pillar] = floor.solids
  assert.ok(crate.kind === "rect" && pillar.kind === "circle")
  close(crate.x, 2 * FEET_PER_METRE)
  close(crate.y, -FEET_PER_METRE)
  close(crate.halfWidth, FEET_PER_METRE)
  close(crate.top, FEET_PER_METRE)
  assert.equal(crate.turn, 0.3)
  close(pillar.radius, 0.5 * FEET_PER_METRE)
  assert.equal(pillar.top, undefined)
  close(floor.doors[0][1].x, 3 * FEET_PER_METRE)
  close(floor.places[0].at.x, 10 * FEET_PER_METRE)
  assert.deepEqual([floor.cast[0].id, floor.party[0].id, floor.spare.length], ["reinhard", "lyra", 1])
})

test("an encounter places its characters from the floor", () => {
  const at = (x: number, y: number) => ({ x, y })
  // The staging holds Reinhard by id and the two premade heroes by first name. The party stands at Lyra's and
  // Poppen's spots, with one spare spot.
  const floor: EncounterFloor = {
    solids: [],
    doors: [],
    places: [],
    cast: [
      { id: "npcs-1", name: "Reinhard", at: at(20, 0) },
      { id: "lyra", name: "Lyra Silvanus", at: at(0, 0) },
      { id: "poppen", name: "Poppen Quickfoot", at: at(0, 10) },
    ],
    party: [
      { id: "lyra", at: at(0, 0) },
      { id: "poppen", at: at(0, 10) },
    ],
    spare: [at(-10, 0)],
  }
  type Placed = { id: string; name: string; type: string; position?: { x: number; y: number } }
  const hero = (id: string, name: string): Placed => ({ id, name, type: "pc" })
  const npc = (id: string, name: string): Placed => ({ id, name, type: "npc" })
  const where = (characters: { id: string; position?: { x: number; y: number } }[]) => Object.fromEntries(characters.map((c) => [c.id, c.position]))
  // The authored party: each premade on their own spot, whatever the order. Reinhard where he is staged. Silas is not
  // in the staging and has no position.
  assert.deepEqual(where(placeCharacters([hero("2", "Poppen Quickfoot"), hero("1", "Lyra Silvanus"), npc("npcs-1", "Reinhard"), npc("npcs-2", "Silas")], floor)), {
    "1": at(0, 0),
    "2": at(0, 10),
    "npcs-1": at(20, 0),
    "npcs-2": undefined,
  })
  // Thalbern is not staged here: Lyra keeps her spot, Thalbern takes Poppen's free one, and Branka the spare one.
  // Yeva is one more than the floor holds, and stands a space from the first of the party and off everyone else.
  const crowd = placeCharacters([hero("3", "Thalbern"), hero("1", "Lyra Silvanus"), hero("4", "Branka Stoneveil"), hero("5", "Yeva Softstep")], floor)
  assert.deepEqual(where(crowd.slice(0, 3)), { "3": at(0, 10), "1": at(0, 0), "4": at(-10, 0) })
  const yeva = crowd[3].position
  assert.ok(yeva)
  close(Math.hypot(yeva.x, yeva.y), 5)
  for (const other of crowd.slice(0, 3)) assert.ok(Math.hypot(yeva.x - (other.position?.x ?? 0), yeva.y - (other.position?.y ?? 0)) >= 5 - 1e-6)
  // A position from the encounter before is not kept.
  assert.equal(placeCharacters([{ ...npc("npcs-2", "Silas"), position: at(3, 3) }], floor)[0].position, undefined)
})
