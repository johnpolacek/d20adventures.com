import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { attacksOf, damageTaken, defensesOf, multiattackOf, parseDice, resolveAttack, rollDamage, weaponAttack } from "../../src/sheet/attack"
import type { Sheet } from "../../src/sheet/sheet"

// Every expected number below was worked out by hand from the SRD 5.2.1 rules, not copied from the function's output.

const hero = (path: string) => JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { name: string; sheet: Sheet }
// Thalbern, a level 1 Ranger: Str 13 (+1), Dex 17 (+3), Proficiency Bonus +2, trained in Simple and Martial weapons.
const thalbern = hero("the-midnight-summons/characters/thalbern.json").sheet
const scores = (str: number, dex: number) => ({ str, dex, con: 12, int: 12, wis: 12, cha: 12 })
// A Wizard is trained in Simple weapons only. A Rogue adds Martial weapons that are Finesse or Light.
const wizard: Sheet = { class: "wizard", level: 1, species: "human", background: "sage", abilityScores: scores(8, 14), classSkills: ["insight", "investigation"] }
const rogue: Sheet = { class: "rogue", level: 1, species: "human", background: "criminal", abilityScores: scores(10, 16), classSkills: ["acrobatics", "perception", "insight", "persuasion"] }
// A die that falls as told, for damage rolls.
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() as number

test("Thalbern's Longbow is +5 to hit for 1d8 + 3 Piercing", () => {
  assert.deepEqual(weaponAttack(thalbern, "longbow"), { id: "longbow", name: "Longbow", kind: "ranged", bonus: 5, damage: [{ dice: "1d8 + 3", type: "piercing" }] })
})

test("a melee weapon uses Strength, and a Finesse weapon the higher of Strength and Dexterity", () => {
  assert.deepEqual(weaponAttack(thalbern, "longsword"), { id: "longsword", name: "Longsword", kind: "melee", bonus: 3, damage: [{ dice: "1d8 + 1", type: "slashing" }] }) // 1 Str + 2
  // A Dagger is Finesse and Thrown: 3 Dex + 2, thrown or in hand.
  assert.deepEqual(weaponAttack(thalbern, "dagger"), { id: "dagger", name: "Dagger", kind: "melee-or-ranged", bonus: 5, damage: [{ dice: "1d4 + 3", type: "piercing" }] })
})

test("the Proficiency Bonus is added only for a weapon the class is trained in", () => {
  assert.equal(weaponAttack(wizard, "quarterstaff").bonus, 1) // Simple: -1 Str + 2
  assert.deepEqual(weaponAttack(wizard, "quarterstaff").damage, [{ dice: "1d6 - 1", type: "bludgeoning" }])
  assert.equal(weaponAttack(wizard, "longsword").bonus, -1) // Martial: -1 Str, no training
  assert.equal(weaponAttack(rogue, "rapier").bonus, 5) // Martial and Finesse: 3 Dex + 2
  assert.equal(weaponAttack(rogue, "longsword").bonus, 0) // Martial, neither Finesse nor Light: 0 Str, no training
  assert.deepEqual(weaponAttack(rogue, "longsword").damage, [{ dice: "1d8", type: "slashing" }])
  assert.throws(() => weaponAttack(rogue, "leather-armor"), /is not a weapon/)
})

test("an Unarmed Strike deals 1 + Strength Bludgeoning damage, with no dice", () => {
  assert.deepEqual(weaponAttack(thalbern, "unarmed-strike"), { id: "unarmed-strike", name: "Unarmed Strike", kind: "melee", bonus: 3, damage: [{ amount: 2, type: "bludgeoning" }] })
  assert.deepEqual(weaponAttack(wizard, "unarmed-strike").damage, [{ amount: 0, type: "bludgeoning" }]) // 1 - 1
})

test("a hero attacks with the weapons on the sheet, and an NPC with its stat block's actions", () => {
  assert.deepEqual(
    attacksOf({ type: "pc", sheet: { ...thalbern, weapons: ["longbow", "dagger"] } }).map((attack) => attack.id),
    ["longbow", "dagger", "unarmed-strike"]
  )
  // Owlbear: "Rend. Melee Attack Roll: +7. Hit: 14 (2d8 + 5) Slashing damage", and its Multiattack is two Rends.
  assert.deepEqual(attacksOf({ type: "npc", statBlock: "owlbear" }), [{ id: "rend", name: "Rend", kind: "melee", bonus: 7, damage: [{ dice: "2d8 + 5", type: "slashing" }] }])
  assert.deepEqual(multiattackOf({ type: "npc", statBlock: "owlbear" }), [{ attack: "rend", times: 2 }])
  // Brown Bear: "one Bite attack and one Claw attack".
  assert.deepEqual(multiattackOf({ type: "npc", statBlock: "brown-bear" }), [
    { attack: "bite", times: 1 },
    { attack: "claw", times: 1 },
  ])
  // A Wolf has one Bite and no Multiattack. A hero with no sheet has no attacks.
  assert.deepEqual(multiattackOf({ type: "npc", statBlock: "wolf" }), [])
  assert.deepEqual(attacksOf({ type: "pc" }), [])
})

