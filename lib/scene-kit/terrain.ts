// scene-kit terrain: heightfield ground with a shader-blended road, cobble
// aprons, instanced grass and wildflowers, and birch trees.
//
// Placement is the set's business: grass and flowers take a `sample` callback
// that returns a candidate position or null (keep-clear zones, road, buildings),
// so the kit never has to know what a set put where.

import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import { type Rng, smoothstep, TERRAIN_NOISE as TN } from "./core"
import type { MaterialLibrary } from "./materials"
import { cyl, mesh } from "./primitives"
import { addWorldPos, grassify, type TimeUniform } from "./shaders"
import { texSet } from "./textures"

export type HeightFn = (x: number, z: number) => number

/** Flat centre, rolling hills beyond `flatRadius` — the gates meadow. */
export function rollingMeadow({
  flatX = 7,
  hillX = 18,
  flatZ = 3,
  hillZ = 14,
  amplitude = 5.5,
}: {
  flatX?: number
  hillX?: number
  flatZ?: number
  hillZ?: number
  amplitude?: number
} = {}): HeightFn {
  return (x, z) => {
    const m = smoothstep(flatX, hillX, Math.abs(x)) * smoothstep(flatZ, hillZ, z)
    if (m <= 0) return 0
    const n = TN.f(x * 0.022 + 50, z * 0.022 + 50, 3) - 0.5
    const b = Math.max(0, TN.v(x * 0.09 + 7, z * 0.09 + 3) - 0.55)
    return (n * amplitude + b * 1.2) * m
  }
}

export const flatGround: HeightFn = () => 0

export interface RoadOptions {
  /** Half-width where the road is fully dirt, and where it has fully faded to grass. */
  halfWidth?: number
  fadeWidth?: number
  /** The road exists for z greater than this (fades in over 6 m). */
  startZ?: number
  /** A worn circle of dirt (an apron in front of a gate). */
  apron?: { x: number; z: number; radius: number }
  ruts?: boolean
}

export interface GroundOptions {
  heightFn: HeightFn
  size?: number
  segments?: number
  grassRepeat?: number
  road?: RoadOptions | false
}

/** Textured heightfield with a dirt road blended in by world position. */
export function createGround(materials: MaterialLibrary, { heightFn, size = 320, segments = 220, grassRepeat = 64, road = {} }: GroundOptions): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments)
  geometry.rotateX(-Math.PI / 2)
  const position = geometry.attributes.position
  for (let i = 0; i < position.count; i++) position.setY(i, heightFn(position.getX(i), position.getZ(i)))
  geometry.computeVertexNormals()

  const material = new THREE.MeshStandardMaterial({ ...texSet(materials.grassTex, grassRepeat, grassRepeat), roughness: 1 })
  if (road) {
    const halfWidth = road.halfWidth ?? 2.3
    const fadeWidth = road.fadeWidth ?? 4.6
    const startZ = road.startZ ?? -8
    const apron = road.apron ?? { x: 0, z: -1, radius: 6 }
    const ruts = road.ruts ?? true
    const dirt = materials.dirtTex
    material.onBeforeCompile = (shader) => {
      addWorldPos(shader)
      const dirtMap = dirt.map.clone()
      dirtMap.repeat.set(1, 1)
      dirtMap.needsUpdate = true
      shader.uniforms.dirtMap = { value: dirtMap }
      shader.uniforms.uRoad = { value: new THREE.Vector4(halfWidth, fadeWidth, startZ, ruts ? 1 : 0) }
      shader.uniforms.uApron = { value: new THREE.Vector3(apron.x, apron.z, apron.radius) }
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform sampler2D dirtMap;uniform vec4 uRoad;uniform vec3 uApron;").replace(
        "#include <map_fragment>",
        `vec4 g=texture2D(map,vMapUv);vec4 dd=texture2D(dirtMap,vMapUv*0.8+vec2(0.13,0.31));
    float rn=(noiseN(vWPos.xz*0.8)-0.5)*2.2+(noiseN(vWPos.xz*3.0)-0.5)*0.6;
    float road=1.0-smoothstep(uRoad.x,uRoad.y,abs(vWPos.x)+rn);road*=smoothstep(uRoad.z,uRoad.z+6.0,vWPos.z);
    road=max(road,(1.0-smoothstep(uApron.z*0.33,uApron.z,length(vWPos.xz-uApron.xy)))*0.6);
    float ruts=exp(-pow((abs(vWPos.x)-uRoad.x*0.5)*3.5,2.0))*0.28*smoothstep(0.0,3.0,vWPos.z)*uRoad.w;
    float wear=fbmN(vWPos.xz*0.35);
    vec3 dcol=dd.rgb*(1.0-ruts)*(0.85+wear*0.3);
    vec3 gcol=g.rgb*(0.9+0.25*fbmN(vWPos.xz*0.12));
    diffuseColor.rgb*=mix(gcol,dcol,road);`
      )
    }
    material.customProgramCacheKey = () => "scene-kit:ground-road"
  }
  return mesh(geometry, material, 0, 0, 0, false, true)
}

