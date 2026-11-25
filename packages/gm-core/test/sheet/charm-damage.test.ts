import assert from "node:assert/strict"
import { test } from "node:test"
import { settleConcentration } from "../../src/sheet/spell-effects"
import "../../src/sheet/spells"

// Charm Person's Charmed lasts "until you or your allies damage it". Lyra charms Reinhard. His partner Silas, a foe of
// the party, stabs him: the charm holds. Thalbern, Lyra's ally, shoots him: it ends. So does a blow whose dealer is
// not known. Hypnotic Pattern ends on any damage at all.
const lyra = { id: "lyra", name: "Lyra", type: "pc", hitPoints: 8 }
const thalbern = { id: "thalbern", name: "Thalbern", type: "pc", hitPoints: 12 }
const silas = { id: "silas", name: "Silas", type: "npc", hitPoints: 16 }
const charmed = (spell: string) => ({ id: "reinhard", name: "Reinhard", type: "npc", hitPoints: 20, conditions: [{ id: "charmed" as const, source: "lyra", spell }] })
const hurt = (spell: string, by?: string) => {
  const was = charmed(spell)
  const settled = settleConcentration({ before: [lyra, thalbern, silas, was], after: [lyra, thalbern, silas, { ...was, hitPoints: 8 }], bonus: () => 0, d20: () => 10, by })
  return (settled.characters.find((character) => character.id === "reinhard") as { conditions?: readonly unknown[] } | undefined)?.conditions?.length ?? 0
}

test("a charm ends on damage from its caster's side, not a foe's", () => {
  assert.equal(hurt("charm-person", "silas"), 1)
  assert.equal(hurt("charm-person", "thalbern"), 0)
  assert.equal(hurt("charm-person", "lyra"), 0)
  assert.equal(hurt("charm-person"), 0)
  assert.equal(hurt("suggestion", "silas"), 1)
  assert.equal(hurt("hypnotic-pattern", "silas"), 0)
})
