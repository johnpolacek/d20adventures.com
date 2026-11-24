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
  return character.size ?? blockOf(character)?.size[0] ?? "Medium"
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
  // flat, so flying is moving, as with Dragon Wings (./shape). A Swim Speed is read for the water on the floor (`swimsFree`).
  const shape = shapeOf(character)
  if (shape) return Math.max(shape.speed.walk, shape.speed.fly ?? 0)
  // A feature may give a Speed beyond their own while it lasts (Dragon Wings' Fly Speed), by ./late-rules.
  if (character.sheet) return Math.max(deriveSheet(character.sheet).speed, featureSpeed(character) ?? 0)
  if (character.type !== "npc") return undefined
  return blockOf(character)?.speed.walk
}

/**
 * How a character climbs: over what is no taller than they stand (`heightOf` their size), and free of climbing's extra
 * cost with a Climb Speed, from a Beast's shape, their sheet (Roving, an item) or their stat block.
 */
export function climbOf(character: Roller & { size?: Size }): Climb {
  const shape = shapeOf(character)
  const speed = shape ? shape.speed.climb : character.sheet ? deriveSheet(character.sheet).speeds.climb : character.type === "npc" ? blockOf(character)?.speed.climb : undefined
  return { height: heightOf(sizeOf(character)), ...(speed ? { speed: true } : {}) }
}

/**
 * Whether a character crosses water with none of the extra cost swimming has (`SWIM_EXTRA`): they have a Swim Speed,
 * from a Beast's shape, their sheet (Roving, an item) or their stat block, or they fly, from a shape, a feature
 * (Dragon Wings) or their stat block, and so pass over it.
 */
