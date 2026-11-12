import type { AbilityId, DamageTypeId } from "@d20/srd"
import { damageTypeIds } from "@d20/srd"
import { classById } from "@d20/srd/classes"
import { equipmentById } from "@d20/srd/equipment"
import { monsterById } from "@d20/srd/monsters"
import type { Roller, RollMode } from "./check"
import { criticalWhenHit, d20Penalty, resistsAllDamage } from "./conditions"
import { type DeathRules, type DeathSaves, type Fate, withDamage } from "./death"
import { deriveSheet, trainedWith } from "./derive"
import type { Sheet } from "./sheet"
import { markDamage, rollAdds } from "./spell-effects"
import { combatStatsOf, DEFAULT_STAT_BLOCK } from "./stat-block"

/** Damage one attack deals of one type: dice as the SRD writes them ("1d8 + 3"), or a flat amount with no dice. */
export type DamagePart = { dice?: string; amount?: number; type: DamageTypeId }

/** One way a character can attack: a hero's weapon, or an attack action of an NPC's stat block. */
export type Attack = {
  /** The weapon's equipment id, "unarmed-strike", or a stat block action's name in lower case with dashes. */
  id: string
  name: string
  kind: "melee" | "ranged" | "melee-or-ranged"
  /** What is added to the d20. */
  bonus: number
  damage: DamagePart[]
}

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
    return { id: UNARMED_STRIKE, name: "Unarmed Strike", kind: "melee", bonus: mods.str + derived.proficiencyBonus, damage: [{ amount: Math.max(0, 1 + mods.str), type: "bludgeoning" }] }
  }
  const weapon = equipmentById.get(weaponId)
  if (weapon?.kind !== "weapon") throw new Error(`"${weaponId}" is not a weapon`)
  const properties: readonly string[] = weapon.properties ?? []
  const natural: AbilityId = weapon.attackType === "ranged" ? "dex" : "str"
  const ability: AbilityId = properties.includes("finesse") ? (mods.dex > mods.str ? "dex" : "str") : natural
  const trained = trainedWith(derived.weaponProficiencies, weapon)
  const damage: DamagePart = weapon.damage.dice
    ? { dice: signed(weapon.damage.dice, mods[ability]), type: weapon.damage.type }
    : { amount: Math.max(0, (weapon.damage.amount ?? 0) + mods[ability]), type: weapon.damage.type }
  return {
    id: weapon.id,
    name: weapon.name,
    kind: weapon.attackType === "ranged" ? "ranged" : properties.includes("thrown") ? "melee-or-ranged" : "melee",
    bonus: mods[ability] + (trained ? derived.proficiencyBonus : 0),
    damage: [damage],
  }
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
  if (character.sheet) {
    const sheet = character.sheet
    return [...(sheet.weapons ?? []), UNARMED_STRIKE].map((weapon) => weaponAttack(sheet, weapon))
  }
  if (character.type !== "npc") return []
  const monster = monsterById.get(character.statBlock ?? DEFAULT_STAT_BLOCK) ?? monsterById.get(DEFAULT_STAT_BLOCK)
  if (!monster) return []
  return (monster.actions ?? []).flatMap((action) => {
    if (!action.attack) return []
    const damage = (action.damage ?? []).flatMap((part): DamagePart[] => (part.on === "hit" && part.type ? [{ ...(part.dice ? { dice: part.dice } : { amount: part.amount }), type: part.type }] : []))
    return [{ id: actionId(action.name), name: action.name, kind: action.attack.kind, bonus: action.attack.bonus, damage }]
  })
}

/** How many attacks an NPC's Multiattack makes with each of its attack actions: an Owlbear's is two Rends. Unknown wording gives none. */
export function multiattackOf(character: Roller): { attack: string; times: number }[] {
  if (character.type !== "npc" || character.sheet) return []
  const monster = monsterById.get(character.statBlock ?? DEFAULT_STAT_BLOCK)
  const text = monster?.actions?.find((action) => action.name === "Multiattack")?.text
  if (!monster || !text) return []
  const numbers: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 }
  const found: { attack: string; times: number }[] = []
  for (const action of monster.actions ?? []) {
    if (!action.attack) continue
    const match = new RegExp(`\\b(one|two|three|four|five) ${action.name} attacks?\\b`, "i").exec(text)
    if (match) found.push({ attack: actionId(action.name), times: numbers[match[1].toLowerCase()] })
  }
  return found
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
  mode: RollMode
  /** Dice that lasting spells added or took away, each as it fell. `total` includes them. */
  adds?: { from: string; amount: number }[]
}

