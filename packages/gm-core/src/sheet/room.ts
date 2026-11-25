import type { Size } from "@d20/srd"
import type { EncounterFloor } from "./placement"
import { BASE_REACH, between, inWater, type Point, type Solid, solidAt, spaceOf, spanThrough } from "./space"

/** A spot within a room, as a player names one: a corner, against a wall, its far side, or its middle. */
export const ROOM_SPOTS = ["corner", "wall", "far side", "middle"] as const
export type RoomSpot = (typeof ROOM_SPOTS)[number]

// The grid the room is read on, in feet, and how far from where it is read a room may reach. A room that reaches that
// far is open ground, with no corners or walls to name.
const STEP = 1
const REACH = 30
// Half the width a doorway is taken to be, either side of the middle of its two points: the room ends there.
const DOOR = 3
// Spots closer than this are one corner.
const SAME = 3

type Cell = { key: string; at: Point }

/**
 * The open floor of the room a point is in, on a grid a foot square: the spots reached from it without crossing
 * anything solid, a doorway, or water, no farther than 30 feet. A point in a doorway is read from its inside, and one
 * on something solid from the nearest open spot beside it. None when the floor reaches 30 feet, as open ground does.
 */
function roomFloor(floor: EncounterFloor, at: Point): { cells: Map<string, Point>; holds: (at: Point) => boolean } | undefined {
  // A place in a doorway is read as in the room the door opens from.
  const doorway = floor.doors.find(([inside, outside]) => between(middle(inside, outside), at) < DOOR)
  const from = doorway ? doorway[0] : at
  // Each doorway is shut by a board across it, so the room ends there.
  const shut = floor.doors.map(([inside, outside]): Solid => {
    const mid = middle(inside, outside)
    return { kind: "rect", x: mid.x, y: mid.y, halfWidth: DOOR, halfDepth: 0.1, turn: Math.atan2(outside.x - inside.x, outside.y - inside.y) }
  })
  const near = [...floor.solids.filter((solid) => solidReach(solid, from) <= REACH + 2), ...shut]
  const open = (spot: Point) => !solidAt(near, spot) && !(floor.water?.length && inWater(floor.water, spot))
  const crosses = (a: Point, b: Point) => near.some((solid) => !!spanThrough(solid, a, b))
  const key = (i: number, j: number) => `${i},${j}`
  // A place on something solid, as a crate is, is read from the nearest open spot beside it.
  if (!open(from)) {
    const beside = [1, 2, 3, 4, 5].flatMap((radius) => Array.from({ length: 16 }, (_, index) => ({ x: from.x + Math.sin((index * Math.PI) / 8) * radius, y: from.y + Math.cos((index * Math.PI) / 8) * radius }))).find(open)
    return beside ? roomFloor({ ...floor, doors: [] , solids: near }, beside) : undefined
  }
  const cells = new Map<string, Point>([[key(0, 0), from]])
  const queue: [number, number][] = [[0, 0]]
  while (queue.length) {
    const [i, j] = queue.shift() as [number, number]
    const at = cells.get(key(i, j)) as Point
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = key(i + di, j + dj)
      if (cells.has(next)) continue
      const to = { x: from.x + (i + di) * STEP, y: from.y + (j + dj) * STEP }
      if (!open(to) || crosses(at, to)) continue
      if (between(from, to) >= REACH) return undefined
      cells.set(next, to)
      queue.push([i + di, j + dj])
    }
  }
  // Whether a point is on the room's floor: the grid square it falls in is.
  return { cells, holds: (at: Point) => cells.has(key(Math.round((at.x - from.x) / STEP), Math.round((at.y - from.y) / STEP))) }
}

const middle = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

// How far a solid thing's farthest edge could be from a point: enough to leave out those far off.
const solidReach = (solid: Solid, from: Point): number =>
  Math.max(0, between(solid, from) - (solid.kind === "circle" ? solid.radius : Math.hypot(solid.halfWidth, solid.halfDepth)))

/**
 * Where in a room one stands to be at the spot named (`RoomSpot`): the room a place, someone or the mover stands in,
 * read from `from`. A corner is one of the four the room's bounds make when turned to fit it tightest, and of those the
 * nearest the mover, or the farthest from `awayFrom`. A wall is the spot along one nearest the mover, or farthest
 * from `awayFrom`. The far side is the spot farthest from the mover, or from `awayFrom`. The middle is the spot nearest
 * the room's centre. Each spot leaves room to stand: nothing solid within most of half a space. A corner or a wall
 * someone at `taken` holds is passed over for another. None in open ground, or where there is no room to stand.
 *
 * Lyra in the tug's main cabin, asked to the corner: she goes to its nearest corner, a couple of feet off both walls.
 */
