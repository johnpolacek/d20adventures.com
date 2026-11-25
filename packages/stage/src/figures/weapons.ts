// A sword and a bow put in a rigged figure's hand while it plays a move that uses them (clips.ts IN_HAND).
//
// A generated figure wears its weapons as part of its one mesh: Thalbern's bow is slung on his back and his blades
// are in their sheaths, and none of them can be drawn. So what a move needs is built here and stood in the hand: seated
// on the palm the figure was modelled with (relaxHands), held by the hand's bone, and shown only while the move plays.
// The hand is not closed about it: these hands were modelled open.
//
// A hand modelled round a rod (rig.py, "holds": { "what": "bow", "rod": true } in the brief) holds its weapon as
// Wollandora holds her staff: the weapon goes through the way left in the hand, along the rod's own line and as thick
// as it was, and stays there, shown at all times. To aim it the hand is turned, not the weapon.

import * as THREE from "three"
import { relaxHands } from "./clips"
import { wayThrough } from "./props"

const steel = () => new THREE.MeshStandardMaterial({ color: "#d9dce1", metalness: 1, roughness: 0.2 })
const iron = () => new THREE.MeshStandardMaterial({ color: "#8d8b88", metalness: 1, roughness: 0.42 })
const leather = () => new THREE.MeshStandardMaterial({ color: "#2b2019", roughness: 0.78 })
const wood = () => new THREE.MeshStandardMaterial({ color: "#6a4526", roughness: 0.52 })
const horn = () => new THREE.MeshStandardMaterial({ color: "#d8cdb4", roughness: 0.45 })
const cord = () => new THREE.MeshStandardMaterial({ color: "#e4dcc6", roughness: 0.9 })
const feather = () => new THREE.MeshStandardMaterial({ color: "#cfc8b8", roughness: 0.95, side: THREE.DoubleSide })

// Rings of points joined into a skin, each ring going round the same way, and lit as flat faces: steel and shaped
// wood show their edges.
function skin(rings: number[][][]) {
  const [count, around] = [rings.length, rings[0].length]
  const index: number[] = []
  for (let i = 0; i < count - 1; i++)
    for (let k = 0; k < around; k++) {
      const [a, b] = [i * around + k, i * around + ((k + 1) % around)]
      index.push(a, a + around, b, b, a + around, b + around)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute(rings.flat(2), 3))
  g.setIndex(index)
  const faceted = g.toNonIndexed()
  faceted.computeVertexNormals()
  g.dispose()
  return faceted
}

// A grip bound in a cord under leather: ribbed, a little fuller at its middle, along +y about the origin.
function wrapped(long: number, radius: number) {
  const points: THREE.Vector2[] = []
  for (let i = 0; i <= 44; i++) {
    const u = i / 44
    points.push(new THREE.Vector2(radius * (1 + 0.09 * Math.sin(Math.PI * u)) + 0.0011 * Math.sin(u * Math.PI * 2 * 11), (u - 0.5) * long))
  }
  return new THREE.Mesh(new THREE.LatheGeometry(points, 14), leather())
}

