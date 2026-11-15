// Trees stood in a place in the stead of the set's own.
//
// A set's trees are built from code: tapered sticks for limbs and balls of leaf cards for crowns. They are quick and
// they read from the game's fixed cameras, under its paintings. Under a camera that goes anywhere they read as
// lollipops (the owner, 2026-11-15). A look can ask for modelled trees instead: grown branch by branch, with crowns of
// cards that are each a photograph of a leafy twig, as a game's trees are made. public/stage/trees holds them, and its
// README says where they came from.
//
// The set is not changed. Every tree in it is still built, where and as tall as the set says, so the engine keeps its
// footprints: what blocks a walk, a camera and a sight line stays as it was. Its trees are only given materials of
// their own, so that what was built of them can be put out of sight, and a model is stood on each one's footprint, as
// tall as it was. Models are drawn as instances, in three weights by how far they stand from where the scene is played.

import type { Stage } from "@d20/stage"
import * as THREE from "three"

export interface TreeSwap {
  // Where the models are served from, as <files>/<kind>-lod<0|1|2>.glb.
  files: string
  // The kinds of model, and the share of the wood each takes.
  kinds: Record<string, number>
  // Where the scene is played, x and z, and how far out the heavy and the middle weights reach, in metres.
  near: [number, number]
  rings: [number, number]
  // A tree set by hand, by its id in the set, and the kind that stands for it.
  hero?: Record<string, string>
  // A colour a kind's leaves are multiplied by: the birch's twigs were photographed in autumn. `*` is every kind's:
  // leaves photographed by day are too bright for a night. `bark` is every trunk's: under a full sun the oak's bark
  // goes the orange of clay.
  tint?: Record<string, string>
  // How much taller a model stands than the tree it replaces: an old wood's crowns begin well overhead. And how
  // broad it stands for its height: a model grown in the open is as wide as it is tall, and a wood of those is a roof.
  taller?: number
  slim?: number
  // Beyond this many metres from where the scene is played, the share of trees that are stood at all. In haze the
  // far wood only has to close the horizon.
  thin?: [number, number]
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
  stage.world.traverse((m) => {
    if (m.name.startsWith(`static:${OWN}`)) m.visible = false
  })
  // A trunk is a round footprint as tall as a tree: a rock or a bush is round and low.
  const away = (t: Trunk) => Math.hypot(t.x - swap.near[0], t.z - swap.near[1])
  const trunks = (footprints as Trunk[])
    .filter((f) => f.kind === "circle" && f.r < 2.5 && (f.height ?? 0) >= 5)
    .filter((t) => !swap.thin || away(t) < swap.thin[0] || chance(t.x, t.z, 6) < swap.thin[1])
  const heroes: { at: number[]; kind: string }[] = []
  trees(set.objects, (t) => {
    if (t.id && t.at && swap.hero?.[t.id]) heroes.push({ at: t.at, kind: swap.hero[t.id] })
  })
  const shares = Object.entries(swap.kinds)
  const whole = shares.reduce((n, [, share]) => n + share, 0)
  const pick = (x: number, z: number) => {
    const hero = heroes.find((h) => Math.hypot(h.at[0] - x, h.at[1] - z) < 0.2)
    if (hero) return hero.kind
    let n = chance(x, z, 1) * whole
    for (const [kind, share] of shares) if ((n -= share) <= 0) return kind
    return shares[0][0]
  }
  // Each tree's kind and weight.
  const stands = new Map<string, Trunk[]>()
  for (const t of trunks) {
    const far = away(t)
    const key = `${pick(t.x, t.z)}-lod${far < swap.rings[0] ? 0 : far < swap.rings[1] ? 1 : 2}`
    stands.set(key, [...(stands.get(key) ?? []), t])
  }
  const group = new THREE.Group()
  group.name = "lab:trees"
  const made: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = []
  const at = new THREE.Object3D()
  // Each weight of a kind comes with its own copy of the same bark and leaf pictures. One copy is kept for each
  // kind, and the rest are let go before they reach the graphics card.
  const shared = new Map<string, THREE.MeshStandardMaterial>()
  const pictures = (m: THREE.MeshStandardMaterial) => [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.alphaMap]
  // One file at a time: a dozen models decoded at once is a spike of memory for nothing.
  for (const [key, where] of [...stands].sort(([a], [b]) => a.localeCompare(b))) {
    {
      const gltf = await new GLTFLoader().loadAsync(`${swap.files}/${key}.glb`)
      const model = gltf.scene
      model.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(model)
      const tall = Math.max(1e-3, box.max.y - box.min.y)
      const [kind, weight] = key.split("-lod")
      model.traverse((m) => {
        if (!(m instanceof THREE.Mesh)) return
        const geometry = m.geometry.clone().applyMatrix4(m.matrixWorld).translate(0, -box.min.y, 0)
        const own = m.material as THREE.MeshStandardMaterial
        const leafy = own.alphaTest > 0 || own.transparent
        const kept = shared.get(`${kind}:${leafy}`)
        if (kept) {
          for (const map of pictures(own)) map?.dispose()
          own.dispose()
        } else {
          shared.set(`${kind}:${leafy}`, own)
          if (leafy) {
            // Cut out, never blended: blended cards sort wrongly against each other and against the haze.
            own.transparent = false
            own.alphaTest = own.alphaTest || 0.4
            own.side = THREE.DoubleSide
            for (const tint of [swap.tint?.["*"], swap.tint?.[kind]]) if (tint) own.color.multiply(new THREE.Color(tint))
          } else if (swap.tint?.bark) own.color.multiply(new THREE.Color(swap.tint.bark))
        }
        const material = kept ?? own
        const mesh = new THREE.InstancedMesh(geometry, material, where.length)
        mesh.name = `lab:trees:${key}:${leafy ? "leaves" : "bark"}`
        // Shadows are dear: every leaf card is drawn again for each light that throws them. The near trees throw
        // theirs whole, the middle ones their trunks' alone, and the far ones none.
        mesh.castShadow = weight === "0" || (weight === "1" && !leafy)
        mesh.receiveShadow = true
        where.forEach((t, i) => {
          const size = ((t.height as number) * (swap.taller ?? 1)) / tall
          at.position.set(t.x, 0, t.z)
          at.rotation.set(0, chance(t.x, t.z, 2) * Math.PI * 2, 0)
          // No two as broad as each other.
          const broad = size * (swap.slim ?? 1)
          at.scale.set(broad * (0.9 + 0.25 * chance(t.x, t.z, 3)), size, broad * (0.9 + 0.25 * chance(t.x, t.z, 4)))
          at.updateMatrix()
          mesh.setMatrixAt(i, at.matrix)
          // Nor as light: leaves a little darker or paler, tree by tree.
          if (leafy) mesh.setColorAt(i, new THREE.Color().setScalar(0.72 + 0.4 * chance(t.x, t.z, 5)))
        })
        mesh.instanceMatrix.needsUpdate = true
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
        mesh.computeBoundingSphere()
        made.push({ geometry, material })
        group.add(mesh)
      })
    }
  }
  stage.scene.add(group)
  return {
    count: trunks.length,
    stop: () => {
      group.removeFromParent()
      for (const { geometry, material } of made) {
        geometry.dispose()
        for (const map of pictures(material as THREE.MeshStandardMaterial)) map?.dispose()
        material.dispose()
      }
    },
  }
}
