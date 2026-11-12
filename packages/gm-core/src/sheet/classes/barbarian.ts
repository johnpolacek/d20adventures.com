import type { AbilityId, DamageTypeId, SkillId } from "@d20/srd"
import { classFeatureById } from "@d20/srd/class-features"
import { classById } from "@d20/srd/classes"
import { equipmentById } from "@d20/srd/equipment"
import { z } from "zod"
import { isDown, isIncapacitated } from "../../utils/turn-actors"
import { type Attack, UNARMED_STRIKE } from "../attack"
import { type Check, checkAbility } from "../check"
import { type Bearing, type ClassRules, type Featured, withTurnEffect } from "../class-rules"
import { deriveSheet } from "../derive"
import { hasFeature, usedThisTurn, withFeatureUsed } from "../feature-rules"
import type { Sheet } from "../sheet"
import { endConcentration } from "../spell-effects"
import type { TurnEffect } from "../turn-effect"

/**
 * The Barbarian's features in play.
 *
 * Rage: a Bonus Action, not in Heavy armor, with uses by the Rages column. While it lasts the hero resists
 * Bludgeoning, Piercing and Slashing damage, adds the Rage Damage column to the damage of an attack using Strength, has
 * Advantage on Strength checks and Strength saving throws, and cannot cast spells or keep Concentration: entering it
 * ends any. It is kept as the turn effect "rage", which lasts to the end of the hero's next turn. An attack roll
 * against an enemy on any turn of theirs extends it to the end of the next, and so does the Bonus Action taken while
 * raging, which spends no use. It ends early on the Incapacitated condition or at 0 hit points, and with the encounter.
 * Forcing an enemy to save is not counted apart: at levels 1 to 5 a Barbarian forces one only with a weapon's mastery,
 * which rides an attack roll. The ten minute limit is not counted, since a Rage ends with its encounter. One use comes
 * back on a Short Rest by the feature's own data (./rest).
 * Danger Sense (level 2): Advantage on Dexterity saving throws, unless Incapacitated.
 * Reckless Attack (level 2): chosen with the first attack of a turn. Advantage on attack rolls using Strength this
 * turn, and attack rolls against the hero have Advantage until their next turn.
 * Primal Knowledge (level 3): while raging, a check of Acrobatics, Intimidation, Perception, Stealth or Survival is
 * made as a Strength check, so Rage's Advantage holds for it. The engine makes that choice when the Strength
 * modifier is no lower than the skill's own.
 * Frenzy (Path of the Berserker, level 3): with Reckless Attack while raging, the first hit of the turn with an
 * attack using Strength deals as many extra d6 as the Rage Damage bonus, of the attack's damage type.
 * Extra Attack and Fast Movement are read from the data by ../feature-rules and ../derive.
 */

// A hero who uses a feature, with the turn effects they bear.
type Raged = Featured & Bearing

// The skills Primal Knowledge lets a raging Barbarian make as Strength checks. The data does not type the list, so it
// is read from the feature's text (SRD 5.2.1, page 29).
const PRIMAL_SKILLS: readonly SkillId[] = ["acrobatics", "intimidation", "perception", "stealth", "survival"]

const heavyArmored = (character: { sheet?: Sheet }): boolean => {
  const armor = character.sheet?.armor ? equipmentById.get(character.sheet.armor) : undefined
  return armor?.kind === "armor" && armor.category === "heavy"
}

/** The Rage Damage bonus at a Barbarian's level, from the class table's column. */
export const rageDamageOf = (sheet: Sheet): number => classById.get(sheet.class)?.levels[sheet.level - 1]?.rageDamage ?? 0

// The Rage a hero bears, while it still holds: through the turn it was entered or extended, and to the end of the
// hero's next turn.
const rageOf = (character: Bearing): TurnEffect | undefined =>
  character.turnEffects?.find((effect) => effect.id === "rage" && effect.by === character.id && (effect.turns > 1 || !character.isComplete))