test("an attack hits on the Armor Class or more", () => {
  assert.deepEqual(resolveAttack({ dice: [8], bonus: 5, armorClass: 13 }), { dice: [8], natural: 8, bonus: 5, total: 13, armorClass: 13, hit: true, critical: false, mode: "normal" })
  assert.equal(resolveAttack({ dice: [7], bonus: 5, armorClass: 13 }).hit, false)
})

test("a 20 on the die always hits and is a Critical Hit, and a 1 always misses", () => {
  const twenty = resolveAttack({ dice: [20], bonus: -1, armorClass: 30 }) // 19 against 30
  assert.equal(twenty.hit, true)
  assert.equal(twenty.critical, true)
  const one = resolveAttack({ dice: [1], bonus: 10, armorClass: 5 }) // 11 against 5
  assert.equal(one.hit, false)
  assert.equal(one.critical, false)
  // Advantage keeps the 20, Disadvantage the 3.
  assert.equal(resolveAttack({ dice: [3, 20], bonus: 0, armorClass: 15, mode: "advantage" }).critical, true)
  assert.equal(resolveAttack({ dice: [3, 20], bonus: 0, armorClass: 15, mode: "disadvantage" }).hit, false)
  assert.throws(() => resolveAttack({ dice: [12], bonus: 0, armorClass: 10, mode: "advantage" }), /takes 2 d20/)
})

test("damage dice are rolled and the modifier added, and a Critical Hit rolls the dice twice", () => {
  assert.deepEqual(parseDice("2d8 + 5"), { count: 2, sides: 8, bonus: 5 })
  assert.deepEqual(parseDice("1d6 - 1"), { count: 1, sides: 6, bonus: -1 })
  const rend = attacksOf({ type: "npc", statBlock: "owlbear" })[0].damage
  assert.deepEqual(rollDamage(rend, falls(3, 6)), { parts: [{ type: "slashing", dice: [3, 6], sides: 8, bonus: 5, total: 14 }], total: 14 })
  // Four d8 and the 5 once: 3 + 6 + 2 + 8 + 5.
  assert.equal(rollDamage(rend, falls(3, 6, 2, 8), true).total, 24)
  // A flat amount has no dice to double, and a roll never deals less than 0.
  assert.equal(rollDamage([{ amount: 2, type: "bludgeoning" }], falls(), true).total, 2)
  assert.equal(rollDamage([{ dice: "1d4 - 3", type: "piercing" }], falls(1)).total, 0)
  assert.throws(() => rollDamage(rend, falls(9, 1)), /not a d8 roll/)
})

test("Immunity, Resistance and Vulnerability change the damage taken", () => {
  const seven = (type: "bludgeoning" | "poison" | "piercing") => rollDamage([{ dice: "1d8 + 3", type }], falls(4))
  // Skeleton: Vulnerable to Bludgeoning, Immune to Poison.
  const skeleton = defensesOf({ type: "npc", statBlock: "skeleton" })
  assert.equal(damageTaken(seven("bludgeoning"), skeleton), 14)
  assert.equal(damageTaken(seven("poison"), skeleton), 0)
  assert.equal(damageTaken(seven("piercing"), skeleton), 7)
  assert.equal(damageTaken(seven("piercing"), { resistances: ["piercing"] }), 3) // half of 7, rounded down
  assert.equal(damageTaken(seven("piercing"), { resistances: ["piercing"], vulnerabilities: ["piercing"] }), 6) // halved to 3, then doubled
  // A Dwarf resists Poison.
  assert.deepEqual(defensesOf({ type: "pc", sheet: hero("welcome-to-kordavos/characters/branka-stoneveil.json").sheet }).resistances, ["poison"])
})

test("the premade heroes' weapons are on their sheets", () => {
  // Thalbern's own attacks: Longbow +5, Shortsword +5 (Finesse, 3 Dex + 2) for 1d6 + 3, Dagger +5, and his fists.
  assert.deepEqual(
    attacksOf({ type: "pc", sheet: thalbern }).map((attack) => `${attack.name} ${attack.bonus} ${attack.damage[0].dice ?? attack.damage[0].amount}`),
    ["Longbow 5 1d8 + 3", "Shortsword 5 1d6 + 3", "Dagger 5 1d4 + 3", "Unarmed Strike 3 2"]
  )
  // Ilya, a Bard with Dex 14 (+2), carries a Rapier. A Bard is trained in Simple weapons only, so it is 2 Dex and no more.
  const ilya = hero("welcome-to-kordavos/characters/ilya-veles.json").sheet
  assert.equal(ilya.abilityScores.dex, 14)
  assert.equal(weaponAttack(ilya, "rapier").bonus, 2)
})
