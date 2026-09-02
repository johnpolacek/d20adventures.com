// scene-kit core: seeded randomness, value noise, and small math helpers.
//
// Everything in the kit that varies per scene draws from an explicit Rng so a set
// renders identically every load. Nothing here touches three or the DOM.

export function mulberry32(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class Rng {
  private readonly next: () => number
  constructor(seed: number) {
    this.next = mulberry32(seed)
  }
  /** Uniform in [0, 1). */
  value(): number {
    return this.next()
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next()
  }
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive)
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]
  }
  chance(probability: number): boolean {
    return this.next() < probability
  }
  sign(): 1 | -1 {
    return this.next() < 0.5 ? -1 : 1
  }
  /** A child generator, so one consumer's draw count doesn't shift another's. */
  fork(salt: number): Rng {
    return new Rng((this.next() * 4294967296) ^ salt)
  }
}

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}
export const clamp = (x: number, min: number, max: number): number => Math.min(max, Math.max(min, x))
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Tileable value noise on a 256x256 lattice with fbm helpers. */
export class Noise {
  private readonly grid: Float32Array
  constructor(seed: number) {
    const random = mulberry32(seed)
    this.grid = new Float32Array(256 * 256)
    for (let i = 0; i < this.grid.length; i++) this.grid[i] = random()
  }

  /** Bilinear value noise, tiling every `px` x `py` lattice cells. */
  v(x: number, y: number, px = 256, py = 256): number {
    let xi = Math.floor(x)
    let yi = Math.floor(y)
    const fx = x - xi
    const fy = y - yi
    xi = ((xi % px) + px) % px
    yi = ((yi % py) + py) % py
    const x1 = (xi + 1) % px
    const y1 = (yi + 1) % py
    const g = this.grid
    const a = g[yi * 256 + xi]
    const b = g[yi * 256 + x1]
    const c = g[y1 * 256 + xi]
    const d = g[y1 * 256 + x1]
    const u = fx * fx * (3 - 2 * fx)
    const w = fy * fy * (3 - 2 * fy)
    const ab = a + (b - a) * u
    return ab + (c + (d - c) * u - ab) * w
  }

  /** Tileable fbm over unit uv. */
  fbm(u: number, v: number, base = 8, octaves = 5): number {
    let amp = 1
    let sum = 0
    let norm = 0
    let period = base
    for (let i = 0; i < octaves && period <= 256; i++) {
      sum += amp * this.v(u * period + i * 11.3, v * period + i * 7.1, period, period)
      norm += amp
      amp *= 0.5
      period *= 2
    }
    return sum / norm
  }

  /** Free-space fbm (not tileable). */
  f(x: number, y: number, octaves = 4): number {
    let amp = 1
    let sum = 0
    let norm = 0
    let px = x
    let py = y
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.v(px, py)
      norm += amp
      amp *= 0.5
      px = px * 2.03 + 13.7
      py = py * 2.03 + 5.1
    }
    return sum / norm
  }
}

/** Shared noise fields. Texture noise is fixed so material tiles never change between scenes. */
export const TEXTURE_NOISE = new Noise(7)
export const TERRAIN_NOISE = new Noise(99)
