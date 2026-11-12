import { hasFled, isDead, isDown, isIncapacitated } from "../utils/turn-actors"
import type { RequiredAttack, RequiredRoll } from "../validations/roll-requirement-schema"
import { type Acting, attackModesFromActions, hideRoll } from "./actions"
import { type Attack, attacksOf, averageDamage } from "./attack"
import { combineModes, type RollMode } from "./check"
import { type FollowRule, followRules } from "./class-rules"
import { attackModesFrom, cannotAttack, hasCondition, type ModeSource } from "./conditions"
import { deriveSheet } from "./derive"
import { attacksPerAction as attacksPerActionOf } from "./feature-rules"
import { multiattackAfter } from "./multiattack"
import { attackReach, type Cover, coverBetween, coverBonus, type Floor, feetBetween, greaterCover, isNear, placedOf, type Standing, within } from "./space"
import { attackModesFromSpells } from "./spell-effects"
import { combatStatsOf } from "./stat-block"

/**
 * An attack roll the engine asks for, worked out from where everyone stands: the target's Armor Class with its cover,
 * and every Advantage and Disadvantage the rules settle, each with its reason. The read of a turn asks for the first
 * attack of an action this way, and the turn asks for the attacks that follow it the same way (`followingRoll`).
 */

/** One in the scene, as the attack reads them. */
export type InScene = Acting & Standing & { hitPoints?: number; healthPercent?: number; dead?: true; fled?: true; isComplete?: boolean; statBlock?: string }

/** What a turn still holds after the roll it is making: the rest of an Attack action, a class's follow-ups (Horde Breaker), and a Hide. */
export type After = NonNullable<RequiredRoll["after"]>

export type AttackAsk = {
  character: InScene
  target: InScene
  attack: Attack
  /** Everyone in the scene, the roller among them. */
  present: readonly InScene[]
  floor?: Floor
  /** The game master's read of the moment, with what gives it. */
  mode?: RollMode
  reason?: string
  /** Cover the story put between them that the place does not hold. */
  cover?: Cover
  /** Advantage or Disadvantage from a feature used this turn: Steady Aim. */
  modes?: readonly ModeSource[]
  /** Feet the roller moved before the attack, for the words of a ruling. */
  moved?: number
  /** What class features the attacker chose for this attack, kept on it until the blow lands: a Cunning Strike's `cunning`. */
  choices?: Record<string, string>
  after?: After
}

/** Something the rules of space do not allow, told in the story: an attack out of reach. */
export type Ruling = { name: string; text: string }

/**
 * The roll for one attack from where the attacker stands: out of reach or range, or through total cover, there is
 * none, and a ruling says why. Otherwise the Armor Class with cover, Long Range and an enemy within 5 feet for a ranged
 * attack, the conditions of the two, actions taken (Dodge, Help, Vex), lasting spells, and any feature's own.
 */
export function attackRequirement(ask: AttackAsk): { roll: RequiredAttack } | { ruling: Ruling } {
  const { character, target, attack, floor } = ask
  const armorClass = combatStatsOf(target)?.armorClass
  if (armorClass === undefined) throw new Error(`${target.name} has no sheet or stat block to attack.`)
  const others = ask.present.filter((other) => other.id !== character.id && !isDead(other) && !hasFled(other))
  const moved = ask.moved ? ` moves ${ask.moved} feet and` : ""
  const feet = floor ? feetBetween(character, target) : undefined
  const band = feet === undefined ? undefined : attackReach({ distance: feet, reach: attack.reach, range: attack.range })
  if (band === "out" && feet !== undefined) {
    const what = attack.range && attack.reach === undefined ? "Range" : "Reach"
    return {
      ruling: { name: `Out Of ${what}`, text: `${character.name}${moved} is ${Math.round(feet)} feet from ${target.name}, out of ${what.toLowerCase()} with ${attack.name}. The attack is not made.` },
    }
  }
  // Cover, from the solid things and the creatures on the line between the two, by their height. The game master may
  // name cover the place does not hold, and the greater stands. Through total cover no attack is made.
  const from = placedOf(character)
  const aimed = placedOf(target)
  const between = others.flatMap((other) => {
    const at = other.id === target.id || isDown(other) ? undefined : placedOf(other)
    return at ? [at] : []
  })
  const cover = floor && from && aimed ? greaterCover(coverBetween(floor.solids, from, aimed, between), ask.cover ?? "none") : (ask.cover ?? "none")
  if (cover === "total") {
    return { ruling: { name: "Total Cover", text: `${character.name}${moved} has no clear line to ${target.name}: something solid stands between them. The attack is not made.` } }
  }
  // A ranged attack has Disadvantage at long range, and with an enemy within 5 feet who is up and able to act.
  const ranged = band === "normal" || band === "long"
  const crowded =
    ranged &&
    !!from &&
    others.some((other) => {
      const at = placedOf(other)
      return !!at && other.type !== character.type && !isDown(other) && !isIncapacitated(other) && within(from, at, 5)
    })
  const spaced: ModeSource[] = [
    ...(band === "long" ? [{ mode: "disadvantage" as const, from: "Long Range" }] : []),
    ...(crowded ? [{ mode: "disadvantage" as const, from: "Enemy Within 5 Feet" }] : []),
  ]
  const picked = ask.mode ?? "normal"
  const typed = [
    ...attackModesFrom(character, target, feet === undefined ? attack.kind !== "ranged" : isNear(character, target, attack.kind), ask.present),
    ...attackModesFromActions(character, target, ask.present, attack),
    ...attackModesFromSpells(character, target),
    ...featModes(character, target),
    ...spaced,
    ...(ask.modes ?? []),
  ]
  const reasons = [...(picked !== "normal" && ask.reason?.trim() ? [ask.reason.trim()] : []), ...typed.map((source) => source.from)]
  const counted = cover === "half" || cover === "three-quarters" ? cover : undefined
  return {
    roll: {
      attack: { weapon: attack.id, target: target.id, ...(counted ? { cover: counted } : {}), ...(ask.choices && Object.keys(ask.choices).length ? { choices: ask.choices } : {}) },
      rollType: attack.name,
      difficulty: armorClass + coverBonus(cover),
      modifier: attack.bonus,
      mode: combineModes([picked, ...typed.map((source) => source.mode)]),
      ...(reasons.length ? { reasons } : {}),
      ...(ask.after && Object.keys(ask.after).length ? { after: ask.after } : {}),
    },
  }
}

