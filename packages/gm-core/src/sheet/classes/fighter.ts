import { classFeatureById } from "@d20/srd/class-features"
import { z } from "zod"
import { hasFled, isDead } from "../../utils/turn-actors"
import { masteryOf, parseDice, rollDamage } from "../attack"
import { type Check, type CheckResult, type Roller, resolveCheck } from "../check"
import { type Bearing, type ClassRules, type SaveRule, withTurnEffect } from "../class-rules"
import { immuneTo } from "../conditions"
import { withHealing } from "../death"
import { deriveSheet } from "../derive"
import { hasFeature, usesLeft, withFeatureUsed } from "../feature-rules"
import { hitPointsOf } from "../hit-points"
import { speedOf } from "../space"

/**
 * The Fighter's features in play.
 *
 * Second Wind: a Bonus Action to regain 1d10 plus the Fighter level in hit points. With Tactical Shift (level 5) the
 * hero may move up to half their Speed without drawing Opportunity Attacks as they use it.
 * Tactical Mind (level 2): when a Fighter fails an ability check, they may spend a use of Second Wind to roll 1d10 and
 * add it. The use is spent only when the check then succeeds.
 * Action Surge (level 2): one more action this turn. The read offers it beside an attack.
 * Remarkable Athlete (Champion, level 3): Advantage on Initiative and on Strength (Athletics) checks.
 * Indomitable (level 9): a failed saving throw rerolled with a bonus of the Fighter level, once a Long Rest, twice
 * from 13 and three times from 17. The new roll stands.
 * Tactical Master (level 9): with an attack made with a weapon whose mastery the Fighter can use, the read may put Push,
 * Sap or Slow in that mastery's place for the attack.
 * Studied Attacks (level 13): an attack roll that misses a creature gives the Fighter's next attack roll against it
 * Advantage, before the end of their next turn.
 * Survivor (Champion, level 18): Defy Death gives Advantage on Death Saving Throws, and a die of 18 to 20 counts as a
 * 20. Heroic Rally: as each of the Fighter's turns starts, Bloodied with at least 1 hit point, they regain 5 plus their
 * Constitution modifier.
 * Extra Attack, Two and Three Extra Attacks, Improved and Superior Critical, Action Surge's second use from level 17
 * and Additional Fighting Style are read from the data by ../feature-rules and ../derive.
 * Told only: Heroic Warrior (Champion, level 10), since the engine keeps no Heroic Inspiration.
 */

/**
 * Tactical Mind on a failed check: the engine uses it on a failure the d10 could turn, short by 10 or less, as a player
 * would. A saving throw is no ability check. The check comes back as it now stands, with the d10 among its adds, and
 * whether the use is spent. None when it is not used.
 */
export function tacticalMind(
  character: Roller & { featureUses?: Record<string, number> },
  check: Check,
  result: CheckResult,
  roll: (sides: number) => number
): { result: CheckResult; spent: boolean } | undefined {
  if (check.kind === "save" || result.success || !hasFeature(character, "fighter-tactical-mind") || usesLeft(character, "fighter-second-wind") < 1) return undefined
  const sides = parseDice(classFeatureById.get("fighter-tactical-mind")?.dice ?? "1d10").sides
  if (result.dc - result.total > sides) return undefined
  const rolled = roll(sides)
  if (!Number.isInteger(rolled) || rolled < 1 || rolled > sides) throw new Error(`${rolled} is not a d${sides} roll.`)
  const total = result.total + rolled
  const success = total >= result.dc
  return { result: { ...result, total, success, adds: [...(result.adds ?? []), { from: "Tactical Mind", amount: rolled }] }, spent: success }
}

const INDOMITABLE = "fighter-indomitable"

/**
 * Indomitable on a failed save against harm (../save-rules `rescuedSave`): the engine uses it by a plain rule, as a
 * player would, on a failure the reroll could still turn, when the failure costs a condition the hero is not immune to
 * or damage. The reroll keeps the save's Advantage or Disadvantage and what was added to it, with the Fighter level
 * beside. None when it is not used.
 */
