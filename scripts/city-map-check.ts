import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { loadLocalWikiAdventureRuntime } from "@/lib/wiki-adventures/local-runtime"

// Checks each city map in content/settings/{settingId}/maps/: every cited source line exists, every place sits in its
// district, every story constraint holds, and every encounter of the map's adventures names a place on it.

type Point = [number, number]
type Place = { id: string; name?: string; x?: number; y?: number; district?: string; polygon?: Point[]; path?: Point[]; sources?: string[] }
type Constraint = { a: string; rel: "near" | "north-of"; b: string; source: string }
type CityMap = {
  id: string
  settingId: string
  adventures: string[]
  frame: { width: number; height: number }
  water: Place[]
  rivers: Place[]
  walls: Place[]
  roads: Place[]
  districts: Place[]
  landmarks: Place[]
  tunnels: Array<{ id: string; path: string[] }>
  constraints: Constraint[]
  beyond: Place[]
}

const SETTINGS = "content/settings"
// Map units, out of a 1000 square frame. Near is about a few streets.
const NEAR = 120
const errors: string[] = []

function expect(condition: unknown, message: string) {
  if (!condition) errors.push(message)
  return Boolean(condition)
}

function main() {
  let maps = 0
  for (const settingId of readdirSync(SETTINGS)) {
    const dir = join(SETTINGS, settingId, "maps")
    if (!existsSync(dir)) continue
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
      checkMap(JSON.parse(readFileSync(join(dir, file), "utf8")) as CityMap, settingId)
      maps++
    }
  }
  expect(maps > 0, "No city maps found")
  if (errors.length) {
    console.error(errors.join("\n"))
    process.exit(1)
  }
  console.log(`city-map-check: ${maps} map(s) passed`)
}

function checkMap(map: CityMap, settingId: string) {
  const name = `${settingId}/${map.id}`
  const shapes = [...map.water, ...map.rivers, ...map.walls, ...map.roads, ...map.districts]
  const all = [...shapes, ...map.landmarks, ...map.beyond]
  const byId = new Map<string, Place>()
  for (const place of all) {
    expect(!byId.has(place.id), `${name}: duplicate id ${place.id}`)
    byId.set(place.id, place)
  }

  for (const place of map.landmarks) {
    expect(place.x! >= 0 && place.x! <= map.frame.width && place.y! >= 0 && place.y! <= map.frame.height, `${name}: ${place.id} is outside the frame`)
    if (!place.district) continue
    const district = byId.get(place.district)
    if (!expect(district?.polygon, `${name}: ${place.id} names unknown district ${place.district}`)) continue
    expect(inside([place.x!, place.y!], district!.polygon!), `${name}: ${place.id} is not inside ${place.district}`)
  }
  for (const tunnel of map.tunnels) for (const id of tunnel.path) expect(byId.has(id), `${name}: tunnel ${tunnel.id} names unknown ${id}`)

  for (const place of [...map.landmarks, ...map.roads, ...map.beyond]) for (const source of place.sources ?? []) checkSource(name, place.id, settingId, source)
  for (const constraint of map.constraints) {
    const label = `${constraint.a} ${constraint.rel} ${constraint.b}`
    checkSource(name, label, settingId, constraint.source)
    const a = byId.get(constraint.a)
    const b = byId.get(constraint.b)
    if (!a || !b) {
      expect(false, `${name}: constraint ${label} names an unknown place`)
      continue
    }
    if (constraint.rel === "north-of") expect(anchor(a)[1] < anchor(b)[1], `${name}: ${label} does not hold`)
    else expect(distance(a, b) <= NEAR, `${name}: ${label} does not hold, ${Math.round(distance(a, b))} apart`)
  }

  for (const adventureId of map.adventures) {
    const { artifacts } = loadLocalWikiAdventureRuntime(settingId, adventureId)
    for (const encounter of Object.values(artifacts.encounters)) {
      const where = `${adventureId}/${encounter.id}`
      if (!encounter.landmarkId) {
        expect(false, `${where} has no landmark`)
        continue
      }
      const [mapId, placeId] = encounter.landmarkId.split("/")
      expect(mapId === map.id, `${where} names map ${mapId}`)
      const place = byId.get(placeId)
      expect(place && (map.landmarks.includes(place) || map.districts.includes(place) || map.roads.includes(place) || map.beyond.includes(place)), `${where} names unknown place ${placeId}`)
    }
  }
}

// A source is "file:line". Encounter files are relative to the adventure folder, "adventure.md" to March of Davos,
// "{adventure}/encounters/..." to the adventures folder, and "scripts/..." to the repo.
function checkSource(name: string, owner: string, settingId: string, source: string) {
  const [file, line] = source.split(":")
  const adventures = join(SETTINGS, settingId, "adventures")
  const path = file.startsWith("scripts/") ? file : file.startsWith("encounters/") || file === "adventure.md" ? join(adventures, "march-of-davos", file) : join(adventures, file)
  if (!expect(existsSync(path), `${name}: ${owner} cites missing file ${source}`)) return
  const text = readFileSync(path, "utf8").split("\n")[Number(line) - 1]
  expect(text?.trim(), `${name}: ${owner} cites a blank or missing line ${source}`)
}

function anchor(place: Place): Point {
  if (place.x !== undefined && place.y !== undefined) return [place.x, place.y]
  const points = place.polygon ?? place.path ?? []
  return [points.reduce((sum, p) => sum + p[0], 0) / points.length, points.reduce((sum, p) => sum + p[1], 0) / points.length]
}

// Distance between two places: points, or the nearest edges of districts, rivers, roads and walls. 0 when one overlaps the other.
function distance(a: Place, b: Place) {
  const pointsA = vertices(a)
  const pointsB = vertices(b)
  if (a.polygon && pointsB.some((point) => inside(point, a.polygon!))) return 0
  if (b.polygon && pointsA.some((point) => inside(point, b.polygon!))) return 0
  return Math.min(toShape(pointsA, b), toShape(pointsB, a))
}

function vertices(place: Place): Point[] {
  return place.polygon ?? place.path ?? [anchor(place)]
}

function toShape(points: Point[], shape: Place) {
  const line = shape.polygon ? [...shape.polygon, shape.polygon[0]] : (shape.path ?? [anchor(shape), anchor(shape)])
  return Math.min(...points.flatMap((point) => line.slice(1).map((end, i) => toSegment(point, line[i], end))))
}

function toSegment([x, y]: Point, [x1, y1]: Point, [x2, y2]: Point) {
  const length = (x2 - x1) ** 2 + (y2 - y1) ** 2
  const t = length ? Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / length)) : 0
  return Math.hypot(x - (x1 + t * (x2 - x1)), y - (y1 + t * (y2 - y1)))
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

main()
