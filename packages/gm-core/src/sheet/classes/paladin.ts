import type { DamageTypeId } from "@d20/srd"
import { equipmentById } from "@d20/srd/equipment"
import { monsterById } from "@d20/srd/monsters"
import type { Spell } from "@d20/srd/schema/spells"
import { spellById } from "@d20/srd/spells"
import { z } from "zod"
import { isDead } from "../../utils/turn-actors"
import { type Attack, defensesOf, parseDice, UNARMED_STRIKE } from "../attack"
import type { Roller } from "../check"
import type { ClassRules, Featured } from "../class-rules"
import { CONDITION_SPANS } from "../condition-entry"
import { hasCondition, withoutCondition } from "../conditions"
import { withHealing } from "../death"
import { deriveSheet } from "../derive"
import { hasFeature, usedThisTurn, usesLeft, withFeatureUsed } from "../feature-rules"
import { hitPointsOf } from "../hit-points"
import { placedOf, within } from "../space"
import { withConcentration, withSpellEffect } from "../spell-effects"
import { castCost, slotsLeft, withCastSpent } from "../spells"
import { DEFAULT_STAT_BLOCK } from "../stat-block"
import type { SpellEffect } from "../turn-effect"

/**
 * The Paladin's features in play. Extra Attack (level 5) is read from the data by ../feature-rules, and the slots and
 * prepared spells are the sheet's: a Paladin casts through the same path as any caster (../spells).
 *
 * Lay on Hands: a Bonus Action that touches a creature, the Paladin too, and restores hit points from a pool of five
 * points a Paladin level. The engine restores what the creature is missing, as far as the pool goes: the pick carries
 * no number, and the engine does the arithmetic. Spending 5 points instead ends the Poisoned condition.
 * Paladin's Smite (level 2): Divine Smite always prepared, and one cast a Long Rest with no slot.
 * The smite spells (S6): Divine Smite, Searing Smite and Shining Smite, the three on the SRD 5.2.1 Paladin list of
 * levels 1 to 3. Each is a Bonus Action taken right after a hit with a Melee weapon or an Unarmed Strike. The read
 * picks it with the attack, and it is cast only on the action's first hit: then its slot, or the free cast, and the
 * turn's Bonus Action are spent, and its dice are added to the hit's, doubled on a Critical Hit as the others are.
 * Channel Divinity (level 3): Divine Sense, a Bonus Action that names the Celestials, Fiends and Undead within 60 feet.
 * Sacred Weapon (Oath of Devotion, level 3): with the Attack action, a use of Channel Divinity imbues the Paladin's
 * Melee weapon for 10 minutes: the Charisma modifier, at least 1, is added to its attack rolls, and its hits deal
 * Radiant damage where that harms the target more than its own type.
 * Aura of Protection (level 6): the Paladin and those of their side within 10 feet, 30 from level 18, add the
 * Charisma modifier, at least 1, to their saving throws while the Paladin is not Incapacitated (../save-rules).
 */

const LAY_ON_HANDS = "paladin-lay-on-hands"
const DIVINITY = "paladin-channel-divinity"
const SACRED_WEAPON = "oath-of-devotion-sacred-weapon"
const SMITE_MARK = "smite"

/** The smite spells the engine runs, each cast right after a hit with a Melee weapon or an Unarmed Strike. */
export const smiteSpells = ["divine-smite", "searing-smite", "shining-smite"] as const

// Lay on Hands: "You can also expend 5 Hit Points from the pool of healing power to remove the Poisoned condition".
const POISON_COST = 5

/** A creature's type from its stat block: "undead", "fiend". A hero, or an NPC with a rules sheet, has none the engine reads. */
export function creatureTypeOf(character: { type?: string; sheet?: unknown; statBlock?: string }): string | undefined {
  if (character.type !== "npc" || character.sheet) return undefined
  return monsterById.get(character.statBlock ?? DEFAULT_STAT_BLOCK)?.type
}

