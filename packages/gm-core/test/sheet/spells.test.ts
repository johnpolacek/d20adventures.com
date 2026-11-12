import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { takeAction } from "../../src/sheet/actions"
import type { ConditionEntry } from "../../src/sheet/condition-entry"
import { deriveSheet, sheetProblems } from "../../src/sheet/derive"
import type { Sheet } from "../../src/sheet/sheet"
import { castCost, castSpell, classSpells, isEngineSpell, slotsAtEncounterEnd, slotsLeft, spellById, spellcastingOf, spellsOf, spellWords, targetLimit, withCastSpent } from "../../src/sheet/spells"
import type { TurnEffect } from "../../src/sheet/turn-effect"

// Every expected value below was worked out by hand from the SRD 5.2.1 spell rules, not copied from the function's output.

const sheet = (path: string) => (JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { sheet: Sheet }).sheet
type Character = {
  id: string
  name: string
  type: string
  sheet?: Sheet
  statBlock?: string
  hitPoints?: number
  conditions?: ConditionEntry[]
  turnEffects?: TurnEffect[]
  dead?: true
  isComplete?: boolean
  spellSlots?: number[]
  featureUses?: Record<string, number>
}
// Lyra, a level 1 Wizard with Intelligence 16: spell save DC 8 + 2 + 3, spell attack +5.
const lyra: Character = { id: "lyra", name: "Lyra", type: "pc", sheet: sheet("covert-cargo/characters/1749159962941.json"), hitPoints: 6 }
// Milos, a level 1 Cleric with Wisdom 16: DC 13, +5.
const milos: Character = { id: "milos", name: "Milos", type: "pc", sheet: sheet("welcome-to-kordavos/characters/milos-radan.json"), hitPoints: 9 }
// Ilya, a level 1 Bard with Charisma 16: DC 13, +5.
const ilya: Character = { id: "ilya", name: "Ilya", type: "pc", sheet: sheet("welcome-to-kordavos/characters/ilya-veles.json"), hitPoints: 8 }
// Thalbern, a level 1 Ranger with Wisdom 13, and Dexterity 17 with proficiency in its saves: +5.
const thalbern: Character = { id: "thalbern", name: "Thalbern", type: "pc", sheet: sheet("the-midnight-summons/characters/thalbern.json"), hitPoints: 11 }
const branka: Character = { id: "branka", name: "Branka", type: "pc", sheet: sheet("welcome-to-kordavos/characters/branka-stoneveil.json"), hitPoints: 5 }
// An Owlbear: Armor Class 13, 59 hit points, Dexterity save +1. A Bandit: 11 hit points, Dexterity +1, Wisdom +0.
const owlbear: Character = { id: "owlbear", name: "Owlbear", type: "npc", statBlock: "owlbear", hitPoints: 59 }
const bandit = (id = "bandit"): Character => ({ id, name: id === "bandit" ? "Bandit" : `Bandit ${id}`, type: "npc", statBlock: "bandit", hitPoints: 11 })
const spell = (id: string) => spellById.get(id) as NonNullable<ReturnType<typeof spellById.get>>
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() as number
const find = (characters: Character[], id: string) => characters.find((character) => character.id === id) as Character

test("a caster's save DC is 8 plus the Proficiency Bonus and the ability modifier, and a level 1 caster has two slots", () => {
  assert.deepEqual(spellcastingOf(lyra), { ability: "int", saveDc: 13, attackBonus: 5, modifier: 3, slots: [2, 0, 0, 0, 0, 0, 0, 0, 0], cantrips: 3, prepared: 4 })
  // A Ranger casts with Wisdom, 13 is +1: DC 11, +3. Two prepared spells and no cantrips.
  assert.deepEqual(spellcastingOf(thalbern), { ability: "wis", saveDc: 11, attackBonus: 3, modifier: 1, slots: [2, 0, 0, 0, 0], cantrips: 0, prepared: 2 })
  assert.deepEqual([spellcastingOf(ilya)?.cantrips, spellcastingOf(milos)?.cantrips], [2, 3])
  assert.equal(spellcastingOf(branka), undefined)
  assert.equal(spellcastingOf(owlbear), undefined)
})

