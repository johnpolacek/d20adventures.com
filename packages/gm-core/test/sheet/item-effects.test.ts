import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { magicItems } from "@d20/srd/magic-items"
import { attacksOf } from "../../src/sheet/attack"
import { sheetModes } from "../../src/sheet/check"
import { withCondition } from "../../src/sheet/conditions"
import { deriveSheet, sheetProblems } from "../../src/sheet/derive"
import { readItem } from "../../src/sheet/item-effects"
import { bonusesRun, itemLabel, itemWords } from "../../src/sheet/items"
import type { Sheet } from "../../src/sheet/sheet"
import { type Castee, castSpell, spellById } from "../../src/sheet/spells"
import { sheetView } from "../../src/sheet/view"

// Every expected number below was worked out by hand from the SRD 5.2.1 text, not copied from the function's output.

const hero = (path: string) => JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { name: string; sheet: Sheet }
// Branka, a level 1 Dwarf Fighter: Str 16, Dex 10, Con 16 (+3), Proficiency Bonus +2, a Breastplate and a Shield, the
// Defense Fighting Style. Lyra, a level 1 Human Wizard: Int 16 (+3), Dex 10, no armor.
const branka = hero("welcome-to-kordavos/characters/branka-stoneveil.json").sheet
const lyra = hero("welcome-to-kordavos/characters/1749159962941.json").sheet
const fours = () => 4

test("Gauntlets of Ogre Power make a Strength of 10 into 19, and do nothing for one of 20 or before Attunement", () => {
  const weak: Sheet = { ...branka, abilityScores: { ...branka.abilityScores, str: 10 }, weapons: ["longsword"] }
  // Strength 10 is +0: a Longsword at +2 for 1d8.
  assert.deepEqual([attacksOf({ type: "pc", sheet: weak })[0].bonus, attacksOf({ type: "pc", sheet: weak })[0].damage[0].dice], [2, "1d8"])
  const gauntlets: Sheet = { ...weak, items: [{ id: "gauntlets-of-ogre-power", attuned: true }] }
  assert.deepEqual(sheetProblems(gauntlets), [])
  // "Your Strength is 19 while you wear these gauntlets": +4, so +6 to hit and 1d8 + 4.
  assert.equal(deriveSheet(gauntlets).abilityScores.str, 19)
  assert.equal(sheetView(gauntlets).abilities.find((ability) => ability.id === "str")?.score, 19)
  const [sword] = attacksOf({ type: "pc", sheet: gauntlets })
  assert.deepEqual([sword.bonus, sword.damage[0].dice], [6, "1d8 + 4"])
  // Unattuned, they give nothing.
  assert.equal(attacksOf({ type: "pc", sheet: { ...gauntlets, items: [{ id: "gauntlets-of-ogre-power" }] } })[0].bonus, 2)
  // "No effect on you if your Strength is 19 or higher without them": Strength 20 stays +5, +7 for 1d8 + 5.
  const strong: Sheet = { ...gauntlets, abilityScores: { ...branka.abilityScores, str: 20 } }
  assert.deepEqual([attacksOf({ type: "pc", sheet: strong })[0].bonus, attacksOf({ type: "pc", sheet: strong })[0].damage[0].dice], [7, "1d8 + 5"])
  assert.deepEqual(sheetView(gauntlets).items, [{ name: "Gauntlets of Ogre Power", gives: "Strength 19", kind: "Uncommon Wondrous Item", attuned: true }])
})

test("a Ring of Resistance (Fire) halves a Fire Bolt's damage, and must name its type", () => {
  const caster: Castee = { id: "lyra", name: "Lyra", type: "pc", sheet: { ...lyra, cantrips: ["mage-hand", "light", "fire-bolt"] } }
  // Branka's 14 hit points: a d10 and Constitution 3, and 1 from Dwarven Toughness. Fire Bolt's 1d10 rolls 4.
  const bolt = (sheet: Sheet) => {
    const target: Castee = { id: "branka", name: "Branka", type: "pc", sheet, hitPoints: 14 }
    // Lyra's spell attack is +5 (Intelligence 3, Proficiency 2): 15 + 5 hits Armor Class 17.
    const cast = castSpell({ characters: [caster, target], casterId: "lyra", spell: spellById.get("fire-bolt")!, targets: ["branka"], attackDice: [15], d20: () => 10, roll: fours })
    return cast.characters.find((character) => character.id === "branka")?.hitPoints
  }
  assert.equal(bolt(branka), 10)
  const ringed: Sheet = { ...branka, items: [{ id: "ring-of-resistance", damageType: "fire" }] }
  assert.deepEqual(sheetProblems(ringed), [])
  assert.deepEqual(deriveSheet(ringed).resistances, ["fire", "poison"])
  // Resistance halves the 4 to 2.
  assert.equal(bolt(ringed), 12)
  assert.deepEqual(sheetProblems({ ...branka, items: [{ id: "ring-of-resistance" }] }), ["Ring of Resistance gives Resistance to one damage type the GM chooses, and the sheet names none"])
})

