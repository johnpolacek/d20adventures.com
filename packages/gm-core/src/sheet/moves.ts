import type { Size } from "@d20/srd"
import { isAway, isDead, isDown, isIncapacitated } from "../utils/turn-actors"
import { movementEffects } from "./actions"
import type { Afflicted } from "./conditions"
import { floorAreas, floorInPlay, roughGround, sightBlocked } from "./floor-areas"
import type { EncounterFloor } from "./placement"
import { sameSide } from "./sides"
import { movesThroughLarger } from "./species-traits"
import {
  BASE_REACH,
  between,
  type Crowd,
  climbOf,
  heightOf,
  inWater,
  movementBudgetOf,
  moveToward,
  type Point,
  pushed,
  type Rough,
  type Solid,
  type Standing,
  sizeOf,
  solidAt,
  spaceOf,
  spanThrough,
  standingRoom,
  stopShortFor,
  swimsFree,
  walk,
  walkOver,
} from "./space"
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

// To the hundredth of a foot, with no -0 from a point worked out by sine and cosine.
const rounded = (point: Point): Point => ({ x: Math.round(point.x * 100) / 100 + 0, y: Math.round(point.y * 100) / 100 + 0 })

/**
 * The feet a character can move this turn: their Speed, less 10 when Slowed and half when they stood from Prone as the
 * turn began, twice with Dash, and none for one who cannot move.
 */
export const moveBudget = (mover: Mover, others: readonly Other[] = [], dash = false): number =>
  movementBudgetOf(mover, { dash, ...movementEffects(mover, [...others, mover] as Parameters<typeof movementEffects>[1]) })

/**
 * A character's move on their turn, before they act. They walk toward the place or the creature named, or straight
 * away from one, by the floor's ways, as far as their movement goes: their Speed, twice it with Dash, none for one who
 * cannot move, Difficult Terrain costing double. Walking to a creature stops within 5 feet of them, and never on anyone.
 * Water is not walked into, and a move stops at its edge: unless it is bound for a place or a creature in water, and
 * then it swims, each foot costing 1 extra, and 2 extra in Difficult Terrain, but for one with a Swim Speed or wings
 * (SRD 5.2.1, Swimming). With no move named, `close`
 * walks them to within reach of the one they attack in melee, when that one is out of reach. None when they stay where
 * they are, or have no position.
 *
 * Thalbern, Speed 30, 45 feet from Reinhard: asked to close, he walks 30 feet and stands 15 from him. With Dash he
 * walks 40 and stands within 5. Backing up the bank from the Mordava, he stops at the water's edge, and to reach Reinhard
 * 10 feet out in the river he swims, the 10 feet costing 20. `extra` is feet a Bonus Action adds to a move that can be made at all (Instinctive
 * Pounce).
 *
 * `hide` is the Hide action, taken out of sight of the enemies it names by id. A hider goes to the place named when the
 * move reaches it and one may hide there (`hidingCover`), and else into the nearest cover their move reaches
 * (`coverToHide`). None when no cover is in reach, or they are in cover already: `mayHide` tells which.
 */
