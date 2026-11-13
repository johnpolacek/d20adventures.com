import assert from "node:assert/strict"
import { test } from "node:test"
import { spellById } from "@d20/srd/spells"
import { choiceRule, resolveChosenCast } from "../../src/sheet/class-rules"
import { arcaneRecoveryOf } from "../../src/sheet/classes/wizard"
import { autoCreate, type CreationPick, createSheet } from "../../src/sheet/create"
import { sheetProblems } from "../../src/sheet/derive"
import { raisedTo } from "../../src/sheet/milestone"
import { shortRest } from "../../src/sheet/rest"
import type { Sheet } from "../../src/sheet/sheet"
import { castCost, castSpell, spellsOf, withCastSpent } from "../../src/sheet/spells"
import type { Character } from "../../src/types/character"

// Every expected value below was worked out by hand from the SRD 5.2.1 text, not copied from the function's output.
// Wynn is a human Wizard (Sage) made by the creator and raised by the choices that need no player, an Evoker from 3:
// Intelligence 17 (+3) to 3, 19 (+4) at 4 to 7, 20 (+5) from 8. Proficiency Bonus +3 at 5 to 8, +4 at 9 to 12, +5 at 13
// to 16. Spell save DC at 6 is 8 + 3 + 4 = 15, at 10 it is 8 + 4 + 5 = 17, at 14 it is 8 + 5 + 5 = 18, and the spell
// attack bonus at 3 is +5. The Ogre has Armor Class 11, Dexterity save -1 and Constitution save +3. A Guard of the
// party has Constitution save +1. Every damage die falls as 4 unless named.

const pick = { class: "wizard", species: "human", background: "sage" } as unknown as CreationPick
const made = (): Sheet => {
  const result = createSheet(pick, autoCreate(pick))
  if ("problems" in result) assert.fail(result.problems.join("; "))
  return result.sheet
}
type Hero = Character & { id: string; sheet: Sheet; featureUses?: Record<string, number>; spellSlots?: number[] }
const at = (level: number): Hero => ({ ...raisedTo({ id: "wynn", name: "Wynn", type: "pc", sheet: made(), controlledBy: "ai" } as Hero, level), position: { x: 0, y: 0 } })
const npc = (id: string, statBlock: string, hitPoints: number, side?: "party"): Character =>
  ({ id, name: id.charAt(0).toUpperCase() + id.slice(1), type: "npc", statBlock, hitPoints, position: { x: 20, y: 0 }, ...(side ? { side } : {}) }) as Character
const fours = () => 4
const find = (characters: readonly Character[], id: string) => characters.find((character) => character.id === id) as Hero
const spell = (id: string) => spellById.get(id) ?? assert.fail(id)

test("A level 20 Wizard raised with no player is legal, with spells of every level to 9 and the picks of 18 and 20", () => {
  const sheet = at(20).sheet
  assert.equal(sheet.level, 20)
  assert.deepEqual(sheetProblems(sheet), [])
  // Spellbook: 6 at level 1, two a level after (38), and the Evoker's 2 plus one for each new slot level from 5 to 17 (7).
  assert.equal(sheet.spellbook?.length, 6 + 38 + 2 + 7)
  // The Prepared Spells column at 20 is 25.
  assert.equal(sheet.spells?.length, 25)
  const levels = (ids: readonly string[]) => new Set(ids.map((id) => spell(id).level))
  assert.deepEqual([...levels(sheet.spellbook ?? [])].sort(), [1, 2, 3, 4, 5, 6, 7, 8, 9])
  assert.deepEqual([...levels(sheet.spells ?? [])].sort(), [1, 2, 3, 4, 5, 6, 7, 8, 9])
  // Spell Mastery: a level 1 and a level 2 spell of the book, each cast with an action. Signature Spells: two of level 3.
  const mastery = (sheet.featurePicks?.["wizard-spell-mastery"] ?? []).map((entry) => spell(entry.option))
  const signature = (sheet.featurePicks?.["wizard-signature-spells"] ?? []).map((entry) => spell(entry.option))
  assert.deepEqual(
    mastery.map((entry) => [entry.level, entry.castingTime.unit, sheet.spellbook?.includes(entry.id)]),
    [
      [1, "action", true],
      [2, "action", true],
    ]
  )
  assert.deepEqual(
    signature.map((entry) => [entry.level, sheet.spellbook?.includes(entry.id)]),
    [
      [3, true],
      [3, true],
    ]
  )
  // A spell not in the book is refused.
  assert.ok(sheetProblems({ ...sheet, featurePicks: { ...sheet.featurePicks, "wizard-spell-mastery": [{ option: "shield" }, { option: mastery[1].id }] } }).length > 0)
})

