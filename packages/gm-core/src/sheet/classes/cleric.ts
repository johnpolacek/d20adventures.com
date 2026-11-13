import type { DamageTypeId } from "@d20/srd"
import { classFeatureById } from "@d20/srd/class-features"
import type { Spell } from "@d20/srd/schema/spells"
import { spellById } from "@d20/srd/spells"
import { z } from "zod"
import { isDead } from "../../utils/turn-actors"
import type { RequiredFeature } from "../../validations/roll-requirement-schema"
import { defensesOf } from "../attack"
import { channelDivinity, type DivinityEffect, divinityName, divinityPicksOf, isUndead } from "../channel-divinity"
import type { Roller } from "../check"
import type { ClassRules, Featured } from "../class-rules"
import { withHealing } from "../death"
import { deriveSheet, keptChoiceOf } from "../derive"
import { hasFeature, usedThisTurn, usesLeft } from "../feature-rules"
import type { Harm } from "../harm"
import { hitPointsOf } from "../hit-points"
import { sameSide } from "../sides"
import { placedOf, within } from "../space"
import { classSpells, spellcastingOf } from "../spells"

/**
 * The Cleric's features in play, levels 1 to 20. Channel Divinity (level 2) is the turn's action, resolved with no throw
 * of the hero's as a spell that asks for none: Divine Spark, Turn Undead with Sear Undead, and a Life Domain Cleric's
 * Preserve Life (../channel-divinity). Its uses rise to 3 at level 6 and 4 at 18 by the class table.
 *
 * Blessed Strikes (level 7), the option kept on the sheet:
 * - Divine Strike: "Once on each of your turns when you hit a creature with an attack roll using a weapon", 1d8 more
 *   Necrotic or Radiant, 2d8 from level 14 (Improved Blessed Strikes). The engine takes Radiant, or Necrotic where that
 *   harms the target more.
 * - Potent Spellcasting: the Wisdom modifier added to the damage of a Cleric cantrip. The Cleric list's one damaging
 *   cantrip, Sacred Flame, is a save, so it is added where a save's damage is rolled. From level 14, when such a cantrip
 *   deals damage, Temporary Hit Points of twice the Wisdom modifier go by a plain rule to the most hurt of the Cleric
 *   and their side within 60 feet who has fewer.
 *
 * Divine Intervention (level 10): once a Long Rest, any Cleric spell of level 1 to 5 that takes no Reaction, cast as the
 * action with no slot. Each is offered beside the Cleric's own spells (../spells `spellsOf`). One they have prepared is
 * cast so only when no slot of its level or higher is left. A spell that takes a minute or more is still not cast in a
 * fight, and its Material components are the story's, as every spell's are.
 * Greater Divine Intervention (level 20): Wish, the same way. Its 2d4 are rolled as it is cast, and kept under the
 * feature's id in `featureUses`: Divine Intervention stays spent through that many Long Rests. Wish itself is told.
 *
 * Life Domain:
 * - Disciple of Life (level 3): a spell cast with a slot heals each it heals by 2 and the slot's level more.
 * - Blessed Healer (level 6): "Immediately after you cast a spell with a spell slot that restores Hit Points to one or
 *   more creatures other than yourself, you regain Hit Points equal to 2 plus the spell slot's level."
 * - Supreme Healing (level 17): the dice a spell or Channel Divinity rolls to restore hit points count their highest.
 */

const BLESSED_STRIKES = "cleric-blessed-strikes"
const IMPROVED_STRIKES = "cleric-improved-blessed-strikes"
const DIVINE_STRIKE = "divine-strike"
const INTERVENTION = "cleric-divine-intervention"
const GREATER_INTERVENTION = "cleric-greater-divine-intervention"
const DISCIPLE_OF_LIFE = "life-domain-disciple-of-life"
const BLESSED_HEALER = "life-domain-blessed-healer"
const SUPREME_HEALING = "life-domain-supreme-healing"
// Improved Potent Spellcasting's reach, typed on the option.
const VITALITY_RANGE = 60

