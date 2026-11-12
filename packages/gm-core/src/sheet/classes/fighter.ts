import { classFeatureById } from "@d20/srd/class-features"
import { z } from "zod"
import { parseDice, rollDamage } from "../attack"
import type { Check, CheckResult, Roller } from "../check"
import type { ClassRules } from "../class-rules"
import { withHealing } from "../death"
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
 * Extra Attack and Improved Critical are read from the data by ../feature-rules.
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
}
