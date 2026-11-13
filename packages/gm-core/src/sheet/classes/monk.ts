import { type ConditionId, type DamageTypeId, damageTypeIds } from "@d20/srd"
import { classFeatureById } from "@d20/srd/class-features"
import { classById } from "@d20/srd/classes"
import { equipmentById } from "@d20/srd/equipment"
import { z } from "zod"
import { hasFled, isDead, isDown, isIncapacitated } from "../../utils/turn-actors"
import type { RequiredFeature } from "../../validations/roll-requirement-schema"
import { takeAction } from "../actions"
import { type Attack, attacksOf, damageTaken, defensesOf, parseDice, rollDamage, type Target, UNARMED_STRIKE } from "../attack"
import { attackable, type InScene, nearestEnemy } from "../attack-roll"
import { type Check, type Roller, resolveCheck } from "../check"
import { type BonusActionRule, type ClassRules, type DamageAnswer, type Featured, type FollowRule, type HitRider, type SaveRule, withTurnEffect } from "../class-rules"
import { withCondition, withoutCondition } from "../conditions"
import { afterHarm, withDamage, withHealing } from "../death"
import { deriveSheet } from "../derive"
import { hasFeature, usedThisTurn, usesLeft, withFeatureUsed } from "../feature-rules"
import type { Harm } from "../harm"
import { hitPointsOf } from "../hit-points"
import { withLegendaryResistanceSpent } from "../legendary-resistance"
import { canReact } from "../reactions"
import { failureCosts, saveCheck, withRescueSpent, withSaveAnswered } from "../save-rules"
import type { Sheet } from "../sheet"
import { areEnemies } from "../sides"
import { placedOf, within } from "../space"
import { type Cast, type Castee, rollSave, type SaveRoll } from "../spells"
import type { SpellEffect, TurnEffect } from "../turn-effect"

/**
 * The Monk's features in play, levels 1 to 20. Unarmored Defense and Unarmored Movement are the sheet's (../derive), and
 * Extra Attack, the Ability Score Improvements, Disciplined Survivor's save proficiencies and Body and Mind's raise are
 * read from the data by ../feature-rules and ../derive.
 *
 * Martial Arts (level 1), while the Monk wears no armor and holds no Shield: an Unarmed Strike or a Monk weapon (a
 * Simple Melee weapon, or a Martial Melee weapon with the Light property) rolls the Martial Arts die in place of its
 * own when that is better, and uses Dexterity in place of Strength when that is higher. The engine holds no hands, so
 * the weapon attacked with is taken to be the one wielded. A Bonus Unarmed Strike follows the turn's attack. The
 * engine has no Grapple or Shove, so their save DC is not read.
 * Monk's Focus (level 2): Focus Points are the feature's uses, back on a Short or Long Rest (../rest). Flurry of Blows
 * spends one on two Unarmed Strikes after the turn's attack. Patient Defense is a Disengage, or with a point a Disengage
 * and a Dodge. Step of the Wind is a Dash, or with a point a Dash and a Disengage. The engine has no jumping, so the
 * doubled jump is told.
 * Uncanny Metabolism (level 2): the engine uses it as Initiative is rolled at an encounter's start, once a Long Rest,
 * the first time a Focus Point is spent: every point comes back, and the Monk regains the Martial Arts die plus the
 * Monk level in hit points.
 * Deflect Attacks (level 3): a Reaction to a hit with Bludgeoning, Piercing or Slashing damage, or any type from Deflect
 * Energy (level 13), that cuts it by 1d10 plus the Dexterity modifier and the Monk level. When it cuts the damage to 0
 * the engine redirects the force by a plain rule, while a Focus Point is left: at the attacker, an enemy within 5 feet
 * of a melee attack or 60 feet of a ranged one, who makes a Dexterity save or takes two rolls of the Martial Arts die
 * plus the Dexterity modifier, of the attack's own type. No other creature is chosen, and sight and Total Cover are not
 * read.
 * Slow Fall (level 4) is told: the engine has no falling.
 * Stunning Strike (level 5): once a turn, on a hit with a Monk weapon or an Unarmed Strike, a Focus Point for a
 * Constitution save. A failure is Stunned until the Monk's next turn. A success halves the target's Speed and gives the
 * next attack on it Advantage until then.
 * Empowered Strikes (level 6): an Unarmed Strike deals Force damage in place of its own type where that harms the target
 * more.
 * Evasion (level 7): a Dexterity save for half damage takes none on a success and half on a failure, while the Monk is
 * not Incapacitated (../save-rules).
 * Acrobatic Movement (level 9) is told: the floor holds no liquid and no wall a creature can move along.
 * Heightened Focus (level 10): Flurry of Blows makes three Unarmed Strikes, and Patient Defense with a Focus Point gives
 * Temporary Hit Points of two rolls of the Martial Arts die. Step of the Wind's willing creature carried along is told:
 * a move takes the one who moves.
 * Self-Restoration (level 10): as each round turns, which the engine counts as the end of the Monk's turn, one of
 * Charmed, Frightened or Poisoned on the Monk ends, the first held in that order. One given after the Monk's turn in the
 * round ends there too, a turn early. Forgoing food and drink is told.
 * Disciplined Survivor (level 14): a failed save against harm is rerolled for a Focus Point by a plain rule, as
 * Indomitable is (../save-rules), and the new roll stands.
 * Perfect Focus (level 15): as Initiative is rolled and Uncanny Metabolism is not used, a Monk with 3 Focus Points or
 * fewer has 4.
 * Superior Defense (level 18): the engine spends 3 Focus Points by a plain rule as a round begins, which it counts as the
 * start of the Monk's turn, when the Monk is Bloodied, up and not Incapacitated, with an enemy up and here. It gives
 * Resistance to every damage type but Force for 1 minute, kept with the lasting effects, and ends when the Monk is
 * Incapacitated.
 * Open Hand Technique (Warrior of the Open Hand, level 3): each hit of a Flurry of Blows may Addle (no Opportunity
 * Attacks), Topple (a Dexterity save or Prone) or Push (a Strength save or pushed 15 feet straight away, as far as the
 * first solid thing on the floor, and the full 15 feet).
 * Wholeness of Body (level 6): a Bonus Action to regain the Martial Arts die plus the Wisdom modifier, at least 1.
 * Fleet Step (level 11) is told: the read takes one Bonus Action a turn and settles the move by it, so a Step of the
 * Wind beside another has no place to go.
 * Quivering Palm (level 17): an Unarmed Strike that hits may spend 4 Focus Points to set the vibrations, kept on the
 * Monk with who bears them, and a new one ends the old. Ending them is the turn's action: a Constitution save against
 * the Focus DC, 10d12 Force damage and half on a success. Their days are counted in rounds, 14,400 a day, and they end
 * with the encounter, since the engine keeps no clock between encounters. Told: ending them in place of one attack of
 * the Attack action, and ending them harmlessly.
 */

