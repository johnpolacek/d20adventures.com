"use client"

// Procedural tree perimeter for wooded scene kits. Density is guaranteed here in
// code — the LLM only places feature props (clearing contents, notable trees).
// Rendered with one InstancedMesh per GLB submesh so a 150-tree forest stays a
// handful of draw calls. Placement is seeded per turn, so a scene always renders
// the same forest.

import { useGLTF } from "@react-three/drei"
import { useMemo } from "react"
import * as THREE from "three"
import { DEAD_FOREST_ASSETS, FOREST_ASSETS, type ForestAsset } from "@/lib/encounterview/asset-catalog"
import { SCENE_BOARD_SIZE } from "@/lib/encounterview/generate"

export const BOARD_OFFSET = SCENE_BOARD_SIZE / 2

export interface ForestAvoidZone {
  /** Board coordinates (0..20). */
  x: number
  z: number
  radius: number
}

export interface ScatterPlacement {
  assetIndex: number
  x: number
  z: number
  /** World-space lift off the board, in board units. Used to stack RoomShell wall courses; defaults to 0. */
  y?: number
  rotation: number
  scale: number
  tint: THREE.Color
}

export function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickWeighted(assets: ForestAsset[], random: () => number): number {
  const total = assets.reduce((sum, a) => sum + a.weight, 0)
  let roll = random() * total
  for (let i = 0; i < assets.length; i++) {
    roll -= assets[i].weight
    if (roll <= 0) return i
  }
  return assets.length - 1
}

function planForest(assets: ForestAsset[], density: number, seed: number, avoid: ForestAvoidZone[]): ScatterPlacement[] {
  const random = mulberry32(seed ^ 0x51ab)
  const placements: ScatterPlacement[] = []
  const placed: { x: number; z: number; radius: number }[] = []

  const blocked = (x: number, z: number, radius: number) => {
    for (const zone of avoid) {
      if (Math.hypot(x - zone.x, z - zone.z) < zone.radius + radius * 0.6) return true
    }
    for (const p of placed) {
      if (Math.hypot(x - p.x, z - p.z) < (p.radius + radius) * 0.55) return true
    }
    return false
  }

  const tryPlace = (x: number, z: number, scaleJitter: number) => {
    const assetIndex = pickWeighted(assets, random)
    const asset = assets[assetIndex]
    // The camera looks from the south (high z): keep the viewer-side treeline
    // short so it never walls off the stage — theatre-diorama foreground.
    const southFactor = z > SCENE_BOARD_SIZE * 0.72 ? 0.55 : 1
    const scale = scaleJitter * southFactor * (0.75 + random() * 0.7)
    const radius = asset.footprintRadius * scale
    if (x < 0.6 || x > SCENE_BOARD_SIZE - 0.6 || z < 0.6 || z > SCENE_BOARD_SIZE - 0.6) return
    if (blocked(x, z, radius)) return
    placed.push({ x, z, radius })
    // green variation: darker/bluer in back rows reads as depth
    const tint = new THREE.Color(1, 1, 1).offsetHSL(random() * 0.04 - 0.02, random() * 0.15 - 0.05, random() * 0.18 - 0.12)
    placements.push({ assetIndex, x, z, rotation: random() * Math.PI * 2, scale, tint })
  }

  // Perimeter band: staggered rows just inside the board edge. Row 0 hugs the
  // edge and is densest; inner rows thin out so the treeline feels organic.
  const rows = [
    { inset: 1.2, step: 1.5, chance: 1.0 },
    { inset: 2.6, step: 1.9, chance: 0.75 },
    { inset: 4.0, step: 2.4, chance: 0.45 },
  ]
  for (const row of rows) {
    const span = SCENE_BOARD_SIZE - row.inset * 2
    const count = Math.floor(span / row.step)
    for (let side = 0; side < 4; side++) {
      // side 1 is the south (viewer) edge — thin it out as well as shortening it
      const sideChance = side === 1 ? row.chance * 0.5 : row.chance
      for (let i = 0; i <= count; i++) {
        if (random() > sideChance * density) continue
        const along = row.inset + (i / count) * span + (random() - 0.5) * row.step * 0.8
        const inset = row.inset + (random() - 0.5) * 0.9
        const [x, z] = side === 0 ? [along, inset] : side === 1 ? [along, SCENE_BOARD_SIZE - inset] : side === 2 ? [inset, along] : [SCENE_BOARD_SIZE - inset, along]
        tryPlace(x, z, 1)
      }
    }
  }

  // Interior clusters: a few smaller stands so the woods bleed into the scene.
  const clusterCount = Math.round(density * 4)
  for (let c = 0; c < clusterCount; c++) {
    const cx = 4 + random() * (SCENE_BOARD_SIZE - 8)
    const cz = 4 + random() * (SCENE_BOARD_SIZE - 8)
    if (Math.hypot(cx - BOARD_OFFSET, cz - BOARD_OFFSET) < 5.5) continue // keep the stage open
    const trees = 2 + Math.floor(random() * 3)
    for (let t = 0; t < trees; t++) {
      const angle = random() * Math.PI * 2
      const distance = random() * 2.4
      tryPlace(cx + Math.cos(angle) * distance, cz + Math.sin(angle) * distance, 0.85)
    }
  }

  return placements
}

