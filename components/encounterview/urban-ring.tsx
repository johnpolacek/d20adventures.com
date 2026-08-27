"use client"

// Procedural building/wall enclosure for built-up scene kits — the ForestRing
// idea applied to streets, forts and courtyards. Same reasoning: a player-visible
// quality like "this checkpoint feels enclosed" can't be left to prompt wording,
// so the outer shell is guaranteed in code and the LLM only places what stands
// inside it. Seeded per turn, so a scene always renders the same buildings.
//
// Orientation: the asset pipeline normalizes every prop's front face to glTF +Z
// (blender/to_prop.py, "the game wants it on -Y" pre-export), and the KayKit wall
// panels are likewise thin in Z. So rotation 0 faces south, toward the viewer —
// which is exactly what the north-edge backdrop wants.

import { useMemo } from "react"
import * as THREE from "three"
import { type ForestAsset, RUINED_WALL_ASSETS, URBAN_FACADE_ASSETS, URBAN_WALL_ASSETS, type UrbanDressing } from "@/lib/encounterview/asset-catalog"
import { SCENE_BOARD_SIZE } from "@/lib/encounterview/generate"
import { type ForestAvoidZone, InstancedModel, mulberry32, type ScatterPlacement } from "./forest-ring"

const FACE_SOUTH = 0
const FACE_EAST = Math.PI / 2
const FACE_WEST = -Math.PI / 2

export interface UrbanPlan {
  facades: ScatterPlacement[]
  walls: ScatterPlacement[]
  wallAssets: ForestAsset[]
}

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
 * Lay out the enclosure. Pure and deterministic in (dressing, seed, avoid) so the
 * caller can plan once, feed the result into ForestRing's avoid list, and render.
 */
export function planUrbanRing(dressing: UrbanDressing, seed: number, avoid: ForestAvoidZone[]): UrbanPlan {
  const wallAssets = dressing.ruined ? RUINED_WALL_ASSETS : URBAN_WALL_ASSETS
  const facades: ScatterPlacement[] = []
  const walls: ScatterPlacement[] = []
  if (dressing.walls <= 0 && dressing.facades <= 0) return { facades, walls, wallAssets }

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

  // Facades: a street front across the north (far) edge, plus a short return down
  // the top of each side so the corners read as built-up rather than open.
  if (dressing.facades > 0) {
    const inset = 2.2
    const step = 5.4
    const span = SCENE_BOARD_SIZE - inset * 2
    const count = Math.floor(span / step)
    const jitter = () => 0.92 + random() * 0.18
    runEdge(facades, URBAN_FACADE_ASSETS, dressing.facades, count, (i) => [inset + (i / count) * span + (random() - 0.5) * 1.2, inset + (random() - 0.5) * 0.8], FACE_SOUTH, jitter)
    for (const side of [FACE_EAST, FACE_WEST]) {
      if (random() > dressing.facades * 0.7) continue
      const x = side === FACE_EAST ? inset : SCENE_BOARD_SIZE - inset
      tryPlace(facades, URBAN_FACADE_ASSETS, x, 5.2 + random() * 2.4, side, jitter())
    }
  }

  // Wall runs: down the east and west edges, and across whatever of the north edge
  // the facades did not take. The south edge stays open — that is the camera's side
  // of the diorama, the same rule the treeline follows.
  if (dressing.walls > 0) {
    const inset = 1.3
    // Slightly under the segment's own 2.2-unit span, so pieces abut or overlap a
    // little. Overlapping masonry still reads as a wall; a gapped run reads as broken.
    const step = 2.0
    const span = SCENE_BOARD_SIZE - inset * 2
    const count = Math.floor(span / step)
    // Runs read as masonry, not scatter: drift along the run only, never across it.
    const jitter = () => 0.95 + random() * 0.1
    const drift = () => (random() - 0.5) * 0.5
    runEdge(walls, wallAssets, dressing.walls, count, (i) => [inset, inset + (i / count) * span + drift()], FACE_EAST, jitter)
    runEdge(walls, wallAssets, dressing.walls, count, (i) => [SCENE_BOARD_SIZE - inset, inset + (i / count) * span + drift()], FACE_WEST, jitter)
    runEdge(walls, wallAssets, dressing.walls * (1 - dressing.facades), count, (i) => [inset + (i / count) * span + drift(), inset], FACE_SOUTH, jitter)
  }

  return { facades, walls, wallAssets }
}

/** Keep-clear zones for everything the enclosure occupies, so trees don't grow through it. */
export function urbanAvoidZones(plan: UrbanPlan): ForestAvoidZone[] {
  return [
    ...plan.facades.map((p) => ({ x: p.x, z: p.z, radius: URBAN_FACADE_ASSETS[p.assetIndex].footprintRadius * p.scale + 0.5 })),
    ...plan.walls.map((p) => ({ x: p.x, z: p.z, radius: plan.wallAssets[p.assetIndex].footprintRadius * p.scale + 0.3 })),
  ]
}

export function UrbanRing({ plan }: { plan: UrbanPlan }) {
  const facadesByAsset = useMemo(() => URBAN_FACADE_ASSETS.map((_, index) => plan.facades.filter((p) => p.assetIndex === index)), [plan.facades])
  const wallsByAsset = useMemo(() => plan.wallAssets.map((_, index) => plan.walls.filter((p) => p.assetIndex === index)), [plan.wallAssets, plan.walls])

  if (!plan.facades.length && !plan.walls.length) return null
  return (
    <>
      {URBAN_FACADE_ASSETS.map((asset, index) => (
        <InstancedModel key={`facade-${asset.file}`} file={asset.file} baseScale={asset.scale} placements={facadesByAsset[index]} />
      ))}
      {plan.wallAssets.map((asset, index) => (
        <InstancedModel key={`wall-${asset.file}`} file={asset.file} baseScale={asset.scale} placements={wallsByAsset[index]} />
      ))}
    </>
  )
}
