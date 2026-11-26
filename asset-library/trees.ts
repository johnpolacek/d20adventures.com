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
// footprints: what blocks a walk stays as it was. Its trees are only given materials of their own, so that what was
// built of them can be put out of sight, and a model is stood on each one's footprint, as tall as it was. A model is
// thicker than the tree it replaces and spreads roots, which no footprint knows: the camera asks the GPU what a view
// really shows before it takes one (Stage.drawn). Models are drawn as instances, in three weights by how far they stand from where the scene is played.

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

  // What follows is asked for by a look and left alone by any other: a close wood at night wants it, a dooryard by day
  // does not.

  // Parts of the set's own trees left in sight under the models, by material slot: `moss` keeps its hanging beards,
  // which no model carries.
  keep?: string[]

  // Where the game is played, x0,z0,x1,z1: nothing is stood in it but on the set's own trunks.
  play?: number[]
  // How many smaller cards each leaf card is cut into, by weight from heavy to light. A card is a photograph of a twig
  // as long as an arm, and from under the tree its leaves are as big as hands.
  cards?: number[]
  // Leaf edges smoothed by the frame's samples, and their pale rim, the photograph's white ground, taken off.
  smooth?: boolean
  // How much thicker an old trunk is low down than the model it was grown as, from and to, and how far one leans.
  girth?: [number, number]
  lean?: number
  // The bark at night. `rim`: the moon's colour along a trunk's edge on its side, and how strong. `moss`: the colour
  // the foot of a trunk is grown over. `roots`: roots spread from each near trunk. `stubs`: how many low dead branches a
  // near trunk carries, on average. `limbs`: the share of near trunks with a broken limb hung on them or leant on them.
  bark?: { rim?: [string, number]; moss?: string; roots?: boolean; stubs?: number; limbs?: number }
  // A wood that goes on: more trees stood beyond the set's own, as far as the haze, from and to so many metres from
  // where the scene is played. They are not the set's, so nothing reads them: the rules never meet them.
  // Drawn at the lightest weight with only `leaves` of its leaf cards: past the near wood a crown is a dark shape in
  // the haze, and its trunk is what closes the gap.
  beyond?: { count: number; from: number; to: number; height: [number, number]; leaves?: number }
  // What grows under the crowns: saplings, young spruce, snags, by shape and share, as tall as `height` in metres.
  // Never where the game is played (`play`), nor where the set keeps clear.
  under?: { count: number; from: number; to: number; shapes: Record<string, number>; height: [number, number] }
}

interface Part {
  type?: string
  id?: string
  at?: number[]
  materials?: Record<string, string>
  item?: Part
  items?: { item: Part }[]
  children?: Part[]
  clear?: number[][]
}
interface SetLike {
  objects: Part[]
  materials?: Record<string, object>
  marks?: Record<string, { at: number[] }>
}
interface Trunk {
  kind: string
  x: number
  z: number
  r: number
  height?: number
  // Stood by the look and not by the set: its shape, and how tall it stands in metres, whatever its kind.
  shape?: string
  tall?: number
  far?: boolean
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
  lowestBranchShare?: number
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

// A tube that bends and tapers through its points: a root, a dead branch. Its rings are `sides` round, and the bark's
// picture runs along it once to every `tile` of its length.
interface Built {
  position: number[]
  normal: number[]
  uv: number[]
  index: number[]
}
const built = (): Built => ({ position: [], normal: [], uv: [], index: [] })
function tube(into: Built, points: THREE.Vector3[], radii: number[], sides: number, tile = 1, steps = Math.max(points.length * 2, 6)) {
  const curve = new THREE.CatmullRomCurve3(points)
  const frames = curve.computeFrenetFrames(steps, false)
  const base = into.position.length / 3
  let run = 0
  let last = curve.getPointAt(0)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const p = curve.getPointAt(t)
    run += p.distanceTo(last)
    last = p
    const k = t * (radii.length - 1)
    const j = Math.min(Math.floor(k), radii.length - 2)
    const r = THREE.MathUtils.lerp(radii[j], radii[j + 1], k - j)
    const n = frames.normals[i]
    const b = frames.binormals[i]
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * Math.PI * 2
      const [c, si] = [Math.cos(a), Math.sin(a)]
      const [nx, ny, nz] = [n.x * c + b.x * si, n.y * c + b.y * si, n.z * c + b.z * si]
      into.position.push(p.x + nx * r, p.y + ny * r, p.z + nz * r)
      into.normal.push(nx, ny, nz)
      into.uv.push(s / sides, run / tile)
    }
  }
  for (let i = 0; i < steps; i++)
    for (let s = 0; s < sides; s++) {
      const a = base + i * (sides + 1) + s
      const b = a + sides + 1
      into.index.push(a, a + 1, b, b, a + 1, b + 1)
    }
}
const geometryOf = (b: Built) => {
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute(b.position, 3))
  g.setAttribute("normal", new THREE.Float32BufferAttribute(b.normal, 3))
  g.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2))
  g.setIndex(b.index)
  return g
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

