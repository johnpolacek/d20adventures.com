import assert from "node:assert/strict"
import test from "node:test"
import { type CoverCanvasLike, CoverController } from "./use-stage"

function mockCanvas(): CoverCanvasLike & { removed: number } {
  const c = {
    style: { transition: "", opacity: "1" },
    removed: 0,
    remove() {
      c.removed++
    },
  }
  return c
}

test("CoverController transitions none -> holding -> fading -> none and removes canvas cleanly", async () => {
  const ctrl = new CoverController<CoverCanvasLike>(25)
  const kind = () => ctrl.state.kind
  const canvas = mockCanvas()

  assert.equal(kind(), "none")
  assert.equal(ctrl.hasCover, false)

  ctrl.hold(canvas)
  assert.equal(kind(), "holding")
  assert.equal(ctrl.hasCover, true)

  ctrl.lift(true)
  assert.equal(kind(), "fading")
  assert.equal(ctrl.hasCover, false)
  assert.equal(canvas.style.opacity, "0")
  assert.equal(canvas.removed, 0)

  await new Promise((r) => setTimeout(r, 40))
  assert.equal(kind(), "none")
  assert.equal(canvas.removed, 1)
})

test("CoverController cancels fade timer when replaced by hold() or disposed", async () => {
  const ctrl = new CoverController<CoverCanvasLike>(40)
  const kind = () => ctrl.state.kind
  const first = mockCanvas()
  const second = mockCanvas()

  ctrl.hold(first)
  ctrl.lift(true)
  assert.equal(kind(), "fading")

  // Replacing while fading cancels the first timer and removes first immediately
  ctrl.hold(second)
  assert.equal(first.removed, 1)
  assert.equal(kind(), "holding")

  // Dispose removes active cover and cancels any future timer
  ctrl.lift(true)
  ctrl.dispose()
  assert.equal(second.removed, 1)
  assert.equal(kind(), "none")

  // Wait past fadeMs to prove timers did not double-remove
  await new Promise((r) => setTimeout(r, 60))
  assert.equal(first.removed, 1)
  assert.equal(second.removed, 1)
})
