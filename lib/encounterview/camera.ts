// Cinematic establishing shot for an encounter scene.
//
// The default camera used to be a fixed high three-quarter ([0, 16, 15], target
// [0, 0.5, 0]) — a map view. That reads every scene the same and throws away the
// one thing the Tier A/B props bought us: a big landmark at the far edge. This
// module computes, per scene, a low eye-level shot that puts the landmark high in
// frame with the character cluster centred in front of it.
//
// Pure and deterministic in (scene, fov, aspect): no randomness, no time, so the
// same turn always frames the same way. The renderer applies the result once and
// then hands the camera back to OrbitControls, so user orbit/zoom/pan is unchanged.

import { getPropDefinition } from "@/lib/encounterview/asset-catalog"
import { SCENE_BOARD_SIZE } from "@/lib/encounterview/generate"
import type { EncounterScene3D } from "@/types/encounter-scene-3d"

const DEG = Math.PI / 180
const BOARD_OFFSET = SCENE_BOARD_SIZE / 2

/** Vertical headroom above the landmark, as a fraction of the half-frame. */
const HEADROOM = 1.4
/**
 * How far the aim point slides off the character cluster toward the landmark.
 * Small on purpose: the characters stay centred and the (taller, further)
 * landmark rides up into the top third by itself.
 */
const AIM_BIAS = 0.2
/**
 * Every procedural enclosure (ForestRing, UrbanRing, RoomShell) leaves the south
 * edge open — that is the camera's side of the diorama. Blend the view direction
 * toward south so a landmark parked on an east/west edge can't swing the shot
 * around behind the set.
 */
const SOUTH_BIAS = 0.45
const MIN_DISTANCE = 14
const MAX_DISTANCE = 30
/** Keep the shot under OrbitControls' polar ceiling by lifting the eye if needed. */
const MIN_RISE_PER_UNIT = 0.075

