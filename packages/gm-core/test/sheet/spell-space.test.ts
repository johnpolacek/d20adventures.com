import assert from "node:assert/strict"
import { test } from "node:test"
import type { Floor, Solid } from "../../src/sheet/space"
import { castInSpace } from "../../src/sheet/spell-space"
import { spellById } from "../../src/sheet/spells"

// Every expected value below was worked out by hand from the spells' SRD 5.2.1 ranges and areas.

const spell = (id: string) => {
  const found = spellById.get(id)
  assert.ok(found, id)
  return found
}
const open: Floor = { solids: [], doors: [] }
const who = (id: string, x: number, y = 0, type = "npc") => ({ id, name: id, type, statBlock: "bandit", position: { x, y } })
const lyra = who("lyra", 0, 0, "pc")

test("a spell reaches no farther than its range, and a touch no farther than 5 feet", () => {
  // Ray of Frost reaches 60 feet: a Bandit at 60 is in range, one at 70 is not.
  assert.deepEqual(castInSpace({ spell: spell("ray-of-frost"), caster: lyra, everyone: [lyra, who("bandit", 60)], named: ["bandit"], floor: open }), {
    targets: ["bandit"],
    cover: {},
    measured: false,
  })
  assert.deepEqual(castInSpace({ spell: spell("ray-of-frost"), caster: lyra, everyone: [lyra, who("bandit", 70)], named: ["bandit"], floor: open }).problem, {
    name: "Out Of Range",
    text: "lyra is 70 feet from bandit, out of Ray of Frost's range of 60 feet. The spell is not cast.",
  })
  // Magic Missile reaches 120 feet: of two named, the one at 130 is left out.
  assert.deepEqual(castInSpace({ spell: spell("magic-missile"), caster: lyra, everyone: [lyra, who("a", 100), who("b", 130)], named: ["a", "b"], floor: open }).targets, ["a"])
  // Cure Wounds is a touch: an ally 5 feet off, not one 10 feet off. The caster may always touch themself.
  const thalbern = (x: number) => who("thalbern", x, 0, "pc")
  assert.deepEqual(castInSpace({ spell: spell("cure-wounds"), caster: lyra, everyone: [lyra, thalbern(5)], named: ["thalbern"], floor: open }).targets, ["thalbern"])
  assert.equal(castInSpace({ spell: spell("cure-wounds"), caster: lyra, everyone: [lyra, thalbern(10)], named: ["thalbern"], floor: open }).problem?.name, "Out Of Reach")
  assert.deepEqual(castInSpace({ spell: spell("cure-wounds"), caster: lyra, everyone: [lyra], named: ["lyra"], floor: open }).targets, ["lyra"])
  // A caster with no position is not measured.
  assert.deepEqual(castInSpace({ spell: spell("ray-of-frost"), caster: { ...lyra, position: undefined }, everyone: [who("bandit", 700)], named: ["bandit"], floor: open }), {
    targets: ["bandit"],
    cover: {},
    measured: false,
  })
})

test("a spell does not pass total cover, and lesser cover is kept for the roll", () => {
  // A crate 4 feet across, 40 feet along the line to a Bandit at 50. Six feet high it hides all of a 6-foot Bandit.
  // Four feet high it hides 4 ÷ 6: half cover.
  const crate = (top: number): Solid => ({ kind: "rect", x: 40, y: 0, halfWidth: 2, halfDepth: 2, turn: 0, top })
  const shot = (top: number) => castInSpace({ spell: spell("ray-of-frost"), caster: lyra, everyone: [lyra, who("bandit", 50)], named: ["bandit"], floor: { solids: [crate(top)], doors: [] } })
  assert.equal(shot(6).problem?.name, "Total Cover")
  assert.deepEqual(shot(4), { targets: ["bandit"], cover: { bandit: "half" }, measured: false })
})

test("an area takes whoever stands in it", () => {
  // Burning Hands, a 15-foot cone from the edge of Lyra's 5-foot space, aimed at a Bandit 10 feet off. He is 7.5 feet
  // along it, where it is 3.75 feet to each side: Thalbern, 3 feet beside him, is caught, and Poppen, 6 feet beside
  // him, is not. Nor is the one 20 feet off, 17.5 along, or the one behind her.
  const fan = castInSpace({
    spell: spell("burning-hands"),
    caster: lyra,
    everyone: [lyra, who("bandit", 10), who("thalbern", 10, 3, "pc"), who("poppen", 10, 6, "pc"), who("far", 20), who("behind", -5)],
    named: ["bandit"],
    floor: open,
  })
  assert.deepEqual([fan.targets, fan.measured], [["bandit", "thalbern"], true])
  // With no one named it points at the nearest of the other side.
  assert.deepEqual(castInSpace({ spell: spell("burning-hands"), caster: lyra, everyone: [lyra, who("thalbern", 0, 8, "pc"), who("bandit", 10)], named: [], floor: open }).targets, ["bandit"])
  // Faerie Fire, a 20-foot cube within 60 feet, centred on the one named: 10 feet to each side of them.
  const fire = castInSpace({
    spell: spell("faerie-fire"),
    caster: lyra,
    everyone: [lyra, who("bandit", 30), who("edge", 39, 9), who("out", 41), who("thalbern", 25, -5, "pc")],
    named: ["bandit"],
    floor: open,
  })
  assert.deepEqual(fire.targets, ["bandit", "edge", "thalbern"])
  assert.equal(castInSpace({ spell: spell("faerie-fire"), caster: lyra, everyone: [lyra, who("bandit", 70)], named: ["bandit"], floor: open }).problem?.name, "Out Of Range")
  // Sleep takes the creatures of the caster's choice in a 5-foot sphere: those named who stand in it.
  const sleep = castInSpace({ spell: spell("sleep"), caster: lyra, everyone: [lyra, who("a", 30), who("b", 33), who("c", 34), who("d", 30, 10)], named: ["a", "b", "d"], floor: open })
  assert.deepEqual(sleep.targets, ["a", "b"])
  // A wall between the cone's caster and one in it keeps them out of it.
  const wall: Solid = { kind: "rect", x: 6, y: 3, halfWidth: 0.5, halfDepth: 1.5, turn: 0 }
  const walled = castInSpace({
    spell: spell("burning-hands"),
    caster: lyra,
    everyone: [lyra, who("bandit", 10), who("thalbern", 10, 3, "pc")],
    named: ["bandit"],
    floor: { solids: [wall], doors: [] },
  })
  assert.deepEqual(walled.targets, ["bandit"])
})
