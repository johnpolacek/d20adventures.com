import type { AbilityId, DamageTypeId, Size } from "@d20/srd"
import { damageTypeIds } from "@d20/srd"
import { equipmentById } from "@d20/srd/equipment"
import { featById } from "@d20/srd/feats"
import { monsterById } from "@d20/srd/monsters"
import type { Monster } from "@d20/srd/schema/monsters"
import { weaponPropertyById } from "@d20/srd/weapon-properties"
import { isIncapacitated } from "../utils/turn-actors"
import type { Roller, RollMode } from "./check"
import { type Bearing, classAttack, classMarkDie, classResistances, type Extra, type HitArgs, type HitRider, hitRule, hitRules, reactionRule, turnEffectRule } from "./class-rules"
import { criticalWhenHit, d20Penalty, resistsAllDamage } from "./conditions"
import { type DeathRules, type DeathSaves, type Fate, wardedWords, withDamage } from "./death"
import { deriveSheet, trainedWith } from "./derive"
import { criticalFrom, type OncePerTurn, usedThisTurn } from "./feature-rules"
import type { ConditionChange } from "./harm"
import { type BlockRider, blockRidersOnHit, blockRiderWords, chargeOf, noLargerThan, type RiderHeld, readRiders, STAT_BLOCK_RIDER } from "./hit-riders"
import { itemTrainsWith, itemWeaponDamage } from "./item-effects"
import { magicWeaponOf } from "./items"
import { typesTaken } from "./monster-traits"
import { shapeOf } from "./shape"
import type { Sheet } from "./sheet"
import { sameSide } from "./sides"
import { BASE_REACH, type Cover, coverBonus, isNear, placedOf, type Standing, within } from "./space"
import { enduringTraitOf } from "./species-traits"
import { attackWithSpells, deflectedHit, markDamage, rollAdds, spellDamageImmunities, spellResistances, weaponDamageFromSpells } from "./spell-effects"
import { combatStatsOf, DEFAULT_STAT_BLOCK } from "./stat-block"
import type { TurnEffect } from "./turn-effect"

/** Damage one attack deals of one type: dice as the SRD writes them ("1d8 + 3"), or a flat amount with no dice. */
export type DamagePart = { dice?: string; amount?: number; type: DamageTypeId /** The least each die counts as: Great Weapon Fighting's 3. */; floor?: number }

/** One way a character can attack: a hero's weapon, or an attack action of an NPC's stat block. */
export type Attack = {
  /** The weapon's equipment id, "unarmed-strike", or a stat block action's name in lower case with dashes. */
  id: string
  name: string
  kind: "melee" | "ranged" | "melee-or-ranged"
  /** What is added to the d20. */
  bonus: number
  damage: DamagePart[]
  /** How far it reaches in melee, in feet: 5, or 10 with the Reach property, or what a stat block prints. A ranged weapon has none. */
  reach?: number
  /** A ranged or thrown attack's normal and long range, in feet. A range with no long range ends at the normal one. */
  range?: { normal: number; long?: number }
  /** Damage a hit deals only when its gate holds: a Goblin's 1d4 with Advantage, a swarm's lesser Bites once it is Bloodied. */
  gated?: GatedDamage[]
  /** What a stat block's attack does on a hit beyond its damage: a condition, a save, a grapple, an attachment (./hit-riders). */
  riders?: BlockRider[]
}

/** The gates on a hit's damage the engine can judge (`gateOf`), and a charge (./hit-riders `chargeOf`). */
export type DamageGate = "advantage" | "bloodied" | "target-bloodied" | "grappled-by-attacker" | "charge"

/**
 * A damage part dealt only when its gate holds. `replaces` is the index in the attack's damage of the part it is dealt
 * in place of. A charge's part holds the feet the attacker must have moved straight toward the target, and the size the
 * target may be at most.
 */
export type GatedDamage = { part: DamagePart; when: DamageGate; replaces?: number; charge?: { feet: number; size?: Size } }

/** The id every character's Unarmed Strike goes by. */
export const UNARMED_STRIKE = "unarmed-strike"

const signed = (dice: string, bonus: number) => (bonus === 0 ? dice : `${dice} ${bonus < 0 ? "-" : "+"} ${Math.abs(bonus)}`)

/**
 * A hero's attack with a weapon, worked out from the sheet. A melee weapon uses Strength and a ranged one Dexterity. A
 * Finesse weapon uses the higher of the two. The Proficiency Bonus is added when the class is trained in the weapon,
 * and the same ability modifier is added to the damage. An Unarmed Strike deals 1 + Strength Bludgeoning damage.
 */
