import type { SkillId } from "@d20/srd"
import { monsterById } from "@d20/srd/monsters"
import { skillById } from "@d20/srd/skills"
import { spellById } from "@d20/srd/spells"
import type { RequiredRoll } from "../validations/roll-requirement-schema"
import { masteryOf } from "./attack"
import { type Check, checkBonus, type Roller } from "./check"
import type { ConditionEntry } from "./condition-entry"
import { type Afflicted, cannotMove, type ModeSource, withoutCondition } from "./conditions"
import { deriveSheet } from "./derive"
import { type Floor, type Point, pushed, sizeOf, walkOver } from "./space"
import { afterAttackRoll } from "./spell-effects"
import { DEFAULT_STAT_BLOCK } from "./stat-block"
import type { SpellEffect, TurnEffect } from "./turn-effect"

/**
 * The actions of a turn the rules give an effect of their own, beside attacking and making a check. A character takes
 * one action on its turn: the game master reads which, off a fixed menu, and the engine applies it.
 *
 * Dodge: until the start of the character's next turn, attack rolls against them have Disadvantage and they make
 * Dexterity saving throws with Advantage. It is lost while they are Incapacitated or their Speed is 0.
 * Help: one ally has Advantage on their next ability check with a skill the helper is proficient in, or the next
 * attack roll by an ally against one enemy has Advantage. Either lapses at the start of the helper's next turn.
 * Hide: a DC 15 Dexterity (Stealth) check, and on a success the character has the Invisible condition. It ends when
 * they make an attack roll.
 * Dash and Disengage are taken and recorded. What they change is movement, which stage 6 of plans/srd-rules.md gives.
 */
export type TakenAction = { action: "dodge" } | { action: "help"; target: string; skill?: SkillId } | { action: "dash" } | { action: "disengage" }

/** The Difficulty Class of the Hide action's Dexterity (Stealth) check. */
export const HIDE_DC = 15
const STEALTH: Check = { kind: "skill", skill: "stealth" }

/** The roll the Hide action asks for: Stealth against 15, with Invisible for the one hiding on a success. */
export function hideRoll(character: Roller & { id: string }): Extract<RequiredRoll, { check: Check }> {
  return {
    check: STEALTH,
    rollType: "Hide (Stealth)",
    difficulty: HIDE_DC,
    modifier: checkBonus(character, STEALTH),
    mode: "normal",
    stakes: [{ on: "success", target: character.id, kind: "condition", condition: "invisible", span: "lasting" }],
  }
}

export type Acting = Afflicted & Roller & { id: string; name: string; turnEffects?: readonly TurnEffect[]; spellEffects?: readonly SpellEffect[] }

// Whether a character is proficient in a skill: a hero by its sheet, an NPC when its stat block prints the skill.
function proficientIn(character: Acting, skill: SkillId): boolean {
  if (character.sheet) return deriveSheet(character.sheet).skills[skill].proficient
  const monster = character.type === "npc" ? monsterById.get(character.statBlock ?? DEFAULT_STAT_BLOCK) : undefined
  return monster?.skills?.[skill] !== undefined
}

const give = <T extends Acting>(character: T, effect: TurnEffect): T => ({
  ...character,
  turnEffects: [...(character.turnEffects ?? []).filter((held) => !(held.id === effect.id && held.by === effect.by)), effect],
})

/**
 * Apply an action that takes no roll. Everyone comes back as it left them, with what happened in words for the game
 * master. Help that cannot be given (no such ally or enemy, or a skill the helper is not proficient in) changes nothing.
 */
