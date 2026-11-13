import type { Size } from "@d20/srd"
import type { Attack } from "./attack"
import { blockOf } from "./blocks"
import type { Roller } from "./check"
import { type Afflicted, cannotMove, exhaustionOf } from "./conditions"
import { deriveSheet } from "./derive"
import { speciesById } from "./house-species"
import { featureSpeed } from "./late-rules"
import { shapeOf } from "./shape"

/**
 * Space: distance, reach, range, movement, Opportunity Attacks and areas of effect, by the SRD 5.2.1, as plain maths.
 * There is no grid. A position is a point on a flat plane, measured in feet, with no elevation. A creature stands at
 * the centre of a round space as wide as its size's square.
 */

/** A position on the flat plane, in feet. */
export type Point = { x: number; y: number }

/** Something placed: where its centre is, and its size. No size reads as Medium. */
export type Placed = { at: Point; size?: Size }

/** How far past a distance still counts as within it: walking up to someone stops a little short or long of exactly 5 feet. */
export const TOLERANCE = 0.5

/** Feet in a metre, for a host that draws in metres. */
export const FEET_PER_METRE = 3.28084

/** Metres in feet: 3 metres is about 9.84 feet. */
export const feet = (inMetres: number): number => inMetres * FEET_PER_METRE

/** Feet in metres: 30 feet is about 9.14 metres. */
export const metres = (inFeet: number): number => inFeet / FEET_PER_METRE

const SPACE: Record<Size, number> = { Tiny: 2.5, Small: 5, Medium: 5, Large: 10, Huge: 15, Gargantuan: 20 }

/** The width of the space a creature of a size takes, in feet: Tiny 2½, Small and Medium 5, Large 10, Huge 15, Gargantuan 20. */
export const spaceOf = (size: Size = "Medium"): number => SPACE[size]

/**
 * The size a character takes up. An NPC's is the first its stat block prints: a Guard's "Medium or Small" is Medium.
 * A hero's is the one their sheet names, or else their species' first.
 */
export function sizeOf(character: Roller): Size {
  // A hero in a Beast's shape takes up the stat block's space (./shape).
  const shape = shapeOf(character)
  if (shape) return shape.size[0] ?? "Medium"
  if (character.sheet) return character.sheet.size ?? speciesById.get(character.sheet.species)?.sizes[0]?.size ?? "Medium"
  if (character.type !== "npc") return "Medium"
  return blockOf(character)?.size[0] ?? "Medium"
}

// How far a creature's space reaches past a 5-foot square on each side: 2.5 feet for a Large one, none for a Tiny one.
const beyondSquare = (size: Size | undefined) => Math.max(0, spaceOf(size) - 5) / 2

/** The straight distance between two points: 3 feet across and 4 feet up is 5 feet. */
export const between = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y)

/**
 * The distance between two creatures, as a grid would read it: the gap between their spaces plus 5 feet, never below
 * 0. Two Medium creatures whose centres are 5 feet apart are 5 feet from each other. A Large creature whose centre is
 * 7.5 feet from a Medium one's is 7.5 − 2.5 − 0 = 5 feet away. A Tiny creature shares a square on a grid, and is
 * measured as if it filled one: a Tiny one 5 feet from a Medium one is 5 feet away.
 */
export function distance(a: Placed, b: Placed): number {
  return Math.max(0, between(a.at, b.at) - beyondSquare(a.size) - beyondSquare(b.size))
}

/** Whether two creatures are within some feet of each other, half a foot either way: Medium ones 5.4 feet apart are within 5 feet. */
export const within = (a: Placed, b: Placed, feet: number): boolean => distance(a, b) <= feet + TOLERANCE

/** A character who may stand somewhere on the floor. */
export type Standing = Roller & { position?: Point }

/** A character as the maths of space reads it: where it stands and its size. None for one with no position. */
export const placedOf = (character: Standing): Placed | undefined => (character.position ? { at: character.position, size: sizeOf(character) } : undefined)

/** How far two characters are from each other, in feet. Unknown when either has no position. */
export function feetBetween(a: Standing, b: Standing): number | undefined {
  const from = placedOf(a)
  const to = placedOf(b)
  return from && to ? distance(from, to) : undefined
}

/**
 * Whether an attacker is within 5 feet of its target, for the rules that turn on it: Prone, Paralyzed, Unconscious.
 * Where either has no position, a melee attack is read as made from within 5 feet and a ranged one from farther.
 */