// Roots spread from a trunk's foot, in the trunk's own measure: its radius is one. They leave it above the ground and
// go into the ground a trunk's width or two out, each its own way.
function rootsGeometry() {
  const g = built()
  const n = 7
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + (chance(k, 1, 40) - 0.5) * 0.7
    const long = 1 + chance(k, 2, 41) * 1.8
    const wander = (chance(k, 3, 42) - 0.5) * 0.9
    const thick = 0.7 + chance(k, 4, 43) * 0.6
    const at = (out: number, y: number, side: number) => V(Math.cos(a) * out - Math.sin(a) * side, y, Math.sin(a) * out + Math.cos(a) * side)
    tube(g, [at(0.45, 1.2, 0), at(0.92, 0.5, wander * 0.15), at(1 + long * 0.45, 0.1, wander * 0.55), at(1 + long, -0.14, wander)], [0.36 * thick, 0.28 * thick, 0.13 * thick, 0.03], 5, 2, 6)
  }
  return geometryOf(g)
}
// A dead branch a metre long, out along x from where it leaves the trunk, with a twig off it.
function stubGeometry() {
  const g = built()
  tube(g, [V(-0.08, 0, 0), V(0.35, 0.03, 0.02), V(0.7, -0.01, -0.04), V(1, -0.08, 0.02)], [0.05, 0.036, 0.02, 0.006], 5, 0.7)
  tube(g, [V(0.42, 0.03, 0.02), V(0.6, 0.14, 0.09), V(0.8, 0.2, 0.17)], [0.016, 0.01, 0.003], 4, 0.7)
  return geometryOf(g)
}
// A broken limb a metre long, down along -y from where it hangs, crooked, with two twigs.
function limbGeometry() {
  const g = built()
  tube(g, [V(0, 0.04, 0), V(0.05, -0.3, 0.03), V(-0.02, -0.62, 0.07), V(0.06, -1, 0.02)], [0.04, 0.032, 0.02, 0.007], 5, 0.7)
  tube(g, [V(0.03, -0.4, 0.05), V(0.15, -0.55, 0.1), V(0.24, -0.76, 0.13)], [0.013, 0.008, 0.003], 4, 0.7)
  tube(g, [V(-0.01, -0.7, 0.06), V(-0.12, -0.83, 0), V(-0.17, -0.98, -0.05)], [0.011, 0.007, 0.003], 4, 0.7)
  return geometryOf(g)
}

