import assert from "node:assert/strict"
import test from "node:test"
import { AmbienceController, type AmbienceRuntime } from "./ambience"

function createMockAmbienceRuntime(loadImpl: AmbienceRuntime["load"]) {
  let disconnected = 0
  const ctx = {
    state: "running",
    currentTime: 5,
    createGain: () => {
      const node = {
        gain: {
          value: 0,
          setValueAtTime: () => {},
          linearRampToValueAtTime: () => {},
          cancelScheduledValues: () => {},
          setTargetAtTime: () => {},
        },
        connect: () => node,
        disconnect: () => {
          disconnected++
        },
      }
      return node as unknown as GainNode
    },
    createBufferSource: () => {
      const src = {
        buffer: null as AudioBuffer | null,
        onended: null as (() => void) | null,
        connect: (target: unknown) => target,
        start: () => {},
        stop: () => {},
      }
      return src as unknown as AudioBufferSourceNode
    },
  } as unknown as AudioContext

  const runtime: AmbienceRuntime = {
    audio: () => ctx,
    current: () => ctx,
    bus: () => ({}) as AudioNode,
    load: loadImpl,
    soundOn: () => true,
    tickMs: 50,
    fadeSeconds: 0.02,
    quietMs: 20,
  }

  return {
    runtime,
    get disconnected() {
      return disconnected
    },
  }
}

test("AmbienceController tracks per-bed status loading -> playing -> fading -> disposed and stops interval when idle", async () => {
  let resolveBuffer!: (b: AudioBuffer) => void
  const mock = createMockAmbienceRuntime(
    () =>
      new Promise<AudioBuffer>((resolve) => {
        resolveBuffer = resolve
      })
  )
  const ctrl = new AmbienceController(mock.runtime)

  assert.equal(ctrl.hasTimer, false)
  ctrl.setBeds(["rain"])
  assert.equal(ctrl.activeBeds.length, 1)
  const bed = ctrl.activeBeds[0]
  assert.equal(bed.status, "loading")
  assert.equal(ctrl.hasTimer, true)

  resolveBuffer({ duration: 10 } as AudioBuffer)
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(bed.status, "playing")

  // Clearing beds fades the bed out and clears the polling timer once activeBeds is empty
  ctrl.setBeds([])
  await new Promise((r) => setTimeout(r, 40))
  assert.equal(ctrl.activeBeds.length, 0)
  assert.equal(ctrl.hasTimer, false)
  assert.ok(bed.status === "fading" || bed.status === "disposed")

  // Wait past fadeSeconds + 200ms disconnect timeout
  await new Promise((r) => setTimeout(r, 250))
  assert.equal(bed.status, "disposed")
  assert.equal(mock.disconnected, 1)
})

test("AmbienceController stops timer and disposes bed if audio load fails", async () => {
  const mock = createMockAmbienceRuntime(async () => {
    throw new Error("404")
  })
  const ctrl = new AmbienceController(mock.runtime)

  ctrl.setBeds(["wind"])
  await new Promise((r) => setTimeout(r, 10))

  assert.equal(ctrl.activeBeds.length, 0)
  assert.equal(ctrl.hasTimer, false)
  assert.equal(mock.disconnected, 1)
})