export interface EstablishingShot {
  position: [number, number, number]
  target: [number, number, number]
  /**
   * OrbitControls clamps polar angle inside update(), so a genuinely low shot
   * needs the ceiling raised or the camera gets snapped back up to a map view.
   */
  maxPolarAngle: number
  maxDistance: number
  /** Distance from the eye to the furthest thing being framed — drives fog range. */
  depth: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

interface Point {
  x: number
  y: number
  z: number
}

/** Rendered height of a placement, from the measured catalog height. */
function placedHeight(propId: string, scale: number): number {
  const def = getPropDefinition(propId)
  if (!def) return 1
  return def.height * scale
}

/**
 * Pick the scene's landmark: the biggest thing in the "structure" category,
 * scored on footprint and height together so a gate-arch beats a fence run and a
 * gatehouse beats the gate-arch. Returns null when the model placed no structure
 * at all (the caller then aims at the far edge, where the procedural ring is).
 */
function findLandmark(scene: EncounterScene3D) {
  let best: { pos: Point; height: number; radius: number } | null = null
  let bestScore = 0
  for (const prop of scene.props) {
    const def = getPropDefinition(prop.propId)
    if (!def || def.category !== "structure") continue
    const radius = def.footprintRadius * prop.scale
    const height = placedHeight(prop.propId, prop.scale)
    // Height counts double: what makes a shot cinematic is something to look UP at.
    const score = radius + height * 2
    if (score <= bestScore) continue
    bestScore = score
    best = { pos: { x: prop.x - BOARD_OFFSET, y: 0, z: prop.z - BOARD_OFFSET }, height, radius }
  }
  return best
}

export function planEstablishingShot(scene: EncounterScene3D, options?: { fov?: number; aspect?: number }): EstablishingShot {
  const fov = options?.fov ?? 40
  const aspect = clamp(options?.aspect ?? 16 / 9, 0.5, 3)
  const tanV = Math.tan((fov / 2) * DEG)
  const tanH = tanV * aspect

  const characters = scene.characters
  const cluster: Point = characters.length
    ? {
        x: characters.reduce((sum, c) => sum + c.x, 0) / characters.length - BOARD_OFFSET,
        y: 0,
        z: characters.reduce((sum, c) => sum + c.z, 0) / characters.length - BOARD_OFFSET,
      }
    : { x: 0, y: 0, z: 0 }

  // No structure prop? Aim at the far edge anyway — that is where the procedural
  // treeline / street front / room wall stands, and it is the right backdrop.
  const landmark = findLandmark(scene) ?? { pos: { x: cluster.x * 0.4, y: 0, z: -BOARD_OFFSET + 2 }, height: 4.5, radius: 3 }

  // View axis: from the landmark toward the cluster (so the landmark ends up
  // behind the characters from the camera's side), blended toward south.
  let ax = cluster.x - landmark.pos.x
  let az = cluster.z - landmark.pos.z
  const span = Math.hypot(ax, az)
  if (span < 0.5) {
    ax = 0
    az = 1
  } else {
    ax /= span
    az /= span
  }
  ax = ax * (1 - SOUTH_BIAS)
  az = az * (1 - SOUTH_BIAS) + SOUTH_BIAS
  // Never look from the north half: that is the closed side of every enclosure.
  az = Math.max(az, 0.35)
  const axisLength = Math.hypot(ax, az) || 1
  ax /= axisLength
  az /= axisLength

  const target: Point = {
    x: cluster.x + (landmark.pos.x - cluster.x) * AIM_BIAS,
    // Mini eye-height, not the floor: aiming at the floor tips the whole board up.
    y: 1.15,
    z: cluster.z + (landmark.pos.z - cluster.z) * AIM_BIAS,
  }

  // Everything the shot has to contain: the minis (to the top of their heads) and
  // the landmark's top and its two lateral extremes.
  const rightX = az
  const rightZ = -ax
  const points: Point[] = [
    ...characters.map((c) => ({ x: c.x - BOARD_OFFSET, y: 2.1, z: c.z - BOARD_OFFSET })),
    { x: landmark.pos.x, y: landmark.height, z: landmark.pos.z },
    { x: landmark.pos.x - rightX * landmark.radius, y: 0, z: landmark.pos.z - rightZ * landmark.radius },
    { x: landmark.pos.x + rightX * landmark.radius, y: 0, z: landmark.pos.z + rightZ * landmark.radius },
  ]

  // The camera sits at target + axis * distance and looks back along -axis. A point
  // at signed depth `depth` (positive = on the camera's side of the target) is at
  // range distance - depth, so it fits the frustum when
  //   lateral <= (distance - depth) * tanH   and   vertical <= (distance - depth) * tanV,
  // i.e. distance >= lateral / tanH + depth. Things BEHIND the target — the
  // landmark, always — have negative depth and so need less distance, not more.
  let distance = MIN_DISTANCE
  let furthest = 0
  for (const p of points) {
    const vx = p.x - target.x
    const vy = p.y - target.y
    const vz = p.z - target.z
    const depth = vx * ax + vz * az
    const lateral = Math.abs(vx * rightX + vz * rightZ)
    const vertical = Math.abs(vy) * HEADROOM
    distance = Math.max(distance, lateral / tanH + depth, vertical / tanV + depth)
    furthest = Math.max(furthest, -depth)
  }
  distance = clamp(distance, MIN_DISTANCE, MAX_DISTANCE)

  // Eye height: low — 2 to 4 units, taller landmarks earn a little more lift —
  // but never so low that OrbitControls' polar ceiling would snap the shot back up.
  const eye = clamp(Math.max(2.2 + landmark.height * 0.22, target.y + distance * MIN_RISE_PER_UNIT), 2.2, 4.4)

  const position: [number, number, number] = [target.x + ax * distance, eye, target.z + az * distance]
  const polar = Math.atan2(distance, eye - target.y)

  return {
    position,
    target: [target.x, target.y, target.z],
    maxPolarAngle: clamp(polar + 0.03, 1.35, 1.55),
    maxDistance: Math.max(34, distance * 1.4),
    depth: distance + furthest,
  }
}
