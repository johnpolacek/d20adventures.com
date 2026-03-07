"use client"

import { enhanceEncounterMap, getThemePalette } from "@/lib/map-utils"
import { cn, getImageUrl } from "@/lib/utils"
import type { Encounter3DMap } from "@/types/adventure-plan"
import { Billboard, ContactShadows, Edges, Grid, Html, OrbitControls, RoundedBox } from "@react-three/drei"
import { Canvas } from "@react-three/fiber"
import type { TurnCharacter } from "@/types/adventure"
import * as THREE from "three"
import { useEffect, useMemo, useState } from "react"

export interface MapMiniToken {
  id: string
  label: string
  image?: string
  x: number
  y?: number
  z: number
  facing?: number
  kind: "pc" | "npc"
  isActive?: boolean
  isComplete?: boolean
  isDead?: boolean
  subtitle?: string
}

function shiftColor(color: string, lightness: number) {
  const next = new THREE.Color(color)
  next.offsetHSL(0, 0, lightness)
  return `#${next.getHexString()}`
}

function DisplayBase({ map, palette }: { map: Encounter3DMap; palette: ReturnType<typeof getThemePalette> }) {
  const width = map.board.width * map.board.cellSize
  const depth = map.board.depth * map.board.cellSize

  return (
    <group>
      <RoundedBox args={[width + 2.5, 0.95, depth + 2.5]} radius={0.22} smoothness={4} position={[0, -0.52, 0]} receiveShadow>
        <meshStandardMaterial color={palette.frame} roughness={0.92} metalness={0.08} />
        <Edges scale={1.005} color={shiftColor(palette.frame, 0.14)} />
      </RoundedBox>

      <RoundedBox args={[width + 1.3, 0.34, depth + 1.3]} radius={0.16} smoothness={4} position={[0, -0.08, 0]} receiveShadow>
        <meshStandardMaterial color={palette.rim} roughness={0.88} metalness={0.04} />
        <Edges scale={1.004} color={shiftColor(palette.rim, 0.12)} />
      </RoundedBox>

      <RoundedBox args={[width, 0.16, depth]} radius={0.1} smoothness={4} position={[0, 0.08, 0]} receiveShadow>
        <meshStandardMaterial color={palette.floor} roughness={0.94} metalness={0.02} />
        <Edges scale={1.003} color={shiftColor(palette.floor, -0.18)} />
      </RoundedBox>

      <mesh position={[0, 0.165, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width - 0.45, depth - 0.45]} />
        <meshStandardMaterial color={shiftColor(palette.floor, 0.03)} roughness={0.98} />
      </mesh>

      {[
        [0, 0.17, -depth / 2 + 0.18, width - 0.55, 0.14],
        [0, 0.17, depth / 2 - 0.18, width - 0.55, 0.14],
        [-width / 2 + 0.18, 0.17, 0, 0.14, depth - 0.55],
        [width / 2 - 0.18, 0.17, 0, 0.14, depth - 0.55],
      ].map(([x, y, z, sizeX, sizeZ], index) => (
        <mesh key={index} position={[x, y, z]} receiveShadow>
          <boxGeometry args={[sizeX, 0.04, sizeZ]} />
          <meshStandardMaterial color={palette.accent} roughness={0.7} metalness={0.08} />
        </mesh>
      ))}
    </group>
  )
}

