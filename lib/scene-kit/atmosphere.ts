// scene-kit atmosphere: god-ray slices, drifting dust, birds, and the fire and
// smoke sprite system. Everything animated registers with the set's update loop.

import * as THREE from "three"
import type { Rng } from "./core"
import type { MaterialLibrary } from "./materials"
import type { TimeUniform } from "./shaders"

export interface Animated {
  update(t: number, dt: number): void
}

export interface GodRayOptions {
  /** Arch outline the rays are cut to: half-width of the opening and the springing height. */
  halfWidth?: number
  springHeight?: number
  centreY?: number
  fromZ?: number
  toZ?: number
  count?: number
  color?: THREE.ColorRepresentation
  strength?: number
}

/** Stacked additive slices shaped like an arch opening, fading and spreading with distance. */
export function createGodRays(
  time: TimeUniform,
  { halfWidth = 3.2, springHeight = 6.4, centreY = 6, fromZ = -2.5, toZ = 17.5, count = 22, color = 0xffd18c, strength = 0.04 }: GodRayOptions = {}
): THREE.Group {
  const group = new THREE.Group()
  const base = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: time, uColor: { value: new THREE.Color(color) }, uFade: { value: 1 }, uSpread: { value: 0 }, uHalfW: { value: halfWidth }, uSpring: { value: springHeight } },
    vertexShader: "varying vec3 vWp;void main(){vec4 wp=modelMatrix*vec4(position,1.0);vWp=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}",
    fragmentShader: `varying vec3 vWp;uniform float uTime,uFade,uSpread,uHalfW,uSpring;uniform vec3 uColor;
   float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
   void main(){vec2 p=vWp.xy;p.x/=1.0+uSpread;p.y=(p.y-3.0)/(1.0+uSpread*0.6)+3.0;
    float dR=max(abs(p.x)-uHalfW,max(-p.y,p.y-uSpring));float dC=length(p-vec2(0.0,uSpring))-uHalfW;float d=min(dR,dC);
    float a=smoothstep(0.9,-1.6,d);
    float sh=0.55+0.45*noise(vec2(p.x*1.6+uTime*0.06,p.y*0.25));sh*=0.7+0.3*noise(vec2(p.x*4.0-uTime*0.1,p.y*0.6+uTime*0.03));
    a*=sh*uFade;gl_FragColor=vec4(uColor,a);}`,
  })
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1)
    const material = base.clone()
    material.uniforms.uTime = time
    material.uniforms.uFade.value = strength * (1 - t) * (1 - t) + strength * 0.1
    material.uniforms.uSpread.value = t * 0.9
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(22, 16), material)
    quad.position.set(0, centreY, fromZ + t * (toZ - fromZ))
    quad.renderOrder = 5
    quad.frustumCulled = false
    group.add(quad)
  }
  return group
}

export interface DustOptions {
  count?: number
  /** Two boxes: most motes cluster in `near`, the rest spread through `far`. */
  near?: { x: [number, number]; y: [number, number]; z: [number, number] }
  far?: { x: [number, number]; y: [number, number]; z: [number, number] }
  pixelRatio?: number
}

export function createDust(
  time: TimeUniform,
  rng: Rng,
  { count = 2600, near = { x: [-6, 6], y: [0.2, 7], z: [-4, 26] }, far = { x: [-16, 16], y: [0.2, 12], z: [-30, 36] }, pixelRatio = 1 }: DustOptions = {}
): THREE.Points {
  const position = new Float32Array(count * 3)
  const size = new Float32Array(count)
  const phase = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const box = i < count * 0.6 ? near : far
    position[i * 3] = rng.range(...box.x)
    position[i * 3 + 1] = rng.range(...box.y)
    position[i * 3 + 2] = rng.range(...box.z)
    size[i] = rng.range(0.04, 0.14)
    phase[i] = rng.value() * 100
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3))
  geometry.setAttribute("aSize", new THREE.BufferAttribute(size, 1))
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1))
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: time, uPR: { value: pixelRatio } },
    vertexShader:
      "attribute float aSize;attribute float aPhase;uniform float uTime;uniform float uPR;varying float vA;void main(){vec3 p=position;p.x+=sin(uTime*0.31+aPhase)*0.7;p.y+=sin(uTime*0.23+aPhase*1.3)*0.45;p.z+=cos(uTime*0.27+aPhase*0.7)*0.7;vec4 mv=modelViewMatrix*vec4(p,1.0);gl_PointSize=aSize*uPR*(420.0/max(1.0,-mv.z));vA=0.45+0.55*sin(uTime*0.9+aPhase*3.0);gl_Position=projectionMatrix*mv;}",
    fragmentShader: "varying float vA;void main(){float d=length(gl_PointCoord-0.5);float a=smoothstep(0.5,0.05,d)*vA*0.4;gl_FragColor=vec4(1.0,0.9,0.72,a);}",
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  return points
}

/** A soft additive glow sprite (festival light through an arch, a lamp halo). */
export function createGlow(
  materials: MaterialLibrary,
  {
    x,
    y,
    z,
    width,
    height,
    opacity = 0.2,
    inner = "rgba(255,215,150,1)",
    outer = "rgba(255,170,90,0)",
  }: { x: number; y: number; z: number; width: number; height: number; opacity?: number; inner?: string; outer?: string }
): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: materials.sprite(inner, outer), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }))
  sprite.scale.set(width, height, 1)
  sprite.position.set(x, y, z)
  return sprite
}

