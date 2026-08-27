"use client"

// Procedural building/wall enclosure for built-up scene kits — the ForestRing
// idea applied to streets, forts and courtyards. Same reasoning: a player-visible
// quality like "this checkpoint feels enclosed" can't be left to prompt wording,
// so the outer shell is guaranteed in code and the LLM only places what stands
// inside it. Seeded per turn, so a scene always renders the same buildings.
//
// City-entrance kits (checkpoint, courtyard) go further: the north edge is a
// single unbroken run of the tall city wall from x=0 to x=20, parting only for the
// gate the model placed, with the facades pushed out to the east/west returns.
// Scattered low wall fragments with gaps between them do not read as a city.
//
// Orientation: the asset pipeline normalizes every prop's front face to glTF +Z
// (blender/to_prop.py, "the game wants it on -Y" pre-export), and the KayKit wall
// panels are likewise thin in Z. So rotation 0 faces south, toward the viewer —
// which is exactly what the north-edge backdrop wants.

import { useMemo } from "react"
import * as THREE from "three"
import { CITY_WALL_ASSET, type ForestAsset, RUINED_WALL_ASSETS, URBAN_FACADE_ASSETS, URBAN_WALL_ASSETS, type UrbanDressing } from "@/lib/encounterview/asset-catalog"
import { SCENE_BOARD_SIZE } from "@/lib/encounterview/generate"
import type { SceneProp } from "@/types/encounter-scene-3d"
import { type ForestAvoidZone, InstancedModel, mulberry32, type ScatterPlacement } from "./forest-ring"

const FACE_SOUTH = 0
const FACE_EAST = Math.PI / 2
const FACE_WEST = -Math.PI / 2

/**
 * Rendered height of a north-run city wall segment, in metres. Under the ~6 m
 * gate-arch's crown so the arch still reads as the tallest thing on the board,
 * and far over head height so the run reads as a city wall rather than a garden
 * one. CITY_WALL_ASSET is 6.00 m tall at its catalog scale, so this is the
 * per-placement scale the ring applies on top.
 */
const NORTH_WALL_HEIGHT = 4.3
const NORTH_WALL_SCALE = NORTH_WALL_HEIGHT / 6.0
/** Segment span at that scale — the spacing the run has to step by to stay solid. */
const NORTH_WALL_LENGTH = (CITY_WALL_ASSET.length ?? 14.04) * NORTH_WALL_SCALE
/** Shaved off the step so float error can never open a hairline gap between segments. */
const NORTH_WALL_SEAM = 0.06
/** How far the run tucks BEHIND the gate's outermost stone, so the two interlock. */
const GATE_OVERLAP = 0.5
/** Fallback z for the run when the scene placed no gate to align with. */
const NORTH_WALL_Z = 1.6

/**
 * Rendered width of the gate landmarks, in board units at defaultScale — the size
 * of the hole the wall run has to leave. Measured off the GLBs' POSITION bounds
 * (x-extent x defaultScale); footprintRadius is deliberately much smaller on both
 * (it is the piers you collide with, not the span), so it is the wrong number here.
 */
const GATE_WIDTH: Record<string, number> = {
  "gate-arch": 8.0,
  gatehouse: 14.69,
}

