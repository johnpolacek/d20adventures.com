import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import type { ConditionEntry } from "../../src/sheet/condition-entry"
import type { Sheet } from "../../src/sheet/sheet"
import { attackModesFromSpells, saveModesFor, settleConcentration } from "../../src/sheet/spell-effects"
import { spellsAtRoundEnd } from "../../src/sheet/spell-rounds"
import { castSpell, spellById, spellLabel } from "../../src/sheet/spells"
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
// Lyra, a Wizard with Intelligence 16: spell save DC 13, spellcasting modifier +3, 6 hit points.
const lyra: Character = { id: "lyra", name: "Lyra", type: "pc", sheet: sheet("covert-cargo/characters/1749159962941.json"), hitPoints: 6 }
// A Bandit: 11 hit points, Constitution +1, Wisdom +0. An Owlbear: 59 hit points, Constitution +3, Intelligence -4,
// Wisdom +1. A Wolf, a Beast: Wisdom +1. An Animated Armor, a Construct.
const bandit: Character = { id: "bandit", name: "Bandit", type: "npc", statBlock: "bandit", hitPoints: 11 }
const owlbear: Character = { id: "owlbear", name: "Owlbear", type: "npc", statBlock: "owlbear", hitPoints: 59 }
const wolf: Character = { id: "wolf", name: "Wolf", type: "npc", statBlock: "wolf", hitPoints: 11 }
const armor: Character = { id: "armor", name: "Animated Armor", type: "npc", statBlock: "animated-armor", hitPoints: 33 }
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() as number
const ones = (count: number) => Array.from({ length: count }, () => 1)
const find = (characters: readonly Character[], id: string) => characters.find((character) => character.id === id) as Character
const round = (characters: readonly Character[], d20: () => number, roll: () => number = falls()) => spellsAtRoundEnd({ characters, d20, roll }).characters

test("Phantasmal Killer deals its damage again on each failed save at the end of a turn, and ends on a success", () => {
  // Cast with a level 5 slot: the Owlbear rolls 5 and +1, 6 against DC 13, and fails. 4d10 and 1d10 for the level above:
  // 1 + 2 + 3 + 4 + 5 is 15, so 59 falls to 44. The effect holds the slot, and the minute is ten turns.
  const cast = castSpell({ characters: [lyra, owlbear], casterId: "lyra", spell: spell("phantasmal-killer"), level: 5, targets: ["owlbear"], d20: falls(5), roll: falls(1, 2, 3, 4, 5) })
  const struck = find(cast.characters, "owlbear")
  assert.deepEqual([struck.hitPoints, struck.spellEffects], [44, [{ spell: "phantasmal-killer", by: "lyra", turns: 10, amount: 5 }]])
  // Disadvantage on its attack rolls and ability checks, and none on its saves.
  assert.deepEqual(attackModesFromSpells(struck, lyra), [{ mode: "disadvantage", from: "Phantasmal Killer" }])
  assert.deepEqual(saveModesFor(struck, { kind: "skill", skill: "perception" }), [{ mode: "disadvantage", from: "Phantasmal Killer" }])
  assert.deepEqual(saveModesFor(struck, { kind: "save", ability: "wis" }), [])
  // A 3 and +1 fails again: 5d10 of 2s is 10 more, to 34. Then a 12 and +1 makes 13, and the spell ends on it.
  const failed = round(cast.characters, falls(3), falls(2, 2, 2, 2, 2))
  assert.equal(find(failed, "owlbear").hitPoints, 34)
  const ended = round(failed, falls(12))
  assert.deepEqual([find(ended, "owlbear").hitPoints, find(ended, "owlbear").spellEffects], [34, undefined])
  // A success at the cast takes half and ends the spell: 4d10 of 4s is 16, halved to 8, and Lyra holds nothing.
  const passed = castSpell({ characters: [lyra, owlbear], casterId: "lyra", spell: spell("phantasmal-killer"), targets: ["owlbear"], d20: falls(15), roll: falls(4, 4, 4, 4) })
  assert.deepEqual([find(passed.characters, "owlbear").hitPoints, find(passed.characters, "lyra").concentration], [51, undefined])
  assert.equal(spellLabel(spell("phantasmal-killer")), "run")
})

