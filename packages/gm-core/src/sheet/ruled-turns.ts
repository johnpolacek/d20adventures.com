import type { TakenAction } from "./actions"
import { type Moved, takeMove } from "./moves"
import type { EncounterFloor } from "./placement"
import { type Bearer, type RuledTurn, spellRule } from "./spell-rules"

/**
 * A turn a spell on its bearer rules (./spell-rules `rulesTurn`): Command's word, Fear's flight. It is taken in place of
 * whatever the bearer would do, a hero's reply or an NPC's own choice, read as a turn that moves where the rule says,
 * with the Dash action where it says, and does nothing more. The rule is told in the story as the turn's ruling.
 */

type Ruled = Bearer & { id: string; name: string; position?: { x: number; y: number } }

/** The turn a spell rules for one, by the first of their spells that rules it, or none where the turn is their own. */
export function ruledTurnOf(character: Ruled, characters: readonly Bearer[]): RuledTurn | undefined {
  const spells = [...new Set([...(character.spellEffects ?? []).map((effect) => effect.spell), ...(character.conditions ?? []).flatMap((entry) => entry.spell ?? [])])]
  for (const id of spells) {
    const ruled = spellRule(id)?.rulesTurn?.(character, characters)
    if (ruled) return ruled
  }
  return undefined
}

/**
 * A ruled turn as the read gives it (../services/roll-requirement-service `TurnReading`): no roll, the move over the
 * floor, the Dash action, and the ruling in words. A flight with nowhere to go is no ruled turn ("unless there is
 * nowhere to move"), and the turn is the bearer's own. With no floor the move is only told.
 */
export function ruledReading(
  character: Ruled,
  characters: readonly (Bearer & { id: string })[],
  floor: EncounterFloor | undefined
): { roll: null; move?: Moved; action?: TakenAction; ruling: { name: string; text: string } } | undefined {
  const ruled = ruledTurnOf(character, characters)
  if (!ruled) return undefined
  const others = characters.filter((other) => other.id !== character.id)
  const moved =
    ruled.move && floor && character.position
      ? takeMove({ floor, mover: character as Parameters<typeof takeMove>[0]["mover"], others: others as Parameters<typeof takeMove>[0]["others"], ask: ruled.move, dash: ruled.dash })
      : undefined
  if (ruled.move?.away && floor && character.position && !moved) return undefined
  return { roll: null, ...(moved ? { move: moved } : {}), ...(ruled.dash ? { action: { action: "dash" as const } } : {}), ruling: { name: ruled.name, text: ruled.text } }
}
