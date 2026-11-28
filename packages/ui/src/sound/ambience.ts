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
  hull: 0.1,
}
const url = (bed: AmbienceBed) => `/stage/sounds/ambience/${bed}.mp3`
const CROSS = 2.5
const FADE = 1.6

export type BedStatus = "loading" | "playing" | "fading" | "disposed"

export interface PlayingBed {
  bed: AmbienceBed
  status: BedStatus
  gain: GainNode
  next: number
  sources: AudioBufferSourceNode[]
  buffer: AudioBuffer | null
}

export interface AmbienceRuntime {
  audio: () => AudioContext | null
  current: () => AudioContext | null
  bus: () => AudioNode
  load: (c: AudioContext, url: string) => Promise<AudioBuffer>
  soundOn: () => boolean
  tickMs?: number
  fadeSeconds?: number
  quietMs?: number
}

export class AmbienceController {
  private playing: PlayingBed[] = []
  private wanted: AmbienceBed[] = []
  private mix: Partial<Record<AmbienceBed, number>> = {}
  private timer: ReturnType<typeof setInterval> | null = null
  private quiet: ReturnType<typeof setTimeout> | null = null
  private readonly tickMs: number
  private readonly fadeSeconds: number
  private readonly quietMs: number

  constructor(private readonly runtime: AmbienceRuntime) {
    this.tickMs = runtime.tickMs ?? 500
    this.fadeSeconds = runtime.fadeSeconds ?? FADE
    this.quietMs = runtime.quietMs ?? 1500
  }

  get activeBeds(): readonly PlayingBed[] {
    return this.playing
  }

  get hasTimer(): boolean {
    return this.timer !== null
  }

  private level(bed: AmbienceBed): number {
    return BEDS[bed] * (this.mix[bed] ?? 1)
  }

  private syncTimer(): void {
    if (this.playing.length > 0 && this.timer === null) {
      this.timer = setInterval(() => this.tick(), this.tickMs)
    } else if (this.playing.length === 0 && this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  // Starts passes that begin within the next two seconds. Runs only while the context runs, so a suspended context
  // schedules nothing and picks up where it is when it wakes.
  tick(): void {
    const c = this.runtime.current()
    if (!c || c.state !== "running") return
    for (const p of this.playing) {
      if (p.status !== "playing" || !p.buffer) continue
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

  private async begin(bed: AmbienceBed): Promise<void> {
    const c = this.runtime.audio()
    if (!c) return
    const gain = c.createGain()
    gain.gain.setValueAtTime(0, c.currentTime)
    gain.gain.linearRampToValueAtTime(this.level(bed), c.currentTime + this.fadeSeconds)
    gain.connect(this.runtime.bus())
    const p: PlayingBed = { bed, status: "loading", gain, next: 0, sources: [], buffer: null }
    this.playing.push(p)
    this.syncTimer()
    const buffer = await this.runtime.load(c, url(bed)).catch(() => null)
    if (p.status !== "loading") return
    if (!buffer) {
      p.status = "disposed"
      p.gain.disconnect()
      this.playing = this.playing.filter((item) => item !== p)
      this.syncTimer()
      return
    }
    p.buffer = buffer
    p.status = "playing"
    this.tick()
  }

  private end(p: PlayingBed): void {
    if (p.status === "fading" || p.status === "disposed") return
    p.status = "fading"
    const c = this.runtime.current()
    if (!c) {
      p.status = "disposed"
      p.gain.disconnect()
      return
    }
    const t = c.currentTime
    p.gain.gain.cancelScheduledValues(t)
    p.gain.gain.setValueAtTime(p.gain.gain.value, t)
    p.gain.gain.linearRampToValueAtTime(0, t + this.fadeSeconds)
    for (const s of p.sources) s.stop(t + this.fadeSeconds + 0.05)
    setTimeout(() => {
      p.status = "disposed"
      p.gain.disconnect()
    }, (this.fadeSeconds + 0.2) * 1000)
  }

  // Acts only on a running context: before the first touch, or with sound off, the beds wait for onRunning.
  apply(): void {
    const c = this.runtime.current()
    if (!c || c.state !== "running" || !this.runtime.soundOn()) return
    for (const p of this.playing) {
      if ((p.status === "loading" || p.status === "playing") && !this.wanted.includes(p.bed)) {
        this.end(p)
      }
    }
    this.playing = this.playing.filter((p) => p.status === "loading" || p.status === "playing")
    for (const bed of this.wanted) {
      if (!this.playing.some((p) => p.bed === bed)) void this.begin(bed)
    }
    this.syncTimer()
  }

  // Turns beds up or down from their levels, as where the camera stands changes: a few seconds to settle, so a camera
  // that sweeps past the water is not heard lurching.
  setMix(next: Partial<Record<AmbienceBed, number>>): void {
    this.mix = next
    const c = this.runtime.current()
    if (!c) return
    for (const p of this.playing) {
      if (p.status === "loading" || p.status === "playing") {
        p.gain.gain.setTargetAtTime(this.level(p.bed), c.currentTime + this.fadeSeconds, 0.8)
      }
    }
  }

  // The beds to play now. An empty list fades them all out, after a moment: when the next set follows soon enough, beds
  // the two share play on.
  setBeds(beds: readonly AmbienceBed[]): void {
    if (this.quiet) clearTimeout(this.quiet)
    this.quiet = null
    const next = beds.filter((b) => b in BEDS).slice(0, 3)
    if (next.length) {
      this.wanted = next
      return this.apply()
    }
    this.quiet = setTimeout(() => {
      this.quiet = null
      this.wanted = []
      this.apply()
    }, this.quietMs)
  }
}

const controller = new AmbienceController({
  audio,
  current,
  bus: () => bus("ambience"),
  load,
  soundOn,
})

// Before the first touch the context cannot start: the beds start when it does.
onRunning(() => controller.apply())

export function setAmbienceMix(next: Partial<Record<AmbienceBed, number>>) {
  controller.setMix(next)
}

export function setAmbience(beds: readonly AmbienceBed[]) {
  controller.setBeds(beds)
}