test("the six classes have 74 cantrips and level 1 spells, and the engine resolves the 42 with typed effects", () => {
  const ids = new Set(["bard", "cleric", "wizard", "ranger", "fighter", "rogue"].flatMap((id) => classSpells(id, 1)))
  assert.equal(ids.size, 74)
  assert.equal([...ids].filter((id) => isEngineSpell(spell(id))).length, 42)
  assert.deepEqual([isEngineSpell(spell("ray-of-frost")), isEngineSpell(spell("bless")), isEngineSpell(spell("detect-magic")), isEngineSpell(spell("light"))], [true, true, false, false])
  // A 15-foot cone takes two creatures, a 15-foot cube three, a 20-foot cube four, a 5-foot sphere one, Magic Missile one for each dart.
  assert.deepEqual(
    ["burning-hands", "thunderwave", "faerie-fire", "sleep", "magic-missile", "ray-of-frost"].map((id) => targetLimit(spell(id))),
    [2, 3, 4, 1, 3, 1]
  )
})

test("a spell attack is rolled against Armor Class, and a 20 doubles its dice", () => {
  // Ray of Frost, +5: a 9 makes 14 against the Owlbear's 13 and hits for 1d8 Cold. A 6 takes it from 59 to 53.
  const hit = castSpell({ characters: [lyra, owlbear], casterId: "lyra", spell: spell("ray-of-frost"), targets: ["owlbear"], attackDice: [9], d20: falls(), roll: falls(6) })
  assert.deepEqual([hit.attack?.roll.total, hit.attack?.roll.hit, hit.attack?.taken, find(hit.characters, "owlbear").hitPoints], [14, true, 6, 53])
  assert.deepEqual(hit.facts, ["Lyra's Ray of Frost HITS Owlbear (14 against Armor Class 13) for 6 cold damage. Owlbear has 53 of 59 hit points."])
  // A 7 makes 12: a miss.
  const miss = castSpell({ characters: [lyra, owlbear], casterId: "lyra", spell: spell("ray-of-frost"), targets: ["owlbear"], attackDice: [7], d20: falls(), roll: falls() })
  assert.deepEqual([miss.attack?.roll.hit, miss.harm, find(miss.characters, "owlbear").hitPoints], [false, [], 59])
  // A 20: two d8, 6 and 4.
  const crit = castSpell({ characters: [lyra, owlbear], casterId: "lyra", spell: spell("ray-of-frost"), targets: ["owlbear"], attackDice: [20], d20: falls(), roll: falls(6, 4) })
  assert.deepEqual([crit.attack?.roll.critical, crit.attack?.taken], [true, 10])
  // Guiding Bolt, a level 1 spell, is 4d6 Radiant: 3, 4, 5 and 6 are 18.
  const bolt = castSpell({ characters: [milos, owlbear], casterId: "milos", spell: spell("guiding-bolt"), targets: ["owlbear"], attackDice: [12], d20: falls(), roll: falls(3, 4, 5, 6) })
  assert.deepEqual([bolt.attack?.taken, bolt.harm[0].type], [18, "radiant"])
})

test("each target saves against the caster's DC: none on a success, or half where the spell says so", () => {
  // Sacred Flame, DC 13, a Dexterity save. The Bandit adds 1: a 10 makes 11 and fails, for 1d8 Radiant. A 5 leaves 6.
  const burned = castSpell({ characters: [milos, bandit()], casterId: "milos", spell: spell("sacred-flame"), targets: ["bandit"], d20: falls(10), roll: falls(5) })
  assert.deepEqual(burned.saves, [{ target: "bandit", ability: "dex", dice: [10], natural: 10, bonus: 1, total: 11, dc: 13, success: false, mode: "normal" }])
  assert.deepEqual(
    [find(burned.characters, "bandit").hitPoints, burned.facts],
    [6, ["Bandit FAILS the saving throw against Milos's Sacred Flame (11 against DC 13) and takes 5 radiant damage. Bandit has 6 of 11 hit points."]]
  )
  // A 12 makes 13: a success, and no damage.
  const spared = castSpell({ characters: [milos, bandit()], casterId: "milos", spell: spell("sacred-flame"), targets: ["bandit"], d20: falls(12), roll: falls(5) })
  assert.deepEqual([spared.saves[0].success, spared.harm, find(spared.characters, "bandit").hitPoints], [true, [], 11])
  // Burning Hands, a 15-foot cone: two creatures, and a third named is left out. 3d6 Fire is rolled once: 4, 3 and 5
  // are 12. One fails on a 5 and takes 12, more than its 11: dead. One succeeds on a 14 and takes half, 6.
  const cone = castSpell({
    characters: [lyra, bandit("a"), bandit("b"), bandit("c")],
    casterId: "lyra",
    spell: spell("burning-hands"),
    targets: ["a", "b", "c"],
    d20: falls(5, 14),
    roll: falls(4, 3, 5),
  })
  assert.deepEqual(
    cone.saves.map((save) => [save.target, save.total, save.success]),
    [
      ["a", 6, false],
      ["b", 15, true],
    ]
  )
  assert.deepEqual([find(cone.characters, "a").dead, find(cone.characters, "b").hitPoints, find(cone.characters, "c").hitPoints], [true, 5, 11])
})

