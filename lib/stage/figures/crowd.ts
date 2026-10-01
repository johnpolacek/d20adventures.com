import * as THREE from "three"
import type { Rand } from "../kit/rng"
import { hash01 } from "../kit/rng"
import type { SharedUniforms } from "../materials/atmosphere"
import type { MaskCommon } from "../render/character-mask"
import { CardLayer, type CardPerson, type CrowdLibrary } from "./cards"
import { ACCENT, buildPawnGeometries, CLOTH, MILITARY, MILITARY_ACCENT, PAWN_KINDS, type PawnKind, pawnMaterial, TABARD } from "./pawns"

export type CrowdMode = "procedural" | "cards" | "hybrid"

// A polyline walked at constant speed: `loop` jumps back to the start at the end, `pingpong` turns around.
export interface WalkerSeed {
  path: [number, number][]
  mode: "loop" | "pingpong"
  speed: number
  d: number
  lat: number
}
export interface PersonSeed {
  kind: PawnKind
  // The crowd group this person came from, when the group has an id (a loop takes its people from there).
  group?: string
  x: number
  y?: number
  z: number
  ry: number
  s?: number
  walker?: WalkerSeed
}

class PathSampler {
  seg: { ax: number; az: number; dx: number; dz: number; d0: number; len: number }[] = []
  length = 0
  constructor(pts: [number, number][]) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i]
      const [bx, bz] = pts[i + 1]
      const len = Math.hypot(bx - ax, bz - az)
      if (len < 1e-4) continue
      this.seg.push({ ax, az, dx: (bx - ax) / len, dz: (bz - az) / len, d0: this.length, len })
      this.length += len
    }
  }
  at(d: number) {
    d = THREE.MathUtils.clamp(d, 0, this.length)
    const s = this.seg.find((q) => d <= q.d0 + q.len) || this.seg[this.seg.length - 1]
    const t = d - s.d0
    return { x: s.ax + s.dx * t, z: s.az + s.dz * t, dx: s.dx, dz: s.dz }
  }
}

interface Walker {
  path: PathSampler
  mode: "loop" | "pingpong"
  speed: number
  d: number
  lat: number
}
export interface CrowdPerson extends CardPerson {
  kind: PawnKind
  i: number
  card: boolean
  walker?: Walker
}
interface KindSlots {
  mesh: THREE.InstancedMesh
  geo: THREE.BufferGeometry
  iP: THREE.InstancedBufferAttribute
  slot: Person[]
  active: number
  dirty: boolean
}

type Person = CrowdPerson

export interface CrowdOptions {
  seeds: PersonSeed[]
  rand: Rand
  camera: THREE.PerspectiveCamera
  shared: SharedUniforms
  library: CrowdLibrary | null
  mode: CrowdMode
  cardRadius: number
  maxAnisotropy: number
}

// The crowd: every person is drawn either as a procedural pawn (instanced per kind, 5-zone colours) or as an illustrated
// card, never both. Pawn instances are kept compact (the visible ones first, mesh.count cuts off the rest) so hiding a pawn
// removes its vertex cost too, not just its pixels.
export class Crowd {
  group = new THREE.Group()
  people: Person[] = []
  walkers: Person[] = []
  groups = new Map<string, Person[]>()
  kinds = new Map<PawnKind, KindSlots>()
  cards: CardLayer | null
  mode: CrowdMode
  private near: number
  private far: number
  private shallow = true
  private matricesDirty = true
  private dummy = new THREE.Object3D()
  private dir = new THREE.Vector3()
  private material: THREE.Material
  private geos: Record<PawnKind, THREE.BufferGeometry>

