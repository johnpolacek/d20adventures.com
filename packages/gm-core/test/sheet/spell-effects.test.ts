import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { afterRoll } from "../../src/sheet/actions"
import { strike } from "../../src/sheet/attack"
import { checkBonus } from "../../src/sheet/check"
import type { ConditionEntry } from "../../src/sheet/condition-entry"
import { withCondition } from "../../src/sheet/conditions"
import { atRoundStart, withDamage } from "../../src/sheet/death"
import type { Sheet } from "../../src/sheet/sheet"
import { attackModesFromSpells, settleConcentration, spellEffectsAtEncounterEnd, spellEffectWords } from "../../src/sheet/spell-effects"
import { castSpell, spellById, targetLimit } from "../../src/sheet/spells"
import { combatStatsOf } from "../../src/sheet/stat-block"
import type { Concentration, SpellEffect } from "../../src/sheet/turn-effect"
import { castBeats, concentrationBeat } from "../../src/story/turn"
import { spellWord } from "../../src/utils/condition-label"

// Every expected value below was worked out by hand from the SRD 5.2.1 spell texts, not copied from the function's output.

const sheet = (path: string) => (JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { sheet: Sheet }).sheet
type Character = {
  id: string
  name: string
  type: string
  sheet?: Sheet
  statBlock?: string
  hitPoints?: number
  conditions?: ConditionEntry[]
  spellEffects?: SpellEffect[]
  concentration?: Concentration
  tempHitPoints?: number
  dead?: true
  isComplete?: boolean
  hasReplied?: boolean
}
// Milos, a Cleric: Wisdom 16, Constitution 12 with no proficiency in its saves, 9 hit points.
const milos: Character = { id: "milos", name: "Milos", type: "pc", sheet: sheet("welcome-to-kordavos/characters/milos-radan.json"), hitPoints: 9 }
// Branka, a Fighter: Breastplate 14, a Shield 2 and the Defense style 1 make Armor Class 17. Warhammer +5 for 1d8 + 3.
const branka: Character = { id: "branka", name: "Branka", type: "pc", sheet: sheet("welcome-to-kordavos/characters/branka-stoneveil.json"), hitPoints: 14 }
// Thalbern, a Ranger in Studded Leather: Armor Class 15. Longbow +5 for 1d8 + 3.
const thalbern: Character = { id: "thalbern", name: "Thalbern", type: "pc", sheet: sheet("the-midnight-summons/characters/thalbern.json"), hitPoints: 11 }
// Lyra, a Wizard in no armor with Dexterity 10: Armor Class 10. Ilya, a Bard with Charisma 16.
const lyra: Character = { id: "lyra", name: "Lyra", type: "pc", sheet: sheet("covert-cargo/characters/1749159962941.json"), hitPoints: 6 }
const ilya: Character = { id: "ilya", name: "Ilya", type: "pc", sheet: sheet("welcome-to-kordavos/characters/ilya-veles.json"), hitPoints: 8 }
const owlbear: Character = { id: "owlbear", name: "Owlbear", type: "npc", statBlock: "owlbear", hitPoints: 59 }
const bandit: Character = { id: "bandit", name: "Bandit", type: "npc", statBlock: "bandit", hitPoints: 11 }
const spell = (id: string) => spellById.get(id) as NonNullable<ReturnType<typeof spellById.get>>
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() as number
const find = (characters: Character[], id: string) => characters.find((character) => character.id === id) as Character
const cast = (caster: Character, id: string, targets: string[], others: Character[], dice: { d20?: number[]; roll?: number[]; attack?: number[] } = {}) =>
  castSpell({ characters: [caster, ...others], casterId: caster.id, spell: spell(id), targets, attackDice: dice.attack, d20: falls(...(dice.d20 ?? [])), roll: falls(...(dice.roll ?? [])) })

