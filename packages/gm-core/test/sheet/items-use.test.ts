import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { magicItems } from "@d20/srd/magic-items"
import type { Featured } from "../../src/sheet/class-rules"
import { sheetProblems } from "../../src/sheet/derive"
import { bonusActionsOf, useBonusAction } from "../../src/sheet/features"
import { chargesOf } from "../../src/sheet/item-use"
import { itemLabel } from "../../src/sheet/items"
import { longRest } from "../../src/sheet/rest"
import type { Sheet } from "../../src/sheet/sheet"
import { castCost, castSpell, spellcastingFor, spellsOf, withCastPaid } from "../../src/sheet/spells"

// Every expected number below was worked out by hand from the SRD 5.2.1 text, not copied from the function's output.

const hero = (path: string) =>
  JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/welcome-to-kordavos/characters/${path}`, import.meta.url), "utf8")) as { sheet: Sheet }
// Branka, a level 1 Dwarf Fighter with Constitution 16: 10 + 3, and 1 for Dwarven Toughness, is 14 hit points.
// Proficiency Bonus +2, and no spellcasting.
const branka = hero("branka-stoneveil.json").sheet
// Lyra, a level 1 Wizard with Constitution 10: 6 hit points.
const lyra = hero("1749159962941.json").sheet
// Milos, a level 1 Cleric with Wisdom 16 (+3) and Constitution 12: spell save DC 8 + 2 + 3 = 13, and 8 + 1 = 9 hit
// points. He has not prepared Cure Wounds.
const milos = hero("milos-radan.json").sheet
const falls =
  (...dice: number[]) =>
  () => {
    if (!dice.length) throw new Error("No die left to roll.")
    return dice.shift() as number
  }
const pc = (id: string, sheet: Sheet, hitPoints: number): Featured & { hitPoints: number } => ({ id, name: id[0].toUpperCase() + id.slice(1), type: "pc", sheet, hitPoints })
const healing = (count?: number) => ({ id: "potions-of-healing", variant: "Potion of Healing", ...(count ? { count } : {}) })

test("a Potion of Healing heals its own 2d4 + 2 as a Bonus Action, and the last one leaves the sheet", () => {
  const wounded = pc("branka", { ...branka, items: [healing(2)] }, 5)
  assert.deepEqual(sheetProblems(wounded.sheet as Sheet), [])
  assert.deepEqual(
    bonusActionsOf(wounded).filter((entry) => entry.id === "potion-of-healing"),
    [{ id: "potion-of-healing", name: "Potion of Healing", uses: 2, left: 2, targeted: true }]
  )
  // 1 and 2 on the d4s, and 2: 5 regained, from 5 to 10 of 14. One potion is left, so the entry keeps no count.
  const first = useBonusAction({ characters: [wounded], actorId: "branka", feature: "potion-of-healing", roll: falls(1, 2) })
  assert.equal(first.use?.fact, "Branka drinks a Potion of Healing and regains 5 hit points, now 10 of 14.")
  assert.deepEqual(first.use?.harm, [{ target: "branka", kind: "healing", dice: [1, 2], sides: 4, bonus: 2, amount: 5 }])
  assert.equal(first.characters[0].hitPoints, 10)
  assert.deepEqual(first.characters[0].sheet?.items, [healing()])
  // 4 and 4, and 2: 10, of which 4 fit under the maximum. None is left, and the entry goes.
  const second = useBonusAction({ characters: first.characters, actorId: "branka", feature: "potion-of-healing", roll: falls(4, 4) })
  assert.equal(second.characters[0].hitPoints, 14)
  assert.equal(second.characters[0].sheet?.items, undefined)
  // With none, there is nothing to drink: the menu does not offer it, and a use of it changes nothing.
  assert.ok(!bonusActionsOf(second.characters[0]).some((entry) => entry.id === "potion-of-healing"))
  const none = useBonusAction({ characters: second.characters, actorId: "branka", feature: "potion-of-healing", roll: falls() })
  assert.equal(none.use, undefined)
  assert.deepEqual(none.characters, second.characters)
})

test("a potion given to an ally at 0 hit points brings them back up, and a greater one rolls 4d4 + 4", () => {
  const giver = pc("branka", { ...branka, items: [{ id: "potions-of-healing", variant: "Potion of Healing (greater)" }] }, 13)
  const fallen = pc("lyra", lyra, 0)
  // 1, 1, 2 and 1, and 4: 9, of which 6 fit. Lyra is up again at 6 of 6.
  const given = useBonusAction({ characters: [giver, fallen], actorId: "branka", feature: "potion-of-healing-greater", target: "lyra", roll: falls(1, 1, 2, 1) })
  assert.equal(given.use?.fact, "Branka gives Lyra a Potion of Healing (greater), and Lyra drinks it and regains 6 hit points, now 6 of 6.")
  assert.equal(given.characters[1].hitPoints, 6)
  assert.equal(given.characters[0].sheet?.items, undefined)
})

test("a Wand of Magic Missiles spends a charge a level, refuses when short, and comes back on a Long Rest by its dice", () => {
  // "you can expend no more than 3 charges to cast Magic Missile from it. For 1 charge, you cast the level 1 version".
  // Branka casts no spell of her own, so the wand's Magic Missile is cast from it alone, at DC 8 + 2 and +2 to hit.
  const fighter = pc("branka", { ...branka, items: [{ id: "wand-of-magic-missiles" }] }, 13)
  assert.equal(spellsOf(fighter).find((known) => known.spell.id === "magic-missile")?.itemOnly, true)
  assert.deepEqual([spellcastingFor(fighter, "magic-missile")?.saveDc, spellcastingFor(fighter, "magic-missile")?.attackBonus], [10, 2])
  const level3 = castCost(fighter, "magic-missile", false, 3)
  assert.ok("cost" in level3)
  assert.deepEqual(level3.cost, { kind: "item", index: 0, charges: 3, level: 3 })
  // A level above what 3 charges buy falls to level 3.
  assert.deepEqual((castCost(fighter, "magic-missile", false, 5) as typeof level3).cost, level3.cost)
  const once = withCastPaid(fighter, level3.cost, falls())
  const twice = withCastPaid(once.character, level3.cost, falls())
  assert.deepEqual(chargesOf(twice.character.sheet?.items?.[0] ?? { id: "" }), { max: 7, left: 1 })
  assert.deepEqual(castCost(twice.character, "magic-missile", false, 2), { problem: "The Wand of Magic Missiles has 1 charge left, and Magic Missile at level 2 takes 2." })
  // The last charge rolls a d20: a 7 and it holds.
  const last = castCost(twice.character, "magic-missile")
  assert.ok("cost" in last)
  const spent = withCastPaid(twice.character, last.cost, falls(7))
  assert.deepEqual(spent.facts, ["The last charge of the Wand of Magic Missiles is spent. Its d20 rolls 7, and it holds."])
  assert.deepEqual(spent.character.sheet?.items, [{ id: "wand-of-magic-missiles", spent: 7 }])
  assert.deepEqual(castCost(spent.character, "magic-missile"), { problem: "The Wand of Magic Missiles has 0 charges left, and Magic Missile takes 1." })
  // On a 1 it crumbles into ashes and is gone.
  assert.equal(withCastPaid(twice.character, last.cost, falls(1)).character.sheet?.items, undefined)
  // "The wand regains 1d6 + 1 expended charges daily at dawn": a 4 and 1, 5 of the 7 back.
  const rested = longRest(spent.character, { roll: falls(4) })
  assert.deepEqual(rested.character.sheet?.items, [{ id: "wand-of-magic-missiles", spent: 2 }])
  assert.ok(rested.facts.includes("Branka's Wand of Magic Missiles regains 5 expended charges, now 5 of 7."))
})

test("a Staff of Healing casts with the wearer's own numbers, a charge a spell level, and only while attuned", () => {
  // "using your spellcasting ability modifier": Milos's Wisdom +3. Cure Wounds heals 2d8 and the modifier, and 2d8 more
  // for each level above 1.
  const staff = { id: "staff-of-healing" }
  const unattuned = pc("milos", { ...milos, items: [staff] }, 10)
  assert.equal(
    spellsOf(unattuned).some((known) => known.item),
    false
  )
  assert.deepEqual(castCost(unattuned, "mass-cure-wounds"), { problem: "Mass Cure Wounds is not a spell Milos can cast." })
  const attuned = pc("milos", { ...milos, items: [{ ...staff, attuned: true }] }, 4)
  assert.deepEqual(sheetProblems(attuned.sheet as Sheet), [])
  assert.equal(spellcastingFor(attuned, "cure-wounds")?.saveDc, 13)
  const cost = castCost(attuned, "cure-wounds", false, 2)
  assert.ok("cost" in cost)
  assert.deepEqual(cost.cost, { kind: "item", index: 0, charges: 2, level: 2 })
  // At level 2: 4d8 and 3. Dice of 1, 2, 3 and 4 make 10, and 3: 13, from 4 to Milos's maximum of 9.
  const cast = castSpell({ characters: [attuned], casterId: "milos", spell: cost.known.spell, targets: ["milos"], level: 2, item: true, d20: falls(), roll: falls(1, 2, 3, 4) })
  assert.ok(cast.facts.includes("Milos regains 13 hit points. Milos has 9 of 9 hit points."))
  // Mass Cure Wounds takes 5 of the 10.
  assert.deepEqual((castCost(attuned, "mass-cure-wounds") as typeof cost).cost, { kind: "item", index: 0, charges: 5, level: 5 })
})

test("a Circlet of Blasting casts Scorching Ray once a dawn at its own +5", () => {
  const worn = pc("branka", { ...branka, items: [{ id: "circlet-of-blasting" }] }, 13)
  assert.equal(spellcastingFor(worn, "scorching-ray")?.attackBonus, 5)
  const cost = castCost(worn, "scorching-ray")
  assert.ok("cost" in cost)
  const used = withCastPaid(worn, cost.cost, falls()).character
  assert.deepEqual(used.sheet?.items, [{ id: "circlet-of-blasting", used: { "scorching-ray": 1 } }])
  assert.deepEqual(castCost(used, "scorching-ray"), { problem: "The Circlet of Blasting cannot cast Scorching Ray again until a Long Rest." })
  assert.deepEqual(longRest(used, { roll: falls() }).character.sheet?.items, [{ id: "circlet-of-blasting" }])
})

test("of the 97 items with charges, uses or spells, 6 run in full", () => {
  const counted = magicItems.filter((item) => item.charges || item.uses || item.spells || item.variants?.some((variant) => variant.charges || variant.spells))
  assert.equal(counted.length, 97)
  assert.deepEqual(
    counted.filter((item) => itemLabel(item) === "run").map((item) => item.id),
    ["circlet-of-blasting", "staff-of-healing", "wand-of-binding", "wand-of-fireballs", "wand-of-lightning-bolts", "wand-of-magic-missiles"]
  )
  assert.equal(itemLabel(magicItems.find((item) => item.id === "potions-of-healing") ?? magicItems[0]), "run")
})