export function isNear(attacker: Standing, target: Standing, kind: Attack["kind"]): boolean {
  const from = placedOf(attacker)
  const to = placedOf(target)
  return from && to ? within(from, to, 5) : kind !== "ranged"
}

/** A creature's reach unless a rule says otherwise. */
export const BASE_REACH = 5

/** How far an attack reaches: a melee attack's reach, and a ranged or thrown attack's normal and long range. A single range has no long range. */
export type AttackDistances = Pick<Attack, "reach" | "range">

/**
 * Where a target stands for an attack. "reach": within a melee attack's reach. "normal": within a ranged attack's
 * normal range. "long": beyond normal range and within long range, so the roll has Disadvantage. "out": beyond both,
 * so the attack cannot be made. A thrown weapon in reach is read as a melee attack.
 */
export type AttackBand = "reach" | "normal" | "long" | "out"

/**
 * Whether an attack can reach a target this many feet away. A Spear (reach 5, range 20/60) at 5 feet is in reach, at
 * 15 is in normal range, at 40 is at long range with Disadvantage, and at 70 is out of range.
 */
export function attackReach(args: { distance: number } & AttackDistances): AttackBand {
  const near = (feet: number) => args.distance <= feet + TOLERANCE
  if (args.reach !== undefined && near(args.reach)) return "reach"
  if (!args.range) return "out"
  if (near(args.range.normal)) return "normal"
  return args.range.long !== undefined && near(args.range.long) ? "long" : "out"
}

/** One who may spoil a ranged attack: whether they are the attacker's enemy, can see the attacker, and are Incapacitated. */
export type Bystander = Placed & { hostile: boolean; seesAttacker: boolean; incapacitated: boolean }

/**
 * A ranged attack roll has Disadvantage when the attacker is within 5 feet of an enemy who can see them and is not
 * Incapacitated. An archer with a Goblin beside them shoots with Disadvantage, and with a sleeping Goblin beside them does not.
 */
export const rangedInCloseCombat = (attacker: Placed, others: readonly Bystander[]): boolean =>
  others.some((other) => other.hostile && other.seesAttacker && !other.incapacitated && within(attacker, other, 5))

/** A character's Speed in feet: a hero's from its sheet, an NPC's walking Speed from its stat block. A hero with no sheet has none. */
export function speedOf(character: Roller): number | undefined {
  // A hero in a Beast's shape moves at the stat block's walking Speed, or its Fly Speed where that is more: the floor is
  // flat, so flying is moving, as with Dragon Wings (./shape). A Swim Speed finds no water on the floor.
  const shape = shapeOf(character)
  if (shape) return Math.max(shape.speed.walk, shape.speed.fly ?? 0)
  // A feature may give a Speed beyond their own while it lasts (Dragon Wings' Fly Speed), by ./late-rules.
  if (character.sheet) return Math.max(deriveSheet(character.sheet).speed, featureSpeed(character) ?? 0)
  if (character.type !== "npc") return undefined
  return blockOf(character)?.speed.walk
}

/** What the Slow mastery takes from a creature's Speed until the start of the attacker's next turn. Hits from several weapons take no more. */
export const SLOW_FEET = 10

/**
 * The feet a character can move this turn. Speed loses 5 feet for each level of Exhaustion and 10 for the Slow
 * mastery, to no less than 0, and is 0 for one who cannot move. Dash adds that Speed again. Standing from Prone costs
 * half that Speed, rounded down, and one with a Speed of 0 cannot stand. A Speed of 30 with Dash, standing up, is
 * 30 + 30 − 15 = 45 feet. `reduced` is feet a class feature takes off the Speed besides (Hamstring Blow's 15).
 */
export function movementBudget(args: { speed: number; cannotMove?: boolean; dash?: boolean; stands?: boolean; slowed?: boolean; halved?: boolean; reduced?: number; exhaustion?: number }): number {
  if (args.cannotMove) return 0
  // A Speed halved (a Stunning Strike saved against) is halved first, rounded down: 30 becomes 15.
  const base = args.halved ? Math.floor(args.speed / 2) : args.speed
  const speed = Math.max(0, base - (args.slowed ? SLOW_FEET : 0) - (args.reduced ?? 0) - 5 * (args.exhaustion ?? 0))
  return Math.max(0, speed * (args.dash ? 2 : 1) - (args.stands ? Math.floor(speed / 2) : 0))
}

