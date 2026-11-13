import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { monsterById, monsters } from "@d20/srd/monsters"
import { spellById } from "@d20/srd/spells"
import type { ConditionEntry } from "../../src/sheet/condition-entry"
import { hasCondition } from "../../src/sheet/conditions"
import { LEGENDARY_ACTIONS, legendaryActionsAfter, legendaryActionsOf, readLegendaryActions, withLegendaryActionsRegained } from "../../src/sheet/legendary-actions"
import { LEGENDARY_RESISTANCE, legendaryResistanceOf } from "../../src/sheet/legendary-resistance"
import type { EncounterFloor } from "../../src/sheet/placement"
import type { Sheet } from "../../src/sheet/sheet"
import { castSpell } from "../../src/sheet/spells"

// Every expected value below was worked out by hand from the SRD 5.2.1 stat blocks of the Adult Red Dragon and the
// Unicorn, and the text of Hold Monster and Sacred Flame, not copied from the functions' output.

type Character = {
  id: string
  name: string
  type: string
  sheet?: Sheet
  statBlock?: string
  hitPoints: number
  initiative?: number
  position?: { x: number; y: number }
  conditions?: ConditionEntry[]
  featureUses?: Record<string, number>
  isComplete?: boolean
  hasReplied?: boolean
}
const sheetAt = (path: string) => (JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { sheet: Sheet }).sheet
const thalbern: Character = { id: "thalbern", name: "Thalbern", type: "pc", sheet: sheetAt("the-midnight-summons/characters/thalbern.json"), hitPoints: 11, initiative: 15, isComplete: true }
const milos: Character = { id: "milos", name: "Milos", type: "pc", sheet: sheetAt("welcome-to-kordavos/characters/milos-radan.json"), hitPoints: 9, initiative: 12 }
const dragon: Character = { id: "dragon", name: "The Red Dragon", type: "npc", statBlock: "adult-red-dragon", hitPoints: 256, initiative: 10 }
const unicorn: Character = { id: "unicorn", name: "The Unicorn", type: "npc", statBlock: "unicorn", hitPoints: 97, initiative: 10 }
const falls =
  (...dice: number[]) =>
  () => {
    if (!dice.length) throw new Error("no die left")
    return dice.shift() as number
  }
const twos = () => 2
const no = () => false
// An open floor with nothing on it.
const floor: EncounterFloor = { solids: [], doors: [], places: [], cast: [], party: [], spare: [] }

test("a block's Legendary Actions, read from its words", () => {
  // "Legendary Action Uses: 3 (4 in Lair)." Pounce: "The dragon moves up to half its Speed, and it makes one Rend
  // attack." Commanding Presence and Fiery Rays cast Command and Scorching Ray with Spellcasting.
  const red = readLegendaryActions(monsterById.get("adult-red-dragon") as never)
  assert.ok(red && !("unread" in red))
  assert.equal(red.uses, 3)
  assert.equal(red.inLair, 4)
  assert.deepEqual(red.options, [{ name: "Pounce", attacks: ["rend"], move: { kind: "walk" } }])
  assert.deepEqual(
    red.skipped.map((entry) => [entry.name, entry.kind]),
    [
      ["Commanding Presence", "spell"],
      ["Fiery Rays", "spell"],
    ]
  )
  // "Legendary Action Uses: 3." Charging Horn moves "without provoking Opportunity Attacks". Shimmering Shield gives
  // Temporary Hit Points and Armor Class, which no option the engine reads does.
  const horn = readLegendaryActions(monsterById.get("unicorn") as never)
  assert.ok(horn && !("unread" in horn))
  assert.equal(horn.uses, 3)
  assert.equal(horn.inLair, undefined)
  assert.deepEqual(horn.options, [{ name: "Charging Horn", attacks: ["radiant-horn"], move: { kind: "walk", disengaged: true } }])
  assert.deepEqual(
    horn.skipped.map((entry) => entry.name),
    ["Shimmering Shield"]
  )
  // The Sphinx of Lore's Arcane Prowl: "can teleport up to 30 feet to an unoccupied space it can see".
  const sphinx = readLegendaryActions(monsterById.get("sphinx-of-lore") as never)
  assert.ok(sphinx && !("unread" in sphinx))
  assert.deepEqual(sphinx.options, [{ name: "Arcane Prowl", attacks: ["claw"], move: { kind: "teleport", feet: 30 } }])
})

