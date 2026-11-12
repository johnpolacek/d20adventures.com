import assert from "node:assert/strict"
import { test } from "node:test"
import { attacksOf } from "../../src/sheet/attack"
import { attackAfter, type InScene } from "../../src/sheet/attack-roll"
import { checkBonus } from "../../src/sheet/check"
import { druid, landsAid } from "../../src/sheet/classes/druid"
import { autoCreate, type CreationPick, createSheet } from "../../src/sheet/create"
import { withDamage } from "../../src/sheet/death"
import { deriveSheet, sheetProblems } from "../../src/sheet/derive"
import { bonusActionsOf, useBonusAction } from "../../src/sheet/features"
import { raisedTo } from "../../src/sheet/milestone"
import { shortRest } from "../../src/sheet/rest"
import type { Sheet } from "../../src/sheet/sheet"
import { speedOf } from "../../src/sheet/space"
import { castCost, castSpell, spellById } from "../../src/sheet/spells"
import { combatStatsOf, initiativeBonusOf } from "../../src/sheet/stat-block"
import { sheetView } from "../../src/sheet/view"
import type { Character } from "../../src/types/character"

// Every expected value below was worked out by hand from the SRD 5.2.1 text, not copied from the function's output.
// Briar is a human Druid made by the creator with the Sage background: Strength 8 (-1), Dexterity 12 (+1),
// Constitution 15 (+2), Intelligence 13 (+1), Wisdom 17 (+3, 19 and +4 from level 4), Proficiency Bonus +2 to level 4
// and +3 at 5. She is trained in Arcana (the Sage's) and Perception, not in Nature or Stealth. At level 3 her spell save
// DC is 8 + 2 + 3 = 13, and her hit points 8 + 2 and 5 + 2 at each level after: 24. Her known forms are the four the
// SRD recommends, the Rat, Riding Horse, Spider and Wolf, and from level 4 an Ape and a Black Bear. Every die falls as 4.

const pick = { class: "druid", species: "human", background: "sage" } as unknown as CreationPick
const made = (): Sheet => {
  const result = createSheet(pick, autoCreate(pick))
  if ("problems" in result) assert.fail(result.problems.join("; "))
  return result.sheet
}
type Hero = Character & { id: string; sheet: Sheet }
const at = (level: number, id = "briar", name = "Briar"): Hero => raisedTo({ id, name, type: "pc", sheet: made(), controlledBy: "ai" } as Hero, level)
const fours = () => 4
const find = (characters: readonly Character[], id: string) => characters.find((character) => character.id === id) as Hero & Record<string, unknown>

test("Primal Order: a Magician adds the Wisdom modifier to Arcana and Nature checks, a Warden is trained in Martial weapons and Medium armor", () => {
  const warden = made()
  assert.equal(warden.featureChoices?.["druid-primal-order"], "warden")
  const trained = deriveSheet(warden)
  assert.ok(trained.weaponProficiencies.some((entry) => "category" in entry && entry.category === "martial"))
  assert.ok(trained.armorTraining.includes("medium"))
  // A Warden's Arcana is 1 + 2 = 3, and Nature 1.
  assert.deepEqual([trained.skills.arcana.bonus, trained.skills.nature.bonus], [3, 1])
  // A Magician knows one more Druid cantrip, three in all, and adds Wisdom's +3: Arcana 3 + 3 = 6, Nature 1 + 3 = 4.
  const magician: Sheet = { ...warden, featureChoices: { "druid-primal-order": "magician" }, cantrips: [...(warden.cantrips ?? []), "guidance"] }
  assert.deepEqual(sheetProblems(magician), [])
  const read = deriveSheet(magician)
  assert.deepEqual([read.skills.arcana.bonus, read.skills.nature.bonus, read.skills.history.bonus], [6, 4, 3])
})

test("Druidic: Speak with Animals is always prepared, and a level 5 Druid casts a level 1 spell and a cantrip by the one cast path", () => {
  const briar = at(5)
  assert.ok(deriveSheet(briar.sheet).alwaysPrepared.includes("speak-with-animals"))
  assert.ok(deriveSheet(briar.sheet).classFeatures.includes("druid-druidic"))
  const cantrip = castCost(briar, "starry-wisp")
  assert.ok(!("problem" in cantrip) && cantrip.cost.kind === "cantrip")
  const paid = castCost(briar, "cure-wounds")
  assert.ok(!("problem" in paid) && paid.cost.kind === "slot" && paid.cost.level === 1)
  // Cure Wounds: 2d8 and the Wisdom modifier, 4 + 4 + 4 = 12, on an ally down 15.
  const ally = { ...at(5, "mira", "Mira"), hitPoints: 20 }
  const cast = castSpell({ characters: [briar, ally], casterId: "briar", spell: spellById.get("cure-wounds") as never, targets: ["mira"], d20: () => 10, roll: fours })
  assert.equal(find(cast.characters, "mira").hitPoints, 32)
})