export function weaponAttack(sheet: Sheet, weaponId: string): Attack {
  const derived = deriveSheet(sheet)
  const mods = derived.abilityModifiers
  if (weaponId === UNARMED_STRIKE) {
    return {
      id: UNARMED_STRIKE,
      name: "Unarmed Strike",
      kind: "melee",
      bonus: mods.str + derived.proficiencyBonus,
      damage: [{ amount: Math.max(0, 1 + mods.str), type: "bludgeoning" }],
      reach: BASE_REACH,
    }
  }
  const weapon = equipmentById.get(weaponId)
  if (weapon?.kind !== "weapon") throw new Error(`"${weaponId}" is not a weapon`)
  const properties: readonly string[] = weapon.properties ?? []
  const natural: AbilityId = weapon.attackType === "ranged" ? "dex" : "str"
  const ability: AbilityId = properties.includes("finesse") ? (mods.dex > mods.str ? "dex" : "str") : natural
  // Bracers of Archery train their wearer with the Longbow and Shortbow (./item-effects).
  const trained = trainedWith(derived.weaponProficiencies, weapon) || itemTrainsWith(sheet, weapon.id)
  // Fighting Style feats. Archery: +2 to attack rolls with Ranged weapons. Great Weapon Fighting: a 1 or 2 on a damage
  // die of a Melee weapon held in two hands counts as 3. The engine holds no hands, so it takes a Two-Handed weapon,
  // whose damage it rolls, and leaves a Versatile one, whose one-handed damage it rolls.
  const feats = derived.feats.map((id) => featById.get(id))
  const archery = weapon.attackType === "ranged" ? feats.reduce((sum, feat) => sum + (feat?.attackBonus?.weapon === "ranged" ? feat.attackBonus.bonus : 0), 0) : 0
  const floor =
    weapon.attackType === "melee" && properties.includes("two-handed") ? feats.find((feat) => feat?.damageDieMinimum && feat.damageDieMinimum.weapon === "melee")?.damageDieMinimum?.minimum : undefined
  const damage: DamagePart = weapon.damage.dice
    ? { dice: signed(weapon.damage.dice, mods[ability]), type: weapon.damage.type, ...(floor ? { floor } : {}) }
    : { amount: Math.max(0, (weapon.damage.amount ?? 0) + mods[ability]), type: weapon.damage.type }
  return {
    id: weapon.id,
    name: weapon.name,
    kind: weapon.attackType === "ranged" ? "ranged" : properties.includes("thrown") ? "melee-or-ranged" : "melee",
    bonus: mods[ability] + (trained ? derived.proficiencyBonus : 0) + archery,
    damage: [damage],
    // A melee weapon reaches 5 feet, and the Reach property adds 5: a Glaive reaches 10. A Ranged or Thrown one has its range.
    ...(weapon.attackType === "melee" ? { reach: BASE_REACH + properties.reduce((sum, id) => sum + (weaponPropertyById.get(id)?.reachBonusFeet ?? 0), 0) } : {}),
    ...(weapon.range ? { range: { normal: weapon.range.normal, long: weapon.range.long } } : {}),
  }
}

/**
 * A hero's attack with the magic weapon they wield in place of a plain one: its name, and its bonus added to the attack
 * roll and to the first damage part. A Longsword +1 at +5 for 1d8 + 3 is "Longsword +1" at +6 for 1d8 + 4. A worn item's
 * bonus to a weapon's damage is added to the same part: Bracers of Archery's 2 with a Longbow. A plain weapon's attack
 * is otherwise as it was.
 */
export function withMagicWeapon(sheet: Sheet, attack: Attack): Attack {
  const magic = magicWeaponOf(sheet, attack.id)
  const added = (magic?.damage ?? 0) + itemWeaponDamage(sheet, attack.id)
  if (!magic && !added) return attack
  const [part, ...rest] = attack.damage
  const own = part?.dice ? parseDice(part.dice) : undefined
  const raised = !part ? [] : own ? [{ ...part, dice: signed(`${own.count}d${own.sides}`, own.bonus + added) }] : [{ ...part, amount: Math.max(0, (part.amount ?? 0) + added) }]
  return { ...attack, name: magic?.name ?? attack.name, bonus: attack.bonus + (magic?.attack ?? 0), damage: [...raised, ...rest] }
}

/** The mastery property a hero can use with a weapon: the weapon's own, when its kind is one their Weapon Mastery feature names. "vex", or none. */
export function masteryOf(character: Roller, weaponId: string): string | undefined {
  if (!character.sheet?.weaponMasteries?.includes(weaponId)) return undefined
  const weapon = equipmentById.get(weaponId)
  return weapon?.kind === "weapon" ? weapon.mastery : undefined
}

/** A stat block action's id: its name in lower case with dashes. "Tree Club" is "tree-club". */
export const actionId = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

/**
 * The attacks a character can make. A hero's are the weapons on its sheet and an Unarmed Strike. An NPC's are the
 * attack actions its SRD stat block prints, with the damage each deals on a hit. A hero with no sheet has none.
 * Exhaustion takes 2 off each attack's bonus for each level.
 */
export function attacksOf(character: Roller): Attack[] {
  const penalty = d20Penalty(character)
  return penalty ? baseAttacks(character).map((attack) => ({ ...attack, bonus: attack.bonus - penalty })) : baseAttacks(character)
}

function baseAttacks(character: Roller): Attack[] {
  // A hero in a Beast's shape attacks as its stat block does, and not with the weapons they carry (./shape).
  const shape = shapeOf(character)
  if (shape) return blockAttacks(shape)
  if (character.sheet) {
    const sheet = character.sheet
    // A class feature may change the attack: Martial Arts' die and Dexterity (./classes). A magic weapon's bonus is
    // added after it, so no feature's own working leaves it out.
    // A spell on them may change it too (Shillelagh), before a magic weapon's bonus.
    return [...(sheet.weapons ?? []), UNARMED_STRIKE].map((weapon) => withMagicWeapon(sheet, attackWithSpells(character, classAttack(character, weaponAttack(sheet, weapon)))))
  }
  if (character.type !== "npc") return []
  const monster = monsterById.get(character.statBlock ?? DEFAULT_STAT_BLOCK) ?? monsterById.get(DEFAULT_STAT_BLOCK)
  return monster ? blockAttacks(monster) : []
}

