"use client"

// One character miniature: a KayKit figure posed on a base disk, or — for creatures
// with no matching humanoid model — a "portrait pawn" (cone + portrait billboard,
// like a printed paper mini). Skinned GLBs must be cloned with SkeletonUtils, not
// drei <Clone>, so shared models (two guards) get independent skeletons.

import { Billboard, Html, useGLTF } from "@react-three/drei"
import { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js"
import { getCharacterModel } from "@/lib/encounterview/asset-catalog"
import { getTextureImageUrl } from "@/lib/utils"
import type { TurnCharacter } from "@/types/adventure"
import type { SceneCharacter, SceneStance } from "@/types/encounter-scene-3d"
import { markSceneShadows } from "./scene-prop"

const BOARD_OFFSET = 10
const toRadians = (degrees: number) => (degrees * Math.PI) / 180

const BASE_RADIUS = 0.55
const BASE_HEIGHT = 0.12

function poseClipName(stance: SceneStance): string {
  return stance === "down" ? "Death_A_Pose" : "Idle"
}

function FigureMini({ file, scale, stance }: { file: string; scale: number; stance: SceneStance }) {
  const gltf = useGLTF(`/models/encounter/characters/${file}`)
  const cloned = useMemo(() => {
    const clone = cloneSkinned(gltf.scene)
    markSceneShadows(clone)
    return clone
  }, [gltf.scene])

  // Pose the figure statically: play the pose clip paused at its first frame.
  useEffect(() => {
    const clipName = poseClipName(stance)
    const clip = gltf.animations.find((a) => a.name === clipName) ?? gltf.animations[0]
    if (!clip) return
    const mixer = new THREE.AnimationMixer(cloned)
    const action = mixer.clipAction(clip)
    action.play()
    mixer.update(0)
    return () => {
      mixer.stopAllAction()
      mixer.uncacheRoot(cloned)
    }
  }, [cloned, gltf.animations, stance])

  return <primitive object={cloned} scale={scale} position={[0, BASE_HEIGHT, 0]} />
}

function PortraitPawn({ image, name }: { image?: string; name: string }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    if (!image) return
    let disposed = false
    const loader = new THREE.TextureLoader()
    // The image hosts don't send CORS headers, so route through the same-origin proxy.
    loader.load(`/api/image-proxy?url=${encodeURIComponent(getTextureImageUrl(image))}`, (loaded) => {
      if (disposed) {
        loaded.dispose()
        return
      }
      loaded.colorSpace = THREE.SRGBColorSpace
      setTexture(loaded)
    })
    return () => {
      disposed = true
      texture?.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image])

  return (
    <group position={[0, BASE_HEIGHT, 0]}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <coneGeometry args={[0.38, 1.0, 12]} />
        <meshStandardMaterial color="#7d7468" roughness={0.7} />
      </mesh>
      <Billboard position={[0, 1.35, 0]}>
        <mesh castShadow>
          <circleGeometry args={[0.5, 32]} />
          {texture ? <meshBasicMaterial map={texture} side={THREE.DoubleSide} /> : <meshStandardMaterial color="#3d3831" side={THREE.DoubleSide} />}
        </mesh>
        <mesh position={[0, 0, -0.005]}>
          <ringGeometry args={[0.5, 0.56, 32]} />
          <meshBasicMaterial color="#1c1915" side={THREE.DoubleSide} />
        </mesh>
      </Billboard>
      {!texture && (
        <Html position={[0, 1.35, 0]} center style={{ pointerEvents: "none" }}>
          <div style={{ color: "#e5decf", fontWeight: 700, fontSize: 14 }}>{name.slice(0, 1)}</div>
        </Html>
      )}
    </group>
  )
}

const healthColor = (percent: number) => (percent > 60 ? "#4ade80" : percent > 30 ? "#facc15" : "#ef4444")

export function CharacterMini({ placement, character }: { placement: SceneCharacter; character: TurnCharacter }) {
  const [hovered, setHovered] = useState(false)
  const groupRef = useRef<THREE.Group>(null)

  const model = getCharacterModel(character.race ?? "", character.archetype ?? "", character.type)
  const isPc = character.type === "pc"
  const health = Math.max(0, Math.min(100, character.healthPercent ?? 100))
  const hurt = health < 30

  return (
    <group
      ref={groupRef}
      position={[placement.x - BOARD_OFFSET, 0, placement.z - BOARD_OFFSET]}
      rotation={[0, -toRadians(placement.facing) + Math.PI, 0]}
      onPointerOver={(event) => {
        event.stopPropagation()
        setHovered(true)
      }}
      onPointerOut={() => setHovered(false)}
    >
      {/* miniature base: amber for PCs, stone for NPCs, red ring when badly hurt */}
      <mesh position={[0, BASE_HEIGHT / 2, 0]} receiveShadow>
        <cylinderGeometry args={[BASE_RADIUS, BASE_RADIUS * 1.12, BASE_HEIGHT, 28]} />
        <meshStandardMaterial color={isPc ? "#8a6b2f" : "#57534e"} roughness={0.45} metalness={0.15} />
      </mesh>
      {hurt && (
        <mesh position={[0, BASE_HEIGHT + 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[BASE_RADIUS * 0.82, BASE_RADIUS * 0.98, 28]} />
          <meshBasicMaterial color="#dc2626" transparent opacity={0.85} />
        </mesh>
      )}

      {model ? <FigureMini file={model.file} scale={model.scale} stance={placement.stance} /> : <PortraitPawn image={character.image} name={character.name} />}

      {hovered && (
        <Html position={[0, 2.4, 0]} center distanceFactor={11} style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded border border-white/20 bg-black/85 px-2.5 py-1.5 text-center">
            <div className="font-display text-sm font-bold text-amber-100">{character.name}</div>
            <div className="text-[10px] uppercase tracking-wide text-stone-400">
              {character.race} {character.archetype}
            </div>
            <div className="mt-1 h-1 w-24 overflow-hidden rounded bg-stone-800">
              <div className="h-full rounded" style={{ width: `${health}%`, backgroundColor: healthColor(health) }} />
            </div>
          </div>
        </Html>
      )}
    </group>
  )
}