/** The feet a character can move this turn, read from the character: its Speed, whether it can move, and its Exhaustion. */
export function movementBudgetOf(character: Afflicted & Roller, options: { dash?: boolean; stands?: boolean; slowed?: boolean; halved?: boolean; reduced?: number } = {}): number {
  return movementBudget({ speed: speedOf(character) ?? 0, cannotMove: cannotMove(character), exhaustion: exhaustionOf(character), ...options })
}

/**
 * Walk straight toward a point, no farther than the feet given, and stop `stopShort` feet short of it. From (0, 0)
 * toward (20, 0) with 30 feet, stopping 5 short, ends at (15, 0) having used 15.
 */
export function moveToward(from: Point, to: Point, feet: number, stopShort = 0): { at: Point; used: number } {
  const gap = between(from, to)
  const used = Math.max(0, Math.min(feet, gap - stopShort))
  if (used === 0) return { at: { ...from }, used: 0 }
  return { at: { x: from.x + ((to.x - from.x) * used) / gap, y: from.y + ((to.y - from.y) * used) / gap }, used }
}

/**
 * How far short of a creature's centre a mover stops to stand within some feet of it, as `distance` reads it. A
 * Medium creature closing to 5 feet of a Large one stops 5 + 0 + 2.5 = 7.5 feet from its centre.
 */
export const stopShortFor = (mover: Size | undefined, target: Size | undefined, feet = BASE_REACH): number => feet + beyondSquare(mover) + beyondSquare(target)

/**
 * Where the Push mastery leaves a creature: straight away from the one who pushed it, up to the feet given. A creature
 * at (5, 0) pushed 10 feet by one at (0, 0) ends at (15, 0). One standing on the pusher's very point has no away, and stays.
 */
export function pushed(from: Point, awayFrom: Point, feet: number): Point {
  const gap = between(awayFrom, from)
  if (gap === 0) return { ...from }
  return { x: from.x + ((from.x - awayFrom.x) * feet) / gap, y: from.y + ((from.y - awayFrom.y) * feet) / gap }
}

// The point of a segment nearest a point.
function nearestOnSegment(from: Point, to: Point, point: Point): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = dx * dx + dy * dy
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / length))
  return { x: from.x + t * dx, y: from.y + t * dy }
}

/** A move along a straight path. A forced move (shoved, hurled) or a Teleport is not made with the mover's movement. */
export type Move = { from: Point; to: Point; size?: Size; disengaged?: boolean; forced?: boolean; teleport?: boolean }

/** One who might make an Opportunity Attack: where it stands, its melee reach, and whether it can and would. */
export type Watcher = Placed & { reach: number; hostile: boolean; canReact: boolean; seesMover: boolean }

/**
 * Who gets an Opportunity Attack on a move: each enemy who can see the mover and has its Reaction, whose reach the
 * mover leaves. No one does when the mover took the Disengage action, Teleports, or is moved without its own movement.
 * Stepping around inside someone's reach and staying there does not leave it.
 *
 * The SRD triggers on leaving reach, not on where the move starts. A mover who starts outside someone's reach, passes
 * through it and comes out the other side has left it too. So this reads the whole path: the creature's reach is a
 * circle, and a straight path is inside it for one stretch at most, so the mover left it exactly when the path's closest
 * approach is within reach and its end is not. One who ends inside reach has not left it, however it came in.
 */
export function opportunityAttackers<T extends Watcher>(move: Move, others: readonly T[]): T[] {
  if (move.disengaged || move.forced || move.teleport) return []
  return others.filter((other) => {
    if (!other.hostile || !other.canReact || !other.seesMover) return false
    const closest = nearestOnSegment(move.from, move.to, other.at)
    return within({ at: closest, size: move.size }, other, other.reach) && !within({ at: move.to, size: move.size }, other, other.reach)
  })
}

/** An area of effect, with the spell data's field names. `size` is a Sphere's, Cylinder's or Emanation's radius, a Cube's side, and a Cone's or Line's length. */
export type AreaOfEffect = { shape: "cone" | "cube" | "cylinder" | "emanation" | "line" | "sphere"; size: number; width?: number; height?: number }

// Where a point lies from a directed area's origin: how far along the direction, and how far to one side of it.
function local(origin: Point, toward: Point, point: Point): { along: number; aside: number } | undefined {
  const length = between(origin, toward)
  if (length === 0) return undefined
  const ux = (toward.x - origin.x) / length
  const uy = (toward.y - origin.y) / length
  const dx = point.x - origin.x
  const dy = point.y - origin.y
  return { along: dx * ux + dy * uy, aside: Math.abs(dx * uy - dy * ux) }
}