// The attack actions a stat block prints, with the damage each deals on a hit.
function blockAttacks(monster: Monster): Attack[] {
  return (monster.actions ?? []).flatMap((action) => {
    if (!action.attack) return []
    // A hit's damage. A part with a gate is dealt only when its gate holds, and only a gate the engine can judge: one
    // it cannot (a charge, damage at the start of a later turn) is left out.
    const printed = action.damage ?? []
    const plain = printed.filter((part) => part.on === "hit" && part.type && !part.appliesWhen && !part.unless && !part.timing && part.alternativeTo === undefined)
    const own = (part: (typeof printed)[number]): DamagePart => ({ ...(part.dice ? { dice: part.dice } : { amount: part.amount }), type: part.type as DamageTypeId })
    const gated = printed.flatMap((part): GatedDamage[] => {
      const judged = part.on === "hit" && part.type && part.appliesWhen && !part.unless && !part.timing ? part.appliesWhen : undefined
      const charge = judged ? chargeOf(judged) : undefined
      const when = charge ? "charge" : judged ? gateOf(judged) : undefined
      if (!when) return []
      const replaced = part.alternativeTo === undefined ? undefined : plain.indexOf(printed[part.alternativeTo])
      if (replaced === -1) return []
      return [{ part: own(part), when, ...(replaced === undefined ? {} : { replaces: replaced }), ...(charge ? { charge } : {}) }]
    })
    // What the hit does beyond its damage, when its text is read in full (./hit-riders).
    const read = readRiders(action)
    const riders = "riders" in read ? read.riders : []
    const { reach, range } = action.attack
    return [
      {
        id: actionId(action.name),
        name: action.name,
        kind: action.attack.kind,
        bonus: action.attack.bonus,
        damage: plain.map(own),
        ...(gated.length ? { gated } : {}),
        ...(riders.length ? { riders } : {}),
        // A melee attack that prints no reach reaches 5 feet.
        ...(action.attack.kind !== "ranged" ? { reach: reach ?? BASE_REACH } : {}),
        ...(range ? { range: { normal: range.normal, ...(range.long !== undefined ? { long: range.long } : {}) } } : {}),
      },
    ]
  })
}

/**
 * A character's reach for Opportunity Attacks: the longest of its melee attacks, which is at least 5. A hero holding a
 * Glaive reaches 10. A Hill Giant reaches 10 with its Tree Club.
 */
export const meleeReachOf = (character: Roller): number => Math.max(BASE_REACH, ...attacksOf(character).map((attack) => attack.reach ?? 0))

/** The average of an attack's damage, as the stat block prints it: 1d8 + 3 is 7.5. Gated damage is left out. */
export const averageDamage = (attack: Attack): number =>
  attack.damage.reduce((sum, part) => {
    if (!part.dice) return sum + (part.amount ?? 0)
    const { count, sides, bonus } = parseDice(part.dice)
    return sum + (count * (sides + 1)) / 2 + bonus
  }, 0)

/**
 * What a damage part's gate asks, of those the engine can judge: the attack roll had Advantage, the attacker is
 * Bloodied, the target is Bloodied, or the target is Grappled by the attacker. Read from the gate's printed words. Any
 * other gate is none the engine can judge yet, and its part is left out: a charge of 20 feet in a straight line.
 */
export function gateOf(words: string): DamageGate | undefined {
  if (/\bhad Advantage\b/i.test(words)) return "advantage"
  if (/^if the target is Bloodied$/i.test(words)) return "target-bloodied"
  if (/^if the target is Grappled by the \w+$/i.test(words)) return "grappled-by-attacker"
  if (/^if the (?!target\b)\w+ is Bloodied$/i.test(words)) return "bloodied"
  return undefined
}

/**
 * Whether a part's gate holds as the hit lands. `charged` is the feet the attacker moved straight toward the target
 * immediately before the hit.
 */
function gateHolds(gated: GatedDamage, at: { mode: RollMode; attacker: Roller & { hitPoints?: number }; target: Target; before: number; maximum: number; charged?: number }): boolean {
  switch (gated.when) {
    case "advantage":
      return at.mode === "advantage"
    case "bloodied": {
      const maximum = combatStatsOf(at.attacker)?.hitPointMaximum
      return maximum !== undefined && (at.attacker.hitPoints ?? maximum) * 2 <= maximum
    }
    case "target-bloodied":
      return at.before * 2 <= at.maximum
    case "grappled-by-attacker":
      return (at.target.conditions ?? []).some((entry) => entry.id === "grappled" && entry.source === at.attacker.id)
    case "charge":
      return !!gated.charge && (at.charged ?? 0) >= gated.charge.feet && (!gated.charge.size || noLargerThan(at.target, gated.charge.size))
  }
}

