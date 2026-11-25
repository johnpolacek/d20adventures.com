import * as THREE from "three"
import { type SharedUniforms, stageMaterial } from "../materials/atmosphere"
import type { MaskSource } from "../render/character-mask"
import { crouchClip, figureClips, isRigged, MOVE_NAMES, STRIKE } from "./clips"
import { type Armed, arm } from "./fight"
import { type FigureGaits, type Gait, gaitRate, gaitShares, type Pace, STRIDE } from "./gaits"
import { carry, fingered, wield } from "./hold"
import { holdProps } from "./props"
import { reachArm } from "./weapons"
import { type CastMember, PALETTE_GRADE, type Standees } from "./standees"

// A cast member as a rigged, animated glTF figure in place of their standee (the `figures` flag, one figure so far: an
// experiment for the owner to judge against the cards). The standee stays built underneath: it keeps who is down and
// offstage, the patch of shade at the feet and the head point, and it shows again if the model fails to load.
//
// The figure stands where the cast member does, faces the way they face (a glTF figure faces +z, as yaw 0 does here)
// and is scaled so the top of it in its idle pose is their height. It breathes on its idle clip, flinches on its hit
// clip with the same flash a card takes, and falls on its fall clip, where a card is put down unseen.
//
// A figure rigged by the asset library (asset-library/pipeline/rig.py) carries the shared skeleton and no clips. It
// plays the written ones (clips.ts), Idle, Walk and Hit unless the spec names others, walks while its cast member
// does, and holds what its skeleton says it holds (props.ts). In a fight it plays its moves (`act`): a cut, a shot, a
// swipe, a dodge, turned toward whoever it is aimed at, with the sword or bow the move needs in its hand (weapons.ts).

