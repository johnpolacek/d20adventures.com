import { FEET_PER_METRE, type Floor, type Point, type Solid, standingRoom } from "./space"

/** A named place of the floor, which a character may walk to: "the gangway", "the cabin door". */
export type Place = { id: string; label: string; at: Point }

/** One of the cast as the encounter stages them: who, and where they start. */
export type Staged = { id: string; name?: string; at: Point }

/**
 * An encounter's floor as the engine reads it, in feet: its solid things and doorways, its named places, where the
 * cast starts, the spots where the party stands, and spare spots for heroes beyond them.
 */
export type EncounterFloor = Floor & { places: readonly Place[]; cast: readonly Staged[]; party: readonly Staged[]; spare: readonly Point[] }

type Metres = { x: number; z: number }

/**
 * A floor plan as the 3D stage authors it, in metres with x and z, read here by its shape alone: the engine imports
 * nothing of the stage.
 */
export type FloorPlanInMetres = {
  solids: readonly (({ kind: "rect"; hw: number; hd: number; ry: number } | { kind: "circle"; r: number }) & Metres & { height?: number })[]
  doors: readonly (readonly [Metres, Metres])[]
  places: readonly ({ id: string; label: string } & Metres)[]
  cast: readonly ({ id: string; name?: string } & Metres)[]
  party: readonly ({ id: string } & Metres)[]
  spare: readonly Metres[]
}

const inFeet = (point: Metres): Point => ({ x: point.x * FEET_PER_METRE, y: point.z * FEET_PER_METRE })

/** A stage's floor plan in the engine's feet: a metre is 3.28084 feet, and the stage's z is the floor's y. */
export function floorFromMetres(plan: FloorPlanInMetres): EncounterFloor {
  const top = (solid: { height?: number }) => (solid.height === undefined ? {} : { top: solid.height * FEET_PER_METRE })
  return {
    solids: plan.solids.map(
      (solid): Solid =>
        solid.kind === "circle"
          ? { kind: "circle", ...inFeet(solid), radius: solid.r * FEET_PER_METRE, ...top(solid) }
          : { kind: "rect", ...inFeet(solid), halfWidth: solid.hw * FEET_PER_METRE, halfDepth: solid.hd * FEET_PER_METRE, turn: solid.ry, ...top(solid) }
    ),
    doors: plan.doors.map(([inside, outside]) => [inFeet(inside), inFeet(outside)] as const),
    places: plan.places.map((place) => ({ id: place.id, label: place.label, at: inFeet(place) })),
    cast: plan.cast.map((member) => ({ id: member.id, ...(member.name ? { name: member.name } : {}), at: inFeet(member) })),
    party: plan.party.map((slot) => ({ id: slot.id, at: inFeet(slot) })),
    spare: plan.spare.map(inFeet),
  }
}

type Placeable = { id: string; name: string; type?: string; position?: Point }

// The staged cast member who stands for a character: by id, or by first name where an older staging names its cast so.
const stagedFor = (cast: readonly Staged[], character: Placeable): Staged | undefined =>
  cast.find((member) => member.id === character.id) ?? cast.find((member) => member.id === character.name.split(" ")[0].toLowerCase())

/**
 * The characters of an encounter as it opens, each where the floor puts them. An NPC stands where the cast is staged.
 * A hero the staging names keeps their own spot among the party's. Other heroes take the party's free spots in order,
 * then the spare ones, and one more than those hold stands beside the party. An NPC the staging does not hold has no
 * place, and no position.
 */
export function placeCharacters<T extends Placeable>(characters: readonly T[], floor: EncounterFloor): T[] {
  const free = [...floor.party]
  const placed = new Map<string, Point>()
  const heroes = characters.filter((character) => character.type === "pc")
  const unseated = heroes.filter((hero) => {
    const own = stagedFor(floor.cast, hero)
    const slot = own ? free.findIndex((entry) => entry.id === own.id) : -1
    if (slot < 0) return true
    placed.set(hero.id, free.splice(slot, 1)[0].at)
    return false
  })
  const spots = [...free.map((slot) => slot.at), ...floor.spare]
  for (const hero of unseated) {
    const taken = [...placed.values()]
    const spot = spots.shift() ?? standingRoom(floor.solids, taken, taken[0] ?? { x: 0, y: 0 }, taken[0] ?? floor.party[0]?.at ?? { x: 0, y: 0 })
    placed.set(hero.id, spot)
  }
  for (const npc of characters) {
    if (npc.type === "pc") continue
    const staged = stagedFor(floor.cast, npc)
    if (staged) placed.set(npc.id, staged.at)
  }
  return characters.map((character) => {
    const { position: _, ...rest } = character
    const at = placed.get(character.id)
    return (at ? { ...rest, position: { x: at.x, y: at.y } } : rest) as T
  })
}