const EPSILON = 1e-9

/**
 * Whether a point is inside an area of effect whose point of origin is `origin`. A Sphere and a Cylinder reach their
 * radius from the origin, which is inside them. An Emanation reaches its distance from the edge of the space of the
 * creature it comes from (`originSpace`): a 10-foot Emanation from a Large creature reaches 10 + 5 = 15 feet from its
 * centre. A Cube's origin is the middle of one face, and it runs its side toward `toward`, half its side to each hand.
 * A Cone runs its length toward `toward`, as wide at each point as that point is far from the origin, so it opens
 * atan(½) to each side: 10 feet along, it covers 5 feet to either side. A Line runs its length toward `toward` and is
 * 5 feet wide unless it says otherwise. A Cube, Cone, Line or Emanation does not include its point of origin, nor
 * anything behind it: one cast from a creature's own point does not catch it. A directed area that comes from a creature
 * starts at the edge of its space (`originSpace`). The plane is flat, so a Cylinder's height is not read. A Cube, Cone
 * or Line with no direction (`toward` on the origin) covers nothing.
 */
export function inArea(area: AreaOfEffect, origin: Point, toward: Point, point: Point, originSpace = 0): boolean {
  const reach = area.size + originSpace / 2
  const gap = between(origin, point)
  if (area.shape === "sphere" || area.shape === "cylinder") return gap <= reach + EPSILON
  if (area.shape === "emanation") return gap > EPSILON && gap <= reach + EPSILON
  const at = local(origin, toward, point)
  if (!at) return false
  const along = at.along - originSpace / 2
  if (along <= EPSILON) return false
  if (area.shape === "cube") return along <= area.size + EPSILON && at.aside <= area.size / 2 + EPSILON
  if (area.shape === "cone") return along <= area.size + EPSILON && at.aside <= along / 2 + EPSILON
  return along <= area.size + EPSILON && at.aside <= (area.width ?? 5) / 2 + EPSILON
}

/**
 * The creatures an area of effect catches: those whose centre is inside it. On a grid a creature partly inside would
 * be caught too: here a Large creature's edge in the area is not enough. The creature an Emanation comes from stands on
 * its origin, so it is not caught.
 */
export const caughtIn = <T extends { at: Point }>(area: AreaOfEffect, origin: Point, toward: Point, creatures: readonly T[], originSpace = 0): T[] =>
  creatures.filter((creature) => inArea(area, origin, toward, creature.at, originSpace))

/**
 * A solid thing on an encounter's floor, in feet: a wall, a crate, a table, a pillar. A rectangle is given by its
 * centre, half its width and depth, and how far it is turned. `top` is how high it stands. One with no top is a wall
 * to the ceiling.
 */
export type Solid = { kind: "rect"; x: number; y: number; halfWidth: number; halfDepth: number; turn: number; top?: number } | { kind: "circle"; x: number; y: number; radius: number; top?: number }

/**
 * An encounter's floor: its solid things, its doorways as a point just inside and one just outside, and other points a
 * way round may pass through, such as its named places.
 */
export type Floor = { solids: readonly Solid[]; doors: readonly (readonly [Point, Point])[]; waypoints?: readonly Point[] }

const onSolid = (solid: Solid, point: Point): boolean => {
  if (solid.kind === "circle") return between(solid, point) < solid.radius
  const dx = point.x - solid.x
  const dy = point.y - solid.y
  const cos = Math.cos(solid.turn)
  const sin = Math.sin(solid.turn)
  return Math.abs(dx * cos - dy * sin) < solid.halfWidth && Math.abs(dx * sin + dy * cos) < solid.halfDepth
}

/** The solid thing a point is on, if any: where no one can stand or walk. */
export const solidAt = (solids: readonly Solid[], point: Point): Solid | undefined => solids.find((solid) => onSolid(solid, point))

/**
 * Where a straight path from one point to another first comes into a solid thing, as a share of the path from 0 to 1.
 * None when it misses, or only touches its edge. The geometry is exact: a wall thinner than a step is still a wall.
 */
const entersAt = (solid: Solid, from: Point, to: Point): number | undefined => spanThrough(solid, from, to)?.[0]

