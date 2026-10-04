import * as THREE from "three"
import type { Rand } from "../kit/rng"
import type { MaterialSpec } from "../spec/set"
import type { SharedUniforms } from "./atmosphere"
import { bannerTexture } from "./heraldry"
import { grass, meadow, rock, water } from "./nature"
import { burlap, card, cloth, foliage, glow, masonry, metal, mist, plain, TextureBank, tatters, wood } from "./surfaces"

export interface MaterialLibrary {
  get: (name: string) => THREE.Material | undefined
  names: () => string[]
  // Resolves when every painted texture has loaded (a failed one stays blank rather than blocking the stage).
  ready: Promise<void>
  dispose: () => void
}

// Painted textures by URL, shared between materials: repeat-wrapped, full mips, sRGB, the GPU's best anisotropy.
class PaintedTextures {
  private cache = new Map<string, THREE.Texture>()
  private pending: Promise<void>[] = []
  constructor(private anisotropy: number) {}
  get(url: string) {
    const hit = this.cache.get(url)
    if (hit) return hit
    const t = new THREE.Texture()
    t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = this.anisotropy
    this.cache.set(url, t)
    this.pending.push(
      new THREE.ImageLoader()
        .loadAsync(url)
        .then((img) => {
          t.image = img
          t.needsUpdate = true
        })
        .catch(() => console.warn(`[stage] texture failed: ${url}`))
    )
    return t
  }
  ready() {
    return Promise.all(this.pending).then(() => undefined)
  }
  dispose() {
    for (const t of this.cache.values()) t.dispose()
  }
}

// The set's named materials, built for rendering (needs a DOM for the canvas textures).
export function createMaterialLibrary(specs: Record<string, MaterialSpec>, shared: SharedUniforms, rand: Rand, anisotropy = 4): MaterialLibrary {
  const ctx = { shared, rand }
  const bank = new TextureBank(rand.fork("textures"))
  const painted = new PaintedTextures(anisotropy)
  const out = new Map<string, THREE.Material>()
  for (const [name, s] of Object.entries(specs)) {
    let m: THREE.Material
    switch (s.type) {
      case "masonry":
        m = masonry(ctx, name, s)
        break
      case "wood":
        m = wood(ctx, name, s)
        break
      case "painted":
        m = wood(ctx, name, { ...s, a: "#ffffff", b: "#ffffff", c: "#ffffff", map: painted.get(s.map), mapSize: s.size })
        break
      case "card":
        m = card(ctx, name, painted.get(s.map), s.tint, s.roughness)
        break
      case "cloth": {
        const map = s.heraldry ? bank.keep(bannerTexture(rand.fork(`heraldry/${name}`), s.heraldry)) : undefined
        const alphaMap = s.tatters ? bank.keep(tatters(rand.fork(`tatters/${name}`), s.tatters[0], s.tatters[1])) : null
        m = cloth(ctx, bank, name, s.heraldry ? "#ffffff" : s.color, { map, alphaMap, amp: s.amp, freq: s.freq })
        if (s.shadow === false) m.userData.noShadow = true
        break
      }
      case "burlap":
        m = burlap(ctx, bank, name, s.color, s.roughness)
        break
      case "foliage":
        m = foliage(ctx, bank, name, s.color, s.roughness)
        break
      case "glow":
        m = glow(ctx, bank, name, s.color, s.opacity)
        break
      case "mist":
        m = mist(ctx, bank, name, s.color, s.opacity)
        break
      case "metal":
        m = metal(ctx, name, s.color, s.roughness, s.metalness)
        break
      case "rock":
        m = rock(ctx, name, s)
        break
      case "meadow":
        m = meadow(ctx, name, s)
        break
      case "grass":
        m = grass(ctx, name, s)
        break
      case "water":
        m = water(ctx, name, s)
        break
      case "plain":
        m = plain(ctx, name, s.emissive ? "#000000" : s.color, s.roughness ?? 0.85, s.emissive ? { emissive: new THREE.Color(s.emissive), emissiveIntensity: s.emissiveIntensity ?? 1 } : {})
        break
    }
    out.set(name, m)
  }
  return {
    get: (name) => out.get(name),
    names: () => [...out.keys()],
    ready: painted.ready(),
    dispose: () => {
      for (const m of out.values()) m.dispose()
      bank.dispose()
      painted.dispose()
    },
  }
}

// For checking a set without a GPU or a DOM: one plain material per name, flagged like the real one so the batch adds
// the same attributes (wood grain, cloth sway).
export function createStubLibrary(specs: Record<string, MaterialSpec>): MaterialLibrary {
  const out = new Map<string, THREE.Material>()
  for (const [name, s] of Object.entries(specs)) {
    const m = new THREE.MeshBasicMaterial({ name })
    if (s.type === "wood" || s.type === "painted") m.userData.wood = true
    if (s.type === "cloth") m.userData.sway = true
    out.set(name, m)
  }
  return {
    get: (name) => out.get(name),
    names: () => [...out.keys()],
    ready: Promise.resolve(),
    dispose: () => {
      for (const m of out.values()) m.dispose()
    },
  }
}
