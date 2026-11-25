import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { takeMove, takeTeleport } from "../../src/sheet/moves"
import { type EncounterFloor, type FloorPlanInMetres, floorFromMetres } from "../../src/sheet/placement"
import { roomSpot } from "../../src/sheet/room"
import type { Sheet } from "../../src/sheet/sheet"
import { between, FEET_PER_METRE, type Point, type Solid } from "../../src/sheet/space"

// A room 20 feet by 12, its inside from (0, 0) to (20, 12), with walls a foot thick and a doorway 3 feet wide in the
// middle of its north wall, from x 8.5 to 11.5. Outside, the yard is open ground.
const wall = (x: number, y: number, halfWidth: number, halfDepth: number): Solid => ({ kind: "rect", x, y, halfWidth, halfDepth, turn: 0 })
const room = (): EncounterFloor => ({
  solids: [wall(10, -0.5, 11, 0.5), wall(-0.5, 6, 0.5, 7), wall(20.5, 6, 0.5, 7), wall(4.25, 12.5, 4.75, 0.5), wall(15.75, 12.5, 4.75, 0.5)],
  doors: [[{ x: 10, y: 11 }, { x: 10, y: 14 }]],
  places: [
    { id: "hearth", label: "the hearth", at: { x: 10, y: 3 } },
    { id: "door", label: "the door", at: { x: 10, y: 12.5 } },
    { id: "yard", label: "the yard", at: { x: 10, y: 22 } },
  ],
  cast: [],
  party: [],
  spare: [],
})

// Each spot keeps 2 feet clear of the walls: most of half a Medium creature's 5-foot space.
const near = (a: Point | undefined, b: Point, feet = 1.01) => assert.ok(a && between(a, b) <= feet, `${JSON.stringify(a)} is not within ${feet} feet of ${JSON.stringify(b)}`)

test("a corner is the room's nearest to the mover, and the farthest from one named", () => {
  const floor = room()
  const mover = { x: 15, y: 9 }
  near(roomSpot({ floor, from: mover, spot: "corner", mover }), { x: 18, y: 10 })
  near(roomSpot({ floor, from: mover, spot: "corner", mover, awayFrom: { x: 16, y: 8 } }), { x: 2, y: 2 })
})

test("a corner is another than the one they stand in", () => {
  const floor = room()
  const mover = { x: 18, y: 10 }
  const corner = roomSpot({ floor, from: mover, spot: "corner", mover })
  assert.ok(corner && between(corner, mover) >= 3)
})

test("a corner someone holds is passed over for the next nearest", () => {
  const floor = room()
  const mover = { x: 15, y: 9 }
  near(roomSpot({ floor, from: mover, spot: "corner", mover, taken: [{ x: 18, y: 10 }] }), { x: 18, y: 2 })
})

test("a wall, the far side and the middle of a room", () => {
  const floor = room()
  const mover = { x: 6, y: 5 }
  // The south wall is 5 feet off, the west 6: against the south one, 2 feet clear of it.
  near(roomSpot({ floor, from: mover, spot: "wall", mover }), { x: 6, y: 2 })
  near(roomSpot({ floor, from: mover, spot: "far side", mover }), { x: 18, y: 10 })
  near(roomSpot({ floor, from: mover, spot: "middle", mover }), { x: 10, y: 6 }, 1.5)
})

test("a room ends at its doorway, and a place in the doorway is read as inside", () => {
  const floor = room()
  const mover = { x: 10, y: 6 }
  const corner = roomSpot({ floor, from: floor.places[1].at, spot: "corner", mover: { x: 6, y: 9 } })
  near(corner, { x: 2, y: 10 })
})

test("open ground has no corner", () => {
  const floor = room()
  assert.equal(roomSpot({ floor, from: { x: 10, y: 22 }, spot: "corner", mover: { x: 10, y: 22 } }), undefined)
})

// Covert Cargo: Lyra in the tug's saloon, a room about 4 m across between walls at x 3.06 and 7.34 m, its curved front
// at about z 2.8 m and its aft bulkhead at z -4.5 m.
const plan = (path: string) => JSON.parse(readFileSync(new URL(`../../../stage/src/plans/${path}`, import.meta.url), "utf8"))
const tug = (): EncounterFloor => floorFromMetres({ cast: [], party: [], spare: [], ...plan("sets/realm-of-myr-mordava-river-pier.json") } as FloorPlanInMetres)
const sheet = (JSON.parse(readFileSync(new URL("../../../../content/settings/realm-of-myr/adventures/covert-cargo/characters/1749159962941.json", import.meta.url), "utf8")) as { sheet: Sheet }).sheet
const inSaloon = (at: Point) => {
  const x = at.x / FEET_PER_METRE
  const z = at.y / FEET_PER_METRE
  return x > 3.06 && x < 7.34 && z > -4.5 && z < 2.8
}

test("Lyra asked to the corner of the cabin walks to one, and stays in it", () => {
  const floor = tug()
  const saloon = floor.places.find((place) => place.id === "saloon")?.at as Point
  const lyra = { id: "lyra", name: "Lyra", type: "pc", sheet, position: saloon }
  const moved = takeMove({ floor, mover: lyra, others: [], ask: { spot: "corner" } })
  assert.ok(moved)
  assert.ok(moved.feet >= 5, `she walked ${moved.feet} feet`)
  assert.ok(inSaloon(moved.at), JSON.stringify(moved.at))
  // From the cabin door too, the cabin's corner, not the deck's.
  const fromDoor = takeMove({ floor, mover: lyra, others: [], ask: { to: "cabinDoor", spot: "far side" } })
  assert.ok(fromDoor && inSaloon(fromDoor.at), JSON.stringify(fromDoor?.at))
})

test("a spot no room holds leaves the move as it was", () => {
  const floor = room()
  const lyra = { id: "lyra", name: "Lyra", type: "pc", sheet, position: { x: 10, y: 6 } }
  const moved = takeMove({ floor, mover: lyra, others: [], ask: { to: "yard", spot: "corner" } })
  assert.ok(moved)
  assert.ok(moved.feet > 0)
  // A teleport takes the spot too.
  const leap = takeTeleport({ floor, mover: lyra, others: [], ask: { spot: "corner" }, feet: 30 })
  assert.ok(leap && between(leap.at, { x: 10, y: 6 }) > 5)
})