export function swimsFree(character: Roller): boolean {
  const shape = shapeOf(character)
  const speeds: { swim?: number; fly?: number } | undefined = shape ? shape.speed : character.sheet ? deriveSheet(character.sheet).speeds : character.type === "npc" ? blockOf(character)?.speed : undefined
  return !!speeds?.swim || !!(speeds as { fly?: number } | undefined)?.fly || !!featureSpeed(character)
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
 * Water deep enough to swim in, as rings of points in feet read by the even-odd rule: a point is in water when it is
 * inside an odd number of rings, so a ring inside another is dry land in it, as a pier's boards over a river are.
 */
export type Water = readonly (readonly Point[])[]

/**
 * An encounter's floor: its solid things, its doorways as a point just inside and one just outside, its water to swim
 * in, and other points a way round may pass through, such as its named places.
 */
export type Floor = { solids: readonly Solid[]; doors: readonly (readonly [Point, Point])[]; water?: Water; waypoints?: readonly Point[] }

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

const ringHolds = (ring: readonly Point[], point: Point): boolean => {
  let inside = false
  for (let index = 0, last = ring.length - 1; index < ring.length; last = index++) {
    const a = ring[index]
    const b = ring[last]
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** Whether a point is in water: inside an odd number of its rings. */
export const inWater = (water: Water | undefined, point: Point): boolean => !!water && water.filter((ring) => ringHolds(ring, point)).length % 2 === 1

/**
 * The stretches of a straight path from one point to another that lie in water, as shares of the path from 0 to 1.
 * Where it crosses a ring's edge the water starts or stops, and each stretch between two crossings is in or out as
 * its middle is. A path from (0, 0) to (30, 0) over a river from x = 10 to x = 20 is in water from a third to two thirds.
 */
export function waterSpans(water: Water, from: Point, to: Point): [number, number][] {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const marks = [0, 1]
  for (const ring of water) {
    // A ring wholly to one side of the path has no edge on it.
    if (ring.every((point) => point.x < Math.min(from.x, to.x)) || ring.every((point) => point.x > Math.max(from.x, to.x))) continue
    if (ring.every((point) => point.y < Math.min(from.y, to.y)) || ring.every((point) => point.y > Math.max(from.y, to.y))) continue
    for (let index = 0, last = ring.length - 1; index < ring.length; last = index++) {
      const a = ring[last]
      const ex = ring[index].x - a.x
      const ey = ring[index].y - a.y
      const run = dx * ey - dy * ex
      if (run === 0) continue
      const along = ((a.x - from.x) * ey - (a.y - from.y) * ex) / run
      const across = ((a.x - from.x) * dy - (a.y - from.y) * dx) / run
      if (along > 0 && along < 1 && across >= 0 && across <= 1) marks.push(along)
    }
  }
  marks.sort((x, y) => x - y)
  const spans: [number, number][] = []
  for (let index = 1; index < marks.length; index++) {
    const start = marks[index - 1]
    const end = marks[index]
    if (end - start < 1e-9 || !inWater(water, { x: from.x + (dx * (start + end)) / 2, y: from.y + (dy * (start + end)) / 2 })) continue
    const last = spans[spans.length - 1]
    if (last && start - last[1] < 1e-9) last[1] = end
    else spans.push([start, end])
  }
  return spans
}

/**
 * Swimming's extra cost: 1 extra foot of movement for each foot moved through water, 2 extra in Difficult Terrain,
 * unless one has a Swim Speed (SRD 5.2.1, Swimming). Ten feet across a river cost 20.
 */
export const SWIM_EXTRA = 1

/**
 * How a walker meets the water of a floor. `shut`: they do not enter it, and stop at its edge, as a move that does not
 * mean to go into water does (`walk`). Otherwise they swim, each foot costing `SWIM_EXTRA` more unless they have a
 * Swim Speed (`speed`).
 */
export type Swim = { water: Water; shut?: boolean; speed?: boolean }

// How far short of water's edge a walker who may not enter it stops, so that they stand on dry ground.
const BANK = 0.1

/**
 * Ground that costs more than a foot of movement for each foot moved through it, as a shape on the floor and the feet
 * each foot costs: Difficult Terrain's 2, Wall of Thorns' 4.
 */
export type Rough = { shape: Solid; cost: number }

// How far along a straight path of `gap` feet a walker gets for `feet` of movement, where the rough ground it crosses
// costs more: the feet walked and the movement spent. Where rough shapes overlap the dearest counts. Water that is
// swum adds swimming's extra to the ground it covers: Difficult Terrain's 2 and swimming's 1 make 3.
function roughWalk(rough: readonly Rough[], from: Point, to: Point, gap: number, feet: number, swim?: Swim): { walked: number; spent: number } {
  const wet = swim && !swim.shut && !swim.speed && swim.water.length ? waterSpans(swim.water, from, to).map(([start, end]) => ({ from: start * gap, to: end * gap })) : []
  if ((!rough.length && !wet.length) || gap === 0) return { walked: Math.min(gap, feet), spent: Math.min(gap, feet) }
  const marks = new Set([0, gap])
  const spans = rough.flatMap((each) => {
    const span = spanThrough(each.shape, from, to)
    if (!span) return []
    marks.add(span[0] * gap)
    marks.add(span[1] * gap)
    return [{ from: span[0] * gap, to: span[1] * gap, cost: each.cost }]
  })
  for (const each of wet) {
    marks.add(each.from)
    marks.add(each.to)
  }
  const points = [...marks].sort((a, b) => a - b)
  let walked = 0
  let spent = 0
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1]
    const length = points[index] - start
    const middle = start + length / 2
    const cost = Math.max(1, ...spans.filter((span) => span.from <= middle && middle <= span.to).map((span) => span.cost)) + (wet.some((each) => each.from <= middle && middle <= each.to) ? SWIM_EXTRA : 0)
    if (spent + length * cost >= feet) return { walked: walked + (feet - spent) / cost, spent: feet }
    walked += length
    spent += length * cost
  }
  return { walked, spent }
}

/**
 * How a walker climbs: the tallest thing they will climb over, their own height, and whether they have a Climb Speed,
 * which spares them climbing's extra cost.
 */
export type Climb = { height: number; speed?: boolean }

/** Whether a walker climbs over a solid thing: one with a top no higher than they stand. A wall to the ceiling is never climbed. */
const climbs = (solid: Solid, climb: Climb | undefined): boolean => !!climb && solid.top !== undefined && solid.top <= climb.height

/**
 * The feet it costs to climb over a solid thing of a height, crossing so many feet of its top: up, across and down.
 * Climbing costs 1 extra foot for each foot moved, unless one has a Climb Speed. Over a 3-foot rail half a foot thick:
 * 3 + 0.5 + 3 = 6.5 feet moved, 13 spent.
 */
export const climbCost = (height: number, across: number, climb: Climb): number => (height * 2 + across) * (climb.speed ? 1 : 2)

/**
 * Walk straight toward a point over a floor: no farther than the feet given, and no farther than the first solid thing
 * in the way. With a crate 10 feet ahead, a walk of 30 feet toward a point 20 feet off stops at the crate, having used
 * 10. One who starts on something solid, as on a roof, walks off it freely. Rough ground on the way costs more of the
 * feet given for each foot walked (`rough`): 30 feet across 10 feet of Difficult Terrain walk 20, and `used` is the
 * movement spent. A walker who climbs (`climb`) goes over a thing no taller than they stand at climbing's cost
 * (`climbCost`), all of it or none: one without the feet to get over stops before it. Water (`swim`) that the walker
 * may not enter stops them at its edge, and water they swim costs more (`SWIM_EXTRA`): 30 feet across 10 feet of river
 * walk 20 and spend 30.
 */
export function walkOver(
  solids: readonly Solid[],
  from: Point,
  to: Point,
  feet: number,
  rough: readonly Rough[] = [],
  climb?: Climb,
  swim?: Swim
): { at: Point; used: number; blocked: boolean } {
  const gap = between(from, to)
  const along = (d: number): Point => (gap === 0 ? { ...from } : { x: from.x + ((to.x - from.x) * d) / gap, y: from.y + ((to.y - from.y) * d) / gap })
  let first = Number.POSITIVE_INFINITY
  const over: { from: number; to: number; height: number }[] = []
  for (const solid of solids) {
    if (onSolid(solid, from)) continue
    const span = spanThrough(solid, from, to)
    if (!span) continue
    if (climbs(solid, climb)) over.push({ from: span[0] * gap, to: span[1] * gap, height: solid.top ?? 0 })
    else first = Math.min(first, span[0] * gap)
  }
  // Water they may not enter is a wall at its edge.
  const wet = swim?.shut && swim.water.length ? waterSpans(swim.water, from, to)[0] : undefined
  if (wet) first = Math.min(first, Math.max(0, wet[0] * gap - BANK))
  const reach = Math.min(gap, first)
  const budget = Math.max(0, feet)
  // Over what stands in the way before the first thing that cannot be climbed, one after another; things that touch
  // or overlap are climbed as one, at the taller's height.
  const climbsOver = over
    .filter((each) => each.from < reach)
    .sort((x, y) => x.from - y.from)
    .reduce<{ from: number; to: number; height: number }[]>((joined, each) => {
      const last = joined[joined.length - 1]
      if (last && each.from <= last.to + 1e-9) {
        last.to = Math.max(last.to, each.to)
        last.height = Math.max(last.height, each.height)
      } else joined.push({ ...each })
      return joined
    }, [])
  let done = 0
  let spent = 0
  for (const each of climbsOver) {
    const went = roughWalk(rough, along(done), along(each.from), each.from - done, budget - spent, swim)
    spent += went.spent
    if (went.walked < each.from - done - 1e-9) return { at: along(done + went.walked), used: spent, blocked: false }
    const cost = climbCost(each.height, Math.min(each.to, gap) - each.from, climb as Climb)
    // Without the feet to get all the way over, they stop at its foot.
    if (spent + cost > budget + 1e-9) return { at: along(each.from), used: spent, blocked: true }
    spent += cost
    done = Math.min(each.to, gap)
  }
  const went = roughWalk(rough, along(done), along(reach), reach - done, budget - spent, swim)
  spent += went.spent
  const walked = done + went.walked
  return { at: along(walked), used: spent, blocked: first < gap && walked >= reach - 1e-9 && spent < feet - 1e-9 }
}

// How far off a solid thing's corner a way round it turns: a foot clear of each face.
const ROUND = 1

/** The points just off a solid thing's corners that a way round it turns at: four for a box, eight round a pillar. */
const cornersOf = (solid: Solid): Point[] => {
  if (solid.kind === "circle") {
    const r = (solid.radius + ROUND) / Math.cos(Math.PI / 8)
    return Array.from({ length: 8 }, (_, index) => ({ x: solid.x + Math.cos((index * Math.PI) / 4) * r, y: solid.y + Math.sin((index * Math.PI) / 4) * r }))
  }
  const cos = Math.cos(solid.turn)
  const sin = Math.sin(solid.turn)
  return [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ].map(([u, v]) => {
    const across = u * (solid.halfWidth + ROUND)
    const deep = v * (solid.halfDepth + ROUND)
    return { x: solid.x + across * cos + deep * sin, y: solid.y - across * sin + deep * cos }
  })
}

/**
 * The way from one point to another: straight when nothing solid is between them, else the shortest way round, each
 * leg of it clear. It turns at the floor's doorways and waypoints and just off the corners of its solid things, so a
 * walk goes round a deckhouse by the side deck and not the long way by the bank. The points to walk through, ending at
 * the goal. None when no way is clear. From the bank to the boat's saloon it goes by the gangway and the saloon door.
 */
export function routeThrough(floor: Floor, from: Point, to: Point, climb?: Climb, swim?: Swim): Point[] | undefined {
  // Water that costs nothing to cross is no obstacle. Water they may not enter is a wall, and no way leads through it.
  const water = swim?.water.length && (swim.shut || !swim.speed) ? swim.water : undefined
  const wet = (a: Point, b: Point) => (water ? waterSpans(water, a, b) : [])
  const shut = !!swim?.shut
  const barred = (a: Point, b: Point) => shut && wet(a, b).length > 0
  // Straight there when nothing at all stands between. Over something climbed, or through water they swim, the way
  // round may cost less.
  if (!walkOver(floor.solids, from, to, Number.POSITIVE_INFINITY, [], undefined, swim).blocked && !wet(from, to).length) return [to]
  // The shortest path over the points a way may pass through, the one likeliest to lead there first (its way so far and
  // the straight line on), reading a leg only when it is reached. Besides the doorways and waypoints, a way turns just
  // off the corners of a solid thing that stands in a leg it tries: the corners of what blocks the line on to the goal,
  // and of what blocks the way to one of those, a few deep. A corner inside another solid thing is no way through.
  const nodes: Point[] = [from, ...floor.doors.flat(), ...(floor.waypoints ?? []), to]
  const fixed = nodes.length
  const goal = fixed - 1
  const reached: number[] = nodes.map(() => Number.POSITIVE_INFINITY)
  const came: number[] = nodes.map(() => -1)
  const done: boolean[] = nodes.map(() => false)
  const cornersAt = new Map<Solid, number[]>()
  const turnsOf = (solid: Solid): number[] => {
    let found = cornersAt.get(solid)
    if (!found) {
      found = []
      for (const point of cornersOf(solid)) {
        if (solidAt(floor.solids, point)) continue
        found.push(nodes.length)
        nodes.push(point)
        reached.push(Number.POSITIVE_INFINITY)
        came.push(-1)
        done.push(false)
      }
      cornersAt.set(solid, found)
    }
    return found
  }
  // Each solid thing's bounds, so a leg nowhere near it is passed over without the exact test.
  const bounds = floor.solids.map((solid) => {
    const r = solid.kind === "circle" ? solid.radius : Math.hypot(solid.halfWidth, solid.halfDepth)
    return { solid, x0: solid.x - r, x1: solid.x + r, y0: solid.y - r, y1: solid.y + r }
  })
  const blocking = (a: Point, b: Point) => {
    const x0 = Math.min(a.x, b.x)
    const x1 = Math.max(a.x, b.x)
    const y0 = Math.min(a.y, b.y)
    const y1 = Math.max(a.y, b.y)
    const found: Solid[] = []
    for (const box of bounds) {
      if (box.x1 < x0 || box.x0 > x1 || box.y1 < y0 || box.y0 > y1) continue
      if (!climbs(box.solid, climb) && !onSolid(box.solid, a) && entersAt(box.solid, a, b) !== undefined) found.push(box.solid)
    }
    return found
  }
  // What a leg costs: its length, and climbing's extra over what it climbs.
  const climbable = climb ? floor.solids.filter((solid) => climbs(solid, climb)) : []
  const costOf = (a: Point, b: Point) => {
    const gap = between(a, b)
    let cost = gap
    // Swimming costs more for each foot in the water, unless that is shut off, and then no leg may cross it.
    if (!shut) for (const [start, end] of wet(a, b)) cost += (end - start) * gap * SWIM_EXTRA
    for (const solid of climbable) {
      if (onSolid(solid, a)) continue
      const span = spanThrough(solid, a, b)
      if (span) cost += climbCost(solid.top ?? 0, (span[1] - span[0]) * gap, climb as Climb) - (span[1] - span[0]) * gap
    }
    return cost
  }
  reached[0] = 0
  for (;;) {
    let at = -1
    for (let index = 0; index < nodes.length; index++)
      if (!done[index] && reached[index] < Number.POSITIVE_INFINITY && (at < 0 || reached[index] + between(nodes[index], to) < reached[at] + between(nodes[at], to))) at = index
    if (at < 0) return undefined
    if (at === goal) break
    done[at] = true
    const tried = new Set<number>()
    // What stands on the line on to the goal is gone round: what blocks it, and what it would climb.
    const onward = [...blocking(nodes[at], to), ...climbable.filter((solid) => !onSolid(solid, nodes[at]) && entersAt(solid, nodes[at], to) !== undefined)]
    let next = [...Array.from({ length: fixed - 1 }, (_, index) => index + 1), ...onward.flatMap(turnsOf)]
    for (let depth = 0; depth < 3 && next.length; depth++) {
      const deeper: number[] = []
      for (const index of next) {
        if (tried.has(index) || done[index]) continue
        tried.add(index)
        const far = reached[at] + costOf(nodes[at], nodes[index])
        if (far >= reached[index]) continue
        const stood = blocking(nodes[at], nodes[index])
        if (!stood.length && !barred(nodes[at], nodes[index])) {
          reached[index] = far
          came[index] = at
        } else if (index >= fixed) deeper.push(...stood.flatMap(turnsOf))
      }
      next = deeper
    }
  }
  const found: Point[] = []
  for (let at = goal; at > 0; at = came[at]) found.unshift(nodes[at])
  // Drawn tight: a turn the walk can cut straight past, nothing solid between, is left out.
  const way: Point[] = []
  let last = from
  for (let index = 0; index < found.length; index++) {
    const after = found[index + 1]
    if (after && !blocking(last, after).length && !barred(last, after) && costOf(last, after) <= costOf(last, found[index]) + costOf(found[index], after) + 1e-6) continue
    way.push(found[index])
    last = found[index]
  }
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
 * that costs more to cross (`rough`: Difficult Terrain) spends more of the feet given, and one who climbs (`climb`)
 * goes over low things at climbing's cost where that is the shorter way. Gives where they end, the feet
 * used, and the points walked through.
 *
 * The floor's water (`Floor.water`) is not walked into: a walk stops at its edge, and a way round goes by what is dry.
 * One that sets out in water, or is bound for a goal in water (`swim.into`), swims instead, each foot costing
 * `SWIM_EXTRA` more unless they have a Swim Speed (`swim.speed`). Backing straight away from a fight on the Mordava's
 * bank stops at the water, and a walk to someone in the river swims out to them.
 */
export function walk(
  floor: Floor,
  from: Point,
  to: Point,
  feet: number,
  options: { stopShort?: number; others?: readonly Point[]; rough?: readonly Rough[]; climb?: Climb; swim?: { speed?: boolean; into?: boolean } } = {}
): { at: Point; used: number; path: Point[] } {
  const short = options.stopShort ?? 0
  const gap = between(from, to)
  const others = options.others ?? []
  const climb = options.climb
  const water = floor.water?.length ? floor.water : undefined
  const wading: Swim | undefined = water ? { water, shut: !(options.swim?.into || inWater(water, from)), speed: options.swim?.speed } : undefined
  const clear = (a: Point, b: Point) => !walkOver(floor.solids, a, b, Number.POSITIVE_INFINITY, [], climb).blocked
  const length = (way: readonly Point[]) => way.reduce((sum, point, index) => sum + between(index ? way[index - 1] : from, point), 0)
  // Already within the distance asked, with nothing solid between: no step is taken.
  if (short && gap <= short && clear(from, to)) return { at: { ...from }, used: 0, path: [] }
  // Closing with a creature ends at a spot that far from them with a clear line to them, on nothing solid and on no
  // one: the straight approach where it will do, else the spot round them that is the shortest way to reach. One who
  // stands behind a wall is closed with from their own side of it.
  let goal = standingRoom(floor.solids, others, from, to)
  let way = routeThrough(floor, from, goal, climb, wading)
  if (short) {
    const free = (point: Point) => !solidAt(floor.solids, point) && !(wading?.shut && inWater(water, point)) && clear(point, to) && others.every((other) => between(other, to) < 1e-6 || between(other, point) >= BASE_REACH - 1e-6)
    const spots = [
      moveToward(to, from, short).at,
      ...Array.from({ length: 12 }, (_, index) => ({ x: to.x + Math.sin((index * Math.PI) / 6) * short, y: to.y + Math.cos((index * Math.PI) / 6) * short })),
    ].filter(free)
    const ways = spots.flatMap((spot) => {
      const found = routeThrough(floor, from, spot, climb, wading)
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
    const leg = walkOver(floor.solids, at, point, left, options.rough, climb, wading)
    if (leg.used > 0) path.push(leg.at)
    left -= leg.used
    at = leg.at
    if (leg.blocked || between(at, point) > 1e-6) break
  }
  return { at, used: Math.max(0, feet) - left, path }
}

// Where sight is read from, as shares of a space's width across it: the centre first, then its sides.
const SIGHT_FROM_ATTACKER = [0, -0.4, 0.4] as const
const SIGHT_ON_TARGET = [0, -0.4, -0.2, 0.2, 0.4] as const

/** How much of a target something hides: none, half, three-quarters, or all of it. */
export type Cover = "none" | "half" | "three-quarters" | "total"
const COVER_ORDER: readonly Cover[] = ["none", "half", "three-quarters", "total"]

/** The greater of two covers: cover does not stack, and only the most protective counts. */
export const greaterCover = (a: Cover, b: Cover): Cover => (COVER_ORDER.indexOf(a) >= COVER_ORDER.indexOf(b) ? a : b)

/** What cover adds to Armor Class and to Dexterity saving throws: 2 for half, 5 for three-quarters. Total cover is not a bonus: the target cannot be aimed at. */
export const coverBonus = (cover: Cover): number => (cover === "half" ? 2 : cover === "three-quarters" ? 5 : 0)

// How tall a creature of a size stands, in feet, for judging how much of it a solid thing hides. The SRD gives no table: these are ours.
const HEIGHT: Record<Size, number> = { Tiny: 2, Small: 3.5, Medium: 6, Large: 10, Huge: 16, Gargantuan: 24 }

/** How tall a creature of a size stands, in feet: a Medium one 6. */
export const heightOf = (size: Size = "Medium"): number => HEIGHT[size]

/**
 * The cover a target has from an attacker: how much of the target the solid things between them hide. Sight is read
 * along lines from across the attacker's space to across the target's, and the attacker takes the point that sees
 * the most. A thing as tall as the target, or to the ceiling, hides what lies behind it on a line: one that hides
 * every line is total cover, most of them three-quarters, some of them half. So one seen through an open window, or
 * round a post, has cover and not total cover. A lower thing covers by its height against the target's, read on the
 * line between their centres: three-quarters of it or more is three-quarters cover, half or more is half cover. A low
 * thing counts only when it is nearer the target than the attacker: one shoots over the crate one stands at, and not
 * over the crate the target crouches behind. Another creature on the line is half cover. A 4-foot crate in front of a
 * 6-foot target is 4 ÷ 6 of it: half cover. The solid things the two stand on themselves are not read. An area's
 * effect spreads from a point (`from: "point"`), so it is read from that point alone and does not see round a corner.
 */
export function coverBetween(solids: readonly Solid[], attacker: Placed, target: Placed, others: readonly Placed[] = [], from: "space" | "point" = "space"): Cover {
  const gap = between(attacker.at, target.at)
  if (gap === 0) return "none"
  const height = HEIGHT[target.size ?? "Medium"]
  const standing = solids.filter((solid) => !onSolid(solid, attacker.at) && !onSolid(solid, target.at))
  const tall = (solid: Solid) => solid.top === undefined || solid.top >= height
  const walls = standing.filter(tall)
  // Points across each space, square to the line between them. A point inside something solid is not one sight
  // passes through, so a target against a wall beside the line is not hidden by it.
  const side = { x: -(target.at.y - attacker.at.y) / gap, y: (target.at.x - attacker.at.x) / gap }
  const across = (one: Placed, shares: readonly number[]) =>
    shares.map((share) => ({ x: one.at.x + side.x * spaceOf(one.size) * share, y: one.at.y + side.y * spaceOf(one.size) * share })).filter((point, index) => index === 0 || !solidAt(walls, point))
  const sights = across(target, SIGHT_ON_TARGET)
  const hidden = Math.min(...(from === "point" ? [attacker.at] : across(attacker, SIGHT_FROM_ATTACKER)).map((eye) => sights.filter((to) => walls.some((wall) => entersAt(wall, eye, to) !== undefined)).length))
  if (hidden === sights.length) return "total"
  let cover: Cover = hidden === 0 ? "none" : hidden / sights.length > 0.5 ? "three-quarters" : "half"
  for (const solid of standing) {
    if (tall(solid)) continue
    const enter = entersAt(solid, attacker.at, target.at)
    if (enter === undefined || enter * gap < gap / 2) continue
    const share = (solid.top ?? 0) / height
    cover = greaterCover(cover, share >= 0.75 ? "three-quarters" : share >= 0.5 ? "half" : "none")
  }
  const blocking = others.some((other) => {
    const nearest = nearestOnSegment(attacker.at, target.at, other.at)
    return between(nearest, other.at) < spaceOf(other.size) / 2 && between(nearest, attacker.at) > 1e-6 && between(nearest, target.at) > 1e-6
  })
  return blocking ? greaterCover(cover, "half") : cover
}
