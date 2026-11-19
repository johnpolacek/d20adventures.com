// Trees stood in a place in the stead of the set's own.
//
// A set's trees are built from code: tapered sticks for limbs and balls of leaf cards for crowns. They are quick and
// they read from the game's fixed cameras, under its paintings. Under a camera that goes anywhere they read as
// lollipops (the owner, 2026-11-15). A look can ask for modelled trees instead: grown branch by branch, with crowns of
// cards that are each a photograph of a leafy twig, as a game's trees are made. public/stage/trees holds them: twenty
// shapes of six kinds, each in three weights, with one set of bark and leaf pictures to a species. trees.json there
// lists them, and its README says where they came from.
//
// The set is not changed. Every tree in it is still built, where and as tall as the set says, so the engine keeps its
// footprints: what blocks a walk, a camera and a sight line stays as it was. Its trees are only given materials of
// their own, so that what was built of them can be put out of sight, and a model is stood on each one's footprint, as
// tall as it was. Models are drawn as instances, in three weights by how far they stand from where the scene is played.

import type { Stage } from "@d20/stage"
import * as THREE from "three"

export interface TreeSwap {
  // Where the models are served from: trees.json, the shapes it lists and their pictures.
  files: string
  // The kinds of tree, and the share of the wood each takes. A kind has several shapes, and each tree is one of them.
  kinds: Record<string, number>
  // Where the scene is played, x and z, and how far out the heavy and the middle weights reach, in metres.
  near: [number, number]
  rings: [number, number]
  // A tree set by hand, by its id in the set, and the shape or the kind that stands for it.
  hero?: Record<string, string>
  // Shapes left out of this wood: one grown in the open has no place in a close one.
  without?: string[]
  // A species whose leaves are another's: the aspen's own were photographed in autumn, gold.
  leaves?: Record<string, string>
  // A colour a species' leaves are multiplied by. `*` is every species': leaves photographed by day are too bright
  // for a night. `bark` is every trunk's.
  tint?: Record<string, string>
  // How much taller a model stands than the tree it replaces: an old wood's crowns begin well overhead.
  taller?: number
  // Beyond this many metres from where the scene is played, the share of trees that are stood at all. In haze the
  // far wood only has to close the horizon.
  thin?: [number, number]
  // Modelled shrubs (bush1/bush2) tucked near trunk bases and around the outer woods to fill the eye-level mid-layer.
  understory?: {
    byTrunks?: number
    ring?: { count: number; minR: number; maxR: number; clear?: [number, number, number][] }
    height?: [number, number]
  }
}

interface Part {
  type?: string
  id?: string
  at?: number[]
  materials?: Record<string, string>
  item?: Part
  items?: { item: Part }[]
  children?: Part[]
}
interface SetLike {
  objects: Part[]
  materials?: Record<string, object>
}
interface Trunk {
  kind: string
  x: number
  z: number
  r: number
  height?: number
}
// A shape, as trees.json lists it: its kind, whose bark and leaves it wears, its three files from heavy to light, and
// its height in its own units.
interface Shape {
  name: string
  kind: string
  species: string
  leaves?: string
  files: string[]
  height: number
  alphaTest?: number
}

// The materials a built tree is made of (packages/stage/src/builders/forest.ts).
const SLOTS = ["bark", "birch", "leaves", "leavesDark", "leavesLight", "moss"]
const OWN = "swapped-"
const trees = (parts: Part[], each: (tree: Part) => void) => {
  for (const p of parts) {
    for (const t of [p, p.item, ...(p.items ?? []).map((i) => i.item)]) if (t?.type === "tree") each(t)
    if (p.children) trees(p.children, each)
  }
}

// Before the stage is built: every tree in the set is told to use materials of its own.
export function markBuiltTrees(set: SetLike) {
  const own = Object.fromEntries(SLOTS.filter((s) => set.materials?.[s]).map((s) => [s, OWN + s]))
  for (const [from, to] of Object.entries(own)) (set.materials as Record<string, object>)[to] = { ...(set.materials as Record<string, object>)[from] }
  trees(set.objects, (t) => {
    t.materials = { ...own, ...t.materials }
  })
}

// A number from 0 to 1 that a place on the ground always gives.
const chance = (x: number, z: number, salt: number) => {
  const n = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453
  return n - Math.floor(n)
}

