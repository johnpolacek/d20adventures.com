import { type DamageTypeId, damageTypeIds } from "@d20/srd"
import { classFeatureById } from "@d20/srd/class-features"
import type { Spell } from "@d20/srd/schema/spells"
import { spellById } from "@d20/srd/spells"
import { z } from "zod"
import { hasFled, isDead, isDown } from "../../utils/turn-actors"
import type { RequiredFeature } from "../../validations/roll-requirement-schema"
import { damageTaken, defensesOf, parseDice, rollDamage, type Target } from "../attack"
import { attackable, type InScene, nearestEnemy } from "../attack-roll"
import type { CheckResult, Roller } from "../check"
import { type ClassRules, type Featured, type HitRider, withTurnEffect } from "../class-rules"
import { CONDITION_SPANS } from "../condition-entry"
import { conditionName, exhaustionOf, hasCondition, type ModeSource, withCondition, withoutCondition } from "../conditions"
import { afterHarm, withDamage } from "../death"
import { deriveSheet } from "../derive"
import { featureChoice, hasFeature, usedThisTurn, usesLeft, withFeatureUsed, withUsedThisTurn } from "../feature-rules"
import { hitPointsOf } from "../hit-points"
import { legendaryResistanceWords, withLegendaryResistanceSpent } from "../legendary-resistance"
import { typesTaken } from "../monster-traits"
import { canReact } from "../reactions"
import { rescueWords, withRescueSpent } from "../save-rules"
import { placedOf, sizeOf, within } from "../space"
import { withConcentration, withSpellEffect } from "../spell-effects"
import { type Castee, castCost, rollSave, slotsLeft, spellcastingFor, withCastSpent } from "../spells"
import type { SpellEffect, TurnEffect } from "../turn-effect"

/**
 * The Ranger's features in play, levels 1 to 20, with the Hunter. Extra Attack, the Ability Score Improvements,
 * Expertise, the Epic Boon, Roving's 10 feet of Speed and Feral Senses' Blindsight are read from the data by
 * ../feature-rules and ../derive, and so are Roving's Climb and Swim Speeds, from its text. Hunter's Mark is a spell
 * (../spell-effects): Favored Enemy keeps it prepared, with its free casts by the class table.
 *
 * Hunter's Lore (Hunter, level 3): a Hunter knows the defenses of the one their Hunter's Mark is on.
 * Hunter's Prey (Hunter, level 3), as the hero chose it. Colossus Slayer: 1d8 more on a weapon's hit on a creature
 * missing any of its hit points, once a turn. Horde Breaker: once a turn, another attack with the same weapon at a
 * creature within 5 feet of the one just attacked, within the weapon's reach or range, that the hero has not attacked
 * this turn.
 * Ensnaring Strike (the spell): cast as a Bonus Action right after a hit with a weapon, picked with the attack as a
 * smite is (./paladin), and paid for only when the hit lands. The one hit makes a Strength save, with Advantage when it
 * is Large or larger, or is Restrained while the Ranger keeps Concentration. Its burn as each of its turns starts is
 * the spell's own rule (../spell-mechanics/ensnaring-strike).
 * Defensive Tactics (Hunter, level 7), as the hero chose it. Escape the Horde: Opportunity Attacks against the hero
 * have Disadvantage. Multiattack Defense: one whose attack roll hits the hero has Disadvantage on its other attack
 * rolls against them for the rest of its turn.
 * Tireless (level 10): as the action, Temporary Hit Points of 1d8 plus the Wisdom modifier, at least 1, a number of
 * times a Long Rest. A Short Rest takes one level of Exhaustion off.
 * Superior Hunter's Prey (Hunter, level 11): once a turn, when a hit deals the hero's Hunter's Mark damage, the mark's
 * die is dealt to another creature within 30 feet of the first. A hit with an attack roll reaches it. Damage to the
 * marked one by a spell's save does not, since that path knows no class.
 * Relentless Hunter (level 13): damage does not break Concentration on Hunter's Mark (../spell-effects).
 * Nature's Veil (level 14): a Bonus Action, Invisible until the end of the hero's next turn. It is no hiding: an
 * attack or a cast does not end it (../actions).
 * Superior Hunter's Defense (Hunter, level 15): a Reaction to a hit's damage, of one type, for Resistance to that type
 * until the round ends: the engine keeps no end of a turn but the round's.
 * Precise Hunter (level 17): Advantage on attack rolls against the one the hero's Hunter's Mark is on.
 * Foe Slayer (level 20): Hunter's Mark's die is a d10 (../attack `landBlow`).
 */