/**
 * Resolve an attack roll: the d20 plus the attack bonus against the target's Armor Class. A 20 on the die always hits
 * and is a Critical Hit. A 1 on the die always misses. Advantage keeps the higher of two dice and Disadvantage the lower.
 */
export function resolveAttack(args: { dice: readonly number[]; bonus: number; armorClass: number; mode?: RollMode; adds?: readonly { from: string; amount: number }[] }): AttackResult {
  const mode = args.mode ?? "normal"
  const needed = mode === "normal" ? 1 : 2
  const dice = args.dice.slice(0, needed)
  if (dice.length < needed) throw new Error(`An attack roll with ${mode === "normal" ? "no Advantage or Disadvantage" : mode} takes ${needed} d20, and ${dice.length} came.`)
  for (const die of dice) if (!Number.isInteger(die) || die < 1 || die > 20) throw new Error(`${die} is not a d20 roll.`)
  const natural = mode === "advantage" ? Math.max(...dice) : mode === "disadvantage" ? Math.min(...dice) : dice[0]
  const total = natural + args.bonus + (args.adds ?? []).reduce((sum, add) => sum + add.amount, 0)
  const critical = natural === 20
  return {
    dice,
    natural,
    bonus: args.bonus,
    total,
    armorClass: args.armorClass,
    hit: critical || (natural !== 1 && total >= args.armorClass),
    critical,
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
    const dice = Array.from({ length: critical ? count * 2 : count }, () => roll(sides))
    for (const die of dice) if (!Number.isInteger(die) || die < 1 || die > sides) throw new Error(`${die} is not a d${sides} roll.`)
    return { type: part.type, dice, sides, bonus, total: Math.max(0, dice.reduce((sum, die) => sum + die, 0) + bonus) }
  })
  return { parts, total: parts.reduce((sum, part) => sum + part.total, 0) }
}

/** The damage types a character shrugs off, takes half of, or takes double of. */
export type Defenses = { immunities?: readonly DamageTypeId[]; resistances?: readonly DamageTypeId[]; vulnerabilities?: readonly DamageTypeId[] }

/**
 * A character's standing defenses: a hero's Resistances from its sheet, an NPC's from its stat block. A condition
 * that gives Resistance to all damage, as Petrified does, gives it for every type.
 */
export function defensesOf(character: Roller): Defenses {
  const own = ownDefenses(character)
  return resistsAllDamage(character) ? { ...own, resistances: damageTypeIds } : own
}

