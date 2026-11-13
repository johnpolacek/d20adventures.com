import * as THREE from "three"
import { type SharedUniforms, stageMaterial } from "../materials/atmosphere"
import type { MaskSource } from "../render/character-mask"
import { type CastMember, PALETTE_GRADE, type Standees } from "./standees"

// A cast member as a rigged, animated glTF figure in place of their standee (the `figures` flag, one figure so far: an
// experiment for the owner to judge against the cards). The standee stays built underneath: it keeps who is down and
// offstage, the patch of shade at the feet and the head point, and it shows again if the model fails to load.
//
// The figure stands where the cast member does, faces the way they face (a glTF figure faces +z, as yaw 0 does here)
// and is scaled so the top of it in its idle pose is their height. It breathes on its idle clip, flinches on its hit
// clip with the same flash a card takes, and falls on its fall clip, where a card is put down unseen.

export interface FigureSpec {
  model: string
  idle?: string
  hit?: string
  fall?: string
  // Nodes of the model left out: the weapons and shields a pack ships on every character.
  hide?: string[]
  // Seconds of idle per second: a short idle loop reads as bouncing at full speed.
  pace?: number
  // The texture is a painting with its own light (a figure built from the character's paintings, see
  // lab/stage-art/figure.ts): on a painted set it shows evenly lit, as a card does.
  ownLight?: boolean
  // The most the camera may see of its side, in degrees off its front or its back. Past that it turns toward the
  // camera, as a card does: a figure made of a front and a back painting has no side worth showing.
  turn?: number
}

type Mat = THREE.MeshStandardMaterial
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

interface Model {
  cast: CastMember
  spec: FigureSpec
  root: THREE.Group
  mixer: THREE.AnimationMixer
  idle: THREE.AnimationAction | null
  hit: THREE.AnimationAction | null
  fall: THREE.AnimationAction | null
  // Seconds into the hit clip, or null when not struck; seconds into the fall clip, 0 standing.
  hitT: number | null
  fallT: number
  scale: number
  lift: number
  // The way it is turned, which is the cast member's facing unless `turn` is cheating it; and the face it shows.
  yaw: number | null
  side: 0 | 1 | null
  meshes: THREE.Mesh[]
  materials: Mat[]
  base: THREE.Color[]
  triangles: number
}

// Albedo is graded toward the set palette as a card's is. On a painted set a card shows its art unlit, since a
// photograph carries its own light. A model carries none, so it keeps the engine's shading there and takes only the
// painted set's tint (Painted.flatFigures, `lit`).
function figureMaterial(src: Mat, shared: SharedUniforms, ownLight: boolean): Mat {
  const m = src.clone()
  return stageMaterial(m, shared, ownLight ? "figure-own" : "figure", (s) => {
    s.uniforms.uWarmth = shared.warmth
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uWarmth;")
      .replace("#include <map_fragment>", `#include <map_fragment>\n${ownLight ? " vec3 cardArt = diffuseColor.rgb;\n" : ""}${PALETTE_GRADE}`)
  })
}

export class Models {
  group = new THREE.Group()
  items = new Map<string, Model>()
  private hits = new Map<string, { color: THREE.Color; strength: number; t: number }>()
  private loading: Promise<void> | null = null
  private on = false
  // Called when figures have arrived or left, so the stage can list them for the character mask and the painted set.
  onChange: (() => void) | null = null

