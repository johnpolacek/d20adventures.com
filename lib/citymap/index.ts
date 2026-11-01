// City maps drawn from a setting's map file, content/settings/{settingId}/maps/{map}.json, and where each encounter
// stands on one. The encounter index is written by `pnpm map:check --write` from each encounter's `landmark`.

import { type CityMap, placeAt } from "@d20/gm-core/citymap"
import kordavos from "@/content/settings/realm-of-myr/maps/kordavos.json"
import art from "./art.json"
import encounterPlaces from "./encounter-places.json"

export * from "@d20/gm-core/citymap"

const ART = art as unknown as Record<string, CityMap["art"]>
const MAPS: Record<string, CityMap> = { kordavos: { ...(kordavos as unknown as CityMap), art: ART.kordavos } }
const PLACES = encounterPlaces as Record<string, Record<string, string>>

// Where the party has been on a plan's city map, oldest first and ending where it is now. Places with no spot on the
// map, such as the forest pier three miles off, are left out. Null when the current encounter is not on a map.
export function cityMapTrail(planId: string, encounterIds: string[]): { map: CityMap; trail: string[] } | null {
  const places = PLACES[planId]
  const current = places?.[encounterIds[encounterIds.length - 1]]
  if (!current) return null
  const [mapId] = current.split("/")
  const map = MAPS[mapId]
  if (!map) return null
  const trail: string[] = []
  for (const id of encounterIds) {
    const [placeMap, place] = (places[id] ?? "").split("/")
    if (placeMap === mapId && placeAt(map, place) && trail[trail.length - 1] !== place) trail.push(place)
  }
  return trail.length ? { map, trail } : null
}

// The city map a plan's encounters stand on, if any, for its pack.
export function cityMapFor(planId: string): CityMap | undefined {
  const first = Object.values(PLACES[planId] ?? {})[0]
  return first ? MAPS[first.split("/")[0]] : undefined
}
