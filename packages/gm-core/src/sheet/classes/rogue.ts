import { classById } from "@d20/srd/classes"
import { z } from "zod"
import { isDown } from "../../utils/turn-actors"
import { parseDice } from "../attack"
import { checkBonus, combineModes, type Roller, resolveCheck } from "../check"
import type { BonusActionRule, ClassRules } from "../class-rules"
import { checkModesFrom, hasCondition, saveFailedBy, withCondition } from "../conditions"
import { deriveSheet } from "../derive"
import { hasFeature, usedThisTurn } from "../feature-rules"
import { canReact } from "../reactions"
import type { Sheet } from "../sheet"
import { sizeOf } from "../space"
import { checkAdds, saveBonusFor, saveModesFor } from "../spell-effects"
import { combatStatsOf } from "../stat-block"

/**
 * The Rogue's features in play.
 *
 * Sneak Attack: its dice, of the weapon's damage type, on a hit made with a Finesse or Ranged weapon and Advantage, or
 * with an ally beside the target and no Disadvantage, once a turn.
 * Cunning Action (level 2): the Dash, Disengage or Hide action as a Bonus Action.
 * Steady Aim (level 3): a Bonus Action for Advantage on the next attack roll this turn, for one who has not moved this
 * turn. Their Speed is then 0 for the rest of it.
 * Cunning Strike (level 5): an effect added to a Sneak Attack, which takes one of its dice. Trip is the one the engine
 * runs: a target no bigger than Large saves with Dexterity or falls Prone. Poison needs a Poisoner's Kit the sheet does
 * not carry, and Withdraw a move after the attack the turn does not have.
 * Uncanny Dodge (level 5): a Reaction to halve a hit's damage, for one who can see the attacker.
 */

/** A Cunning Strike effect a Rogue adds to their Sneak Attack. */
export const cunningStrikes = ["trip"] as const
export type CunningStrike = (typeof cunningStrikes)[number]

/** The Cunning Strike effects a hero can add now: Trip, from Rogue level 5. */
export const cunningStrikesOf = (character: Roller): CunningStrike[] => (hasFeature(character, "rogue-cunning-strike") ? [...cunningStrikes] : [])

/** The Difficulty Class of a Rogue's Cunning Strike save: 8, the Dexterity modifier and the Proficiency Bonus. */
export function cunningStrikeDc(sheet: Sheet): number {
  const derived = deriveSheet(sheet)
  return 8 + derived.abilityModifiers.dex + derived.proficiencyBonus
}

// The sizes a Trip can knock Prone.
const TRIPPED_SIZES: readonly string[] = ["Tiny", "Small", "Medium", "Large"]

/**
 * Whether Uncanny Dodge matters against a hit: the damage the target would take is a quarter of their hit point
 * maximum or more, or would drop them. A hero with 12 hit points of 12 minds 3 and not 2, and with 2 left minds 2.
 */
export function uncannyDodgeMatters(target: Roller & { hitPoints?: number; tempHitPoints?: number }, damage: number): boolean {
  const maximum = combatStatsOf(target)?.hitPointMaximum
  if (!maximum) return false
  const left = Math.min(maximum, target.hitPoints ?? maximum) + (target.tempHitPoints ?? 0)
  return damage * 4 >= maximum || damage >= left
}

/** Whether a hero may halve a hit's damage with Uncanny Dodge: a Rogue of level 5 who can react and can see the attacker. */
export function uncannyDodgeOffer(target: Parameters<typeof canReact>[0], attacker: Roller): boolean {
  return hasFeature(target, "rogue-uncanny-dodge") && canReact(target) && !hasCondition(target, "blinded") && !hasCondition(attacker, "invisible")
}

// Cunning Action's three, each the action it takes.
const cunning = (id: string, action: string): BonusActionRule => ({
  id,
  feature: "rogue-cunning-action",
  name: `Cunning Action: ${action}`,
  note: "Cunning Action is a Dash, Disengage or Hide taken as a Bonus Action, beside the action: a dash before a strike, slipping away after it, ducking out of sight after a shot.",
  use: ({ characters, actor }) => ({ characters, use: { feature: id, name: "Cunning Action", fact: `${actor.name} takes the ${action} action as a Bonus Action.` } }),
})

