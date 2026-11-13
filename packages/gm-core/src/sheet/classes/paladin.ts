import type { ConditionId, DamageTypeId } from "@d20/srd"
import { classFeatureById } from "@d20/srd/class-features"
import { equipmentById } from "@d20/srd/equipment"
import type { Spell } from "@d20/srd/schema/spells"
import { spellById } from "@d20/srd/spells"
import { z } from "zod"
import { hasFled, isDead, isDown, isIncapacitated } from "../../utils/turn-actors"
import type { RequiredFeature } from "../../validations/roll-requirement-schema"
import { type Attack, damageTaken, defensesOf, parseDice, UNARMED_STRIKE } from "../attack"
import { ownBlockOf } from "../blocks"
import type { Roller } from "../check"
import { type ClassRules, type Featured, withTurnEffect } from "../class-rules"
import { CONDITION_SPANS } from "../condition-entry"
import { conditionName, hasCondition, withCondition, withoutCondition } from "../conditions"
import { afterHarm, withDamage, withHealing } from "../death"
import { deriveSheet } from "../derive"
import { hasFeature, usedThisTurn, usesLeft, withFeatureUsed } from "../feature-rules"
import { hitPointsOf } from "../hit-points"
import { legendaryResistanceWords, withLegendaryResistanceSpent } from "../legendary-resistance"
import { type AuraHolder, auraReach, auraReaches, rescueWords, withRescueSpent } from "../save-rules"
import { areEnemies } from "../sides"
import { feetBetween, placedOf, within } from "../space"
import { withConcentration, withSpellEffect } from "../spell-effects"
import { type Cast, castCost, rollSave, type SaveRoll, slotsLeft, spellcastingOf, withCastSpent } from "../spells"
import type { SpellEffect, TurnEffect } from "../turn-effect"

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
 * Charisma modifier, at least 1, to their saving throws while the Paladin is not Incapacitated (../save-rules): the
 * saves the engine rolls, a save from a monster's hit (../hit-riders) and a save the player rolls.
 * Aura of Devotion (Oath of Devotion, level 7) and Aura of Courage (level 10): in the aura, the Paladin and their allies
 * cannot be Charmed, or Frightened, and one who already is feels no effect of it while there (../conditions `immuneTo`).
 * Which conditions is the data's, typed on each feature as while in the Aura of Protection.
 * Abjure Foes (level 9): a use of Channel Divinity as the action. Up to the Charisma modifier's number of creatures,
 * at least one, within 60 feet make a Wisdom save against the Paladin's spell save DC, or are Frightened for a minute,
 * until they take damage. That such a one can only move, act or take a Bonus Action on its turns is told.
 * Radiant Strikes (level 11): 1d8 Radiant more on each hit with a Melee weapon or an Unarmed Strike.
 * Restoring Touch (level 14): Lay on Hands ends Blinded, Charmed, Deafened, Frightened, Paralyzed, Stunned and Poisoned
 * on the one touched, 5 points of the pool each, the worst first as far as the pool goes.
 * Smite of Protection (Oath of Devotion, level 15): a Divine Smite cast gives the Paladin and those of their side in
 * the aura Half Cover until the Paladin's next turn starts, against attack rolls (../attack-roll). Its +2 to a
 * Dexterity save is not added.
 * Holy Nimbus (Oath of Devotion, level 20): a Bonus Action, once a Long Rest or for a level 5 slot, kept as a long
 * effect for 10 minutes. Each enemy that starts its turn in the aura takes Radiant damage of the Charisma modifier and
 * the Proficiency Bonus. Its sunlight is told, and so is Holy Ward's Advantage on saves a Fiend or an Undead forces,
 * since a save does not know who forced it.
 * The SRD 5.2.1 Paladin list holds no smite above level 2, so the smites stop at Shining Smite.
 */

const LAY_ON_HANDS = "paladin-lay-on-hands"
const DIVINITY = "paladin-channel-divinity"
const SACRED_WEAPON = "oath-of-devotion-sacred-weapon"
const SMITE_MARK = "smite"
const AURA = "paladin-aura-of-protection"
const ABJURE_FOES = "paladin-abjure-foes"
const RADIANT_STRIKES = "paladin-radiant-strikes"
const RESTORING_TOUCH = "paladin-restoring-touch"
const SMITE_OF_PROTECTION = "oath-of-devotion-smite-of-protection"
const HOLY_NIMBUS = "oath-of-devotion-holy-nimbus"
// Smite of Protection's mark on the Paladin, until their next turn starts.
const PROTECTION = "smite-of-protection"

