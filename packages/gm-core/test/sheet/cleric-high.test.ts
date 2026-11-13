import assert from "node:assert/strict"
import { test } from "node:test"
import { spellById } from "@d20/srd/spells"
import { strike } from "../../src/sheet/attack"
import { channelDivinity } from "../../src/sheet/channel-divinity"
import { autoCreate, type CreationPick, createSheet } from "../../src/sheet/create"
import { usesLeft, withUsedThisTurn } from "../../src/sheet/feature-rules"
import { raisedTo } from "../../src/sheet/milestone"
import { longRest } from "../../src/sheet/rest"
import type { Sheet } from "../../src/sheet/sheet"
import { castCost, castSpell, spellsOf, withCastSpent } from "../../src/sheet/spells"
import type { Character } from "../../src/types/character"

// Every expected value below was worked out by hand from the SRD 5.2.1 text, not copied from the function's output.
// Mira is a human Cleric of the Life Domain made by the creator and raised by the choices that need no player: Strength
// 14 (+2) with a Mace (1d6 + 2, +5 to hit from level 5), Wisdom 17 (+3) to level 3, 18 (+4) at 6 and 7, 20 (+5) from
// 10. Proficiency Bonus +2 to 4, +3 at 5 to 8, +4 at 9 to 12, +5 at 13 to 16, +6 from 17. Her spell save DC at 10 is
// 8 + 4 + 5 = 17. The raise takes Divine Strike for Blessed Strikes. Every die falls as 4 unless named.

const pick = { class: "cleric", species: "human", background: "acolyte" } as unknown as CreationPick
const made = (): Sheet => {
  const result = createSheet(pick, autoCreate(pick))
  if ("problems" in result) assert.fail(result.problems.join("; "))
  return result.sheet
}
type Hero = Character & { id: string; sheet: Sheet; featureUses?: Record<string, number>; spellSlots?: number[]; tempHitPoints?: number }
const at = (level: number, x = 0, id = "mira", name = "Mira"): Hero => ({ ...raisedTo({ id, name, type: "pc", sheet: made(), controlledBy: "ai" } as Hero, level), position: { x, y: 0 } })
const potent = (hero: Hero): Hero => ({ ...hero, sheet: { ...hero.sheet, featureChoices: { ...hero.sheet.featureChoices, "cleric-blessed-strikes": "potent-spellcasting" } } })
const npc = (id: string, statBlock: string, hitPoints: number, x = 5): Character =>
  ({ id, name: id.charAt(0).toUpperCase() + id.slice(1), type: "npc", statBlock, hitPoints, position: { x, y: 0 } }) as Character
const fours = () => 4
const find = (characters: readonly Character[], id: string) => characters.find((character) => character.id === id) as Hero
const spell = (id: string) => spellById.get(id) ?? assert.fail(id)

test("Channel Divinity's uses rise to 3 at level 6 and 4 at 18", () => {
  assert.deepEqual(
    [5, 6, 17, 18].map((level) => usesLeft(at(level), "cleric-channel-divinity")),
    [2, 3, 3, 4]
  )
})

test("Divine Strike: 1d8 Radiant on a weapon hit once on the Cleric's own turn, 2d8 from 14", () => {
  // The Mace's d6 rolls 3, + 2 is 5. Divine Strike's d8 rolls 5: 10 in all. At 14 its 2d8 roll 5 and 5: 15.
  const roll = (sides: number) => (sides === 6 ? 3 : 5)
  const ogre = npc("ogre", "ogre", 68)
  const hit = (mira: Hero, turnOf: string) => strike({ attacker: mira, target: ogre, weapon: "mace", dice: [18], turnOf, roll })
  const seven = hit(at(7), "mira")
  assert.deepEqual([seven.taken, seven.features, seven.used, seven.damage?.parts.map((part) => part.type)], [10, ["Divine Strike"], ["divine-strike"], ["bludgeoning", "radiant"]])
  assert.equal(hit(at(14), "mira").taken, 15)
  // Once a turn, on her own turn only, and not at level 6 or for a Cleric who took Potent Spellcasting.
  assert.equal(hit(withUsedThisTurn(at(7), "divine-strike", "mira"), "mira").taken, 5)
  assert.deepEqual([hit(at(7), "ogre").taken, hit(at(6), "mira").taken, hit(potent(at(7)), "mira").taken], [5, 5, 5])
})

