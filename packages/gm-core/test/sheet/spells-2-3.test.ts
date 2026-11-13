import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import type { ConditionEntry } from "../../src/sheet/condition-entry"
import type { Sheet } from "../../src/sheet/sheet"
import { attackModesFromSpells, cannotReactBySpell, endConcentration, hitPointMaximumFromSpells, rollAdds, settleConcentration, weaponDamageFromSpells } from "../../src/sheet/spell-effects"
import { spellsAtRoundEnd } from "../../src/sheet/spell-rounds"
import { castAgain, castableOnTurn, castSpell, isEngineSpell, spellById, targetLimit } from "../../src/sheet/spells"
import { combatStatsOf } from "../../src/sheet/stat-block"
import type { Concentration, SpellEffect } from "../../src/sheet/turn-effect"

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
  position?: { x: number; y: number }
  dead?: true
  isComplete?: boolean
}
// Lyra, a Wizard with Intelligence 16: spell save DC 13, spell attack +5, 6 hit points, Armor Class 10.
const lyra: Character = { id: "lyra", name: "Lyra", type: "pc", sheet: sheet("covert-cargo/characters/1749159962941.json"), hitPoints: 6 }
// Milos, a Cleric with Wisdom 16: DC 13, +5.
const milos: Character = { id: "milos", name: "Milos", type: "pc", sheet: sheet("welcome-to-kordavos/characters/milos-radan.json"), hitPoints: 9 }
// Thalbern, a Ranger in Studded Leather, Armor Class 15, Dexterity save +5. Branka, a Fighter with 14 hit points.
const thalbern: Character = { id: "thalbern", name: "Thalbern", type: "pc", sheet: sheet("the-midnight-summons/characters/thalbern.json"), hitPoints: 11 }
const branka: Character = { id: "branka", name: "Branka", type: "pc", sheet: sheet("welcome-to-kordavos/characters/branka-stoneveil.json"), hitPoints: 14 }
const ilya: Character = { id: "ilya", name: "Ilya", type: "pc", sheet: sheet("welcome-to-kordavos/characters/ilya-veles.json"), hitPoints: 8 }
// A Bandit, a Humanoid: Armor Class 12, 11 hit points, Constitution and Dexterity saves +1, Wisdom +0. An Owlbear, a
// Monstrosity: Armor Class 13, 59 hit points.
const bandit = (id = "bandit"): Character => ({ id, name: id === "bandit" ? "Bandit" : `Bandit ${id}`, type: "npc", statBlock: "bandit", hitPoints: 11 })
const owlbear: Character = { id: "owlbear", name: "Owlbear", type: "npc", statBlock: "owlbear", hitPoints: 59 }
const spell = (id: string) => spellById.get(id) as NonNullable<ReturnType<typeof spellById.get>>
const falls =
  (...dice: number[]) =>
  () => {
    if (!dice.length) throw new Error("no die left")
    return dice.shift() as number
  }
const find = (characters: Character[], id: string) => characters.find((character) => character.id === id) as Character

test("which spells of levels 2 and 3 the engine runs, and that a Reaction spell is not cast on a turn", () => {
  assert.deepEqual(
    ["fireball", "blur", "hold-person", "calm-emotions", "slow", "flaming-sphere"].map((id) => isEngineSpell(spell(id))),
    [true, true, true, false, false, false]
  )
  assert.deepEqual(
    ["shield", "counterspell", "feather-fall", "fireball", "healing-word"].map((id) => castableOnTurn(spell(id))),
    [false, false, false, true, true]
  )
  // Aid takes three, Prayer of Healing five, Mass Healing Word six, and Slow six of the eight its 40-foot cube could hold.
  assert.deepEqual(
    ["aid", "prayer-of-healing", "mass-healing-word", "slow"].map((id) => targetLimit(spell(id))),
    [3, 5, 6, 6]
  )
})

test("a spell the engine only tells rolls nothing and holds its Concentration", () => {
  // Calm Emotions turns on a choice for each creature: no save is rolled, and the die is never asked for.
  const calm = castSpell({ characters: [milos, bandit()], casterId: "milos", spell: spell("calm-emotions"), targets: ["bandit"], d20: falls(), roll: falls() })
  assert.deepEqual([calm.saves, calm.facts, find(calm.characters, "milos").concentration], [[], [], { spell: "calm-emotions" }])
})

