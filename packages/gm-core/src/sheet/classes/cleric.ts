import { z } from "zod"
import type { RequiredFeature } from "../../validations/roll-requirement-schema"
import { channelDivinity, type DivinityEffect, divinityName, divinityPicksOf, isUndead } from "../channel-divinity"
import type { ClassRules, Featured } from "../class-rules"
import { spellcastingOf } from "../spells"

/**
 * The Cleric's features in play. Channel Divinity (level 2) is the turn's action, resolved with no throw of the hero's
 * as a spell that asks for none: Divine Spark, Turn Undead with Sear Undead, and a Life Domain Cleric's Preserve Life
 * (../channel-divinity).
 */
export const cleric: ClassRules = {
  class: "cleric",
  choices: [
    {
      key: "divinity",
      check: "channel-divinity",
      offer: (character) => {
        const picks = divinityPicksOf(character)
        return picks.length ? picks : undefined
      },
      prompt: (values) => {
        const divinity = values as readonly string[]
        return `   - CHANNEL DIVINITY: when the character channels their god's power as the action, "check" is "channel-divinity" and "divinity" is one of: ${[
          divinity.includes("divine-spark-heal") ? '"divine-spark-heal" (heals one other creature, "targets" is who)' : "",
          divinity.includes("divine-spark-harm") ? '"divine-spark-harm" (radiant or necrotic harm on one creature, "targets" is who, "damageType" is "necrotic" or "radiant")' : "",
          divinity.includes("turn-undead") ? '"turn-undead" (turns the Undead nearby, "targets" are the Undead chosen)' : "",
          divinity.includes("preserve-life") ? '"preserve-life" (heals the badly hurt nearby, "targets" are who)' : "",
        ]
          .filter(Boolean)
          .join(", ")}. The game rolls it and spends a use. A spell is a "cast", not this.
`
      },
      field: (values) =>
        z
          .enum(values as [string, ...string[]])
          .optional()
          .describe('For "channel-divinity": the Channel Divinity effect used'),
      // Used as the action: resolved with no throw of the hero's, as a spell that asks for none.
      act: (value, { character, everyone, pick, named, also }) => {
        const chosen = divinityPicksOf(character).find((id) => id === value)
        if (!chosen) return { roll: null, ...also }
        const effect: DivinityEffect = chosen.startsWith("divine-spark") ? "divine-spark" : (chosen as DivinityEffect)
        const given: string[] = [...(pick.targets ?? []), ...(pick.target ? [pick.target] : [])].flatMap((asked) => everyone.find((other) => named(asked, other.name, other.id))?.id ?? [])
        // Turn Undead takes the Undead named, or every Undead near when none is.
        const targets = effect === "turn-undead" ? given.filter((id) => isUndead(everyone.find((other) => other.id === id) ?? {})) : given
        const damageType = pick.damageType?.trim().toLowerCase()
        const feature: RequiredFeature = {
          feature: {
            id: effect,
            targets,
            ...(chosen === "divine-spark-heal" ? { heal: true as const } : {}),
            ...(chosen === "divine-spark-harm" && (damageType === "necrotic" || damageType === "radiant") ? { damageType } : {}),
          },
          rollType: chosen === "divine-spark-heal" || chosen === "divine-spark-harm" ? "Divine Spark" : effect === "turn-undead" ? "Turn Undead" : "Preserve Life",
          difficulty: spellcastingOf(character)?.saveDc ?? 0,
          modifier: 0,
          mode: "normal",
        }
        console.log("[LLM] Roll requirement decision:", { character: character.name, requiresRoll: false, feature: feature.feature })
        return { roll: null, feature, ...also }
      },
      effects: ["divine-spark", "turn-undead", "preserve-life"],
      resolve: ({ characters, actorId, feature, d20, roll, rules }) => {
        const effect = feature.id as DivinityEffect
        const used = channelDivinity({
          characters: characters as (Featured & { position?: { x: number; y: number } })[],
          clericId: actorId,
          effect,
          targets: feature.targets,
          heal: feature.heal,
          damageType: feature.damageType,
          d20,
          roll,
          rules,
        })
        return { ...used, name: `Channel Divinity: ${divinityName(effect)}` }
      },
    },
  ],
}
