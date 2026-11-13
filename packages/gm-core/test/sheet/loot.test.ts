import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { attacksOf } from "../../src/sheet/attack"
import { sheetProblems } from "../../src/sheet/derive"
import { giveLoot, handOver, type Loot, lootDue, lootProblems } from "../../src/sheet/loot"
import type { Sheet } from "../../src/sheet/sheet"
import { sheetView } from "../../src/sheet/view"

// Every expected outcome below was worked out by hand from the rule in ../../src/sheet/loot.ts and the SRD 5.2.1 text.

const hero = (path: string) => JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { name: string; sheet: Sheet }
// Branka, a level 1 Dwarf Fighter, trained with martial weapons. Here she holds a Longsword.
const branka: Sheet = { ...hero("welcome-to-kordavos/characters/branka-stoneveil.json").sheet, weapons: ["longsword"] }
// Lyra, a level 1 Human Wizard: simple weapons only, and a Spellcaster.
const lyra = hero("welcome-to-kordavos/characters/1749159962941.json").sheet
// Thalbern, a level 1 Ranger with a Shortsword: martial weapons, and a Spellcaster from level 1.
const thalbern = hero("welcome-to-kordavos/characters/thalbern.json").sheet
// A level 1 Barbarian: martial weapons, and no spell by any trait or feature.
const barbarian: Sheet = {
  ...branka,
  class: "barbarian",
  classSkills: ["athletics", "survival"],
  featureChoices: undefined,
  weaponMasteries: ["greataxe", "handaxe"],
  armor: undefined,
  weapons: ["greataxe"],
}

const pc = (id: string, sheet: Sheet, more: { dead?: true } = {}) => ({ id, name: id[0].toUpperCase() + id.slice(1), type: "pc", sheet, ...more })
const longsword: Loot = { id: "weapon-1-2-or-3", variant: "+1", base: "longsword", on: "leave" }
const potion: Loot = { id: "potions-of-healing", variant: "Potion of Healing", on: "enter" }

test("a Longsword +1 goes to the Fighter who holds a Longsword, she wields it, and a second weapon goes to the next", () => {
  // Lyra is listed first and holds no item, but a Wizard is not trained with a Longsword.
  const { characters, given } = giveLoot([pc("lyra", lyra), pc("branka", branka)], [longsword])
  assert.deepEqual(given, [{ character: "branka", name: "Longsword +1", text: "Branka takes the Longsword +1." }])
  const after = characters.find((each) => each.id === "branka")?.sheet as Sheet
  assert.deepEqual(sheetProblems(after), [])
  // Strength 3, Proficiency 2 and the sword's 1: +6, for 1d8 + 4.
  assert.deepEqual(
    attacksOf({ type: "pc", sheet: after })
      .filter((attack) => attack.id === "longsword")
      .map((attack) => [attack.name, attack.bonus, attack.damage[0].dice]),
    [["Longsword +1", 6, "1d8 + 4"]]
  )
  assert.equal(characters.find((each) => each.id === "lyra")?.sheet.items, undefined)
  // The sheet card on both hosts reads the turn's sheet, so the sword shows there as given.
  assert.deepEqual(
    sheetView(after).items.map((item) => [item.name, item.gives]),
    [["Longsword +1", "+1 to Attack Rolls and Damage Rolls"]]
  )

  // Two swords: the first to Branka, who holds one. Then she holds one magic item and Thalbern none, so the second
  // goes to him, a Ranger trained with it, and he carries a Longsword beside his own weapons.
  const two = giveLoot([pc("thalbern", thalbern), pc("branka", branka)], [longsword, longsword])
  assert.deepEqual(
    two.given.map((each) => each.text),
    ["Branka takes the Longsword +1.", "Thalbern takes the Longsword +1."]
  )
  assert.deepEqual(two.characters.find((each) => each.id === "thalbern")?.sheet.weapons, ["longbow", "shortsword", "dagger", "longsword"])
})

test("potions go one at a time to whoever holds the fewest, and never to the dead", () => {
  const holding: Sheet = { ...lyra, items: [{ id: "potions-of-healing", variant: "Potion of Healing" }] }
  // Lyra holds one, Branka none and Thalbern is dead. The first goes to Branka. Then they tie at one each and the
  // first listed, Lyra, takes the second, and Branka the third. Each share is told once, in the order first given.
  const { characters, given } = giveLoot([pc("lyra", holding), pc("branka", branka), pc("thalbern", thalbern, { dead: true })], [{ ...potion, count: 3 }])
  assert.deepEqual(
    given.map((each) => each.text),
    ["Branka takes 2 Potions of Healing.", "Lyra takes a Potion of Healing."]
  )
  assert.deepEqual(characters.find((each) => each.id === "lyra")?.sheet.items, [{ id: "potions-of-healing", variant: "Potion of Healing", count: 2 }])
  assert.deepEqual(characters.find((each) => each.id === "branka")?.sheet.items, [{ id: "potions-of-healing", variant: "Potion of Healing", count: 2 }])
  assert.equal(characters.find((each) => each.id === "thalbern")?.sheet.items, undefined)
  // One for each living hero: Lyra and Branka take one apiece, and the dead Thalbern none.
  const apiece = giveLoot([pc("lyra", lyra), pc("branka", branka), pc("thalbern", thalbern, { dead: true })], [{ ...potion, each: true }])
  assert.deepEqual(
    apiece.given.map((each) => each.text),
    ["Lyra takes a Potion of Healing.", "Branka takes a Potion of Healing."]
  )
  // A dead Fighter is never given the sword: no one else can use it, and it is left.
  const left = giveLoot([pc("branka", branka, { dead: true }), pc("lyra", lyra)], [longsword])
  assert.deepEqual([left.given, left.left], [[], ["No one here can use the Longsword +1, so it is left behind."]])
})