// An arming sword along +y from the middle of its grip: a wrapped grip, a guard across +x that rises a little to its
// ends, a blade of six faces with a flat down its middle that draws in to a point, and a wheel pommel.
export function sword() {
  const g = new THREE.Group()
  g.name = "weapon:sword"
  const [long, wide, thick] = [0.78, 0.024, 0.0052]
  const rings: number[][][] = []
  for (let i = 0; i <= 16; i++) {
    const u = i / 16
    // Nearly straight for most of its length, then drawn in to the point. The flat runs out before the point does.
    const w = wide * (u < 0.74 ? 1 - 0.2 * (u / 0.74) : 0.8 * (1 - ((u - 0.74) / 0.26) ** 1.5))
    const t = thick * (1 - 0.6 * u)
    const flat = 0.42 * Math.min(1, Math.max(0, (0.8 - u) / 0.18))
    const y = u * long
    rings.push([
      [w, y, 0],
      [w * flat, y, t],
      [-w * flat, y, t],
      [-w, y, 0],
      [-w * flat, y, -t],
      [w * flat, y, -t],
    ])
  }
  const blade = new THREE.Mesh(skin(rings), steel())
  blade.position.y = 0.092
  const arms = new THREE.CatmullRomCurve3([-0.105, -0.06, 0, 0.06, 0.105].map((x) => new THREE.Vector3(x, 0.09 + 0.9 * x * x, 0)))
  const guard = new THREE.Mesh(new THREE.TubeGeometry(arms, 20, 0.0085, 8), iron())
  guard.scale.z = 1.3
  const block = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.024, 0.026), iron())
  block.position.y = 0.09
  const ends = [-0.105, 0.105].map((x) => {
    const end = new THREE.Mesh(new THREE.SphereGeometry(0.0115, 10, 8), iron())
    end.position.set(x, 0.09 + 0.9 * x * x, 0)
    return end
  })
  const grip = wrapped(0.15, 0.0142)
  // A wheel: a disc with its rim cut back, flat to the blade's flat, and the tang's end peened over it.
  const wheel = new THREE.Mesh(
    new THREE.LatheGeometry(
      [0, 0.017, 0.026, 0.026, 0.017, 0].map((r, i) => new THREE.Vector2(r, [-0.009, -0.009, -0.004, 0.004, 0.009, 0.009][i])),
      20
    ),
    iron()
  )
  wheel.rotation.x = Math.PI / 2
  wheel.position.y = -0.1
  const peen = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), iron())
  peen.position.y = -0.128
  g.add(blade, guard, block, ...ends, grip, wheel, peen)
  return { group: g, update: () => {} }
}

// A longbow standing along +y from its grip, bowed toward +z, its string on -z: limbs of shaped wood that thin to
// horn tips turned a little forward, and a wrapped grip. `draw` pulls the string's middle to a point in the bow's own
// space, with an arrow on it that lies past the grip, or lets it go straight, the arrow gone.
export function bow(length = 1.44, thick = 0.02) {
  const g = new THREE.Group()
  g.name = "weapon:bow"
  const [half, depth] = [length / 2, length * 0.11]
  // The limbs curve back from the grip, so the tips stand `depth` behind it, and turn forward again at their ends.
  const at = (u: number) => new THREE.Vector3(0, u * half, -depth * u * u + (Math.abs(u) > 0.84 ? (Math.abs(u) - 0.84) ** 2 * depth * 14 : 0))
  const rings: number[][][] = []
  for (let i = 0; i <= 48; i++) {
    const u = -1 + (2 * i) / 48
    const [here, ahead] = [
      at(u),
      at(u + 0.01)
        .sub(at(u - 0.01))
        .normalize(),
    ]
    // Across the limb is the bow's own x. Square to that and to the way the limb runs is its thickness: a flat belly
    // and a rounded back.
    const out = new THREE.Vector3(1, 0, 0).cross(ahead).normalize()
    const [wide, deep] = [0.0165 * (1 - 0.6 * Math.abs(u) ** 1.4), 0.0125 * (1 - 0.55 * Math.abs(u))]
    const ring: number[][] = []
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2
      const p = here
        .clone()
        .addScaledVector(new THREE.Vector3(1, 0, 0), Math.cos(a) * wide)
        .addScaledVector(out, Math.sin(a) * deep * (Math.sin(a) > 0 ? 1 : 0.55))
      ring.push([p.x, p.y, p.z])
    }
    rings.push(ring)
  }
  const limbs = new THREE.Mesh(skin(rings), wood())
  const handle = wrapped(0.13, thick * 0.96)
  const tips = [at(1), at(-1)]
  const nocks = tips.map((tip, i) => {
    const nock = new THREE.Mesh(new THREE.ConeGeometry(0.0085, 0.036, 8), horn())
    nock.position.copy(tip)
    nock.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      at(i ? -1 : 1)
        .sub(at(i ? -0.98 : 0.98))
        .normalize()
    )
    return nock
  })
  // The string as two lengths, from each tip to where it is held, turned and stretched as it is drawn.
  const rest = tips[0].clone().lerp(tips[1], 0.5)
  const lengths = tips.map(() => new THREE.Mesh(new THREE.CylinderGeometry(0.0017, 0.0017, 1, 5), cord()))
  const arrow = new THREE.Group()
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0036, 0.0036, 0.74, 6), new THREE.MeshStandardMaterial({ color: "#b8935f", roughness: 0.6 }))
  shaft.position.y = 0.37
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.0085, 0.04, 6), steel())
  head.position.y = 0.76
  const vanes = [0, 1, 2].map((k) => {
    const vane = new THREE.Mesh(new THREE.PlaneGeometry(0.022, 0.1), feather())
    vane.position.set(Math.cos((k * 2 * Math.PI) / 3) * 0.013, 0.075, Math.sin((k * 2 * Math.PI) / 3) * 0.013)
    vane.rotation.y = -(k * 2 * Math.PI) / 3
    return vane
  })
  arrow.add(shaft, head, ...vanes)
  arrow.visible = false
  g.add(limbs, handle, ...nocks, ...lengths, arrow)
  const up = new THREE.Vector3(0, 1, 0)
  const lay = (mid: THREE.Vector3) => {
    for (const [i, piece] of lengths.entries()) {
      const run = mid.clone().sub(tips[i])
      piece.position.copy(tips[i]).addScaledVector(run, 0.5)
      piece.scale.y = run.length()
      piece.quaternion.setFromUnitVectors(up, run.normalize())
    }
  }
  lay(rest)
  return {
    group: g,
    update: (to: THREE.Vector3 | null, share: number) => {
      const mid = to ? rest.clone().lerp(to, share) : rest
      lay(mid)
      // An arrow on the string once it is drawn clear of where it rests, lying past the grip on the side of the hand.
      arrow.visible = !!to && share > 0 && mid.distanceTo(rest) > 0.04
      if (!arrow.visible) return
      arrow.position.copy(mid)
      arrow.quaternion.setFromUnitVectors(up, new THREE.Vector3(thick * 0.9, 0.012, 0).sub(mid).normalize())
    },
  }
}