// The Blessed Strikes option the hero keeps, or none.
const blessedStrike = (character: Roller): string | undefined => (character.sheet && hasFeature(character, BLESSED_STRIKES) ? keptChoiceOf(character.sheet, BLESSED_STRIKES) : undefined)

const wisdomOf = (character: Roller): number => (character.sheet ? deriveSheet(character.sheet).abilityModifiers.wis : 0)

// A Cleric cantrip: one of level 0 on the Cleric list.
const clericCantrip = (spell: Spell): boolean => spell.level === 0 && spell.classes.includes("cleric")

// Divine Strike's dice at a Cleric level, from the option's data: 1d8, 2d8 from 14.
function divineStrikeDice(level: number): string {
  const option = classFeatureById.get(BLESSED_STRIKES)?.options?.find((entry) => entry.id === DIVINE_STRIKE) as { dice?: string; diceByLevel?: { level: number; dice: string }[] } | undefined
  return option?.diceByLevel?.filter((step) => step.level <= level).at(-1)?.dice ?? option?.dice ?? "1d8"
}

// How much of a damage type reaches a creature through its defenses.
function share(target: Roller, type: DamageTypeId): number {
  const defenses = defensesOf(target)
  if (defenses.immunities?.includes(type)) return 0
  return (defenses.resistances?.includes(type) ? 0.5 : 1) * (defenses.vulnerabilities?.includes(type) ? 2 : 1)
}

