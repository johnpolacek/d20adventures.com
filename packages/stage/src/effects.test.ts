import assert from "node:assert/strict"
import test from "node:test"
import * as THREE from "three"
import { type EffectEvent, Effects } from "./effects"

function installCanvasStub() {
  const prev = (globalThis as { document?: unknown }).document
  ;(globalThis as { document?: unknown }).document = {
    createElement: () => ({
      width: 64,
      height: 64,
      getContext: () => ({
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createLinearGradient: () => ({ addColorStop: () => {} }),
        fillRect: () => {},
        fillStyle: "",
        globalCompositeOperation: "",
        filter: "",
      }),
    }),
  }
  return () => {
    ;(globalThis as { document?: unknown }).document = prev
  }
}

test("Effects.clear() and dispose() cancel a missile flight without emitting land or spawning burst/impact", async () => {
  const restore = installCanvasStub()
  try {
    const events: EffectEvent[] = []
    const hits: string[] = []
    const fx = new Effects({
      camera: new THREE.PerspectiveCamera(),
      hit: (id) => hits.push(id),
      event: (e) => events.push(e),
    })

    const done = fx.play("bolt", { at: new THREE.Vector3(0, 1, 0) }, { at: new THREE.Vector3(10, 1, 0), id: "target-1" }, "fire")
    assert.equal(events.length, 1)
    assert.equal(events[0].type, "effect")
    assert.equal(events[0].phase, "start")

    // Advance partway through flight, then clear (cancel).
    fx.update(0.1)
    fx.clear()
    await done

    // No land event, no hit flash, and no follow-up burst left in the scene graph (only the shared light).
    assert.equal(events.length, 1)
    assert.deepEqual(hits, [])
    assert.equal(fx.group.children.length, 1)

    // Repeat for arrow + dispose().
    const arrowDone = fx.play("arrow", { at: new THREE.Vector3(0, 1, 0) }, { at: new THREE.Vector3(10, 1, 0), id: "target-2" })
    fx.update(0.05)
    fx.dispose()
    await arrowDone

    assert.equal(events.filter((e) => e.type === "effect" && e.phase === "land").length, 0)
    assert.deepEqual(hits, [])
    assert.equal(fx.group.children.length, 1)
  } finally {
    restore()
  }
})
