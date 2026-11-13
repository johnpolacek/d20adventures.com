import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { spells } from "@d20/srd/spells"
import type { ConditionEntry } from "../../src/sheet/condition-entry"
import type { Sheet } from "../../src/sheet/sheet"
import { settleConcentration } from "../../src/sheet/spell-effects"
import { spellsAtRoundEnd } from "../../src/sheet/spell-rounds"
import { castableOnTurn, castSpell, longCasting, namedSpellIds, spellById, spellLabel, targetLimit } from "../../src/sheet/spells"
import type { Concentration } from "../../src/sheet/turn-effect"

// Every expected value below was worked out by hand from the SRD 5.2.1 spell texts, not copied from the function's output.

const sheet = (path: string) => (JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { sheet: Sheet }).sheet
type Character = {
  id: string
  name: string
  type: string
  race?: string
  sheet?: Sheet
  statBlock?: string
  hitPoints?: number
  conditions?: ConditionEntry[]
  concentration?: Concentration
  isComplete?: boolean
}
// Lyra, a level 1 Wizard with Intelligence 16: spell save DC 13, spell attack +5, spellcasting modifier +3.
const lyra: Character = { id: "lyra", name: "Lyra", type: "pc", sheet: sheet("covert-cargo/characters/1749159962941.json"), hitPoints: 6 }
// Milos, a level 1 Cleric with Wisdom 16: DC 13. Ilya, a level 1 Bard with Charisma 16: DC 13.
const milos: Character = { id: "milos", name: "Milos", type: "pc", sheet: sheet("welcome-to-kordavos/characters/milos-radan.json"), hitPoints: 9 }
const ilya: Character = { id: "ilya", name: "Ilya", type: "pc", sheet: sheet("welcome-to-kordavos/characters/ilya-veles.json"), hitPoints: 8 }
// A Bandit: Armor Class 12, 11 hit points, Dexterity +1, Wisdom +0. An Owlbear: Armor Class 13, 59 hit points.
const bandit: Character = { id: "bandit", name: "Bandit", type: "npc", statBlock: "bandit", hitPoints: 11 }
const owlbear: Character = { id: "owlbear", name: "Owlbear", type: "npc", statBlock: "owlbear", hitPoints: 59 }
const spell = (id: string) => spellById.get(id) as NonNullable<ReturnType<typeof spellById.get>>
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() as number
const find = (characters: Character[], id: string) => characters.find((character) => character.id === id) as Character

test("every spell is named as run, partly run or told, and the count by label", () => {
  assert.equal(spells.length, 339)
  const count = (list: readonly { id: string }[]) => {
    const found = { run: 0, partly: 0, told: 0 }
    for (const each of list) found[spellLabel(each)] += 1
    return found
  }
  assert.deepEqual(count(spells), { run: 75, partly: 64, told: 200 })
  assert.deepEqual(count(spells.filter((each) => each.level <= 3)), { run: 50, partly: 45, told: 88 })
  // Each spell named is one of the SRD's, and named once.
  const named = namedSpellIds()
  assert.deepEqual(
    named.filter((id) => !spellById.has(id)),
    []
  )
  assert.equal(new Set(named).size, named.length)
  // A spell is told unless it is named: the utility spells, those held for a fault, and those above level 3 not checked.
  assert.deepEqual(
    ["light", "detect-magic", "goodberry", "sanctuary", "divine-favor", "chain-lightning", "fireball", "ray-of-frost"].map((id) => spellLabel(spell(id))),
    ["told", "told", "told", "told", "told", "run", "run", "partly"]
  )
})

test("a told spell cast right after a hit stays on the turn's menu, where a smite the game runs does not", () => {
  assert.deepEqual(
    ["ensnaring-strike", "divine-smite", "shining-smite"].map((id) => [spellLabel(spell(id)), castableOnTurn(spell(id))]),
    [
      ["told", true],
      ["run", false],
      ["partly", false],
    ]
  )
})