test("Scorching Ray makes an attack for each of its three rays, falling on the targets in turn", () => {
  // +5. Ray 1 on the Bandit: 15 makes 20 against 12, 2d6 of 3 and 4 is 7, and 11 becomes 4. Ray 2 on the Owlbear: 3
  // makes 8 against 13, a miss. Ray 3 on the Bandit: 10 makes 15, 2d6 of 2 and 2 is 4, and the Bandit dies.
  const rays = castSpell({
    characters: [lyra, bandit(), owlbear],
    casterId: "lyra",
    spell: spell("scorching-ray"),
    targets: ["bandit", "owlbear"],
    attackDice: [15],
    d20: falls(3, 10),
    roll: falls(3, 4, 2, 2),
  })
  assert.deepEqual(
    rays.rays?.map((ray) => [ray.target, ray.roll.total, ray.roll.hit, ray.taken]),
    [
      ["bandit", 20, true, 7],
      ["owlbear", 8, false, 0],
      ["bandit", 15, true, 4],
    ]
  )
  assert.deepEqual([rays.attack?.target, find(rays.characters, "bandit").dead, find(rays.characters, "owlbear").hitPoints], ["bandit", true, 59])
})

test("Acid Arrow: half its first damage on a miss, and 2d4 more at the end of its target's next turn on a hit", () => {
  // A 2 makes 7 against 13: a miss. 4d4 of 1, 2, 3 and 4 is 10, and half is 5.
  const miss = castSpell({ characters: [lyra, owlbear], casterId: "lyra", spell: spell("acid-arrow"), targets: ["owlbear"], attackDice: [2], d20: falls(), roll: falls(1, 2, 3, 4) })
  assert.deepEqual([miss.attack?.taken, find(miss.characters, "owlbear").hitPoints, find(miss.characters, "owlbear").spellEffects], [5, 54, undefined])
  // A hit for 4d4 of four 1s takes 59 to 55. As the round ends, 2d4 of 3 and 3 takes it to 49.
  const hit = castSpell({ characters: [lyra, owlbear], casterId: "lyra", spell: spell("acid-arrow"), targets: ["owlbear"], attackDice: [15], d20: falls(), roll: falls(1, 1, 1, 1) })
  assert.deepEqual(find(hit.characters, "owlbear").spellEffects, [{ spell: "acid-arrow", by: "lyra", turns: 1, amount: 2 }])
  const later = spellsAtRoundEnd({ characters: hit.characters, d20: falls(), roll: falls(3, 3) })
  assert.deepEqual([find(later.characters, "owlbear").hitPoints, later.harm[0].amount], [49, 6])
})

test("Spiritual Weapon strikes for 1d8 and the caster's modifier, and again as a Bonus Action on a later turn", () => {
  // Milos +5: a 10 makes 15 against 12. 1d8 of 5 and his Wisdom's 3 is 8, and 11 becomes 3.
  const cast = castSpell({ characters: [milos, bandit()], casterId: "milos", spell: spell("spiritual-weapon"), targets: ["bandit"], attackDice: [10], d20: falls(), roll: falls(5) })
  assert.deepEqual([cast.attack?.taken, find(cast.characters, "bandit").hitPoints], [8, 3])
  assert.deepEqual(
    [find(cast.characters, "milos").concentration, find(cast.characters, "milos").spellEffects],
    [{ spell: "spiritual-weapon" }, [{ spell: "spiritual-weapon", by: "milos", turns: 10, amount: 2 }]]
  )
  // Used again: a 12 hits, 1d8 of 4 and 3 is 7, and the Bandit dies. No new Concentration, nothing spent.
  const again = castAgain({ characters: cast.characters, casterId: "milos", spellId: "spiritual-weapon", targets: ["bandit"], attackDice: [12], d20: falls(), roll: falls(4) })
  assert.deepEqual([again.attack?.taken, find(again.characters, "bandit").dead, find(again.characters, "milos").concentration], [7, true, { spell: "spiritual-weapon" }])
  assert.throws(() => castAgain({ characters: [lyra, bandit()], casterId: "lyra", spellId: "spiritual-weapon", targets: ["bandit"], d20: falls(), roll: falls() }), /holds no Spiritual Weapon/)
})

