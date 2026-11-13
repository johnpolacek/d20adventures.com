import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { attacksOf } from "../../src/sheet/attack"
import { checkBonus } from "../../src/sheet/check"
import type { Sheet } from "../../src/sheet/sheet"
import { endConcentration, settleConcentration } from "../../src/sheet/spell-effects"
import { castCost, castSpell, spellById, spellLabel } from "../../src/sheet/spells"
import { combatStatsOf } from "../../src/sheet/stat-block"
import type { Concentration } from "../../src/sheet/turn-effect"
import type { Shape } from "../../src/types/character"

// Every expected value below was worked out by hand from the SRD 5.2.1 spell texts and the Beasts' stat blocks, not
// copied from the function's output.

const spell = (id: string) => spellById.get(id) as NonNullable<ReturnType<typeof spellById.get>>
const sheet = (path: string) => (JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { sheet: Sheet }).sheet
type Character = { id: string; name: string; type: string; sheet?: Sheet; statBlock?: string; hitPoints?: number; tempHitPoints?: number; shape?: Shape; concentration?: Concentration }
// Lyra, a level 1 Wizard with Intelligence 16: spell save DC 13. Branka, a level 1 Fighter with Intelligence 10, of
// Lyra's party. A Bandit: Challenge Rating 1/8, Armor Class 12, 11 hit points, a Humanoid.
const lyra: Character = { id: "lyra", name: "Lyra", type: "pc", sheet: sheet("covert-cargo/characters/1749159962941.json"), hitPoints: 6 }
const branka: Character = { id: "branka", name: "Branka", type: "pc", sheet: sheet("welcome-to-kordavos/characters/branka-stoneveil.json"), hitPoints: 14 }
const bandit: Character = { id: "bandit", name: "Bandit", type: "npc", statBlock: "bandit", hitPoints: 11 }
const find = (characters: readonly Character[], id: string) => characters.find((character) => character.id === id) as Character
const cast = (id: string, characters: Character[], targets: string[], choice: string, d20 = 1) =>
  castSpell({ characters, casterId: "lyra", spell: spell(id), targets, choice, d20: () => d20, roll: () => 1 })

test("Polymorph makes a creature that fails its save the Beast chosen, its Hit Points kept beneath the form's Temporary ones", () => {
  // The Bandit fails its Wisdom save on a 1. A Frog: Challenge Rating 0, Armor Class 11, 1 Hit Point, Bite +3.
  const done = cast("polymorph", [lyra, bandit], ["bandit"], "frog")
  const frog = find(done.characters, "bandit")
  assert.deepEqual(frog.shape, { form: "frog", hours: 1, spell: "polymorph", by: "lyra" })
  // "retains its ... Hit Points": its maximum is still 11. "gains a number of Temporary Hit Points equal to the Hit
  // Points of the Beast form": 1.
  assert.deepEqual([combatStatsOf(frog), frog.hitPoints, frog.tempHitPoints], [{ hitPointMaximum: 11, armorClass: 11, from: "Frog" }, 11, 1])
  assert.deepEqual(
    attacksOf(frog).map((attack) => [attack.name, attack.bonus]),
    [["Bite", 3]]
  )
  // "The spell ends early on the target if it has no Temporary Hit Points left": a blow of 1 takes the 1, and the
  // Bandit is itself again, Armor Class 12.
  const struck = settleConcentration({
    before: done.characters,
    after: done.characters.map((each) => (each.id === "bandit" ? { ...each, tempHitPoints: undefined } : each)),
    bonus: () => 0,
    d20: () => 10,
  })
  assert.deepEqual([find(struck.characters, "bandit").shape, combatStatsOf(find(struck.characters, "bandit"))?.armorClass], [undefined, 12])
  // Concentration lost ends it too, and "These Temporary Hit Points vanish if any remain when the spell ends."
  const ended = find(endConcentration(done.characters, "lyra").characters, "bandit")
  assert.deepEqual([ended.shape, ended.tempHitPoints], [undefined, undefined])
  // A Giant Ape is Challenge Rating 7, beyond the Bandit's 1/8: no shape is taken.
  assert.equal(find(cast("polymorph", [lyra, bandit], ["bandit"], "giant-ape").characters, "bandit").shape, undefined)
  assert.equal(spellLabel(spell("polymorph")), "partly")
})

test("A hero in a spell's shape takes its scores as the spell says, and casts only by Shapechange", () => {
  // Branka is of Lyra's side and chooses to fail the save. A Wolf: Challenge Rating 1/4, within her level of 1, 11 Hit
  // Points, Intelligence 3 (−4). Polymorph replaces all six scores: her Intelligence check is −4.
  const wolf = find(cast("polymorph", [lyra, branka], ["branka"], "wolf", 20).characters, "branka")
  assert.deepEqual([wolf.shape?.form, wolf.tempHitPoints, checkBonus(wolf, { kind: "ability", ability: "int" })], ["wolf", 11, -4])
  // Animal Shapes keeps her Intelligence, Wisdom and Charisma: her own 10, +0, for 24 hours.
  const beast = find(cast("animal-shapes", [lyra, branka], ["branka"], "wolf").characters, "branka")
  assert.deepEqual([beast.shape?.hours, checkBonus(beast, { kind: "ability", ability: "int" })], [24, 0])
  // "it can't speak or cast spells": Lyra as a Wolf casts no Ray of Frost. Shapechange keeps her Spellcasting: as a
  // Brown Bear, Challenge Rating 1 and 22 Hit Points, she still casts it.
  const shifted = (id: string, form: string) => find(cast(id, [lyra], ["lyra"], form, 20).characters, "lyra")
  assert.match((castCost(shifted("polymorph", "wolf"), "ray-of-frost") as { problem: string }).problem, /cannot cast spells in the shape of a Wolf/)
  const bear = shifted("shapechange", "brown-bear")
  assert.deepEqual([bear.shape?.form, bear.tempHitPoints, "cost" in castCost(bear, "ray-of-frost")], ["brown-bear", 22, true])
  for (const id of ["true-polymorph", "animal-shapes", "shapechange"]) assert.equal(spellLabel(spell(id)), "partly")
})
