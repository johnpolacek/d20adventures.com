import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import type { Sheet } from "../../src/sheet/sheet"
import {
  attackReach,
  attackReachOf,
  caughtIn,
  distance,
  FEET_PER_METRE,
  feet,
  inArea,
  meleeReachOf,
  metres,
  movementBudget,
  movementBudgetOf,
  moveToward,
  opportunityAttackers,
  pushed,
  rangedInCloseCombat,
  sizeOf,
  spaceOf,
  speedOf,
  statBlockAttackReach,
  stopShortFor,
  type Watcher,
  weaponReach,
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
  assert.deepEqual(weaponReach("glaive"), { reach: 10 })
  assert.deepEqual(weaponReach("dagger"), { reach: 5, range: { normal: 20, long: 60 } })
  assert.deepEqual(weaponReach("longbow"), { range: { normal: 150, long: 600 } })
  assert.deepEqual(weaponReach("unarmed-strike"), { reach: 5 })
  assert.deepEqual(weaponReach("chain-mail"), {})
  // A Hill Giant's Tree Club reaches 10 and its Trash Lob throws 60/240. An Ogre's Javelin is melee or ranged.
  assert.deepEqual(statBlockAttackReach("hill-giant", "tree-club"), { reach: 10 })
  assert.deepEqual(statBlockAttackReach("hill-giant", "trash-lob"), { range: { normal: 60, long: 240 } })
  assert.deepEqual(statBlockAttackReach("ogre", "javelin"), { reach: 5, range: { normal: 30, long: 120 } })
  assert.deepEqual(attackReachOf(thalbern, "longbow"), { range: { normal: 150, long: 600 } })
  assert.deepEqual(attackReachOf(owlbear, "rend"), { reach: 5 })
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