test("Known forms: four Beasts of Challenge Rating 1/4 with no Fly Speed at level 2, six of 1/2 at level 4", () => {
  const two = at(2).sheet
  assert.deepEqual(
    two.featurePicks?.["druid-wild-shape"]?.map((entry) => entry.option),
    ["rat", "riding-horse", "spider", "wolf"]
  )
  assert.deepEqual(sheetProblems(two), [])
  // An Ape is Challenge Rating 1/2, and a Giant Bat flies: neither may be known at level 2.
  const wrong: Sheet = { ...two, featurePicks: { "druid-wild-shape": [{ option: "rat" }, { option: "ape" }, { option: "giant-bat" }, { option: "rat" }] } }
  assert.equal(sheetProblems(wrong).length, 3)
  assert.equal(at(4).sheet.featurePicks?.["druid-wild-shape"]?.length, 6)
})

test("Wild Shape: a known form as a Bonus Action, with the Beast's attacks, Armor Class, Speed and physical scores, and the hero's own hit points and mind", () => {
  const briar = at(3)
  const menu = bonusActionsOf(briar).filter((entry) => entry.id.startsWith("wild-shape-"))
  assert.deepEqual(
    menu.map((entry) => [entry.id, entry.left]),
    [
      ["wild-shape-rat", 2],
      ["wild-shape-riding-horse", 2],
      ["wild-shape-spider", 2],
      ["wild-shape-wolf", 2],
    ]
  )
  const used = useBonusAction({ characters: [briar], actorId: "briar", feature: "wild-shape-wolf", roll: fours })
  const wolf = find(used.characters, "briar")
  // One of the two uses spent, a form of half the level in hours (1), and the Druid level, 3, in Temporary Hit Points.
  assert.deepEqual([wolf.featureUses, wolf.shape, wolf.tempHitPoints], [{ "druid-wild-shape": 1 }, { form: "wolf", hours: 1 }, 3])
  // The Wolf's Bite, +4 for 1d6 + 2, its Armor Class 12 and Speed 40, and her 24 hit points.
  assert.deepEqual(
    attacksOf(wolf).map((attack) => [attack.id, attack.bonus, attack.damage[0]?.dice]),
    [["bite", 4, "1d6 + 2"]]
  )
  assert.deepEqual([combatStatsOf(wolf)?.armorClass, combatStatsOf(wolf)?.hitPointMaximum, speedOf(wolf)], [12, 24, 40])
  // Strength save: the Wolf's +2 over her own -1. Wisdom save: her +3 and proficiency, 5, over the Wolf's +1.
  // Perception: her 3 + 2 = 5 ties the Wolf's 5. Stealth: the Wolf's +4 over her Dexterity, now the Wolf's +2.
  // Initiative is the Wolf's Dexterity, +2.
  assert.deepEqual(
    [
      checkBonus(wolf, { kind: "save", ability: "str" }),
      checkBonus(wolf, { kind: "save", ability: "wis" }),
      checkBonus(wolf, { kind: "skill", skill: "perception" }),
      checkBonus(wolf, { kind: "skill", skill: "stealth" }),
      initiativeBonusOf(wolf),
    ],
    [2, 5, 5, 4, 2]
  )
  // No spells in a form: a cantrip too.
  assert.ok("problem" in castCost(wolf, "starry-wisp"))
  // 5 damage takes the 3 Temporary Hit Points first, then 2 of her own.
  const hit = withDamage(wolf, 5).character
  assert.deepEqual([hit.tempHitPoints, hit.hitPoints], [undefined, 22])
  // The sheet view names the form.
  assert.equal(sheetView(wolf.sheet, 24, undefined, undefined, wolf.featureUses, wolf.shape).form, "Wolf")
})

test("Wild Shape ends by choice, with the Incapacitated condition as the round turns, and when a rest's hours pass its own", () => {
  const briar = at(3)
  const wolf = find(useBonusAction({ characters: [briar], actorId: "briar", feature: "wild-shape-wolf", roll: fours }).characters, "briar")
  const left = find(useBonusAction({ characters: [wolf], actorId: "briar", feature: "leave-wild-shape", roll: fours }).characters, "briar")
  assert.equal(left.shape, undefined)
  // Stunned is Incapacitated: the Wolf's Armor Class stops counting at once, and the shape is dropped as the round turns.
  const stunned = { ...wolf, conditions: [{ id: "stunned" as const }] }
  assert.notEqual(combatStatsOf(stunned)?.armorClass, 12)
  assert.equal((druid.roundStart?.(stunned).character as Hero & { shape?: unknown }).shape, undefined)
  // A Short Rest is an hour: a level 3 Druid's form of 1 hour ends, a level 5 Druid's of 2 hours has 1 left.
  assert.equal((shortRest(wolf, { roll: fours }).character as typeof wolf).shape, undefined)
  const five = find(useBonusAction({ characters: [at(5)], actorId: "briar", feature: "wild-shape-wolf", roll: fours }).characters, "briar")
  assert.deepEqual((shortRest(five, { roll: fours }).character as typeof five).shape, { form: "wolf", hours: 1 })
})