  constructor(private o: CrowdOptions) {
    this.mode = o.library ? o.mode : "procedural"
    this.near = o.cardRadius
    this.far = o.cardRadius + 6
    this.group.name = "crowd"
    this.geos = buildPawnGeometries(true)
    this.material = pawnMaterial(o.shared)
    const { rand } = o
    const byKind = new Map<PawnKind, Person[]>()
    for (const seed of o.seeds) {
      const p: Person = {
        kind: seed.kind,
        x: seed.x,
        y: seed.y ?? 0,
        z: seed.z,
        ry: seed.ry,
        s: seed.s ?? rand(0.93, 1.07) * (seed.kind === "child" ? rand(0.9, 1.2) : 1),
        walk: seed.walker ? 1 : 0,
        cv: 0,
        cflip: 1,
        cphase: 0,
        ctint: [1, 1, 1],
        cs: -1,
        i: -1,
        card: false,
      }
      if (seed.walker) {
        const path = new PathSampler(seed.walker.path)
        if (path.length > 0.5) {
          p.walker = { path, mode: seed.walker.mode, speed: seed.walker.speed, d: seed.walker.d * path.length, lat: seed.walker.lat }
          this.walkers.push(p)
        } else p.walk = 0
      }
      this.people.push(p)
      if (seed.group) {
        const g = this.groups.get(seed.group) ?? []
        g.push(p)
        this.groups.set(seed.group, g)
      }
      const list = byKind.get(p.kind) ?? []
      list.push(p)
      byKind.set(p.kind, list)
    }
    const col = new THREE.Color()
    for (const kind of PAWN_KINDS) {
      const list = byKind.get(kind)
      if (!list?.length) continue
      const geo = this.geos[kind]
      const n = list.length
      const iA = new Float32Array(n * 3)
      const iB = new Float32Array(n * 3)
      const iPArr = new Float32Array(n * 4)
      const mesh = new THREE.InstancedMesh(geo, this.material, n)
      mesh.castShadow = mesh.receiveShadow = true
      mesh.name = `pawns:${kind}`
      const iP = new THREE.InstancedBufferAttribute(iPArr, 4).setUsage(THREE.DynamicDrawUsage)
      const military = MILITARY.has(kind)
      list.forEach((p, i) => {
        col
          .set(military ? rand.pick(TABARD) : rand.pick(CLOTH))
          .multiplyScalar(rand(0.6, 0.95))
          .toArray(iA, i * 3)
        col
          .set(military ? rand.pick(MILITARY_ACCENT) : rand.pick(ACCENT))
          .multiplyScalar(rand(0.6, 0.9))
          .toArray(iB, i * 3)
        iPArr.set([rand(), p.walk, rand(0, 1) ** 1.5, rand(0.85, 1.15)], i * 4)
        p.i = i
        this.writePawnMatrix(mesh, p)
      })
      geo.setAttribute("iA", new THREE.InstancedBufferAttribute(iA, 3))
      geo.setAttribute("iB", new THREE.InstancedBufferAttribute(iB, 3))
      geo.setAttribute("iP", iP)
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.frustumCulled = false
      this.kinds.set(kind, { mesh, geo, iP, slot: list.slice(), active: n, dirty: false })
      this.group.add(mesh)
    }
    for (const walker of this.walkers) this.stepWalker(walker, 0)

    // Card variants come from a stateless hash of each person's index, so the world's random stream is untouched.
    this.cards = o.library ? new CardLayer(o.library, this.people.length, o.camera, o.shared) : null
    if (this.cards && o.library) {
      const byId = new Map(o.library.meta.variants.map((v, i) => [v.id, i]))
      this.people.forEach((p, n) => {
        const table = Object.entries(o.library!.meta.kinds[p.kind] ?? {}).filter(([id]) => byId.has(id))
        if (!table.length) table.push([o.library!.meta.variants[0].id, 1])
        const total = table.reduce((a, [, w]) => a + w, 0)
        let r = hash01(n * 4 + 1) * total
        let id = table[0][0]
        for (const [k, w] of table) {
          if ((r -= w) < 0) {
            id = k
            break
          }
        }
        const b = 0.93 + hash01(n * 4 + 2) * 0.14
        const hj = (hash01(n * 4 + 3) - 0.5) * 0.07
        p.cv = byId.get(id) ?? 0
        p.cflip = hash01(n * 4) < 0.5 ? 1 : -1
        p.cphase = hash01(n * 4 + 7)
        p.ctint = [b * (1 + hj), b, b * (1 - hj)]
      })
      this.group.add(this.cards.mesh)
      if (this.mode !== "procedural") this.ensureAtlas()
    }
  }

  get count() {
    return this.people.length
  }
  get cardCount() {
    return this.cards?.n ?? 0
  }
  maskProxy(common: MaskCommon, keep: number) {
    return this.cards ? this.cards.maskProxy(common, keep) : null
  }
  setRadius(r: number) {
    this.near = r
    this.far = r + 6
  }
  setMode(m: CrowdMode) {
    this.mode = this.cards ? m : "procedural"
    if (this.mode !== "procedural") this.ensureAtlas()
  }
  private ensureAtlas() {
    if (!this.cards || this.cards.ready || this.cards.loading) return
    this.cards.load(this.o.maxAnisotropy).catch((err) => {
      console.error("[stage] crowd atlas failed; staying procedural", err)
      this.mode = "procedural"
    })
  }

