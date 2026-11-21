"use client"

import { prefersReducedMotion } from "./motion"
import type { Motion } from "./presence"
import { type AnimationEvent, type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react"

// Longer than any exit, for an exit whose end event never comes.
const EXIT_LIMIT = 300

/** What a row puts on its element: its motion class, its place in the stagger, and the end of its exit. */
export type RowMotion = { className: string; style?: CSSProperties; inert?: boolean; onAnimationEnd?: (e: AnimationEvent<HTMLElement>) => void }
export type Row<T> = { key: string; item: T; leaving: boolean; motion: RowMotion }
// `quiet` is a row that took the place of one like it, and so came in without motion.
type Kept<T> = { key: string; item: T; leaving: boolean; step: number; quiet?: boolean }

/**
 * A keyed list whose rows come and go. The rows there on the first render come in staggered, and one that joins later
 * comes in at once. A row taken out of `items` stays where it was, with its last item, until its exit has played.
 * Spread `motion` on each row's element. `from` starts the stagger later, for a list that follows another. With `like`,
 * a row that joins as one like it leaves takes its place with no motion, as when the app gives a row a new key.
 */
export function useLeaving<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  opts: { enter?: Motion; exit?: Motion; from?: number; like?: (a: T, b: T) => boolean } = {}
): Row<T>[] {
  const { enter = "rise", exit = "fade", from = 0, like } = opts
  const [kept, setKept] = useState<Kept<T>[]>(() => items.map((item, i) => ({ key: keyOf(item), item, leaving: false, step: Math.min(from + i, 8) })))
  // Each row's latest item, which is the one that leaves.
  const last = useRef(new Map<string, T>())
  useLayoutEffect(() => {
    for (const item of items) last.current.set(keyOf(item), item)
  })
  const here = new Set(items.map(keyOf))
  const known = new Map(kept.map((k) => [k.key, k]))
  const latest = (k: Kept<T>) => last.current.get(k.key) ?? k.item
  // Rows that join now in place of a row like them that leaves now, by the key of the row that leaves.
  const replaced = new Set<string>()
  const quiet = new Set<string>()
  if (like)
    for (const item of items) {
      if (known.has(keyOf(item))) continue
      const old = kept.find((k) => !k.leaving && !here.has(k.key) && !replaced.has(k.key) && like(latest(k), item))
      if (!old) continue
      replaced.add(old.key)
      quiet.add(keyOf(item))
    }
  // A row that left follows the row it stood after.
  const gone = new Map<string | null, Kept<T>[]>()
  let anchor: string | null = null
  for (const k of kept) {
    if (here.has(k.key)) anchor = k.key
    else if (!replaced.has(k.key)) gone.set(anchor, [...(gone.get(anchor) ?? []), { ...k, item: latest(k), leaving: true }])
  }
  const rows: Kept<T>[] = [...(gone.get(null) ?? [])]
  for (const item of items) {
    const key = keyOf(item)
    const was = known.get(key)
    rows.push({ key, item, leaving: false, step: was && !was.leaving ? was.step : 0, quiet: was && !was.leaving ? was.quiet : quiet.has(key) }, ...(gone.get(key) ?? []))
  }
  const sign = (list: Kept<T>[]) => list.map((k) => `${k.key}:${k.leaving ? 1 : 0}`).join("\n")
  if (sign(rows) !== sign(kept)) setKept(rows)
  const drop = (keys: string[]) => {
    for (const key of keys) last.current.delete(key)
    setKept((all) => all.filter((k) => !(k.leaving && keys.includes(k.key))))
  }
  const leaving = rows.filter((k) => k.leaving).map((k) => k.key).join("\n")
  useEffect(() => {
    if (!leaving) return
    const keys = leaving.split("\n")
    if (prefersReducedMotion()) return drop(keys)
    const timer = setTimeout(() => drop(keys), EXIT_LIMIT)
    return () => clearTimeout(timer)
  }, [leaving])
  return rows.map((k) => ({
    key: k.key,
    item: k.item,
    leaving: k.leaving,
    motion: k.leaving
      ? { className: `exit-${exit}`, inert: true, onAnimationEnd: (e) => e.target === e.currentTarget && drop([k.key]) }
      : { className: k.quiet ? "" : `enter-${enter}`, style: k.step ? ({ "--i": k.step } as CSSProperties) : undefined },
  }))
}