/** The smite spells the engine runs, each cast right after a hit with a Melee weapon or an Unarmed Strike. */
export const smiteSpells = ["divine-smite", "searing-smite", "shining-smite"] as const

// Lay on Hands: "You can also expend 5 Hit Points from the pool of healing power to remove the Poisoned condition".
const POISON_COST = 5

/** A creature's type from its stat block: "undead", "fiend". A hero, or an NPC with a rules sheet, has none the engine reads. */
export function creatureTypeOf(character: { type?: string; sheet?: unknown; statBlock?: string }): string | undefined {
  if (character.type !== "npc" || character.sheet) return undefined
  return ownBlockOf(character)?.type
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

// Charisma modifier, at least 1: Aura of Protection's bonus, Sacred Weapon's, and Abjure Foes' count of creatures.
const charisma = (character: Roller): number => (character.sheet ? Math.max(1, deriveSheet(character.sheet).abilityModifiers.cha) : 0)

/**
 * The conditions a Paladin's Aura of Protection makes those in it immune to, by the features they have that the data
 * types as while in it: Aura of Devotion's Charmed, Aura of Courage's Frightened.
 */
export function auraImmunities(bearer: Roller): ConditionId[] {
  if (!bearer.sheet) return []
  return deriveSheet(bearer.sheet).classFeatures.flatMap((id) => {
    const typed = classFeatureById.get(id)?.conditionImmunities
    return typed?.while === "in-aura-of-protection" ? typed.conditions : []
  })
}

// Restoring Touch: the conditions it ends, the worst first, and Poisoned, which Lay on Hands always could. 5 points each.
const RESTORED: readonly ConditionId[] = ["paralyzed", "stunned", "frightened", "charmed", "blinded", "poisoned", "deafened"]

/** Whether a Paladin's Holy Nimbus is on: kept with their lasting effects, by them, for 10 minutes. */
export const holyNimbusOn = (character: { id?: string; spellEffects?: readonly SpellEffect[] }): boolean =>
  !!character.spellEffects?.some((effect) => effect.spell === HOLY_NIMBUS && (!character.id || effect.by === character.id))

// A level 5 spell slot left, which buys back Holy Nimbus's use: "expending a level 5 spell slot".
const fifthSlot = (character: Payer): boolean => (slotsLeft(character)[4] ?? 0) > 0

// Whether one stands in a Paladin's Aura of Protection, friend or foe: within its reach while the Paladin is up and not Incapacitated.
function inAura(bearer: Roller & { id: string; position?: { x: number; y: number } }, other: Roller & { id: string; position?: { x: number; y: number } }): boolean {
  if (!hasFeature(bearer, AURA) || isDown(bearer) || isIncapacitated(bearer)) return false
  const reach = auraReach(bearer, AURA)
  const apart = feetBetween(bearer, other)
  return reach !== undefined && apart !== undefined && apart <= reach
}

type Abjurer = Featured & { position?: { x: number; y: number }; fled?: true; isComplete?: boolean; conditions?: Parameters<typeof withCondition>[0]["conditions"] }

/**
 * Abjure Foes: a use of Channel Divinity. Those named, up to the Charisma modifier's count and at least one, within 60
 * feet, or with none named the nearest enemies, each make a Wisdom save against the Paladin's spell save DC or are
 * Frightened of them for a minute, until they take damage. Told as a spell's cast is.
 *
 * Aria, level 9 with Charisma 15 (+2) and DC 14, abjures two Ghouls: a 10 with +0 is 10, and each is Frightened.
 */
export function abjureFoes<T extends Abjurer>(args: {
  characters: readonly T[]
  paladinId: string
  targets: readonly string[]
  d20: () => number
  roll: (sides: number) => number
}): Cast<T> & { problem?: string } {
  let characters = [...args.characters]
  const paladin = characters.find((character) => character.id === args.paladinId)
  const none = (problem: string): Cast<T> & { problem: string } => ({ characters, targets: [], saves: [], harm: [], conditions: [], facts: [], problem })
  if (!paladin?.sheet || !hasFeature(paladin, ABJURE_FOES)) return none(`${paladin?.name ?? "This character"} cannot use Abjure Foes.`)
  if (usesLeft(paladin, DIVINITY) < 1) return none(`${paladin.name} has no use of Channel Divinity left.`)
  const dc = spellcastingOf(paladin)?.saveDc ?? 8
  const find = (id: string) => characters.find((character) => character.id === id)
  const put = (after: T) => {
    characters = characters.map((character) => (character.id === after.id ? after : character))
  }
  const from = placedOf(paladin as Parameters<typeof placedOf>[0])
  const near = (other: T) => {
    const at = placedOf(other as Parameters<typeof placedOf>[0])
    return !from || !at || within(from, at, 60)
  }
  const can = (other: T | undefined): other is T => !!other && other.id !== paladin.id && !isDead(other) && !hasFled(other) && near(other)
  const named = args.targets.map(find).filter(can)
  const nearest = characters.filter((other) => can(other) && areEnemies(paladin, other) && !isDown(other)).sort((a, b) => (feetBetween(paladin, a) ?? 0) - (feetBetween(paladin, b) ?? 0))
  const chosen = [...new Set(named.length ? named : nearest)].slice(0, charisma(paladin))
  if (!chosen.length) return none(`No creature ${paladin.name} could abjure is within 60 feet.`)
  const saves: SaveRoll[] = []
  const conditions: Cast<T>["conditions"] = []
  const facts: string[] = []
  for (const target of chosen) {
    const now = find(target.id) as T
    const saved = rollSave({ target: now, ability: "wis", dc, d20: args.d20, roll: args.roll, characters, against: ["frightened"], stakes: { conditions: ["frightened"] }, spell: false })
    saves.push(saved)
    if (saved.legendary) {
      const spent = withLegendaryResistanceSpent(find(target.id) ?? target)
      put(spent)
      facts.push(legendaryResistanceWords(target.name, spent))
    }
    if (saved.rescued) {
      put(withRescueSpent(find(saved.rescued.by ?? target.id) ?? target, saved.rescued))
      facts.push(rescueWords(target.name, saved.rescued, saved))
    }
    const verdict = `${target.name} ${saved.success ? "SUCCEEDS on" : "FAILS"} the Wisdom saving throw against ${paladin.name}'s Abjure Foes (${saved.total} against DC ${dc})`
    if (saved.success) {
      facts.push(`${verdict} and is not abjured.`)
      continue
    }
    const held = find(target.id) as T
    const given = withCondition(held, { id: "frightened", source: paladin.id, span: "minute", feature: ABJURE_FOES }, { acted: !!held.isComplete, present: characters })
    if (!given.given) {
      facts.push(`${verdict}, and cannot be ${conditionName("frightened")}.`)
      continue
    }
    put(given.character)
    conditions.push({ target: target.id, condition: "frightened" })
    facts.push(
      `${verdict} and is Frightened of ${paladin.name} for a minute, or until it takes damage. While Frightened so, on each of its turns it can only move, take an action or take a Bonus Action, one of the three.`
    )
  }
  characters = characters.map((character) => (character.id === paladin.id ? withFeatureUsed(character, DIVINITY) : character))
  return { characters, targets: chosen.map((other) => other.id), saves, harm: [], conditions, facts }
}

export const paladin: ClassRules = {
  class: "paladin",
  bonusActions: [
    {
      id: LAY_ON_HANDS,
      feature: LAY_ON_HANDS,
      targeted: true,
      // With Restoring Touch, lay-on-hands-restore ends Poisoned in place of lay-on-hands-poison, and says so in its own note.
      note: (character) =>
        `${LAY_ON_HANDS} is Lay on Hands: a touch that restores the hit points a creature is missing, as far as the pool goes. It is the character's own when no "bonusTarget" is given.${hasFeature(character, RESTORING_TOUCH) ? "" : " lay-on-hands-poison spends 5 of the pool to end the Poisoned condition on the one touched."}`,
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
      // Restoring Touch's own option ends Poisoned too.
      offer: (character) => !hasFeature(character, RESTORING_TOUCH),
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
      id: "lay-on-hands-restore",
      feature: LAY_ON_HANDS,
      name: "Lay on Hands: Restoring Touch",
      targeted: true,
      offer: (character) => hasFeature(character, RESTORING_TOUCH),
      note: "lay-on-hands-restore spends 5 of the pool for each condition it ends on the one touched: Blinded, Charmed, Deafened, Frightened, Paralyzed, Stunned or Poisoned.",
      use: ({ characters, actor, action, target }) => {
        const other = touched(actor, characters, target)
        if (!other) return { characters }
        const affordable = Math.floor(usesLeft(actor, LAY_ON_HANDS) / POISON_COST)
        const ended = RESTORED.filter((id) => hasCondition(other, id) && other.conditions?.some((entry) => entry.id === id)).slice(0, affordable)
        if (!ended.length) return { characters }
        const self = other.id === actor.id
        const paying = withPointsSpent(actor, POISON_COST * ended.length)
        const cured = ended.reduce((now, id) => withoutCondition(now, id).character, self ? paying : other)
        const left = usesLeft(self ? cured : paying, LAY_ON_HANDS)
        return {
          characters: putBack(characters, self ? [cured] : [cured, paying]),
          use: {
            feature: action.id,
            name: action.name,
            target: other.id,
            fact: `${actor.name} lays hands on ${self ? "themselves" : other.name} and ends the ${ended.map(conditionName).join(", ")} condition${ended.length > 1 ? "s" : ""}. ${left} points are left in the pool.`,
          },
        }
      },
    },
    {
      id: "holy-nimbus",
      feature: HOLY_NIMBUS,
      buys: (character) => (fifthSlot(character as Payer) ? 5 : undefined),
      note: "holy-nimbus is Holy Nimbus: the character fills their Aura of Protection with holy power and sunlight for 10 minutes.",
      use: ({ characters, actor, action }) => {
        if (holyNimbusOn(actor)) return { characters }
        const paid = action.slot ? withCastSpent(actor, { kind: "slot", level: action.slot }) : withFeatureUsed(actor, HOLY_NIMBUS)
        const lit = withSpellEffect(paid as Featured & { spellEffects?: readonly SpellEffect[] }, { spell: HOLY_NIMBUS, by: actor.id, turns: SACRED_ROUNDS })
        const sheet = actor.sheet ? deriveSheet(actor.sheet) : undefined
        const burn = sheet ? sheet.abilityModifiers.cha + sheet.proficiencyBonus : 0
        return {
          characters: characters.map((character) => (character.id === actor.id ? lit : character)),
          use: {
            feature: action.id,
            name: action.name,
            fact: `${actor.name} imbues their Aura of Protection with holy power${action.slot ? ` with a level ${action.slot} spell slot` : ""}. For 10 minutes it is filled with Bright Light that is sunlight, each enemy that starts its turn in it takes ${burn} Radiant damage, and ${actor.name} has Advantage on saving throws a Fiend or an Undead forces.`,
          },
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
    {
      key: "abjure",
      check: "abjure-foes",
      offer: (character) => (hasFeature(character, ABJURE_FOES) && usesLeft(character, DIVINITY) > 0 ? true : undefined),
      prompt: () =>
        `   - ABJURE FOES: when the character presents their holy symbol or weapon to overwhelm foes with awe as the action, "check" is "abjure-foes" and "targets" are the creatures it is turned on. The game rolls their saves and spends a use of Channel Divinity. A spell is a "cast", not this.
`,
      field: () => z.boolean().optional().describe('For "abjure-foes": true'),
      // Used as the action: resolved with no throw of the hero's, as a spell that asks for none.
      act: (_value, { character, everyone, pick, named, also }) => {
        const targets = [...(pick.targets ?? []), ...(pick.target ? [pick.target] : [])].flatMap((asked) => everyone.find((other) => named(asked, other.name, other.id))?.id ?? [])
        const feature: RequiredFeature = {
          feature: { id: "abjure-foes", targets: [...new Set(targets)] },
          rollType: "Abjure Foes",
          difficulty: spellcastingOf(character)?.saveDc ?? 0,
          modifier: 0,
          mode: "normal",
        }
        console.log("[LLM] Roll requirement decision:", { character: character.name, requiresRoll: false, feature: feature.feature })
        return { roll: null, feature, ...also }
      },
      effects: ["abjure-foes"],
      resolve: ({ characters, actorId, feature, d20, roll }) => ({
        ...abjureFoes({ characters: characters as Abjurer[], paladinId: actorId, targets: feature.targets, d20, roll }),
        name: "Channel Divinity: Abjure Foes",
      }),
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
        // Smite of Protection: Half Cover in the aura until the Paladin's next turn starts, kept on the Paladin.
        if (picked.spell.id === "divine-smite" && hasFeature(attacker, SMITE_OF_PROTECTION))
          after = after.map((character) => (character.id === attackerId ? withTurnEffect(character as typeof character & { turnEffects?: readonly TurnEffect[] }, PROTECTION, attackerId) : character))
        const target = after.find((character) => character.id === targetId)
        if (picked.spell.id === "divine-smite" || !target || isDead(target)) return after
        if (picked.spell.duration.concentration) after = withConcentration(after, attackerId, picked.spell.id)
        const turns = (CONDITION_SPANS.minute ?? 10) + (target.isComplete ? 1 : 0)
        return after.map((character) => (character.id === targetId ? withSpellEffect(character, { spell: picked.spell.id, by: attackerId, turns, amount: paid.slot }) : character))
      },
    },
    {
      id: "radiant-strikes",
      // "the target takes an extra 1d8 Radiant damage", on every hit with a Melee weapon or an Unarmed Strike.
      damage: ({ attacker, attack }) => {
        const typed = classFeatureById.get(RADIANT_STRIKES)?.damage
        return typed?.dice && hasFeature(attacker, RADIANT_STRIKES) && meleeWeapon(attack) ? { name: "Radiant Strikes", damage: { dice: typed.dice, type: "radiant" } } : undefined
      },
    },
    {
      id: "sacred-weapon",
      // "Each time you hit with it, you cause it to deal its normal damage type or Radiant damage": the engine takes Radiant where it harms the target more.
      retype: ({ attacker, attack, target }) =>
        target && imbuable(attack) && sacredWeaponOn(attacker) && attack.damage[0] && share(target, "radiant") > share(target, attack.damage[0].type) ? "radiant" : undefined,
    },
  ],
  turnEffects: [
    { id: SMITE_MARK, span: 1 },
    { id: PROTECTION, span: 2, words: () => "Smite of Protection: Half Cover for their side in their aura" },
  ],
  // "a bonus to saving throws equal to your Charisma modifier (minimum bonus of +1)", and the immunities of Aura of
  // Devotion and Aura of Courage.
  auras: [{ feature: AURA, saveBonus: charisma, conditionImmunities: auraImmunities }],
  // Smite of Protection: Half Cover for one of the Paladin's side in the aura, while its mark holds.
  cover: (target, present) =>
    present.some((bearer) => bearer.turnEffects?.some((effect) => effect.id === PROTECTION && effect.by === bearer.id) && auraReaches(bearer as AuraHolder, AURA, target as AuraHolder))
      ? "half"
      : undefined,
  // Abjure Foes' Frightened ends when its bearer takes damage.
  endsOnDamage: (entry) => entry.feature === ABJURE_FOES,
  // Holy Nimbus: an enemy that starts its turn in the aura of one whose Nimbus is on takes Radiant damage of the
  // Charisma modifier and the Proficiency Bonus. The engine starts every turn of a round together, as the round turns.
  roundStart: (character, round) => {
    const bearer = round?.everyone.find((other) => holyNimbusOn(other) && hasFeature(other, HOLY_NIMBUS) && areEnemies(other, character) && inAura(other, character))
    if (!bearer?.sheet || isDead(character) || isDown(character)) return { character }
    const sheet = deriveSheet(bearer.sheet)
    const amount = sheet.abilityModifiers.cha + sheet.proficiencyBonus
    const taken = damageTaken({ parts: [{ type: "radiant", dice: [], bonus: amount, total: amount }], total: amount }, defensesOf(character))
    const struck = afterHarm(withDamage(character as typeof character & Parameters<typeof withDamage>[0], taken, { types: ["radiant"] }).character)
    const now = hitPointsOf(struck)
    const name = (character as { name?: string }).name ?? "The creature"
    return {
      character: struck,
      told: {
        name: "Holy Nimbus",
        text: `${name} starts its turn in ${bearer.name ?? "the Paladin"}'s Holy Nimbus and takes ${taken} radiant damage.${now ? ` ${now.current === 0 ? `${name} falls.` : `${name} has ${now.current} of ${now.maximum} hit points.`}` : ""}`,
      },
    }
  },
}