test("Weird's Frightened target takes 5d10 on each failed save, and Vitriolic Sphere burns again at the end of the next turn", () => {
  // Weird: a 2 and +1 fails, 10d10 of 1s is 10, to 49, and Frightened. At the turn's end a 1 fails: 5d10 of 1s, to 44.
  const weird = castSpell({ characters: [lyra, owlbear], casterId: "lyra", spell: spell("weird"), targets: ["owlbear"], d20: falls(2), roll: falls(...ones(10)) })
  assert.deepEqual([find(weird.characters, "owlbear").hitPoints, find(weird.characters, "owlbear").conditions?.map((entry) => entry.id)], [49, ["frightened"]])
  assert.equal(find(round(weird.characters, falls(1), falls(...ones(5))), "owlbear").hitPoints, 44)
  // Vitriolic Sphere: a 1 and +1 on the Dexterity save fails, 10d4 of 1s is 10, to 49. At the end of its next turn
  // another 5d4 of 1s, to 44.
  const sphere = castSpell({ characters: [lyra, owlbear], casterId: "lyra", spell: spell("vitriolic-sphere"), targets: ["owlbear"], d20: falls(1), roll: falls(...ones(10)) })
  assert.deepEqual(find(sphere.characters, "owlbear").spellEffects, [{ spell: "vitriolic-sphere", by: "lyra", turns: 1 }])
  assert.equal(find(round(sphere.characters, falls(), falls(...ones(5))), "owlbear").hitPoints, 44)
  assert.deepEqual([spellLabel(spell("weird")), spellLabel(spell("vitriolic-sphere"))], ["run", "run"])
})

test("Flesh to Stone counts three of a kind: three failures turn the target to stone, three successes end it", () => {
  // A Construct succeeds with no roll.
  const constructed = castSpell({ characters: [lyra, armor], casterId: "lyra", spell: spell("flesh-to-stone"), targets: ["armor"], d20: falls(), roll: falls() })
  assert.equal(find(constructed.characters, "armor").conditions, undefined)
  // The Bandit rolls 3 and +1, 4 against DC 13: Restrained.
  const cast = castSpell({ characters: [lyra, bandit], casterId: "lyra", spell: spell("flesh-to-stone"), targets: ["bandit"], d20: falls(3), roll: falls() })
  assert.deepEqual(
    find(cast.characters, "bandit").conditions?.map((entry) => entry.id),
    ["restrained"]
  )
  // A fail, a pass (15 and +1), and two fails: three failures, and it is Petrified. Then no more saves.
  let now = cast.characters
  for (const die of [2, 15, 1, 1]) now = round(now, falls(die))
  const stone = find(now, "bandit")
  assert.deepEqual([stone.spellEffects?.[0]?.tally, stone.conditions?.map((entry) => entry.id)], [{ passed: 1, failed: 3 }, ["restrained", "petrified"]])
  assert.equal(spellsAtRoundEnd({ characters: now, d20: falls(), roll: falls() }).saves.length, 0)
  // Three passes end it, and the Restrained with it.
  let freed = cast.characters
  for (const die of [15, 15, 15]) freed = round(freed, falls(die))
  assert.deepEqual([find(freed, "bandit").spellEffects, find(freed, "bandit").conditions], [undefined, undefined])
  assert.equal(spellLabel(spell("flesh-to-stone")), "partly")
})

