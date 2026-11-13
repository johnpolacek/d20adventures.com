import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { magicItems } from "@d20/srd/magic-items"
import { attacksOf } from "../../src/sheet/attack"
import { checkBonus } from "../../src/sheet/check"
import { casterOf, deriveSheet, sheetProblems } from "../../src/sheet/derive"
import { attune, endAttunement, itemLabel, itemWords } from "../../src/sheet/items"
import { shortRest } from "../../src/sheet/rest"
import type { Sheet } from "../../src/sheet/sheet"
import { sheetView } from "../../src/sheet/view"

// Every expected number below was worked out by hand from the SRD 5.2.1 text, not copied from the function's output.

const hero = (path: string) => JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { name: string; sheet: Sheet }
// Branka, a level 1 Dwarf Fighter: Str 16 (+3), Dex 10, Con 16 (+3), Int 10, Wis 12 (+1), Cha 8 (−1), Proficiency Bonus
// +2, proficient in Strength and Constitution saves, the Defense Fighting Style (+1 Armor Class in armor), a Shield.
const branka = hero("welcome-to-kordavos/characters/branka-stoneveil.json").sheet
// Lyra, a level 1 Human Wizard: a Spellcaster.
const lyra = hero("welcome-to-kordavos/characters/1749159962941.json").sheet
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() as number

test("a Fighter with a Longsword +1 attacks at one higher and deals one more", () => {
  const plain = { ...branka, weapons: ["longsword"] }
  // Strength 3 and Proficiency 2: +5 for 1d8 + 3. The Longsword +1 adds 1 to each.
  assert.deepEqual(
    attacksOf({ type: "pc", sheet: plain }).map((attack) => [attack.name, attack.bonus, attack.damage[0].dice]),
    [
      ["Longsword", 5, "1d8 + 3"],
      ["Unarmed Strike", 5, undefined],
    ]
  )
  const magic: Sheet = { ...plain, items: [{ id: "weapon-1-2-or-3", variant: "+1", base: "longsword" }] }
  assert.deepEqual(sheetProblems(magic), [])
  const [sword] = attacksOf({ type: "pc", sheet: magic })
  assert.deepEqual([sword.id, sword.name, sword.bonus, sword.damage], ["longsword", "Longsword +1", 6, [{ dice: "1d8 + 4", type: "slashing" }]])
  // A Longsword +1 owned while the sheet carries no Longsword is not wielded, and changes no attack.
  const spare: Sheet = { ...branka, items: [{ id: "weapon-1-2-or-3", variant: "+1", base: "longsword" }] }
  assert.deepEqual(sheetProblems(spare), [])
  assert.deepEqual(attacksOf({ type: "pc", sheet: spare })[0].name, "Warhammer")
})

test("Plate Armor +1 and a Shield +1 each add 1 to Armor Class", () => {
  // Plate Armor 18, the Shield 2, Defense 1: 21. Then Plate Armor +1 and Shield +1: 23.
  const plate: Sheet = { ...branka, armor: "plate-armor" }
  assert.equal(deriveSheet(plate).armorClass, 21)
  const magic: Sheet = {
    ...plate,
    items: [
      { id: "armor-1-2-or-3", variant: "+1", base: "plate-armor" },
      { id: "shield-1-2-or-3", variant: "+1", base: "shield" },
    ],
  }
  assert.deepEqual(sheetProblems(magic), [])
  assert.equal(deriveSheet(magic).armorClass, 23)
  // Without the Shield on the sheet, the Shield +1 is not carried and gives nothing: 18 + 1 + 1.
  assert.equal(deriveSheet({ ...magic, shield: false }).armorClass, 20)
})

test("a Ring of Protection gives nothing until attuned, then 1 to Armor Class and every saving throw", () => {
  // Breastplate 14 with Dexterity 0, the Shield 2, Defense 1: 17.
  const owned: Sheet = { ...branka, items: [{ id: "ring-of-protection" }] }
  assert.equal(deriveSheet(owned).armorClass, 17)
  const saves = (sheet: Sheet) => Object.values(deriveSheet(sheet).savingThrows).map((save) => save.bonus)
  // Str 3 + 2, Dex 0, Con 3 + 2, Int 0, Wis 1, Cha −1.
  assert.deepEqual(saves(owned), [5, 0, 5, 0, 1, -1])
  const attuned: Sheet = { ...branka, items: [{ id: "ring-of-protection", attuned: true }] }
  assert.deepEqual(sheetProblems(attuned), [])
  assert.equal(deriveSheet(attuned).armorClass, 18)
  assert.deepEqual(saves(attuned), [6, 1, 6, 1, 2, 0])
  assert.equal(checkBonus({ type: "pc", sheet: attuned }, { kind: "save", ability: "dex" }), 1)
  // Attunement is marked only on an item that needs it.
  assert.deepEqual(sheetProblems({ ...branka, items: [{ id: "weapon-1-2-or-3", variant: "+1", base: "longsword", attuned: true }] }), ["Weapon, +1, +2, or +3 needs no Attunement"])
})