export function takeAction<T extends Acting>(characters: readonly T[], actorId: string, taken: TakenAction): { characters: T[]; fact?: string } {
  const actor = characters.find((character) => character.id === actorId)
  if (!actor) return { characters: [...characters] }
  const put = (after: T) => characters.map((character) => (character.id === after.id ? after : character))
  if (taken.action === "dodge") return { characters: put(give(actor, { id: "dodging", by: actor.id, turns: 2 })), fact: `${actor.name} takes the Dodge action.` }
  if (taken.action === "dash") return { characters: [...characters], fact: `${actor.name} takes the Dash action.` }
  if (taken.action === "disengage") return { characters: [...characters], fact: `${actor.name} takes the Disengage action.` }
  const target = characters.find((character) => character.id === taken.target && character.id !== actor.id)
  if (!target) return { characters: [...characters] }
  if (target.type === actor.type) {
    // An ally: Advantage on their next check with a skill the helper is proficient in.
    if (!taken.skill || !proficientIn(actor, taken.skill)) return { characters: [...characters] }
    return {
      characters: put(give(target, { id: "helped", by: actor.id, skill: taken.skill, turns: 2 })),
      fact: `${actor.name} takes the Help action for ${target.name}'s next ${skillById.get(taken.skill)?.name ?? taken.skill} check.`,
    }
  }
  // An enemy: the next attack roll by one of the helper's allies against them has Advantage.
  return { characters: put(give(target, { id: "distracted", by: actor.id, turns: 2 })), fact: `${actor.name} takes the Help action against ${target.name}.` }
}

// Whether what an action left still holds: through the round it was given in, and in the next until the one who gave
// it has taken their turn.
function holds(effect: TurnEffect, present: readonly Acting[] | undefined): boolean {
  return effect.turns > 1 || !present?.find((character) => character.id === effect.by)?.isComplete
}

/** Advantage and Disadvantage that actions taken put on an attack roll: the target is Dodging, or an ally of the attacker has Helped against them. */
export function attackModesFromActions(attacker: Acting, target: Acting, present?: readonly Acting[]): ModeSource[] {
  const found: ModeSource[] = []
  const all = present ?? [attacker, target]
  for (const effect of target.turnEffects ?? []) {
    if (!holds(effect, all)) continue
    if (effect.id === "dodging" && !cannotMove(target)) found.push({ mode: "disadvantage", from: `${target.name} Dodging` })
    const helper = all.find((character) => character.id === effect.by)
    if (effect.id === "distracted" && helper && helper.id !== attacker.id && helper.type === attacker.type) found.push({ mode: "advantage", from: `Help from ${helper.name}` })
    if (effect.id === "vexed" && effect.by === attacker.id) found.push({ mode: "advantage", from: "Vex" })
  }
  return found
}

/** Advantage that actions taken put on a check or a save: an ally has Helped with this skill, or the roller is Dodging and makes a Dexterity save. */
export function checkModesFromActions(character: Acting, check: Check, present?: readonly Acting[]): ModeSource[] {
  const found: ModeSource[] = []
  const all = present ?? [character]
  for (const effect of character.turnEffects ?? []) {
    if (!holds(effect, all)) continue
    if (effect.id === "helped" && check.kind === "skill" && check.skill === effect.skill)
      found.push({ mode: "advantage", from: `Help from ${all.find((other) => other.id === effect.by)?.name ?? "an ally"}` })
    if (effect.id === "dodging" && check.kind === "save" && check.ability === "dex" && !cannotMove(character)) found.push({ mode: "advantage", from: "Dodging" })
  }
  return found
}

const drop = <T extends Acting>(character: T, gone: (effect: TurnEffect) => boolean): T => {
  if (!character.turnEffects?.some(gone)) return character
  const turnEffects = character.turnEffects.filter((effect) => !gone(effect))
  const { turnEffects: _, ...rest } = character
  return (turnEffects.length ? { ...rest, turnEffects } : rest) as T
}

/**
 * Everyone after a roll is made, with what the roll used up and what it set up. Help is for the next roll only: an
 * attack on an enemy an ally Helped against spends it, as a check with the skill Helped spends that. One who makes an
 * attack roll is no longer hidden, so their Invisible ends. Vex: an attack that hits and deals damage with a weapon
 * whose Vex mastery the attacker has gives their next attack on that creature Advantage, and that attack spends it.
 * `dealt` is the damage an attack did, 0 for a miss.
 */