const FOCUS = "monk-monks-focus"
const HEIGHTENED = "monk-heightened-focus"
const WHOLENESS = "warrior-of-the-open-hand-wholeness-of-body"
const PALM = "warrior-of-the-open-hand-quivering-palm"
const SUPERIOR = "monk-superior-defense"

/** A Monk's Martial Arts die at their level, by the class table's column: "1d6", and "1d8" from level 5. */
export const martialArtsDie = (sheet: Sheet): string | undefined => (classById.get(sheet.class)?.levels[sheet.level - 1] as Record<string, unknown> | undefined)?.martialArts as string | undefined

/** The Difficulty Class of a save against a Monk's Focus feature: 8, the Wisdom modifier and the Proficiency Bonus. */
export function focusSaveDc(sheet: Sheet): number {
  const derived = deriveSheet(sheet)
  return 8 + derived.abilityModifiers.wis + derived.proficiencyBonus
}

// Martial Arts holds while the Monk wears no armor and holds no Shield.
const unarmored = (character: Roller): boolean => !!character.sheet && !character.sheet.armor && !character.sheet.shield

/** Whether an attack is an Unarmed Strike or one with a Monk weapon: a Simple Melee weapon, or a Martial Melee weapon with the Light property. */
export function isMonkAttack(attackId: string): boolean {
  if (attackId === UNARMED_STRIKE) return true
  const weapon = equipmentById.get(attackId)
  if (weapon?.kind !== "weapon" || weapon.attackType !== "melee") return false
  return weapon.category === "simple" || (weapon.category === "martial" && (weapon.properties ?? []).includes("light"))
}

const average = (dice: string) => {
  const { count, sides } = parseDice(dice)
  return (count * (sides + 1)) / 2
}

/**
 * An attack as Martial Arts changes it: the Martial Arts die in place of the weapon's own when its average is higher
 * (an Unarmed Strike's flat 1 always), and the higher of Strength and Dexterity for the attack and damage rolls. A
 * Monk with Strength +1 and Dexterity +3 strikes unarmed at +5 for 1d6 + 3 at level 1.
 */
export function martialArtsAttack(character: Roller, attack: Attack): Attack {
  const sheet = character.sheet
  if (!sheet || !hasFeature(character, "monk-martial-arts") || !unarmored(character) || !isMonkAttack(attack.id)) return attack
  const die = martialArtsDie(sheet)
  const [part, ...rest] = attack.damage
  if (!die || !part) return attack
  const mods = deriveSheet(sheet).abilityModifiers
  // What ./attack `weaponAttack` used: Strength for an Unarmed Strike and a Melee weapon, the higher for a Finesse one.
  const weapon = equipmentById.get(attack.id)
  const finesse = weapon?.kind === "weapon" && (weapon.properties ?? []).includes("finesse")
  const used = finesse ? Math.max(mods.str, mods.dex) : mods.str
  const best = Math.max(mods.str, mods.dex)
  const own = part.dice ? parseDice(part.dice) : undefined
  const rolled = own && average(`${own.count}d${own.sides}`) > average(die) ? `${own.count}d${own.sides}` : die
  const dice = best === 0 ? rolled : `${rolled} ${best < 0 ? "-" : "+"} ${Math.abs(best)}`
  return { ...attack, bonus: attack.bonus - used + best, damage: [{ dice, type: part.type, ...(part.floor ? { floor: part.floor } : {}) }, ...rest] }
}

// A die of the Monk's Martial Arts thrown, checked to be one.
function martialRoll(sheet: Sheet, roll: (sides: number) => number): { rolled: number; sides: number } | undefined {
  const die = martialArtsDie(sheet)
  if (!die) return undefined
  const { sides } = parseDice(die)
  const rolled = roll(sides)
  if (!Number.isInteger(rolled) || rolled < 1 || rolled > sides) throw new Error(`${rolled} is not a d${sides} roll.`)
  return { rolled, sides }
}

// A Focus Point spent, told in the story.
const spendFocus = (characters: Featured[], actor: Featured) => characters.map((character) => (character.id === actor.id ? withFeatureUsed(character, FOCUS) : character))

// Focus Points spent, more than one at a time (Superior Defense's 3, Quivering Palm's 4).
const withFocusSpent = <T extends { featureUses?: Record<string, number> }>(character: T, points: number): T => ({
  ...character,
  featureUses: { ...character.featureUses, [FOCUS]: (character.featureUses?.[FOCUS] ?? 0) + points },
})

// One line of the read's prompt for every Focus feature, given once. A Monk with Heightened Focus is told its three
// strikes and its Temporary Hit Points.
const FOCUS_NOTE =
  "Flurry of Blows, Patient Defense and Step of the Wind draw on the Monk's Focus Points, and the count beside one is the points left. Flurry of Blows is two Unarmed Strikes after the turn's attack, and goes only with an attack. Patient Defense backs away without drawing Opportunity Attacks, and with a point the character also Dodges. Step of the Wind is a Dash, and with a point also a Disengage."
const HEIGHTENED_NOTE =
  "Flurry of Blows, Patient Defense and Step of the Wind draw on the Monk's Focus Points, and the count beside one is the points left. Flurry of Blows is three Unarmed Strikes after the turn's attack, and goes only with an attack. Patient Defense backs away without drawing Opportunity Attacks, and with a point the character also Dodges and gains Temporary Hit Points. Step of the Wind is a Dash, and with a point also a Disengage."