/** The damage a hit deals: the attack's own, with each gated part whose gate holds added, or put in place of the part it replaces. */
export function damageOnHit(attack: Attack, at: Parameters<typeof gateHolds>[1]): DamagePart[] {
  const parts: (DamagePart | undefined)[] = [...attack.damage]
  for (const gated of attack.gated ?? []) {
    if (!gateHolds(gated, at)) continue
    if (gated.replaces === undefined) parts.push(gated.part)
    else parts[gated.replaces] = gated.part
  }
  return parts.filter((part) => part !== undefined)
}

export type AttackResult = {
  /** Every d20 rolled: one, or two with Advantage or Disadvantage. */
  dice: number[]
  /** The die that counts. */
  natural: number
  bonus: number
  total: number
  armorClass: number
  hit: boolean
  /** A 20 on the die: the attack hits whatever the Armor Class, and its damage dice are rolled twice. */
  critical: boolean
  /** The lowest die that scores a Critical Hit, when it is below 20: 19 for a Champion's Improved Critical. */
  criticalFrom?: number
  mode: RollMode
  /** Dice that lasting spells added or took away, each as it fell. `total` includes them. */
  adds?: { from: string; amount: number }[]
}

/**
 * Resolve an attack roll: the d20 plus the attack bonus against the target's Armor Class. A 20 on the die always hits
 * and is a Critical Hit, and so is a 19 for one whose Critical Hits start there (`criticalFrom`). A 1 on the die always
 * misses. Advantage keeps the higher of two dice and Disadvantage the lower.
 */
export function resolveAttack(args: {
  dice: readonly number[]
  bonus: number
  armorClass: number
  mode?: RollMode
  adds?: readonly { from: string; amount: number }[]
  criticalFrom?: number
}): AttackResult {
  const mode = args.mode ?? "normal"
  const needed = mode === "normal" ? 1 : 2
  const dice = args.dice.slice(0, needed)
  if (dice.length < needed) throw new Error(`An attack roll with ${mode === "normal" ? "no Advantage or Disadvantage" : mode} takes ${needed} d20, and ${dice.length} came.`)
  for (const die of dice) if (!Number.isInteger(die) || die < 1 || die > 20) throw new Error(`${die} is not a d20 roll.`)
  const natural = mode === "advantage" ? Math.max(...dice) : mode === "disadvantage" ? Math.min(...dice) : dice[0]
  const total = natural + args.bonus + (args.adds ?? []).reduce((sum, add) => sum + add.amount, 0)
  const from = Math.min(20, args.criticalFrom ?? 20)
  const critical = natural >= from
  return {
    dice,
    natural,
    bonus: args.bonus,
    total,
    armorClass: args.armorClass,
    hit: critical || (natural !== 1 && total >= args.armorClass),
    critical,
    ...(from < 20 ? { criticalFrom: from } : {}),
    mode,
    ...(args.adds?.length ? { adds: [...args.adds] } : {}),
  }
}

/** Dice as the SRD writes them: "2d8 + 5" is two eight-sided dice and 5. */
export function parseDice(formula: string): { count: number; sides: number; bonus: number } {
  const match = /^(\d+)d(\d+)(?: ([+-]) (\d+))?$/.exec(formula)
  if (!match) throw new Error(`"${formula}" is not a dice formula`)
  return { count: Number(match[1]), sides: Number(match[2]), bonus: match[3] ? (match[3] === "-" ? -1 : 1) * Number(match[4]) : 0 }
}

export type DamageRoll = {
  /** Each type's dice as they fell, its flat bonus, and what it comes to. A part never deals less than 0. */
  parts: { type: DamageTypeId; dice: number[]; sides?: number; bonus: number; total: number }[]
  total: number
}

/**
 * Roll an attack's damage. `roll` throws one die of the given size. A Critical Hit rolls every damage die twice and
 * adds the modifier once.
 */
export function rollDamage(damage: readonly DamagePart[], roll: (sides: number) => number, critical = false): DamageRoll {
  const parts = damage.map((part) => {
    if (!part.dice) return { type: part.type, dice: [], bonus: part.amount ?? 0, total: Math.max(0, part.amount ?? 0) }
    const { count, sides, bonus } = parseDice(part.dice)
    const thrown = Array.from({ length: critical ? count * 2 : count }, () => roll(sides))
    for (const die of thrown) if (!Number.isInteger(die) || die < 1 || die > sides) throw new Error(`${die} is not a d${sides} roll.`)
    // Each die as it counts: a 1 or 2 counts as 3 with Great Weapon Fighting.
    const dice = thrown.map((die) => Math.max(die, part.floor ?? 0))
    return { type: part.type, dice, sides, bonus, total: Math.max(0, dice.reduce((sum, die) => sum + die, 0) + bonus) }
  })
  return { parts, total: parts.reduce((sum, part) => sum + part.total, 0) }
}

/** The damage types a character shrugs off, takes half of, or takes double of. */
export type Defenses = { immunities?: readonly DamageTypeId[]; resistances?: readonly DamageTypeId[]; vulnerabilities?: readonly DamageTypeId[] }

/**
 * A character's defenses: a hero's Resistances from its sheet and from a class feature while it lasts (Rage), an NPC's
 * from its stat block. A condition that gives Resistance to all damage, as Petrified does, gives it for every type.
 */
