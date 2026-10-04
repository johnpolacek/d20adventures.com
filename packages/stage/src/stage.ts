import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import type { Footprint } from "./builders/types"
import type { CrowdLibrary, CrowdLibraryMeta } from "./figures/cards"
import { Crowd } from "./figures/crowd"
import { type CastMember, Standees } from "./figures/standees"
import { V } from "./kit/geometry"
import { createRand, hashSeed } from "./kit/rng"
import { birds, type Disposable, dust, type LifeUpdate, land } from "./life"
import { QueueLoop } from "./loops/queue"
import { createShared, type SharedUniforms } from "./materials/atmosphere"
import { createMaterialLibrary, type MaterialLibrary } from "./materials/library"
import { autoTier, DEFAULT_FLAGS, type Flags, TIERS, type TierName } from "./quality"
import { PlanarMirror } from "./render/mirror"
import { Pipeline } from "./render/pipeline"
import { skyMaterial } from "./sky"
import { buildSetGeometry, populateCrowd } from "./spec/build"
import { frameShot, type ResolvedShot, resolveCast, resolveShots } from "./spec/resolve"
import { type SetSpec, setSpecSchema } from "./spec/set"
import { type StagingShot, type StagingSpec, stagingSpecSchema } from "./spec/staging"
import { onFootprint, reachOver } from "./spec/walk"

// The Stage runtime: one set (plus an optional staging) rendered into a canvas it owns inside `container`.
// Plain imperative three.js; the host (a React component) creates it, calls shot()/setTier()/pause(), and disposes it.

export interface StageOptions {
  container: HTMLElement
  set: unknown
  staging?: unknown
  tier?: TierName | "auto"
  flags?: Partial<Flags>
  controls?: boolean
  motion?: boolean
  // Crowd art for a library id; defaults to the repo-hosted libraries under /stage/crowd/<id>/.
  crowdLibrary?: (id: string) => Promise<CrowdLibrary | null>
  onProgress?: (message: string) => void
}

export interface StageStats {
  fps: number
  calls: number
  triangles: number
  people: number
  cards: number
  tier: TierName
  dpr: number
  paintHeight: number
  aa: string
  ao: boolean
  bloom: boolean
  shot: string | null
  camera: number[]
  programs: number
  frame: number
}

// A spoken line: by a cast member, or by someone in the crowd (a world point to anchor the bubble).
export interface StageLine {
  castId?: string
  point?: () => THREE.Vector3
  name?: string
  text: string
  seconds: number
}
type Events = { line: StageLine; cue: string }

export async function defaultCrowdLibrary(id: string): Promise<CrowdLibrary | null> {
  const base = `/stage/crowd/${id}`
  const res = await fetch(`${base}/atlas.json`)
  if (!res.ok) return null
  const meta = (await res.json()) as CrowdLibraryMeta
  return { meta, front: { rgb: `${base}/front-rgb.webp`, alpha: `${base}/front-a.webp` }, back: { rgb: `${base}/back-rgb.webp`, alpha: `${base}/back-a.webp` } }
}

export async function createStage(o: StageOptions): Promise<Stage> {
  const set = setSpecSchema.parse(o.set)
  const staging = o.staging ? stagingSpecSchema.parse(o.staging) : null
  const library = set.crowd ? await (o.crowdLibrary ?? defaultCrowdLibrary)(set.crowd.library).catch(() => null) : null
  const stage = new Stage(o, set, staging, library)
  await stage.load()
  return stage
}

type Transition = { from: { pos: THREE.Vector3; target: THREE.Vector3; fov: number }; to: { pos: THREE.Vector3; target: THREE.Vector3; fov: number }; start: number; duration: number }

export class Stage {
  readonly canvas: HTMLCanvasElement
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly world = new THREE.Group()
  readonly shared: SharedUniforms
  readonly pipeline: Pipeline
  readonly crowd: Crowd
  readonly standees: Standees
  readonly cast: CastMember[]
  readonly controls: OrbitControls | null
  readonly sun: THREE.DirectionalLight
  tier: TierName
  flags: Flags
  // A planar reflection when the set has mirrored water, and the share of the drawing buffer it renders at.
  private mirror: PlanarMirror | null = null
  private mirrorScale = 0
  private shadowCap = 4096
  motion: boolean
  activeShot: string | null = null
  private activeFov: number | null = null
  ready = false

