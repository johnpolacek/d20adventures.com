// A sword and a bow put in a rigged figure's hand while it plays a move that uses them (clips.ts IN_HAND).
//
// A generated figure wears its weapons as part of its one mesh: Thalbern's bow is slung on his back and his blades
// are in their sheaths, and none of them can be drawn. So what a move needs is built here and stood in the hand: seated
// on the palm the figure was modelled with (relaxHands), held by the hand's bone, and shown only while the move plays.
// The hand is not closed about it: these hands were modelled open. A hand modelled round a rod (props.ts) would hold
// it as Wollandora holds her staff.

import * as THREE from "three"
import { relaxHands } from "./clips"

const metal = () => new THREE.MeshStandardMaterial({ color: "#c9ccd0", metalness: 0.85, roughness: 0.32 })
const leather = () => new THREE.MeshStandardMaterial({ color: "#3a2a1e", roughness: 0.85 })
const wood = () => new THREE.MeshStandardMaterial({ color: "#5a3c22", roughness: 0.7 })

// A plain arming sword along +y from the middle of its grip: grip, a guard across +x, a blade with a point, a pommel.
function sword() {
  const g = new THREE.Group()
  g.name = "weapon:sword"
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.016, 0.16, 10), leather())
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.022, 0.03), metal())
  guard.position.y = 0.09
  const shape = new THREE.Shape()
  const [w, l] = [0.022, 0.78]
  shape.moveTo(-w, 0)
  shape.lineTo(w, 0)
  shape.lineTo(w * 0.8, l - 0.1)
  shape.lineTo(0, l)
  shape.lineTo(-w * 0.8, l - 0.1)
  shape.closePath()
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.004, bevelSegments: 1 }), metal())
  blade.geometry.translate(0, 0, -0.003)
  blade.position.y = 0.1
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 8), metal())
  pommel.position.y = -0.095
  g.add(grip, guard, blade, pommel)
  return { group: g, update: () => {} }
}

// A recurve-less longbow standing along +y from its grip, bowed toward +z, its string on -z. `draw` pulls the string's
// middle to a point in the bow's own space, or lets it go straight.
function bow() {
  const g = new THREE.Group()
  g.name = "weapon:bow"
  const [half, depth] = [0.72, 0.16]
  // The limbs curve back from the grip, so the tips stand `depth` behind it.
  const arc = new THREE.CatmullRomCurve3([-1, -0.6, -0.25, 0, 0.25, 0.6, 1].map((u) => new THREE.Vector3(0, u * half, -depth * u * u)))
  const limbs = new THREE.Mesh(new THREE.TubeGeometry(arc, 40, 0.014, 6), wood())
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), leather())
  const tips = [new THREE.Vector3(0, half, -depth), new THREE.Vector3(0, -half, -depth)]
  const string = new THREE.BufferGeometry().setFromPoints([tips[0], tips[0].clone().lerp(tips[1], 0.5), tips[1]])
  const line = new THREE.Line(string, new THREE.LineBasicMaterial({ color: "#e8e0cc" }))
  g.add(limbs, handle, line)
  const rest = tips[0].clone().lerp(tips[1], 0.5)
  const at = string.attributes.position as THREE.BufferAttribute
  return {
    group: g,
    update: (to: THREE.Vector3 | null, share: number) => {
      const mid = to ? rest.clone().lerp(to, share) : rest
      at.setXYZ(1, mid.x, mid.y, mid.z)
      at.needsUpdate = true
    },
  }
}

export interface Weapon {
  what: "sword" | "bow"
  hand: "L" | "R"
  group: THREE.Group
  // For a bow: the string drawn toward the other hand by `share`, 0 to 1.
  draw: (share: number) => void
  dispose: () => void
}

