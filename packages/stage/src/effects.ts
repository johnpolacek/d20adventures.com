import * as THREE from "three"
import type { TierName } from "./quality"
import {
  createAuraVeil,
  createCrystalLance,
  createGroundMark,
  createLightningBolt,
  createParticleCloud,
  createShardBurst,
  createShockSprite,
  createSpellRibbon,
  createSpellWarmup,
  paletteOf,
  scaleCount,
  tierBudget,
  type ElementPalette,
  type LightningBoltHandle,
  type ParticleSeed,
  type ShardSeed,
  type WarmupPack,
} from "./spell-vfx"
import type { Surface } from "./surface"

// What a story's actions look like on stage, built at runtime from a small fixed library: missiles and blasts for
// attacks and spells, and objects shown in a hand or passed between two people. Each one plays once and is gone. One
// point light is kept for them from the start, dark when idle, so lighting an effect never changes the shaders.
// Procedural GPU spell VFX in `spell-vfx.ts` are adapted from MIT-licensed Three.js work:
// Patch Elements / Ultra Elements (Patch, Humpalumps) and Small Magic (Patch).

export const EFFECT_KINDS = ["arrow", "bolt", "beam", "burst", "aura", "sparkles", "slash", "impact", "mist"] as const
export const ELEMENTS = ["fire", "frost", "lightning", "radiant", "nature", "shadow", "arcane"] as const
export const PROP_KINDS = ["scroll", "scrollcase", "letter", "map", "pouch", "coin", "key", "relic", "lantern", "torch", "blade", "bow", "potion", "book", "gem", "pack"] as const
export type EffectKind = (typeof EFFECT_KINDS)[number]
// What flies where an arrow would: a stone from a sling, or a thrown knife.
export type Shot = "stone" | "knife"
export type Element = (typeof ELEMENTS)[number]
export type PropKind = (typeof PROP_KINDS)[number]
// Sounds a story asks for by name, with nothing seen: a door, a lid, a body into water, wood split, a rope parting.
export const SOUND_CUES = ["door-open", "door-close", "door-creak", "chest", "splash", "crack", "rope"] as const
export type SoundCue = (typeof SOUND_CUES)[number]

const COLORS: Record<Element | "steel" | "blood", string> = {
  fire: "#ff7a2e",
  frost: "#9fd8ff",
  lightning: "#dfe8ff",
  radiant: "#ffe08a",
  nature: "#8fdc6a",
  shadow: "#8a5cc8",
  arcane: "#b98cff",
  steel: "#f4f1ea",
  blood: "#ff5a3c",
}
export const effectColor = (element?: Element, fallback: keyof typeof COLORS = "steel") => COLORS[element ?? fallback]

// Where an effect starts and lands: a point in the world, and the cast member there when there is one, to flash.
export interface EffectEnd {
  at: THREE.Vector3
  id?: string
  // At a figure's hand, as it casts, and not its chest: a ray starts there and not out in front of it.
  hand?: boolean
}
// What the effects do, for a host that sounds them: an effect starting, a missile landing (`struck` when it lands on
// someone), an object taken in hand, a sound the story names (`near`: how far from the camera, in metres, when it
// comes from someone), the camera going into a room or out of one, with the beds that play there, and how near the
// camera is to open water, 0 to 1.
export type EffectEvent =
  | { type: "effect"; kind: EffectKind; element?: Element; phase: "start" | "land"; struck: boolean; shot?: Shot }
  | { type: "prop"; kind: PropKind; passed: boolean }
  | { type: "sound"; cue: SoundCue; near?: number }
  | { type: "room"; ambience?: string[] }
  | { type: "place"; water: number }
  | BodyEvent
// What a cast member's own body does, for the same host: a footfall as they are seen to walk, a fall, sinking into
// cover, walking on, the move of an attack, getting out of one's way, and being struck. `height` in metres says how big
// they are, `pace` how fast they walk in metres a second, `near` how far they are from the camera, `voice` what they
// are when no person, and `surface` what they stand on (surface.ts).
export type BodyAct = "step" | "fall" | "crouch" | "enter" | "strike" | "dodge" | "struck"
export type Voice = "beast"
export interface BodyEvent {
  type: "body"
  act: BodyAct
  id: string
  height: number
  pace: number
  near: number
  voice?: Voice
  surface: Surface
}
export interface EffectHost {
  // A cast member struck: a flash of colour on their card and a shake.
  hit(id: string, color: string, strength: number): void
  event?(e: EffectEvent): void
  // Where the camera is, for objects held toward it.
  camera: THREE.Camera
}

type EffectOutcome = "completed" | "cancelled"
type Live = {
  t: number
  duration: number
  update: (t: number, dt: number, self: Live) => void
  done: (outcome: EffectOutcome) => void
  objects: THREE.Object3D[]
  cleanup?: () => void
}

const ease = (t: number) => t * t * (3 - 2 * t)
const fade = (t: number, inEnd: number, outStart: number) => Math.min(THREE.MathUtils.clamp(t / inEnd, 0, 1), 1 - THREE.MathUtils.clamp((t - outStart) / (1 - outStart), 0, 1))
const rnd = (s = 1) => (Math.random() * 2 - 1) * s
const rng = (a: number, b: number) => a + Math.random() * (b - a)

const FOG_PALETTE: ElementPalette = {
  core: new THREE.Color("#eef3fa"),
  primary: new THREE.Color("#bac4d4"),
  secondary: new THREE.Color("#7f8b9e"),
  dark: new THREE.Color("#495262"),
  light: "#c9ccd2",
  sigilStyle: 4,
  occlude: 0.48,
}