test("all 330 blocks: who has Legendary Actions and Legendary Resistance, and which options are read", () => {
  // Counted by hand from the SRD's sections: 20 dragons with 3 options each, and the Aboleth, Kraken, Solar, both
  // Sphinxes, Tarrasque, Unicorn and Vampire with 2, the Lich and Mummy Lord with 3: 82 options in 30 blocks. Read: 18
  // Pounces, 2 Tail Swipes, Lash, Necrotic Strike, 2 Arcane Prowls, Onslaught, Charging Horn and Deathless Strike.
  assert.equal(monsters.length, 330)
  const read = monsters.flatMap((monster) => {
    const found = readLegendaryActions(monster)
    return found ? [found] : []
  })
  assert.equal(read.length, 30)
  assert.ok(read.every((found) => !("unread" in found)))
  const all = read.flatMap((found) => ("options" in found ? [found] : []))
  assert.equal(
    all.reduce((sum, found) => sum + found.options.length, 0),
    27
  )
  const kinds: Record<string, number> = {}
  for (const found of all) for (const entry of found.skipped) kinds[entry.kind] = (kinds[entry.kind] ?? 0) + 1
  // 27 cast a spell. 22 force a save, left to the actions with a save. 3 use another action: Psychic Drain, Storm
  // Bolt, Glare. 3 have words no reader takes: Deathly Teleport, World-Shaking Movement, Shimmering Shield.
  assert.deepEqual(kinds, { spell: 27, save: 22, action: 3, words: 3 })
  // Every Legendary block has Legendary Resistance, and so do the Balor and the Pit Fiend, which have no Legendary
  // Actions. None of the 19 in the adventures has either.
  const resists = monsters.filter((monster) => legendaryResistanceOf({ type: "npc", statBlock: monster.id }))
  assert.equal(resists.length, 32)
  for (const id of [
    "bandit",
    "bandit-captain",
    "commoner",
    "cultist",
    "cultist-fanatic",
    "druid",
    "green-dragon-wyrmling",
    "guard",
    "guard-captain",
    "mage",
    "noble",
    "owlbear",
    "priest",
    "priest-acolyte",
    "scout",
    "skeleton",
    "spy",
    "tough",
    "warrior-infantry",
  ]) {
    assert.equal(legendaryActionsOf({ type: "npc", statBlock: id }), undefined, id)
    assert.equal(legendaryResistanceOf({ type: "npc", statBlock: id }), undefined, id)
  }
})

test("three uses a round, all regained as its own turn begins", () => {
  assert.equal(legendaryActionsOf(dragon)?.left, 3)
  const spent = { ...dragon, featureUses: { [LEGENDARY_ACTIONS]: 2 } }
  assert.equal(legendaryActionsOf(spent)?.left, 1)
  const regained = withLegendaryActionsRegained(spent)
  assert.equal(legendaryActionsOf(regained)?.left, 3)
  assert.deepEqual(regained.featureUses, {})
  // A hero has none, whatever stat block is named on them.
  assert.equal(legendaryActionsOf({ ...thalbern, statBlock: "adult-red-dragon" }), undefined)
})