export function defensesOf(character: Bearing): Defenses {
  const own = ownDefenses(character)
  // Immunity a spell on them gives (Mind Blank's Psychic), beside their own.
  const immune = spellDamageImmunities(character)
  const warded = immune.length ? { ...own, immunities: [...new Set([...(own.immunities ?? []), ...immune])] } : own
  return resistsAllDamage(character) ? { ...warded, resistances: damageTypeIds } : warded
}

function ownDefenses(character: Bearing): Defenses {
  // A hero in a Beast's shape has the stat block's defenses, and those a class feature gives while it lasts (./shape).
  // Anyone has those a spell on them gives (Protection from Energy).
  const spelled = spellResistances(character)
  const shape = shapeOf(character)
  if (shape) return { immunities: shape.immunities, resistances: [...new Set([...(shape.resistances ?? []), ...classResistances(character), ...spelled])], vulnerabilities: shape.vulnerabilities }
  if (character.sheet) {
    const derived = deriveSheet(character.sheet)
    return { ...(derived.immunities.length ? { immunities: derived.immunities } : {}), resistances: [...new Set([...derived.resistances, ...classResistances(character), ...spelled])] }
  }
  const monster = character.type === "npc" ? (monsterById.get(character.statBlock ?? DEFAULT_STAT_BLOCK) ?? monsterById.get(DEFAULT_STAT_BLOCK)) : undefined
  if (!monster) return {}
  const resistances = spelled.length ? [...new Set([...(monster.resistances ?? []), ...spelled])] : monster.resistances
  return { immunities: monster.immunities, resistances, vulnerabilities: monster.vulnerabilities }
}

/**
 * What a damage roll takes from a target's hit points. Immunity takes a type's damage to 0. Resistance halves it,
 * rounded down, and then Vulnerability doubles it, in that order.
 */
export function damageTaken(damage: DamageRoll, defenses: Defenses = {}): number {
  return damage.parts.reduce((sum, part) => {
    if (defenses.immunities?.includes(part.type)) return sum
    let amount = part.total
    if (defenses.resistances?.includes(part.type)) amount = Math.floor(amount / 2)
    if (defenses.vulnerabilities?.includes(part.type)) amount *= 2
    return sum + amount
  }, 0)
}

/**
 * Extra damage a hero's class features add to a hit, each class's own (./classes): a Rogue's Sneak Attack, a Hunter's
 * Colossus Slayer. `weapon` is the hero's weapon, when the attack is made with one.
 */
function featureDamage(args: Omit<HitArgs, "weapon">): Extra[] {
  const weapon = equipmentById.get(args.attack.id)
  return hitRules().flatMap((rule) => rule.damage?.({ ...args, weapon: weapon?.kind === "weapon" ? weapon : undefined }) ?? [])
}

/** The damage type a class feature has a hit's own damage dealt as, in place of its own (Sacred Weapon's Radiant), or none. */
function featureDamageType(args: Omit<HitArgs, "weapon">): DamageTypeId | undefined {
  const weapon = equipmentById.get(args.attack.id)
  return hitRules().reduce<DamageTypeId | undefined>((found, rule) => found ?? rule.retype?.({ ...args, weapon: weapon?.kind === "weapon" ? weapon : undefined }), undefined)
}

export type Strike = {
  attack: Attack
  /** Class features and feats that added to this hit: "Sneak Attack", "Savage Attacker". */
  features?: string[]
  roll: AttackResult
  /** The damage dice as they fell, on a hit. */
  damage?: DamageRoll
  /** What the target lost, after its Immunities, Resistances and Vulnerabilities. 0 on a miss. */
  taken: number
  /** The target's hit points before and after the blow. */
  hitPoints: { before: number; after: number; maximum: number }
  /** What the rules of 0 hit points made of a target the blow left at 0 (./death). */
  fate?: Fate
  /** The species trait that held a target the blow would have dropped to 0 at 1 hit point: "Relentless Endurance". */
  endured?: string
  /** A spell that warded them against death held them at 1 hit point, and ended (Death Ward). */
  warded?: true
  /** A Bardic Inspiration die rolled and added to an attack roll that had missed. The roll's total includes it. */
  inspired?: number
  /** The once-a-turn features this blow used, for the attacker to be marked with (./feature-rules). */
  used?: OncePerTurn[]
  /** Uses of the attacker's features that what rode on the hit spent, by feature id, for the attacker to be charged: a Stunning Strike's Focus Point. */
  spent?: string[]
  /** The target cut the damage with a Reaction, by its id (Uncanny Dodge), and what it would have taken. `taken` is already cut. */
  reduced?: { id: string; from: number }
  /** What rode on the hit once its damage was dealt: a Cunning Strike's Trip and its save. */
  riders?: HitRider[]
  /** Conditions the blow gave: Prone from a Cunning Strike's Trip. */
  conditions?: ConditionChange[]
  /** The hit struck one of the target's illusory duplicates (Mirror Image), which is destroyed: no damage. */
  deflected?: true
}

/** Whom an attack is made at: one who stands somewhere, with hit points to lose. */
export type Target = Standing & {
  type: string
  hitPoints?: number
  healthPercent?: number
  dead?: true
  fled?: true
  deathSaves?: DeathSaves
  tempHitPoints?: number
  turnEffects?: readonly TurnEffect[]
}