const MARK = "hunters-mark"
const ENSNARE = "ensnaring-strike"
const DEFENSIVE_TACTICS = "hunter-defensive-tactics"
const TIRELESS = "ranger-tireless"
const SUPERIOR_PREY = "hunter-superior-hunters-prey"
const RELENTLESS = "ranger-relentless-hunter"
const NATURES_VEIL = "ranger-natures-veil"
const SUPERIOR_DEFENSE = "hunter-superior-hunters-defense"
const PRECISE = "ranger-precise-hunter"
const FOE_SLAYER = "ranger-foe-slayer"
// Multiattack Defense's mark on the hero, by the one who hit them.
const MULTIATTACK = "multiattack-defense"
// Superior Hunter's Defense's Resistance, kept on the hero by the type: "superior-hunters-defense:fire".
const RESISTED = "superior-hunters-defense"
// "Foe Slayer: The damage die of your Hunter's Mark is a d10 rather than a d6." The data leaves it untyped.
const FOE_SLAYER_DIE = 10
// Superior Hunter's Prey: "a different creature that you can see within 30 feet of the first creature".
const SECOND_PREY_FEET = 30

/** Whether a creature bears the Hunter's Mark of this hero. */
export const markedBy = (character: { spellEffects?: readonly SpellEffect[] }, hunterId: string | undefined): boolean =>
  !!hunterId && !!character.spellEffects?.some((effect) => effect.spell === MARK && effect.by === hunterId)

// Hunter's Mark's dice on a hit, with Foe Slayer's die: "1d6", or "1d10" at level 20.
const markDice = (hunter: Roller): string => {
  const dice = spellById.get(MARK)?.damage?.[0]?.dice ?? "1d6"
  return hasFeature(hunter, FOE_SLAYER) ? `${parseDice(dice).count}d${FOE_SLAYER_DIE}` : dice
}

// An Ensnaring Strike picked with the attack: the spell, and the slot level when the player asked for a higher one.
function ensnareOf(value: string | undefined): { spell: Spell; level?: number } | undefined {
  const match = /^ensnaring-strike(?:-level-(\d))?$/.exec(value ?? "")
  const spell = match ? spellById.get(ENSNARE) : undefined
  return spell ? { spell, ...(match?.[1] ? { level: Number(match[1]) } : {}) } : undefined
}

type Payer = Roller & { spellSlots?: readonly number[]; featureUses?: Record<string, number> }

// What an Ensnaring Strike picked costs the hero now, and the slot level it is cast at. None when it cannot be paid for.
function ensnareCost(attacker: Payer, picked: { spell: Spell; level?: number }) {
  const paid = castCost(attacker, picked.spell.id, false, picked.level)
  if ("problem" in paid) return undefined
  return { cost: paid.cost, slot: paid.cost.kind === "slot" ? paid.cost.level : picked.spell.level }
}

/** The Ensnaring Strikes a hero can pick with an attack now: the lowest slot, and each higher slot they have left. */
export function ensnaresOf(character: Payer): string[] {
  const spell = spellById.get(ENSNARE)
  if (!character.sheet || !spell || "problem" in castCost(character, ENSNARE)) return []
  return [ENSNARE, ...slotsLeft(character).flatMap((count, index) => (index + 1 > spell.level && count > 0 ? [`${ENSNARE}-level-${index + 1}`] : []))]
}

