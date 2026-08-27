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
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { Bloom, EffectComposer, N8AO, Vignette } from "@react-three/postprocessing"
import { Suspense, useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { ENVIRONMENT_KITS, GROUND_COLORS, getInteriorShell, getPropDefinition, KIT_FOREST_DENSITY, KIT_URBAN_DRESSING } from "@/lib/encounterview/asset-catalog"
import { planEstablishingShot } from "@/lib/encounterview/camera"
import { SCENE_BOARD_SIZE } from "@/lib/encounterview/generate"
import type { TurnCharacter } from "@/types/adventure"
import type { EncounterScene3D } from "@/types/encounter-scene-3d"
import { CharacterMini } from "./character-mini"
import { type ForestAvoidZone, ForestRing } from "./forest-ring"
import { planRoomShell, RoomShell, roomAvoidZones } from "./room-shell"
import { SceneProp } from "./scene-prop"
import { planUrbanRing, UrbanRing, urbanAvoidZones } from "./urban-ring"

const CAMERA_FOV = 40

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
  // Dusk sits the sun ON the horizon rather than a third of the way up it: a long
  // raking key throws the prop shadows right across the board, which is most of
  // what makes a low-sun scene read as low-sun.
  dusk: {
    hemiSky: "#d99a6a",
    hemiGround: "#463a4e",
    hemi: 0.85,
    key: "#ff8440",
    keyIntensity: 2.5,
    keyPosition: [-24, 5.5, 9] as const,
    fill: "#ffd9a0",
    fillIntensity: 0.55,
    background: "radial-gradient(ellipse at 50% 35%, #2a1c14 0%, #140e0a 55%, #060404 100%)",
  },
  // Night drops the key hard and goes properly cold, so the warm pools thrown by
  // the lightSource props (torch, brazier, candelabra, campfire) are what actually
  // lights the tableau. scene-prop.tsx scales those pools up to match.
  night: {
    hemiSky: "#5a6f96",
    hemiGround: "#26262f",
    hemi: 0.78,
    key: "#8ea3cc",
    keyIntensity: 1.35,
    keyPosition: [10, 20, -8] as const,
    fill: "#ffce8f",
    fillIntensity: 0.4,
    background: "radial-gradient(ellipse at 50% 35%, #181a26 0%, #0d0e15 55%, #050506 100%)",
  },
} as const

/**
 * Mood on top of time of day. Offsets are HSL deltas applied to the base lights;
 * multipliers scale intensity. Deliberately restrained — this is a colour grade,
 * not a relight, and the board has to stay readable in every combination.
 */
const MOOD_LIGHT: Record<
  string,
  { keyMultiplier: number; keyShift: readonly [number, number, number]; ambientMultiplier: number; ambientShift: readonly [number, number, number]; fillMultiplier: number }
> = {
  calm: { keyMultiplier: 1, keyShift: [0, 0, 0], ambientMultiplier: 1, ambientShift: [0, 0, 0], fillMultiplier: 1 },
  tense: { keyMultiplier: 0.92, keyShift: [-0.01, -0.04, -0.03], ambientMultiplier: 0.9, ambientShift: [-0.01, -0.05, -0.03], fillMultiplier: 0.95 },
  // Harsher and warmer: a hot key with the ambient pulled down under it.
  battle: { keyMultiplier: 1.15, keyShift: [-0.03, 0.1, -0.02], ambientMultiplier: 0.82, ambientShift: [-0.02, 0.05, -0.05], fillMultiplier: 1.12 },
  // Green-shifted ambient, key nearly gone — the classic wrong-coloured-daylight look.
  eerie: { keyMultiplier: 0.68, keyShift: [0.1, -0.06, -0.06], ambientMultiplier: 0.8, ambientShift: [0.2, 0.06, -0.06], fillMultiplier: 0.7 },
  aftermath: { keyMultiplier: 0.8, keyShift: [0.02, -0.2, -0.05], ambientMultiplier: 0.9, ambientShift: [0.01, -0.2, -0.04], fillMultiplier: 0.8 },
}