/**
 * The stretch of a straight path from one point to another that lies inside a shape, as shares of the path from 0 to
 * 1: where it comes in, and where it goes out. One that starts inside comes in at 0. None when it misses, or only
 * touches its edge. A path from (−10, 0) to (10, 0) through a circle of radius 5 at the origin is inside from 0.25 to 0.75.
 */
export function spanThrough(solid: Solid, from: Point, to: Point): readonly [number, number] | undefined {
  const EDGE = 1e-9
  if (solid.kind === "circle") {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const fx = from.x - solid.x
    const fy = from.y - solid.y
    const a = dx * dx + dy * dy
    if (a === 0) return undefined
    const b = 2 * (fx * dx + fy * dy)
    const c = fx * fx + fy * fy - solid.radius * solid.radius
    const root = b * b - 4 * a * c
    if (root <= 0) return undefined
    const first = (-b - Math.sqrt(root)) / (2 * a)
    const last = (-b + Math.sqrt(root)) / (2 * a)
    const enter = Math.max(first, 0)
    const leave = Math.min(last, 1)
    return leave - enter > EDGE ? [enter, leave] : undefined
  }
  // In the rectangle's own frame it is a box about the origin, and the path is clipped to it side by side.
  const cos = Math.cos(solid.turn)
  const sin = Math.sin(solid.turn)
  const local = (point: Point) => ({ u: (point.x - solid.x) * cos - (point.y - solid.y) * sin, v: (point.x - solid.x) * sin + (point.y - solid.y) * cos })
  const a = local(from)
  const b = local(to)
  let enter = 0
  let leave = 1
  for (const [start, run, half] of [
    [a.u, b.u - a.u, solid.halfWidth],
    [a.v, b.v - a.v, solid.halfDepth],
  ] as const) {
    if (run === 0) {
      if (Math.abs(start) >= half) return undefined
      continue
    }
    const one = (-half - start) / run
    const other = (half - start) / run
    enter = Math.max(enter, Math.min(one, other))
    leave = Math.min(leave, Math.max(one, other))
  }
  return leave - enter > EDGE ? [enter, leave] : undefined
}

/**
 * Ground that costs more than a foot of movement for each foot moved through it, as a shape on the floor and the feet
 * each foot costs: Difficult Terrain's 2, Wall of Thorns' 4.
 */
export type Rough = { shape: Solid; cost: number }

// How far along a straight path of `gap` feet a walker gets for `feet` of movement, where the rough ground it crosses
// costs more: the feet walked and the movement spent. Where rough shapes overlap the dearest counts.
function roughWalk(rough: readonly Rough[], from: Point, to: Point, gap: number, feet: number): { walked: number; spent: number } {
  if (!rough.length || gap === 0) return { walked: Math.min(gap, feet), spent: Math.min(gap, feet) }
  const marks = new Set([0, gap])
  const spans = rough.flatMap((each) => {
    const span = spanThrough(each.shape, from, to)
    if (!span) return []
    marks.add(span[0] * gap)
    marks.add(span[1] * gap)
    return [{ from: span[0] * gap, to: span[1] * gap, cost: each.cost }]
  })
  const points = [...marks].sort((a, b) => a - b)
  let walked = 0
  let spent = 0
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1]
    const length = points[index] - start
    const middle = start + length / 2
    const cost = Math.max(1, ...spans.filter((span) => span.from <= middle && middle <= span.to).map((span) => span.cost))
    if (spent + length * cost >= feet) return { walked: walked + (feet - spent) / cost, spent: feet }
    walked += length
    spent += length * cost
  }
  return { walked, spent }
}

/**
 * Walk straight toward a point over a floor: no farther than the feet given, and no farther than the first solid thing
 * in the way. With a crate 10 feet ahead, a walk of 30 feet toward a point 20 feet off stops at the crate, having used
 * 10. One who starts on something solid, as on a roof, walks off it freely. Rough ground on the way costs more of the
 * feet given for each foot walked (`rough`): 30 feet across 10 feet of Difficult Terrain walk 20, and `used` is the
 * movement spent.
 */