// Whether a creature is Restrained by this caster's Ensnaring Strike.
const ensnaredBy = (character: { conditions?: Target["conditions"] }, casterId: string | undefined): boolean =>
  !!character.conditions?.some((entry) => entry.id === "restrained" && entry.spell === ENSNARE && entry.source === casterId)

// A creature of Large size or more, which has Advantage on Ensnaring Strike's save.
const large = (character: Roller): boolean => ["Large", "Huge", "Gargantuan"].includes(sizeOf(character))

/** Tireless's Temporary Hit Points: 1d8 plus the Wisdom modifier, at least 1. A Ranger of Wisdom +4 who rolls 3 gains 7. */
export function tirelessPoints(hero: Roller, die: number): number {
  const wisdom = hero.sheet ? deriveSheet(hero.sheet).abilityModifiers.wis : 0
  return Math.max(classFeatureById.get(TIRELESS)?.healing?.minimum ?? 1, die + wisdom)
}

// Whether a hit's damage minds Superior Hunter's Defense: a quarter of the hero's hit point maximum or more, or enough
// to drop them, as Uncanny Dodge minds it (./rogue).
function defenseMatters(hero: Featured & { tempHitPoints?: number }, taken: number): boolean {
  const hitPoints = hitPointsOf(hero)
  if (!hitPoints) return false
  return taken * 4 >= hitPoints.maximum || taken >= hitPoints.current + (hero.tempHitPoints ?? 0)
}

// A creature's standing after harm, in words.
function standingAfter(character: Target & { name?: string }): string {
  const name = character.name ?? "It"
  if (isDead(character)) return ` ${name} dies.`
  const hitPoints = hitPointsOf(character)
  if (!hitPoints) return ""
  return hitPoints.current === 0 ? ` ${name} drops to 0 hit points.` : ` ${name} has ${hitPoints.current} of ${hitPoints.maximum} hit points left.`
}

