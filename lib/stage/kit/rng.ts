// Seeded randomness. Every object in a set gets its own stream, derived from the set's seed and the
// object's position in the spec, so editing one object never reshuffles the rest of the set.

export type Rand = ((a?: number, b?: number) => number) & {
  pick: <T>(items: readonly T[]) => T
  fork: (salt: string | number) => Rand
}

export function createRand(seed: number): Rand {
  let s = seed >>> 0
  const rand = ((a = 0, b = 1) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return a + ((b - a) * s) / 4294967296
  }) as Rand
  rand.pick = <T>(items: readonly T[]) => items[Math.min(items.length - 1, Math.floor(rand(0, items.length)))]
  rand.fork = (salt) => createRand(hashSeed(s, salt))
  return rand
}

// FNV-1a over the parts' string forms.
export function hashSeed(...parts: (string | number)[]): number {
  let h = 2166136261
  for (const ch of parts.join("/")) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// A stateless hash in [0, 1), for choices that must not consume a stream (crowd card variants).
export function hash01(n: number): number {
  let t = (n + 0x6d2b79f5) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
