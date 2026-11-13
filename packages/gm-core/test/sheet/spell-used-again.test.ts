import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { attacksOf } from "../../src/sheet/attack"
import type { ConditionEntry } from "../../src/sheet/condition-entry"
import type { Sheet } from "../../src/sheet/sheet"
import { againOf, castAgain, castSpell, spellById, spellLabel } from "../../src/sheet/spells"
import type { SpellEffect } from "../../src/sheet/turn-effect"

// Every expected value below was worked out by hand from the SRD 5.2.1 spell texts, not copied from the function's output.

const spell = (id: string) => spellById.get(id) as NonNullable<ReturnType<typeof spellById.get>>
const sheet = (path: string) => (JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { sheet: Sheet }).sheet
type Character = {
  id: string
  name: string
  type: string
  sheet?: Sheet
  statBlock?: string
  hitPoints?: number
  spellEffects?: SpellEffect[]
  conditions?: ConditionEntry[]
  concentration?: { spell: string }
}
// Lyra, a level 1 Wizard with Intelligence 16: spell save DC 13, spell attack +5, spellcasting modifier +3.
const lyra: Character = { id: "lyra", name: "Lyra", type: "pc", sheet: sheet("covert-cargo/characters/1749159962941.json"), hitPoints: 6 }
// A Bandit: Armor Class 12, 11 hit points, Dexterity +1, Constitution +1. An Owlbear: Armor Class 13, 59 hit points.
const bandit: Character = { id: "bandit", name: "Bandit", type: "npc", statBlock: "bandit", hitPoints: 11 }
const other: Character = { ...bandit, id: "other", name: "Second Bandit" }
const owlbear: Character = { id: "owlbear", name: "Owlbear", type: "npc", statBlock: "owlbear", hitPoints: 59 }
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() as number
const find = (characters: readonly Character[], id: string) => characters.find((character) => character.id === id) as Character

test("Flame Blade and Produce Flame strike no one as they are cast, and strike with the action after", () => {
  // Evoked with a level 3 slot, the blade strikes no one, though a Bandit is named, and Lyra holds it.
  const blade = castSpell({ characters: [lyra, bandit], casterId: "lyra", spell: spell("flame-blade"), level: 3, targets: ["bandit"], d20: falls(), roll: falls() })
  assert.deepEqual([blade.attack, blade.harm, find(blade.characters, "bandit").hitPoints], [undefined, [], 11])
  assert.deepEqual(
    againOf(find(blade.characters, "lyra")).map((entry) => [entry.spell.id, entry.slot, entry.takes]),
    [["flame-blade", 3, "action"]]
  )
  // Used again: 15 and +5 is 20 against Armor Class 12, a hit. 3d6 and 1d6 for the level above, 1 + 1 + 1 + 1, and +3: 7.
  const struck = castAgain({ characters: blade.characters, casterId: "lyra", spellId: "flame-blade", targets: ["bandit"], attackDice: [15], d20: falls(), roll: falls(1, 1, 1, 1) })
  assert.equal(find(struck.characters, "bandit").hitPoints, 4)
  // Produce Flame takes no Concentration, and is held while it lasts. A level 1 caster's hurl is 1d8: a 6, to 5.
  const flame = castSpell({ characters: [lyra, bandit], casterId: "lyra", spell: spell("produce-flame"), targets: [], d20: falls(), roll: falls() })
  assert.equal(find(flame.characters, "lyra").concentration, undefined)
  assert.deepEqual(
    againOf(find(flame.characters, "lyra")).map((entry) => [entry.spell.id, entry.takes, entry.reach]),
    [["produce-flame", "action", 60]]
  )
  const hurled = castAgain({ characters: flame.characters, casterId: "lyra", spellId: "produce-flame", targets: ["bandit"], attackDice: [15], d20: falls(), roll: falls(6) })
  assert.equal(find(hurled.characters, "bandit").hitPoints, 5)
  // A blade whose Concentration is lost is no longer held.
  assert.deepEqual(againOf({ ...find(blade.characters, "lyra"), concentration: undefined }), [])
  assert.deepEqual([spellLabel(spell("flame-blade")), spellLabel(spell("produce-flame"))], ["run", "run"])
})

test("Arcane Sword strikes as it appears and with a Bonus Action after, from where the floor does not hold it", () => {
  // 15 and +5 hits the Owlbear's 13: 4d12 of 1s and +3 is 7, to 52. Again, 4d12 of 2s and +3 is 11, to 41.
  const sword = castSpell({ characters: [lyra, owlbear], casterId: "lyra", spell: spell("arcane-sword"), targets: ["owlbear"], attackDice: [15], d20: falls(), roll: falls(1, 1, 1, 1) })
  assert.equal(find(sword.characters, "owlbear").hitPoints, 52)
  assert.deepEqual(
    againOf(find(sword.characters, "lyra")).map((entry) => [entry.spell.id, entry.takes, entry.unplaced]),
    [["arcane-sword", "bonus-action", true]]
  )
  const again = castAgain({ characters: sword.characters, casterId: "lyra", spellId: "arcane-sword", targets: ["owlbear"], attackDice: [15], d20: falls(), roll: falls(2, 2, 2, 2) })
  assert.equal(find(again.characters, "owlbear").hitPoints, 41)
  assert.equal(spellLabel(spell("arcane-sword")), "run")
})

