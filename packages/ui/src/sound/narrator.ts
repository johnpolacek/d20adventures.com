"use client"

import { audio, bus, duck } from "./engine"
import type { Pronunciations } from "./pronunciations"
import { onSoundSetting } from "./settings"

// The narrator: the player's choice of voice, kept in the browser like the sound setting, and the voice itself, which
// Kokoro makes on the player's own machine. On, as the English woman, unless changed.

export const NARRATOR_VOICES = [
  { id: "bf_emma", label: "English Woman", gender: "female", other: "bm_george" },
  { id: "bm_george", label: "English Man", gender: "male", other: "bf_emma" },
  { id: "af_heart", label: "American Woman", gender: "female", other: "am_michael" },
  { id: "am_michael", label: "American Man", gender: "male", other: "af_heart" },
] as const
export type NarratorVoice = (typeof NARRATOR_VOICES)[number]["id"]
const DEFAULT: NarratorVoice = "bf_emma"

// A character's gender as their voice hears it: what the sheet says, or failing that the pronouns of their description.
// Undefined for a creature that is neither, which speaks in the narrator's voice.
export type Spoken = "female" | "male" | undefined
export function spokenGender(c: { gender?: string; appearance?: string; personality?: string; background?: string }): Spoken {
  const g = c.gender?.toLowerCase() ?? ""
  if (/\b(female|woman|girl|she|her)\b/.test(g)) return "female"
  if (/\b(male|man|boy|he|him)\b/.test(g)) return "male"
  const words = `${c.appearance ?? ""} ${c.personality ?? ""} ${c.background ?? ""}`.toLowerCase()
  const she = words.match(/\b(she|her|hers|herself)\b/g)?.length ?? 0
  const he = words.match(/\b(he|him|his|himself)\b/g)?.length ?? 0
  return she > he ? "female" : he > she ? "male" : undefined
}

// The voice a character's words are said in: the narrator's own, or the narrator's counterpart of the other gender, so a
// man's lines are not read by a woman.
export function voiceFor(narrator: NarratorVoice, speaker: Spoken): NarratorVoice {
  const n = NARRATOR_VOICES.find((v) => v.id === narrator)
  return n && speaker && speaker !== n.gender ? n.other : narrator
}

