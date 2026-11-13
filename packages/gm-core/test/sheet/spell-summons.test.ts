import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { attacksOf } from "../../src/sheet/attack"
import { boundWords } from "../../src/sheet/masters"
import { multiattackOf } from "../../src/sheet/multiattack"
import type { Sheet } from "../../src/sheet/sheet"
import { areEnemies, sideOf } from "../../src/sheet/sides"
import { endConcentration, spellResistances } from "../../src/sheet/spell-effects"
import { spellsAtRoundEnd } from "../../src/sheet/spell-rounds"
import { castSpell, spellById, spellLabel } from "../../src/sheet/spells"
import { combatStatsOf } from "../../src/sheet/stat-block"
import type { Concentration, SpellEffect } from "../../src/sheet/turn-effect"
import type { Master } from "../../src/types/character"
import { buildLocalWikiTurnCharacters } from "../../src/wiki-adventures/characters"

// Every expected value below was worked out by hand from the SRD 5.2.1 spell texts and their stat blocks, not copied
// from the function's output.

const spell = (id: string) => spellById.get(id) as NonNullable<ReturnType<typeof spellById.get>>
const sheet = (path: string) => (JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { sheet: Sheet }).sheet
type Character = {
  id: string
  name: string
  type: string
  sheet?: Sheet
  statBlock?: string
  hitPoints?: number
  initiative?: number
  isComplete?: boolean
  dead?: true
  fled?: true
  master?: Master
  position?: { x: number; y: number }
  spellEffects?: SpellEffect[]
  concentration?: Concentration
}
// Lyra, a level 1 Wizard with Intelligence 16: spell save DC 13, spell attack +5, spellcasting modifier +3, Proficiency
// Bonus +2. She has acted this round, on Initiative 12.
const lyra: Character = { id: "lyra", name: "Lyra", type: "pc", sheet: sheet("covert-cargo/characters/1749159962941.json"), hitPoints: 6, initiative: 12, isComplete: true, position: { x: 0, y: 0 } }
// A Bandit, a Humanoid with 11 hit points and Constitution +1, on Initiative 15.
const bandit: Character = { id: "bandit", name: "Bandit", type: "npc", statBlock: "bandit", hitPoints: 11, initiative: 15, position: { x: 30, y: 0 } }
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() as number
const ones = () => 1
const cast = (id: string, characters: Character[], options: { level?: number; choice?: string; targets?: string[]; d20?: number[] } = {}) =>
  castSpell({ characters, casterId: "lyra", spell: spell(id), targets: options.targets ?? [], level: options.level, choice: options.choice, d20: falls(...(options.d20 ?? [])), roll: ones })
const called = (characters: readonly Character[]) => characters.filter((character) => character.master?.summoned)

test("Summon Dragon calls a Draconic Spirit by the slot, on its caster's side, right after her, sharing the Resistance chosen", () => {
  const done = cast("summon-dragon", [lyra, bandit], { level: 5, choice: "fire" })
  const [spirit] = called(done.characters)
  // "AC 14 + the spell's level": 19. "HP 50 + 10 for each spell level above 5": 50. Rend at the spell attack +5,
  // "1d6 + 4 + the spell's level": 1d6 + 9. "a number of Rend attacks equal to half the spell's level (round down)": two.
  assert.deepEqual(combatStatsOf(spirit), { hitPointMaximum: 50, armorClass: 19, from: "Draconic Spirit" })
  assert.equal(spirit.hitPoints, 50)
  const rend = attacksOf(spirit).find((attack) => attack.id === "rend")
  assert.deepEqual([rend?.bonus, rend?.damage[0]], [5, { dice: "1d6 + 9", type: "piercing" }])
  assert.equal(multiattackOf(spirit)?.options[0].attacks.length, 2)
  // "shares your Initiative count, but it takes its turn immediately after yours": Initiative 12, listed right after
  // Lyra, and still to act this round. It is with the party, so the Bandit is its enemy.
  assert.deepEqual(
    done.characters.map((character) => character.id),
    ["lyra", spirit.id, "bandit"]
  )
  assert.deepEqual([spirit.initiative, spirit.isComplete, sideOf(spirit), areEnemies(spirit, bandit)], [12, false, "party", true])
  // Shared Resistances: Lyra resists Fire until the spell ends.
  const caster = done.characters.find((character) => character.id === "lyra") as Character
  assert.deepEqual(spellResistances(caster), ["fire"])
  assert.match(boundWords(spirit, done.characters) ?? "", /obeys Lyra.*Dodge action/)
  // At a level 7 slot: AC 21, 70 Hit Points, three Rends of 1d6 + 11.
  const higher = called(cast("summon-dragon", [lyra], { level: 7, choice: "cold" }).characters)[0]
  assert.deepEqual([combatStatsOf(higher)?.armorClass, combatStatsOf(higher)?.hitPointMaximum, multiattackOf(higher)?.options[0].attacks.length], [21, 70, 3])
  // "The creature disappears ... when the spell ends": Concentration lost, it is gone, and so is the Resistance.
  const ended = endConcentration(done.characters, "lyra").characters
  assert.equal(ended.find((character) => character.id === spirit.id)?.fled, true)
  assert.deepEqual(spellResistances(ended.find((character) => character.id === "lyra") as Character), [])
  assert.equal(spellLabel(spell("summon-dragon")), "partly")
})

