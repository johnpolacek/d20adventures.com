import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { damageTaken, defensesOf } from "../../src/sheet/attack"
import type { ConditionEntry } from "../../src/sheet/condition-entry"
import { rollInitiative } from "../../src/sheet/initiative"
import type { Sheet } from "../../src/sheet/sheet"
import { saveModesFor } from "../../src/sheet/spell-effects"
import { castSpell, rollSave, spellById, spellLabel } from "../../src/sheet/spells"
import type { SpellEffect } from "../../src/sheet/turn-effect"

// Every expected value below was worked out by hand from the SRD 5.2.1 spell texts, not copied from the function's output.

const spell = (id: string) => spellById.get(id) as NonNullable<ReturnType<typeof spellById.get>>
const sheet = (path: string) => (JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { sheet: Sheet }).sheet
type Character = { id: string; name: string; type: string; sheet?: Sheet; statBlock?: string; hitPoints?: number; spellEffects?: SpellEffect[]; conditions?: ConditionEntry[] }
// Lyra, a Wizard with Intelligence 16: spell save DC 13, spell attack +5. Branka, a Fighter. A Bandit: Constitution +1.
const lyra: Character = { id: "lyra", name: "Lyra", type: "pc", sheet: sheet("covert-cargo/characters/1749159962941.json"), hitPoints: 6 }
const branka: Character = { id: "branka", name: "Branka", type: "pc", sheet: sheet("welcome-to-kordavos/characters/branka-stoneveil.json"), hitPoints: 14 }
const bandit: Character = { id: "bandit", name: "Bandit", type: "npc", statBlock: "bandit", hitPoints: 11 }
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() as number
const find = (characters: readonly Character[], id: string) => characters.find((character) => character.id === id) as Character

test("Blindness/Deafness gives the condition its caster chose, Blinded when none is named", () => {
  // The Bandit rolls 5 and +1 against DC 13: it fails.
  const deaf = castSpell({ characters: [lyra, bandit], casterId: "lyra", spell: spell("blindness-deafness"), targets: ["bandit"], d20: falls(5), roll: falls(), choice: "deafened" })
  assert.deepEqual(
    find(deaf.characters, "bandit").conditions?.map((entry) => entry.id),
    ["deafened"]
  )
  const blind = castSpell({ characters: [lyra, bandit], casterId: "lyra", spell: spell("blindness-deafness"), targets: ["bandit"], d20: falls(5), roll: falls() })
  assert.deepEqual(
    find(blind.characters, "bandit").conditions?.map((entry) => entry.id),
    ["blinded"]
  )
  assert.equal(spellLabel(spell("blindness-deafness")), "run")
})

test("Protection from Energy keeps its chosen type on the spell, and its bearer resists it", () => {
  const warded = castSpell({ characters: [lyra, branka], casterId: "lyra", spell: spell("protection-from-energy"), targets: ["branka"], d20: falls(), roll: falls(), choice: "fire" })
  const held = find(warded.characters, "branka")
  assert.deepEqual(held.spellEffects, [{ spell: "protection-from-energy", by: "lyra", choice: "fire" }])
  // 9 Fire is halved to 4, and 9 Cold is not.
  assert.deepEqual(
    [
      damageTaken({ parts: [{ type: "fire", dice: [9], bonus: 0, total: 9 }], total: 9 }, defensesOf(held)),
      damageTaken({ parts: [{ type: "cold", dice: [9], bonus: 0, total: 9 }], total: 9 }, defensesOf(held)),
    ],
    [4, 9]
  )
  assert.equal(spellLabel(spell("protection-from-energy")), "run")
})

test("Enhance Ability gives Advantage on checks with its chosen ability, Initiative among them, and Hex Disadvantage", () => {
  const enhanced = { ...branka, spellEffects: [{ spell: "enhance-ability", by: "lyra", choice: "dex" }] }
  // Acrobatics is a Dexterity check, Athletics a Strength one, and a Dexterity save is no ability check.
  assert.deepEqual(
    [saveModesFor(enhanced, { kind: "skill", skill: "acrobatics" }), saveModesFor(enhanced, { kind: "skill", skill: "athletics" }), saveModesFor(enhanced, { kind: "save", ability: "dex" })],
    [[{ mode: "advantage", from: "Enhance Ability (Dexterity)" }], [], []]
  )
  // Initiative with dice of 4 and 15 takes the 15.
  assert.equal(rollInitiative(enhanced, 4, 15) - rollInitiative(branka, 15), 0)
  const hexed = { ...bandit, spellEffects: [{ spell: "hex", by: "lyra", choice: "wis" }] }
  assert.deepEqual(saveModesFor(hexed, { kind: "skill", skill: "perception" }), [{ mode: "disadvantage", from: "Hex (Wisdom)" }])
  // A Hex on Strength puts no Disadvantage on a Strength save.
  const strong = { ...bandit, spellEffects: [{ spell: "hex", by: "lyra", choice: "str" }] }
  assert.equal(rollSave({ target: strong, ability: "str", dc: 13, d20: falls(10), roll: falls(), characters: [strong] }).mode, "normal")
  // Cast with no ability named, Hex takes the first its text offers, Strength.
  const cast = castSpell({ characters: [lyra, bandit], casterId: "lyra", spell: spell("hex"), targets: ["bandit"], d20: falls(), roll: falls() })
  assert.deepEqual(find(cast.characters, "bandit").spellEffects, [{ spell: "hex", by: "lyra", choice: "str" }])
})