// What Divine Intervention may cast: every Cleric spell of level 1 to 5 that takes no Reaction, and Wish at level 20.
function interventionSpells(character: Roller): string[] {
  const spells = classSpells("cleric", 5).filter((id) => {
    const spell = spellById.get(id)
    return !!spell && spell.level >= 1 && spell.castingTime.unit !== "reaction"
  })
  return hasFeature(character, GREATER_INTERVENTION) ? [...spells, "wish"] : spells
}

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
  hits: [
    {
      id: DIVINE_STRIKE,
      // Once on each of the Cleric's own turns, on a hit with a weapon.
      damage: ({ attacker, weapon, turnOf, target }) => {
        if (!attacker.sheet || !weapon || !attacker.id || turnOf !== attacker.id || blessedStrike(attacker) !== DIVINE_STRIKE) return undefined
        if (usedThisTurn(attacker, DIVINE_STRIKE, turnOf)) return undefined
        const type: DamageTypeId = target && share(target, "necrotic") > share(target, "radiant") ? "necrotic" : "radiant"
        return { name: "Divine Strike", damage: { dice: divineStrikeDice(attacker.sheet.level), type }, once: DIVINE_STRIKE }
      },
    },
  ],
  turnEffects: [{ id: DIVINE_STRIKE, span: 1 }],
  // Potent Spellcasting: the Wisdom modifier on a Cleric cantrip's damage, cast by the Cleric's own magic.
  spellDamage: ({ caster, spell, item }) => (!item && clericCantrip(spell) && blessedStrike(caster) === "potent-spellcasting" ? wisdomOf(caster) : 0),
  spellHealing: ({ caster, spell, slot }) => {
    const disciple = slot !== undefined && spell.level >= 1 && hasFeature(caster, DISCIPLE_OF_LIFE) ? 2 + slot : 0
    const supreme = hasFeature(caster, SUPREME_HEALING)
    return disciple || supreme ? { bonus: disciple, ...(supreme ? { most: true as const } : {}) } : undefined
  },
  spellCast: ({ caster, spell, slot, item, harm, characters, roll }) => {
    let everyone = [...characters]
    const facts: string[] = []
    const moved: Harm[] = []
    const put = (after: (typeof everyone)[number]) => {
      everyone = everyone.map((character) => (character.id === after.id ? after : character))
    }
    // Blessed Healer: a slot spent, and hit points restored to another.
    if (slot !== undefined && hasFeature(caster, BLESSED_HEALER) && !isDead(caster) && harm.some((entry) => entry.kind === "healing" && entry.target !== caster.id && entry.amount > 0)) {
      const amount = 2 + slot
      const healed = withHealing(everyone.find((character) => character.id === caster.id) ?? caster, amount)
      put(healed)
      moved.push({ target: caster.id, kind: "healing", dice: [], bonus: amount, amount })
      const hitPoints = hitPointsOf(healed)
      facts.push(`${caster.name}'s Blessed Healer restores ${amount} hit points to them${hitPoints ? `: ${hitPoints.current} of ${hitPoints.maximum}` : ""}.`)
    }
    // Improved Potent Spellcasting: a Cleric cantrip that dealt damage gives twice the Wisdom modifier in Temporary Hit
    // Points to the Cleric or one within 60 feet, the most hurt of their side who has fewer.
    const vitality = 2 * wisdomOf(caster)
    if (
      vitality > 0 &&
      !item &&
      clericCantrip(spell) &&
      blessedStrike(caster) === "potent-spellcasting" &&
      hasFeature(caster, IMPROVED_STRIKES) &&
      harm.some((entry) => entry.kind === "damage" && entry.amount > 0)
    ) {
      const from = placedOf(caster)
      const fraction = (character: (typeof everyone)[number]) => {
        const hitPoints = hitPointsOf(character)
        return hitPoints && hitPoints.maximum > 0 ? hitPoints.current / hitPoints.maximum : 1
      }
      const taker = everyone
        .filter((other) => {
          const at = placedOf(other)
          const up = !isDead(other) && (hitPointsOf(other)?.current ?? 1) > 0
          return up && sameSide(other, caster) && (other.tempHitPoints ?? 0) < vitality && (!from || !at || within(from, at, VITALITY_RANGE))
        })
        .sort((a, b) => fraction(a) - fraction(b))[0]
      if (taker) {
        put({ ...taker, tempHitPoints: vitality })
        facts.push(`${caster.name}'s Potent Spellcasting gives ${taker.id === caster.id ? "them" : taker.name} ${vitality} Temporary Hit Points.`)
      }
    }
    // Greater Divine Intervention: Wish, cast with no slot, keeps Divine Intervention spent through 2d4 Long Rests.
    if (spell.id === "wish" && !item && slot === undefined && hasFeature(caster, GREATER_INTERVENTION)) {
      const dice = [roll(4), roll(4)]
      const rests = dice[0] + dice[1]
      const now = (everyone.find((character) => character.id === caster.id) ?? caster) as typeof caster & { featureUses?: Record<string, number> }
      put({ ...now, featureUses: { ...now.featureUses, [GREATER_INTERVENTION]: rests } })
      facts.push(`${caster.name} cannot call on Divine Intervention again until they finish ${rests} Long Rests (2d4: ${dice.join(" and ")}).`)
    }
    return facts.length ? { characters: everyone, facts, harm: moved } : undefined
  },
  // Divine Intervention, while its use is left: the spells it may cast, counted under its own id.
  spellsGiven: (character) =>
    hasFeature(character, INTERVENTION) && usesLeft(character, INTERVENTION) > 0 ? [{ feature: INTERVENTION, name: "Divine Intervention", spells: interventionSpells(character) }] : [],
  // Greater Divine Intervention's Long Rests still owed: each rest takes one off, and Divine Intervention stays spent while any is left.
  longRest: ({ before, after }) => {
    const owed = before.featureUses?.[GREATER_INTERVENTION] ?? 0
    if (owed < 1) return { character: after, facts: [] }
    const name = after.name ?? "The Cleric"
    if (owed === 1) return { character: after, facts: [`${name} can call on Divine Intervention again.`] }
    const left = owed - 1
    return {
      character: { ...after, featureUses: { ...after.featureUses, [INTERVENTION]: 1, [GREATER_INTERVENTION]: left } },
      facts: [`${name} must finish ${left} more Long Rest${left === 1 ? "" : "s"} before calling on Divine Intervention again.`],
    }
  },
}
