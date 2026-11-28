import assert from "node:assert/strict"
import test from "node:test"
import { type EventSourceLike, TurnStreamController, type TurnStreamState } from "./turn-stream"

function makeFakeSource() {
  let closed = 0
  const source: EventSourceLike = {
    onopen: null,
    onmessage: null,
    onerror: null,
    close() {
      closed++
    },
  }
  return {
    source,
    get closed() {
      return closed
    },
  }
}

test("TurnStreamController closes EventSource before backoff, cancels backoff on reconnect, and reaches exhausted", async () => {
  const created: ReturnType<typeof makeFakeSource>[] = []
  const states: TurnStreamState[] = []
  const messages: string[] = []

  const ctrl = new TurnStreamController({
    createEventSource: () => {
      const f = makeFakeSource()
      created.push(f)
      return f.source
    },
    onMessage: (raw) => messages.push(raw),
    onStateChange: (s) => states.push(s),
    maxAttempts: 2,
    baseDelayMs: 15,
    maxDelayMs: 30,
  })

  ctrl.connect()
  assert.equal(ctrl.state.kind, "connecting")
  assert.equal(created.length, 1)

  // Open + deliver a message
  created[0].source.onopen?.({})
  assert.equal(ctrl.state.kind, "open")
  created[0].source.onmessage?.({ data: '{"ok":true}' })
  assert.deepEqual(messages, ['{"ok":true}'])

  // Error closes the EventSource immediately BEFORE backoff fires
  created[0].source.onerror?.({})
  assert.equal(created[0].closed, 1)
  assert.equal(ctrl.state.kind, "backoff")

  // Wait for retry 1 -> fails -> retry 2 -> fails -> exhausted
  await new Promise((r) => setTimeout(r, 25))
  assert.equal(created.length, 2)
  assert.equal(ctrl.state.kind, "connecting")
  created[1].source.onerror?.({})
  assert.equal(created[1].closed, 1)
  assert.equal(ctrl.state.kind, "backoff")

  await new Promise((r) => setTimeout(r, 45))
  assert.equal(created.length, 3)
  created[2].source.onerror?.({})
  assert.equal(created[2].closed, 1)
  assert.equal(ctrl.state.kind, "exhausted")

  // Tab visibility resets attempts and reconnects cleanly
  ctrl.onVisible()
  assert.equal(ctrl.state.kind, "connecting")
  assert.equal(created.length, 4)

  // Dispose closes active source and cancels timers
  ctrl.dispose()
  assert.equal(created[3].closed, 1)
  assert.equal(ctrl.state.kind, "idle")
})