/** What one attack is made with and against: who, at whom, with which attack, and the dice. */
export type StrikeArgs<T extends Target> = {
  attacker: Standing & { hitPoints?: number; turnEffects?: readonly TurnEffect[] }
  target: T
  weapon: string
  dice: readonly number[]
  mode?: RollMode
  roll: (sides: number) => number
  rules?: DeathRules
  /** The cover the target has from the attacker, which adds to its Armor Class: 2 for half, 5 for three-quarters. */
  cover?: Cover
  /** Everyone in the scene, for the rules that read who stands where: Sneak Attack's ally beside the target. */
  present?: readonly (Standing & { hitPoints?: number; dead?: true; fled?: true })[]
  /** A Bardic Inspiration die the attacker holds. It is rolled on a miss it could turn into a hit, and never on a 1. */
  inspiration?: { die: number }
  /** Whose turn it is, for the features a hero uses once a turn. */
  turnOf?: string
  /** What class features the attacker chose for this attack: a Cunning Strike's `cunning`. */
  choices?: Record<string, string>
  /** Asked once the damage is known, before it is dealt: a Reaction that cuts it, by its id, and what is taken instead (Uncanny Dodge). */
  reduce?: (taken: number, types: readonly DamageTypeId[]) => { id: string; taken: number } | undefined
  /** Feet the attacker moved straight toward the target immediately before this attack, for a stat block's charge (./hit-riders). */
  charged?: number
}

/** An attack rolled and not yet landed: everything decided before the damage, where a reaction to the hit may fall. */
export type RolledAttack = {
  attack: Attack
  roll: AttackResult
  /** A Bardic Inspiration die rolled and added to an attack roll that had missed. The roll's total includes it. */
  inspired?: number
}

/**
 * The first half of an attack: the attacker's own weapon or stat block action rolled against the target's Armor Class
 * with its cover. Lasting spells add their dice (Bless). A held Bardic Inspiration die is rolled on a near miss. A hit
 * from within 5 feet on a target who is Paralyzed or Unconscious is a Critical Hit, and a Champion scores one on a 19.
 * Nothing is dealt yet.
 */
export function rollAttack(args: Omit<StrikeArgs<Target>, "rules" | "present">): RolledAttack {
  const attack = attacksOf(args.attacker).find((entry) => entry.id === args.weapon)
  if (!attack) throw new Error(`${args.attacker.name ?? "The attacker"} has no attack "${args.weapon}".`)
  const stats = combatStatsOf(args.target)
  if (!stats) throw new Error(`${args.target.name ?? "The target"} has no sheet or stat block to attack.`)
  // Lasting spells add their dice to the roll (Bless), or take them away (Bane).
  const armorClass = stats.armorClass + coverBonus(args.cover ?? "none")
  const rolled = resolveAttack({
    dice: args.dice,
    bonus: attack.bonus,
    armorClass,
    mode: args.mode,
    adds: [...rollAdds(args.attacker, "attack-rolls", args.roll), ...attackedAdds(args.attacker, args.target)],
    criticalFrom: criticalFrom(args.attacker),
  })
  // A miss by no more than the die could add, and not on a 1, rolls a held Bardic Inspiration die.
  const short = armorClass - rolled.total
  const inspired = !rolled.hit && rolled.natural !== 1 && args.inspiration && short <= args.inspiration.die ? args.roll(args.inspiration.die) : undefined
  const lifted = inspired === undefined ? rolled : { ...rolled, total: rolled.total + inspired, hit: rolled.total + inspired >= armorClass }
  const roll = lifted.hit && !lifted.critical && criticalWhenHit(args.target, isNear(args.attacker, args.target, attack.kind)) ? { ...lifted, critical: true } : lifted
  return { attack, roll, ...(inspired === undefined ? {} : { inspired }) }
}

/** What a class's turn effects on the target add to an attack roll against them (Sundering Blow's 5): the most of each kind. */
function attackedAdds(attacker: Roller & { id?: string }, target: Target): { from: string; amount: number }[] {
  const best = new Map<string, number>()
  for (const effect of target.turnEffects ?? []) {
    const amount = turnEffectRule(effect.id)?.attackedBonus?.(effect, attacker) ?? 0
    if (amount > 0) best.set(effect.id, Math.max(best.get(effect.id) ?? 0, amount))
  }
  return [...best].map(([id, amount]) => ({ from: turnEffectRule(id)?.words?.({ id, by: "", turns: 1 }) ?? id, amount }))
}

/** Whether an attack roll hits whatever the Armor Class: its die scored a Critical Hit, a 20 or a Champion's 19. */
export const hitsAnyway = (roll: AttackResult): boolean => roll.natural >= (roll.criticalFrom ?? 20)

/**
 * A rolled attack read again against a new Armor Class, as a reaction that raises it does (Shield, Parry). A hit whose
 * total is now below it misses. A 20 on the die still hits. A miss stays a miss. A 15 that hit Armor Class 12 misses
 * against 17, and a 20 on the die hits 17 still.
 */
export function againstArmorClass(rolled: RolledAttack, armorClass: number): RolledAttack {
  const { roll } = rolled
  const hit = roll.hit && (hitsAnyway(roll) || roll.total >= armorClass)
  return { ...rolled, roll: { ...roll, armorClass, hit, critical: hit && roll.critical } }
}

