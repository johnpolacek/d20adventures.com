"use client"

import { getThemePalette } from "@/lib/map-utils"
import { cn, getImageUrl } from "@/lib/utils"
import type { Encounter3DMap } from "@/types/adventure-plan"
import { Billboard, Html, OrbitControls } from "@react-three/drei"
import { Canvas } from "@react-three/fiber"
import type { TurnCharacter } from "@/types/adventure"
import * as THREE from "three"
import { useMemo, useState } from "react"

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

function TerrainMesh({ item }: { item: Encounter3DMap["terrain"][number] }) {
  const geometry = useMemo(() => new THREE.BoxGeometry(item.width, item.height, item.depth), [item.depth, item.height, item.width])
  const position: [number, number, number] = [item.x, item.y + item.height / 2, item.z]
  const color =
    item.kind === "water"
      ? item.color || "#2a6f97"
      : item.kind === "pit"
        ? item.color || "#2d1e1e"
        : item.color || "#7a746b"

  return (
    <mesh geometry={geometry} position={position} rotation={[0, item.rotation, 0]} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.85} metalness={0.15} />
    </mesh>
  )
}

function PropMesh({ item }: { item: Encounter3DMap["props"][number] }) {
  const position: [number, number, number] = [item.x, item.y + 0.5 * item.scale, item.z]
  const sharedProps = {
    position,
    rotation: [0, item.rotation, 0] as [number, number, number],
    castShadow: true,
    receiveShadow: true,
  }

  switch (item.kind) {
    case "pillar":
      return (
        <mesh {...sharedProps}>
          <cylinderGeometry args={[0.35 * item.scale, 0.45 * item.scale, 2.2 * item.scale, 12]} />
          <meshStandardMaterial color={item.color || "#9b8b7a"} />
        </mesh>
      )
    case "torch":
      return (
        <group position={position} rotation={[0, item.rotation, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.08 * item.scale, 0.08 * item.scale, 1.2 * item.scale, 10]} />
            <meshStandardMaterial color={item.color || "#5f4330"} />
          </mesh>
          <mesh position={[0, 0.75 * item.scale, 0]} castShadow>
            <sphereGeometry args={[0.15 * item.scale, 10, 10]} />
            <meshStandardMaterial emissive="#ff9e00" color="#ffd166" />
          </mesh>
        </group>
      )
    case "tree":
      return (
        <group position={position} rotation={[0, item.rotation, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.18 * item.scale, 0.24 * item.scale, 1.3 * item.scale, 10]} />
            <meshStandardMaterial color="#69492f" />
          </mesh>
          <mesh position={[0, 0.9 * item.scale, 0]} castShadow>
            <sphereGeometry args={[0.8 * item.scale, 12, 12]} />
            <meshStandardMaterial color={item.color || "#52734d"} />
          </mesh>
        </group>
      )
    case "rock":
      return (
        <mesh {...sharedProps}>
          <dodecahedronGeometry args={[0.5 * item.scale, 0]} />
          <meshStandardMaterial color={item.color || "#7c7f84"} roughness={1} />
        </mesh>
      )
    case "table":
      return (
        <group position={position} rotation={[0, item.rotation, 0]}>
          <mesh position={[0, 0.55 * item.scale, 0]} castShadow>
            <boxGeometry args={[1.3 * item.scale, 0.12 * item.scale, 0.75 * item.scale]} />
            <meshStandardMaterial color={item.color || "#6f4e37"} />
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
          {[0, 1, 2].map((step) => (
            <mesh key={step} position={[0, step * 0.16 * item.scale, step * 0.18 * item.scale]} castShadow receiveShadow>
              <boxGeometry args={[1.1 * item.scale, 0.16 * item.scale, 0.34 * item.scale]} />
              <meshStandardMaterial color={item.color || "#9b8b7a"} />
            </mesh>
          ))}
        </group>
      )
    case "banner":
      return (
        <group position={position} rotation={[0, item.rotation, 0]}>
          <mesh position={[0, 0.55 * item.scale, 0]} castShadow>
            <cylinderGeometry args={[0.04 * item.scale, 0.04 * item.scale, 1.6 * item.scale, 8]} />
            <meshStandardMaterial color="#57483a" />
          </mesh>
          <mesh position={[0.25 * item.scale, 0.8 * item.scale, 0]} castShadow>
            <planeGeometry args={[0.55 * item.scale, 0.8 * item.scale]} />
            <meshStandardMaterial color={item.color || "#8c2f39"} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )
    case "altar":
      return (
        <mesh {...sharedProps}>
          <boxGeometry args={[1.4 * item.scale, 0.9 * item.scale, 0.9 * item.scale]} />
          <meshStandardMaterial color={item.color || "#b7b7b7"} />
        </mesh>
      )
    case "statue":
      return (
        <group position={position} rotation={[0, item.rotation, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.25 * item.scale, 0.32 * item.scale, 1.6 * item.scale, 10]} />
            <meshStandardMaterial color={item.color || "#b3b1aa"} />
          </mesh>
          <mesh position={[0, 1.05 * item.scale, 0]} castShadow>
            <sphereGeometry args={[0.28 * item.scale, 10, 10]} />
            <meshStandardMaterial color={item.color || "#c5c2ba"} />
          </mesh>
        </group>
      )
    case "crate":
    default:
      return (
        <mesh {...sharedProps}>
          <boxGeometry args={[0.8 * item.scale, 0.8 * item.scale, 0.8 * item.scale]} />
          <meshStandardMaterial color={item.color || "#8b5a2b"} />
        </mesh>
      )
  }
}

