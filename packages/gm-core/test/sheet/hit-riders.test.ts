import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { monsterById, monsters } from "@d20/srd/monsters"
import { takeAction } from "../../src/sheet/actions"
import { attacksOf, strike, strikeFacts } from "../../src/sheet/attack"
import { attackRequirement } from "../../src/sheet/attack-roll"
import type { ConditionEntry } from "../../src/sheet/condition-entry"
import { withoutCondition } from "../../src/sheet/conditions"
import { chargedFeet, escapeFrom, readRiders, releasedHolds, riderReadings } from "../../src/sheet/hit-riders"
import type { Sheet } from "../../src/sheet/sheet"
import { roundTurns } from "../../src/sheet/spell-rounds"
import type { TurnEffect } from "../../src/sheet/turn-effect"

// Every expected value below was worked out by hand from the SRD 5.2.1 stat blocks, not copied from the functions'
// output. Thalbern is a level 1 human Ranger: Armor Class 15 (Studded Leather 12 and Dexterity 3), 11 hit points,
// Constitution save +1, Medium. Wrenna is a level 1 elf Ranger.

type Character = {
  id: string
  name: string
  type: string
  sheet?: Sheet
  statBlock?: string
  shape?: { form: string; hours: number }
  hitPoints: number
  position?: { x: number; y: number }
  conditions?: ConditionEntry[]
  turnEffects?: TurnEffect[]
  isComplete?: boolean
}
const sheetAt = (path: string) => (JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { sheet: Sheet }).sheet
const thalbern: Character = { id: "thalbern", name: "Thalbern", type: "pc", sheet: sheetAt("the-midnight-summons/characters/thalbern.json"), hitPoints: 11 }
const wrenna: Character = { id: "wrenna", name: "Wrenna", type: "pc", sheet: sheetAt("welcome-to-kordavos/characters/wrenna-faelendar.json"), hitPoints: 9 }
const npc = (id: string, statBlock: string, hitPoints: number): Character => ({ id, name: id[0].toUpperCase() + id.slice(1), type: "npc", statBlock, hitPoints })
const at = <T extends Character>(one: T, x: number, y = 0): T => ({ ...one, position: { x, y } })
const find = (characters: readonly unknown[], id: string) => (characters as Character[]).find((character) => character.id === id) as Character
const falls =
  (...dice: number[]) =>
  () => {
    if (!dice.length) throw new Error("no die left")
    return dice.shift() as number
  }

test("every stat block's attack riders, read or left told with the reason", () => {
  // 101 attacks across the 330 blocks type something beyond their hit's damage: a condition, a save, an escape DC, a
  // later or a charged part. The 23 unread, each for words the engine does not run, are counted from their texts.
  const readings = monsters.flatMap((monster) => riderReadings(monster).map((entry) => ({ id: `${monster.id}/${entry.action}`, ...entry })))
  assert.equal(monsters.length, 330)
  assert.equal(readings.length, 101)
  const unread = readings.filter((entry) => "unread" in entry.read).map((entry) => entry.id)
  assert.equal(readings.length - unread.length, 78)
  assert.deepEqual(unread.sort(), [
    "allosaurus/Claws",
    "animated-rug-of-smothering/Smother",
    "balor/Flame Whip",
    "bearded-devil/Beard",
    "bearded-devil/Infernal Glaive",
    "bone-devil/Infernal Sting",
    "cloaker/Attach",
    "cockatrice/Petrifying Bite",
    "darkmantle/Crush",
    "death-dog/Bite",
    "gibbering-mouther/Bite",
    "homunculus/Bite",
    "otyugh/Bite",
    "phase-spider/Bite",
    "pit-fiend/Bite",
    "roper/Tentacle",
    "tarrasque/Bite",
    "vampire-familiar/Umbral Dagger",
    "werebear/Bite",
    "wereboar/Gore",
    "wererat/Bite",
    "weretiger/Bite",
    "werewolf/Bite",
  ])
  // None of the 19 blocks the four adventures use has a rider on its attacks.
  const used = ["bandit", "bandit-captain", "commoner", "cultist", "cultist-fanatic", "druid", "green-dragon-wyrmling", "guard", "guard-captain", "mage", "noble", "owlbear", "priest"]
  for (const id of [...used, "priest-acolyte", "scout", "skeleton", "spy", "tough", "warrior-infantry"]) assert.deepEqual(riderReadings(monsterById.get(id) ?? monsters[0]), [], id)
})