function softTexture() {
  const c = document.createElement("canvas")
  c.width = c.height = 64
  const g = c.getContext("2d")!
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  r.addColorStop(0, "rgba(255,255,255,1)")
  r.addColorStop(0.25, "rgba(255,255,255,0.7)")
  r.addColorStop(1, "rgba(255,255,255,0)")
  g.fillStyle = r
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export class Effects {
  readonly group = new THREE.Group()
  readonly light = new THREE.PointLight("#ffffff", 0, 9, 1.6)
  private live: Live[] = []
  private soft: THREE.Texture | null = null
  private lightOwner: Live | null = null
  private tier: TierName = "high"
  private viewportH = 900
  private warmup: WarmupPack

  constructor(private host: EffectHost) {
    this.group.name = "effects"
    this.group.add(this.light)
    this.warmup = createSpellWarmup()
    this.group.add(this.warmup.group)
  }

  setTier(tier: TierName) {
    this.tier = tier
  }
  setViewportHeight(height: number) {
    if (height > 0) this.viewportH = height
  }
  // Called after the first pipeline render: hides the zero-area warmup meshes so idle draw calls stay zero while
  // keeping all compiled spell shader programs referenced and hot in Three's cache.
  warmed() {
    if (this.warmup.group.visible) this.warmup.group.visible = false
  }

  private glow(color: string, opacity = 1) {
    this.soft ??= softTexture()
    return new THREE.SpriteMaterial({ map: this.soft, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })
  }
  private additive(color: string, opacity = 1) {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  }
  // The shared light, lent to one effect at a time: the latest takes it.
  private lamp(owner: Live, at: THREE.Vector3, color: string, intensity: number) {
    this.lightOwner = owner
    this.light.position.copy(at)
    this.light.color.set(color)
    this.light.intensity = intensity
  }

  private add(duration: number, objects: THREE.Object3D[], update: Live["update"], cleanup?: () => void): Promise<EffectOutcome> {
    for (const o of objects) this.group.add(o)
    return new Promise((resolve) => {
      const live: Live = { t: 0, duration, update, objects, done: resolve, cleanup }
      this.live.push(live)
      update(0, 0, live)
    })
  }

  update(dt: number) {
    for (const l of [...this.live]) {
      l.t += dt
      const t = Math.min(1, l.t / l.duration)
      l.update(t, dt, l)
      if (t >= 1) this.finish(l, "completed")
    }
  }
  private finish(l: Live, outcome: EffectOutcome = "completed") {
    this.live = this.live.filter((x) => x !== l)
    for (const o of l.objects) this.group.remove(o)
    if (l.cleanup) {
      l.cleanup()
    } else {
      for (const o of l.objects) {
        o.traverse((m) => {
          const mesh = m as THREE.Mesh
          mesh.geometry?.dispose()
          const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
          for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) x.dispose()
        })
      }
    }
    if (this.lightOwner === l) {
      this.light.intensity = 0
      this.lightOwner = null
    }
    l.done(outcome)
  }
  // Ends everything at once, as when the scene changes or the reader steps back.
  clear() {
    for (const l of [...this.live]) this.finish(l, "cancelled")
  }
  dispose() {
    this.clear()
    this.group.remove(this.warmup.group)
    this.warmup.dispose()
    this.soft?.dispose()
  }

  // ── Effects ──
  // `shot`: what an arrow's flight carries instead, a stone from a sling or a thrown knife (stage.ts).
  async play(kind: EffectKind, from: EffectEnd, to: EffectEnd | undefined, element?: Element, shot?: Shot): Promise<void> {
    const target = to ?? from
    const flies = kind === "arrow" ? shot : undefined
    this.host.event?.({ type: "effect", kind, element, phase: "start", struck: !!target.id, ...(flies ? { shot: flies } : {}) })
    switch (kind) {
      case "arrow":
        await this.missile(from, target, element, flies ?? "arrow")
        return
      case "bolt":
        await this.spellBolt(from, target, element)
        return
      case "beam":
        await this.beam(from, target, element)
        return
      case "burst":
        await this.burst(target, element)
        return
      case "aura":
        await this.aura(target, element)
        return
      case "sparkles":
        await this.sparkles(target, element)
        return
      case "slash":
        await this.slash(target, element)
        return
      case "impact":
        await this.impact(target, element)
        return
      case "mist":
        await this.mist(target, element)
        return
    }
  }

  // Physical missiles: arrows, sling stones, and thrown knives.
  private missile(from: EffectEnd, to: EffectEnd, element: Element | undefined, kind: "arrow" | Shot) {
    const a = from.at.clone()
    const b = to.at.clone()
    const d = a.distanceTo(b)
    const color = effectColor(element, "steel")
    const lift = d * 0.05
    const pointAt = (t: number, out: THREE.Vector3) => out.lerpVectors(a, b, t).setY(THREE.MathUtils.lerp(a.y, b.y, t) + Math.sin(Math.PI * t) * lift)
    const body = new THREE.Group()
    const objects: THREE.Object3D[] = [body]
    if (kind === "arrow") {
      const wood = new THREE.MeshStandardMaterial({ color: "#6b4a2b", roughness: 0.8 })
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.8, 6), wood)
      shaft.rotation.x = Math.PI / 2
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 6), new THREE.MeshStandardMaterial({ color: "#9aa0a6", metalness: 0.6, roughness: 0.4 }))
      head.rotation.x = Math.PI / 2
      head.position.z = 0.44
      const fletch = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.14), new THREE.MeshStandardMaterial({ color: "#d8d2c4", side: THREE.DoubleSide }))
      fletch.position.z = -0.34
      fletch.rotation.y = Math.PI / 2
      const streak = new THREE.Sprite(this.glow(element ? color : "#fff4dc", element ? 0.9 : 0.35))
      streak.scale.set(0.25, 0.25, 1)
      body.add(shaft, head, fletch, streak)
    } else if (kind === "stone") {
      // A grey stone the size of a walnut, too quick to see but for a faint streak.
      const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 1), new THREE.MeshStandardMaterial({ color: "#8a8478", roughness: 0.9 }))
      const streak = new THREE.Sprite(this.glow(element ? color : "#fff4dc", element ? 0.9 : 0.25))
      streak.scale.set(0.18, 0.18, 1)
      body.add(stone, streak)
    } else {
      // A knife turning end over end as it flies: a short bright blade on a dark grip, spun about its width.
      const spin = new THREE.Group()
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.005, 0.17), new THREE.MeshStandardMaterial({ color: "#c9ccd1", metalness: 0.9, roughness: 0.25 }))
      blade.position.z = 0.06
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.1, 6), new THREE.MeshStandardMaterial({ color: "#2b2019", roughness: 0.8 }))
      grip.rotation.x = Math.PI / 2
      grip.position.z = -0.07
      spin.add(blade, grip)
      spin.name = "spin"
      const streak = new THREE.Sprite(this.glow(element ? color : "#fff4dc", element ? 0.9 : 0.25))
      streak.scale.set(0.2, 0.2, 1)
      body.add(spin, streak)
    }
    const speed = kind === "arrow" ? 30 : kind === "stone" ? 24 : 18
    const spin = body.getObjectByName("spin")
    const p = new THREE.Vector3()
    const ahead = new THREE.Vector3()
    const flight = this.add(Math.max(0.2, d / speed), objects, (t) => {
      pointAt(t, p)
      body.position.copy(p)
      pointAt(Math.min(1, t + 0.02), ahead)
      if (ahead.distanceToSquared(p) > 1e-6) body.lookAt(ahead)
      // Three turns a second through the air.
      if (spin) spin.rotation.x = t * Math.max(0.2, d / speed) * Math.PI * 6
    })
    return flight.then((outcome) => {
      if (outcome === "cancelled") return
      this.host.event?.({ type: "effect", kind: "arrow", element, phase: "land", struck: !!to.id, ...(kind === "stone" || kind === "knife" ? { shot: kind } : {}) })
      return this.impact(to, element, kind === "arrow" ? 0.6 : 0.5)
    })
  }

  // Elemental spell bolt: muzzle pop, plasma/crystal/arc head, scrolling ribbon wake, and GPU particle trail.
  private spellBolt(from: EffectEnd, to: EffectEnd, element?: Element) {
    const el: Element = element ?? "arcane"
    const pal = paletteOf(el)
    const a = from.at.clone()
    const b = to.at.clone()
    const d = Math.max(0.2, a.distanceTo(b))
    const D = Math.max(0.22, d / 14.5)
    const lift = d * 0.055
    const pointAt = (t: number, out: THREE.Vector3) => out.lerpVectors(a, b, t).setY(THREE.MathUtils.lerp(a.y, b.y, t) + 4 * t * (1 - t) * lift)
    const dir = b.clone().sub(a).normalize()

    const disposers: (() => void)[] = []
    const objects: THREE.Object3D[] = []

    // Caster muzzle pop
    const muzzle = createShockSprite(pal, 2, { scale: 0.52 })
    muzzle.mesh.position.copy(a)
    objects.push(muzzle.mesh)
    disposers.push(() => muzzle.dispose())

    // Head: crystal ice lance for frost, plasma orb + micro-arc for lightning, plasma/void knot for the rest
    const headOrb = createShockSprite(pal, 1, { scale: el === "frost" ? 0.42 : el === "fire" ? 0.62 : 0.54 })
    objects.push(headOrb.mesh)
    disposers.push(() => headOrb.dispose())

    let lance: { mesh: THREE.Mesh; dispose: () => void } | null = null
    if (el === "frost") {
      lance = createCrystalLance(pal)
      objects.push(lance.mesh)
      disposers.push(() => lance!.dispose())
    }

    let boltArc: LightningBoltHandle | null = null
    if (el === "lightning") {
      boltArc = createLightningBolt(pal, { branches: 2, subBranches: 1 })
      objects.push(boltArc.mesh)
      disposers.push(() => boltArc!.dispose())
    }

    // Comet ribbon wake along the arc
    const ribbon = createSpellRibbon(pal, { helix: el === "arcane" || el === "radiant" || el === "nature" })
    objects.push(ribbon.mesh)
    disposers.push(() => ribbon.dispose())

    // Shed trail particles born along the flight path at u * D
    const count = scaleCount(44, this.tier, 14)
    const seeds: ParticleSeed[] = []
    const tmp = new THREE.Vector3()
    for (let i = 0; i < count; i++) {
      const u = (i + Math.random()) / count
      pointAt(u, tmp)
      const jitter = 0.08
      const ox = tmp.x + rnd(jitter)
      const oy = tmp.y + rnd(jitter)
      const oz = tmp.z + rnd(jitter)
      const birth = u * D * 0.94
      const life = rng(0.18, 0.36)
      if (el === "fire") {
        const roll = Math.random()
        if (roll < 0.38) {
          seeds.push({ x: ox, y: oy, z: oz, birth, vx: -dir.x * rng(0.3, 1.1) + rnd(0.45), vy: rng(0.4, 1.3), vz: -dir.z * rng(0.3, 1.1) + rnd(0.45), life: rng(0.16, 0.28), size0: rng(0.16, 0.26), size1: rng(0.05, 0.12), kind: 0 })
        } else if (roll < 0.78) {
          seeds.push({ x: ox, y: oy, z: oz, birth, vx: -dir.x * rng(0.6, 2.2) + rnd(1.2), vy: rng(0.2, 1.5), vz: -dir.z * rng(0.6, 2.2) + rnd(1.2), life: rng(0.2, 0.4), size0: rng(0.02, 0.036), size1: 0.008, spin: 0.035, kind: 1 })
        } else {
          seeds.push({ x: ox, y: oy, z: oz, birth, vx: rnd(0.35), vy: rng(0.4, 0.9), vz: rnd(0.35), life: rng(0.26, 0.42), size0: 0.12, size1: rng(0.3, 0.45), kind: 4 })
        }
      } else if (el === "frost") {
        const isMist = Math.random() < 0.4
        seeds.push({
          x: ox,
          y: oy,
          z: oz,
          birth,
          vx: rnd(0.45),
          vy: isMist ? rng(-0.5, -0.1) : rng(-0.2, 0.5),
          vz: rnd(0.45),
          life: isMist ? rng(0.24, 0.42) : rng(0.18, 0.34),
          size0: isMist ? 0.12 : rng(0.05, 0.09),
          size1: isMist ? 0.34 : 0.015,
          kind: isMist ? 4 : 2,
        })
      } else if (el === "lightning") {
        const isSpark = Math.random() < 0.72
        seeds.push({
          x: ox,
          y: oy,
          z: oz,
          birth,
          vx: rnd(2.2) - dir.x * 0.6,
          vy: rnd(1.8),
          vz: rnd(2.2) - dir.z * 0.6,
          life: rng(0.12, 0.26),
          size0: isSpark ? rng(0.018, 0.032) : rng(0.06, 0.12),
          size1: 0.008,
          spin: 0.03,
          kind: isSpark ? 1 : 3,
        })
      } else if (el === "nature") {
        const isLeaf = Math.random() < 0.55
        seeds.push({
          x: ox,
          y: oy,
          z: oz,
          birth,
          vx: rnd(0.85) - dir.x * 0.4,
          vy: rng(-0.2, 0.8),
          vz: rnd(0.85) - dir.z * 0.4,
          life: rng(0.22, 0.4),
          size0: isLeaf ? rng(0.06, 0.1) : rng(0.05, 0.1),
          size1: isLeaf ? rng(0.05, 0.08) : 0.015,
          kind: isLeaf ? 5 : 3,
        })
      } else if (el === "shadow") {
        const isDark = Math.random() < 0.58
        seeds.push({
          x: ox,
          y: oy,
          z: oz,
          birth,
          vx: rnd(0.55) - dir.x * 0.3,
          vy: rng(-0.15, 0.55),
          vz: rnd(0.55) - dir.z * 0.3,
          life: rng(0.24, 0.42),
          size0: isDark ? 0.14 : rng(0.06, 0.11),
          size1: isDark ? 0.38 : 0.02,
          kind: isDark ? 4 : 3,
        })
      } else {
        // radiant & arcane
        const isStar = Math.random() < 0.58
        seeds.push({
          x: ox,
          y: oy,
          z: oz,
          birth,
          vx: rnd(0.95) - dir.x * 0.4,
          vy: rng(-0.1, 0.85),
          vz: rnd(0.95) - dir.z * 0.4,
          life,
          size0: isStar ? rng(0.055, 0.105) : rng(0.02, 0.035),
          size1: 0.012,
          spin: isStar ? rnd(3) : 0.03,
          kind: isStar ? 2 : 1,
        })
      }
    }
    const cloud = createParticleCloud(seeds, pal, {
      gravity: el === "fire" ? -0.4 : el === "frost" ? 0.6 : 0.3,
      drag: 1.6,
      curl: el === "lightning" ? 0.15 : 0.35,
      emissive: el === "shadow" ? 1.5 : 1.9,
      useFireRamp: el === "fire",
      puffOpacity: el === "shadow" ? 0.72 : 0.42,
      smokeDarken: el === "fire" || el === "shadow",
    })
    objects.push(cloud.mesh)
    disposers.push(() => cloud.dispose())

    const p = new THREE.Vector3()
    const ahead = new THREE.Vector3()
    const tailPos = new THREE.Vector3()
    const baseSeed = Math.random() * 100

    const flight = this.add(
      D,
      objects,
      (t, _dt, self) => {
        const s = t * D
        pointAt(t, p)
        headOrb.mesh.position.copy(p)
        headOrb.update({ time: s, progress: t, intensity: 1.65 * (1 - 0.15 * t) })

        if (lance) {
          lance.mesh.position.copy(p)
          pointAt(Math.min(1, t + 0.03), ahead)
          if (ahead.distanceToSquared(p) > 1e-6) {
            lance.mesh.lookAt(ahead)
            lance.mesh.rotateX(Math.PI / 2)
            lance.mesh.rotateY(s * 9)
          }
        }

        if (boltArc) {
          pointAt(Math.max(0, t - 0.28), tailPos)
          const step = Math.floor(s / 0.06)
          boltArc.set({
            a: tailPos,
            b: p,
            reveal: 1,
            intensity: 1.75,
            width: 0.026,
            jag: 0.16,
            seed: baseSeed + step * 13.7,
            branchSeed: baseSeed + 4.3 + step * 7.1,
            viewportH: this.viewportH,
          })
        }

        const mp = Math.min(1, s / 0.18)
        muzzle.update({ time: s, progress: mp, intensity: mp < 1 ? 1.5 : 0 })

        ribbon.set({
          a,
          b,
          time: s,
          power: el === "lightning" ? 0.55 : 1.3,
          tail: Math.max(0, t - 0.24),
          head: Math.min(1, t + 0.005),
          wide0: 0.018,
          wide1: el === "fire" ? 0.18 : 0.12,
          lift,
          wave: el === "fire" ? 0.035 : 0.018,
          flowSpeed: el === "fire" ? 12 : 9.5,
          helixRadius: 0.08,
        })

        cloud.update(s, { alpha: 1, viewportH: this.viewportH })
        this.lamp(self, p, pal.light, 2.8)
      },
      () => {
        for (const fn of disposers) fn()
      }
    )

    return flight.then((outcome) => {
      if (outcome === "cancelled") return
      this.host.event?.({ type: "effect", kind: "bolt", element, phase: "land", struck: !!to.id })
      return this.burst(to, element, 0.62)
    })
  }

  // Elemental beam: branching GPU lightning for lightning; dual-stream scrolling ribbon, upright cast sigils,
  // 3D frost shards, and element-tailored GPU particle clouds for all other elements.
  private beam(from: EffectEnd, to: EffectEnd, element?: Element) {
    const el: Element = element ?? "arcane"
    const pal = paletteOf(el)
    const color = effectColor(element, "arcane")
    const D = 1.35
    const ARRIVE = 0.18
    // From the caster's hand, or in front of their chest, to the near side of the target's, not from body to body.
    const flat = to.at.clone().sub(from.at).setY(0)
    const reach = flat.length()
    if (reach > 1e-4) flat.normalize()
    const a = from.at.clone().addScaledVector(flat, from.hand ? 0.05 : Math.min(0.3, reach * 0.2))
    const b = to.at.clone().addScaledVector(flat, -Math.min(0.22, reach * 0.15))
    const dir = b.clone().sub(a)
    const len = Math.max(0.2, dir.length())
    dir.normalize()

    const disposers: (() => void)[] = []
    const objects: THREE.Object3D[] = []
    const budget = tierBudget(this.tier)
    const baseSeed = Math.random() * 100

    // Caster muzzle charge orb
    const muzzleOrb = createShockSprite(pal, 1, { scale: 0.44 })
    muzzleOrb.mesh.position.copy(a)
    objects.push(muzzleOrb.mesh)
    disposers.push(() => muzzleOrb.dispose())

    // Target impact plasma pop (triggered at ARRIVE)
    const impactPop = createShockSprite(pal, 2, { scale: 1.05 })
    impactPop.mesh.position.copy(b)
    objects.push(impactPop.mesh)
    disposers.push(() => impactPop.dispose())

    // Upright casting sigil at the caster's hand for arcane, radiant, and shadow beams
    const castSigil = el === "arcane" || el === "radiant" || el === "shadow" ? createGroundMark(pal, { upright: true, radius: 0.56, intensity: 1.45 }) : null
    if (castSigil) {
      castSigil.mesh.position.copy(a)
      castSigil.mesh.lookAt(b)
      objects.push(castSigil.mesh)
      disposers.push(() => castSigil.dispose())
    }

    // Ground mark under the target for elemental beams that scorch/freeze/bloom/hex the earth
    const targetGround =
      el === "fire" || el === "frost" || el === "lightning" || el === "shadow" || el === "nature"
        ? createGroundMark(pal, { radius: el === "frost" ? 1.15 : 1.05, intensity: 1.3 })
        : null
    if (targetGround) {
      targetGround.mesh.position.set(b.x, 0.035, b.z)
      objects.push(targetGround.mesh)
      disposers.push(() => targetGround.dispose())
    }

    // Main channel: branching GPU lightning for lightning, scrolling dual-stream ribbon for all other elements
    let mainBolt: LightningBoltHandle | null = null
    let auxBolt: LightningBoltHandle | null = null
    let ribbon: ReturnType<typeof createSpellRibbon> | null = null
    if (el === "lightning") {
      mainBolt = createLightningBolt(pal, { branches: budget.branches, subBranches: budget.subBranches })
      auxBolt = createLightningBolt(pal, { branches: Math.max(2, Math.floor(budget.branches / 2)), subBranches: 1 })
      objects.push(mainBolt.mesh, auxBolt.mesh)
      disposers.push(
        () => mainBolt!.dispose(),
        () => auxBolt!.dispose()
      )
    } else {
      ribbon = createSpellRibbon(pal, { helix: el === "arcane" || el === "radiant" || el === "nature" || el === "shadow", seed: baseSeed })
      objects.push(ribbon.mesh)
      disposers.push(() => ribbon!.dispose())
    }

    // 3D faceted ice shards along the frost ray and shattering at the target
    let shardBurst: ReturnType<typeof createShardBurst> | null = null
    if (el === "frost") {
      const nAlong = Math.max(8, Math.round(22 * budget.shards))
      const nImpact = Math.max(8, Math.round(18 * budget.shards))
      const shardSeeds: ShardSeed[] = []
      for (let i = 0; i < nAlong; i++) {
        const u = Math.random()
        const px = a.x + dir.x * u * len + rnd(0.08)
        const py = a.y + dir.y * u * len + rnd(0.08)
        const pz = a.z + dir.z * u * len + rnd(0.08)
        shardSeeds.push({ x: px, y: py, z: pz, birth: u * ARRIVE + rng(0, 0.2), vx: rnd(0.7) + dir.x * 0.4, vy: rng(0.1, 0.7), vz: rnd(0.7) + dir.z * 0.4, life: rng(0.45, 0.85), size: rng(0.07, 0.15) })
      }
      for (let i = 0; i < nImpact; i++) {
        const v = new THREE.Vector3(rnd(1), rng(0.1, 1.1), rnd(1)).normalize().multiplyScalar(rng(1.2, 2.8)).addScaledVector(dir, 0.6)
        shardSeeds.push({ x: b.x, y: b.y, z: b.z, birth: ARRIVE + rng(0, 0.14), vx: v.x, vy: v.y, vz: v.z, life: rng(0.55, 0.95), size: rng(0.09, 0.18) })
      }
      shardBurst = createShardBurst(shardSeeds, pal, { gravity: 4.2 })
      objects.push(shardBurst.mesh)
      disposers.push(() => shardBurst!.dispose())
    }

    // Element-tailored GPU particle cloud along the beam and erupting at the target
    const nCloud = scaleCount(68, this.tier, 20)
    const seeds: ParticleSeed[] = []
    for (let i = 0; i < nCloud; i++) {
      const atTarget = i >= nCloud * 0.48
      const u = atTarget ? 1 : Math.random()
      const ox = (atTarget ? b.x : a.x + dir.x * u * len) + rnd(atTarget ? 0.14 : 0.1)
      const oy = (atTarget ? b.y : a.y + dir.y * u * len) + rnd(atTarget ? 0.14 : 0.1)
      const oz = (atTarget ? b.z : a.z + dir.z * u * len) + rnd(atTarget ? 0.14 : 0.1)
      const birth = atTarget ? ARRIVE + rng(0, 0.58) : u * ARRIVE + rng(0, 0.5)
      const spray = atTarget ? rng(0.9, 2.4) : rng(0.25, 0.9)
      const vx = rnd(spray) + (atTarget ? -dir.x * 0.4 : dir.x * 0.6)
      const vy = rnd(spray * 0.8) + (el === "fire" ? 1.1 : el === "frost" ? -0.35 : 0.35)
      const vz = rnd(spray) + (atTarget ? -dir.z * 0.4 : dir.z * 0.6)

      if (el === "fire") {
        const roll = Math.random()
        if (roll < 0.42) {
          seeds.push({ x: ox, y: oy, z: oz, birth, vx: vx * 0.55, vy: rng(0.6, 1.8), vz: vz * 0.55, life: rng(0.28, 0.52), size0: rng(0.18, 0.32), size1: rng(0.08, 0.16), kind: 0 })
        } else if (roll < 0.8) {
          seeds.push({ x: ox, y: oy, z: oz, birth, vx: vx * 1.15, vy: rng(0.5, 2.0), vz: vz * 1.15, life: rng(0.35, 0.72), size0: rng(0.022, 0.042), size1: 0.008, spin: 0.04, kind: 1 })
        } else {
          seeds.push({ x: ox, y: oy + 0.1, z: oz, birth: birth + 0.06, vx: rnd(0.45), vy: rng(0.5, 1.2), vz: rnd(0.45), life: rng(0.5, 0.85), size0: 0.18, size1: rng(0.45, 0.68), kind: 4 })
        }
      } else if (el === "frost") {
        const isMist = Math.random() < 0.44
        seeds.push({
          x: ox,
          y: oy,
          z: oz,
          birth,
          vx: vx * (isMist ? 0.35 : 0.6),
          vy: isMist ? rng(-0.55, -0.1) : rng(-0.25, 0.35),
          vz: vz * (isMist ? 0.35 : 0.6),
          life: isMist ? rng(0.55, 0.95) : rng(0.4, 0.85),
          size0: isMist ? 0.18 : rng(0.05, 0.1),
          size1: isMist ? rng(0.46, 0.68) : 0.015,
          kind: isMist ? 4 : 2,
        })
      } else if (el === "lightning") {
        const isSpark = Math.random() < 0.76
        seeds.push({
          x: ox,
          y: oy,
          z: oz,
          birth,
          vx: vx * 1.45,
          vy: rng(-0.5, 2.1),
          vz: vz * 1.45,
          life: rng(0.22, 0.52),
          size0: isSpark ? rng(0.02, 0.036) : rng(0.07, 0.14),
          size1: 0.008,
          spin: 0.032,
          kind: isSpark ? 1 : 3,
        })
      } else if (el === "nature") {
        const roll = Math.random()
        if (roll < 0.52) {
          seeds.push({ x: ox, y: oy, z: oz, birth, vx: vx * 0.75, vy: rng(0.05, 1.1), vz: vz * 0.75, life: rng(0.48, 0.9), size0: rng(0.065, 0.11), size1: rng(0.05, 0.09), kind: 5 })
        } else {
          seeds.push({ x: ox, y: oy, z: oz, birth, vx: vx * 0.55, vy: rng(0.2, 0.95), vz: vz * 0.55, life: rng(0.45, 0.82), size0: rng(0.055, 0.11), size1: 0.015, kind: roll < 0.78 ? 3 : 2 })
        }
      } else if (el === "shadow") {
        const isDark = Math.random() < 0.54
        seeds.push({
          x: ox,
          y: oy,
          z: oz,
          birth,
          vx: vx * 0.45,
          vy: rng(-0.2, 0.75),
          vz: vz * 0.45,
          life: rng(0.5, 0.92),
          size0: isDark ? 0.18 : rng(0.065, 0.13),
          size1: isDark ? rng(0.48, 0.72) : 0.02,
          kind: isDark ? 4 : 3,
        })
      } else {
        // radiant & arcane
        const isStar = Math.random() < 0.55
        seeds.push({
          x: ox,
          y: oy,
          z: oz,
          birth,
          vx: vx * (isStar ? 0.65 : 1.1),
          vy: rng(0.05, 1.25),
          vz: vz * (isStar ? 0.65 : 1.1),
          life: rng(0.38, 0.8),
          size0: isStar ? rng(0.06, 0.12) : rng(0.02, 0.036),
          size1: 0.012,
          spin: isStar ? rnd(3) : 0.032,
          kind: isStar ? 2 : 1,
        })
      }
    }
    const cloud = createParticleCloud(seeds, pal, {
      gravity: el === "lightning" ? 3.2 : el === "fire" ? -0.35 : el === "frost" ? 0.45 : 0.5,
      drag: el === "lightning" ? 1.8 : 1.25,
      curl: el === "lightning" ? 0.15 : 0.38,
      emissive: el === "shadow" ? 1.65 : 1.9,
      useFireRamp: el === "fire",
      puffOpacity: el === "shadow" ? 0.76 : 0.46,
      smokeDarken: el === "fire" || el === "shadow",
    })
    objects.push(cloud.mesh)
    disposers.push(() => cloud.dispose())

    const tipPos = new THREE.Vector3()
    let struck = false

    return this.add(
      D,
      objects,
      (t, _dt, self) => {
        const s = t * D
        const head = ease(THREE.MathUtils.clamp(s / ARRIVE, 0, 1))
        const tail = ease(THREE.MathUtils.clamp((t - 0.58) / 0.3, 0, 1))
        const k = 1 - THREE.MathUtils.clamp((t - 0.72) / 0.25, 0, 1)
        const flicker = 1 + 0.14 * Math.sin(s * 47) + 0.07 * Math.sin(s * 113)

        if (mainBolt && auxBolt) {
          // Discrete stepped restrike seeds driven strictly by dt-accumulated `s`
          const strikeIdx = Math.floor(s / 0.19)
          const subIdx = Math.floor(s / 0.11)
          const res = THREE.MathUtils.clamp((t - 0.64) / 0.34, 0, 1)
          const boltPower = (t < 0.72 ? 2.15 : 2.15 * (1 - (t - 0.72) / 0.28)) * (0.82 + 0.28 * Math.abs(Math.sin(s * 54)))
          mainBolt.set({
            a,
            b,
            reveal: Math.min(1, s / 0.14),
            intensity: boltPower,
            width: 0.034,
            jag: 0.09,
            seed: baseSeed + strikeIdx * 17.3,
            branchSeed: baseSeed + 5.1 + subIdx * 11.9,
            residual: res,
            branchLevel: 0.9,
            viewportH: this.viewportH,
          })
          auxBolt.set({
            a,
            b,
            reveal: Math.min(1, s / 0.16),
            intensity: boltPower * 0.58 * (1 - res),
            width: 0.02,
            jag: 0.135,
            seed: baseSeed + 41.7 + subIdx * 9.3,
            branchSeed: baseSeed + 83.2 + strikeIdx * 13.1,
            residual: res,
            branchLevel: 0.58,
            viewportH: this.viewportH,
          })
        } else if (ribbon) {
          ribbon.set({
            a,
            b,
            time: s,
            power: 1.55 * k * flicker,
            tail,
            head,
            wide0: el === "fire" ? 0.1 : 0.075,
            wide1: el === "fire" ? 0.34 : 0.24,
            lift: 0,
            wave: el === "fire" ? 0.055 : 0.025,
            flowSpeed: el === "fire" ? 12 : 9.5,
            turbulence: el === "fire" ? 1.3 : 1.0,
            helixRadius: 0.15,
          })
        }

        muzzleOrb.update({ time: s, progress: t, intensity: 1.45 * k * (1 - tail) * flicker })
        if (castSigil) {
          castSigil.update({
            time: s,
            reveal: Math.min(1, s / 0.22),
            fade: k * (1 - tail * 0.85),
            rot: s * 1.15,
          })
        }
        if (targetGround) {
          const gt = Math.max(0, s - ARRIVE)
          targetGround.update({
            time: s,
            reveal: Math.min(1, gt / 0.28),
            fade: s < ARRIVE ? 0 : fade(gt / (D - ARRIVE), 0.1, 0.52),
            rot: s * 0.45,
            heat: 1 - THREE.MathUtils.clamp(gt / (D - ARRIVE), 0, 1) * 0.75,
          })
        }

        const popP = s < ARRIVE ? 0 : Math.min(1, (s - ARRIVE) / 0.42)
        impactPop.update({ time: s, progress: popP, intensity: s < ARRIVE || popP >= 1 ? 0 : 1.85 })

        shardBurst?.update(s)
        cloud.update(s, { alpha: 1, viewportH: this.viewportH })

        tipPos.copy(a).addScaledVector(dir, head * len)
        this.lamp(self, tipPos, pal.light, 3.6 * k * flicker)

        if (!struck && head >= 1) {
          struck = true
          if (to.id) this.host.hit(to.id, color, 0.9)
        }
      },
      () => {
        for (const fn of disposers) fn()
      }
    )
  }

  // Elemental burst: exact-chord shockwave shell, sharp ground shock ring, plasma pop, elemental ground mark
  // (scorch crater, creeping frost, Lichtenberg veins, SDF rune sigil, bloom ring), particle eruption, and shards/arcs.
  private burst(at: EffectEnd, element?: Element, scale = 1) {
    const el: Element = element ?? "arcane"
    const pal = paletteOf(el)
    const color = effectColor(element, "steel")
    const center = at.at.clone()
    const D = 0.98
    const budget = tierBudget(this.tier)
    const disposers: (() => void)[] = []
    const objects: THREE.Object3D[] = []

    // 1. Spherical shockwave shell
    const shell = createShockSprite(pal, 0, { scale: 0.3 * scale })
    shell.mesh.position.copy(center)
    objects.push(shell.mesh)
    disposers.push(() => shell.dispose())

    // 2. Ground shock ring
    const ring = createShockSprite(pal, 3, { scale: 0.4 * scale })
    ring.mesh.position.set(center.x, 0.05, center.z)
    objects.push(ring.mesh)
    disposers.push(() => ring.dispose())

    // 3. Core plasma impact pop (flash + 24 radial spark streaks)
    const pop = createShockSprite(pal, 2, { scale: 1.35 * scale })
    pop.mesh.position.copy(center)
    objects.push(pop.mesh)
    disposers.push(() => pop.dispose())

    // 4. Elemental ground mark (scorch / frost fern / Lichtenberg / SDF sigil / nature bloom)
    const mark = createGroundMark(pal, { radius: 1.55 * scale, intensity: 1.35 })
    mark.mesh.position.set(center.x, 0.035, center.z)
    objects.push(mark.mesh)
    disposers.push(() => mark.dispose())

    // 5. Erupting GPU particle cloud
    const nCloud = scaleCount(74, this.tier, 22)
    const seeds: ParticleSeed[] = []
    for (let i = 0; i < nCloud; i++) {
      const th = Math.random() * Math.PI * 2
      const phi = Math.acos(rng(-0.45, 0.95))
      const dx = Math.sin(phi) * Math.cos(th)
      const dy = Math.cos(phi)
      const dz = Math.sin(phi) * Math.sin(th)
      const spd = rng(1.4, 4.4) * scale
      const ox = center.x + dx * 0.14 * scale
      const oy = Math.max(0.1, center.y + dy * 0.14 * scale)
      const oz = center.z + dz * 0.14 * scale
      const birth = rng(0, 0.08)

      if (el === "fire") {
        const roll = Math.random()
        if (roll < 0.36) {
          seeds.push({ x: ox, y: oy, z: oz, birth, vx: dx * spd * 0.65, vy: Math.abs(dy) * spd * 0.75 + 0.9, vz: dz * spd * 0.65, life: rng(0.32, 0.62), size0: rng(0.24, 0.42) * scale, size1: rng(0.12, 0.24) * scale, kind: 0 })
        } else if (roll < 0.76) {
          seeds.push({ x: ox, y: oy, z: oz, birth, vx: dx * spd * 1.15, vy: Math.abs(dy) * spd * 0.95 + 1.1, vz: dz * spd * 1.15, life: rng(0.45, 0.88), size0: rng(0.024, 0.046) * scale, size1: 0.008, spin: 0.04, kind: 1 })
        } else {
          seeds.push({ x: ox, y: oy + 0.12, z: oz, birth: birth + 0.05, vx: dx * spd * 0.35, vy: rng(0.7, 1.5), vz: dz * spd * 0.35, life: rng(0.55, 0.92), size0: 0.22 * scale, size1: rng(0.58, 0.88) * scale, kind: 4 })
        }
      } else if (el === "frost") {
        const roll = Math.random()
        if (roll < 0.4) {
          seeds.push({ x: ox, y: oy, z: oz, birth, vx: dx * spd * 0.45, vy: rng(-0.2, 0.45), vz: dz * spd * 0.45, life: rng(0.52, 0.92), size0: 0.22 * scale, size1: rng(0.55, 0.82) * scale, kind: 4 })
        } else if (roll < 0.78) {
          seeds.push({ x: ox, y: oy, z: oz, birth, vx: dx * spd * 0.75, vy: rng(-0.1, 0.9), vz: dz * spd * 0.75, life: rng(0.42, 0.82), size0: rng(0.06, 0.12) * scale, size1: 0.015, kind: 2 })
        } else {
          seeds.push({ x: ox, y: oy, z: oz, birth, vx: dx * spd * 1.1, vy: Math.abs(dy) * spd * 0.8 + 0.5, vz: dz * spd * 1.1, life: rng(0.35, 0.65), size0: rng(0.022, 0.036) * scale, size1: 0.008, spin: 0.032, kind: 1 })
        }
      } else if (el === "lightning") {
        const isSpark = Math.random() < 0.78
        seeds.push({
          x: ox,
          y: oy,
          z: oz,
          birth,
          vx: dx * spd * 1.35,
          vy: Math.abs(dy) * spd * 0.85 + 0.6,
          vz: dz * spd * 1.35,
          life: rng(0.28, 0.65),
          size0: (isSpark ? rng(0.022, 0.04) : rng(0.08, 0.16)) * scale,
          size1: 0.008,
          spin: 0.034,
          kind: isSpark ? 1 : 3,
        })
      } else if (el === "nature") {
        const roll = Math.random()
        if (roll < 0.52) {
          seeds.push({ x: ox, y: oy, z: oz, birth, vx: dx * spd * 0.75, vy: Math.abs(dy) * spd * 0.6 + 0.7, vz: dz * spd * 0.75, life: rng(0.5, 0.92), size0: rng(0.075, 0.125) * scale, size1: rng(0.06, 0.1) * scale, kind: 5 })
        } else {
          seeds.push({ x: ox, y: oy, z: oz, birth, vx: dx * spd * 0.6, vy: rng(0.3, 1.3), vz: dz * spd * 0.6, life: rng(0.45, 0.85), size0: rng(0.06, 0.13) * scale, size1: 0.015, kind: roll < 0.78 ? 3 : 2 })
        }
      } else if (el === "shadow") {
        const roll = Math.random()
        if (roll < 0.52) {
          seeds.push({ x: ox, y: oy, z: oz, birth, vx: dx * spd * 0.45, vy: rng(0.15, 0.85), vz: dz * spd * 0.45, life: rng(0.52, 0.92), size0: 0.24 * scale, size1: rng(0.62, 0.92) * scale, kind: 4 })
        } else {
          seeds.push({ x: ox, y: oy, z: oz, birth, vx: dx * spd * 1.0, vy: rng(0.1, 1.4), vz: dz * spd * 1.0, life: rng(0.38, 0.75), size0: (roll < 0.78 ? rng(0.024, 0.04) : rng(0.08, 0.16)) * scale, size1: 0.012, spin: 0.035, kind: roll < 0.78 ? 1 : 3 })
        }
      } else {
        // radiant & arcane
        const roll = Math.random()
        const kind = roll < 0.42 ? 1 : roll < 0.8 ? 2 : 3
        seeds.push({
          x: ox,
          y: oy,
          z: oz,
          birth,
          vx: dx * spd * (kind === 1 ? 1.2 : 0.75),
          vy: Math.abs(dy) * spd * 0.75 + 0.6,
          vz: dz * spd * (kind === 1 ? 1.2 : 0.75),
          life: rng(0.42, 0.85),
          size0: (kind === 1 ? rng(0.022, 0.04) : rng(0.065, 0.14)) * scale,
          size1: 0.012,
          spin: kind === 1 ? 0.035 : rnd(3),
          kind,
        })
      }
    }
    const cloud = createParticleCloud(seeds, pal, {
      gravity: el === "fire" ? -0.4 : el === "frost" ? 1.1 : el === "lightning" ? 3.5 : 1.4,
      drag: 1.75,
      curl: 0.35,
      emissive: el === "shadow" ? 1.7 : 2.0,
      useFireRamp: el === "fire",
      puffOpacity: el === "shadow" ? 0.78 : 0.48,
      smokeDarken: el === "fire" || el === "shadow",
    })
    objects.push(cloud.mesh)
    disposers.push(() => cloud.dispose())

    // 6. Signature extras: 3D shattering shards (frost / shadow) or radial ground-crawling arcs (lightning)
    let shardBurst: ReturnType<typeof createShardBurst> | null = null
    if ((el === "frost" || el === "shadow") && this.tier !== "mobile") {
      const nShards = Math.max(10, Math.round(24 * budget.shards))
      const shardSeeds: ShardSeed[] = []
      for (let i = 0; i < nShards; i++) {
        const a = Math.random() * Math.PI * 2
        const spd = rng(1.5, 4.2) * scale
        shardSeeds.push({
          x: center.x + rnd(0.12),
          y: Math.max(0.15, center.y + rnd(0.12)),
          z: center.z + rnd(0.12),
          birth: rng(0, 0.05),
          vx: Math.cos(a) * spd,
          vy: rng(1.2, 3.6) * scale,
          vz: Math.sin(a) * spd,
          life: rng(0.55, 0.9),
          size: rng(0.09, 0.2) * scale,
        })
      }
      shardBurst = createShardBurst(shardSeeds, pal, { gravity: 6.2 })
      objects.push(shardBurst.mesh)
      disposers.push(() => shardBurst!.dispose())
    }

    const groundArcs: { bolt: LightningBoltHandle; end: THREE.Vector3; seed: number }[] = []
    if (el === "lightning") {
      const nArcs = this.tier === "mobile" ? 2 : 3
      for (let i = 0; i < nArcs; i++) {
        const ang = (i / nArcs) * Math.PI * 2 + rng(-0.4, 0.4)
        const rad = rng(1.15, 1.75) * scale
        const end = new THREE.Vector3(center.x + Math.cos(ang) * rad, 0.08, center.z + Math.sin(ang) * rad)
        const bolt = createLightningBolt(pal, { branches: 2, subBranches: 1 })
        objects.push(bolt.mesh)
        disposers.push(() => bolt.dispose())
        groundArcs.push({ bolt, end, seed: Math.random() * 100 })
      }
    }

    if (at.id) this.host.hit(at.id, color, 1)
    return this.add(
      D,
      objects,
      (t, _dt, self) => {
        const s = t * D
        const sp = Math.min(1, s / 0.56)
        shell.update({ time: s, progress: sp, intensity: sp < 1 ? 1.55 : 0, scale: (0.28 + 1.7 * ease(sp)) * scale })

        const rp = Math.min(1, s / 0.64)
        ring.update({ time: s, progress: rp, intensity: rp < 1 ? 1.45 : 0, scale: (0.4 + 2.35 * ease(rp)) * scale })

        const pp = Math.min(1, s / 0.42)
        pop.update({ time: s, progress: pp, intensity: pp < 1 ? 2.0 : 0 })

        mark.update({
          time: s,
          reveal: Math.min(1, s / 0.24),
          fade: fade(t, 0.08, 0.45),
          rot: s * 0.5,
          heat: 1 - t * 0.82,
        })

        cloud.update(s, { alpha: 1, viewportH: this.viewportH })
        shardBurst?.update(s)

        for (const arc of groundArcs) {
          const ap = Math.min(1, s / 0.46)
          const step = Math.floor(s / 0.09)
          arc.bolt.set({
            a: center,
            b: arc.end,
            reveal: Math.min(1, s / 0.1),
            intensity: ap < 1 ? 1.85 * (1 - ap) : 0,
            width: 0.026,
            jag: 0.16,
            seed: arc.seed + step * 11.3,
            branchSeed: arc.seed + 5.7 + step * 7.9,
            residual: Math.max(0, (ap - 0.55) / 0.45),
            viewportH: this.viewportH,
          })
        }

        this.lamp(self, center, pal.light, 5.2 * scale * Math.pow(1 - t, 1.3))
      },
      () => {
        for (const fn of disposers) fn()
      }
    )
  }

  // Elemental aura: clockwise procedural ground sigil, Fresnel streaming energy veil, and orbiting GPU motes.
  private aura(at: EffectEnd, element?: Element) {
    const el: Element = element ?? "radiant"
    const pal = paletteOf(el)
    const color = effectColor(element, "radiant")
    const base = new THREE.Vector3(at.at.x, 0, at.at.z)
    const height = Math.max(1.65, at.at.y * 1.75)
    const D = 1.9
    const disposers: (() => void)[] = []
    const objects: THREE.Object3D[] = []

    // 1. Ground sigil / elemental seal at feet
    const sigil = createGroundMark(pal, { radius: 0.95, intensity: 1.35 })
    sigil.mesh.position.set(base.x, 0.035, base.z)
    objects.push(sigil.mesh)
    disposers.push(() => sigil.dispose())

    // 2. Fresnel streaming energy veil
    const veil = createAuraVeil(pal, height)
    veil.mesh.position.copy(base)
    objects.push(veil.mesh)
    disposers.push(() => veil.dispose())

    // 3. Orbiting & rising GPU particle cloud
    const nCloud = scaleCount(52, this.tier, 18)
    const seeds: ParticleSeed[] = []
    for (let i = 0; i < nCloud; i++) {
      const birth = rng(0, 0.65)
      const life = rng(0.85, 1.45)
      const swirlR = rng(0.45, 0.88)
      const swirlW = rng(1.6, 3.2) * (i % 2 === 0 ? 1 : -1)
      const oy = rng(0.06, 0.55)
      if (el === "fire") {
        const isFlame = i % 3 === 0
        seeds.push({ x: base.x, y: oy, z: base.z, birth, vx: 0, vy: rng(0.85, 1.65), vz: 0, life, size0: isFlame ? rng(0.14, 0.24) : rng(0.022, 0.038), size1: isFlame ? 0.05 : 0.008, spin: isFlame ? rnd(2) : 0.035, kind: isFlame ? 0 : 1, swirlR, swirlW })
      } else if (el === "frost") {
        const isMist = i % 3 === 0
        seeds.push({ x: base.x, y: isMist ? rng(0.1, 0.4) : rng(0.2, 1.3), z: base.z, birth, vx: 0, vy: isMist ? rng(0.15, 0.45) : rng(0.25, 0.8), vz: 0, life, size0: isMist ? 0.16 : rng(0.055, 0.105), size1: isMist ? 0.42 : 0.015, kind: isMist ? 4 : 2, swirlR, swirlW: swirlW * 0.7 })
      } else if (el === "lightning") {
        const isSpark = i % 4 !== 0
        seeds.push({ x: base.x, y: oy, z: base.z, birth, vx: 0, vy: rng(0.8, 1.7), vz: 0, life: rng(0.5, 1.0), size0: isSpark ? rng(0.02, 0.034) : rng(0.065, 0.12), size1: 0.008, spin: 0.03, kind: isSpark ? 1 : 3, swirlR, swirlW: swirlW * 1.4 })
      } else if (el === "nature") {
        const isLeaf = i % 2 === 0
        seeds.push({ x: base.x, y: oy, z: base.z, birth, vx: 0, vy: rng(0.55, 1.25), vz: 0, life, size0: isLeaf ? rng(0.065, 0.105) : rng(0.055, 0.11), size1: isLeaf ? 0.055 : 0.015, kind: isLeaf ? 5 : 3, swirlR, swirlW: swirlW * 0.85 })
      } else if (el === "shadow") {
        const isDark = i % 2 === 0
        seeds.push({ x: base.x, y: oy, z: base.z, birth, vx: 0, vy: rng(0.45, 1.05), vz: 0, life, size0: isDark ? 0.18 : rng(0.065, 0.12), size1: isDark ? 0.46 : 0.02, kind: isDark ? 4 : 3, swirlR, swirlW: swirlW * 0.8 })
      } else {
        // radiant & arcane
        const isStar = i % 3 !== 0
        seeds.push({ x: base.x, y: oy, z: base.z, birth, vx: 0, vy: rng(0.65, 1.35), vz: 0, life, size0: isStar ? rng(0.06, 0.12) : rng(0.065, 0.12), size1: 0.015, kind: isStar ? 2 : 3, swirlR, swirlW })
      }
    }
    const cloud = createParticleCloud(seeds, pal, {
      gravity: 0,
      drag: 0.2,
      curl: 0.18,
      emissive: 1.85,
      useFireRamp: el === "fire",
      puffOpacity: el === "shadow" ? 0.72 : 0.4,
      smokeDarken: el === "shadow",
    })
    objects.push(cloud.mesh)
    disposers.push(() => cloud.dispose())

    // Optional crackling vertical arc for lightning aura
    let auraArc: LightningBoltHandle | null = null
    if (el === "lightning") {
      auraArc = createLightningBolt(pal, { branches: 2, subBranches: 1 })
      objects.push(auraArc.mesh)
      disposers.push(() => auraArc!.dispose())
    }
    const arcA = new THREE.Vector3()
    const arcB = new THREE.Vector3()
    const baseSeed = Math.random() * 100

    if (at.id) this.host.hit(at.id, color, 0.45)
    return this.add(
      D,
      objects,
      (t, _dt, self) => {
        const s = t * D
        const k = fade(t, 0.18, 0.65)
        const pulse = 0.88 + 0.12 * Math.sin(s * 14)

        sigil.update({
          time: s,
          reveal: Math.min(1, s / 0.42),
          fade: k,
          rot: s * 0.55,
          heat: 0.85,
        })
        veil.update(s, k * pulse)
        cloud.update(s, { alpha: fade(t, 0.1, 0.72), viewportH: this.viewportH })

        if (auraArc) {
          const step = Math.floor(s / 0.14)
          const ang = step * 2.1
          arcA.set(base.x + Math.cos(ang) * 0.62, 0.12, base.z + Math.sin(ang) * 0.62)
          arcB.set(base.x + Math.cos(ang + 1.3) * 0.52, height * 0.88, base.z + Math.sin(ang + 1.3) * 0.52)
          auraArc.set({
            a: arcA,
            b: arcB,
            reveal: 1,
            intensity: 1.35 * k,
            width: 0.022,
            jag: 0.18,
            seed: baseSeed + step * 13.7,
            branchSeed: baseSeed + 9.1 + step * 7.3,
            viewportH: this.viewportH,
          })
        }

        this.lamp(self, at.at, pal.light, 2.4 * k * pulse)
      },
      () => {
        for (const fn of disposers) fn()
      }
    )
  }

  // Elemental sparkles: spiraling 4-point twinkling stars, glowing wisps, element accents, and soft halo pulse.
  private sparkles(at: EffectEnd, element?: Element) {
    const el: Element = element ?? "radiant"
    const pal = paletteOf(el)
    const color = effectColor(element, "radiant")
    const D = 1.85
    const disposers: (() => void)[] = []
    const objects: THREE.Object3D[] = []

    const nCloud = scaleCount(66, this.tier, 22)
    const seeds: ParticleSeed[] = []
    for (let i = 0; i < nCloud; i++) {
      const birth = rng(0, 0.42)
      const life = rng(0.95, 1.45)
      const swirlR = rng(0.22, 0.75)
      const swirlW = rng(1.4, 2.8) * (i % 3 === 0 ? -1 : 1)
      const oy = rng(0.15, 0.95)
      const vy = el === "frost" ? rng(0.15, 0.75) : rng(0.55, 1.3)
      if (el === "nature" && i % 3 === 0) {
        seeds.push({ x: at.at.x, y: oy, z: at.at.z, birth, vx: 0, vy: vy * 0.8, vz: 0, life, size0: rng(0.042, 0.072), size1: 0.035, kind: 5, swirlR, swirlW })
      } else if ((el === "fire" || el === "lightning") && i % 3 === 0) {
        seeds.push({ x: at.at.x, y: oy, z: at.at.z, birth, vx: rnd(0.35), vy: vy * 1.15, vz: rnd(0.35), life: rng(0.55, 1.05), size0: rng(0.02, 0.036), size1: 0.008, spin: 0.032, kind: 1, swirlR, swirlW: swirlW * 1.2 })
      } else if (el === "shadow" && i % 4 === 0) {
        seeds.push({ x: at.at.x, y: oy, z: at.at.z, birth, vx: 0, vy: vy * 0.6, vz: 0, life, size0: 0.14, size1: 0.36, kind: 4, swirlR, swirlW: swirlW * 0.7 })
      } else {
        const isStar = i % 3 !== 0
        seeds.push({ x: at.at.x, y: oy, z: at.at.z, birth, vx: 0, vy, vz: 0, life, size0: isStar ? rng(0.065, 0.135) : rng(0.06, 0.12), size1: 0.015, kind: isStar ? 2 : 3, swirlR, swirlW })
      }
    }
    const cloud = createParticleCloud(seeds, pal, {
      gravity: 0,
      drag: 0.25,
      curl: 0.22,
      emissive: 1.95,
      useFireRamp: el === "fire",
      puffOpacity: 0.65,
      smokeDarken: el === "shadow",
    })
    objects.push(cloud.mesh)
    disposers.push(() => cloud.dispose())

    // Gentle chest-height luminous halo pulse
    const halo = createShockSprite(pal, 1, { scale: 0.75 })
    halo.mesh.position.copy(at.at)
    objects.push(halo.mesh)
    disposers.push(() => halo.dispose())

    // Subtle ground shimmer ring
    const ring = createGroundMark(pal, { radius: 0.72, intensity: 0.75 })
    ring.mesh.position.set(at.at.x, 0.035, at.at.z)
    objects.push(ring.mesh)
    disposers.push(() => ring.dispose())

    if (at.id) this.host.hit(at.id, color, 0.35)
    return this.add(
      D,
      objects,
      (t, _dt, self) => {
        const s = t * D
        const k = fade(t, 0.16, 0.6)
        cloud.update(s, { alpha: fade(t, 0.12, 0.72), viewportH: this.viewportH })
        halo.update({ time: s, progress: t, intensity: 0.72 * k, scale: 0.55 + 0.3 * Math.sin(t * Math.PI) })
        ring.update({ time: s, reveal: Math.min(1, s / 0.35), fade: k * 0.7, rot: s * 0.7 })
        this.lamp(self, at.at, pal.light, 1.8 * k)
      },
      () => {
        for (const fn of disposers) fn()
      }
    )
  }

  private slash(at: EffectEnd, element?: Element) {
    const color = effectColor(element, "steel")
    const arc = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.6, 32, 1, 0, Math.PI * 0.75), this.additive(color, 0.75))
    const holder = new THREE.Group()
    holder.position.copy(at.at)
    // Facing the camera, cutting down across the body.
    holder.lookAt(this.host.camera.position)
    arc.rotation.z = Math.PI * 0.2
    holder.add(arc)
    holder.position.add(this.host.camera.position.clone().sub(at.at).normalize().multiplyScalar(0.2))
    let struck = false
    return this.add(0.45, [holder], (t) => {
      arc.rotation.z = Math.PI * 0.2 - ease(Math.min(1, t * 1.8)) * Math.PI * 0.55
      ;(arc.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - ease(Math.max(0, t - 0.45) / 0.55))
      if (!struck && t > 0.35) {
        struck = true
        if (at.id) this.host.hit(at.id, element ? color : COLORS.blood, 1)
      }
    })
  }

  private impact(at: EffectEnd, element?: Element, scale = 1) {
    const color = effectColor(element, "steel")
    const star = new THREE.Sprite(this.glow(color))
    star.position.copy(at.at)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 28), this.additive(color, 0.8))
    ring.position.copy(at.at)
    ring.lookAt(this.host.camera.position)
    if (at.id) this.host.hit(at.id, element ? color : COLORS.blood, scale)
    return this.add(0.4, [star, ring], (t) => {
      star.scale.setScalar((0.3 + 0.9 * ease(t)) * scale)
      ;(star.material as THREE.SpriteMaterial).opacity = 1 - t
      ring.scale.setScalar((0.15 + 0.5 * ease(t)) * scale)
      ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t)
    })
  }

  // Elemental mist: noise-eroded volumetric puffs (premultiplied so shadow/smoke actually darken) + elemental accents.
  private mist(at: EffectEnd, element?: Element) {
    const pal = element ? paletteOf(element) : FOG_PALETTE
    const color = element ? effectColor(element) : "#c9ccd2"
    const D = 2.5
    const disposers: (() => void)[] = []
    const objects: THREE.Object3D[] = []

    const nPuffs = scaleCount(34, this.tier, 12)
    const nAccents = scaleCount(26, this.tier, 8)
    const seeds: ParticleSeed[] = []
    for (let i = 0; i < nPuffs; i++) {
      const ang = (i / nPuffs) * Math.PI * 2 + rnd(0.35)
      const rad = rng(0.15, 0.9)
      const outSpd = rng(0.35, 0.95)
      seeds.push({
        x: at.at.x + Math.cos(ang) * rad,
        y: rng(0.28, 1.35),
        z: at.at.z + Math.sin(ang) * rad,
        birth: rng(0, 0.45),
        vx: Math.cos(ang) * outSpd,
        vy: element === "frost" ? rng(-0.18, 0.08) : element === "fire" ? rng(0.3, 0.75) : rng(0.05, 0.35),
        vz: Math.sin(ang) * outSpd,
        life: rng(1.5, 2.25),
        size0: rng(0.42, 0.72),
        size1: rng(1.05, 1.65),
        spin: rnd(0.55),
        kind: 4,
      })
    }
    for (let i = 0; i < nAccents; i++) {
      const ang = Math.random() * Math.PI * 2
      const rad = rng(0.2, 1.35)
      const birth = rng(0.05, 0.75)
      const life = rng(0.95, 1.65)
      const ox = at.at.x + Math.cos(ang) * rad
      const oy = rng(0.2, 1.55)
      const oz = at.at.z + Math.sin(ang) * rad
      if (element === "fire") {
        const isFlame = i % 3 === 0
        seeds.push({ x: ox, y: oy * 0.65, z: oz, birth, vx: rnd(0.45), vy: rng(0.6, 1.4), vz: rnd(0.45), life: rng(0.6, 1.1), size0: isFlame ? rng(0.15, 0.25) : rng(0.022, 0.038), size1: 0.01, spin: 0.035, kind: isFlame ? 0 : 1 })
      } else if (element === "lightning") {
        seeds.push({ x: ox, y: oy, z: oz, birth, vx: rnd(1.5), vy: rnd(0.9), vz: rnd(1.5), life: rng(0.35, 0.7), size0: rng(0.02, 0.034), size1: 0.008, spin: 0.03, kind: 1 })
      } else if (element === "nature") {
        const isLeaf = i % 2 === 0
        seeds.push({ x: ox, y: oy, z: oz, birth, vx: rnd(0.45), vy: rng(0.15, 0.65), vz: rnd(0.45), life, size0: isLeaf ? rng(0.065, 0.1) : rng(0.055, 0.1), size1: isLeaf ? 0.055 : 0.015, kind: isLeaf ? 5 : 3 })
      } else if (element === "shadow") {
        seeds.push({ x: ox, y: oy, z: oz, birth, vx: rnd(0.35), vy: rng(0.15, 0.55), vz: rnd(0.35), life, size0: rng(0.07, 0.14), size1: 0.02, kind: 3 })
      } else {
        // frost, radiant, arcane, or neutral fog
        seeds.push({ x: ox, y: oy, z: oz, birth, vx: rnd(0.3), vy: element === "frost" ? rng(-0.2, 0.15) : rng(0.15, 0.55), vz: rnd(0.3), life, size0: rng(0.05, 0.105), size1: 0.015, kind: i % 2 === 0 ? 2 : 3 })
      }
    }

    const darkMist = element === "shadow" || element === "fire" || element === "lightning"
    const cloud = createParticleCloud(seeds, pal, {
      gravity: element === "frost" ? 0.12 : 0,
      drag: 0.55,
      curl: 0.35,
      emissive: element === "shadow" ? 1.45 : element ? 1.5 : 0.6,
      useFireRamp: element === "fire",
      puffOpacity: element === "shadow" ? 0.64 : darkMist ? 0.58 : element === "frost" ? 0.5 : 0.44,
      smokeDarken: darkMist,
      renderOrder: 7,
    })
    objects.push(cloud.mesh)
    disposers.push(() => cloud.dispose())

    // Subtle ground fog/elemental ring beneath the mist
    const ground = createGroundMark(pal, { radius: 1.75, intensity: element ? 0.75 : 0.35 })
    ground.mesh.position.set(at.at.x, 0.035, at.at.z)
    objects.push(ground.mesh)
    disposers.push(() => ground.dispose())

    // Brief internal storm flash arc for lightning mist
    let stormArc: LightningBoltHandle | null = null
    if (element === "lightning") {
      stormArc = createLightningBolt(pal, { branches: 2, subBranches: 1 })
      objects.push(stormArc.mesh)
      disposers.push(() => stormArc!.dispose())
    }
    const arcA = new THREE.Vector3()
    const arcB = new THREE.Vector3()
    const baseSeed = Math.random() * 100

    if (at.id) this.host.hit(at.id, color, 0.25)
    return this.add(
      D,
      objects,
      (t, _dt, self) => {
        const s = t * D
        const k = fade(t, 0.18, 0.6)
        cloud.update(s, { alpha: fade(t, 0.14, 0.72), viewportH: this.viewportH })
        ground.update({ time: s, reveal: Math.min(1, s / 0.55), fade: k * 0.75, rot: s * 0.22, heat: 0.55 * (1 - t * 0.6) })
        if (stormArc) {
          const step = Math.floor(s / 0.36)
          const phase = (s % 0.36) / 0.36
          const flash = phase < 0.38 ? (1 - phase / 0.38) * k : 0
          arcA.set(at.at.x + Math.cos(step * 2.3) * 0.9, 0.6 + (step % 2) * 0.5, at.at.z + Math.sin(step * 2.3) * 0.9)
          arcB.set(at.at.x - Math.cos(step * 2.3) * 0.9, 1.1, at.at.z - Math.sin(step * 2.3) * 0.9)
          stormArc.set({
            a: arcA,
            b: arcB,
            reveal: 1,
            intensity: 1.5 * flash,
            width: 0.022,
            jag: 0.2,
            seed: baseSeed + step * 19.1,
            branchSeed: baseSeed + 7.3 + step * 11.7,
            viewportH: this.viewportH,
          })
        }
        if (element) this.lamp(self, at.at, pal.light, (element === "shadow" ? 1.1 : 1.5) * k)
      },
      () => {
        for (const fn of disposers) fn()
      }
    )
  }

  // ── Objects ──
  // An object held up before someone shown as a card, with no hand to hold it. Handed on, it is shown beside them,
  // then beside the receiver from `handed` seconds, as the camera cuts between the two (stage.ts, prop).
  prop(kind: PropKind, holder: EffectEnd, receiver?: EffectEnd, handed = 1.6): Promise<void> {
    this.announce(kind, !!receiver)
    const item = propMesh(kind)
    const hand = (end: EffectEnd, out: THREE.Vector3) => {
      const toCam = this.host.camera.position.clone().sub(end.at).setY(0).normalize()
      const side = new THREE.Vector3(toCam.z, 0, -toCam.x)
      return out.copy(end.at).addScaledVector(toCam, 0.35).addScaledVector(side, 0.3)
    }
    const a = hand(holder, new THREE.Vector3())
    const b = receiver ? hand(receiver, new THREE.Vector3()) : a
    const seconds = receiver ? handed + 2.4 : 3
    const lit = kind === "lantern" || kind === "torch"
    return this.add(seconds, [item], (t, _dt, self) => {
      item.position.copy(t * seconds < handed ? a : b)
      const k = fade(t, 0.06, 0.9)
      item.scale.setScalar(k)
      item.visible = k > 0.02
      if (lit) this.lamp(self, item.position, "#ffb35c", 1.8 * k)
    }).then(() => {})
  }
  // An object taken in hand or handed over, for the host to sound.
  announce(kind: PropKind, passed: boolean) {
    this.host.event?.({ type: "prop", kind, passed })
  }
}