test("Spell Mastery casts at the spell's level with no slot as often as liked, and with a slot above it", () => {
  const wynn = at(18)
  const [first] = wynn.sheet.featurePicks?.["wizard-spell-mastery"] ?? []
  const known = spellsOf(wynn).find((entry) => entry.spell.id === first.option)
  assert.equal(known?.atWill, true)
  const plain = castCost(wynn, first.option)
  assert.ok("cost" in plain && plain.cost.kind === "cantrip")
  // Cast again: still no slot.
  const again = castCost(withCastSpent(wynn, { kind: "cantrip" }), first.option)
  assert.ok("cost" in again && again.cost.kind === "cantrip")
  // At level 3, a slot of level 3.
  assert.deepEqual("cost" in castCost(wynn, first.option, false, 3) && castCost(wynn, first.option, false, 3), { cost: { kind: "slot", level: 3 }, known })
})

test("Signature Spells cast each once at level 3 with no slot, back on a Short Rest", () => {
  const wynn = at(20)
  const [first, second] = wynn.sheet.featurePicks?.["wizard-signature-spells"] ?? []
  const free = castCost(wynn, first.option)
  const key = `wizard-signature-spells:${first.option}`
  assert.ok("cost" in free && free.cost.kind === "free" && free.cost.feature === key)
  const spent = withCastSpent(wynn, { kind: "free", feature: key })
  // The first is spent: a level 3 slot now. The second still casts free. At level 4 a slot is spent.
  const after = castCost(spent, first.option)
  assert.ok("cost" in after && after.cost.kind === "slot" && after.cost.level === 3)
  const other = castCost(spent, second.option)
  assert.ok("cost" in other && other.cost.kind === "free")
  const higher = castCost(wynn, first.option, false, 4)
  assert.ok("cost" in higher && higher.cost.kind === "slot" && higher.cost.level === 4)
  const rested = shortRest({ ...spent, hitPoints: 999 } as Hero, { roll: fours }).character
  const back = castCost(rested, first.option)
  assert.ok("cost" in back && back.cost.kind === "free")
})