export function afterRoll<T extends Acting & { conditions?: readonly ConditionEntry[]; position?: Point }>(
  everyone: readonly T[],
  rollerId: string,
  roll: RequiredRoll,
  dealt = 0,
  floor?: Floor
): T[] {
  let characters: readonly T[] = everyone
  const roller = characters.find((character) => character.id === rollerId)
  if (!roller) return [...characters]
  if ("attack" in roll) {
    characters = afterAttackRoll(characters, rollerId, roll.attack.target)
    // What the weapon's mastery does to the one it hurt. Vex gives the attacker's next attack on them Advantage. Slow
    // takes 10 feet from their Speed until the attacker's next turn. Push sends one no bigger than Large 10 feet straight
    // away, as far as the first solid thing.
    const mastery = dealt > 0 ? masteryOf(roller, roll.attack.weapon) : undefined
    return characters.map((character) => {
      if (character.id === rollerId) return withoutCondition(character, "invisible").character
      if (character.id !== roll.attack.target) return character
      const spent = drop(
        character,
        (effect) =>
          (effect.id === "vexed" && effect.by === rollerId) || (effect.id === "distracted" && effect.by !== rollerId && characters.find((other) => other.id === effect.by)?.type === roller.type)
      )
      if (mastery === "vex") return give(spent, { id: "vexed", by: rollerId, turns: 2 })
      if (mastery === "slow") return give(spent, { id: "slowed", by: rollerId, turns: 2 })
      if (mastery === "push" && roller.position && spent.position && PUSHED_SIZES.includes(sizeOf(spent))) {
        const to = pushed(spent.position, roller.position, PUSH_FEET)
        return { ...spent, position: floor ? walkOver(floor.solids, spent.position, to, PUSH_FEET).at : to }
      }
      return spent
    })
  }
  // Casting a spell gives a hidden caster away, as an attack does. A spell attack spends what was for the next attack only.
  if ("cast" in roll && spellById.get(roll.cast.spell)?.attack && roll.cast.targets[0]) characters = afterAttackRoll(characters, rollerId, roll.cast.targets[0])
  if ("cast" in roll) return characters.map((character) => (character.id === rollerId ? withoutCondition(character, "invisible").character : character))
  if (!("check" in roll) || roll.check.kind !== "skill") return [...characters]
  const { skill } = roll.check
  return characters.map((character) => (character.id === rollerId ? drop(character, (effect) => effect.id === "helped" && effect.skill === skill) : character))
}

// The Push mastery: 10 feet, on a creature that is Large or smaller.
const PUSH_FEET = 10
const PUSHED_SIZES: readonly string[] = ["Tiny", "Small", "Medium", "Large"]

/** What a turn's effects do to a character's movement this turn: Slowed takes 10 feet from their Speed, and one who stood from Prone spent half of it. */
export function movementEffects(character: { turnEffects?: readonly TurnEffect[] }, present?: readonly Acting[]): { slowed: boolean; stands: boolean } {
  const held = (character.turnEffects ?? []).filter((effect) => holds(effect, present))
  return { slowed: held.some((effect) => effect.id === "slowed"), stands: held.some((effect) => effect.id === "stood") }
}

/** What actions left on a character as a round begins: each lasts one round more, and then ends. */
export function turnEffectsAtRoundStart<T extends { turnEffects?: readonly TurnEffect[] }>(character: T): T {
  if (!character.turnEffects?.length) return character
  const turnEffects = character.turnEffects.flatMap((effect) => (effect.turns > 1 ? [{ ...effect, turns: effect.turns - 1 }] : []))
  const { turnEffects: _, ...rest } = character
  return (turnEffects.length ? { ...rest, turnEffects } : rest) as T
}

/** A character as the story moves on to another encounter: nothing an action left comes along. */
export const turnEffectsAtEncounterEnd = <T extends { turnEffects?: readonly TurnEffect[] }>(character: T): T => {
  if (!character.turnEffects) return character
  const { turnEffects: _, ...rest } = character
  return rest as T
}

/** What actions have left on a character, in words for the screen and the game master: "Dodging". */
export function turnEffectWords(character: { turnEffects?: readonly TurnEffect[] }, present?: readonly Acting[]): string {
  return (character.turnEffects ?? [])
    .filter((effect) => ["dodging", "helped", "distracted", "vexed", "slowed"].includes(effect.id) && holds(effect, present))
    .map((effect) =>
      effect.id === "dodging"
        ? "Dodging"
        : effect.id === "helped"
          ? `Helped with ${skillById.get(effect.skill ?? "stealth")?.name}`
          : effect.id === "vexed"
            ? "Vexed"
            : effect.id === "slowed"
              ? "Slowed"
              : "Distracted"
    )
    .join(", ")
}
