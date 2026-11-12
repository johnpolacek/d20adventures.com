import { hasFled, isDead, isDown, isIncapacitated } from "../utils/turn-actors"
import type { RequiredAttack, RequiredRoll } from "../validations/roll-requirement-schema"
import { type Acting, attackModesFromActions, hideRoll } from "./actions"
import { type Attack, attacksOf, type CunningStrike, cunningStrikesOf } from "./attack"
import { combineModes, type RollMode } from "./check"
import { attackModesFrom, cannotAttack, hasCondition, type ModeSource } from "./conditions"
import { deriveSheet } from "./derive"
import { attacksPerAction as attacksPerActionOf } from "./feature-rules"
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

/** What a turn still holds after the roll it is making: the rest of an Attack action, Horde Breaker, and a Hide. */
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
  cunning?: CunningStrike
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
    ...attackModesFromActions(character, target, ask.present),
    ...attackModesFromSpells(character, target),
    ...featModes(character, target),
    ...spaced,
    ...(ask.modes ?? []),
  ]
  const reasons = [...(picked !== "normal" && ask.reason?.trim() ? [ask.reason.trim()] : []), ...typed.map((source) => source.from)]
  const counted = cover === "half" || cover === "three-quarters" ? cover : undefined
  return {
    roll: {
      attack: { weapon: attack.id, target: target.id, ...(counted ? { cover: counted } : {}), ...(ask.cunning ? { cunning: ask.cunning } : {}) },
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

// Whether one is an enemy the attacker can still attack: of the other side, up, here, and not one they are Charmed by.
const attackable = (attacker: InScene, other: InScene): boolean => other.id !== attacker.id && other.type !== attacker.type && !isDown(other) && !hasFled(other) && !cannotAttack(attacker, other)

/**
 * The roll a turn asks for after one is resolved, or none when the turn is done. What it still holds is on the roll
 * just made (`after`):
 *
 * - The rest of an Attack action. With Extra Attack a hero attacks twice, and Action Surge gives another action's
 *   worth. Each attack is with the same weapon, at the same target, or once that one is down at the nearest enemy the
 *   weapon reaches from where the hero stands, with no move. With none, the rest of the action is lost.
 * - Horde Breaker, once a turn: another attack with the same weapon at a creature within 5 feet of the one just
 *   attacked, within the weapon's reach or range, that the hero has not attacked this turn.
 * - A Hide taken with Cunning Action: the Stealth check, after the rest.
 *
 * The player throws each d20 as they throw the first.
 */
export function followingRoll(args: { character: InScene; made: RequiredRoll; present: readonly InScene[]; floor?: Floor }): RequiredRoll | undefined {
  const { character, made } = args
  const then = made.after
  if (!then || isDown(character) || isIncapacitated(character) || hasCondition(character, "incapacitated")) return undefined
  const next = { ...then }
  if ("attack" in made && made.attack) {
    const attack = attacksOf(character).find((entry) => entry.id === made.attack.weapon)
    const struck = [...new Set([...(then.struck ?? []), made.attack.target])]
    const asked = (target: InScene, rest: After): RequiredRoll | undefined => {
      const required = attack && attackRequirement({ character, target, attack, present: args.present, floor: args.floor, after: rest })
      return required && "roll" in required ? required.roll : undefined
    }
    const reached = (other: InScene) => !!attack && asked(other, {}) !== undefined
    // The rest of the Attack action: the same target while it stands, or the nearest enemy in reach.
    if (attack && (then.attacks ?? 0) > 0) {
      const rest: After = { ...next, attacks: (then.attacks ?? 1) - 1, struck }
      const same = args.present.find((other) => other.id === made.attack.target && attackable(character, other))
      const nearest =
        same && reached(same)
          ? same
          : nearestEnemy(
              character,
              args.present.filter((other) => attackable(character, other) && reached(other))
            )
      const roll = nearest && asked(nearest, tidy(rest))
      if (roll) return roll
      next.attacks = 0
    }
    // Horde Breaker: a creature beside the one just attacked, not yet attacked this turn.
    if (attack && then.horde) {
      const original = args.present.find((other) => other.id === made.attack.target)
      const at = original && placedOf(original)
      const beside = args.present.filter((other) => {
        const there = placedOf(other)
        return attackable(character, other) && !struck.includes(other.id) && (!at || (!!there && within(there, at, 5))) && reached(other)
      })
      const choice = at ? nearestEnemy(character, beside) : undefined
      const roll = choice && asked(choice, tidy({ ...next, attacks: 0, horde: undefined, struck: [...struck, choice.id] }))
      if (roll) return roll
    }
    next.attacks = 0
    next.horde = undefined
  }
  if (then.hide) return hideRoll(character)
  return undefined
}

// An `after` with nothing left in it left out.
function tidy(then: After): After {
  const kept: After = {}
  if (then.attacks) kept.attacks = then.attacks
  if (then.horde) kept.horde = true
  if (then.struck?.length) kept.struck = then.struck
  if (then.hide) kept.hide = true
  return kept
}

/** The nearest of some, from where a character stands. With no floor, the first. */
function nearestEnemy(character: InScene, from: readonly InScene[]): InScene | undefined {
  const feet = (other: InScene) => feetBetween(character, other) ?? 0
  return [...from].sort((a, b) => feet(a) - feet(b))[0]
}

/** What a turn holds after its first attack, from the hero's features: the Attack action's other attacks, and Horde Breaker. */
export function attackAfter(character: InScene, options: { surge?: boolean } = {}): After {
  if (!character.sheet) return {}
  const perAction = attacksPerActionOf(character)
  const attacks = perAction - 1 + (options.surge ? perAction : 0)
  const horde = character.sheet.featureChoices?.["hunter-hunters-prey"] === "horde-breaker" && deriveSheet(character.sheet).classFeatures.includes("hunter-hunters-prey")
  return tidy({ attacks, ...(horde ? { horde: true } : {}) })
}

export { cunningStrikesOf }