export function roomSpot(args: {
  floor: EncounterFloor
  from: Point
  spot: RoomSpot
  mover: Point
  awayFrom?: Point
  size?: Size
  /** Where others stand: a spot one of them holds is passed over for another, while there is another. */
  taken?: readonly Point[]
}): Point | undefined {
  const room = roomFloor(args.floor, args.from)
  if (!room) return undefined
  const all: Cell[] = [...room.cells.entries()].map(([key, at]) => ({ key, at }))
  // Clear of anything solid by most of half a space, so a figure stands there without touching it.
  const gap = (spaceOf(args.size) / 2) * 0.8
  const near = args.floor.solids.filter((solid) => solidReach(solid, args.from) <= REACH + 2)
  const ring = Array.from({ length: 8 }, (_, index) => ({ x: Math.sin((index * Math.PI) / 4) * gap, y: Math.cos((index * Math.PI) / 4) * gap }))
  const standable = all.filter(({ at }) => ring.every((offset) => room.holds({ x: at.x + offset.x, y: at.y + offset.y }) && !solidAt(near, { x: at.x + offset.x, y: at.y + offset.y })))
  if (!standable.length) return undefined
  const free = (spots: readonly Point[]) => {
    const clear = spots.filter((spot) => (args.taken ?? []).every((other) => between(other, spot) >= BASE_REACH))
    return clear.length ? clear : spots
  }
  const centre = { x: all.reduce((sum, cell) => sum + cell.at.x, 0) / all.length, y: all.reduce((sum, cell) => sum + cell.at.y, 0) / all.length }
  // Nearest the mover, or farthest from the one named.
  const pick = (spots: readonly Point[]): Point | undefined => {
    const away = args.awayFrom
    if (!spots.length) return undefined
    return away ? spots.reduce((a, b) => (between(b, away) > between(a, away) ? b : a)) : spots.reduce((a, b) => (between(b, args.mover) < between(a, args.mover) ? b : a))
  }
  if (args.spot === "middle") return standable.reduce((a, b) => (between(b.at, centre) < between(a.at, centre) ? b : a)).at
  if (args.spot === "far side") {
    const from = args.awayFrom ?? args.mover
    return standable.reduce((a, b) => (between(b.at, from) > between(a.at, from) ? b : a)).at
  }
  // The turn of the room that fits it in the smallest box, and the spot reaching furthest toward each corner of it.
  const turns = Array.from({ length: 36 }, (_, index) => (index * Math.PI) / 72)
  const box = (turn: number) => {
    const u = { x: Math.cos(turn), y: Math.sin(turn) }
    const across = all.map(({ at }) => (at.x - centre.x) * u.x + (at.y - centre.y) * u.y)
    const along = all.map(({ at }) => -(at.x - centre.x) * u.y + (at.y - centre.y) * u.x)
    return (Math.max(...across) - Math.min(...across)) * (Math.max(...along) - Math.min(...along))
  }
  const turn = turns.reduce((a, b) => (box(b) < box(a) ? b : a))
  const u = { x: Math.cos(turn), y: Math.sin(turn) }
  const v = { x: -u.y, y: u.x }
  // How far each spot is across the box from its centre, along its two sides.
  const across = (at: Point) => (at.x - centre.x) * u.x + (at.y - centre.y) * u.y
  const along = (at: Point) => (at.x - centre.x) * v.x + (at.y - centre.y) * v.y
  if (args.spot === "wall") {
    // A spot within a step of the box's side, past the clear ring it keeps: a wall, not a table it stands beside.
    const sides = { a: Math.max(...all.map((cell) => across(cell.at))), b: Math.min(...all.map((cell) => across(cell.at))), c: Math.max(...all.map((cell) => along(cell.at))), d: Math.min(...all.map((cell) => along(cell.at))) }
    const reach = gap + STEP * 1.5
    const edge = standable.filter(({ at }) => sides.a - across(at) <= reach || across(at) - sides.b <= reach || sides.c - along(at) <= reach || along(at) - sides.d <= reach)
    return pick(free(edge.map((cell) => cell.at)))
  }
  const corners: Point[] = []
  for (const [a, b] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    const reach = (at: Point) => a * across(at) + b * along(at)
    const best = standable.reduce((p, q) => (reach(q.at) > reach(p.at) ? q : p)).at
    if (corners.every((corner) => between(corner, best) >= SAME)) corners.push(best)
  }
  // Not the corner they already stand in, unless it is the only one.
  const elsewhere = corners.filter((corner) => between(corner, args.mover) >= SAME)
  return pick(free(elsewhere.length && !args.awayFrom ? elsewhere : corners))
}

