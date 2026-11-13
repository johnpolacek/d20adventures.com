import { hasFled } from "../utils/turn-actors"
import { BASE_REACH, between, distance, FEET_PER_METRE, type Floor, type Point, placedOf, type Solid, type Standing, standingRoom } from "./space"

/** A named place of the floor, which a character may walk to: "the gangway", "the cabin door". */
export type Place = { id: string; label: string; at: Point }

/** One of the cast as the encounter stages them: who, and where they start. */
export type Staged = { id: string; name?: string; at: Point }

/**
 * An encounter's floor as the engine reads it, in feet: its solid things and doorways, its named places, where the
 * cast starts, the spots where the party stands, and spare spots for heroes beyond them.
 */
export type EncounterFloor = Floor & {
  places: readonly Place[]
  cast: readonly Staged[]
  party: readonly Staged[]
  spare: readonly Point[]
  /** The place in a sentence or two, for the game master. */
  where?: string
  /** The 3D set the floor is drawn from. Encounters on one set share a floor. */
  set?: string
}

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
  where?: string
  set?: string
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
    ...(plan.where ? { where: plan.where } : {}),
    ...(plan.set ? { set: plan.set } : {}),
    // A way round may pass by the named places: they are where the set means people to walk.
    waypoints: plan.places.map(inFeet),
  }
}

type Placeable = { id: string; name: string; type?: string; position?: Point; master?: { id: string; summoned?: true } }

// The staged cast member who stands for a character: by id, or by first name where an older staging names its cast so.
const stagedFor = (cast: readonly Staged[], character: Placeable): Staged | undefined =>
  cast.find((member) => member.id === character.id) ?? cast.find((member) => member.id === character.name.split(" ")[0].toLowerCase())

/**
 * The characters of an encounter as it opens, each where the floor puts them. An NPC stands where the cast is staged.
 * A hero the staging names keeps their own spot among the party's. Other heroes take the party's free spots in order,
 * then the spare ones, and one more than those hold stands beside the party. An NPC the staging does not hold has no
 * place, and no position.
 *
 * `before` is the encounter just left, when it was on this same set: where it staged each character, and where each
 * stood as it ended. One whom this encounter stages where the last one did, within a space, stays where they stood:
 * the scene goes on. One it stages elsewhere takes the new spot: the story has moved them. The heroes are moved
 * together: when any of them is staged elsewhere, all take their new spots, as a party that waited in line now stands
 * at the table.
 */
export function placeCharacters<T extends Placeable>(characters: readonly T[], floor: EncounterFloor, before?: { staged: ReadonlyMap<string, Point>; standing: ReadonlyMap<string, Point> }): T[] {
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
  // A creature a spell called, which no staging names, stands beside the one who called it.
  for (const called of characters) {
    const by = called.master?.summoned ? placed.get(called.master.id) : undefined
    if (by && !placed.has(called.id)) placed.set(called.id, standingRoom(floor.solids, [...placed.values()], by, by))
  }
  // Whether this encounter stages someone more than a space from where the last one did.
  const restaged = (id: string) => {
    const now = placed.get(id)
    const was = before?.staged.get(id)
    return !now || !was || between(now, was) > BASE_REACH
  }
  const partyMoved = heroes.some((hero) => restaged(hero.id))
  return characters.map((character) => {
    const { position: _, ...rest } = character
    const staged = placed.get(character.id)
    const stood = before?.standing.get(character.id)
    const at = staged && stood && !restaged(character.id) && !(character.type === "pc" && partyMoved) ? stood : staged
    return (at ? { ...rest, position: { x: at.x, y: at.y } } : rest) as T
  })
}

/**
 * Where everyone stands, in words for the game master: the place, its named spots, and each character with the spot
 * they are at or nearest and how far each of the others is from them, in feet. The dead, the fled, those away for now
 * and those with no position are left out. None when no one has a position.
 */
export function standingWords(characters: readonly (Standing & { name: string; dead?: true; fled?: true })[], floor: EncounterFloor): string | undefined {
  const here = characters.flatMap((character) => {
    const at = character.dead || hasFled(character) ? undefined : placedOf(character)
    return at ? [{ name: character.name, at }] : []
  })
  if (!here.length) return undefined
  const spot = (at: Point) => {
    const nearest = [...floor.places].sort((a, b) => between(a.at, at) - between(b.at, at))[0]
    if (!nearest) return ""
    const feet = between(nearest.at, at)
    return feet <= BASE_REACH ? `, at ${nearest.label}` : `, ${Math.round(feet)} feet from ${nearest.label}`
  }
  const lines = here.map((one) => {
    const others = here.filter((other) => other !== one).map((other) => `${other.name} ${Math.round(distance(one.at, other.at))}`)
    return `- ${one.name}${spot(one.at.at)}${others.length ? `: ${others.join(", ")}` : ""}.`
  })
  return [
    floor.where,
    floor.places.length ? `Named places: ${floor.places.map((place) => place.label).join(", ")}.` : undefined,
    `Where everyone stands, and how many feet each of the others is from them:\n${lines.join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n")
}