/** Whether a hero is raging now: a Rage that holds, on one not Incapacitated, not down and not in Heavy armor. */
export const isRaging = (character: Bearing): boolean => hasFeature(character, "barbarian-rage") && !!rageOf(character) && !isIncapacitated(character) && !isDown(character) && !heavyArmored(character)

/**
 * Whether an attack uses Strength, as ../attack `weaponAttack` picks its ability: an Unarmed Strike and a melee weapon
 * do, thrown or not, a ranged weapon does not, and a Finesse weapon does when Strength is no lower than Dexterity.
 */
export function usesStrength(sheet: Sheet, attack: Attack): boolean {
  if (attack.id === UNARMED_STRIKE) return true
  const weapon = equipmentById.get(attack.id)
  if (weapon?.kind !== "weapon" || weapon.attackType === "ranged") return false
  if (!(weapon.properties ?? []).some((property) => property === "finesse")) return true
  const mods = deriveSheet(sheet).abilityModifiers
  return mods.str >= mods.dex
}

/** The ability a raging hero makes a check with by Primal Knowledge: Strength for its skills, when it is no worse. */
export function primalAbility(character: Bearing, check: Check): AbilityId | undefined {
  if (check.kind !== "skill" || !PRIMAL_SKILLS.includes(check.skill) || !character.sheet || !hasFeature(character, "barbarian-primal-knowledge") || !isRaging(character)) return undefined
  const mods = deriveSheet(character.sheet).abilityModifiers
  return mods.str >= mods[checkAbility(check)] ? "str" : undefined
}

// The Reckless Attack a hero chose this turn: given this round, by themselves.
const recklessNow = (character: Bearing): boolean => !!character.turnEffects?.some((effect) => effect.id === "reckless" && effect.by === character.id && effect.turns > 1)