test("after another creature's turn the dragon Pounces; not after its own, or while Incapacitated", () => {
  // No floor: the Rend reaches Thalbern. The d20 falls 15: 15 + 14 = 29 hits his Armor Class of 15. Rend deals 1d10 +
  // 8 Slashing and 2d4 Fire: with every die a 2, 10 + 4 = 14, more than his 11 hit points. He drops to 0. One use of 3
  // is spent.
  const after = legendaryActionsAfter({ characters: [thalbern, dragon], endedId: "thalbern", d20: falls(15), roll: twos, ask: no })
  assert.equal(after.taken.length, 1)
  const [pounce] = after.taken
  assert.equal(pounce.name, "Pounce")
  assert.equal(pounce.target, "thalbern")
  assert.equal(pounce.blow?.roll.total, 29)
  assert.equal(after.characters.find((character) => character.id === "thalbern")?.hitPoints, 0)
  assert.equal(after.characters.find((character) => character.id === "dragon")?.featureUses?.[LEGENDARY_ACTIONS], 1)
  // After its own turn it takes none.
  assert.equal(legendaryActionsAfter({ characters: [thalbern, dragon], endedId: "dragon", d20: falls(), roll: twos, ask: no }).taken.length, 0)
  // "Immediately after another creature's turn": after an NPC's too, a Bandit's, it Pounces on Thalbern, its one enemy
  // here, by the same dice. A bystander beside it is never taken.
  const bandit: Character = { id: "bandit", name: "Bandit", type: "npc", statBlock: "bandit", hitPoints: 11 }
  const merchant = { id: "merchant", name: "Merchant", type: "npc", statBlock: "commoner", hitPoints: 4, side: "none" as const }
  const afterNpc = legendaryActionsAfter({ characters: [merchant, thalbern, dragon, bandit], endedId: "bandit", d20: falls(15), roll: twos, ask: no })
  assert.deepEqual(
    afterNpc.taken.map((taken) => [taken.name, taken.target]),
    [["Pounce", "thalbern"]]
  )
  // With only the bystander here, it has no enemy and takes none.
  assert.equal(legendaryActionsAfter({ characters: [merchant, dragon], endedId: "merchant", d20: falls(), roll: twos, ask: no }).taken.length, 0)
  // Stunned carries Incapacitated: none.
  const stunned = { ...dragon, conditions: [{ id: "stunned" as const }] }
  assert.equal(legendaryActionsAfter({ characters: [thalbern, stunned], endedId: "thalbern", d20: falls(), roll: twos, ask: no }).taken.length, 0)
  // With all three spent: none.
  const spent = { ...dragon, featureUses: { [LEGENDARY_ACTIONS]: 3 } }
  assert.equal(legendaryActionsAfter({ characters: [thalbern, spent], endedId: "thalbern", d20: falls(), roll: twos, ask: no }).taken.length, 0)
})

test("Pounce moves half its Speed toward the nearest hero, then makes its Rend", () => {
  // The dragon is Huge, its space 5 feet beyond a square each side. At (0, 0) with Thalbern at (30, 0) it is 30 − 5 =
  // 25 feet from him, out of the Rend's 10. Half its walking Speed of 40 is 20. To stand within 10 it stops 10 + 5 =
  // 15 short of his centre: it walks 15 feet to (15, 0), 10 feet from him, and makes the Rend: 15 + 14 = 29.
  const hero = { ...thalbern, position: { x: 30, y: 0 } }
  const red = { ...dragon, position: { x: 0, y: 0 } }
  const after = legendaryActionsAfter({ characters: [hero, red], endedId: "thalbern", floor, d20: falls(15), roll: twos, ask: no })
  const [pounce] = after.taken
  assert.equal(pounce.moved, 15)
  assert.deepEqual(after.characters.find((character) => character.id === "dragon")?.position, { x: 15, y: 0 })
  assert.equal(pounce.blow?.roll.total, 29)
  assert.equal(pounce.blow?.taken, 14)
})