test("readings of the text: a size, a save with its gate, a grapple's parts, a charge, an attachment", () => {
  const read = (id: string, name: string) => readRiders(monsterById.get(id)?.actions?.find((action) => action.name === name) ?? ({} as never))
  // "If the target is a Medium or smaller creature, it has the Prone condition."
  assert.deepEqual(read("wolf", "Bite"), { riders: [{ kind: "condition", conditions: ["prone"], span: "turn", gate: { size: "Medium" } }] })
  // "If the target is a creature that isn't an Undead or elf ... Constitution Saving Throw: DC 10. Failure: ... Paralyzed
  // condition until the end of its next turn."
  assert.deepEqual(read("ghoul", "Claw"), {
    riders: [{ kind: "condition", conditions: ["paralyzed"], span: "turn", save: { ability: "con", dc: 10 }, gate: { notTypes: ["undead"], notElf: true } }],
  })
  // "it has the Grappled condition (escape DC 11) from one of two claws": two parts.
  assert.deepEqual(read("giant-crab", "Claw"), { riders: [{ kind: "grapple", escape: 11, parts: 2, gate: { size: "Medium" } }] })
  // "(escape DC 12). While Grappled, the target has the Restrained condition." A Bite is one part.
  assert.deepEqual(read("crocodile", "Bite"), { riders: [{ kind: "grapple", escape: 12, parts: 1, gate: { size: "Medium" }, with: ["restrained"] }] })
  // "If the target is a Medium or smaller creature and the boar moved 20+ feet straight toward it immediately before the hit"
  assert.deepEqual(read("boar", "Gore"), { riders: [{ kind: "condition", conditions: ["prone"], span: "turn", gate: { size: "Medium", charge: 20 } }] })
  // "the target takes 5 (2d4) Necrotic damage at the start of each of the stirge's turns", and it makes no Proboscis attacks.
  assert.deepEqual(read("stirge", "Proboscis"), { riders: [{ kind: "attach", drain: { dice: "2d4", type: "necrotic" }, bars: "proboscis" }] })
  // "Until this poison ends, the target can't regain Hit Points": no bar on healing is run, so the Beard is told.
  assert.deepEqual(read("bearded-devil", "Beard"), { unread: `words left over: "Until this poison ends, the target can't regain Hit Points."` })
})

test("a Wolf's Bite knocks a Medium target Prone, and a hero in a Wolf's shape bites the same", () => {
  // Bite +4: a 15 makes 19 against Armor Class 15 and hits for 1d6 + 2, a 3 and 2 is 5. Thalbern, Medium, falls Prone.
  const bite = strike({ attacker: npc("wolf", "wolf", 11), target: thalbern, weapon: "bite", dice: [15], roll: falls(3) })
  assert.equal(bite.taken, 5)
  assert.deepEqual(bite.target.conditions, [{ id: "prone", source: "wolf", turns: 1 }])
  assert.deepEqual(bite.conditions, [{ target: "thalbern", condition: "prone" }])
  assert.equal(
    strikeFacts("Wolf", "Thalbern", bite),
    "Wolf's Bite attack on Thalbern HITS (19 against Armor Class 15) for 5 piercing damage. Thalbern has 6 of 11 hit points left. Thalbern has the Prone condition."
  )
  // Thalbern in a Wolf's shape bites with the Wolf's +4 against a Bandit's Armor Class 12: a 10 makes 14. 1d6 + 2 at 3 is
  // 5, and the Bandit, Medium, falls Prone. An Ogre is Large and stays standing.
  const shaped = { ...thalbern, shape: { form: "wolf", hours: 1 } }
  const bandit = strike({ attacker: shaped, target: npc("bandit", "bandit", 11), weapon: "bite", dice: [10], roll: falls(3) })
  assert.deepEqual([bandit.taken, bandit.target.conditions], [5, [{ id: "prone", source: "thalbern", turns: 1 }]])
  const ogre = strike({ attacker: shaped, target: npc("ogre", "ogre", 68), weapon: "bite", dice: [10], roll: falls(3) })
  assert.equal(ogre.target.conditions, undefined)
})

