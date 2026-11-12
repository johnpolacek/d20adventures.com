import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { attacksOf, damageTaken, defensesOf, multiattackOf, parseDice, resolveAttack, rollDamage, strike, strikeFacts, weaponAttack } from "../../src/sheet/attack"
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

test("a strike rolls to hit, then damage, and takes it from the target's hit points", () => {
  const ranger = { name: "Thalbern", type: "pc", sheet: thalbern }
  // Owlbear: Armor Class 13, 59 hit points. Thalbern's Longbow is +5, so an 8 makes 13 and hits. A 5 on the d8 and 3 is 8.
  const owlbear = { name: "Owlbear", type: "npc", statBlock: "owlbear" }
  const hit = strike({ attacker: ranger, target: owlbear, weapon: "longbow", dice: [8], roll: falls(5) })
  assert.equal(hit.roll.hit, true)
  assert.equal(hit.taken, 8)
  assert.deepEqual(hit.hitPoints, { before: 59, after: 51, maximum: 59 })
  assert.equal(strikeFacts("Thalbern", "Owlbear", hit), "Thalbern's Longbow attack on Owlbear HITS (13 against Armor Class 13) for 8 piercing damage. Owlbear has 51 of 59 hit points left.")
  // A 7 makes 12 and misses: no damage dice are thrown.
  const miss = strike({ attacker: ranger, target: owlbear, weapon: "longbow", dice: [7], roll: falls() })
  assert.equal(miss.damage, undefined)
  assert.deepEqual(miss.hitPoints, { before: 59, after: 59, maximum: 59 })
  assert.equal(strikeFacts("Thalbern", "Owlbear", miss), "Thalbern's Longbow attack on Owlbear MISSES (12 against Armor Class 13). Owlbear takes no damage.")
  // A 20 is a Critical Hit: two d8 (4 and 6) and the 3 once, 13 from an Owlbear already at 30.
  const crit = strike({ attacker: ranger, target: { ...owlbear, hitPoints: 30 }, weapon: "longbow", dice: [20], roll: falls(4, 6) })
  assert.equal(crit.roll.critical, true)
  assert.deepEqual(crit.hitPoints, { before: 30, after: 17, maximum: 59 })
  assert.match(strikeFacts("Thalbern", "Owlbear", crit), /is a CRITICAL HIT .* for 13 piercing damage\. Owlbear has 17 of 59 hit points left and is Bloodied\./)
})

test("an Owlbear's Rend can drop Thalbern, and hit points stop at 0", () => {
  // Thalbern: Studded Leather Armor 12 + 3 Dex is Armor Class 15, and 11 hit points. Rend is +7: an 8 makes 15 and hits
  // for 2d8 + 5. A 3 and a 6 make 14, more than he has.
  const blow = strike({
    attacker: { name: "Owlbear", type: "npc", statBlock: "owlbear" },
    target: { name: "Thalbern", type: "pc", sheet: thalbern, hitPoints: 11 },
    weapon: "rend",
    dice: [8],
    roll: falls(3, 6),
  })
  assert.equal(blow.roll.armorClass, 15)
  assert.equal(blow.taken, 14)
  assert.deepEqual(blow.hitPoints, { before: 11, after: 0, maximum: 11 })
  // 3 left over is less than his 11, so he is dying, not killed outright.
  assert.equal(blow.fate, "dying")
  assert.match(strikeFacts("Owlbear", "Thalbern", blow), /Thalbern drops to 0 hit points, falls Unconscious and is dying\./)
  assert.throws(
    () => strike({ attacker: { name: "Owlbear", type: "npc", statBlock: "owlbear" }, target: { type: "pc", sheet: thalbern }, weapon: "longbow", dice: [8], roll: falls() }),
    /Owlbear has no attack "longbow"/
  )
})

test("a strike meets the target's Vulnerability", () => {
  // Branka: Str 16 (+3), a Fighter. Her Warhammer is +5 for 1d8 + 3 Bludgeoning. A Skeleton has Armor Class 14 and 13 hit
  // points, and is Vulnerable to Bludgeoning: a 9 makes 14 and hits, a 4 on the d8 makes 7, doubled to 14.
  const branka = { name: "Branka", type: "pc", sheet: hero("welcome-to-kordavos/characters/branka-stoneveil.json").sheet }
  const blow = strike({ attacker: branka, target: { name: "Skeleton", type: "npc", statBlock: "skeleton" }, weapon: "warhammer", dice: [9], roll: falls(4) })
  assert.equal(blow.attack.bonus, 5)
  assert.equal(blow.taken, 14)
  assert.equal(blow.hitPoints.after, 0)
})

test("a Rogue's Sneak Attack adds its dice to a hit made with Advantage and a Finesse or Ranged weapon", () => {
  // Poppen, a level 1 Rogue: Dex 16 (+3). His Shortbow is +5 for 1d6 + 3 Piercing, and his Sneak Attack is 1d6.
  // A Bandit has Armor Class 12 and 11 hit points.
  const poppen = { name: "Poppen", type: "pc", sheet: hero("covert-cargo/characters/1749307435667.json").sheet }
  const bandit = { name: "Bandit", type: "npc", statBlock: "bandit" }
  // With Advantage, 4 and 9: the 9 makes 14 and hits. A 2 on the bow's d6 and 3, and a 4 on the Sneak Attack's d6: 9.
  const sneak = strike({ attacker: poppen, target: bandit, weapon: "shortbow", dice: [4, 9], mode: "advantage", roll: falls(2, 4) })
  assert.deepEqual(sneak.features, ["Sneak Attack"])
  assert.equal(sneak.taken, 9)
  assert.equal(sneak.hitPoints.after, 2)
  assert.match(strikeFacts("Poppen", "Bandit", sneak), /HITS with a Sneak Attack \(14 against Armor Class 12\) for 9 piercing damage/)
  // The same shot with no Advantage is the bow alone: 2 and 3 is 5.
  const plain = strike({ attacker: poppen, target: bandit, weapon: "shortbow", dice: [9], roll: falls(2) })
  assert.equal(plain.features, undefined)
  assert.equal(plain.taken, 5)
  // A Critical Hit doubles the Sneak Attack's dice too: 2 and 5 on the bow, 3, then 4 and 6: 20, more than the Bandit has.
  assert.equal(strike({ attacker: poppen, target: bandit, weapon: "shortbow", dice: [20, 3], mode: "advantage", roll: falls(2, 5, 4, 6) }).taken, 20)
  // Thalbern is no Rogue: Advantage adds nothing to his Longbow.
  assert.equal(strike({ attacker: { type: "pc", sheet: thalbern }, target: bandit, weapon: "longbow", dice: [4, 9], mode: "advantage", roll: falls(5) }).features, undefined)
})