// A smite picked with the attack: the spell, and the slot level when the player asked for a higher one ("-level-2").
function smiteOf(value: string | undefined): { spell: Spell; level?: number } | undefined {
  const match = /^([a-z-]+?)(?:-level-(\d))?$/.exec(value ?? "")
  const spell = match && smiteSpells.some((id) => id === match[1]) ? spellById.get(match[1]) : undefined
  return spell ? { spell, ...(match?.[2] ? { level: Number(match[2]) } : {}) } : undefined
}

/**
 * The smites a hero can pick with an attack now: each smite spell they can pay for, cast with the free cast or the
 * lowest slot, and the same with each higher slot they have left: "divine-smite-level-2".
 */
export function smitesOf(character: Roller & { spellSlots?: readonly number[]; featureUses?: Record<string, number> }): string[] {
  if (!character.sheet) return []
  const left = slotsLeft(character)
  return smiteSpells.flatMap((id) => {
    const spell = spellById.get(id)
    if (!spell || "problem" in castCost(character, id)) return []
    return [id, ...left.flatMap((count, index) => (index + 1 > spell.level && count > 0 ? [`${id}-level-${index + 1}`] : []))]
  })
}

/**
 * A smite's damage on a hit, cast with a slot of `slot`: the hit's dice and those of each slot level above the spell's,
 * with Divine Smite's 1d8 more on a Fiend or an Undead. Divine Smite at level 1 is 2d8 Radiant, 3d8 on an Undead, and
 * 3d8 at level 2. Searing Smite is 1d6 Fire, Shining Smite 2d6 Radiant.
 */
export function smiteDamage(spell: Spell, slot: number, target: { type?: string; sheet?: unknown; statBlock?: string }): { dice: string; type: DamageTypeId } {
  const above = Math.max(0, slot - spell.level)
  const kind = creatureTypeOf(target)
  let count = 0
  let sides = 0
  for (const part of spell.damage ?? []) {
    if (part.trigger !== "hit" || part.timing || !part.dice) continue
    // "The damage increases by 1d8 if the target is a Fiend or an Undead."
    if (part.appliesWhen && !(/Fiend or an Undead/.test(part.appliesWhen) && (kind === "fiend" || kind === "undead"))) continue
    const dice = parseDice(part.dice)
    count += dice.count + (part.perSlot ? parseDice(part.perSlot).count * above : 0)
    sides = dice.sides
  }
  return { dice: `${count}d${sides}`, type: (spell.damage?.[0]?.types[0] ?? "radiant") as DamageTypeId }
}

type Payer = Roller & { spellSlots?: readonly number[]; featureUses?: Record<string, number> }

// What a smite picked costs the hero now, and the slot level it is cast at. None when it cannot be paid for.
function smiteCost(attacker: Payer, picked: { spell: Spell; level?: number }) {
  const paid = castCost(attacker, picked.spell.id, false, picked.level)
  if ("problem" in paid) return undefined
  return { cost: paid.cost, slot: paid.cost.kind === "slot" ? paid.cost.level : picked.spell.level }
}

// Whether an attack is made with a Melee weapon, as Sacred Weapon asks: an Unarmed Strike is no weapon.
const imbuable = (attack: Attack): boolean => {
  const weapon = equipmentById.get(attack.id)
  return weapon?.kind === "weapon" && weapon.attackType === "melee"
}
// Whether an attack is made with a Melee weapon or an Unarmed Strike, as a smite asks.
const meleeWeapon = (attack: Attack): boolean => attack.id === UNARMED_STRIKE || imbuable(attack)

/** Whether a hero's Sacred Weapon is on their weapon. It is kept with their lasting effects, by them, for 10 minutes. */
export const sacredWeaponOn = (character: { id?: string; spellEffects?: readonly SpellEffect[] }): boolean =>
  !!character.spellEffects?.some((effect) => effect.spell === "sacred-weapon" && (!character.id || effect.by === character.id))