const shiftColor = (hex: string, shift: readonly [number, number, number]) => `#${new THREE.Color(hex).offsetHSL(shift[0], shift[1], shift[2]).getHexString()}`

// Sky dome gradient per time of day: zenith -> horizon. Cheap on purpose — a single
// back-faced sphere with a two-stop vertex gradient, no HDRI fetch, no drei <Sky>
// (its Rayleigh model can't be tinted toward "eerie" or "battle" the way mood needs).
const SKY = {
  day: { top: "#3f6ba3", horizon: "#c6d4e2" },
  dusk: { top: "#2a2145", horizon: "#e3915a" },
  night: { top: "#080b16", horizon: "#2b3550" },
} as const

/** Mood pushes the horizon band; the zenith stays put so the dome keeps its depth. */
const MOOD_SKY_SHIFT: Record<string, { hue: number; sat: number; light: number }> = {
  calm: { hue: 0, sat: 0, light: 0.02 },
  tense: { hue: -0.02, sat: -0.06, light: -0.05 },
  battle: { hue: -0.05, sat: 0.1, light: -0.03 },
  eerie: { hue: 0.16, sat: -0.1, light: -0.08 },
  aftermath: { hue: 0.02, sat: -0.14, light: -0.06 },
}

/** Back-faced gradient dome. fog is off on it so distance fog can't flatten the sky. */
function SkyDome({ top, horizon }: { top: string; horizon: string }) {
  const uniforms = useMemo(() => ({ topColor: { value: new THREE.Color(top) }, horizonColor: { value: new THREE.Color(horizon) } }), [top, horizon])
  return (
    <mesh scale={[1, 0.6, 1]}>
      <sphereGeometry args={[58, 24, 16]} />
      <shaderMaterial
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
        uniforms={uniforms}
        vertexShader={`
          varying float vH;
          void main() {
            vec4 world = modelMatrix * vec4(position, 1.0);
            vH = clamp(world.y / 34.0, -1.0, 1.0);
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `}
        fragmentShader={`
          uniform vec3 topColor;
          uniform vec3 horizonColor;
          varying float vH;
          void main() {
            float t = smoothstep(0.0, 0.75, vH);
            gl_FragColor = vec4(mix(horizonColor, topColor, t), 1.0);
          }
        `}
      />
    </mesh>
  )
}

/**
 * Applies the computed establishing shot once per scene, then gets out of the way.
 *
 * Runs inside the Canvas because it needs the live viewport aspect (the shot pulls
 * back further on a narrow panel) and drei's <OrbitControls makeDefault>, which is
 * only reachable from the R3F store. After the effect fires the camera belongs to
 * OrbitControls again — orbit, zoom and pan behave exactly as before.
 */
function EstablishingCamera({ scene }: { scene: EncounterScene3D }) {
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as (THREE.EventDispatcher & { target: THREE.Vector3; maxPolarAngle: number; maxDistance: number; update: () => void }) | null
  const { width, height } = useThree((state) => state.size)
  const shot = useMemo(() => planEstablishingShot(scene, { fov: CAMERA_FOV, aspect: height > 0 ? width / height : 16 / 9 }), [scene, width, height])
  // Applied once per turn. The shot is recomputed on resize (a narrow panel needs
  // a wider shot) but is NOT re-applied — yanking the camera back to the
  // establishing angle every time the window changes size would be maddening.
  const appliedFor = useRef<string | null>(null)

  useEffect(() => {
    const key = scene.turnId || "scene"
    if (appliedFor.current === key) return
    camera.position.set(...shot.position)
    if (!controls) {
      // Controls mount a frame later; leave the marker unset so we run again then.
      camera.lookAt(shot.target[0], shot.target[1], shot.target[2])
      return
    }
    appliedFor.current = key
    // Raise the ceilings before update(), or OrbitControls clamps the low shot
    // straight back up into the old map view on its first frame.
    controls.maxPolarAngle = Math.max(controls.maxPolarAngle, shot.maxPolarAngle)
    controls.maxDistance = Math.max(controls.maxDistance, shot.maxDistance)
    controls.target.set(shot.target[0], shot.target[1], shot.target[2])
    controls.update()
  }, [camera, controls, shot, scene.turnId])

  return null
}

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

