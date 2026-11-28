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

export interface NarratorWorkerLike {
  onmessage: ((e: MessageEvent) => void) | null
  onerror: ((e: ErrorEvent) => void) | null
  onmessageerror: ((e: MessageEvent) => void) | null
  postMessage: (msg: unknown) => void
  terminate: () => void
}

export type WebNarratorState =
  | { kind: "idle" }
  | { kind: "loading"; worker: NarratorWorkerLike; ready: Promise<void>; settle: { resolve: () => void; reject: (e: Error) => void } }
  | { kind: "ready"; worker: NarratorWorkerLike }
  | { kind: "failed"; error: Error }

export interface BrowserNarratorDeps {
  createWorker: () => NarratorWorkerLike
  requestAdapter: () => Promise<unknown>
}

export function createBrowserNarrator(deps: BrowserNarratorDeps): NarratorEngine & { state: () => WebNarratorState } {
  let state: WebNarratorState = { kind: "idle" }
  let next = 0
  const waiting = new Map<number, { resolve: (c: NarratorClip) => void; reject: (e: Error) => void }>()

  const failWorker = (error: Error) => {
    const prev = state
    state = { kind: "failed", error }
    tell(null)
    if (prev.kind === "loading") {
      prev.settle.reject(error)
      prev.worker.terminate()
    } else if (prev.kind === "ready") {
      prev.worker.terminate()
    }
    const pending = [...waiting.values()]
    waiting.clear()
    for (const p of pending) p.reject(error)
  }

  const spawnWorker = (): NarratorWorkerLike => {
    const w = deps.createWorker()
    w.onmessage = (e) => {
      const m = e.data as
        | { type: "progress"; share: number }
        | { type: "ready" }
        | { type: "failed"; error?: string }
        | { type: "spoken"; id: number; audio?: Float32Array; rate?: number; error?: string }
      if (m.type === "progress") {
        tell(m.share)
      } else if (m.type === "ready") {
        tell(null)
        if (state.kind === "loading" && state.worker === w) {
          const { settle } = state
          state = { kind: "ready", worker: w }
          settle.resolve()
        }
      } else if (m.type === "failed") {
        if ((state.kind === "loading" || state.kind === "ready") && state.worker === w) {
          failWorker(new Error(m.error ?? "Narrator worker failed."))
        }
      } else if (m.type === "spoken") {
        const p = waiting.get(m.id)
        waiting.delete(m.id)
        if (m.audio && m.rate !== undefined) p?.resolve({ audio: m.audio, rate: m.rate })
        else p?.reject(new Error(m.error ?? "The narrator said nothing."))
      }
    }
    w.onerror = (e) => {
      const msg = e?.message || (e?.error instanceof Error ? e.error.message : "Narrator worker crashed.")
      failWorker(new Error(msg))
    }
    w.onmessageerror = () => {
      failWorker(new Error("Narrator worker message deserialization failed."))
    }
    return w
  }

  const currentState = () => state
  const activeWorker = (): NarratorWorkerLike | null => (state.kind === "loading" || state.kind === "ready" ? state.worker : null)

  return {
    state: () => state,
    load: () => {
      if (state.kind === "ready") return Promise.resolve()
      if (state.kind === "loading") return state.ready
      const worker = spawnWorker()
      let resolveReady!: () => void
      let rejectReady!: (e: Error) => void
      const loadedPromise = new Promise<void>((resolve, reject) => {
        resolveReady = resolve
        rejectReady = reject
      })
      const ready = (async () => {
        // A browser that names WebGPU but has no adapter for it, as some do, has no narrator either.
        if (!(await deps.requestAdapter().catch(() => null))) {
          const err = new Error("No graphics card for the narrator.")
          failWorker(err)
          throw err
        }
        const cur = currentState()
        if (cur.kind !== "loading" || cur.worker !== worker) {
          throw cur.kind === "failed" ? cur.error : new Error("Narrator load cancelled.")
        }
        tell(0)
        worker.postMessage({ type: "load" })
        await loadedPromise
      })()
      state = { kind: "loading", worker, ready, settle: { resolve: resolveReady, reject: rejectReady } }
      return ready
    },
    say: (text, voice) =>
      new Promise<NarratorClip>((resolve, reject) => {
        const w = activeWorker()
        if (!w) {
          reject(state.kind === "failed" ? state.error : new Error("Narrator worker is not loaded."))
          return
        }
        const id = next++
        waiting.set(id, { resolve, reject })
        w.postMessage({ type: "speak", id, text, voice })
      }),
    names: async (list) => {
      const w = activeWorker()
      if (w) w.postMessage({ type: "names", names: list })
    },
  }
}

export function browserNarrator(): NarratorEngine | null {
  if (typeof Worker === "undefined" || typeof navigator === "undefined" || !("gpu" in navigator)) return null
  const gpu = (navigator as Navigator & { gpu: { requestAdapter: () => Promise<unknown> } }).gpu
  return createBrowserNarrator({
    createWorker: () => new Worker(new URL("./narrator-worker.ts", import.meta.url), { type: "module" }) as unknown as NarratorWorkerLike,
    requestAdapter: () => gpu.requestAdapter(),
  })
}