const focusNote = (character: Roller): string => (hasFeature(character, HEIGHTENED) ? HEIGHTENED_NOTE : FOCUS_NOTE)

// A Focus feature as a Bonus Action. One that `spends` costs a Focus Point.
const focus = (rule: Omit<BonusActionRule, "feature" | "note">): BonusActionRule => ({ ...rule, feature: FOCUS, note: focusNote })

// Open Hand Technique's effects on a Flurry of Blows hit, by the option's id, with their names.
type Technique = "addle" | "topple" | "push"
const TECHNIQUES: Record<Technique, string> = { addle: "Addle", topple: "Topple", push: "Push" }

// Push's distance: "pushed up to 15 feet away from you". The data does not type it. The engine pushes the full 15.
const PUSH_FEET = 15

// Flurry of Blows, and an Open Hand Monk's with a technique on each hit.
const flurry = (technique?: Technique): BonusActionRule =>
  focus({
    id: technique ? `flurry-of-blows-${technique}` : "flurry-of-blows",
    name: technique ? `Flurry of Blows with ${TECHNIQUES[technique]}` : "Flurry of Blows",
    spends: true,
    follow: technique ? `flurry-${technique}` : "flurry",
    ...(technique ? { offer: (character: Roller) => hasFeature(character, "warrior-of-the-open-hand-open-hand-technique") } : {}),
    use: ({ characters, actor, action }) => ({
      characters: spendFocus(characters, actor),
      use: {
        feature: action.id,
        name: "Flurry of Blows",
        fact: `${actor.name} spends a Focus Point on Flurry of Blows: ${hasFeature(actor, HEIGHTENED) ? "three" : "two"} Unarmed Strikes after the attack.`,
      },
    }),
  })

/**
 * An Unarmed Strike that follows the turn's attack, as a Bonus Action: at the one just attacked while they stand in
 * reach, or the nearest enemy in reach. `then` is the strike still to come after it (Flurry of Blows' next), and
 * `technique` the Open Hand Technique each hit carries.
 */
const strikeAfter = (key: string, then?: (character: InScene) => string | undefined, technique?: Technique): FollowRule => ({
  key,
  attack: true,
  next: ({ character, made, struck, present, ask, rest }) => {
    if (!("attack" in made)) return undefined
    const unarmed = attacksOf(character).find((entry) => entry.id === UNARMED_STRIKE)
    if (!unarmed) return undefined
    const reached = (other: (typeof present)[number]) => attackable(character, other) && ask(unarmed, other, {}) !== undefined
    const same = present.find((other) => other.id === made.attack.target)
    const target = same && reached(same) ? same : nearestEnemy(character, present.filter(reached))
    if (!target) return undefined
    const following = then?.(character)
    const roll = ask(unarmed, target, rest({ struck: [...new Set([...struck, target.id])], ...(following ? { [following]: true } : {}) }))
    if (!roll || !technique || !("attack" in roll)) return roll
    return { ...roll, attack: { ...roll.attack, choices: { ...roll.attack.choices, "open-hand": technique } } }
  },
})

// A Flurry of Blows' strikes: two, and a third with Heightened Focus.
function flurryStrikes(technique?: Technique): FollowRule[] {
  const key = technique ? `flurry-${technique}` : "flurry"
  return [
    strikeAfter(key, () => `${key}-again`, technique),
    strikeAfter(`${key}-again`, (character) => (hasFeature(character, HEIGHTENED) ? `${key}-third` : undefined), technique),
    strikeAfter(`${key}-third`, undefined, technique),
  ]
}

/**
 * A save against a Monk's feature, rolled for its target as every save is (../spells `rollSave`), against no magic: a
 * Legendary creature may choose to succeed where the conditions at stake would put it out of the fight (`resisted`),
 * and a rescue of the target's own is spent. `target` is the one who saved, as that leaves them.
 */
function focusSave<T extends Target>(attacker: Roller, target: T, ability: Check & { kind: "save" }, against: readonly ConditionId[], roll: (sides: number) => number) {
  const thrown = rollSave({
    target: target as unknown as Castee,
    ability: ability.ability,
    dc: focusSaveDc(attacker.sheet as Sheet),
    d20: () => roll(20),
    roll,
    characters: [target as unknown as Castee],
    against,
    stakes: { conditions: against },
    magical: false,
  })
  const resisted = !!thrown.legendary
  const saver = resisted ? withLegendaryResistanceSpent(target) : thrown.rescued ? withRescueSpent(target, thrown.rescued) : target
  return { save: resisted ? { ...saveCheck(thrown), success: false } : saveCheck(thrown), resisted, target: saver }
}

// The damage types Deflect Attacks answers below level 13.
const DEFLECTED: readonly DamageTypeId[] = ["bludgeoning", "piercing", "slashing"]

// What one bears from the turn's effects, by id.
const bears = (character: { turnEffects?: readonly TurnEffect[] }, id: string) => !!character.turnEffects?.some((effect) => effect.id === id)

// How much of a damage type a target takes, by its defenses: none, half, all or double.
function share(target: Roller, type: DamageTypeId): number {
  const defenses = defensesOf(target)
  if (defenses.immunities?.includes(type)) return 0
  return (defenses.resistances?.includes(type) ? 0.5 : 1) * (defenses.vulnerabilities?.includes(type) ? 2 : 1)
}

type Hurt = Featured & Target & { position?: { x: number; y: number }; fled?: true }

/**
 * Deflect Attacks' redirect, once the blow it cut to 0 has landed: a Focus Point for the attacker's Dexterity save, or
 * two rolls of the Martial Arts die plus the Dexterity modifier of `type`. Only an attacker who is an enemy, up and
 * within 5 feet of a melee attack or 60 feet of a ranged one is aimed at. One with no place on the floor is taken to be
 * in reach. Kaito, level 5 with Dexterity +2, sends 2d8 + 2 back at a Bandit who fails a DC 15 save.
 */
