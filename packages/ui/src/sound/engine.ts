"use client"

import { served } from "@d20/stage/served"
import { onSoundSetting, soundOn } from "./settings"

// One AudioContext for every game sound, and a bus for each kind so each has its own level. Quiet by design: the
// master sits well under full scale, and each bus under that.
//
// Browsers start audio only once the player has touched the page, so the first press anywhere wakes it. Turning sound
// off, or leaving the tab, suspends the context: nothing plays and loops hold where they are.

export type Bus = "ui" | "dice" | "fx" | "ambience" | "voice"
const MASTER = 0.45
const LEVELS: Record<Bus, number> = { ui: 1, dice: 1, fx: 1, ambience: 1, voice: 1 }

let context: AudioContext | null = null
let master: GainNode | null = null
const buses = new Map<Bus, GainNode>()
const running = new Set<() => void>()

function create() {
  const c = new AudioContext()
  master = c.createGain()
  master.gain.value = MASTER
  master.connect(c.destination)
  for (const [name, level] of Object.entries(LEVELS) as [Bus, number][]) {
    const g = c.createGain()
    g.gain.value = level
    g.connect(master)
    buses.set(name, g)
  }
  c.onstatechange = () => {
    if (c.state === "running") for (const l of running) l()
  }
  return c
}
const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden"

// The context, woken if it slept, or null when sound is off or the browser has none.
export function audio(): AudioContext | null {
  if (!soundOn() || typeof AudioContext === "undefined") return null
  if (!context) {
    context = create()
    flush(context)
  }
  if (context.state === "suspended" && !hidden()) void context.resume()
  return context
}
// The context as it is, without waking it: for loops that wait for it to run.
export const current = () => context
export function bus(name: Bus): AudioNode {
  return buses.get(name)!
}
// Called each time the context starts running: after the first touch, sound turned back on, or the tab shown again.
export function onRunning(listener: () => void) {
  running.add(listener)
  return () => void running.delete(listener)
}

if (typeof window !== "undefined") {
  const wake = () => audio()
  window.addEventListener("pointerdown", wake, { once: true, capture: true })
  window.addEventListener("keydown", wake, { once: true, capture: true })
  document.addEventListener("visibilitychange", () => {
    if (!context) return
    if (hidden()) void context.suspend()
    else if (soundOn()) void context.resume()
  })
  onSoundSetting((on) => {
    if (!on) void context?.suspend()
    else audio()
  })
}

// ── Ducking ──
// The ambience dips under the narrator and comes back after the last words. Each hold is one voice speaking: the bed
// dips when the first begins and rises only once none has spoken for HOLD, so the gaps between sentences and between
// paragraphs ride through without the bed pumping. Tune these by ear on /dev/sound.
export const DUCK = {
  // The ambience's level under the voice, of its own: 0.5 is about 6 dB down.
  depth: 0.5,
  // Seconds to settle down, from the first words.
  dip: 0.8,
  // Seconds of quiet after the last words before the bed rises.
  hold: 1.5,
  // Seconds to settle back up.
  ramp: 2.5,
}
let holds = 0
let rising: ReturnType<typeof setTimeout> | null = null
// Glides the ambience bus to `to`, reaching most of the way in `seconds`, from wherever it is now.
function glide(to: number, seconds: number) {
  const c = context
  const g = buses.get("ambience")?.gain
  if (!c || !g) return
  const t = c.currentTime
  if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t)
  else {
    g.cancelScheduledValues(t)
    g.setValueAtTime(g.value, t)
  }
  g.setTargetAtTime(to, t, seconds / 3)
}
// Holds the ambience down while a voice speaks. Call the returned release when it stops: more than once is harmless.
export function duck(): () => void {
  if (rising) clearTimeout(rising)
  rising = null
  if (holds++ === 0) glide(LEVELS.ambience * DUCK.depth, DUCK.dip)
  let held = true
  return () => {
    if (!held) return
    held = false
    if (--holds > 0) return
    rising = setTimeout(() => {
      rising = null
      if (holds === 0) glide(LEVELS.ambience, DUCK.ramp)
    }, DUCK.hold * 1000)
  }
}

// ── Files ──
const buffers = new Map<string, Promise<AudioBuffer>>()
// A decoded file, fetched once. A failed load tries again next time.
export function load(c: AudioContext, url: string) {
  let b = buffers.get(url)
  if (!b) {
    b = fetch(served(url))
      .then((r) => {
        if (!r.ok) throw new Error(`${url}: ${r.status}`)
        return r.arrayBuffer()
      })
      .then((data) => c.decodeAudioData(data))
    b.catch(() => buffers.delete(url))
    buffers.set(url, b)
  }
  return b
}

// Takes of one cue, played in turn so a sound heard twice in a row is not the same.
const turns = new Map<string, number>()
export function nextTake(urls: string[]) {
  const key = urls[0]
  const n = turns.get(key) ?? Math.floor(Math.random() * urls.length)
  turns.set(key, n + 1)
  return urls[n % urls.length]
}

