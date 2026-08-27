"use client"

// Procedural room enclosure for the interior-* scene kits — the third instance of
// the ForestRing / UrbanRing pattern. The reasoning is unchanged: "this tavern
// feels like a room" is a player-visible quality, so it is guaranteed in code and
// the LLM only furnishes the floor.
//
// The shell is: stacked masonry wall runs along the north, east and west edges
// (south stays open — the camera's side of the diorama, same rule the treeline and
// the street front follow), an optional pillar colonnade for grand halls, a dark
// ceiling plane, and a skirt of dark plane above the masonry so the room reads as
// closed even where the courses stop short of the ceiling.
//
// Orientation matches urban-ring: the KayKit wall panels are thin in Z, so
// rotation 0 faces south, toward the viewer.

import { useMemo } from "react"
import * as THREE from "three"
import { INTERIOR_PILLAR_ASSET, INTERIOR_WALL_ASSETS, INTERIOR_WALL_COURSE, type InteriorShell } from "@/lib/encounterview/asset-catalog"
import { SCENE_BOARD_SIZE } from "@/lib/encounterview/generate"
import { type ForestAvoidZone, InstancedModel, mulberry32, type ScatterPlacement } from "./forest-ring"

const FACE_SOUTH = 0
const FACE_EAST = Math.PI / 2
const FACE_WEST = -Math.PI / 2

/** Wall centreline inset from the board edge. Keeps the 0.5 m-thick panels on the board. */
const WALL_INSET = 0.55
/** One wall-stone panel is 2 m wide; step slightly under so the run has no gaps. */
const WALL_STEP = 1.9

export interface RoomPlan {
  shell: InteriorShell
  walls: ScatterPlacement[]
  pillars: ScatterPlacement[]
}

/**
 * Lay out the room. Pure and deterministic in (shell, seed) — no avoid list: a
 * wall with holes punched in it stops being a wall, and the LLM's props are
 * clamped to the board interior anyway, so at worst a bar-counter sits flush
 * against the masonry, which is where a bar-counter belongs.
 */
export function planRoomShell(shell: InteriorShell | null, seed: number): RoomPlan | null {
  if (!shell) return null
  const random = mulberry32(seed ^ 0x30cd)
  const walls: ScatterPlacement[] = []
  const pillars: ScatterPlacement[] = []
  const base = new THREE.Color(shell.wallTint)
  const tint = () => base.clone().offsetHSL(random() * 0.02 - 0.01, random() * 0.04 - 0.02, random() * 0.1 - 0.05)

  const span = SCENE_BOARD_SIZE - WALL_INSET * 2
  const count = Math.ceil(span / WALL_STEP)
  for (let course = 0; course < shell.courses; course++) {
    const y = course * INTERIOR_WALL_COURSE
    for (let i = 0; i <= count; i++) {
      const along = WALL_INSET + (i / count) * span
      // north (far) run, then the two side runs
      walls.push({ assetIndex: 0, x: along, z: WALL_INSET, y, rotation: FACE_SOUTH, scale: 1, tint: tint() })
      walls.push({ assetIndex: 0, x: WALL_INSET, z: along, y, rotation: FACE_EAST, scale: 1, tint: tint() })
      walls.push({ assetIndex: 0, x: SCENE_BOARD_SIZE - WALL_INSET, z: along, y, rotation: FACE_WEST, scale: 1, tint: tint() })
    }
  }

  if (shell.pillars) {
    // Two rows well inside the side walls, leaving the middle third clear for the
    // characters — a colonnade you look down, not an obstacle course.
    const rowX = [4.2, SCENE_BOARD_SIZE - 4.2]
    for (const x of rowX) {
      for (let z = 3.4; z <= SCENE_BOARD_SIZE - 3.4; z += 3.3) {
        pillars.push({ assetIndex: 0, x, z, rotation: 0, scale: 1, tint: tint() })
      }
    }
  }

  return { shell, walls, pillars }
}

/** Keep-clear zones for the colonnade, so scattered dressing does not grow through it. */
export function roomAvoidZones(plan: RoomPlan | null): ForestAvoidZone[] {
  if (!plan) return []
  return plan.pillars.map((p) => ({ x: p.x, z: p.z, radius: INTERIOR_PILLAR_ASSET.footprintRadius * p.scale + 0.3 }))
}

export function RoomShell({ plan }: { plan: RoomPlan | null }) {
  const wallAsset = plan ? INTERIOR_WALL_ASSETS[plan.shell.wall] : null
  const half = SCENE_BOARD_SIZE / 2
  const skirtTop = plan ? Math.max(plan.shell.ceiling, plan.shell.courses * INTERIOR_WALL_COURSE) : 0
  const skirtBottom = plan ? plan.shell.courses * INTERIOR_WALL_COURSE - 0.15 : 0
  const skirtHeight = Math.max(0.001, skirtTop - skirtBottom)

  const skirts = useMemo(
    () =>
      [
        { position: [0, skirtBottom + skirtHeight / 2, -half] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], width: SCENE_BOARD_SIZE },
        { position: [-half, skirtBottom + skirtHeight / 2, 0] as [number, number, number], rotation: [0, Math.PI / 2, 0] as [number, number, number], width: SCENE_BOARD_SIZE },
        { position: [half, skirtBottom + skirtHeight / 2, 0] as [number, number, number], rotation: [0, -Math.PI / 2, 0] as [number, number, number], width: SCENE_BOARD_SIZE },
      ] as const,
    [half, skirtBottom, skirtHeight]
  )

  if (!plan || !wallAsset) return null
  return (
    <>
      <InstancedModel file={wallAsset.file} baseScale={wallAsset.scale} placements={plan.walls} />
      {plan.pillars.length > 0 && <InstancedModel file={INTERIOR_PILLAR_ASSET.file} baseScale={INTERIOR_PILLAR_ASSET.scale} placements={plan.pillars} />}

      {/* Upper wall: a plain dark band from the top course to the ceiling, so the
          room is visually closed however tall the ceiling is set. */}
      {skirts.map((skirt) => (
        <mesh key={`${skirt.position[0]}:${skirt.position[2]}`} position={skirt.position} rotation={skirt.rotation}>
          <planeGeometry args={[skirt.width, skirtHeight]} />
          <meshStandardMaterial color={plan.shell.ceilingColor} roughness={1} side={THREE.DoubleSide} />
        </mesh>
      ))}

      {/* Ceiling, facing down. Not a shadow receiver — it would only ever be black. */}
      <mesh position={[0, plan.shell.ceiling, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[SCENE_BOARD_SIZE, SCENE_BOARD_SIZE]} />
        <meshStandardMaterial color={plan.shell.ceilingColor} roughness={1} side={THREE.DoubleSide} />
      </mesh>
    </>
  )
}