test("conditions and actions change a target's save: Paralyzed fails Dexterity outright, and Dodge rolls it with Advantage", () => {
  const held = { ...bandit(), conditions: [{ id: "paralyzed" as const }] }
  const failed = castSpell({ characters: [milos, held], casterId: "milos", spell: spell("sacred-flame"), targets: ["bandit"], d20: falls(20), roll: falls(3) })
  assert.deepEqual([failed.saves[0].success, failed.saves[0].failedBy, find(failed.characters, "bandit").hitPoints], [false, "Paralyzed", 8])
  // Thalbern Dodging: two dice, 4 and 9, keeps the 9. With his +5 that is 14 against 13.
  const dodging = find(takeAction([milos, thalbern], "thalbern", { action: "dodge" }).characters, "thalbern")
  const saved = castSpell({ characters: [milos, dodging], casterId: "milos", spell: spell("sacred-flame"), targets: ["thalbern"], d20: falls(4, 9), roll: falls(8) })
  assert.deepEqual([saved.saves[0].dice, saved.saves[0].mode, saved.saves[0].total, saved.saves[0].success], [[4, 9], "advantage", 14, true])
})

test("Magic Missile's three darts each deal 1d4 + 1 Force and need no roll to hit", () => {
  // 2, 3 and 4 on the dice are 3, 4 and 5: 12 in all, and 59 becomes 47.
  const one = castSpell({ characters: [lyra, owlbear], casterId: "lyra", spell: spell("magic-missile"), targets: ["owlbear"], d20: falls(), roll: falls(2, 3, 4) })
  assert.deepEqual([one.harm.map((dart) => dart.amount), find(one.characters, "owlbear").hitPoints, one.attack], [[3, 4, 5], 47, undefined])
  assert.deepEqual(one.facts, ["Lyra's Magic Missile strikes Owlbear for 12 force damage. Owlbear has 47 of 59 hit points."])
  // At two targets the darts fall in turn: the first and third on the Owlbear for 3 and 5, the second on the Bandit for 4.
  const two = castSpell({ characters: [lyra, owlbear, bandit()], casterId: "lyra", spell: spell("magic-missile"), targets: ["owlbear", "bandit"], d20: falls(), roll: falls(2, 3, 4) })
  assert.deepEqual([find(two.characters, "owlbear").hitPoints, find(two.characters, "bandit").hitPoints], [51, 7])
})

