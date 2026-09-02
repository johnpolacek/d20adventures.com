// scene-kit textures: procedural PBR texture sets baked on canvas.
//
// Every generator returns a TextureSet (colour map plus, where it matters, a
// height-derived normal map and a roughness map). Bakes are CPU work on the order
// of a few hundred ms per 1024 texture, so MaterialLibrary caches them; call these
// directly only for one-off cloth (banners with a specific emblem).

import * as THREE from "three"
import { clamp, lerp, mulberry32, TEXTURE_NOISE as NZ, smoothstep } from "./core"
import type { EmblemPainter } from "./emblems"

export interface TextureSet {
  map: THREE.Texture
  normalMap?: THREE.Texture
  roughnessMap?: THREE.Texture
  alphaMap?: THREE.Texture
}

export type RGB = [number, number, number]

let maxAnisotropy = 8
/** Call once with renderer.capabilities.getMaxAnisotropy() before baking. */
export function configureTextures(opts: { anisotropy: number }) {
  maxAnisotropy = opts.anisotropy
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  return canvas
}

export function canvasTex(canvas: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = maxAnisotropy
  return texture
}

export function normalFromHeight(H: Float32Array, w: number, h: number, strength = 8): THREE.CanvasTexture {
  const canvas = makeCanvas(w, h)
  const ctx = canvas.getContext("2d")!
  const img = ctx.createImageData(w, h)
  const d = img.data
  for (let y = 0; y < h; y++) {
    const ym = (y - 1 + h) % h
    const yp = (y + 1) % h
    for (let x = 0; x < w; x++) {
      const xm = (x - 1 + w) % w
      const xp = (x + 1) % w
      const dx = (H[y * w + xp] - H[y * w + xm]) * strength
      const dy = (H[ym * w + x] - H[yp * w + x]) * strength
      const l = 1 / Math.sqrt(dx * dx + dy * dy + 1)
      const i = (y * w + x) * 4
      d[i] = (-dx * l * 0.5 + 0.5) * 255
      d[i + 1] = (dy * l * 0.5 + 0.5) * 255
      d[i + 2] = (l * 0.5 + 0.5) * 255
      d[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvasTex(canvas, false)
}

export function grayTex(A: Float32Array, w: number, h: number): THREE.CanvasTexture {
  const canvas = makeCanvas(w, h)
  const ctx = canvas.getContext("2d")!
  const img = ctx.createImageData(w, h)
  const d = img.data
  for (let i = 0; i < w * h; i++) {
    const v = clamp(A[i], 0, 1) * 255
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v
    d[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return canvasTex(canvas, false)
}

/** Clone a set with a repeat and rotation, ready to spread into a material. */
export function texSet(src: TextureSet, repeatU: number, repeatV: number, rotation = 0): TextureSet {
  const out: Partial<TextureSet> = {}
  for (const key of ["map", "normalMap", "roughnessMap", "alphaMap"] as const) {
    const texture = src[key]
    if (!texture) continue
    const clone = texture.clone()
    clone.repeat.set(repeatU, repeatV)
    clone.rotation = rotation
    clone.needsUpdate = true
    out[key] = clone
  }
  return out as TextureSet
}

export interface StoneTextureOptions {
  size?: number
  rows?: number
  base?: RGB
  grey?: RGB
  mortar?: RGB
  seed?: number
  chipAmt?: number
}

/** Coursed ashlar with mortar joints, per-block tint, chipped corners, streaks and grain. */
export function stoneTexture({
  size = 1024,
  rows = 10,
  base = [0.68, 0.55, 0.46],
  grey = [0.62, 0.58, 0.54],
  mortar = [0.28, 0.25, 0.22],
  seed = 3,
  chipAmt = 1,
}: StoneTextureOptions = {}): TextureSet {
  const r = mulberry32(seed)
  const canvas = makeCanvas(size, size)
  const ctx = canvas.getContext("2d")!
  const img = ctx.createImageData(size, size)
  const px = img.data
  const H = new Float32Array(size * size)
  const Rg = new Float32Array(size * size)
  const rowH = size / rows
  interface Cut {
    x0: number
    x1: number
    tint: RGB
    mix: number
    h: number
    chip: number
    cc: number
  }
  const rowsData: { off: number; cuts: Cut[] }[] = []
  for (let ri = 0; ri < rows; ri++) {
    const off = r() * rowH * 2.5
    const cuts: Cut[] = []
    let x = 0
    while (x < size) {
      let w = rowH * (1.3 + r() * 1.5)
      if (size - x - w < rowH * 0.9) w = size - x
      const k = 1 + (r() - 0.5) * 0.34
      const warm = r() - 0.5
      cuts.push({ x0: x, x1: Math.min(x + w, size), tint: [k * (1 + warm * 0.08), k, k * (1 - warm * 0.08)], mix: r(), h: 0.72 + r() * 0.2, chip: r(), cc: Math.floor(r() * 4) })
      x += w
    }
    rowsData.push({ off, cuts })
  }
  for (let y = 0; y < size; y++) {
    const ri = Math.floor(y / rowH)
    const row = rowsData[ri]
    const ly = y - ri * rowH
    const v = y / size
    for (let x = 0; x < size; x++) {
      const xs = (((x - row.off) % size) + size) % size
      let b = row.cuts[0]
      for (const cut of row.cuts) {
        if (xs >= cut.x0 && xs < cut.x1) {
          b = cut
          break
        }
      }
      const lx = xs - b.x0
      const bw = b.x1 - b.x0
      const u = x / size
      const jit = (NZ.fbm(u, v, 64, 2) - 0.5) * 6
      const dEdge = Math.min(lx, bw - lx, ly, rowH - ly) + jit
      const m = 2 + NZ.v(u * 128, v * 128, 128, 128) * 3
      const grain = NZ.fbm(u, v, 16, 4)
      const fine = NZ.v(u * 256, v * 256, 256, 256)
      const streak = NZ.v(u * 64 + 3, v * 3, 64, 3)
      const macro = NZ.fbm(u, v, 4, 2)
      let Rc: number
      let G: number
      let B: number
      let h: number
      let rough: number
      let chipped = false
      if (b.chip > 0.72 && chipAmt > 0) {
        const cr = ((b.chip - 0.72) / 0.28) * 30 * chipAmt
        const cx = b.cc & 1 ? bw : 0
        const cy = b.cc & 2 ? rowH : 0
        if (Math.hypot(lx - cx, ly - cy) < cr * (0.6 + 0.8 * fine)) chipped = true
      }
      if (dEdge < m || chipped) {
        const k = 0.75 + fine * 0.5
        Rc = mortar[0] * k
        G = mortar[1] * k
        B = mortar[2] * k
        h = (chipped ? 0.45 : 0.22) + fine * 0.12
        rough = 1.0
      } else {
        const bev = Math.min(1, (dEdge - m) / 7)
        const mx = b.mix
        const k = (0.72 + grain * 0.42) * (0.9 + fine * 0.2) * (0.88 + macro * 0.24)
        const sk = 1 - 0.2 * smoothstep(0.55, 0.85, streak)
        Rc = (base[0] * (1 - mx) + grey[0] * mx) * b.tint[0] * k * sk
        G = (base[1] * (1 - mx) + grey[1] * mx) * b.tint[1] * k * sk
        B = (base[2] * (1 - mx) + grey[2] * mx) * b.tint[2] * k * sk
        h = b.h * (0.8 + 0.2 * bev) + grain * 0.12 + fine * 0.03
        rough = 0.7 + grain * 0.22 + (1 - bev) * 0.08
      }
      const i = y * size + x
      px[i * 4] = clamp(Rc, 0, 1) * 255
      px[i * 4 + 1] = clamp(G, 0, 1) * 255
      px[i * 4 + 2] = clamp(B, 0, 1) * 255
      px[i * 4 + 3] = 255
      H[i] = h
      Rg[i] = rough
    }
  }
  ctx.putImageData(img, 0, 0)
  return { map: canvasTex(canvas), normalMap: normalFromHeight(H, size, size, 7), roughnessMap: grayTex(Rg, size, size) }
}

export interface WoodTextureOptions {
  size?: number
  planks?: number
  base?: RGB
  seed?: number
  vertical?: boolean
}

export function woodTexture({ size = 512, planks = 6, base = [0.52, 0.36, 0.22], seed = 5, vertical = false }: WoodTextureOptions = {}): TextureSet {
  const r = mulberry32(seed)
  const canvas = makeCanvas(size, size)
  const ctx = canvas.getContext("2d")!
  const img = ctx.createImageData(size, size)
  const px = img.data
  const H = new Float32Array(size * size)
  const Rg = new Float32Array(size * size)
  const pw = size / planks
  const pl: { t: number; off: number; knot: [number, number] | null; ph: number }[] = []
  for (let i = 0; i < planks; i++) pl.push({ t: 0.75 + r() * 0.5, off: r() * 100, knot: r() > 0.5 ? [r() * size, r() * pw] : null, ph: r() * 6 })
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = vertical ? x : y
      const b = vertical ? y : x
      const pi = Math.floor(a / pw)
      const p = pl[pi]
      const la = a - pi * pw
      const u = b / size
      const v = a / size
      const g = NZ.v(u * 4 + p.off, v * 96, 4, 96)
      const grain = Math.sin((la / pw) * 40 + g * 9 + p.ph) * 0.5 + 0.5
      const fine = NZ.v(x * 0.5, y * 0.5)
      let k = p.t * (0.8 + grain * 0.25) * (0.9 + fine * 0.2)
      let h = 0.6 + grain * 0.15 + fine * 0.05
      const edge = Math.min(la, pw - la)
      if (edge < 2.5) {
        k *= 0.45
        h = 0.3
      }
      if (p.knot) {
        const d = Math.hypot(b - p.knot[0], la - p.knot[1])
        if (d < 14) {
          k *= 0.55 + d / 30
          h -= 0.1
        }
      }
      const i = y * size + x
      px[i * 4] = clamp(base[0] * k, 0, 1) * 255
      px[i * 4 + 1] = clamp(base[1] * k, 0, 1) * 255
      px[i * 4 + 2] = clamp(base[2] * k, 0, 1) * 255
      px[i * 4 + 3] = 255
      H[i] = h
      Rg[i] = 0.7 + grain * 0.2
    }
  }
  ctx.putImageData(img, 0, 0)
  return { map: canvasTex(canvas), normalMap: normalFromHeight(H, size, size, 5), roughnessMap: grayTex(Rg, size, size) }
}

export interface ClothTextureOptions {
  size?: number
  color?: RGB
  weave?: number
  noise?: number
  /** 0-1, sun-fade toward warm grey. */
  fade?: number
  emblem?: EmblemPainter | null
  /** Ragged lower edge via alpha map. */
  tatter?: boolean
  stripes?: { n: number; a: RGB; b: RGB } | null
}

export function clothTexture({ size = 512, color = [0.8, 0.75, 0.65], weave = 4, noise = 0.15, fade = 0, emblem = null, tatter = false, stripes = null }: ClothTextureOptions = {}): TextureSet {
  const canvas = makeCanvas(size, size)
  const ctx = canvas.getContext("2d")!
  const img = ctx.createImageData(size, size)
  const px = img.data
  const H = new Float32Array(size * size)
  const A = tatter ? new Float32Array(size * size) : null
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      let col = color
      if (stripes) col = Math.floor(u * stripes.n) % 2 ? stripes.a : stripes.b
      const w = (Math.floor(x / weave) + Math.floor(y / weave)) & 1 ? 1 : 0.9
      const n = NZ.fbm(u, v, 8, 4)
      const k = w * (1 - noise + n * noise * 2)
      let Rc = col[0] * k
      let G = col[1] * k
      let B = col[2] * k
      if (fade > 0) {
        const f = fade * (0.4 + 0.6 * NZ.fbm(u, v, 4, 2))
        Rc = lerp(Rc, 0.78, f)
        G = lerp(G, 0.72, f)
        B = lerp(B, 0.6, f)
      }
      const i = y * size + x
      px[i * 4] = clamp(Rc, 0, 1) * 255
      px[i * 4 + 1] = clamp(G, 0, 1) * 255
      px[i * 4 + 2] = clamp(B, 0, 1) * 255
      px[i * 4 + 3] = 255
      H[i] = 0.5 + w * 0.1 + n * 0.1
      if (A) {
        const edge = NZ.v(u * 32, 0, 32, 1) * 0.06 + NZ.v(u * 128, 1, 128, 1) * 0.02
        A[i] = 1 - v > edge + 0.02 ? 1 : 0
      }
    }
  }
  ctx.putImageData(img, 0, 0)
  if (emblem) {
    ctx.save()
    emblem(ctx, size)
    ctx.restore()
  }
  const out: TextureSet = { map: canvasTex(canvas), normalMap: normalFromHeight(H, size, size, 2) }
  if (A) out.alphaMap = grayTex(A, size, size)
  return out
}

/** Knotwork frieze: raised interlaced strands, optionally worn. Tiles along U. */
export function knotTexture(w = 1024, h = 128, worn = true): TextureSet {
  const canvas = makeCanvas(w, h)
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "#000"
  ctx.fillRect(0, 0, w, h)
  const P = 128
  const curve = (sign: number, x0: number, x1: number) => {
    ctx.beginPath()
    for (let x = x0; x <= x1; x += 2) {
      const y = h / 2 + sign * h * 0.32 * Math.sin((x / P) * Math.PI * 2)
      if (x === x0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
  }
  const strand = (sign: number, x0: number, x1: number) => {
    ctx.lineCap = "butt"
    ctx.strokeStyle = "#000"
    ctx.lineWidth = 26
    curve(sign, x0, x1)
    ctx.stroke()
    ctx.strokeStyle = "#fff"
    ctx.lineWidth = 16
    curve(sign, x0, x1)
    ctx.stroke()
  }
  strand(1, -P, w + P)
  strand(-1, -P, w + P)
  for (let x = 0; x <= w; x += P / 2) {
    const over = Math.round(x / (P / 2)) % 2 === 0 ? 1 : -1
    ctx.save()
    ctx.beginPath()
    ctx.rect(x - 14, 0, 28, h)
    ctx.clip()
    strand(over, x - 40, x + 40)
    ctx.restore()
  }
  for (let x = P / 4; x < w; x += P / 2) {
    ctx.beginPath()
    ctx.arc(x, h / 2, 9, 0, Math.PI * 2)
    ctx.fillStyle = "#fff"
    ctx.fill()
  }
  const img = ctx.getImageData(0, 0, w, h).data
  const H = new Float32Array(w * h)
  const Rg = new Float32Array(w * h)
  const cc = makeCanvas(w, h)
  const cctx = cc.getContext("2d")!
  const ci = cctx.createImageData(w, h)
  const cp = ci.data
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const u = x / w
      const v = y / h
      let raised = img[i * 4] / 255
      const wear = worn ? smoothstep(0.35, 0.75, NZ.fbm(u * 8, v, 8, 3)) : 0
      raised *= 1 - wear * 0.9
      const fine = NZ.v(x * 0.7, y * 0.7)
      const g = NZ.fbm(u * 8, v, 16, 3)
      H[i] = 0.35 + raised * 0.45 + fine * 0.05
      const k = (0.62 + g * 0.3) * (0.9 + fine * 0.2) * (0.85 + raised * 0.3)
      cp[i * 4] = clamp(0.7 * k, 0, 1) * 255
      cp[i * 4 + 1] = clamp(0.58 * k, 0, 1) * 255
      cp[i * 4 + 2] = clamp(0.48 * k, 0, 1) * 255
      cp[i * 4 + 3] = 255
      Rg[i] = 0.8 + fine * 0.15
    }
  }
  cctx.putImageData(ci, 0, 0)
  return { map: canvasTex(cc), normalMap: normalFromHeight(H, w, h, 6), roughnessMap: grayTex(Rg, w, h) }
}

/** Carved stone medallion: a raised ring and a frontal stag, weathered, as colour + normal. */
export function medallionTexture(S = 512): TextureSet {
  const canvas = makeCanvas(S, S)
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "#000"
  ctx.fillRect(0, 0, S, S)
  ctx.fillStyle = "#fff"
  ctx.beginPath()
  ctx.arc(S / 2, S / 2, S * 0.47, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = "#000"
  ctx.beginPath()
  ctx.arc(S / 2, S / 2, S * 0.42, 0, Math.PI * 2)
  ctx.fill()
  ctx.save()
  ctx.translate(S / 2, S * 0.52)
  ctx.fillStyle = "#fff"
  ctx.strokeStyle = "#fff"
  ctx.lineCap = "round"
  ctx.lineWidth = S * 0.045
  ctx.beginPath()
  ctx.ellipse(0, S * 0.08, S * 0.1, S * 0.16, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(-S * 0.12, -S * 0.02, S * 0.07, S * 0.035, -0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(S * 0.12, -S * 0.02, S * 0.07, S * 0.035, 0.5, 0, Math.PI * 2)
  ctx.fill()
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(s * S * 0.06, -S * 0.07)
    ctx.quadraticCurveTo(s * S * 0.2, -S * 0.2, s * S * 0.22, -S * 0.4)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(s * S * 0.13, -S * 0.17)
    ctx.lineTo(s * S * 0.07, -S * 0.32)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(s * S * 0.19, -S * 0.28)
    ctx.lineTo(s * S * 0.3, -S * 0.34)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(s * S * 0.21, -S * 0.36)
    ctx.lineTo(s * S * 0.17, -S * 0.46)
    ctx.stroke()
  }
  ctx.restore()
  const img = ctx.getImageData(0, 0, S, S).data
  const H = new Float32Array(S * S)
  const cc = makeCanvas(S, S)
  const cctx = cc.getContext("2d")!
  const ci = cctx.createImageData(S, S)
  const cp = ci.data
  for (let i = 0; i < S * S; i++) {
    const x = i % S
    const y = (i / S) | 0
    const u = x / S
    const v = y / S
    const wear = smoothstep(0.4, 0.8, NZ.fbm(u, v, 8, 3))
    const raised = (img[i * 4] / 255) * (1 - wear * 0.8)
    const fine = NZ.v(x * 0.6, y * 0.6)
    const g = NZ.fbm(u, v, 8, 3)
    H[i] = 0.4 + raised * 0.4 + fine * 0.04
    const k = (0.65 + g * 0.3) * (0.9 + fine * 0.2) * (0.88 + raised * 0.25)
    cp[i * 4] = clamp(0.72 * k, 0, 1) * 255
    cp[i * 4 + 1] = clamp(0.6 * k, 0, 1) * 255
    cp[i * 4 + 2] = clamp(0.5 * k, 0, 1) * 255
    cp[i * 4 + 3] = 255
  }
  cctx.putImageData(ci, 0, 0)
  return { map: canvasTex(cc), normalMap: normalFromHeight(H, S, S, 6) }
}

/** Autumn meadow ground: green to gold by macro noise. Colour only. */
export function grassTexture(S = 512): TextureSet {
  const canvas = makeCanvas(S, S)
  const ctx = canvas.getContext("2d")!
  const img = ctx.createImageData(S, S)
  const px = img.data
  const green: RGB = [0.3, 0.38, 0.13]
  const gold: RGB = [0.72, 0.58, 0.26]
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S
      const v = y / S
      const m = NZ.fbm(u, v, 4, 3)
      const s = NZ.v(u * 256 + 5, v * 16, 256, 16)
      const f = NZ.v(x * 0.9, y * 0.9)
      const t = clamp(m * 1.3 - 0.2 + s * 0.3 - 0.15, 0, 1)
      const k = 0.75 + f * 0.4
      const i = (y * S + x) * 4
      px[i] = clamp(lerp(green[0], gold[0], t) * k, 0, 1) * 255
      px[i + 1] = clamp(lerp(green[1], gold[1], t) * k, 0, 1) * 255
      px[i + 2] = clamp(lerp(green[2], gold[2], t) * k, 0, 1) * 255
      px[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return { map: canvasTex(canvas) }
}

/** Packed dirt with pebbles. Colour + normal. */
export function dirtTexture(S = 512): TextureSet {
  const r = mulberry32(11)
  const canvas = makeCanvas(S, S)
  const ctx = canvas.getContext("2d")!
  const img = ctx.createImageData(S, S)
  const px = img.data
  const H = new Float32Array(S * S)
  const pebbles: [number, number, number, number][] = []
  for (let i = 0; i < 220; i++) pebbles.push([r() * S, r() * S, 2 + r() * 6, 0.6 + r() * 0.6])
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S
      const v = y / S
      const m = NZ.fbm(u, v, 4, 4)
      const f = NZ.v(x * 0.8, y * 0.8)
      let k = (0.7 + m * 0.5) * (0.88 + f * 0.24)
      let h = 0.5 + m * 0.2
      for (const p of pebbles) {
        const dx = Math.min(Math.abs(x - p[0]), S - Math.abs(x - p[0]))
        const dy = Math.min(Math.abs(y - p[1]), S - Math.abs(y - p[1]))
        const d = Math.hypot(dx, dy)
        if (d < p[2]) {
          k *= p[3] + 0.3
          h += (1 - d / p[2]) * 0.25
        }
      }
      const i = y * S + x
      px[i * 4] = clamp(0.5 * k, 0, 1) * 255
      px[i * 4 + 1] = clamp(0.4 * k, 0, 1) * 255
      px[i * 4 + 2] = clamp(0.29 * k, 0, 1) * 255
      px[i * 4 + 3] = 255
      H[i] = h
    }
  }
  ctx.putImageData(img, 0, 0)
  return { map: canvasTex(canvas), normalMap: normalFromHeight(H, S, S, 4) }
}

/** Rounded cobbles in jittered cells with dark grout. Full PBR set. */
export function cobbleTexture(S = 512, n = 7): TextureSet {
  const r = mulberry32(21)
  const canvas = makeCanvas(S, S)
  const ctx = canvas.getContext("2d")!
  const img = ctx.createImageData(S, S)
  const px = img.data
  const H = new Float32Array(S * S)
  const Rg = new Float32Array(S * S)
  const cell = S / n
  interface Cobble {
    x: number
    y: number
    rx: number
    ry: number
    t: number
    hue: number
  }
  const cobbles: Cobble[] = []
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++)
      cobbles.push({
        x: (i + 0.5) * cell + (r() - 0.5) * cell * 0.25,
        y: (j + 0.5) * cell + (r() - 0.5) * cell * 0.25,
        rx: cell * (0.42 + r() * 0.1),
        ry: cell * (0.38 + r() * 0.1),
        t: 0.75 + r() * 0.5,
        hue: r(),
      })
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let best = 1e9
      let bc = cobbles[0]
      for (const s of cobbles) {
        for (const ox of [-S, 0, S]) {
          for (const oy of [-S, 0, S]) {
            const dx = (x - s.x - ox) / s.rx
            const dy = (y - s.y - oy) / s.ry
            const d = dx * dx + dy * dy
            if (d < best) {
              best = d
              bc = s
            }
          }
        }
      }
      const f = NZ.v(x * 0.7, y * 0.7)
      const g = NZ.fbm(x / S, y / S, 8, 3)
      let k: number
      let h: number
      if (best < 0.8) {
        const e = 1 - best / 0.8
        k = bc.t * (0.85 + g * 0.3) * (0.9 + f * 0.2)
        h = 0.45 + Math.sqrt(e) * 0.35 + f * 0.04
      } else {
        k = 0.45 * (0.8 + f * 0.4)
        h = 0.3 + f * 0.1
      }
      const i = y * S + x
      const hu = bc.hue
      px[i * 4] = clamp((0.55 + hu * 0.1) * k, 0, 1) * 255
      px[i * 4 + 1] = clamp((0.5 + hu * 0.04) * k, 0, 1) * 255
      px[i * 4 + 2] = clamp((0.45 - hu * 0.05) * k, 0, 1) * 255
      px[i * 4 + 3] = 255
      H[i] = h
      Rg[i] = best < 0.8 ? 0.6 + f * 0.2 : 1
    }
  }
  ctx.putImageData(img, 0, 0)
  return { map: canvasTex(canvas), normalMap: normalFromHeight(H, S, S, 6), roughnessMap: grayTex(Rg, S, S) }
}

