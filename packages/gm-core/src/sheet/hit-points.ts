import { deriveSheet } from "./derive"
import type { Sheet } from "./sheet"

export type HitPoints = { current: number; maximum: number }

/**
 * A character's hit points, worked out from its sheet and its health percent.
 *
 * Until combat runs on the rules (stage 4 of plans/srd-rules.md), the game master still wounds and heals in percent,
 * so health percent stays the stored value and hit points follow it. A character with any health left has at least
 * 1 hit point, and only a character at 0 percent has 0.
 */
export function hitPointsOf(character: { sheet?: Sheet; healthPercent?: number }): HitPoints | undefined {
  if (!character.sheet) return undefined
  const maximum = deriveSheet(character.sheet).hitPointMaximum
  const percent = Math.min(100, Math.max(0, character.healthPercent ?? 100))
  const current = percent === 0 ? 0 : Math.max(1, Math.round((maximum * percent) / 100))
  return { current, maximum }
}

/** The health percent that shows `current` of `maximum` hit points: the other direction, for when hit points become the stored value. */
export function healthPercentOf(hitPoints: HitPoints): number {
  if (hitPoints.current <= 0) return 0
  return Math.min(100, Math.max(1, Math.round((hitPoints.current / hitPoints.maximum) * 100)))
}
