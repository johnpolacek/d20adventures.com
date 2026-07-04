"use client"

// The 3D tabletop: a wooden table rim, tinted ground board, GLB props, and one
// miniature per turn character. Default export so encounter-panel can next/dynamic
// this module and keep three.js out of the turn-page bundle until first open.
// No drei <Environment> presets — they fetch HDRIs from a CDN; plain lights only.

import { OrbitControls } from "@react-three/drei"
import { Canvas } from "@react-three/fiber"
import { Suspense, useMemo } from "react"
import { ENVIRONMENT_KITS, GROUND_COLORS } from "@/lib/encounterview/asset-catalog"
import { SCENE_BOARD_SIZE } from "@/lib/encounterview/generate"
import type { TurnCharacter } from "@/types/adventure"
import type { EncounterScene3D } from "@/types/encounter-scene-3d"
import { CharacterMini } from "./character-mini"
import { SceneProp } from "./scene-prop"

const LIGHTING = {
  // Even night scenes stay readable — a real miniatures table has room light;
  // timeOfDay shifts the tint and shadows more than overall visibility.
  day: { sky: "#bcd3e8", groundBounce: "#5a5243", hemi: 0.9, key: "#fff3dd", keyIntensity: 2.6, keyPosition: [14, 20, 8] as const, background: "#191512" },
  dusk: { sky: "#c78a5a", groundBounce: "#3c3040", hemi: 0.75, key: "#ff9d5c", keyIntensity: 2.2, keyPosition: [-18, 10, 6] as const, background: "#171210" },
  night: { sky: "#54698a", groundBounce: "#282834", hemi: 0.8, key: "#a5bce0", keyIntensity: 1.9, keyPosition: [10, 18, -6] as const, background: "#0d0c0f" },
} as const

export default function EncounterScene({ scene, characters }: { scene: EncounterScene3D; characters: TurnCharacter[] }) {
  const { environment } = scene
  const light = LIGHTING[environment.timeOfDay]
  const kit = ENVIRONMENT_KITS[environment.kit]
  const groundColor = GROUND_COLORS[environment.ground] ?? kit.groundColor
  const foggy = environment.mood === "eerie" || environment.mood === "tense" || environment.timeOfDay === "night"

  const charactersById = useMemo(() => new Map(characters.map((c) => [c.id, c])), [characters])
  const half = SCENE_BOARD_SIZE / 2

  return (
    <Canvas shadows dpr={[1, 2]} camera={{ fov: 40, position: [0, 14, 18], near: 0.5, far: 120 }} gl={{ antialias: true }} style={{ background: light.background }}>
      {foggy && <fog attach="fog" args={[kit.fogColor, 22, 55]} />}

      <hemisphereLight args={[light.sky, light.groundBounce, light.hemi]} />
      <directionalLight
        position={[...light.keyPosition]}
        intensity={light.keyIntensity}
        color={light.key}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-bias={-0.0004}
      />

      {/* wooden table under the board — sells "miniatures on a table" */}
      <mesh position={[0, -0.35, 0]} receiveShadow>
        <boxGeometry args={[SCENE_BOARD_SIZE + 3.5, 0.7, SCENE_BOARD_SIZE + 3.5]} />
        <meshStandardMaterial color="#3e2c1c" roughness={0.65} metalness={0.05} />
      </mesh>
      {/* ground board */}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[SCENE_BOARD_SIZE, SCENE_BOARD_SIZE]} />
        <meshStandardMaterial color={groundColor} roughness={0.95} />
      </mesh>
      {/* faint grid so it reads as a battle board */}
      <gridHelper args={[SCENE_BOARD_SIZE, SCENE_BOARD_SIZE, "#000000", "#000000"]} position={[0, 0.02, 0]} material-transparent material-opacity={0.12} />

      <Suspense fallback={null}>
        {scene.props.map((prop) => (
          <SceneProp key={prop.id} prop={prop} timeOfDay={environment.timeOfDay} />
        ))}
        {scene.characters.map((placement) => {
          const character = charactersById.get(placement.characterId)
          if (!character) return null
          return <CharacterMini key={placement.characterId} placement={placement} character={character} />
        })}
      </Suspense>

      <OrbitControls
        target={[0, 0.5, 0]}
        minPolarAngle={0.4}
        maxPolarAngle={1.35}
        minDistance={6}
        maxDistance={Math.max(30, half * 3)}
        enablePan
        makeDefault
      />
    </Canvas>
  )
}