const mat = (color: string, o: { metal?: number; rough?: number; glow?: string } = {}) =>
  new THREE.MeshStandardMaterial({ color, metalness: o.metal ?? 0, roughness: o.rough ?? 0.75, emissive: o.glow ?? "#000000", emissiveIntensity: o.glow ? 1.2 : 0 })
const PARCHMENT = "#e9dab4"
const LEATHER = "#6e4a2e"

// Each object at a size that reads beside a figure: about half again its real size.
export function propMesh(kind: PropKind): THREE.Object3D {
  const g = new THREE.Group()
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, m)
    mesh.position.set(x, y, z)
    g.add(mesh)
    return mesh
  }
  switch (kind) {
    case "scroll": {
      add(new THREE.CylinderGeometry(0.06, 0.06, 0.42, 14), mat(PARCHMENT)).rotation.z = Math.PI / 2
      for (const x of [-0.23, 0.23]) add(new THREE.CylinderGeometry(0.025, 0.025, 0.06, 8), mat("#4a3020"), x).rotation.z = Math.PI / 2
      break
    }
    case "scrollcase": {
      // A leather tube with brass bands, its cap held shut by a black wax seal across the seam.
      const brass = mat("#b08a3a", { metal: 0.8, rough: 0.35 })
      add(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 18), mat("#3a2618", { rough: 0.6 }), -0.03).rotation.z = Math.PI / 2
      add(new THREE.CylinderGeometry(0.076, 0.076, 0.12, 18), mat("#2c1c12", { rough: 0.55 }), 0.2).rotation.z = Math.PI / 2
      for (const x of [-0.236, 0.262]) add(new THREE.CylinderGeometry(0.062, 0.062, 0.012, 18), brass, x).rotation.z = Math.PI / 2
      for (const x of [-0.19, -0.05]) add(new THREE.TorusGeometry(0.073, 0.008, 6, 22), brass, x).rotation.y = Math.PI / 2
      add(new THREE.CylinderGeometry(0.038, 0.042, 0.016, 16), mat("#141012", { rough: 0.3 }), 0.14, 0, 0.074).rotation.x = Math.PI / 2
      add(new THREE.CylinderGeometry(0.022, 0.022, 0.006, 12), mat("#2a2226", { rough: 0.25 }), 0.14, 0, 0.084).rotation.x = Math.PI / 2
      break
    }
    case "letter":
      add(new THREE.BoxGeometry(0.32, 0.22, 0.01), mat(PARCHMENT))
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 12), mat("#9a2222"), 0, 0, 0.01).rotation.x = Math.PI / 2
      break
    case "map":
      add(new THREE.BoxGeometry(0.55, 0.4, 0.008), mat(PARCHMENT))
      add(new THREE.BoxGeometry(0.4, 0.012, 0.01), mat("#7a5a3a"), 0, 0.05, 0.005)
      add(new THREE.BoxGeometry(0.012, 0.25, 0.01), mat("#7a5a3a"), -0.08, 0, 0.005)
      break
    case "pouch":
      add(new THREE.SphereGeometry(0.12, 14, 10), mat(LEATHER)).scale.set(1, 1.15, 0.9)
      add(new THREE.CylinderGeometry(0.035, 0.06, 0.06, 10), mat(LEATHER), 0, 0.15)
      break
    case "coin":
      add(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 20), mat("#e0b44a", { metal: 0.9, rough: 0.3 })).rotation.x = Math.PI / 2
      break
    case "key":
      add(new THREE.TorusGeometry(0.05, 0.012, 8, 18), mat("#b08a3a", { metal: 0.8, rough: 0.35 }), 0, 0.1)
      add(new THREE.BoxGeometry(0.018, 0.2, 0.018), mat("#b08a3a", { metal: 0.8, rough: 0.35 }), 0, -0.03)
      add(new THREE.BoxGeometry(0.05, 0.02, 0.018), mat("#b08a3a", { metal: 0.8, rough: 0.35 }), 0.025, -0.11)
      break
    case "relic":
      add(new THREE.OctahedronGeometry(0.13), mat("#dff4ff", { glow: "#6fb8ff", rough: 0.2 })).scale.set(0.8, 1.3, 0.8)
      add(new THREE.CylinderGeometry(0.06, 0.08, 0.06, 8), mat("#8a6a3a", { metal: 0.7 }), 0, -0.19)
      break
    case "lantern":
      add(new THREE.BoxGeometry(0.16, 0.24, 0.16), mat("#2e2a26", { metal: 0.6, rough: 0.5 })).scale.set(1, 1, 1)
      add(new THREE.BoxGeometry(0.12, 0.18, 0.12), mat("#ffd08a", { glow: "#ffb35c" }))
      add(new THREE.TorusGeometry(0.05, 0.008, 6, 14), mat("#2e2a26", { metal: 0.6 }), 0, 0.17)
      break
    case "torch":
      add(new THREE.CylinderGeometry(0.025, 0.03, 0.45, 8), mat("#5a3a22"), 0, -0.1)
      add(new THREE.ConeGeometry(0.07, 0.18, 10), mat("#ffb347", { glow: "#ff7a2e" }), 0, 0.2)
      break
    case "blade":
      add(new THREE.BoxGeometry(0.05, 0.62, 0.012), mat("#c9ced4", { metal: 0.9, rough: 0.25 }), 0, 0.2)
      add(new THREE.BoxGeometry(0.2, 0.03, 0.03), mat("#8a6a3a", { metal: 0.6 }), 0, -0.12)
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 8), mat(LEATHER), 0, -0.2)
      break
    case "bow": {
      add(new THREE.TorusGeometry(0.42, 0.016, 6, 24, Math.PI * 0.75), mat("#7a5232"), 0, 0).rotation.z = Math.PI * 0.625
      const s = Math.sin(Math.PI * 0.375) * 0.42
      add(new THREE.BoxGeometry(0.004, s * 2, 0.004), mat("#e8e0d0"), -Math.cos(Math.PI * 0.375) * 0.42 + 0.02, 0)
      break
    }
    case "potion":
      add(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshStandardMaterial({ color: "#c0303a", roughness: 0.15, transparent: true, opacity: 0.85, emissive: "#5a0a10", emissiveIntensity: 0.6 }))
      add(new THREE.CylinderGeometry(0.03, 0.035, 0.08, 10), mat("#cfe3e8", { rough: 0.2 }), 0, 0.11)
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10), mat("#8a6a3a"), 0, 0.16)
      break
    case "book":
      add(new THREE.BoxGeometry(0.26, 0.34, 0.07), mat("#5a2e22"))
      add(new THREE.BoxGeometry(0.24, 0.32, 0.072), mat(PARCHMENT), 0.012)
      break
    case "gem":
      add(new THREE.IcosahedronGeometry(0.08), mat("#7fe3ff", { glow: "#2aa8d8", rough: 0.1 }))
      break
    case "pack":
      add(new THREE.BoxGeometry(0.36, 0.44, 0.2), mat(LEATHER))
      add(new THREE.BoxGeometry(0.37, 0.16, 0.22), mat("#5a3a22"), 0, 0.16)
      add(new THREE.BoxGeometry(0.04, 0.4, 0.02), mat("#3a2616"), -0.1, 0, 0.11)
      add(new THREE.BoxGeometry(0.04, 0.4, 0.02), mat("#3a2616"), 0.1, 0, 0.11)
      break
  }
  g.traverse((o) => {
    o.castShadow = true
  })
  return g
}