test("a Ghoul's Claw: a Constitution save or Paralyzed, and none for an elf", () => {
  // Claw +4: a 12 makes 16 and hits for 1d4 + 2, a 2 is 4. Thalbern's save is d20 + 1 against DC 10: an 8 makes 9 and
  // fails, so he is Paralyzed until the end of his next turn, which has not come yet this round: one turn.
  const ghoul = npc("ghoul", "ghoul", 22)
  const failed = strike({ attacker: ghoul, target: thalbern, weapon: "claw", dice: [12], roll: falls(2, 8) })
  assert.deepEqual(failed.target.conditions, [{ id: "paralyzed", source: "ghoul", turns: 1 }])
  assert.match(strikeFacts("Ghoul", "Thalbern", failed), /Thalbern fails the Constitution saving throw \(9 against DC 10\) and has the Paralyzed condition until the end of their next turn\.$/)
  // A 9 makes 10 and succeeds.
  const saved = strike({ attacker: ghoul, target: thalbern, weapon: "claw", dice: [12], roll: falls(2, 9) })
  assert.equal(saved.target.conditions, undefined)
  // An elf is not subjected to it: no save is rolled.
  const elf = strike({ attacker: ghoul, target: wrenna, weapon: "claw", dice: [15], roll: falls(2) })
  assert.equal(elf.target.conditions, undefined)
})

test("a Giant Crab holds two with its two claws, and no third, and its grapple's escape DC", () => {
  // Claw +3: a 14 makes 17 against Armor Class 15 and hits for 1d6 + 1, a 2 is 3.
  const crab = at(npc("crab", "giant-crab", 13), 0)
  const first = strike({ attacker: crab, target: at(thalbern, 5), weapon: "claw", dice: [14], roll: falls(2) })
  assert.deepEqual(first.target.conditions, [{ id: "grappled", source: "crab", attack: "claw" }])
  const held = first.target
  const other = at({ ...wrenna, id: "wrenna" }, 0, 5)
  const second = strike({ attacker: crab, target: other, weapon: "claw", dice: [14], roll: falls(2), present: [crab, held, other] })
  assert.deepEqual(second.target.conditions, [{ id: "grappled", source: "crab", attack: "claw" }])
  // Both claws hold: a third creature cannot be clawed, and one already held can.
  const third = at(npc("bandit", "bandit", 11), 0, -5)
  const present = [crab, held, second.target, third]
  const barred = attackRequirement({ character: crab, target: third, attack: attacksOf(crab).find((attack) => attack.id === "claw") ?? attacksOf(crab)[0], present })
  assert.deepEqual("ruling" in barred && barred.ruling, { name: "Holding On", text: "Crab's Claw is holding Thalbern and Wrenna, and cannot strike another. The attack is not made." })
  // The escape: DC 11, printed. A grapple a check gave, by an Owlbear, is 8 + Strength 5 + Proficiency 2: 15.
  assert.deepEqual(escapeFrom(held, present)?.dc, 11)
  assert.equal(escapeFrom({ ...thalbern, conditions: [{ id: "grappled", source: "owlbear" }] }, [npc("owlbear", "owlbear", 59)])?.dc, 15)
  // A Mimic's Pseudopod: "Ability checks made to escape this grapple have Disadvantage."
  assert.deepEqual(escapeFrom({ ...thalbern, conditions: [{ id: "grappled", source: "mimic", attack: "pseudopod" }] }, [npc("mimic", "mimic", 58)])?.hinders, true)
})

test("a crocodile's Restrained lasts until the grapple ends, which ends as it drops or the two are apart", () => {
  // Bite +4 on Thalbern: a 13 makes 17 and hits for 1d8 + 2, a 3 is 5.
  const crocodile = at(npc("crocodile", "crocodile", 13), 2.5)
  const bitten = strike({ attacker: crocodile, target: at(thalbern, 10), weapon: "bite", dice: [13], roll: falls(3) }).target
  assert.deepEqual(bitten.conditions, [
    { id: "grappled", source: "crocodile", attack: "bite" },
    { id: "restrained", source: "crocodile", attack: "bite" },
  ])
  // Breaking free ends both. So does the crocodile dropping, or standing off. Large, its space reaches 2.5 feet past a
  // square: at 2.5 it is 5 feet from Thalbern at 10, in reach, and at -5 it is 12.5, out of its 5-foot reach.
  assert.equal(withoutCondition(bitten, "grappled").character.conditions, undefined)
  assert.equal(releasedHolds([{ ...crocodile, hitPoints: 0 }, bitten]).characters[1].conditions, undefined)
  assert.equal(releasedHolds([at(crocodile, -5), bitten]).characters[1].conditions, undefined)
  assert.deepEqual(releasedHolds([crocodile, bitten]).characters[1].conditions?.length, 2)
})

