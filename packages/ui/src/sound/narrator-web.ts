"use client"

import type { NarratorClip, NarratorEngine } from "./narrator"

// The narrator engine for a browser (narrator-worker.ts). Only where the graphics card can run it: without WebGPU it is
// slower than speech, and there is no narrator.

let share: number | null = null
const listeners = new Set<() => void>()
const tell = (s: number | null) => {
  share = s
  for (const l of listeners) l()
}
// How much of the voice has downloaded, 0 to 1, while it does. Null before and after.
export const voiceDownload = () => share
export function onVoiceDownload(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export function browserNarrator(): NarratorEngine | null {
  if (typeof Worker === "undefined" || typeof navigator === "undefined" || !("gpu" in navigator)) return null
  let worker: Worker | null = null
  let ready: Promise<void> | null = null
  let next = 0
  const waiting = new Map<number, { resolve: (c: NarratorClip) => void; reject: (e: Error) => void }>()
  let loaded: { resolve: () => void; reject: (e: Error) => void } | null = null

  const start = () => {
    if (worker) return worker
    const w = new Worker(new URL("./narrator-worker.ts", import.meta.url), { type: "module" })
    w.onmessage = (e: MessageEvent) => {
      const m = e.data
      if (m.type === "progress") tell(m.share)
      else if (m.type === "ready") {
        tell(null)
        loaded?.resolve()
      } else if (m.type === "failed") {
        tell(null)
        loaded?.reject(new Error(m.error))
      } else if (m.type === "spoken") {
        const p = waiting.get(m.id)
        waiting.delete(m.id)
        if (m.audio) p?.resolve({ audio: m.audio, rate: m.rate })
        else p?.reject(new Error(m.error ?? "The narrator said nothing."))
      }
    }
    worker = w
    return w
  }

  return {
    load: () => {
      ready ??= (async () => {
        // A browser that names WebGPU but has no adapter for it, as some do, has no narrator either.
        const gpu = (navigator as Navigator & { gpu: { requestAdapter: () => Promise<unknown> } }).gpu
        if (!(await gpu.requestAdapter().catch(() => null))) throw new Error("No graphics card for the narrator.")
        await new Promise<void>((resolve, reject) => {
          loaded = { resolve, reject }
          tell(0)
          start().postMessage({ type: "load" })
        })
      })()
      // A failed load tries again next time.
      ready.catch(() => (ready = null))
      return ready
    },
    say: (text, voice) =>
      new Promise<NarratorClip>((resolve, reject) => {
        const id = next++
        waiting.set(id, { resolve, reject })
        start().postMessage({ type: "speak", id, text, voice })
      }),
    names: async (list) => void start().postMessage({ type: "names", names: list }),
  }
}
