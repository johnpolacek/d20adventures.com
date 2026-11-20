"use client"

import { audio, bus, envelope, load, nextTake, noise, onRunning, preload } from "./engine"

// Dice sounds: a recorded d20 rolling on a table while the die tumbles, cut off when it lands, and a short cue for the
// verdict made in Web Audio.

// Three recorded takes of the roll, played in turn so two rolls in a row do not sound the same. They load on the first
// touch, so the first roll may start a moment late.
const TAKES = [1, 2, 3].map((n) => `/stage/sounds/d20-roll-${n}.mp3`)
// The takes are recorded near full scale. This brings them down to the level of the verdict cues.
const TAKE_LEVEL = 0.5
const off = onRunning(() => {
  preload(TAKES)
  off()
})

// The die rolls: the next take plays, and the returned function cuts it off when the die lands.
export function rattle() {
  const c = audio()
  if (!c) return () => {}
  const buffer = load(c, nextTake(TAKES))
  let playing: { src: AudioBufferSourceNode; gain: GainNode } | null = null
  let stopped = false
  buffer.then(
    (b) => {
      if (stopped) return
      const src = c.createBufferSource()
      src.buffer = b
      const gain = c.createGain()
      gain.gain.value = TAKE_LEVEL
      src.connect(gain).connect(bus("dice"))
      src.start()
      playing = { src, gain }
    },
    () => {}
  )
  return () => {
    stopped = true
    if (!playing) return
    // A quick fade, so the cut does not click.
    const t = c.currentTime
    playing.gain.gain.setTargetAtTime(0, t, 0.015)
    playing.src.stop(t + 0.1)
    playing = null
  }
}

// A soft, low thud with no pitch to it: a short fall from `from` Hz, and a breath of low noise under it.
function thud(c: AudioContext, t: number, peak: number, from = 150) {
  const o = c.createOscillator()
  o.frequency.setValueAtTime(from, t)
  o.frequency.exponentialRampToValueAtTime(from * 0.45, t + 0.14)
  o.connect(envelope(c, "dice", t, peak, 0.16, 0.006))
  o.start(t)
  o.stop(t + 0.24)
  const src = c.createBufferSource()
  src.buffer = noise(c)
  const low = c.createBiquadFilter()
  low.type = "lowpass"
  low.frequency.value = 420
  src.connect(low).connect(envelope(c, "dice", t, peak * 0.5, 0.07, 0.004))
  src.start(t, Math.random() * 0.5, 0.12)
}

// The verdict's cue, kept subtle: never a chime. Lower and quieter for a failure, and two for a critical success.
export type Verdict = "success" | "failure" | "critical-success" | "critical-failure"
export function verdict(kind: Verdict) {
  const c = audio()
  if (!c) return
  const t = c.currentTime + 0.02
  if (kind === "success") thud(c, t, 0.3)
  else if (kind === "failure") thud(c, t, 0.22, 110)
  else if (kind === "critical-success") {
    thud(c, t, 0.34)
    thud(c, t + 0.13, 0.26, 190)
  } else thud(c, t, 0.3, 90)
}