test("Potent Spellcasting adds Wisdom to Sacred Flame, and from 14 gives Temporary Hit Points to the most hurt near", () => {
  // Level 10: Sacred Flame is 2d8. The Ogre's Dexterity save is -1: a 2 makes 1 against DC 17 and fails. 4 + 4 + 5 = 13
  // Radiant, where a Cleric of Divine Strike deals 8.
  const flame = (mira: Hero, others: Character[]) => castSpell({ characters: [mira, ...others], casterId: "mira", spell: spell("sacred-flame"), targets: ["ogre"], d20: () => 2, roll: fours })
  const ogre = npc("ogre", "ogre", 68, 30)
  assert.equal(find(flame(potent(at(10)), [ogre]).characters, "ogre").hitPoints, 55)
  assert.equal(find(flame(at(10), [ogre]).characters, "ogre").hitPoints, 60)
  // Level 14, Sacred Flame still 2d8 and 13 damage. Twice the Wisdom modifier is 10 Temporary Hit Points: Bram at 60
  // feet and 4 of 9 hit points takes them over Mira at full. Cora at 70 feet, more hurt, is out of reach.
  const bram = { ...at(1, 60, "bram", "Bram"), hitPoints: 4 }
  const cora = { ...at(1, -70, "cora", "Cora"), hitPoints: 1 }
  const cast = flame(potent(at(14)), [ogre, bram, cora])
  assert.deepEqual([find(cast.characters, "bram").tempHitPoints, find(cast.characters, "cora").tempHitPoints, find(cast.characters, "mira").tempHitPoints], [10, undefined, undefined])
  assert.match(cast.facts.join(" "), /Mira's Potent Spellcasting gives Bram 10 Temporary Hit Points\./)
  // Not at 13, and not when the cantrip deals nothing: the Ogre's 19 saves.
  assert.equal(find(flame(potent(at(13)), [ogre, bram]).characters, "bram").tempHitPoints, undefined)
  const saved = castSpell({ characters: [potent(at(14)), ogre, bram], casterId: "mira", spell: spell("sacred-flame"), targets: ["ogre"], d20: () => 19, roll: fours })
  assert.equal(find(saved.characters, "bram").tempHitPoints, undefined)
})

test("Disciple of Life's numbers are unchanged, and it needs a slot spent", () => {
  // Level 3, Wisdom +3. Cure Wounds with a level 1 slot: 2d8 (8) + 3 + Disciple of Life's 2 + 1 = 14. With a level 2
  // slot: 4d8 (16) + 3 + 2 + 2 = 23. Cast with no slot: 8 + 3 = 11.
  const ogre = npc("ogre", "ogre", 10)
  const cure = (level: number, noSlot?: boolean) =>
    castSpell({ characters: [at(3), ogre], casterId: "mira", spell: spell("cure-wounds"), targets: ["ogre"], level, d20: fours, roll: fours, ...(noSlot ? { noSlot } : {}) }).harm[0]?.amount
  assert.deepEqual([cure(1), cure(2), cure(1, true)], [14, 23, 11])
})

test("Blessed Healer: a slot's healing of another heals the Cleric by 2 and the slot's level", () => {
  // Level 6, Wisdom +4, 39 hit points, hurt to 10. Cure Wounds on Bram with a level 2 slot heals Mira 2 + 2 = 4: 14.
  // On herself, or cast with no slot, nothing more.
  const mira = { ...at(6), hitPoints: 10 }
  const bram = { ...at(1, 5, "bram", "Bram"), hitPoints: 1 }
  const cure = (target: string, noSlot?: boolean) =>
    castSpell({ characters: [mira, bram], casterId: "mira", spell: spell("cure-wounds"), targets: [target], level: 2, d20: fours, roll: fours, ...(noSlot ? { noSlot } : {}) })
  const healed = cure("bram")
  assert.equal(find(healed.characters, "mira").hitPoints, 14)
  assert.match(healed.facts.join(" "), /Mira's Blessed Healer restores 4 hit points to them/)
  // On herself: 4d8 (16) + 4 + Disciple's 4 = 24, 34 in all, and no Blessed Healer.
  assert.equal(find(cure("mira").characters, "mira").hitPoints, 34)
  assert.equal(find(cure("bram", true).characters, "mira").hitPoints, 10)
})

test("Supreme Healing: a spell's and Divine Spark's healing dice count their highest", () => {
  // Level 17, Wisdom +5. Cure Wounds with a level 1 slot: 16 + 5 + 3 = 24. Divine Spark heals with 3d8 from 13: 24 + 5
  // = 29. At 16 it rolls 3 fours: 12 + 5 = 17. Its harm is still rolled.
  const ogre = npc("ogre", "ogre", 10)
  const cure = castSpell({ characters: [at(17), ogre], casterId: "mira", spell: spell("cure-wounds"), targets: ["ogre"], level: 1, d20: fours, roll: fours })
  assert.equal(cure.harm[0]?.amount, 24)
  const spark = (level: number, heal: boolean) =>
    channelDivinity({ characters: [at(level), ogre], clericId: "mira", effect: "divine-spark", targets: ["ogre"], heal, d20: () => 1, roll: fours }).harm[0]?.amount
  assert.deepEqual([spark(17, true), spark(16, true), spark(17, false)], [29, 17, 17])
})

test("Divine Intervention: any Cleric spell of level 5 or lower with no slot, once a Long Rest", () => {
  const mira = at(10)
  // Hold Person is not prepared: cast by Divine Intervention. Heal, of level 6, is not offered, nor Wish before 20.
  const hold = castCost(mira, "hold-person")
  assert.ok("cost" in hold)
  assert.deepEqual(hold.cost, { kind: "free", feature: "cleric-divine-intervention" })
  assert.deepEqual(
    ["heal", "wish"].map((id) => spellsOf(mira).some((known) => known.spell.id === id)),
    [false, false]
  )
  // Flame Strike is prepared: a slot while one of level 5 is left, Divine Intervention when none is.
  const flame = castCost(mira, "flame-strike")
  assert.ok("cost" in flame)
  assert.deepEqual(flame.cost, { kind: "slot", level: 5 })
  const drained = castCost({ ...mira, spellSlots: [0, 0, 0, 0, 2] }, "flame-strike")
  assert.ok("cost" in drained)
  assert.equal(drained.cost.kind, "free")
  // Spent, it is gone until a Long Rest. Not at level 9.
  const spent = withCastSpent(mira, hold.cost)
  assert.ok("problem" in castCost(spent, "hold-person"))
  assert.ok("problem" in castCost(at(9), "hold-person"))
  assert.ok("cost" in castCost(longRest(spent).character, "hold-person"))
})

test("Greater Divine Intervention: Wish, and Divine Intervention is back only after 2d4 Long Rests", () => {
  const mira = at(20)
  const wish = castCost(mira, "wish")
  assert.ok("cost" in wish)
  // The 2d4 roll 3 and 2: five Long Rests. The first four leave Divine Intervention spent, the fifth gives it back.
  const roll = (() => {
    const falls = [3, 2]
    return () => falls.shift() ?? 1
  })()
  const cast = castSpell({ characters: [withCastSpent(mira, wish.cost)], casterId: "mira", spell: spell("wish"), targets: [], noSlot: true, d20: fours, roll })
  assert.match(cast.facts.join(" "), /cannot call on Divine Intervention again until they finish 5 Long Rests \(2d4: 3 and 2\)/)
  let now = find(cast.characters, "mira")
  const left: number[] = []
  for (let rest = 0; rest < 5; rest++) {
    now = longRest(now).character
    left.push(usesLeft(now, "cleric-divine-intervention"))
  }
  assert.deepEqual(left, [0, 0, 0, 0, 1])
})
