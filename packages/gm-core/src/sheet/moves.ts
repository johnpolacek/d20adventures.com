import { movementEffects } from "./actions"
import type { Afflicted } from "./conditions"
import type { EncounterFloor } from "./placement"
import { movementBudgetOf, type Point, pushed, type Standing, sizeOf, stopShortFor, walk } from "./space"
import type { TurnEffect } from "./turn-effect"

/** Where a move is read as going: to a named place or to someone, by id, or straight away from someone, and no farther than some feet. */
export type MoveAsk = { to?: string; away?: string; feet?: number }

/** A move as the engine made it: where the character now stands, the feet it took, and the points it walked through, the last of them where it stands. */
export type Moved = { at: Point; feet: number; path: Point[] }

type Mover = Afflicted & Standing & { turnEffects?: readonly TurnEffect[] }
type Other = Standing & { id: string }

const rounded = (point: Point): Point => ({ x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100 })

/**
 * The feet a character can move this turn: their Speed, less 10 when Slowed and half when they stood from Prone as the
 * turn began, twice with Dash, and none for one who cannot move.
 */
export const moveBudget = (mover: Mover, others: readonly Other[] = [], dash = false): number =>
  movementBudgetOf(mover, { dash, ...movementEffects(mover, [...others, mover] as Parameters<typeof movementEffects>[1]) })

/**
 * A character's move on their turn, before they act. They walk toward the place or the creature named, or straight
 * away from one, by the floor's ways, as far as their movement goes: their Speed, twice it with Dash, none for one who
 * cannot move. Walking to a creature stops within 5 feet of them, and never on anyone. With no move named, `close`
 * walks them to within reach of the one they attack in melee, when that one is out of reach. None when they stay where
 * they are, or have no position.
 *
 * Thalbern, Speed 30, 45 feet from Reinhard: asked to close, he walks 30 feet and stands 15 from him. With Dash he
 * walks 40 and stands within 5.
 */
export function takeMove(args: { floor: EncounterFloor; mover: Mover; others: readonly Other[]; ask?: MoveAsk; dash?: boolean; close?: { target: string; reach: number } }): Moved | undefined {
  const from = args.mover.position
  if (!from) return undefined
  const ask = args.ask ?? {}
  const budget = Math.min(moveBudget(args.mover, args.others, args.dash), ask.feet !== undefined && ask.feet > 0 ? ask.feet : Number.POSITIVE_INFINITY)
  if (budget <= 0) return undefined
  const standing = args.others.flatMap((other) => (other.position ? [other.position] : []))
  const someone = (id: string | undefined) => (id ? args.others.find((other) => other.id === id && other.position) : undefined)
  const place = ask.to ? args.floor.places.find((entry) => entry.id === ask.to) : undefined
  const toward = someone(ask.to) ?? (!place && !ask.away ? someone(args.close?.target) : undefined)
  const fleeing = !place && !toward ? someone(ask.away) : undefined
  let walked: ReturnType<typeof walk> | undefined
  if (place) walked = walk(args.floor, from, place.at, budget, { others: standing })
  else if (toward?.position) {
    const reach = args.close && args.close.target === toward.id ? args.close.reach : 5
    walked = walk(args.floor, from, toward.position, budget, { stopShort: stopShortFor(sizeOf(args.mover), sizeOf(toward), reach), others: standing })
  } else if (fleeing?.position) walked = walk(args.floor, from, pushed(from, fleeing.position, budget), budget, { others: standing })
  if (!walked || walked.used < 0.5) return undefined
  return { at: rounded(walked.at), feet: Math.round(walked.used), path: walked.path.map(rounded) }
}

/** The mover where a move left them. */
export const withMove = <T extends Standing>(character: T, moved: Moved | undefined): T => (moved ? { ...character, position: moved.at } : character)