export function walkOver(solids: readonly Solid[], from: Point, to: Point, feet: number, rough: readonly Rough[] = []): { at: Point; used: number; blocked: boolean } {
  const gap = between(from, to)
  const along = (d: number): Point => (gap === 0 ? { ...from } : { x: from.x + ((to.x - from.x) * d) / gap, y: from.y + ((to.y - from.y) * d) / gap })
  let first = Number.POSITIVE_INFINITY
  for (const solid of solids) {
    if (onSolid(solid, from)) continue
    const enter = entersAt(solid, from, to)
    if (enter !== undefined) first = Math.min(first, enter * gap)
  }
  const reach = Math.min(gap, first)
  const went = roughWalk(rough, from, along(reach), reach, Math.max(0, feet))
  return { at: along(went.walked), used: went.spent, blocked: first < gap && went.walked >= reach - 1e-9 && went.spent < feet - 1e-9 }
}

/**
 * The way from one point to another: straight when nothing solid is between them, else the shortest way round by the
 * floor's doorways and waypoints, each leg of it clear. The points to walk through, ending at the goal. None when no
 * way is clear. From the bank to the boat's saloon it goes by the gangway and the saloon door.
 */
export function routeThrough(floor: Floor, from: Point, to: Point): Point[] | undefined {
  const clear = (a: Point, b: Point) => !walkOver(floor.solids, a, b, Number.POSITIVE_INFINITY).blocked
  if (clear(from, to)) return [to]
  // The shortest path over the points a way may pass through, tried nearest first, reading a leg only when it is reached.
  const nodes: Point[] = [from, ...floor.doors.flat(), ...(floor.waypoints ?? []), to]
  const goal = nodes.length - 1
  const reached = nodes.map(() => Number.POSITIVE_INFINITY)
  const came = nodes.map(() => -1)
  const done = nodes.map(() => false)
  reached[0] = 0
  for (;;) {
    let at = -1
    for (let index = 0; index < nodes.length; index++) if (!done[index] && reached[index] < Number.POSITIVE_INFINITY && (at < 0 || reached[index] < reached[at])) at = index
    if (at < 0) return undefined
    if (at === goal) break
    done[at] = true
    for (let next = 1; next < nodes.length; next++) {
      if (done[next]) continue
      const far = reached[at] + between(nodes[at], nodes[next])
      if (far < reached[next] && clear(nodes[at], nodes[next])) {
        reached[next] = far
        came[next] = at
      }
    }
  }
  const way: Point[] = []
  for (let at = goal; at > 0; at = came[at]) way.unshift(nodes[at])
  return way
}

/**
 * Where one walking to a point comes to stand: the point itself while no one is on it, else the nearest clear spot
 * around it on the walker's side, a space away from everyone and on nothing solid.
 */
export function standingRoom(solids: readonly Solid[], others: readonly Point[], walker: Point, to: Point, gap = BASE_REACH): Point {
  const free = (point: Point) => others.every((other) => between(other, point) >= gap - 1e-6)
  if (free(to)) return to
  for (const radius of [gap, gap * 2, gap * 3]) {
    const ring = Array.from({ length: 12 }, (_, index) => ({ x: to.x + Math.sin((index * Math.PI) / 6) * radius, y: to.y + Math.cos((index * Math.PI) / 6) * radius })).filter(
      (point) => free(point) && !solidAt(solids, point) && !walkOver(solids, to, point, Number.POSITIVE_INFINITY).blocked
    )
    if (ring.length) return ring.reduce((a, b) => (between(a, walker) <= between(b, walker) ? a : b))
  }
  return to
}

/**
 * A character's walk over a floor: toward a goal by the way `routeThrough` finds, as far as the feet given, stopping
 * at the first solid thing when no way is clear. `stopShort` halts that many feet short of the goal, for closing with
 * a creature, and `others` are the points where the rest stand, so the walker ends beside them and not on them. Ground
 * that costs more to cross (`rough`: Difficult Terrain) spends more of the feet given. Gives where they end, the feet
 * used, and the points walked through.
 */
