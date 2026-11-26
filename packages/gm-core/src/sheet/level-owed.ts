import { isDead } from "../utils/turn-actors"
import { type Sided, sideOf } from "./sides"
import type { Sheet } from "./sheet"

// Whether a hero is owed a level, kept apart from the level's maths (./milestone) so a screen can ask without loading
// the rules data.

/** The highest level a hero may reach: the SRD's 20. */
export const LEVEL_CAP = 20

export type Levelling = { type: string; name?: string; sheet?: Sheet; levelDue?: number; hitPoints?: number; healthPercent?: number; dead?: true }

/** Whether a hero is owed a level: they live, and they are below the level due to them and below the cap. */
export function levelOwed(hero: Levelling): boolean {
  return hero.type === "pc" && !!hero.sheet && !isDead(hero) && hero.levelDue !== undefined && hero.sheet.level < Math.min(hero.levelDue, LEVEL_CAP)
}

/** A hero with the level due to them: kept while they are below it, and gone once they have reached it. */
export function withLevelDue<T extends Levelling>(hero: T, level: number): T {
  const { levelDue: _, ...rest } = hero
  return (hero.type === "pc" && hero.sheet && hero.sheet.level < Math.min(level, LEVEL_CAP) ? { ...rest, levelDue: level } : rest) as T
}

type Fought = { story?: readonly { kind: string; attack?: unknown; effect?: unknown }[]; characters: readonly (Sided & { dead?: true; fled?: true })[] }

/**
 * Whether a fight is on, so no level is taken, as in BG3: the round just told had an attack or a spell's effect, and a
 * foe of the party still stands in the scene. The level waits for the round the fight ends in.
 */
export function inFight(turn: Fought): boolean {
  const struck = (turn.story ?? []).some((beat) => (beat.kind === "roll" && !!beat.attack) || (beat.kind === "action" && !!beat.effect))
  return struck && turn.characters.some((character) => sideOf(character) === "foe" && !character.dead && !character.fled)
}