test("Hold Person takes a Humanoid, Paralyzed on a failed save, and the save is repeated as the round ends", () => {
  // Cast with a level 3 slot it takes two. The Owlbear is no Humanoid. The Bandit's 9 fails against 13.
  const held = castSpell({ characters: [lyra, bandit(), owlbear], casterId: "lyra", spell: spell("hold-person"), targets: ["bandit", "owlbear"], level: 3, d20: falls(9), roll: falls() })
  assert.deepEqual(find(held.characters, "bandit").conditions, [{ id: "paralyzed", source: "lyra", turns: 10, spell: "hold-person" }])
  assert.deepEqual([held.saves.length, held.facts[0]], [1, "Owlbear is not a Humanoid, so Hold Person does not take them."])
  // As the round ends the Bandit saves again: a 13 succeeds, and the spell ends on him.
  const freed = spellsAtRoundEnd({ characters: held.characters, d20: falls(13), roll: falls() })
  assert.deepEqual([find(freed.characters, "bandit").conditions, freed.conditions], [undefined, [{ target: "bandit", condition: "paralyzed", ends: true }]])
  // Blindness/Deafness gives Blinded, the caster's usual choice: the Bandit's 5 and 1 make 6 against 13.
  const blind = castSpell({ characters: [lyra, bandit()], casterId: "lyra", spell: spell("blindness-deafness"), targets: ["bandit"], d20: falls(5), roll: falls() })
  assert.deepEqual(find(blind.characters, "bandit").conditions?.[0].id, "blinded")
})

test("Aid raises three creatures' hit point maximum and hit points by 5, and 5 more for each slot level above 2", () => {
  // With a level 3 slot, 10. Branka at 3 of 14 goes to 13.
  const aided = castSpell({
    characters: [milos, { ...branka, hitPoints: 3 }, thalbern, ilya, lyra],
    casterId: "milos",
    spell: spell("aid"),
    targets: ["branka", "thalbern", "ilya", "lyra"],
    level: 3,
    d20: falls(),
    roll: falls(),
  })
  assert.deepEqual(aided.targets, ["branka", "thalbern", "ilya"])
  assert.deepEqual([hitPointMaximumFromSpells(find(aided.characters, "branka")), find(aided.characters, "branka").hitPoints], [10, 13])
})

test("Barkskin, Haste and Slow change Armor Class, and Haste and Slow a Dexterity save", () => {
  // Thalbern's 15: Barkskin raises it to 17, and Haste adds 2.
  const bark = castSpell({ characters: [thalbern], casterId: "thalbern", spell: spell("barkskin"), targets: ["thalbern"], d20: falls(), roll: falls() })
  assert.equal(combatStatsOf(find(bark.characters, "thalbern"))?.armorClass, 17)
  const hasted = castSpell({ characters: [lyra, thalbern, bandit()], casterId: "lyra", spell: spell("haste"), targets: ["thalbern"], d20: falls(), roll: falls() })
  assert.equal(combatStatsOf(find(hasted.characters, "thalbern"))?.armorClass, 17)
  // Hasted, a Dexterity save has Advantage: 3 and 12, the 12 with +5 is 17 against Milos's 13.
  const flame = castSpell({ characters: [milos, find(hasted.characters, "thalbern")], casterId: "milos", spell: spell("sacred-flame"), targets: ["thalbern"], d20: falls(3, 12), roll: falls(1) })
  assert.deepEqual([flame.saves[0].mode, flame.saves[0].total, flame.saves[0].success], ["advantage", 17, true])
  // When Haste ends, its target is Incapacitated until the end of its next turn.
  assert.deepEqual(find(endConcentration(hasted.characters, "lyra").characters, "thalbern").conditions, [{ id: "incapacitated", turns: 1 }])
  // Slow on the Bandit, whose 2 fails a Wisdom save: Armor Class 12 less 2, Dexterity saves 2 less, and no Reactions.
  const slowed = find(castSpell({ characters: [lyra, bandit()], casterId: "lyra", spell: spell("slow"), targets: ["bandit"], d20: falls(2), roll: falls() }).characters, "bandit")
  assert.deepEqual([combatStatsOf(slowed)?.armorClass, cannotReactBySpell(slowed)], [10, true])
  // Sacred Flame on him: a 12 and his 1, less 2, is 11 against 13.
  assert.equal(castSpell({ characters: [milos, slowed], casterId: "milos", spell: spell("sacred-flame"), targets: ["bandit"], d20: falls(12), roll: falls(1) }).saves[0].total, 11)
})

