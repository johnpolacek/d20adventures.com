"use client"

// Deprecated: 3D encounter map rendering is disabled in product flow.
// Keep this implementation dormant for possible revival.

import { enhanceEncounterMap, getThemePalette } from "@/lib/map-utils"
import { cn, getTextureImageUrl } from "@/lib/utils"
import type { Encounter3DMap } from "@/types/adventure-plan"
import { Edges, Grid, OrbitControls, RoundedBox } from "@react-three/drei"
import { Canvas, useThree } from "@react-three/fiber"
import type { TurnCharacter } from "@/types/adventure"
import * as THREE from "three"
import { useEffect, useId, useMemo, useState } from "react"

export type MiniaturesMapRenderMode = "safe" | "geometry" | "textured" | "full"
export type MiniaturesMapTokenRenderMode = "safe" | "premium"

export interface MapMiniToken {
  id: string
  label: string
  image?: string
  shortLabel?: string
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

const MINI_PREVIEW_HEIGHT = 1.7
const portraitTextureCache = new Map<string, THREE.Texture | null>()
const portraitTextureRequestCache = new Map<string, Promise<THREE.Texture | null>>()
const portraitTextureLoader = new THREE.TextureLoader()

function shiftColor(color: string, lightness: number) {
  const next = new THREE.Color(color)
  next.offsetHSL(0, 0, lightness)
  return `#${next.getHexString()}`
}

function getTokenInitials(label: string) {
  const parts = label
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase()
}

function getMiniStyle(token: MapMiniToken) {
  const factionColor = token.kind === "pc" ? "#60a5fa" : "#f87171"
  const ringColor = token.isDead ? "#7f1d1d" : token.isActive ? "#fbbf24" : factionColor

  return {
    ringColor,
    baseColor: token.kind === "pc" ? "#5a4634" : "#4d3b30",
    topColor: token.isDead ? "#43302d" : token.isComplete ? "#334155" : "#2b2622",
    accentMetal: token.kind === "pc" ? "#b7c9dc" : "#d8b89f",
    cardTone: token.kind === "pc" ? "#efe4d6" : "#ead9cf",
    plaqueTone: token.kind === "pc" ? "#d5b89a" : "#c7aa8b",
  }
}

function usePortraitTexture(image?: string) {
  const imageUrl = image ? getTextureImageUrl(image) : ""
  const [portraitTexture, setPortraitTexture] = useState<THREE.Texture | null>(() => (imageUrl ? portraitTextureCache.get(imageUrl) ?? null : null))

  useEffect(() => {
    if (!imageUrl) {
      setPortraitTexture(null)
      return
    }

    const cachedTexture = portraitTextureCache.get(imageUrl)
    if (cachedTexture !== undefined) {
      setPortraitTexture(cachedTexture)
      return
    }

    let isCancelled = false
    const pendingRequest =
      portraitTextureRequestCache.get(imageUrl) ||
      new Promise<THREE.Texture | null>((resolve) => {
        portraitTextureLoader.load(
          imageUrl,
          (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace
            texture.needsUpdate = true
            console.info("[MiniaturesMap] portrait texture loaded", {
              imageUrl,
              width: texture.image?.width ?? null,
              height: texture.image?.height ?? null,
            })
            portraitTextureCache.set(imageUrl, texture)
            portraitTextureRequestCache.delete(imageUrl)
            resolve(texture)
          },
          undefined,
          (error) => {
            console.warn(`Could not load ${imageUrl}:`, error)
            portraitTextureCache.set(imageUrl, null)
            portraitTextureRequestCache.delete(imageUrl)
            resolve(null)
          }
        )
      })

    portraitTextureRequestCache.set(imageUrl, pendingRequest)

    void pendingRequest.then((texture) => {
      if (isCancelled) return
      setPortraitTexture(texture)
    })

    return () => {
      isCancelled = true
    }
  }, [imageUrl])

  return portraitTexture
}

function MiniaturesMapDiagnostics({
  mapId,
  title,
  tokens,
  renderMode,
}: {
  mapId: string
  title?: string
  tokens: MapMiniToken[]
  renderMode: MiniaturesMapRenderMode
}) {
  const { gl, scene } = useThree()

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      console.groupCollapsed(`[MiniaturesMap:${mapId}] renderer ready`)
      console.log(
        JSON.stringify(
          {
            title: title || "Encounter Map",
            minis: tokens.length,
            geometries: gl.info.memory.geometries,
            textures: gl.info.memory.textures,
            calls: gl.info.render.calls,
            triangles: gl.info.render.triangles,
            maxTextureSize: gl.capabilities.maxTextureSize,
            maxCubemapSize: gl.capabilities.maxCubemapSize,
            pixelRatio: window.devicePixelRatio,
            sceneChildren: scene.children.length,
            renderMode,
          },
          null,
          2
        )
      )
      console.groupEnd()
    })

    return () => cancelAnimationFrame(frame)
  }, [gl, mapId, renderMode, scene.children.length, title, tokens.length])

  return null
}

interface SceneTextureSet {
  stone: THREE.CanvasTexture
  wood: THREE.CanvasTexture
  cloth: THREE.CanvasTexture
  dirt: THREE.CanvasTexture
  metal: THREE.CanvasTexture
}

function createPatternTexture(args: {
  width?: number
  height?: number
  repeatX: number
  repeatY: number
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void
}) {
  const canvas = document.createElement("canvas")
  canvas.width = args.width ?? 256
  canvas.height = args.height ?? 256
  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("Unable to create texture context")
  }

  args.draw(context, canvas.width, canvas.height)

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(args.repeatX, args.repeatY)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

function buildSceneTextures(palette: ReturnType<typeof getThemePalette>) {
  const stone = createPatternTexture({
    width: 384,
    height: 384,
    repeatX: 2.2,
    repeatY: 2.2,
    draw: (context, width, height) => {
      context.fillStyle = shiftColor(palette.floor, 0.08)
      context.fillRect(0, 0, width, height)
      context.fillStyle = shiftColor(palette.floor, 0.12)
      context.fillRect(0, 0, width, height)

      let y = 0
      let row = 0
      while (y < height) {
        const rowHeight = 52 + (row % 3) * 18
        let x = row % 2 === 0 ? -18 : 16
        while (x < width) {
          const blockWidth = 74 + ((row + Math.floor(Math.max(x, 0) / 30)) % 3) * 26
          context.fillStyle = shiftColor(palette.floor, 0.12 - ((row + Math.floor(Math.max(x, 0) / 48)) % 3) * 0.04)
          context.fillRect(x + 3, y + 3, blockWidth - 6, rowHeight - 6)

          context.strokeStyle = shiftColor(palette.edge, 0.05)
          context.lineWidth = 2
          context.strokeRect(x + 3, y + 3, blockWidth - 6, rowHeight - 6)

          context.fillStyle = shiftColor(palette.floor, 0.18)
          context.fillRect(x + 8, y + 8, blockWidth - 20, 4)
          context.fillStyle = shiftColor(palette.edge, 0.14)
          context.fillRect(x + 10, y + rowHeight - 11, blockWidth - 24, 3)

          x += blockWidth - 4
        }
        y += rowHeight - 4
        row += 1
      }

      context.globalAlpha = 0.24
      for (let index = 0; index < 180; index += 1) {
        const px = (index * 37) % width
        const py = (index * 61) % height
        const size = 1 + (index % 3)
        context.fillStyle = index % 2 === 0 ? shiftColor(palette.floor, 0.22) : shiftColor(palette.edge, 0.12)
        context.beginPath()
        context.arc(px, py, size, 0, Math.PI * 2)
        context.fill()
      }
      context.globalAlpha = 1
    },
  })

  const wood = createPatternTexture({
    width: 384,
    height: 256,
    repeatX: 3.25,
    repeatY: 1.5,
    draw: (context, width, height) => {
      context.fillStyle = shiftColor(palette.frame, 0.24)
      context.fillRect(0, 0, width, height)
      const plankHeight = height / 5
      for (let row = 0; row < 5; row += 1) {
        const y = row * plankHeight
        context.fillStyle = row % 2 === 0 ? shiftColor(palette.frame, 0.34) : shiftColor(palette.frame, 0.16)
        context.fillRect(0, y, width, plankHeight - 2)
        context.fillStyle = shiftColor(palette.frame, 0.44)
        context.fillRect(0, y, width, 2)
        context.fillStyle = shiftColor(palette.frame, -0.02)
        context.fillRect(0, y + plankHeight - 3, width, 2)
      }

      context.strokeStyle = shiftColor(palette.frame, 0.42)
      context.lineWidth = 1.4
      for (let index = 0; index < 42; index += 1) {
        context.beginPath()
        context.moveTo(0, index * 6)
        context.bezierCurveTo(width * 0.2, index * 6 + 5, width * 0.72, index * 6 - 4, width, index * 6 + 1)
        context.stroke()
      }

      for (let index = 0; index < 9; index += 1) {
        const knotX = 28 + index * 38
        const knotY = 22 + (index % 5) * 38
        context.strokeStyle = shiftColor(palette.frame, -0.12)
        context.lineWidth = 1.1
        context.beginPath()
        context.ellipse(knotX, knotY, 8, 4, 0, 0, Math.PI * 2)
        context.stroke()
      }
    },
  })

  const cloth = createPatternTexture({
    repeatX: 1,
    repeatY: 1,
    draw: (context, width, height) => {
      context.fillStyle = shiftColor(palette.accent, -0.08)
      context.fillRect(0, 0, width, height)
      context.strokeStyle = shiftColor(palette.accent, 0.2)
      context.lineWidth = 3
      for (let x = 10; x < width; x += 18) {
        context.beginPath()
        context.moveTo(x, 0)
        context.lineTo(x, height)
        context.stroke()
      }
    },
  })

  const dirt = createPatternTexture({
    repeatX: 5,
    repeatY: 5,
    draw: (context, width, height) => {
      context.fillStyle = shiftColor(palette.floor, -0.02)
      context.fillRect(0, 0, width, height)
      for (let index = 0; index < 260; index += 1) {
        context.fillStyle = index % 2 === 0 ? shiftColor(palette.floor, 0.06) : shiftColor(palette.edge, 0.18)
        const size = 2 + (index % 4)
        context.beginPath()
        context.arc(Math.random() * width, Math.random() * height, size, 0, Math.PI * 2)
        context.fill()
      }
    },
  })

  const metal = createPatternTexture({
    repeatX: 2,
    repeatY: 2,
    draw: (context, width, height) => {
      context.fillStyle = shiftColor(palette.rim, -0.1)
      context.fillRect(0, 0, width, height)
      context.strokeStyle = shiftColor(palette.rim, 0.14)
      context.lineWidth = 2
      for (let index = 0; index < 80; index += 1) {
        context.beginPath()
        context.moveTo(0, index * 4)
        context.lineTo(width, index * 4 + (index % 2 === 0 ? 5 : -5))
        context.stroke()
      }
    },
  })

  return { stone, wood, cloth, dirt, metal }
}

function getSurfaceTexture(textures: SceneTextureSet | null, theme: Encounter3DMap["board"]["theme"]) {
  if (!textures) return undefined
  switch (theme) {
    case "wood":
      return textures.wood
    case "dirt":
    case "sand":
    case "snow":
      return textures.dirt
    case "stone":
    case "cavern":
    default:
      return textures.stone
  }
}

function DisplayBase({
  map,
  palette,
  textures,
}: {
  map: Encounter3DMap
  palette: ReturnType<typeof getThemePalette>
  textures: SceneTextureSet | null
}) {
  const width = map.board.width * map.board.cellSize
  const depth = map.board.depth * map.board.cellSize
  const boardTexture = getSurfaceTexture(textures, map.board.theme)

  return (
    <group>
      <RoundedBox args={[width + 2.1, 0.54, depth + 2.1]} radius={0.18} smoothness={4} position={[0, -0.31, 0]} receiveShadow>
        <meshStandardMaterial color="#ffffff" roughness={0.88} metalness={0.12} map={textures?.wood} />
        <Edges scale={1.005} color={shiftColor(palette.frame, 0.14)} />
      </RoundedBox>

      <RoundedBox args={[width + 1.05, 0.18, depth + 1.05]} radius={0.12} smoothness={4} position={[0, -0.02, 0]} receiveShadow>
        <meshStandardMaterial color="#f2ede4" roughness={0.7} metalness={0.18} map={textures?.metal} />
        <Edges scale={1.004} color={shiftColor(palette.rim, 0.12)} />
      </RoundedBox>

      <RoundedBox args={[width, 0.1, depth]} radius={0.08} smoothness={4} position={[0, 0.06, 0]} receiveShadow>
        <meshStandardMaterial color="#f3eee2" roughness={0.92} metalness={0.02} map={boardTexture} />
        <Edges scale={1.003} color={shiftColor(palette.floor, -0.18)} />
      </RoundedBox>

      <mesh position={[0, 0.115, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width - 0.45, depth - 0.45]} />
        <meshStandardMaterial color="#ffffff" roughness={0.95} map={boardTexture} />
      </mesh>

      {[
        [0, 0.12, -depth / 2 + 0.18, width - 0.55, 0.1],
        [0, 0.12, depth / 2 - 0.18, width - 0.55, 0.1],
        [-width / 2 + 0.18, 0.12, 0, 0.1, depth - 0.55],
        [width / 2 - 0.18, 0.12, 0, 0.1, depth - 0.55],
      ].map(([x, y, z, sizeX, sizeZ], index) => (
        <mesh key={index} position={[x, y, z]} receiveShadow>
          <boxGeometry args={[sizeX, 0.04, sizeZ]} />
          <meshStandardMaterial color={palette.accent} roughness={0.62} metalness={0.18} />
        </mesh>
      ))}
    </group>
  )
}

