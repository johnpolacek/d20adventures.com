import assert from "node:assert/strict"
import { test } from "node:test"
import { PollPace } from "./poll-pace"

test("PollPace keeps the base pace while busy, then doubles to its cap after two quiet polls", () => {
  const pace = new PollPace(1000, 6000)
  assert.deepEqual([pace.next(false), pace.next(false), pace.next(false), pace.next(false), pace.next(false), pace.next(false)], [1000, 1000, 2000, 4000, 6000, 6000])
  assert.equal(pace.next(true), 1000)
  assert.equal(pace.next(false), 1000)
})

test("PollPace.wake ends the pause at once and resets the pace, and abort answers false", async () => {
  const pace = new PollPace(1000, 60_000)
  for (let i = 0; i < 8; i++) pace.next(false)
  const controller = new AbortController()
  const started = Date.now()
  const waiting = pace.after(false, controller.signal)
  pace.wake()
  assert.equal(await waiting, true)
  assert.ok(Date.now() - started < 500)
  assert.equal(pace.next(false), 1000)
  const aborted = pace.wait(60_000, controller.signal)
  controller.abort()
  assert.equal(await aborted, false)
  assert.equal(await pace.wait(10, controller.signal), false)
})

test("PollPace waits out a hidden page until it is shown again", async () => {
  const listeners = new Map<string, () => void>()
  const doc = {
    visibilityState: "hidden",
    addEventListener: (name: string, fn: () => void) => listeners.set(name, fn),
    removeEventListener: (name: string) => listeners.delete(name),
  }
  const g = globalThis as { document?: unknown }
  g.document = doc
  try {
    const pace = new PollPace(1000, 8000)
    let done = false
    const waiting = pace.wait(5, new AbortController().signal).then((ok) => {
      done = true
      return ok
    })
    await new Promise((r) => setTimeout(r, 30))
    assert.equal(done, false)
    doc.visibilityState = "visible"
    listeners.get("visibilitychange")?.()
    assert.equal(await waiting, true)
    assert.equal(listeners.size, 0)
  } finally {
    delete g.document
  }
})