export const rogue: ClassRules = {
  class: "rogue",
  bonusActions: [
    { ...cunning("cunning-action-dash", "Dash"), dash: true },
    { ...cunning("cunning-action-disengage", "Disengage"), disengages: () => true },
    { ...cunning("cunning-action-hide", "Hide"), follow: "hide" },
    {
      id: "rogue-steady-aim",
      feature: "rogue-steady-aim",
      note: "rogue-steady-aim is for a character who holds still to aim before an attack this turn. It cannot be taken with a move.",
      still: true,
      attackModes: [{ mode: "advantage", from: "Steady Aim" }],
      use: ({ characters, actor, action }) => ({ characters, use: { feature: action.id, name: action.name, fact: `${actor.name} holds still and takes Steady Aim.` } }),
    },
  ],
  choices: [
    {
      key: "cunning",
      offer: (character) => {
        const offered = cunningStrikesOf(character)
        return offered.length ? offered : undefined
      },
      prompt: (values) =>
        `   - CUNNING STRIKE: with an attack that may land a Sneak Attack, "cunning" is ${(values as readonly string[]).map((id) => `"${id}"`).join(" or ")} when the player's words try to knock the target down. Leave it out otherwise.
`,
      field: (values) =>
        z
          .enum(values as [string, ...string[]])
          .optional()
          .describe("For an attack: the Cunning Strike effect added to a Sneak Attack"),
      rides: "attack",
    },
  ],
  reactions: [
    {
      id: "uncanny-dodge",
      name: "Uncanny Dodge",
      has: (character) => hasFeature(character, "rogue-uncanny-dodge"),
      // Once the damage is known: half of it, rounded down.
      onDamage: ({ target, attacker, taken, hit, ask }) => {
        if (!uncannyDodgeOffer(target, attacker)) return undefined
        const half = Math.floor(taken / 2)
        if (!ask(uncannyDodgeMatters(target, taken), `${hit} It deals ${taken} damage. Uncanny Dodge would halve it to ${half}.`)) return undefined
        return { taken: half, reaction: { by: target.id, id: "uncanny-dodge", name: "Uncanny Dodge", text: `${target.name} uses Uncanny Dodge and takes ${half} of ${taken}.` } }
      },
      damageWords: (target) => ` ${target} halves it with Uncanny Dodge.`,
    },
  ],
  hits: [
    {
      id: "sneak-attack",
      damage: ({ attacker, weapon, roll, allyBeside, turnOf, choices }) => {
        const sheet = attacker.sheet
        if (!sheet || !weapon) return undefined
        const sneaking = roll.mode === "advantage" || (allyBeside && roll.mode !== "disadvantage")
        const fits = weapon.attackType === "ranged" || (weapon.properties ?? []).some((property) => property === "finesse")
        const sneak =
          sneaking && fits && hasFeature(attacker, "rogue-sneak-attack") && !usedThisTurn(attacker, "sneak-attack", turnOf)
            ? classById.get(sheet.class)?.levels[sheet.level - 1]?.sneakAttack
            : undefined
        if (!sneak) return undefined
        // A Cunning Strike takes one die before the roll: 3d6 is rolled as 2d6.
        const { count, sides } = parseDice(sneak)
        const dice = choices?.cunning ? count - 1 : count
        return { name: "Sneak Attack", damage: dice > 0 ? { dice: `${dice}d${sides}`, type: weapon.damage.type } : { amount: 0, type: weapon.damage.type }, once: "sneak-attack" }
      },
    },
    {
      id: "cunning-strike",
      // A Cunning Strike's Trip falls after the damage: a target no bigger than Large saves with Dexterity or falls Prone.
      after: ({ attacker, target, added, choices, roll }) => {
        if (choices?.cunning !== "trip" || !added.includes("Sneak Attack") || !attacker.sheet || isDown(target)) return undefined
        const check = { kind: "save" as const, ability: "dex" as const }
        const mode = combineModes([...checkModesFrom(target, check), ...saveModesFor(target, check, ["prone"])].map((source) => source.mode))
        const save = resolveCheck({
          dice: mode === "normal" ? [roll(20)] : [roll(20), roll(20)],
          bonus: checkBonus(target, check) + saveBonusFor(target, check),
          dc: cunningStrikeDc(attacker.sheet),
          mode,
          fails: !!saveFailedBy(target, check),
          adds: checkAdds(target, check, roll),
        })
        const small = TRIPPED_SIZES.includes(sizeOf(target))
        const given = small && !save.success ? withCondition(target, { id: "prone" }) : undefined
        return {
          target: given?.given ? given.character : target,
          rider: { id: "cunning-strike", effect: "trip", save, took: !!given?.given },
          conditions: given?.given ? [{ target: target.id ?? "", condition: "prone" }] : [],
        }
      },
      words: (attacker, target, rider) => ` ${attacker}'s Cunning Strike tries to Trip ${target}: ${rider.took ? `${target} fails the Dexterity save and falls Prone.` : `${target} stays standing.`}`,
    },
  ],
  turnEffects: [{ id: "sneak-attack", span: 1 }],
}