test("Bless is on up to three creatures for a minute, adds a d4 to their attack rolls and saves, and takes Concentration", () => {
  assert.equal(targetLimit(spell("bless")), 3)
  const blessed = cast(milos, "bless", ["milos", "branka", "thalbern", "lyra"], [branka, thalbern, lyra])
  // Three of the four named. A minute is ten of the bearer's own turns.
  assert.deepEqual(
    ["milos", "branka", "thalbern", "lyra"].map((id) => find(blessed.characters, id).spellEffects),
    [[{ spell: "bless", by: "milos", turns: 10 }], [{ spell: "bless", by: "milos", turns: 10 }], [{ spell: "bless", by: "milos", turns: 10 }], undefined]
  )
  assert.deepEqual([find(blessed.characters, "milos").concentration, spellEffectWords(find(blessed.characters, "branka"))], [{ spell: "bless" }, "Bless"])
  // The story names everyone it took, and it asks for no roll.
  const [entry] = castBeats({ step: "reply", character: "milos" }, milos, spell("bless"), blessed, { milos: "Milos", branka: "Branka", thalbern: "Thalbern" })
  assert.deepEqual([entry.kind, "text" in entry && entry.text, blessed.targets], ["feature", "Milos casts Bless on Milos, Branka and Thalbern.", ["milos", "branka", "thalbern"]])
  // Branka's Warhammer, +5: a 6 makes 11 against the Owlbear's 13. The d4 falls on 3: 14, a hit, for 1d8 + 3 rolling 5.
  const hit = strike({ attacker: find(blessed.characters, "branka"), target: owlbear, weapon: "warhammer", dice: [6], roll: falls(3, 5) })
  assert.deepEqual([hit.roll.total, hit.roll.adds, hit.roll.hit, hit.taken], [14, [{ from: "Bless", amount: 3 }], true, 8])
  // Without it the same 6 misses.
  assert.equal(strike({ attacker: branka, target: owlbear, weapon: "warhammer", dice: [6], roll: falls(5) }).roll.hit, false)
  // Her Dexterity save against Sacred Flame: a 10 with her +0 is 10 against Milos's own DC of 13, and the d4's 3 makes it.
  const flame = castSpell({ characters: blessed.characters, casterId: "milos", spell: spell("sacred-flame"), targets: ["branka"], d20: falls(10), roll: falls(6, 3) })
  assert.deepEqual([flame.saves[0].total, flame.saves[0].adds, flame.saves[0].success], [13, [{ from: "Bless", amount: 3 }], true])
  // A round on, nine turns are left. A new encounter ends it, with the Concentration.
  assert.deepEqual(atRoundStart(find(blessed.characters, "branka")).spellEffects, [{ spell: "bless", by: "milos", turns: 9 }])
  assert.deepEqual([spellEffectsAtEncounterEnd(find(blessed.characters, "milos")).spellEffects, spellEffectsAtEncounterEnd(find(blessed.characters, "milos")).concentration], [undefined, undefined])
})

test("Bane takes a d4 from the attack rolls and saves of those who fail its save", () => {
  // A Charisma save against 13. The Bandit adds nothing: a 5 fails. The Owlbear has -2: a 16 makes 14 and holds.
  const baned = cast(milos, "bane", ["bandit", "owlbear"], [bandit, owlbear], { d20: [5, 16] })
  assert.deepEqual([find(baned.characters, "bandit").spellEffects, find(baned.characters, "owlbear").spellEffects], [[{ spell: "bane", by: "milos", turns: 10 }], undefined])
  // His Scimitar, +3: a 12 makes 15 against Thalbern's 15. The d4's 2 comes off: 13, a miss.
  const swing = strike({ attacker: find(baned.characters, "bandit"), target: thalbern, weapon: "scimitar", dice: [12], roll: falls(2) })
  assert.deepEqual([swing.roll.total, swing.roll.adds, swing.roll.hit], [13, [{ from: "Bane", amount: -2 }], false])
})

test("Shield of Faith adds 2 to Armor Class, and Mage Armor sets 13 and Dexterity for one in no armor", () => {
  const warded = cast(milos, "shield-of-faith", ["branka"], [branka])
  assert.deepEqual([combatStatsOf(branka)?.armorClass, combatStatsOf(find(warded.characters, "branka"))?.armorClass], [17, 19])
  // Lyra wears no armor and has Dexterity 10: 10 becomes 13. It lasts eight hours with no Concentration, so no turn count.
  const armored = cast(lyra, "mage-armor", ["lyra"], [])
  assert.deepEqual(
    [combatStatsOf(lyra)?.armorClass, combatStatsOf(armored.characters[0])?.armorClass, armored.characters[0].spellEffects, armored.characters[0].concentration],
    [10, 13, [{ spell: "mage-armor", by: "lyra" }], undefined]
  )
  // On Thalbern, who wears Studded Leather, it changes nothing.
  assert.equal(combatStatsOf({ ...thalbern, spellEffects: [{ spell: "mage-armor", by: "lyra" }] })?.armorClass, 15)
  // Both outlast the encounter: eight hours, and ten minutes with Milos's Concentration on it.
  assert.deepEqual(spellEffectsAtEncounterEnd(armored.characters[0]).spellEffects, [{ spell: "mage-armor", by: "lyra" }])
  assert.deepEqual(spellEffectsAtEncounterEnd(find(warded.characters, "branka")).spellEffects, [{ spell: "shield-of-faith", by: "milos" }])
  assert.deepEqual(spellEffectsAtEncounterEnd(find(warded.characters, "milos")).concentration, { spell: "shield-of-faith" })
})

