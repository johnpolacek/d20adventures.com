import assert from "node:assert/strict"
import { test } from "node:test"
import { LookControls } from "./look"

function fakeDom() {
  const listeners = new Map<string, Set<(e: unknown) => void>>()
  return {
    addEventListener(type: string, fn: EventListenerOrEventListenerObject) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(fn as (e: unknown) => void)
    },
    removeEventListener(type: string, fn: EventListenerOrEventListenerObject) {
      listeners.get(type)?.delete(fn as (e: unknown) => void)
    },
    emit(type: string, event: Record<string, unknown>) {
      for (const fn of listeners.get(type) ?? []) fn(event)
    },
  }
}

test("LookControls transitions idle -> drag -> pinch -> multi -> pinch without 3->2 finger zoom jump", () => {
  const dom = fakeDom()
  let starts = 0
  const turns: [number, number][] = []
  const zooms: number[] = []
  const controls = new LookControls(dom as never, {
    start: () => starts++,
    turn: (dx, dy) => turns.push([dx, dy]),
    zoom: (f) => zooms.push(f),
  })

  const g = () => controls.gesture
  assert.equal(g().kind, "idle")

  // 1 finger drag
  dom.emit("pointerdown", { pointerId: 1, pointerType: "touch", clientX: 0, clientY: 0 })
  assert.deepEqual(g(), { kind: "drag", pointerId: 1 })
  assert.equal(starts, 1)
  dom.emit("pointermove", { pointerId: 1, clientX: 10, clientY: 5 })
  assert.deepEqual(turns, [[10, 5]])

  // 2nd finger down -> pinch seeded at distance 100
  dom.emit("pointerdown", { pointerId: 2, pointerType: "touch", clientX: 110, clientY: 5 })
  assert.equal(g().kind, "pinch")

  // 3rd finger down at x=500 -> multi (no zoom/turn)
  dom.emit("pointerdown", { pointerId: 3, pointerType: "touch", clientX: 500, clientY: 5 })
  assert.equal(g().kind, "multi")
  dom.emit("pointermove", { pointerId: 3, clientX: 510, clientY: 5 })
  assert.equal(zooms.length, 0)

  // Lift finger 2 -> returns to 2 fingers (1 & 3, distance = 500). Spread must re-seed to 500, not stale 100!
  dom.emit("pointerup", { pointerId: 2 })
  const after = g()
  assert.equal(after.kind, "pinch")
  assert.equal(after.kind === "pinch" && after.spread, 500)

  // Small move by finger 3 (510 -> 510, distance unchanged at 500) -> zoom factor = 1.0, NOT 100/500 = 0.2!
  dom.emit("pointermove", { pointerId: 3, clientX: 510, clientY: 5 })
  assert.equal(zooms.length, 1)
  assert.equal(zooms[0], 1)

  controls.dispose()
  assert.equal(g().kind, "idle")
})