test("Shatter gives a Construct Disadvantage, and Revivify brings back the dead at 1 hit point", () => {
  // An Animated Armor saves with +1: 15 and 4 with Disadvantage keep the 4, 5 against 13. 3d8 of three 2s: 33 to 27.
  const armor: Character = { id: "armor", name: "Animated Armor", type: "npc", statBlock: "animated-armor", hitPoints: 33 }
  const shattered = castSpell({ characters: [lyra, armor], casterId: "lyra", spell: spell("shatter"), targets: ["armor"], d20: falls(15, 4), roll: falls(2, 2, 2) })
  assert.deepEqual([shattered.saves[0].mode, shattered.saves[0].total, find(shattered.characters, "armor").hitPoints], ["disadvantage", 5, 27])
  const dead: Character = { ...bandit(), hitPoints: 0, dead: true }
  const back = castSpell({ characters: [milos, dead], casterId: "milos", spell: spell("revivify"), targets: ["bandit"], d20: falls(), roll: falls() })
  assert.deepEqual([find(back.characters, "bandit").hitPoints, find(back.characters, "bandit").dead], [1, undefined])
})

test("Vampiric Touch heals its caster half the damage, and reaches as a touch", () => {
  // Lyra at 2: a 10 makes 15 against 12. 3d6 of three 2s is 6: the Bandit goes to 5 and Lyra regains 3.
  const touch = castSpell({
    characters: [{ ...lyra, hitPoints: 2 }, bandit()],
    casterId: "lyra",
    spell: spell("vampiric-touch"),
    targets: ["bandit"],
    attackDice: [10],
    d20: falls(),
    roll: falls(2, 2, 2),
  })
  assert.deepEqual([find(touch.characters, "bandit").hitPoints, find(touch.characters, "lyra").hitPoints], [5, 5])
})

test("Shield keeps Magic Missile off, and Invisibility ends when its bearer casts a spell", () => {
  const shielded = { ...owlbear, spellEffects: [{ spell: "shield", by: "owlbear", turns: 1 }] }
  const darts = castSpell({ characters: [lyra, shielded], casterId: "lyra", spell: spell("magic-missile"), targets: ["owlbear"], d20: falls(), roll: falls() })
  assert.deepEqual([find(darts.characters, "owlbear").hitPoints, darts.facts], [59, ["Owlbear's Shield turns Lyra's Magic Missile aside: no damage."]])
  const unseen = castSpell({ characters: [lyra], casterId: "lyra", spell: spell("invisibility"), targets: ["lyra"], d20: falls(), roll: falls() })
  assert.equal(find(unseen.characters, "lyra").conditions?.[0].id, "invisible")
  const seen = castSpell({ characters: [...unseen.characters, owlbear], casterId: "lyra", spell: spell("ray-of-frost"), targets: ["owlbear"], attackDice: [1], d20: falls(), roll: falls() })
  assert.deepEqual([find(seen.characters, "lyra").conditions, seen.facts[0]], [undefined, "Lyra casts a spell, and Invisibility ends on them."])
})

test("Hypnotic Pattern leaves its targets Charmed and Incapacitated, until they take damage", () => {
  const pattern = castSpell({ characters: [lyra, bandit()], casterId: "lyra", spell: spell("hypnotic-pattern"), targets: ["bandit"], d20: falls(5), roll: falls() })
  const dazed = find(pattern.characters, "bandit")
  assert.deepEqual(
    dazed.conditions?.map((entry) => entry.id),
    ["charmed", "incapacitated"]
  )
  const hit = settleConcentration({ before: pattern.characters, after: pattern.characters.map((one) => (one.id === "bandit" ? { ...one, hitPoints: 8 } : one)), bonus: () => 0, d20: falls() })
  assert.deepEqual([find(hit.characters, "bandit").conditions, hit.facts], [undefined, ["Bandit took damage, and Hypnotic Pattern ends on them."]])
})

test("Blur and Mirror Image turn attacks aside", () => {
  const blurred = find(castSpell({ characters: [lyra], casterId: "lyra", spell: spell("blur"), targets: [], d20: falls(), roll: falls() }).characters, "lyra")
  assert.deepEqual(attackModesFromSpells(bandit(), blurred), [{ mode: "disadvantage", from: "Blur" }])
  // Three duplicates. A Mage's Ray of Frost, +6, hits Lyra's 10 with a 10. The d6s for the three show 1, 2 and 5: a
  // duplicate is hit and destroyed, and two are left.
  const imaged = castSpell({ characters: [lyra], casterId: "lyra", spell: spell("mirror-image"), targets: [], d20: falls(), roll: falls() }).characters
  const mage: Character = { id: "mage", name: "Mage", type: "npc", statBlock: "mage", hitPoints: 81 }
  const ray = castSpell({ characters: [...imaged, mage], casterId: "mage", spell: spell("ray-of-frost"), targets: ["lyra"], attackDice: [10], d20: falls(), roll: falls(1, 2, 5) })
  assert.deepEqual([ray.attack?.roll.hit, ray.attack?.deflected, find(ray.characters, "lyra").hitPoints, find(ray.characters, "lyra").spellEffects?.[0].amount], [true, true, 6, 2])
})