function CityGateDesk({
  position,
  rotation = 0,
  scale = 1,
  textures,
  ledger = false,
}: {
  position: [number, number, number]
  rotation?: number
  scale?: number
  textures: SceneTextureSet | null
  ledger?: boolean
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.62 * scale, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.62 * scale, 0.18 * scale, 0.94 * scale]} />
        <meshStandardMaterial color="#cb9760" roughness={0.76} map={textures?.wood} />
      </mesh>
      <mesh position={[0, 0.76 * scale, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.1 * scale, 0.04 * scale, 0.58 * scale]} />
        <meshStandardMaterial color="#e7d8b0" roughness={0.8} map={textures?.cloth} />
      </mesh>
      <mesh position={[0, 1.02 * scale, -0.35 * scale]} castShadow receiveShadow>
        <boxGeometry args={[1.3 * scale, 0.12 * scale, 0.12 * scale]} />
        <meshStandardMaterial color="#845d3e" roughness={0.82} map={textures?.wood} />
      </mesh>
      {[
        [-0.58, 0.22, -0.32],
        [0.58, 0.22, -0.32],
        [-0.58, 0.22, 0.32],
        [0.58, 0.22, 0.32],
      ].map(([x, y, z]) => (
        <mesh key={`${x}:${z}`} position={[x * scale, y * scale, z * scale]} castShadow>
          <boxGeometry args={[0.12 * scale, 0.52 * scale, 0.12 * scale]} />
          <meshStandardMaterial color="#b07f4b" roughness={0.82} map={textures?.wood} />
        </mesh>
      ))}
      <mesh position={[-0.24 * scale, 0.82 * scale, 0.04 * scale]} rotation={[0, 0.12, -0.08]} castShadow>
        <boxGeometry args={[0.22 * scale, 0.04 * scale, 0.48 * scale]} />
        <meshStandardMaterial color="#f7f3eb" roughness={0.74} />
      </mesh>
      <mesh position={[0.34 * scale, 0.78 * scale, -0.04 * scale]} castShadow>
        <boxGeometry args={[0.2 * scale, 0.16 * scale, 0.22 * scale]} />
        <meshStandardMaterial color={ledger ? "#5f4638" : "#7f5b3f"} roughness={0.82} />
      </mesh>
      {ledger ? (
        <mesh position={[0.02 * scale, 0.82 * scale, 0.18 * scale]} rotation={[0, 0.08, 0.04]} castShadow>
          <boxGeometry args={[0.16 * scale, 0.12 * scale, 0.22 * scale]} />
          <meshStandardMaterial color="#6c4a33" roughness={0.8} />
        </mesh>
      ) : null}
    </group>
  )
}

function CityGateWagon({
  position,
  rotation = 0,
  scale = 1,
  textures,
  canopy = true,
}: {
  position: [number, number, number]
  rotation?: number
  scale?: number
  textures: SceneTextureSet | null
  canopy?: boolean
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.18 * scale, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.76 * scale, 0.22 * scale, 1.02 * scale]} />
        <meshStandardMaterial color="#a8733d" roughness={0.8} map={textures?.wood} />
      </mesh>
      {[
        [0, 0.48, -0.48, 1.54, 0.48, 0.08],
        [0, 0.48, 0.48, 1.54, 0.48, 0.08],
        [-0.74, 0.56, 0, 0.08, 0.62, 0.92],
        [0.74, 0.56, 0, 0.08, 0.62, 0.92],
      ].map(([x, y, z, sizeX, sizeY, sizeZ], index) => (
        <mesh key={index} position={[x * scale, y * scale, z * scale]} castShadow receiveShadow>
          <boxGeometry args={[sizeX * scale, sizeY * scale, sizeZ * scale]} />
          <meshStandardMaterial color="#8d6136" roughness={0.82} map={textures?.wood} />
        </mesh>
      ))}
      <mesh position={[0.1 * scale, 0.76 * scale, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.18 * scale, 0.32 * scale, 0.62 * scale]} />
        <meshStandardMaterial color="#7d573c" roughness={0.84} map={textures?.cloth} />
      </mesh>
      {canopy ? (
        <>
          {[-0.52, 0.52].map((x) => (
            <mesh key={x} position={[x * scale, 1.16 * scale, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.08 * scale, 0.9 * scale, 0.08 * scale]} />
              <meshStandardMaterial color="#7b573d" roughness={0.82} map={textures?.wood} />
            </mesh>
          ))}
          <mesh position={[0, 1.48 * scale, -0.14 * scale]} rotation={[0.18, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.46 * scale, 0.06 * scale, 0.62 * scale]} />
            <meshStandardMaterial color="#b35e58" roughness={0.82} map={textures?.cloth} />
          </mesh>
          <mesh position={[0, 1.48 * scale, 0.14 * scale]} rotation={[-0.18, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.46 * scale, 0.06 * scale, 0.62 * scale]} />
            <meshStandardMaterial color="#c06d63" roughness={0.82} map={textures?.cloth} />
          </mesh>
        </>
      ) : null}
      {[
        [-0.62, -0.06, -0.56],
        [0.62, -0.06, -0.56],
        [-0.62, -0.06, 0.56],
        [0.62, -0.06, 0.56],
      ].map(([x, y, z], index) => (
        <mesh key={index} position={[x * scale, y * scale, z * scale]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.3 * scale, 0.05 * scale, 10, 22]} />
          <meshStandardMaterial color="#4f3a2a" roughness={0.72} metalness={0.16} />
        </mesh>
      ))}
      <mesh position={[1.06 * scale, 0.02 * scale, 0]} rotation={[0, 0, -0.08]} castShadow receiveShadow>
        <boxGeometry args={[0.96 * scale, 0.06 * scale, 0.08 * scale]} />
        <meshStandardMaterial color="#7d5b3f" roughness={0.82} map={textures?.wood} />
      </mesh>
    </group>
  )
}

function CityGateStall({
  position,
  rotation = 0,
  scale = 1,
  textures,
}: {
  position: [number, number, number]
  rotation?: number
  scale?: number
  textures: SceneTextureSet | null
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.22 * scale, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.34 * scale, 0.08 * scale, 0.9 * scale]} />
        <meshStandardMaterial color="#c48e58" roughness={0.78} map={textures?.wood} />
      </mesh>
      {[
        [-0.52, 0.72, -0.26],
        [0.52, 0.72, -0.26],
        [-0.52, 0.72, 0.26],
        [0.52, 0.72, 0.26],
      ].map(([x, y, z]) => (
        <mesh key={`${x}:${z}`} position={[x * scale, y * scale, z * scale]} castShadow>
          <boxGeometry args={[0.08 * scale, 1.02 * scale, 0.08 * scale]} />
          <meshStandardMaterial color="#7d5a3d" roughness={0.82} map={textures?.wood} />
        </mesh>
      ))}
      <mesh position={[0, 1.34 * scale, -0.18 * scale]} rotation={[0.18, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.5 * scale, 0.06 * scale, 0.56 * scale]} />
        <meshStandardMaterial color="#b75f58" roughness={0.82} map={textures?.cloth} />
      </mesh>
      <mesh position={[0, 1.34 * scale, 0.18 * scale]} rotation={[-0.18, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.5 * scale, 0.06 * scale, 0.56 * scale]} />
        <meshStandardMaterial color="#c96e61" roughness={0.82} map={textures?.cloth} />
      </mesh>
      <mesh position={[0, 0.64 * scale, 0.34 * scale]} castShadow receiveShadow>
        <boxGeometry args={[1.14 * scale, 0.14 * scale, 0.08 * scale]} />
        <meshStandardMaterial color="#8d6643" roughness={0.82} map={textures?.wood} />
      </mesh>
      {[-0.26, 0.08, 0.38].map((x, index) => (
        <mesh key={index} position={[x * scale, 0.36 * scale, index === 0 ? 0.02 * scale : -0.08 * scale]} castShadow receiveShadow>
          <boxGeometry args={[0.18 * scale, 0.14 * scale, 0.18 * scale]} />
          <meshStandardMaterial color={index === 1 ? "#b57a49" : "#8a6a47"} roughness={0.82} />
        </mesh>
      ))}
    </group>
  )
}

function CityGateQueueFigure({
  position,
  rotation = 0,
  scale = 1,
  tone = "#d9c7b4",
  cloak = "#8a5a52",
}: {
  position: [number, number, number]
  rotation?: number
  scale?: number
  tone?: string
  cloak?: string
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.04 * scale, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.13 * scale, 0.15 * scale, 0.08 * scale, 12]} />
        <meshStandardMaterial color="#5b5148" roughness={0.78} />
      </mesh>
      <mesh position={[0, 0.36 * scale, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.18 * scale, 0.14 * scale, 0.48 * scale, 12]} />
        <meshStandardMaterial color={cloak} roughness={0.86} />
      </mesh>
      <mesh position={[0, 0.65 * scale, 0.01 * scale]} castShadow receiveShadow>
        <capsuleGeometry args={[0.1 * scale, 0.22 * scale, 3, 10]} />
        <meshStandardMaterial color={tone} roughness={0.88} />
      </mesh>
      <mesh position={[0, 0.93 * scale, 0]} castShadow receiveShadow>
        <sphereGeometry args={[0.11 * scale, 10, 10]} />
        <meshStandardMaterial color="#f4decb" roughness={0.82} />
      </mesh>
      <mesh position={[0.1 * scale, 0.63 * scale, 0.02 * scale]} rotation={[0.2, 0.3, -0.3]} castShadow>
        <boxGeometry args={[0.03 * scale, 0.24 * scale, 0.03 * scale]} />
        <meshStandardMaterial color="#6a4a36" roughness={0.84} />
      </mesh>
    </group>
  )
}

