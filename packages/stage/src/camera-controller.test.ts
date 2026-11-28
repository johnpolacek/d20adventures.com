import assert from "node:assert/strict"
import { test } from "node:test"
import * as THREE from "three"
import { CameraController } from "./camera-controller"

function dummyTransition() {
  return {
    from: { pos: new THREE.Vector3(0, 1, 5), target: new THREE.Vector3(), fov: 45 },
    to: { pos: new THREE.Vector3(2, 1, 4), target: new THREE.Vector3(), fov: 40 },
    start: 0,
    duration: 1000,
    ease: "glide" as const,
  }
}

test("CameraController settles shotSettled() waiters and cancels takeMove on OrbitControls.start", async () => {
  const cam = new CameraController()
  cam.takeMove = { push: 0.1, seconds: 5, start: 0, done: 0 }
  cam.circling = 0.05
  cam.beginGlide(dummyTransition())
  assert.equal(cam.settling, true)

  let settled = false
  const wait = cam.shotSettled().then(() => {
    settled = true
  })

  cam.onOrbitStart()
  await wait
  assert.equal(settled, true)
  assert.equal(cam.motion.kind, "driving")
  assert.equal(cam.takeMove, null)
  assert.equal(cam.circling, 0)
})

test("CameraController settles waiters, finishes cut, and cancels takeMove on LookControls.start", async () => {
  const cam = new CameraController()
  cam.takeMove = { push: 0.12, seconds: 6, start: 0, done: 0 }
  cam.beginCut()
  let settled = false
  let finishedCut = false
  const wait = cam.shotSettled().then(() => {
    settled = true
  })

  cam.onLookStart(() => {
    finishedCut = true
  })
  await wait
  assert.equal(finishedCut, true)
  assert.equal(settled, true)
  assert.equal(cam.motion.kind, "userLook")
  assert.equal(cam.takeMove, null)
})

test("CameraController.dispose() resolves pending shotSettled() waiters cleanly", async () => {
  const cam = new CameraController()
  cam.beginGlide(dummyTransition())
  let settled = false
  const wait = cam.shotSettled().then(() => {
    settled = true
  })
  cam.dispose()
  await wait
  assert.equal(settled, true)
  assert.equal(cam.motion.kind, "idle")
})
