import type { AbilityId } from "@d20/srd"
import { monsterById } from "@d20/srd/monsters"
import type { Monster } from "@d20/srd/schema/monsters"
import type { Shape } from "../types/character"
import { isDown, isIncapacitated } from "../utils/turn-actors"
import type { Roller } from "./check"

/**
 * A hero in a Beast's shape, by Wild Shape (SRD 5.2.1, p. 42): "Your game statistics are replaced by the Beast's stat
 * block, but you retain your creature type; Hit Points; Hit Point Dice; Intelligence, Wisdom, and Charisma scores;
 * class features; languages; and feats." The shape is kept on the character (`shape`), and the shared rules read it
 * here: the stat block's attacks and Multiattack (./attack, ./multiattack), Armor Class (./stat-block), Speed and size
 * (./space), damage defenses (./attack), traits (./monster-traits), and Strength, Dexterity and Constitution for
 * checks, saves and Initiative (./check, ./stat-block). The hero keeps their own hit points and everything else.
 */

/** The abilities a shape gives its own scores for. Intelligence, Wisdom and Charisma stay the hero's. */
export const SHAPED_ABILITIES: readonly AbilityId[] = ["str", "dex", "con"]

type Shaped = Roller & { hitPoints?: number; healthPercent?: number; dead?: true; shape?: Shape }

/**
 * The stat block a hero's game statistics are taken from now: the shape they hold. None for one in their own shape or
 * an NPC. A shape ends when its bearer has the Incapacitated condition or dies, so one who is Incapacitated or down has
 * none, though the field stays until the round turns (./classes/wild-shape).
 */
export function shapeOf(character: Shaped): Monster | undefined {
  if (!character.sheet || !character.shape || isDown(character) || isIncapacitated(character)) return undefined
  return monsterById.get(character.shape.form)
}

/** The ability modifiers a hero has now: their own, with a shape's Strength, Dexterity and Constitution in place of theirs. */
export function shapedModifiers(own: Record<AbilityId, number>, shape: Monster | undefined): Record<AbilityId, number> {
  if (!shape) return own
  return { ...own, ...Object.fromEntries(SHAPED_ABILITIES.map((ability) => [ability, shape.abilities[ability].mod])) }
}