// The weapon seated in a figure's hand, hidden. Call with the figure at rest, before any clip has moved it. Nothing
// when the figure has no such hand.
export function weaponIn(root: THREE.Object3D, what: "sword" | "bow", hand: "L" | "R"): Weapon | null {
  const palm = relaxHands(root).palm[hand]
  const other = relaxHands(root).palm[hand === "L" ? "R" : "L"]
  const bone = root.getObjectByName(`hand${hand}`)
  const otherBone = root.getObjectByName(`hand${hand === "L" ? "R" : "L"}`)
  if (!palm || !bone) return null
  root.updateMatrixWorld(true)
  const wrist = root.worldToLocal(bone.getWorldPosition(new THREE.Vector3()))
  // Toward the thumb: `along` crossed with `normal` points to a right hand's thumb and away from a left's.
  const thumb = new THREE.Vector3().crossVectors(palm.along, palm.normal).multiplyScalar(hand === "R" ? 1 : -1)
  // Where it is held: halfway along the hand, against the palm.
  const seat = wrist.clone().addScaledVector(palm.along, palm.length * 0.5).addScaledVector(palm.normal, 0.025)
  const made = what === "sword" ? sword() : bow()
  const g = made.group
  // A sword's blade comes out of the hand on the thumb's side, its edge toward the knuckles. A bow's limbs run the
  // same way through the hand, bowed out toward the fingers' side, its string toward the wrist.
  const y = thumb.clone().normalize()
  const z = (what === "bow" ? palm.along.clone() : palm.normal.clone()).normalize()
  const x = new THREE.Vector3().crossVectors(y, z).normalize()
  z.crossVectors(x, y).normalize()
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
  g.position.copy(seat)
  g.traverse((m) => {
    if (m instanceof THREE.Mesh) m.castShadow = m.receiveShadow = true
  })
  root.add(g)
  root.updateMatrixWorld(true)
  bone.attach(g)
  g.visible = false
  // The other hand's palm, where the string is drawn to, carried by its own bone.
  const pull = other && otherBone ? root.worldToLocal(otherBone.getWorldPosition(new THREE.Vector3())).addScaledVector(other.along, other.length * 0.45) : null
  const pullOnBone = pull && otherBone ? otherBone.worldToLocal(root.localToWorld(pull.clone())) : null
  const there = new THREE.Vector3()
  return {
    what,
    hand,
    group: g,
    draw: (share) => {
      if (what !== "bow") return
      if (!pullOnBone || !otherBone || share <= 0) return (made.update as (to: THREE.Vector3 | null, s: number) => void)(null, 0)
      otherBone.updateWorldMatrix(true, false)
      there.copy(pullOnBone).applyMatrix4(otherBone.matrixWorld)
      g.updateWorldMatrix(true, false)
      ;(made.update as (to: THREE.Vector3 | null, s: number) => void)(g.worldToLocal(there), share)
    },
    dispose: () => {
      g.removeFromParent()
      g.traverse((m) => {
        if (m instanceof THREE.Mesh || m instanceof THREE.Line) {
          m.geometry.dispose()
          ;(m.material as THREE.Material).dispose()
        }
      })
    },
  }
}

// The arm of `side` brought to reach its wrist to `wrist`, its elbow bent out toward `pole`, both in the figure's own
// space, over whatever pose the clip gave it by `weight`. Two bones and their lengths: the elbow lies where they meet,
// on the side of the line from shoulder to wrist that the pole is (as props.ts bends the arm that holds a staff).
export function reachArm(root: THREE.Object3D, side: "L" | "R", wrist: THREE.Vector3, pole: THREE.Vector3, weight: number) {
  const [chest, upper, fore, hand] = ["chest", `upperarm${side}`, `forearm${side}`, `hand${side}`].map((n) => root.getObjectByName(n))
  if (!chest || !upper || !fore || !hand || weight <= 0) return
  root.updateWorldMatrix(true, true)
  const own = root.getWorldQuaternion(new THREE.Quaternion()).invert()
  const local = (o: THREE.Object3D) => root.worldToLocal(o.getWorldPosition(new THREE.Vector3()))
  const turned = (o: THREE.Object3D) => own.clone().multiply(o.getWorldQuaternion(new THREE.Quaternion()))
  const s = local(upper)
  const [a, b] = [s.distanceTo(local(fore)), local(fore).distanceTo(local(hand))]
  const to = wrist.clone().sub(s)
  const d = THREE.MathUtils.clamp(to.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3)
  to.normalize()
  const along = (a * a + d * d - b * b) / (2 * a * d)
  const off = pole.clone().addScaledVector(to, -pole.dot(to)).normalize()
  const elbow = s
    .clone()
    .addScaledVector(to, a * along)
    .addScaledVector(off, a * Math.sqrt(Math.max(0, 1 - along * along)))
  const within = turned(chest)
  const wantUpper = new THREE.Quaternion().setFromUnitVectors(fore.position.clone().normalize(), elbow.clone().sub(s).normalize().applyQuaternion(within.clone().invert()))
  upper.quaternion.slerp(wantUpper, weight)
  upper.updateWorldMatrix(false, true)
  const upperTurn = within.clone().multiply(upper.quaternion)
  const reached = local(fore)
  const wantFore = new THREE.Quaternion().setFromUnitVectors(hand.position.clone().normalize(), wrist.clone().sub(reached).normalize().applyQuaternion(upperTurn.invert()))
  fore.quaternion.slerp(wantFore, weight)
  fore.updateWorldMatrix(false, true)
}

// A weapon turned in the world, whatever its hand is doing: upright, with its front (+z) the way `ahead` points, level.
export function standUpright(w: Weapon, ahead: THREE.Vector3) {
  const parent = w.group.parent
  if (!parent) return
  const z = ahead.clone().setY(0).normalize()
  if (z.lengthSq() < 1e-6) return
  const y = new THREE.Vector3(0, 1, 0)
  const x = new THREE.Vector3().crossVectors(y, z)
  const world = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
  parent.updateWorldMatrix(true, false)
  w.group.quaternion.copy(parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world))
  w.group.updateWorldMatrix(false, true)
}

// A weapon turned in the world so that its length (+y) runs the way `dir` points, its flat kept as level as that allows.
export function pointAlong(w: Weapon, dir: THREE.Vector3) {
  const parent = w.group.parent
  if (!parent) return
  const y = dir.clone().normalize()
  const x = new THREE.Vector3(0, 1, 0).cross(y)
  if (x.lengthSq() < 1e-6) x.set(1, 0, 0)
  x.normalize()
  const z = new THREE.Vector3().crossVectors(x, y)
  const world = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
  parent.updateWorldMatrix(true, false)
  w.group.quaternion.copy(parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world))
  w.group.updateWorldMatrix(false, true)
}
