import type { Size } from "@d20/srd"
import { equipmentById } from "@d20/srd/equipment"
import { monsterById } from "@d20/srd/monsters"
import { speciesById } from "@d20/srd/species"
import { weaponPropertyById } from "@d20/srd/weapon-properties"
import { actionId, UNARMED_STRIKE } from "./attack"
import type { Roller } from "./check"
import { type Afflicted, cannotMove, exhaustionOf } from "./conditions"
import { deriveSheet } from "./derive"
import { DEFAULT_STAT_BLOCK } from "./stat-block"

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
 * A hero's is its species' first: both choices a species gives are 5 feet wide, so the space is the same.
 */
export function sizeOf(character: Roller): Size {
  if (character.sheet) return speciesById.get(character.sheet.species)?.sizes[0]?.size ?? "Medium"
  if (character.type !== "npc") return "Medium"
  return (monsterById.get(character.statBlock ?? DEFAULT_STAT_BLOCK) ?? monsterById.get(DEFAULT_STAT_BLOCK))?.size[0] ?? "Medium"
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

/** How far an attack reaches: a melee attack's reach, and a ranged or thrown attack's normal and long range. A single range has no long range. */
export type AttackDistances = { reach?: number; range?: { normal: number; long?: number } }

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

/** A creature's reach unless a rule says otherwise. */
export const BASE_REACH = 5

/**
 * How far a hero's weapon reaches. A melee weapon reaches 5 feet, and the Reach property adds 5: a Glaive reaches 10.
 * A Ranged weapon, and a Thrown one, has its normal and long range: a Dagger reaches 5 and throws 20/60. An Unarmed
 * Strike reaches 5. Anything else reaches nothing.
 */
export function weaponReach(weaponId: string): AttackDistances {
  if (weaponId === UNARMED_STRIKE) return { reach: BASE_REACH }
  const weapon = equipmentById.get(weaponId)
  if (weapon?.kind !== "weapon") return {}
  const properties: readonly string[] = weapon.properties ?? []
  const added = properties.reduce((sum, id) => sum + (weaponPropertyById.get(id)?.reachBonusFeet ?? 0), 0)
  return {
    ...(weapon.attackType === "melee" ? { reach: BASE_REACH + added } : {}),
    ...(weapon.range ? { range: { normal: weapon.range.normal, long: weapon.range.long } } : {}),
  }
}

/**
 * How far a stat block's attack reaches, by the attack's id (its name in lower case with dashes, as `attacksOf` gives
 * it): the reach and range it prints. A Hill Giant's Tree Club reaches 10, and its Trash Lob throws 60/240. A melee
 * attack that prints no reach reaches 5.
 */
export function statBlockAttackReach(statBlock: string, attackId: string): AttackDistances {
  const attack = monsterById.get(statBlock)?.actions?.find((action) => actionId(action.name) === attackId)?.attack
  if (!attack) return {}
  return {
    ...(attack.kind !== "ranged" ? { reach: attack.reach ?? BASE_REACH } : {}),
    ...(attack.range ? { range: { normal: attack.range.normal, ...(attack.range.long !== undefined ? { long: attack.range.long } : {}) } } : {}),
  }
}

/** How far one of a character's attacks reaches, by its id: a hero's weapon, or an NPC's stat block attack. */
export function attackReachOf(character: Roller, attackId: string): AttackDistances {
  if (character.sheet) return weaponReach(attackId)
  if (character.type !== "npc") return {}
  return statBlockAttackReach(monsterById.has(character.statBlock ?? DEFAULT_STAT_BLOCK) ? (character.statBlock ?? DEFAULT_STAT_BLOCK) : DEFAULT_STAT_BLOCK, attackId)
}

/**
 * A character's reach for Opportunity Attacks: the longest of its melee attacks, which is at least 5. A hero holding a
 * Glaive reaches 10. A Hill Giant reaches 10 with its Tree Club.
 */
export function meleeReachOf(character: Roller): number {
  const ids = character.sheet
    ? [...(character.sheet.weapons ?? []), UNARMED_STRIKE]
    : character.type === "npc"
      ? ((monsterById.get(character.statBlock ?? DEFAULT_STAT_BLOCK) ?? monsterById.get(DEFAULT_STAT_BLOCK))?.actions ?? []).flatMap((action) => (action.attack ? [actionId(action.name)] : []))
      : []
  return Math.max(BASE_REACH, ...ids.map((id) => attackReachOf(character, id).reach ?? 0))
}

/** A character's Speed in feet: a hero's from its sheet, an NPC's walking Speed from its stat block. A hero with no sheet has none. */
export function speedOf(character: Roller): number | undefined {
  if (character.sheet) return deriveSheet(character.sheet).speed
  if (character.type !== "npc") return undefined
  return (monsterById.get(character.statBlock ?? DEFAULT_STAT_BLOCK) ?? monsterById.get(DEFAULT_STAT_BLOCK))?.speed.walk
}

/** What the Slow mastery takes from a creature's Speed until the start of the attacker's next turn. Hits from several weapons take no more. */
export const SLOW_FEET = 10

/**
 * The feet a character can move this turn. Speed loses 5 feet for each level of Exhaustion and 10 for the Slow
 * mastery, to no less than 0, and is 0 for one who cannot move. Dash adds that Speed again. Standing from Prone costs
 * half that Speed, rounded down, and one with a Speed of 0 cannot stand. A Speed of 30 with Dash, standing up, is
 * 30 + 30 − 15 = 45 feet.
 */
export function movementBudget(args: { speed: number; cannotMove?: boolean; dash?: boolean; stands?: boolean; slowed?: boolean; exhaustion?: number }): number {
  if (args.cannotMove) return 0
  const speed = Math.max(0, args.speed - (args.slowed ? SLOW_FEET : 0) - 5 * (args.exhaustion ?? 0))
  return Math.max(0, speed * (args.dash ? 2 : 1) - (args.stands ? Math.floor(speed / 2) : 0))
}

/** The feet a character can move this turn, read from the character: its Speed, whether it can move, and its Exhaustion. */
export function movementBudgetOf(character: Afflicted & Roller, options: { dash?: boolean; stands?: boolean; slowed?: boolean } = {}): number {
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