const redirect =
  (monkId: string, attackerId: string, type: DamageTypeId | undefined): DamageAnswer =>
  ({ characters, melee, roll }) => {
    const monk = characters.find((character) => character.id === monkId) as Hurt | undefined
    const foe = characters.find((character) => character.id === attackerId) as Hurt | undefined
    if (!type || !monk?.sheet || !foe || usesLeft(monk, FOCUS) < 1 || isDead(foe) || isDown(foe) || hasFled(foe) || !areEnemies(foe, monk)) return { characters }
    const from = placedOf(monk)
    const at = placedOf(foe)
    if (from && at && !within(from, at, melee ? 5 : 60)) return { characters }
    const die = martialArtsDie(monk.sheet)
    if (!die) return { characters }
    const { sides } = parseDice(die)
    const dex = deriveSheet(monk.sheet).abilityModifiers.dex
    const { save } = focusSave(monk, foe, { kind: "save", ability: "dex" }, [], roll)
    const spent = characters.map((character) => (character.id === monkId ? withFeatureUsed(character, FOCUS) : character))
    const said = `${monk.name} spends a Focus Point to redirect the force at ${foe.name}`
    if (save.success)
      return {
        characters: spent,
        reaction: { by: monkId, id: "deflect-attacks", name: "Deflect Attacks", text: `${said}, who makes the Dexterity save (${save.total} against DC ${save.dc}) and takes no damage.` },
      }
    const rolled = rollDamage([{ dice: `2d${sides}${dex ? ` ${dex < 0 ? "-" : "+"} ${Math.abs(dex)}` : ""}`, type }], roll)
    const taken = damageTaken(rolled, defensesOf(foe))
    const struck = withDamage(foe, taken, { types: [type] })
    const after = afterHarm(struck.character)
    const left = hitPointsOf(after)
    return {
      characters: spent.map((character) => (character.id === foe.id ? after : character)),
      reaction: {
        by: monkId,
        id: "deflect-attacks",
        name: "Deflect Attacks",
        text: `${said}, who fails the Dexterity save (${save.total} against DC ${save.dc}) and takes ${taken} ${type} damage${left ? `, now ${left.current} of ${left.maximum} hit points` : ""}.`,
      },
    }
  }

// The conditions Self-Restoration ends, in the order it takes them.
const RESTORED: readonly ConditionId[] = ["charmed", "frightened", "poisoned"]

// Self-Restoration as a round turns: the first of Charmed, Frightened or Poisoned on the Monk ends.
function selfRestored<T extends Roller & { id: string }>(character: T): { character: T; told?: { name: string; text: string } } {
  const monk = character as T & Hurt
  if (!hasFeature(monk, "monk-self-restoration") || isDead(monk)) return { character }
  const held = RESTORED.find((id) => monk.conditions?.some((entry) => entry.id === id))
  if (!held) return { character }
  const freed = withoutCondition(monk, held)
  if (!freed.ended) return { character }
  return {
    character: freed.character,
    told: { name: "Self-Restoration", text: `${monk.name ?? "The Monk"} ends the ${held[0].toUpperCase()}${held.slice(1)} condition on themselves by Self-Restoration.` },
  }
}

// Superior Defense's cost and its minute, in rounds. The round it begins counts, and the round's start takes one off at once.
const SUPERIOR_COST = 3
const MINUTE_ROUNDS = 10

type Guarded = Hurt & { spellEffects?: readonly SpellEffect[] }

/** Whether a Monk's Superior Defense holds on them: kept with their lasting effects, by them. */
export const superiorDefenseOn = (character: { id?: string; spellEffects?: readonly SpellEffect[] }): boolean =>
  !!character.spellEffects?.some((effect) => effect.spell === SUPERIOR && (!character.id || effect.by === character.id))

// The Monk with Superior Defense ended.
const withoutDefense = <T extends { spellEffects?: readonly SpellEffect[] }>(character: T): T => {
  const spellEffects = (character.spellEffects ?? []).filter((effect) => effect.spell !== SUPERIOR)
  const { spellEffects: _, ...rest } = character
  return (spellEffects.length ? { ...rest, spellEffects } : rest) as T
}

/**
 * Superior Defense as a round begins: ended on a Monk who is Incapacitated, and taken by a plain rule for 3 Focus
 * Points by a Monk who is Bloodied, up and not Incapacitated, while an enemy who is up is here.
 */
function superiorDefense<T extends Roller & { id: string }>(character: T, everyone: readonly (Roller & { id: string })[] | undefined): { character: T; told?: { name: string; text: string } } {
  const monk = character as T & Guarded
  if (!hasFeature(monk, SUPERIOR)) return { character }
  const name = monk.name ?? "The Monk"
  if (superiorDefenseOn(monk))
    return isIncapacitated(monk) ? { character: withoutDefense(monk), told: { name: "Superior Defense", text: `${name}'s Superior Defense ends as they are Incapacitated.` } } : { character }
  if (!everyone || usesLeft(monk, FOCUS) < SUPERIOR_COST || isDead(monk) || isDown(monk) || isIncapacitated(monk)) return { character }
  const hitPoints = hitPointsOf(monk)
  if (!hitPoints || hitPoints.current * 2 > hitPoints.maximum) return { character }
  const threatened = everyone.some((other) => {
    const foe = other as Hurt
    return foe.id !== monk.id && areEnemies(foe, monk) && !isDead(foe) && !isDown(foe) && !hasFled(foe)
  })
  if (!threatened) return { character }
  const effect: SpellEffect = { spell: SUPERIOR, by: monk.id, turns: MINUTE_ROUNDS + 1 }
  return {
    character: { ...withFocusSpent(monk, SUPERIOR_COST), spellEffects: [...(monk.spellEffects ?? []), effect] },
    told: { name: "Superior Defense", text: `${name} spends 3 Focus Points on Superior Defense: Resistance to all damage but Force for 1 minute.` },
  }
}

// Quivering Palm's cost, and a day in rounds of 6 seconds.
const PALM_COST = 4
const DAY_ROUNDS = 14_400