interface Bird {
  mesh: THREE.Mesh
  a: number
  r: number
  y: number
  s: number
  cx: number
  cz: number
}

/** Distant birds wheeling on ellipses. */
export function createBirds(
  rng: Rng,
  {
    count = 14,
    radius = [20, 60],
    altitude = [28, 50],
    centre = { x: [-30, 30], z: [-20, 20] },
  }: { count?: number; radius?: [number, number]; altitude?: [number, number]; centre?: { x: [number, number]; z: [number, number] } } = {}
): { group: THREE.Group } & Animated {
  const group = new THREE.Group()
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, 0, 0, 0, 0.1, 0, 0, 0, 0.05, 0, 0.1, 0, 0.5, 0, 0, 0, 0, 0.05], 3))
  geometry.computeVertexNormals()
  const material = new THREE.MeshBasicMaterial({ color: 0x2a2420, side: THREE.DoubleSide })
  const birds: Bird[] = []
  for (let i = 0; i < count; i++) {
    const bird = new THREE.Mesh(geometry, material)
    bird.scale.setScalar(rng.range(0.6, 1.2))
    group.add(bird)
    birds.push({ mesh: bird, a: rng.value() * 6.28, r: rng.range(...radius), y: rng.range(...altitude), s: rng.range(0.05, 0.12), cx: rng.range(...centre.x), cz: rng.range(...centre.z) })
  }
  return {
    group,
    update(t, dt) {
      for (const b of birds) {
        b.a += b.s * dt * 3
        b.mesh.position.set(b.cx + Math.cos(b.a) * b.r, b.y + Math.sin(b.a * 2) * 2, b.cz + Math.sin(b.a) * b.r)
        b.mesh.rotation.y = -b.a
        b.mesh.rotation.z = Math.sin(t * 8 + b.r) * 0.5
      }
    },
  }
}

interface Particle {
  sprite: THREE.Sprite
  t: number
}

/**
 * Fire and smoke sprites plus flickering lights. Builders call addFire/addSmoke
 * on a parent (a brazier, a torch cage, a campfire); the set ticks update().
 */
export class FireSystem implements Animated {
  private readonly fire: Particle[] = []
  private readonly smoke: Particle[] = []
  private readonly lights: { light: THREE.PointLight; base: number }[] = []
  private readonly fireMaterial: THREE.SpriteMaterial
  private readonly smokeMaterial: THREE.SpriteMaterial

  constructor(
    materials: MaterialLibrary,
    private readonly rng: Rng
  ) {
    this.fireMaterial = new THREE.SpriteMaterial({
      map: materials.sprite("rgba(255,190,80,1)", "rgba(255,80,10,0)"),
      color: 0xffb050,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    })
    this.smokeMaterial = new THREE.SpriteMaterial({ map: materials.sprite("rgba(90,80,70,1)", "rgba(60,50,40,0)"), transparent: true, opacity: 0.25, depthWrite: false })
  }

  /** Flames rising from `y` on `parent`. Scale multiplies the sprite size. */
  addFire(parent: THREE.Object3D, { count = 10, y = 0, scale = 1 }: { count?: number; y?: number; scale?: number } = {}) {
    const holder = new THREE.Group()
    holder.position.y = y
    holder.scale.setScalar(scale)
    parent.add(holder)
    for (let i = 0; i < count; i++) {
      const sprite = new THREE.Sprite(this.fireMaterial.clone())
      holder.add(sprite)
      this.fire.push({ sprite, t: this.rng.value() })
    }
  }

  addSmoke(parent: THREE.Object3D, { count = 8, y = 0 }: { count?: number; y?: number } = {}) {
    const holder = new THREE.Group()
    holder.position.y = y
    parent.add(holder)
    for (let i = 0; i < count; i++) {
      const sprite = new THREE.Sprite(this.smokeMaterial.clone())
      holder.add(sprite)
      this.smoke.push({ sprite, t: this.rng.value() })
    }
  }

  /** A warm point light that flickers around `intensity`. */
  addLight(
    parent: THREE.Object3D,
    { color = 0xff8a3a, intensity = 12, distance = 9, y = 0 }: { color?: THREE.ColorRepresentation; intensity?: number; distance?: number; y?: number } = {}
  ): THREE.PointLight {
    const light = new THREE.PointLight(color, intensity, distance, 2)
    light.position.y = y
    parent.add(light)
    this.lights.push({ light, base: intensity })
    return light
  }

  update(t: number, dt: number) {
    for (const f of this.fire) {
      f.t = (f.t + dt * this.rng.range(0.6, 1.0)) % 1
      const k = f.t
      f.sprite.position.set(Math.sin(k * 9 + f.t * 3) * 0.06, 0.95 + k * 0.7, Math.cos(k * 7) * 0.06)
      f.sprite.scale.setScalar((0.28 + 0.2 * Math.sin(k * Math.PI)) * (1 - k * 0.5))
      f.sprite.material.opacity = (1 - k) * 0.55
    }
    for (const s of this.smoke) {
      s.t = (s.t + dt * 0.25) % 1
      const k = s.t
      s.sprite.position.set(Math.sin(k * 5) * 0.2 + k * 0.3, 1.4 + k * 2.4, Math.cos(k * 4) * 0.2)
      s.sprite.scale.setScalar(0.4 + k * 1.2)
      s.sprite.material.opacity = 0.22 * (1 - k) * Math.min(1, k * 5)
    }
    for (const { light, base } of this.lights) light.intensity = base * (1 + Math.sin(t * 17 + base) * 0.15 + Math.sin(t * 29) * 0.09)
  }
}