export function walk(
  floor: Floor,
  from: Point,
  to: Point,
  feet: number,
  options: { stopShort?: number; others?: readonly Point[]; rough?: readonly Rough[] } = {}
): { at: Point; used: number; path: Point[] } {
  const short = options.stopShort ?? 0
  const gap = between(from, to)
  const others = options.others ?? []
  const clear = (a: Point, b: Point) => !walkOver(floor.solids, a, b, Number.POSITIVE_INFINITY).blocked
  const length = (way: readonly Point[]) => way.reduce((sum, point, index) => sum + between(index ? way[index - 1] : from, point), 0)
  // Already within the distance asked, with nothing solid between: no step is taken.
  if (short && gap <= short && clear(from, to)) return { at: { ...from }, used: 0, path: [] }
  // Closing with a creature ends at a spot that far from them with a clear line to them, on nothing solid and on no
  // one: the straight approach where it will do, else the spot round them that is the shortest way to reach. One who
  // stands behind a wall is closed with from their own side of it.
  let goal = standingRoom(floor.solids, others, from, to)
  let way = routeThrough(floor, from, goal)
  if (short) {
    const free = (point: Point) => !solidAt(floor.solids, point) && clear(point, to) && others.every((other) => between(other, to) < 1e-6 || between(other, point) >= BASE_REACH - 1e-6)
    const spots = [
      moveToward(to, from, short).at,
      ...Array.from({ length: 12 }, (_, index) => ({ x: to.x + Math.sin((index * Math.PI) / 6) * short, y: to.y + Math.cos((index * Math.PI) / 6) * short })),
    ].filter(free)
    const ways = spots.flatMap((spot) => {
      const found = routeThrough(floor, from, spot)
      return found ? [{ spot, found }] : []
    })
    const best = ways.sort((a, b) => length(a.found) - length(b.found))[0]
    goal = best?.spot ?? moveToward(to, from, short).at
    way = best?.found
  }
  let at = { ...from }
  let left = Math.max(0, feet)
  const path: Point[] = []
  for (const point of way ?? [goal]) {
    const leg = walkOver(floor.solids, at, point, left, options.rough)
    if (leg.used > 0) path.push(leg.at)
    left -= leg.used
    at = leg.at
    if (leg.blocked || between(at, point) > 1e-6) break
  }
  return { at, used: Math.max(0, feet) - left, path }
}

/** How much of a target something hides: none, half, three-quarters, or all of it. */
export type Cover = "none" | "half" | "three-quarters" | "total"
const COVER_ORDER: readonly Cover[] = ["none", "half", "three-quarters", "total"]

/** The greater of two covers: cover does not stack, and only the most protective counts. */
export const greaterCover = (a: Cover, b: Cover): Cover => (COVER_ORDER.indexOf(a) >= COVER_ORDER.indexOf(b) ? a : b)

/** What cover adds to Armor Class and to Dexterity saving throws: 2 for half, 5 for three-quarters. Total cover is not a bonus: the target cannot be aimed at. */
export const coverBonus = (cover: Cover): number => (cover === "half" ? 2 : cover === "three-quarters" ? 5 : 0)

// How tall a creature of a size stands, in feet, for judging how much of it a solid thing hides. The SRD gives no table: these are ours.
const HEIGHT: Record<Size, number> = { Tiny: 2, Small: 3.5, Medium: 6, Large: 10, Huge: 16, Gargantuan: 24 }

/**
 * The cover a target has from an attacker, read along the straight line between them. A solid thing on the line that
 * stands as tall as the target, or to the ceiling, is total cover. A lower one covers by its height against the
 * target's: three-quarters of it or more is three-quarters cover, half or more is half cover. A low thing counts only
 * when it is nearer the target than the attacker: one shoots over the crate one stands at, and not over the crate the
 * target crouches behind. Another creature on the line is half cover. A 4-foot crate in front of a 6-foot target is
 * 4 ÷ 6 of it: half cover. The solid things the two stand on themselves are not read.
 */
export function coverBetween(solids: readonly Solid[], attacker: Placed, target: Placed, others: readonly Placed[] = []): Cover {
  const gap = between(attacker.at, target.at)
  if (gap === 0) return "none"
  const height = HEIGHT[target.size ?? "Medium"]
  let cover: Cover = "none"
  for (const solid of solids) {
    if (onSolid(solid, attacker.at) || onSolid(solid, target.at)) continue
    const enter = entersAt(solid, attacker.at, target.at)
    if (enter === undefined) continue
    if (solid.top === undefined || solid.top >= height) return "total"
    if (enter * gap < gap / 2) continue
    const share = solid.top / height
    cover = greaterCover(cover, share >= 0.75 ? "three-quarters" : share >= 0.5 ? "half" : "none")
  }
  const blocking = others.some((other) => {
    const nearest = nearestOnSegment(attacker.at, target.at, other.at)
    return between(nearest, other.at) < spaceOf(other.size) / 2 && between(nearest, attacker.at) > 1e-6 && between(nearest, target.at) > 1e-6
  })
  return blocking ? greaterCover(cover, "half") : cover
}