// Under one, only that share of the cards is kept.
//
// Each leaf card cut into n smaller ones about its middle, each the whole picture, turned a little in its plane and
// set a little off, as large in all as the one: the crown is as full, and its leaves are smaller. A card is four
// corners in a row, two triangles; any other geometry is left as it is.
function finer(geometry: THREE.BufferGeometry, n: number) {
  const p = geometry.attributes.position
  const nr = geometry.attributes.normal
  const uv = geometry.attributes.uv
  if (n === 1 || !geometry.index || !uv || !nr || p.count % 4 || geometry.index.count !== p.count * 1.5) return geometry
  if (n < 1) {
    const kept: number[] = []
    const all = geometry.index.array
    for (let c = 0; c < p.count / 4; c++) if (chance(c, 5, 60) < n) for (let k = 0; k < 6; k++) kept.push(all[c * 6 + k])
    geometry.setIndex(kept)
    return geometry
  }
  const places = n === 2 ? [[-0.19, 0.17], [0.19, -0.17]] : n === 3 ? [[0, 0.23], [-0.21, -0.12], [0.21, -0.12]] : [[-0.24, 0.24], [0.24, 0.24], [-0.24, -0.24], [0.24, -0.24]]
  const size = 1.04 / Math.sqrt(places.length)
  const cards = p.count / 4
  const position = new Float32Array(cards * places.length * 12)
  const normal = new Float32Array(cards * places.length * 12)
  const uvs = new Float32Array(cards * places.length * 8)
  const index: number[] = []
  const corner = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  const at = new THREE.Vector3()
  const CORNERS = [
    [0, 1],
    [0, 0],
    [1, 0],
    [1, 1],
  ]
  let v = 0
  for (let c = 0; c < cards; c++) {
    // The card's corners by the picture's: 00, 10, 11, 01.
    for (let k = 0; k < 4; k++) {
      const i = c * 4 + k
      corner[[0, 1, 3, 2][Math.round(uv.getX(i)) + 2 * Math.round(uv.getY(i))]].fromBufferAttribute(p, i)
    }
    // Where a point of the picture is on the card: the card is flat and square-cornered, so its corners give it.
    const on = (s: number, t: number) =>
      at
        .copy(corner[0])
        .multiplyScalar((1 - s) * (1 - t))
        .addScaledVector(corner[1], s * (1 - t))
        .addScaledVector(corner[2], s * t)
        .addScaledVector(corner[3], (1 - s) * t)
    const nx = nr.getX(c * 4)
    const ny = nr.getY(c * 4)
    const nz = nr.getZ(c * 4)
    places.forEach(([ox, oy], j) => {
      const turn = (chance(c, j, 61) - 0.5) * 1.1
      const big = size * (0.88 + 0.24 * chance(c, j, 62))
      const cx = 0.5 + ox + (chance(c, j, 63) - 0.5) * 0.1
      const cy = 0.5 + oy + (chance(c, j, 64) - 0.5) * 0.1
      const [cs, sn] = [Math.cos(turn), Math.sin(turn)]
      for (const [u, w] of CORNERS) {
        const [du, dw] = [(u - 0.5) * big, (w - 0.5) * big]
        on(cx + du * cs - dw * sn, cy + du * sn + dw * cs)
        position.set([at.x, at.y, at.z], v * 3)
        normal.set([nx, ny, nz], v * 3)
        uvs.set([u, w], v * 2)
        v++
      }
      const b = v - 4
      index.push(b, b + 1, b + 2, b, b + 2, b + 3)
    })
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.BufferAttribute(position, 3))
  g.setAttribute("normal", new THREE.BufferAttribute(normal, 3))
  g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2))
  g.setIndex(index)
  geometry.dispose()
  return g
}

// A shape's trunk below its crown, where nothing grows from it: its middle and its radius at each height, in the
// model's own units.
interface Bole {
  at: (y: number) => { x: number; z: number; r: number }
  top: number
}
function boleOf(geometry: THREE.BufferGeometry, shape: Shape): Bole {
  const top = (shape.lowestBranchShare ?? 0.35) * shape.height * 0.9
  const bins = 14
  const p = geometry.attributes.position
  const sum = Array.from({ length: bins }, () => ({ x: 0, z: 0, n: 0, r: 0 }))
  const bin = (y: number) => Math.min(bins - 1, Math.floor((y / top) * bins))
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    if (y < 0 || y >= top) continue
    const s = sum[bin(y)]
    s.x += p.getX(i)
    s.z += p.getZ(i)
    s.n++
  }
  for (const s of sum) if (s.n) [s.x, s.z] = [s.x / s.n, s.z / s.n]
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    if (y < 0 || y >= top) continue
    const s = sum[bin(y)]
    s.r += Math.hypot(p.getX(i) - s.x, p.getZ(i) - s.z) / s.n
  }
  // A height with no ring of its own takes the nearest that has one.
  const had = sum.map((s, i) => (s.n ? i : -1)).filter((i) => i >= 0)
  const ring = (i: number) => sum[had.reduce((a, b) => (Math.abs(b - i) < Math.abs(a - i) ? b : a), had[0] ?? 0)]
  return {
    top,
    at: (y: number) => {
      if (!had.length) return { x: 0, z: 0, r: shape.height * 0.02 }
      const k = THREE.MathUtils.clamp((y / top) * bins - 0.5, 0, bins - 1)
      const [a, b] = [ring(Math.floor(k)), ring(Math.ceil(k))]
      const f = k - Math.floor(k)
      return { x: THREE.MathUtils.lerp(a.x, b.x, f), z: THREE.MathUtils.lerp(a.z, b.z, f), r: THREE.MathUtils.lerp(a.r, b.r, f) }
    },
  }
}