export interface UrbanPlan {
  facades: ScatterPlacement[]
  walls: ScatterPlacement[]
  wallAssets: ForestAsset[]
  /** North-edge city wall run; empty unless the kit asks for one. */
  northWall: ScatterPlacement[]
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function pickWeighted(assets: ForestAsset[], random: () => number): number {
  const total = assets.reduce((sum, a) => sum + a.weight, 0)
  let roll = random() * total
  for (let i = 0; i < assets.length; i++) {
    roll -= assets[i].weight
    if (roll <= 0) return i
  }
  return assets.length - 1
}

/**
 * The scene's gate landmark, if it placed one: the widest gate-arch/gatehouse on
 * the board. The north wall run is built around it — same z, parting for its span —
 * so the gate reads as set INTO the city wall instead of standing beside it.
 */
function findGate(props: SceneProp[]): { x: number; z: number; halfWidth: number } | null {
  let best: { x: number; z: number; halfWidth: number } | null = null
  for (const prop of props) {
    const width = GATE_WIDTH[prop.propId]
    if (!width) continue
    const halfWidth = (width * prop.scale) / 2
    if (best && halfWidth <= best.halfWidth) continue
    best = { x: prop.x, z: prop.z, halfWidth }
  }
  return best
}

/**
 * Segment centres for one contiguous stretch of the north run, tiled outward from
 * `anchor` (the gate side, or the board centre when there is no gate) toward the
 * board edge. Anchoring at the gate is what makes the two meet flush; the far end
 * is allowed to overhang the board, which is exactly what "edge to edge" needs —
 * a run that stopped at x=0 would leave a visible stub of open ground.
 */
function northRunCentres(anchor: number, toward: -1 | 1): number[] {
  const distance = toward > 0 ? SCENE_BOARD_SIZE - anchor : anchor
  if (distance <= 0.2) return []
  const step = NORTH_WALL_LENGTH - NORTH_WALL_SEAM
  const count = Math.max(1, Math.ceil(distance / step))
  return Array.from({ length: count }, (_, i) => anchor + toward * (NORTH_WALL_LENGTH / 2 + i * step))
}

/**
 * Lay out the enclosure. Pure and deterministic in (dressing, seed, avoid, props)
 * so the caller can plan once, feed the result into ForestRing's avoid list, and
 * render. `props` is the model's own prop list, read only to find the gate the
 * north wall has to part around.
 */
export function planUrbanRing(dressing: UrbanDressing, seed: number, avoid: ForestAvoidZone[], props: SceneProp[] = []): UrbanPlan {
  const wallAssets = dressing.ruined ? RUINED_WALL_ASSETS : URBAN_WALL_ASSETS
  const facades: ScatterPlacement[] = []
  const walls: ScatterPlacement[] = []
  const northWall: ScatterPlacement[] = []
  if (dressing.walls <= 0 && dressing.facades <= 0 && !dressing.cityWall) return { facades, walls, wallAssets, northWall }

  const random = mulberry32(seed ^ 0x7ab1)
  const placed: { x: number; z: number; radius: number }[] = []

  const blocked = (x: number, z: number, radius: number) => {
    for (const zone of avoid) {
      if (Math.hypot(x - zone.x, z - zone.z) < zone.radius + radius * 0.6) return true
    }
    for (const p of placed) {
      if (Math.hypot(x - p.x, z - p.z) < (p.radius + radius) * 0.55) return true
    }
    return false
  }

  const greyTint = () => new THREE.Color(1, 1, 1).offsetHSL(0, random() * 0.04 - 0.02, random() * 0.14 - 0.07)

  const tryPlace = (into: ScatterPlacement[], assets: ForestAsset[], x: number, z: number, rotation: number, jitter: number) => {
    const assetIndex = pickWeighted(assets, random)
    const scale = jitter
    const radius = assets[assetIndex].footprintRadius * scale
    if (x < 0.4 || x > SCENE_BOARD_SIZE - 0.4 || z < 0.4 || z > SCENE_BOARD_SIZE - 0.4) return
    if (blocked(x, z, radius)) return
    placed.push({ x, z, radius })
    into.push({ assetIndex, x, z, rotation, scale, tint: greyTint() })
  }

  // Coverage is spent as ONE contiguous stretch per edge, not as a per-slot coin
  // flip: three wall segments scattered down an edge read as debris, the same three
  // shoulder to shoulder read as a wall. blocked() still punches holes where the
  // characters and the model's own props are, which is the gap you want anyway.
  const runEdge = (into: ScatterPlacement[], assets: ForestAsset[], coverage: number, count: number, at: (i: number) => [number, number], rotation: number, jitter: () => number) => {
    const length = Math.round(count * Math.min(coverage, 1))
    if (length <= 0) return
    const start = Math.floor(random() * (count - length + 1))
    for (let i = start; i <= start + length; i++) {
      const [x, z] = at(i)
      tryPlace(into, assets, x, z, rotation, jitter())
    }
  }

  // The north city wall goes down FIRST, before anything else can claim the edge:
  // it is the one piece of the enclosure that is not allowed to have holes in it.
  // A continuous line from x=0 to x=20 at a single z, parting only for the gate,
  // stepping by the segment's own measured span so neighbours meet flush. It skips
  // blocked() entirely — segments overlap each other by construction, and a prop
  // the model parked on the north edge must not be able to bite a hole in the wall.
  if (dressing.cityWall) {
    const gate = findGate(props)
    const z = gate ? clamp(gate.z, 0.8, 4.0) : NORTH_WALL_Z
    const centres = gate
      ? [...northRunCentres(gate.x - gate.halfWidth + GATE_OVERLAP, -1), ...northRunCentres(gate.x + gate.halfWidth - GATE_OVERLAP, 1)]
      : northRunCentres(0, 1)
    for (const x of centres) {
      northWall.push({ assetIndex: 0, x, z, rotation: FACE_SOUTH, scale: NORTH_WALL_SCALE, tint: greyTint() })
      // Claim the footprint so the side runs and facades don't stack into a wall
      // that is already standing there (the corners are inside its span).
      placed.push({ x, z, radius: NORTH_WALL_LENGTH / 2 })
    }
  }

  // Facades: a street front across the north (far) edge, plus a short return down
  // the top of each side so the corners read as built-up rather than open. When the
  // city wall owns the north edge the whole facade budget moves to the east/west
  // returns — a housefront in front of the wall only fights it for the same span.
  if (dressing.facades > 0) {
    const inset = 2.2
    const step = 5.4
    const jitter = () => 0.92 + random() * 0.18
    if (dressing.cityWall) {
      const start = 5.0
      const span = SCENE_BOARD_SIZE - start - inset
      const count = Math.floor(span / step)
      for (const side of [FACE_EAST, FACE_WEST] as const) {
        const x = side === FACE_EAST ? inset : SCENE_BOARD_SIZE - inset
        runEdge(facades, URBAN_FACADE_ASSETS, dressing.facades, count, (i) => [x + (random() - 0.5) * 0.8, start + (i / count) * span + (random() - 0.5) * 1.2], side, jitter)
      }
    } else {
      const span = SCENE_BOARD_SIZE - inset * 2
      const count = Math.floor(span / step)
      runEdge(facades, URBAN_FACADE_ASSETS, dressing.facades, count, (i) => [inset + (i / count) * span + (random() - 0.5) * 1.2, inset + (random() - 0.5) * 0.8], FACE_SOUTH, jitter)
      for (const side of [FACE_EAST, FACE_WEST]) {
        if (random() > dressing.facades * 0.7) continue
        const x = side === FACE_EAST ? inset : SCENE_BOARD_SIZE - inset
        tryPlace(facades, URBAN_FACADE_ASSETS, x, 5.2 + random() * 2.4, side, jitter())
      }
    }
  }

  // Wall runs: down the east and west edges, and across whatever of the north edge
  // the facades did not take. The south edge stays open — that is the camera's side
  // of the diorama, the same rule the treeline follows.
  if (dressing.walls > 0) {
    const inset = 1.3
    // Step off the panels' MEASURED span (both are 2.0 units long at their catalog
    // scale), minus a little, so pieces always overlap even at the worst drift:
    // overlapping masonry still reads as a wall, a gapped run reads as broken.
    const drifted = 0.2
    const step = (wallAssets[0].length ?? 2.0) - drifted * 2 - 0.05
    const span = SCENE_BOARD_SIZE - inset * 2
    const count = Math.floor(span / step)
    // Runs read as masonry, not scatter: drift along the run only, never across it.
    const jitter = () => 0.95 + random() * 0.1
    const drift = () => (random() - 0.5) * 2 * drifted
    runEdge(walls, wallAssets, dressing.walls, count, (i) => [inset, inset + i * step + drift()], FACE_EAST, jitter)
    runEdge(walls, wallAssets, dressing.walls, count, (i) => [SCENE_BOARD_SIZE - inset, inset + i * step + drift()], FACE_WEST, jitter)
    // The north edge only gets low masonry when nothing taller already owns it.
    if (!dressing.cityWall) {
      runEdge(walls, wallAssets, dressing.walls * (1 - dressing.facades), count, (i) => [inset + i * step + drift(), inset], FACE_SOUTH, jitter)
    }
  }

  return { facades, walls, wallAssets, northWall }
}

/** Keep-clear zones for everything the enclosure occupies, so trees don't grow through it. */
export function urbanAvoidZones(plan: UrbanPlan): ForestAvoidZone[] {
  return [
    ...plan.facades.map((p) => ({ x: p.x, z: p.z, radius: URBAN_FACADE_ASSETS[p.assetIndex].footprintRadius * p.scale + 0.5 })),
    ...plan.walls.map((p) => ({ x: p.x, z: p.z, radius: plan.wallAssets[p.assetIndex].footprintRadius * p.scale + 0.3 })),
    ...plan.northWall.map((p) => ({ x: p.x, z: p.z, radius: NORTH_WALL_LENGTH / 2 })),
  ]
}

export function UrbanRing({ plan }: { plan: UrbanPlan }) {
  const facadesByAsset = useMemo(() => URBAN_FACADE_ASSETS.map((_, index) => plan.facades.filter((p) => p.assetIndex === index)), [plan.facades])
  const wallsByAsset = useMemo(() => plan.wallAssets.map((_, index) => plan.walls.filter((p) => p.assetIndex === index)), [plan.wallAssets, plan.walls])

  if (!plan.facades.length && !plan.walls.length && !plan.northWall.length) return null
  return (
    <>
      <InstancedModel file={CITY_WALL_ASSET.file} baseScale={CITY_WALL_ASSET.scale} placements={plan.northWall} />
      {URBAN_FACADE_ASSETS.map((asset, index) => (
        <InstancedModel key={`facade-${asset.file}`} file={asset.file} baseScale={asset.scale} placements={facadesByAsset[index]} />
      ))}
      {plan.wallAssets.map((asset, index) => (
        <InstancedModel key={`wall-${asset.file}`} file={asset.file} baseScale={asset.scale} placements={wallsByAsset[index]} />
      ))}
    </>
  )
}
