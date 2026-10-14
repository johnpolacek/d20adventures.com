import * as THREE from "three"

// What a story's actions look like on stage, built at runtime from a small fixed library: missiles and blasts for
// attacks and spells, and objects shown in a hand or passed between two people. Each one plays once and is gone. One
// point light is kept for them from the start, dark when idle, so lighting an effect never changes the shaders.

export const EFFECT_KINDS = ["arrow", "bolt", "beam", "burst", "aura", "sparkles", "slash", "impact", "mist"] as const
export const ELEMENTS = ["fire", "frost", "lightning", "radiant", "nature", "shadow", "arcane"] as const
export const PROP_KINDS = ["scroll", "letter", "map", "pouch", "coin", "key", "relic", "lantern", "torch", "blade", "bow", "potion", "book", "gem", "pack"] as const
export type EffectKind = (typeof EFFECT_KINDS)[number]
export type Element = (typeof ELEMENTS)[number]
export type PropKind = (typeof PROP_KINDS)[number]

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
}
export interface EffectHost {
  // A cast member struck: a flash of colour on their card and a shake.
  hit(id: string, color: string, strength: number): void
  // Where the camera is, for objects held toward it.
  camera: THREE.Camera
}

type Live = { t: number; duration: number; update: (t: number, dt: number, self: Live) => void; done: () => void; objects: THREE.Object3D[] }