test("a told spell spends its cost and holds Concentration, and the engine rolls nothing for it", () => {
  // Call Lightning is told: no save is made and no one is hurt, but Lyra concentrates on it.
  const cast = castSpell({ characters: [lyra, bandit], casterId: "lyra", spell: spell("call-lightning"), targets: ["bandit"], d20: falls(1), roll: falls(10, 10, 10) })
  assert.deepEqual([cast.saves.length, cast.harm.length, cast.facts, find(cast.characters, "bandit").hitPoints], [0, 0, [], 11])
  assert.equal(find(cast.characters, "lyra").concentration?.spell, "call-lightning")
  // Sanctuary is told: the one warded makes no save.
  assert.equal(castSpell({ characters: [milos, lyra], casterId: "milos", spell: spell("sanctuary"), targets: ["lyra"], d20: falls(1), roll: falls() }).saves.length, 0)
})

test("a spell that takes a minute or more to cast says how long", () => {
  assert.deepEqual(
    ["contact-other-plane", "forbiddance", "awaken", "fireball", "shield"].map((id) => longCasting(spell(id))),
    ["1 minute", "10 minutes", "8 hours", undefined, undefined]
  )
})

test("Eldritch Blast makes two beams at level 5", () => {
  // At level 5 Lyra's spell attack is +6 (Proficiency Bonus 3, Intelligence +3). A 15 makes 21 against the Bandit's 12
  // and a 14 makes 20: both beams hit, for a 4 and a 5 on the d10s. 11 less 9 is 2.
  const level5 = { ...lyra, sheet: { ...(lyra.sheet as Sheet), level: 5 } }
  assert.deepEqual([targetLimit(spell("eldritch-blast")), targetLimit(spell("eldritch-blast"), 0, 5)], [1, 2])
  const cast = castSpell({ characters: [level5, bandit], casterId: "lyra", spell: spell("eldritch-blast"), targets: ["bandit"], attackDice: [15], d20: falls(14), roll: falls(4, 5) })
  assert.deepEqual([cast.rays?.length, cast.rays?.map((ray) => ray.taken), find(cast.characters, "bandit").hitPoints], [2, [4, 5], 2])
})

test("Sacred Flame takes no Half or Three-Quarters Cover on its save", () => {
  // The Bandit's Dexterity save: 11 + 1 is 12 against DC 13, a failure, where Three-Quarters Cover would have made it 17.
  const cast = castSpell({ characters: [milos, bandit], casterId: "milos", spell: spell("sacred-flame"), targets: ["bandit"], cover: { bandit: "three-quarters" }, d20: falls(11), roll: falls(5) })
  assert.deepEqual([cast.saves[0]?.total, cast.saves[0]?.success, find(cast.characters, "bandit").hitPoints], [12, false, 6])
})

test("Ray of Sickness poisons until the end of the caster's next turn", () => {
  // A 15 makes 20 against Armor Class 12. 2d8 of 3 and 4 is 7, and the Bandit is Poisoned for its next turn.
  const cast = castSpell({ characters: [lyra, bandit], casterId: "lyra", spell: spell("ray-of-sickness"), targets: ["bandit"], attackDice: [15], d20: falls(), roll: falls(3, 4) })
  assert.deepEqual(find(cast.characters, "bandit").conditions, [{ id: "poisoned", source: "lyra", turns: 1, spell: "ray-of-sickness" }])
})

