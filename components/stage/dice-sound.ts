"use client"

// Dice sounds: a recorded d20 rolling on a table while the die tumbles, cut off when it lands, and a short cue for the
// verdict made in Web Audio. Quiet, and off when the player turns sound off.

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
    void load(context)
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

// Three recorded takes of the roll, played in turn so two rolls in a row do not sound the same. They load on the first
// touch, so the first roll may start a moment late.
const TAKES = [1, 2, 3].map((n) => `/stage/sounds/d20-roll-${n}.mp3`)
// The takes are recorded near full scale. This brings them down to the level of the verdict cues.
const TAKE_LEVEL = 0.5
let takes: Promise<AudioBuffer[]> | null = null
let take = 0

function load(c: AudioContext) {
  if (!takes) {
    takes = Promise.all(TAKES.map((url) => fetch(url).then((r) => r.arrayBuffer()).then((b) => c.decodeAudioData(b))))
    // A failed load tries again on the next roll.
    takes.catch(() => {
      takes = null
    })
  }
  return takes
}

// The die rolls: the next take plays, and the returned function cuts it off when the die lands.
export function rattle() {
  const c = audio()
  if (!c) return () => {}
  const buffer = load(c).then((b) => b[take++ % b.length])
  let playing: { src: AudioBufferSourceNode; gain: GainNode } | null = null
  let stopped = false
  buffer.then(
    (b) => {
      if (stopped) return
      const src = c.createBufferSource()
      src.buffer = b
      const gain = c.createGain()
      gain.gain.value = TAKE_LEVEL
      src.connect(gain).connect(master!)
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