test("Spirit Guardians strikes each foe within 15 feet of its caster as the round ends", () => {
  const at = (one: Character, x: number): Character => ({ ...one, position: { x, y: 0 } })
  // Ten minutes is past a fight's minute, so it is not counted in turns.
  const cast = castSpell({
    characters: [at(milos, 0), at(thalbern, 5), at(bandit(), 10), at(owlbear, 40)],
    casterId: "milos",
    spell: spell("spirit-guardians"),
    targets: [],
    d20: falls(),
    roll: falls(),
  })
  assert.deepEqual(find(cast.characters, "milos").spellEffects, [{ spell: "spirit-guardians", by: "milos", amount: 3 }])
  // The Bandit, 10 feet off, rolls a 5 for his Wisdom save and takes 3d8 of 2, 3 and 4: 9. Thalbern is Milos's own
  // side, and the Owlbear is out of the aura.
  const round = spellsAtRoundEnd({ characters: cast.characters, d20: falls(5), roll: falls(2, 3, 4) })
  assert.deepEqual([find(round.characters, "bandit").hitPoints, find(round.characters, "thalbern").hitPoints, find(round.characters, "owlbear").hitPoints], [2, 11, 59])
})

test("Lesser Restoration, Remove Curse and Dispel Magic end what other spells and conditions do", () => {
  const sick = { ...thalbern, conditions: [{ id: "poisoned" as const }, { id: "paralyzed" as const }] }
  const restored = castSpell({ characters: [milos, sick], casterId: "milos", spell: spell("lesser-restoration"), targets: ["thalbern"], d20: falls(), roll: falls() })
  assert.deepEqual(find(restored.characters, "thalbern").conditions, [{ id: "poisoned" }])
  // Bestow Curse on a Bandit who fails with a 3, then lifted.
  const cursed = castSpell({ characters: [milos, bandit()], casterId: "milos", spell: spell("bestow-curse"), targets: ["bandit"], d20: falls(3), roll: falls() })
  assert.equal(find(cursed.characters, "bandit").spellEffects?.[0].spell, "bestow-curse")
  const lifted = castSpell({ characters: cursed.characters, casterId: "milos", spell: spell("remove-curse"), targets: ["bandit"], d20: falls(), roll: falls() })
  assert.deepEqual([find(lifted.characters, "bandit").spellEffects, find(lifted.characters, "milos").concentration], [undefined, undefined])
  // Lyra's Hold Person, level 2, ends under a level 3 Dispel Magic, and her Concentration with it. Stoneskin, level 4,
  // needs a check: 8 and Milos's 3 is 11 against 14, which fails.
  const held = castSpell({ characters: [lyra, milos, bandit()], casterId: "lyra", spell: spell("hold-person"), targets: ["bandit"], d20: falls(1), roll: falls() }).characters.map((one) =>
    one.id === "bandit" ? { ...one, spellEffects: [{ spell: "stoneskin", by: "priest" }] } : one
  )
  const dispelled = castSpell({ characters: held, casterId: "milos", spell: spell("dispel-magic"), targets: ["bandit"], d20: falls(8), roll: falls() })
  assert.deepEqual(
    [find(dispelled.characters, "bandit").conditions, find(dispelled.characters, "bandit").spellEffects, find(dispelled.characters, "lyra").concentration],
    [undefined, [{ spell: "stoneskin", by: "priest" }], undefined]
  )
})