/**
 * The second half of an attack: on a hit the damage dice, with the attacker's features (Sneak Attack, Colossus Slayer)
 * and their own spell on this target (Hunter's Mark), against the target's defenses and hit points, by the rules of 0
 * hit points. A stat block's gated damage is dealt only when its gate holds (`damageOnHit`): a Goblin's 1d4 with
 * Advantage. Savage Attacker rolls the weapon's dice twice, once a turn, and keeps the higher. `reduce` may cut what
 * the target takes (Uncanny Dodge). What rides on the hit then falls (a Cunning Strike's Trip). A hit on one with
 * Mirror Image may strike a duplicate, and deal nothing. Magic Weapon adds its bonus to a weapon's damage. `target`
 * comes back as the blow left them.
 */
export function landBlow<T extends Target>(
  args: Pick<StrikeArgs<T>, "attacker" | "target" | "roll" | "rules" | "present" | "turnOf" | "choices" | "reduce" | "charged">,
  rolled: RolledAttack
): Strike & { target: T } {
  const { attack, roll } = rolled
  const stats = combatStatsOf(args.target)
  if (!stats) throw new Error(`${args.target.name ?? "The target"} has no sheet or stat block to attack.`)
  const before = Math.min(stats.hitPointMaximum, Math.max(0, args.target.hitPoints ?? stats.hitPointMaximum))
  const spent = rolled.inspired === undefined ? {} : { inspired: rolled.inspired }
  if (!roll.hit) return { attack, roll, taken: 0, hitPoints: { before, after: before, maximum: stats.hitPointMaximum }, target: args.target, ...spent }
  // A spell on the target may take the hit in their place (Mirror Image: a duplicate, which is destroyed).
  const imaged = deflectedHit(args.target, args.attacker, args.roll)
  if (imaged.deflected) return { attack, roll, taken: 0, hitPoints: { before, after: before, maximum: stats.hitPointMaximum }, target: imaged.character, ...spent, deflected: true }
  // A feature's dice (Sneak Attack), and the attacker's own spell on this target (Hunter's Mark).
  // An ally of the attacker's stands within 5 feet of the target, on their feet and able to act. An ally is one on the
  // attacker's side (./sides): a hero, or an NPC with the party, for a hero.
  const beside = placedOf(args.target)
  const allyBeside =
    !!beside &&
    (args.present ?? []).some((other) => {
      const at = placedOf(other)
      return (
        !!at &&
        other.id !== args.attacker.id &&
        other.id !== args.target.id &&
        sameSide(other, args.attacker) &&
        (other.hitPoints ?? 1) > 0 &&
        !other.dead &&
        !other.fled &&
        !isIncapacitated(other) &&
        within(at, beside, 5)
      )
    })
  const hitArgs = { attacker: args.attacker, attack, roll, allyBeside, hurt: before < stats.hitPointMaximum, turnOf: args.turnOf, choices: args.choices, target: args.target }
  const features = featureDamage(hitArgs)
  const retyped = featureDamageType(hitArgs)
  // Savage Attacker: once a turn, a weapon's damage dice are rolled twice, and the higher is kept.
  const weapon = equipmentById.get(attack.id)?.kind === "weapon"
  // Magic Weapon's bonus to the damage rolls of the weapon it is on, taken to be the one its bearer attacks with.
  const enchanted = weapon ? weaponDamageFromSpells(args.attacker).map(({ name, damage }) => ({ name, damage: { amount: damage.amount, type: damage.type ?? attack.damage[0]?.type ?? "force" } })) : []
  // The mark's die may be another by the attacker's feature (Foe Slayer's d10).
  const extra = [...features, ...markDamage(args.attacker.id, args.target, (spellId) => classMarkDie(args.attacker, spellId)), ...enchanted]
  const savage = weapon && !!args.attacker.sheet && deriveSheet(args.attacker.sheet).feats.includes("savage-attacker") && !usedThisTurn(args.attacker, "savage-attacker", args.turnOf)
  const own = damageOnHit(attack, { mode: roll.mode, attacker: args.attacker, target: args.target, before, maximum: stats.hitPointMaximum, charged: args.charged })
  const dealt = retyped ? own.map((part) => ({ ...part, type: retyped })) : own
  const first = rollDamage(dealt, args.roll, roll.critical)
  const second = savage ? rollDamage(dealt, args.roll, roll.critical) : undefined
  const kept = second && second.total > first.total ? second : first
  const added = rollDamage(
    extra.map((feature) => feature.damage),
    args.roll,
    roll.critical
  )
  const damage: DamageRoll = { parts: [...kept.parts, ...added.parts], total: kept.total + added.total }
  const defenses = defensesOf(args.target)
  const full = damageTaken(damage, defenses)
  const reduced = full > 0 ? args.reduce?.(full, [...new Set(damage.parts.map((part) => part.type))]) : undefined
  const taken = reduced ? reduced.taken : full
  // Acid or Fire taken stops a Troll's Regeneration (./monster-traits).
  let struck = withDamage({ ...args.target, hitPoints: before }, taken, { critical: roll.critical, rules: args.rules, types: typesTaken(damage, defenses) })
  const used: OncePerTurn[] = [...extra.flatMap((feature) => ("once" in feature && feature.once ? [feature.once] : [])), ...(savage ? (["savage-attacker"] as const) : [])]
  const names = [...extra.map((feature) => feature.name), ...(savage ? ["Savage Attacker"] : [])]
  // What rides on the hit falls after the damage: a Cunning Strike's Trip, on a target still up. What it spends of
  // the attacker's (a Stunning Strike's Focus Point) and the once-a-turn mark it leaves are charged to them.
  const riders: HitRider[] = []
  const conditions: ConditionChange[] = []
  const charged: string[] = []
  for (const rule of hitRules()) {
    if (!rule.after) continue
    const rode = rule.after({ attacker: args.attacker, target: struck.character, added: features.map((feature) => feature.name), choices: args.choices, roll: args.roll, attack })
    if (!rode) continue
    struck = { ...struck, character: rode.target }
    riders.push(rode.rider)
    conditions.push(...rode.conditions)
    if (rode.spends) charged.push(rode.spends)
    if (rode.once) used.push(rode.once)
  }
  // What a stat block's attack does beyond its damage, after a class's: a Wolf's Prone, a Giant Crab's grapple.
  const block = blockRidersOnHit({ attacker: args.attacker, target: struck.character, attack, roll: args.roll, present: args.present as RiderHeld[] | undefined, charged: args.charged })
  struck = { ...struck, character: block.target }
  riders.push(...block.riders)
  conditions.push(...block.conditions)
  return {
    attack,
    ...(names.length ? { features: names } : {}),
    roll,
    damage,
    taken,
    hitPoints: { before, after: struck.character.hitPoints ?? 0, maximum: stats.hitPointMaximum },
    ...(struck.fate ? { fate: struck.fate } : {}),
    ...(struck.fate === "endures" ? { endured: enduringTraitOf(struck.character)?.name ?? "endurance" } : {}),
    ...(struck.fate === "warded" ? { warded: true as const } : {}),
    ...spent,
    ...(used.length ? { used } : {}),
    ...(charged.length ? { spent: charged } : {}),
    ...(reduced ? { reduced: { id: reduced.id, from: full } } : {}),
    ...(riders.length ? { riders } : {}),
    ...(conditions.length ? { conditions } : {}),
    target: struck.character,
  }
}

