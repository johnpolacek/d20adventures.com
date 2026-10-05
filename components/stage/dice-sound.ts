"use client"

// Dice sounds, made in Web Audio rather than recorded: a d20 clattering on a wooden table and slowing as it settles, a
// solid tock as it lands, and a short cue for the verdict. Quiet, and off when the player turns sound off.

const KEY = "d20.sound"
let context: AudioContext | null = null
let master: GainNode | null = null
let hiss: AudioBuffer | null = null

export function soundOn() {
  try {
    return localStorage.getItem(KEY) !== "off"
  } catch {
    return true
  }
}
export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off")
  } catch {}
}

function audio() {
  if (!soundOn() || typeof AudioContext === "undefined") return null
  if (!context) {
    context = new AudioContext()
    master = context.createGain()
    master.gain.value = 0.45
    master.connect(context.destination)
  }
  if (context.state === "suspended") void context.resume()
  return context
}
// Browsers start audio only once the player has touched the page, so the first press anywhere wakes it.
if (typeof window !== "undefined") window.addEventListener("pointerdown", () => audio(), { once: true, capture: true })

function noise(c: AudioContext) {
  if (!hiss) {
    hiss = c.createBuffer(1, c.sampleRate, c.sampleRate)
    const d = hiss.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  return hiss
}
// A gain that rises fast to `peak` at `t` and dies away over `decay` seconds.
function envelope(c: AudioContext, t: number, peak: number, decay: number, attack = 0.002) {
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  g.connect(master!)
  return g
}

// One strike of the die: the click of a corner on wood, and the table's short thump under it.
function hit(c: AudioContext, t: number, strength: number, pitch = 1) {
  const src = c.createBufferSource()
  src.buffer = noise(c)
  const band = c.createBiquadFilter()
  band.type = "bandpass"
  band.frequency.value = (1600 + Math.random() * 2800) * pitch
  band.Q.value = 3 + Math.random() * 5
  src.connect(band).connect(envelope(c, t, strength, 0.025 + Math.random() * 0.03))
  src.start(t, Math.random() * 0.8, 0.08)
  const thump = c.createOscillator()
  thump.frequency.setValueAtTime((170 + Math.random() * 110) * pitch, t)
  thump.frequency.exponentialRampToValueAtTime(80 * pitch, t + 0.07)
  thump.connect(envelope(c, t, strength * 0.7, 0.08, 0.003))
  thump.start(t)
  thump.stop(t + 0.12)
}

// The tumble: hits come quick and loud, then further apart and softer, over `seconds`, as the die on screen settles.
export function rattle(seconds = 1.2) {
  const c = audio()
  if (!c) return
  const t0 = c.currentTime + 0.02
  let gap = 0.045
  for (let t = 0; t < seconds - 0.08; t += gap * (0.6 + Math.random() * 0.8), gap *= 1.17) {
    const k = 1 - t / seconds
    hit(c, t0 + t, 0.12 + 0.45 * k * k)
  }
}

// The die comes to rest: one solid tock, and a last small rock on its face.
export function land() {
  const c = audio()
  if (!c) return
  const t = c.currentTime + 0.01
  hit(c, t, 0.55, 0.85)
  hit(c, t + 0.07, 0.12, 1.1)
}

// A short note: a sine with a quieter octave above it, so it rings like a small bell.
function note(c: AudioContext, t: number, freq: number, length: number, peak: number, type: OscillatorType = "sine") {
  for (const [mult, share] of [
    [1, 1],
    [2, 0.25],
  ]) {
    const o = c.createOscillator()
    o.type = type
    o.frequency.value = freq * mult
    o.connect(envelope(c, t, peak * share, length, 0.01))
    o.start(t)
    o.stop(t + length + 0.05)
  }
}

export type Verdict = "success" | "failure" | "critical-success" | "critical-failure"
export function verdict(kind: Verdict) {
  const c = audio()
  if (!c) return
  const t = c.currentTime + 0.02
  if (kind === "success") {
    note(c, t, 392, 0.45, 0.22)
    note(c, t + 0.11, 587.3, 0.7, 0.22)
  } else if (kind === "failure") {
    note(c, t, 220, 0.3, 0.2, "triangle")
    note(c, t + 0.16, 174.6, 0.6, 0.2, "triangle")
  } else if (kind === "critical-success") {
    for (const [i, f] of [523.3, 659.3, 784, 1046.5].entries()) note(c, t + i * 0.075, f, 0.9 - i * 0.1, 0.17)
    // A shimmer over the chord.
    const src = c.createBufferSource()
    src.buffer = noise(c)
    const high = c.createBiquadFilter()
    high.type = "highpass"
    high.frequency.value = 6000
    src.connect(high).connect(envelope(c, t + 0.2, 0.05, 0.9, 0.15))
    src.start(t + 0.2, 0, 1.2)
  } else {
    // A dull thud, and a low, sour fall under it.
    const thud = c.createOscillator()
    thud.frequency.setValueAtTime(90, t)
    thud.frequency.exponentialRampToValueAtTime(38, t + 0.35)
    thud.connect(envelope(c, t, 0.5, 0.4, 0.004))
    thud.start(t)
    thud.stop(t + 0.5)
    note(c, t + 0.05, 146.8, 0.9, 0.1, "triangle")
    note(c, t + 0.05, 207.7, 0.9, 0.08, "triangle")
  }
}
