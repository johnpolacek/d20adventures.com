"use client"

// The 3D tabletop: a wooden table, textured ground board, GLB props, ambient
// ground scatter, and one miniature per turn character. Default export so
// encounter-panel can next/dynamic this module and keep three.js out of the
// turn-page bundle until first open.
//
// Look: "painted miniatures under room light". timeOfDay shifts the key light's
// tint and angle more than overall visibility — even night scenes stay readable,
// the way a real minis table does. No drei <Environment> presets (they fetch
// HDRIs from a CDN); all lights and textures are generated locally.

import { OrbitControls } from "@react-three/drei"
import { Canvas, useFrame } from "@react-three/fiber"
import { Bloom, EffectComposer, N8AO, Vignette } from "@react-three/postprocessing"
import { Suspense, useMemo, useRef } from "react"
import * as THREE from "three"
import { ENVIRONMENT_KITS, GROUND_COLORS, KIT_FOREST_DENSITY, getPropDefinition } from "@/lib/encounterview/asset-catalog"
import { SCENE_BOARD_SIZE } from "@/lib/encounterview/generate"
import type { TurnCharacter } from "@/types/adventure"
import type { EncounterScene3D } from "@/types/encounter-scene-3d"
import { CharacterMini } from "./character-mini"
import { ForestRing, type ForestAvoidZone } from "./forest-ring"
import { SceneProp } from "./scene-prop"

const LIGHTING = {
  day: {
    hemiSky: "#cfe0f2",
    hemiGround: "#6a614c",
    hemi: 1.0,
    key: "#fff3dd",
    keyIntensity: 3.0,
    keyPosition: [14, 22, 10] as const,
    fill: "#ffe9c4",
    fillIntensity: 0.5,
    background: "radial-gradient(ellipse at 50% 35%, #2b2016 0%, #14100b 55%, #060504 100%)",
  },
  dusk: {
    hemiSky: "#d99a6a",
    hemiGround: "#463a4e",
    hemi: 0.9,
    key: "#ff9d5c",
    keyIntensity: 2.6,
    keyPosition: [-20, 10, 8] as const,
    fill: "#ffd9a0",
    fillIntensity: 0.55,
    background: "radial-gradient(ellipse at 50% 35%, #2a1c14 0%, #140e0a 55%, #060404 100%)",
  },
  night: {
    hemiSky: "#6d82a8",
    hemiGround: "#2e2e3c",
    hemi: 1.0,
    key: "#aebfe4",
    keyIntensity: 2.4,
    keyPosition: [10, 20, -8] as const,
    fill: "#ffce8f",
    fillIntensity: 0.45,
    background: "radial-gradient(ellipse at 50% 35%, #181a26 0%, #0d0e15 55%, #050506 100%)",
  },
} as const