/** A flat paved rectangle laid on the ground (plaza, apron, floor). */
export function createPavedArea(
  materials: MaterialLibrary,
  { width, depth, x = 0, z = 0, y = 0.015, tilesPerMetre = 0.5 }: { width: number; depth: number; x?: number; z?: number; y?: number; tilesPerMetre?: number }
): THREE.Mesh {
  const material = materials.stone(width * tilesPerMetre, depth * tilesPerMetre, {}, materials.cobbleTex, 0)
  const plane = mesh(new THREE.PlaneGeometry(width, depth), material, x, y, z, false, true)
  plane.rotation.x = -Math.PI / 2
  return plane
}

export interface ScatterOptions {
  count: number
  /** Return a world x,z for one instance, or null to reject and resample. */
  sample: (rng: Rng) => [number, number] | null
  heightFn: HeightFn
  rng: Rng
}

/** Instanced curved grass blades, wind-animated, coloured by a macro noise field. */
export function createGrassField(materials: MaterialLibrary, time: TimeUniform, { count, sample, heightFn, rng }: ScatterOptions, { nearRoadX = 7 }: { nearRoadX?: number } = {}): THREE.InstancedMesh {
  const blade = new THREE.PlaneGeometry(0.09, 0.62, 1, 3)
  blade.translate(0, 0.31, 0)
  const p = blade.attributes.position
  const uv = blade.attributes.uv
  for (let i = 0; i < p.count; i++) {
    const v = uv.getY(i)
    p.setX(i, p.getX(i) * (1 - v * 0.9))
    p.setZ(i, v * v * 0.08)
  }
  const instanced = new THREE.InstancedMesh(blade, grassify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide }), time), count)
  const dummy = new THREE.Object3D()
  const color = new THREE.Color()
  const c1 = new THREE.Color(0x8a6c2a)
  const c2 = new THREE.Color(0x5f7a2a)
  const c3 = new THREE.Color(0xc9a24a)
  let k = 0
  let guard = 0
  while (k < count && guard++ < count * 20) {
    const spot = sample(rng)
    if (!spot) continue
    const [x, z] = spot
    dummy.position.set(x, heightFn(x, z) - 0.02, z)
    dummy.rotation.set(rng.range(-0.15, 0.15), rng.value() * Math.PI, rng.range(-0.15, 0.15))
    const s = rng.range(0.7, 1.5) * (Math.abs(x) < nearRoadX ? 0.75 : 1)
    dummy.scale.set(rng.range(0.8, 1.4), s, 1)
    dummy.updateMatrix()
    instanced.setMatrixAt(k, dummy.matrix)
    const t = TN.v(x * 0.15 + 3, z * 0.15 + 9)
    color
      .copy(t > 0.55 ? c1 : c2)
      .lerp(c3, rng.value() * 0.4)
      .multiplyScalar(rng.range(0.75, 1.15))
    instanced.setColorAt(k, color)
    k++
  }
  instanced.count = k
  instanced.castShadow = false
  instanced.receiveShadow = true
  return instanced
}