// Sacred Weapon's bonus to attack rolls: the Charisma modifier, "minimum bonus of +1".
const sacredBonus = (character: Roller): number => (character.sheet ? Math.max(1, deriveSheet(character.sheet).abilityModifiers.cha) : 0)

// 10 minutes, counted in rounds: 100. The engine keeps no time between encounters, so it ends with this one.
const SACRED_ROUNDS = 100

// How much of a damage type a target takes, by its defenses: none, half, all or double.
function share(target: Roller, type: DamageTypeId): number {
  const defenses = defensesOf(target)
  if (defenses.immunities?.includes(type)) return 0
  return (defenses.resistances?.includes(type) ? 0.5 : 1) * (defenses.vulnerabilities?.includes(type) ? 2 : 1)
}

// One touched by Lay on Hands: within 5 feet of the Paladin, where both stand on a floor.
function touched(actor: Featured, characters: readonly Featured[], target: string | undefined): Featured | undefined {
  const other = characters.find((character) => character.id === (target ?? actor.id))
  if (!other || isDead(other)) return undefined
  const from = placedOf(actor as Parameters<typeof placedOf>[0])
  const at = placedOf(other as Parameters<typeof placedOf>[0])
  return !from || !at || other.id === actor.id || within(from, at, 5) ? other : undefined
}

// The Paladin with points of the pool spent: each point counts as a use of the feature.
const withPointsSpent = <T extends Featured>(character: T, points: number): T => ({
  ...character,
  featureUses: { ...character.featureUses, [LAY_ON_HANDS]: (character.featureUses?.[LAY_ON_HANDS] ?? 0) + points },
})

// The touched and the Paladin, each as they now stand, put back among everyone. One may be both.
const putBack = (characters: Featured[], changed: readonly Featured[]): Featured[] => characters.map((character) => changed.find((other) => other.id === character.id) ?? character)