test("an item attuned only by a Spellcaster never goes to the Barbarian", () => {
  const wand: Loot = { id: "wand-of-web", on: "enter" }
  // The Barbarian is listed first and holds nothing. The Ranger already holds a Longsword +1, and still takes it.
  const ranger: Sheet = { ...thalbern, items: [{ id: "weapon-1-2-or-3", variant: "+1", base: "shortsword" }] }
  const { given } = giveLoot([pc("barbarian", barbarian), pc("thalbern", ranger)], [wand])
  assert.deepEqual(
    given.map((each) => each.text),
    ["Thalbern takes the Wand of Web."]
  )
  assert.deepEqual(giveLoot([pc("barbarian", barbarian)], [wand]).given, [])
})

test("loot is due once: on entering the first time, on leaving the first time, or by the transition it names", () => {
  const row = (encounterId: string, order: number) => ({ encounterId, order })
  const cellar = { id: "cellar", loot: [{ ...potion }, { ...longsword }, { ...longsword, variant: "+2", to: "halls" }] }
  const halls = { id: "halls", loot: [{ ...potion, count: 2 }] }
  // The first time from the cellar to the halls: the cellar's two given on leaving, and the halls' on entering.
  const first = lootDue({ from: cellar, to: halls, turns: [row("gate", 1), row("cellar", 2)] })
  assert.deepEqual(first.leaving, [longsword, { ...longsword, variant: "+2", to: "halls" }])
  assert.deepEqual(first.entering, [{ ...potion, count: 2 }])
  // Back in the cellar and out again: nothing, since each moment has passed.
  const again = lootDue({ from: cellar, to: halls, turns: [row("gate", 1), row("cellar", 2), row("halls", 3), row("cellar", 4)] })
  assert.deepEqual(again, { leaving: [], entering: [] })
  // Leaving by another way gives the loot of any transition, and not the one named for the halls.
  assert.deepEqual(lootDue({ from: cellar, to: { id: "gate" }, turns: [row("gate", 1), row("cellar", 2)] }).leaving, [longsword])
  // Coming to the cellar the first time gives its potion.
  assert.deepEqual(lootDue({ from: { id: "gate" }, to: cellar, turns: [row("gate", 1)] }).entering, [potion])
})

test("an encounter's loot names a real item as it comes, at a moment the encounter has", () => {
  const encounter = { isStart: false, transitions: [{ toEncounterId: "halls" }] }
  assert.deepEqual(lootProblems(longsword, encounter), [])
  assert.deepEqual(lootProblems({ ...longsword, id: "sword-of-plenty" }, encounter), ['"sword-of-plenty" is not a magic item'])
  assert.deepEqual(lootProblems({ ...longsword, variant: "+4" }, encounter), ['Weapon, +1, +2, or +3 comes as +1, +2, +3, and the sheet names "+4"'])
  assert.deepEqual(lootProblems({ ...longsword, base: "plate-armor" }, encounter), ["Plate Armor is not an item Weapon, +1, +2, or +3 can be"])
  assert.deepEqual(lootProblems({ ...longsword, count: 2 }, encounter), ["Weapon, +1, +2, or +3 is not used up, so it is given one at a time"])
  assert.deepEqual(lootProblems({ ...longsword, each: true }, encounter), ["Weapon, +1, +2, or +3 is not used up, so it is not given to each hero"])
  assert.deepEqual(lootProblems({ ...potion, each: true, count: 2 }, encounter), ["loot is given to each hero or in a count, not both"])
  assert.deepEqual(lootProblems({ ...longsword, to: "cellar" }, encounter), ['the encounter has no transition to "cellar"'])
  assert.deepEqual(lootProblems(longsword, { isStart: false, transitions: [] }), ["the encounter has no transition, so it is never left"])
  assert.deepEqual(lootProblems(potion, { ...encounter, isStart: true }), ["the adventure opens in its start encounter and never enters it, so its loot is given on leaving it"])
})

test("a hero hands an item to another, and their Attunement to it ends", () => {
  const ring = { id: "ring-of-protection", attuned: true as const }
  const giver: Sheet = { ...lyra, items: [ring, { id: "potions-of-healing", variant: "Potion of Healing", count: 2 }] }
  const { characters, fact } = handOver([pc("lyra", giver), pc("branka", branka)], "lyra", "branka", 0)
  assert.equal(fact, "Lyra hands the Ring of Protection to Branka.")
  assert.deepEqual(characters[0].sheet.items, [{ id: "potions-of-healing", variant: "Potion of Healing", count: 2 }])
  // Branka owns it, not attuned: she attunes on a Short Rest.
  assert.deepEqual(characters[1].sheet.items, [{ id: "ring-of-protection" }])
  // One potion of two passes.
  const potions = handOver([pc("lyra", giver), pc("branka", branka)], "lyra", "branka", 1)
  assert.equal(potions.fact, "Lyra hands a Potion of Healing to Branka.")
  assert.deepEqual(
    potions.characters.map((each) => each.sheet.items),
    [[ring, { id: "potions-of-healing", variant: "Potion of Healing" }], [{ id: "potions-of-healing", variant: "Potion of Healing" }]]
  )
  // Nothing held there: nothing changes.
  assert.equal(handOver([pc("lyra", giver), pc("branka", branka)], "branka", "lyra", 0).fact, undefined)
})