const ease = (t: number) => t * t * (3 - 2 * t)
const fade = (t: number, inEnd: number, outStart: number) => Math.min(THREE.MathUtils.clamp(t / inEnd, 0, 1), 1 - THREE.MathUtils.clamp((t - outStart) / (1 - outStart), 0, 1))

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

  constructor(private host: EffectHost) {
    this.group.name = "effects"
    this.group.add(this.light)
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

  private add(duration: number, objects: THREE.Object3D[], update: Live["update"]): Promise<void> {
    for (const o of objects) this.group.add(o)
    return new Promise((resolve) => {
      const live: Live = { t: 0, duration, update, objects, done: resolve }
      this.live.push(live)
      update(0, 0, live)
    })
  }

  update(dt: number) {
    for (const l of [...this.live]) {
      l.t += dt
      const t = Math.min(1, l.t / l.duration)
      l.update(t, dt, l)
      if (t >= 1) this.finish(l)
    }
  }
  private finish(l: Live) {
    this.live = this.live.filter((x) => x !== l)
    for (const o of l.objects) {
      this.group.remove(o)
      o.traverse((m) => {
        const mesh = m as THREE.Mesh
        mesh.geometry?.dispose()
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
        for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) x.dispose()
      })
    }
    if (this.lightOwner === l) {
      this.light.intensity = 0
      this.lightOwner = null
    }
    l.done()
  }
  // Ends everything at once, as when the scene changes or the reader steps back.
  clear() {
    for (const l of [...this.live]) this.finish(l)
  }
  dispose() {
    this.clear()
    this.soft?.dispose()
  }

  // ── Effects ──
  play(kind: EffectKind, from: EffectEnd, to: EffectEnd | undefined, element?: Element): Promise<void> {
    const target = to ?? from
    switch (kind) {
      case "arrow":
        return this.missile(from, target, element, "arrow")
      case "bolt":
        return this.missile(from, target, element, "bolt")
      case "beam":
        return this.beam(from, target, element)
      case "burst":
        return this.burst(target, element)
      case "aura":
        return this.aura(target, element)
      case "sparkles":
        return this.sparkles(target, element)
      case "slash":
        return this.slash(target, element)
      case "impact":
        return this.impact(target, element)
      case "mist":
        return this.mist(target, element)
    }
  }

  private missile(from: EffectEnd, to: EffectEnd, element: Element | undefined, kind: "arrow" | "bolt") {
    const a = from.at.clone()
    const b = to.at.clone()
    const d = a.distanceTo(b)
    const color = effectColor(element, kind === "arrow" ? "steel" : "arcane")
    const lift = d * 0.05
    const pointAt = (t: number, out: THREE.Vector3) => out.lerpVectors(a, b, t).setY(THREE.MathUtils.lerp(a.y, b.y, t) + Math.sin(Math.PI * t) * lift)
    const body = new THREE.Group()
    const objects: THREE.Object3D[] = [body]
    const trail: THREE.Sprite[] = []
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
    } else {
      const core = new THREE.Sprite(this.glow("#ffffff"))
      core.scale.set(0.22, 0.22, 1)
      const halo = new THREE.Sprite(this.glow(color))
      halo.scale.set(0.7, 0.7, 1)
      body.add(core, halo)
      for (let i = 0; i < 7; i++) {
        const s = new THREE.Sprite(this.glow(color, 0.6 * (1 - i / 7)))
        s.scale.setScalar(0.45 * (1 - i / 9))
        trail.push(s)
        objects.push(s)
      }
    }
    const speed = kind === "arrow" ? 30 : 15
    const p = new THREE.Vector3()
    const ahead = new THREE.Vector3()
    const flight = this.add(Math.max(0.2, d / speed), objects, (t, _dt, self) => {
      pointAt(t, p)
      body.position.copy(p)
      pointAt(Math.min(1, t + 0.02), ahead)
      if (ahead.distanceToSquared(p) > 1e-6) body.lookAt(ahead)
      trail.forEach((s, i) => pointAt(Math.max(0, t - (i + 1) * 0.035), s.position))
      if (kind === "bolt") this.lamp(self, p, color, 2.4)
    })
    return flight.then(() => (kind === "arrow" ? this.impact(to, element, 0.6) : this.burst(to, element, 0.55)))
  }

  private beam(from: EffectEnd, to: EffectEnd, element?: Element) {
    const color = effectColor(element, "arcane")
    const a = from.at.clone()
    const b = to.at.clone()
    const len = a.distanceTo(b)
    const mid = a.clone().add(b).multiplyScalar(0.5)
    const mk = (r: number, c: string, o: number) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10, 1, true), this.additive(c, o))
      m.position.copy(mid)
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
      return m
    }
    const core = mk(0.035, "#ffffff", 0.9)
    const halo = mk(0.14, color, 0.45)
    let struck = false
    return this.add(1, [core, halo], (t, _dt, self) => {
      const k = fade(t, 0.15, 0.7)
      const w = 0.3 + 0.7 * k
      core.scale.set(w, 1, w)
      halo.scale.set(w * (1 + 0.1 * Math.sin(t * 60)), 1, w)
      ;(core.material as THREE.MeshBasicMaterial).opacity = 0.9 * k
      ;(halo.material as THREE.MeshBasicMaterial).opacity = 0.45 * k
      this.lamp(self, b, color, 3 * k)
      if (!struck && t > 0.15) {
        struck = true
        if (to.id) this.host.hit(to.id, color, 0.9)
      }
    })
  }

  private burst(at: EffectEnd, element?: Element, scale = 1) {
    const color = effectColor(element, "steel")
    const center = at.at.clone()
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), this.additive(color, 0.3))
    shell.position.copy(center)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), this.additive(color, 0.7))
    ring.rotation.x = -Math.PI / 2
    ring.position.set(center.x, 0.05, center.z)
    const flash = new THREE.Sprite(this.glow("#ffffff"))
    flash.position.copy(center)
    if (at.id) this.host.hit(at.id, color, 1)
    return this.add(0.7, [shell, ring, flash], (t, _dt, self) => {
      const e = ease(t)
      shell.scale.setScalar((0.2 + 1.8 * e) * scale)
      ring.scale.setScalar((0.3 + 2.7 * e) * scale)
      ;(shell.material as THREE.MeshBasicMaterial).opacity = 0.28 * (1 - t)
      ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - t)
      flash.scale.setScalar(1.6 * scale * (1 - t) + 0.01)
      this.lamp(self, center, color, 5 * scale * (1 - t))
    })
  }

  private aura(at: EffectEnd, element?: Element) {
    const color = effectColor(element, "radiant")
    const base = new THREE.Vector3(at.at.x, 0, at.at.z)
    const height = Math.max(1.6, at.at.y * 1.7)
    const geo = new THREE.CylinderGeometry(0.5, 0.62, height, 24, 1, true)
    geo.translate(0, height / 2, 0)
    // Bright at the feet, gone at the top.
    const colors: number[] = []
    const pos = geo.getAttribute("position")
    for (let i = 0; i < pos.count; i++) {
      const k = 1 - pos.getY(i) / height
      colors.push(k, k, k)
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))
    const mat = this.additive(color, 0.5)
    mat.vertexColors = true
    const column = new THREE.Mesh(geo, mat)
    column.position.copy(base)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.7, 36), this.additive(color, 0.6))
    ring.rotation.x = -Math.PI / 2
    ring.position.set(base.x, 0.04, base.z)
    if (at.id) this.host.hit(at.id, color, 0.45)
    return this.add(1.8, [column, ring], (t, _dt, self) => {
      const k = fade(t, 0.2, 0.65) * (0.85 + 0.15 * Math.sin(t * 25))
      mat.opacity = 0.5 * k
      ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.6 * k
      column.rotation.y += 0.02
      this.lamp(self, at.at, color, 2.2 * k)
    })
  }

  private sparkles(at: EffectEnd, element?: Element) {
    const color = effectColor(element, "radiant")
    const n = 48
    const seeds = Array.from({ length: n }, () => ({ a: Math.random() * Math.PI * 2, r: 0.2 + Math.random() * 0.45, y: Math.random() * 0.6, v: 0.6 + Math.random() * 0.9, d: Math.random() * 0.3 }))
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(n * 3)
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    this.soft ??= softTexture()
    const mat = new THREE.PointsMaterial({ map: this.soft, color, size: 0.16, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    const points = new THREE.Points(geo, mat)
    points.frustumCulled = false
    if (at.id) this.host.hit(at.id, color, 0.35)
    return this.add(1.8, [points], (t, _dt, self) => {
      const time = t * 1.8
      seeds.forEach((s, i) => {
        const life = THREE.MathUtils.clamp(time - s.d, 0, 2)
        const a = s.a + life * 1.6
        pos[i * 3] = at.at.x + Math.cos(a) * s.r
        pos[i * 3 + 1] = s.y + life * s.v
        pos[i * 3 + 2] = at.at.z + Math.sin(a) * s.r
      })
      geo.attributes.position.needsUpdate = true
      mat.opacity = fade(t, 0.15, 0.6)
      this.lamp(self, at.at, color, 1.6 * mat.opacity)
    })
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

  private mist(at: EffectEnd, element?: Element) {
    const color = element ? effectColor(element) : "#c9ccd2"
    const puffs = Array.from({ length: 7 }, (_, i) => {
      const s = new THREE.Sprite(this.glow(color, 0))
      const a = (i / 7) * Math.PI * 2
      s.position.set(at.at.x + Math.cos(a) * 0.5, 0.4 + (i % 3) * 0.45, at.at.z + Math.sin(a) * 0.5)
      return { s, a }
    })
    if (at.id) this.host.hit(at.id, color, 0.25)
    return this.add(
      2.4,
      puffs.map((p) => p.s),
      (t) => {
        for (const { s, a } of puffs) {
          s.scale.setScalar(0.8 + 2.4 * ease(t))
          s.position.x = at.at.x + Math.cos(a) * (0.5 + 1.2 * t)
          s.position.z = at.at.z + Math.sin(a) * (0.5 + 1.2 * t)
          ;(s.material as THREE.SpriteMaterial).opacity = 0.35 * fade(t, 0.2, 0.55)
        }
      }
    )
  }

  // ── Objects ──
  // An object in someone's hand, held toward the camera, and when it has a receiver carried across to theirs.
  prop(kind: PropKind, holder: EffectEnd, receiver?: EffectEnd): Promise<void> {
    const mesh = propMesh(kind)
    const halo = new THREE.Sprite(this.glow(kind === "relic" || kind === "gem" ? "#bfe6ff" : "#ffe2b0", 0.35))
    halo.scale.setScalar(0.55)
    const item = new THREE.Group()
    item.add(mesh, halo)
    const hand = (end: EffectEnd, out: THREE.Vector3) => {
      const toCam = this.host.camera.position.clone().sub(end.at).setY(0).normalize()
      const side = new THREE.Vector3(toCam.z, 0, -toCam.x)
      return out.copy(end.at).addScaledVector(toCam, 0.35).addScaledVector(side, 0.3)
    }
    const a = hand(holder, new THREE.Vector3())
    const b = receiver ? hand(receiver, new THREE.Vector3()) : a
    const lit = kind === "lantern" || kind === "torch"
    return this.add(receiver ? 4 : 3, [item], (t, dt, self) => {
      const time = t * (receiver ? 4 : 3)
      const travel = receiver ? ease(THREE.MathUtils.clamp((time - 1.2) / 0.9, 0, 1)) : 0
      item.position.lerpVectors(a, b, travel)
      item.position.y += Math.sin(Math.PI * travel) * 0.25
      mesh.rotation.y += dt * 1.1
      const k = fade(t, 0.12, 0.82)
      item.scale.setScalar(0.4 + 0.6 * k)
      item.visible = k > 0.02
      if (lit) this.lamp(self, item.position, "#ffb35c", 1.8 * k)
    })
  }
}

const mat = (color: string, o: { metal?: number; rough?: number; glow?: string } = {}) =>
  new THREE.MeshStandardMaterial({ color, metalness: o.metal ?? 0, roughness: o.rough ?? 0.75, emissive: o.glow ?? "#000000", emissiveIntensity: o.glow ? 1.2 : 0 })
const PARCHMENT = "#e9dab4"
const LEATHER = "#6e4a2e"

// Each object at a size that reads beside a figure: about half again its real size.
function propMesh(kind: PropKind): THREE.Object3D {
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