export const paladin: ClassRules = {
  class: "paladin",
  bonusActions: [
    {
      id: LAY_ON_HANDS,
      feature: LAY_ON_HANDS,
      targeted: true,
      note: `${LAY_ON_HANDS} is Lay on Hands: a touch that restores the hit points a creature is missing, as far as the pool goes. It is the character's own when no "bonusTarget" is given. lay-on-hands-poison spends 5 of the pool to end the Poisoned condition on the one touched.`,
      use: ({ characters, actor, action, target }) => {
        const other = touched(actor, characters, target)
        const hitPoints = other && hitPointsOf(other)
        const amount = hitPoints ? Math.min(usesLeft(actor, LAY_ON_HANDS), hitPoints.maximum - hitPoints.current) : 0
        if (!other || !hitPoints || amount < 1) return { characters }
        const healed = withHealing(other.id === actor.id ? withPointsSpent(actor, amount) : other, amount)
        const now = hitPointsOf(healed)
        const left = usesLeft(other.id === actor.id ? healed : withPointsSpent(actor, amount), LAY_ON_HANDS)
        return {
          characters: putBack(characters, other.id === actor.id ? [healed] : [healed, withPointsSpent(actor, amount)]),
          use: {
            feature: action.id,
            name: action.name,
            target: other.id,
            harm: [{ target: other.id, kind: "healing", dice: [], bonus: amount, amount }],
            fact: `${actor.name} lays hands on ${other.id === actor.id ? "themselves" : other.name} and restores ${amount} hit points${now ? `, now ${now.current} of ${now.maximum}` : ""}. ${left} points are left in the pool.`,
          },
        }
      },
    },
    {
      id: "lay-on-hands-poison",
      feature: LAY_ON_HANDS,
      name: "Lay on Hands: End Poisoned",
      targeted: true,
      use: ({ characters, actor, action, target }) => {
        const other = touched(actor, characters, target)
        if (!other || !hasCondition(other, "poisoned") || usesLeft(actor, LAY_ON_HANDS) < POISON_COST) return { characters }
        const cured = withoutCondition(other.id === actor.id ? withPointsSpent(actor, POISON_COST) : other, "poisoned").character
        return {
          characters: putBack(characters, other.id === actor.id ? [cured] : [cured, withPointsSpent(actor, POISON_COST)]),
          use: { feature: action.id, name: action.name, target: other.id, fact: `${actor.name} lays hands on ${other.id === actor.id ? "themselves" : other.name} and ends the Poisoned condition.` },
        }
      },
    },
    {
      id: "divine-sense",
      feature: DIVINITY,
      name: "Channel Divinity: Divine Sense",
      spends: true,
      note: "divine-sense is Divine Sense, a use of Channel Divinity: the character opens their awareness to the Celestials, Fiends and Undead near them.",
      // Run in part: the use is spent and the engine names who it senses now. What it tells for the next 10 minutes, and
      // the consecrated or desecrated places it finds, are the game master's.
      use: ({ characters, actor, action }) => {
        if (usesLeft(actor, DIVINITY) < 1) return { characters }
        const from = placedOf(actor as Parameters<typeof placedOf>[0])
        const sensed = characters.flatMap((other) => {
          const kind = creatureTypeOf(other)
          const at = placedOf(other as Parameters<typeof placedOf>[0])
          if (other.id === actor.id || isDead(other) || !kind || !["celestial", "fiend", "undead"].includes(kind) || (from && at && !within(from, at, 60))) return []
          return [`${other.name} (${kind.charAt(0).toUpperCase()}${kind.slice(1)})`]
        })
        return {
          characters: characters.map((character) => (character.id === actor.id ? withFeatureUsed(character, DIVINITY) : character)),
          use: {
            feature: action.id,
            name: action.name,
            fact: `${actor.name} uses Divine Sense. ${sensed.length ? `They know where each Celestial, Fiend and Undead within 60 feet is: ${sensed.join(", ")}.` : "No Celestial, Fiend or Undead is within 60 feet."} For 10 minutes they sense any that come within 60 feet, and any consecrated or desecrated place there.`,
          },
        }
      },
    },
  ],
  choices: [
    {
      key: "smite",
      bonusAction: true,
      offer: (character) => {
        const offered = smitesOf(character)
        return offered.length ? offered : undefined
      },
      prompt: (values) =>
        `   - SMITE: with an attack with a melee weapon or an unarmed strike, "smite" is one of ${(values as readonly string[]).map((id) => `"${id}"`).join(", ")} when the player's words call holy power down on the blow, or name the smite. It is cast only if the attack hits, and takes the Bonus Action, so leave "bonus" out with it. One ending "-level-2" is cast with a level 2 spell slot, only when the player asks for a stronger smite. Leave it out otherwise.
`,
      field: (values) =>
        z
          .enum(values as [string, ...string[]])
          .optional()
          .describe("For an attack: the smite spell cast if it hits"),
      rides: "attack",
    },
    {
      key: "sacred",
      offer: (character) => (hasFeature(character, SACRED_WEAPON) && usesLeft(character, DIVINITY) > 0 && !sacredWeaponOn(character) ? true : undefined),
      prompt: () =>
        `   - SACRED WEAPON: "sacred" is true when the player's words, with an attack, call on their oath to make their melee weapon shine with holy light. It spends a use of Channel Divinity. Leave it out otherwise.
`,
      field: () => z.boolean().optional().describe("True when the player's words imbue their melee weapon with Sacred Weapon"),
      rides: "turn",
      attackBonus: (character, attack) => (imbuable(attack) ? sacredBonus(character) : 0),
      apply: (characters, actorId) => {
        const actor = characters.find((character) => character.id === actorId)
        if (!actor || !hasFeature(actor, SACRED_WEAPON) || usesLeft(actor, DIVINITY) < 1) return { characters }
        const imbued = withSpellEffect(withFeatureUsed(actor, DIVINITY) as Featured & { spellEffects?: readonly SpellEffect[] }, { spell: "sacred-weapon", by: actorId, turns: SACRED_ROUNDS })
        return {
          characters: characters.map((character) => (character.id === actorId ? imbued : character)),
          told: {
            name: "Sacred Weapon",
            text: `${actor.name} imbues their weapon with holy light: for 10 minutes they add ${sacredBonus(actor)} to its attack rolls, and it may deal Radiant damage. It sheds Bright Light 20 feet around.`,
          },
        }
      },
    },
  ],
  // Sacred Weapon on: the Charisma modifier added to attack rolls with a Melee weapon.
  attack: (character, attack) => (imbuable(attack) && hasFeature(character, SACRED_WEAPON) && sacredWeaponOn(character) ? { ...attack, bonus: attack.bonus + sacredBonus(character) } : attack),
  hits: [
    {
      id: "smite",
      damage: ({ attacker, attack, choices, turnOf, target }) => {
        const picked = smiteOf(choices?.smite)
        if (!picked || !meleeWeapon(attack) || usedThisTurn(attacker, SMITE_MARK, turnOf) || !target) return undefined
        const paid = smiteCost(attacker as Payer, picked)
        return paid ? { name: picked.spell.name, damage: smiteDamage(picked.spell, paid.slot, target), once: SMITE_MARK } : undefined
      },
      // A Searing Smite's burn, and a Shining Smite's light, on a target the hit left standing.
      after: ({ target, added, choices }) => {
        const picked = smiteOf(choices?.smite)
        if (!picked || picked.spell.id === "divine-smite" || !added.includes(picked.spell.name) || isDead(target)) return undefined
        return { target, rider: { id: "smite", effect: picked.spell.id, took: true }, conditions: [] }
      },
      words: (attacker, target, rider) =>
        rider.effect === "searing-smite"
          ? ` ${target} is set ablaze by ${attacker}'s Searing Smite, and burns at the start of each of its turns until it succeeds on a Constitution saving throw.`
          : ` ${target} sheds Bright Light from ${attacker}'s Shining Smite: attack rolls against it have Advantage while ${attacker} keeps Concentration.`,
      // The smite is cast: its slot or free cast is spent, Shining Smite begins Concentration, and the lasting smites stay on the target.
      landed: ({ characters, attackerId, targetId, added, choices }) => {
        const picked = smiteOf(choices?.smite)
        const attacker = characters.find((character) => character.id === attackerId)
        if (!picked || !attacker || !added.includes(picked.spell.name)) return characters
        const paid = smiteCost(attacker, picked)
        if (!paid) return characters
        let after = characters.map((character) => (character.id === attackerId ? withCastSpent(character, paid.cost) : character))
        const target = after.find((character) => character.id === targetId)
        if (picked.spell.id === "divine-smite" || !target || isDead(target)) return after
        if (picked.spell.duration.concentration) after = withConcentration(after, attackerId, picked.spell.id)
        const turns = (CONDITION_SPANS.minute ?? 10) + (target.isComplete ? 1 : 0)
        return after.map((character) => (character.id === targetId ? withSpellEffect(character, { spell: picked.spell.id, by: attackerId, turns, amount: paid.slot }) : character))
      },
    },
    {
      id: "sacred-weapon",
      // "Each time you hit with it, you cause it to deal its normal damage type or Radiant damage": the engine takes Radiant where it harms the target more.
      retype: ({ attacker, attack, target }) =>
        target && imbuable(attack) && sacredWeaponOn(attacker) && attack.damage[0] && share(target, "radiant") > share(target, attack.damage[0].type) ? "radiant" : undefined,
    },
  ],
  turnEffects: [{ id: SMITE_MARK, span: 1 }],
  // "a bonus to saving throws equal to your Charisma modifier (minimum bonus of +1)"
  auras: [{ feature: "paladin-aura-of-protection", saveBonus: (bearer) => (bearer.sheet ? Math.max(1, deriveSheet(bearer.sheet).abilityModifiers.cha) : 0) }],
}
