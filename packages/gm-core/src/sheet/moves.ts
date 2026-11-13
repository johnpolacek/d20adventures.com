import { isAway } from "../utils/turn-actors"
import { movementEffects } from "./actions"
import type { Afflicted } from "./conditions"
import { floorAreas, floorInPlay, roughGround, sightBlocked } from "./floor-areas"
import type { EncounterFloor } from "./placement"
import { between, movementBudgetOf, moveToward, type Point, pushed, type Standing, sizeOf, solidAt, standingRoom, stopShortFor, walk, walkOver } from "./space"
import type { TurnEffect } from "./turn-effect"

/** Where a move is read as going: to a named place or to someone, by id, or straight away from someone, and no farther than some feet. */
export type MoveAsk = { to?: string; away?: string; feet?: number }

/**
 * A move as the engine made it: where the character now stands, the feet it took, and the points it walked through,
 * the last of them where it stands. `teleport`: it walked nothing, and its one point is where it landed (`takeTeleport`).
 */
export type Moved = { at: Point; feet: number; path: Point[]; teleport?: true }

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
 * cannot move, Difficult Terrain costing double. Walking to a creature stops within 5 feet of them, and never on anyone. With no move named, `close`
 * walks them to within reach of the one they attack in melee, when that one is out of reach. None when they stay where
 * they are, or have no position.
 *
 * Thalbern, Speed 30, 45 feet from Reinhard: asked to close, he walks 30 feet and stands 15 from him. With Dash he
 * walks 40 and stands within 5. `extra` is feet a Bonus Action adds to a move that can be made at all (Instinctive
 * Pounce).
 */
export function takeMove(args: {
  floor: EncounterFloor
  mover: Mover
  others: readonly Other[]
  ask?: MoveAsk
  dash?: boolean
  close?: { target: string; reach: number }
  extra?: number
}): Moved | undefined {
  const from = args.mover.position
  if (!from) return undefined
  const ask = args.ask ?? {}
  const own = moveBudget(args.mover, args.others, args.dash)
  const budget = Math.min(own > 0 ? own + (args.extra ?? 0) : 0, ask.feet !== undefined && ask.feet > 0 ? ask.feet : Number.POSITIVE_INFINITY)
  if (budget <= 0) return undefined
  // One away for now is in no one's way (../utils/turn-actors `isAway`).
  const standing = args.others.flatMap((other) => (other.position && !isAway(other) ? [other.position] : []))
  // The walls that stand in play, and the ground that costs more to cross (./floor-areas: Wall of Force, Web).
  const everyone = [args.mover, ...args.others]
  const floor = floorInPlay(args.floor, everyone)
  const rough = roughGround(floorAreas(everyone))
  const someone = (id: string | undefined) => (id ? args.others.find((other) => other.id === id && other.position) : undefined)
  const place = ask.to ? args.floor.places.find((entry) => entry.id === ask.to) : undefined
  const toward = someone(ask.to) ?? (!place && !ask.away ? someone(args.close?.target) : undefined)
  const fleeing = !place && !toward ? someone(ask.away) : undefined
  let walked: ReturnType<typeof walk> | undefined
  if (place) walked = walk(floor, from, place.at, budget, { others: standing, rough })
  else if (toward?.position) {
    const reach = args.close && args.close.target === toward.id ? args.close.reach : 5
    walked = walk(floor, from, toward.position, budget, { stopShort: stopShortFor(sizeOf(args.mover), sizeOf(toward), reach), others: standing, rough })
  } else if (fleeing?.position) walked = walk(floor, from, pushed(from, fleeing.position, budget), budget, { others: standing, rough })
  if (!walked || walked.used < 0.5) return undefined
  return { at: rounded(walked.at), feet: Math.round(walked.used), path: walked.path.map(rounded) }
}

/**
 * A teleport of the mover's own, made by a spell in place of their move (./spell-rules `teleports`): to the place or the
 * creature the move names, or straight away from one, with no walk, as far as `feet`. It lands on a clear spot, beside
 * one named and on no one, nor on anything solid. With `sees` it goes only as far as they can see on the way: up to the
 * first solid thing, and never into or through an area that hides what is in it. Away from one with no feet named, no
 * farther than the floor's farthest named place or staged spot. None when it goes nowhere.
 *
 * Lyra at (0, 0) with Misty Step's 30 feet, named to a Bandit at 50 feet: she lands 30 feet toward him. A wall at 20
 * feet stops her before it, since she cannot see past it. With Dimension Door's 500 she lands beside him through it.
 */
export function takeTeleport(args: { floor: EncounterFloor; mover: Standing; others: readonly Other[]; ask: MoveAsk; feet: number; sees?: boolean }): Moved | undefined {
  const from = args.mover.position
  if (!from) return undefined
  const everyone = [args.mover, ...args.others]
  const solids = floorInPlay(args.floor, everyone).solids
  const someone = (id: string | undefined) => (id ? args.others.find((other) => other.id === id && other.position && !isAway(other)) : undefined)
  const place = args.ask.to ? args.floor.places.find((entry) => entry.id === args.ask.to) : undefined
  const toward = place ? undefined : someone(args.ask.to)
  const fleeing = place || toward ? undefined : someone(args.ask.away)
  // Straight away from one with no feet named goes no farther than the floor reaches: its farthest named place or staged spot.
  const spots = [...args.floor.places.map((entry) => entry.at), ...args.floor.cast.map((entry) => entry.at), ...args.floor.party.map((entry) => entry.at), ...args.floor.spare]
  const reach = fleeing && args.ask.feet === undefined && spots.length ? Math.max(...spots.map((spot) => between(from, spot))) : Number.POSITIVE_INFINITY
  const most = Math.min(args.feet, reach, args.ask.feet !== undefined && args.ask.feet > 0 ? args.ask.feet : Number.POSITIVE_INFINITY)
  // Beside one named, on the mover's side of them.
  const goal =
    place?.at ??
    (toward?.position ? moveToward(toward.position, from, Math.min(stopShortFor(sizeOf(args.mover), sizeOf(toward)), between(from, toward.position))).at : undefined) ??
    (fleeing?.position ? pushed(from, fleeing.position, most) : undefined)
  if (!goal) return undefined
  let at = between(from, goal) > most ? moveToward(from, goal, most).at : goal
  // What they can see: up to the first solid thing, and short of an area that hides.
  if (args.sees) {
    at = walkOver(solids, from, at, Number.POSITIVE_INFINITY).at
    const areas = floorAreas(everyone)
    while (between(from, at) > 0.5 && sightBlocked(areas, from, at)) at = moveToward(from, at, Math.max(0, between(from, at) - 5)).at
  }
  // A clear spot: on no one, and on nothing solid.
  const standing = args.others.flatMap((other) => (other.position && !isAway(other) ? [other.position] : []))
  let spot = standingRoom(solids, standing, from, at)
  while (solidAt(solids, spot) && between(from, spot) > 0.5) spot = moveToward(from, spot, Math.max(0, between(from, spot) - 1)).at
  const feet = between(from, spot)
  if (feet < 0.5 || feet > args.feet + 5) return undefined
  return { at: rounded(spot), feet: Math.round(feet), path: [rounded(spot)], teleport: true }
}

/** The mover where a move left them. */
export const withMove = <T extends Standing>(character: T, moved: Moved | undefined): T => (moved ? { ...character, position: moved.at } : character)
