"use client"

import type { AmbienceBed } from "@d20/stage"
import { audio, bus, current, load, onRunning } from "./engine"
import { soundOn } from "./settings"

// The set's ambience: up to three beds looping under everything, low. Each bed loops by starting its next pass before
// the last ends, faded across, so no seam or encoder gap is heard. A new set fades the old beds out and its own in.

// Each bed's level under the ambience bus. The files share one level (scripts/sound-assets.ts): a crowd stays further
// back than wind, so voices in it never read as words.
const BEDS: Record<AmbienceBed, number> = {
  hearth: 0.11,
  crowd: 0.07,
  wind: 0.1,
  night: 0.08,
  birds: 0.09,
  river: 0.1,
  dawn: 0.09,
  dungeon: 0.11,
  drip: 0.1,
  rain: 0.09,
  "roof-rain": 0.09,
  storm: 0.1,
}
const url = (bed: AmbienceBed) => `/stage/sounds/ambience/${bed}.mp3`
const CROSS = 2.5
const FADE = 1.6

type Playing = { bed: AmbienceBed; gain: GainNode; next: number; sources: AudioBufferSourceNode[]; buffer: AudioBuffer | null; gone: boolean }
let playing: Playing[] = []
let wanted: AmbienceBed[] = []
let timer: ReturnType<typeof setInterval> | null = null

// Starts passes that begin within the next two seconds. Runs only while the context runs, so a suspended context
// schedules nothing and picks up where it is when it wakes.
function tick() {
  const c = current()
  if (!c || c.state !== "running") return
  for (const p of playing) {
    if (p.gone || !p.buffer) continue
    if (p.next < c.currentTime) p.next = c.currentTime + 0.05
    while (p.next < c.currentTime + 2) {
      const src = c.createBufferSource()
      src.buffer = p.buffer
      const g = c.createGain()
      const t = p.next
      const d = p.buffer.duration
      const x = Math.min(CROSS, d / 3)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(1, t + x)
      g.gain.setValueAtTime(1, t + d - x)
      g.gain.linearRampToValueAtTime(0, t + d)
      src.connect(g).connect(p.gain)
      src.start(t)
      src.stop(t + d + 0.05)
      p.sources.push(src)
      src.onended = () => {
        p.sources = p.sources.filter((s) => s !== src)
      }
      p.next = t + d - x
    }
  }
}

async function begin(bed: AmbienceBed) {
  const c = audio()
  if (!c) return
  const gain = c.createGain()
  gain.gain.setValueAtTime(0, c.currentTime)
  gain.gain.linearRampToValueAtTime(BEDS[bed], c.currentTime + FADE)
  gain.connect(bus("ambience"))
  const p: Playing = { bed, gain, next: 0, sources: [], buffer: null, gone: false }
  playing.push(p)
  p.buffer = await load(c, url(bed)).catch(() => null)
  tick()
}
function end(p: Playing) {
  p.gone = true
  const c = current()
  if (!c) return
  const t = c.currentTime
  p.gain.gain.cancelScheduledValues(t)
  p.gain.gain.setValueAtTime(p.gain.gain.value, t)
  p.gain.gain.linearRampToValueAtTime(0, t + FADE)
  for (const s of p.sources) s.stop(t + FADE + 0.05)
  setTimeout(() => p.gain.disconnect(), (FADE + 0.2) * 1000)
}

// Acts only on a running context: before the first touch, or with sound off, the beds wait for onRunning.
function apply() {
  const c = current()
  if (!c || c.state !== "running" || !soundOn()) return
  for (const p of playing) if (!p.gone && !wanted.includes(p.bed)) end(p)
  playing = playing.filter((p) => !p.gone)
  for (const bed of wanted) if (!playing.some((p) => p.bed === bed)) void begin(bed)
  timer ??= setInterval(tick, 500)
}
// Before the first touch the context cannot start: the beds start when it does.
onRunning(apply)

// The beds to play now. An empty list fades them all out, after a moment: when the next set follows soon enough, beds
// the two share play on.
let quiet: ReturnType<typeof setTimeout> | null = null
export function setAmbience(beds: readonly AmbienceBed[]) {
  if (quiet) clearTimeout(quiet)
  quiet = null
  const next = beds.filter((b) => b in BEDS).slice(0, 3)
  if (next.length) {
    wanted = next
    return apply()
  }
  quiet = setTimeout(() => {
    wanted = []
    apply()
  }, 1500)
}
