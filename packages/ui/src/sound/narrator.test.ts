import assert from "node:assert/strict"
import test from "node:test"
import { createSpeaking, type NarratorClip, type SpeakRuntime } from "./narrator"

function createMockRuntime(
  synthesize: SpeakRuntime["synthesize"],
  opts: { lateMs?: number; stalledMs?: number } = {}
) {
  let time = 10
  let spokenOnce = false
  let stalledCalls = 0
  let duckCount = 0
  const activeSources: Array<{ onended: (() => void) | null; stopped: boolean }> = []

  const context: SpeakRuntime["context"] = {
    get currentTime() {
      return time
    },
    createGain: () =>
      ({
        gain: { value: 1 },
        connect: () => {},
        disconnect: () => {},
      }) as unknown as GainNode,
    createBuffer: (_channels: number, length: number, rate: number) =>
      ({
        duration: length / rate,
        copyToChannel: () => {},
      }) as unknown as AudioBuffer,
    createBufferSource: () => {
      const src = {
        buffer: null as AudioBuffer | null,
        onended: null as (() => void) | null,
        stopped: false,
        connect: () => {},
        start: () => {},
        stop: () => {
          src.stopped = true
        },
      }
      activeSources.push(src)
      return src as unknown as AudioBufferSourceNode
    },
  }

  const runtime: SpeakRuntime = {
    context,
    voiceBus: {} as AudioNode,
    duck: () => {
      duckCount++
      return () => {
        duckCount--
      }
    },
    onSoundOff: () => () => {},
    synthesize,
    hasSpokenOnce: () => spokenOnce,
    markSpoken: () => {
      spokenOnce = true
    },
    onStalled: () => {
      stalledCalls++
    },
    lateMs: opts.lateMs ?? 200,
    stalledMs: opts.stalledMs ?? 200,
  }

  return {
    runtime,
    advanceTime: (dt: number) => {
      time += dt
    },
    get stalledCalls() {
      return stalledCalls
    },
    get duckCount() {
      return duckCount
    },
    activeSources,
  }
}

test("createSpeaking transitions buffering -> playing -> paused -> playing -> stopped cleanly", async () => {
  let resolveClip!: (c: NarratorClip) => void
  const mock = createMockRuntime(
    () =>
      new Promise<NarratorClip>((resolve) => {
        resolveClip = resolve
      })
  )

  const sp = createSpeaking("A torch flickers in the damp corridor.", "bf_emma", mock.runtime)
  assert.ok(sp)
  assert.equal(sp.phase?.().kind, "buffering")

  resolveClip({ audio: new Float32Array(24000), rate: 24000 })
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(sp.phase?.().kind, "playing")
  assert.equal(mock.duckCount, 1)

  sp.pause()
  assert.equal(sp.phase?.().kind, "paused")
  assert.equal(mock.duckCount, 0)

  sp.resume()
  assert.equal(sp.phase?.().kind, "playing")
  assert.equal(mock.duckCount, 1)

  sp.stop()
  assert.equal(sp.phase?.().kind, "stopped")
  assert.equal(mock.duckCount, 0)
  assert.equal(await sp.done, true)
})

test("createSpeaking clears stalled timeout when stop() is called after a late clip", async () => {
  // Never resolves — triggers `late` after 20ms, which schedules `stalledTimer` for 40ms
  const mock = createMockRuntime(() => new Promise<NarratorClip>(() => {}), { lateMs: 20, stalledMs: 40 })

  const sp = createSpeaking("Still waiting for the voice model to wake.", "bf_emma", mock.runtime)
  assert.ok(sp)

  // Wait for `late` to fire -> `done` settles with false and calls `stop()`, which clears `stalledTimer`
  const heard = await sp.done
  assert.equal(heard, false)
  assert.equal(sp.phase?.().kind, "stopped")

  // Wait past stalledMs to prove the cleared stalledTimer never triggers onStalled
  await new Promise((r) => setTimeout(r, 70))
  assert.equal(mock.stalledCalls, 0)
})