test("Sorcerous Burst rolls another d8 for each 8, as many as the spellcasting modifier", () => {
  // A 15 makes 20 against the Owlbear's 13. The d8 is an 8, so another: an 8 again, and another: a 2. 18 in all, 59 to 41.
  const cast = castSpell({ characters: [lyra, owlbear], casterId: "lyra", spell: spell("sorcerous-burst"), targets: ["owlbear"], attackDice: [15], d20: falls(), roll: falls(8, 8, 2) })
  assert.deepEqual([cast.attack?.damage?.parts[0]?.dice, find(cast.characters, "owlbear").hitPoints], [[8, 8, 2], 41])
  // With +3 no more than three more d8s are rolled, whatever they show.
  const capped = castSpell({ characters: [lyra, owlbear], casterId: "lyra", spell: spell("sorcerous-burst"), targets: ["owlbear"], attackDice: [15], d20: falls(), roll: falls(8, 8, 8, 8, 8) })
  assert.equal(capped.attack?.taken, 32)
})

test("Sleep takes no elf and no creature immune to Exhaustion, and its second save leaves the sleeper Unconscious", () => {
  const elf: Character = { id: "archer", name: "Elven Archer", type: "npc", statBlock: "scout", race: "Wood Elf", hitPoints: 16 }
  const skeleton: Character = { id: "skeleton", name: "Skeleton", type: "npc", statBlock: "skeleton", hitPoints: 13 }
  // The Bandit's Wisdom save: 2 against DC 13, a failure. The elf and the Skeleton make none.
  const cast = castSpell({
    characters: [ilya, bandit, elf, skeleton],
    casterId: "ilya",
    spell: spell("sleep"),
    targets: ["bandit", "archer", "skeleton"],
    measured: true,
    d20: falls(2),
    roll: falls(),
  })
  assert.deepEqual(
    cast.saves.map((save) => save.target),
    ["bandit"]
  )
  assert.deepEqual(cast.facts.slice(2), ["Elven Archer does not sleep, so Sleep does not take them.", "Skeleton does not sleep, so Sleep does not take them."])
  const asleep = find(cast.characters, "bandit")
  assert.deepEqual(asleep.conditions, [{ id: "incapacitated", source: "ilya", turns: 1, spell: "sleep" }])
  // At the end of its next turn it saves again: a 3 against DC 13 fails, and it is Unconscious.
  const round = spellsAtRoundEnd({ characters: cast.characters, d20: falls(3), roll: falls() })
  assert.ok(find(round.characters, "bandit").conditions?.some((entry) => entry.id === "unconscious" && entry.spell === "sleep"))
  // Damage ends the spell on it.
  const hurt = settleConcentration({ before: round.characters, after: round.characters.map((each) => (each.id === "bandit" ? { ...each, hitPoints: 8 } : each)), bonus: () => 0, d20: falls() })
  assert.equal(find(hurt.characters, "bandit").conditions, undefined)
})

test("Charm Person takes a Humanoid and ends when it is damaged, and Animal Friendship takes a Beast", () => {
  const charmed = castSpell({ characters: [ilya, owlbear], casterId: "ilya", spell: spell("charm-person"), targets: ["owlbear"], d20: falls(1), roll: falls() })
  assert.deepEqual([charmed.saves.length, charmed.facts], [0, ["Owlbear is not a Humanoid, so Charm Person does not take them."]])
  const befriended = castSpell({ characters: [ilya, bandit], casterId: "ilya", spell: spell("animal-friendship"), targets: ["bandit"], d20: falls(1), roll: falls() })
  assert.deepEqual(befriended.facts, ["Bandit is not a Beast, so Animal Friendship does not take them."])
  // The Bandit fails with a 1 and is Charmed. A blow from anyone ends it.
  const cast = castSpell({ characters: [ilya, bandit], casterId: "ilya", spell: spell("charm-person"), targets: ["bandit"], d20: falls(1), roll: falls() })
  assert.equal(find(cast.characters, "bandit").conditions?.[0]?.id, "charmed")
  const hurt = settleConcentration({ before: cast.characters, after: cast.characters.map((each) => (each.id === "bandit" ? { ...each, hitPoints: 5 } : each)), bonus: () => 0, d20: falls() })
  assert.equal(find(hurt.characters, "bandit").conditions, undefined)
})
