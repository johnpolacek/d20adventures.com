import { isDead } from "../utils/turn-actors"
import type { Sheet } from "./sheet"

// Whether a hero is owed a level, kept apart from the level's maths (./milestone) so a screen can ask without loading
// the rules data.

/** The highest level the engine's features run to. */
export const LEVEL_CAP = 5

export type Levelling = { type: string; name?: string; sheet?: Sheet; milestones?: string[]; hitPoints?: number; healthPercent?: number; dead?: true }

/** Whether a finished adventure owes a hero a level: they lived, it has not given them one, and they are below the cap. */
export function levelOwed(hero: Levelling, adventureId: string, completed: boolean): boolean {
  return completed && hero.type === "pc" && !!hero.sheet && hero.sheet.level < LEVEL_CAP && !isDead(hero) && !hero.milestones?.includes(adventureId)
}
