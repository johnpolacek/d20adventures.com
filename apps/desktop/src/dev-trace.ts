import { bus, current, type Bus } from "@d20/ui/sound/engine"

// Development only, when the dev server starts with VITE_D20_TRACE=1: what can't be heard or watched from outside the
// window goes to apps/desktop/.logs/window.log beside its errors. Each half second, the AudioContext's state and which
// buses are sounding, with their peak in dB, written only when that changes. Each two seconds, the frame rate and the
// longest frame.
export const traceLine = (text: string) => void (import.meta.env.DEV && import.meta.env.VITE_D20_TRACE && send(text))
const send = (text: string) => void fetch("/__d20-log", { method: "POST", body: `${new Date().toISOString()} trace ${text}\n` }).catch(() => undefined)

const BUSES: Bus[] = ["ui", "dice", "fx", "ambience", "voice"]

export function installDevTrace() {
  let tapped: AudioContext | null = null
  const taps = new Map<Bus, AnalyserNode>()
  let last = ""
  setInterval(() => {
    const c = current()
    if (!c) return
    if (tapped !== c) {
      tapped = c
      // WebKit pulls a node only if it reaches the output, so each analyser feeds a silent gain that does.
      const sink = c.createGain()
      sink.gain.value = 0
      sink.connect(c.destination)
      for (const name of BUSES) {
        const a = c.createAnalyser()
        a.fftSize = 2048
        bus(name).connect(a)
        a.connect(sink)
        taps.set(name, a)
      }
    }
    const data = new Float32Array(2048)
    const sounding = BUSES.flatMap((name) => {
      taps.get(name)!.getFloatTimeDomainData(data)
      let peak = 0
      for (const v of data) peak = Math.max(peak, Math.abs(v))
      return peak > 0.0005 ? [`${name} ${Math.round(20 * Math.log10(peak))}dB`] : []
    })
    // Levels move every sample, so a change is a change in which buses sound, or the state.
    const shape = `${c.state} ${sounding.map((s) => s.split(" ")[0]).join(",")}`
    if (shape !== last) send(`sound ${c.state} rate=${c.sampleRate} t=${c.currentTime.toFixed(1)} [${sounding.join(", ")}]`)
    last = shape
  }, 500)

  let frames = 0
  let longest = 0
  let prev = performance.now()
  const tick = (now: number) => {
    frames++
    longest = Math.max(longest, now - prev)
    prev = now
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  setInterval(() => {
    if (document.visibilityState === "visible") send(`frames fps=${Math.round(frames / 2)} longest=${Math.round(longest)}ms`)
    frames = 0
    longest = 0
  }, 2000)
}
