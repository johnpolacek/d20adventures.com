// City maps: a city's layout from its map file (content/settings/{settingId}/maps/), the geometry the game's map view
// draws from, and the map in words for the GM, so narration and map agree. Pure: the caller passes the map in.
// See wiki/plans/kordavos-city-map.md.

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
  // Where the district's own painting shows up close, when it reaches past the district, such as the docks' harbour.
  artClip?: Point[]
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
  // A secret of the story: the GM is not told of it until the party is there or it is the way on.
  hidden?: boolean
  // Known from the start, such as the city in the distance: shown before the party has been there.
  known?: boolean
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
  // The city in a few sentences, for the GM.
  summary?: string
  frame: { x: number; y: number; width: number; height: number }
  forests: Array<MapShape & { labelAt?: Point }>
  water: MapShape[]
  rivers: MapShape[]
  walls: MapShape[]
  roads: MapShape[]
  districts: MapDistrict[]
  landmarks: MapLandmark[]
  tunnels: Array<{ id: string; path: string[] }>
  // The tunnels under the city, drawn on their own: their name and the box their painting covers.
  underground?: { name: string; box: Box }
  art?: { outer?: MapArt; underground?: MapArt; districts: Record<string, MapArt> }
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

// The map in words, for the GM: where the scene stands, what is near it and which way each way on leads.

// Map units. The walled city spans about 1000.
const NEAR = 260
const DIRECTIONS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"]

type Encounters = Record<string, { title: string; landmarkId?: string; transitions: Array<{ toEncounterId: string }> }>

// Where an encounter stands on this map: its landmark, "map/place", when the map is this one.
function placeOf(map: CityMap, encounters: Encounters, encounterId: string) {
  const [mapId, place] = (encounters[encounterId]?.landmarkId ?? "").split("/")
  return mapId === map.id && place ? place : null
}

// The scene's staging and its place in the city, as one block for the GM.
export function withCityContext(staging: string | undefined, map: CityMap | undefined, encounters: Encounters, encounterId: string) {
  return [staging, map && cityContext(map, encounters, encounterId)].filter(Boolean).join("\n\n") || undefined
}

// Undefined when the encounter is not on a city map.
export function cityContext(map: CityMap, encounters: Encounters, encounterId: string): string | undefined {
  const place = placeOf(map, encounters, encounterId)
  if (!place) return undefined
  const here = placeAt(map, place)
  if (!here) return undefined
  const landmark = map.landmarks.find((l) => l.id === place)
  const below = Boolean(landmark?.below)
  const lines = [`Map of ${map.name}, north up. Keep directions, distances and routes consistent with it, and use its place names.`]
  if (map.summary) lines.push(`- In brief: ${map.summary}`)
  const setting = where(map, place, here, below)
  lines.push(`- Here: ${placeName(map, place)}${setting ? `, ${setting}` : ""}.`)
  if (below) {
    const tunnel = map.tunnels.find((t) => t.path.includes(place))
    if (tunnel) {
      const i = tunnel.path.indexOf(place)
      const back = tunnel.path[i - 1]
      const on = tunnel.path[i + 1]
      if (back) lines.push(`- Back up the tunnel: ${placeName(map, back)}.`)
      if (on) lines.push(`- On down the tunnel: ${placeName(map, on)}.`)
    }
  } else {
    // Street-level places round the scene. Stage-only places are no part of the story, and hidden ones are secrets.
    const near = map.landmarks
      .filter((l) => l.id !== place && !l.below && !l.stageOnly && !l.hidden && distance(here, l) <= NEAR)
      .sort((a, b) => distance(here, a) - distance(here, b))
      .slice(0, 6)
      .map((l) => `${l.name}, ${bearing(here, l)}`)
    if (near.length) lines.push(`- Nearby: ${near.join("; ")}.`)
  }
  const exits = (encounters[encounterId]?.transitions ?? []).flatMap((t) => {
    const next = placeOf(map, encounters, t.toEncounterId)
    const to = next ? placeAt(map, next) : null
    if (!next || !to || next === place) return []
    const title = encounters[t.toEncounterId]?.title ?? t.toEncounterId
    const name = placeName(map, next)
    return [`${title === name ? name : `${title} at ${name}`}, ${bearing(here, { x: to[0], y: to[1] })}`]
  })
  if (exits.length) lines.push(`- Ways on: ${[...new Set(exits)].join("; ")}.`)
  return lines.join("\n")
}

function where(map: CityMap, place: string, [x, y]: Point, below: boolean) {
  const district = map.districts.find((d) => d.id === place)
  if (district) return `a district of the city`
  const above = map.districts.find((d) => inside([x, y], d.polygon))
  if (below) return above ? `underground, beneath ${above.name}` : "underground"
  if (above) return `in ${above.name}`
  return map.walls.length ? "outside the walls" : undefined
}

function distance([x, y]: Point, to: { x: number; y: number }) {
  return Math.hypot(to.x - x, to.y - y)
}

// Which way and how far, in words. North is up, so y grows southward.
function bearing(from: Point, to: Pick<MapLandmark, "x" | "y">) {
  const d = distance(from, to)
  if (d < 25) return "right here"
  const angle = Math.atan2(to.y - from[1], to.x - from[0])
  const way = DIRECTIONS[(Math.round(angle / (Math.PI / 4)) + 8) % 8]
  const far = d < 60 ? "next door" : d < 160 ? "a short walk" : d < 350 ? "across a district or two" : "across the city"
  return `${way}, ${far}`
}

function inside([x, y]: Point, polygon: Point[]) {
  let result = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) result = !result
  }
  return result
}
