// City maps drawn from a setting's map file, content/settings/{settingId}/maps/{map}.json, and where each encounter
// stands on one. The encounter index is written by `pnpm map:check --write` from each encounter's `landmark`.

import kordavos from "@/content/settings/realm-of-myr/maps/kordavos.json"
import art from "./art.json"
import encounterPlaces from "./encounter-places.json"

export type Point = [number, number]
export type Box = [x: number, y: number, width: number, height: number]
export type LabelSide = "left" | "right" | "above" | "below"

export interface MapShape {
  id: string
  name?: string
  polygon?: Point[]
  path?: Point[]
  width?: number
}
export interface MapDistrict extends MapShape {
  name: string
  polygon: Point[]
  elevation: "low" | "middle" | "high"
  labelAt?: Point
}
export interface MapLandmark {
  id: string
  name: string
  kind: string
  x: number
  y: number
  district?: string
  below?: boolean
  stageOnly?: boolean
  label?: LabelSide
}
// Painted art for a map, written by scripts/city-map-paint.ts: the whole map, and each district up close.
export interface MapArt {
  src: string
  box: Box
}
export interface CityMap {
  id: string
  name: string
  frame: { x: number; y: number; width: number; height: number }
  forests: Array<MapShape & { labelAt?: Point }>
  water: MapShape[]
  rivers: MapShape[]
  walls: MapShape[]
  roads: MapShape[]
  districts: MapDistrict[]
  landmarks: MapLandmark[]
  tunnels: Array<{ id: string; path: string[] }>
  art?: { outer?: MapArt; districts: Record<string, MapArt> }
}

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

// A place's spot: a landmark, a district's middle, or the middle of a road.
export function placeAt(map: CityMap, id: string): Point | null {
  const landmark = map.landmarks.find((l) => l.id === id)
  if (landmark) return [landmark.x, landmark.y]
  const district = map.districts.find((d) => d.id === id)
  if (district) return centroid(district.polygon)
  const road = map.roads.find((r) => r.id === id)
  if (road?.path) return road.path[Math.floor(road.path.length / 2)]
  return null
}

export function placeName(map: CityMap, id: string) {
  return [...map.landmarks, ...map.districts, ...map.roads].find((p) => p.id === id)?.name ?? id
}

export function centroid(points: Point[]): Point {
  return [points.reduce((sum, p) => sum + p[0], 0) / points.length, points.reduce((sum, p) => sum + p[1], 0) / points.length]
}

export function frameBox(map: CityMap): Box {
  return [map.frame.x, map.frame.y, map.frame.width, map.frame.height]
}

// A box of the given width round a point, kept inside the map.
export function boxAround(map: CityMap, [x, y]: Point, width: number, aspect = 1): Box {
  const height = width / aspect
  const { frame } = map
  return [clamp(x - width / 2, frame.x, frame.x + frame.width - width), clamp(y - height / 2, frame.y, frame.y + frame.height - height), width, height]
}

// A district with room round it.
export function districtBox(district: MapDistrict, pad = 70): Box {
  const xs = district.polygon.map((p) => p[0])
  const ys = district.polygon.map((p) => p[1])
  const x = Math.min(...xs) - pad
  const y = Math.min(...ys) - pad
  return [x, y, Math.max(...xs) + pad - x, Math.max(...ys) + pad - y]
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
