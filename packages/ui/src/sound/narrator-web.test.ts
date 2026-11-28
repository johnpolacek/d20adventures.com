import assert from "node:assert/strict"
import test from "node:test"
import { createBrowserNarrator, type NarratorWorkerLike } from "./narrator-web"

function makeFakeWorker() {
  const posted: unknown[] = []
  let terminated = false
  const worker: NarratorWorkerLike = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: (msg) => {
      posted.push(msg)
    },
    terminate: () => {
      terminated = true
    },
  }
  return {
    worker,
    posted,
    get terminated() {
      return terminated
    },
  }
}

test("createBrowserNarrator transitions to failed and rejects pending say() promises on worker.onerror", async () => {
  const workers: ReturnType<typeof makeFakeWorker>[] = []
  const narrator = createBrowserNarrator({
    createWorker: () => {
      const f = makeFakeWorker()
      workers.push(f)
      return f.worker
    },
    requestAdapter: async () => ({}),
  })

  assert.equal(narrator.state().kind, "idle")

  const loadP = narrator.load()
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(narrator.state().kind, "loading")
  workers[0].worker.onmessage?.({ data: { type: "ready" } } as MessageEvent)
  await loadP
  assert.equal(narrator.state().kind, "ready")

  // Queue two say() calls, then crash the worker via onerror
  const p1 = narrator.say("First line.", "bf_emma")
  const p2 = narrator.say("Second line.", "bf_emma")
  workers[0].worker.onerror?.({ message: "WebGPU device lost" } as ErrorEvent)

  assert.equal(narrator.state().kind, "failed")
  assert.equal(workers[0].terminated, true)
  await assert.rejects(p1, /WebGPU device lost/)
  await assert.rejects(p2, /WebGPU device lost/)

  // Subsequent load() can recover with a fresh worker
  const retryP = narrator.load()
  await new Promise((r) => setTimeout(r, 0))
  workers[1].worker.onmessage?.({ data: { type: "ready" } } as MessageEvent)
  await retryP
  assert.equal(narrator.state().kind, "ready")
})

test("createBrowserNarrator rejects load() and pending calls on onmessageerror", async () => {
  const fake = makeFakeWorker()
  const narrator = createBrowserNarrator({
    createWorker: () => fake.worker,
    requestAdapter: async () => ({}),
  })

  const loadP = narrator.load()
  await new Promise((r) => setTimeout(r, 0))
  fake.worker.onmessageerror?.({} as MessageEvent)

  await assert.rejects(loadP, /deserialization failed/)
  assert.equal(narrator.state().kind, "failed")
  assert.equal(fake.terminated, true)
})