test("Giant Insect, Animate Objects, Find Steed and Find Familiar each call by their own stat block", () => {
  // Giant Insect at level 4, a spider: AC 11 + 4 = 15, 30 Hit Points, two attacks of Poison Jab or Web Bolt, the Jab
  // "1d6 + 3 plus the spell's level Piercing damage plus 1d4 Poison damage".
  const spider = called(cast("giant-insect", [lyra], { level: 4, choice: "spider" }).characters)[0]
  assert.deepEqual([spider.name, combatStatsOf(spider)?.armorClass, combatStatsOf(spider)?.hitPointMaximum, multiattackOf(spider)?.options[0].attacks.length], ["Giant Spider", 15, 30, 2])
  assert.deepEqual(attacksOf(spider).find((attack) => attack.id === "poison-jab")?.damage, [
    { dice: "1d6 + 7", type: "piercing" },
    { dice: "1d4", type: "poison" },
  ])
  // Animate Objects: as many objects as Lyra's spellcasting modifier, 3, each AC 15 with 10 Hit Points and a Slam of
  // 1d4 + 3 Force, 1d4 more at a level 6 slot.
  const objects = called(cast("animate-objects", [lyra], { level: 6 }).characters)
  assert.deepEqual(
    objects.map((object) => [object.name, combatStatsOf(object)?.armorClass, object.hitPoints]),
    [
      ["Animated Object 1", 15, 10],
      ["Animated Object 2", 15, 10],
      ["Animated Object 3", 15, 10],
    ]
  )
  assert.deepEqual(attacksOf(objects[0])[0].damage, [{ dice: "2d4 + 3", type: "force" }])
  // Find Steed at level 2, a Fey: AC 10 + 2 = 12, 5 + 20 = 25 Hit Points, its Slam 1d8 + 2 Psychic. A second steed
  // replaces the first. "The steed disappears if it drops to 0 Hit Points or if you die."
  const once = cast("find-steed", [lyra], { level: 2, choice: "fey" }).characters
  const steed = called(once)[0]
  assert.deepEqual([combatStatsOf(steed)?.armorClass, steed.hitPoints, attacksOf(steed)[0].damage], [12, 25, [{ dice: "1d8 + 2", type: "psychic" }]])
  const twice = cast("find-steed", once, { level: 2, choice: "celestial" }).characters
  assert.deepEqual(
    called(twice).map((each) => each.fled ?? false),
    [true, false]
  )
  const widowed = spellsAtRoundEnd({ characters: twice.map((character) => (character.id === "lyra" ? { ...character, dead: true as const } : character)), d20: ones, roll: ones }).characters
  assert.ok(called(widowed).every((each) => each.fled))
  // Find Familiar as a Fey owl: the Owl's own block, a Fey, with no attack ("A familiar can't attack"), on its own
  // Initiative: a d20 of 10 and the Owl's +1 is 11.
  const familiar = called(castSpell({ characters: [lyra], casterId: "lyra", spell: spell("find-familiar"), targets: [], choice: "owl-fey", d20: () => 10, roll: ones }).characters)[0]
  assert.deepEqual([familiar.name, attacksOf(familiar), familiar.initiative, sideOf(familiar)], ["Lyra's Familiar", [], 11, "party"])
  for (const id of ["giant-insect", "animate-objects", "find-steed", "find-familiar"]) assert.equal(spellLabel(spell(id)), "partly")
})