/** Advantage a feat gives an attack: Grappler's on a creature the attacker has Grappled. */
function featModes(attacker: InScene, target: InScene): ModeSource[] {
  if (!attacker.sheet || !deriveSheet(attacker.sheet).feats.includes("grappler")) return []
  const held = (target.conditions ?? []).some((entry) => entry.id === "grappled" && entry.source === attacker.id)
  return held && hasCondition(target, "grappled") ? [{ mode: "advantage", from: "Grappler" }] : []
}

/** Whether one is an enemy the attacker can still attack: of the other side, up, here, and not one they are Charmed by. */
export const attackable = (attacker: InScene, other: InScene): boolean =>
  other.id !== attacker.id && other.type !== attacker.type && !isDown(other) && !hasFled(other) && !cannotAttack(attacker, other)

/**
 * The roll a turn asks for after one is resolved, or none when the turn is done. What it still holds is on the roll
 * just made (`after`):
 *
 * - The rest of an Attack action. With Extra Attack a hero attacks twice, and Action Surge gives another action's
 *   worth. Each attack is with the same weapon.
 * - The rest of an NPC's Multiattack: each attack with one of the attacks the Multiattack allows for it. Where it
 *   allows several ("in any combination"), the engine takes the best at the target: one with no Disadvantage over one
 *   with it, then the most average damage, then the longest reach.
 * - A class's follow-ups that come with the action's attacks, after the rest of them (./classes): Horde Breaker.
 * - A Hide taken with Cunning Action, and any other follow-up of a class's: the roll, after the rest.
 *
 * An attack of the action or the Multiattack goes at the same target, or once that one is down or out of the weapon's
 * reach or range, at the nearest enemy the weapon reaches from where the attacker stands, with no move. With none, the
 * rest is lost. The player throws each d20 as they throw the first.
 */