function CityGateAssetSet({
  map,
  palette,
  textures,
}: {
  map: Encounter3DMap
  palette: ReturnType<typeof getThemePalette>
  textures: SceneTextureSet | null
}) {
  const width = map.board.width * map.board.cellSize
  const depth = map.board.depth * map.board.cellSize
  const backZ = -depth * 0.48

  return (
    <group>
      <RoundedBox args={[14.6, 0.48, 0.3]} radius={0.05} smoothness={3} position={[0, 0.24, backZ + 0.04]} castShadow receiveShadow>
        <meshStandardMaterial color="#e9dfd1" roughness={0.88} map={textures?.stone} />
      </RoundedBox>

      {[
        [-6.35, 4.9, 2.32, 10.4],
        [-3.3, 6.05, 2.88, 12.4],
        [3.3, 6.05, 2.88, 12.4],
        [6.35, 4.9, 2.32, 10.4],
      ].map(([x, y, radius, height], index) => (
        <group key={index} position={[x, y, backZ + 0.1]}>
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[radius, radius, height, 24, 1, false, -Math.PI / 2, Math.PI]} />
            <meshStandardMaterial color="#efe6d9" roughness={0.88} map={textures?.stone} />
          </mesh>
          <mesh position={[0, height / 2 - 0.18, 0.18]} castShadow receiveShadow>
            <boxGeometry args={[radius * 1.8, 0.28, 0.28]} />
            <meshStandardMaterial color="#faf1e8" roughness={0.82} map={textures?.stone} />
          </mesh>
          <mesh position={[0, -height / 2 + 0.7, 0.18]} castShadow receiveShadow>
            <boxGeometry args={[radius * 1.5, 1.1, 0.24]} />
            <meshStandardMaterial color="#d8cab8" roughness={0.88} map={textures?.stone} />
          </mesh>
        </group>
      ))}

      <RoundedBox args={[9.6, 12.8, 0.36]} radius={0.04} smoothness={3} position={[0, 6.2, backZ]} castShadow receiveShadow>
        <meshStandardMaterial color="#ece2d4" roughness={0.9} map={textures?.stone} />
      </RoundedBox>
      <RoundedBox args={[11.1, 2.3, 0.34]} radius={0.04} smoothness={3} position={[0, 10.45, backZ + 0.03]} castShadow receiveShadow>
        <meshStandardMaterial color="#f5ece1" roughness={0.84} map={textures?.stone} />
      </RoundedBox>
      <RoundedBox args={[3.9, 1.22, 0.3]} radius={0.04} smoothness={3} position={[0, 11.72, backZ + 0.04]} castShadow receiveShadow>
        <meshStandardMaterial color="#e8ddd0" roughness={0.84} map={textures?.stone} />
      </RoundedBox>
      <RoundedBox args={[7.2, 0.34, 0.24]} radius={0.04} smoothness={2} position={[0, 7.58, backZ + 0.18]} castShadow receiveShadow>
        <meshStandardMaterial color="#f7eee4" roughness={0.82} map={textures?.stone} />
      </RoundedBox>

      <mesh position={[0, 5.72, backZ + 0.19]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[4.05, 4.05, 0.28, 46, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#e2d4c4" roughness={0.84} map={textures?.stone} />
      </mesh>
      <mesh position={[0, 5.18, backZ + 0.24]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <cylinderGeometry args={[3.05, 3.05, 0.38, 40, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color={shiftColor(palette.backdrop, 0.08)} roughness={0.98} side={THREE.BackSide} />
      </mesh>
      <mesh position={[0, 2.75, backZ + 0.28]} receiveShadow castShadow>
        <boxGeometry args={[6.2, 5.6, 0.16]} />
        <meshStandardMaterial color={shiftColor(palette.backdrop, 0.03)} roughness={0.98} />
      </mesh>
      <mesh position={[0, 1.02, backZ + 0.19]} castShadow receiveShadow>
        <boxGeometry args={[8.1, 0.26, 0.18]} />
        <meshStandardMaterial color="#d4c1aa" roughness={0.88} map={textures?.stone} />
      </mesh>
      <mesh position={[0, 0.58, backZ + 0.18]} castShadow receiveShadow>
        <boxGeometry args={[9.5, 0.18, 0.18]} />
        <meshStandardMaterial color="#c7b39d" roughness={0.9} map={textures?.stone} />
      </mesh>

      {[-2.52, 2.52].map((side) => (
        <mesh key={side} position={[side, 3.08, backZ + 0.28]} castShadow receiveShadow>
          <boxGeometry args={[0.48, 6.2, 0.14]} />
          <meshStandardMaterial color="#5d4638" roughness={0.84} map={textures?.wood} />
        </mesh>
      ))}
      {[-2.8, 2.8].map((side) => (
        <mesh key={`door-${side}`} position={[side, 2.28, backZ + 0.22]} castShadow receiveShadow>
          <boxGeometry args={[0.2, 4.3, 0.08]} />
          <meshStandardMaterial color="#8c694b" roughness={0.82} map={textures?.wood} />
        </mesh>
      ))}

      {[-3.86, -2.94, -2.02, 2.02, 2.94, 3.86].map((x) => (
        <mesh key={`rail-${x}`} position={[x, 0.86, backZ + 0.26]} castShadow receiveShadow>
          <boxGeometry args={[0.12, 0.72, 0.08]} />
          <meshStandardMaterial color="#d8c7b2" roughness={0.86} map={textures?.stone} />
        </mesh>
      ))}

      {[-6.1, -3.45, -1.08, 1.08, 3.45, 6.1].map((x) => (
        <RoundedBox key={x} args={[0.42, 0.42, 0.18]} radius={0.03} smoothness={2} position={[x, 11.72, backZ + 0.12]} castShadow receiveShadow>
          <meshStandardMaterial color={shiftColor(palette.edge, 0.08)} roughness={0.84} map={textures?.stone} />
        </RoundedBox>
      ))}

      {[
        [-5.85, 6.3, 1.14, 5.4],
        [-3.18, 6.85, 1.36, 6.2],
        [3.18, 6.85, 1.36, 6.2],
        [5.85, 6.3, 1.14, 5.4],
      ].map(([x, y, widthSize, heightSize], index) => (
        <mesh key={index} position={[x, y, backZ + 0.16]} castShadow receiveShadow>
          <planeGeometry args={[widthSize, heightSize]} />
          <meshStandardMaterial color="#b15d55" side={THREE.DoubleSide} roughness={0.84} map={textures?.cloth} />
        </mesh>
      ))}

      {[-1.92, -0.92, 0.92, 1.92].map((x) => (
        <mesh key={x} position={[x, 7.38, backZ + 0.16]} castShadow receiveShadow>
          <planeGeometry args={[0.92, 4.5]} />
          <meshStandardMaterial color="#a9554f" side={THREE.DoubleSide} roughness={0.84} map={textures?.cloth} />
        </mesh>
      ))}

      <RoundedBox args={[6.6, 0.18, 3.0]} radius={0.04} smoothness={2} position={[0.4, 0.09, -0.35]} castShadow receiveShadow>
        <meshStandardMaterial color="#b89162" roughness={0.82} map={textures?.dirt} />
      </RoundedBox>
      <RoundedBox args={[4.9, 0.14, 2.2]} radius={0.04} smoothness={2} position={[0.36, 0.2, -0.18]} castShadow receiveShadow>
        <meshStandardMaterial color="#dcc4a2" roughness={0.82} map={textures?.dirt} />
      </RoundedBox>
      <RoundedBox args={[2.1, 0.12, 1.02]} radius={0.04} smoothness={2} position={[-2.65, 0.11, 1.54]} castShadow receiveShadow>
        <meshStandardMaterial color="#d9c2a2" roughness={0.82} map={textures?.dirt} />
      </RoundedBox>
      <RoundedBox args={[2.8, 0.12, 1.18]} radius={0.04} smoothness={2} position={[3.4, 0.11, 1.04]} castShadow receiveShadow>
        <meshStandardMaterial color="#d9c2a2" roughness={0.82} map={textures?.dirt} />
      </RoundedBox>

      <RoundedBox args={[2.55, 0.18, 1.42]} radius={0.05} smoothness={2} position={[-2.8, 0.09, 0.96]} castShadow receiveShadow>
        <meshStandardMaterial color="#d1b58e" roughness={0.8} map={textures?.dirt} />
      </RoundedBox>
      <RoundedBox args={[2.7, 0.18, 1.4]} radius={0.05} smoothness={2} position={[3.35, 0.09, 0.54]} castShadow receiveShadow>
        <meshStandardMaterial color="#d1b58e" roughness={0.8} map={textures?.dirt} />
      </RoundedBox>

      <CityGateDesk position={[-1.05, 0, 0.18]} rotation={0.04} scale={1.04} textures={textures} />
      <CityGateDesk position={[1.95, 0, -0.1]} rotation={-0.1} scale={1.12} textures={textures} ledger />

      <CityGateWagon position={[-4.6, 0, 1.52]} rotation={0.12} scale={1.16} textures={textures} />
      <CityGateWagon position={[-3.3, 0, 0.88]} rotation={0.04} scale={0.98} textures={textures} canopy={false} />
      <CityGateWagon position={[4.35, 0, 1.22]} rotation={-0.16} scale={1.06} textures={textures} canopy={false} />
      <CityGateWagon position={[3.1, 0, 0.64]} rotation={-0.04} scale={0.92} textures={textures} />

      <CityGateStall position={[-2.45, 0, 1.2]} rotation={0.06} scale={1.18} textures={textures} />
      <CityGateStall position={[-1.35, 0, 0.52]} rotation={-0.08} scale={0.98} textures={textures} />
      <CityGateStall position={[2.7, 0, 0.96]} rotation={-0.12} scale={1.04} textures={textures} />
      <CityGateStall position={[4.05, 0, 1.42]} rotation={-0.02} scale={1.08} textures={textures} />

      {[
        [-4.85, 0, 2.22],
        [4.56, 0, 1.92],
        [3.28, 0, 1.38],
      ].map(([x, y, z], index) => (
        <group key={index} position={[x, y, z]}>
          <mesh position={[0, -0.32, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.24, 0.08, 0.24]} />
            <meshStandardMaterial color="#d5c4ac" roughness={0.86} map={textures?.stone} />
          </mesh>
          <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.08, 0.92, 0.08]} />
            <meshStandardMaterial color="#74553d" roughness={0.84} map={textures?.wood} />
          </mesh>
          <mesh position={[0.14, 0.34, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.28, 0.06, 0.06]} />
            <meshStandardMaterial color="#74553d" roughness={0.84} map={textures?.wood} />
          </mesh>
        </group>
      ))}

      {[
        [-3.18, 0, 0.64],
        [-2.86, 0, 0.34],
        [2.78, 0, 0.32],
        [3.12, 0, 0.48],
        [3.46, 0, 0.66],
      ].map(([x, y, z], index) => (
        <group key={index} position={[x, y, z]}>
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[0.24, 0.28, 0.56, 14]} />
            <meshStandardMaterial color="#b67f4b" roughness={0.78} map={textures?.wood} />
          </mesh>
          {[-0.16, 0, 0.16].map((yy) => (
            <mesh key={yy} position={[0, yy, 0]} castShadow>
              <torusGeometry args={[0.25, 0.018, 8, 16]} />
              <meshStandardMaterial color="#4f3a2a" roughness={0.7} metalness={0.18} />
            </mesh>
          ))}
        </group>
      ))}

      {[-1.3, 1.3].map((x) => (
        <group key={x} position={[x, 0, -0.34]}>
          <mesh position={[0, -0.48, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.22, 0.24, 0.14, 14]} />
            <meshStandardMaterial color="#4f4438" roughness={0.72} metalness={0.18} map={textures?.metal} />
          </mesh>
          <mesh castShadow>
            <cylinderGeometry args={[0.08, 0.08, 1.24, 10]} />
            <meshStandardMaterial color="#5f4330" roughness={0.62} metalness={0.2} map={textures?.metal} />
          </mesh>
          <mesh position={[0, 0.68, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.21, 0.18, 12]} />
            <meshStandardMaterial color="#3a2a1b" roughness={0.46} metalness={0.2} />
          </mesh>
          <mesh position={[0, 0.86, 0]} castShadow>
            <sphereGeometry args={[0.17, 10, 10]} />
            <meshPhysicalMaterial emissive="#ff9e00" emissiveIntensity={2.5} color="#ffd166" toneMapped={false} clearcoat={0.5} roughness={0.18} />
          </mesh>
          <pointLight position={[0, 0.9, 0]} intensity={3.1} distance={6.2} decay={2} color="#ffb703" />
        </group>
      ))}

      {[
        [-2.05, 0, 1.46, 0.06, "#d0c1b1", "#8a5a52"],
        [-1.45, 0, 1.18, 0.02, "#c7b6a0", "#48617a"],
        [-0.84, 0, 0.9, -0.05, "#b8a38e", "#6d6f49"],
        [-0.1, 0, 0.6, 0.08, "#d7c8b9", "#7a4f5f"],
        [0.72, 0, 0.34, -0.02, "#c9b8a7", "#6b4b35"],
        [1.5, 0, 0.08, 0.05, "#bba998", "#5b6174"],
        [2.18, 0, 0.44, -0.16, "#d5c5b3", "#7e6449"],
        [2.72, 0, 0.96, -0.1, "#ccb7a2", "#87644e"],
      ].map(([x, y, z, rotation, tone, cloak], index) => (
        <CityGateQueueFigure
          key={index}
          position={[x as number, y as number, z as number]}
          rotation={rotation as number}
          scale={1.16}
          tone={tone as string}
          cloak={cloak as string}
        />
      ))}
    </group>
  )
}

function SceneBackdrop({
  map,
  palette,
  textures,
}: {
  map: Encounter3DMap
  palette: ReturnType<typeof getThemePalette>
  textures: SceneTextureSet | null
}) {
  const width = map.board.width * map.board.cellSize
  const depth = map.board.depth * map.board.cellSize
  const backZ = -depth * 0.66
  const wallColor = shiftColor(palette.backdrop, 0.1)

  return (
    <group>
      <mesh position={[0, 7, backZ]} receiveShadow>
        <planeGeometry args={[width * 2.2, depth * 1.6]} />
        <meshStandardMaterial color={shiftColor(palette.backdrop, 0.12)} roughness={1} side={THREE.DoubleSide} />
      </mesh>

      <mesh position={[0, -0.45, -depth * 0.2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width * 2.2, depth * 2]} />
        <meshStandardMaterial color={shiftColor(palette.backdrop, 0.06)} roughness={1} />
      </mesh>

      {map.sceneKit === "city_gate" ? (
        null
      ) : map.sceneKit === "checkpoint" ? (
        <>
          <RoundedBox args={[2.7, 6.2, 2.2]} radius={0.12} smoothness={3} position={[-width * 0.34, 2.55, backZ + 1.15]} castShadow receiveShadow>
            <meshStandardMaterial color="#f2ece3" roughness={0.9} map={textures?.stone} />
          </RoundedBox>
          <RoundedBox args={[2.7, 6.2, 2.2]} radius={0.12} smoothness={3} position={[width * 0.34, 2.55, backZ + 1.15]} castShadow receiveShadow>
            <meshStandardMaterial color="#f2ece3" roughness={0.9} map={textures?.stone} />
          </RoundedBox>
          <RoundedBox args={[width * 0.38, 1.5, 1.2]} radius={0.08} smoothness={3} position={[0, 4.15, backZ + 1.02]} castShadow receiveShadow>
            <meshStandardMaterial color="#faf4eb" roughness={0.84} map={textures?.stone} />
          </RoundedBox>
          <RoundedBox args={[width * 0.16, 3.2, 0.8]} radius={0.06} smoothness={2} position={[0, 1.6, backZ + 1.52]} castShadow receiveShadow>
            <meshStandardMaterial color={shiftColor(palette.edge, -0.05)} roughness={0.96} />
          </RoundedBox>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * width * 0.1, 1.24, backZ + 1.57]} rotation={[0, side * 0.1, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.1, 2.2, 1.02]} />
              <meshStandardMaterial color="#594536" roughness={0.88} map={textures?.wood} />
            </mesh>
          ))}
          {[-1.12, -0.38, 0.38, 1.12].map((offset) => (
            <RoundedBox key={offset} args={[0.46, 0.46, 0.58]} radius={0.04} smoothness={2} position={[offset * width * 0.15, 5.05, backZ + 1.05]} castShadow receiveShadow>
              <meshStandardMaterial color={shiftColor(wallColor, 0.08)} roughness={0.84} map={textures?.stone} />
            </RoundedBox>
          ))}
          {[-1, 1].flatMap((side) =>
            [-0.65, 0.65].map((zOffset) => (
              <RoundedBox
                key={`${side}:${zOffset}`}
                args={[0.32, 4.3, 0.34]}
                radius={0.04}
                smoothness={2}
                position={[side * (width * 0.34 + 1.02), 1.95, backZ + 1.15 + zOffset]}
                castShadow
                receiveShadow
              >
                <meshStandardMaterial color="#e6dfd5" roughness={0.9} map={textures?.stone} />
              </RoundedBox>
            ))
          )}
        </>
      ) : map.board.theme === "cavern" ? (
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
          <RoundedBox args={[2.5, 5.7, 1.9]} radius={0.12} smoothness={3} position={[-width * 0.34, 2.35, backZ + 1.2]} castShadow receiveShadow>
            <meshStandardMaterial color="#f3eee4" roughness={0.92} map={textures?.stone} />
          </RoundedBox>
          <RoundedBox args={[2.5, 5.7, 1.9]} radius={0.12} smoothness={3} position={[width * 0.34, 2.35, backZ + 1.2]} castShadow receiveShadow>
            <meshStandardMaterial color="#f3eee4" roughness={0.92} map={textures?.stone} />
          </RoundedBox>
          <RoundedBox args={[width * 0.34, 1.2, 1.35]} radius={0.08} smoothness={3} position={[0, 4.02, backZ + 1.05]} castShadow receiveShadow>
            <meshStandardMaterial color="#faf5ec" roughness={0.9} map={textures?.stone} />
          </RoundedBox>
          {[-1.15, -0.45, 0.45, 1.15].map((offset) => (
            <RoundedBox key={offset} args={[0.42, 0.42, 0.55]} radius={0.04} smoothness={2} position={[offset * width * 0.16, 4.82, backZ + 1.06]} castShadow receiveShadow>
              <meshStandardMaterial color={shiftColor(wallColor, 0.1)} roughness={0.86} />
            </RoundedBox>
          ))}
          {[-1, 1].map((side) => (
            <RoundedBox key={side} args={[0.55, 2.2, 0.6]} radius={0.06} smoothness={2} position={[side * width * 0.17, 1.15, backZ + 1.45]} castShadow receiveShadow>
              <meshStandardMaterial color={shiftColor(wallColor, -0.05)} roughness={0.92} map={textures?.stone} />
            </RoundedBox>
          ))}
        </>
      )}
    </group>
  )
}