function SceneBackdrop({ map, palette }: { map: Encounter3DMap; palette: ReturnType<typeof getThemePalette> }) {
  const width = map.board.width * map.board.cellSize
  const depth = map.board.depth * map.board.cellSize
  const backZ = -depth * 0.66
  const wallColor = shiftColor(palette.backdrop, 0.1)

  return (
    <group>
      <mesh position={[0, 7, backZ]} receiveShadow>
        <planeGeometry args={[width * 2.2, depth * 1.6]} />
        <meshStandardMaterial color={palette.backdrop} roughness={1} side={THREE.DoubleSide} />
      </mesh>

      <mesh position={[0, -0.45, -depth * 0.2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width * 2.2, depth * 2]} />
        <meshStandardMaterial color={shiftColor(palette.backdrop, -0.02)} roughness={1} />
      </mesh>

      {map.board.theme === "cavern" ? (
        <>
          {[
            [-width * 0.36, 1.6, backZ + 1.6, 2.2, 5.8, 1.8],
            [width * 0.34, 1.8, backZ + 1.8, 2.4, 6.2, 1.9],
            [0, 1.1, backZ + 0.9, 4.2, 4.2, 1.8],
          ].map(([x, y, z, sizeX, sizeY, sizeZ], index) => (
            <RoundedBox key={index} args={[sizeX, sizeY, sizeZ]} radius={0.24} smoothness={3} position={[x, y, z]} castShadow receiveShadow>
              <meshStandardMaterial color={wallColor} roughness={0.98} />
            </RoundedBox>
          ))}
        </>
      ) : map.board.theme === "snow" || map.board.theme === "dirt" ? (
        <>
          {[-width * 0.38, -width * 0.2, width * 0.2, width * 0.38].map((x, index) => (
            <group key={index} position={[x, 0, backZ + 1.2 + (index % 2 === 0 ? 0.4 : 0)]}>
              <mesh position={[0, 1.3, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[0.16, 0.22, 2.5, 8]} />
                <meshStandardMaterial color={map.board.theme === "snow" ? "#74583e" : "#5a3f2a"} roughness={1} />
              </mesh>
              <mesh position={[0, 2.7, 0]} castShadow receiveShadow>
                <sphereGeometry args={[1.1, 12, 12]} />
                <meshStandardMaterial color={map.board.theme === "snow" ? "#6d8d67" : "#4e6b3f"} roughness={0.96} />
              </mesh>
            </group>
          ))}
        </>
      ) : (
        <>
          <RoundedBox args={[2.2, 5.4, 1.8]} radius={0.12} smoothness={3} position={[-width * 0.34, 2.2, backZ + 1.2]} castShadow receiveShadow>
            <meshStandardMaterial color={wallColor} roughness={0.96} />
          </RoundedBox>
          <RoundedBox args={[2.2, 5.4, 1.8]} radius={0.12} smoothness={3} position={[width * 0.34, 2.2, backZ + 1.2]} castShadow receiveShadow>
            <meshStandardMaterial color={wallColor} roughness={0.96} />
          </RoundedBox>
          <RoundedBox args={[width * 0.3, 1.1, 1.3]} radius={0.08} smoothness={3} position={[0, 3.8, backZ + 1.05]} castShadow receiveShadow>
            <meshStandardMaterial color={shiftColor(wallColor, 0.06)} roughness={0.94} />
          </RoundedBox>
        </>
      )}
    </group>
  )
}

function TerrainMesh({ item }: { item: Encounter3DMap["terrain"][number] }) {
  const color =
    item.kind === "water"
      ? item.color || "#2a6f97"
      : item.kind === "pit"
        ? item.color || "#2d1e1e"
        : item.color || "#7a746b"
  const outline = shiftColor(color, -0.18)

  if (item.kind === "water") {
    return (
      <group position={[item.x, item.y, item.z]} rotation={[0, item.rotation, 0]}>
        <RoundedBox args={[item.width, 0.18, item.depth]} radius={0.08} smoothness={3} position={[0, 0.09, 0]} receiveShadow>
          <meshStandardMaterial color={shiftColor(color, -0.24)} roughness={0.95} />
          <Edges scale={1.004} color={outline} />
        </RoundedBox>
        <mesh position={[0, item.height / 2 + 0.09, 0]} receiveShadow>
          <boxGeometry args={[Math.max(item.width - 0.2, 0.3), item.height, Math.max(item.depth - 0.2, 0.3)]} />
          <meshStandardMaterial color={color} roughness={0.18} metalness={0.08} transparent opacity={0.9} />
        </mesh>
      </group>
    )
  }

  if (item.kind === "pit") {
    return (
      <group position={[item.x, item.y, item.z]} rotation={[0, item.rotation, 0]}>
        <RoundedBox args={[item.width, 0.22, item.depth]} radius={0.08} smoothness={3} position={[0, 0.11, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={shiftColor(color, -0.14)} roughness={0.96} />
          <Edges scale={1.004} color={outline} />
        </RoundedBox>
        <mesh position={[0, -item.height / 2 + 0.04, 0]} receiveShadow>
          <boxGeometry args={[Math.max(item.width - 0.3, 0.4), item.height, Math.max(item.depth - 0.3, 0.4)]} />
          <meshStandardMaterial color="#120b0b" roughness={1} />
        </mesh>
      </group>
    )
  }

  if (item.kind === "dais") {
    return (
      <group position={[item.x, item.y, item.z]} rotation={[0, item.rotation, 0]}>
        <RoundedBox args={[item.width, item.height * 0.45, item.depth]} radius={0.08} smoothness={3} position={[0, item.height * 0.225, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={shiftColor(color, -0.08)} roughness={0.92} />
          <Edges scale={1.004} color={outline} />
        </RoundedBox>
        <RoundedBox
          args={[Math.max(item.width - 0.45, 0.45), item.height * 0.28, Math.max(item.depth - 0.45, 0.45)]}
          radius={0.08}
          smoothness={3}
          position={[0, item.height * 0.59, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={color} roughness={0.9} />
          <Edges scale={1.004} color={outline} />
        </RoundedBox>
        <RoundedBox
          args={[Math.max(item.width - 0.9, 0.45), item.height * 0.22, Math.max(item.depth - 0.9, 0.45)]}
          radius={0.06}
          smoothness={3}
          position={[0, item.height * 0.84, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={shiftColor(color, 0.06)} roughness={0.88} />
          <Edges scale={1.003} color={shiftColor(outline, 0.08)} />
        </RoundedBox>
      </group>
    )
  }

  if (item.kind === "wall") {
    return (
      <group position={[item.x, item.y, item.z]} rotation={[0, item.rotation, 0]}>
        <RoundedBox args={[item.width + 0.12, 0.24, item.depth + 0.12]} radius={0.06} smoothness={3} position={[0, 0.12, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={shiftColor(color, -0.1)} roughness={0.95} />
        </RoundedBox>
        <RoundedBox args={[item.width, item.height, item.depth]} radius={0.08} smoothness={3} position={[0, item.height / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={color} roughness={0.9} />
          <Edges scale={1.004} color={outline} />
        </RoundedBox>
        <RoundedBox args={[item.width + 0.2, 0.14, item.depth + 0.2]} radius={0.05} smoothness={3} position={[0, item.height + 0.07, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={shiftColor(color, 0.08)} roughness={0.85} />
        </RoundedBox>
      </group>
    )
  }

  if (item.kind === "ramp") {
    const stepDepth = item.depth / 4
    return (
      <group position={[item.x, item.y, item.z]} rotation={[0, item.rotation, 0]}>
        {[0, 1, 2, 3].map((step) => (
          <RoundedBox
            key={step}
            args={[item.width, Math.max(item.height / 4, 0.1), stepDepth + 0.04,]}
            radius={0.04}
            smoothness={3}
            position={[0, (step + 0.5) * (item.height / 4), -item.depth / 2 + stepDepth * (step + 0.5)]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={step % 2 === 0 ? color : shiftColor(color, 0.04)} roughness={0.92} />
            <Edges scale={1.004} color={outline} />
          </RoundedBox>
        ))}
      </group>
    )
  }

  return (
    <group position={[item.x, item.y, item.z]} rotation={[0, item.rotation, 0]}>
      <RoundedBox args={[item.width, item.height, item.depth]} radius={0.08} smoothness={3} position={[0, item.height / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.88} metalness={0.04} />
        <Edges scale={1.004} color={outline} />
      </RoundedBox>
      <RoundedBox
        args={[Math.max(item.width - 0.2, 0.3), Math.max(item.height * 0.18, 0.08), Math.max(item.depth - 0.2, 0.3)]}
        radius={0.05}
        smoothness={3}
        position={[0, item.height + Math.max(item.height * 0.09, 0.04), 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={shiftColor(color, 0.05)} roughness={0.86} />
      </RoundedBox>
    </group>
  )
}

function PropMesh({ item }: { item: Encounter3DMap["props"][number] }) {
  const position: [number, number, number] = [item.x, item.y + 0.5 * item.scale, item.z]

  switch (item.kind) {
    case "pillar":
      return (
        <group position={position} rotation={[0, item.rotation, 0]}>
          <mesh position={[0, -0.88 * item.scale, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.56 * item.scale, 0.62 * item.scale, 0.18 * item.scale, 18]} />
            <meshStandardMaterial color="#5f5953" roughness={0.92} />
          </mesh>
          <mesh position={[0, -0.05 * item.scale, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.28 * item.scale, 0.36 * item.scale, 1.9 * item.scale, 18]} />
            <meshStandardMaterial color={item.color || "#b2a391"} roughness={0.84} />
          </mesh>
          <mesh position={[0, 0.95 * item.scale, 0]} rotation={[0.14, 0, 0.1]} castShadow receiveShadow>
            <boxGeometry args={[0.5 * item.scale, 0.18 * item.scale, 0.5 * item.scale]} />
            <meshStandardMaterial color="#7a746b" roughness={0.86} />
          </mesh>
          <mesh position={[0, 1.02 * item.scale, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.44 * item.scale, 0.44 * item.scale, 0.18 * item.scale, 16]} />
            <meshStandardMaterial color="#7a746b" roughness={0.88} />
          </mesh>
        </group>
      )
    case "torch":
      return (
        <group position={position} rotation={[0, item.rotation, 0]}>
          <mesh position={[0, -0.48 * item.scale, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.22 * item.scale, 0.24 * item.scale, 0.14 * item.scale, 14]} />
            <meshStandardMaterial color="#4f4438" roughness={0.9} />
          </mesh>
          <mesh castShadow>
            <cylinderGeometry args={[0.08 * item.scale, 0.08 * item.scale, 1.2 * item.scale, 10]} />
            <meshStandardMaterial color={item.color || "#5f4330"} roughness={0.82} />
          </mesh>
          <mesh position={[0, 0.66 * item.scale, 0]} castShadow>
            <cylinderGeometry args={[0.16 * item.scale, 0.21 * item.scale, 0.18 * item.scale, 12]} />
            <meshStandardMaterial color="#3a2a1b" roughness={0.88} />
          </mesh>
          <mesh position={[0, 0.84 * item.scale, 0]} castShadow>
            <sphereGeometry args={[0.17 * item.scale, 10, 10]} />
            <meshStandardMaterial emissive="#ff9e00" emissiveIntensity={2.2} color="#ffd166" toneMapped={false} />
          </mesh>
          <pointLight position={[0, 0.9 * item.scale, 0]} intensity={2.8} distance={5.5} color="#ffb703" />
        </group>
      )
    case "tree":
      return (
        <group position={position} rotation={[0, item.rotation, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.18 * item.scale, 0.24 * item.scale, 1.3 * item.scale, 10]} />
            <meshStandardMaterial color="#69492f" roughness={1} />
          </mesh>
          {[
            [0, 0.92, 0, 0.68],
            [-0.34, 0.78, 0.12, 0.46],
            [0.3, 0.74, -0.14, 0.42],
          ].map(([x, y, z, size], index) => (
            <mesh key={index} position={[x * item.scale, y * item.scale, z * item.scale]} castShadow>
              <sphereGeometry args={[size * item.scale, 12, 12]} />
              <meshStandardMaterial color={item.color || "#52734d"} roughness={0.98} />
            </mesh>
          ))}
          <mesh position={[0.08 * item.scale, 0.5 * item.scale, 0]} rotation={[0.15, 0.1, -0.1]} castShadow>
            <cylinderGeometry args={[0.05 * item.scale, 0.08 * item.scale, 0.5 * item.scale, 8]} />
            <meshStandardMaterial color="#69492f" roughness={1} />
          </mesh>
        </group>
      )
    case "rock":
      return (
        <group position={[item.x, item.y + 0.2 * item.scale, item.z]} rotation={[0, item.rotation, 0]}>
          {[
            [0, 0.2, 0, 0.52],
            [-0.28, 0.08, 0.18, 0.32],
            [0.24, 0.02, -0.12, 0.28],
          ].map(([x, y, z, size], index) => (
            <mesh key={index} position={[x * item.scale, y * item.scale, z * item.scale]} castShadow receiveShadow>
              <dodecahedronGeometry args={[size * item.scale, 0]} />
              <meshStandardMaterial color={item.color || "#7c7f84"} roughness={1} />
            </mesh>
          ))}
        </group>
      )
    case "table":
      return (
        <group position={position} rotation={[0, item.rotation, 0]}>
          <mesh position={[0, 0.55 * item.scale, 0]} castShadow>
            <boxGeometry args={[1.3 * item.scale, 0.12 * item.scale, 0.75 * item.scale]} />
            <meshStandardMaterial color={item.color || "#6f4e37"} roughness={0.85} />
          </mesh>
          <mesh position={[0, 0.63 * item.scale, 0]} castShadow>
            <boxGeometry args={[0.82 * item.scale, 0.02 * item.scale, 0.42 * item.scale]} />
            <meshStandardMaterial color="#b48b5e" roughness={0.8} />
          </mesh>
          {[
            [-0.5, 0.2, -0.24],
            [0.5, 0.2, -0.24],
            [-0.5, 0.2, 0.24],
            [0.5, 0.2, 0.24],
          ].map((leg) => (
            <mesh key={leg.join(":")} position={[leg[0] * item.scale, leg[1] * item.scale, leg[2] * item.scale]} castShadow>
              <boxGeometry args={[0.1 * item.scale, 0.45 * item.scale, 0.1 * item.scale]} />
              <meshStandardMaterial color={item.color || "#5b3a29"} />
            </mesh>
          ))}
        </group>
      )
    case "stairs":
      return (
        <group position={position} rotation={[0, item.rotation, 0]}>
          {[0, 1, 2, 3].map((step) => (
            <mesh key={step} position={[0, step * 0.16 * item.scale, step * 0.18 * item.scale]} castShadow receiveShadow>
              <boxGeometry args={[1.1 * item.scale, 0.16 * item.scale, 0.34 * item.scale]} />
              <meshStandardMaterial color={step % 2 === 0 ? item.color || "#9b8b7a" : shiftColor(item.color || "#9b8b7a", 0.04)} roughness={0.92} />
            </mesh>
          ))}
        </group>
      )
    case "banner":
      return (
        <group position={position} rotation={[0, item.rotation, 0]}>
          <mesh position={[0, -0.15 * item.scale, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.28 * item.scale, 0.32 * item.scale, 0.16 * item.scale, 12]} />
            <meshStandardMaterial color="#5b5148" />
          </mesh>
          <mesh position={[0, 0.55 * item.scale, 0]} castShadow>
            <cylinderGeometry args={[0.04 * item.scale, 0.04 * item.scale, 1.6 * item.scale, 8]} />
            <meshStandardMaterial color="#57483a" />
          </mesh>
          <mesh position={[0.18 * item.scale, 1.25 * item.scale, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.03 * item.scale, 0.03 * item.scale, 0.46 * item.scale, 8]} />
            <meshStandardMaterial color="#57483a" />
          </mesh>
          <mesh position={[0.25 * item.scale, 0.8 * item.scale, 0]} castShadow>
            <planeGeometry args={[0.55 * item.scale, 0.8 * item.scale]} />
            <meshStandardMaterial color={item.color || "#8c2f39"} side={THREE.DoubleSide} roughness={0.92} />
          </mesh>
        </group>
      )
    case "altar":
      return (
        <group position={position} rotation={[0, item.rotation, 0]}>
          <RoundedBox args={[1.7 * item.scale, 0.3 * item.scale, 1.1 * item.scale]} radius={0.05} smoothness={2} position={[0, -0.12 * item.scale, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#7e7870" roughness={0.92} />
          </RoundedBox>
          <RoundedBox args={[1.6 * item.scale, 0.45 * item.scale, 1 * item.scale]} radius={0.05} smoothness={2} position={[0, 0.12 * item.scale, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#8f8b84" roughness={0.9} />
          </RoundedBox>
          <RoundedBox args={[1.1 * item.scale, 0.35 * item.scale, 0.76 * item.scale]} radius={0.05} smoothness={2} position={[0, 0.48 * item.scale, 0]} castShadow receiveShadow>
            <meshStandardMaterial color={item.color || "#c1beb7"} roughness={0.86} />
          </RoundedBox>
          {[-0.28, 0, 0.28].map((x) => (
            <mesh key={x} position={[x * item.scale, 0.78 * item.scale, -0.12 * item.scale]} castShadow>
              <cylinderGeometry args={[0.04 * item.scale, 0.04 * item.scale, 0.18 * item.scale, 8]} />
              <meshStandardMaterial color="#efe2b8" emissive="#ffcc66" emissiveIntensity={0.35} />
            </mesh>
          ))}
        </group>
      )
    case "statue":
      return (
        <group position={position} rotation={[0, item.rotation, 0]}>
          <RoundedBox args={[0.7 * item.scale, 0.4 * item.scale, 0.7 * item.scale]} radius={0.04} smoothness={2} position={[0, -0.72 * item.scale, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#8d8983" roughness={0.92} />
          </RoundedBox>
          <mesh position={[0, -0.02 * item.scale, 0]} castShadow>
            <cylinderGeometry args={[0.22 * item.scale, 0.3 * item.scale, 1.5 * item.scale, 10]} />
            <meshStandardMaterial color={item.color || "#b3b1aa"} roughness={0.88} />
          </mesh>
          <mesh position={[0, 0.42 * item.scale, 0.02 * item.scale]} castShadow>
            <boxGeometry args={[0.42 * item.scale, 0.7 * item.scale, 0.28 * item.scale]} />
            <meshStandardMaterial color={item.color || "#bdbab2"} roughness={0.88} />
          </mesh>
          <mesh position={[0, 1.02 * item.scale, 0]} castShadow>
            <sphereGeometry args={[0.26 * item.scale, 10, 10]} />
            <meshStandardMaterial color={item.color || "#c5c2ba"} roughness={0.82} />
          </mesh>
        </group>
      )
    case "crate":
    default:
      return (
        <group position={position} rotation={[0, item.rotation, 0]}>
          <RoundedBox args={[0.8 * item.scale, 0.8 * item.scale, 0.8 * item.scale]} radius={0.04} smoothness={2} castShadow receiveShadow>
            <meshStandardMaterial color={item.color || "#8b5a2b"} roughness={0.86} />
          </RoundedBox>
          {[
            [0, 0, 0.41, 0.72, 0.08, 0.05],
            [0, 0, -0.41, 0.72, 0.08, 0.05],
            [0.41, 0, 0, 0.05, 0.08, 0.72],
            [-0.41, 0, 0, 0.05, 0.08, 0.72],
          ].map(([x, y, z, sizeX, sizeY, sizeZ], index) => (
            <mesh key={index} position={[x * item.scale, y * item.scale, z * item.scale]} castShadow>
              <boxGeometry args={[sizeX * item.scale, sizeY * item.scale, sizeZ * item.scale]} />
              <meshStandardMaterial color="#4b2d12" roughness={0.9} />
            </mesh>
          ))}
          <mesh position={[0, 0.42 * item.scale, 0]} castShadow>
            <boxGeometry args={[0.72 * item.scale, 0.05 * item.scale, 0.72 * item.scale]} />
            <meshStandardMaterial color="#4b2d12" />
          </mesh>
        </group>
      )
  }
}

function TokenMini({ token, onSelect }: { token: MapMiniToken; onSelect?: (token: MapMiniToken) => void }) {
  const ringColor = token.isDead ? "#7f1d1d" : token.isActive ? "#fbbf24" : token.kind === "pc" ? "#60a5fa" : "#f87171"

  return (
    <group position={[token.x, (token.y || 0) + 0.01, token.z]} rotation={[0, token.facing || 0, 0]}>
      <mesh castShadow receiveShadow onClick={() => onSelect?.(token)}>
        <cylinderGeometry args={[0.48, 0.56, 0.16, 28]} />
        <meshStandardMaterial color="#443324" roughness={0.86} metalness={0.06} />
      </mesh>
      <mesh position={[0, 0.09, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.42, 0.48, 0.05, 28]} />
        <meshStandardMaterial color={ringColor} roughness={0.62} metalness={0.12} />
      </mesh>
      <mesh position={[0, 0.145, 0]} castShadow>
        <cylinderGeometry args={[0.33, 0.36, 0.12, 24]} />
        <meshStandardMaterial color={token.isComplete ? "#334155" : "#18181b"} roughness={0.84} />
      </mesh>
      <mesh position={[0, 0.46, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.62, 10]} />
        <meshStandardMaterial color="#bfa27a" roughness={0.5} metalness={0.35} />
      </mesh>
      <Billboard position={[0, 0.88, 0]} follow>
        <mesh>
          <planeGeometry args={[0.92, 1.08]} />
          <meshBasicMaterial color="#f8fafc" transparent opacity={0.96} />
        </mesh>
        <Html transform sprite distanceFactor={8} style={{ pointerEvents: "none" }}>
          <div className="flex w-14 flex-col items-center rounded-xl border border-black/30 bg-black/85 px-1 py-1 text-center shadow-lg">
            <div className="relative h-10 w-10 overflow-hidden rounded-full border border-white/20 bg-neutral-900">
              {token.image ? (
                <img src={getImageUrl(token.image)} alt={token.label} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm font-bold text-white">
                  {token.label.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div className="mt-1 max-w-full truncate text-[10px] font-bold uppercase tracking-wide text-white">{token.label}</div>
          </div>
        </Html>
      </Billboard>
    </group>
  )
}

export default function MiniaturesMap({
  map,
  tokens = [],
  title,
  className,
}: {
  map: Encounter3DMap
  tokens?: MapMiniToken[]
  title?: string
  className?: string
}) {
  const [selectedToken, setSelectedToken] = useState<MapMiniToken | null>(tokens[0] ?? null)
  const displayMap = useMemo(() => enhanceEncounterMap(map), [map])
  const palette = getThemePalette(displayMap.board.theme)
  const cameraPosition: [number, number, number] = [
    displayMap.camera.focusX + Math.cos(displayMap.camera.yaw) * displayMap.camera.distance,
    Math.sin(displayMap.camera.pitch) * displayMap.camera.distance,
    displayMap.camera.focusZ + Math.sin(displayMap.camera.yaw) * displayMap.camera.distance,
  ]

  useEffect(() => {
    if (!selectedToken) {
      setSelectedToken(tokens[0] ?? null)
      return
    }

    const nextSelectedToken = tokens.find((token) => token.id === selectedToken.id) ?? tokens[0] ?? null
    if (nextSelectedToken?.id !== selectedToken.id) {
      setSelectedToken(nextSelectedToken)
    }
  }, [selectedToken, tokens])

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-white/10 bg-black/40 shadow-2xl", className)}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <div className="text-xs font-mono uppercase tracking-[0.3em] text-primary-200/70">Miniatures Map</div>
          <div className="font-display text-lg text-amber-200">{title || displayMap.summary || "Encounter Map"}</div>
        </div>
        <div className="text-right text-xs text-white/60">
          <div>{displayMap.board.width}x{displayMap.board.depth} board</div>
          <div>{tokens.length} minis</div>
        </div>
      </div>

      <div className="flex flex-col">
        <div className="h-[560px] w-full bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),_transparent_52%)]">
          <Canvas camera={{ position: cameraPosition, fov: 42 }} shadows dpr={[1, 1.5]} gl={{ antialias: true }}>
            <color attach="background" args={[palette.haze]} />
            <hemisphereLight intensity={0.8} groundColor={shiftColor(palette.haze, -0.02)} color="#f7f1e8" />
            <ambientLight intensity={0.7} color="#fff4df" />
            <directionalLight position={[10, 16, 7]} intensity={2.7} color="#fff4de" castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
            <directionalLight position={[-8, 10, -7]} intensity={0.8} color="#9bb4d1" />
            <spotLight position={[-6, 14, 10]} angle={0.5} penumbra={0.65} intensity={1.5} color="#ffd7a3" castShadow />
            <fog attach="fog" args={[palette.haze, 14, 38]} />

            <SceneBackdrop map={displayMap} palette={palette} />
            <DisplayBase map={displayMap} palette={palette} />

            <Grid
              position={[0, 0.185, 0]}
              args={[displayMap.board.width * displayMap.board.cellSize, displayMap.board.depth * displayMap.board.cellSize]}
              cellSize={displayMap.board.cellSize}
              cellThickness={0.42}
              cellColor={palette.grid}
              sectionSize={displayMap.board.cellSize * 2}
              sectionThickness={0.7}
              sectionColor={palette.accent}
              fadeDistance={40}
              fadeStrength={1.1}
              infiniteGrid={false}
            />

            {displayMap.zones.map((zone) => (
              <mesh key={zone.id} position={[zone.x, 0.19, zone.z]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[zone.width, zone.depth]} />
                <meshBasicMaterial color={zone.color || palette.accent} transparent opacity={0.16} />
              </mesh>
            ))}

            {displayMap.terrain.map((terrain) => (
              <TerrainMesh key={terrain.id} item={terrain} />
            ))}

            {displayMap.props.map((prop) => (
              <PropMesh key={prop.id} item={prop} />
            ))}

            <ContactShadows position={[0, 0.16, 0]} opacity={0.42} scale={Math.max(displayMap.board.width, displayMap.board.depth) * 1.45} blur={2.6} far={10} />

            {tokens.map((token) => (
              <TokenMini key={token.id} token={token} onSelect={setSelectedToken} />
            ))}

            <OrbitControls
              enablePan
              enableZoom
              maxDistance={38}
              minDistance={8}
              minPolarAngle={0.35}
              maxPolarAngle={1.35}
              target={[displayMap.camera.focusX, 0.5, displayMap.camera.focusZ]}
            />
          </Canvas>
        </div>

        <div className="w-full border-t border-white/10 bg-black/30 p-4">
          <div className="text-xs font-mono uppercase tracking-[0.25em] text-primary-200/60">Scene Summary</div>
          <p className="mt-2 text-sm text-white/80">{displayMap.summary || "No summary yet."}</p>

          <div className="mt-5 grid grid-cols-2 gap-2 text-xs text-white/70">
            <div className="rounded-xl border border-white/10 bg-white/5 p-2">Terrain: {displayMap.terrain.length}</div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-2">Props: {displayMap.props.length}</div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-2">Zones: {displayMap.zones.length}</div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-2">Party Slots: {displayMap.tokenSlots.party.length}</div>
          </div>

          <div className="mt-5">
            <div className="text-xs font-mono uppercase tracking-[0.25em] text-primary-200/60">Selected Mini</div>
            {selectedToken ? (
              <div className="mt-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="font-display text-base text-amber-200">{selectedToken.label}</div>
                <div className="text-xs text-white/60">{selectedToken.subtitle || (selectedToken.kind === "pc" ? "Player character" : "NPC")}</div>
                <div className="mt-2 text-xs text-white/70">
                  Position: {selectedToken.x.toFixed(1)}, {selectedToken.z.toFixed(1)}
                </div>
              </div>
            ) : (
              <div className="mt-2 rounded-2xl border border-dashed border-white/10 p-3 text-sm text-white/50">Click a miniature to inspect it.</div>
            )}
          </div>

          {displayMap.promptHistory.length > 0 && (
            <div className="mt-5">
              <div className="text-xs font-mono uppercase tracking-[0.25em] text-primary-200/60">Prompt History</div>
              <div className="mt-2 max-h-32 space-y-2 overflow-y-auto pr-1 text-xs text-white/65">
                {displayMap.promptHistory.slice().reverse().map((prompt, index) => (
                  <div key={`${index}-${prompt.slice(0, 12)}`} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                    {prompt}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function buildRuntimeMapTokens({
  map,
  characters,
  partySlotOrder,
}: {
  map: Encounter3DMap
  characters: TurnCharacter[]
  partySlotOrder: string[]
}) {
  const currentActorId =
    characters
      .slice()
      .sort((left, right) => (right.initiative ?? 0) - (left.initiative ?? 0))
      .find((character) => !character.isComplete && character.healthPercent !== 0 && character.status !== "dead")?.id || null

  const partyTokens = map.tokenSlots.party.flatMap((slot) => {
    const characterId = partySlotOrder[slot.slotIndex]
    const character = characters.find((entry) => entry.id === characterId)
    if (!character) return []

    return [
      {
        id: character.id,
        label: character.name,
        image: character.image,
        x: slot.x,
        y: slot.y,
        z: slot.z,
        facing: slot.facing,
        kind: character.type,
        isActive: character.id === currentActorId,
        isComplete: character.isComplete,
        isDead: character.healthPercent === 0 || character.status === "dead",
        subtitle: `${character.race} ${character.archetype}`.trim(),
      } satisfies MapMiniToken,
    ]
  })

  const npcTokens = map.tokenSlots.npc.flatMap((slot) => {
    const character = characters.find((entry) => entry.id === slot.npcId)
    if (!character) return []

    return [
      {
        id: character.id,
        label: character.name,
        image: character.image,
        x: slot.x,
        y: slot.y,
        z: slot.z,
        facing: slot.facing,
        kind: character.type,
        isActive: character.id === currentActorId,
        isComplete: character.isComplete,
        isDead: character.healthPercent === 0 || character.status === "dead",
        subtitle: character.behavior || "NPC",
      } satisfies MapMiniToken,
    ]
  })

  return [...partyTokens, ...npcTokens]
}
