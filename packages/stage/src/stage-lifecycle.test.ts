import assert from "node:assert/strict"
import test from "node:test"
import * as THREE from "three"
import { CardLayer, type CrowdLibrary } from "./figures/cards"
import { createShared } from "./materials/atmosphere"
import { StageLifecycleController } from "./stage-lifecycle"

function mockLibrary(): CrowdLibrary {
  return {
    meta: {
      layer: [64, 64],
      cols: 1,
      rows: 1,
      variants: [
        {
          id: "v0",
          body: 1.7,
          layer: 0,
          uMax: 1,
          vMax: 1,
          aspect: 0.5,
          frac: 0.9,
          back: { layer: 1, uMax: 1, vMax: 1, aspect: 0.5, frac: 0.9 },
        },
      ],
      kinds: {},
    },
    front: { rgb: "front.webp", alpha: "front-a.webp" },
    back: { rgb: "back.webp", alpha: "back-a.webp" },
  }
}

test("StageLifecycleController progresses initializing -> loading -> warming -> active and respects suspend reasons", () => {
  const lc = new StageLifecycleController()
  const kind = () => lc.state.kind

  assert.equal(kind(), "initializing")
  assert.equal(lc.shouldRun, false)
  assert.equal(lc.isReady, false)

  const signal = lc.beginLoad()
  assert.ok(signal)
  assert.equal(signal.aborted, false)
  assert.equal(kind(), "loading")
  assert.equal(lc.shouldRun, false)

  assert.equal(lc.finishLoad(3), true)
  assert.equal(kind(), "warming")
  assert.equal(lc.shouldRun, true)
  assert.equal(lc.isReady, false)

  // Pause mid-warmup preserves remaining warmup frames
  assert.equal(lc.onFrameRendered(), false) // 2 left
  lc.setSuspended("paused", true)
  assert.equal(kind(), "suspended")
  assert.equal(lc.shouldRun, false)
  assert.equal(lc.isReady, false)

  // Multiple suspend reasons require all to clear before resuming
  lc.setSuspended("hidden", true)
  lc.setSuspended("paused", false)
  assert.equal(kind(), "suspended")
  assert.equal(lc.shouldRun, false)

  lc.setSuspended("hidden", false)
  assert.equal(kind(), "warming")
  assert.equal(lc.shouldRun, true)
  assert.equal(lc.onFrameRendered(), false) // 1 left
  assert.equal(lc.onFrameRendered(), true) // 0 left -> active!
  assert.equal(kind(), "active")
  assert.equal(lc.isReady, true)

  // Suspending after active preserves ready = true
  lc.setSuspended("offscreen", true)
  assert.equal(kind(), "suspended")
  assert.equal(lc.shouldRun, false)
  assert.equal(lc.isReady, true)
  lc.setSuspended("offscreen", false)
  assert.equal(kind(), "active")
  assert.equal(lc.shouldRun, true)
})

test("StageLifecycleController aborts in-flight loads on dispose and stays disposed", () => {
  const lc = new StageLifecycleController()
  const signal = lc.beginLoad()
  assert.ok(signal)
  assert.equal(signal.aborted, false)

  lc.dispose()
  assert.equal(lc.state.kind, "disposed")
  assert.equal(signal.aborted, true)
  assert.equal(lc.shouldRun, false)
  assert.equal(lc.finishLoad(), false)
  assert.equal(lc.beginLoad(), null)
  lc.setSuspended("paused", false)
  assert.equal(lc.state.kind, "disposed")
})

test("StageLifecycleController honors suspend reasons recorded before load finishes", () => {
  const lc = new StageLifecycleController()
  lc.setSuspended("hidden", true)
  lc.beginLoad()
  assert.equal(lc.finishLoad(3), true)
  assert.equal(lc.state.kind, "suspended")
  assert.equal(lc.shouldRun, false)

  lc.setSuspended("hidden", false)
  assert.equal(lc.state.kind, "warming")
  assert.equal(lc.shouldRun, true)
})

test("CardLayer transitions idle -> loading -> ready/failed and disposes late aborted textures", async () => {
  const camera = new THREE.PerspectiveCamera()
  const shared = createShared()
  const layer = new CardLayer(mockLibrary(), 4, camera, shared)
  const kind = () => layer.state.kind

  assert.equal(kind(), "idle")
  assert.equal(layer.ready, false)
  assert.equal(layer.loading, false)

  // Failed load transitions to failed (not stuck in loading) and whenReady resolves cleanly
  let rejectLoad!: (e: Error) => void
  const failPromise = layer.load(
    4,
    undefined,
    () =>
      new Promise<THREE.DataArrayTexture | null>((_, reject) => {
        rejectLoad = reject
      })
  )
  assert.equal(kind(), "loading")
  assert.equal(layer.loading, true)
  const waiter = layer.whenReady()
  rejectLoad(new Error("network error"))
  await assert.rejects(failPromise, /network error/)
  await waiter
  assert.equal(kind(), "failed")
  assert.equal(layer.loading, false)
  assert.equal(layer.ready, false)

  // Aborted load disposes late texture and never sets ready or uAtlas
  const ac = new AbortController()
  let disposed = false
  let resolveLate!: (tex: THREE.DataArrayTexture | null) => void
  const lateTex = new THREE.DataArrayTexture(new Uint8Array(4), 1, 1, 1)
  const origDispose = lateTex.dispose.bind(lateTex)
  lateTex.dispose = () => {
    disposed = true
    origDispose()
  }
  const abortPromise = layer.load(
    4,
    ac.signal,
    () =>
      new Promise<THREE.DataArrayTexture | null>((resolve) => {
        resolveLate = resolve
      })
  )
  ac.abort()
  resolveLate(lateTex)
  await abortPromise
  assert.equal(disposed, true)
  assert.equal(layer.ready, false)
  assert.equal(layer.uniforms.uAtlas.value, null)

  // Successful load transitions to ready and binds uAtlas
  const goodTex = new THREE.DataArrayTexture(new Uint8Array(4), 1, 1, 1)
  await layer.load(4, undefined, async () => goodTex)
  assert.equal(kind(), "ready")
  assert.equal(layer.ready, true)
  assert.equal(layer.uniforms.uAtlas.value, goodTex)

  layer.dispose()
})