function ownDefenses(character: Roller): Defenses {
  if (character.sheet) return { resistances: deriveSheet(character.sheet).resistances }
  const monster = character.type === "npc" ? (monsterById.get(character.statBlock ?? DEFAULT_STAT_BLOCK) ?? monsterById.get(DEFAULT_STAT_BLOCK)) : undefined
  return monster ? { immunities: monster.immunities, resistances: monster.resistances, vulnerabilities: monster.vulnerabilities } : {}
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
 * Extra damage a hero's class features add to a hit. A Rogue's Sneak Attack adds its dice, of the weapon's damage type,
 * to a hit made with Advantage and a Finesse or Ranged weapon. Its other way in, an ally beside the target, waits for
 * positions in stage 6 of plans/srd-rules.md.
 */
function featureDamage(attacker: Roller, attack: Attack, roll: AttackResult): { name: string; damage: DamagePart }[] {
  const sheet = attacker.sheet
  const weapon = equipmentById.get(attack.id)
  if (!sheet || roll.mode !== "advantage" || weapon?.kind !== "weapon") return []
  const fits = weapon.attackType === "ranged" || (weapon.properties ?? []).some((property) => property === "finesse")
  if (!fits || !deriveSheet(sheet).classFeatures.includes("rogue-sneak-attack")) return []
  const dice = classById.get(sheet.class)?.levels[sheet.level - 1]?.sneakAttack
  return dice ? [{ name: "Sneak Attack", damage: { dice, type: weapon.damage.type } }] : []
}

export type Strike = {
  attack: Attack
  /** Class features that added damage to this hit: "Sneak Attack". */
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
  /** A Bardic Inspiration die rolled and added to an attack roll that had missed. The roll's total includes it. */
  inspired?: number
}

type Target = Roller & { type: string; hitPoints?: number; healthPercent?: number; dead?: true; fled?: true; deathSaves?: DeathSaves; tempHitPoints?: number }

/**
 * One attack, start to finish: the attacker's own weapon or stat block action against the target's Armor Class, and on
 * a hit the damage dice against the target's defenses and hit points, by the rules of 0 hit points. A hit from within
 * 5 feet on a target who is Paralyzed or Unconscious is a Critical Hit. `roll` throws one damage die of the given size.
 * `target` comes back as the blow left them.
 */
export function strike<T extends Target>(args: {
  attacker: Roller
  target: T
  weapon: string
  dice: readonly number[]
  mode?: RollMode
  roll: (sides: number) => number
  rules?: DeathRules
  /** A Bardic Inspiration die the attacker holds. It is rolled on a miss it could turn into a hit, and never on a 1. */
  inspiration?: { die: number }
}): Strike & { target: T } {
  const attack = attacksOf(args.attacker).find((entry) => entry.id === args.weapon)
  if (!attack) throw new Error(`${args.attacker.name ?? "The attacker"} has no attack "${args.weapon}".`)
  const stats = combatStatsOf(args.target)
  if (!stats) throw new Error(`${args.target.name ?? "The target"} has no sheet or stat block to attack.`)
  const before = Math.min(stats.hitPointMaximum, Math.max(0, args.target.hitPoints ?? stats.hitPointMaximum))
  // Lasting spells add their dice to the roll (Bless), or take them away (Bane).
  const rolled = resolveAttack({ dice: args.dice, bonus: attack.bonus, armorClass: stats.armorClass, mode: args.mode, adds: rollAdds(args.attacker, "attack-rolls", args.roll) })
  // A miss by no more than the die could add, and not on a 1, rolls a held Bardic Inspiration die.
  const short = stats.armorClass - rolled.total
  const inspired = !rolled.hit && rolled.natural !== 1 && args.inspiration && short <= args.inspiration.die ? args.roll(args.inspiration.die) : undefined
  const lifted = inspired === undefined ? rolled : { ...rolled, total: rolled.total + inspired, hit: rolled.total + inspired >= stats.armorClass }
  const roll = lifted.hit && !lifted.critical && criticalWhenHit(args.target, attack.kind) ? { ...lifted, critical: true } : lifted
  const spent = inspired === undefined ? {} : { inspired }
  if (!roll.hit) return { attack, roll, taken: 0, hitPoints: { before, after: before, maximum: stats.hitPointMaximum }, target: args.target, ...spent }
  // A feature's dice (Sneak Attack), and the attacker's own spell on this target (Hunter's Mark).
  const extra = [...featureDamage(args.attacker, attack, roll), ...markDamage(args.attacker.id, args.target)]
  const damage = rollDamage([...attack.damage, ...extra.map((feature) => feature.damage)], args.roll, roll.critical)
  const taken = damageTaken(damage, defensesOf(args.target))
  const struck = withDamage({ ...args.target, hitPoints: before }, taken, { critical: roll.critical, rules: args.rules })
  return {
    attack,
    ...(extra.length ? { features: extra.map((feature) => feature.name) } : {}),
    roll,
    damage,
    taken,
    hitPoints: { before, after: struck.character.hitPoints ?? 0, maximum: stats.hitPointMaximum },
    ...(struck.fate ? { fate: struck.fate } : {}),
    ...spent,
    target: struck.character,
  }
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
  if (!roll.hit) return `${attacker}'s ${attack.name} attack on ${target} MISSES (${roll.total} against Armor Class ${roll.armorClass}). ${target} takes no damage.`
  const types = [...new Set(blow.damage?.parts.map((part) => part.type) ?? [])].join(" and ")
  const stands =
    hitPoints.after === 0 ? fallen(target, blow) : `${target} has ${hitPoints.after} of ${hitPoints.maximum} hit points left${hitPoints.after * 2 <= hitPoints.maximum ? " and is Bloodied" : ""}.`
  return `${attacker}'s ${attack.name} attack on ${target} ${roll.critical ? "is a CRITICAL HIT" : "HITS"}${blow.features?.length ? ` with a ${blow.features.join(" and ")}` : ""} (${roll.total} against Armor Class ${roll.armorClass}) for ${blow.taken} ${types} damage. ${stands}`
}