/** Birch bark: pale with dark lenticels. Colour only, 1:2 aspect for trunks. */
export function birchTexture(): TextureSet {
  const S = 256
  const Hh = 512
  const r = mulberry32(31)
  const canvas = makeCanvas(S, Hh)
  const ctx = canvas.getContext("2d")!
  const img = ctx.createImageData(S, Hh)
  const px = img.data
  for (let y = 0; y < Hh; y++) {
    for (let x = 0; x < S; x++) {
      const m = NZ.fbm(x / S, y / Hh, 4, 4)
      const f = NZ.v(x * 0.8, y * 0.8)
      const k = 0.8 + m * 0.25 + f * 0.1
      const idx = (y * S + x) * 4
      px[idx] = clamp(0.88 * k, 0, 1) * 255
      px[idx + 1] = clamp(0.86 * k, 0, 1) * 255
      px[idx + 2] = clamp(0.8 * k, 0, 1) * 255
      px[idx + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  ctx.fillStyle = "rgba(30,24,20,0.85)"
  for (let i = 0; i < 70; i++) {
    const w = 10 + r() * 60
    const h = 2 + r() * 4
    ctx.beginPath()
    ctx.ellipse(r() * S, r() * Hh, w, h, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = "rgba(40,32,26,0.9)"
  for (let i = 0; i < 6; i++) {
    ctx.beginPath()
    ctx.ellipse(r() * S, r() * Hh, 15 + r() * 20, 25 + r() * 40, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  return { map: canvasTex(canvas) }
}

/** Soft radial gradient for glow, fire and smoke sprites. */
export function radialSprite(inner = "rgba(255,220,160,1)", outer = "rgba(255,180,90,0)", S = 128): THREE.CanvasTexture {
  const canvas = makeCanvas(S, S)
  const ctx = canvas.getContext("2d")!
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, inner)
  g.addColorStop(0.35, inner.replace(/,1\)$/, ",0.6)"))
  g.addColorStop(1, outer)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
