// scene-kit MaterialLibrary: lazily baked, cached texture sets and the standard
// material constructors every builder uses. One instance per set build; the
// bakes are the expensive part of loading a scene, so nothing is generated until a
// builder asks for it and nothing is generated twice.

import * as THREE from "three"
import { drawCityCrest, drawSunEagle, drawTreeStag } from "./emblems"
import { hayify, mossify } from "./shaders"
import {
  birchTexture,
  type ClothTextureOptions,
  clothTexture,
  cobbleTexture,
  dirtTexture,
  grassTexture,
  knotTexture,
  medallionTexture,
  radialSprite,
  stoneTexture,
  type TextureSet,
  texSet,
  woodTexture,
} from "./textures"

type StandardParams = THREE.MeshStandardMaterialParameters

export class MaterialLibrary {
  private readonly cache = new Map<string, TextureSet>()
  private readonly sprites = new Map<string, THREE.Texture>()

  private bake(key: string, make: () => TextureSet): TextureSet {
    let set = this.cache.get(key)
    if (!set) {
      set = make()
      this.cache.set(key, set)
    }
    return set
  }

  // --- texture sets ---------------------------------------------------------
  get stoneTex() {
    return this.bake("stone", () => stoneTexture({ rows: 9 }))
  }
  get stoneLightTex() {
    return this.bake("stone-light", () => stoneTexture({ rows: 7, base: [0.76, 0.64, 0.54], grey: [0.7, 0.66, 0.6], seed: 9, chipAmt: 0.4 }))
  }
  get plasterTex() {
    return this.bake("plaster", () => stoneTexture({ rows: 14, base: [0.74, 0.66, 0.55], grey: [0.7, 0.64, 0.58], mortar: [0.5, 0.44, 0.38], seed: 17, chipAmt: 0 }))
  }
  get woodTex() {
    return this.bake("wood", () => woodTexture({}))
  }
  get woodDarkTex() {
    return this.bake("wood-dark", () => woodTexture({ base: [0.36, 0.25, 0.15], seed: 8, planks: 5 }))
  }
  get woodVTex() {
    return this.bake("wood-vertical", () => woodTexture({ vertical: true, seed: 12, planks: 8 }))
  }
  get knotTex() {
    return this.bake("knot", () => knotTexture())
  }
  get medallionTex() {
    return this.bake("medallion", () => medallionTexture())
  }
  get grassTex() {
    return this.bake("grass", () => grassTexture())
  }
  get dirtTex() {
    return this.bake("dirt", () => dirtTexture())
  }
  get cobbleTex() {
    return this.bake("cobble", () => cobbleTexture())
  }
  get birchTex() {
    return this.bake("birch", () => birchTexture())
  }

  // --- cloth ----------------------------------------------------------------
  /** Any cloth, cached by a caller-chosen key. */
  cloth(key: string, options: ClothTextureOptions): TextureSet {
    return this.bake(`cloth:${key}`, () => clothTexture(options))
  }
  get asterianTex() {
    return this.cloth("asterian", { color: [0.13, 0.25, 0.58], weave: 3, noise: 0.06, emblem: drawSunEagle })
  }
  get valkaranTex() {
    return this.cloth("valkaran", { color: [0.78, 0.4, 0.12], weave: 5, noise: 0.22, fade: 0.25, emblem: drawTreeStag, tatter: true })
  }
  get tabardTex() {
    return this.cloth("tabard", { color: [0.14, 0.26, 0.6], weave: 3, noise: 0.06, emblem: drawCityCrest })
  }
  get canvasClothTex() {
    return this.cloth("canvas", { color: [0.72, 0.64, 0.5], weave: 5, noise: 0.2, fade: 0.1 })
  }
  get stripeRedTex() {
    return this.cloth("stripe-red", { color: [0.7, 0.2, 0.15], weave: 4, noise: 0.12, fade: 0.15, stripes: { n: 8, a: [0.68, 0.19, 0.14], b: [0.88, 0.82, 0.7] } })
  }
  get stripeTealTex() {
    return this.cloth("stripe-teal", { color: [0.2, 0.5, 0.48], weave: 4, noise: 0.12, fade: 0.15, stripes: { n: 8, a: [0.19, 0.48, 0.45], b: [0.9, 0.85, 0.72] } })
  }
  get stripeGoldTex() {
    return this.cloth("stripe-gold", { color: [0.8, 0.6, 0.2], weave: 4, noise: 0.12, fade: 0.15, stripes: { n: 6, a: [0.82, 0.58, 0.16], b: [0.42, 0.32, 0.22] } })
  }
  get plainRedTex() {
    return this.cloth("plain-red", { color: [0.6, 0.18, 0.14], weave: 4, noise: 0.15, fade: 0.2 })
  }

