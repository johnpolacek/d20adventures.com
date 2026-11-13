import type { Size } from "@d20/srd"
import { monsterById } from "@d20/srd/monsters"
import { spellById } from "@d20/srd/spells"
import type { Roller } from "./check"
import type { ModeSource } from "./conditions"
import { deriveSheet } from "./derive"
import { type AreaOfEffect, between, type Floor, type Point, type Rough, type Solid, type Standing, sizeOf, solidAt, spaceOf, spanThrough } from "./space"
import { type FloorArea, spellRule } from "./spell-rules"
import { DEFAULT_STAT_BLOCK } from "./stat-block"
import type { SpellEffect, TurnEffect } from "./turn-effect"

/**
 * Areas that stay on the floor: a spell's area left where its caster put it, until the spell ends (./spell-rules
 * `stays`). Each is held on its caster's effect, its point as `at` and a wall's other end as `to`, so it ends as the
 * effect does: Concentration lost, its caster's turns run out, or the story moved on (./spell-effects). The encounter's
 * areas are read from everyone's effects, by `floorAreas`.
 *
 * What an area is on the plane: a Sphere or Cylinder is a circle as wide as its radius, a Cube a square about its point,
 * and a wall a long box from one end to the other, as thick as it is. A creature is in a Sphere or Cube when its centre
 * is, as ./space reads every area, and in a wall when the wall cuts its space.
 */

type Holder = { id?: string; spellEffects?: readonly SpellEffect[] }

/** The areas that stay on the floor, from the effects their casters hold, in the order the casters stand. */
export function floorAreas(characters: readonly Holder[]): FloorArea[] {
  return characters.flatMap((character) =>
    (character.spellEffects ?? []).flatMap((effect): FloorArea[] => {
      const spell = spellById.get(effect.spell)
      const rules = spellRule(effect.spell)?.stays
      if (!spell || !rules || !effect.at || effect.by !== character.id) return []
      const slot = effect.amount ?? spell.level
      const area: AreaOfEffect | undefined = rules.wall ? { shape: "line", size: rules.wall.length, width: rules.wall.thickness } : (rules.area?.(slot) ?? spell.range.area)
      if (!area) return []
      return [{ spell, by: effect.by, effect, slot, area, at: effect.at, ...(effect.to ? { to: effect.to } : {}), rules }]
    })
  )
}

/**
 * The shape an area covers on the plane, widened by some feet all round: a wall's box widened by a creature's half-space
 * is where that creature's space is cut by it. A wall from (0, 0) to (20, 0), 1 foot thick, is a box 20 feet long and 1
 * deep about (10, 0).
 */
export function areaShape(area: FloorArea, widen = 0): Solid {
  if (area.to) {
    const length = between(area.at, area.to)
    const turn = length ? Math.atan2(-(area.to.y - area.at.y) / length, (area.to.x - area.at.x) / length) : 0
    return {
      kind: "rect",
      x: (area.at.x + area.to.x) / 2,
      y: (area.at.y + area.to.y) / 2,
      halfWidth: length / 2 + widen,
      halfDepth: (area.area.width ?? 1) / 2 + widen,
      turn,
    }
  }
  if (area.area.shape === "cube") return { kind: "rect", x: area.at.x, y: area.at.y, halfWidth: area.area.size / 2 + widen, halfDepth: area.area.size / 2 + widen, turn: 0 }
  return { kind: "circle", x: area.at.x, y: area.at.y, radius: area.area.size + widen }
}

// How far a creature's space reaches past its centre, for a wall that cuts it.
const widenFor = (area: FloorArea, size: Size | undefined) => (area.to ? spaceOf(size) / 2 : 0)

/**
 * Where a point stands from a wall: how far along it from its middle, and how far from its line, above 0 on the side
 * that faced away from its caster as it was cast (./spell-space). A wall from (0, 10) to (0, −10), cast from the west,
 * has (5, 0) 5 feet on that side.
 */
export function wallSide(area: FloorArea, point: Point): { along: number; aside: number } {
  const to = area.to ?? area.at
  const length = between(area.at, to) || 1
  const ux = (to.x - area.at.x) / length
  const uy = (to.y - area.at.y) / length
  const dx = point.x - (area.at.x + to.x) / 2
  const dy = point.y - (area.at.y + to.y) / 2
  return { along: dx * ux + dy * uy, aside: ux * dy - uy * dx }
}

/** Whether one standing at a point is in an area: its centre inside it, or its space cut by a wall. */
export const inFloorArea = (area: FloorArea, at: Point, size?: Size): boolean => !!solidAt([areaShape(area, widenFor(area, size))], at)

/** The feet of a straight walk from one point to another that lie in an area, for one of a size. */
export function feetIn(area: FloorArea, from: Point, to: Point, size?: Size): number {
  const span = spanThrough(areaShape(area, widenFor(area, size)), from, to)
  return span ? (span[1] - span[0]) * between(from, to) : 0
}