  private writePawnMatrix(mesh: THREE.InstancedMesh, p: Person) {
    const d = this.dummy
    d.position.set(p.x, p.y, p.z)
    d.rotation.set(0, p.ry, 0)
    d.scale.setScalar(p.s)
    d.updateMatrix()
    mesh.setMatrixAt(p.i, d.matrix)
  }
  private swapSlots(K: KindSlots, a: number, b: number) {
    if (a === b) return
    const swapRange = (arr: ArrayLike<number> & { [i: number]: number }, i: number, j: number, n: number) => {
      for (let k = 0; k < n; k++) {
        const t = arr[i + k]
        arr[i + k] = arr[j + k]
        arr[j + k] = t
      }
    }
    swapRange(K.mesh.instanceMatrix.array as Float32Array, a * 16, b * 16, 16)
    swapRange(K.geo.attributes.iA.array as Float32Array, a * 3, b * 3, 3)
    swapRange(K.geo.attributes.iB.array as Float32Array, a * 3, b * 3, 3)
    swapRange(K.iP.array as Float32Array, a * 4, b * 4, 4)
    const pa = K.slot[a]
    const pb = K.slot[b]
    K.slot[a] = pb
    K.slot[b] = pa
    pa.i = b
    pb.i = a
    K.dirty = true
  }
  private hidePawn(p: Person) {
    const K = this.kinds.get(p.kind)!
    this.swapSlots(K, p.i, K.active - 1)
    K.active--
    K.mesh.count = K.active
    K.dirty = true
  }
  private showPawn(p: Person) {
    const K = this.kinds.get(p.kind)!
    this.swapSlots(K, p.i, K.active)
    K.active++
    K.mesh.count = K.active
    ;(K.iP.array as Float32Array)[p.i * 4 + 1] = p.walk
    this.writePawnMatrix(K.mesh, p)
    K.dirty = true
  }
  private toCard(p: Person) {
    this.hidePawn(p)
    p.card = true
    this.cards!.add(p)
  }
  private toPawn(p: Person) {
    this.cards!.remove(p)
    p.card = false
    this.showPawn(p)
  }

  // Called once a frame after the camera has moved: swap only the people whose representation changed.
  // Hybrid: cards within the radius while the camera looks across the crowd; pawns beyond it or from steep views.
  updateLOD(camera: THREE.PerspectiveCamera) {
    const cards = this.cards
    if (!cards?.ready) return
    camera.getWorldDirection(this.dir)
    const down = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(-this.dir.y, -1, 1)))
    this.shallow = down < (this.shallow ? 40 : 35)
    const cp = camera.position
    const all = this.mode === "cards"
    const off = this.mode === "procedural"
    const n2 = this.near * this.near
    const f2 = this.far * this.far
    for (const p of this.people) {
      let want: boolean
      if (off) want = false
      else if (all) want = true
      else {
        const dx = p.x - cp.x
        const dy = p.y + 0.9 - cp.y
        const dz = p.z - cp.z
        const d2 = dx * dx + dy * dy + dz * dz
        want = this.shallow && d2 < (p.card ? f2 : n2)
      }
      if (want !== p.card) {
        if (want) this.toCard(p)
        else this.toPawn(p)
      }
    }
  }

  setPose(p: Person, x: number, z: number, ry: number, walk: number) {
    p.x = x
    p.z = z
    p.ry = ry
    if (walk !== p.walk) {
      p.walk = walk
      if (!p.card) {
        const K = this.kinds.get(p.kind)!
        ;(K.iP.array as Float32Array)[p.i * 4 + 1] = walk
        K.dirty = true
      }
    }
    if (p.card) this.cards!.write(p)
    else {
      this.writePawnMatrix(this.kinds.get(p.kind)!.mesh, p)
      this.matricesDirty = true
    }
  }
  private stepWalker(p: Person, dt: number) {
    const w = p.walker!
    w.d += w.speed * dt
    if (w.mode === "loop") {
      if (w.d > w.path.length) w.d -= w.path.length
      if (w.d < 0) w.d += w.path.length
    } else if (w.d > w.path.length || w.d < 0) {
      w.speed = -w.speed
      w.d = THREE.MathUtils.clamp(w.d, 0, w.path.length)
    }
    const s = w.path.at(w.d)
    const sg = w.speed < 0 ? -1 : 1
    this.setPose(p, s.x - s.dz * w.lat, s.z + s.dx * w.lat, Math.atan2(s.dx * sg, s.dz * sg), 1)
  }
  // Walkers advance; call flush() afterwards (every frame, even when nothing animates) to upload what changed.
  update(dt: number) {
    for (const p of this.walkers) this.stepWalker(p, dt)
    if (this.walkers.length) this.matricesDirty = true
  }
  flush() {
    for (const K of this.kinds.values()) {
      if (this.matricesDirty || K.dirty) K.mesh.instanceMatrix.needsUpdate = true
      if (K.dirty) {
        K.geo.attributes.iA.needsUpdate = K.geo.attributes.iB.needsUpdate = K.iP.needsUpdate = true
        K.dirty = false
      }
    }
    this.matricesDirty = false
    this.cards?.flush()
  }
  dispose() {
    for (const g of Object.values(this.geos)) g.dispose()
    for (const K of this.kinds.values()) K.mesh.dispose()
    this.material.dispose()
    this.cards?.dispose()
  }
}
