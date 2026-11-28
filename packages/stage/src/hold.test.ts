import assert from "node:assert/strict"
import test from "node:test"
import * as THREE from "three"
import { wield } from "./figures/hold"

function makeMixamoRig() {
  const root = new THREE.Group()
  const bone = (name: string, x: number, y: number, z: number, parent: THREE.Object3D = root) => {
    const b = new THREE.Bone()
    b.name = name
    b.position.set(x, y, z)
    parent.add(b)
    return b
  }

  bone("Hips", 0, 1.0, 0)
  bone("Spine2", 0, 1.4, 0)

  const leftHand = bone("LeftHand", 0.3, 1.0, 0.1)
  // Rotate wrist at rest so `seated` differs from upright aimed orientation
  leftHand.rotation.set(0.6, 0.4, -0.5)
  bone("LeftHandMiddle1", 0, 0, 0.08, leftHand)
  bone("LeftHandIndex1", 0.03, 0, 0.08, leftHand)
  bone("LeftHandPinky1", -0.03, 0, 0.08, leftHand)

  const rightHand = bone("RightHand", -0.25, 1.0, 0.0)
  bone("RightHandMiddle1", 0, 0, 0.08, rightHand)
  bone("RightHandIndex1", -0.03, 0, 0.08, rightHand)
  bone("RightHandPinky1", 0.03, 0, 0.08, rightHand)

  return { root, leftHand, rightHand }
}

test("wield().show() resets cached bow aimed quaternion so rest() does not inherit stale draw pose", () => {
  const { root, leftHand, rightHand } = makeMixamoRig()
  const armed = wield(root)
  const bow = armed.weapons.get("bow")
  assert.ok(bow)

  const seatedQuat = bow.group.quaternion.clone()

  // Draw the bow raised above chest so `aimed` is captured
  armed.show("Shoot")
  leftHand.position.set(0.3, 1.45, 0.45)
  rightHand.position.set(-0.2, 1.45, 0.0)
  armed.after("Shoot", 0.5, 1)
  const drawnQuat = bow.group.quaternion.clone()
  assert.ok(drawnQuat.angleTo(seatedQuat) > 0.1, "expected full draw to rotate bow away from seated pose")

  // Put bow away, lower hand back to hip height, then re-show and rest
  armed.show(null)
  leftHand.position.set(0.3, 1.0, 0.1)
  armed.show("Shoot")
  armed.rest("Shoot")

  // With `aimed` reset in `show()`, resting at hip height (raised === 0) returns to `seatedQuat`
  assert.ok(bow.group.quaternion.angleTo(seatedQuat) < 1e-4, "expected rest() to recompute seated pose rather than reusing stale aimed quaternion")

  armed.dispose()
})