test("healing adds the caster's ability modifier, and a failed save gives the spell's condition from its caster", () => {
  // Healing Word on Branka at 5 of 14: 2d4 rolling 2 and 3, and Milos's +3, is 8.
  const healed = castSpell({ characters: [milos, branka], casterId: "milos", spell: spell("healing-word"), targets: ["branka"], d20: falls(), roll: falls(2, 3) })
  assert.deepEqual([find(healed.characters, "branka").hitPoints, healed.harm], [13, [{ target: "branka", kind: "healing", dice: [2, 3], sides: 4, bonus: 3, amount: 8 }]])
  assert.deepEqual(healed.facts, ["Branka regains 8 hit points. Branka has 13 of 14 hit points."])
  // Charm Person, a Wisdom save against 13. The Bandit adds nothing: a 12 fails, and he is Charmed by Lyra for the hour.
  const charmed = castSpell({ characters: [lyra, bandit()], casterId: "lyra", spell: spell("charm-person"), targets: ["bandit"], d20: falls(12), roll: falls() })
  assert.deepEqual([find(charmed.characters, "bandit").conditions, charmed.conditions], [[{ id: "charmed", source: "lyra", spell: "charm-person" }], [{ target: "bandit", condition: "charmed" }]])
  assert.deepEqual(charmed.facts, ["Bandit FAILS the saving throw against Lyra's Charm Person (12 against DC 13).", "Bandit is now Charmed."])
  // A 13 succeeds: nothing.
  assert.equal(
    find(castSpell({ characters: [lyra, bandit()], casterId: "lyra", spell: spell("charm-person"), targets: ["bandit"], d20: falls(13), roll: falls() }).characters, "bandit").conditions,
    undefined
  )
  // Vicious Mockery: a failed Wisdom save takes 1d6 Psychic.
  const mocked = castSpell({ characters: [ilya, bandit()], casterId: "ilya", spell: spell("vicious-mockery"), targets: ["bandit"], d20: falls(3), roll: falls(4) })
  assert.deepEqual([mocked.harm[0].type, find(mocked.characters, "bandit").hitPoints], ["psychic", 7])
  // A Fighter cannot cast.
  assert.throws(() => castSpell({ characters: [branka, owlbear], casterId: "branka", spell: spell("ray-of-frost"), targets: ["owlbear"], d20: falls(), roll: falls() }), /cannot cast spells/)
})

test("a sheet's spells follow its class: the counts its table gives, from its own list, and a Wizard's from the spellbook", () => {
  const wizard = lyra.sheet as Sheet
  const cleric = milos.sheet as Sheet
  for (const hero of [lyra, milos, ilya, thalbern, branka]) assert.deepEqual(sheetProblems(hero.sheet as Sheet), [], hero.name)
  // A Wizard knows three cantrips and prepares four spells at level 1.
  assert.deepEqual(sheetProblems({ ...wizard, cantrips: ["light", "mage-hand"] }), ["Wizard knows 3 cantrips at level 1, and the sheet has 2"])
  assert.deepEqual(sheetProblems({ ...wizard, spells: ["detect-magic", "fog-cloud", "charm-person"] }), ["Wizard prepares 4 spells at level 1, and the sheet has 3"])
  // Sleep is a Wizard spell that is not in Lyra's book. Misty Step is level 2, and she has no slot for it. Sacred Flame is a Cleric's.
  assert.deepEqual(sheetProblems({ ...wizard, spells: ["detect-magic", "fog-cloud", "charm-person", "sleep"] }), ['"sleep" is prepared and is not in the spellbook'])
  assert.deepEqual(sheetProblems({ ...wizard, spells: ["detect-magic", "fog-cloud", "charm-person", "misty-step"] }), [
    '"misty-step" is not a Wizard spell of a level the sheet has slots for',
    '"misty-step" is prepared and is not in the spellbook',
  ])
  assert.deepEqual(sheetProblems({ ...wizard, cantrips: ["light", "mage-hand", "sacred-flame"] }), ['"sacred-flame" is not a Wizard cantrip'])
  // A Thaumaturge Cleric knows one cantrip more than the three of the table. A Protector does not.
  assert.equal(cleric.cantrips?.length, 4)
  assert.deepEqual(sheetProblems({ ...cleric, featureChoices: { "cleric-divine-order": "protector" } }), ["Cleric knows 3 cantrips at level 1, and the sheet has 4"])
  // A Fighter has no Spellcasting.
  assert.deepEqual(sheetProblems({ ...(branka.sheet as Sheet), cantrips: ["light"] }), ["Fighter has no Spellcasting at level 1, and the sheet lists spells"])
  // A Ranger's Favored Enemy keeps Hunter's Mark always prepared, beside the two he prepares. A High Elf knows Prestidigitation.
  assert.deepEqual(deriveSheet(thalbern.sheet as Sheet).preparedSpells, ["cure-wounds", "speak-with-animals", "hunters-mark"])
  assert.deepEqual(deriveSheet(ilya.sheet as Sheet).cantrips, ["vicious-mockery", "minor-illusion", "prestidigitation"])
})