// A leaf photograph's middle colour, sRGB: what its pale rim is taken back to.
const LEAF_MEAN: Record<string, [number, number, number]> = { oak: [93, 124, 51], ash: [85, 120, 48], pine: [88, 109, 39], aspen: [85, 120, 48] }

// Once the stage is built: the built trees go out of sight and a model stands on each one's footprint.
export async function standTrees(stage: Stage, footprints: unknown, set: SetLike, swap: TreeSwap) {
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js")
  const listed = ((await (await fetch(`${swap.files}/trees.json`)).json()) as { variants: Shape[] }).variants.filter((v) => !swap.without?.includes(v.name))
  stage.world.traverse((m) => {
    if (m.name.startsWith(`static:${OWN}`) && !swap.keep?.some((k) => m.name.startsWith(`static:${OWN}${k}`))) m.visible = false
  })
  const away = (t: { x: number; z: number }) => Math.hypot(t.x - swap.near[0], t.z - swap.near[1])
  // A trunk is a round footprint as tall as a tree: a rock or a bush is round and low.
  const trunks = (footprints as Trunk[])
    .filter((f) => f.kind === "circle" && f.r < 2.5 && (f.height ?? 0) >= 5)
    .filter((t) => !swap.thin || away(t) < swap.thin[0] || chance(t.x, t.z, 6) < swap.thin[1])

  // Where the set keeps clear: the trail, its glades and every mark, by the circles its wood is scattered clear of.
  // Nothing the look adds stands, hangs or leans there.
  const keep: number[][] = []
  for (const p of set.objects) {
    const wooded = [p.item, ...(p.items ?? []).map((i) => i.item)].some((i) => i?.type === "tree")
    if (p.type === "scatter" && wooded) for (const c of p.clear ?? []) if (c[2] < 20) keep.push(c)
  }
  for (const m of Object.values(set.marks ?? {})) keep.push([m.at[0], m.at[1], 2.5])
  const kept = (x: number, z: number, pad = 0) => keep.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r + pad)
  const play = swap.play
  const inPlay = (x: number, z: number, pad = 0) => !!play && x > play[0] - pad && x < play[2] + pad && z > play[1] - pad && z < play[3] + pad
  const stood: Trunk[] = [...trunks]
  const crowded = (x: number, z: number, d: number) => stood.some((t) => Math.hypot(t.x - x, t.z - z) < d)
  // A place in a ring about where the scene is played, the nth try of a kind.
  const ring = (i: number, salt: number, from: number, to: number) => {
    const a = chance(i, 1.7, salt) * Math.PI * 2
    const d = Math.sqrt(THREE.MathUtils.lerp(from * from, to * to, chance(i, 2.3, salt + 1)))
    return { x: swap.near[0] + Math.cos(a) * d, z: swap.near[1] + Math.sin(a) * d, n: chance(i, 3.1, salt + 2) }
  }
  if (swap.beyond) {
    const b = swap.beyond
    for (let i = 0, made = 0; made < b.count && i < b.count * 8; i++) {
      const { x, z, n } = ring(i, 51, b.from, b.to)
      if (kept(x, z, 2) || inPlay(x, z, 2) || crowded(x, z, 2.6)) continue
      stood.push({ kind: "circle", x, z, r: 0.5, height: THREE.MathUtils.lerp(b.height[0], b.height[1], n), far: true })
      made++
    }
  }
  if (swap.under) {
    const u = swap.under
    const shapes = Object.entries(u.shapes).filter(([name]) => listed.some((v) => v.name === name))
    const whole = shapes.reduce((n, [, share]) => n + share, 0)
    for (let i = 0, made = 0; shapes.length && made < u.count && i < u.count * 10; i++) {
      const { x, z, n } = ring(i, 71, u.from, u.to)
      if (kept(x, z, 1.5) || inPlay(x, z, 1) || crowded(x, z, 1.4)) continue
      let left = chance(x, z, 72) * whole
      const shape = shapes.find(([, share]) => (left -= share) <= 0)?.[0] ?? shapes[0][0]
      stood.push({ kind: "circle", x, z, r: 0.2, shape, tall: THREE.MathUtils.lerp(u.height[0], u.height[1], n) })
      made++
    }
  }

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
  const pick = (t: Trunk): Shape => {
    const own = t.shape && listed.find((v) => v.name === t.shape)
    if (own) return own
    const { x, z } = t
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
  for (const t of stood) {
    const shape = pick(t)
    // A tree the look stands beyond the set's is a weight of its own: the lightest, thinned.
    const weight = t.far ? 3 : away(t) < swap.rings[0] ? 0 : away(t) < swap.rings[1] ? 1 : 2
    const key = `${shape.name}-${weight}`
    const stand = stands.get(key) ?? { shape, weight, where: [] }
    stand.where.push(t)
    stands.set(key, stand)
  }

  // One bark and one leaf material to a species, whatever the shape or the weight.
  // Each picture is waited for before the trees go up: drawn before its picture is in, a leaf card is cut away whole
  // and the wood shows as bare ground for a moment, then fills in.
  const pictures = new THREE.TextureLoader()
  const painting: Promise<unknown>[] = []
  const picture = (file: string, colour: boolean) => {
    let map!: THREE.Texture
    painting.push(new Promise((done) => (map = pictures.load(`${swap.files}/textures/${file}`, done, undefined, done))))
    map.flipY = false
    map.wrapS = map.wrapT = THREE.RepeatWrapping
    map.anisotropy = 4
    if (colour) map.colorSpace = THREE.SRGBColorSpace
    return map
  }
  // The moon's way, from the stage's own light: its edge comes down the side of a trunk that faces it.
  const sun = (stage as unknown as { sun?: THREE.DirectionalLight }).sun
  const moon = sun ? sun.position.clone().sub(sun.target.position).normalize() : new THREE.Vector3(0, 0.7, -0.7)
  const materials = new Map<string, THREE.MeshStandardMaterial>()
  const bark = (species: string) => {
    const had = materials.get(`bark:${species}`)
    if (had) return had
    const made = new THREE.MeshStandardMaterial({
      map: picture(`${species}-bark-color.jpg`, true),
      normalMap: picture(`${species}-bark-normal.jpg`, false),
      roughnessMap: picture(`${species}-bark-roughness.jpg`, false),
      roughness: 1,
      metalness: 0,
    })
    made.normalScale.setScalar(1.6)
    if (swap.tint?.bark) made.color.multiply(new THREE.Color(swap.tint.bark))
    if (swap.girth || swap.bark) dressBark(made, swap, moon)
    materials.set(`bark:${species}`, made)
    return made
  }
  const leaves = (shape: Shape) => {
    const species = swap.leaves?.[shape.leaves ?? shape.species] ?? shape.leaves ?? shape.species
    const key = `leaves:${species}:${shape.species}`
    const had = materials.get(key)
    if (had) return had
    // Cut out, never blended: blended cards sort wrongly against each other and against the haze. Smoothed, a cut
    // edge is spread over the frame's samples.
    const made = new THREE.MeshStandardMaterial({ map: picture(`${species}-leaves.png`, true), alphaTest: shape.alphaTest ?? 0.5, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 })
    for (const tint of [swap.tint?.["*"], swap.tint?.[shape.species]]) if (tint) made.color.multiply(new THREE.Color(tint))
    if (swap.smooth) smoothLeaves(made, LEAF_MEAN[species] ?? LEAF_MEAN.oak)
    materials.set(key, made)
    return made
  }

  const group = new THREE.Group()
  group.name = "lab:trees"
  const made: THREE.BufferGeometry[] = []
  const at = new THREE.Object3D()
  const tone = new THREE.Color()
  // What the trunks near enough to be looked at carry, once every shape is in: where each stands and how thick.
  const boles = new Map<string, Bole>()
  const near: { t: Trunk; shape: Shape; matrix: THREE.Matrix4; girth: number }[] = []
  const [thin, thick] = swap.girth ?? [1, 1]
  const build = async ({ shape, weight, where }: { shape: Shape; weight: number; where: Trunk[] }) => {
    const model = (await new GLTFLoader().loadAsync(`${swap.files}/${shape.files[Math.min(weight, 2)]}`)).scene
    model.updateMatrixWorld(true)
    const grown = shape.height / middle(shape.kind)
    // Where each stands, how big and how thick, first: its bark and its leaves are stood alike.
    const crown = (shape.lowestBranchShare ?? 0.35) * shape.height
    const placed = where.map((t) => {
      // As tall as the tree it replaces, times how its shape was grown beside its kind: never under a third of it.
      // One the look stands is as tall as it says.
      const size = t.tall ? t.tall / shape.height : ((t.height as number) * (swap.taller ?? 1) * THREE.MathUtils.clamp(grown, 0.34, 1.35)) / shape.height
      at.position.set(t.x, 0, t.z)
      // Turned any way, and a little off the plumb: no two stand alike. One far from where the set keeps clear may
      // lean more: it leans over no one.
      const most = swap.lean && !kept(t.x, t.z, 9) ? swap.lean : 0.07
      const lean = chance(t.x, t.z, 8) * most
      const toward = chance(t.x, t.z, 9) * Math.PI * 2
      at.rotation.set(Math.cos(toward) * lean, chance(t.x, t.z, 2) * Math.PI * 2, Math.sin(toward) * lean, "YXZ")
      at.scale.set(size * (0.86 + 0.3 * chance(t.x, t.z, 3)), size * (0.92 + 0.16 * chance(t.x, t.z, 10)), size * (0.86 + 0.3 * chance(t.x, t.z, 4)))
      at.updateMatrix()
      // An old trunk thicker low down than the model it was grown as; a sapling as it is.
      const girth = t.shape ? 1 : THREE.MathUtils.lerp(thin, thick, chance(t.x, t.z, 12) ** 1.6)
      return { t, matrix: at.matrix.clone(), girth }
    })
    model.traverse((m) => {
      if (!(m instanceof THREE.Mesh)) return
      const leafy = /leaves/i.test(m.name) || /leaves/i.test((m.material as THREE.Material).name)
      let geometry = m.geometry.clone().applyMatrix4(m.matrixWorld)
      const cut = weight === 3 ? swap.beyond?.leaves : swap.cards?.[weight]
      if (leafy && cut) geometry = finer(geometry, cut)
      if (!leafy && (!boles.has(shape.name) || weight === 0)) boles.set(shape.name, boleOf(geometry, shape))
      const mesh = new THREE.InstancedMesh(geometry, leafy ? leaves(shape) : bark(shape.species), where.length)
      mesh.name = `lab:trees:${shape.name}:${weight}:${leafy ? "leaves" : "bark"}`
      // Shadows are dear: every leaf card is drawn again for each light that throws them. The near trees throw
      // theirs whole, the middle ones their trunks' alone, and the far ones none.
      mesh.castShadow = weight === 0 || (weight === 1 && !leafy)
      mesh.receiveShadow = true
      if (!leafy && (swap.girth || swap.bark)) geometry.setAttribute("aGirth", new THREE.InstancedBufferAttribute(new Float32Array(placed.flatMap((p) => [p.girth, crown])), 2))
      placed.forEach(({ t, matrix }, i) => {
        mesh.setMatrixAt(i, matrix)
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
    if (weight < 2 && !shape.name.startsWith("sapling")) for (const p of placed) if (!p.t.shape) near.push({ ...p, shape })
  }
  // A few files at a time: sixty decoded at once is a spike of memory for nothing.
  const queue = [...stands.values()]
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let next = queue.pop(); next; next = queue.pop()) await build(next)
    })
  )
  if (swap.bark) dress(near)
  await Promise.all(painting)
  stage.scene.add(group)

  // What a near trunk carries: roots at its foot, dead branches low on it, a broken limb hung on it or leant on it.
  // Each is one geometry drawn once for every trunk. Nothing of it reaches where the set keeps clear.
  function dress(trunks: typeof near) {
    const o = swap.bark ?? {}
    const roots: THREE.Matrix4[] = []
    const stubs: THREE.Matrix4[] = []
    const limbs: THREE.Matrix4[] = []
    const local = new THREE.Vector3()
    const out = new THREE.Vector3()
    const turn = new THREE.Quaternion()
    const roll = new THREE.Quaternion()
    const m = new THREE.Matrix4()
    const X = new THREE.Vector3(1, 0, 0)
    const DOWN = new THREE.Vector3(0, -1, 0)
    for (const { t, shape, matrix, girth } of trunks) {
      const bole = boles.get(shape.name)
      if (!bole) continue
      const crown = (shape.lowestBranchShare ?? 0.35) * shape.height
      const thick = (y: number) => THREE.MathUtils.lerp(girth, 1, THREE.MathUtils.smoothstep(y, 0, crown))
      const up = new THREE.Vector3().setFromMatrixColumn(matrix, 1).length()
      // A point on the bark at a height in metres, round the trunk by an angle; and the way out from it.
      const surface = (metres: number, angle: number, into = 0.85) => {
        const y = metres / up
        const b = bole.at(y)
        const r = b.r * thick(y) * into
        local.set(b.x + Math.cos(angle) * r, y, b.z + Math.sin(angle) * r).applyMatrix4(matrix)
        out.set(Math.cos(angle), 0, Math.sin(angle)).transformDirection(matrix)
        return local
      }
      if (o.roots) {
        const b = bole.at(0)
        const r = b.r * girth
        m.compose(V(b.x, 0, b.z), turn.setFromAxisAngle(V(0, 1, 0), chance(t.x, t.z, 20) * Math.PI * 2), V(r * (0.9 + 0.3 * chance(t.x, t.z, 21)), r * 0.9, r * (0.9 + 0.3 * chance(t.x, t.z, 22))))
        roots.push(matrix.clone().multiply(m))
      }
      const lowest = 1.8
      const highest = bole.top * up * 0.95
      const count = Math.round((o.stubs ?? 0) * 2 * chance(t.x, t.z, 23))
      for (let k = 0; k < count && highest > lowest; k++) {
        const angle = chance(t.x + k, t.z, 24) * Math.PI * 2
        const p = surface(THREE.MathUtils.lerp(lowest, highest, chance(t.x, t.z + k, 25)), angle).clone()
        const pitch = THREE.MathUtils.lerp(-0.6, 0.3, chance(t.x - k, t.z, 26))
        const way = V(out.x * Math.cos(pitch), Math.sin(pitch), out.z * Math.cos(pitch)).normalize()
        const long = 0.5 + 1.7 * chance(t.x, t.z - k, 27) ** 2
        const tip = p.clone().addScaledVector(way, long)
        if (kept(tip.x, tip.z, 0.4)) continue
        turn.setFromUnitVectors(X, way).multiply(roll.setFromAxisAngle(X, chance(t.x, t.z, 28 + k) * Math.PI * 2))
        stubs.push(new THREE.Matrix4().compose(p, turn, V(long, long, long)))
      }
      if (chance(t.x, t.z, 30) < (o.limbs ?? 0)) {
        const angle = chance(t.x, t.z, 31) * Math.PI * 2
        // Leant on it, its foot in the ground a stride out, where no one is played; or hung from it, clear of a head.
        const leant = !inPlay(t.x, t.z, 2) && chance(t.x, t.z, 32) < 0.5
        const p = surface(leant ? 2.2 + 2 * chance(t.x, t.z, 33) : Math.min(highest, 4 + 4 * chance(t.x, t.z, 33)), angle, 0.95).clone()
        let way: THREE.Vector3
        let long: number
        if (leant) {
          const foot = surface(0, angle, 1).clone().addScaledVector(out, 1.4 + 1.4 * chance(t.x, t.z, 34))
          foot.y = -0.1
          way = foot.clone().sub(p)
          long = way.length()
          way.normalize()
        } else {
          const swing = 0.15 + 0.4 * chance(t.x, t.z, 35)
          way = V(out.x * Math.sin(swing), -Math.cos(swing), out.z * Math.sin(swing)).normalize()
          long = Math.min(2 + 2.2 * chance(t.x, t.z, 36), (p.y - 2.2) / Math.cos(swing))
        }
        const end = p.clone().addScaledVector(way, long)
        if (long > 1 && !kept(end.x, end.z, 0.6) && !kept(p.x, p.z, 0.6)) {
          turn.setFromUnitVectors(DOWN, way).multiply(roll.setFromAxisAngle(DOWN, chance(t.x, t.z, 37) * Math.PI * 2))
          limbs.push(new THREE.Matrix4().compose(p, turn, V(long, long, long)))
        }
      }
    }
    const lay = (geometry: THREE.BufferGeometry, material: THREE.Material, list: THREE.Matrix4[], name: string, shadow: boolean) => {
      if (!list.length) return
      geometry.setAttribute("aGirth", new THREE.InstancedBufferAttribute(new Float32Array(list.length * 2).fill(1), 2))
      const mesh = new THREE.InstancedMesh(geometry, material, list.length)
      mesh.name = `lab:trees:${name}`
      list.forEach((l, i) => {
        mesh.setMatrixAt(i, l)
        mesh.setColorAt(i, tone.setScalar(0.75 + 0.4 * chance(i, 1, 80)))
      })
      mesh.castShadow = shadow
      mesh.receiveShadow = true
      mesh.computeBoundingSphere()
      made.push(geometry)
      group.add(mesh)
    }
    lay(rootsGeometry(), bark("oak"), roots, "roots", false)
    lay(stubGeometry(), bark("dead"), stubs, "stubs", true)
    lay(limbGeometry(), bark("dead"), limbs, "limbs", true)
  }

  return {
    count: stood.length,
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

// Bark at night, in the shader: a trunk thicker low down as its girth says, moss over its foot, and the moon's light
// along its edge on the side that faces it, caught more by the bark's ridges than its cracks. Every geometry drawn in
// it carries its girth, (1, 1) where there is none to give.
function dressBark(material: THREE.MeshStandardMaterial, swap: TreeSwap, moon: THREE.Vector3) {
  const [rim, strength] = swap.bark?.rim ?? ["#000000", 0]
  const uniforms = {
    uRim: { value: new THREE.Color(rim).multiplyScalar(strength) },
    uMoon: { value: moon.clone() },
    uMoss: { value: new THREE.Color(swap.bark?.moss ?? "#000000") },
    uMossOn: { value: swap.bark?.moss ? 1 : 0 },
  }
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aGirth;\nvarying vec3 vBarkW;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float barkThick = aGirth.x > 0.0 ? aGirth.x : 1.0;
        transformed.xz *= mix(barkThick, 1.0, smoothstep(0.0, max(aGirth.y, 0.001), transformed.y));`
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vec4 barkW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
        barkW = instanceMatrix * barkW;
        #endif
        vBarkW = (modelMatrix * barkW).xyz;`
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform vec3 uRim, uMoon, uMoss; uniform float uMossOn; varying vec3 vBarkW;
        float barkHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float barkNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(barkHash(i), barkHash(i + vec2(1.0, 0.0)), f.x), mix(barkHash(i + vec2(0.0, 1.0)), barkHash(i + vec2(1.0, 1.0)), f.x), f.y); }`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float barkLit = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        float mossUp = 1.0 - smoothstep(0.2, 1.3 + 1.1 * barkNoise(vBarkW.xz * 1.3 + 7.0), vBarkW.y);
        float mossAt = smoothstep(0.38, 0.62, barkNoise(vBarkW.xz * 3.7 + vBarkW.y * 2.9) * 0.7 + barkNoise(vBarkW.xz * 11.0 + vBarkW.y * 8.0) * 0.3);
        float mossK = uMossOn * mossUp * mossAt;
        diffuseColor.rgb = mix(diffuseColor.rgb, uMoss * (0.65 + 0.7 * barkNoise(vBarkW.xz * 19.0 + vBarkW.y * 13.0)), mossK);`
      )
      .replace(
        "#include <opaque_fragment>",
        `{
          vec3 rimEye = normalize(vViewPosition);
          float rimEdge = pow(1.0 - saturate(dot(normal, rimEye)), 2.5);
          vec3 rimTo = normalize((viewMatrix * vec4(uMoon, 0.0)).xyz);
          float rimSide = smoothstep(-0.15, 0.7, dot(normal, rimTo));
          float rimRidge = smoothstep(0.003, 0.05, barkLit);
          outgoingLight += uRim * rimEdge * rimSide * (0.2 + 0.8 * rimRidge) * (1.0 - 0.6 * mossK);
        }
        #include <opaque_fragment>`
      )
  }
  material.customProgramCacheKey = () => "lab-bark-night"
}

// Leaves smoothed at the edge: the cut is spread over the frame's samples, and the photograph's pale rim, where the
// leaf met its white ground, is taken back to the leaf's own colour.
function smoothLeaves(material: THREE.MeshStandardMaterial, mean: [number, number, number]) {
  material.alphaToCoverage = true
  const leaf = { value: new THREE.Color().setRGB(mean[0] / 255, mean[1] / 255, mean[2] / 255, THREE.SRGBColorSpace) }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLeafMean = leaf
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform vec3 uLeafMean;").replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      diffuseColor.rgb = mix(diffuse * uLeafMean, diffuseColor.rgb, smoothstep(0.7, 0.97, diffuseColor.a));`
    )
  }
  material.customProgramCacheKey = () => "lab-leaves-smooth"
}