  private materials: MaterialLibrary
  private statics: THREE.Mesh[] = []
  // What the set's builders marked as solid (walls, stalls, tables), for walking the cast.
  private footprints: Footprint[] = []
  private extras: THREE.Object3D[] = []
  private life: (LifeUpdate & Disposable)[] = []
  private disposables: Disposable[] = []
  private sky: THREE.Mesh
  private envTexture: THREE.Texture
  private transition: Transition | null = null
  private settleWaiters: (() => void)[] = []
  private listeners: { [K in keyof Events]?: Set<(e: Events[K]) => void> } = {}
  private cues = new Set<string>()
  private cueWaiters = new Map<string, (() => void)[]>()
  readonly loops = new Map<string, QueueLoop>()
  private coinMesh: THREE.Mesh | null = null
  private moves = new Map<string, { tx: number; tz: number; speed: number; resolve: () => void }>()
  private insets = { right: 0, bottom: 0 }
  private raf = 0
  private running = false
  private paused = false
  private visible = true
  private last = 0
  private fpsT = 0
  private fpsN = 0
  private fps = 0
  private frame = 0
  private stats0 = { calls: 0, triangles: 0 }
  private resizeObserver: ResizeObserver
  private intersection: IntersectionObserver | null = null
  private onVisibility = () => this.sync()
  private readyResolve: (() => void) | null = null
  readonly firstFrame: Promise<void>