export const barbarian: ClassRules = {
  class: "barbarian",
  bonusActions: [
    {
      id: "barbarian-rage",
      feature: "barbarian-rage",
      note: "barbarian-rage is for a character who flies into a Rage, a battle fury, beside the action, when the player's words call for it.",
      use: ({ characters, actor: featured, action }) => {
        const actor = featured as Raged
        if (heavyArmored(actor)) return { characters }
        const put = (now: Raged, from: readonly Featured[]) => from.map((character) => (character.id === now.id ? now : character))
        // Taken while raging, it extends the Rage and spends no use.
        if (isRaging(actor)) {
          const kept = withTurnEffect(actor, "rage", actor.id)
          return { characters: put(kept, characters), use: { feature: action.id, name: action.name, fact: `${actor.name} keeps the Rage going.` } }
        }
        // A raging hero keeps no Concentration.
        const ended = endConcentration(characters as Parameters<typeof endConcentration>[0], actor.id)
        const after = ended.characters as Raged[]
        const raging = withTurnEffect(withFeatureUsed(after.find((character) => character.id === actor.id) ?? actor, "barbarian-rage"), "rage", actor.id)
        return {
          characters: put(raging, after),
          use: { feature: action.id, name: action.name, fact: `${actor.name} flies into a Rage.${ended.ended ? ` Their Concentration on ${ended.ended} ends.` : ""}` },
        }
      },
    },
  ],
  choices: [
    {
      key: "reckless",
      offer: (character) => (hasFeature(character, "barbarian-reckless-attack") ? true : undefined),
      prompt: () =>
        `   - RECKLESS ATTACK: with an attack, "reckless" is true when the player's words throw aside all care for defense to strike all out, such as a wild or reckless swing. Leave it out otherwise.
`,
      field: () => z.boolean().optional().describe("True when the player's words attack recklessly with Reckless Attack"),
      rides: "turn",
      attackModes: (character, attack) => (character.sheet && usesStrength(character.sheet, attack) ? [{ mode: "advantage", from: "Reckless Attack" }] : []),
      apply: (characters, actorId) => {
        const actor = characters.find((character) => character.id === actorId)
        return {
          characters: characters.map((character) => (character.id === actorId ? withTurnEffect(character as Raged, "reckless", actorId) : character)),
          told: {
            name: "Reckless Attack",
            text: `${actor?.name ?? "The Barbarian"} attacks recklessly: Advantage on attacks using Strength this turn, and attacks against them have Advantage until their next turn.`,
          },
        }
      },
    },
  ],
  hits: [
    {
      id: "rage",
      damage: ({ attacker, attack }) => {
        const sheet = attacker.sheet
        if (!sheet || !isRaging(attacker) || !usesStrength(sheet, attack)) return undefined
        return { name: "Rage", damage: { amount: rageDamageOf(sheet), type: attack.damage[0]?.type ?? "bludgeoning" } }
      },
    },
    {
      id: "frenzy",
      damage: ({ attacker, attack, turnOf }) => {
        const sheet = attacker.sheet
        if (!sheet || !attacker.id || turnOf !== attacker.id || !hasFeature(attacker, "path-of-the-berserker-frenzy")) return undefined
        if (!isRaging(attacker) || !recklessNow(attacker) || !usesStrength(sheet, attack) || usedThisTurn(attacker, "frenzy", turnOf)) return undefined
        // As many d6 as the Rage Damage bonus, by the feature's data.
        const die = classFeatureById.get("path-of-the-berserker-frenzy")?.variableDice?.die ?? 6
        return { name: "Frenzy", damage: { dice: `${rageDamageOf(sheet)}d${die}`, type: attack.damage[0]?.type ?? "bludgeoning" }, once: "frenzy" }
      },
    },
  ],
  turnEffects: [
    { id: "rage", span: 2, words: () => "Raging" },
    {
      id: "reckless",
      span: 2,
      words: () => "Reckless",
      // Advantage on the bearer's own attacks using Strength, on the turn it was chosen.
      attacking: (effect, bearer, _target, attack) => (effect.turns > 1 && attack && bearer.sheet && usesStrength(bearer.sheet, attack) ? [{ mode: "advantage", from: "Reckless Attack" }] : []),
      against: (_effect, _attacker, bearer) => [{ mode: "advantage", from: `${bearer.name} Attacking Recklessly` }],
    },
    { id: "frenzy", span: 1 },
  ],
  checkModes: (character, check) => [
    ...(check.kind === "save" && check.ability === "dex" && hasFeature(character, "barbarian-danger-sense") && !isIncapacitated(character)
      ? [{ mode: "advantage" as const, from: "Danger Sense" }]
      : []),
    ...(isRaging(character) && (checkAbility(check) === "str" || primalAbility(character, check) === "str") ? [{ mode: "advantage" as const, from: "Rage" }] : []),
  ],
  resistances: (character) => (isRaging(character) ? ((classFeatureById.get("barbarian-rage")?.resistances?.damageTypes ?? []) as readonly DamageTypeId[]) : []),
  checkAbility: primalAbility,
  castingBarred: (character) => (isRaging(character) ? `${character.name ?? "A raging hero"} cannot cast spells while raging.` : undefined),
  // An attack roll against an enemy on the hero's own turn extends a Rage that still holds to the end of their next turn.
  attackRolled: (attacker) => (attacker.id && isRaging(attacker) ? withTurnEffect(attacker, "rage", attacker.id) : attacker),
  // A Rage not extended this round ends as the next begins, and so does one whose bearer is Incapacitated or down.
  roundStart: (character) => {
    const borne = (character as Bearing).turnEffects
    const rage = borne?.find((effect) => effect.id === "rage")
    if (!rage || (rage.turns > 1 && isRaging(character))) return { character }
    const turnEffects = (borne ?? []).filter((effect) => effect.id !== "rage")
    return { character: { ...character, turnEffects }, told: { name: "Rage", text: `${character.name ?? "The Barbarian"}'s Rage ends.` } }
  },
}