// A paragraph's sentences in the voices that read them: the words inside quote marks in the speaker's, the rest in the
// narrator's. Each piece keeps the place of its sentence in sentences(text).
function pieces(text: string, voice: NarratorVoice, speaker: Spoken): { text: string; voice: NarratorVoice; sentence: number }[] {
  const said = voiceFor(voice, speaker)
  if (said === voice) return sentences(text).map((t, sentence) => ({ text: t, voice, sentence }))
  const out: { text: string; voice: NarratorVoice; sentence: number }[] = []
  let quoted = false
  for (const [sentence, s] of sentences(text).entries()) {
    for (const [i, part] of s.split(/["“”]/).entries()) {
      if (i > 0) quoted = !quoted
      const t = part.trim()
      if (/[\p{L}\p{N}]/u.test(t)) out.push({ text: t, voice: quoted ? said : voice, sentence })
    }
  }
  return out
}

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
// What makes the speech. The desktop app sets one that runs Kokoro in Node beside the game. Without one there is no
// narrator: in a browser it made speech slower than it plays, and stalled on the play screen.
export type NarratorClip = { audio: Float32Array; rate: number }
export type NarratorEngine = {
  load: () => Promise<void>
  say: (text: string, voice: NarratorVoice) => Promise<NarratorClip>
  // The adventure's pronunciations (pronunciations.ts), for every sentence said after.
  names?: (list: Pronunciations) => Promise<void>
}

let engine: NarratorEngine | null = null
let state: "cold" | "loading" | "ready" | "failed" = "cold"
// Set before the first narration.
export function setNarratorEngine(e: NarratorEngine) {
  engine = e
  state = "cold"
}
// Whether this player can hear a narrator, for the setting to show.
export const narratorAvailable = () => engine !== null

// Starts loading the model, so it is ready when the story is. A failed load tries again next time.
export function warmNarrator() {
  if (state === "loading" || state === "ready") return
  if (!engine) return
  state = "loading"
  engine.load().then(
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

// The names the playing adventure says its own way. New ones forget the sentences made with the last.
let namesKey = "{}"
export function setNarratorNames(list: Pronunciations) {
  const key = JSON.stringify(list)
  if (key === namesKey || !engine?.names) return
  namesKey = key
  clips.clear()
  engine.names(list).catch(() => {})
}
const KEEP = 80
function say(text: string, voice: NarratorVoice): Promise<NarratorClip> {
  const key = `${voice}|${text}`
  let c = clips.get(key)
  if (!c) {
    if (!engine) return Promise.reject(new Error("No narrator"))
    c = engine.say(text, voice)
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

// Which of a paragraph's sentences, as the narrator reads them, holds a phrase: where a cue tied to those words plays.
// The first, when no sentence holds it.
export function sentenceOf(text: string, phrase: string): number {
  const want = phrase.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 40)
  if (!want) return 0
  return Math.max(0, sentences(text).findIndex((s) => s.toLowerCase().includes(want)))
}

// Makes a paragraph ahead of time, for the one the player will read next.
export function prepareNarration(text: string, voice: NarratorVoice, speaker?: Spoken) {
  if (state !== "ready") return
  for (const p of pieces(text, voice, speaker)) say(p.text, p.voice).catch(() => {})
}

// Narration sits over the other sounds: the voice bus is at the master's level, so the words are lifted above it.
const LIFT = 1.8

// A sentence that has not come after this long is given up, so the story never waits on a narrator that has stalled.
// One that stalls before the narrator has ever spoken turns it off until the page is loaded again.
const LATE_MS = 12_000
let spokeOnce = false

// A paragraph being read aloud: `done` settles when the last sentence ends, or at once when stopped, with whether any of
// it was heard. `pause` holds the words where they are and `resume` goes on from there. `progress` is how much of the
// paragraph has been heard, 0 to 1, each piece weighed by its length, so it moves steadily while later ones are still
// being made.
export type Speaking = { done: Promise<boolean>; stop: () => void; pause: () => void; resume: () => void; progress: () => number }

// Reads a paragraph aloud on the voice bus. Null when there is no sound to play it on. `onSentence` is told as each
// sentence is heard, by its place in sentences(text), so what the stage shows keeps time with the words. A speaker's
// gender says their quoted words in the voice for them (voiceFor).
export function speak(text: string, voice: NarratorVoice, onSentence?: (index: number) => void, speaker?: Spoken): Speaking | null {
  const c = audio()
  // A context still waking from the first touch, or held while the tab is hidden, plays the words once it runs.
  if (!c || state !== "ready") return null
  const lines = pieces(text, voice, speaker)
  if (!lines.length) return null
  const made = lines.map((p) => say(p.text, p.voice))
  for (const m of made) m.catch(() => {})
  const total = lines.reduce((n, p) => n + p.text.length, 0)
  // Each piece's place on the paragraph's own clock, which stands still while paused. `base` is when that clock read
  // zero on the context's, and `held` is where it stopped.
  type Piece = { buffer: AudioBuffer; start: number; weight: number; sentence: number; first: boolean; src?: AudioBufferSourceNode }
  const placed: Piece[] = []
  let base = c.currentTime + 0.05
  let held: number | null = null
  const now = () => held ?? c.currentTime - base
  let skipped = 0
  let stopped = false
  let all = false
  let heardAny = false
  let finish = () => {}
  // The ambience dips while the words are heard, and eases back after (engine.ts, DUCK).
  let unduck: (() => void) | null = null
  const heard: ReturnType<typeof setTimeout>[] = []
  const gain = c.createGain()
  gain.gain.value = LIFT
  gain.connect(bus("voice"))
  const silence = (p: Piece) => {
    if (!p.src) return
    p.src.onended = null
    p.src.stop()
    p.src = undefined
  }
  const stop = () => {
    if (stopped) return
    stopped = true
    heard.forEach(clearTimeout)
    placed.forEach(silence)
    gain.disconnect()
    unduck?.()
    finish()
  }
  // The last piece has ended once they are all made and none is left to play.
  const ended = () => {
    if (all && held === null && placed.every((p) => !p.src) && now() >= (placed.at(-1)?.start ?? 0) + (placed.at(-1)?.buffer.duration ?? 0) - 0.01) stop()
  }
  const play = (p: Piece) => {
    const offset = Math.max(0, now() - p.start)
    if (offset >= p.buffer.duration) return
    const src = c.createBufferSource()
    src.buffer = p.buffer
    src.connect(gain)
    src.start(Math.max(c.currentTime, base + p.start), offset)
    src.onended = () => {
      p.src = undefined
      ended()
    }
    p.src = src
    if (!unduck) unduck = duck()
    if (onSentence && p.first && offset === 0) heard.push(setTimeout(() => !stopped && onSentence(p.sentence), Math.max(0, (base + p.start - c.currentTime) * 1000)))
  }
  // Sound turned off mid-sentence holds the context, so the narration would never end: it stops instead.
  const unsound = onSoundSetting((on) => !on && stop())
  const done = new Promise<boolean>((resolve) => {
    finish = () => {
      unsound()
      resolve(heardAny)
    }
    void (async () => {
      let at = 0
      for (const [i, m] of made.entries()) {
        let timer: ReturnType<typeof setTimeout> | undefined
        const late = new Promise<"late">((r) => (timer = setTimeout(() => r("late"), LATE_MS)))
        const clip = await Promise.race([m.catch(() => null), late])
        clearTimeout(timer)
        if (stopped) return
        if (clip === "late") {
          if (!spokeOnce) {
            state = "failed"
            for (const l of listeners) l()
          }
          break
        }
        if (!clip) {
          skipped += lines[i].text.length
          continue
        }
        spokeOnce = true
        heardAny = true
        const buffer = c.createBuffer(1, clip.audio.length, clip.rate)
        buffer.copyToChannel(clip.audio as Float32Array<ArrayBuffer>, 0)
        const p: Piece = { buffer, start: Math.max(at, now()), weight: lines[i].text.length, sentence: lines[i].sentence, first: lines[i - 1]?.sentence !== lines[i].sentence }
        at = p.start + buffer.duration
        placed[i] = p
        if (held === null) play(p)
      }
      all = true
      // Pieces given up leave holes, so the list is closed up before the end is looked for.
      for (let i = placed.length - 1; i >= 0; i--) if (!placed[i]) placed.splice(i, 1)
      if (!heardAny) return stop()
      ended()
    })()
  })
  const pause = () => {
    if (stopped || held !== null) return
    held = Math.max(0, now())
    heard.forEach(clearTimeout)
    heard.length = 0
    placed.forEach(silence)
    unduck?.()
    unduck = null
  }
  const resume = () => {
    if (stopped || held === null) return
    base = c.currentTime + 0.05 - held
    held = null
    for (const p of placed) if (p) play(p)
    ended()
  }
  const progress = () => {
    if (stopped) return heardAny ? 1 : 0
    const t = now()
    let got = skipped
    for (const p of placed) if (p) got += p.weight * Math.min(1, Math.max(0, (t - p.start) / p.buffer.duration))
    return total ? Math.min(1, got / total) : 0
  }
  return { done, stop, pause, resume, progress }
}