test("Sculpt Spells spares up to 1 plus the spell's level of the Wizard's allies, who take no damage", () => {
  // Level 6, DC 15. Thunderwave at level 1 spares 2: the first two Guards named. The third fails on a 2 + 1 = 3 and
  // takes 2d8 = 8 of its 11. The Ogre fails on 2 + 3 = 5 and takes 8 of 68.
  const guards = ["ana", "bo", "cy"].map((id) => npc(id, "guard", 11, "party"))
  const ogre = npc("ogre", "ogre", 68)
  const wave = (wynn: Hero, level?: number) =>
    castSpell({ characters: [wynn, ...guards, ogre], casterId: "wynn", spell: spell("thunderwave"), targets: ["ana", "bo", "cy", "ogre"], measured: true, d20: () => 2, roll: fours, level })
  const cast = wave(at(6))
  assert.deepEqual(
    ["ana", "bo", "cy", "ogre"].map((id) => find(cast.characters, id).hitPoints),
    [11, 11, 3, 60]
  )
  assert.match(cast.facts.join(" "), /Wynn's Sculpt Spells spares Ana, who succeeds on the saving throw at once and takes no damage\./)
  // With a level 2 slot it spares 3: 3d8 = 12 to the Ogre alone.
  assert.deepEqual(
    ["ana", "bo", "cy", "ogre"].map((id) => find(wave(at(6), 2).characters, id).hitPoints),
    [11, 11, 11, 56]
  )
  // A level 5 Wizard has no Sculpt Spells: every Guard takes 8.
  assert.deepEqual(
    ["ana", "bo", "cy"].map((id) => find(wave(at(5)).characters, id).hitPoints),
    [3, 3, 3]
  )
})

test("Empowered Evocation adds Intelligence to one damage roll of a Wizard Evocation spell", () => {
  // Level 10, Intelligence +5. Fireball: 8d6 = 32 + 5 = 37 to the failing Ogre, 32 at level 9.
  const ogre = npc("ogre", "ogre", 68)
  const fireball = (wynn: Hero) => castSpell({ characters: [wynn, ogre], casterId: "wynn", spell: spell("fireball"), targets: ["ogre"], d20: () => 2, roll: fours })
  assert.equal(find(fireball(at(10)).characters, "ogre").hitPoints, 68 - 37)
  assert.equal(find(fireball(at(9)).characters, "ogre").hitPoints, 68 - 32)
  // Fire Bolt hits on a 15: 2d10 = 8 + 5 = 13.
  const bolt = castSpell({ characters: [at(10), ogre], casterId: "wynn", spell: spell("fire-bolt"), targets: ["ogre"], attackDice: [15], d20: () => 15, roll: fours })
  assert.equal(find(bolt.characters, "ogre").hitPoints, 68 - 13)
  // Magic Missile's three darts roll apart, 1d4 + 1 = 5 each: none takes the bonus.
  const missile = castSpell({ characters: [at(10), ogre], casterId: "wynn", spell: spell("magic-missile"), targets: ["ogre"], d20: () => 2, roll: fours })
  assert.equal(find(missile.characters, "ogre").hitPoints, 68 - 15)
})

test("Potent Cantrip's numbers are unchanged: half on a miss or a save, from level 3", () => {
  // Level 3: Fire Bolt's 1d10 = 4 misses on a 2 (2 + 5 = 7 against 11) and deals 2. Acid Splash's 1d6 = 4 is saved on a
  // 19 and deals 2. A level 2 Wizard deals none.
  const ogre = npc("ogre", "ogre", 68)
  const bolt = (wynn: Hero) => castSpell({ characters: [wynn, ogre], casterId: "wynn", spell: spell("fire-bolt"), targets: ["ogre"], attackDice: [2], d20: () => 2, roll: fours })
  const splash = (wynn: Hero) => castSpell({ characters: [wynn, ogre], casterId: "wynn", spell: spell("acid-splash"), targets: ["ogre"], d20: () => 19, roll: fours })
  assert.deepEqual(
    [bolt(at(3)), splash(at(3)), bolt(at(2)), splash(at(2))].map((cast) => find(cast.characters, "ogre").hitPoints),
    [66, 66, 68, 68]
  )
})

test("Overchannel deals maximum damage, free the first time, then 2d12 Necrotic a slot level, 1d12 more each use", () => {
  // Level 14, DC 18, Intelligence +5. Fireball with a level 3 slot overchannelled: 8d6 at their highest, 48, + 5 = 53.
  const ogre = npc("ogre", "ogre", 68)
  const blast = (wynn: Hero, id: string, level: number, overchannel = true) =>
    resolveChosenCast({
      choices: overchannel ? { overchannel: true } : {},
      input: { characters: [wynn, ogre], casterId: "wynn", spell: spell(id), targets: ["ogre"], d20: () => 2, roll: fours, level },
      slot: level,
      resolve: (input) => castSpell(input),
    })
  const wynn = { ...at(14), hitPoints: 80 }
  const first = blast(wynn, "fireball", 3)
  assert.equal(find(first.characters, "ogre").hitPoints, 68 - 53)
  assert.deepEqual([find(first.characters, "wynn").hitPoints, find(first.characters, "wynn").featureUses?.["evoker-overchannel"], find(first.characters, "wynn").turnEffects], [80, 1, undefined])
  // The second: 2d12 a level of the level 3 slot, 6d12 = 24. The third, Burning Hands with a level 1 slot: 3d12 = 12.
  const second = blast(find(first.characters, "wynn"), "fireball", 3)
  assert.equal(find(second.characters, "wynn").hitPoints, 56)
  assert.match(second.facts.join(" "), /Wynn takes 24 Necrotic damage from Overchannel \(6d12\)\./)
  const third = blast(find(second.characters, "wynn"), "burning-hands", 1)
  assert.equal(find(third.characters, "wynn").hitPoints, 44)
  // Unasked, Fireball deals 32 + 5 = 37. A level 6 slot does not take it: Chain Lightning's 10d8 = 40 + 5 = 45.
  assert.equal(find(blast(wynn, "fireball", 3, false).characters, "ogre").hitPoints, 68 - 37)
  assert.equal(find(blast(wynn, "chain-lightning", 6).characters, "ogre").hitPoints, 68 - 45)
  // The read keeps it only on a Wizard spell that deals damage, cast with a slot of level 1 to 5.
  const fits = (id: string, slot?: number) => !!choiceRule("overchannel")?.cast?.fits(wynn, { spell: spell(id), level: slot ?? spell(id).level, slot }, true)
  assert.deepEqual([fits("fireball", 3), fits("chain-lightning", 6), fits("fireball"), fits("shield", 1), fits("cure-wounds", 1)], [true, false, false, false, false])
})

test("Arcane Recovery at level 20 takes back 10 levels of slots, none above level 5", () => {
  // Half of 20 is 10: two level 5 slots of the spent ones, the highest first.
  assert.deepEqual(arcaneRecoveryOf({ sheet: at(20).sheet, spellSlots: [2, 2, 2, 2, 2, 1, 1] }), [0, 0, 0, 0, 2])
})