function TokenMini({ token, onSelect }: { token: MapMiniToken; onSelect?: (token: MapMiniToken) => void }) {
  const ringColor = token.isDead ? "#7f1d1d" : token.isActive ? "#fbbf24" : token.kind === "pc" ? "#60a5fa" : "#f87171"

  return (
    <group position={[token.x, (token.y || 0) + 0.01, token.z]} rotation={[0, token.facing || 0, 0]}>
      <mesh castShadow receiveShadow onClick={() => onSelect?.(token)}>
        <cylinderGeometry args={[0.42, 0.5, 0.18, 24]} />
        <meshStandardMaterial color={ringColor} />
      </mesh>
      <mesh position={[0, 0.11, 0]} castShadow>
        <cylinderGeometry args={[0.34, 0.34, 0.16, 24]} />
        <meshStandardMaterial color={token.isComplete ? "#334155" : "#18181b"} />
      </mesh>
      <Billboard position={[0, 0.88, 0]} follow>
        <mesh>
          <planeGeometry args={[0.95, 1.15]} />
          <meshBasicMaterial color="#f8fafc" transparent opacity={0.98} />
        </mesh>
        <Html transform sprite distanceFactor={8} style={{ pointerEvents: "none" }}>
          <div className="flex w-14 flex-col items-center rounded-xl border border-black/20 bg-black/80 px-1 py-1 text-center shadow-lg">
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
  const palette = getThemePalette(map.board.theme)
  const cameraPosition: [number, number, number] = [
    map.camera.focusX + Math.cos(map.camera.yaw) * map.camera.distance,
    Math.sin(map.camera.pitch) * map.camera.distance,
    map.camera.focusZ + Math.sin(map.camera.yaw) * map.camera.distance,
  ]

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-white/10 bg-black/40 shadow-2xl", className)}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <div className="text-xs font-mono uppercase tracking-[0.3em] text-primary-200/70">Miniatures Map</div>
          <div className="font-display text-lg text-amber-200">{title || map.summary || "Encounter Map"}</div>
        </div>
        <div className="text-right text-xs text-white/60">
          <div>{map.board.width}x{map.board.depth} board</div>
          <div>{tokens.length} minis</div>
        </div>
      </div>

      <div className="flex flex-col">
        <div className="h-[480px] w-full bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_50%)]">
          <Canvas camera={{ position: cameraPosition, fov: 42 }} shadows dpr={[1, 1.5]}>
            <ambientLight intensity={1.15} />
            <directionalLight position={[8, 14, 6]} intensity={2.1} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
            <fog attach="fog" args={["#07080b", 16, 36]} />

            <mesh position={[0, -0.05, 0]} receiveShadow>
              <boxGeometry args={[map.board.width * map.board.cellSize, 0.2, map.board.depth * map.board.cellSize]} />
              <meshStandardMaterial color={palette.floor} roughness={0.95} />
            </mesh>

            <mesh position={[0, -0.18, 0]} receiveShadow>
              <boxGeometry args={[map.board.width * map.board.cellSize + 1.2, 0.16, map.board.depth * map.board.cellSize + 1.2]} />
              <meshStandardMaterial color={palette.edge} roughness={1} />
            </mesh>

            {map.zones.map((zone) => (
              <mesh key={zone.id} position={[zone.x, 0.015, zone.z]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[zone.width, zone.depth]} />
                <meshBasicMaterial color={zone.color || palette.accent} transparent opacity={0.18} />
              </mesh>
            ))}

            {map.terrain.map((terrain) => (
              <TerrainMesh key={terrain.id} item={terrain} />
            ))}

            {map.props.map((prop) => (
              <PropMesh key={prop.id} item={prop} />
            ))}

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
              target={[map.camera.focusX, 0.5, map.camera.focusZ]}
            />
          </Canvas>
        </div>

        <div className="w-full border-t border-white/10 bg-black/30 p-4">
          <div className="text-xs font-mono uppercase tracking-[0.25em] text-primary-200/60">Scene Summary</div>
          <p className="mt-2 text-sm text-white/80">{map.summary || "No summary yet."}</p>

          <div className="mt-5 grid grid-cols-2 gap-2 text-xs text-white/70">
            <div className="rounded-xl border border-white/10 bg-white/5 p-2">Terrain: {map.terrain.length}</div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-2">Props: {map.props.length}</div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-2">Zones: {map.zones.length}</div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-2">Party Slots: {map.tokenSlots.party.length}</div>
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

          {map.promptHistory.length > 0 && (
            <div className="mt-5">
              <div className="text-xs font-mono uppercase tracking-[0.25em] text-primary-200/60">Prompt History</div>
              <div className="mt-2 max-h-32 space-y-2 overflow-y-auto pr-1 text-xs text-white/65">
                {map.promptHistory.slice().reverse().map((prompt, index) => (
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