// ── Crowding ──
// A busy moment, a volley or a fireball on five, must not stack into one loud smear. Each bus has a cap on the sounds
// sounding at once, and a sound past it is skipped. The same cue fired twice in a moment is staggered a little rather
// than stacked, and one that would have to wait too long is dropped. A sound too quiet to hear takes no voice.
// After Brushwild's audio (kevintngo/procedural-rpg, MIT).
const VOICES: Record<Bus, number> = { ui: 8, dice: 12, fx: 16, ambience: 8, voice: 4 }
// Seconds kept between two starts of one cue, and the longest a repeat may wait for its turn.
const REPEAT_GAP = 0.035
const MAX_STAGGER = 0.12
const QUIET = 0.0004
const sounding = new Map<Bus, number>()
const nextFree = new Map<string, number>()
// A voice on a bus, or null when the bus is full. Call the release when the sound ends.
function voice(to: Bus): (() => void) | null {
  const n = sounding.get(to) ?? 0
  if (n >= VOICES[to]) return null
  sounding.set(to, n + 1)
  let held = true
  return () => {
    if (!held) return
    held = false
    sounding.set(to, Math.max(0, (sounding.get(to) ?? 1) - 1))
  }
}
// Seconds a cue keyed `key` should wait so it does not land on itself, or null to drop it.
function stagger(c: AudioContext, key: string, delay: number): number | null {
  const at = c.currentTime + delay
  const wait = Math.max(0, (nextFree.get(key) ?? 0) - at)
  if (wait > MAX_STAGGER) return null
  nextFree.set(key, at + wait + REPEAT_GAP)
  return wait
}
// Holds a voice for a made sound that ends near `end` on the context's clock.
function hold(c: AudioContext, to: Bus, peak: number, end: number) {
  if (!(peak > QUIET)) return false
  const release = voice(to)
  if (!release) return false
  setTimeout(release, Math.max(0, end - c.currentTime) * 1000 + 50)
  return true
}

export interface PlayOptions {
  gain?: number
  // Seconds from now.
  delay?: number
  // Playback rate: a little off 1 varies a take. `vary` picks one at random within that much either side.
  rate?: number
  vary?: number
  // A lowpass in Hz, to soften or push a sound back.
  muffle?: number
}
// One take of a cue on a bus. Resolves when it has started, or not at all if it could not load.
export async function play(urls: string[], to: Bus, o: PlayOptions = {}) {
  const c = audio()
  if (!c) return
  const gain = o.gain ?? 1
  if (!(gain > QUIET)) return
  const buffer = await load(c, nextTake(urls)).catch(() => null)
  if (!buffer || c.state !== "running") return
  const wait = stagger(c, urls[0], o.delay ?? 0)
  if (wait === null) return
  const release = voice(to)
  if (!release) return
  const src = c.createBufferSource()
  src.onended = release
  src.buffer = buffer
  src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() * 2 - 1) * (o.vary ?? 0.04))
  const g = c.createGain()
  g.gain.value = gain
  let tail: AudioNode = g
  if (o.muffle) {
    const low = c.createBiquadFilter()
    low.type = "lowpass"
    low.frequency.value = o.muffle
    g.connect(low)
    tail = low
  }
  src.connect(g)
  tail.connect(bus(to))
  src.start(c.currentTime + (o.delay ?? 0) + wait)
}
// Starts loading files the player is about to hear, so the first one is not late. Before the first touch there is no
// context to decode with, so they wait for it.
const waiting = new Set<string>()
export function preload(urls: string[]) {
  for (const u of urls) waiting.add(u)
  if (context) flush(context)
}
function flush(c: AudioContext) {
  for (const u of waiting) void load(c, u).catch(() => {})
  waiting.clear()
}

// ── Made sounds ──
let hiss: AudioBuffer | null = null
// A second of white noise, made once.
export function noise(c: AudioContext) {
  if (!hiss) {
    hiss = c.createBuffer(1, c.sampleRate, c.sampleRate)
    const d = hiss.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  return hiss
}
// A gain that rises to `peak` at `t` over `attack` and dies away over `decay` seconds, into a bus.
export function envelope(c: AudioContext, to: Bus, t: number, peak: number, decay: number, attack = 0.002) {
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  g.connect(bus(to))
  return g
}
// A low thump: a tone that drops from `from` to `to` Hz as it dies away, as a weight coming down does. Far below any
// note and gone in a fifth of a second, so it is felt as weight and never heard as a chime.
export function thump(c: AudioContext, to: Bus, t: number, o: { peak: number; from: number; to: number; length: number }) {
  if (!hold(c, to, o.peak, t + o.length + 0.05)) return
  const osc = c.createOscillator()
  osc.type = "sine"
  osc.frequency.setValueAtTime(o.from, t)
  osc.frequency.exponentialRampToValueAtTime(o.to, t + o.length)
  osc.connect(envelope(c, to, t, o.peak, o.length, 0.006))
  osc.start(t)
  osc.stop(t + o.length + 0.05)
}
// Noise through a band that slides from `from` to `to` Hz: air moving. No pitch, so never a chime.
export function whoosh(c: AudioContext, to: Bus, t: number, o: { peak: number; from: number; to: number; length: number; attack?: number; q?: number }) {
  if (!hold(c, to, o.peak, t + o.length + 0.05)) return
  const src = c.createBufferSource()
  src.buffer = noise(c)
  const band = c.createBiquadFilter()
  band.type = "bandpass"
  band.Q.value = o.q ?? 1.2
  band.frequency.setValueAtTime(o.from, t)
  band.frequency.exponentialRampToValueAtTime(o.to, t + o.length)
  const attack = o.attack ?? o.length * 0.35
  src.connect(band).connect(envelope(c, to, t, o.peak, o.length - attack, attack))
  src.start(t, Math.random() * 0.4, o.length + 0.05)
}