test("a caster's spells are the sheet's: cantrips at will, prepared spells for a slot, and a Wizard's book for rituals", () => {
  const known = spellsOf({ ...lyra, name: "Lyra" })
  // Three cantrips, four prepared, and the two Ritual spells of her book she has not prepared: Identify and Comprehend Languages.
  assert.deepEqual(
    known.map((entry) => [entry.spell.id, entry.cantrip, entry.prepared, entry.ritual]),
    [
      ["mage-hand", true, true, false],
      ["light", true, true, false],
      ["ray-of-frost", true, true, false],
      ["detect-magic", false, true, true],
      ["fog-cloud", false, true, false],
      ["charm-person", false, true, false],
      ["magic-missile", false, true, false],
      ["identify", false, false, true],
      ["comprehend-languages", false, false, true],
    ]
  )
  assert.deepEqual(slotsLeft(lyra), [2, 0, 0, 0, 0, 0, 0, 0, 0])
  // A cantrip costs nothing, a prepared spell a slot of its level, and a Ritual cast slowly nothing.
  const cost = (who: Character, id: string, ritual = false) => {
    const found = castCost(who, id, ritual)
    return "problem" in found ? found.problem : found.cost
  }
  assert.deepEqual(cost(lyra, "ray-of-frost"), { kind: "cantrip" })
  assert.deepEqual(cost(lyra, "magic-missile"), { kind: "slot", level: 1 })
  assert.deepEqual(cost(lyra, "detect-magic", true), { kind: "ritual" })
  assert.deepEqual(cost(lyra, "identify", true), { kind: "ritual" })
  assert.equal(cost(lyra, "identify"), "Identify is in the spellbook and not prepared, so it can only be cast as a Ritual.")
  assert.equal(cost(lyra, "fireball"), "Fireball is not a spell Lyra can cast.")
  // Magic Missile is no Ritual, so asking for one changes nothing: it still takes a slot.
  assert.deepEqual(cost(lyra, "magic-missile", true), { kind: "slot", level: 1 })
  // Two casts spend both slots. Then only cantrips and rituals are left.
  const once = withCastSpent(lyra, { kind: "slot", level: 1 })
  const spent = withCastSpent(once, { kind: "slot", level: 1 })
  assert.deepEqual([once.spellSlots, slotsLeft(once)[0], spent.spellSlots, slotsLeft(spent)[0]], [[1], 1, [2], 0])
  assert.equal(cost(spent, "magic-missile"), "Lyra has no level 1 spell slot left for Magic Missile.")
  assert.deepEqual([cost(spent, "ray-of-frost"), cost(spent, "detect-magic", true)], [{ kind: "cantrip" }, { kind: "ritual" }])
  // A new encounter gives the slots back.
  assert.deepEqual(slotsLeft(slotsAtEncounterEnd(spent)), [2, 0, 0, 0, 0, 0, 0, 0, 0])
  assert.equal(
    spellWords(once),
    "Cantrips, cast at will: Mage Hand, Light, Ray of Frost. Prepared spells: Detect Magic, Fog Cloud, Charm Person, Magic Missile. Rituals from the spellbook, outside a fight: Identify, Comprehend Languages. Level 1 spell slots left: 1"
  )
})

test("a Ranger's Favored Enemy casts Hunter's Mark twice with no slot", () => {
  const mark = (who: Character) => {
    const found = castCost(who, "hunters-mark")
    return "problem" in found ? found.problem : found.cost
  }
  assert.deepEqual(mark(thalbern), { kind: "free", feature: "ranger-favored-enemy" })
  const once = withCastSpent(thalbern, { kind: "free", feature: "ranger-favored-enemy" })
  const twice = withCastSpent(once, { kind: "free", feature: "ranger-favored-enemy" })
  assert.deepEqual([once.featureUses, mark(once), slotsLeft(once)[0]], [{ "ranger-favored-enemy": 1 }, { kind: "free", feature: "ranger-favored-enemy" }, 2])
  // The third takes a slot.
  assert.deepEqual(mark(twice), { kind: "slot", level: 1 })
})