test("Sunbeam makes a new Line with the action, and each in it saves again", () => {
  // A 1 and +1 against DC 13 fails: 6d8 of 1s is 6, to 5, and Blinded. A new Line on the second Bandit does the same.
  const beam = castSpell({ characters: [lyra, bandit, other], casterId: "lyra", spell: spell("sunbeam"), targets: ["bandit"], d20: falls(1), roll: falls(1, 1, 1, 1, 1, 1) })
  assert.deepEqual([find(beam.characters, "bandit").hitPoints, find(beam.characters, "bandit").conditions?.map((entry) => entry.id)], [5, ["blinded"]])
  const line = castAgain({ characters: beam.characters, casterId: "lyra", spellId: "sunbeam", targets: ["other"], d20: falls(1), roll: falls(1, 1, 1, 1, 1, 1) })
  assert.deepEqual([find(line.characters, "other").hitPoints, find(line.characters, "other").conditions?.map((entry) => entry.id), line.saves.length], [5, ["blinded"], 1])
  assert.equal(spellLabel(spell("sunbeam")), "run")
})

test("Flaming Sphere burns no one as it appears, and its ram with a Bonus Action calls for the save", () => {
  // With a level 3 slot no one saves at the cast. Rammed, the Bandit rolls 5 and +1 against DC 13 and fails: 2d6 and
  // 1d6 for the level above, 1 + 2 + 3, is 6, to 5.
  const sphere = castSpell({ characters: [lyra, bandit], casterId: "lyra", spell: spell("flaming-sphere"), level: 3, targets: [], d20: falls(), roll: falls() })
  assert.deepEqual([sphere.saves.length, sphere.harm.length], [0, 0])
  assert.deepEqual(
    againOf(find(sphere.characters, "lyra")).map((entry) => [entry.spell.id, entry.slot, entry.takes]),
    [["flaming-sphere", 3, "bonus-action"]]
  )
  const rammed = castAgain({ characters: sphere.characters, casterId: "lyra", spellId: "flaming-sphere", targets: ["bandit"], d20: falls(5), roll: falls(1, 2, 3) })
  assert.equal(find(rammed.characters, "bandit").hitPoints, 5)
  // A success takes half: 6 halved to 3, to 8.
  const dodged = castAgain({ characters: sphere.characters, casterId: "lyra", spellId: "flaming-sphere", targets: ["bandit"], d20: falls(15), roll: falls(1, 2, 3) })
  assert.equal(find(dodged.characters, "bandit").hitPoints, 8)
  assert.equal(spellLabel(spell("flaming-sphere")), "partly")
})

test("Shillelagh makes a Quarterstaff strike with the caster's Wisdom and a d8, of the type chosen", () => {
  // Branka as a level 3 Druid: Strength 8 (-1), Wisdom 15 (+2), Proficiency Bonus +2. Her Quarterstaff is +1 to hit
  // for 1d6 - 1. Under Shillelagh, Wisdom takes Strength's place: +4 to hit, 1d8 + 2, Force as she chose.
  const druid: Sheet = {
    ...sheet("welcome-to-kordavos/characters/branka-stoneveil.json"),
    class: "druid",
    level: 3,
    subclass: "circle-of-the-land",
    abilityScores: { str: 8, dex: 13, con: 16, int: 13, wis: 15, cha: 10 },
    classSkills: ["animal-handling", "insight"],
    featureChoices: { "druid-primal-order": "warden", "circle-of-the-land-circle-of-the-land-spells": "arid" },
    armor: "leather-armor",
    shield: true,
    weapons: ["quarterstaff", "sickle"],
    weaponMasteries: [],
    cantrips: ["shillelagh", "starry-wisp"],
    spells: ["cure-wounds", "healing-word", "thunderwave", "animal-friendship", "heat-metal", "flame-blade"],
  }
  const branka: Character = { id: "branka", name: "Branka", type: "pc", sheet: druid, hitPoints: 20 }
  const staff = (character: Character) => attacksOf(character).find((attack) => attack.id === "quarterstaff")
  assert.deepEqual([staff(branka)?.bonus, staff(branka)?.damage], [1, [{ dice: "1d6 - 1", type: "bludgeoning" }]])
  const cast = castSpell({ characters: [branka], casterId: "branka", spell: spell("shillelagh"), targets: ["branka"], d20: falls(), roll: falls(), choice: "force" })
  const held = find(cast.characters, "branka")
  assert.deepEqual([staff(held)?.bonus, staff(held)?.damage], [4, [{ dice: "1d8 + 2", type: "force" }]])
  // The Sickle is neither Club nor Quarterstaff, and is as it was.
  assert.deepEqual(
    attacksOf(held).find((attack) => attack.id === "sickle"),
    attacksOf(branka).find((attack) => attack.id === "sickle")
  )
  assert.equal(spellLabel(spell("shillelagh")), "partly")
})
