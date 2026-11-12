import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { attacksOf, meleeReachOf } from "../../src/sheet/attack"
import type { Sheet } from "../../src/sheet/sheet"
import {
  attackReach,
  caughtIn,
  coverBetween,
  coverBonus,
  distance,
  FEET_PER_METRE,
  type Floor,
  feet,
  greaterCover,
  inArea,
  metres,
  movementBudget,
  movementBudgetOf,
  moveToward,
  opportunityAttackers,
  pushed,
  rangedInCloseCombat,
  routeThrough,
  type Solid,
  sizeOf,
  solidAt,
  spaceOf,
  speedOf,
  standingRoom,
  stopShortFor,
  type Watcher,
  walk,
  walkOver,
  within,
} from "../../src/sheet/space"

// Every expected value below was worked out by hand from the SRD 5.2.1 rules, not copied from the function's output.

const sheet = JSON.parse(readFileSync(new URL("../../../../content/settings/realm-of-myr/adventures/the-midnight-summons/characters/thalbern.json", import.meta.url), "utf8")).sheet as Sheet
// Thalbern, a level 1 human Ranger: Speed 30, a Longbow, a Shortsword and a Dagger.
const thalbern = { id: "thalbern", name: "Thalbern", type: "pc", sheet, hitPoints: 11 }
const owlbear = { id: "owlbear", name: "Owlbear", type: "npc", statBlock: "owlbear", hitPoints: 59 }
const hillGiant = { id: "giant", name: "Hill Giant", type: "npc", statBlock: "hill-giant", hitPoints: 105 }
const o = { x: 0, y: 0 }
const at = (x: number, y: number) => ({ x, y })
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} is not ${expected}`)

test("a creature's space is its size's, and distance reads as a grid would", () => {
  assert.deepEqual([spaceOf("Tiny"), spaceOf("Small"), spaceOf(), spaceOf("Large"), spaceOf("Huge"), spaceOf("Gargantuan")], [2.5, 5, 5, 10, 15, 20])
  assert.equal(sizeOf(thalbern), "Medium")
  assert.equal(sizeOf(owlbear), "Large")
  // Two Medium creatures 5 feet apart, and 3 across by 4 up.
  assert.equal(distance({ at: o }, { at: at(5, 0) }), 5)
  assert.equal(distance({ at: o }, { at: at(3, 4) }), 5)
  // A Large creature 7.5 feet from a Medium one: 7.5 − 2.5 = 5. A Huge one 10 feet from a Large one: 10 − 5 − 2.5 = 2.5.
  assert.equal(distance({ at: o, size: "Large" }, { at: at(7.5, 0) }), 5)
  assert.equal(distance({ at: o, size: "Huge" }, { at: at(10, 0), size: "Large" }), 2.5)
  // A Medium creature 1 foot from a Large one's centre is inside its space: 1 − 2.5 is below 0.
  assert.equal(distance({ at: o, size: "Large" }, { at: at(1, 0) }), 0)
  // A Tiny creature is measured as if it filled its square: 5 feet away.
  assert.equal(distance({ at: o, size: "Tiny" }, { at: at(5, 0) }), 5)
  // Within 5 feet, half a foot either way: 5.4 is within, 5.6 is not. One who walked up and stopped 3.6 feet off is.
  assert.equal(within({ at: o }, { at: at(5.4, 0) }, 5), true)
  assert.equal(within({ at: o }, { at: at(5.6, 0) }, 5), false)
  assert.equal(within({ at: o }, { at: at(3.6, 0) }, 5), true)
})

test("an attack reaches, shoots at normal or long range, or cannot be made", () => {
  // A Spear: reach 5, thrown 20/60.
  const spear = { reach: 5, range: { normal: 20, long: 60 } }
  assert.equal(attackReach({ distance: 5, ...spear }), "reach")
  assert.equal(attackReach({ distance: 15, ...spear }), "normal")
  assert.equal(attackReach({ distance: 20, ...spear }), "normal")
  assert.equal(attackReach({ distance: 40, ...spear }), "long")
  assert.equal(attackReach({ distance: 60, ...spear }), "long")
  assert.equal(attackReach({ distance: 70, ...spear }), "out")
  // A Glaive reaches 10 and no farther. A single range of 30 has no long range.
  assert.equal(attackReach({ distance: 10, reach: 10 }), "reach")
  assert.equal(attackReach({ distance: 11, reach: 10 }), "out")
  assert.equal(attackReach({ distance: 31, range: { normal: 30 } }), "out")
})

test("a weapon's and a stat block attack's reach and range come from the SRD data", () => {
  // The Reach property adds 5 to the 5 every creature has. A Dagger is Thrown 20/60. A Longbow is Ammunition 150/600.
  const reaches = (character: Parameters<typeof attacksOf>[0]) =>
    Object.fromEntries(attacksOf(character).map(({ id, reach, range }) => [id, { ...(reach ? { reach } : {}), ...(range ? { range } : {}) }]))
  const armed = reaches({ ...thalbern, sheet: { ...sheet, weapons: ["glaive", "dagger", "longbow"] } })
  assert.deepEqual(armed, { glaive: { reach: 10 }, dagger: { reach: 5, range: { normal: 20, long: 60 } }, longbow: { range: { normal: 150, long: 600 } }, "unarmed-strike": { reach: 5 } })
  // A Hill Giant's Tree Club reaches 10 and its Trash Lob throws 60/240. An Ogre's Javelin is melee or ranged.
  assert.deepEqual(reaches(hillGiant), { "tree-club": { reach: 10 }, "trash-lob": { range: { normal: 60, long: 240 } } })
  assert.deepEqual(reaches({ ...owlbear, statBlock: "ogre" }).javelin, { reach: 5, range: { normal: 30, long: 120 } })
  assert.deepEqual(reaches(owlbear).rend, { reach: 5 })
  // Reach for Opportunity Attacks is the longest melee reach: Thalbern's Shortsword and Dagger reach 5, a Glaive 10.
  assert.equal(meleeReachOf(thalbern), 5)
  assert.equal(meleeReachOf({ ...thalbern, sheet: { ...sheet, weapons: ["glaive"] } }), 10)
  assert.equal(meleeReachOf(hillGiant), 10)
})

test("a ranged attack has Disadvantage beside an enemy who can see the attacker and is not Incapacitated", () => {
  const goblin = { at: at(5, 0), hostile: true, seesAttacker: true, incapacitated: false }
  assert.equal(rangedInCloseCombat({ at: o }, [goblin]), true)
  assert.equal(rangedInCloseCombat({ at: o }, [{ ...goblin, incapacitated: true }]), false)
  assert.equal(rangedInCloseCombat({ at: o }, [{ ...goblin, seesAttacker: false }]), false)
  assert.equal(rangedInCloseCombat({ at: o }, [{ ...goblin, hostile: false }]), false)
  assert.equal(rangedInCloseCombat({ at: o }, [{ ...goblin, at: at(10, 0) }]), false)
  // A Large Owlbear 7.5 feet off is within 5 feet: 7.5 − 2.5 = 5.
  assert.equal(rangedInCloseCombat({ at: o }, [{ ...goblin, at: at(7.5, 0), size: "Large" }]), true)
})

test("a turn's movement: Speed, Dash, standing from Prone, Slow and Exhaustion", () => {
  assert.equal(speedOf(thalbern), 30)
  assert.equal(speedOf(owlbear), 40)
  assert.equal(speedOf({ type: "pc" }), undefined)
  assert.equal(movementBudget({ speed: 30 }), 30)
  // Dash adds the Speed again: 30 + 30. Standing costs half: 30 − 15. Both: 30 + 30 − 15.
  assert.equal(movementBudget({ speed: 30, dash: true }), 60)
  assert.equal(movementBudget({ speed: 30, stands: true }), 15)
  assert.equal(movementBudget({ speed: 30, dash: true, stands: true }), 45)
  // Half of 35, rounded down, is 17: 35 − 17 = 18.
  assert.equal(movementBudget({ speed: 35, stands: true }), 18)
  // Slow takes 10 before Dash doubles it: (30 − 10) × 2. Exhaustion 2 takes 10: 30 − 10. A Speed of 5 slowed is 0.
  assert.equal(movementBudget({ speed: 30, slowed: true, dash: true }), 40)
  assert.equal(movementBudget({ speed: 30, exhaustion: 2 }), 20)
  assert.equal(movementBudget({ speed: 5, slowed: true, dash: true }), 0)
  assert.equal(movementBudget({ speed: 30, cannotMove: true, dash: true }), 0)
  // Read from characters: a Grappled hero's Speed is 0, an Owlbear Dashes 40 + 40, Exhaustion 1 takes 5 from 30.
  assert.equal(movementBudgetOf({ ...thalbern, conditions: [{ id: "grappled" }] }), 0)
  assert.equal(movementBudgetOf(owlbear, { dash: true }), 80)
  assert.equal(movementBudgetOf({ ...thalbern, conditions: [{ id: "exhaustion", level: 1 }] }), 25)
})

test("moving toward a point stops at the budget or short of it, and Push drives straight away", () => {
  // 20 feet off, stopping 5 short: 15 feet used.
  assert.deepEqual(moveToward(o, at(20, 0), 30, 5), { at: at(15, 0), used: 15 })
  // 50 feet off along 3-4-5, with 25 feet: halfway, at (15, 20).
  assert.deepEqual(moveToward(o, at(30, 40), 25), { at: at(15, 20), used: 25 })
  // Already within 5 of a point 3 feet off: no move.
  assert.deepEqual(moveToward(o, at(3, 0), 30, 5), { at: o, used: 0 })
  // A Medium creature closing to 5 feet of a Large one stops 5 + 2.5 from its centre, then stands 5 feet off.
  assert.equal(stopShortFor("Medium", "Large"), 7.5)
  const closed = moveToward(o, at(30, 0), 30, stopShortFor("Medium", "Large"))
  assert.equal(distance({ at: closed.at }, { at: at(30, 0), size: "Large" }), 5)
  // Pushed 10 feet: from (5, 0) to (15, 0), and from (3, 4) along 3-4-5 to (3 + 6, 4 + 8).
  assert.deepEqual(pushed(at(5, 0), o, 10), at(15, 0))
  assert.deepEqual(pushed(at(3, 4), o, 10), at(9, 12))
  assert.deepEqual(pushed(o, o, 10), o)
})

test("an Opportunity Attack falls to an enemy whose reach the mover leaves", () => {
  const goblin: Watcher & { id: string } = { id: "goblin", at: o, reach: 5, hostile: true, canReact: true, seesMover: true }
  const ids = (found: { id: string }[]) => found.map((watcher) => watcher.id)
  // Starting 5 feet off and walking to 30: it leaves reach.
  assert.deepEqual(ids(opportunityAttackers({ from: at(5, 0), to: at(30, 0) }, [goblin])), ["goblin"])
  // Disengage, a shove and a Teleport provoke nothing.
  assert.deepEqual(opportunityAttackers({ from: at(5, 0), to: at(30, 0), disengaged: true }, [goblin]), [])
  assert.deepEqual(opportunityAttackers({ from: at(5, 0), to: at(30, 0), forced: true }, [goblin]), [])
  assert.deepEqual(opportunityAttackers({ from: at(5, 0), to: at(30, 0), teleport: true }, [goblin]), [])
  // Stepping around from (5, 0) to (0, 4) stays within 5 feet. Walking in from 20 and stopping at 5 does not leave either.
  assert.deepEqual(opportunityAttackers({ from: at(5, 0), to: at(0, 4) }, [goblin]), [])
  assert.deepEqual(opportunityAttackers({ from: at(20, 0), to: at(5, 0) }, [goblin]), [])
  // Passing 3 feet from the goblin on the way from (−20, 3) to (20, 3): in reach mid-path, out at the end.
  assert.deepEqual(ids(opportunityAttackers({ from: at(-20, 3), to: at(20, 3) }, [goblin])), ["goblin"])
  // Passing 10 feet off never comes within reach.
  assert.deepEqual(opportunityAttackers({ from: at(-20, 10), to: at(20, 10) }, [goblin]), [])
  // An ally, one who has spent its Reaction, and one who cannot see the mover take none.
  assert.deepEqual(
    opportunityAttackers({ from: at(5, 0), to: at(30, 0) }, [
      { ...goblin, hostile: false },
      { ...goblin, canReact: false },
      { ...goblin, seesMover: false },
    ]),
    []
  )
  // A Huge Hill Giant reaches 10: a Medium mover 15 feet from its centre is 15 − 5 = 10 away, so walking off leaves reach.
  const giant = { ...goblin, id: "giant", size: "Huge" as const, reach: 10 }
  assert.deepEqual(ids(opportunityAttackers({ from: at(15, 0), to: at(40, 0) }, [giant])), ["giant"])
})

test("areas of effect: Sphere, Cylinder and Emanation by radius", () => {
  const sphere = { shape: "sphere" as const, size: 20 }
  // 12-16-20: exactly on the edge. (15, 15) is about 21.2 feet off. The origin is inside.
  assert.equal(inArea(sphere, o, o, at(12, 16)), true)
  assert.equal(inArea(sphere, o, o, at(15, 15)), false)
  assert.equal(inArea(sphere, o, o, o), true)
  // A Cylinder's height is not read on the flat plane.
  const cylinder = { shape: "cylinder" as const, size: 10, height: 40 }
  assert.equal(inArea(cylinder, o, o, at(0, 10)), true)
  assert.equal(inArea(cylinder, o, o, at(0, 11)), false)
  // A 10-foot Emanation from a Large creature: 10 + 10 / 2 = 15 feet from its centre. Its origin is not caught.
  const emanation = { shape: "emanation" as const, size: 10 }
  assert.equal(inArea(emanation, o, o, at(15, 0), spaceOf("Large")), true)
  assert.equal(inArea(emanation, o, o, at(15.5, 0), spaceOf("Large")), false)
  assert.equal(inArea(emanation, o, o, o, spaceOf("Large")), false)
  assert.equal(inArea(emanation, o, o, at(11, 0)), false)
})

test("areas of effect: Cube, Cone and Line toward a point", () => {
  const east = at(10, 0)
  // A 15-foot Cube from a point on its near face: 15 feet out, 7.5 to each side. Behind the face is outside.
  const cube = { shape: "cube" as const, size: 15 }
  assert.equal(inArea(cube, o, east, at(15, 0)), true)
  assert.equal(inArea(cube, o, east, at(7.5, 7.5)), true)
  assert.equal(inArea(cube, o, east, at(7.5, 8)), false)
  assert.equal(inArea(cube, o, east, at(16, 0)), false)
  assert.equal(inArea(cube, o, east, at(-1, 0)), false)
  // Thunderwave from a Medium caster: the Cube starts at the edge of its space, 2.5 + 15 = 17.5 out, and not on the caster.
  assert.equal(inArea(cube, o, east, at(17.5, 0), 5), true)
  assert.equal(inArea(cube, o, east, at(18, 0), 5), false)
  assert.equal(inArea(cube, o, east, o, 5), false)
  // A 15-foot Cone is 10 wide 10 feet along, so 5 to each side: (10, 5) is on its edge and (10, 5.1) outside.
  const cone = { shape: "cone" as const, size: 15 }
  assert.equal(inArea(cone, o, east, at(10, 5)), true)
  assert.equal(inArea(cone, o, east, at(10, 5.1)), false)
  assert.equal(inArea(cone, o, east, at(15.5, 0)), false)
  assert.equal(inArea(cone, o, east, o), false)
  // Aimed northeast, (7, 7) is on its axis, and (10, 0) is 7.07 along and 7.07 aside, past the 3.54 the Cone is there.
  assert.equal(inArea(cone, o, at(1, 1), at(7, 7)), true)
  assert.equal(inArea(cone, o, at(1, 1), at(10, 0)), false)
  // A 60-foot Line is 5 feet wide unless it says: 2.5 to each side. A 10-foot-wide one is 5 to each side.
  const line = { shape: "line" as const, size: 60 }
  const north = at(0, 60)
  assert.equal(inArea(line, o, north, at(2.5, 30)), true)
  assert.equal(inArea(line, o, north, at(2.6, 30)), false)
  assert.equal(inArea(line, o, north, at(0, 60)), true)
  assert.equal(inArea(line, o, north, at(0, 61)), false)
  assert.equal(inArea({ ...line, width: 10 }, o, north, at(5, 30)), true)
  // With no direction, a directed area covers nothing.
  assert.equal(inArea(cone, o, o, at(5, 0)), false)
})

test("a creature is caught in an area when its centre is inside", () => {
  // A Fireball's 20-foot Sphere centred at (30, 0).
  const creatures = [
    { id: "near", at: at(30, 0) },
    { id: "edge", at: at(50, 0) },
    { id: "far", at: at(51, 0) },
    // A Large creature whose edge is in the Sphere but whose centre, 24 feet off, is not.
    { id: "large", at: at(30, 24), size: "Large" as const },
  ]
  assert.deepEqual(
    caughtIn({ shape: "sphere", size: 20 }, at(30, 0), at(30, 0), creatures).map((creature) => creature.id),
    ["near", "edge"]
  )
})

test("feet and metres", () => {
  assert.equal(FEET_PER_METRE, 3.28084)
  assert.equal(feet(1), 3.28084)
  // 30 / 3.28084 is about 9.144 metres.
  close(metres(30), 9.144)
  close(metres(feet(7)), 7)
})

// A room for the tests below. A wall runs north to south at x = 20, from y = -20 to y = 20, a foot thick, to the
// ceiling. Its doorway is around its north end: a point just inside at (15, 25) and one just outside at (25, 25). A
// crate 4 feet high sits at (40, 0), 2 feet to each side.
const wall: Solid = { kind: "rect", x: 20, y: 0, halfWidth: 0.5, halfDepth: 20, turn: 0 }
const crate: Solid = { kind: "rect", x: 40, y: 0, halfWidth: 2, halfDepth: 2, turn: 0, top: 4 }
const room: Floor = { solids: [wall, crate], doors: [[at(15, 25), at(25, 25)]] }

test("a walk stops at the first solid thing, and goes round by a doorway", () => {
  assert.equal(solidAt(room.solids, at(20, 5)), wall)
  assert.equal(solidAt(room.solids, at(20, 21)), undefined)
  // A pillar 3 feet across, turned or not, is a circle.
  assert.ok(solidAt([{ kind: "circle", x: 0, y: 0, radius: 1.5 }], at(1, 0)))
  // Toward (30, 0) with 60 feet: the wall's near face is at 19.5. Standing on the face is not inside it, and the next
  // half foot is: the walk stops at 19.5.
  const stopped = walkOver(room.solids, o, at(30, 0), 60)
  assert.deepEqual([stopped.at, stopped.used, stopped.blocked], [at(19.5, 0), 19.5, true])
  // With nothing in the way the feet run out first: 10 of the 15 to (0, 15).
  assert.deepEqual(walkOver(room.solids, o, at(0, 15), 10), { at: at(0, 10), used: 10, blocked: false })
  // The way round: to the inside of the doorway, through it, and on.
  assert.deepEqual(routeThrough(room, o, at(30, 10)), [at(15, 25), at(25, 25), at(30, 10)])
  assert.deepEqual(routeThrough(room, o, at(10, 10)), [at(10, 10)])
  // A wall thinner than any step is still a wall: one 0.2 feet thick, turned 45°, across the way from the origin to
  // (10, 10), stops the walk at its face, √50 less 0.1 along, and is total cover.
  const thin: Solid = { kind: "rect", x: 5, y: 5, halfWidth: 10, halfDepth: 0.1, turn: Math.PI / 4 }
  const crossed = walkOver([thin], o, at(10, 10), 60)
  assert.equal(crossed.blocked, true)
  close(crossed.used, Math.sqrt(50) - 0.1)
  assert.equal(coverBetween([thin], { at: o }, { at: at(10, 10) }), "total")
  // It runs from the north-east to the south-west of (5, 5). Walking along beside it, 1.4 feet off, touches nothing.
  assert.equal(walkOver([thin], at(0, 8), at(8, 0), 60).blocked, false)
  // A way round may take several legs. A second wall, from x = 10 to 40 at y = 30, closes the doorway's far side:
  // the way goes on east by the waypoint at (45, 25) and back by the one at (45, 35), then west to the goal. The
  // doorway's far point lies on the straight leg east, so it is not a stop of its own.
  const shut: Solid = { kind: "rect", x: 25, y: 30, halfWidth: 15, halfDepth: 0.5, turn: 0 }
  const maze: Floor = { solids: [wall, shut], doors: [[at(15, 25), at(25, 25)]], waypoints: [at(45, 25), at(45, 35)] }
  assert.deepEqual(routeThrough(maze, o, at(30, 40)), [at(15, 25), at(45, 25), at(45, 35), at(30, 40)])
  assert.equal(routeThrough({ ...maze, waypoints: [] }, o, at(30, 40)), undefined)
  assert.equal(routeThrough({ solids: [wall], doors: [] }, o, at(30, 0)), undefined)
  // 30 feet of that way: √(15² + 25²) = 29.155 to the doorway, and the 0.845 left over of the 10 through it.
  const round = walk(room, o, at(30, 10), 30)
  close(round.used, 30)
  close(round.at.x, 15 + (30 - Math.hypot(15, 25)))
  assert.equal(round.at.y, 25)
  assert.equal(round.path.length, 2)
  // With no way round, the walker goes as far as the wall.
  assert.deepEqual(walk({ solids: [wall], doors: [] }, o, at(30, 0), 60).at, at(19.5, 0))
})

test("a walker closes to reach of a creature, and stands beside whoever is there", () => {
  // Closing with someone 20 feet off stops 5 short: 15 feet walked.
  assert.deepEqual(walk({ solids: [], doors: [] }, o, at(20, 0), 30, { stopShort: 5 }), { at: at(15, 0), used: 15, path: [at(15, 0)] })
  // Already within 5 feet: no step is taken.
  assert.deepEqual(walk({ solids: [], doors: [] }, o, at(4, 0), 30, { stopShort: 5 }), { at: o, used: 0, path: [] })
  // A spot someone stands on is not taken: the walker from the west ends 5 feet west of it.
  const beside = standingRoom([], [at(10, 0)], o, at(10, 0))
  close(beside.x, 5)
  close(beside.y, 0)
  assert.deepEqual(standingRoom([], [at(30, 0)], o, at(10, 0)), at(10, 0))
})

test("cover is read from what stands between the two, by its height", () => {
  const archer = { at: at(25, 0) }
  // The 4-foot crate in front of a 6-foot target hides 4 ÷ 6 of them: half cover. Against a 3.5-foot Small target it
  // is as tall as they are: total cover.
  assert.equal(coverBetween(room.solids, archer, { at: at(45, 0) }), "half")
  assert.equal(coverBetween(room.solids, archer, { at: at(45, 0), size: "Small" }), "total")
  // A 5-foot crate hides 5 ÷ 6: three-quarters cover.
  assert.equal(coverBetween([{ ...crate, top: 5 }], archer, { at: at(45, 0) }), "three-quarters")
  // The one who stands at the crate shoots over it: it is nearer them than the target.
  assert.equal(coverBetween(room.solids, { at: at(45, 0) }, archer), "none")
  // A wall to the ceiling is total cover from either side, and nothing between is none.
  assert.equal(coverBetween(room.solids, { at: o }, archer), "total")
  assert.equal(coverBetween(room.solids, archer, { at: o }), "total")
  assert.equal(coverBetween(room.solids, archer, { at: at(25, 15) }), "none")
  // Another creature on the line is half cover. One beside the line is not.
  assert.equal(coverBetween([], { at: o }, { at: at(30, 0) }, [{ at: at(15, 1) }]), "half")
  assert.equal(coverBetween([], { at: o }, { at: at(30, 0) }, [{ at: at(15, 6) }]), "none")
  // Only the greater cover counts. Half adds 2 to Armor Class and Dexterity saves, three-quarters 5.
  assert.equal(greaterCover("half", "three-quarters"), "three-quarters")
  assert.deepEqual([coverBonus("none"), coverBonus("half"), coverBonus("three-quarters"), coverBonus("total")], [0, 2, 5, 0])
})