export function takeMove(args: {
  floor: EncounterFloor
  mover: Mover
  others: readonly Other[]
  ask?: MoveAsk
  dash?: boolean
  close?: { target: string; reach: number }
  extra?: number
  hide?: { from: readonly string[] }
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
  // Over a rail, a sill or a crate no taller than they stand, at climbing's cost.
  const climb = climbOf(args.mover)
  // Across water at swimming's cost, unless they have a Swim Speed. They go into it only to reach a place or someone in it.
  const speed = swimsFree(args.mover)
  // The rest who stand in the way (SRD 5.2.1, Moving around Other Creatures): the one closed with is not, and the dead or one away
  // is in no one's way. One down and alive is Unconscious, so Incapacitated: passed through, at Difficult Terrain's cost. A foe of near size bars the way, and other creatures' spaces are Difficult Terrain.
  const crowd = (except?: string): Crowd[] =>
    args.others.flatMap((other) =>
      other.position && !isAway(other) && !isDead(other) && other.id !== except
        ? [{ at: other.position, size: sizeOf(other), ally: sameSide(args.mover, other), incapacitated: isIncapacitated(other) || isDown(other) }]
        : []
    )
  const walker = { size: sizeOf(args.mover), nimble: movesThroughLarger(args.mover) }
  const someone = (id: string | undefined) => (id ? args.others.find((other) => other.id === id && other.position) : undefined)
  const place = ask.to ? args.floor.places.find((entry) => entry.id === ask.to) : undefined
  if (args.hide) {
    const size = sizeOf(args.mover)
    const enemies = args.others.flatMap((other) => (args.hide?.from.includes(other.id) && other.position && !isAway(other) ? [other.position] : []))
    const areas = floorAreas(everyone)
    // The place named, when the move gets them all the way there and it hides them: the story said they hide there.
    const there = place ? walk(floor, from, place.at, budget, { others: standing, rough, climb, swim: { speed, into: inWater(floor.water, place.at) }, walker, crowd: crowd() }) : undefined
    const reached = there && there.used >= 0.5 && between(there.at, place?.at ?? from) <= BASE_REACH / 2 && hidingCover({ floor, at: rounded(there.at), size, enemies, areas }) ? there : undefined
    const hid = reached ?? coverToHide({ floor, from, size, budget, standing, rough, enemies, areas, ...(speed ? { swims: true } : {}) })
    return hid ? { at: rounded(hid.at), feet: Math.round(hid.used), path: hid.path.map(rounded) } : undefined
  }
  const toward = someone(ask.to) ?? (!place && !ask.away ? someone(args.close?.target) : undefined)
  const fleeing = !place && !toward ? someone(ask.away) : undefined
  let walked: ReturnType<typeof walk> | undefined
  if (place) walked = walk(floor, from, place.at, budget, { others: standing, rough, climb, swim: { speed, into: inWater(floor.water, place.at) }, walker, crowd: crowd() })
  else if (toward?.position) {
    const reach = args.close && args.close.target === toward.id ? args.close.reach : 5
    walked = walk(floor, from, toward.position, budget, {
      stopShort: stopShortFor(sizeOf(args.mover), sizeOf(toward), reach),
      others: standing,
      rough,
      climb,
      swim: { speed, into: inWater(floor.water, toward.position) },
      walker,
      crowd: crowd(toward.id),
    })
  } else if (fleeing?.position) walked = walk(floor, from, pushed(from, fleeing.position, budget), budget, { others: standing, rough, climb, swim: { speed }, walker, crowd: crowd() })
  if (!walked || walked.used < 0.5) return undefined
  return { at: rounded(walked.at), feet: Math.round(walked.used), path: walked.path.map(rounded) }
}

// What hides one who crouches behind it: a solid thing at least half as tall as they stand, or a wall to the ceiling.
const hidesCrouched = (solid: Solid, size: Size): boolean => solid.top === undefined || solid.top >= heightOf(size) / 2

// Feet from a point to a solid thing's edge, 0 on it.
function toEdge(solid: Solid, point: Point): number {
  if (solid.kind === "circle") return Math.max(0, between(solid, point) - solid.radius)
  const dx = point.x - solid.x
  const dy = point.y - solid.y
  const cos = Math.cos(solid.turn)
  const sin = Math.sin(solid.turn)
  return Math.hypot(Math.max(0, Math.abs(dx * cos - dy * sin) - solid.halfWidth), Math.max(0, Math.abs(dx * sin + dy * cos) - solid.halfDepth))
}

// Whether one at a spot is out of sight of a viewer: an area that hides is between them, or a solid thing is. A thing as
// tall as they stand hides them wherever it is on the line. A lower one that hides them crouched does so only on their
// half of it, as cover is read (./space `coverBetween`).
const outOfSight = (solids: readonly Solid[], areas: ReturnType<typeof floorAreas>, viewer: Point, spot: Point, size: Size): boolean =>
  sightBlocked(areas, viewer, spot) ||
  solids.some((solid) => {
    if (toEdge(solid, viewer) === 0 || !hidesCrouched(solid, size)) return false
    const span = spanThrough(solid, viewer, spot)
    return !!span && (solid.top === undefined || solid.top >= heightOf(size) || span[0] >= 0.5)
  })

// Thick growth or the like that hides whoever stands in it: a place the set marks `obscured`, within 5 feet of it.
const inGrowth = (floor: EncounterFloor, spot: Point): boolean => floor.places.some((place) => place.obscured && between(place.at, spot) <= BASE_REACH)

/**
 * Whether one may take the Hide action at a spot, as the rules demand of it (SRD 5.2.1): Heavily Obscured there, or
 * behind cover and out of every enemy's line of sight. Heavily Obscured is thick growth the set marks (`obscured`) or
 * a spell's area that hides what is in it (Fog Cloud, Darkness). Cover is a solid thing within 5 feet that hides them
 * crouched, half their height or taller, with each enemy at `enemies` unable to see them past it or another. The
 * floor holds no light, so the dark of a night scene hides no one by this rule.
 *
 * Thalbern on the forest trail: in the thick ferns he may hide whoever looks on. Behind the mossy boulders he may
 * while the Owlbear is on their far side. In the open clearing he may not.
 */
export function hidingCover(args: { floor: EncounterFloor; at: Point; size: Size; enemies: readonly Point[]; areas: ReturnType<typeof floorAreas> }): boolean {
  const { floor, at, size } = args
  if (inGrowth(floor, at) || sightBlocked(args.areas, at, at)) return true
  return floor.solids.some((solid) => hidesCrouched(solid, size) && toEdge(solid, at) <= BASE_REACH) && args.enemies.every((enemy) => outOfSight(floor.solids, args.areas, enemy, at, size))
}

/**
 * Whether a mover may take the Hide action where they stand, or at `at` where a move has taken them, from the enemies
 * named by id (`hidingCover`). One with no position stands on no floor, and may.
 */
export function mayHide(args: { floor: EncounterFloor; mover: Mover; others: readonly Other[]; from: readonly string[]; at?: Point }): boolean {
  const at = args.at ?? args.mover.position
  if (!at) return true
  const everyone = [args.mover, ...args.others]
  return hidingCover({
    floor: floorInPlay(args.floor, everyone),
    at,
    size: sizeOf(args.mover),
    enemies: args.others.flatMap((other) => (args.from.includes(other.id) && other.position && !isAway(other) ? [other.position] : [])),
    areas: floorAreas(everyone),
  })
}

const ROUND = 16
const FAR = 1000

/**
 * Where one taking the Hide action goes to hide, when no place they reach is named: somewhere they may hide
 * (`hidingCover`), in thick growth or behind a solid thing that hides them crouched, half their height or taller, out
 * of sight of every enemy at `enemies`. A named place that hides them comes first, nearest first, since the set means
 * people to stand there. Then a spot hugging such a thing, the nearest first, a space clear of anyone. Each must be
 * one the move reaches in full. None when they stand in such cover already, or none is in reach.
 *
 * Thalbern at (-3.9, 41) on the forest trail, Speed 30, no enemy placed: the mossy boulders, 3½ feet tall and 11 feet
 * off, are cover, and he walks to them.
 */
export function coverToHide(args: {
  floor: EncounterFloor
  from: Point
  size: Size
  budget: number
  standing: readonly Point[]
  rough: readonly Rough[]
  enemies: readonly Point[]
  areas: ReturnType<typeof floorAreas>
  /** They swim at no extra cost (`swimsFree`). */
  swims?: boolean
}): { at: Point; used: number; path: Point[] } | undefined {
  const { floor, from, size, budget } = args
  const hiding = floor.solids.filter((solid) => hidesCrouched(solid, size) && toEdge(solid, from) <= budget)
  const covered = (spot: Point) => hidingCover({ floor, at: spot, size, enemies: args.enemies, areas: args.areas })
  if (covered(from)) return undefined
  const clear = (spot: Point) => !solidAt(floor.solids, spot) && args.standing.every((other) => between(other, spot) >= BASE_REACH - 1e-6) && covered(spot)
  const near = (spots: Point[]) => spots.filter((spot) => between(from, spot) <= budget && clear(spot)).sort((a, b) => between(from, a) - between(from, b))
  const places = near(floor.places.map((place) => place.at))
  // Round each thing, a half space off its edge.
  const hug = spaceOf(size) / 2
  const hugging = near(
    hiding.flatMap((solid) =>
      Array.from({ length: ROUND }, (_, index) => {
        const way = { x: Math.sin((index * 2 * Math.PI) / ROUND), y: Math.cos((index * 2 * Math.PI) / ROUND) }
        const edge = solid.kind === "circle" ? solid.radius : (spanThrough(solid, solid, { x: solid.x + way.x * FAR, y: solid.y + way.y * FAR })?.[1] ?? 0) * FAR
        return { x: solid.x + way.x * (edge + hug), y: solid.y + way.y * (edge + hug) }
      })
    )
  )
  for (const spot of [...places, ...hugging]) {
    const walked = walk(floor, from, spot, budget, { others: args.standing, rough: args.rough, swim: { speed: args.swims } })
    // Where the walk ends is what must hide them: a step short of the spot may be in an enemy's sight.
    if (walked.used >= 0.5 && between(walked.at, spot) <= 1 && covered(rounded(walked.at))) return walked
  }
  return undefined
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