export default function EncounterScene({
  scene,
  characters,
  standees,
  standeesBack,
  minis3d,
}: {
  scene: EncounterScene3D
  characters: TurnCharacter[]
  standees?: Record<string, string>
  standeesBack?: Record<string, string>
  minis3d?: Record<string, string>
}) {
  const { environment } = scene
  const light = LIGHTING[environment.timeOfDay]
  const kit = ENVIRONMENT_KITS[environment.kit]
  // Interior kits swap the sky for a ceiling: no dome, near fog, and the sun's
  // key light cut to a trickle so the room is lit by its own lamps.
  const shell = getInteriorShell(environment.kit)
  const mood = MOOD_LIGHT[environment.mood] ?? MOOD_LIGHT.calm
  const graded = useMemo(
    () => ({
      key: shiftColor(light.key, mood.keyShift),
      keyIntensity: light.keyIntensity * mood.keyMultiplier * (shell?.keyMultiplier ?? 1),
      hemiSky: shiftColor(light.hemiSky, mood.ambientShift),
      hemiGround: shiftColor(light.hemiGround, mood.ambientShift),
      hemi: light.hemi * mood.ambientMultiplier * (shell?.ambientMultiplier ?? 1),
      fill: shiftColor(light.fill, mood.keyShift),
      fillIntensity: light.fillIntensity * mood.fillMultiplier * (shell?.ambientMultiplier ?? 1),
    }),
    [light, mood, shell]
  )
  // ground enum picks the material, the kit tints it — so stone in a crypt reads
  // colder than the same stone in a courtyard instead of both being one flat swatch.
  const groundColor = useMemo(
    () => `#${new THREE.Color(GROUND_COLORS[environment.ground] ?? kit.groundColor).lerp(new THREE.Color(kit.groundColor), 0.3).getHexString()}`,
    [environment.ground, kit.groundColor]
  )
  const foggy = environment.mood === "eerie" || environment.mood === "tense" || environment.timeOfDay === "night"

  const sky = useMemo(() => {
    const shift = MOOD_SKY_SHIFT[environment.mood] ?? MOOD_SKY_SHIFT.calm
    const base = SKY[environment.timeOfDay]
    return { top: base.top, horizon: `#${new THREE.Color(base.horizon).offsetHSL(shift.hue, shift.sat, shift.light).getHexString()}` }
  }, [environment.timeOfDay, environment.mood])

  const seed = useMemo(() => hashString(scene.turnId || "scene"), [scene.turnId])
  const groundTexture = useMemo(() => makeGroundTexture(groundColor, seed), [groundColor, seed])
  const woodTexture = useMemo(() => makeWoodTexture(1337), [])
  const charactersById = useMemo(() => new Map(characters.map((c) => [c.id, c])), [characters])
  const half = SCENE_BOARD_SIZE / 2

  const forestDensity = KIT_FOREST_DENSITY[environment.kit] ?? 0
  const sceneAvoid = useMemo<ForestAvoidZone[]>(
    () => [
      ...scene.characters.map((c) => ({ x: c.x, z: c.z, radius: 1.6 })),
      ...scene.props.map((p) => {
        const def = getPropDefinition(p.propId)
        return { x: p.x, z: p.z, radius: (def?.footprintRadius ?? 0.6) * p.scale + 0.5 }
      }),
    ],
    [scene.characters, scene.props]
  )
  // Buildings are planned first and then handed to the treeline as keep-clear zones,
  // so a checkpoint gets both a street front and a thin treeline without them clipping.
  const urbanPlan = useMemo(() => planUrbanRing(KIT_URBAN_DRESSING[environment.kit] ?? { walls: 0, facades: 0 }, seed, sceneAvoid), [environment.kit, seed, sceneAvoid])
  const roomPlan = useMemo(() => planRoomShell(shell, seed), [shell, seed])
  const forestAvoid = useMemo(() => [...sceneAvoid, ...urbanAvoidZones(urbanPlan), ...roomAvoidZones(roomPlan)], [sceneAvoid, urbanPlan, roomPlan])

  // Fog is tied to the establishing shot's depth so the landmark it frames never
  // arrives already washed out — the old fixed 26/60 band ate a gate-arch staged
  // at the far edge. Computed here at a nominal aspect; EstablishingCamera
  // re-derives the same shot at the real one for the camera itself.
  const shot = useMemo(() => planEstablishingShot(scene, { fov: CAMERA_FOV }), [scene])
  const fog = useMemo<[string, number, number]>(() => {
    if (shell) return [kit.fogColor, shell.fog[0], shell.fog[1]]
    if (foggy) return [kit.fogColor, shot.depth * 1.25, shot.depth * 2.9]
    return [sky.horizon, shot.depth * 1.9, shot.depth * 4.4]
  }, [shell, foggy, kit.fogColor, sky.horizon, shot.depth])

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: CAMERA_FOV, position: shot.position, near: 0.5, far: 140 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = 1.2
        // Soft shadows via VSM — drei's <SoftShadows> PCSS injection is broken
        // against three 0.183 (uses the removed unpackRGBAToDepth chunk).
        gl.shadowMap.type = THREE.VSMShadowMap
      }}
      style={{ background: shell ? shell.backdrop : light.background }}
    >
      <EstablishingCamera scene={scene} />
      {/* Always fogged now, just at different strengths: the far fog pins the props to
          the sky's horizon band instead of leaving them floating on a hard cut.
          Interiors use their own much nearer band so the walls fall away into dark. */}
      <fog attach="fog" args={fog} />
      {/* No sky indoors — RoomShell's ceiling and the flat backdrop take its place. */}
      {!shell && <SkyDome top={sky.top} horizon={sky.horizon} />}

      <hemisphereLight args={[graded.hemiSky, graded.hemiGround, graded.hemi]} />
      {/* key light — sun/moon; indoors this is only a hint of spill through a window */}
      <directionalLight
        position={[...light.keyPosition]}
        intensity={graded.keyIntensity}
        color={graded.key}
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
      <directionalLight position={[-8, 12, 16]} intensity={graded.fillIntensity} color={graded.fill} />

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

      {/* Tufts and pebbles are outdoor ground cover — a swept tavern floor has none. */}
      {!shell && <GroundScatter ground={environment.ground} seed={seed} />}
      {(environment.timeOfDay === "night" || environment.mood === "eerie") && <FloatingMotes color={environment.mood === "eerie" ? "#9db4c9" : "#ffd98a"} seed={seed} />}

      <Suspense fallback={null}>
        <RoomShell plan={roomPlan} />
        <UrbanRing plan={urbanPlan} />
        <ForestRing density={forestDensity} seed={seed} avoid={forestAvoid} dead={environment.kit === "crypt"} />
        {scene.props.map((prop) => (
          <SceneProp key={prop.id} prop={prop} timeOfDay={environment.timeOfDay} interior={!!shell} />
        ))}
        {scene.characters.map((placement) => {
          const character = charactersById.get(placement.characterId)
          if (!character) return null
          return (
            <CharacterMini
              key={placement.characterId}
              placement={placement}
              character={character}
              standeeUrl={standees?.[placement.characterId]}
              standeeBackUrl={standeesBack?.[placement.characterId]}
              mini3dUrl={minis3d?.[placement.characterId]}
            />
          )
        })}
      </Suspense>

      <EffectComposer multisampling={4}>
        <N8AO aoRadius={1.6} intensity={3.5} distanceFalloff={1} halfRes />
        <Bloom mipmapBlur intensity={0.75} luminanceThreshold={0.85} luminanceSmoothing={0.2} />
        <Vignette offset={0.28} darkness={0.72} />
      </EffectComposer>

      {/* Limits are widened to admit the low establishing shot; everything else
          about orbit/zoom/pan is unchanged. EstablishingCamera owns the target. */}
      <OrbitControls target={shot.target} minPolarAngle={0.4} maxPolarAngle={shot.maxPolarAngle} minDistance={6} maxDistance={Math.max(30, half * 3, shot.maxDistance)} enablePan makeDefault />
    </Canvas>
  )
}