// The vibrations a Monk has set, kept with their lasting effects: who bears them is the effect's `choice`.
const vibrationsOf = (character: { spellEffects?: readonly SpellEffect[] }): SpellEffect | undefined => character.spellEffects?.find((effect) => effect.spell === PALM)

type Palmed = Aimed & Featured & { fled?: true }
type Aimed = Parameters<typeof rollSave>[0]["target"]

/**
 * End Quivering Palm's vibrations as the action: the one who bears them makes a Constitution save against the Focus
 * DC, taking 10d12 Force damage on a failure and half on a success. Everyone comes back as it left them, in the shape a
 * spell's cast takes. `problem` says why nothing happened.
 */
export function quiveringPalm<T extends Palmed>(args: {
  characters: readonly T[]
  monkId: string
  d20: () => number
  roll: (sides: number) => number
  rules?: { playerDeath?: boolean }
}): Cast<T> & { problem?: string } {
  const characters = [...args.characters]
  const monk = characters.find((character) => character.id === args.monkId) as (T & { spellEffects?: readonly SpellEffect[] }) | undefined
  const none = (problem: string): Cast<T> & { problem: string } => ({ characters, targets: [], saves: [], harm: [], conditions: [], facts: [], problem })
  const set = monk && vibrationsOf(monk)
  if (!monk?.sheet || !hasFeature(monk, PALM) || !set?.choice) return none(`${monk?.name ?? "This character"} has set no vibrations to end.`)
  const target = characters.find((character) => character.id === set.choice)
  if (!target || isDead(target) || hasFled(target)) return none(`The one who bears ${monk.name}'s vibrations is not here.`)
  const feature = classFeatureById.get(PALM)
  const dice = feature?.damage?.dice ?? "10d12"
  const rolled = rollDamage([{ dice, type: "force" }], args.roll)
  const [part] = rolled.parts
  const dc = focusSaveDc(monk.sheet)
  const saved: SaveRoll = rollSave({ target, ability: "con", dc, d20: args.d20, roll: args.roll, characters, stakes: { damage: rolled.total }, spell: false })
  // What answered the save is spent, told with the save by the cast's beats: a Legendary Resistance, or a rescue.
  const answered = withSaveAnswered(characters, target.id, saved, saved, target.name).characters
  const dealt = saved.success ? Math.floor(rolled.total / 2) : rolled.total
  const taken = damageTaken({ parts: [{ type: "force", dice: [], bonus: dealt, total: dealt }], total: dealt }, defensesOf(target))
  const struck = withDamage(answered.find((character) => character.id === target.id) ?? target, taken, { rules: args.rules, types: ["force"] })
  const after = afterHarm(struck.character)
  const left = hitPointsOf(after)
  const ended = withoutVibrations(monk)
  const harm: Harm[] = [{ target: target.id, kind: "damage", dice: part?.dice ?? [], sides: part?.sides, bonus: 0, type: "force", amount: taken }]
  return {
    characters: answered.map((character) => (character.id === target.id ? after : character.id === monk.id ? ended : character)),
    targets: [target.id],
    saves: [saved],
    harm,
    conditions: [],
    facts: [
      `${monk.name} ends the vibrations of Quivering Palm. ${target.name} ${saved.success ? "SUCCEEDS on" : "FAILS"} the Constitution saving throw (${saved.total} against DC ${dc}) and takes ${taken} force damage${left ? `, now ${left.current} of ${left.maximum} hit points` : ""}.`,
    ],
  }
}

// The Monk with their vibrations ended.
const withoutVibrations = <T extends { spellEffects?: readonly SpellEffect[] }>(character: T): T => {
  const spellEffects = (character.spellEffects ?? []).filter((effect) => effect.spell !== PALM)
  const { spellEffects: _, ...rest } = character
  return (spellEffects.length ? { ...rest, spellEffects } : rest) as T
}

// Whether a hit may set Quivering Palm's vibrations: an Unarmed Strike, chosen with the attack, with 4 Focus Points left.
const palmSets = (attacker: Roller & { featureUses?: Record<string, number> }, attackId: string, choices: Readonly<Record<string, string>> | undefined): boolean =>
  !!choices?.["quivering-palm"] && attackId === UNARMED_STRIKE && hasFeature(attacker, PALM) && usesLeft(attacker, FOCUS) >= PALM_COST

/**
 * Disciplined Survivor on a failed save against harm (../save-rules `rescuedSave`): the engine spends a Focus Point by a
 * plain rule, as a player would, on a failure the reroll could still turn, when the failure costs harm (../save-rules
 * `failureCosts`). The reroll keeps the save's Advantage or Disadvantage and what was added to it, and the new
 * roll stands.
 */
export function disciplinedSurvivor(args: Parameters<SaveRule>[0]): ReturnType<SaveRule> {
  const { character, result, stakes } = args
  if (!character.sheet || !hasFeature(character, "monk-disciplined-survivor") || usesLeft(character, FOCUS) < 1) return undefined
  if (!failureCosts(character, stakes)) return undefined
  const kept = (result.adds ?? []).reduce((sum, add) => sum + add.amount, 0)
  if (20 + result.bonus + kept < result.dc) return undefined
  const dice = Array.from({ length: result.mode === "normal" ? 1 : 2 }, () => args.d20())
  const rerolled = resolveCheck({ dice, bonus: result.bonus, dc: result.dc, mode: result.mode, adds: result.adds ?? [] })
  return { result: rerolled, feature: FOCUS, name: classFeatureById.get("monk-disciplined-survivor")?.name ?? "Disciplined Survivor" }
}

