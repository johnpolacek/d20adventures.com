import type { AbilityId } from "@d20/srd"
import { monsterById } from "@d20/srd/monsters"
import type { Monster } from "@d20/srd/schema/monsters"
import type { Shape } from "../types/character"
import { isDead, isDown, isIncapacitated } from "../utils/turn-actors"
import type { Roller } from "./check"
import { spellRule } from "./spell-rules"

/**
 * A hero in a Beast's shape, by Wild Shape (SRD 5.2.1, p. 42): "Your game statistics are replaced by the Beast's stat
 * block, but you retain your creature type; Hit Points; Hit Point Dice; Intelligence, Wisdom, and Charisma scores;
 * class features; languages; and feats." The shape is kept on the character (`shape`), and the shared rules read it
 * here: the stat block's attacks and Multiattack (./attack, ./multiattack), Armor Class (./stat-block), Speed and size
 * (./space), damage defenses (./attack), traits (./monster-traits), and Strength, Dexterity and Constitution for
 * checks, saves and Initiative (./check, ./stat-block). The hero keeps their own hit points and everything else.
 *
 * A shape a spell gives (Polymorph, Shapechange, Animal Shapes) names the spell and its caster, and goes the same path.
 * What differs is the spell's (./spell-rules `shape`): whether the form's scores replace all six or the hero keeps their
 * mind, and whether they may cast. It holds until the spell ends or its bearer dies (./masters `freedFrom`), not on
 * the Incapacitated condition. An NPC's shape is read from ./blocks `blockOf`.
 */

/** The abilities a shape gives its own scores for. Intelligence, Wisdom and Charisma stay the hero's. */
export const SHAPED_ABILITIES: readonly AbilityId[] = ["str", "dex", "con"]

type Shaped = Roller & { hitPoints?: number; healthPercent?: number; dead?: true; shape?: Shape }

/**
 * The stat block a hero's game statistics are taken from now: the shape they hold. None for one in their own shape or
 * an NPC. Wild Shape's ends when its bearer has the Incapacitated condition or drops to 0 hit points, so one who is
 * Incapacitated or down has none, though the field stays until the round turns (./classes/wild-shape). A spell's holds
 * while they live.
 */
export function shapeOf(character: Shaped): Monster | undefined {
  if (!character.sheet || !character.shape || isDead(character)) return undefined
  if (!character.shape.spell && (isDown(character) || isIncapacitated(character))) return undefined
  return monsterById.get(character.shape.form)
}

/**
 * The ability modifiers a hero has now: their own, with a shape's Strength, Dexterity and Constitution in place of
 * theirs, or all six where the spell that gave it replaces them (`held`, Polymorph).
 */
export function shapedModifiers(own: Record<AbilityId, number>, shape: Monster | undefined, held?: Shape): Record<AbilityId, number> {
  if (!shape) return own
  const abilities: readonly AbilityId[] = held?.spell && !spellRule(held.spell)?.shape?.keepsMind ? ["str", "dex", "con", "int", "wis", "cha"] : SHAPED_ABILITIES
  return { ...own, ...Object.fromEntries(abilities.map((ability) => [ability, shape.abilities[ability].mod])) }
}

/** Why one in a shape a spell gave cannot cast spells, or none where they can: Shapechange keeps its bearer's Spellcasting. */
export function shapeBarsCasting(character: Shaped & { name?: string }): string | undefined {
  const held = character.shape
  const form = held?.spell && (character.sheet ? shapeOf(character) : !isDead(character) ? monsterById.get(held.form) : undefined)
  if (!held?.spell || !form || spellRule(held.spell)?.shape?.casts) return undefined
  return `${character.name ?? "They"} cannot cast spells in the shape of a ${form.name}.`
}