/** Instanced cross-plane flowers on stems. */
export function createWildflowers(materials: MaterialLibrary, time: TimeUniform, { count, sample, heightFn, rng }: ScatterOptions): THREE.Group {
  const group = new THREE.Group()
  const petals = mergeGeometries([new THREE.PlaneGeometry(0.16, 0.16), new THREE.PlaneGeometry(0.16, 0.16).rotateY(Math.PI / 2)])
  petals.translate(0, 0.28, 0)
  const flowers = new THREE.InstancedMesh(petals, grassify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide, emissive: 0x221100 }), time), count)
  const stemGeometry = new THREE.CylinderGeometry(0.01, 0.012, 0.28, 4)
  stemGeometry.translate(0, 0.14, 0)
  const stems = new THREE.InstancedMesh(stemGeometry, materials.flat(0x4f6a22, 1), count)
  const palette = [0xffffff, 0xf2d24a, 0xb47ad6, 0xe8a040, 0xff6f5a]
  const dummy = new THREE.Object3D()
  const color = new THREE.Color()
  let j = 0
  let guard = 0
  while (j < count && guard++ < count * 20) {
    const spot = sample(rng)
    if (!spot) continue
    const [x, z] = spot
    dummy.position.set(x, heightFn(x, z), z)
    dummy.rotation.set(0, rng.value() * Math.PI, 0)
    dummy.scale.setScalar(rng.range(0.6, 1.2))
    dummy.updateMatrix()
    flowers.setMatrixAt(j, dummy.matrix)
    stems.setMatrixAt(j, dummy.matrix)
    flowers.setColorAt(j, color.set(rng.pick(palette)))
    j++
  }
  flowers.count = j
  stems.count = j
  flowers.castShadow = false
  stems.castShadow = false
  group.add(flowers, stems)
  return group
}

/** A birch: bark-textured trunk, four branches, a cloud of deformed icosahedron foliage. */
export function birchTree(materials: MaterialLibrary, rng: Rng, heightFn: HeightFn, x: number, z: number, s = 1): THREE.Group {
  const group = new THREE.Group()
  group.position.set(x, heightFn(x, z) - 0.1, z)
  const bark = new THREE.MeshStandardMaterial({ ...texSet(materials.birchTex, 1, 2), roughness: 0.85 })
  const trunk = cyl(0.11 * s, 0.22 * s, 6.5 * s, bark, 0, 3.2 * s, 0, 12)
  trunk.rotation.z = rng.range(-0.06, 0.06)
  group.add(trunk)
  const foliage = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(rng.range(0.05, 0.09), rng.range(0.7, 0.9), rng.range(0.28, 0.38)), roughness: 0.95, side: THREE.DoubleSide })
  for (let i = 0; i < 4; i++) {
    const branch = cyl(0.03 * s, 0.07 * s, 2.6 * s, bark, 0, 0, 0, 6)
    branch.position.set(0, (3.6 + i * 0.8) * s, 0)
    branch.rotation.set(rng.range(-0.6, 0.6), 0, rng.range(-0.9, 0.9))
    branch.geometry.translate(0, 1.3 * s, 0)
    group.add(branch)
  }
  for (let i = 0; i < 16; i++) {
    const geometry = new THREE.IcosahedronGeometry(rng.range(0.5, 0.95) * s, 3)
    const p = geometry.attributes.position
    for (let k = 0; k < p.count; k++) {
      const n = TN.f(p.getX(k) * 1.5 + i * 9, p.getY(k) * 1.5 + p.getZ(k)) * 1.0 - 0.5
      p.setXYZ(k, p.getX(k) * (1 + n * 1.1), p.getY(k) * (1 + n * 1.1) * 0.75, p.getZ(k) * (1 + n * 1.1))
    }
    geometry.computeVertexNormals()
    const a = rng.value() * Math.PI * 2
    const rad = rng.range(0.2, 1.9) * s
    const material = i % 2 ? foliage : foliage.clone()
    if (i % 2 === 0) material.color.offsetHSL(rng.range(-0.03, 0.03), 0, rng.range(-0.08, 0.08))
    group.add(mesh(geometry, material, Math.cos(a) * rad, (4.4 + rng.range(0, 3.2)) * s * (1 - rad / (6 * s)), Math.sin(a) * rad))
  }
  return group
}