test("a Periapt of Proof against Poison keeps off the Poisoned condition and Poison damage", () => {
  const sheet: Sheet = { ...lyra, items: [{ id: "periapt-of-proof-against-poison", attuned: true }] }
  assert.equal(withCondition({ type: "pc", sheet, hitPoints: 8 }, { id: "poisoned" }).given, false)
  assert.equal(withCondition({ type: "pc", sheet: lyra, hitPoints: 8 }, { id: "poisoned" }).given, true)
  assert.deepEqual(deriveSheet(sheet).immunities, ["poison"])
})

test("Bracers of Defense give 2 to Armor Class only with no armor and no Shield", () => {
  const bracers = [{ id: "bracers-of-defense", attuned: true as const }]
  // Breastplate 14, Dexterity 0, Shield 2, Defense 1: 17, with or without them.
  assert.equal(deriveSheet({ ...branka, items: bracers }).armorClass, 17)
  // A Shield and no armor: 10 + 2, and still no bonus.
  assert.equal(deriveSheet({ ...branka, armor: undefined, items: bracers }).armorClass, 12)
  // Neither: 10, and 12 with them.
  assert.equal(deriveSheet({ ...branka, armor: undefined, shield: false }).armorClass, 10)
  assert.equal(deriveSheet({ ...branka, armor: undefined, shield: false, items: bracers }).armorClass, 12)
})

test("a Cloak of Elvenkind gives Advantage on Stealth once attuned, and tells the rest", () => {
  const stealth = { kind: "skill", skill: "stealth" } as const
  const cloak: Sheet = { ...lyra, items: [{ id: "cloak-of-elvenkind", attuned: true }] }
  assert.deepEqual(sheetModes({ type: "pc", sheet: cloak }, stealth), [{ mode: "advantage", from: "Cloak of Elvenkind" }])
  assert.deepEqual(sheetModes({ type: "pc", sheet: { ...lyra, items: [{ id: "cloak-of-elvenkind" }] } }, stealth), [])
  // Run in part: the game master is told the sentence whose Perception clause the game does not run.
  assert.equal(
    itemWords(cloak)[0],
    'Cloak of Elvenkind, attuned. The game adds Advantage on Stealth Checks. The game runs nothing more of it. Its text: "While you wear this cloak, Wisdom (Perception) checks made to perceive you have Disadvantage, and you have Advantage on Dexterity (Stealth) checks."'
  )
  // Run in full: no text is sent.
  assert.equal(itemWords({ ...lyra, items: [{ id: "goggles-of-night" }] })[0], "Goggles of Night. The game adds Darkvision 60 ft, or 60 ft more.")
})

test("of the 258 magic items, 26 are run, 76 run in part and 156 told, 13 of the run and 21 of the rest by their text", () => {
  // Before the text was read: 13 fewer run in full and 21 fewer run in part, all of them told. Before ./item-use too,
  // at substage I2: 6 run, 31 run in part and 221 told.
  const counts: Record<string, number> = {}
  for (const item of magicItems) counts[itemLabel(item)] = (counts[itemLabel(item)] ?? 0) + 1
  assert.deepEqual(counts, { told: 156, run: 26, "partly run": 76 })
  const read = (item: (typeof magicItems)[number]) => readItem(item).effects.length > 0
  // The 13 the text moves to run in full.
  assert.deepEqual(
    magicItems.filter((item) => itemLabel(item) === "run" && read(item)).map((item) => item.id),
    [
      "amulet-of-health",
      "armor-of-resistance",
      "belt-of-giant-strength",
      "bracers-of-archery",
      "bracers-of-defense",
      "gauntlets-of-ogre-power",
      "goggles-of-night",
      "headband-of-intellect",
      "mantle-of-spell-resistance",
      "periapt-of-proof-against-poison",
      "ring-of-resistance",
      "ring-of-swimming",
      "sentinel-shield",
    ]
  )
  // Why the rest are not run in full, by the first reason that holds.
  const typedRun = (id: string) => bonusesRun({ id, ...(magicItems.find((item) => item.id === id)?.variants ? { variant: "+1" } : {}) }).length > 0
  const reasons: Record<string, number> = {}
  for (const item of magicItems) {
    const label = itemLabel(item)
    if (label === "run") continue
    const reason =
      label === "partly run"
        ? typedRun(item.id)
          ? "typed bonuses run, the rest told"
          : read(item)
            ? "standing effects read, sentences told"
            : "used or cast in part (./item-use)"
        : item.consumable
          ? "consumable"
          : item.activation || item.charges || item.uses || item.spells || item.spellEffects
            ? "activated, charged or cast"
            : "standing text the reader does not know"
    reasons[`${label}: ${reason}`] = (reasons[`${label}: ${reason}`] ?? 0) + 1
  }
  assert.deepEqual(reasons, {
    "partly run: typed bonuses run, the rest told": 31,
    "partly run: standing effects read, sentences told": 21,
    "partly run: used or cast in part (./item-use)": 24,
    "told: consumable": 31,
    "told: activated, charged or cast": 92,
    "told: standing text the reader does not know": 33,
  })
  // An item read in full sends no text, and one read in part only the sentences it did not read.
  assert.deepEqual(readItem(magicItems.find((item) => item.id === "gauntlets-of-ogre-power")!).told, [])
})