/** Whether a straight walk from one point to another comes into an area it did not start in, or passes through it. */
export const enters = (area: FloorArea, from: Point, to: Point, size?: Size): boolean => !inFloorArea(area, from, size) && feetIn(area, from, to, size) > 0

/** The ground that costs more to cross: each area that is Difficult Terrain or costs more still (Wall of Thorns' 4 feet a foot). */
export const roughGround = (areas: readonly FloorArea[]): Rough[] => areas.flatMap((area) => (area.rules.rough ? [{ shape: areaShape(area), cost: area.rules.rough }] : []))

/**
 * A floor with the walls that stand on it in play (./spell-rules `solid`: Wall of Force) among its solid things, so a
 * walk stops at them and they give Total Cover. With no such wall it is the floor as it was.
 */
export function floorInPlay<F extends Floor>(floor: F, characters: readonly Holder[]): F
export function floorInPlay<F extends Floor>(floor: F | undefined, characters: readonly Holder[]): F | undefined
export function floorInPlay<F extends Floor>(floor: F | undefined, characters: readonly Holder[]): F | undefined {
  if (!floor) return floor
  const walls = floorAreas(characters).filter((area) => area.rules.solid)
  return walls.length ? { ...floor, solids: [...floor.solids, ...walls.map((area) => areaShape(area))] } : floor
}

// How far a creature senses with Blindsight, which sees into an area that hides: a hero's sheet, or an NPC's stat block.
function blindsightOf(character: Roller): number {
  if (character.sheet) return deriveSheet(character.sheet).senses.find((sense) => sense.type === "blindsight")?.range ?? 0
  if (character.type !== "npc") return 0
  return monsterById.get(character.statBlock ?? DEFAULT_STAT_BLOCK)?.senses?.blindsight ?? 0
}

/**
 * Whether a line of sight between two points is blocked by an area that is Heavily Obscured (./spell-rules
 * `obscures`): Fog Cloud, Darkness, a wall of fire. It is blocked when either point is in such an area or the line
 * passes through one.
 */
export const sightBlocked = (areas: readonly FloorArea[], from: Point, to: Point): boolean =>
  areas.some((area) => area.rules.obscures && (inFloorArea(area, from) || inFloorArea(area, to) || feetIn(area, from, to) > 0))

/**
 * Whether one creature can see another for the areas on the floor: not where a Heavily Obscured area blocks the line
 * between them, unless the viewer's Blindsight reaches the other. Conditions are read elsewhere (Blinded, Invisible).
 * One with no position is seen.
 */
export function seesThrough(viewer: Standing, other: Standing, present: readonly Holder[]): boolean {
  if (!viewer.position || !other.position) return true
  const areas = floorAreas(present)
  if (!sightBlocked(areas, viewer.position, other.position)) return true
  const reach = blindsightOf(viewer)
  return reach > 0 && between(viewer.position, other.position) - spaceOf(sizeOf(viewer)) / 2 - spaceOf(sizeOf(other)) / 2 + 5 <= reach + 0.5
}

/**
 * Advantage and Disadvantage the areas on the floor put on an attack roll, as for an unseen target or attacker: one who
 * cannot see their target attacks with Disadvantage, and one their target cannot see attacks with Advantage. Through fog
 * neither sees the other, and the two cancel.
 */
export function obscuredModes(attacker: Standing, target: Standing, present: readonly Holder[] | undefined): ModeSource[] {
  if (!present?.length) return []
  return [
    ...(seesThrough(attacker, target, present) ? [] : [{ mode: "disadvantage" as const, from: `${target.name ?? "Target"} Unseen` }]),
    ...(seesThrough(target, attacker, present) ? [] : [{ mode: "advantage" as const, from: `${attacker.name ?? "Attacker"} Unseen` }]),
  ]
}

// The mark an area leaves on one it touched this turn, for "the first time on a turn" and "only once per turn". It ends
// as the next round begins, as every turn effect does (./actions `turnEffectsAtRoundStart`).
const markOf = (area: FloorArea) => `area:${area.spell.id}:${area.by}`

/** Whether an area has touched a creature on this turn already. */
export const touchedThisTurn = (creature: { turnEffects?: readonly TurnEffect[] }, area: FloorArea): boolean => !!creature.turnEffects?.some((effect) => effect.id === markOf(area))

/** A creature an area has touched on this turn. */
export const withTouch = <T extends { turnEffects?: readonly TurnEffect[] }>(creature: T, area: FloorArea): T => ({
  ...creature,
  turnEffects: [...(creature.turnEffects ?? []).filter((effect) => effect.id !== markOf(area)), { id: markOf(area), by: area.by, turns: 1 }],
})
