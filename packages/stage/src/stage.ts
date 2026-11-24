import * as THREE from "three"
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { backdrop } from "./backdrop"
import type { Footprint } from "./builders/types"
import { type BodyAct, type EffectEnd, type EffectEvent, type EffectKind, Effects, type Element, type PropKind, type SoundCue } from "./effects"
import type { CrowdLibrary, CrowdLibraryMeta } from "./figures/cards"
import { Crowd } from "./figures/crowd"
import { Models } from "./figures/models"
import { type CastMember, Standees } from "./figures/standees"
import { V } from "./kit/geometry"
import { createRand, hashSeed } from "./kit/rng"
import { type CameraMove, type Ease, eased, type Impact } from "./director"
import { birds, type Disposable, dust, type LifeUpdate, land } from "./life"
import { LookControls } from "./look"
import { QueueLoop } from "./loops/queue"
import { createShared, type SharedUniforms } from "./materials/atmosphere"
import { createMaterialLibrary, type MaterialLibrary } from "./materials/library"
import { autoTier, DEFAULT_FLAGS, type Flags, TIERS, type TierName } from "./quality"
import { PlanarMirror } from "./render/mirror"
import { Painted } from "./render/painted"
import { Pipeline } from "./render/pipeline"
import { skyMaterial } from "./sky"
import { buildSetGeometry, populateCrowd } from "./spec/build"
import { frameShot, type ResolvedShot, resolveCast, resolveShots } from "./spec/resolve"
import { type SetSpec, setSpecSchema } from "./spec/set"
import { figurePoints, type Lens, roomAt, type Seen, type Sight, viewCost } from "./spec/sight"
import { type StagingShot, type StagingSpec, stagingSpecSchema } from "./spec/staging"
import { served } from "./served"
import { clearView, type ViewCost } from "./spec/view"
import { doorways, onFootprint, reachOver, routeOver, standingRoom } from "./spec/walk"
import { Floor } from "./surface"
import { driftIn, fitView, minFov, type Spot, type TripodPoint, tripodView, type View } from "./tripod"

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
  // The director's name for the take on screen (director.ts), when a take put it there.
  take: string | null
  // The painted point the camera stands at, in a painted set.
  point: string | null
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
  const res = await fetch(served(`${base}/atlas.json`))
  if (!res.ok) return null
  const meta = (await res.json()) as CrowdLibraryMeta
  return { meta, front: { rgb: `${base}/front-rgb.webp`, alpha: `${base}/front-a.webp` }, back: { rgb: `${base}/back-rgb.webp`, alpha: `${base}/back-a.webp` } }
}

// On a painted set a cast member whose card has been repainted as a photograph shows that one: the same file name in a
// `photoreal` folder beside the painted card. /stage/photoreal.json lists the cards that have one (lab/stage-art/cards.ts
// publish). Art from elsewhere, such as a hero painted on the player's machine, stays as it is.
async function photographs(staging: StagingSpec) {
  const listed = new Set<string>(
    await fetch(served("/stage/photoreal.json"))
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
  )
  if (!listed.size) return
  for (const c of staging.cast) {
    const m = /^\/stage\/(.+)\/([^/]+)-front\.webp$/.exec(c.art.front)
    if (!m || !listed.has(`${m[1]}/${m[2]}`)) continue
    c.art = { ...c.art, front: `/stage/${m[1]}/photoreal/${m[2]}-front.webp`, back: `/stage/${m[1]}/photoreal/${m[2]}-back.webp` }
  }
}

export async function createStage(o: StageOptions): Promise<Stage> {
  // Every file three.js loads, a painting, a texture or a model, is fetched from where the stage's files are served.
  THREE.DefaultLoadingManager.setURLModifier(served)
  const parsed = setSpecSchema.parse(o.set)
  const staging = o.staging ? stagingSpecSchema.parse(o.staging) : null
  const set = staging && !staging.painted ? { ...parsed, painted: undefined } : parsed
  if (set.painted && staging) await photographs(staging)
  const library = set.crowd ? await (o.crowdLibrary ?? defaultCrowdLibrary)(set.painted?.crowd ?? set.crowd.library).catch(() => null) : null
  const stage = new Stage(o, set, staging, library)
  await stage.load()
  return stage
}

