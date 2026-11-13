import assert from "node:assert/strict"
import { test } from "node:test"
import { autoCreate, type CreationPick, createSheet } from "../../src/sheet/create"
import { deriveSheet, sheetProblems } from "../../src/sheet/derive"
import { levelUp, levelUpOptions } from "../../src/sheet/level-up"
import { autoChoices, autoPicks } from "../../src/sheet/milestone"
import type { FeaturePick, Sheet } from "../../src/sheet/sheet"
import { type Castee, castCost, castSpell, spellById, spellcastingFor, spellsOf } from "../../src/sheet/spells"

// Every expected value below was worked out by hand from the SRD 5.2.1 text, not copied from the function's output.
// Pact of the Tome (page 74): "choose three cantrips, and choose two level 1 spells that have the Ritual tag. The
// spells can be from any class's spell list, and they must be spells you don't already have prepared. While the book
// is on your person, you have the chosen spells prepared, and they function as Warlock spells for you."
// Vex is a level 1 human Warlock, Criminal, made by the creator: Charisma 15 (+2), Proficiency Bonus +2, so her spell
// attacks are +4. She knows Chill Touch and Eldritch Blast and prepares Hex and Bane, with one level 1 Pact slot. An
// Ogre has Armor Class 11 and 68 hit points. Every damage die falls as 4.

const pick = { class: "warlock", species: "human", background: "criminal" } as unknown as CreationPick
const INVOCATIONS = "warlock-eldritch-invocations"
const BOOK = ["fire-bolt", "mage-hand", "minor-illusion", "detect-magic", "find-familiar"]
const made = (picks: FeaturePick[]) => createSheet(pick, { ...autoCreate(pick), featurePicks: { [INVOCATIONS]: picks } })
const problemsOf = (picks: FeaturePick[]) => {
  const result = made(picks)
  return "problems" in result ? result.problems : []
}
const vex = (): Castee & { sheet: Sheet } => {
  const result = made([{ option: "pact-of-the-tome", spells: BOOK }])
  if ("problems" in result) assert.fail(result.problems.join("; "))
  return { id: "vex", name: "Vex", type: "pc", sheet: result.sheet, hitPoints: 9 } as Castee & { sheet: Sheet }
}
const ogre = (): Castee => ({ id: "ogre", name: "Ogre", type: "npc", statBlock: "ogre", hitPoints: 68 }) as Castee

test("The Book of Shadows holds three cantrips and two level 1 Ritual spells of any list, none the hero already has", () => {
  assert.deepEqual(problemsOf([{ option: "pact-of-the-tome", spells: BOOK }]), [])
  assert.deepEqual(problemsOf([{ option: "pact-of-the-tome" }]), ["the Book of Shadows holds 3 cantrips and 2 level 1 Ritual spells, and the pick has 0 and 0"])
  // Sleep is a level 1 spell with no Ritual tag. Chill Touch is a cantrip she already knows.
  assert.deepEqual(problemsOf([{ option: "pact-of-the-tome", spells: ["fire-bolt", "mage-hand", "chill-touch", "detect-magic", "sleep"] }]), [
    "Sleep is neither a cantrip nor a level 1 Ritual spell, so the Book of Shadows cannot hold it",
    "the Book of Shadows holds 3 cantrips and 2 level 1 Ritual spells, and the pick has 3 and 1",
    "the hero already has Chill Touch, so the Book of Shadows cannot hold it",
  ])
  assert.deepEqual(problemsOf([{ option: "armor-of-shadows", spells: ["fire-bolt"] }]), ["Armor of Shadows takes no spells"])
})