export function indomitable(args: Parameters<SaveRule>[0]): ReturnType<SaveRule> {
  const { character, result, stakes } = args
  if (!character.sheet || usesLeft(character, INDOMITABLE) < 1) return undefined
  if (!stakes.damage && !(stakes.conditions ?? []).some((id) => !immuneTo(character, id))) return undefined
  const level = character.sheet.level
  const kept = (result.adds ?? []).reduce((sum, add) => sum + add.amount, 0)
  if (20 + result.bonus + kept + level < result.dc) return undefined
  const dice = Array.from({ length: result.mode === "normal" ? 1 : 2 }, () => args.d20())
  const rerolled = resolveCheck({ dice, bonus: result.bonus, dc: result.dc, mode: result.mode, adds: [...(result.adds ?? []), { from: "Indomitable", amount: level }] })
  return { result: rerolled, feature: INDOMITABLE, name: classFeatureById.get(INDOMITABLE)?.name ?? "Indomitable" }
}

const TACTICAL_MASTER = "fighter-tactical-master"
// The masteries Tactical Master may put in a weapon's own place (SRD 5.2.1 p. 48). The data does not type them.
const TACTICAL_MASTERIES = ["push", "sap", "slow"] as const

/**
 * The mastery a Fighter's attack uses by Tactical Master: the one chosen with the attack, when the weapon's own mastery
 * is one they can use. None otherwise, and the weapon's own stands.
 */
export function tacticalMastery(character: Roller, weaponId: string, choices: Readonly<Record<string, string>> | undefined): string | undefined {
  const chosen = choices?.tactical
  if (!chosen || !(TACTICAL_MASTERIES as readonly string[]).includes(chosen) || !hasFeature(character, TACTICAL_MASTER)) return undefined
  return masteryOf(character, weaponId) ? chosen : undefined
}

const STUDIED_ATTACKS = "fighter-studied-attacks"
// The mark Studied Attacks leaves on the creature missed, by the Fighter.
const STUDIED = "studied"

/**
 * Studied Attacks as an attack roll settles: the Fighter's roll spends the mark they left on the one attacked, and one
 * that missed leaves a new one. It lasts until the Fighter's next turn is over.
 */
export function studied<T extends Bearing>(args: { attacker: Bearing & { id: string }; target: T; hit: boolean }): T {
  const { attacker, target } = args
  const marked = (effect: { id: string; by: string }) => effect.id === STUDIED && effect.by === attacker.id
  let kept = target
  if (target.turnEffects?.some(marked)) {
    const turnEffects = target.turnEffects.filter((effect) => !marked(effect))
    const { turnEffects: _, ...rest } = target
    kept = (turnEffects.length ? { ...rest, turnEffects } : rest) as T
  }
  return !args.hit && hasFeature(attacker, STUDIED_ATTACKS) ? withTurnEffect(kept, STUDIED, attacker.id) : kept
}

const SURVIVOR = "champion-survivor"

/**
 * Heroic Rally as a turn starts: a Fighter who is Bloodied, at half their hit points or fewer, with at least 1 left,
 * regains 5 plus their Constitution modifier (the feature's typed `healing`). None for one who is not.
 */
export function heroicRally<T extends Roller & { id: string; hitPoints?: number; healthPercent?: number; dead?: true; fled?: true }>(
  character: T
): { character: T; told?: { name: string; text: string } } {
  if (!character.sheet || !hasFeature(character, SURVIVOR) || isDead(character) || hasFled(character)) return { character }
  const now = hitPointsOf(character)
  if (!now || now.current < 1 || now.current > now.maximum / 2) return { character }
  const healing = classFeatureById.get(SURVIVOR)?.healing
  const sheet = deriveSheet(character.sheet)
  const amount = (healing?.amount ?? 0) + (healing?.rollAdds ?? []).reduce((sum, add) => sum + (add === "class-level" ? (character.sheet?.level ?? 0) : sheet.abilityModifiers[add]), 0)
  const healed = withHealing(character as T & { type: string }, amount)
  const after = hitPointsOf(healed)
  return {
    character: healed,
    told: { name: "Heroic Rally", text: `${character.name ?? "The Fighter"} regains ${amount} hit points by Heroic Rally${after ? `, now ${after.current} of ${after.maximum}` : ""}.` },
  }
}