test("a fourth Attunement is refused, as is a second copy and a Spellcaster's item to a Fighter", () => {
  const three: Sheet = {
    ...branka,
    items: [
      { id: "ring-of-protection", attuned: true },
      { id: "cloak-of-protection", attuned: true },
      { id: "stone-of-good-luck-luckstone", attuned: true },
      { id: "cloak-of-elvenkind" },
      { id: "ring-of-protection" },
    ],
  }
  assert.deepEqual(sheetProblems(three), [])
  const caster = casterOf(three)
  assert.deepEqual(attune(three, 3, caster), { problem: "The hero is attuned to 3 magic items already, and must end an Attunement first." })
  assert.deepEqual(sheetProblems({ ...three, items: three.items?.map((item) => ({ ...item, attuned: true as const })) }), [
    "the hero is attuned to 5 magic items, and can be attuned to no more than 3",
    "the hero is attuned to two copies of one magic item",
  ])
  // Ending one frees a slot, and the fourth may then be attuned.
  const ended = endAttunement(three, 2)
  assert.ok("sheet" in ended)
  assert.ok("sheet" in attune(ended.sheet, 3, caster))
  // The second Ring of Protection is a copy of one attuned.
  assert.deepEqual(attune(ended.sheet, 4, caster), { problem: "The hero is already attuned to another Ring of Protection." })

  // A Wand of the War Mage is attuned only by a Spellcaster. Branka casts no spell. Lyra, a Wizard, does.
  const wand = { id: "wand-of-the-war-mage-1-2-or-3", variant: "+1" }
  assert.equal(casterOf(branka).spellcaster, false)
  assert.deepEqual(attune({ ...branka, items: [wand] }, 0, casterOf(branka)), {
    problem: "Wand of the War Mage, +1, +2, or +3 is attuned only by a Spellcaster, and the hero casts no spell by their traits or features.",
  })
  assert.deepEqual(sheetProblems({ ...branka, items: [{ ...wand, attuned: true }] }), [
    "Wand of the War Mage, +1, +2, or +3 is attuned only by a Spellcaster, and the hero casts no spell by their traits or features",
  ])
  assert.deepEqual(sheetProblems({ ...lyra, items: [{ ...wand, attuned: true }] }), [])
})

test("a base must fit the item, and an item that comes in several versions names one", () => {
  assert.deepEqual(sheetProblems({ ...branka, items: [{ id: "armor-1-2-or-3", variant: "+1", base: "shield" }] }), ["Shield is not an item Armor, +1, +2, or +3 can be"])
  assert.deepEqual(sheetProblems({ ...branka, items: [{ id: "weapon-1-2-or-3", variant: "+4", base: "longsword" }] }), ['Weapon, +1, +2, or +3 comes as +1, +2, +3, and the sheet names "+4"'])
  assert.deepEqual(sheetProblems({ ...branka, items: [{ id: "elven-chain" }] }), ["Elven Chain needs the item it is, such as a Longsword or Plate Armor"])
  assert.deepEqual(sheetProblems({ ...branka, items: [{ id: "sword-of-nonsense" }] }), ['"sword-of-nonsense" is not a magic item'])
})

test("a Short Rest attunes one item, the first owned that can be, while a slot is free", () => {
  const owner = {
    id: "branka",
    type: "pc",
    name: "Branka",
    hitPoints: 13,
    sheet: { ...branka, items: [{ id: "weapon-1-2-or-3", variant: "+1", base: "warhammer" }, { id: "ring-of-protection" }, { id: "cloak-of-protection" }] } as Sheet,
  }
  const first = shortRest(owner, { roll: falls() })
  assert.deepEqual(first.facts, ["Branka spends the rest with the Ring of Protection and is now attuned to it."])
  assert.deepEqual(
    first.character.sheet.items?.map((item) => !!item.attuned),
    [false, true, false]
  )
  const second = shortRest(first.character, { roll: falls() })
  assert.deepEqual(second.facts, ["Branka spends the rest with the Cloak of Protection and is now attuned to it."])
  // Ring and Cloak: 17 + 1 + 1.
  assert.equal(deriveSheet(second.character.sheet).armorClass, 19)
  const third = shortRest(second.character, { roll: falls() })
  assert.deepEqual(third.facts, ["Branka rests for an hour, and nothing spent comes back."])
})

test("the sheet and the game master are told the items", () => {
  const sheet: Sheet = { ...branka, items: [{ id: "weapon-1-2-or-3", variant: "+1", base: "warhammer" }, { id: "ring-of-protection" }, { id: "bag-of-holding" }] }
  assert.deepEqual(sheetView(sheet).items, [
    { name: "Warhammer +1", gives: "+1 to Attack Rolls and Damage Rolls", kind: "Uncommon Weapon" },
    { name: "Ring of Protection", gives: "+1 to Armor Class and Saving Throws", kind: "Rare Ring", attuned: false },
    { name: "Bag of Holding", kind: "Uncommon Wondrous Item" },
  ])
  const words = itemWords(sheet)
  assert.equal(words[0], "Warhammer +1. The game adds +1 to Attack Rolls and Damage Rolls.")
  assert.equal(words[1], "Ring of Protection, not attuned, so its magic does not work. Once it works, the game adds +1 to Armor Class and Saving Throws.")
  assert.match(words[2], /^Bag of Holding\. The game does not run it, so it changes no number\. Its text: "This bag has an interior space/)
})

test("of the 258 magic items, 6 are run, 31 run in part and 221 told", () => {
  const counts: Record<string, number> = {}
  for (const item of magicItems) counts[itemLabel(item)] = (counts[itemLabel(item)] ?? 0) + 1
  assert.equal(magicItems.length, 258)
  assert.deepEqual(counts, { told: 221, run: 6, "partly run": 31 })
  // Run: the +1, +2 or +3 weapon, armor and Shield, the Ring and Cloak of Protection, and the Stone of Good Luck.
  assert.deepEqual(
    magicItems.filter((item) => itemLabel(item) === "run").map((item) => item.id),
    ["armor-1-2-or-3", "cloak-of-protection", "ring-of-protection", "shield-1-2-or-3", "stone-of-good-luck-luckstone", "weapon-1-2-or-3"]
  )
})