export const monk: ClassRules = {
  class: "monk",
  attack: martialArtsAttack,
  bonusActions: [
    {
      id: "martial-arts-strike",
      feature: "monk-martial-arts",
      name: "Martial Arts: Bonus Unarmed Strike",
      offer: unarmored,
      follow: "martial-arts",
      note: "martial-arts-strike is one Unarmed Strike after the turn's attack, and goes only with an attack.",
      use: ({ characters, actor, action }) => ({ characters, use: { feature: action.id, name: "Martial Arts", fact: `${actor.name} makes an Unarmed Strike as a Bonus Action after the attack.` } }),
    },
    flurry(),
    flurry("addle"),
    flurry("topple"),
    flurry("push"),
    focus({
      id: "patient-defense",
      name: "Patient Defense: Disengage",
      disengages: () => true,
      use: ({ characters, actor, action }) => ({ characters, use: { feature: action.id, name: "Patient Defense", fact: `${actor.name} takes the Disengage action as a Bonus Action.` } }),
    }),
    focus({
      id: "patient-defense-focus",
      name: "Patient Defense: Disengage and Dodge",
      spends: true,
      disengages: () => true,
      use: ({ characters, actor, action, roll }) => {
        const dodged = takeAction(spendFocus(characters, actor) as (Featured & { name: string; type: string })[], actor.id, { action: "dodge" }).characters
        // Heightened Focus: Temporary Hit Points of two rolls of the Martial Arts die. They do not stack: the higher stand.
        const first = actor.sheet && hasFeature(actor, HEIGHTENED) ? martialRoll(actor.sheet, roll) : undefined
        const second = first && actor.sheet ? martialRoll(actor.sheet, roll) : undefined
        const lift = first && second ? first.rolled + second.rolled : 0
        const held = (actor as Featured & { tempHitPoints?: number }).tempHitPoints ?? 0
        const guarded = lift > held ? dodged.map((character) => (character.id === actor.id ? { ...character, tempHitPoints: lift } : character)) : dodged
        return {
          characters: guarded,
          use: {
            feature: action.id,
            name: "Patient Defense",
            fact: `${actor.name} spends a Focus Point on Patient Defense: the Disengage and the Dodge actions as a Bonus Action${
              lift ? `, and Heightened Focus gives ${lift} Temporary Hit Points${lift > held ? "" : `, no more than the ${held} they have`}` : ""
            }.`,
          },
        }
      },
    }),
    focus({
      id: "step-of-the-wind",
      name: "Step of the Wind: Dash",
      dash: true,
      use: ({ characters, actor, action }) => ({ characters, use: { feature: action.id, name: "Step of the Wind", fact: `${actor.name} takes the Dash action as a Bonus Action.` } }),
    }),
    focus({
      id: "step-of-the-wind-focus",
      name: "Step of the Wind: Dash and Disengage",
      spends: true,
      dash: true,
      disengages: () => true,
      use: ({ characters, actor, action }) => ({
        characters: spendFocus(characters, actor),
        use: {
          feature: action.id,
          name: "Step of the Wind",
          fact: `${actor.name} spends a Focus Point on Step of the Wind: the Dash and Disengage actions as a Bonus Action, and their jumps go twice as far this turn.`,
        },
      }),
    }),
    {
      id: "wholeness-of-body",
      feature: WHOLENESS,
      note: "wholeness-of-body is Wholeness of Body: the Monk heals themselves by a roll of the Martial Arts die and their Wisdom modifier.",
      use: ({ characters, actor, action, roll }) => {
        const sheet = actor.sheet
        if (!sheet || usesLeft(actor, WHOLENESS) < 1) return { characters }
        const thrown = martialRoll(sheet, roll)
        if (!thrown) return { characters }
        // "the number rolled plus your Wisdom modifier (minimum of 1 Hit Point regained)"
        const wis = deriveSheet(sheet).abilityModifiers.wis
        const amount = Math.max(1, thrown.rolled + wis)
        const healed = withHealing(withFeatureUsed(actor, WHOLENESS), amount)
        const now = hitPointsOf(healed)
        return {
          characters: characters.map((character) => (character.id === actor.id ? healed : character)),
          use: {
            feature: action.id,
            name: action.name,
            target: actor.id,
            harm: [{ target: actor.id, kind: "healing", dice: [thrown.rolled], sides: thrown.sides, bonus: wis, amount }],
            fact: `${actor.name} uses Wholeness of Body and regains ${amount} hit points${now ? `, now ${now.current} of ${now.maximum}` : ""}.`,
          },
        }
      },
    },
  ],
  follows: [strikeAfter("martial-arts"), ...flurryStrikes(), ...flurryStrikes("addle"), ...flurryStrikes("topple"), ...flurryStrikes("push")],
  choices: [
    {
      key: "stun",
      offer: (character) => (hasFeature(character, "monk-stunning-strike") && usesLeft(character, FOCUS) > 0 ? true : undefined),
      prompt: () =>
        `   - STUNNING STRIKE: "stun" is true when the player's words try to stun the target with a blow, and the action is an attack. The game spends a Focus Point on the first hit this turn with an Unarmed Strike or a Monk weapon. Leave it out otherwise.
`,
      field: () => z.boolean().optional().describe("True when the player's words try to stun the target with a blow"),
      rides: "turn",
      // Readied as the turn is taken. The Focus Point is spent on the hit (`hits`).
      apply: (characters, actorId) => ({
        characters: characters.map((character) =>
          character.id === actorId ? withTurnEffect(character as Featured & { turnEffects?: readonly TurnEffect[] }, "stunning-strike-ready", actorId) : character
        ),
      }),
    },
    {
      key: "quivering-palm",
      offer: (character) => (hasFeature(character, PALM) && usesLeft(character, FOCUS) >= PALM_COST ? ["palm"] : undefined),
      prompt: () =>
        `   - QUIVERING PALM: with an Unarmed Strike, "quivering-palm" is "palm" when the player's words set deadly vibrations in the target's body with the blow. It spends 4 Focus Points only if the strike hits. Leave it out otherwise.
`,
      field: () => z.enum(["palm"]).optional().describe("For an Unarmed Strike: Quivering Palm's vibrations, set if it hits"),
      rides: "attack",
    },
    {
      key: "vibrations",
      check: "quivering-palm",
      offer: (character) => {
        const set = vibrationsOf(character)
        return hasFeature(character, PALM) && set?.choice ? [set.choice] : undefined
      },
      prompt: (values) =>
        `   - END QUIVERING PALM: when the character ends the vibrations they set in ${(values as readonly string[])[0]} as the action, "check" is "quivering-palm". The game rolls the target's save and the damage.
`,
      field: (values) =>
        z
          .enum(values as [string, ...string[]])
          .optional()
          .describe('For "quivering-palm": the one who bears the vibrations'),
      // Used as the action: resolved with no throw of the hero's. The one who bears the vibrations is kept on the Monk.
      act: (_value, { character, also }) => {
        const set = vibrationsOf(character)
        const feature: RequiredFeature = {
          feature: { id: "quivering-palm", targets: set?.choice ? [set.choice] : [] },
          rollType: "Quivering Palm",
          difficulty: character.sheet ? focusSaveDc(character.sheet) : 0,
          modifier: 0,
          mode: "normal",
        }
        console.log("[LLM] Roll requirement decision:", { character: character.name, requiresRoll: false, feature: feature.feature })
        return { roll: null, feature, ...also }
      },
      effects: ["quivering-palm"],
      resolve: ({ characters, actorId, d20, roll, rules }) => ({
        ...quiveringPalm({ characters: characters as Palmed[], monkId: actorId, d20, roll, rules }),
        name: "Quivering Palm",
      }),
    },
  ],
  reactions: [
    {
      id: "deflect-attacks",
      name: "Deflect Attacks",
      has: (character) => hasFeature(character, "monk-deflect-attacks"),
      // Once the damage is known: 1d10 plus the Dexterity modifier and the Monk level off it, to no less than 0.
      onDamage: ({ target, attacker, taken, hit, ask, types, roll }) => {
        const sheet = target.sheet
        if (!sheet || !hasFeature(target, "monk-deflect-attacks") || !canReact(target)) return undefined
        // Deflect Energy: any damage type, not just Bludgeoning, Piercing or Slashing.
        if (!hasFeature(target, "monk-deflect-energy") && !types.some((type) => DEFLECTED.includes(type))) return undefined
        const { sides } = parseDice(classFeatureById.get("monk-deflect-attacks")?.dice ?? "1d10")
        const added = deriveSheet(sheet).abilityModifiers.dex + sheet.level
        if (!ask(true, `${hit} It deals ${taken} damage. Deflect Attacks would cut it by 1d${sides} + ${added}.`)) return undefined
        const rolled = roll(sides)
        if (!Number.isInteger(rolled) || rolled < 1 || rolled > sides) throw new Error(`${rolled} is not a d${sides} roll.`)
        const cut = rolled + added
        const left = Math.max(0, taken - cut)
        return {
          taken: left,
          reaction: { by: target.id, id: "deflect-attacks", name: "Deflect Attacks", text: `${target.name} uses Deflect Attacks, cutting the damage by ${cut}, and takes ${left} of ${taken}.` },
          // Cut to 0, the force may be redirected for a Focus Point.
          ...(left === 0 ? { answer: redirect(target.id, attacker.id, types[0]) } : {}),
        }
      },
      damageWords: (target) => ` ${target} cuts it with Deflect Attacks.`,
    },
  ],
  hits: [
    {
      id: "stunning-strike",
      after: ({ attacker, target, roll, attack }) => {
        const striker = attacker as typeof attacker & { featureUses?: Record<string, number>; turnEffects?: readonly TurnEffect[] }
        if (!hasFeature(attacker, "monk-stunning-strike") || !bears(striker, "stunning-strike-ready") || usedThisTurn(striker, "stunning-strike", undefined)) return undefined
        if (usesLeft(striker, FOCUS) < 1 || !isMonkAttack(attack.id) || isDown(target)) return undefined
        // A Legendary creature that fails may choose to succeed, and spends a use of its resistance (../legendary-resistance).
        const { save, resisted, target: held } = focusSave(attacker, target, { kind: "save", ability: "con" }, ["stunned"], roll)
        const by = attacker.id ?? ""
        const passed = save.success || resisted
        // A failure: Stunned until the Monk's next turn, counted as a span of the target's turn (../conditions).
        const stunned = passed ? undefined : withCondition(held, { id: "stunned", source: by, span: "turn" }, { acted: !!(target as { isComplete?: boolean }).isComplete })
        // A success: Speed halved and the next attack on it with Advantage, until the Monk's next turn.
        const after = stunned?.given ? stunned.character : passed ? withTurnEffect(withTurnEffect(held, "stunning-strike-slowed", by), "stunning-strike-opened", by) : held
        const rider: HitRider = { id: "stunning-strike", effect: stunned?.given ? "stunned" : resisted ? "resisted" : passed ? "staggered" : "unmoved", save, took: !!stunned?.given || passed }
        return { target: after, rider, conditions: stunned?.given ? [{ target: target.id ?? "", condition: "stunned" }] : [], spends: FOCUS, once: "stunning-strike" }
      },
      words: (attacker, target, rider) =>
        ` ${attacker} spends a Focus Point on a Stunning Strike: ${
          rider.effect === "stunned"
            ? `${target} fails the Constitution save and is Stunned until ${attacker}'s next turn.`
            : rider.effect === "staggered"
              ? `${target} makes the Constitution save, but their Speed is halved and the next attack on them has Advantage until ${attacker}'s next turn.`
              : rider.effect === "resisted"
                ? `${target} fails the Constitution save and chooses to succeed instead (Legendary Resistance), but their Speed is halved and the next attack on them has Advantage until ${attacker}'s next turn.`
                : `${target} fails the Constitution save, and cannot be Stunned.`
        }`,
    },
    {
      id: "open-hand",
      // On a Flurry of Blows hit: Addle bars the target's Opportunity Attacks, Topple is a Dexterity save or Prone, and
      // Push a Strength save or 15 feet straight away (`pushes`, settled with the roll in ../actions `afterRoll`).
      after: ({ attacker, target, choices, roll }) => {
        const technique = choices?.["open-hand"]
        if (!technique || !hasFeature(attacker, "warrior-of-the-open-hand-open-hand-technique") || isDown(target)) return undefined
        if (technique === "addle") return { target: withTurnEffect(target, "addled", attacker.id ?? ""), rider: { id: "open-hand", effect: "addle", took: true }, conditions: [] }
        if (technique === "push") {
          const { save, target: saver } = focusSave(attacker, target, { kind: "save", ability: "str" }, [], roll)
          return {
            target: save.success ? saver : withTurnEffect(saver, "open-hand-pushed", attacker.id ?? ""),
            rider: { id: "open-hand", effect: "push", save, took: !save.success },
            conditions: [],
          }
        }
        if (technique !== "topple") return undefined
        const { save, target: saver } = focusSave(attacker, target, { kind: "save", ability: "dex" }, ["prone"], roll)
        const given = save.success ? undefined : withCondition(saver, { id: "prone" })
        return {
          target: given?.given ? given.character : saver,
          rider: { id: "open-hand", effect: "topple", save, took: !!given?.given },
          conditions: given?.given ? [{ target: target.id ?? "", condition: "prone" }] : [],
        }
      },
      words: (attacker, target, rider) =>
        rider.effect === "addle"
          ? ` ${attacker}'s Open Hand Technique Addles ${target}, who can make no Opportunity Attacks this round.`
          : rider.effect === "push"
            ? ` ${attacker}'s Open Hand Technique tries to Push ${target}: ${rider.took ? `${target} fails the Strength save and is pushed ${PUSH_FEET} feet straight away.` : `${target} holds their ground.`}`
            : ` ${attacker}'s Open Hand Technique tries to Topple ${target}: ${rider.took ? `${target} fails the Dexterity save and falls Prone.` : `${target} stays standing.`}`,
    },
    {
      id: "empowered-strikes",
      // "it can deal your choice of Force damage or its normal damage type": the engine takes Force where it harms the target more.
      retype: ({ attacker, attack, target }) => {
        const own = attack.damage[0]?.type
        if (!target || !own || attack.id !== UNARMED_STRIKE || !hasFeature(attacker, "monk-empowered-strikes")) return undefined
        return share(target, "force") > share(target, own) ? "force" : undefined
      },
    },
    {
      id: "quivering-palm",
      // Told with the hit. The vibrations are kept on the Monk and the points spent as the roll is settled (`attackRolled`).
      after: ({ attacker, target, choices, attack }) =>
        palmSets(attacker as Roller & { featureUses?: Record<string, number> }, attack.id, choices) && !isDead(target)
          ? { target, rider: { id: "quivering-palm", effect: "set", took: true }, conditions: [] }
          : undefined,
      words: (attacker, target) => ` ${attacker} spends 4 Focus Points on Quivering Palm, and sets lethal vibrations in ${target}'s body.`,
    },
  ],
  // Quivering Palm's vibrations, set by an Unarmed Strike that hit: 4 Focus Points, and a new one ends the old.
  attackRolled: (attacker, target, made) => {
    const monk = attacker as typeof attacker & { featureUses?: Record<string, number>; spellEffects?: readonly SpellEffect[] }
    if (!made || made.dealt < 1 || !target.id || !monk.sheet || !palmSets(monk, made.attack.weapon, made.attack.choices)) return attacker
    const effect: SpellEffect = { spell: PALM, by: monk.id ?? "", choice: target.id, turns: DAY_ROUNDS * monk.sheet.level }
    const kept = withoutVibrations(withFocusSpent(monk, PALM_COST))
    return { ...kept, spellEffects: [...(kept.spellEffects ?? []), effect] }
  },
  turnEffects: [
    // Readied with the turn's attack, for the first hit that may carry it.
    { id: "stunning-strike-ready", span: 1 },
    { id: "stunning-strike", span: 1 },
    { id: "stunning-strike-slowed", span: 2, words: () => "Speed Halved", halvesSpeed: true },
    {
      id: "stunning-strike-opened",
      span: 2,
      words: () => "Open To The Next Attack",
      against: () => [{ mode: "advantage", from: "Stunning Strike" }],
      endsWhenAttacked: true,
    },
    // Addle lasts to the start of the target's next turn. The engine counts it to the round's end.
    { id: "addled", span: 1, words: () => "Addled", barsOpportunityAttacks: true },
    { id: "open-hand-pushed", span: 1, pushes: PUSH_FEET },
  ],
  // Uncanny Metabolism, the first time Initiative is rolled with a Focus Point spent. Perfect Focus when it is not used.
  initiative: (character, roll) => {
    const sheet = character.sheet
    const die = sheet && martialArtsDie(sheet)
    if (!sheet || !die) return character
    if (hasFeature(character, "monk-uncanny-metabolism") && usesLeft(character, "monk-uncanny-metabolism") > 0 && character.featureUses?.[FOCUS]) {
      const thrown = martialRoll(sheet, roll)
      const { [FOCUS]: _, ...uses } = character.featureUses
      const restored = { ...character, featureUses: { ...uses, "monk-uncanny-metabolism": 1 } }
      return withHealing(restored as typeof restored & { type: string }, (thrown?.rolled ?? 0) + sheet.level)
    }
    // "you regain expended Focus Points until you have 4 if you have 3 or fewer"
    const left = usesLeft(character, FOCUS)
    if (!hasFeature(character, "monk-perfect-focus") || left > 3) return character
    return { ...character, featureUses: { ...character.featureUses, [FOCUS]: (character.featureUses?.[FOCUS] ?? 0) - (4 - left) } }
  },
  // Self-Restoration as the Monk's turn ends, and Superior Defense as the next begins, both as a round turns.
  roundStart: (character, round) => {
    const restored = selfRestored(character)
    const defended = superiorDefense(restored.character, round?.everyone)
    const told = [restored.told, defended.told].flatMap((one) => (one ? [one] : []))
    if (!told.length) return { character: defended.character }
    return { character: defended.character, told: { name: told.map((one) => one.name).join(" and "), text: told.map((one) => one.text).join(" ") } }
  },
  resistances: (character) => (superiorDefenseOn(character as Guarded) && !isIncapacitated(character as Guarded) ? damageTypeIds.filter((type) => type !== "force") : []),
  saves: [disciplinedSurvivor],
  evasion: (character) => hasFeature(character, "monk-evasion"),
}
