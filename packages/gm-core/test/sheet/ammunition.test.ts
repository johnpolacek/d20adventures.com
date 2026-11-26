import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { afterFight, attackStockRuling, carriedCount, equippedCount, stockWords, withAttackSpent } from "../../src/sheet/ammunition"
import { attacksOf } from "../../src/sheet/attack"
import { attackRequirement, type InScene } from "../../src/sheet/attack-roll"
import { type Sheet, sheetSchema } from "../../src/sheet/sheet"

// Every expected count below was worked out by hand from the SRD 5.2.1 rules (Ammunition and Thrown properties, and
// the Ammunition table) and from each hero's equipment as Covert Cargo lists it, not copied from the functions' output.

type Hero = InScene & { type: string; equipment: { name: string; description?: string }[] }
const hero = (file: string): Hero => {
  const read = JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/covert-cargo/characters/${file}`, import.meta.url), "utf8")) as Hero
  return { ...read, type: "pc" }
}
// Poppen Quickfoot, a level 1 Rogue: "Two Daggers", a Sling and a "Pouch with 20 Sling Bullets".
const poppen = hero("1749307435667.json")
// Thalbern, a level 1 Ranger: a Longbow, a "Quiver" "filled with arrows", and one "Dagger".
const thalbern = hero("thalbern.json")
const at = (x: number, y = 0) => ({ x, y })
const bandit = { id: "bandit", name: "Bandit", type: "npc", statBlock: "bandit", position: at(15) } as InScene & { type: string }
const floor = { solids: [], doors: [] }
const attack = (who: Hero, id: string) => {
  const found = attacksOf(who).find((entry) => entry.id === id)
  assert.ok(found, `${who.name} has no ${id}`)
  return found
}

test("what a hero carries is counted from the equipment's names", () => {
  assert.equal(equippedCount(poppen, "dagger"), 2) // "Two Daggers"
  assert.equal(equippedCount(poppen, "bullets-sling"), 20) // "Pouch with 20 Sling Bullets"
  assert.equal(equippedCount(thalbern, "dagger"), 1) // "Dagger"
  assert.equal(equippedCount(thalbern, "arrows"), 20) // a Quiver holds 20 Arrows
  const named = (...names: string[]) => ({ equipment: names.map((name) => ({ name })) })
  assert.equal(equippedCount(named("A pair of daggers"), "dagger"), 2)
  assert.equal(equippedCount(named("5 Javelins"), "javelin"), 5)
  assert.equal(equippedCount(named("Javelins"), "javelin"), 2)
  assert.equal(equippedCount(named("Quiver of 12 arrows"), "arrows"), 12)
  assert.equal(equippedCount(named("A quiver of arrows"), "arrows"), 20)
  // Named nowhere: the one the sheet lists, and one bundle of ammunition (Bolts come 20 to a case).
  assert.equal(equippedCount(named("Rope"), "handaxe"), 1)
  assert.equal(equippedCount(named("Rope"), "bolts"), 20)
})

test("a saved hero with no stock reads its equipment, and a stock still parses on the sheet", () => {
  assert.equal(poppen.sheet?.stock, undefined)
  assert.equal(carriedCount(poppen, "dagger"), 2)
  const spent = withAttackSpent(poppen, "dagger", { thrown: true, landsAt: at(15) })
  assert.ok(sheetSchema.safeParse(spent.sheet).success)
  assert.deepEqual(spent.sheet?.stock, { carried: { dagger: 1 }, loose: [{ id: "dagger", at: at(15) }] })
})

test("each shot spends an Arrow, and with none left the Longbow cannot attack", () => {
  const once = withAttackSpent(thalbern, "longbow")
  assert.equal(carriedCount(once, "arrows"), 19)
  assert.deepEqual(once.sheet?.stock?.shot, { arrows: 1 })
  assert.equal(stockWords(once, { id: "longbow" }), "19 Arrows left")
  const empty = { ...thalbern, sheet: { ...(thalbern.sheet as Sheet), stock: { carried: { arrows: 0 }, shot: { arrows: 20 } } } }
  assert.deepEqual(attackStockRuling(empty, attack(empty, "longbow")), { name: "Out Of Arrows", text: "Thalbern has no Arrows left for the Longbow. The attack is not made." })
  const made = attackRequirement({ character: { ...empty, position: at(0) }, target: bandit, attack: attack(empty, "longbow"), present: [], floor })
  assert.ok("ruling" in made && made.ruling.name === "Out Of Arrows")
  // Shortsword in hand spends nothing.
  assert.equal(withAttackSpent(empty, "shortsword"), empty)
})

test("a Dagger thrown leaves the hand, and after two Poppen has none to throw or stab with", () => {
  const poppenAt = { ...poppen, position: at(0) }
  const first = attackRequirement({ character: poppenAt, target: bandit, attack: attack(poppen, "dagger"), present: [], floor })
  assert.ok("roll" in first && first.roll.attack.thrown === true) // 15 feet: beyond reach, within the 20-foot range
  const once = withAttackSpent(poppenAt, "dagger", { thrown: true, landsAt: bandit.position })
  const twice = withAttackSpent(once, "dagger", { thrown: true, landsAt: bandit.position })
  assert.equal(carriedCount(twice, "dagger"), 0)
  assert.equal(twice.sheet?.stock?.loose?.length, 2)
  const third = attackRequirement({ character: twice, target: bandit, attack: attack(twice, "dagger"), present: [], floor })
  assert.ok("ruling" in third)
  assert.deepEqual(third.ruling, { name: "Out Of Daggers", text: "Poppen Quickfoot has no Dagger in hand: every one thrown lies where it fell. The attack is not made." })
  // Even beside the Bandit, a Dagger is not in hand until one is picked up. The Sling still works.
  assert.ok("ruling" in attackRequirement({ character: { ...twice, position: at(100) }, target: { ...bandit, position: at(105) }, attack: attack(twice, "dagger"), present: [], floor }))
  assert.ok("roll" in attackRequirement({ character: twice, target: bandit, attack: attack(twice, "sling"), present: [], floor }))
})

test("a Dagger held in reach is not thrown, and spends nothing", () => {
  const near = attackRequirement({ character: { ...poppen, position: at(10) }, target: bandit, attack: attack(poppen, "dagger"), present: [], floor })
  assert.ok("roll" in near && near.roll.attack.thrown === undefined)
  assert.equal(carriedCount(withAttackSpent(poppen, "dagger"), "dagger"), 2)
  // With no floor, the words decide.
  const words = attackRequirement({ character: poppen, target: { ...bandit, position: undefined }, attack: attack(poppen, "dagger"), present: [], throws: true })
  assert.ok("roll" in words && words.roll.attack.thrown === true)
})

test("one lying within 5 feet is picked up as the hero attacks with it", () => {
  const thrown = withAttackSpent(withAttackSpent({ ...poppen, position: at(0) }, "dagger", { thrown: true, landsAt: at(15) }), "dagger", { thrown: true, landsAt: at(15) })
  const beside = { ...thrown, position: at(10) }
  assert.equal(attackStockRuling(beside, attack(beside, "dagger")), undefined)
  // Picked up and stabbed with: it stays in hand, and one still lies by the Bandit.
  const stabbed = withAttackSpent(beside, "dagger")
  assert.equal(carriedCount(stabbed, "dagger"), 1)
  assert.equal(stabbed.sheet?.stock?.loose?.length, 1)
  // Picked up and thrown again: none in hand, and two lie there still.
  const again = withAttackSpent(beside, "dagger", { thrown: true, landsAt: at(15) })
  assert.equal(carriedCount(again, "dagger"), 0)
  assert.equal(again.sheet?.stock?.loose?.length, 2)
})

test("after a fight won, thrown weapons are picked up and half the ammunition spent is gathered, rounded down", () => {
  let fighter: Hero = { ...thalbern, position: at(0) }
  for (let shot = 0; shot < 7; shot++) fighter = withAttackSpent(fighter, "longbow")
  fighter = withAttackSpent(fighter, "dagger", { thrown: true, landsAt: at(15) })
  assert.equal(carriedCount(fighter, "arrows"), 13)
  const won = afterFight(fighter, true)
  assert.equal(carriedCount(won.character, "arrows"), 16) // 13 + 3, half of 7 rounded down
  assert.equal(carriedCount(won.character, "dagger"), 1)
  assert.deepEqual(won.character.sheet?.stock, { carried: { arrows: 16, dagger: 1 } })
  assert.equal(won.told, "After the fight, Thalbern picks up the Dagger thrown, and gathers 3 of the 7 Arrows spent, 16 now.")
  // Fled with foes standing: the Dagger and the Arrows spent stay behind.
  const fled = afterFight(fighter, false)
  assert.deepEqual(fled.character.sheet?.stock, { carried: { arrows: 13, dagger: 0 } })
  assert.equal(fled.told, undefined)
  // Nothing spent, nothing told.
  assert.equal(afterFight(thalbern, true).character, thalbern)
})