test("Potent Cantrip deals half on a miss or a save, Disciple of Life adds 2 and the slot, and Beacon of Hope heals the most", () => {
  const evoker: Character = { ...lyra, sheet: { ...(lyra.sheet as Sheet), level: 3, subclass: "evoker" } }
  // Ray of Frost misses with a 2: 1d8 of 6, halved to 3.
  const ray = castSpell({ characters: [evoker, owlbear], casterId: "lyra", spell: spell("ray-of-frost"), targets: ["owlbear"], attackDice: [2], d20: falls(), roll: falls(6) })
  assert.equal(find(ray.characters, "owlbear").hitPoints, 56)
  // Sacred Flame saved with 12 and +1, 13 against 13: half of 1d8 of 7 is 3.
  const flame = castSpell({ characters: [evoker, bandit()], casterId: "lyra", spell: spell("sacred-flame"), targets: ["bandit"], d20: falls(12), roll: falls(7) })
  assert.equal(find(flame.characters, "bandit").hitPoints, 8)
  // A Life Cleric's Cure Wounds with a level 1 slot: 2d8 of 1 and 1, his 3, and 2 and the slot's 1. Branka 1 to 9.
  const life: Character = { ...milos, sheet: { ...(milos.sheet as Sheet), level: 3, subclass: "life-domain" } }
  const cured = castSpell({ characters: [life, { ...branka, hitPoints: 1 }], casterId: "milos", spell: spell("cure-wounds"), targets: ["branka"], d20: falls(), roll: falls(1, 1) })
  assert.equal(find(cured.characters, "branka").hitPoints, 9)
  // Under Beacon of Hope, Healing Word's 2d4 count 8, and Milos's 3 more: Branka 1 to 12, with no die thrown.
  const hope = castSpell({ characters: [milos, { ...branka, hitPoints: 1 }], casterId: "milos", spell: spell("beacon-of-hope"), targets: ["branka"], d20: falls(), roll: falls() })
  const word = castSpell({ characters: hope.characters, casterId: "milos", spell: spell("healing-word"), targets: ["branka"], d20: falls(), roll: falls() })
  assert.equal(find(word.characters, "branka").hitPoints, 12)
})

test("Pass without Trace and Enthrall change a check with one skill, and Magic Weapon a weapon's attack and damage", () => {
  const quiet = castSpell({ characters: [thalbern], casterId: "thalbern", spell: spell("pass-without-trace"), targets: [], d20: falls(), roll: falls() })
  const hidden = find(quiet.characters, "thalbern")
  assert.deepEqual([rollAdds(hidden, "ability-checks", falls(), "stealth"), rollAdds(hidden, "ability-checks", falls(), "perception")], [[{ from: "Pass without Trace", amount: 10 }], []])
  const rapt = find(castSpell({ characters: [ilya, bandit()], casterId: "ilya", spell: spell("enthrall"), targets: ["bandit"], d20: falls(4), roll: falls() }).characters, "bandit")
  assert.deepEqual(rollAdds(rapt, "ability-checks", falls(), "perception"), [{ from: "Enthrall", amount: -10 }])
  // With a level 3 slot the bonus is +2, to weapon attacks and their damage, and not to a spell attack.
  const armed = find(castSpell({ characters: [lyra, branka], casterId: "lyra", spell: spell("magic-weapon"), targets: ["branka"], level: 3, d20: falls(), roll: falls() }).characters, "branka")
  assert.deepEqual(
    [rollAdds(armed, "attack-rolls", falls()), rollAdds(armed, "attack-rolls", falls(), undefined, { spell: true }), weaponDamageFromSpells(armed)],
    [[{ from: "Magic Weapon", amount: 2 }], [], [{ name: "Magic Weapon", damage: { amount: 2 } }]]
  )
})

test("Heat Metal burns the one who holds the metal, who saves or must drop it, and burns again as a Bonus Action", () => {
  // 2d8 of 3 and 4 takes the Bandit to 4. His 5 and +1 fail the Constitution save against 13.
  const heat = castSpell({ characters: [ilya, bandit()], casterId: "ilya", spell: spell("heat-metal"), targets: ["bandit"], d20: falls(5), roll: falls(3, 4) })
  assert.deepEqual([find(heat.characters, "bandit").hitPoints, heat.saves[0].success], [4, false])
  assert.equal(heat.facts.at(-2), "Bandit must drop the burning metal if they can. If they do not, they have Disadvantage on attack rolls and ability checks until the start of Ilya's next turn.")
  // Again: 2d8 of 1 and 1 takes him to 2, and a 15 saves.
  const again = castAgain({ characters: heat.characters, casterId: "ilya", spellId: "heat-metal", targets: ["bandit"], d20: falls(15), roll: falls(1, 1) })
  assert.deepEqual([find(again.characters, "bandit").hitPoints, again.saves[0].success], [2, true])
})