/** All submeshes of a GLB flattened with their local transforms baked relative to the root. */
function collectSubmeshes(root: THREE.Object3D): { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[] {
  const result: { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[] = []
  root.updateWorldMatrix(false, true)
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    result.push({ geometry: mesh.geometry, material: mesh.material as THREE.Material, matrix: mesh.matrixWorld.clone() })
  })
  return result
}

export function InstancedModel({ file, baseScale, placements }: { file: string; baseScale: number; placements: ScatterPlacement[] }) {
  const gltf = useGLTF(`/models/encounter/props/${file}`)
  const submeshes = useMemo(() => collectSubmeshes(gltf.scene), [gltf.scene])
  const instanceData = useMemo(() => {
    const composed = new THREE.Matrix4()
    const placement = new THREE.Matrix4()
    const quaternion = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    return submeshes.map((submesh) => {
      const matrices: THREE.Matrix4[] = []
      const colors: THREE.Color[] = []
      for (const p of placements) {
        quaternion.setFromAxisAngle(up, p.rotation)
        const s = baseScale * p.scale
        placement.compose(new THREE.Vector3(p.x - BOARD_OFFSET, p.y ?? 0, p.z - BOARD_OFFSET), quaternion, new THREE.Vector3(s, s, s))
        composed.multiplyMatrices(placement, submesh.matrix)
        matrices.push(composed.clone())
        colors.push(p.tint)
      }
      return { submesh, matrices, colors }
    })
  }, [submeshes, placements, baseScale])

  if (!placements.length) return null
  return (
    <>
      {instanceData.map(({ submesh, matrices, colors }, index) => (
        <instancedMesh
          key={index}
          args={[submesh.geometry, submesh.material, matrices.length]}
          ref={(mesh) => {
            if (!mesh) return
            matrices.forEach((matrix, i) => {
              mesh.setMatrixAt(i, matrix)
            })
            colors.forEach((color, i) => {
              mesh.setColorAt(i, color)
            })
            mesh.instanceMatrix.needsUpdate = true
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
          }}
          castShadow
          receiveShadow
        />
      ))}
    </>
  )
}

export function ForestRing({ density, seed, avoid, dead }: { density: number; seed: number; avoid: ForestAvoidZone[]; dead?: boolean }) {
  const assets = dead ? DEAD_FOREST_ASSETS : FOREST_ASSETS
  const placements = useMemo(() => planForest(assets, density, seed, avoid), [assets, density, seed, avoid])
  const byAsset = useMemo(() => assets.map((_, index) => placements.filter((p) => p.assetIndex === index)), [assets, placements])

  if (density <= 0) return null
  return (
    <>
      {assets.map((asset, index) => (
        <InstancedModel key={asset.file} file={asset.file} baseScale={asset.scale} placements={byAsset[index]} />
      ))}
    </>
  )
}
