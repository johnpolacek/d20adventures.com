// Background crowd: hundreds of simplified figures as three instanced meshes
// (body, head, hair). Three draw calls for any count. Use it behind the action;
// the parametric figure() is for people close enough to have a face.

import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import type { BuilderContext } from "./context"
import { CLOTH_COLORS, HAIR_COLORS, SKIN_TONES } from "./figure"

export interface CrowdOptions {
  count: number
  /** Return a world x,z for one figure, or null to reject and resample. */
  sample: () => [number, number] | null
  groundHeight?: (x: number, z: number) => number
}

export function crowd(ctx: BuilderContext, { count, sample, groundHeight = () => 0 }: CrowdOptions): THREE.Group {
  const { rng } = ctx
  const group = new THREE.Group()
  const bodyGeometry = mergeGeometries([
    new THREE.CylinderGeometry(0.19, 0.24, 1.05, 10).translate(0, 0.85, 0),
    new THREE.CylinderGeometry(0.09, 0.1, 0.6, 6).translate(-0.12, 0.32, 0),
    new THREE.CylinderGeometry(0.09, 0.1, 0.6, 6).translate(0.12, 0.32, 0),
    new THREE.SphereGeometry(0.2, 10, 8).translate(0, 1.4, 0),
  ])
  const headGeometry = new THREE.SphereGeometry(0.13, 12, 10).translate(0, 1.62, 0)
  const hairGeometry = new THREE.SphereGeometry(0.14, 10, 8).translate(0, 1.65, -0.02)
  const bodies = new THREE.InstancedMesh(bodyGeometry, new THREE.MeshStandardMaterial({ roughness: 0.95 }), count)
  const heads = new THREE.InstancedMesh(headGeometry, new THREE.MeshStandardMaterial({ roughness: 0.9 }), count)
  const hairs = new THREE.InstancedMesh(hairGeometry, new THREE.MeshStandardMaterial({ roughness: 0.95 }), count)
  const dummy = new THREE.Object3D()
  const color = new THREE.Color()
  let k = 0
  let guard = 0
  while (k < count && guard++ < count * 20) {
    const spot = sample()
    if (!spot) continue
    const [x, z] = spot
    dummy.position.set(x, groundHeight(x, z), z)
    dummy.rotation.y = rng.value() * Math.PI * 2
    dummy.scale.setScalar(rng.range(0.85, 1.1))
    dummy.updateMatrix()
    bodies.setMatrixAt(k, dummy.matrix)
    heads.setMatrixAt(k, dummy.matrix)
    hairs.setMatrixAt(k, dummy.matrix)
    bodies.setColorAt(k, color.set(rng.pick(CLOTH_COLORS)).offsetHSL(0, 0, rng.range(-0.08, 0.08)))
    heads.setColorAt(k, color.set(rng.pick(SKIN_TONES)))
    hairs.setColorAt(k, color.set(rng.pick(HAIR_COLORS)))
    k++
  }
  for (const m of [bodies, heads, hairs]) {
    m.count = k
    m.castShadow = true
    m.receiveShadow = true
    group.add(m)
  }
  return group
}
