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

export function SceneProp({ prop, timeOfDay }: { prop: ScenePropSpec; timeOfDay: "day" | "dusk" | "night" }) {
  const def = getPropDefinition(prop.propId)
  if (!def) return null
  const scale = def.defaultScale * prop.scale
  const glow = def.lightSource && timeOfDay !== "day"
  return (
    <group position={toWorld(prop.x, prop.z)} rotation={[0, -toRadians(prop.rotation), 0]}>
      {def.file ? <GlbProp file={def.file} scale={scale} yOffset={def.yOffset} /> : <Campfire scale={prop.scale} />}
      {glow && <pointLight position={[0, 1.1 * scale, 0]} color="#ffb45e" intensity={5} distance={7} decay={2} castShadow={false} />}
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