test("Legendary Resistance: spent on Hold Monster, not on a cantrip's small harm, and none left after three", () => {
  const silver: Character = { id: "silver", name: "The Silver Dragon", type: "npc", statBlock: "adult-silver-dragon", hitPoints: 216 }
  const hold = spellById.get("hold-monster") as never
  // Hold Monster, DC 19 by the Silver Dragon's Spellcasting. The Red Dragon's Wisdom save is +7: a 5 makes 12, a
  // failure. Paralyzed would take its turns, so it chooses to succeed, and one use of 3 is spent.
  const held = castSpell({ characters: [silver, dragon], casterId: "silver", spell: hold, targets: ["dragon"], d20: falls(5), roll: twos })
  assert.equal(held.saves[0].total, 12)
  assert.equal(held.saves[0].success, true)
  assert.equal(held.saves[0].legendary, true)
  const red = held.characters.find((character) => character.id === "dragon") as Character
  assert.equal(hasCondition(red, "paralyzed"), false)
  assert.equal(red.featureUses?.[LEGENDARY_RESISTANCE], 1)
  assert.equal(legendaryResistanceOf(red)?.left, 2)
  // With all three spent the same failure holds it.
  const spent = { ...dragon, featureUses: { [LEGENDARY_RESISTANCE]: 3 } }
  const caught = castSpell({ characters: [silver, spent], casterId: "silver", spell: hold, targets: ["dragon"], d20: falls(5), roll: twos })
  assert.equal(caught.saves[0].success, false)
  assert.equal(hasCondition(caught.characters.find((character) => character.id === "dragon") as Character, "paralyzed"), true)
  // Sacred Flame at level 1: a Dexterity save, +6 for the dragon, and 1d8 Radiant on a failure. A 1 makes 7, which
  // fails Milos's DC. An 8 on the d8 is 8 damage, under a quarter of 256: no use is spent, and it takes the 8.
  const flame = castSpell({ characters: [milos, dragon], casterId: "milos", spell: spellById.get("sacred-flame") as never, targets: ["dragon"], d20: falls(1), roll: () => 8 })
  assert.equal(flame.saves[0].success, false)
  assert.equal(flame.saves[0].legendary, undefined)
  const burnt = flame.characters.find((character) => character.id === "dragon") as Character
  assert.equal(burnt.featureUses?.[LEGENDARY_RESISTANCE], undefined)
  assert.equal(burnt.hitPoints, 248)
})

test("Pounce draws an Opportunity Attack as it leaves a hero's reach", () => {
  // Milos stands at (−10, 0), 10 − 5 = 5 feet from the Huge dragon, in his reach. The dragon is Charmed by him, so it
  // will not strike him, and Pounces at Thalbern at (35, 0), 30 feet away: it walks its 20 feet to (20, 0), 10 from
  // Thalbern, leaving Milos's reach. Milos strikes first with the first d20, then the Rend falls with the second.
  const charmed = { ...dragon, position: { x: 0, y: 0 }, conditions: [{ id: "charmed" as const, source: "milos" }] }
  const beside = { ...milos, position: { x: -10, y: 0 } }
  const far = { ...thalbern, position: { x: 35, y: 0 } }
  const after = legendaryActionsAfter({ characters: [beside, far, charmed], endedId: "thalbern", floor, d20: falls(10, 15), roll: twos, ask: () => true })
  const [pounce] = after.taken
  assert.equal(pounce.moved, 20)
  assert.deepEqual(
    pounce.opportunity.map((made) => made.attacker),
    ["milos"]
  )
  assert.equal(pounce.target, "thalbern")
  assert.equal(pounce.blow?.roll.total, 29)
})

test("the Unicorn's Charging Horn, and none after three uses", () => {
  // The Unicorn is Large, 2.5 feet beyond a square. With Milos at (−5, 0), 5 − 2.5 = 2.5 feet away, and Thalbern at
  // (30, 0), Milos is the nearest its Radiant Horn reaches, so it strikes him with no move: a 10 and +7 is 17.
  const beside = { ...milos, position: { x: -5, y: 0 } }
  const far = { ...thalbern, position: { x: 30, y: 0 } }
  const horn = { ...unicorn, position: { x: 0, y: 0 } }
  const first = legendaryActionsAfter({ characters: [beside, far, horn], endedId: "thalbern", floor, d20: falls(10), roll: twos, ask: no })
  assert.equal(first.taken[0].name, "Charging Horn")
  assert.equal(first.taken[0].target, "milos")
  assert.equal(first.taken[0].moved, undefined)
  assert.equal(first.taken[0].blow?.roll.total, 17)
  // After three uses this round, none.
  const tired = { ...horn, featureUses: { [LEGENDARY_ACTIONS]: 3 } }
  assert.equal(legendaryActionsAfter({ characters: [beside, far, tired], endedId: "thalbern", floor, d20: falls(), roll: twos, ask: no }).taken.length, 0)
})
