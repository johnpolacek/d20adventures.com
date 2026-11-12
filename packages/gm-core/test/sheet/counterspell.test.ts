import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { costWhenCountered, counterspellCost, counterspellMatters, counterspellOffer, counterspells } from "../../src/sheet/counterspell"
import { type Ask, ordered } from "../../src/sheet/reactions"
import type { Sheet } from "../../src/sheet/sheet"
import { spellById } from "../../src/sheet/spells"
import type { TurnEffect } from "../../src/sheet/turn-effect"

// Every expected value below was worked out by hand from the SRD 5.2.1 text of Counterspell, not copied from the function's output.

type Character = {
  id: string
  name: string
  type: string
  sheet?: Sheet
  statBlock?: string
  hitPoints: number
  position?: { x: number; y: number }
  spellSlots?: number[]
  featureUses?: Record<string, number>
  turnEffects?: TurnEffect[]
}
const base = (JSON.parse(readFileSync(new URL("../../../../content/settings/realm-of-myr/adventures/covert-cargo/characters/1749159962941.json", import.meta.url), "utf8")) as { sheet: Sheet }).sheet
// Lyra at level 5, an Evoker with Counterspell prepared: Intelligence 16 and a Proficiency Bonus of 3, DC 14. Two level 3 slots.
const lyra: Character = {
  id: "lyra",
  name: "Lyra",
  type: "pc",
  sheet: { ...base, level: 5, subclass: "evoker", spells: [...(base.spells ?? []), "counterspell"], spellbook: [...(base.spellbook ?? []), "counterspell"] },
  hitPoints: 22,
}
// A Mage: Constitution save +0, DC 14, and Protective Magic three times a day, which casts Counterspell or Shield.
const mage: Character = { id: "mage", name: "Kaeleth", type: "npc", statBlock: "mage", hitPoints: 81 }
const thalbern: Character = { id: "thalbern", name: "Thalbern", type: "pc", sheet: base, hitPoints: 11 }
const spell = (id: string) => spellById.get(id) as NonNullable<ReturnType<typeof spellById.get>>
const falls =
  (...dice: number[]) =>
  () => {
    if (!dice.length) throw new Error("no die left")
    return dice.shift() as number
  }
// Every offer answered by the default order: Counterspell when it matters.
const byOrder: Ask = (offer) => ordered(undefined, offer.id, offer.matters)

test("what Counterspell costs: a level 3 slot, or a Mage's Protective Magic", () => {
  assert.deepEqual(counterspellCost(lyra), { kind: "slot", level: 3 })
  assert.deepEqual(counterspellCost(mage), { kind: "free", feature: "Protective Magic" })
  // Three a day, shared with Shield: with three spent there is none.
  assert.equal(counterspellCost({ ...mage, featureUses: { "Protective Magic": 3 } }), undefined)
  // A countered spell's slot is not expended, and a use of a feature is.
  assert.deepEqual([costWhenCountered({ kind: "slot", level: 3 }), costWhenCountered({ kind: "free", feature: "x" })], [{ kind: "cantrip" }, { kind: "free", feature: "x" }])
})

test("when Counterspell may be offered, and when it matters", () => {
  // The Mage's Fireball at Thalbern: Lyra may counter it, and a level 3 spell matters.
  const offer = counterspellOffer({ counterer: lyra, caster: mage, spell: spell("fireball"), targets: ["thalbern"], characters: [lyra, mage, thalbern] })
  assert.deepEqual(offer, { id: "counterspell", to: "lyra", from: "mage", weapon: "fireball", matters: true })
  // Out of 60 feet, or with her Reaction spent, there is no offer. A hero does not counter a hero.
  const at = (one: Character, x: number): Character => ({ ...one, position: { x, y: 0 } })
  assert.equal(counterspellOffer({ counterer: at(lyra, 0), caster: at(mage, 70), spell: spell("fireball"), targets: [], characters: [] }), undefined)
  assert.equal(counterspellOffer({ counterer: { ...lyra, turnEffects: [{ id: "reacted", by: "lyra", turns: 1 }] }, caster: mage, spell: spell("fireball"), targets: [], characters: [] }), undefined)
  assert.equal(counterspellOffer({ counterer: lyra, caster: thalbern, spell: spell("cure-wounds"), targets: [], characters: [] }), undefined)
  // A cantrip never matters. A level 1 spell matters when it would harm one of the counterer's side, and not when it heals the caster's own.
  const matters = (id: string, targets: string[]) => counterspellMatters({ counterer: lyra, spell: spell(id), targets, characters: [lyra, mage, thalbern] })
  assert.deepEqual([matters("fire-bolt", ["thalbern"]), matters("magic-missile", ["thalbern"]), matters("healing-word", ["mage"]), matters("hold-person", ["mage"])], [false, true, false, false])
})

test("a countered spell: the counterer spends a slot and the Reaction, and the caster saves or loses the spell", () => {
  // Lyra counters the Mage's Fireball. The Mage's Constitution save is +0: a 9 against her DC 14 fails.
  const lost = counterspells({ characters: [mage, lyra, thalbern], casterId: "mage", spell: spell("fireball"), targets: ["thalbern"], ask: byOrder, d20: falls(9), roll: falls() })
  const after = lost.characters.find((one) => one.id === "lyra")
  assert.deepEqual([lost.countered, lost.saves[0].total, lost.saves[0].dc, after?.spellSlots, after?.turnEffects?.[0].id], [true, 9, 14, [0, 0, 1], "reacted"])
  assert.equal(lost.facts[0], "Lyra casts Counterspell. Kaeleth FAILS the Constitution saving throw (9 against DC 14), and Fireball dissipates with no effect.")
  // A 14 saves, and the Fireball goes on.
  assert.equal(counterspells({ characters: [mage, lyra, thalbern], casterId: "mage", spell: spell("fireball"), targets: ["thalbern"], ask: byOrder, d20: falls(14), roll: falls() }).countered, false)
  // The Mage counters Lyra's Fireball by its own order, with a use of Protective Magic. Lyra's Constitution is +0: a 13 fails against 14.
  const theirs = counterspells({ characters: [lyra, mage], casterId: "lyra", spell: spell("fireball"), targets: ["mage"], ask: byOrder, d20: falls(13), roll: falls() })
  assert.deepEqual([theirs.countered, theirs.characters.find((one) => one.id === "mage")?.featureUses], [true, { "Protective Magic": 1 }])
  // An order of never lets it pass, with nothing spent.
  const never = counterspells({ characters: [lyra, mage], casterId: "lyra", spell: spell("fireball"), targets: ["mage"], ask: () => false, d20: falls(), roll: falls() })
  assert.deepEqual([never.countered, never.reactions], [false, []])
})