test("An Ape form makes the Ape's Multiattack, two Fists", () => {
  const briar = at(4)
  const ape = find(useBonusAction({ characters: [briar], actorId: "briar", feature: "wild-shape-ape", roll: fours }).characters, "briar")
  assert.deepEqual(attackAfter(ape as unknown as InScene, { weapon: "fist" }), { multiattack: [["fist"]] })
})

test("Wild Resurgence: a slot buys a use once a turn with none left, and once a Long Rest a use gives a level 1 slot", () => {
  const spent = { ...at(5), featureUses: { "druid-wild-shape": 2 } }
  assert.equal(bonusActionsOf(spent).find((entry) => entry.id === "wild-shape-wolf")?.slot, 1)
  const once = find(useBonusAction({ characters: [spent], actorId: "briar", feature: "wild-shape-wolf", roll: fours }).characters, "briar")
  assert.deepEqual([once.spellSlots, once.featureUses, once.shape], [[1], { "druid-wild-shape": 2 }, { form: "wolf", hours: 2 }])
  // Not twice in one turn: no use left and no slot to buy one.
  const rat = bonusActionsOf(once).find((entry) => entry.id === "wild-shape-rat")
  assert.deepEqual([rat?.left, rat?.slot], [0, undefined])
  assert.equal(useBonusAction({ characters: [once], actorId: "briar", feature: "wild-shape-rat", roll: fours }).use, undefined)
  // With every slot spent and a use left, as a round begins: a use for a level 1 slot, and not again.
  const dry = { ...at(5), spellSlots: [4, 3, 2] }
  const traded = druid.roundStart?.(dry).character as typeof dry
  assert.deepEqual([traded.spellSlots, traded.featureUses], [[3, 3, 2], { "druid-wild-shape": 1, "druid-wild-resurgence": 1 }])
  const again = druid.roundStart?.({ ...traded, spellSlots: [4, 3, 2] }).character as typeof dry
  assert.deepEqual(again.spellSlots, [4, 3, 2])
})

test("Land's Aid: a use of Wild Shape for 2d6 Necrotic on a Constitution save in a 10-foot Sphere, and 2d6 hit points for one in it", () => {
  const briar = { ...at(3), position: { x: 0, y: 0 } }
  const mira = { ...at(3, "mira", "Mira"), hitPoints: 10, position: { x: 35, y: 0 } }
  const goblin = { id: "goblin", name: "Goblin", type: "npc", statBlock: "goblin-warrior", hitPoints: 10, position: { x: 30, y: 0 } } as unknown as Hero
  const far = { id: "far", name: "Far Goblin", type: "npc", statBlock: "goblin-warrior", hitPoints: 10, position: { x: 50, y: 0 } } as unknown as Hero
  // DC 13. The 2d6 is 8. The Goblin's 10 on its save, +0, fails: 8 Necrotic, 10 - 8 = 2. The one 20 feet past it is
  // out of the Sphere. Mira, 5 feet from the Goblin, regains 8: 18. Two uses of Wild Shape at level 3, one spent.
  const used = landsAid({ characters: [briar, mira, goblin, far], druidId: "briar", targets: ["mira", "goblin", "far"], heal: true, d20: () => 10, roll: fours })
  assert.equal(used.problem, undefined)
  assert.deepEqual(
    [find(used.characters, "goblin").hitPoints, find(used.characters, "far").hitPoints, find(used.characters, "mira").hitPoints, find(used.characters, "briar").featureUses],
    [2, 10, 18, { "druid-wild-shape": 1 }]
  )
  // A save of 13 succeeds: half of 8, 4. With no one named to heal, the most hurt of Briar's side in the Sphere is.
  const halved = landsAid({ characters: [briar, mira, goblin], druidId: "briar", targets: ["goblin"], d20: () => 13, roll: fours })
  assert.deepEqual([find(halved.characters, "goblin").hitPoints, find(halved.characters, "mira").hitPoints], [6, 18])
  // Out of 60 feet, it is not used.
  const away = { ...goblin, position: { x: 70, y: 0 } }
  assert.ok(landsAid({ characters: [briar, away], druidId: "briar", targets: ["goblin"], d20: () => 10, roll: fours }).problem)
})
