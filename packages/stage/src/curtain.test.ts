import assert from "node:assert/strict"
import { test } from "node:test"
import { ScreenCurtain } from "./curtain"

function makeCanvas() {
  return { style: { opacity: "1", transition: "" } }
}

test("ScreenCurtain coordinates cut and dip without lifting opacity prematurely", async () => {
  const canvas = makeCanvas()
  const curtain = new ScreenCurtain(canvas, { fadeMs: 10, darkWaitMs: 15, liftWaitMs: 25 })
  assert.equal(curtain.phase, "lit")

  let arrived = 0
  curtain.beginCut(() => {
    arrived++
  })
  assert.equal(curtain.phase, "fadingToDark")
  assert.equal(canvas.style.opacity, "0")

  // Start a dip while cut is in progress.
  const dipped = curtain.dip()

  // Wait for cut + dip to reach dark.
  await new Promise((r) => setTimeout(r, 25))
  assert.equal(arrived, 1)
  assert.equal(await dipped, true)
  // Dip lift timer is still holding it dark, so opacity stays "0".
  assert.equal(canvas.style.opacity, "0")

  // After dip lift timer finishes, curtain lifts back to "lit".
  await new Promise((r) => setTimeout(r, 35))
  assert.equal(curtain.phase, "lit")
  assert.equal(canvas.style.opacity, "1")
})

test("ScreenCurtain.finishCut() invokes callback synchronously and dispose() cancels timers/promises", async () => {
  const canvas = makeCanvas()
  const curtain = new ScreenCurtain(canvas, { fadeMs: 10, darkWaitMs: 50, liftWaitMs: 50 })

  let arrived = 0
  curtain.beginCut(() => {
    arrived++
  })
  assert.equal(curtain.finishCut(), true)
  assert.equal(arrived, 1)
  assert.equal(curtain.phase, "lit")

  // Dispose mid-dip resolves false and cancels late callbacks.
  let lateCut = 0
  curtain.beginCut(() => {
    lateCut++
  })
  const dipPromise = curtain.dip()
  curtain.dispose()
  assert.equal(curtain.phase, "disposed")
  assert.equal(await dipPromise, false)
  await new Promise((r) => setTimeout(r, 70))
  assert.equal(lateCut, 0)
})