test("Its cantrips are known and its rituals always prepared, cast as Warlock spells: a ritual with no slot or with a Pact slot", () => {
  const hero = vex()
  const derived = deriveSheet(hero.sheet)
  assert.deepEqual(derived.cantrips, ["chill-touch", "eldritch-blast", "fire-bolt", "mage-hand", "minor-illusion"])
  assert.deepEqual(derived.preparedSpells, ["hex", "bane", "detect-magic", "find-familiar"])
  const known = spellsOf(hero).filter((entry) => BOOK.includes(entry.spell.id))
  assert.deepEqual(
    known.map((entry) => [entry.spell.id, entry.cantrip, entry.prepared, entry.ritual, entry.ability]),
    [
      ["fire-bolt", true, true, false, undefined],
      ["mage-hand", true, true, false, undefined],
      ["minor-illusion", true, true, false, undefined],
      ["detect-magic", false, true, true, undefined],
      ["find-familiar", false, true, true, undefined],
    ]
  )
  // Fire Bolt is a Warlock spell for her: Charisma, +2 + 2 = +4, a cantrip with no cost. 1d10 falls 4: the Ogre is left 64.
  assert.equal(spellcastingFor(hero, "fire-bolt")?.attackBonus, 4)
  assert.deepEqual((castCost(hero, "fire-bolt") as { cost: unknown }).cost, { kind: "cantrip" })
  const bolt = castSpell({ characters: [hero, ogre()], casterId: "vex", spell: spellById.get("fire-bolt") ?? assert.fail(), targets: ["ogre"], attackDice: [15], d20: () => 15, roll: () => 4 })
  assert.equal(bolt.characters.find((character) => character.id === "ogre")?.hitPoints, 64)
  // Detect Magic cast as a Ritual spends nothing, and cast with a slot spends her level 1 Pact slot.
  assert.deepEqual((castCost(hero, "detect-magic", true) as { cost: unknown }).cost, { kind: "ritual" })
  assert.deepEqual((castCost(hero, "detect-magic") as { cost: unknown }).cost, { kind: "slot", level: 1 })
})

test("The level-up screen offers the book's spells less those she has, and the picks that need no player fill it", () => {
  const plain = made([{ option: "armor-of-shadows" }])
  if ("problems" in plain) assert.fail(plain.problems.join("; "))
  const offer = levelUpOptions(plain.sheet).featurePicks?.find((entry) => entry.feature.id === INVOCATIONS)
  const book = offer?.options.find((option) => option.id === "pact-of-the-tome")?.book
  assert.deepEqual([book?.cantrips, book?.rituals], [3, 2])
  // Every class's cantrips and level 1 Ritual spells, but Chill Touch and Eldritch Blast, which she knows.
  assert.ok(book?.from.some((spell) => spell.id === "guidance") && book.from.some((spell) => spell.id === "find-familiar"))
  assert.ok(!book?.from.some((spell) => ["chill-touch", "eldritch-blast", "sleep", "hex"].includes(spell.id)))
  // A Tome picked with no spells is filled with three cantrips and two rituals she lacks.
  const filled = autoPicks(
    { ...(offer ?? assert.fail()), picked: [{ option: "pact-of-the-tome" }], count: 1 },
    2,
    ["chill-touch", "eldritch-blast"],
    [],
    ["chill-touch", "eldritch-blast", "hex", "bane"]
  )
  const spells = filled[0]?.spells ?? []
  assert.deepEqual([spells.length, spells.filter((id) => spellById.get(id)?.level === 0).length, spells.filter((id) => spellById.get(id)?.ritual).length], [5, 3, 2])
  // Choose For Me keeps a filled book as it is, and the level it takes is legal.
  const choices = autoChoices(vex().sheet)
  assert.deepEqual(choices.featurePicks?.[INVOCATIONS]?.[0], { option: "pact-of-the-tome", spells: BOOK })
  assert.ok(!choices.spells?.some((id) => BOOK.includes(id)))
})

test("Raised to level 5 by the choices that need no player, a Warlock with the Tome stays legal", () => {
  let sheet = vex().sheet
  while (sheet.level < 5) {
    const result = levelUp(sheet, autoChoices(sheet))
    if ("problems" in result) assert.fail(result.problems.join("; "))
    sheet = result.sheet
  }
  assert.deepEqual(sheetProblems(sheet), [])
  assert.deepEqual(sheet.featurePicks?.[INVOCATIONS]?.[0], { option: "pact-of-the-tome", spells: BOOK })
})