export interface Weapon {
  what: "sword" | "bow"
  hand: "L" | "R"
  group: THREE.Group
  // Through a hand made round a rod, and kept there: it is never hidden, and it is aimed by turning the hand.
  held: boolean
  // For a bow: the string drawn toward the other hand by `share`, 0 to 1.
  draw: (share: number) => void
  dispose: () => void
}

// What the skeleton says the figure holds, when it is a bow through a hand made round a rod: "bow:L:1.44:rod".
export function heldBow(root: THREE.Object3D) {
  let text = ""
  root.traverse((o) => {
    if (typeof o.userData.holds === "string") text = o.userData.holds
  })
  const [what, hand, length, how] = text.split(":")
  const way = wayThrough(root)
  return what === "bow" && how === "rod" && way && (hand === "L" || hand === "R") ? { hand: hand as "L" | "R", length: Number(length) || 1.44, way } : null
}

// The weapon seated in a figure's hand, hidden. Call with the figure at rest, before any clip has moved it. Nothing
// when the figure has no such hand. `grip` is the way through a hand made round a rod (heldBow): the weapon goes
// through it and is kept shown.
export function weaponIn(root: THREE.Object3D, what: "sword" | "bow", hand: "L" | "R", grip?: { way: { at: THREE.Vector3; runs: THREE.Vector3; wide: number }; length: number }): Weapon | null {
  const palm = relaxHands(root).palm[hand]
  const other = relaxHands(root).palm[hand === "L" ? "R" : "L"]
  const bone = root.getObjectByName(`hand${hand}`)
  const otherBone = root.getObjectByName(`hand${hand === "L" ? "R" : "L"}`)
  if ((!palm && !grip) || !bone) return null
  root.updateMatrixWorld(true)
  const wrist = root.worldToLocal(bone.getWorldPosition(new THREE.Vector3()))
  // Toward the thumb: `along` crossed with `normal` points to a right hand's thumb and away from a left's.
  // Where it is held: halfway along the hand, against the palm. Or through a hand made round a rod, on the rod's line.
  // A sword's blade comes out of the hand on the thumb's side, its edge toward the knuckles. A bow's limbs run the
  // same way through the hand, bowed out toward the fingers' side, its string toward the wrist. Through a rod's hand
  // a bow is bowed out ahead of the figure, its string toward it.
  const thumb = palm ? new THREE.Vector3().crossVectors(palm.along, palm.normal).multiplyScalar(hand === "R" ? 1 : -1) : new THREE.Vector3(0, 1, 0)
  const seat = grip
    ? grip.way.at.clone()
    : wrist
        .clone()
        .addScaledVector(palm!.along, palm!.length * 0.5)
        .addScaledVector(palm!.normal, 0.025)
  const made = what === "sword" ? sword() : grip ? bow(grip.length, grip.way.wide * 0.58) : bow()
  const g = made.group
  const y = (grip ? grip.way.runs.clone() : thumb).normalize()
  const z = (grip ? new THREE.Vector3(0, 0, 1) : what === "bow" ? palm!.along.clone() : palm!.normal.clone()).addScaledVector(y, grip ? -y.z : 0).normalize()
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
  g.visible = !!grip
  // The other hand's palm, where the string is drawn to, carried by its own bone.
  const pull = other && otherBone ? root.worldToLocal(otherBone.getWorldPosition(new THREE.Vector3())).addScaledVector(other.along, other.length * 0.45) : null
  const pullOnBone = pull && otherBone ? otherBone.worldToLocal(root.localToWorld(pull.clone())) : null
  const there = new THREE.Vector3()
  return {
    what,
    hand,
    group: g,
    held: !!grip,
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
// `bones` are the arm's own when they are not the shared skeleton's: the bone the upper arm hangs from, then the upper
// arm, forearm and hand.
export function reachArm(root: THREE.Object3D, side: "L" | "R", wrist: THREE.Vector3, pole: THREE.Vector3, weight: number, bones?: THREE.Object3D[]) {
  const [chest, upper, fore, hand] = bones ?? ["chest", `upperarm${side}`, `forearm${side}`, `hand${side}`].map((n) => root.getObjectByName(n))
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

// A weapon held through a rod's hand, aimed by turning the hand that holds it until the weapon is turned as `world` says.
export function turnHandTo(w: Weapon, world: THREE.Quaternion) {
  const hand = w.group.parent
  const above = hand?.parent
  if (!hand || !above) return
  hand.updateWorldMatrix(true, true)
  const now = w.group.getWorldQuaternion(new THREE.Quaternion())
  const turn = world.clone().multiply(now.invert())
  const want = turn.multiply(hand.getWorldQuaternion(new THREE.Quaternion()))
  hand.quaternion.copy(above.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(want))
  hand.updateWorldMatrix(false, true)
}

// How a bow held through a rod's hand is aimed: broadside on, its front the way `ahead` points, and leaning to one side
// no more than `cant` radians, as near as that allows to the way the hand has it now (`now`, the bow's turn in the
// world). The hand turns by the least that brings it there, so a hand made round a staff's line bends no more than it
// must at the wrist.
export function bowAim(now: THREE.Quaternion, ahead: THREE.Vector3, cant = THREE.MathUtils.degToRad(30)) {
  const z = ahead.clone().setY(0).normalize()
  const up = new THREE.Vector3(0, 1, 0)
  const y = new THREE.Vector3(0, 1, 0).applyQuaternion(now)
  y.addScaledVector(z, -y.dot(z))
  if (y.lengthSq() < 1e-6) y.copy(up)
  y.normalize()
  if (y.y < 0) y.negate()
  if (up.angleTo(y) > cant) {
    const side = y.clone().addScaledVector(up, -y.dot(up)).normalize()
    y.copy(up).multiplyScalar(Math.cos(cant)).addScaledVector(side, Math.sin(cant))
  }
  const x = new THREE.Vector3().crossVectors(y, z).normalize()
  z.crossVectors(x, y)
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
}