export const ranger: ClassRules = {
  class: "ranger",
  sees: (character, other) => {
    if (!hasFeature(character, "hunter-hunters-lore") || !markedBy(other as { spellEffects?: readonly SpellEffect[] }, character.id)) return undefined
    const { immunities = [], resistances = [], vulnerabilities = [] } = defensesOf({ ...other, type: other.type ?? "npc" })
    const words = [
      immunities.length ? `immune to ${immunities.join(", ")}` : "",
      resistances.length ? `resists ${resistances.join(", ")}` : "",
      vulnerabilities.length ? `vulnerable to ${vulnerabilities.join(", ")}` : "",
    ].filter(Boolean)
    return words.length ? words.join(", ") : "no immunities, resistances or vulnerabilities"
  },
  bonusActions: [
    {
      id: NATURES_VEIL,
      feature: NATURES_VEIL,
      note: `${NATURES_VEIL} is Nature's Veil: the character calls on the spirits of nature to turn Invisible until the end of their next turn, beside the action, when the player's words call for it.`,
      use: ({ characters, actor, action }) => {
        if (usesLeft(actor, NATURES_VEIL) < 1) return { characters }
        // "until the end of your next turn": through this turn and the next, counted from a turn already under way.
        const given = withCondition(withFeatureUsed(actor, NATURES_VEIL), { id: "invisible", source: actor.id, span: "turn", feature: NATURES_VEIL }, { acted: true, present: characters })
        if (!given.given) return { characters }
        return {
          characters: characters.map((character) => (character.id === actor.id ? given.character : character)),
          use: { feature: action.id, name: action.name, fact: `${actor.name} calls on the spirits of nature and is Invisible until the end of their next turn.` },
        }
      },
    },
  ],
  choices: [
    {
      key: "ensnare",
      bonusAction: true,
      offer: (character) => {
        const offered = ensnaresOf(character)
        return offered.length ? offered : undefined
      },
      prompt: (values) =>
        `   - ENSNARE: with an attack with a weapon, "ensnare" is one of ${(values as readonly string[]).map((id) => `"${id}"`).join(", ")} when the player's words call grasping vines onto the one they hit, or name Ensnaring Strike. It is cast only if the attack hits, takes the Bonus Action, so leave "bonus" out with it, and ends Concentration on any other spell. One ending "-level-2" is cast with a level 2 spell slot, only when the player asks for a stronger one. Leave it out otherwise.
`,
      field: (values) =>
        z
          .enum(values as [string, ...string[]])
          .optional()
          .describe("For an attack: Ensnaring Strike, cast if it hits"),
      rides: "attack",
    },
    {
      key: "tireless",
      check: "tireless",
      offer: (character) => (hasFeature(character, TIRELESS) && usesLeft(character, TIRELESS) > 0 ? true : undefined),
      prompt: () =>
        `   - TIRELESS: when the character calls on primal forces to steel themselves as the action, "check" is "tireless". The game rolls the Temporary Hit Points and spends a use. A spell is a "cast", not this.
`,
      field: () => z.boolean().optional().describe('For "tireless": true'),
      // Used as the action: resolved with no throw of the hero's, as a spell that asks for none.
      act: (_value, { character, also }) => {
        const feature: RequiredFeature = { feature: { id: "tireless", targets: [character.id] }, rollType: "Tireless", difficulty: 0, modifier: 0, mode: "normal" }
        console.log("[LLM] Roll requirement decision:", { character: character.name, requiresRoll: false, feature: feature.feature })
        return { roll: null, feature, ...also }
      },
      effects: ["tireless"],
      resolve: ({ characters, actorId, roll }) => {
        const hero = characters.find((character) => character.id === actorId) as (Featured & { tempHitPoints?: number }) | undefined
        const none = (problem: string) => ({ characters, targets: [], saves: [], harm: [], conditions: [], facts: [problem], problem, name: "Tireless" })
        if (!hero || !hasFeature(hero, TIRELESS) || usesLeft(hero, TIRELESS) < 1) return none(`${hero?.name ?? "The character"} has no use of Tireless left.`)
        const die = roll(8)
        const gained = tirelessPoints(hero, die)
        // Temporary Hit Points do not add up: the hero keeps the more.
        const held = hero.tempHitPoints ?? 0
        const after = { ...withFeatureUsed(hero, TIRELESS), tempHitPoints: Math.max(held, gained) }
        const kept = held >= gained ? ` They keep the ${held} they already had.` : ""
        return {
          characters: characters.map((character) => (character.id === actorId ? after : character)),
          targets: [actorId],
          saves: [],
          harm: [],
          conditions: [],
          facts: [`${hero.name} calls on primal forces with Tireless: 1d8 rolls ${die}, for ${gained} Temporary Hit Points.${kept}`],
          name: "Tireless",
        }
      },
    },
  ],
  hits: [
    {
      id: "colossus-slayer",
      damage: ({ attacker, weapon, hurt, turnOf }) =>
        weapon && hurt && featureChoice(attacker, "hunter-hunters-prey") === "colossus-slayer" && !usedThisTurn(attacker, "colossus-slayer", turnOf)
          ? { name: "Colossus Slayer", damage: { dice: "1d8", type: weapon.damage.type }, once: "colossus-slayer" }
          : undefined,
    },
    {
      id: ENSNARE,
      // Picked with a weapon's attack, cast on its first hit: the spell deals nothing on the hit itself.
      damage: ({ attacker, weapon, choices, turnOf }) => {
        const picked = ensnareOf(choices?.ensnare)
        if (!picked || !weapon || usedThisTurn(attacker, ENSNARE, turnOf) || !ensnareCost(attacker as Payer, picked)) return undefined
        return { name: picked.spell.name, damage: { amount: 0, type: weapon.damage.type }, once: ENSNARE }
      },
      // "As you hit the target, grasping vines appear on it, and it makes a Strength saving throw. A Large or larger
      // creature has Advantage on this save. On a failed save, the target has the Restrained condition until the spell ends."
      after: ({ attacker, target, added, choices, roll }) => {
        const picked = ensnareOf(choices?.ensnare)
        if (!picked || !added.includes(picked.spell.name) || isDead(target) || isDown(target)) return undefined
        const dc = spellcastingFor(attacker as Payer, ENSNARE)?.saveDc ?? 10
        const also: ModeSource[] = large(target) ? [{ mode: "advantage", from: "Large or larger" }] : []
        const thrown = rollSave({
          target: target as unknown as Castee,
          ability: "str",
          dc,
          d20: () => roll(20),
          roll,
          characters: [target as unknown as Castee],
          also,
          against: ["restrained"],
          stakes: { conditions: ["restrained"] },
        })
        let now: typeof target = target
        const told: string[] = []
        if (thrown.legendary) {
          now = withLegendaryResistanceSpent(now)
          told.push(legendaryResistanceWords((target as { name?: string }).name ?? "The target", now))
        }
        if (thrown.rescued) {
          now = withRescueSpent(now as typeof now & { featureUses?: Record<string, number> }, thrown.rescued)
          told.push(rescueWords((target as { name?: string }).name ?? "The target", thrown.rescued, thrown))
        }
        const save: CheckResult = { dice: thrown.dice, natural: thrown.natural, bonus: thrown.bonus, total: thrown.total, dc: thrown.dc, success: thrown.success, mode: thrown.mode }
        const given = thrown.success
          ? undefined
          : withCondition(now, { id: "restrained", source: attacker.id, span: "lasting", spell: ENSNARE }, { acted: !!(now as { isComplete?: boolean }).isComplete })
        const effect = thrown.success ? "saved" : given?.given ? "restrained" : "immune"
        const rider: HitRider = { id: ENSNARE, effect: [effect, ...told].join("|"), save, took: !!given?.given }
        return { target: given?.given ? given.character : now, rider, conditions: given?.given ? [{ target: target.id ?? "", condition: "restrained" }] : [] }
      },
      words: (attacker, target, rider) => {
        const [effect, ...told] = rider.effect.split("|")
        const against = rider.save ? ` (${rider.save.total} against DC ${rider.save.dc})` : ""
        const before = told.length ? ` ${told.join(" ")}` : ""
        if (effect === "saved") return `${before} ${target} SUCCEEDS on the Strength saving throw against ${attacker}'s Ensnaring Strike${against}, and the vines shrivel away.`
        if (effect === "immune") return `${before} ${target} FAILS the Strength saving throw against ${attacker}'s Ensnaring Strike${against}, but cannot be ${conditionName("restrained")}.`
        return `${before} ${target} FAILS the Strength saving throw against ${attacker}'s Ensnaring Strike${against} and is Restrained by grasping vines while ${attacker} keeps Concentration, taking Piercing damage as each of its turns starts. It, or a creature within its reach, can take an action to make a Strength (Athletics) check against DC ${rider.save?.dc}: on a success the spell ends.`
      },
      // The spell is cast: its slot is spent, and on a failed save it holds the one hit with the caster's Concentration.
      landed: ({ characters, attackerId, targetId, added, choices }) => {
        const picked = ensnareOf(choices?.ensnare)
        const attacker = characters.find((character) => character.id === attackerId)
        if (!picked || !attacker || !added.includes(picked.spell.name)) return characters
        const paid = ensnareCost(attacker, picked)
        if (!paid) return characters
        let after = characters.map((character) => (character.id === attackerId ? withCastSpent(character, paid.cost) : character))
        const target = after.find((character) => character.id === targetId)
        // "On a successful save, the vines shrivel away, and the spell ends."
        if (!target || !ensnaredBy(target as { conditions?: Target["conditions"] }, attackerId)) return after
        after = withConcentration(after, attackerId, ENSNARE)
        const turns = (CONDITION_SPANS.minute ?? 10) + (target.isComplete ? 1 : 0)
        return after.map((character) => (character.id === targetId ? withSpellEffect(character, { spell: ENSNARE, by: attackerId, turns, amount: paid.slot }) : character))
      },
    },
    {
      id: MULTIATTACK,
      // The hero's own Multiattack Defense, when an attack roll hits them: the one who hit is marked on them.
      after: ({ attacker, target }) => {
        if (!attacker.id || featureChoice(target, DEFENSIVE_TACTICS) !== "multiattack-defense" || isDead(target)) return undefined
        if (target.turnEffects?.some((effect) => effect.id === MULTIATTACK && effect.by === attacker.id)) return undefined
        return { target: withTurnEffect(target, MULTIATTACK, attacker.id), rider: { id: MULTIATTACK, effect: MULTIATTACK, took: true }, conditions: [] }
      },
      words: (attacker, target) => ` By ${target}'s Multiattack Defense, ${attacker} has Disadvantage on its other attack rolls against ${target} this turn.`,
    },
    {
      id: SUPERIOR_PREY,
      // "Once per turn when you deal damage to a creature marked by your Hunter's Mark, you can also deal that spell's
      // extra damage to a different creature that you can see within 30 feet of the first creature." The engine takes
      // the enemy nearest the first that the hero can see, and rolls the mark's dice for it.
      spills: ({ characters, attackerId, targetId, added, roll, turnOf, rules }) => {
        const mark = spellById.get(MARK)
        const hunter = characters.find((character) => character.id === attackerId)
        const first = characters.find((character) => character.id === targetId)
        if (!mark || !hunter || !first || !hasFeature(hunter, SUPERIOR_PREY) || !added.includes(mark.name) || usedThisTurn(hunter, SUPERIOR_PREY, turnOf)) return undefined
        if (hasCondition(hunter, "blinded")) return undefined
        const at = placedOf(first)
        const near = characters.filter((other) => {
          const there = placedOf(other)
          return (
            other.id !== first.id &&
            attackable(hunter as unknown as InScene, other as unknown as InScene) &&
            !hasCondition(other, "invisible") &&
            !hasFled(other) &&
            (!at || (!!there && within(there, at, SECOND_PREY_FEET)))
          )
        })
        const second = at ? nearestEnemy(first as unknown as InScene, near as unknown as InScene[]) : near[0]
        const struck = second && characters.find((character) => character.id === second.id)
        if (!struck) return undefined
        const type = (mark.damage?.[0]?.types[0] ?? "force") as DamageTypeId
        const rolled = rollDamage([{ dice: markDice(hunter), type }], roll)
        const defenses = defensesOf(struck)
        const amount = damageTaken(rolled, defenses)
        const hurt = afterHarm(withDamage(struck, amount, { rules, types: typesTaken(rolled, defenses) }).character)
        const marked = withUsedThisTurn(hunter, SUPERIOR_PREY, turnOf)
        return {
          characters: characters.map((character) => (character.id === hurt.id ? hurt : character.id === marked.id ? marked : character)),
          told: {
            by: attackerId,
            id: SUPERIOR_PREY,
            name: "Superior Hunter's Prey",
            text: `${hunter.name}'s ${mark.name} strikes ${hurt.name} too, by Superior Hunter's Prey, for ${amount} ${type} damage.${standingAfter(hurt)}`,
          },
        }
      },
    },
  ],
  reactions: [
    {
      id: RESISTED,
      name: "Superior Hunter's Defense",
      has: (character) => hasFeature(character, SUPERIOR_DEFENSE),
      // "When you take damage, you can take a Reaction to give yourself Resistance to that damage and any other damage
      // of the same type until the end of the current turn." A hit of one damage type: its damage halved, rounded down.
      onDamage: ({ target, attacker, taken, hit, ask, types }) => {
        const [type] = types
        if (!hasFeature(target, SUPERIOR_DEFENSE) || !canReact(target) || types.length !== 1 || !type || defensesOf(target).resistances?.includes(type)) return undefined
        const half = Math.floor(taken / 2)
        if (!ask(defenseMatters(target, taken), `${hit} It deals ${taken} ${type} damage. Superior Hunter's Defense would give Resistance to ${type} damage this turn, halving it to ${half}.`))
          return undefined
        return {
          taken: half,
          reaction: {
            by: target.id,
            id: RESISTED,
            name: "Superior Hunter's Defense",
            text: `${target.name} uses Superior Hunter's Defense: Resistance to ${type} damage this turn. They take ${half} of ${taken}.`,
          },
          answer: ({ characters }) => ({
            characters: characters.map((character) =>
              character.id === target.id ? withTurnEffect(character as Featured & { turnEffects?: readonly TurnEffect[] }, `${RESISTED}:${type}`, attacker.id) : character
            ),
          }),
        }
      },
      damageWords: (target) => ` ${target} resists it with Superior Hunter's Defense.`,
    },
  ],
  resistances: (character) => (character.turnEffects ?? []).flatMap((effect) => (effect.id.startsWith(`${RESISTED}:`) ? [effect.id.slice(RESISTED.length + 1) as DamageTypeId] : [])),
  turnEffects: [
    { id: "colossus-slayer", span: 1 },
    { id: ENSNARE, span: 1 },
    { id: SUPERIOR_PREY, span: 1 },
    // On the hero, by the one who hit them: Disadvantage on that one's attack rolls at them while its turn lasts.
    {
      id: MULTIATTACK,
      span: 1,
      against: (effect, attacker) => (attacker.id === effect.by ? [{ mode: "disadvantage", from: "Multiattack Defense" }] : []),
    },
    ...damageTypeIds.map((type) => ({ id: `${RESISTED}:${type}`, span: 1 as const, words: () => `Superior Hunter's Defense: Resistance to ${type}` })),
  ],
  // Escape the Horde on an Opportunity Attack at the hero, and Precise Hunter on the one the hero marked.
  attackModes: ({ attacker, target, opportunity }) => [
    ...(opportunity && featureChoice(target, DEFENSIVE_TACTICS) === "escape-the-horde" ? [{ mode: "disadvantage" as const, from: "Escape the Horde" }] : []),
    ...(hasFeature(attacker, PRECISE) && markedBy(target, attacker.id) ? [{ mode: "advantage" as const, from: "Precise Hunter" }] : []),
  ],
  keepsConcentration: (character, spellId) => spellId === MARK && hasFeature(character, RELENTLESS),
  markDie: (character, spellId) => (spellId === MARK && hasFeature(character, FOE_SLAYER) ? FOE_SLAYER_DIE : undefined),
  // Tireless: "Whenever you finish a Short Rest, your Exhaustion level, if any, decreases by 1."
  shortRest: (character) => {
    if (!hasFeature(character, TIRELESS) || !exhaustionOf(character)) return { character, facts: [] }
    const rested = withoutCondition(character, "exhaustion").character
    const left = exhaustionOf(rested)
    return { character: rested, facts: [`Tireless: ${character.name ?? "The Ranger"}'s Exhaustion ${left ? `falls to level ${left}` : "is gone"}.`] }
  },
  follows: [
    {
      key: "horde",
      attack: true,
      offer: (character) => character.sheet?.featureChoices?.["hunter-hunters-prey"] === "horde-breaker" && hasFeature(character, "hunter-hunters-prey"),
      // A creature beside the one just attacked, not yet attacked this turn.
      next: ({ character, made, attack, struck, present, ask, rest }) => {
        if (!attack || !("attack" in made)) return undefined
        const original = present.find((other) => other.id === made.attack.target)
        const at = original && placedOf(original)
        const beside = present.filter((other) => {
          const there = placedOf(other)
          return attackable(character, other) && !struck.includes(other.id) && (!at || (!!there && within(there, at, 5))) && ask(attack, other, {}) !== undefined
        })
        const choice = at ? nearestEnemy(character, beside) : undefined
        return choice && ask(attack, choice, rest({ struck: [...struck, choice.id] }))
      },
    },
  ],
}