/** Deterministic PRNG so scatter and textures are stable per scene. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashString(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** Blotchy noise texture so the ground reads as terrain, not a flat mat. */
function makeGroundTexture(baseColor: string, seed: number): THREE.CanvasTexture {
  const size = 512
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")!
  const random = mulberry32(seed)
  const base = new THREE.Color(baseColor)

  ctx.fillStyle = `#${base.getHexString()}`
  ctx.fillRect(0, 0, size, size)

  // large soft blotches darker/lighter than base
  for (let i = 0; i < 140; i++) {
    const shade = base.clone().offsetHSL(random() * 0.03 - 0.015, random() * 0.08 - 0.04, random() * 0.1 - 0.05)
    const radius = 20 + random() * 70
    const x = random() * size
    const y = random() * size
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, `rgba(${shade.r * 255}, ${shade.g * 255}, ${shade.b * 255}, 0.35)`)
    gradient.addColorStop(1, "rgba(0,0,0,0)")
    ctx.fillStyle = gradient
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }
  // fine speckle
  for (let i = 0; i < 4200; i++) {
    const shade = base.clone().offsetHSL(0, random() * 0.1 - 0.05, random() * 0.22 - 0.11)
    ctx.fillStyle = `rgba(${shade.r * 255}, ${shade.g * 255}, ${shade.b * 255}, ${0.25 + random() * 0.3})`
    const s = 1 + random() * 2.2
    ctx.fillRect(random() * size, random() * size, s, s)
  }

  // Single tile across the board — the blotches aren't seamless, so repeating
  // would draw visible seam lines at tile borders.
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/** Plank-and-grain texture for the table the board sits on. */
function makeWoodTexture(seed: number): THREE.CanvasTexture {
  const size = 512
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")!
  const random = mulberry32(seed)

  ctx.fillStyle = "#5a3d24"
  ctx.fillRect(0, 0, size, size)
  const plank = size / 6
  for (let p = 0; p < 6; p++) {
    const tone = 0.85 + random() * 0.3
    ctx.fillStyle = `rgb(${Math.round(90 * tone)}, ${Math.round(61 * tone)}, ${Math.round(36 * tone)})`
    ctx.fillRect(p * plank, 0, plank - 2, size)
    for (let i = 0; i < 26; i++) {
      const shade = 0.7 + random() * 0.5
      ctx.strokeStyle = `rgba(${Math.round(70 * shade)}, ${Math.round(46 * shade)}, ${Math.round(26 * shade)}, 0.35)`
      ctx.lineWidth = 0.8 + random() * 1.4
      const x = p * plank + random() * plank
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.bezierCurveTo(x + random() * 14 - 7, size * 0.33, x + random() * 14 - 7, size * 0.66, x + random() * 10 - 5, size)
      ctx.stroke()
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(2, 2)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Instanced tufts/pebbles so the board isn't an empty plane between props. */
function GroundScatter({ ground, seed }: { ground: string; seed: number }) {
  const { matrices, color } = useMemo(() => {
    const random = mulberry32(seed)
    const half = SCENE_BOARD_SIZE / 2 - 0.8
    const dummy = new THREE.Object3D()
    const list: THREE.Matrix4[] = []
    for (let i = 0; i < 110; i++) {
      dummy.position.set((random() * 2 - 1) * half, 0, (random() * 2 - 1) * half)
      const s = 0.05 + random() * 0.09
      dummy.scale.set(s, s * (1.1 + random()), s)
      dummy.rotation.y = random() * Math.PI * 2
      dummy.updateMatrix()
      list.push(dummy.matrix.clone())
    }
    const colors: Record<string, string> = { grass: "#3e5c33", dirt: "#5c4832", stone: "#5c5952", sand: "#8a7a55", snow: "#cdd6dd", cave: "#403c3a" }
    return { matrices: list, color: colors[ground] ?? "#3e5c33" }
  }, [ground, seed])

  return (
    <instancedMesh
      args={[undefined, undefined, matrices.length]}
      ref={(mesh) => {
        if (!mesh) return
        matrices.forEach((matrix, i) => {
          mesh.setMatrixAt(i, matrix)
        })
        mesh.instanceMatrix.needsUpdate = true
      }}
      castShadow
    >
      <coneGeometry args={[1, 2.2, 5]} />
      <meshStandardMaterial color={color} roughness={0.95} />
    </instancedMesh>
  )
}

/** Slow-drifting light motes — fireflies at night, dust in eerie scenes. */
function FloatingMotes({ color, seed }: { color: string; seed: number }) {
  const pointsRef = useRef<THREE.Points>(null)
  const { positions, phases } = useMemo(() => {
    const random = mulberry32(seed ^ 0x9e37)
    const count = 42
    const pos = new Float32Array(count * 3)
    const phase = new Float32Array(count * 2)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (random() * 2 - 1) * (SCENE_BOARD_SIZE / 2 - 1)
      pos[i * 3 + 1] = 0.4 + random() * 2.6
      pos[i * 3 + 2] = (random() * 2 - 1) * (SCENE_BOARD_SIZE / 2 - 1)
      phase[i * 2] = random() * Math.PI * 2
      phase[i * 2 + 1] = 0.3 + random() * 0.7
    }
    return { positions: pos, phases: phase }
  }, [seed])

  useFrame(({ clock }) => {
    const points = pointsRef.current
    if (!points) return
    const attribute = points.geometry.getAttribute("position") as THREE.BufferAttribute
    const t = clock.elapsedTime
    for (let i = 0; i < attribute.count; i++) {
      const p0 = phases[i * 2]
      const speed = phases[i * 2 + 1]
      attribute.setX(i, positions[i * 3] + Math.sin(t * 0.22 * speed + p0) * 0.9)
      attribute.setY(i, positions[i * 3 + 1] + Math.sin(t * 0.4 * speed + p0 * 2) * 0.35)
      attribute.setZ(i, positions[i * 3 + 2] + Math.cos(t * 0.18 * speed + p0) * 0.9)
    }
    attribute.needsUpdate = true
    const material = points.material as THREE.PointsMaterial
    material.opacity = 0.55 + Math.sin(t * 0.8) * 0.15
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions.slice(), 3]} />
      </bufferGeometry>
      <pointsMaterial color={color} size={0.09} transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation />
    </points>
  )
}

export default function EncounterScene({ scene, characters }: { scene: EncounterScene3D; characters: TurnCharacter[] }) {
  const { environment } = scene
  const light = LIGHTING[environment.timeOfDay]
  const kit = ENVIRONMENT_KITS[environment.kit]
  const groundColor = GROUND_COLORS[environment.ground] ?? kit.groundColor
  const foggy = environment.mood === "eerie" || environment.mood === "tense" || environment.timeOfDay === "night"

  const seed = useMemo(() => hashString(scene.turnId || "scene"), [scene.turnId])
  const groundTexture = useMemo(() => makeGroundTexture(groundColor, seed), [groundColor, seed])
  const woodTexture = useMemo(() => makeWoodTexture(1337), [])
  const charactersById = useMemo(() => new Map(characters.map((c) => [c.id, c])), [characters])
  const half = SCENE_BOARD_SIZE / 2

  const forestDensity = KIT_FOREST_DENSITY[environment.kit] ?? 0
  const forestAvoid = useMemo<ForestAvoidZone[]>(
    () => [
      ...scene.characters.map((c) => ({ x: c.x, z: c.z, radius: 1.6 })),
      ...scene.props.map((p) => {
        const def = getPropDefinition(p.propId)
        return { x: p.x, z: p.z, radius: (def?.footprintRadius ?? 0.6) * p.scale + 0.5 }
      }),
    ],
    [scene.characters, scene.props]
  )

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 40, position: [0, 16, 15], near: 0.5, far: 120 }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = 1.2
        // Soft shadows via VSM — drei's <SoftShadows> PCSS injection is broken
        // against three 0.183 (uses the removed unpackRGBAToDepth chunk).
        gl.shadowMap.type = THREE.VSMShadowMap
      }}
      style={{ background: light.background }}
    >
      {foggy && <fog attach="fog" args={[kit.fogColor, 26, 60]} />}

      <hemisphereLight args={[light.hemiSky, light.hemiGround, light.hemi]} />
      {/* key light — sun/moon */}
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
        shadow-bias={-0.0002}
        shadow-radius={5}
        shadow-blurSamples={12}
      />
      {/* warm counter-fill from the viewer's side — the "room light over the table" */}
      <directionalLight position={[-8, 12, 16]} intensity={light.fillIntensity} color={light.fill} />

      {/* wooden table under the board */}
      <mesh position={[0, -0.4, 0]} receiveShadow>
        <boxGeometry args={[SCENE_BOARD_SIZE + 5, 0.8, SCENE_BOARD_SIZE + 5]} />
        <meshStandardMaterial map={woodTexture} color="#8a6a48" roughness={0.6} metalness={0.05} />
      </mesh>
      {/* ground board */}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[SCENE_BOARD_SIZE, SCENE_BOARD_SIZE]} />
        <meshStandardMaterial map={groundTexture} roughness={0.95} />
      </mesh>
      {/* faint grid so it reads as a battle board */}
      <gridHelper args={[SCENE_BOARD_SIZE, SCENE_BOARD_SIZE, "#000000", "#000000"]} position={[0, 0.02, 0]} material-transparent material-opacity={0.16} />

      <GroundScatter ground={environment.ground} seed={seed} />
      {(environment.timeOfDay === "night" || environment.mood === "eerie") && <FloatingMotes color={environment.mood === "eerie" ? "#9db4c9" : "#ffd98a"} seed={seed} />}

      <Suspense fallback={null}>
        <ForestRing density={forestDensity} seed={seed} avoid={forestAvoid} dead={environment.kit === "crypt"} />
        {scene.props.map((prop) => (
          <SceneProp key={prop.id} prop={prop} timeOfDay={environment.timeOfDay} />
        ))}
        {scene.characters.map((placement) => {
          const character = charactersById.get(placement.characterId)
          if (!character) return null
          return <CharacterMini key={placement.characterId} placement={placement} character={character} />
        })}
      </Suspense>

      <EffectComposer multisampling={4}>
        <N8AO aoRadius={1.6} intensity={3.5} distanceFalloff={1} halfRes />
        <Bloom mipmapBlur intensity={0.75} luminanceThreshold={0.85} luminanceSmoothing={0.2} />
        <Vignette offset={0.28} darkness={0.72} />
      </EffectComposer>

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