/**
 * One attack, start to finish: `rollAttack`, then `landBlow`. The attacker's own weapon or stat block action against
 * the target's Armor Class, and on a hit the damage dice against the target's defenses and hit points, by the rules of
 * 0 hit points. A hit from within 5 feet on a target who is Paralyzed or Unconscious is a Critical Hit. `roll` throws
 * one damage die of the given size. `target` comes back as the blow left them.
 */
export function strike<T extends Target>(args: StrikeArgs<T>): Strike & { target: T } {
  return landBlow(args, rollAttack(args))
}

// How a target the blow left at 0 stands, in words.
function fallen(target: string, blow: Strike): string {
  const down = blow.hitPoints.before === 0
  switch (blow.fate) {
    case "dies":
      return down ? `${target} dies.` : `${target} drops to 0 hit points and dies.`
    case "killed":
      return down ? `${target} dies.` : `${target} is killed outright.`
    case "stable":
      return `${target} ${down ? "is" : "drops to 0 hit points and is"} Unconscious and Stable, out of the fight.`
    case "dying":
      return down ? `${target} is at 0 hit points, Unconscious and dying.` : `${target} drops to 0 hit points, falls Unconscious and is dying.`
    default:
      return `${target} is at 0 hit points.`
  }
}

/** A strike in plain words for the game master, who tells it and never changes it: who was hit, how hard, and how they stand. */
export function strikeFacts(attacker: string, target: string, blow: Strike): string {
  const { roll, attack, hitPoints } = blow
  if (blow.deflected)
    return `${attacker}'s ${attack.name} attack HITS (${roll.total} against Armor Class ${roll.armorClass}), but strikes one of ${target}'s illusory duplicates, which is destroyed. ${target} takes no damage.`
  if (!roll.hit) return `${attacker}'s ${attack.name} attack on ${target} MISSES (${roll.total} against Armor Class ${roll.armorClass}). ${target} takes no damage.`
  const types = [...new Set(blow.damage?.parts.map((part) => part.type) ?? [])].join(" and ")
  const stands = blow.endured
    ? `${target} would drop to 0 hit points and drops to 1 instead, by ${blow.endured}.`
    : blow.warded
      ? wardedWords(target)
      : hitPoints.after === 0
        ? fallen(target, blow)
        : `${target} has ${hitPoints.after} of ${hitPoints.maximum} hit points left${hitPoints.after * 2 <= hitPoints.maximum ? " and is Bloodied" : ""}.`
  const halved = blow.reduced ? (reactionRule(blow.reduced.id)?.damageWords?.(target) ?? "") : ""
  const trip = (blow.riders ?? []).map((rider) => (rider.id === STAT_BLOCK_RIDER ? blockRiderWords(attacker, target, rider) : (hitRule(rider.id)?.words?.(attacker, target, rider) ?? ""))).join("")
  return `${attacker}'s ${attack.name} attack on ${target} ${roll.critical ? "is a CRITICAL HIT" : "HITS"}${blow.features?.length ? ` with a ${blow.features.join(" and ")}` : ""} (${roll.total} against Armor Class ${roll.armorClass}) for ${blow.taken} ${types} damage.${halved} ${stands}${trip}`
}