test("Finger of Death raises a Humanoid it kills as a Zombie that follows its caster, from the next round", () => {
  // The Bandit fails the Constitution save with a 1: 7d8 + 30 at all 1s is 37, past its 11 hit points.
  const done = cast("finger-of-death", [lyra, bandit], { targets: ["bandit"], d20: [1] })
  assert.equal(done.characters.find((character) => character.id === "bandit")?.dead, true)
  const [zombie] = called(done.characters)
  // A Zombie: 15 Hit Points. It "rises at the start of your next turn": it takes no turn this round.
  assert.deepEqual([zombie.name, zombie.statBlock, zombie.hitPoints, zombie.isComplete, zombie.master?.id], ["Zombie of Bandit", "zombie", 15, true, "lyra"])
  assert.equal(spellLabel(spell("finger-of-death")), "run")
})

test("A creature called goes on to the next encounter while its spell does, beside its caster", () => {
  // Find Steed needs no Concentration: the steed comes along, on its caster's new Initiative. Animate Objects lasts a
  // minute, so its objects stay behind.
  const steed = called(cast("find-steed", [lyra], { level: 2, choice: "fey" }).characters)[0]
  const objects = called(cast("animate-objects", [lyra], { level: 5 }).characters)
  const artifacts = { characterSheets: { premadeCharacters: { lyra: { sheet: { ...lyra, image: "", archetype: "", race: "", appearance: "", attributes: {} } } }, npcs: {} }, manifest: { level: 1 } }
  const next = buildLocalWikiTurnCharacters({
    artifacts: artifacts as unknown as Parameters<typeof buildLocalWikiTurnCharacters>[0]["artifacts"],
    encounter: { npcRefs: [] } as unknown as Parameters<typeof buildLocalWikiTurnCharacters>[0]["encounter"],
    players: [{ userId: "u", characterId: "lyra" }],
    existingPlayerCharacters: [{ ...lyra, concentration: { spell: "animate-objects" } }] as unknown as Parameters<typeof buildLocalWikiTurnCharacters>[0]["existingPlayerCharacters"],
    existingNpcs: [steed, ...objects] as unknown as Parameters<typeof buildLocalWikiTurnCharacters>[0]["existingNpcs"],
  })
  const hero = next.find((character) => character.id === "lyra")
  assert.deepEqual(
    called(next as Character[]).map((each) => [each.id, each.initiative === hero?.initiative]),
    [[steed.id, true]]
  )
})

test("Conjure Animals' pack and Conjure Woodland Beings' spirits harm the caster's enemies near them, and no creature joins", () => {
  // The pack stands at 30 feet, Large, so within 10 feet of it is within 15 of its centre. The Bandit at 40 ends its turn
  // there and fails its Dexterity save on a 1: 3d10 Slashing of ones is 3, 11 to 8. One at 50 is 20 feet off, and
  // Branka, Lyra's ally, is not chosen.
  const pack = { ...lyra, concentration: { spell: "conjure-animals" }, spellEffects: [{ spell: "conjure-animals", by: "lyra", amount: 3, at: { x: 30, y: 0 } }] }
  const far = { ...bandit, id: "far", name: "Far", position: { x: 50, y: 0 } }
  const ally = { id: "branka", name: "Branka", type: "pc", sheet: sheet("welcome-to-kordavos/characters/branka-stoneveil.json"), hitPoints: 14, position: { x: 35, y: 0 } }
  const animals = spellsAtRoundEnd({ characters: [pack, { ...bandit, position: { x: 40, y: 0 } }, far, ally], d20: ones, roll: ones }).characters
  assert.deepEqual(
    ["bandit", "far", "branka"].map((id) => animals.find((character) => character.id === id)?.hitPoints),
    [8, 11, 14]
  )
  // Woodland Beings at a level 4 slot: a Bandit 10 feet from Lyra fails its Wisdom save on a 1, 5d8 Force of ones, 11
  // to 6. One 30 feet off is beyond the 10-foot Emanation.
  const spirits = { ...lyra, concentration: { spell: "conjure-woodland-beings" }, spellEffects: [{ spell: "conjure-woodland-beings", by: "lyra", amount: 4 }] }
  const woods = spellsAtRoundEnd({ characters: [spirits, { ...bandit, position: { x: 10, y: 0 } }, { ...far, position: { x: 30, y: 0 } }], d20: ones, roll: ones }).characters
  assert.deepEqual(
    ["bandit", "far"].map((id) => woods.find((character) => character.id === id)?.hitPoints),
    [6, 11]
  )
  assert.deepEqual(called(cast("conjure-animals", [lyra], { level: 3 }).characters), [])
  for (const id of ["conjure-animals", "conjure-woodland-beings"]) assert.equal(spellLabel(spell(id)), "partly")
})
