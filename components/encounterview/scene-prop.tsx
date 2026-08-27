"use client"

// One placed prop on the tabletop. GLB props render via drei <Clone> (the same
// asset appears many times per scene); "campfire" is procedural — no KayKit pack
// ships one, and the glow matters for night scenes.

import { Clone, useGLTF } from "@react-three/drei"
import { useMemo } from "react"
import type * as THREE from "three"
import { getPropDefinition } from "@/lib/encounterview/asset-catalog"
import type { SceneProp as ScenePropSpec } from "@/types/encounter-scene-3d"

const BOARD_OFFSET = 10

const toWorld = (x: number, z: number): [number, number, number] => [x - BOARD_OFFSET, 0, z - BOARD_OFFSET]
const toRadians = (degrees: number) => (degrees * Math.PI) / 180

/**
 * Half a turn, because every prop GLB in the catalog is authored facing +Z and the
 * board's +Z is SOUTH — toward the viewer — while the generation prompt promises
 * the opposite ("rotation 0 = facing north/away from viewer"). Without this a
 * gate guard told to face the queue at 180 turned its back on it.
 *
 * Both asset families are +Z-authored:
 *  - generated props (asset-pipeline blender/to_prop.py) yaw the mesh so the front
 *    lands on Blender -Y, which the glTF exporter's Y-up conversion maps to +Z.
 *  - KayKit packs: room-shell.tsx stands wall-stone on the WEST edge at +90deg to
 *    turn its face into the room, which only works if the face starts on +Z; and
 *    character-mini.tsx already carries this exact same +PI on the KayKit character
 *    minis, whose facing is known-correct on the board today.
 *
 * The procedural paths (UrbanRing, RoomShell, ForestRing) do NOT go through here:
 * they write world radians straight into InstancedModel, which applies them with
 * the OPPOSITE sign and no offset, so their FACE_SOUTH/FACE_EAST constants are
 * unaffected by this.
 */
const AUTHORED_FRONT_YAW = Math.PI

function Campfire({ scale }: { scale: number }) {
  const stones = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const angle = (i / 7) * Math.PI * 2
        return { position: [Math.cos(angle) * 0.55, 0.08, Math.sin(angle) * 0.55] as [number, number, number], rotation: angle }
      }),
    []
  )
  return (
    <group scale={scale}>
      {stones.map((stone, i) => (
        <mesh key={i} position={stone.position} rotation={[0.3, stone.rotation, 0.2]} castShadow>
          <dodecahedronGeometry args={[0.14]} />
          <meshStandardMaterial color="#6d6a62" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 0.1, 0]} rotation={[0, 0, Math.PI / 2.6]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.7]} />
        <meshStandardMaterial color="#4c3520" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.1, 0]} rotation={[Math.PI / 2.6, 0, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.7]} />
        <meshStandardMaterial color="#54381f" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.32, 0]}>
        <coneGeometry args={[0.22, 0.55, 6]} />
        <meshStandardMaterial color="#ff9631" emissive="#ff6a00" emissiveIntensity={2.2} transparent opacity={0.92} />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <coneGeometry args={[0.1, 0.35, 5]} />
        <meshStandardMaterial color="#ffd873" emissive="#ffb300" emissiveIntensity={3} transparent opacity={0.95} />
      </mesh>
    </group>
  )
}

function GlbProp({ file, scale, yOffset }: { file: string; scale: number; yOffset: number }) {
  const gltf = useGLTF(`/models/encounter/props/${file}`)
  return <Clone object={gltf.scene} scale={scale} position={[0, yOffset * scale, 0]} castShadow receiveShadow />
}

/**
 * Warm pool thrown by a lightSource prop. Indoors these ARE the lighting — the
 * scene's sun key is cut to a trickle for interior kits — so they burn brighter
 * and reach further; outdoors at night they carry the scene alongside a dimmed
 * moon key; by day outdoors a lit torch is just a prop.
 */
function poolIntensity(timeOfDay: "day" | "dusk" | "night", interior: boolean): number {
  if (interior) return timeOfDay === "night" ? 11 : 9
  return timeOfDay === "night" ? 8 : 5
}

export function SceneProp({ prop, timeOfDay, interior = false }: { prop: ScenePropSpec; timeOfDay: "day" | "dusk" | "night"; interior?: boolean }) {
  const def = getPropDefinition(prop.propId)
  if (!def) return null
  const scale = def.defaultScale * prop.scale
  // Indoors it is always "night" as far as the lamps are concerned.
  const glow = def.lightSource && (interior || timeOfDay !== "day")
  return (
    <group position={toWorld(prop.x, prop.z)} rotation={[0, AUTHORED_FRONT_YAW - toRadians(prop.rotation), 0]}>
      {def.file ? <GlbProp file={def.file} scale={scale} yOffset={def.yOffset} /> : <Campfire scale={prop.scale} />}
      {/* Sit the pool near the top of the prop that emits it, using the measured
          catalog height — a chandelier's flames hang 3 m up, a brazier's sit at
          waist height, and the old flat 1.1 x scale put both in the wrong place. */}
      {glow && (
        <pointLight
          position={[0, def.yOffset * scale + def.height * prop.scale * 0.75, 0]}
          color="#ffb45e"
          intensity={poolIntensity(timeOfDay, interior)}
          distance={interior ? 10 : 7}
          decay={2}
          castShadow={false}
        />
      )}
    </group>
  )
}

export function markSceneShadows(object: THREE.Object3D) {
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = true
      child.receiveShadow = true
    }
  })
}