export const fighter: ClassRules = {
  class: "fighter",
  bonusActions: [
    {
      id: "fighter-second-wind",
      feature: "fighter-second-wind",
      // Tactical Shift: a move of up to half the Speed with Second Wind draws no Opportunity Attacks.
      disengages: (character, feet) => hasFeature(character, "fighter-tactical-shift") && feet <= Math.floor((speedOf(character) ?? 0) / 2),
      use: ({ characters, actor, action, roll }) => {
        const feature = classFeatureById.get(action.id)
        const level = actor.sheet?.level ?? 1
        const rolled = rollDamage([{ dice: feature?.healing?.dice ?? "1d10", type: "force" }], roll)
        const [part] = rolled.parts
        const amount = rolled.total + level
        const healed = withFeatureUsed(withHealing(actor, amount), action.id)
        const now = hitPointsOf(healed)
        return {
          characters: characters.map((character) => (character.id === healed.id ? healed : character)),
          use: {
            feature: action.id,
            name: action.name,
            harm: [{ target: actor.id, kind: "healing", dice: part.dice, sides: part.sides, bonus: level, amount }],
            fact: `${actor.name} uses Second Wind and regains ${amount} hit points${now ? `, now ${now.current} of ${now.maximum}` : ""}.`,
          },
        }
      },
    },
  ],
  choices: [
    {
      key: "surge",
      offer: (character) => (usesLeft(character, "fighter-action-surge") > 0 ? true : undefined),
      prompt: () =>
        `   - ACTION SURGE: "surge" is true when the player's words plainly push for one more action this turn, such as attacking again in a flurry, and the action is an attack. Leave it out otherwise.
`,
      field: () => z.boolean().optional().describe("True when the player's words use Action Surge for one more action this turn"),
      rides: "turn",
      actions: 1,
      // Its use is spent as the turn is taken: the attack the reading asked for already counts its action.
      apply: (characters, actorId) => {
        const actor = characters.find((character) => character.id === actorId)
        return {
          characters: characters.map((character) => (character.id === actorId ? withFeatureUsed(character, "fighter-action-surge") : character)),
          told: { name: "Action Surge", text: `${actor?.name ?? "The Fighter"} pushes past their limits with Action Surge: one more action this turn.` },
        }
      },
    },
    {
      key: "tactical",
      offer: (character) => (hasFeature(character, TACTICAL_MASTER) && character.sheet?.weaponMasteries?.length ? TACTICAL_MASTERIES : undefined),
      prompt: () =>
        `   - TACTICAL MASTER: with an attack made with a weapon whose mastery the hero has, "tactical" is "push" when the player's words drive the target back, "sap" when they try to weaken or spoil the target's next attack, or "slow" when they try to slow the target down. Leave it out otherwise.
`,
      field: (values) =>
        z
          .enum(values as [string, ...string[]])
          .optional()
          .describe("For an attack: the mastery Tactical Master puts in the weapon's own place"),
      rides: "attack",
    },
  ],
  checkModes: (character, check) =>
    check.kind === "skill" && check.skill === "athletics" && hasFeature(character, "champion-remarkable-athlete") ? [{ mode: "advantage", from: "Remarkable Athlete" }] : [],
  initiativeAdvantage: (character) => hasFeature(character, "champion-remarkable-athlete"),
  checks: [
    ({ character, check, result, roll }) => {
      const minded = tacticalMind(character, check, result, roll)
      return minded && { result: minded.result, ...(minded.spent ? { after: (spender) => withFeatureUsed(spender, "fighter-second-wind") } : {}) }
    },
  ],
  saves: [indomitable],
  mastery: tacticalMastery,
  turnEffects: [
    {
      id: STUDIED,
      span: 2,
      words: () => "Studied",
      against: (effect, attacker) => (attacker.id === effect.by ? [{ mode: "advantage", from: "Studied Attacks" }] : []),
    },
  ],
  attackSettled: studied,
  roundStart: heroicRally,
  // Defy Death. Its 18 is read from the text: the data does not type it.
  deathSave: (character) => (hasFeature(character, SURVIVOR) ? { modes: [{ mode: "advantage", from: "Defy Death" }], twentyFrom: 18 } : undefined),
}