test("a charge: 20 feet straight at the target before the hit", () => {
  // A path from 0 through 20 to 40 feet, with the target at 45, ran 40 feet straight at it. One that turned at (20, 20)
  // toward a target at (20, 40) ran only the stretch after the turn: 15 feet, to (20, 35).
  assert.equal(
    chargedFeet(
      { x: 0, y: 0 },
      [
        { x: 0, y: 20 },
        { x: 0, y: 40 },
      ],
      { x: 0, y: 45 }
    ),
    40
  )
  assert.equal(
    chargedFeet(
      { x: 0, y: 0 },
      [
        { x: 20, y: 20 },
        { x: 20, y: 35 },
      ],
      { x: 20, y: 40 }
    ),
    15
  )
  // A Boar's Gore +3: an 18 makes 21. 1d6 + 1 at 4 is 5, and with 20 feet of charge 1d6 more, a 3: 8, and Prone.
  const boar = npc("boar", "boar", 13)
  const charged = strike({ attacker: boar, target: thalbern, weapon: "gore", dice: [18], roll: falls(4, 3), charged: 20 })
  assert.deepEqual([charged.taken, charged.target.conditions], [8, [{ id: "prone", source: "boar", turns: 1 }]])
  // 15 feet is not enough: 5, standing.
  const short = strike({ attacker: boar, target: thalbern, weapon: "gore", dice: [18], roll: falls(4), charged: 15 })
  assert.deepEqual([short.taken, short.target.conditions], [5, undefined])
  // A Goat's Ram: "1 Bludgeoning damage, or 2 (1d4) Bludgeoning damage if the goat moved 20+ feet straight toward the
  // target". +2: a 14 makes 16. Charging, the 1d4 at 3 replaces the 1.
  const goat = npc("goat", "goat", 4)
  assert.equal(strike({ attacker: goat, target: thalbern, weapon: "ram", dice: [14], roll: falls(3), charged: 20 }).taken, 3)
  assert.equal(strike({ attacker: goat, target: thalbern, weapon: "ram", dice: [14], roll: falls(), charged: 0 }).taken, 1)
})

test("a Stirge attaches, drains as the round turns, makes no Proboscis attack, and is pulled off", () => {
  // Proboscis +5: a 12 makes 17 and hits for 1d6 + 3, a 2 is 5. Thalbern is left at 6.
  const stirge = at(npc("stirge", "stirge", 5), 0)
  const hit = strike({ attacker: stirge, target: at(thalbern, 5), weapon: "proboscis", dice: [12], roll: falls(2) })
  assert.deepEqual(hit.target.turnEffects, [{ id: "attached", by: "stirge", turns: 2 }])
  const barred = attackRequirement({ character: stirge, target: hit.target, attack: attacksOf(stirge)[0], present: [stirge, hit.target] })
  assert.equal("ruling" in barred && barred.ruling.name, "Holding On")
  // As the round turns: 2d4 Necrotic at 2 and 3 is 5, from 6 to 1, and it holds on through the round to come.
  const turned = roundTurns({
    characters: [
      { ...stirge, isComplete: true },
      { ...hit.target, isComplete: true },
    ] as never[],
    d20: falls(),
    roll: falls(2, 3),
  })
  const drained = find(turned.characters, "thalbern")
  assert.deepEqual([drained.hitPoints, drained.turnEffects], [1, [{ id: "attached", by: "stirge", turns: 2 }]])
  assert.ok(turned.told.some((fact) => fact.text === "Stirge's Proboscis drains Thalbern for 5 necrotic damage. Thalbern has 1 of 11 hit points."))
  // Thalbern pulls it off as his action. A Stirge at 0 lets go as the round turns.
  assert.equal(takeAction([stirge, drained], "thalbern", { action: "escape", target: "thalbern" }).characters[1].turnEffects, undefined)
  const down = roundTurns({ characters: [{ ...stirge, hitPoints: 0 }, drained] as never[], d20: falls(), roll: falls() })
  assert.equal(find(down.characters, "thalbern").turnEffects, undefined)
})