  // --- sprites --------------------------------------------------------------
  sprite(inner: string, outer: string): THREE.Texture {
    const key = `${inner}|${outer}`
    let texture = this.sprites.get(key)
    if (!texture) {
      texture = radialSprite(inner, outer)
      this.sprites.set(key, texture)
    }
    return texture
  }

  // --- materials ------------------------------------------------------------
  /** Textured stone with world-space moss (moss = 0 for parapets and trim). */
  stone(repeatU: number, repeatV: number, extra: StandardParams = {}, tex: TextureSet = this.stoneTex, moss = 1): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ ...texSet(tex, repeatU, repeatV), roughness: 1, metalness: 0, ...extra })
    if (moss > 0) mossify(material, moss)
    return material
  }
  wood(repeatU: number, repeatV: number, tex: TextureSet = this.woodTex, extra: StandardParams = {}): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ ...texSet(tex, repeatU, repeatV), roughness: 1, metalness: 0, ...extra })
  }
  /** Textured cloth, no wind — pair with clothify for moving cloth. */
  clothMat(tex: TextureSet, repeatU = 1, repeatV = 1, extra: StandardParams = {}): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ ...texSet(tex, repeatU, repeatV), roughness: 0.95, side: THREE.DoubleSide, ...extra })
  }
  /** Raised relief (knotwork, medallion) with a strong normal. */
  relief(tex: TextureSet, repeatU = 1, repeatV = 1, normalScale = 1.4): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ ...texSet(tex, repeatU, repeatV), roughness: 0.95, normalScale: new THREE.Vector2(normalScale, normalScale) })
  }
  /** Flat matte colour. */
  flat(color: THREE.ColorRepresentation, roughness = 0.95): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, roughness })
  }
  emissive(color: THREE.ColorRepresentation, emissive: THREE.ColorRepresentation, intensity: number, roughness = 0.5): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness })
  }

  readonly iron = new THREE.MeshStandardMaterial({ color: 0x2a2726, roughness: 0.62, metalness: 0.85 })
  readonly ironDark = new THREE.MeshStandardMaterial({ color: 0x1b1918, roughness: 0.75, metalness: 0.7 })
  readonly steel = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.28, metalness: 1.0 })
  readonly plate = new THREE.MeshStandardMaterial({ color: 0xd0d3d8, roughness: 0.3, metalness: 1.0 })
  readonly gold = new THREE.MeshStandardMaterial({ color: 0xd8a640, roughness: 0.35, metalness: 1.0 })
  readonly brass = new THREE.MeshStandardMaterial({ color: 0xb08a3c, roughness: 0.45, metalness: 0.9 })
  readonly rope = new THREE.MeshStandardMaterial({ color: 0x8a7450, roughness: 1 })
  readonly roofTimber = new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.85 })
  readonly hay = hayify(new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 1 }))

  dispose() {
    for (const set of this.cache.values()) for (const texture of Object.values(set)) texture?.dispose()
    for (const texture of this.sprites.values()) texture.dispose()
    this.cache.clear()
    this.sprites.clear()
  }
}