// Once the stage is built: the built trees go out of sight and a model stands on each one's footprint.
export async function standTrees(stage: Stage, footprints: unknown, set: SetLike, swap: TreeSwap) {
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js")
  const listed = ((await (await fetch(`${swap.files}/trees.json`)).json()) as { variants: Shape[] }).variants.filter((v) => !swap.without?.includes(v.name))
  stage.world.traverse((m) => {
    if (m.name.startsWith(`static:${OWN}`)) m.visible = false
  })
  const away = (t: Trunk) => Math.hypot(t.x - swap.near[0], t.z - swap.near[1])
  // A trunk is a round footprint as tall as a tree: a rock or a bush is round and low.
  const trunks = (footprints as Trunk[])
    .filter((f) => f.kind === "circle" && f.r < 2.5 && (f.height ?? 0) >= 5)
    .filter((t) => !swap.thin || away(t) < swap.thin[0] || chance(t.x, t.z, 6) < swap.thin[1])
  const heroes: { at: number[]; shape: string }[] = []
  trees(set.objects, (t) => {
    if (t.id && t.at && swap.hero?.[t.id]) heroes.push({ at: t.at, shape: swap.hero[t.id] })
  })
  const shares = Object.entries(swap.kinds).filter(([kind]) => listed.some((v) => v.kind === kind))
  const whole = shares.reduce((n, [, share]) => n + share, 0)
  const ofKind = (kind: string) => listed.filter((v) => v.kind === kind)
  // A kind's shapes are not all one size: a young spruce stands under an old one. Each is as tall, beside its kind's
  // middle height, as it was grown.
  const middle = (kind: string) => {
    const tall = ofKind(kind)
      .map((v) => v.height)
      .sort((a, b) => a - b)
    return tall[Math.floor(tall.length / 2)] ?? 1
  }
  const pick = (x: number, z: number): Shape => {
    const hero = heroes.find((h) => Math.hypot(h.at[0] - x, h.at[1] - z) < 0.2)
    const named = hero && (listed.find((v) => v.name === hero.shape) ?? ofKind(hero.shape)[0])
    if (named) return named
    let n = chance(x, z, 1) * whole
    let kind = shares[0][0]
    for (const [k, share] of shares) {
      kind = k
      if ((n -= share) <= 0) break
    }
    const shapes = ofKind(kind)
    return shapes[Math.floor(chance(x, z, 7) * shapes.length) % shapes.length]
  }
  // Each tree's shape and weight.
  const stands = new Map<string, { shape: Shape; weight: number; where: Trunk[] }>()
  for (const t of trunks) {
    const shape = pick(t.x, t.z)
    const weight = away(t) < swap.rings[0] ? 0 : away(t) < swap.rings[1] ? 1 : 2
    const key = `${shape.name}-${weight}`
    const stand = stands.get(key) ?? { shape, weight, where: [] }
    stand.where.push(t)
    stands.set(key, stand)
  }

  // Optional modelled woodland shrubs (bush1/bush2) tucked around trunk bases and filling the outer mid-layer.
  const bushes = listed.filter((v) => v.kind === "bush")
  if (swap.understory && bushes.length) {
    const [hMin, hMax] = swap.understory.height ?? [1.1, 2.3]
    const clears = swap.understory.ring?.clear ?? []
    const isClear = (x: number, z: number) => clears.some(([cx, cz, r]) => (x - cx) ** 2 + (z - cz) ** 2 < r * r)
    const addShrub = (x: number, z: number, salt: number) => {
      if (isClear(x, z)) return
      const shape = bushes[Math.floor(chance(x, z, salt) * bushes.length) % bushes.length]
      const weight = away({ kind: "circle", x, z, r: 0.6 }) < swap.rings[0] ? 1 : 2
      const key = `${shape.name}-${weight}`
      const stand = stands.get(key) ?? { shape, weight, where: [] }
      const h = hMin + (hMax - hMin) * chance(x, z, salt + 13)
      stand.where.push({ kind: "circle", x, z, r: 0.6, height: h / (swap.taller ?? 1) })
      stands.set(key, stand)
    }
    const byTrunks = swap.understory.byTrunks ?? 0
    if (byTrunks > 0) {
      for (const t of trunks) {
        const d = away(t)
        if (d > 52) continue
        if (chance(t.x, t.z, 21) > byTrunks) continue
        const ang = chance(t.x, t.z, 22) * Math.PI * 2
        const off = 1.0 + chance(t.x, t.z, 23) * 1.4
        addShrub(t.x + Math.cos(ang) * off, t.z + Math.sin(ang) * off, 24)
      }
    }
    const ring = swap.understory.ring
    if (ring && ring.count > 0) {
      for (let i = 0; i < ring.count; i++) {
        const a = (i / ring.count) * Math.PI * 2 + (chance(i, 3.1, 31) - 0.5) * 0.25
        const r = ring.minR + (ring.maxR - ring.minR) * Math.sqrt(chance(i, 7.3, 32))
        addShrub(swap.near[0] + Math.cos(a) * r, swap.near[1] + Math.sin(a) * r, 33 + (i % 7))
      }
    }
  }

  // One bark and one leaf material to a species, whatever the shape or the weight.
  const pictures = new THREE.TextureLoader()
  const picture = (file: string, colour: boolean) => {
    const map = pictures.load(`${swap.files}/textures/${file}`)
    map.flipY = false
    map.wrapS = map.wrapT = THREE.RepeatWrapping
    map.anisotropy = 4
    if (colour) map.colorSpace = THREE.SRGBColorSpace
    return map
  }
  const materials = new Map<string, THREE.MeshStandardMaterial>()
  const bark = (species: string) => {
    const had = materials.get(`bark:${species}`)
    if (had) return had
    const made = new THREE.MeshStandardMaterial({
      map: picture(`${species}-bark-color.jpg`, true),
      normalMap: picture(`${species}-bark-normal.jpg`, false),
      roughnessMap: picture(`${species}-bark-roughness.jpg`, false),
      roughness: 0.88,
      metalness: 0,
    })
    made.normalScale.setScalar(1.6)
    if (swap.tint?.bark) made.color.multiply(new THREE.Color(swap.tint.bark))
    materials.set(`bark:${species}`, made)
    return made
  }
  const leaves = (shape: Shape) => {
    const species = swap.leaves?.[shape.leaves ?? shape.species] ?? shape.leaves ?? shape.species
    const key = `leaves:${species}:${shape.species}`
    const had = materials.get(key)
    if (had) return had
    // Cut out, never blended: blended cards sort wrongly against each other and against the haze.
    const made = new THREE.MeshStandardMaterial({ map: picture(`${species}-leaves.png`, true), alphaTest: shape.alphaTest ?? 0.5, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 })
    for (const tint of [swap.tint?.["*"], swap.tint?.[shape.species]]) if (tint) made.color.multiply(new THREE.Color(tint))
    materials.set(key, made)
    return made
  }

  const group = new THREE.Group()
  group.name = "lab:trees"
  const made: THREE.BufferGeometry[] = []
  const at = new THREE.Object3D()
  const tone = new THREE.Color()
  const build = async ({ shape, weight, where }: { shape: Shape; weight: number; where: Trunk[] }) => {
    const model = (await new GLTFLoader().loadAsync(`${swap.files}/${shape.files[weight]}`)).scene
    model.updateMatrixWorld(true)
    const grown = shape.height / middle(shape.kind)
    model.traverse((m) => {
      if (!(m instanceof THREE.Mesh)) return
      const leafy = /leaves/i.test(m.name) || /leaves/i.test((m.material as THREE.Material).name)
      const geometry = m.geometry.clone().applyMatrix4(m.matrixWorld)
      const mesh = new THREE.InstancedMesh(geometry, leafy ? leaves(shape) : bark(shape.species), where.length)
      mesh.name = `lab:trees:${shape.name}:${weight}:${leafy ? "leaves" : "bark"}`
      // Shadows are dear: every leaf card is drawn again for each light that throws them. The near trees throw
      // theirs whole, the middle ones their trunks' alone, and the far ones none.
      mesh.castShadow = weight === 0 || (weight === 1 && !leafy)
      mesh.receiveShadow = true
      where.forEach((t, i) => {
        // As tall as the tree it replaces, times how its shape was grown beside its kind: never under a third of it.
        const size = ((t.height as number) * (swap.taller ?? 1) * THREE.MathUtils.clamp(grown, 0.34, 1.35)) / shape.height
        at.position.set(t.x, 0, t.z)
        // Turned any way, and a little off the plumb: no two stand alike.
        const lean = chance(t.x, t.z, 8) * 0.07
        const toward = chance(t.x, t.z, 9) * Math.PI * 2
        at.rotation.set(Math.cos(toward) * lean, chance(t.x, t.z, 2) * Math.PI * 2, Math.sin(toward) * lean, "YXZ")
        at.scale.set(size * (0.86 + 0.3 * chance(t.x, t.z, 3)), size * (0.92 + 0.16 * chance(t.x, t.z, 10)), size * (0.86 + 0.3 * chance(t.x, t.z, 4)))
        at.updateMatrix()
        mesh.setMatrixAt(i, at.matrix)
        // Nor of one colour: leaves a little darker, paler, yellower or bluer, tree by tree, and bark darker or paler.
        const light = 0.7 + 0.42 * chance(t.x, t.z, 5)
        const warm = leafy ? 0.14 * (chance(t.x, t.z, 11) - 0.5) : 0
        mesh.setColorAt(i, tone.setRGB(light * (1 + warm), light, light * (1 - warm * 1.6)))
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
      made.push(geometry)
      group.add(mesh)
    })
  }
  // A few files at a time: sixty decoded at once is a spike of memory for nothing.
  const queue = [...stands.values()]
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let next = queue.pop(); next; next = queue.pop()) await build(next)
    })
  )
  stage.scene.add(group)
  return {
    count: trunks.length,
    shapes: new Set([...stands.values()].map((s) => s.shape.name)).size,
    stop: () => {
      group.removeFromParent()
      for (const geometry of made) geometry.dispose()
      for (const material of materials.values()) {
        for (const map of [material.map, material.normalMap, material.roughnessMap]) map?.dispose()
        material.dispose()
      }
    },
  }
}