export interface FigureSpec {
  model: string
  idle?: string
  hit?: string
  fall?: string
  // Played, blended in, while the cast member walks.
  walk?: string
  // Its gaits, each a clip and the speed it was made for (gaits.ts): a figure moves in the one for its pace and speed.
  // One with none walks in `walk`, taken to be made for 1.2 metres a second.
  gaits?: FigureGaits
  // How brightly the figure reflects a plain lit room of its own, so its metal and leather read: 0, or none, leaves
  // it to the stage's sky. A night wants little, or the figure glows.
  env?: number
  // A light along its edges, brightest on what faces up: in a dark wood the figure stands out of it by its outline,
  // as under a moon, wherever it stands.
  rim?: { color: string; strength: number }
  // A colour its own is multiplied by: a pale model darkened to sit in a night, as the card it replaces was painted.
  tint?: string
  // The moves it makes in a fight, by the clip each plays: a blow struck close, a shot from afar, getting out of the
  // way, thrown back by a critical hit, stumbling after a fumble. One it has none for, it does not make.
  moves?: { melee?: string; ranged?: string; dodge?: string; reel?: string; stumble?: string }
  // When each of its own clips lands, in seconds into it. A written clip's is in clips.ts (STRIKE).
  lands?: Record<string, number>
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

interface Given {
  item: THREE.Object3D | null
  side: "L" | "R"
  // The bone the upper arm hangs from, the upper arm, the forearm and the hand.
  arm: THREE.Object3D[]
  out: boolean
  w: number
  // Seconds since it began to be put away, shrinking, or null while held.
  gone: number | null
}
// How long an arm takes to go out or come back, and an object to shrink away once put away.
const REACH_S = 0.5
const STOW_S = 0.3
// The objects are made half again their size, to read beside a figure across the stage (effects.ts). In a hand they are
// seen close, at their own size.
const HELD = 0.62

// An arm's bones under the shared skeleton's names or Mixamo's, or null when the figure has no such arm.
function armBones(root: THREE.Object3D, side: "L" | "R") {
  const bones = new Map<string, THREE.Object3D>()
  root.traverse((o) => {
    const name = o.name.replace(/^mixamorig:?/i, "")
    if (!bones.has(name)) bones.set(name, o)
  })
  const long = side === "L" ? "Left" : "Right"
  const arm = bones.get(`upperarm${side}`) ? [`upperarm${side}`, `forearm${side}`, `hand${side}`] : [`${long}Arm`, `${long}ForeArm`, `${long}Hand`]
  const found = arm.map((n) => bones.get(n))
  if (!found.every(Boolean) || !found[0]?.parent) return null
  return [found[0].parent, ...found] as THREE.Object3D[]
}

interface Model {
  cast: CastMember
  spec: FigureSpec
  root: THREE.Group
  mixer: THREE.AnimationMixer
  idle: THREE.AnimationAction | null
  hit: THREE.AnimationAction | null
  fall: THREE.AnimationAction | null
  walk: THREE.AnimationAction | null
  // Its gaits, the walk among them, each with the speed its clip was made for and its share now.
  gaits: { gait: Gait; action: THREE.AnimationAction; speed: number; share: number }[]
  // The crouch (clips.ts), laid over the rest, and how far into it the figure is, 0 standing to 1 low.
  crouch: THREE.AnimationAction | null
  lowT: number
  // The move it is making, once through, and the way it turns to make it.
  move: { clip: string; action: THREE.AnimationAction; t: number; held?: boolean } | null
  aim: number | null
  // The move whose weapon it keeps in hand between moves, as an arrow nocked or a sword drawn, and the move whose
  // weapon shows now.
  ready: string | null
  shown: string | null
  // Its moves' clips, held: `update` runs them through once.
  actions: Map<string, THREE.AnimationAction>
  // The weapons its moves put in its hands, and its arms put where a move needs them (fight.ts).
  armed: Armed | null
  // What it holds, bent to its hand after each frame's clip.
  carried: { update: (weight?: number) => void; dispose: () => void } | null
  // An object in its hand, given or being given (hold), and how far its arm is out to give it: 0 at its side, 1 held out.
  given: Given | null
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
  // What each material gives off of its own, as modelled: an owlbear's lit eyes. A hit's flash is added to it.
  glow: THREE.Color[]
  triangles: number
}

// Albedo is graded toward the set palette as a card's is. On a painted set a card shows its art unlit, since a
// photograph carries its own light. A model carries none, so it keeps the engine's shading there and takes only the
// painted set's tint (Painted.flatFigures, `lit`).
// A figure the asset library made, rigged by rig.py or with fingers under Mixamo's names (hold.ts), is not graded: its
// dark leather would take the grade's umber and read orange. It is shown as the library shows it, under the set's
// light and haze.
function figureMaterial(src: Mat, shared: SharedUniforms, ownLight: boolean, grade = true, rim?: THREE.Color): Mat {
  const m = src.clone()
  const edge = (s: Parameters<NonNullable<Parameters<typeof stageMaterial>[3]>>[0]) => {
    if (!rim) return
    s.uniforms.uRim = { value: rim }
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uRim;")
      .replace(
        "#include <opaque_fragment>",
        "outgoingLight += uRim * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0) * (0.3 + 0.7 * saturate(normal.y * 0.5 + 0.5));\n#include <opaque_fragment>"
      )
  }
  const lit = rim ? "-rim" : ""
  if (!grade) return stageMaterial(m, shared, `figure-rigged${lit}`, edge)
  return stageMaterial(m, shared, `${ownLight ? "figure-own" : "figure"}${lit}`, (s) => {
    edge(s)
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

  private room: Promise<THREE.Texture> | null = null
  // The weapon each cast member keeps ready, for a figure that loads after it was asked.
  private readied = new Map<string, "bow" | "blade">()
  constructor(
    private cast: CastMember[],
    private shared: SharedUniforms,
    private standees: Standees,
    private renderer?: THREE.WebGLRenderer
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
          const spec = c.figure as FigureSpec
          const gltf = await loader.loadAsync(spec.model)
          this.make(c, spec, gltf, spec.env && this.renderer ? await this.lit() : null)
        } catch (error) {
          console.warn(`[stage] figure for ${c.id} failed, showing the standee`, error)
        }
      })
    )
  }
  // The plain lit room a figure reflects, made once for the stage.
  private lit() {
    this.room ??= import("three/addons/environments/RoomEnvironment.js").then(({ RoomEnvironment }) => {
      const pmrem = new THREE.PMREMGenerator(this.renderer as THREE.WebGLRenderer)
      const made = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
      pmrem.dispose()
      return made
    })
    return this.room
  }
  private make(cast: CastMember, given: FigureSpec, gltf: { scene: THREE.Group; animations: THREE.AnimationClip[] }, room: THREE.Texture | null) {
    const root = gltf.scene
    for (const name of given.hide ?? []) root.getObjectByName(name)?.removeFromParent()
    // Measured on the figure as it was modelled, before anything poses it.
    const low = crouchClip(root)
    // A rigged figure with no clips of its own plays the written ones, which are measured on it as it was modelled.
    const rigged = !gltf.animations.length && isRigged(root)
    let animations = gltf.animations
    let carried: Model["carried"] = null
    // How tall it stands, as modelled: what it holds may stand taller than it does.
    let bind: THREE.Box3 | null = null
    const spec = rigged ? { idle: "Idle", hit: "Hit", walk: "Walk", ...given } : given
    if (rigged) {
      root.updateMatrixWorld(true)
      bind = new THREE.Box3().setFromObject(root)
      animations = figureClips(root, bind.max.y - bind.min.y)
      // Stood beside it before its materials are made, so the prop is lit as the figure is.
      carried = holdProps(root, bind.min.y)
    }
    // The weapons its moves need, seated in its hands at rest and hidden till a move shows them. A figure that brings
    // its own clips and has fingers holds them in a closed hand (hold.ts).
    const hands = !rigged && fingered(root)
    const armed =
      rigged && bind
        ? arm(
            root,
            Object.values(spec.moves ?? {}).filter((c): c is string => !!c),
            bind.max.y - bind.min.y
          )
        : hands
          ? wield(root)
          : null
    // A staff, for a figure with fingers whose skeleton says it carries one: stood before its materials are made too,
    // and after its weapons are seated, which want the hand as it was modelled.
    const staff = hands ? carry(root, new THREE.Box3().setFromObject(root, true).min.y) : null
    if (staff) carried = staff
    const mixer = new THREE.AnimationMixer(root)
    const action = (name: string | undefined, held: boolean) => {
      const clip = name ? THREE.AnimationClip.findByName(animations, name) : null
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
    const walk = action(spec.walk, false)
    const actions = new Map<string, THREE.AnimationAction>()
    // Every written move, for a rigged figure: its own fight moves pick among them, and a roar is asked for by name.
    // A figure with clips of its own has whichever of those names it brings.
    for (const clip of [...Object.values(spec.moves ?? {}), ...MOVE_NAMES]) {
      const a = clip && !actions.has(clip) ? action(clip, true) : null
      if (clip && a) actions.set(clip, a)
    }
    const gaits: Model["gaits"] = []
    for (const [gait, g] of Object.entries(spec.gaits ?? {}) as [Gait, { clip: string; speed: number }][]) {
      const a = gait === "walk" && g.clip === spec.walk ? walk : action(g.clip, false)
      if (a) gaits.push({ gait, action: a, speed: g.speed, share: 0 })
    }
    if (walk && !gaits.some((g) => g.gait === "walk")) gaits.push({ gait: "walk", action: walk, speed: STRIDE, share: 0 })
    for (const g of gaits) g.action.setEffectiveWeight(0)
    const crouch = low ? mixer.clipAction(low, undefined, THREE.AdditiveAnimationBlendMode) : null
    crouch?.play()
    crouch?.setEffectiveWeight(0)
    mixer.update(0)
    carried?.update()
    const meshes: THREE.Mesh[] = []
    const rim = spec.rim ? new THREE.Color(spec.rim.color).multiplyScalar(spec.rim.strength) : undefined
    const materials = new Map<THREE.Material, Mat>()
    let triangles = 0
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      o.castShadow = o.receiveShadow = true
      // A skinned mesh is culled by its bind pose, which a fallen figure has left.
      o.frustumCulled = false
      o.userData.castId = cast.id
      const src = o.material as Mat
      if (!materials.has(src)) {
        const made = figureMaterial(src, this.shared, !!spec.ownLight, !rigged && !hands, rim)
        // A generated figure is real metal and leather, which shows by what it reflects. The stage's sky is kept dim
        // for its cards, so it reflects a lit room of its own, and its metal is kept a little short of a mirror.
        if (room && spec.env) {
          made.envMap = room
          made.envMapIntensity = spec.env
          made.metalness = Math.min(made.metalness, 0.8)
          made.roughness = Math.max(made.roughness, 0.4)
          // A generated skin shines like wax and its relief is cut too deep: both catch a low light as streaks.
          made.normalScale.setScalar(0.7)
        }
        if (spec.tint) made.color.multiply(new THREE.Color(spec.tint))
        materials.set(src, made)
      }
      o.material = materials.get(src) as Mat
      triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3
      meshes.push(o)
    })
    for (const src of materials.keys()) src.dispose()
    // Measured as posed, skinning and all: a bind pose with the arms out is not how tall the figure stands.
    // Without what is in its hands: a staff stands taller than its bearer, and a sword put away in a hand that holds
    // a staff points over its head.
    const inHand = [...(armed?.weapons.values() ?? [])].map((w) => w.group).concat(staff ? [staff.prop] : [])
    const from = inHand.map((g) => g.parent)
    if (!bind) for (const g of inHand) g.removeFromParent()
    root.updateMatrixWorld(true)
    const box = bind ?? new THREE.Box3().setFromObject(root, true)
    if (!bind) for (const [i, g] of inHand.entries()) from[i]?.add(g)
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
      walk,
      gaits,
      crouch,
      lowT: this.standees.low.has(cast.id) ? 1 : 0,
      carried,
      move: null,
      given: null,
      aim: null,
      ready: null,
      shown: null,
      actions,
      armed,
      hitT: null,
      fallT,
      yaw: null,
      side: null,
      scale,
      lift: -box.min.y * scale,
      meshes,
      materials: mats,
      base: mats.map((m) => m.color.clone()),
      glow: mats.map((m) => m.emissive.clone()),
      triangles,
    })
    this.ready(cast.id, this.readied.get(cast.id) ?? null)
  }
  // Seconds between a figure's footfalls as it moves at `gait` metres a second: half the cycle of the gait it moves
  // in most, at the rate that gait plays. Null for one with no walk of its own.
  stepSeconds(id: string, gait: number, pace?: Pace) {
    const m = this.on ? this.items.get(id) : undefined
    if (!m?.gaits.length) return null
    const shares = gaitShares(
      m.gaits.map((g) => g.gait),
      gait,
      pace
    )
    const most = m.gaits.reduce((a, b) => ((shares[b.gait] ?? 0) > (shares[a.gait] ?? 0) ? b : a))
    return most.action.getClip().duration / 2 / gaitRate(most.gait, most.speed, gait)
  }
  // The clip a figure plays for a kind of move, if it has one.
  moveFor(id: string, kind: keyof NonNullable<FigureSpec["moves"]>) {
    const m = this.on ? this.items.get(id) : undefined
    const clip = m?.spec.moves?.[kind]
    return clip && m?.actions.has(clip) ? clip : null
  }
  // Plays a move once, turned toward `toward` while it plays. Resolves to the seconds until it lands (clips.ts
  // STRIKE), or null when the figure is not standing, or has no such clip.
  act(id: string, clip: string, toward?: { x: number; z: number }) {
    const m = this.on ? this.items.get(id) : undefined
    if (!m || this.standees.down.has(id) || this.standees.offstage.has(id)) return null
    const action = m.actions.get(clip)
    if (!action) return null
    if (m.move && m.move.action !== action) m.move.action.setEffectiveWeight(0)
    m.move = { clip, action, t: 0 }
    const c = m.cast
    m.aim = toward && Math.hypot(toward.x - c.x, toward.z - c.z) > 0.2 ? Math.atan2(toward.x - c.x, toward.z - c.z) : null
    return m.spec.lands?.[clip] ?? STRIKE[clip] ?? 0
  }
  // A move held at one moment, for a capture: it stays there until another move or `act` replaces it.
  pose(id: string, clip: string, seconds: number, toward?: { x: number; z: number }) {
    if (this.act(id, clip, toward) === null) return false
    const m = this.items.get(id) as Model
    if (m.move) Object.assign(m.move, { t: seconds, held: true })
    return true
  }
  // An object in a figure's hand, the arm held out before it as one hands something over (`out`), or at its side. The
  // right hand, or the left when the right is busy with a staff. `instant` puts the arm where it goes at once, as after
  // a cut. False for a figure with no arm to hold it, when the host shows the object some other way.
  hold(id: string, item: THREE.Object3D, out: boolean, instant = false) {
    const m = this.on ? this.items.get(id) : undefined
    if (!m || this.standees.down.has(id) || this.standees.offstage.has(id)) return false
    const side = m.carried ? "L" : "R"
    const arm = armBones(m.root, side)
    if (!arm) return false
    if (m.given?.item && m.given.item !== item) m.given.item.removeFromParent()
    m.given = { item, side, arm, out, w: instant ? (out ? 1 : 0) : (m.given?.w ?? 0), gone: null }
    this.group.add(item)
    return true
  }
  // Put away what a figure holds: it shrinks from its hand, or is gone at once, and the arm comes back to its side.
  // With `only`, it lets go of that object alone, not one it was given since.
  letGo(id: string, slow = true, only?: THREE.Object3D) {
    const g = this.items.get(id)?.given
    if (!g || (only && g.item !== only)) return
    g.out = false
    if (slow && g.item) g.gone = 0
    else {
      g.item?.removeFromParent()
      g.item = null
    }
  }
  // The arm out, or coming back, and the object put in its hand, after the clip and the figure have been placed.
  private holding(m: Model, dt: number) {
    const g = m.given as Given
    g.w = THREE.MathUtils.clamp(g.w + ((g.out ? 1 : -1) * dt) / REACH_S, 0, 1)
    const k = THREE.MathUtils.smootherstep(g.w, 0, 1)
    const root = m.root
    root.updateWorldMatrix(true, true)
    const [, upper, forearm, handBone] = g.arm
    if (k > 0) {
      const local = (o: THREE.Object3D) => root.worldToLocal(o.getWorldPosition(new THREE.Vector3()))
      const s = local(upper)
      const arm = s.distanceTo(local(forearm)) + local(forearm).distanceTo(local(handBone))
      // The figure's own +x is its left and +z ahead: the hand a little in toward the middle, below the shoulder and
      // well out before it, the elbow down and out.
      const sx = g.side === "L" ? 1 : -1
      const wrist = s.clone().add(new THREE.Vector3(-sx * 0.15, -0.3, 0.88).multiplyScalar(arm))
      reachArm(root, g.side, wrist, new THREE.Vector3(sx, -1, -0.4), k, g.arm)
      root.updateWorldMatrix(true, true)
    }
    if (g.gone !== null) g.gone += dt
    if (g.item) {
      const hand = handBone.getWorldPosition(new THREE.Vector3())
      const fore = forearm.getWorldPosition(new THREE.Vector3())
      // In the palm, a little on from the wrist along the hand, lying across it as the figure faces.
      const at = hand.clone().addScaledVector(hand.clone().sub(fore).normalize(), 0.07 * (m.cast.height / 1.8))
      g.item.position.copy(this.group.worldToLocal(at))
      // Held out, it lies across the hand as one offers it. At the side, it points ahead in the fist.
      g.item.quaternion.setFromEuler(new THREE.Euler(0, (m.yaw ?? m.cast.ry) + (1 - k) * (Math.PI / 2), 0))
      g.item.scale.setScalar(HELD * (g.gone === null ? 1 : Math.max(0.001, 1 - g.gone / STOW_S)))
      g.item.visible = root.visible
      if (g.gone !== null && g.gone >= STOW_S) {
        g.item.removeFromParent()
        g.item = null
      }
    }
    if (!g.item && g.w === 0) m.given = null
  }
  // Keep a weapon in hand between moves, the bow its shot uses or the blade its cut does, or put it away. False when
  // the figure has no move that wields it.
  ready(id: string, what: "bow" | "blade" | null) {
    if (what) this.readied.set(id, what)
    else this.readied.delete(id)
    const m = this.items.get(id)
    if (!m) return false
    const clip = what ? m.spec.moves?.[what === "bow" ? "ranged" : "melee"] : undefined
    m.ready = clip && m.actions.has(clip) ? clip : null
    return !what || !!m.ready
  }
  // A flash, and the hit clip unless a move it makes instead answers the blow.
  hit(id: string, color: string, strength = 1, flinch = true) {
    const m = this.items.get(id)
    if (!m) return
    this.hits.set(id, { color: new THREE.Color(color), strength: THREE.MathUtils.clamp(strength, 0, 1.5), t: 0 })
    if (flinch) m.hitT = 0
  }
  // Put down, or stood up, at once: for someone already down when the scene shows, and with motion off. And put low,
  // or up, at once.
  settle(id: string) {
    const m = this.items.get(id)
    if (m) m.fallT = this.standees.down.has(id) ? (m.fall?.getClip().duration ?? 1) : 0
  }
  settleLow(id: string) {
    const m = this.items.get(id)
    if (m) m.lowT = this.standees.low.has(id) ? 1 : 0
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
      // A move runs once through, eased in and out, over whatever else the figure is doing. Falling ends it.
      let v = 0
      const mv = m.move
      if (mv) {
        const d = mv.action.getClip().duration
        if (!mv.held) mv.t += step
        if (!mv.held && (mv.t >= d || down || !motion)) {
          mv.action.setEffectiveWeight(0)
          m.move = null
          m.aim = null
        } else {
          v = mv.held ? 1 : Math.min(1, mv.t / 0.12, (d - mv.t) / 0.18)
          mv.action.time = mv.t
          mv.action.setEffectiveWeight((1 - f) * (1 - h) * v)
        }
      }
      // Walking takes over from standing as the cast member sets off, and gives way again as they stop. They move in
      // the gait for their pace and speed, each played at the rate that keeps its feet on the ground (gaits.ts).
      const w = m.gaits.length ? c.walk : 0
      m.idle?.setEffectiveWeight((1 - f) * (1 - h) * (1 - v) * (1 - w))
      const speed = c.gait ?? STRIDE
      const shares = gaitShares(
        m.gaits.map((g) => g.gait),
        speed,
        c.pace
      )
      // A gait coming in takes up the stride where the one going out has it, so the feet do not jump.
      const lead = m.gaits.find((g) => g.share > 0)
      for (const g of m.gaits) {
        const share = shares[g.gait] ?? 0
        if (share > 0 && g.share === 0 && lead && lead !== g) g.action.time = (lead.action.time / lead.action.getClip().duration) * g.action.getClip().duration
        g.share = share
        g.action.setEffectiveWeight((1 - f) * (1 - h) * (1 - v) * w * share)
        g.action.setEffectiveTimeScale(gaitRate(g.gait, g.speed, speed))
      }
      if (m.hit) {
        m.hit.time = m.hitT ?? 0
        m.hit.setEffectiveWeight((1 - f) * h)
      }
      if (m.fall) {
        m.fall.time = m.fallT
        m.fall.setEffectiveWeight(f)
      }
      // Low, as someone hidden keeps, once they have stopped walking: a walk to cover is walked upright, then they sink.
      // They come up quicker than they go down.
      const lowWant = this.standees.low.has(c.id) && !down && !c.walking ? 1 - c.walk : 0
      m.lowT = motion ? THREE.MathUtils.clamp(m.lowT + THREE.MathUtils.clamp(lowWant - m.lowT, -dt * 3, dt * 1.8), 0, 1) : lowWant
      m.crouch?.setEffectiveWeight((1 - f) * THREE.MathUtils.smootherstep(m.lowT, 0, 1))
      // The weapon the move needs shows while it plays, and one kept ready stays in hand after, standing, walking or
      // low, until the figure falls.
      const kept = !m.move && !down ? m.ready : null
      const showing = m.move?.clip ?? kept
      if (showing !== m.shown) {
        m.armed?.show(showing)
        m.shown = showing
      }
      m.mixer.update(step)
      m.carried?.update(1 - f)
      if (m.move) m.armed?.after(m.move.clip, m.move.t, v)
      else if (kept) m.armed?.rest(kept)
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
      else if (m.aim !== null) want = m.aim
      m.yaw = m.yaw === null || !motion ? want : m.yaw + wrap(want - m.yaw) * (1 - Math.exp(-dt * 4.5))
      m.root.rotation.set(m.fall ? 0 : -(m.fallT / length) * (Math.PI / 2 - 0.04), m.yaw, 0, "YXZ")
      m.root.visible = !this.standees.offstage.has(c.id)
      if (m.given) this.holding(m, motion ? dt : 1)
      const flash = this.hits.get(c.id)
      if (flash) {
        flash.t += dt
        const k = Math.max(0, 1 - flash.t / 0.45) * flash.strength
        m.materials.forEach((mat, i) => {
          mat.color.copy(m.base[i]).lerp(flash.color, Math.min(0.7, 0.6 * k))
          mat.emissive.copy(flash.color).multiplyScalar(0.035 * k).add(m.glow[i])
        })
        if (k <= 0) this.hits.delete(c.id)
      }
    }
  }
  dispose() {
    for (const m of this.items.values()) {
      m.mixer.stopAllAction()
      m.carried?.dispose()
      m.armed?.dispose()
      m.given?.item?.removeFromParent()
      for (const mesh of m.meshes) mesh.geometry.dispose()
      for (const mat of m.materials) {
        mat.map?.dispose()
        mat.dispose()
      }
    }
    this.items.clear()
  }
}
