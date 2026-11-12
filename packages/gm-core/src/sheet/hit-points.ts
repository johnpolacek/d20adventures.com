import type { Sheet } from "./sheet"
import { combatStatsOf } from "./stat-block"

export type HitPoints = { current: number; maximum: number }

/**
 * Hit points at a health percent. A character with any health left has at least 1 hit point, and only a character at
 * 0 percent has 0.
 */
export function hitPointsAt(maximum: number, healthPercent: number | undefined): HitPoints {
  const percent = Math.min(100, Math.max(0, healthPercent ?? 100))
  const current = percent === 0 ? 0 : Math.max(1, Math.round((maximum * percent) / 100))
  return { current, maximum }
}

/** The health percent that shows `current` of `maximum` hit points. */
export function healthPercentOf(hitPoints: HitPoints): number {
  if (hitPoints.current <= 0) return 0
  return Math.min(100, Math.max(1, Math.round((hitPoints.current / hitPoints.maximum) * 100)))
}

type Wounded = { name?: string; type?: string; sheet?: Sheet; statBlock?: string; hitPoints?: number; healthPercent?: number }

/** A character's hit points now: the stored ones, or for a character that has none yet, its maximum at its health percent. */
export function hitPointsOf(character: Wounded): HitPoints | undefined {
  const maximum = combatStatsOf(character)?.hitPointMaximum
  if (maximum === undefined) return undefined
  if (character.hitPoints === undefined) return hitPointsAt(maximum, character.healthPercent)
  return { current: Math.min(maximum, Math.max(0, Math.round(character.hitPoints))), maximum }
}

const maximumOf = (character: Wounded) => {
  const maximum = combatStatsOf(character)?.hitPointMaximum
  if (maximum === undefined) throw new Error(`${character.name ?? "A character"} has no sheet or stat block, so no hit points`)
  return maximum
}

/**
 * The character at `current` hit points, clamped to 0 and its maximum. Hit points are the stored value, and health
 * percent is a copy of them that only this writes, so the screens and prompts that read it keep working.
 */
export function withHitPoints<T extends Wounded>(character: T, current: number): T & { hitPoints: number; healthPercent: number } {
  if (typeof current !== "number" || Number.isNaN(current)) throw new Error(`${character.name ?? "A character"} has no hit points to set`)
  const maximum = maximumOf(character)
  const hitPoints = Math.min(maximum, Math.max(0, Math.round(current)))
  return { ...character, hitPoints, healthPercent: healthPercentOf({ current: hitPoints, maximum }) }
}

/** How a character enters play: with the hit points it has, or at its maximum when it has none stored. */
export function withStartingHitPoints<T extends Wounded>(character: T): T & { hitPoints: number; healthPercent: number } {
  return withHitPoints(character, character.hitPoints ?? maximumOf(character))
}
