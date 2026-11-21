"use client"

import { audio, bus } from "./engine"
import { onSoundSetting } from "./settings"

// The narrator: the player's choice of voice, kept in the browser like the sound setting, and the voice itself, which
// Kokoro makes on the player's own machine (see narrator-worker.ts). On, as the English woman, unless changed.

export const NARRATOR_VOICES = [
  { id: "bf_emma", label: "English Woman" },
  { id: "bm_george", label: "English Man" },
  { id: "af_heart", label: "American Woman" },
  { id: "am_michael", label: "American Man" },
] as const
export type NarratorVoice = (typeof NARRATOR_VOICES)[number]["id"]
const DEFAULT: NarratorVoice = "bf_emma"

const KEY = "d20.narrator"
const listeners = new Set<() => void>()

// The chosen voice, or null when the narrator is off.
export function narratorVoice(): NarratorVoice | null {
  try {
    const v = localStorage.getItem(KEY)
    if (v === "off") return null
    return NARRATOR_VOICES.find((n) => n.id === v)?.id ?? DEFAULT
  } catch {
    return DEFAULT
  }
}
export function setNarratorVoice(voice: NarratorVoice | null) {
  try {
    localStorage.setItem(KEY, voice ?? "off")
  } catch {}
  if (voice) warmNarrator()
  for (const l of listeners) l()
}
export function onNarratorChange(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

// ── The model ──
// What makes the speech. The site runs Kokoro in a worker in the browser. The desktop app sets its own, which runs it
// in Node beside the game, several times faster.
export type NarratorClip = { audio: Float32Array; rate: number }
export type NarratorEngine = { load: () => Promise<void>; say: (text: string, voice: NarratorVoice) => Promise<NarratorClip> }

function browserEngine(): NarratorEngine | null {
  if (typeof Worker === "undefined") return null
  const worker = new Worker(new URL("./narrator-worker.ts", import.meta.url), { type: "module" })
  let nextId = 0
  let loaded: { resolve: () => void; reject: (e: Error) => void } | null = null
  const waiting = new Map<number, { resolve: (c: NarratorClip) => void; reject: (e: Error) => void }>()
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data
    if (m.type === "ready") loaded?.resolve()
    else if (m.type === "failed") loaded?.reject(new Error(m.error))
    else if (m.type === "spoken") {
      const w = waiting.get(m.id)
      waiting.delete(m.id)
      if (m.error) w?.reject(new Error(m.error))
      else w?.resolve({ audio: m.audio, rate: m.rate })
    }
  }
  return {
    load: () =>
      new Promise<void>((resolve, reject) => {
        loaded = { resolve, reject }
        worker.postMessage({ type: "load" })
      }),
    say: (text, voice) => {
      const id = nextId++
      const c = new Promise<NarratorClip>((resolve, reject) => waiting.set(id, { resolve, reject }))
      worker.postMessage({ type: "speak", id, text, voice })
      return c
    },
  }
}

let engine: NarratorEngine | null | undefined
let state: "cold" | "loading" | "ready" | "failed" = "cold"
// Set before the first narration, to speak with something other than the browser.
export function setNarratorEngine(e: NarratorEngine) {
  engine = e
  state = "cold"
}
const current = () => (engine === undefined ? (engine = browserEngine()) : engine)

// Starts loading the model, so it is ready when the story is. A failed load tries again next time.
export function warmNarrator() {
  if (state === "loading" || state === "ready") return
  const e = current()
  if (!e) return
  state = "loading"
  e.load().then(
    () => {
      state = "ready"
      for (const l of listeners) l()
    },
    () => {
      state = "failed"
      for (const l of listeners) l()
    }
  )
}
export const narratorReady = () => state === "ready"

// Sentences already made, so a replay or a step back is heard at once.
const clips = new Map<string, Promise<NarratorClip>>()
const KEEP = 80
function say(text: string, voice: NarratorVoice): Promise<NarratorClip> {
  const key = `${voice}|${text}`
  let c = clips.get(key)
  if (!c) {
    const e = current()
    if (!e) return Promise.reject(new Error("No narrator"))
    c = e.say(text, voice)
    c.catch(() => clips.delete(key))
    clips.set(key, c)
    if (clips.size > KEEP) clips.delete(clips.keys().next().value!)
  }
  return c
}

// A paragraph in sentences, short ones kept with the next, so the first is heard soon and none runs past the model's
// limit.
export function sentences(text: string): string[] {
  const parts = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…]["”’)]?)\s+/)
  const out: string[] = []
  for (const p of parts) {
    if (out.length && out[out.length - 1].length < 40) out[out.length - 1] += ` ${p}`
    else if (p) out.push(p)
  }
  return out
}

// Makes a paragraph ahead of time, for the one the player will read next.
export function prepareNarration(text: string, voice: NarratorVoice) {
  if (state !== "ready") return
  for (const s of sentences(text)) say(s, voice).catch(() => {})
}

// Narration sits over the other sounds: the voice bus is at the master's level, so the words are lifted above it.
const LIFT = 1.8

// Reads a paragraph aloud on the voice bus. Null when there is no sound to play it on. `done` settles when the last
// sentence ends, or at once when stopped.
export function speak(text: string, voice: NarratorVoice): { done: Promise<void>; stop: () => void } | null {
  const c = audio()
  if (!c || c.state !== "running" || state !== "ready") return null
  const lines = sentences(text)
  if (!lines.length) return null
  const made = lines.map((s) => say(s, voice))
  for (const m of made) m.catch(() => {})
  let stopped = false
  let finish = () => {}
  const playing = new Set<AudioBufferSourceNode>()
  const gain = c.createGain()
  gain.gain.value = LIFT
  gain.connect(bus("voice"))
  const stop = () => {
    if (stopped) return
    stopped = true
    for (const s of playing) {
      s.onended = null
      s.stop()
    }
    gain.disconnect()
    finish()
  }
  // Sound turned off mid-sentence holds the context, so the narration would never end: it stops instead.
  const unsound = onSoundSetting((on) => !on && stop())
  const done = new Promise<void>((resolve) => {
    finish = () => {
      unsound()
      resolve()
    }
    void (async () => {
      let at = c.currentTime + 0.05
      let last: AudioBufferSourceNode | null = null
      for (const m of made) {
        const clip = await m.catch(() => null)
        if (stopped) return
        if (!clip) continue
        const buffer = c.createBuffer(1, clip.audio.length, clip.rate)
        buffer.copyToChannel(clip.audio as Float32Array<ArrayBuffer>, 0)
        const src = c.createBufferSource()
        src.buffer = buffer
        src.connect(gain)
        at = Math.max(at, c.currentTime)
        src.start(at)
        at += buffer.duration
        playing.add(src)
        src.onended = () => playing.delete(src)
        last = src
      }
      if (!last) return stop()
      last.onended = () => {
        playing.delete(last!)
        stop()
      }
    })()
  })
  return { done, stop }
}