test("Hunter's Mark adds a d6 of Force to its caster's hits on the one marked", () => {
  const marked = cast(thalbern, "hunters-mark", ["owlbear"], [owlbear, branka])
  const quarry = find(marked.characters, "owlbear")
  assert.deepEqual([quarry.spellEffects, find(marked.characters, "thalbern").concentration], [[{ spell: "hunters-mark", by: "thalbern" }], { spell: "hunters-mark" }])
  // Longbow, +5: a 14 makes 19 and hits. 1d8 + 3 rolling 5 is 8, and the mark's d6 rolling 4 makes 12.
  const shot = strike({ attacker: find(marked.characters, "thalbern"), target: quarry, weapon: "longbow", dice: [14], roll: falls(5, 4) })
  assert.deepEqual(
    [shot.taken, shot.damage?.parts.map((part) => [part.type, part.total])],
    [
      12,
      [
        ["piercing", 8],
        ["force", 4],
      ],
    ]
  )
  // Branka's hit on the same Owlbear gets nothing from his mark.
  assert.equal(strike({ attacker: branka, target: quarry, weapon: "warhammer", dice: [14], roll: falls(5) }).taken, 8)
})

test("Guiding Bolt, Faerie Fire and Vicious Mockery change the attack rolls that follow", () => {
  // Guiding Bolt hits on a 12 with +5: the next attack roll against the Owlbear has Advantage, and that attack spends it.
  const bolt = cast(milos, "guiding-bolt", ["owlbear"], [owlbear, thalbern], { attack: [12], roll: [1, 1, 1, 1] })
  const lit = find(bolt.characters, "owlbear")
  assert.deepEqual(attackModesFromSpells(thalbern, lit), [{ mode: "advantage", from: "Guiding Bolt" }])
  const longbow = { attack: { weapon: "longbow", target: "owlbear" }, rollType: "Longbow", difficulty: 13, modifier: 5, mode: "advantage" as const }
  assert.equal(find(afterRoll(bolt.characters, "thalbern", longbow, 6), "owlbear").spellEffects, undefined)
  // A miss leaves nothing: a 7 makes 12.
  assert.equal(find(cast(milos, "guiding-bolt", ["owlbear"], [owlbear], { attack: [7] }).characters, "owlbear").spellEffects, undefined)
  // Faerie Fire: the Bandit fails Dexterity on a 4, and attacks against him have Advantage for the minute, however many.
  const outlined = cast(ilya, "faerie-fire", ["bandit"], [bandit, thalbern], { d20: [4] })
  assert.deepEqual(attackModesFromSpells(thalbern, find(outlined.characters, "bandit")), [{ mode: "advantage", from: "Faerie Fire" }])
  assert.deepEqual(find(afterRoll(outlined.characters, "thalbern", { ...longbow, attack: { weapon: "longbow", target: "bandit" } }, 6), "bandit").spellEffects, [
    { spell: "faerie-fire", by: "ilya", turns: 10 },
  ])
  // Vicious Mockery: the Bandit fails Wisdom on a 3, takes 1d6 Psychic, and his next attack roll has Disadvantage.
  const mocked = cast(ilya, "vicious-mockery", ["bandit"], [bandit, thalbern], { d20: [3], roll: [4] })
  const stung = find(mocked.characters, "bandit")
  assert.deepEqual([stung.hitPoints, attackModesFromSpells(stung, thalbern)], [7, [{ mode: "disadvantage", from: "Vicious Mockery" }]])
  assert.equal(
    find(afterRoll(mocked.characters, "bandit", { attack: { weapon: "scimitar", target: "thalbern" }, rollType: "Scimitar", difficulty: 15, modifier: 3, mode: "disadvantage" }, 0), "bandit")
      .spellEffects,
    undefined
  )
})

