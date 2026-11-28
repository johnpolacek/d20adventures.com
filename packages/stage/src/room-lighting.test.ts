import assert from "node:assert/strict"
import test from "node:test"
import { type AtmosphereSpec, RoomLightingController } from "./room-lighting"

const mockAtmosphere = {
  hemisphere: { sky: "#ffffff", ground: "#888888", intensity: 1.0 },
  environment: 1.0,
  fill: { color: "#ffffff", intensity: 0.5, distance: 10 },
  exposure: 1.0,
  lights: [{ at: [0, 5, 0] as [number, number, number], color: "#ffeecc", intensity: 2, distance: 12, decay: 2 }],
} as unknown as AtmosphereSpec

const roomA = {
  box: [0, 0, 0, 5, 4, 5] as [number, number, number, number, number, number],
  ambient: 0.4,
  fill: 0.2,
  exposure: 0.8,
  lights: [{ at: [2, 3, 2] as [number, number, number], color: "#ffaa44", intensity: 5, distance: 10, decay: 2 }],
}

const roomB = {
  box: [5, 0, 0, 10, 4, 5] as [number, number, number, number, number, number],
  ambient: 0.1,
  fill: 0.05,
  exposure: 1.2,
  lights: [{ at: [8, 3, 2] as [number, number, number], color: "#44aaff", intensity: 8, distance: 10, decay: 2 }],
}

test("RoomLightingController crossfades smoothly from room A directly into room B without snapping", () => {
  const ctrl = new RoomLightingController(mockAtmosphere)
  const state = () => ctrl.state

  // Start settled outdoors -> no-op
  assert.equal(ctrl.step(null, 0.1, true), null)
  assert.equal(state().kind, "outdoors")

  // Enter room A with motion off -> settles immediately
  const enteredA = ctrl.step(roomA, 0.016, false)
  assert.ok(enteredA)
  assert.equal(state().kind, "indoors")
  assert.equal(enteredA.lights, roomA.lights)
  assert.equal(enteredA.lightScale, 1)
  assert.equal(enteredA.exposure, 0.8)

  // Settled in room A -> no-op
  assert.equal(ctrl.step(roomA, 0.1, true), null)

  // Walk directly from room A into room B with motion on!
  // Step 1 (dt = 0.1 -> progress = 0.3): room A's lamps dim out smoothly (scale = 0.4), exposure interpolates 0.8 -> 1.2
  const s1 = ctrl.step(roomB, 0.1, true)
  assert.ok(s1)
  assert.equal(state().kind, "transition")
  assert.equal(s1.lights, roomA.lights)
  assert.ok(Math.abs(s1.lightScale - 0.4) < 1e-6)
  assert.ok(Math.abs(s1.exposure - (0.8 + 0.4 * 0.3)) < 1e-6)

  // Step 2 (dt = 0.1 -> progress = 0.6): room B's lamps fade up smoothly (scale = 0.2)
  const s2 = ctrl.step(roomB, 0.1, true)
  assert.ok(s2)
  assert.equal(state().kind, "transition")
  assert.equal(s2.lights, roomB.lights)
  assert.ok(Math.abs(s2.lightScale - 0.2) < 1e-6)

  // Step 3 (dt = 0.2 -> progress = 1.0): settles into indoors(roomB)
  const s3 = ctrl.step(roomB, 0.2, true)
  assert.ok(s3)
  assert.equal(state().kind, "indoors")
  assert.equal(s3.lights, roomB.lights)
  assert.equal(s3.lightScale, 1)
  assert.equal(s3.exposure, 1.2)
  assert.equal(ctrl.step(roomB, 0.1, true), null)
})

test("RoomLightingController reverses smoothly mid-transition without brightness jump", () => {
  const ctrl = new RoomLightingController(mockAtmosphere)
  const kind = () => ctrl.state.kind

  // Outdoors -> room A to progress 0.3 (outdoors lamps at 0.4)
  const s1 = ctrl.step(roomA, 0.1, true)
  assert.ok(s1)
  assert.equal(s1.lights, mockAtmosphere.lights)
  assert.ok(Math.abs(s1.lightScale - 0.4) < 1e-6)

  // Immediately step back outdoors: progress reverses to 0.7 + 0.05*3 = 0.85
  const s2 = ctrl.step(null, 0.05, true)
  assert.ok(s2)
  assert.equal(kind(), "transition")
  assert.equal(s2.lights, mockAtmosphere.lights)
  // At reversed progress 0.7 + 0.15 = 0.85, outdoors lamps rise smoothly from 0.4 -> 0.7!
  assert.ok(Math.abs(s2.lightScale - 0.7) < 1e-6)

  const s3 = ctrl.step(null, 0.1, true)
  assert.ok(s3)
  assert.equal(kind(), "outdoors")
  assert.equal(s3.lightScale, 1)
})
