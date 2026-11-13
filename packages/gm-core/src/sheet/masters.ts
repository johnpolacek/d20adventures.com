import { spellById } from "@d20/srd/spells"
import type { Master, Shape } from "../types/character"
import { sideOf } from "./sides"
import { spellRule } from "./spell-rules"

/**
 * Creatures a spell binds to another (../types/character `master`): one it summons into the encounter (Summon Dragon,
 * Find Familiar, ./summoned), and one it dominates (Dominate Person). Either stands on its master's side (./sides) while
 * the spell lasts. As the spell ends, one summoned is gone from the encounter, and one dominated is its own again.
 */

/** The side a spell binds a creature to: its master's own. */
export const masterOf = (master: { id: string; type?: string; side?: "party" | "none"; master?: Master }, spell: string, summoned?: true): Master => ({
  id: master.id,
  spell,
  side: sideOf(master),
  ...(summoned ? { summoned } : {}),
})

/**
 * A character as a spell that bound them ends, by its id and its caster's: one it summoned is gone from the encounter,
 * one it dominated is their own again, and a shape it gave falls away with the Temporary Hit Points that came with it
 * ("These Temporary Hit Points vanish if any remain when the spell ends"). One it did not bind is as they were.
 */
export function freedFrom<T extends { master?: Master; shape?: Shape; tempHitPoints?: number; fled?: true }>(character: T, ended: (spell: string, by: string | undefined) => boolean): T {
  let after = character
  if (after.master && ended(after.master.spell, after.master.id)) {
    const { master, ...rest } = after
    after = (master.summoned ? { ...rest, fled: true } : rest) as T
  }
  if (after.shape?.spell && ended(after.shape.spell, after.shape.by)) {
    const { shape: _, tempHitPoints: __, ...rest } = after
    after = rest as T
  }
  return after
}

/**
 * Whom a creature acts for, in words for the model that writes its turn, or none for one who acts for themselves. It
 * outranks what the creature would do of itself, and says what it does with no command (../spell-rules `idle`).
 */
export function boundWords(character: { name: string; master?: Master }, characters: readonly { id: string; name: string }[]): string | undefined {
  const master = character.master
  if (!master) return undefined
  const by = characters.find((other) => other.id === master.id)?.name ?? "their master"
  const spell = spellById.get(master.spell)?.name ?? master.spell
  const idle = spellRule(master.spell)?.idle
  const otherwise = idle ? ` With no command from ${by} to follow, ${idle}.` : ""
  return master.summoned
    ? `${character.name} was called by ${by}'s ${spell} and obeys ${by}: it does what ${by} last told it in the story, and fights for ${by}'s side.${otherwise} This outranks anything else about how ${character.name} acts.`
    : `${character.name} is dominated by ${by}'s ${spell}: on this turn ${character.name} does their best to obey ${by}'s latest command in the story, and acts for ${by}'s side.${otherwise} This outranks anything else about how ${character.name} acts.`
}