export function followingRoll(args: { character: InScene; made: RequiredRoll; present: readonly InScene[]; floor?: Floor }): RequiredRoll | undefined {
  const { character, made } = args
  const then = made.after
  if (!then || isDown(character) || isIncapacitated(character) || hasCondition(character, "incapacitated")) return undefined
  const next = { ...then }
  if ("attack" in made && made.attack) {
    const own = attacksOf(character)
    const attack = own.find((entry) => entry.id === made.attack.weapon)
    const struck = [...new Set([...(then.struck ?? []), made.attack.target])]
    const asked = (using: Attack, target: InScene, rest: After): RequiredAttack | undefined => {
      const required = attackRequirement({ character, target, attack: using, present: args.present, floor: args.floor, after: rest })
      return "roll" in required ? required.roll : undefined
    }
    // The best of some attacks at a target, as the roll for it: no Disadvantage over Disadvantage, then the most damage, then the longest reach.
    const best = (from: readonly Attack[], target: InScene, rest: After): RequiredAttack | undefined =>
      from
        .flatMap((entry) => {
          const roll = asked(entry, target, rest)
          return roll ? [{ entry, roll }] : []
        })
        .sort((a, b) => MODE_RANK[b.roll.mode] - MODE_RANK[a.roll.mode] || averageDamage(b.entry) - averageDamage(a.entry) || (b.entry.reach ?? 0) - (a.entry.reach ?? 0))[0]?.roll
    // The next attack of an action or a Multiattack: the same target while it stands in reach, or the nearest enemy in reach.
    const onward = (from: readonly Attack[], rest: After): RequiredAttack | undefined => {
      const reached = (other: InScene) => best(from, other, {}) !== undefined
      const same = args.present.find((other) => other.id === made.attack.target && attackable(character, other))
      const target =
        same && reached(same)
          ? same
          : nearestEnemy(
              character,
              args.present.filter((other) => attackable(character, other) && reached(other))
            )
      return target && best(from, target, tidy(rest))
    }
    // The rest of the Attack action, with the same weapon.
    if (attack && (then.attacks ?? 0) > 0) {
      const roll = onward([attack], { ...next, attacks: (then.attacks ?? 1) - 1, struck })
      if (roll) return roll
      next.attacks = 0
    }
    // The rest of a Multiattack, each attack with one it allows.
    const [slot, ...slots] = then.multiattack ?? []
    if (slot) {
      const roll = onward(
        own.filter((entry) => slot.includes(entry.id)),
        { ...next, multiattack: slots, struck }
      )
      if (roll) return roll
      next.multiattack = undefined
    }
    // A class's follow-ups that come with the attacks: each once, after the rest of them.
    for (const rule of follows().filter((entry) => entry.attack)) {
      if (!attack || !then[rule.key]) continue
      const rest = (extra: After = {}) => tidy({ ...next, attacks: 0, multiattack: undefined, [rule.key]: undefined, ...extra })
      const roll = rule.next({ character, made, attack, struck, present: args.present, floor: args.floor, ask: asked, rest })
      if (roll) return roll
    }
    next.attacks = 0
    next.multiattack = undefined
    for (const rule of follows().filter((entry) => entry.attack)) next[rule.key] = undefined
  }
  // What follows everything else: a Hide.
  const rule = follows().find((entry) => !entry.attack && then[entry.key])
  return rule?.next({
    character,
    made,
    struck: then.struck ?? [],
    present: args.present,
    floor: args.floor,
    ask: () => undefined,
    rest: (extra = {}) => tidy({ ...next, [rule.key]: undefined, ...extra }),
  })
}

/** The Hide action's Stealth check, taken with Cunning Action, after the turn's own roll or as it. */
const HIDE: FollowRule = { key: "hide", first: hideRoll, next: ({ character }) => hideRoll(character) }

// Every follow-up: the classes', then Hide, which follows everything else.
const follows = (): FollowRule[] => [...followRules(), HIDE]

/** A follow-up by its key on `after`: "hide", "horde". */
export const followRule = (key: string | undefined): FollowRule | undefined => follows().find((rule) => rule.key === key)

// How a roll's mode ranks when the engine picks a weapon: Advantage over none, none over Disadvantage.
const MODE_RANK: Record<RollMode, number> = { advantage: 2, normal: 1, disadvantage: 0 }

// An `after` with nothing left in it left out. A follow-up's key is kept while it is still to come.
function tidy(then: After): After {
  const kept: After = {}
  if (then.attacks) kept.attacks = then.attacks
  if (then.multiattack?.length) kept.multiattack = then.multiattack
  for (const rule of follows()) if (rule.attack && then[rule.key]) kept[rule.key] = true
  if (then.struck?.length) kept.struck = then.struck
  for (const rule of follows()) if (!rule.attack && then[rule.key]) kept[rule.key] = true
  return kept
}

/** The nearest of some, from where a character stands. With no floor, the first. */
export function nearestEnemy(character: InScene, from: readonly InScene[]): InScene | undefined {
  const feet = (other: InScene) => feetBetween(character, other) ?? 0
  return [...from].sort((a, b) => feet(a) - feet(b))[0]
}

/**
 * What a turn holds after its first attack: a hero's other attacks of the Attack action, as many actions' worth as the
 * turn has (`actions`, 2 with Action Surge), and the follow-ups their class gives (Horde Breaker), or the rest of an
 * NPC's Multiattack once its first attack is made with `weapon` (./multiattack).
 */
export function attackAfter(character: InScene, options: { actions?: number; weapon?: string } = {}): After {
  if (!character.sheet) return tidy({ multiattack: options.weapon ? multiattackAfter(character, options.weapon) : [] })
  const attacks = attacksPerActionOf(character) * (options.actions ?? 1) - 1
  const flags = Object.fromEntries(follows().flatMap((rule) => (rule.attack && rule.offer?.(character) ? [[rule.key, true]] : [])))
  return tidy({ attacks, ...flags })
}