test("Temporary Hit Points are lost first: False Life's dice, and Heroism's each turn", () => {
  // False Life: 2d4 + 4 rolling 2 and 3 is 9.
  const padded = cast(lyra, "false-life", ["lyra"], [], { roll: [2, 3] }).characters[0]
  assert.deepEqual([padded.tempHitPoints, padded.hitPoints], [9, 6])
  // 5 damage leaves 4 of them and her 6 hit points. 6 more takes the 4 and 2 hit points.
  const grazed = withDamage(padded, 5).character
  assert.deepEqual([grazed.tempHitPoints, grazed.hitPoints], [4, 6])
  const hurt = withDamage(grazed, 6).character
  assert.deepEqual([hurt.tempHitPoints, hurt.hitPoints], [undefined, 4])
  // Heroism: Ilya's Charisma modifier, 3, at the start of each of Branka's turns, and she cannot be Frightened.
  const heartened = find(cast(ilya, "heroism", ["branka"], [branka]).characters, "branka")
  assert.deepEqual(heartened.spellEffects, [{ spell: "heroism", by: "ilya", turns: 10, amount: 3 }])
  const round = atRoundStart(heartened)
  assert.deepEqual([round.tempHitPoints, round.spellEffects?.[0].turns], [3, 9])
  // Spent down to 1, the next round brings them back to 3. They do not stack.
  assert.equal(atRoundStart({ ...round, tempHitPoints: 1 }).tempHitPoints, 3)
  assert.equal(withCondition(heartened, { id: "frightened", source: "owlbear" }).given, false)
})

test("Concentration: one spell at a time, a Constitution save when hurt, and none for one who drops", () => {
  const blessed = cast(milos, "bless", ["milos", "branka"], [branka])
  const con = (who: Character) => checkBonus(who, { kind: "save", ability: "con" })
  assert.equal(con(milos), 1)
  // Milos takes 4 and keeps 5 hit points. The DC is 10, half of 4 being less. A 9 with his +1 makes it.
  const struck = blessed.characters.map((character) => (character.id === "milos" ? withDamage(character, 4).character : character))
  const kept = settleConcentration({ before: blessed.characters, after: struck, bonus: con, d20: falls(9) })
  assert.deepEqual(kept.saves, [{ character: "milos", spell: "Bless", natural: 9, bonus: 1, total: 10, dc: 10, success: true }])
  // The story keeps the save as his own, to keep Concentration, and not as a target's against a spell.
  const told = concentrationBeat({ step: "npc", character: "owlbear" }, kept.saves[0], { milos: "Milos" })
  assert.deepEqual([told.character, told.check, told.spell, told.concentration, told.success], ["milos", "Constitution Saving Throw", "Bless", true, true])
  assert.deepEqual([find(kept.characters, "milos").concentration, kept.facts], [{ spell: "bless" }, []])
  // An 8 makes 9: it breaks, and Bless leaves them both.
  const broken = settleConcentration({ before: blessed.characters, after: struck, bonus: con, d20: falls(8) })
  assert.deepEqual([find(broken.characters, "milos").concentration, find(broken.characters, "milos").spellEffects, find(broken.characters, "branka").spellEffects], [undefined, undefined, undefined])
  assert.deepEqual(broken.facts, ["Milos loses Concentration, and Bless ends."])
  // Dropped to 0, he loses it with no save.
  const felled = blessed.characters.map((character) => (character.id === "milos" ? withDamage(character, 9).character : character))
  const lost = settleConcentration({ before: blessed.characters, after: felled, bonus: con, d20: falls() })
  assert.deepEqual([lost.saves, find(lost.characters, "branka").spellEffects], [[], undefined])
  // Casting Shield of Faith ends Bless: a caster holds one such spell. Its ten minutes outlast any fight, so it has no count of turns.
  const swapped = castSpell({ characters: blessed.characters, casterId: "milos", spell: spell("shield-of-faith"), targets: ["branka"], d20: falls(), roll: falls() })
  assert.deepEqual(
    [find(swapped.characters, "milos").concentration, find(swapped.characters, "branka").spellEffects, find(swapped.characters, "milos").spellEffects],
    [{ spell: "shield-of-faith" }, [{ spell: "shield-of-faith", by: "milos" }], undefined]
  )
  // A condition a Concentration spell gave ends with it: Entangle's Restrained. The Bandit fails Strength on a 4.
  const tangled = cast(thalbern, "entangle", ["bandit"], [bandit], { d20: [4] })
  assert.deepEqual(find(tangled.characters, "bandit").conditions, [{ id: "restrained", source: "thalbern", turns: 10, spell: "entangle" }])
  const freed = settleConcentration({
    before: tangled.characters,
    after: tangled.characters.map((character) => (character.id === "thalbern" ? withDamage(character, 11).character : character)),
    bonus: con,
    d20: falls(),
  })
  assert.equal(find(freed.characters, "bandit").conditions, undefined)
})

test("a spell on a card is worded as the SRD names it", () => {
  // The card has no spell data, so it words the id. Only the case of the small words may differ: "Shield Of Faith".
  for (const spell of spellById.values()) assert.equal(spellWord(spell.id).toLowerCase(), spell.name.toLowerCase())
  assert.equal(spellWord("hunters-mark"), "Hunter’s Mark")
})