// The steepest the player can tilt the camera: its angle from straight overhead.
const STEEPEST_ORBIT = Math.PI * 0.28
// The only movement on a stage is the camera's and the set's own life: cloth in the wind, smoke, fire, birds (owner,
// 2026-11-11: "a drift in only then after that is static with just minor ambient animations like flags, banners
// billowing, smoke", "the people should be locked in", "i want only camera movements and ambient animations. when
// the standees move it looks weird"). That holds on every set, painted or built. A card is a picture of someone
// standing, and sliding one along with a bob reads as a cut-out pushed across the frame. So the crowd stands where
// it is, and a cast member who has somewhere to go is put there while the picture dips for a moment, as it does when
// a painted set's camera cuts. A fall is put the same way, a struck figure flashes without shaking, and a line of
// people (a loop) holds still. The walking is all still here, behind this one switch. A rigged 3D figure is no card: it
// walks on its own legs, so it is seen to walk, as it is seen to fall (owner, 2026-11-18: "can we make the pcs and
// npcs actually move on the scene as they do the action for their round").
const PEOPLE_STILL = true
// A painted set's drift: on arriving at a point the camera starts a little off it (see driftIn) and a touch wide, and over these
// seconds comes to rest, easing all the way. It ends this much closer than the view it was given, never wider, so a
// view fitted to the edge of its painting stays on the paint.
const DRIFT_SECONDS = 7
const DRIFT_PUSH = 0.03
type Transition = { from: { pos: THREE.Vector3; target: THREE.Vector3; fov: number }; to: { pos: THREE.Vector3; target: THREE.Vector3; fov: number }; start: number; duration: number; ease: Ease }
// A take's move once the camera has arrived (see director.ts): `start` on the stage's clock when it began, null until
// the camera arrives, and `done` the share of it already made.
type Moving = CameraMove & { start: number | null; done: number }
// A shake's seconds: how long a jolt takes to die away, and how long a lens punch takes to reach its widest.
const SHAKE_SECONDS = 0.32
const PUNCH_RISE = 0.05
// The most a full shake turns the camera, and a full punch tightens the lens.
const SHAKE_ANGLE = THREE.MathUtils.degToRad(1.5)
const PUNCH_ZOOM = 0.12

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
  // Cast members as rigged 3D figures, in place of their standees while the `figures` flag is on.
  readonly models: Models
  readonly effects: Effects
  readonly cast: CastMember[]
  controls: OrbitControls | null = null
  readonly sun: THREE.DirectionalLight
  // A painted set's paintings, and the tripod the camera stands on: the point, what it looks at, and a cut to another
  // point in progress. `tripod` is null until the paintings are up, and for good if they fail.
  readonly painted: Painted | null = null
  // `want` is what the camera was asked for: a shot's subject, set where the panels leave room (`placed`), or the way
  // the player turned it.
  private tripod: { point: TripodPoint; aim: THREE.Vector3; want: { target: THREE.Vector3; fov: number; placed: boolean } } | null = null
  private look: LookControls | null = null
  private cut: { arrive: () => void; timer: ReturnType<typeof setTimeout> } | null = null
  // The picture dipped to put someone in a new place unseen (see `unseen`).
  private dip: { dark: Promise<void>; lift: ReturnType<typeof setTimeout> | null } | null = null
  // Loops whose line is being put in its new place under a dip.
  private closing = new Set<QueueLoop>()
  // When the camera arrived at its painted point, on the stage's clock: its drift in runs from here.
  private arrived = 0
  // What the paintings were made of: the built set alone.
  private plate: THREE.Object3D[] = []
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
  // What the free camera may not pass into: walls, towers, houses and stalls, not crates or ropes.
  private solids: Footprint[] = []
  // What hides a figure from the camera: the set's solid geometry as built, roots and crooked trunks included.
  private sight: Sight = { x0: 0, z0: 0, w: 0, d: 0, bits: new Uint32Array(0) }
  private shotsFor: { key: string; shots: Record<string, ResolvedShot> } | null = null
  // The view last asked for, to take again when someone it follows stops where it no longer shows them.
  private asked: { which: string | StagingShot; follow: string[]; duration: number } | null = null
  // The player is steering the camera, not a shot.
  private driving = false
  private doors: ReturnType<typeof doorways> = []
  private hemisphere: THREE.HemisphereLight
  private fill: THREE.PointLight | null = null
  private lamps: THREE.PointLight[] = []
  // How far the camera is into a room (0 outside, 1 in), which room, and the room whose light is up.
  private indoors = 0
  private room: SetSpec["rooms"][number] | null = null
  // The room the camera is in, for its sound.
  private heard: SetSpec["rooms"][number] | null = null
  // The set's open water as outlines on the ground (x, z), how near the camera last was to it, and when it was last
  // measured.
  private waters: [number, number][][] | null = null
  private wet = -1
  private sinceWet = 0
  private lit: SetSpec["rooms"][number] | null = null
  private extras: THREE.Object3D[] = []
  private life: (LifeUpdate & Disposable)[] = []
  private disposables: Disposable[] = []
  private backdropReady: Promise<void> = Promise.resolve()
  private sky: THREE.Mesh
  private envTexture: THREE.Texture
  private transition: Transition | null = null
  private settleWaiters: (() => void)[] = []
  private listeners: { [K in keyof Events]?: Set<(e: Events[K]) => void> } = {}
  private cues = new Set<string>()
  private cueWaiters = new Map<string, (() => void)[]>()
  readonly loops = new Map<string, QueueLoop>()
  private coinMesh: THREE.Mesh | null = null
  // `unseen`: not walked, but put there once the picture has dipped.
  private moves = new Map<string, { tx: number; tz: number; speed: number; resolve: () => void; unseen?: boolean }>()
  // Who the current shot is on, and the walkers the camera follows, by where it last saw them. A walker is followed
  // when the shot is on them, or when they set off in view.
  private framed = new Set<string>()
  // How fast the camera circles what it looks at, in radians a second: the shot's `orbit`. The player's own drag, or a
  // new shot without one, stops it.
  private circling = 0
  // How far it has still to go round, in radians, when the shot gave a sweep.
  private sweepLeft = Number.POSITIVE_INFINITY
  private followed = new Map<string, { x: number; z: number }>()
  // The take's move, its dutch tilt now (radians), an impact waiting for the next blow to land, and the jolts playing.
  private moving: Moving | null = null
  private roll = 0
  private waiting: (Impact & { until: number }) | null = null
  private jolts: { shake: number; punch: number; at: number; seed: number }[] = []
  private joltTimers: ReturnType<typeof setTimeout>[] = []
  // What the current take is, by the director's name for it.
  take: string | null = null
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
  private effectListeners = new Set<(e: EffectEvent) => void>()
  // Seconds since each seen walker's last footfall, who came on stage and has yet to walk on, and who sinks into cover
  // once their walk ends.
  private trod = new Map<string, number>()
  private cameOn = new Set<string>()
  private sinking = new Set<string>()
  // What is underfoot anywhere in the set, for the sound of a step there.
  private floor: Floor

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
    this.hemisphere = new THREE.HemisphereLight(A.hemisphere.sky, A.hemisphere.ground, A.hemisphere.intensity)
    this.scene.add(this.hemisphere)
    // One set of lamps serves outside and every room, so the light count, and with it the shaders, never changes.
    const count = Math.max(A.lights.length, ...set.rooms.map((r) => r.lights.length))
    for (let i = 0; i < count; i++) {
      const lamp = new THREE.PointLight()
      this.lamps.push(lamp)
      this.scene.add(lamp)
    }
    this.light(A.lights, 1)
    if (A.fill) {
      this.fill = new THREE.PointLight(A.fill.color, A.fill.intensity, A.fill.distance, 1.4)
      this.fill.position.set(0, 0.6, 0.5)
      this.camera.add(this.fill)
      this.scene.add(this.camera)
    }

    const skyColors = { horizon, mid: new THREE.Color(A.sky.mid), zenith: new THREE.Color(A.sky.zenith) }
    const glow = A.glow ? new THREE.Color(A.glow) : undefined
    if (glow) this.shared.sunTint.value.set(glow.r, glow.g, glow.b).multiplyScalar(1.45)
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(Math.min(set.camera.far * 0.62, 1500), 48, 24), skyMaterial(this.shared, skyColors, { ...A.sky, glow }))
    this.sky.renderOrder = -1
    this.sky.frustumCulled = false
    this.scene.add(this.sky)
    if (set.painted) this.painted = new Painted(renderer, set.painted, this.shared, (this.sky.geometry as THREE.SphereGeometry).parameters.radius)
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
    this.sight = built.sight
    this.solids = built.footprints.filter((f) => (f.kind === "circle" ? f.r >= 1.2 : f.top === undefined && f.hw * f.hd >= 1.5))
    this.doors = doorways(built.anchors)
    this.statics = built.batch.flush(this.world)
    this.floor = new Floor(this.statics, set.materials)
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
    this.plate = [...this.world.children]
    const backdrops = set.backdrops.map((b, i) => backdrop(this.world, (this.scene.fog as THREE.FogExp2).color, renderer.capabilities.getMaxAnisotropy(), b, i))
    this.disposables.push(...backdrops)
    this.backdropReady = Promise.all(backdrops.map((b) => b.ready)).then(() => undefined)
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
    this.models = new Models(this.cast, this.shared, this.standees, renderer)
    this.world.add(this.models.group)
    this.effects = new Effects({
      hit: (id, color, strength) => {
        this.hit(id, color, strength)
        this.body(id, "struck")
      },
      event: (e) => {
        // The take's impact comes as the blow lands on someone.
        const w = this.waiting
        if (w && e.type === "effect" && e.phase === "land" && e.struck && performance.now() < w.until) {
          this.waiting = null
          this.jolt(w.shake, w.punch ?? 0)
        }
        for (const l of this.effectListeners) l(e)
      },
      camera: this.camera,
    })
    this.world.add(this.effects.group)

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
    const mask = () =>
      this.pipeline.mask.setSources([
        // Crowd cards keep half the paint; named characters keep about 80% of the crisp render.
        ...(this.crowd.cards ? [{ src: this.crowd.cards.mesh, keep: 0.625, custom: (common: Parameters<Crowd["maskProxy"]>[0]) => this.crowd.maskProxy(common, 0.625)! }] : []),
        ...this.standees.maskSources(),
        ...this.models.maskSources(),
      ])
    mask()
    // Figures arrive after the stage is built (and only with their flag on): the mask and the painted set take them then.
    const flat = new Set<THREE.Material>()
    this.models.onChange = () => {
      mask()
      for (const own of [true, false]) {
        const fresh = this.models.materials(own).filter((m) => !flat.has(m))
        for (const m of fresh) flat.add(m)
        this.painted?.flatFigures(fresh, !own)
      }
    }

    // A painted set's camera is a tripod, with its own controls once the paintings are up (see load).
    this.painted?.patch(this.plate)
    this.painted?.flatFigures([...[...this.standees.items.values()].map((s) => s.mat), ...(this.crowd.cards ? [this.crowd.cards.mesh.material as THREE.Material] : [])])
    if (!this.painted) this.orbit()

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

  private orbit() {
    if (this.o.controls === false) return
    const c = new OrbitControls(this.camera, this.canvas)
    c.enableDamping = true
    c.dampingFactor = 0.07
    c.screenSpacePanning = true
    c.maxDistance = this.set.camera.maxDistance
    c.maxPolarAngle = Math.PI * 0.8
    c.rotateSpeed = 0.5
    c.zoomSpeed = 0.8
    c.addEventListener("start", () => {
      this.transition = null
      this.driving = true
      this.circling = 0
      this.moving = null
      // The player looks down at most about 40 degrees. From higher, the crowd's painted cards read as flat pegs. An
      // authored shot that is steeper keeps its angle when the drag starts, so nothing jumps.
      c.minPolarAngle = Math.min(STEEPEST_ORBIT, c.getPolarAngle())
    })
    this.controls = c
  }

  // Waits for the character art and the crowd atlas (when cards are on), then starts the loop.
  async load() {
    this.o.onProgress?.("Loading characters")
    const paintings = this.painted
      ? this.painted.load(this.renderer.capabilities.getMaxAnisotropy()).then(
          () => true,
          (error) => {
            console.warn("[stage] paintings failed, showing the set as built", error)
            return false
          }
        )
      : Promise.resolve(false)
    const [, , , , painted] = await Promise.all([
      this.standees.load(),
      this.materials.ready,
      this.backdropReady,
      this.crowd.cards && this.flags.crowd !== "procedural" ? this.waitForAtlas() : Promise.resolve(),
      paintings,
      this.flags.figures ? this.models.enable(true) : Promise.resolve(),
    ])
    if (this.painted && painted) {
      const plate = new Set(this.plate)
      this.painted.bake(this.scene, [...this.world.children.filter((c) => !plate.has(c)), this.sky])
      // The paintings' sky holds the painter's own far hills. The built backdrop, which takes no paint, would show
      // through every gap between painted trees as a band of flat colour.
      for (const c of this.world.children) if (c.name === "backdrop") c.visible = false
      // The brush filter is for the engine's own shading. A painting is finished art.
      this.applyTier()
      if (this.o.controls !== false)
        this.look = new LookControls(this.canvas, {
          start: () => {
            if (this.cut) this.finishShot()
            this.transition = null
            this.settle()
          },
          turn: (dx, dy) => this.turnTripod(dx, dy),
          zoom: (factor) => this.zoomTripod(factor),
        })
    } else if (this.painted) this.orbit()
    const first = this.staging?.shot ?? Object.keys(this.shots)[0]
    if (first) this.shot(first, { instant: true })
    // The shaders compile before the first frame asks for them, where the browser can do it off the page's thread:
    // compiled by that frame instead, they held the window still for over half a second in the desktop app.
    await this.renderer.compileAsync(this.scene, this.camera).catch(() => {})
    this.loaded = true
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
    // A line does not move on by itself: it is put where the beats wait for it to be.
    if (PEOPLE_STILL && this.motion) this.skipLoops(name)
    return new Promise<void>((r) => this.cueWaiters.set(name, [...(this.cueWaiters.get(name) ?? []), r]))
  }
  // Skipping: loops jump to the moment the beats are waiting for (the party's turn at the front unless a cue says which).
  // They jump while the picture is dark, so nobody is seen to change place.
  skipLoops(cue?: string) {
    if (cue && this.cues.has(cue)) return
    const skip = () => {
      if (cue && this.cues.has(cue)) return
      for (const l of this.loops.values()) {
        if (cue) l.skipTo(cue)
        else l.skipToFront()
      }
    }
    if (PEOPLE_STILL && this.motion) void this.unseen().then(skip)
    else skip()
  }

  // ── Camera ──
  private lens(fov: number) {
    // Portrait screens keep the set in frame by widening the lens.
    return this.camera.aspect >= 1 ? fov : Math.min(100, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) / Math.sqrt(this.camera.aspect))))
  }
  // Set and staging shots, framed on where the cast stands now (group and subject shots follow the characters).
  get shots(): Record<string, ResolvedShot> {
    // Hosts ask on every render, and the answer only changes when someone moves or the window changes shape.
    const key = `${this.camera.aspect.toFixed(3)}|${this.cast.map((c) => `${c.x.toFixed(2)},${c.z.toFixed(2)},${(c.y ?? 0).toFixed(2)},${c.ry.toFixed(2)},${this.isOnStage(c.id)},${this.isLow(c.id)},${this.isDown(c.id)}`).join(";")}`
    if (this.shotsFor?.key === key) return this.shotsFor.shots
    const out = resolveShots(this.set, this.staging, this.cast)
    // Named shots on the cast swing clear of trees, walls and cabins like inline ones (see clearView).
    for (const [k, s] of Object.entries(this.staging?.shots ?? {}))
      if (!("position" in s))
        try {
          out[k] = this.clearView(s, "subject" in s ? [s.subject] : s.subjects)
        } catch {
          // An unknown subject keeps the authored framing.
        }
    this.shotsFor = { key, shots: out }
    return out
  }
  // A named shot, or an inline one (absolute, group or subject). Eased over 2.2 s unless instant or motion is off.
  // The camera follows whoever of its subjects walks, and anyone in `follow`.
  // `ease` shapes the glide, `move` keeps the camera moving once it arrives, and `impact` jolts it, now or as the next
  // blow lands on someone (see director.ts). A shot without a move lets the last one's tilt ease away.
  shot(
    which: string | StagingShot,
    {
      instant = false,
      duration = 2200,
      follow = [] as string[],
      ease = "glide" as Ease,
      move,
      impact,
      take,
    }: { instant?: boolean; duration?: number; follow?: string[]; ease?: Ease; move?: CameraMove; impact?: Impact; take?: string } = {}
  ) {
    let s: ResolvedShot | undefined
    const authored = typeof which === "string" ? this.staging?.shots[which] : which
    const painted = this.painted?.on ? this.painted : null
    const on = [...(authored && "subject" in authored ? [authored.subject] : authored && "subjects" in authored ? authored.subjects : []), ...follow]
    try {
      // A painted set frames the subject from a painted point, so there is no camera to swing clear of the walls.
      if (painted && authored) s = frameShot(authored, this.cast)
      // Any view of the cast is taken from where nothing hides them. A view of the place alone is as its author framed it.
      else s = authored ? this.clearView(authored, on, true, true) : typeof which === "string" ? this.shots[which] : undefined
    } catch {
      s = undefined
    }
    if (!s) return false
    this.asked = { which, follow, duration }
    this.take = take ?? null
    // On a painted set the last take's push is a tighter lens: the new view glides from it, rather than pop wide.
    const pushed = this.pushZoom()
    if (pushed !== 1) {
      this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) / pushed))
      this.camera.updateProjectionMatrix()
    }
    this.moving = move && this.motion ? { ...move, start: null, done: 0 } : null
    for (const t of this.joltTimers) clearTimeout(t)
    this.joltTimers = []
    this.waiting = null
    if (impact && this.motion) {
      if (impact.on === "land") this.waiting = { ...impact, until: performance.now() + 12_000 }
      else this.joltTimers.push(setTimeout(() => this.jolt(impact.shake, impact.punch ?? 0), (impact.delay ?? 0) * 1000))
    }
    this.framed = new Set(on)
    // A walker the new shot is not on is let go. One it is on is followed from where they stand now.
    for (const id of this.followed.keys()) if (!this.framed.has(id)) this.followed.delete(id)
    for (const id of this.framed) if (this.moves.has(id) && !this.moves.get(id)!.unseen && !this.followed.has(id)) this.followed.set(id, { x: this.member(id).x, z: this.member(id).z })
    this.driving = false
    this.circling = THREE.MathUtils.degToRad(authored?.orbit ?? 0)
    this.sweepLeft = authored?.sweep ? THREE.MathUtils.degToRad(authored.sweep) : Number.POSITIVE_INFINITY
    if (this.controls) this.controls.minPolarAngle = 0
    this.activeShot = typeof which === "string" ? which : null
    this.activeFov = s.fov
    if (painted) {
      const on = authored && "subject" in authored ? [authored.subject] : authored && "subjects" in authored ? authored.subjects : []
      const members = this.cast.filter((m) => on.includes(m.id))
      const one = authored && "subject" in authored
      const framed = s
      const view = tripodView(
        painted.points,
        { ...s, fov: this.lens(s.fov) },
        this.camera.aspect,
        this.spot(),
        (p) => (one ? this.blocked(p, framed.target) : 0) + this.backs(p, framed.position, members)
      )
      this.standOn(view, instant, duration, ease)
      return true
    }
    const to = { pos: V(...s.position), target: V(...s.target), fov: this.lens(s.fov) }
    // The orbit keeps the camera within `maxDistance` of its target, so a long shot down a street would be dragged
    // toward what it looks at. Draw the target in along the same line instead: the framing is unchanged.
    const reach = this.set.camera.maxDistance - 0.1
    if (to.pos.distanceTo(to.target) > reach) to.target.sub(to.pos).setLength(reach).add(to.pos)
    // A glide runs straight, so one that would pass through someone standing between here and there cuts instead: the
    // lens went through the Owlbear on its way round Thalbern.
    if (instant || !this.motion || this.throughSomeone(this.camera.position, to.pos)) {
      this.camera.position.copy(to.pos)
      this.controls?.target.copy(to.target)
      if (!this.controls) this.camera.lookAt(to.target)
      this.camera.fov = to.fov
      this.camera.updateProjectionMatrix()
      this.controls?.update()
      this.transition = null
      this.standees.reset()
      this.models.reset()
      this.settle()
    } else {
      const target = this.controls ? this.controls.target.clone() : this.camera.getWorldDirection(V()).multiplyScalar(10).add(this.camera.position)
      this.transition = { from: { pos: this.camera.position.clone(), target, fov: this.camera.fov }, to, start: performance.now(), duration, ease }
    }
    return true
  }
  // Whether the straight line from `from` to `to` passes through anyone on stage standing: inside the round of their
  // body, below the top of their head. Its two ends are left out, which the shot itself answers for.
  private throughSomeone(from: THREE.Vector3, to: THREE.Vector3) {
    const people = this.cast.filter((m) => this.isOnStage(m.id) && !this.isDown(m.id))
    for (let i = 1; i < 12; i++) {
      const t = i / 12
      const x = from.x + (to.x - from.x) * t
      const y = from.y + (to.y - from.y) * t
      const z = from.z + (to.z - from.z) * t
      for (const m of people) if (y < (m.y ?? 0) + m.height && Math.hypot(x - m.x, z - m.z) < 0.25 + m.height * 0.18) return true
    }
    return false
  }
  // A view of the cast, taken from where nothing solid hides anyone it is on (see spec/view.ts). `ids` are the shot's
  // own subjects and then whoever else it is to keep in the picture. Solid is the set as built (spec/sight.ts), not its
  // footprints, so a tree counts for its roots and its lean as well as its trunk. With `sure`, the views it would take
  // are also put to the GPU, which knows what a look stood in the set after it was built.
  // With `turn`, a single subject the camera had to swing far round turns toward it, so they are not seen from behind.
  private clearView(which: StagingShot, ids: string[], turn = false, sure = false): ResolvedShot {
    const { shot, moved } = clearView({
      shot: which,
      cast: this.cast,
      ids,
      sight: this.sight,
      box: this.set.camera,
      rooms: this.set.rooms,
      aspect: this.camera.aspect,
      lens: (fov) => this.lens(fov),
      crowd: this.crowd.people,
      present: (m) => this.isOnStage(m.id),
      seen: this.seenAs,
      truth: sure ? (lens, figures) => this.drawn(lens, figures) : undefined,
    })
    const c = "subject" in which ? this.cast.find((m) => m.id === which.subject) : undefined
    if (turn && moved && c && "subject" in which && new Set(ids).size === 1) {
      const bearing = Math.atan2(shot.position[0] - c.x, shot.position[2] - c.z)
      const off = Math.atan2(Math.sin(bearing - c.ry), Math.cos(bearing - c.ry))
      if (Math.abs(off) > THREE.MathUtils.degToRad(60)) c.ry = bearing - THREE.MathUtils.degToRad(which.angle)
    }
    return shot
  }
  // What a lens would really show of some figures: the scene drawn small from there with its own materials, cast and
  // crowd left out, and its depth read back. This is the truth of what is on screen. A look stands modelled trees
  // where the set built its own, thicker in the shader than anything the set knows, and only what is drawn knows that.
  // A few milliseconds, so it is asked when a shot is taken and never each frame. Null where it cannot be had.
  private probe: { seen: THREE.WebGLRenderTarget; read: THREE.WebGLRenderTarget; pack: FullScreenQuad; camera: THREE.PerspectiveCamera; bytes: Uint8Array } | null = null
  private drawn(lens: Lens, figures: readonly Seen[]): ViewCost | null {
    const W = 160
    const H = 100
    const NEAR = 0.3
    const FAR = 250
    try {
      this.probe ??= {
        seen: new THREE.WebGLRenderTarget(W, H, { depthTexture: new THREE.DepthTexture(W, H, THREE.FloatType) }),
        read: new THREE.WebGLRenderTarget(W, H, { depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }),
        // Metres from the lens, whole in one byte and the rest in the next: a byte target reads back everywhere.
        pack: new FullScreenQuad(
          new THREE.ShaderMaterial({
            uniforms: { tDepth: { value: null } },
            depthTest: false,
            depthWrite: false,
            vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
            fragmentShader: `varying vec2 vUv; uniform sampler2D tDepth;
void main(){ float z = texture2D(tDepth, vUv).x * 2.0 - 1.0; float d = min(2.0 * ${NEAR.toFixed(1)} * ${FAR.toFixed(1)} / (${(FAR + NEAR).toFixed(1)} - z * ${(FAR - NEAR).toFixed(1)}), 254.0);
 gl_FragColor = vec4(floor(d) / 255.0, fract(d), 0.0, 1.0); }`,
          })
        ),
        camera: new THREE.PerspectiveCamera(50, 1, NEAR, FAR),
        bytes: new Uint8Array(W * H * 4),
      }
      const { seen, read, pack, camera, bytes } = this.probe
      camera.fov = lens.fov
      camera.aspect = lens.aspect
      camera.position.set(lens.position[0], lens.position[1], lens.position[2])
      camera.lookAt(lens.target[0], lens.target[1], lens.target[2])
      camera.updateProjectionMatrix()
      camera.updateMatrixWorld()
      const r = this.renderer
      const hide = [this.crowd.group, this.standees.group, this.models.group, this.effects.group]
      const was = hide.map((h) => h.visible)
      const target = r.getRenderTarget()
      const shadows = r.shadowMap.autoUpdate
      for (const h of hide) h.visible = false
      r.shadowMap.autoUpdate = false
      try {
        r.setRenderTarget(seen)
        r.clear()
        r.render(this.scene, camera)
        ;(pack.material as THREE.ShaderMaterial).uniforms.tDepth.value = seen.depthTexture
        r.setRenderTarget(read)
        pack.render(r)
        r.readRenderTargetPixels(read, 0, 0, W, H, bytes)
      } finally {
        r.setRenderTarget(target)
        r.shadowMap.autoUpdate = shadows
        hide.forEach((h, i) => {
          h.visible = was[i]
        })
      }
      const depthAt = (i: number, j: number) => bytes[(j * W + i) * 4] + bytes[(j * W + i) * 4 + 1] / 255
      const forward = camera.getWorldDirection(V())
      const p = V()
      const hid = { worst: 0, sum: 0 }
      const off = { worst: 0, sum: 0 }
      let nearest = FAR
      let ground = Number.POSITIVE_INFINITY
      for (const c of figures) {
        const points = figurePoints(c, lens.position)
        let lost = 0
        let outside = 0
        for (const [x, y, z] of points) {
          const depth = p.set(x, y, z).sub(camera.position).dot(forward)
          p.set(x, y, z).project(camera)
          if (depth < NEAR || Math.abs(p.x) > 0.94 || Math.abs(p.y) > 0.94) {
            outside++
            continue
          }
          if (depthAt(Math.min(W - 1, Math.floor((p.x * 0.5 + 0.5) * W)), Math.min(H - 1, Math.floor((p.y * 0.5 + 0.5) * H))) < depth - 0.4) lost++
        }
        hid.worst = Math.max(hid.worst, lost / points.length)
        hid.sum += lost / points.length
        off.worst = Math.max(off.worst, outside / points.length)
        off.sum += outside / points.length
        nearest = Math.min(nearest, p.set(c.x, (c.y ?? 0) + c.height * 0.6, c.z).sub(camera.position).dot(forward))
        ground = Math.min(ground, c.y ?? 0)
      }
      // The middle of the picture: what stands there nearer than anyone, and is not the ground or what grows low on it.
      let filled = 0
      let all = 0
      for (let j = Math.floor(H * 0.25); j < H * 0.7; j += 3)
        for (let i = Math.floor(W * 0.15); i < W * 0.85; i += 3) {
          all++
          const d = depthAt(i, j)
          if (d >= nearest - 0.8) continue
          p.set(((i + 0.5) / W) * 2 - 1, ((j + 0.5) / H) * 2 - 1, 0.5)
            .unproject(camera)
            .sub(camera.position)
          if (camera.position.y + (p.y * d) / p.dot(forward) > ground + 0.9) filled++
        }
      const n = Math.max(1, figures.length)
      return { hidden: (hid.worst + hid.sum / n) / 2, out: (off.worst + off.sum / n) / 2, cover: filled / Math.max(1, all) }
    } catch {
      return null
    }
  }
  // Whether the camera is on its way to a view, or the picture has dipped. A painted set's slow drift in is not counted.
  // What is pinned to someone on screen, such as a speech bubble, waits for this to end.
  get cameraMoving() {
    return !!(this.transition || this.cut || this.dip)
  }
  // Resolves when the current camera move has finished.
  shotSettled() {
    return this.transition || this.cut ? new Promise<void>((r) => this.settleWaiters.push(r)) : Promise.resolve()
  }
  private settle() {
    const w = this.settleWaiters
    this.settleWaiters = []
    for (const r of w) r()
  }
  // Jump an in-progress camera move to its end.
  finishShot() {
    if (this.cut) {
      clearTimeout(this.cut.timer)
      this.cut.arrive()
    }
    const tr = this.transition
    if (!tr) return
    this.camera.position.copy(tr.to.pos)
    this.controls?.target.copy(tr.to.target)
    this.tripod?.aim.copy(tr.to.target)
    if (!this.controls) this.camera.lookAt(tr.to.target)
    this.camera.fov = tr.to.fov
    this.camera.updateProjectionMatrix()
    this.transition = null
    this.settle()
  }

  // ── Takes: moves, tilts and jolts (director.ts) ──
  // A jolt, as a blow lands: the camera shakes and the lens kicks in, both dying away in a fraction of a second.
  jolt(shake: number, punch = 0) {
    if (!this.motion || (shake <= 0 && punch <= 0)) return
    this.jolts.push({ shake: THREE.MathUtils.clamp(shake, 0, 1), punch: THREE.MathUtils.clamp(punch, 0, 1), at: this.shared.time.value, seed: Math.random() * 100 })
  }
  // How far along the take's move is, 0..1, easing out.
  private moveShare(m: Moving) {
    if (m.start === null) return 0
    const t = THREE.MathUtils.clamp((this.shared.time.value - m.start - (m.delay ?? 0)) / Math.max(0.1, m.seconds), 0, 1)
    return 1 - (1 - t) ** 3
  }
  // On a painted set, whose camera cannot leave its point, a push is the lens closing in.
  private pushZoom() {
    const m = this.moving
    if (!m?.push || !this.tripod) return 1
    return 1 / Math.max(0.4, 1 - m.push * this.moveShare(m))
  }
  // The take's move, made a step at a time once the camera has arrived, so the player's drag or someone walking it
  // follows still compose with it. It ends short of a wall or a trunk.
  private stepMove() {
    const m = this.moving
    if (!m || this.transition || this.cut) return
    if (m.start === null) m.start = this.shared.time.value
    const share = this.moveShare(m)
    const d = share - m.done
    m.done = share
    if (d <= 0 || this.tripod || !this.controls) return
    const p = this.camera.position
    const t = this.controls.target
    const next = p.clone().addScaledVector(V().subVectors(t, p), (m.push ?? 0) * d)
    next.y += (m.rise ?? 0) * d
    // Never through what it looks at, nor below the ground.
    if (next.distanceTo(t) < 0.6 || next.y < 0.25 || !roomAt(this.sight, next.x, next.y, next.z)) {
      this.moving = { ...m, push: 0, rise: 0 }
      return
    }
    p.copy(next)
  }
  // Draws the frame with the take's tilt and any jolt, then puts the camera back as it was, so the controls and the
  // tripod never see them.
  private rendered(dt: number) {
    const m = this.moving
    const want = m?.roll && this.motion ? THREE.MathUtils.degToRad(m.roll) * Math.max(this.moveShare(m), this.transition ? 0 : 0.15) : 0
    this.roll += (want - this.roll) * (1 - Math.exp(-dt / 0.35))
    if (Math.abs(this.roll) < 1e-5) this.roll = 0
    const now = this.shared.time.value
    this.jolts = this.jolts.filter((j) => now - j.at < SHAKE_SECONDS * 4)
    let yaw = 0
    let pitch = 0
    let kick = 0
    for (const j of this.jolts) {
      const t = now - j.at
      const fade = Math.exp(-t / SHAKE_SECONDS)
      yaw += Math.sin(t * 61 + j.seed) * Math.sin(t * 23 + j.seed * 2) * j.shake * SHAKE_ANGLE * fade
      pitch += Math.sin(t * 53 + j.seed * 3) * j.shake * SHAKE_ANGLE * 0.7 * fade
      kick += j.punch * PUNCH_ZOOM * (t < PUNCH_RISE ? t / PUNCH_RISE : Math.exp(-(t - PUNCH_RISE) / (SHAKE_SECONDS * 0.8)))
    }
    if (!this.roll && !yaw && !pitch && !kick) return this.render()
    const q = this.camera.quaternion.clone()
    const zoom = this.camera.zoom
    this.camera.rotateY(yaw)
    this.camera.rotateX(pitch)
    this.camera.rotateZ(this.roll)
    this.camera.zoom = zoom * (1 + kick)
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld()
    this.render()
    this.camera.quaternion.copy(q)
    this.camera.zoom = zoom
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld()
  }

  // ── Tripod (painted sets) ──
  // Where a shot's subject sits on the canvas: the middle of what a docked panel leaves uncovered (see setInsets).
  private spot(): Spot {
    const w = Math.max(1, this.o.container.clientWidth)
    const h = Math.max(1, this.o.container.clientHeight)
    return [-Math.min(this.insets.right, w) / w, Math.min(this.insets.bottom, h) / h]
  }
  // Whether something solid stands between a point and what a shot looks at: 20 if so, as metres of the wrong place.
  private blocked(point: TripodPoint, target: readonly number[]) {
    const { x, y, z } = point.position
    const len = Math.hypot(target[0] - x, target[2] - z)
    const n = Math.max(2, Math.ceil(len / 0.1))
    for (let i = 0; i <= n; i++) {
      const t = i / n
      if (t * len > len - 0.4) break
      if (onFootprint(this.footprints, x + (target[0] - x) * t, z + (target[2] - z) * t, y + (target[1] - y) * t)) return 20
    }
    return 0
  }
  // A shot that meant to show its subjects' faces is worth little from a point that shows their backs, as a card has
  // no side view. For each subject the shot saw from the front, up to 16 as metres of the wrong place: more than a
  // painting enlarged by half costs, which is what the wider view from the right side usually takes.
  private backs(point: TripodPoint, from: readonly number[], members: CastMember[]) {
    const off = (c: CastMember, x: number, z: number) => Math.abs(Math.atan2(Math.sin(Math.atan2(x - c.x, z - c.z) - c.ry), Math.cos(Math.atan2(x - c.x, z - c.z) - c.ry)))
    let cost = 0
    for (const c of members) {
      if (off(c, from[0], from[2]) > THREE.MathUtils.degToRad(80)) continue
      cost += THREE.MathUtils.clamp((THREE.MathUtils.radToDeg(off(c, point.position.x, point.position.z)) - 60) / 30, 0, 2) * 8
    }
    return members.length ? cost / members.length : 0
  }
  // Take a view from a painted point. On the same point the camera turns and zooms to it. To another point it cuts,
  // through a short fade: the way between two points was never painted.
  private standOn(view: View, instant: boolean, duration: number, ease: Ease = "glide") {
    if (this.cut) {
      clearTimeout(this.cut.timer)
      this.cut = null
    }
    const arrive = () => {
      this.cut = null
      this.tripod = { point: view.point, aim: view.target.clone(), want: { target: view.wanted.clone(), fov: view.asked, placed: true } }
      this.painted?.setPoint(view.point)
      this.fitSun()
      this.standees.tripod = view.point.position
      this.crowd.cards?.faceTripod(view.point.position)
      this.camera.position.copy(view.point.position)
      this.camera.lookAt(view.target)
      this.camera.fov = view.fov
      this.camera.updateProjectionMatrix()
      this.transition = null
      // The window may have changed shape since the view was worked out.
      this.refit()
      this.standees.reset()
      this.models.reset()
      this.arrived = this.shared.time.value
      // A dip under way brings the picture back itself, once whoever it hides has been put in place.
      if (!this.dip) this.canvas.style.opacity = "1"
      this.settle()
    }
    if (this.tripod?.point === view.point && !instant && this.motion) {
      this.tripod.want = { target: view.wanted.clone(), fov: view.asked, placed: true }
      this.transition = {
        from: { pos: view.point.position.clone(), target: this.tripod.aim.clone(), fov: this.camera.fov },
        to: { pos: view.point.position.clone(), target: view.target, fov: view.fov },
        start: performance.now(),
        duration,
        ease,
      }
      return
    }
    if (instant || !this.motion || !this.tripod || this.tripod.point === view.point) return arrive()
    this.transition = null
    this.canvas.style.transition = "opacity 170ms ease"
    this.canvas.style.opacity = "0"
    this.cut = { arrive, timer: setTimeout(arrive, 190) }
  }
  // The sun's shadow map covers the ground about the current point and no more: figures' shadows are the only ones in
  // it, and over the whole set a figure is a few texels wide.
  private fitSun() {
    const box = this.painted?.sunBox
    if (!box) return
    const A = this.set.atmosphere
    this.sun.target.position.copy(box.center)
    this.sun.target.updateMatrixWorld()
    this.sun.position
      .set(...A.sun.direction)
      .normalize()
      .multiplyScalar(A.sun.distance)
      .add(box.center)
    const c = this.sun.shadow.camera
    c.left = c.bottom = -box.radius
    c.right = c.top = box.radius
    c.updateProjectionMatrix()
  }
  // The player turns the camera: a drag of the canvas's height turns it by one lens. It stops at the paint's edge.
  private turnTripod(dx: number, dy: number) {
    const t = this.tripod
    if (!t) return
    const aim = t.aim.clone().sub(t.point.position)
    const far = aim.length()
    const k = THREE.MathUtils.degToRad(this.camera.fov) / Math.max(1, this.canvas.clientHeight)
    const s = new THREE.Spherical().setFromVector3(aim)
    s.theta += dx * k
    s.phi = THREE.MathUtils.clamp(s.phi - dy * k, 0.05, Math.PI - 0.05)
    this.lookFrom(t, aim.setFromSpherical(s), far, this.camera.fov, [0, 0])
    t.want = { target: t.aim.clone(), fov: t.want.fov, placed: false }
  }
  // The wheel or a pinch: the lens the player ends with is the one a resized window keeps.
  private zoomTripod(factor: number) {
    const t = this.tripod
    if (!t) return
    const aim = t.aim.clone().sub(t.point.position)
    this.lookFrom(t, aim, aim.length(), THREE.MathUtils.clamp(this.camera.fov * factor, minFov(t.point, aim), 110), [0, 0])
    t.want = { target: t.aim.clone(), fov: this.camera.fov, placed: false }
  }
  // The view the camera was asked for, fitted to the paintings again: the window or a docked panel changed its shape.
  // A move in progress ends at the new fit.
  private refit() {
    const t = this.tripod
    if (!t) return
    const p = t.point.position
    const aim = V().subVectors(t.want.target, p)
    const tr = this.transition
    const at: Spot = t.want.placed ? this.spot() : [0, 0]
    if (!tr) return this.lookFrom(t, aim, aim.length(), t.want.fov, at)
    const fit = fitView(t.point, aim, t.want.fov, this.camera.aspect, at)
    tr.to.target.copy(p).addScaledVector(fit.dir, aim.length())
    tr.to.fov = fit.fov
  }
  private lookFrom(t: { point: TripodPoint; aim: THREE.Vector3 }, aim: THREE.Vector3, far: number, fov: number, at: Spot) {
    const fit = fitView(t.point, aim, fov, this.camera.aspect, at)
    t.aim.copy(t.point.position).addScaledVector(fit.dir, far)
    this.camera.fov = fit.fov
    this.camera.updateProjectionMatrix()
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
    // No card is seen to walk (see PEOPLE_STILL).
    if (this.still(id)) {
      return new Promise<void>((resolve) => {
        this.moves.set(id, { tx: p.x, tz: p.z, speed, resolve, unseen: true })
        this.putUnseen(id)
      })
    }
    if (!this.followed.has(id) && (this.framed.has(id) || this.inView(c))) this.followed.set(id, { x: c.x, z: c.z })
    if (this.cameOn.delete(id)) this.body(id, "enter", speed)
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
  // Take a cast member off the stage (hidden, still placed) or bring them back.
  setOnStage(id: string, on: boolean) {
    this.member(id)
    if (on && this.standees.offstage.delete(id)) this.cameOn.add(id)
    else if (!on) this.standees.offstage.add(id)
  }
  isOnStage(id: string) {
    return !this.standees.offstage.has(id)
  }
  // Lay a cast member on the ground where they stand (a fall), or stand them up again.
  // They fall onto their back, away from the way they face. `lands` (a mark or point) turns them so the head comes
  // down there. `instant` skips the fall, for someone already down when the scene is shown.
  setDown(id: string, down: boolean, instant = false, lands?: string | [number, number]) {
    const c = this.member(id)
    if (down && lands !== undefined && !this.standees.down.has(id)) {
      const p = this.point(lands)
      c.ry = Math.atan2(c.x - p.x, c.z - p.z)
    }
    // Nobody is seen to fall: they are down when the picture comes back. A 3D figure has a fall of its own, and is seen.
    if (PEOPLE_STILL && this.motion && !instant && down !== this.standees.down.has(id) && !this.models.active(id)) return void this.unseen().then(() => this.standees.lay(id, down, true))
    if (down && !instant && this.motion && !this.standees.down.has(id)) this.body(id, "fall")
    this.standees.lay(id, down, instant)
    if (instant) this.models.settle(id)
  }
  isDown(id: string) {
    return this.standees.down.has(id)
  }
  // Mark whose turn it is with a ring on the ground about them, or no one.
  setTurn(id: string | null) {
    this.standees.turn = id
  }
  // Keep a cast member low, as someone hidden is: a figure sinks into a crouch once it has stopped walking and stays
  // there, and a card, which has no knees, shows see-through. Standing again undoes it. `instant` skips the sinking, for
  // someone already hidden when the scene is shown.
  setLow(id: string, low: boolean, instant = false) {
    this.member(id)
    // The sinking is heard as it happens: at once for someone standing still, and at the end of a walk to cover.
    if (low && !instant && this.motion && !this.standees.low.has(id) && this.models.active(id)) {
      if (this.moves.has(id)) this.sinking.add(id)
      else this.body(id, "crouch")
    }
    if (!low) this.sinking.delete(id)
    if (low) this.standees.low.add(id)
    else this.standees.low.delete(id)
    if (instant) {
      this.standees.settleLow(id)
      this.models.settleLow(id)
    }
  }
  isLow(id: string) {
    return this.standees.low.has(id)
  }
  // Whether a cast member is put where they go unseen rather than walked there: a card is (PEOPLE_STILL), a figure is not.
  private still(id: string) {
    return PEOPLE_STILL && !this.models.active(id)
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
    this.cameOn.delete(id)
    this.sinking.delete(id)
    if (facing !== undefined) this.faceCast(id, facing)
  }
  // The picture dips to dark and comes back, as it does when the camera cuts. Resolves while it is dark, which is when
  // to put someone in a new place. Placements that follow one another at once, such as the legs of one walk, share
  // the dip: it lifts a moment after the last of them.
  private unseen() {
    if (!this.dip) {
      this.canvas.style.transition = "opacity 170ms ease"
      this.canvas.style.opacity = "0"
      this.dip = { dark: new Promise<void>((r) => setTimeout(r, 190)), lift: null }
    }
    const d = this.dip
    return d.dark.then(() => {
      if (d.lift) clearTimeout(d.lift)
      d.lift = setTimeout(() => {
        if (this.dip === d) this.dip = null
        // A cut under way brings the picture back itself.
        if (!this.cut) this.canvas.style.opacity = "1"
      }, 90)
    })
  }
  // Puts a cast member where their move was taking them, once the picture has dipped. A move that was replaced or
  // finished meanwhile is left alone.
  private putUnseen(id: string) {
    const m = this.moves.get(id)
    if (!m) return
    m.unseen = true
    const c = this.member(id)
    c.walking = false
    void this.unseen().then(() => {
      if (this.moves.get(id) !== m) return
      // They end facing the way they went, as a walk leaves them.
      if (Math.hypot(m.tx - c.x, m.tz - c.z) > 0.02) c.ry = Math.atan2(m.tx - c.x, m.tz - c.z)
      c.x = m.tx
      c.z = m.tz
      this.moves.delete(id)
      m.resolve()
    })
  }
  // Whether a cast member stands within the picture.
  private inView(c: CastMember) {
    const p = V(c.x, (c.y ?? 0) + c.height * 0.5, c.z).project(this.camera)
    return p.z < 1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1
  }
  // The camera keeps up with whoever it follows: it moves with them, or on a painted set, where it cannot leave its
  // point, it turns after them. With two on screen and one walking, it goes half the way, to keep both.
  private follow() {
    if (!this.followed.size) return
    let dx = 0
    let dz = 0
    for (const [id, was] of this.followed) {
      const c = this.member(id)
      dx += c.x - was.x
      dz += c.z - was.z
      was.x = c.x
      was.z = c.z
      if (!this.moves.has(id)) this.followed.delete(id)
    }
    const n = Math.max(1, this.framed.size)
    dx /= n
    dz /= n
    const tr = this.transition
    if (Math.abs(dx) + Math.abs(dz) >= 1e-6 && !this.cut) {
      const d = V(dx, 0, dz)
      if (this.tripod) {
        this.tripod.want.target.add(d)
        if (tr) tr.from.target.add(d)
        this.refit()
        return
      }
      // Where going along would walk the camera into a trunk or a wall, it stays and turns after them instead.
      const next = (tr ? tr.to.pos : this.camera.position).clone().add(d)
      const along = roomAt(this.sight, next.x, next.y, next.z)
      if (along) this.camera.position.add(d)
      this.controls?.target.add(d)
      if (tr) {
        if (along) {
          tr.from.pos.add(d)
          tr.to.pos.add(d)
        }
        tr.from.target.add(d)
        tr.to.target.add(d)
      }
    }
    // The last of them has stopped. The view was framed on where they stood when it was taken: if it hides them where
    // they stand now, it is taken again.
    if (this.followed.size || this.tripod || this.cut || this.driving || !this.asked || !this.controls) return
    if (!this.hides(tr ? tr.to.pos : this.camera.position, tr ? tr.to.target : this.controls.target)) return
    const { which, follow, duration } = this.asked
    this.shot(which, { follow, duration })
  }
  // A cast member as the sight test sees them: where they stand and how much of them there is to hide.
  private seenAs = (m: CastMember) => ({ x: m.x, z: m.z, y: m.y, height: this.isLow(m.id) ? m.height * 0.6 : m.height, down: this.isDown(m.id) })
  // Whether a view from a point hides those the current shot is on, by more than a shoulder.
  private hides(from: THREE.Vector3, target: THREE.Vector3) {
    const figures = this.cast.filter((m) => this.framed.has(m.id) && this.isOnStage(m.id))
    if (!figures.length) return false
    const lens = { position: [from.x, from.y, from.z] as const, target: [target.x, target.y, target.z] as const, fov: this.activeFov ? this.lens(this.activeFov) : this.camera.fov, aspect: this.camera.aspect }
    const v = viewCost(this.sight, lens, figures.map(this.seenAs))
    return v.hidden > 0.2 || v.out > 0.3 || v.cover > 0.3
  }
  // A slow move round what the camera looks at, level, at the shot's pace. A painted set cannot: its camera stands on
  // a painted point. During a shot's ease in, the point it eases to moves round as well.
  private circle(dt: number) {
    if (!this.circling || this.tripod || !this.controls) return
    // A sweep slows over its last second or so and stops.
    const rate = Math.abs(this.circling)
    const way = Math.sign(this.circling)
    const ease = THREE.MathUtils.clamp(this.sweepLeft / (rate * 1.2), 0.08, 1)
    const step = Math.min(this.sweepLeft, rate * ease * dt)
    this.sweepLeft -= step
    if (this.sweepLeft <= 1e-4) this.circling = 0
    const a = way * step
    const turn = (pos: THREE.Vector3, about: THREE.Vector3) => {
      const next = pos.clone().sub(about).applyAxisAngle(V(0, 1, 0), a).add(about)
      // The move ends short of a trunk or a wall, and short of putting one between the lens and its subjects.
      if (!roomAt(this.sight, next.x, next.y, next.z) || (this.hides(next, about) && !this.hides(pos, about))) this.circling = 0
      else pos.copy(next)
    }
    const tr = this.transition
    if (tr) return void turn(tr.to.pos, tr.to.target)
    turn(this.camera.position, this.controls.target)
  }
  private stepMoves(dt: number) {
    for (const [id, m] of this.moves) {
      if (m.unseen) continue
      const c = this.member(id)
      if (this.still(id)) {
        this.putUnseen(id)
        continue
      }
      const dx = m.tx - c.x
      const dz = m.tz - c.z
      const dist = Math.hypot(dx, dz)
      if (dist < 0.02) {
        c.x = m.tx
        c.z = m.tz
        c.walking = false
        m.resolve()
        this.moves.delete(id)
        // A walk of several legs goes straight on to the next, so they sink only where no leg follows.
        if (!this.moves.has(id) && this.sinking.delete(id) && this.standees.low.has(id)) this.body(id, "crouch")
        continue
      }
      const step = Math.min(dist, m.speed * dt)
      c.x += (dx / dist) * step
      c.z += (dz / dist) * step
      c.ry = Math.atan2(dx, dz)
      c.walking = true
      c.gait = m.speed
      // A footfall each time a foot of the figure's walk comes down, the first half a step in. One with no walk of
      // its own steps as someone of its height would: further for the tall and for the quick.
      const every = this.models.stepSeconds(id, m.speed) ?? (c.height * (0.16 + 0.18 * Math.min(m.speed, 3))) / m.speed
      const since = (this.trod.get(id) ?? every / 2) + dt
      this.trod.set(id, since >= every ? 0 : since)
      if (since >= every && this.isOnStage(id)) this.body(id, "step", m.speed)
    }
  }
  // Tells the listeners what a cast member's body does (effects.ts `BodyEvent`).
  private body(id: string, act: BodyAct, pace = 0) {
    if (!this.effectListeners.size) return
    const c = this.member(id)
    const near = this.camera.position.distanceTo(V(c.x, (c.y ?? 0) + c.height / 2, c.z))
    const surface = this.floor.at(c.x, c.z, c.y ?? 0)
    for (const l of this.effectListeners) l({ type: "body", act, id, height: c.height, pace, near, voice: c.voice, surface })
  }

  // UI laid over part of the canvas (a docked panel): shots compose in the uncovered area, and the scene continues
  // under the panel. Implemented as a camera view offset, so framing, picking and projection all agree.
  setInsets(insets: { right?: number; bottom?: number }) {
    this.insets = { right: Math.max(0, insets.right ?? 0), bottom: Math.max(0, insets.bottom ?? 0) }
    this.resize()
  }
  // A camera the player drags into a wall or a house is drawn back toward what it looks at until it stands clear, as a
  // game camera keeps out of the scenery. Shots are framed by their authors and left alone.
  // While the player drives the camera it never ends up inside anything solid, and it stays on the near side of a
  // building, wall or tower between it and what it looks at, as a third-person camera's arm does: dragged behind a
  // tower, it stops in front of the tower instead of showing it. Stalls and tables are low, so the arm passes over them.
  private walls: Footprint[] | null = null
  private collide() {
    if (!this.driving || !this.controls || !this.solids.length) return
    const p = this.camera.position
    const t = this.controls.target
    // The last point outside, between one known to be outside (lo) and one inside (hi).
    const pull = (inside: (v: THREE.Vector3) => boolean, from: number, to: number) => {
      const q = V()
      let lo = from
      let hi = to
      for (let i = 0; i < 10; i++) {
        const m = (lo + hi) / 2
        if (inside(q.lerpVectors(t, p, m))) hi = m
        else lo = m
      }
      return lo
    }
    const solid = (v: THREE.Vector3) => onFootprint(this.solids, v.x, v.z, v.y)
    if (solid(t)) return
    if (solid(p)) p.lerpVectors(t, p.clone(), pull(solid, 0, 1))
    this.walls ??= this.solids.filter((f) => (f.kind === "circle" ? f.r >= 1.2 : f.hw * f.hd >= 7.5))
    const wall = (v: THREE.Vector3) => onFootprint(this.walls!, v.x, v.z, v.y)
    const len = p.distanceTo(t)
    const steps = Math.max(1, Math.ceil(len / 0.3))
    const q = V()
    for (let i = 1; i <= steps; i++) {
      if (!wall(q.lerpVectors(t, p, i / steps))) continue
      const lo = pull(wall, (i - 1) / steps, i / steps)
      // A hand's width short of the wall, so the near plane does not cut into it.
      p.lerpVectors(t, p.clone(), Math.max(0, lo * len - 0.35) / len)
      return
    }
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
    if (f.figures !== undefined) void this.models.enable(f.figures)
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
    p.paint.strength = this.painted?.on ? 0 : Math.min(1, f.brush)
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
    // A painted set's lens is the whole canvas, and a docked panel moves the subject by turning the camera (see spot).
    const whole = !!this.painted?.on
    this.camera.aspect = whole ? w / h : vw / vh
    if (!whole && (vw !== w || vh !== h)) this.camera.setViewOffset(vw, vh, 0, 0, w, h)
    else this.camera.clearViewOffset()
    if (this.tripod) this.refit()
    else if (!this.transition && this.activeFov) this.camera.fov = this.lens(this.activeFov)
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
  // No frame is drawn until the stage has loaded and its shaders are compiled. A frame drawn on the way compiled them
  // itself, on the page's thread, while the stage was still loading behind the last picture.
  private loaded = false
  private sync() {
    const run = this.loaded && !this.paused && this.visible && document.visibilityState !== "hidden"
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
      this.follow()
      this.circle(dt)
      // A line stands still. When the beats have moved it on, everyone is put in their new place unseen.
      if (!PEOPLE_STILL) for (const l of this.loops.values()) l.update(dt)
      else
        for (const l of this.loops.values()) {
          if (l.paused || !l.busy || this.closing.has(l)) continue
          this.closing.add(l)
          void this.unseen().then(() => {
            this.closing.delete(l)
            l.finish()
          })
        }
      this.shared.time.value += dt
      this.crowd.update(dt, PEOPLE_STILL)
      for (const f of this.life) f(this.shared.time.value)
    }
    if (this.transition) {
      const tr = this.transition
      const t = THREE.MathUtils.clamp((performance.now() - tr.start) / tr.duration, 0, 1)
      const e = eased(tr.ease, t)
      this.camera.position.lerpVectors(tr.from.pos, tr.to.pos, e)
      const target = V().lerpVectors(tr.from.target, tr.to.target, e)
      if (this.controls) this.controls.target.copy(target)
      else this.camera.lookAt(target)
      this.tripod?.aim.copy(target)
      this.camera.fov = THREE.MathUtils.lerp(tr.from.fov, tr.to.fov, e)
      this.camera.updateProjectionMatrix()
      if (t === 1) {
        this.transition = null
        this.settle()
      }
    }
    this.stepMove()
    if (this.tripod) {
      // The camera drifts in to its point, looking at what it was aimed at, and then holds still.
      const { point, aim } = this.tripod
      const amp = this.set.painted?.drift ?? 0
      const left = this.motion && amp ? (1 - THREE.MathUtils.clamp((this.shared.time.value - this.arrived) / DRIFT_SECONDS, 0, 1)) ** 3 : 0
      this.camera.position.copy(point.position).add(driftIn(V().subVectors(aim, point.position), this.camera.fov, amp, left))
      this.camera.lookAt(aim)
      const zoom = (amp ? 1 + DRIFT_PUSH * (1 - left) : 1) * this.pushZoom()
      if (zoom !== this.camera.zoom) {
        this.camera.zoom = zoom
        this.camera.updateProjectionMatrix()
      }
    } else {
      this.controls?.update()
      this.constrain()
      this.collide()
    }
    this.lightRoom(dt)
    this.hearPlace(dt)
    if (this.motion) this.effects.update(dt)
    this.standees.update(dt, this.camera)
    this.models.update(dt, this.motion, this.camera)
    this.crowd.updateLOD(this.camera)
    // A fade takes a third of a second, or none with motion off.
    this.crowd.occlude(this.camera, this.tripod?.aim ?? this.controls?.target ?? this.camera.getWorldDirection(V()).multiplyScalar(6).add(this.camera.position), this.motion ? dt / 0.3 : 1)
    this.crowd.flush()
    this.rendered(dt)
    if (++this.frame === 3) {
      this.ready = true
      this.readyResolve?.()
    }
  }
  // Lamps from a light list at a share of their strength. Unused lamps go dark.
  private light(list: SetSpec["atmosphere"]["lights"], k: number) {
    this.lamps.forEach((lamp, i) => {
      const l = list[i]
      if (!l) return void (lamp.intensity = 0)
      lamp.position.set(...l.at)
      lamp.color.set(l.color)
      lamp.distance = l.distance
      lamp.decay = l.decay
      lamp.intensity = l.intensity * k
    })
  }
  // How near the camera is to open water, 1 at the water's edge or over it and 0 from 15 metres off, told to the
  // listeners a few times a second when it changes: a host turns the river up near it and the land's beds down.
  private hearPlace(dt: number) {
    this.sinceWet += dt
    if (this.sinceWet < 0.25 || !this.effectListeners.size) return
    this.sinceWet = 0
    this.waters ??= this.set.objects.flatMap((o) => {
      const p = o as { type: string; material?: string; plane?: string; points?: number[][]; at?: number[]; yaw?: number }
      if (p.type !== "extrude" || p.plane !== "xz" || p.yaw || !p.points || this.set.materials[p.material ?? ""]?.type !== "water") return []
      const [ax, , az] = p.at ?? [0, 0, 0]
      return [p.points.map(([x, z]) => [x + ax, z + az] as [number, number])]
    })
    if (!this.waters.length) return
    const { x, z } = this.camera.position
    let d = Infinity
    for (const poly of this.waters) {
      let inside = false
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [x1, z1] = poly[i]
        const [x2, z2] = poly[j]
        if (z1 > z !== z2 > z && x < ((x2 - x1) * (z - z1)) / (z2 - z1) + x1) inside = !inside
        const dx = x2 - x1
        const dz = z2 - z1
        const t = THREE.MathUtils.clamp(((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz || 1), 0, 1)
        d = Math.min(d, Math.hypot(x - x1 - t * dx, z - z1 - t * dz))
      }
      if (inside) d = 0
    }
    const near = 1 - THREE.MathUtils.smoothstep(d, 1, 15)
    if (Math.abs(near - this.wet) < 0.04) return
    this.wet = near
    for (const l of this.effectListeners) l({ type: "place", water: near })
  }
  // Inside a room the sky's light fades and the room's lamps take over: the set's lamps dim out, then the room's come up,
  // over about half a second as the camera passes the wall.
  private lightRoom(dt: number) {
    const { x, y, z } = this.camera.position
    const inside = this.set.rooms.find(({ box: b }) => x > b[0] && y > b[1] && z > b[2] && x < b[3] && y < b[4] && z < b[5])
    // A room with beds of its own is heard from the moment the camera is in it.
    if ((inside ?? null) !== this.heard) {
      this.heard = inside ?? null
      for (const l of this.effectListeners) l({ type: "room", ambience: inside?.ambience })
    }
    if (inside) this.room = inside
    const want = inside ? 1 : 0
    // Straight from one room into another (the inn's common room to its backroom), the new room's light takes over.
    if ((want === this.indoors && (!inside || inside === this.lit)) || !this.room) return
    this.indoors = this.motion ? THREE.MathUtils.clamp(this.indoors + Math.sign(want - this.indoors) * dt * 3, 0, 1) : want
    const m = this.indoors
    const r = this.room
    const A = this.set.atmosphere
    const mix = (a: number, b: number) => a + (b - a) * m
    this.hemisphere.intensity = mix(A.hemisphere.intensity, A.hemisphere.intensity * r.ambient)
    this.scene.environmentIntensity = mix(A.environment, A.environment * r.ambient)
    if (this.fill && A.fill) this.fill.intensity = mix(A.fill.intensity, r.fill ?? A.fill.intensity * r.ambient)
    this.renderer.toneMappingExposure = mix(A.exposure, r.exposure ?? A.exposure)
    if (m < 0.5) this.light(A.lights, 1 - 2 * m)
    else this.light(r.lights, 2 * m - 1)
    this.lit = m >= 0.5 ? r : null
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
      take: this.take,
      point: this.tripod?.point.name ?? null,
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
  // The way a cast member walks toward a point: straight, or through a doorway when a wall is in the way, stopping at the
  // first solid thing or after `budget` metres. The points to walk through, in order.
  route(id: string, to: { x: number; z: number }, budget: number) {
    const c = this.member(id)
    const out: { x: number; z: number }[] = []
    let from = { x: c.x, z: c.z }
    let left = budget
    for (const p of routeOver(this.footprints, this.doors, from, to) ?? [to]) {
      const hit = reachOver(this.footprints, from, p, left)
      out.push({ x: hit.x, z: hit.z })
      if (hit.short) break
      left -= hit.distance
      from = p
    }
    return out
  }
  // Where a cast member stands when they walk to a point: beside anyone already there, not on top of them.
  standingRoom(id: string, to: { x: number; z: number }, gap = 0.8) {
    const others = this.cast.filter((c) => c.id !== id && this.isOnStage(c.id))
    return standingRoom(this.footprints, others, this.member(id), to, gap)
  }
  // ── Effects and objects ──
  // A cast member's chest, where effects start and land.
  private chest(id: string): EffectEnd {
    const c = this.member(id)
    return { at: new THREE.Vector3(c.x, (c.y ?? 0) + c.height * 0.62, c.z), id }
  }
  private endOf(ref: string | [number, number]): EffectEnd {
    if (typeof ref === "string" && this.cast.some((c) => c.id === ref)) return this.chest(ref)
    const p = this.point(ref)
    return { at: new THREE.Vector3(p.x, 1, p.z) }
  }
  // An attack or spell from one cast member at another, or at a place, or about themselves with no target. A miss lands
  // beside the target and strikes nobody. Resolves when it has played. With motion off it does not play.
  // A figure (models.ts) that has a move for it makes it first, turned toward the target: a cut for a blade or a blow,
  // a shot for an arrow. The effect starts as the move lands. A figure an attack misses gets out of its way.
  async effect(kind: EffectKind, from: string, to?: string | [number, number], element?: Element, { miss = false } = {}): Promise<void> {
    if (!this.motion) return
    const range = kind === "arrow" ? "ranged" : kind === "slash" || kind === "impact" ? "melee" : null
    const move = range ? this.models.moveFor(from, range) : null
    const toward = typeof to === "string" ? (this.cast.some((c) => c.id === to) ? this.castAt(to) : undefined) : to ? this.point(to) : undefined
    const lands = move ? this.models.act(from, move, toward) : null
    if (range) this.body(from, "strike")
    if (lands) await new Promise((r) => setTimeout(r, lands * 1000))
    if (miss && typeof to === "string") {
      const dodge = this.models.moveFor(to, "dodge")
      if (dodge) {
        this.models.act(to, dodge, this.castAt(from))
        this.body(to, "dodge")
      }
    }
    return this.fire(kind, from, to, element, miss)
  }
  // Keep a weapon in a figure's hand between its moves, as an arrow nocked or a sword drawn, or put it away. A card
  // shows nothing of it.
  readyWeapon(id: string, what: "bow" | "blade" | null) {
    return this.models.ready(id, what)
  }
  // A figure's move by its clip's name, such as a roar, turned toward a cast member or a place. Resolves to the seconds
  // until it lands, or null when the cast member is no figure or has no such clip.
  act(id: string, clip: string, toward?: string | [number, number]) {
    if (!this.motion) return null
    const at = typeof toward === "string" ? this.castAt(toward) : toward ? this.point(toward) : undefined
    return this.models.act(id, clip, at)
  }
  private fire(kind: EffectKind, from: string, to: string | [number, number] | undefined, element: Element | undefined, miss: boolean): Promise<void> {
    const start = this.chest(from)
    let end = to === undefined ? undefined : this.endOf(to)
    if (end && miss) {
      const away = end.at.clone().sub(start.at).setY(0)
      const side = new THREE.Vector3(away.z, 0, -away.x).normalize()
      end = {
        at: end.at
          .clone()
          .addScaledVector(side, 0.9)
          .addScaledVector(away.normalize(), 1.2)
          .setY(end.at.y * 0.8),
      }
    }
    return this.effects.play(kind, start, end, element)
  }
  // An object in a cast member's hand, passed to another when there is a receiver.
  prop(kind: PropKind, holder: string, receiver?: string): Promise<void> {
    if (!this.motion) return Promise.resolve()
    return this.effects.prop(kind, this.chest(holder), receiver ? this.chest(receiver) : undefined)
  }
  // A sound the story names, from where a cast member stands when it is theirs.
  sound(cue: SoundCue, from?: string) {
    const c = from ? this.cast.find((m) => m.id === from) : undefined
    const near = c ? this.camera.position.distanceTo(V(c.x, (c.y ?? 0) + c.height / 2, c.z)) : undefined
    for (const l of this.effectListeners) l({ type: "sound", cue, near })
  }
  // A flash and a shake on a cast member's card, as when struck.
  hit(id: string, color = "#ff5a3c", strength = 1) {
    if (this.models.active(id)) this.models.hit(id, color, strength)
    else this.standees.hit(id, color, strength)
  }
  clearEffects() {
    this.effects.clear()
  }
  // What the stage's effects do as they play, for a host to sound them. The stage itself makes no sound.
  listen(listener: (e: EffectEvent) => void) {
    this.effectListeners.add(listener)
    return () => void this.effectListeners.delete(listener)
  }
  // Where a cast member stands (x, z, and y when raised) and faces (radians).
  castAt(id: string) {
    const c = this.member(id)
    return { x: c.x, y: c.y ?? 0, z: c.z, ry: c.ry, height: c.height }
  }
  pick(x: number, y: number) {
    const ndc = new THREE.Vector2((x / this.canvas.clientWidth) * 2 - 1, -(y / this.canvas.clientHeight) * 2 + 1)
    this.ray.setFromCamera(ndc, this.camera)
    for (const hit of this.ray.intersectObjects([this.standees.group, this.models.pickable()], true)) {
      const id = hit.object.userData.castId as string | undefined
      if (!id) continue
      // A figure is picked by its own shape, a card by its painted part.
      const card = hit.object.parent?.parent === this.standees.group
      if (card ? !this.models.active(id) && (!hit.uv || this.standees.opaqueAt(id, hit.uv)) : this.models.active(id)) return id
    }
    return null
  }
  // The current view as a plain 2D canvas, drawn now: what the stage last showed, kept on screen while the next stage
  // is built behind it.
  picture(): HTMLCanvasElement {
    this.render()
    const c = document.createElement("canvas")
    c.width = this.canvas.width
    c.height = this.canvas.height
    // Dark under the picture: a webview that hands back an empty WebGL canvas still hides what is behind it.
    const g = c.getContext("2d")
    if (g) {
      g.fillStyle = "#000"
      g.fillRect(0, 0, c.width, c.height)
      g.drawImage(this.canvas, 0, 0)
    }
    return c
  }
  // The current view drawn small, for reading its colours: dialogue tints its bands from the set behind them.
  thumbnail(width = 96): { image: ImageData; rect: DOMRect } | null {
    if (!this.canvas.width || !this.canvas.height) return null
    this.render()
    const c = document.createElement("canvas")
    c.width = width
    c.height = Math.max(1, Math.round((width * this.canvas.height) / this.canvas.width))
    const g = c.getContext("2d", { willReadFrequently: true })
    if (!g) return null
    g.drawImage(this.canvas, 0, 0, c.width, c.height)
    return { image: g.getImageData(0, 0, c.width, c.height), rect: this.canvas.getBoundingClientRect() }
  }
  // A PNG of the current view, rendered on demand (no preserveDrawingBuffer needed: read in the same task).
  capture(): Promise<Blob | null> {
    this.rendered(0)
    return new Promise((resolve) => this.canvas.toBlob(resolve, "image/png"))
  }

  dispose() {
    for (const t of this.joltTimers) clearTimeout(t)
    if (this.probe) {
      this.probe.seen.depthTexture?.dispose()
      this.probe.seen.dispose()
      this.probe.read.dispose()
      this.probe.pack.material.dispose()
      this.probe.pack.dispose()
      this.probe = null
    }
    this.running = false
    cancelAnimationFrame(this.raf)
    // Walks in progress end where they are, so nothing awaiting them hangs on a disposed stage.
    for (const m of this.moves.values()) m.resolve()
    this.moves.clear()
    document.removeEventListener("visibilitychange", this.onVisibility)
    this.resizeObserver.disconnect()
    this.intersection?.disconnect()
    this.controls?.dispose()
    this.look?.dispose()
    if (this.cut) clearTimeout(this.cut.timer)
    if (this.dip?.lift) clearTimeout(this.dip.lift)
    this.painted?.dispose()
    for (const m of this.statics) m.geometry.dispose()
    for (const e of this.extras)
      e.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose()
      })
    for (const l of this.life) l.dispose()
    for (const d of this.disposables) d.dispose()
    this.crowd.dispose()
    this.standees.dispose()
    this.models.dispose()
    this.effects.dispose()
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
