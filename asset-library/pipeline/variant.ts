// Pure helpers for $0 character variants: inheriting pipeline settings from a base figure and recolouring its base
// colour texture so reused bodies (guards, commoners, horses) do not look like identical twins.

export interface RecolorRule {
  // Optional source hue band in degrees [min, max] (wraps past 360, e.g. [340, 20] for reds).
  hue?: [number, number]
  // Minimum saturation (0..1) to match (defaults to 0.08 when `hue` is given, else 0).
  minSat?: number
  // Optional source lightness range [min, max] in 0..1.
  lightness?: [number, number]
  // Hue shift in degrees (-180..180).
  shift?: number
  // Saturation multiplier (e.g. 0.7 duller, 1.25 richer).
  sat?: number
  // Lightness multiplier (e.g. 0.85 darker, 1.15 brighter).
  light?: number
  // Target hex colour ("#3b5944") mixed in at `strength` (0..1), preserving the texel's shading luminance.
  tint?: string
  strength?: number
  // Protect skin tones (default true), metal texels from metallicRoughness (default true), and painted face texels
  // from paint.py (default true). Set `keepSkin: false` for horses and beasts.
  keepSkin?: boolean
  keepMetal?: boolean
  keepFace?: boolean
}

// Pipeline settings a variant inherits from its base brief unless overridden. Passing `null` for `holds` drops a prop.
const INHERITED = [
  "maker",
  "stance",
  "rig",
  "stock",
  "borrowed",
  "skinning",
  "cloak",
  "gloss",
  "drawn",
  "eased",
  "chin",
  "bob",
  "lids",
  "creature",
  "helpers",
  "lit",
  "holds",
] as const

export function inheritBrief<T extends Record<string, unknown>>(variant: T, base: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...variant }
  for (const key of INHERITED) {
    if (out[key] === undefined && base[key] !== undefined) out[key] = base[key]
    else if (out[key] === null) delete out[key]
  }
  return out as T
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d < 1e-6) return [0, 0, l]
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = (60 * (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4)) % 360
  return [h, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hn = ((h % 360) + 360) % 360
  if (s < 1e-6) return [l, l, l]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const chan = (t: number) => {
    const u = ((t % 1) + 1) % 1
    if (u < 1 / 6) return p + (q - p) * 6 * u
    if (u < 1 / 2) return q
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6
    return p
  }
  return [chan(hn / 360 + 1 / 3), chan(hn / 360), chan(hn / 360 - 1 / 3)]
}

function inHueBand(h: number, [lo, hi]: [number, number]): boolean {
  const a = ((lo % 360) + 360) % 360
  const b = ((hi % 360) + 360) % 360
  return a <= b ? h >= a && h <= b : h >= a || h <= b
}

function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace(/^#/, "")
  const n = Number.parseInt(clean.length === 3 ? clean.replace(/./g, "$&$&") : clean, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

// Conservative warm skin band (pale peach to deep brown) so general cloth shifts leave necks, ears and hands natural.
const isSkin = (h: number, s: number, l: number) => h >= 5 && h <= 42 && s >= 0.12 && s <= 0.68 && l >= 0.18 && l <= 0.86

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * Applies recolour rules in place to an RGB/RGBA buffer and returns how many texels changed.
 * `metal` (optional, 1 byte per texel, 0..255 from metallicRoughness blue channel) and `faceMask` (optional, 1 byte per
 * texel, non-zero where paint.py painted the face) protect metal and faces unless a rule opts out.
 */
export function recolorPixels(
  data: Uint8Array,
  channels: number,
  rules: RecolorRule[],
  metal?: Uint8Array | null,
  faceMask?: Uint8Array | null
): number {
  if (!rules.length) return 0
  const prepared = rules.map((r) => ({
    ...r,
    minSat: r.minSat ?? (r.hue ? 0.08 : 0),
    keepSkin: r.keepSkin ?? true,
    keepMetal: r.keepMetal ?? true,
    keepFace: r.keepFace ?? true,
    tintHsl: r.tint ? rgbToHsl(...parseHex(r.tint)) : null,
    strength: clamp01(r.strength ?? 0.65),
  }))
  let touched = 0
  for (let i = 0, p = 0; i < data.length; i += channels, p++) {
    let r = data[i] / 255
    let g = data[i + 1] / 255
    let b = data[i + 2] / 255
    let changed = false
    const isMetal = metal ? metal[p] >= 128 : false
    const isFace = faceMask ? faceMask[p] > 0 : false
    for (const rule of prepared) {
      if (rule.keepFace && isFace) continue
      if (rule.keepMetal && isMetal) continue
      let [h, s, l] = rgbToHsl(r, g, b)
      if (rule.keepSkin && isSkin(h, s, l)) continue
      if (s < rule.minSat) continue
      if (rule.hue && !inHueBand(h, rule.hue)) continue
      if (rule.lightness && (l < rule.lightness[0] || l > rule.lightness[1])) continue
      if (rule.shift) h = (h + rule.shift + 360) % 360
      if (rule.sat !== undefined) s = clamp01(s * rule.sat)
      if (rule.light !== undefined) l = clamp01(l * rule.light)
      if (rule.tintHsl) {
        const [th, ts] = rule.tintHsl
        // Shortest-arc hue blend toward the target colour while preserving shading luminance.
        const dh = ((((th - h) % 360) + 540) % 360) - 180
        h = (h + dh * rule.strength + 360) % 360
        s = clamp01(s + (ts - s) * rule.strength)
      }
      ;[r, g, b] = hslToRgb(h, s, l)
      changed = true
    }
    if (changed) {
      data[i] = Math.round(r * 255)
      data[i + 1] = Math.round(g * 255)
      data[i + 2] = Math.round(b * 255)
      touched++
    }
  }
  return touched
}