function TerrainMesh({
  item,
  theme,
  sceneKit,
  textures,
}: {
  item: Encounter3DMap["terrain"][number]
  theme: Encounter3DMap["board"]["theme"]
  sceneKit: Encounter3DMap["sceneKit"]
  textures: SceneTextureSet | null
}) {
  const color =
    item.kind === "water"
      ? item.color || "#2a6f97"
      : item.kind === "pit"
        ? item.color || "#2d1e1e"
        : item.color || "#7a746b"
  const outline = shiftColor(color, -0.18)
  const surfaceTexture = getSurfaceTexture(textures, theme)
  const stoneTexture = textures?.stone
  const isCheckpointTower = sceneKit === "checkpoint" && (item.id.includes("checkpoint-tower") || item.label?.toLowerCase().includes("tower"))
  const isCheckpointBridge = sceneKit === "checkpoint" && item.id.includes("checkpoint-bridge")
  const isCheckpointPlatform = sceneKit === "checkpoint" && item.id.includes("checkpoint-platform")
  const isCityGateTower = sceneKit === "city_gate" && item.id.includes("city-gate-tower")
  const isCityGateBridge = sceneKit === "city_gate" && item.id.includes("city-gate-bridge")
  const isCityGatePlatform = sceneKit === "city_gate" && item.id.includes("city-gate-platform")
  const isCityGateMarketPad = sceneKit === "city_gate" && item.id.includes("city-gate-market")

  if (item.kind === "water") {
    return (
      <group position={[item.x, item.y, item.z]} rotation={[0, item.rotation, 0]}>
        <RoundedBox args={[item.width, 0.18, item.depth]} radius={0.08} smoothness={3} position={[0, 0.09, 0]} receiveShadow>
          <meshStandardMaterial color="#f2eee7" roughness={0.95} map={stoneTexture} />
          <Edges scale={1.004} color={outline} />
        </RoundedBox>
        <mesh position={[0, item.height / 2 + 0.09, 0]} receiveShadow>
          <boxGeometry args={[Math.max(item.width - 0.2, 0.3), item.height, Math.max(item.depth - 0.2, 0.3)]} />
          <meshPhysicalMaterial color={color} roughness={0.12} metalness={0} transmission={0.25} thickness={0.4} clearcoat={0.45} transparent opacity={0.9} />
        </mesh>
      </group>
    )
  }

  if (item.kind === "pit") {
    return (
      <group position={[item.x, item.y, item.z]} rotation={[0, item.rotation, 0]}>
        <RoundedBox args={[item.width, 0.22, item.depth]} radius={0.08} smoothness={3} position={[0, 0.11, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#ece7df" roughness={0.96} map={stoneTexture} />
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
    if (isCityGatePlatform) {
      return (
        <group position={[item.x, item.y, item.z]} rotation={[0, item.rotation, 0]}>
          <RoundedBox args={[item.width, item.height * 0.6, item.depth]} radius={0.08} smoothness={3} position={[0, item.height * 0.3, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#efe6d8" roughness={0.9} map={stoneTexture} />
            <Edges scale={1.004} color={outline} />
          </RoundedBox>
          <RoundedBox
            args={[Math.max(item.width - 0.24, 0.45), item.height * 0.16, Math.max(item.depth - 0.24, 0.45)]}
            radius={0.05}
            smoothness={2}
            position={[0, item.height * 0.72, 0]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color="#faf5ec" roughness={0.82} map={stoneTexture} />
          </RoundedBox>
          {[-0.36, 0.36].map((side) => (
            <RoundedBox key={side} args={[0.22, 0.22, 0.48]} radius={0.03} smoothness={2} position={[side * item.width, item.height * 0.76, 0]} castShadow receiveShadow>
              <meshStandardMaterial color="#ddd4c8" roughness={0.86} map={stoneTexture} />
            </RoundedBox>
          ))}
        </group>
      )
    }

    if (isCheckpointPlatform) {
      return (
        <group position={[item.x, item.y, item.z]} rotation={[0, item.rotation, 0]}>
          <RoundedBox args={[item.width, item.height * 0.52, item.depth]} radius={0.08} smoothness={3} position={[0, item.height * 0.26, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#efe6d8" roughness={0.9} map={stoneTexture} />
            <Edges scale={1.004} color={outline} />
          </RoundedBox>
          <RoundedBox
            args={[Math.max(item.width - 0.26, 0.45), item.height * 0.18, Math.max(item.depth - 0.26, 0.45)]}
            radius={0.05}
            smoothness={2}
            position={[0, item.height * 0.64, 0]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color="#d9b582" roughness={0.74} map={textures?.wood} />
          </RoundedBox>
          {[-0.32, 0.32].map((side) => (
            <mesh key={side} position={[side * item.width, item.height * 0.58, -item.depth * 0.22]} castShadow receiveShadow>
              <boxGeometry args={[0.08, item.height * 0.55, 0.08]} />
              <meshStandardMaterial color="#5b4330" roughness={0.86} map={textures?.wood} />
            </mesh>
          ))}
        </group>
      )
    }

    return (
      <group position={[item.x, item.y, item.z]} rotation={[0, item.rotation, 0]}>
        <RoundedBox args={[item.width, item.height * 0.45, item.depth]} radius={0.08} smoothness={3} position={[0, item.height * 0.225, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#f0ebe3" roughness={0.88} map={stoneTexture} />
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
          <meshStandardMaterial color="#ffffff" roughness={0.84} map={surfaceTexture} />
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
          <meshStandardMaterial color="#fcf8f0" roughness={0.8} metalness={0.05} map={surfaceTexture} />
          <Edges scale={1.003} color={shiftColor(outline, 0.08)} />
        </RoundedBox>
      </group>
    )
  }

  if (item.kind === "wall") {
    if (isCityGateTower) {
      return (
        <group position={[item.x, item.y, item.z]} rotation={[0, item.rotation, 0]}>
          <RoundedBox args={[item.width + 0.2, 0.34, item.depth + 0.2]} radius={0.08} smoothness={3} position={[0, 0.17, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#e7e0d6" roughness={0.9} map={stoneTexture} />
          </RoundedBox>
          <RoundedBox args={[item.width, item.height, item.depth]} radius={0.08} smoothness={3} position={[0, item.height / 2, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#f5efe7" roughness={0.84} map={stoneTexture} />
            <Edges scale={1.004} color={outline} />
          </RoundedBox>
          {[-1, 1].flatMap((side) =>
            [-1, 1].map((depthSide) => (
              <RoundedBox
                key={`${side}:${depthSide}`}
                args={[0.28, item.height + 0.3, 0.28]}
                radius={0.04}
                smoothness={2}
                position={[side * (item.width / 2 - 0.22), item.height / 2 + 0.05, depthSide * (item.depth / 2 - 0.22)]}
                castShadow
                receiveShadow
              >
                <meshStandardMaterial color="#ddd4c8" roughness={0.88} map={stoneTexture} />
              </RoundedBox>
            ))
          )}
          {[-0.55, 0, 0.55].map((offset) => (
            <RoundedBox key={offset} args={[0.38, 0.26, item.depth + 0.24]} radius={0.04} smoothness={2} position={[offset * item.width, item.height + 0.22, 0]} castShadow receiveShadow>
              <meshStandardMaterial color="#d2c7b9" roughness={0.84} map={stoneTexture} />
            </RoundedBox>
          ))}
          {item.id.includes("arch") ? (
            <mesh position={[0, 1.24, item.depth / 2 + 0.02]} castShadow receiveShadow>
              <boxGeometry args={[item.width * 0.44, 2.2, 0.08]} />
              <meshStandardMaterial color="#594536" roughness={0.88} map={textures?.wood} />
            </mesh>
          ) : null}
        </group>
      )
    }

    if (isCheckpointTower) {
      return (
        <group position={[item.x, item.y, item.z]} rotation={[0, item.rotation, 0]}>
          <RoundedBox args={[item.width + 0.18, 0.32, item.depth + 0.18]} radius={0.08} smoothness={3} position={[0, 0.16, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#e7e0d6" roughness={0.9} map={stoneTexture} />
          </RoundedBox>
          <RoundedBox args={[item.width, item.height, item.depth]} radius={0.08} smoothness={3} position={[0, item.height / 2, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#f5efe7" roughness={0.84} map={stoneTexture} />
            <Edges scale={1.004} color={outline} />
          </RoundedBox>
          {[-1, 1].flatMap((side) =>
            [-1, 1].map((depthSide) => (
              <RoundedBox
                key={`${side}:${depthSide}`}
                args={[0.24, item.height + 0.25, 0.24]}
                radius={0.04}
                smoothness={2}
                position={[side * (item.width / 2 - 0.18), item.height / 2 + 0.03, depthSide * (item.depth / 2 - 0.18)]}
                castShadow
                receiveShadow
              >
                <meshStandardMaterial color="#ddd4c8" roughness={0.88} map={stoneTexture} />
              </RoundedBox>
            ))
          )}
          {[-0.48, 0, 0.48].map((offset) => (
            <RoundedBox key={offset} args={[0.34, 0.22, item.depth + 0.18]} radius={0.04} smoothness={2} position={[offset * item.width, item.height + 0.2, 0]} castShadow receiveShadow>
              <meshStandardMaterial color="#d2c7b9" roughness={0.84} map={stoneTexture} />
            </RoundedBox>
          ))}
          <mesh position={[0, 1.1, item.depth / 2 + 0.02]} castShadow receiveShadow>
            <boxGeometry args={[item.width * 0.42, 1.75, 0.06]} />
            <meshStandardMaterial color="#594536" roughness={0.88} map={textures?.wood} />
          </mesh>
        </group>
      )
    }

    const isWideWall = Math.max(item.width, item.depth) > 2.4
    const capCount = Math.min(4, Math.max(2, Math.round(Math.max(item.width, item.depth) / 1.6)))
    const capOffsets = isWideWall
      ? Array.from({ length: capCount }, (_, index) => {
          const distance = Math.max(item.width, item.depth) / 2 - 0.35
          const step = capCount === 1 ? 0 : (index / (capCount - 1)) * 2 - 1
          return step * distance
        })
      : []

    return (
      <group position={[item.x, item.y, item.z]} rotation={[0, item.rotation, 0]}>
        <RoundedBox args={[item.width + 0.12, 0.24, item.depth + 0.12]} radius={0.06} smoothness={3} position={[0, 0.12, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#eee9e1" roughness={0.9} map={stoneTexture} />
        </RoundedBox>
        <RoundedBox args={[item.width, item.height, item.depth]} radius={0.08} smoothness={3} position={[0, item.height / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#ffffff" roughness={0.82} map={stoneTexture} />
          <Edges scale={1.004} color={outline} />
        </RoundedBox>
        <RoundedBox args={[item.width + 0.2, 0.14, item.depth + 0.2]} radius={0.05} smoothness={3} position={[0, item.height + 0.07, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#faf5ee" roughness={0.8} metalness={0.04} map={stoneTexture} />
        </RoundedBox>
        {item.height > 1.2 &&
          [-1, 1].map((side) => (
            <RoundedBox
              key={side}
              args={[Math.min(item.width * 0.12, 0.28), Math.max(item.height * 0.7, 0.4), item.depth + 0.12]}
              radius={0.04}
              smoothness={2}
              position={[side * (item.width / 2 - Math.min(item.width * 0.06, 0.14)), item.height * 0.35, 0]}
              castShadow
              receiveShadow
            >
              <meshStandardMaterial color="#e8e2d9" roughness={0.88} map={stoneTexture} />
            </RoundedBox>
          ))}
        {isWideWall &&
          capOffsets.map((offset, index) => (
            <RoundedBox
              key={index}
              args={item.width >= item.depth ? [0.46, 0.22, item.depth + 0.16] : [item.width + 0.16, 0.22, 0.46]}
              radius={0.04}
              smoothness={2}
              position={item.width >= item.depth ? [offset, item.height + 0.22, 0] : [0, item.height + 0.22, offset]}
              castShadow
              receiveShadow
            >
              <meshStandardMaterial color="#ddd5ca" roughness={0.84} map={stoneTexture} />
            </RoundedBox>
          ))}
      </group>
    )
  }

  if (item.kind === "ramp") {
    const stepDepth = item.depth / 4

    if (isCityGateBridge) {
      const plankCount = 6
      return (
        <group position={[item.x, item.y, item.z]} rotation={[0, item.rotation, 0]}>
          {[0, 1, 2, 3].map((step) => (
            <RoundedBox
              key={step}
              args={[item.width, Math.max(item.height / 4, 0.1), stepDepth + 0.05]}
              radius={0.04}
              smoothness={2}
              position={[0, (step + 0.5) * (item.height / 4), -item.depth / 2 + stepDepth * (step + 0.5)]}
              castShadow
              receiveShadow
            >
              <meshStandardMaterial color="#d0c2ad" roughness={0.82} map={stoneTexture} />
              <Edges scale={1.004} color={shiftColor("#7b746a", -0.12)} />
            </RoundedBox>
          ))}
          {Array.from({ length: plankCount }, (_, index) => {
            const z = -item.depth / 2 + 0.18 + (index / (plankCount - 1)) * (item.depth - 0.36)
            const y = 0.16 + (index / (plankCount - 1)) * (item.height - 0.14)
            return (
              <mesh key={index} position={[0, y, z]} castShadow receiveShadow>
                <boxGeometry args={[item.width - 0.2, 0.04, 0.16]} />
                <meshStandardMaterial color="#efeadf" roughness={0.82} map={stoneTexture} />
              </mesh>
            )
          })}
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * (item.width / 2 - 0.16), item.height * 0.52, 0]} rotation={[0.22, 0, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.1, item.height + 0.24, 0.1]} />
              <meshStandardMaterial color="#7a746b" roughness={0.88} />
            </mesh>
          ))}
        </group>
      )
    }

    if (isCheckpointBridge) {
      const plankCount = 5
      return (
        <group position={[item.x, item.y, item.z]} rotation={[0, item.rotation, 0]}>
          {[0, 1, 2, 3].map((step) => (
            <RoundedBox
              key={step}
              args={[item.width, Math.max(item.height / 4, 0.1), stepDepth + 0.04]}
              radius={0.04}
              smoothness={2}
              position={[0, (step + 0.5) * (item.height / 4), -item.depth / 2 + stepDepth * (step + 0.5)]}
              castShadow
              receiveShadow
            >
              <meshStandardMaterial color="#c99761" roughness={0.76} map={textures?.wood} />
              <Edges scale={1.004} color={shiftColor("#7b5330", -0.08)} />
            </RoundedBox>
          ))}
          {Array.from({ length: plankCount }, (_, index) => {
            const z = -item.depth / 2 + 0.18 + (index / (plankCount - 1)) * (item.depth - 0.36)
            const y = 0.16 + (index / (plankCount - 1)) * (item.height - 0.14)
            return (
              <mesh key={index} position={[0, y, z]} castShadow receiveShadow>
                <boxGeometry args={[item.width - 0.24, 0.04, 0.18]} />
                <meshStandardMaterial color="#e0b27a" roughness={0.72} map={textures?.wood} />
              </mesh>
            )
          })}
          {[-1, 1].map((side) => (
            <group key={side} position={[side * (item.width / 2 - 0.14), item.height * 0.56, 0]}>
              <mesh rotation={[0.32, 0, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.08, item.height + 0.34, 0.08]} />
                <meshStandardMaterial color="#5b4330" roughness={0.86} map={textures?.wood} />
              </mesh>
            </group>
          ))}
        </group>
      )
    }
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
            <meshStandardMaterial color={step % 2 === 0 ? "#ffffff" : "#f4efe6"} roughness={0.88} map={surfaceTexture} />
            <Edges scale={1.004} color={outline} />
          </RoundedBox>
        ))}
      </group>
    )
  }

  return (
    <group position={[item.x, item.y, item.z]} rotation={[0, item.rotation, 0]}>
      <RoundedBox args={[item.width, item.height, item.depth]} radius={0.08} smoothness={3} position={[0, item.height / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#ffffff" roughness={0.84} metalness={0.04} map={surfaceTexture} />
        <Edges scale={1.004} color={outline} />
      </RoundedBox>
      {isCityGateMarketPad ? (
        <>
          <mesh position={[0, item.height + 0.07, 0]} castShadow receiveShadow>
            <boxGeometry args={[Math.max(item.width - 0.18, 0.3), 0.05, Math.max(item.depth - 0.18, 0.3)]} />
            <meshStandardMaterial color="#ece1cf" roughness={0.8} map={surfaceTexture} />
          </mesh>
          <mesh position={[0, item.height + 0.14, 0]} castShadow receiveShadow>
            <boxGeometry args={[Math.max(item.width - 0.42, 0.2), 0.04, Math.max(item.depth - 0.42, 0.2)]} />
            <meshStandardMaterial color="#d7b582" roughness={0.76} map={textures?.wood} />
          </mesh>
        </>
      ) : null}
      <RoundedBox
        args={[Math.max(item.width - 0.2, 0.3), Math.max(item.height * 0.18, 0.08), Math.max(item.depth - 0.2, 0.3)]}
        radius={0.05}
        smoothness={3}
        position={[0, item.height + Math.max(item.height * 0.09, 0.04), 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#faf5ee" roughness={0.78} metalness={0.04} map={surfaceTexture} />
      </RoundedBox>
    </group>
  )
}

function PropMesh({
  item,
  theme,
  sceneKit,
  textures,
}: {
  item: Encounter3DMap["props"][number]
  theme: Encounter3DMap["board"]["theme"]
  sceneKit: Encounter3DMap["sceneKit"]
  textures: SceneTextureSet | null
}) {
  const position: [number, number, number] = [item.x, item.y + 0.5 * item.scale, item.z]
  const groundTexture = getSurfaceTexture(textures, theme)
  const isCheckpointBanner = sceneKit === "checkpoint" && item.id.includes("checkpoint-banner")
  const isCheckpointTable = sceneKit === "checkpoint" && item.id.includes("checkpoint-table")
  const isCityGateBanner = sceneKit === "city_gate" && item.id.includes("city-gate-banner")
  const isCityGateTable = sceneKit === "city_gate" && item.id.includes("city-gate-guard-table")
  const isCityGateTorch = sceneKit === "city_gate" && item.id.includes("city-gate-torch")
  const renderCrate = (offset: [number, number, number], scale: number, tone = "#f0c993") => (
    <group position={offset}>
      <RoundedBox args={[0.8 * scale, 0.8 * scale, 0.8 * scale]} radius={0.04} smoothness={2} castShadow receiveShadow>
        <meshStandardMaterial color={tone} roughness={0.76} map={textures?.wood} />
      </RoundedBox>
      {[
        [0, 0, 0.41, 0.72, 0.08, 0.05],
        [0, 0, -0.41, 0.72, 0.08, 0.05],
        [0.41, 0, 0, 0.05, 0.08, 0.72],
        [-0.41, 0, 0, 0.05, 0.08, 0.72],
      ].map(([x, y, z, sizeX, sizeY, sizeZ], index) => (
        <mesh key={index} position={[x * scale, y * scale, z * scale]} castShadow>
          <boxGeometry args={[sizeX * scale, sizeY * scale, sizeZ * scale]} />
          <meshStandardMaterial color="#4b2d12" roughness={0.84} />
        </mesh>
      ))}
      <mesh position={[0, 0.42 * scale, 0]} castShadow>
        <boxGeometry args={[0.72 * scale, 0.05 * scale, 0.72 * scale]} />
        <meshStandardMaterial color="#4b2d12" />
      </mesh>
    </group>
  )

  switch (item.kind) {
    case "pillar":
      return (
        <group position={position} rotation={[0, item.rotation, 0]}>
          <mesh position={[0, -0.88 * item.scale, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.56 * item.scale, 0.62 * item.scale, 0.18 * item.scale, 18]} />
            <meshStandardMaterial color="#efeae1" roughness={0.88} map={textures?.stone} />
          </mesh>
          <mesh position={[0, -0.05 * item.scale, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.28 * item.scale, 0.36 * item.scale, 1.9 * item.scale, 18]} />
            <meshStandardMaterial color="#faf4ea" roughness={0.78} map={textures?.stone} />
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
      if (isCityGateTorch) {
        return (
          <group position={position} rotation={[0, item.rotation, 0]}>
            <mesh position={[0, -0.46 * item.scale, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.24 * item.scale, 0.28 * item.scale, 0.16 * item.scale, 14]} />
              <meshStandardMaterial color="#585046" roughness={0.7} metalness={0.18} map={textures?.metal} />
            </mesh>
            <mesh castShadow>
              <cylinderGeometry args={[0.08 * item.scale, 0.08 * item.scale, 1.35 * item.scale, 10]} />
              <meshStandardMaterial color="#5f4330" roughness={0.7} metalness={0.16} map={textures?.metal} />
            </mesh>
            <mesh position={[0, 0.72 * item.scale, 0]} castShadow>
              <cylinderGeometry args={[0.18 * item.scale, 0.24 * item.scale, 0.2 * item.scale, 12]} />
              <meshStandardMaterial color="#3a2a1b" roughness={0.46} metalness={0.2} />
            </mesh>
            <mesh position={[0, 0.95 * item.scale, 0]} castShadow>
              <sphereGeometry args={[0.19 * item.scale, 10, 10]} />
              <meshPhysicalMaterial emissive="#ff9e00" emissiveIntensity={2.7} color="#ffd166" toneMapped={false} clearcoat={0.5} roughness={0.18} />
            </mesh>
            <pointLight position={[0, 1 * item.scale, 0]} intensity={3.3} distance={6.6} decay={2} color="#ffb703" />
          </group>
        )
      }

      return (
        <group position={position} rotation={[0, item.rotation, 0]}>
          <mesh position={[0, -0.48 * item.scale, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.22 * item.scale, 0.24 * item.scale, 0.14 * item.scale, 14]} />
            <meshStandardMaterial color="#4f4438" roughness={0.72} metalness={0.18} map={textures?.metal} />
          </mesh>
          <mesh castShadow>
            <cylinderGeometry args={[0.08 * item.scale, 0.08 * item.scale, 1.2 * item.scale, 10]} />
            <meshStandardMaterial color={item.color || "#5f4330"} roughness={0.62} metalness={0.2} map={textures?.metal} />
          </mesh>
          <mesh position={[0, 0.66 * item.scale, 0]} castShadow>
            <cylinderGeometry args={[0.16 * item.scale, 0.21 * item.scale, 0.18 * item.scale, 12]} />
            <meshStandardMaterial color="#3a2a1b" roughness={0.46} metalness={0.2} />
          </mesh>
          <mesh position={[0, 0.84 * item.scale, 0]} castShadow>
            <sphereGeometry args={[0.17 * item.scale, 10, 10]} />
            <meshPhysicalMaterial emissive="#ff9e00" emissiveIntensity={2.5} color="#ffd166" toneMapped={false} clearcoat={0.5} roughness={0.18} />
          </mesh>
          <pointLight position={[0, 0.9 * item.scale, 0]} intensity={3.1} distance={6.2} decay={2} color="#ffb703" />
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
            <meshStandardMaterial color="#e8f0e1" roughness={0.98} map={textures?.dirt} />
            </mesh>
          ))}
          <mesh position={[0.08 * item.scale, 0.5 * item.scale, 0]} rotation={[0.15, 0.1, -0.1]} castShadow>
            <cylinderGeometry args={[0.05 * item.scale, 0.08 * item.scale, 0.5 * item.scale, 8]} />
            <meshStandardMaterial color="#69492f" roughness={1} />
          </mesh>
        </group>
      )
    case "post":
      return (
        <group position={position} rotation={[0, item.rotation, 0]}>
          <mesh position={[0, -0.34 * item.scale, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.24 * item.scale, 0.08 * item.scale, 0.24 * item.scale]} />
            <meshStandardMaterial color="#d5c4ac" roughness={0.86} map={textures?.stone} />
          </mesh>
          <mesh position={[0, 0.18 * item.scale, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.08 * item.scale, 0.92 * item.scale, 0.08 * item.scale]} />
            <meshStandardMaterial color="#74553d" roughness={0.84} map={textures?.wood} />
          </mesh>
          <mesh position={[0.14 * item.scale, 0.34 * item.scale, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.28 * item.scale, 0.06 * item.scale, 0.06 * item.scale]} />
            <meshStandardMaterial color="#74553d" roughness={0.84} map={textures?.wood} />
          </mesh>
        </group>
      )
    case "barrel":
      return (
        <group position={position} rotation={[0, item.rotation, 0]}>
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[0.24 * item.scale, 0.28 * item.scale, 0.56 * item.scale, 14]} />
            <meshStandardMaterial color="#b67f4b" roughness={0.78} map={textures?.wood} />
          </mesh>
          {[-0.16, 0, 0.16].map((y) => (
            <mesh key={y} position={[0, y * item.scale, 0]} castShadow>
              <torusGeometry args={[0.25 * item.scale, 0.018 * item.scale, 8, 16]} />
              <meshStandardMaterial color="#4f3a2a" roughness={0.7} metalness={0.18} />
            </mesh>
          ))}
        </group>
      )
    case "wagon":
      return (
        <group position={position} rotation={[0, item.rotation, 0]}>
          <mesh position={[0, 0.18 * item.scale, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.58 * item.scale, 0.26 * item.scale, 0.94 * item.scale]} />
            <meshStandardMaterial color="#bc8450" roughness={0.78} map={textures?.wood} />
          </mesh>
          <mesh position={[0, 0.46 * item.scale, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.34 * item.scale, 0.06 * item.scale, 0.8 * item.scale]} />
            <meshStandardMaterial color="#d5b385" roughness={0.72} map={textures?.wood} />
          </mesh>
          {[
            [0, 0.46, -0.43, 1.34, 0.44, 0.08],
            [0, 0.46, 0.43, 1.34, 0.44, 0.08],
            [-0.63, 0.54, 0, 0.08, 0.58, 0.8],
            [0.63, 0.54, 0, 0.08, 0.58, 0.8],
          ].map(([x, y, z, sizeX, sizeY, sizeZ], index) => (
            <mesh key={index} position={[x * item.scale, y * item.scale, z * item.scale]} castShadow receiveShadow>
              <boxGeometry args={[sizeX * item.scale, sizeY * item.scale, sizeZ * item.scale]} />
              <meshStandardMaterial color="#9d6a3a" roughness={0.78} map={textures?.wood} />
            </mesh>
          ))}
          <mesh position={[0.06 * item.scale, 0.72 * item.scale, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.98 * item.scale, 0.3 * item.scale, 0.56 * item.scale]} />
            <meshStandardMaterial color="#7b553a" roughness={0.84} map={textures?.cloth} />
          </mesh>
          {[
            [-0.52, -0.08, -0.52],
            [0.52, -0.08, -0.52],
            [-0.52, -0.08, 0.52],
            [0.52, -0.08, 0.52],
          ].map(([x, y, z], index) => (
            <mesh key={index} position={[x * item.scale, y * item.scale, z * item.scale]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <torusGeometry args={[0.28 * item.scale, 0.05 * item.scale, 10, 22]} />
              <meshStandardMaterial color="#4f3a2a" roughness={0.72} metalness={0.16} />
            </mesh>
          ))}
          <mesh position={[1.02 * item.scale, 0.02 * item.scale, 0]} rotation={[0, 0, -0.08]} castShadow receiveShadow>
            <boxGeometry args={[0.92 * item.scale, 0.06 * item.scale, 0.08 * item.scale]} />
            <meshStandardMaterial color="#7d5b3f" roughness={0.82} map={textures?.wood} />
          </mesh>
        </group>
      )
    case "stall":
      return (
        <group position={position} rotation={[0, item.rotation, 0]}>
          <mesh position={[0, 0.26 * item.scale, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.36 * item.scale, 0.08 * item.scale, 0.86 * item.scale]} />
            <meshStandardMaterial color="#d6a36f" roughness={0.76} map={textures?.wood} />
          </mesh>
          {[
            [-0.56, 0.72, -0.28],
            [0.56, 0.72, -0.28],
            [-0.56, 0.72, 0.28],
            [0.56, 0.72, 0.28],
          ].map((leg) => (
            <mesh key={leg.join(":")} position={[leg[0] * item.scale, leg[1] * item.scale, leg[2] * item.scale]} castShadow>
              <boxGeometry args={[0.08 * item.scale, 1.0 * item.scale, 0.08 * item.scale]} />
              <meshStandardMaterial color="#815d3f" roughness={0.82} map={textures?.wood} />
            </mesh>
          ))}
          <mesh position={[0, 1.34 * item.scale, -0.18 * item.scale]} rotation={[0.18, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.52 * item.scale, 0.06 * item.scale, 0.52 * item.scale]} />
            <meshStandardMaterial color="#b05d58" roughness={0.82} map={textures?.cloth} />
          </mesh>
          <mesh position={[0, 1.34 * item.scale, 0.18 * item.scale]} rotation={[-0.18, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.52 * item.scale, 0.06 * item.scale, 0.52 * item.scale]} />
            <meshStandardMaterial color="#c06c63" roughness={0.82} map={textures?.cloth} />
          </mesh>
          <mesh position={[0, 0.66 * item.scale, 0.36 * item.scale]} castShadow receiveShadow>
            <boxGeometry args={[1.18 * item.scale, 0.16 * item.scale, 0.1 * item.scale]} />
            <meshStandardMaterial color="#8d6543" roughness={0.82} map={textures?.wood} />
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
              <meshStandardMaterial color="#edf0f3" roughness={0.94} map={textures?.stone} />
            </mesh>
          ))}
        </group>
      )
    case "table":
      if (isCityGateTable) {
        return (
          <group position={position} rotation={[0, item.rotation, 0]}>
            <mesh position={[0, 0.62 * item.scale, 0]} castShadow receiveShadow>
              <boxGeometry args={[1.54 * item.scale, 0.18 * item.scale, 0.88 * item.scale]} />
              <meshStandardMaterial color="#cf9c64" roughness={0.74} map={textures?.wood} />
            </mesh>
            <mesh position={[0, 0.76 * item.scale, 0]} castShadow receiveShadow>
              <boxGeometry args={[1.02 * item.scale, 0.03 * item.scale, 0.52 * item.scale]} />
              <meshStandardMaterial color="#ead9b1" roughness={0.76} map={textures?.cloth} />
            </mesh>
            <mesh position={[0, 1.02 * item.scale, -0.33 * item.scale]} castShadow receiveShadow>
              <boxGeometry args={[1.24 * item.scale, 0.12 * item.scale, 0.12 * item.scale]} />
              <meshStandardMaterial color="#8a623f" roughness={0.82} map={textures?.wood} />
            </mesh>
            {[
              [-0.54, 0.22, -0.29],
              [0.54, 0.22, -0.29],
              [-0.54, 0.22, 0.29],
              [0.54, 0.22, 0.29],
            ].map((leg) => (
              <mesh key={leg.join(":")} position={[leg[0] * item.scale, leg[1] * item.scale, leg[2] * item.scale]} castShadow>
                <boxGeometry args={[0.12 * item.scale, 0.5 * item.scale, 0.12 * item.scale]} />
                <meshStandardMaterial color="#c79359" roughness={0.8} map={textures?.wood} />
              </mesh>
            ))}
            <mesh position={[-0.2 * item.scale, 0.76 * item.scale, 0]} rotation={[0, 0.08, -0.08]} castShadow>
              <boxGeometry args={[0.22 * item.scale, 0.04 * item.scale, 0.44 * item.scale]} />
              <meshStandardMaterial color="#f8f3ea" roughness={0.72} />
            </mesh>
            <mesh position={[0.3 * item.scale, 0.72 * item.scale, -0.06 * item.scale]} castShadow>
              <boxGeometry args={[0.2 * item.scale, 0.18 * item.scale, 0.2 * item.scale]} />
              <meshStandardMaterial color="#5e4638" roughness={0.82} />
            </mesh>
            <mesh position={[-0.44 * item.scale, 0.74 * item.scale, 0.08 * item.scale]} castShadow rotation={[0, 0, -0.06]}>
              <boxGeometry args={[0.16 * item.scale, 0.16 * item.scale, 0.22 * item.scale]} />
              <meshStandardMaterial color="#7b553d" roughness={0.82} />
            </mesh>
          </group>
        )
      }

      if (isCheckpointTable) {
        return (
          <group position={position} rotation={[0, item.rotation, 0]}>
            <mesh position={[0, 0.52 * item.scale, 0]} castShadow receiveShadow>
              <boxGeometry args={[1.36 * item.scale, 0.18 * item.scale, 0.82 * item.scale]} />
              <meshStandardMaterial color="#d9a86f" roughness={0.74} map={textures?.wood} />
            </mesh>
            <mesh position={[0, 0.63 * item.scale, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.86 * item.scale, 0.03 * item.scale, 0.48 * item.scale]} />
              <meshStandardMaterial color="#ead9b1" roughness={0.76} map={textures?.cloth} />
            </mesh>
            {[
              [-0.52, 0.2, -0.28],
              [0.52, 0.2, -0.28],
              [-0.52, 0.2, 0.28],
              [0.52, 0.2, 0.28],
            ].map((leg) => (
              <mesh key={leg.join(":")} position={[leg[0] * item.scale, leg[1] * item.scale, leg[2] * item.scale]} castShadow>
                <boxGeometry args={[0.12 * item.scale, 0.48 * item.scale, 0.12 * item.scale]} />
                <meshStandardMaterial color="#c79359" roughness={0.8} map={textures?.wood} />
              </mesh>
            ))}
            <mesh position={[-0.18 * item.scale, 0.7 * item.scale, 0]} rotation={[0, 0.1, -0.1]} castShadow>
              <boxGeometry args={[0.22 * item.scale, 0.04 * item.scale, 0.44 * item.scale]} />
              <meshStandardMaterial color="#f8f3ea" roughness={0.72} />
            </mesh>
            <mesh position={[0.26 * item.scale, 0.67 * item.scale, -0.06 * item.scale]} castShadow>
              <boxGeometry args={[0.18 * item.scale, 0.16 * item.scale, 0.18 * item.scale]} />
              <meshStandardMaterial color="#5e4638" roughness={0.82} />
            </mesh>
          </group>
        )
      }

      return (
        <group position={position} rotation={[0, item.rotation, 0]}>
          <mesh position={[0, 0.55 * item.scale, 0]} castShadow>
            <boxGeometry args={[1.3 * item.scale, 0.12 * item.scale, 0.75 * item.scale]} />
            <meshStandardMaterial color="#f7e7d2" roughness={0.78} map={textures?.wood} />
          </mesh>
          <mesh position={[0, 0.63 * item.scale, 0]} castShadow>
            <boxGeometry args={[0.82 * item.scale, 0.02 * item.scale, 0.42 * item.scale]} />
            <meshStandardMaterial color="#f0d39d" roughness={0.72} map={textures?.cloth} />
          </mesh>
          {[
            [-0.5, 0.2, -0.24],
            [0.5, 0.2, -0.24],
            [-0.5, 0.2, 0.24],
            [0.5, 0.2, 0.24],
          ].map((leg) => (
            <mesh key={leg.join(":")} position={[leg[0] * item.scale, leg[1] * item.scale, leg[2] * item.scale]} castShadow>
              <boxGeometry args={[0.1 * item.scale, 0.45 * item.scale, 0.1 * item.scale]} />
              <meshStandardMaterial color="#ecd0ac" roughness={0.8} map={textures?.wood} />
            </mesh>
          ))}
          <mesh position={[-0.18 * item.scale, 0.67 * item.scale, 0]} castShadow rotation={[0, 0, -0.2]}>
            <boxGeometry args={[0.16 * item.scale, 0.02 * item.scale, 0.38 * item.scale]} />
            <meshStandardMaterial color="#fdf8f0" roughness={0.72} />
          </mesh>
        </group>
      )
    case "stairs":
      return (
        <group position={position} rotation={[0, item.rotation, 0]}>
          {[0, 1, 2, 3].map((step) => (
            <mesh key={step} position={[0, step * 0.16 * item.scale, step * 0.18 * item.scale]} castShadow receiveShadow>
              <boxGeometry args={[1.1 * item.scale, 0.16 * item.scale, 0.34 * item.scale]} />
              <meshStandardMaterial color={step % 2 === 0 ? "#ffffff" : "#f5f0e8"} roughness={0.86} map={groundTexture} />
            </mesh>
          ))}
        </group>
      )
    case "banner":
      if (isCityGateBanner) {
        return (
          <group position={position} rotation={[0, item.rotation, 0]}>
            <mesh position={[0, -0.16 * item.scale, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.28 * item.scale, 0.32 * item.scale, 0.16 * item.scale, 12]} />
              <meshStandardMaterial color="#5b5148" />
            </mesh>
            <mesh position={[0, 0.82 * item.scale, 0]} castShadow>
              <cylinderGeometry args={[0.05 * item.scale, 0.05 * item.scale, 2.35 * item.scale, 8]} />
              <meshStandardMaterial color="#5a4638" roughness={0.82} map={textures?.wood} />
            </mesh>
            <mesh position={[0.3 * item.scale, 1.94 * item.scale, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.03 * item.scale, 0.03 * item.scale, 0.66 * item.scale, 8]} />
              <meshStandardMaterial color="#5a4638" roughness={0.82} map={textures?.wood} />
            </mesh>
            <mesh position={[0.42 * item.scale, 1.2 * item.scale, 0]} castShadow>
              <planeGeometry args={[0.82 * item.scale, 1.58 * item.scale]} />
              <meshStandardMaterial color="#b56b62" side={THREE.DoubleSide} roughness={0.84} map={textures?.cloth} />
            </mesh>
            <mesh position={[0.42 * item.scale, 1.24 * item.scale, 0.02]} castShadow receiveShadow>
              <boxGeometry args={[0.18 * item.scale, 0.2 * item.scale, 0.04 * item.scale]} />
              <meshStandardMaterial color="#784c2c" roughness={0.78} />
            </mesh>
            <mesh position={[0.16 * item.scale, 0.76 * item.scale, 0.02]} castShadow receiveShadow>
              <boxGeometry args={[0.1 * item.scale, 0.86 * item.scale, 0.04 * item.scale]} />
              <meshStandardMaterial color="#8d5645" roughness={0.82} />
            </mesh>
          </group>
        )
      }

      if (isCheckpointBanner) {
        return (
          <group position={position} rotation={[0, item.rotation, 0]}>
            <mesh position={[0, -0.15 * item.scale, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.28 * item.scale, 0.32 * item.scale, 0.16 * item.scale, 12]} />
              <meshStandardMaterial color="#5b5148" />
            </mesh>
            <mesh position={[0, 0.62 * item.scale, 0]} castShadow>
              <cylinderGeometry args={[0.045 * item.scale, 0.045 * item.scale, 1.8 * item.scale, 8]} />
              <meshStandardMaterial color="#5a4638" roughness={0.82} map={textures?.wood} />
            </mesh>
            <mesh position={[0.2 * item.scale, 1.42 * item.scale, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.03 * item.scale, 0.03 * item.scale, 0.5 * item.scale, 8]} />
              <meshStandardMaterial color="#5a4638" roughness={0.82} map={textures?.wood} />
            </mesh>
            <mesh position={[0.28 * item.scale, 0.95 * item.scale, 0]} castShadow>
              <planeGeometry args={[0.52 * item.scale, 0.88 * item.scale]} />
              <meshStandardMaterial color="#f6d6a5" side={THREE.DoubleSide} roughness={0.84} map={textures?.cloth} />
            </mesh>
            <mesh position={[0.28 * item.scale, 0.98 * item.scale, 0.02]} castShadow receiveShadow>
              <boxGeometry args={[0.16 * item.scale, 0.16 * item.scale, 0.04 * item.scale]} />
              <meshStandardMaterial color="#784c2c" roughness={0.78} />
            </mesh>
          </group>
        )
      }

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
            <meshStandardMaterial color="#f7d8de" side={THREE.DoubleSide} roughness={0.88} map={textures?.cloth} />
          </mesh>
        </group>
      )
    case "altar":
      return (
        <group position={position} rotation={[0, item.rotation, 0]}>
          <RoundedBox args={[1.7 * item.scale, 0.3 * item.scale, 1.1 * item.scale]} radius={0.05} smoothness={2} position={[0, -0.12 * item.scale, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#eee8de" roughness={0.88} map={textures?.stone} />
          </RoundedBox>
          <RoundedBox args={[1.6 * item.scale, 0.45 * item.scale, 1 * item.scale]} radius={0.05} smoothness={2} position={[0, 0.12 * item.scale, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#ffffff" roughness={0.84} map={textures?.stone} />
          </RoundedBox>
          <RoundedBox args={[1.1 * item.scale, 0.35 * item.scale, 0.76 * item.scale]} radius={0.05} smoothness={2} position={[0, 0.48 * item.scale, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#fffaf1" roughness={0.82} map={textures?.stone} />
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
            <meshStandardMaterial color="#f3eee6" roughness={0.88} map={textures?.stone} />
          </RoundedBox>
          <mesh position={[0, -0.02 * item.scale, 0]} castShadow>
            <cylinderGeometry args={[0.22 * item.scale, 0.3 * item.scale, 1.5 * item.scale, 10]} />
            <meshStandardMaterial color="#ffffff" roughness={0.82} map={textures?.stone} />
          </mesh>
          <mesh position={[0, 0.42 * item.scale, 0.02 * item.scale]} castShadow>
            <boxGeometry args={[0.42 * item.scale, 0.7 * item.scale, 0.28 * item.scale]} />
            <meshStandardMaterial color="#fbf6ee" roughness={0.82} map={textures?.stone} />
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
          {renderCrate([0, 0, 0], item.scale, item.color || "#f0c993")}
          {item.scale >= 1.02 && renderCrate([0.36 * item.scale, -0.06 * item.scale, -0.18 * item.scale], item.scale * 0.86, "#e6bb7e")}
          {item.scale >= 1.18 && renderCrate([-0.24 * item.scale, 0.32 * item.scale, 0.08 * item.scale], item.scale * 0.74, "#f6d5a8")}
        </group>
      )
  }
}

function PortraitBadge({ token }: { token: MapMiniToken }) {
  const portrait = usePortraitTexture(token.image)

  if (!portrait) {
    return <FallbackBadge token={token} />
  }

  return (
    <>
      <mesh position={[0, 1.14, 0.075]} castShadow>
        <circleGeometry args={[0.23, 20]} />
        <meshStandardMaterial color="#f8f2e8" roughness={0.38} metalness={0.02} />
      </mesh>
      <mesh position={[0, 1.14, 0.086]} castShadow>
        <circleGeometry args={[0.19, 20]} />
        <meshStandardMaterial map={portrait} color="#ffffff" roughness={0.68} metalness={0.02} />
      </mesh>
      <mesh position={[0, 1.08, 0.058]} castShadow>
        <ringGeometry args={[0.205, 0.245, 20]} />
        <meshStandardMaterial color="#c9ab86" roughness={0.44} metalness={0.16} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.72, 0.075]} castShadow receiveShadow>
        <boxGeometry args={[0.26, 0.045, 0.032]} />
        <meshStandardMaterial color="#e8d5bf" roughness={0.78} metalness={0.04} />
      </mesh>
    </>
  )
}

function FallbackBadge({ token }: { token: MapMiniToken }) {
  return (
    <>
      <mesh position={[0, 1.14, 0.075]} castShadow>
        <circleGeometry args={[0.23, 20]} />
        <meshStandardMaterial color={token.kind === "pc" ? "#dbeafe" : "#fee2e2"} roughness={0.48} metalness={0.02} />
      </mesh>
      <mesh position={[0, 1.14, 0.084]} castShadow>
        <circleGeometry args={[0.19, 20]} />
        <meshStandardMaterial color={token.kind === "pc" ? "#1d4ed8" : "#b91c1c"} roughness={0.84} metalness={0.02} />
      </mesh>
      <mesh position={[0, 1.17, 0.094]} castShadow>
        <sphereGeometry args={[0.055, 8, 8]} />
        <meshStandardMaterial color="#f8f2e8" roughness={0.76} />
      </mesh>
      <mesh position={[0, 1.05, 0.094]} castShadow>
        <capsuleGeometry args={[0.065, 0.13, 3, 6]} />
        <meshStandardMaterial color="#f8f2e8" roughness={0.76} />
      </mesh>
      <mesh position={[0, 0.72, 0.075]} castShadow receiveShadow>
        <boxGeometry args={[0.26, 0.045, 0.032]} />
        <meshStandardMaterial color="#f8f2e8" roughness={0.86} metalness={0.02} />
      </mesh>
    </>
  )
}

function TokenMini({ token, onSelect }: { token: MapMiniToken; onSelect?: (token: MapMiniToken) => void }) {
  const miniStyle = getMiniStyle(token)

  return (
    <group position={[token.x, (token.y || 0) + 0.01, token.z]} rotation={[0, token.facing || 0, 0]}>
      <mesh castShadow receiveShadow onClick={() => onSelect?.(token)}>
        <cylinderGeometry args={[0.54, 0.6, 0.16, 20]} />
        <meshStandardMaterial color={miniStyle.baseColor} roughness={0.88} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0.11, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.45, 0.5, 0.045, 20]} />
        <meshStandardMaterial color={miniStyle.ringColor} roughness={0.52} metalness={0.16} />
      </mesh>
      <mesh position={[0, 0.22, 0.02]} castShadow receiveShadow>
        <cylinderGeometry args={[0.18, 0.22, 0.06, 16]} />
        <meshStandardMaterial color={miniStyle.accentMetal} roughness={0.42} metalness={0.24} />
      </mesh>
      <mesh position={[0, 0.46, -0.06]} rotation={[-0.46, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.12, 0.62, 0.11]} />
        <meshStandardMaterial color="#46382f" roughness={0.9} metalness={0.04} />
      </mesh>
      <RoundedBox args={[0.54, 1.18, 0.05]} radius={0.08} smoothness={2} position={[0, 1.04, -0.028]} castShadow receiveShadow>
        <meshStandardMaterial color={miniStyle.topColor} roughness={0.84} metalness={0.04} />
      </RoundedBox>
      <RoundedBox args={[0.48, 1.08, 0.04]} radius={0.08} smoothness={2} position={[0, 1.08, 0.014]} castShadow receiveShadow>
        <meshStandardMaterial color={miniStyle.cardTone} roughness={0.74} metalness={0.02} />
      </RoundedBox>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.21, 1.28, 0.005]} rotation={[0, 0, side * -0.5]} castShadow receiveShadow>
          <boxGeometry args={[0.14, 0.34, 0.04]} />
          <meshStandardMaterial color={miniStyle.topColor} roughness={0.84} metalness={0.04} />
        </mesh>
      ))}
      <RoundedBox args={[0.42, 0.12, 0.08]} radius={0.03} smoothness={2} position={[0, 0.52, 0.02]} castShadow receiveShadow>
        <meshStandardMaterial color={miniStyle.plaqueTone} roughness={0.8} metalness={0.06} />
      </RoundedBox>
      <mesh position={[0, 1.8, 0.012]} castShadow>
        <cylinderGeometry args={[0.08, 0.12, 0.06, 14]} />
        <meshStandardMaterial color={miniStyle.accentMetal} roughness={0.42} metalness={0.26} />
      </mesh>
      <mesh position={[0, 1.58, 0.034]} castShadow receiveShadow>
        <capsuleGeometry args={[0.08, 0.14, 3, 10]} />
        <meshStandardMaterial color={miniStyle.accentMetal} roughness={0.48} metalness={0.24} />
      </mesh>
      <RoundedBox args={[0.62, 0.1, 0.28]} radius={0.03} smoothness={2} position={[0, 0.12, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={miniStyle.cardTone} roughness={0.76} metalness={0.02} />
      </RoundedBox>

      {token.image ? <PortraitBadge token={token} /> : <FallbackBadge token={token} />}
    </group>
  )
}

function SafeDisplayBase({
  map,
  palette,
}: {
  map: Encounter3DMap
  palette: ReturnType<typeof getThemePalette>
}) {
  const width = map.board.width * map.board.cellSize
  const depth = map.board.depth * map.board.cellSize

  return (
    <group>
      <mesh position={[0, -0.12, 0]} receiveShadow>
        <boxGeometry args={[width + 1, 0.24, depth + 1]} />
        <meshStandardMaterial color={shiftColor(palette.frame, 0.2)} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <boxGeometry args={[width, 0.08, depth]} />
        <meshStandardMaterial color={shiftColor(palette.floor, 0.12)} roughness={1} />
      </mesh>
    </group>
  )
}

function SafeTerrainMesh({ item }: { item: Encounter3DMap["terrain"][number] }) {
  const color =
    item.kind === "water"
      ? "#5b8db8"
      : item.kind === "pit"
        ? "#3b2d2a"
        : item.kind === "wall"
          ? "#b9b1a7"
          : "#cfc7bc"

  return (
    <mesh position={[item.x, item.y + item.height / 2, item.z]} rotation={[0, item.rotation, 0]}>
      <boxGeometry args={[item.width, Math.max(item.height, 0.1), item.depth]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  )
}

function SafePropMesh({ item }: { item: Encounter3DMap["props"][number] }) {
  const position: [number, number, number] = [item.x, item.y + 0.35 * item.scale, item.z]

  switch (item.kind) {
    case "torch":
      return (
        <group position={position} rotation={[0, item.rotation, 0]}>
          <mesh position={[0, 0.3 * item.scale, 0]}>
            <cylinderGeometry args={[0.04 * item.scale, 0.04 * item.scale, 0.8 * item.scale, 8]} />
            <meshStandardMaterial color="#7b5b3b" roughness={1} />
          </mesh>
          <mesh position={[0, 0.76 * item.scale, 0]}>
            <sphereGeometry args={[0.11 * item.scale, 8, 8]} />
            <meshBasicMaterial color="#ffd166" />
          </mesh>
        </group>
      )
    case "pillar":
      return (
        <mesh position={[item.x, item.y + item.scale * 0.8, item.z]}>
          <cylinderGeometry args={[0.18 * item.scale, 0.2 * item.scale, 1.6 * item.scale, 10]} />
          <meshStandardMaterial color="#d5cec4" roughness={1} />
        </mesh>
      )
    case "tree":
      return (
        <group position={position}>
          <mesh position={[0, 0.25 * item.scale, 0]}>
            <cylinderGeometry args={[0.08 * item.scale, 0.1 * item.scale, 0.8 * item.scale, 8]} />
            <meshStandardMaterial color="#6a4a34" roughness={1} />
          </mesh>
          <mesh position={[0, 0.82 * item.scale, 0]}>
            <sphereGeometry args={[0.34 * item.scale, 10, 10]} />
            <meshStandardMaterial color="#8ea67f" roughness={1} />
          </mesh>
        </group>
      )
    default:
      return (
        <mesh position={position} rotation={[0, item.rotation, 0]}>
          <boxGeometry args={[0.7 * item.scale, 0.7 * item.scale, 0.7 * item.scale]} />
          <meshStandardMaterial color="#c49b68" roughness={1} />
        </mesh>
      )
  }
}

function SafeTokenMini({ token, onSelect }: { token: MapMiniToken; onSelect?: (token: MapMiniToken) => void }) {
  const miniStyle = getMiniStyle(token)

  return (
    <group position={[token.x, (token.y || 0) + 0.01, token.z]} rotation={[0, token.facing || 0, 0]}>
      <mesh onClick={() => onSelect?.(token)}>
        <cylinderGeometry args={[0.42, 0.48, 0.18, 20]} />
        <meshStandardMaterial color={miniStyle.baseColor} roughness={1} />
      </mesh>
      <mesh position={[0, 0.11, 0]}>
        <cylinderGeometry args={[0.36, 0.42, 0.05, 20]} />
        <meshStandardMaterial color={miniStyle.ringColor} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.66, 0]}>
        <boxGeometry args={[0.42, 0.9, 0.14]} />
        <meshStandardMaterial color={token.kind === "pc" ? "#d9e6f8" : "#f2ddd7"} roughness={1} />
      </mesh>
      <mesh position={[0, 1.2, 0.02]}>
        <sphereGeometry args={[0.16, 10, 10]} />
        <meshStandardMaterial color="#f6efe6" roughness={1} />
      </mesh>
    </group>
  )
}

export default function MiniaturesMap({
  map,
  tokens = [],
  title,
  className,
  renderMode = "full",
  tokenRenderMode = "premium",
}: {
  map: Encounter3DMap
  tokens?: MapMiniToken[]
  title?: string
  className?: string
  renderMode?: MiniaturesMapRenderMode
  tokenRenderMode?: MiniaturesMapTokenRenderMode
}) {
  const mapDebugId = useId()
  const [selectedToken, setSelectedToken] = useState<MapMiniToken | null>(tokens[0] ?? null)
  const [renderStatus, setRenderStatus] = useState<"initializing" | "ready" | "lost">("initializing")
  const [renderEvents, setRenderEvents] = useState<string[]>([])
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null)
  const [shouldRenderCanvas, setShouldRenderCanvas] = useState(false)
  const displayMap = useMemo(() => enhanceEncounterMap(map), [map])
  const usesPremiumGeometry = renderMode !== "safe"
  const usesPremiumTokens = tokenRenderMode === "premium"
  const usesTextures = renderMode === "textured" || renderMode === "full"
  const usesFullLighting = renderMode === "full"
  const usesCityGateAssetSet = usesPremiumGeometry && displayMap.sceneKit === "city_gate"
  const showsPresentationGrid = renderMode !== "full"
  const palette = useMemo(() => getThemePalette(displayMap.board.theme), [displayMap.board.theme])
  const textures = useMemo(() => {
    if (!usesTextures) {
      return null
    }
    if (typeof document === "undefined") {
      return null
    }

    return buildSceneTextures(palette)
  }, [displayMap.board.theme, palette, usesTextures])
  const cameraPosition = useMemo<[number, number, number]>(
    () => [
      displayMap.camera.focusX + Math.cos(displayMap.camera.yaw) * displayMap.camera.distance,
      Math.sin(displayMap.camera.pitch) * displayMap.camera.distance,
      displayMap.camera.focusZ + Math.sin(displayMap.camera.yaw) * displayMap.camera.distance,
    ],
    [displayMap.camera.distance, displayMap.camera.focusX, displayMap.camera.focusZ, displayMap.camera.pitch, displayMap.camera.yaw]
  )
  const orbitTarget = useMemo<[number, number, number]>(() => [displayMap.camera.focusX, 0.5, displayMap.camera.focusZ], [displayMap.camera.focusX, displayMap.camera.focusZ])
  const canvasGlProps = useMemo(() => ({ antialias: true, powerPreference: "default" as const }), [])
  const canvasCameraProps = useMemo(() => ({ position: cameraPosition, fov: 42 }), [cameraPosition])

  useEffect(() => {
    const settleTimer = window.setTimeout(() => {
      setShouldRenderCanvas(true)
    }, 180)

    return () => {
      window.clearTimeout(settleTimer)
    }
  }, [])

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

  useEffect(() => {
    return () => {
      if (!textures) return
      Object.values(textures).forEach((texture) => texture.dispose())
    }
  }, [textures])

  useEffect(() => {
    if (!canvasElement) return

    const appendRenderEvent = (message: string, details?: Record<string, unknown>) => {
      const timestamp = new Date().toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
      const nextMessage = `${timestamp} ${message}`
      setRenderEvents((current) => [...current.slice(-4), nextMessage])
      const payload = details ? JSON.stringify(details, null, 2) : ""
      if (details) {
          console.error(`[MiniaturesMap:${mapDebugId}] ${message}\n${payload}`)
      } else {
        console.error(`[MiniaturesMap:${mapDebugId}] ${message}`)
      }
    }

    const handleContextLost = (event: Event) => {
      event.preventDefault()
      setRenderStatus("lost")
      appendRenderEvent("WebGL context lost", {
        title: title || displayMap.summary || "Encounter Map",
        minis: tokens.length,
        terrain: displayMap.terrain.length,
        props: displayMap.props.length,
        zones: displayMap.zones.length,
        renderMode,
      })
    }

    const handleContextRestored = () => {
      setRenderStatus("ready")
      appendRenderEvent("WebGL context restored")
    }

    canvasElement.addEventListener("webglcontextlost", handleContextLost, { passive: false })
    canvasElement.addEventListener("webglcontextrestored", handleContextRestored)

    return () => {
      canvasElement.removeEventListener("webglcontextlost", handleContextLost)
      canvasElement.removeEventListener("webglcontextrestored", handleContextRestored)
    }
  }, [canvasElement, displayMap.props.length, displayMap.summary, displayMap.terrain.length, displayMap.zones.length, mapDebugId, renderMode, title, tokens.length])

  useEffect(() => {
    console.groupCollapsed(`[MiniaturesMap:${mapDebugId}] mount`)
    console.log(
      JSON.stringify(
        {
          title: title || displayMap.summary || "Encounter Map",
          minis: tokens.length,
          terrain: displayMap.terrain.length,
          props: displayMap.props.length,
          zones: displayMap.zones.length,
          partySlots: displayMap.tokenSlots.party.length,
          npcSlots: displayMap.tokenSlots.npc.length,
          renderMode,
        },
        null,
        2
      )
    )
    console.groupEnd()

    return () => {
      console.info(`[MiniaturesMap:${mapDebugId}] unmount`)
    }
  }, [displayMap.props.length, displayMap.summary, displayMap.terrain.length, displayMap.tokenSlots.npc.length, displayMap.tokenSlots.party.length, displayMap.zones.length, mapDebugId, renderMode, title, tokens.length])

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
          {shouldRenderCanvas ? (
            <Canvas
              frameloop="demand"
              camera={canvasCameraProps}
              shadows={usesFullLighting}
              dpr={usesFullLighting ? [1, 1.25] : 1}
              gl={canvasGlProps}
              onCreated={({ gl }) => {
                gl.domElement.dataset.miniaturesCanvasId = mapDebugId
                setCanvasElement(gl.domElement)
                setRenderStatus("ready")
                console.info(
                  `[MiniaturesMap:${mapDebugId}] canvas created\n${JSON.stringify(
                    {
                      canvasId: mapDebugId,
                      width: gl.domElement.width,
                      height: gl.domElement.height,
                      renderMode,
                    },
                    null,
                    2
                  )}`
                )
                gl.shadowMap.enabled = usesFullLighting
                gl.shadowMap.type = THREE.PCFSoftShadowMap
                gl.toneMappingExposure = 1.2
              }}
            >
              <MiniaturesMapDiagnostics mapId={mapDebugId} title={title || displayMap.summary} tokens={tokens} renderMode={renderMode} />
              <color attach="background" args={[shiftColor(palette.haze, 0.08)]} />
              <hemisphereLight intensity={usesFullLighting ? 0.9 : 0.7} groundColor={shiftColor(palette.floor, -0.18)} color="#f8f3ea" />
              <ambientLight intensity={usesFullLighting ? 0.75 : 1} color="#fff6e7" />
              <directionalLight
                position={[10, 16, 7]}
                intensity={usesFullLighting ? 3 : 1.4}
                color="#fff4de"
                castShadow={usesFullLighting}
                shadow-mapSize-width={1024}
                shadow-mapSize-height={1024}
                shadow-camera-near={0.5}
                shadow-camera-far={30}
                shadow-camera-left={-14}
                shadow-camera-right={14}
                shadow-camera-top={14}
                shadow-camera-bottom={-14}
                shadow-bias={-0.00012}
                shadow-normalBias={0.02}
              />
              {usesPremiumGeometry ? <directionalLight position={[-8, 10, -7]} intensity={usesFullLighting ? 1.2 : 0.7} color="#a9c4e2" /> : null}
              {usesPremiumGeometry ? <directionalLight position={[0, 6, -10]} intensity={usesFullLighting ? 0.8 : 0.45} color="#fff2d6" /> : null}
              {usesFullLighting ? <spotLight position={[-6, 14, 10]} angle={0.5} penumbra={0.65} intensity={1.6} color="#ffd7a3" /> : null}
              {usesFullLighting ? <fog attach="fog" args={[shiftColor(palette.haze, 0.05), 18, 48]} /> : null}

              {usesPremiumGeometry ? <SceneBackdrop map={displayMap} palette={palette} textures={textures} /> : null}
              {usesPremiumGeometry ? <DisplayBase map={displayMap} palette={palette} textures={textures} /> : <SafeDisplayBase map={displayMap} palette={palette} />}
              {usesCityGateAssetSet ? <CityGateAssetSet map={displayMap} palette={palette} textures={textures} /> : null}

              {showsPresentationGrid ? (
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
              ) : null}

              {showsPresentationGrid
                ? displayMap.zones.map((zone) => (
                    <mesh key={zone.id} position={[zone.x, 0.19, zone.z]} rotation={[-Math.PI / 2, 0, 0]}>
                      <planeGeometry args={[zone.width, zone.depth]} />
                      <meshBasicMaterial color={zone.color || palette.accent} transparent opacity={0.16} />
                    </mesh>
                  ))
                : null}

              {(usesCityGateAssetSet ? [] : displayMap.terrain).map((terrain) =>
                usesPremiumGeometry ? (
                  <TerrainMesh key={terrain.id} item={terrain} theme={displayMap.board.theme} sceneKit={displayMap.sceneKit} textures={textures} />
                ) : (
                  <SafeTerrainMesh key={terrain.id} item={terrain} />
                )
              )}

              {(usesCityGateAssetSet ? [] : displayMap.props).map((prop) => (
                usesPremiumGeometry ? <PropMesh key={prop.id} item={prop} theme={displayMap.board.theme} sceneKit={displayMap.sceneKit} textures={textures} /> : <SafePropMesh key={prop.id} item={prop} />
              ))}

              {tokens.map((token) => (
                usesPremiumTokens ? <TokenMini key={token.id} token={token} onSelect={setSelectedToken} /> : <SafeTokenMini key={token.id} token={token} onSelect={setSelectedToken} />
              ))}

              <OrbitControls
                enablePan
                enableZoom
                maxDistance={38}
                minDistance={12}
                minPolarAngle={0.44}
                maxPolarAngle={1.2}
                target={orbitTarget}
              />
            </Canvas>
          ) : (
            <div className="flex h-full items-center justify-center text-xs font-mono uppercase tracking-[0.25em] text-white/45">Preparing renderer...</div>
          )}
        </div>

        <div className="w-full border-t border-white/10 bg-black/30 p-4">
          <div className="text-xs font-mono uppercase tracking-[0.25em] text-primary-200/60">Scene Summary</div>
          <p className="mt-2 text-sm text-white/80">{displayMap.summary || "No summary yet."}</p>

          <div className="mt-5 grid grid-cols-2 gap-2 text-xs text-white/70">
            <div className="rounded-xl border border-white/10 bg-white/5 p-2">Terrain: {displayMap.terrain.length}</div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-2">Props: {displayMap.props.length}</div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-2">Zones: {displayMap.zones.length}</div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-2">Party Slots: {displayMap.tokenSlots.party.length}</div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-2">Renderer: {renderStatus}</div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-2">Minis: {tokens.length}</div>
          </div>

          {renderEvents.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="text-xs font-mono uppercase tracking-[0.25em] text-amber-200/70">Render Events</div>
              <div className="mt-2 space-y-1 font-mono text-[11px] text-amber-100/80">
                {renderEvents.map((entry) => (
                  <div key={entry}>{entry}</div>
                ))}
              </div>
            </div>
          ) : null}

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
        shortLabel: getTokenInitials(character.name),
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
        shortLabel: getTokenInitials(character.name),
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