  constructor(
    private o: StageOptions,
    readonly set: SetSpec,
    readonly staging: StagingSpec | null,
    library: CrowdLibrary | null
  ) {
    this.firstFrame = new Promise((r) => {
      this.readyResolve = r
    })
    this.flags = { ...DEFAULT_FLAGS, ...o.flags }
    this.motion = o.motion ?? !(typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches)
    this.canvas = document.createElement("canvas")
    this.canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none"
    o.container.appendChild(this.canvas)
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: "high-performance" })
    this.renderer = renderer
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.info.autoReset = false
    renderer.toneMapping = THREE.AgXToneMapping
    renderer.toneMappingExposure = set.atmosphere.exposure
    this.tier = o.tier && o.tier !== "auto" ? o.tier : autoTier(renderer.getContext())

    const A = set.atmosphere
    this.shared = createShared()
    // The sky draws the sun (or moon) at `disc` when set, a painter's cheat: the moon shows ahead while it lights the scene
    // from where `direction` says.
    this.shared.sun.value.set(...(A.sun.disc ?? A.sun.direction)).normalize()
    this.shared.wind.value = A.wind
    const horizon = new THREE.Color(A.sky.horizon)
    // Fog takes the horizon as the sky draws it, dimmed by its gain, so distant trees fade into the night sky, unless
    // the set gives the mist its own colour.
    this.shared.fogStart.value = A.fog.start
    this.scene.fog = new THREE.FogExp2(A.fog.color ? new THREE.Color(A.fog.color) : horizon.clone().multiplyScalar(A.sky.gain), A.fog.density)
    this.camera = new THREE.PerspectiveCamera(58, 1, set.camera.near, set.camera.far)
    this.scene.add(this.world)

    // Light: the sun rakes across the set; the hemisphere fills the shadows with sky and warm ground bounce.
    const sun = new THREE.DirectionalLight(A.sun.color, A.sun.intensity)
    const target = V(...A.sun.target)
    sun.position
      .set(...A.sun.direction)
      .normalize()
      .multiplyScalar(A.sun.distance)
      .add(target)
    sun.target.position.copy(target)
    sun.castShadow = true
    sun.shadow.mapSize.set(4096, 4096)
    const { size: shadowCap, ...shadowBox } = A.sun.shadow
    this.shadowCap = shadowCap ?? 4096
    Object.assign(sun.shadow.camera, shadowBox)
    sun.shadow.camera.updateProjectionMatrix()
    sun.shadow.bias = -0.0004
    sun.shadow.normalBias = 0.6
    this.sun = sun
    this.scene.add(sun, sun.target)
    this.scene.add(new THREE.HemisphereLight(A.hemisphere.sky, A.hemisphere.ground, A.hemisphere.intensity))
    for (const l of A.lights) {
      const lamp = new THREE.PointLight(l.color, l.intensity, l.distance, l.decay)
      lamp.position.set(...l.at)
      this.scene.add(lamp)
    }
    if (A.fill) {
      const fill = new THREE.PointLight(A.fill.color, A.fill.intensity, A.fill.distance, 1.4)
      fill.position.set(0, 0.6, 0.5)
      this.camera.add(fill)
      this.scene.add(this.camera)
    }

    const skyColors = { horizon, mid: new THREE.Color(A.sky.mid), zenith: new THREE.Color(A.sky.zenith) }
    const glow = A.glow ? new THREE.Color(A.glow) : undefined
    if (glow) this.shared.sunTint.value.set(glow.r, glow.g, glow.b).multiplyScalar(1.45)
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(Math.min(set.camera.far * 0.62, 1500), 48, 24), skyMaterial(this.shared, skyColors, { ...A.sky, glow }))
    this.sky.renderOrder = -1
    this.sky.frustumCulled = false
    this.scene.add(this.sky)
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envScene = new THREE.Scene()
    const envSky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMaterial(this.shared, skyColors, { ...A.sky, glow }))
    envScene.add(envSky)
    this.envTexture = pmrem.fromScene(envScene, 0.04).texture
    envSky.geometry.dispose()
    ;(envSky.material as THREE.Material).dispose()
    pmrem.dispose()
    this.scene.environment = this.envTexture
    this.scene.environmentIntensity = A.environment

    // The set itself: every builder into one batch, merged by material.
    o.onProgress?.("Building the set")
    const rand = createRand(hashSeed(set.seed, "stage"))
    this.materials = createMaterialLibrary(set.materials, this.shared, rand.fork("materials"), renderer.capabilities.getMaxAnisotropy())
    const built = buildSetGeometry(set, this.materials)
    this.footprints = built.footprints
    this.statics = built.batch.flush(this.world)
    const water = this.statics.filter((m) => (m.material as THREE.Material).userData.mirror)
    if (water.length) {
      const level = Math.max(
        ...water.map((m) => {
          m.geometry.computeBoundingBox()
          return m.geometry.boundingBox?.max.y ?? 0
        })
      )
      const skip = this.statics.filter((m) => {
        const spec = set.materials[(m.material as THREE.Material).name]
        return !!spec && (["grass", "mist", "card", "rock"].includes(spec.type) || (spec.type === "foliage" && !spec.map))
      })
      this.mirror = new PlanarMirror(renderer, this.scene, this.shared, water, level, skip)
    }
    for (const e of built.extras) this.world.add(e)
    this.extras = built.extras
    if (set.land) this.disposables.push(land(this.world, this.shared, rand.fork("land"), set.land))
    if (set.life.birds) this.life.push(birds(this.world, this.shared, rand.fork("birds"), set.life.birds))
    if (set.life.dust) this.life.push(dust(this.world, this.shared, rand.fork("dust"), set.life.dust))

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy()
    this.crowd = new Crowd({
      seeds: populateCrowd(set, built.footprints, built.anchors),
      rand: rand.fork("crowd"),
      camera: this.camera,
      shared: this.shared,
      library,
      mode: this.flags.crowd,
      cardRadius: this.flags.cardRadius ?? TIERS[this.tier].cardRadius,
      maxAnisotropy,
    })
    this.world.add(this.crowd.group)
    this.cast = resolveCast(set, staging)
    this.standees = new Standees(this.cast, this.shared, maxAnisotropy)
    this.world.add(this.standees.group)

    // Ambient loops (a queue at a checkpoint), fed by the staging's cast and lines.
    const coinMat = this.materials.get("coin")
    if (coinMat) {
      this.coinMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 10), coinMat)
      this.coinMesh.castShadow = true
    }
    for (const spec of set.loops) {
      const path = set.paths[spec.path]
      const station = set.marks[spec.station]
      if (!path || !station) continue
      const loop: QueueLoop = new QueueLoop(
        { ...spec, path: path as [number, number][], station: station.at },
        staging?.loops[spec.id] ?? null,
        this.crowd.groups.get(spec.crowd) ?? [],
        this.cast,
        {
          crowdPose: (p, x, z, ry, walk) => this.crowd.setPose(p, x, z, ry, walk),
          say: (who, text) => this.say({ ...who, text }),
          cue: (name) => this.cue(name),
          coin: (a, b) => {
            if (!this.coinMesh) return
            const m = this.coinMesh.clone()
            m.position.copy(a)
            this.world.add(m)
            loop.addCoin(m, a, b)
          },
        },
        rand.fork(`loop/${spec.id}`)
      )
      this.loops.set(spec.id, loop)
    }
    this.pipeline = new Pipeline(renderer, this.scene, this.camera)
    this.pipeline.paint.warmth = set.atmosphere.grade === "warm" ? 1 : 0
    this.shared.warmth.value = this.pipeline.paint.warmth
    this.pipeline.mask.setSources([
      // Crowd cards keep half the paint; named characters keep about 80% of the crisp render.
      ...(this.crowd.cards ? [{ src: this.crowd.cards.mesh, keep: 0.625, custom: (common: Parameters<Crowd["maskProxy"]>[0]) => this.crowd.maskProxy(common, 0.625)! }] : []),
      ...this.standees.maskSources(),
    ])

    if (o.controls !== false) {
      const c = new OrbitControls(this.camera, this.canvas)
      c.enableDamping = true
      c.dampingFactor = 0.07
      c.screenSpacePanning = true
      c.maxDistance = set.camera.maxDistance
      c.maxPolarAngle = Math.PI * 0.8
      c.rotateSpeed = 0.5
      c.zoomSpeed = 0.8
      c.addEventListener("start", () => {
        this.transition = null
      })
      this.controls = c
    } else this.controls = null

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(o.container)
    if (typeof IntersectionObserver !== "undefined") {
      this.intersection = new IntersectionObserver((entries) => {
        this.visible = entries.some((e) => e.isIntersecting)
        this.sync()
      })
      this.intersection.observe(this.canvas)
    }
    document.addEventListener("visibilitychange", this.onVisibility)
    this.applyTier()
  }

  // Waits for the character art and the crowd atlas (when cards are on), then starts the loop.
  async load() {
    this.o.onProgress?.("Loading characters")
    await Promise.all([this.standees.load(), this.materials.ready, this.crowd.cards && this.flags.crowd !== "procedural" ? this.waitForAtlas() : Promise.resolve()])
    const first = this.staging?.shot ?? Object.keys(this.shots)[0]
    if (first) this.shot(first, { instant: true })
    this.sync()
  }
  private waitForAtlas() {
    return new Promise<void>((resolve) => {
      const check = () => (this.crowd.cards?.ready || this.crowd.mode === "procedural" ? resolve() : setTimeout(check, 50))
      check()
    })
  }

  // ── Events ──
  on<K extends keyof Events>(type: K, fn: (e: Events[K]) => void) {
    this.listeners[type] ??= new Set() as never
    const set = this.listeners[type] as Set<(e: Events[K]) => void>
    set.add(fn)
    return () => {
      set.delete(fn)
    }
  }
  private emit<K extends keyof Events>(type: K, e: Events[K]) {
    const set = this.listeners[type] as Set<(e: Events[K]) => void> | undefined
    if (set) for (const fn of set) fn(e)
  }
  // A line spoken on stage (hosts render it: bubble, plate). Reading time scales with length.
  say(line: Omit<StageLine, "seconds"> & { seconds?: number }) {
    const seconds = line.seconds ?? Math.min(9, 1.3 + line.text.length * 0.052)
    this.emit("line", { ...line, seconds })
    return seconds
  }
  // Named moments (a loop's party reaching the front): fired once, awaited by beats.
  cue(name: string) {
    this.cues.add(name)
    const w = this.cueWaiters.get(name) ?? []
    this.cueWaiters.delete(name)
    for (const r of w) r()
    this.emit("cue", name)
  }
  waitCue(name: string) {
    if (this.cues.has(name)) return Promise.resolve()
    return new Promise<void>((r) => this.cueWaiters.set(name, [...(this.cueWaiters.get(name) ?? []), r]))
  }
  // Skipping: loops jump to the moment the beats are waiting for (the party's turn at the front unless a cue says which).
  skipLoops(cue?: string) {
    if (cue && this.cues.has(cue)) return
    for (const l of this.loops.values()) {
      if (cue) l.skipTo(cue)
      else l.skipToFront()
    }
  }

  // ── Camera ──
  private lens(fov: number) {
    // Portrait screens keep the set in frame by widening the lens.
    return this.camera.aspect >= 1 ? fov : Math.min(100, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) / Math.sqrt(this.camera.aspect))))
  }
  // Set and staging shots, framed on where the cast stands now (group and subject shots follow the characters).
  get shots(): Record<string, ResolvedShot> {
    const out = resolveShots(this.set, this.staging, this.cast)
    // Named shots on one character swing clear of walls and cabins like inline ones (see clearFrame).
    for (const [k, s] of Object.entries(this.staging?.shots ?? {}))
      if ("subject" in s)
        try {
          out[k] = this.clearFrame(s)
        } catch {
          // An unknown subject keeps the authored framing.
        }
    return out
  }
  // A named shot, or an inline one (absolute, group or subject). Eased over 2.2 s unless instant or motion is off.
  shot(which: string | StagingShot, { instant = false, duration = 2200 } = {}) {
    let s: ResolvedShot | undefined
    const authored = typeof which === "string" ? this.staging?.shots[which] : which
    try {
      s = authored && "subject" in authored ? this.clearFrame(authored, true) : typeof which === "string" ? this.shots[which] : frameShot(which, this.cast)
    } catch {
      s = undefined
    }
    if (!s) return false
    this.activeShot = typeof which === "string" ? which : null
    this.activeFov = s.fov
    const to = { pos: V(...s.position), target: V(...s.target), fov: this.lens(s.fov) }
    if (instant || !this.motion) {
      this.camera.position.copy(to.pos)
      this.controls?.target.copy(to.target)
      if (!this.controls) this.camera.lookAt(to.target)
      this.camera.fov = to.fov
      this.camera.updateProjectionMatrix()
      this.controls?.update()
      this.transition = null
      this.standees.reset()
      this.settle()
    } else {
      const target = this.controls ? this.controls.target.clone() : this.camera.getWorldDirection(V()).multiplyScalar(10).add(this.camera.position)
      this.transition = { from: { pos: this.camera.position.clone(), target, fov: this.camera.fov }, to, start: performance.now(), duration }
    }
    return true
  }
  // A shot on one character, swung round them (and then drawn in) until neither the camera nor its view of them passes
  // through anything solid, such as a cabin the character stands in front of. Other shots frame as authored.
  // With `turn`, a subject the camera had to swing far round turns toward it, so their card is never seen edge on.
  private clearFrame(which: StagingShot, turn = false): ResolvedShot {
    const first = frameShot(which, this.cast)
    if (!("subject" in which) || !this.footprints.length) return first
    const c = this.cast.find((m) => m.id === which.subject)
    if (!c) return first
    const clear = (x: number, z: number) => {
      const len = Math.hypot(c.x - x, c.z - z)
      // Fine steps: cabin walls are a hand's width thick.
      const n = Math.max(2, Math.ceil(len / 0.05))
      for (let i = 0; i <= n; i++) {
        const t = i / n
        if (t * len > len - 0.3) break
        if (onFootprint(this.footprints, x + (c.x - x) * t, z + (c.z - z) * t)) return false
      }
      return true
    }
    // Where the set's camera box would pull the camera, so the test sees where it really ends up. It also needs elbow
    // room: a camera brushing a post shows nothing but the post.
    const { min, max } = this.set.camera
    const fit = (r: ResolvedShot): ResolvedShot => ({ ...r, position: [0, 1, 2].map((i) => THREE.MathUtils.clamp(r.position[i], min[i], max[i])) as [number, number, number] })
    const roomy = (x: number, z: number) =>
      ![
        [0, 0],
        [0.45, 0],
        [-0.45, 0],
        [0, 0.45],
        [0, -0.45],
      ].some(([dx, dz]) => onFootprint(this.footprints, x + dx, z + dz))
    for (const scale of [1, 0.75, 0.55])
      for (const swing of [0, 30, -30, 60, -60, 90, -90, 135, -135, 180]) {
        const r = fit(frameShot({ ...which, angle: which.angle + swing, distance: which.distance * scale }, this.cast))
        const [x, , z] = r.position
        if (Math.hypot(x - c.x, z - c.z) > 1.5 && roomy(x, z) && clear(x, z)) {
          const bearing = Math.atan2(x - c.x, z - c.z)
          const off = Math.atan2(Math.sin(bearing - c.ry), Math.cos(bearing - c.ry))
          if (turn && Math.abs(off) > THREE.MathUtils.degToRad(60)) c.ry = bearing - THREE.MathUtils.degToRad(which.angle)
          return r
        }
      }
    return first
  }
  // Resolves when the current camera move has finished.
  shotSettled() {
    return this.transition ? new Promise<void>((r) => this.settleWaiters.push(r)) : Promise.resolve()
  }
  private settle() {
    const w = this.settleWaiters
    this.settleWaiters = []
    for (const r of w) r()
  }
  // Jump an in-progress camera move to its end.
  finishShot() {
    const tr = this.transition
    if (!tr) return
    this.camera.position.copy(tr.to.pos)
    this.controls?.target.copy(tr.to.target)
    if (!this.controls) this.camera.lookAt(tr.to.target)
    this.camera.fov = tr.to.fov
    this.camera.updateProjectionMatrix()
    this.transition = null
    this.settle()
  }

  // ── Cast ──
  // A place on the set: a cast member, a mark, or a point [x, z].
  point(ref: string | [number, number]): { x: number; z: number } {
    if (Array.isArray(ref)) return { x: ref[0], z: ref[1] }
    const c = this.cast.find((m) => m.id === ref)
    if (c) return { x: c.x, z: c.z }
    const m = this.set.marks[ref]
    if (m) return { x: m.at[0], z: m.at[1] }
    throw new Error(`unknown cast member or mark "${ref}"`)
  }
  private member(id: string) {
    const c = this.cast.find((m) => m.id === id)
    if (!c) throw new Error(`unknown cast member "${id}"`)
    return c
  }
  // Walk a cast member to a mark or point, facing the way they go, stopping `stop` metres short (beside someone rather
  // than on them). Resolves on arrival.
  moveCast(id: string, to: string | [number, number], { speed = 1.1, stop = 0 } = {}) {
    const c = this.member(id)
    let p = this.point(to)
    if (stop > 0) {
      const d = Math.hypot(p.x - c.x, p.z - c.z)
      const k = Math.max(0, d - stop) / Math.max(d, 1e-6)
      p = { x: c.x + (p.x - c.x) * k, z: c.z + (p.z - c.z) * k }
    }
    this.moves.get(id)?.resolve()
    this.moves.delete(id)
    if (!this.motion) {
      c.x = p.x
      c.z = p.z
      return Promise.resolve()
    }
    // Frames stop while the window is hidden or covered. The walk still arrives on time, so nothing awaiting it stalls.
    const due = (Math.hypot(p.x - c.x, p.z - c.z) / speed) * 1000 + 1000
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        const m = this.moves.get(id)
        if (!m) return
        c.x = m.tx
        c.z = m.tz
        c.walking = false
        this.moves.delete(id)
        m.resolve()
      }, due)
      this.moves.set(id, {
        tx: p.x,
        tz: p.z,
        speed,
        resolve: () => {
          clearTimeout(timer)
          resolve()
        },
      })
    })
  }
  // Every walk in progress arrives at once (skipping a beat sequence).
  finishMoves() {
    for (const [id, m] of this.moves) {
      const c = this.member(id)
      c.x = m.tx
      c.z = m.tz
      c.walking = false
      m.resolve()
    }
    this.moves.clear()
  }
  // Turn a cast member toward another, a mark, a point, or to a heading in degrees.
  faceCast(id: string, to: string | [number, number] | number) {
    const c = this.member(id)
    if (typeof to === "number") c.ry = THREE.MathUtils.degToRad(to)
    else {
      const p = this.point(to)
      c.ry = Math.atan2(p.x - c.x, p.z - c.z)
    }
  }
  // Place a cast member instantly (setting up a beat sequence).
  placeCast(id: string, at: string | [number, number], facing?: string | [number, number] | number) {
    const c = this.member(id)
    const p = this.point(at)
    this.moves.get(id)?.resolve()
    this.moves.delete(id)
    c.x = p.x
    c.z = p.z
    c.walking = false
    if (facing !== undefined) this.faceCast(id, facing)
  }
  private stepMoves(dt: number) {
    for (const [id, m] of this.moves) {
      const c = this.member(id)
      const dx = m.tx - c.x
      const dz = m.tz - c.z
      const dist = Math.hypot(dx, dz)
      if (dist < 0.02) {
        c.x = m.tx
        c.z = m.tz
        c.walking = false
        m.resolve()
        this.moves.delete(id)
        continue
      }
      const step = Math.min(dist, m.speed * dt)
      c.x += (dx / dist) * step
      c.z += (dz / dist) * step
      c.ry = Math.atan2(dx, dz)
      c.walking = true
    }
  }

  // UI laid over part of the canvas (a docked panel): shots compose in the uncovered area, and the scene continues
  // under the panel. Implemented as a camera view offset, so framing, picking and projection all agree.
  setInsets(insets: { right?: number; bottom?: number }) {
    this.insets = { right: Math.max(0, insets.right ?? 0), bottom: Math.max(0, insets.bottom ?? 0) }
    this.resize()
  }
  private constrain() {
    const { min, max } = this.set.camera
    const p = this.camera.position
    const before = p.clone()
    p.set(THREE.MathUtils.clamp(p.x, min[0], max[0]), THREE.MathUtils.clamp(p.y, min[1], max[1]), THREE.MathUtils.clamp(p.z, min[2], max[2]))
    if (this.controls && !before.equals(p)) this.controls.target.add(p.clone().sub(before))
  }

  // ── Quality ──
  setTier(name: TierName) {
    this.tier = name
    this.applyTier()
  }
  setFlags(f: Partial<Flags>) {
    this.flags = { ...this.flags, ...f }
    this.applyTier()
  }
  private applyTier() {
    const t = TIERS[this.tier]
    const f = this.flags
    const ratio = Math.min(window.devicePixelRatio || 1, f.dpr || t.ratio)
    this.renderer.setPixelRatio(ratio)
    const p = this.pipeline
    p.paint.setHeight(t.paint)
    p.paint.depthPaint = f.paint === "depth"
    p.paint.strength = Math.min(1, f.brush)
    p.paint.brush = Math.max(0.35, f.brush)
    p.bloom.enabled = f.bloom ?? t.bloom
    const aa = f.aa ?? t.aa
    p.setAA(aa)
    const cardMaterial = this.crowd.cards?.mesh.material as THREE.Material | undefined
    if (cardMaterial && cardMaterial.alphaToCoverage !== (aa === "msaa")) {
      cardMaterial.alphaToCoverage = aa === "msaa"
      cardMaterial.needsUpdate = true
    }
    this.standees.setAlphaToCoverage(aa === "msaa")
    p.setAO(f.ao ?? t.ao)
    this.mirrorScale = f.mirror ?? t.mirror
    this.crowd.setMode(f.crowd)
    this.crowd.setRadius(f.cardRadius ?? t.cardRadius)
    const shadowSize = Math.min(t.shadow, this.shadowCap)
    if (this.sun.shadow.mapSize.x !== shadowSize) {
      this.sun.shadow.mapSize.setScalar(shadowSize)
      this.sun.shadow.map?.dispose()
      this.sun.shadow.map = null
    }
    this.resize()
  }
  resize() {
    const w = Math.max(1, this.o.container.clientWidth)
    const h = Math.max(1, this.o.container.clientHeight)
    const vw = Math.max(1, w - this.insets.right)
    const vh = Math.max(1, h - this.insets.bottom)
    this.camera.aspect = vw / vh
    if (vw !== w || vh !== h) this.camera.setViewOffset(vw, vh, 0, 0, w, h)
    else this.camera.clearViewOffset()
    if (!this.transition && this.activeFov) this.camera.fov = this.lens(this.activeFov)
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
    this.pipeline.setSize(w, h, this.renderer.getPixelRatio())
    const buffer = this.renderer.getDrawingBufferSize(new THREE.Vector2())
    this.mirror?.setScale(this.mirrorScale, buffer.x, buffer.y)
  }

  // ── Loop ──
  // Rendering stops while the tab is hidden, the canvas is off screen (a hidden overlay), or the host pauses.
  pause() {
    this.paused = true
    this.sync()
  }
  resume() {
    this.paused = false
    this.sync()
  }
  private sync() {
    const run = !this.paused && this.visible && document.visibilityState !== "hidden"
    if (run && !this.running) {
      this.running = true
      this.last = performance.now()
      this.raf = requestAnimationFrame(this.tick)
    } else if (!run && this.running) {
      this.running = false
      cancelAnimationFrame(this.raf)
    }
  }
  private tick = (now: number) => {
    if (!this.running) return
    this.raf = requestAnimationFrame(this.tick)
    const raw = Math.max(0, (now - this.last) / 1000)
    this.last = now
    this.step(Math.min(raw, 0.05), raw)
  }
  private step(dt: number, raw: number) {
    this.fpsT += raw
    this.fpsN++
    if (this.fpsT > 1) {
      this.fps = Math.round(this.fpsN / this.fpsT)
      this.fpsT = this.fpsN = 0
    }
    if (this.motion) {
      this.stepMoves(dt)
      for (const l of this.loops.values()) l.update(dt)
      this.shared.time.value += dt
      this.crowd.update(dt)
      for (const f of this.life) f(this.shared.time.value)
    }
    if (this.transition) {
      const tr = this.transition
      const t = THREE.MathUtils.clamp((performance.now() - tr.start) / tr.duration, 0, 1)
      const e = t * t * (3 - 2 * t)
      this.camera.position.lerpVectors(tr.from.pos, tr.to.pos, e)
      const target = V().lerpVectors(tr.from.target, tr.to.target, e)
      if (this.controls) this.controls.target.copy(target)
      else this.camera.lookAt(target)
      this.camera.fov = THREE.MathUtils.lerp(tr.from.fov, tr.to.fov, e)
      this.camera.updateProjectionMatrix()
      if (t === 1) {
        this.transition = null
        this.settle()
      }
    }
    this.controls?.update()
    this.constrain()
    this.standees.update(dt, this.camera)
    this.crowd.updateLOD(this.camera)
    this.crowd.flush()
    this.render()
    if (++this.frame === 3) {
      this.ready = true
      this.readyResolve?.()
    }
  }
  render() {
    this.renderer.info.reset()
    this.mirror?.render(this.camera)
    this.pipeline.render()
    this.stats0 = { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles }
  }

  // ── For hosts ──
  stats(): StageStats {
    return {
      fps: this.fps,
      ...this.stats0,
      people: this.crowd.count,
      cards: this.crowd.cardCount,
      tier: this.tier,
      dpr: this.renderer.getPixelRatio(),
      paintHeight: this.pipeline.paint.size[1],
      aa: this.pipeline.aa,
      ao: this.pipeline.gtao.enabled,
      bloom: this.pipeline.bloom.enabled,
      shot: this.activeShot,
      camera: this.camera.position.toArray().map((v) => +v.toFixed(2)),
      programs: this.renderer.info.programs?.length ?? 0,
      frame: this.frame,
    }
  }
  // Programs that failed to compile or link (renderer.debug.checkShaderErrors is on by default).
  programErrors() {
    return (this.renderer.info.programs ?? []).filter((p) => (p as unknown as { diagnostics?: { runnable: boolean } }).diagnostics?.runnable === false).map((p) => p.name)
  }
  // Screen position (CSS px, relative to the canvas) of a cast member's head, for bubbles and plates.
  project(castId: string) {
    const head = this.standees.head(castId)
    return head ? this.projectPoint(head) : null
  }
  // Screen position (CSS px) of any world point, and how many CSS px a metre spans there (how big things look).
  projectPoint(p: THREE.Vector3) {
    const v = p.clone()
    const d = v.distanceTo(this.camera.position)
    const above = p.clone()
    above.y += 1
    v.project(this.camera)
    above.project(this.camera)
    const h = this.canvas.clientHeight
    return {
      x: (v.x * 0.5 + 0.5) * this.canvas.clientWidth,
      y: (-v.y * 0.5 + 0.5) * h,
      visible: v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05,
      behind: v.z > 1,
      distance: d,
      ppm: Math.abs(above.y - v.y) * 0.5 * h,
    }
  }
  private ray = new THREE.Raycaster()
  // The cast member under a canvas point (CSS px), if any.
  // The ground point under a canvas point (CSS px), on the y = 0 plane.
  groundAt(x: number, y: number) {
    const ndc = new THREE.Vector2((x / this.canvas.clientWidth) * 2 - 1, -(y / this.canvas.clientHeight) * 2 + 1)
    this.ray.setFromCamera(ndc, this.camera)
    const hit = this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3())
    return hit && hit.distanceTo(this.camera.position) < 400 ? { x: hit.x, z: hit.z } : null
  }
  // How far a cast member can walk toward a point in a straight line: stops at the first solid footprint or at `budget`
  // metres. Returns where they would stop, the distance walked, and whether something or the budget cut it short.
  reach(id: string, to: { x: number; z: number }, budget: number) {
    return reachOver(this.footprints, this.member(id), to, budget)
  }
  // Where a cast member stands (x, z) and faces (radians).
  castAt(id: string) {
    const c = this.member(id)
    return { x: c.x, z: c.z, ry: c.ry, height: c.height }
  }
  pick(x: number, y: number) {
    const ndc = new THREE.Vector2((x / this.canvas.clientWidth) * 2 - 1, -(y / this.canvas.clientHeight) * 2 + 1)
    this.ray.setFromCamera(ndc, this.camera)
    for (const hit of this.ray.intersectObject(this.standees.group, true)) {
      const id = hit.object.userData.castId as string | undefined
      if (id && (!hit.uv || this.standees.opaqueAt(id, hit.uv))) return id
    }
    return null
  }
  // A PNG of the current view, rendered on demand (no preserveDrawingBuffer needed: read in the same task).
  capture(): Promise<Blob | null> {
    this.render()
    return new Promise((resolve) => this.canvas.toBlob(resolve, "image/png"))
  }

  dispose() {
    this.running = false
    cancelAnimationFrame(this.raf)
    // Walks in progress end where they are, so nothing awaiting them hangs on a disposed stage.
    for (const m of this.moves.values()) m.resolve()
    this.moves.clear()
    document.removeEventListener("visibilitychange", this.onVisibility)
    this.resizeObserver.disconnect()
    this.intersection?.disconnect()
    this.controls?.dispose()
    for (const m of this.statics) m.geometry.dispose()
    for (const e of this.extras)
      e.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose()
      })
    for (const l of this.life) l.dispose()
    for (const d of this.disposables) d.dispose()
    this.crowd.dispose()
    this.standees.dispose()
    this.coinMesh?.geometry.dispose()
    this.materials.dispose()
    this.pipeline.dispose()
    this.mirror?.dispose()
    this.sky.geometry.dispose()
    ;(this.sky.material as THREE.Material).dispose()
    this.envTexture.dispose()
    this.sun.shadow.map?.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.canvas.remove()
  }
}
