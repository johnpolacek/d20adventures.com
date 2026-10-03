import * as THREE from "three"
import type { Rand } from "../kit/rng"
import type { MaterialSpec } from "../spec/set"
import type { SharedUniforms } from "./atmosphere"
import { bannerTexture } from "./heraldry"
import { burlap, cloth, foliage, masonry, metal, plain, TextureBank, tatters, wood } from "./surfaces"

export interface MaterialLibrary {
  get: (name: string) => THREE.Material | undefined
  names: () => string[]
  dispose: () => void
}

// The set's named materials, built for rendering (needs a DOM for the canvas textures).
export function createMaterialLibrary(specs: Record<string, MaterialSpec>, shared: SharedUniforms, rand: Rand): MaterialLibrary {
  const ctx = { shared, rand }
  const bank = new TextureBank(rand.fork("textures"))
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
      case "metal":
        m = metal(ctx, name, s.color, s.roughness, s.metalness)
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
    dispose: () => {
      for (const m of out.values()) m.dispose()
      bank.dispose()
    },
  }
}

// For checking a set without a GPU or a DOM: one plain material per name, flagged like the real one so the batch adds
// the same attributes (wood grain, cloth sway).
export function createStubLibrary(specs: Record<string, MaterialSpec>): MaterialLibrary {
  const out = new Map<string, THREE.Material>()
  for (const [name, s] of Object.entries(specs)) {
    const m = new THREE.MeshBasicMaterial({ name })
    if (s.type === "wood") m.userData.wood = true
    if (s.type === "cloth") m.userData.sway = true
    out.set(name, m)
  }
  return {
    get: (name) => out.get(name),
    names: () => [...out.keys()],
    dispose: () => {
      for (const m of out.values()) m.dispose()
    },
  }
}