test("Contagion's chosen ability has Disadvantage on saves, and three successes end it", () => {
  // The Owlbear rolls 5 and +3, 8 against DC 13: 11d8 of 1s is 11, to 48, and Poisoned. Lyra chose Dexterity.
  const cast = castSpell({ characters: [lyra, owlbear], casterId: "lyra", spell: spell("contagion"), targets: ["owlbear"], d20: falls(5), roll: falls(...ones(11)), choice: "dex" })
  const sick = find(cast.characters, "owlbear")
  assert.deepEqual([sick.hitPoints, sick.conditions?.map((entry) => entry.id), sick.spellEffects], [48, ["poisoned"], [{ spell: "contagion", by: "lyra", choice: "dex" }]])
  assert.deepEqual([saveModesFor(sick, { kind: "save", ability: "dex" }), saveModesFor(sick, { kind: "save", ability: "str" })], [[{ mode: "disadvantage", from: "Contagion (Dexterity)" }], []])
  // Three saves of 15 and +3: three successes, and the spell and its Poisoned end.
  let now = cast.characters
  for (const die of [15, 15, 15]) now = round(now, falls(die))
  assert.deepEqual([find(now, "owlbear").spellEffects, find(now, "owlbear").conditions], [undefined, undefined])
  // Three failures settle it: it stays, and no more saves are made.
  let kept = cast.characters
  for (const die of [1, 1, 1]) kept = round(kept, falls(die))
  assert.deepEqual(find(kept, "owlbear").spellEffects?.[0]?.tally, { passed: 0, failed: 3 })
  assert.equal(spellsAtRoundEnd({ characters: kept, d20: falls(), roll: falls() }).saves.length, 0)
  // Once its Poisoned is ended by other means, the spell leaves its bearer.
  const cured = cast.characters.map((each) => (each.id === "owlbear" ? { ...each, conditions: undefined } : each))
  assert.equal(find(round(cured, falls()), "owlbear").spellEffects, undefined)
})

test("Hideous Laughter and the Dominate spells are saved against again when their bearer takes damage", () => {
  // The Bandit rolls 5 against DC 13: Prone and Incapacitated. Hurt, it saves with Advantage: 4 and 13 take the 13,
  // which makes DC 13, and the spell ends. With 4 and 12 it fails and laughs on.
  const laughing = castSpell({ characters: [lyra, bandit], casterId: "lyra", spell: spell("hideous-laughter"), targets: ["bandit"], d20: falls(5), roll: falls() })
  const hurt = laughing.characters.map((each) => (each.id === "bandit" ? { ...each, hitPoints: 8 } : each))
  const ended = settleConcentration({ before: laughing.characters, after: hurt, bonus: () => 0, d20: falls(4, 13) })
  assert.deepEqual(
    [find(ended.characters, "bandit").conditions, ended.facts],
    [undefined, ["Bandit takes damage and SUCCEEDS on the saving throw against Lyra's Hideous Laughter (13 against DC 13), and Hideous Laughter ends on them."]]
  )
  const held = settleConcentration({ before: laughing.characters, after: hurt, bonus: () => 0, d20: falls(4, 12) })
  assert.deepEqual(
    find(held.characters, "bandit").conditions?.map((entry) => entry.id),
    ["prone", "incapacitated"]
  )
  // Dominate Person takes a Humanoid, not a Wolf. Dominate Beast takes it: 2 and +1 fails, and it is Charmed. Hurt,
  // it rolls 12 and +1 with no Advantage, 13, and the spell ends.
  const refused = castSpell({ characters: [lyra, wolf], casterId: "lyra", spell: spell("dominate-person"), targets: ["wolf"], d20: falls(), roll: falls() })
  assert.equal(find(refused.characters, "wolf").conditions, undefined)
  const dominated = castSpell({ characters: [lyra, wolf], casterId: "lyra", spell: spell("dominate-beast"), targets: ["wolf"], d20: falls(2), roll: falls() })
  assert.deepEqual(
    find(dominated.characters, "wolf").conditions?.map((entry) => entry.id),
    ["charmed"]
  )
  const bitten = dominated.characters.map((each) => (each.id === "wolf" ? { ...each, hitPoints: 5 } : each))
  assert.equal(find(settleConcentration({ before: dominated.characters, after: bitten, bonus: () => 0, d20: falls(12) }).characters, "wolf").conditions, undefined)
  assert.deepEqual(
    ["hideous-laughter", "dominate-beast", "charm-monster", "befuddlement"].map((id) => spellLabel(spell(id))),
    ["run", "partly", "partly", "partly"]
  )
})