  constructor(
    private cast: CastMember[],
    private shared: SharedUniforms,
    private standees: Standees
  ) {
    this.group.name = "models"
  }
  // Whether this cast member shows as a figure right now.
  active(id: string) {
    return this.on && this.items.has(id)
  }
  get triangles() {
    let n = 0
    if (this.on) for (const m of this.items.values()) n += m.triangles
    return n
  }
  // Turns figures on (loading them the first time) or off. A model that fails to load leaves the standee showing.
  async enable(on: boolean) {
    this.on = on
    if (on && !this.loading) this.loading = this.load()
    await this.loading
    this.sync()
  }
  private sync() {
    this.group.visible = this.on
    this.standees.replaced.clear()
    if (this.on) for (const id of this.items.keys()) this.standees.replaced.add(id)
    this.onChange?.()
  }
  private async load() {
    const wanted = this.cast.filter((c) => c.figure)
    if (!wanted.length) return
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js")
    const loader = new GLTFLoader()
    await Promise.all(
      wanted.map(async (c) => {
        try {
          this.make(c, c.figure as FigureSpec, await loader.loadAsync((c.figure as FigureSpec).model))
        } catch (error) {
          console.warn(`[stage] figure for ${c.id} failed, showing the standee`, error)
        }
      })
    )
  }
  private make(cast: CastMember, spec: FigureSpec, gltf: { scene: THREE.Group; animations: THREE.AnimationClip[] }) {
    const root = gltf.scene
    for (const name of spec.hide ?? []) root.getObjectByName(name)?.removeFromParent()
    const mixer = new THREE.AnimationMixer(root)
    const action = (name: string | undefined, held: boolean) => {
      const clip = name ? THREE.AnimationClip.findByName(gltf.animations, name) : null
      if (!clip) return null
      const a = mixer.clipAction(clip)
      // A held clip is posed by hand (update sets its time), so it never runs on its own.
      if (held) a.paused = true
      a.play()
      a.setEffectiveWeight(held ? 0 : 1)
      return a
    }
    const idle = action(spec.idle, false)
    idle?.setEffectiveTimeScale(spec.pace ?? 1)
    const hit = action(spec.hit, true)
    const fall = action(spec.fall, true)
    mixer.update(0)
    const meshes: THREE.Mesh[] = []
    const materials = new Map<THREE.Material, Mat>()
    let triangles = 0
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      o.castShadow = o.receiveShadow = true
      // A skinned mesh is culled by its bind pose, which a fallen figure has left.
      o.frustumCulled = false
      o.userData.castId = cast.id
      const src = o.material as Mat
      if (!materials.has(src)) materials.set(src, figureMaterial(src, this.shared, !!spec.ownLight))
      o.material = materials.get(src) as Mat
      triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3
      meshes.push(o)
    })
    for (const src of materials.keys()) src.dispose()
    // Measured as posed, skinning and all: a bind pose with the arms out is not how tall the figure stands.
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root, true)
    const scale = cast.height / Math.max(box.max.y - box.min.y, 1e-3)
    root.scale.setScalar(scale)
    root.name = `model:${cast.id}`
    this.group.add(root)
    const mats = [...materials.values()]
    const fallT = this.standees.down.has(cast.id) ? (fall?.getClip().duration ?? 1) : 0
    this.items.set(cast.id, {
      cast,
      spec,
      root,
      mixer,
      idle,
      hit,
      fall,
      hitT: null,
      fallT,
      yaw: null,
      side: null,
      scale,
      lift: -box.min.y * scale,
      meshes,
      materials: mats,
      base: mats.map((m) => m.color.clone()),
      triangles,
    })
  }
  hit(id: string, color: string, strength = 1) {
    const m = this.items.get(id)
    if (!m) return
    this.hits.set(id, { color: new THREE.Color(color), strength: THREE.MathUtils.clamp(strength, 0, 1.5), t: 0 })
    m.hitT = 0
  }
  // Put down, or stood up, at once: for someone already down when the scene shows, and with motion off.
  settle(id: string) {
    const m = this.items.get(id)
    if (m) m.fallT = this.standees.down.has(id) ? (m.fall?.getClip().duration ?? 1) : 0
  }
  // The figures, for a ray to pick from. A skinned mesh keeps the bounds of the pose it was first picked in, so they
  // are dropped here and worked out again from the pose it is in now.
  pickable() {
    for (const m of this.items.values())
      for (const mesh of m.meshes)
        if (mesh instanceof THREE.SkinnedMesh) {
          mesh.boundingSphere = null as unknown as THREE.Sphere
          mesh.boundingBox = null as unknown as THREE.Box3
        }
    return this.group
  }
  maskSources(): MaskSource[] {
    if (!this.on) return []
    // A figure whose outline is cut by its texture (see lab/stage-art/figure.ts) is masked by that same cut.
    return [...this.items.values()].flatMap((m) =>
      m.meshes.map((src) => {
        const mat = src.material as Mat
        return mat.alphaTest > 0 && mat.map ? { src, map: () => mat.map } : { src }
      })
    )
  }
  // The figures' materials: those that carry their own light, or those the engine lights.
  materials(ownLight: boolean): THREE.Material[] {
    return [...this.items.values()].filter((m) => !!m.spec.ownLight === ownLight).flatMap((m) => m.materials)
  }
  // The camera has cut to somewhere else: a figure that turns toward it is turned at once.
  reset() {
    for (const m of this.items.values()) {
      m.yaw = null
      m.side = null
    }
  }
  // With motion off the figure holds its pose, and a fall or a rise is put at its end. A flash still fades.
  update(dt: number, motion: boolean, camera: THREE.Camera) {
    if (!this.on) return
    const step = motion ? dt : 0
    for (const m of this.items.values()) {
      const c = m.cast
      const down = this.standees.down.has(c.id)
      const length = m.fall?.getClip().duration ?? 1
      if (!motion) m.fallT = down ? length : 0
      else m.fallT = THREE.MathUtils.clamp(m.fallT + (down ? step : -step * 1.4), 0, length)
      const f = Math.min(1, m.fallT / 0.12)
      let h = 0
      if (m.hitT !== null && m.hit && motion) {
        const d = m.hit.getClip().duration
        m.hitT += step
        if (m.hitT >= d) m.hitT = null
        else h = Math.min(1, m.hitT / 0.06, (d - m.hitT) / 0.2)
      } else m.hitT = null
      m.idle?.setEffectiveWeight((1 - f) * (1 - h))
      if (m.hit) {
        m.hit.time = m.hitT ?? 0
        m.hit.setEffectiveWeight((1 - f) * h)
      }
      if (m.fall) {
        m.fall.time = m.fallT
        m.fall.setEffectiveWeight(f)
      }
      m.mixer.update(step)
      m.root.position.set(c.x, (c.y ?? 0) + m.lift, c.z)
      // A model with no fall clip is tipped onto its back, as a card is.
      // Which face shows is settled as a card's is: the back past 100 degrees off its facing, the front again under 80.
      let want = c.ry
      if (m.spec.turn !== undefined && !down && m.fallT === 0) {
        const off = wrap(Math.atan2(camera.position.x - c.x, camera.position.z - c.z) - c.ry)
        const a = Math.abs(off)
        if (m.side === null) m.side = a > Math.PI / 2 ? 1 : 0
        else if (a > THREE.MathUtils.degToRad(100)) m.side = 1
        else if (a < THREE.MathUtils.degToRad(80)) m.side = 0
        const seen = m.side ? wrap(off - Math.PI) : off
        want = c.ry + Math.sign(seen) * Math.max(0, Math.abs(seen) - THREE.MathUtils.degToRad(m.spec.turn))
      } else if (m.yaw !== null && (down || m.fallT > 0)) want = m.yaw
      m.yaw = m.yaw === null || !motion ? want : m.yaw + wrap(want - m.yaw) * (1 - Math.exp(-dt * 4.5))
      m.root.rotation.set(m.fall ? 0 : -(m.fallT / length) * (Math.PI / 2 - 0.04), m.yaw, 0, "YXZ")
      m.root.visible = !this.standees.offstage.has(c.id)
      const flash = this.hits.get(c.id)
      if (flash) {
        flash.t += dt
        const k = Math.max(0, 1 - flash.t / 0.45) * flash.strength
        m.materials.forEach((mat, i) => {
          mat.color.copy(m.base[i]).lerp(flash.color, Math.min(0.7, 0.6 * k))
          mat.emissive.copy(flash.color).multiplyScalar(0.035 * k)
        })
        if (k <= 0) this.hits.delete(c.id)
      }
    }
  }
  dispose() {
    for (const m of this.items.values()) {
      m.mixer.stopAllAction()
      for (const mesh of m.meshes) mesh.geometry.dispose()
      for (const mat of m.materials) {
        mat.map?.dispose()
        mat.dispose()
      }
    }
    this.items.clear()
  }
}
