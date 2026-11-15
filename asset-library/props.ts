// What a figure holds in its hand: a prop built here, and the arm that holds it.
//
// A generator fuses anything held into the arm, and a model is made from the front alone, so a staff can be neither
// held nor stowed on the sheet (README, Characters). It is left off the sheet and given back here: its own mesh, stood
// on the ground beside the figure, with that arm bent to it and the hand closed about it. The staff stays planted and
// turns on its foot as the hand sways, so it follows every clip without one written for it.
//
// A brief says what is held: "holds": { "what": "staff", "hand": "R", "length": 2.1 } in character.json. rig.py leaves
// it on the skeleton, as it leaves how far the arms hang.

import * as THREE from "three"
import { relaxHands } from "./clips"

const Y = new THREE.Vector3(0, 1, 0)
const RADIUS = 0.019

// A druid's staff: two old stems wound about each other, parting at the head into an eye and closing over it, with a
// vine up the lower half. It stands on its foot at the origin, `length` tall.
function staff(length: number) {
  const group = new THREE.Group()
  group.name = "prop:staff"
  const eye = 0.26
  const shaft = length - eye
  const TURNS = 3.5
  const stem = (phase: number, side: number) => {
    const points: THREE.Vector3[] = []
    for (let i = 0; i <= 80; i++) {
      const t = i / 80
      const a = t * TURNS * 2 * Math.PI + phase
      // The two stems lie closer at the foot, and the whole staff is a little crooked.
      const out = RADIUS * (0.6 + 0.45 * t)
      points.push(new THREE.Vector3(0.012 * Math.sin(t * 5.2) + out * Math.cos(a), t * shaft, 0.01 * Math.sin(t * 3.4 + 1) + out * Math.sin(a)))
    }
    const top = points[points.length - 1]
    for (const [x, y, z] of [
      [0.05, 0.06, 0.012],
      [0.062, 0.13, 0],
      [0.04, 0.2, -0.01],
      [0.004, 0.25, 0],
    ])
      points.push(new THREE.Vector3(top.x * 0.3 + side * x, shaft + y, z))
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, "centripetal"), 300, RADIUS, 8, false)
  }
  // Bark: long streaks down the length, as light and as dents.
  const bark = (light: boolean) => {
    const cv = document.createElement("canvas")
    cv.width = 512
    cv.height = 64
    const g = cv.getContext("2d") as CanvasRenderingContext2D
    g.fillStyle = light ? "#3b3028" : "#808080"
    g.fillRect(0, 0, 512, 64)
    let seed = 7
    const rand = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let i = 0; i < 260; i++) {
      const tone = 24 + rand() * 58
      const shade = light ? [tone, tone * 0.84, tone * 0.72] : Array(3).fill(60 + rand() * 140)
      g.strokeStyle = `rgba(${shade.map(Math.round).join(",")},${0.35 + rand() * 0.4})`
      g.lineWidth = 0.6 + rand() * 2.2
      const y = rand() * 64
      const x = rand() * 512
      g.beginPath()
      g.moveTo(x, y)
      g.bezierCurveTo(x + 30, y + rand() * 5 - 2.5, x + 70, y + rand() * 5 - 2.5, x + 60 + rand() * 120, y + rand() * 4 - 2)
      g.stroke()
    }
    const map = new THREE.CanvasTexture(cv)
    map.wrapS = map.wrapT = THREE.RepeatWrapping
    map.repeat.set(7, 1)
    if (light) map.colorSpace = THREE.SRGBColorSpace
    return map
  }
  const wood = new THREE.MeshStandardMaterial({ map: bark(true), bumpMap: bark(false), bumpScale: 1.6, roughness: 0.9, metalness: 0 })
  group.add(new THREE.Mesh(stem(0, 1), wood), new THREE.Mesh(stem(Math.PI, -1), wood))
  const knot = new THREE.Mesh(new THREE.SphereGeometry(RADIUS * 1.35, 12, 8), wood)
  knot.position.set(0, shaft + 0.25, 0)
  knot.scale.set(1, 0.8, 1)
  group.add(knot)
  const vine: THREE.Vector3[] = []
  for (let i = 0; i <= 70; i++) {
    const t = 0.1 + (i / 70) * 0.62
    const a = -t * 4.3 * 2 * Math.PI
    vine.push(new THREE.Vector3(0.012 * Math.sin(t * 5.2) + RADIUS * 1.75 * Math.cos(a), t * shaft, 0.01 * Math.sin(t * 3.4 + 1) + RADIUS * 1.75 * Math.sin(a)))
  }
  group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vine), 220, 0.0036, 5, false), new THREE.MeshStandardMaterial({ color: "#2f3a22", roughness: 0.9 })))
  return group
}

// What the skeleton says the figure holds: "staff:R:2.1".
export function heldBy(root: THREE.Object3D) {
  let text = ""
  root.traverse((o) => {
    if (typeof o.userData.holds === "string") text = o.userData.holds
  })
  const [what, hand, length] = text.split(":")
  return what === "staff" && (hand === "L" || hand === "R") ? { what, hand: hand as "L" | "R", length: Number(length) || 2 } : null
}

// The prop a figure holds, added to it, and `update` to call each frame after its clip has moved it. `ground` is
// where its feet are, in its own space. Nothing, for a figure that holds nothing.
export function holdProps(root: THREE.Object3D, ground = 0) {
  const held = heldBy(root)
  const bone = (name: string) => root.getObjectByName(name)
  if (!held) return null
  const [chest, upper, fore, hand] = [bone("chest"), bone(`upperarm${held.hand}`), bone(`forearm${held.hand}`), bone(`hand${held.hand}`)]
  const palm = relaxHands(root).palm[held.hand]
  if (!chest || !upper || !fore || !hand || !palm) return null
  // The figure's left is +x, so its right hand is at -x and turns its palm toward +x.
  const side = held.hand === "L" ? 1 : -1
  const prop = staff(held.length)
  prop.traverse((m) => {
    if (m instanceof THREE.Mesh) m.castShadow = m.receiveShadow = true
  })
  root.add(prop)

  // Everything below is in the figure's own space: its root may be turned, moved and scaled by whoever stands it.
  const own = new THREE.Quaternion()
  const local = (o: THREE.Object3D) => root.worldToLocal(o.getWorldPosition(new THREE.Vector3()))
  const turned = (o: THREE.Object3D) => own.clone().invert().multiply(o.getWorldQuaternion(new THREE.Quaternion()))
  root.updateWorldMatrix(true, true)
  root.getWorldQuaternion(own)
  const tall = local(bone("head") ?? chest).y - ground
  // Where the wrist goes: forward of the shoulder and out, at the height of the chest, as one leans on a staff.
  const reach = local(upper).add(new THREE.Vector3(side * 0.12, -0.1, 0.15).multiplyScalar(tall))
  const [alongUpper, alongFore] = [fore.position.clone().normalize(), hand.position.clone().normalize()]
  const pole = new THREE.Vector3(side * 0.45, -1, -0.55).normalize()
  let foot: THREE.Vector3 | null = null

  const update = () => {
    root.updateWorldMatrix(true, false)
    root.getWorldQuaternion(own)
    chest.updateWorldMatrix(true, true)
    const [s, a, b] = [local(upper), local(upper).distanceTo(local(fore)), local(fore).distanceTo(local(hand))]
    // The elbow, by the two lengths of the arm: on the side of the line from shoulder to wrist that the pole is.
    const to = reach.clone().sub(s)
    const d = THREE.MathUtils.clamp(to.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3)
    to.normalize()
    const along = (a * a + d * d - b * b) / (2 * a * d)
    const off = pole.clone().addScaledVector(to, -pole.dot(to)).normalize()
    const elbow = s
      .clone()
      .addScaledVector(to, a * along)
      .addScaledVector(off, a * Math.sqrt(Math.max(0, 1 - along * along)))
    const wrist = s.clone().addScaledVector(to, d)
    const within = turned(chest)
    upper.quaternion.setFromUnitVectors(alongUpper, elbow.clone().sub(s).normalize().applyQuaternion(within.clone().invert()))
    const upperTurn = within.clone().multiply(upper.quaternion)
    const level = wrist.clone().sub(elbow).normalize()
    fore.quaternion.setFromUnitVectors(alongFore, level.clone().applyQuaternion(upperTurn.clone().invert()))
    // The forearm is rolled about itself until the palm faces across the body, so the staff stands in the closed hand.
    const facing = () => palm.normal.clone().applyQuaternion(upperTurn.clone().multiply(fore.quaternion).multiply(hand.quaternion))
    const flat = (v: THREE.Vector3) => v.addScaledVector(level, -v.dot(level))
    const [now, want] = [flat(facing()), flat(new THREE.Vector3(-side, 0, 0))]
    if (now.lengthSq() > 1e-6 && want.lengthSq() > 1e-6) fore.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(alongFore, Math.atan2(level.dot(now.clone().cross(want)), now.dot(want))))
    fore.updateWorldMatrix(false, true)
    const handTurn = upperTurn.clone().multiply(fore.quaternion).multiply(hand.quaternion)
    const grip = local(hand)
      .addScaledVector(palm.along.clone().applyQuaternion(handTurn), palm.length * 0.5)
      .addScaledVector(palm.normal.clone().applyQuaternion(handTurn), RADIUS + 0.014)
    // Planted where it first stood, a hand's width farther from the feet than the hand is: it leans in a little.
    foot ??= new THREE.Vector3(grip.x + side * 0.03, ground, grip.z + 0.05)
    prop.position.copy(foot)
    prop.quaternion.setFromUnitVectors(Y, grip.clone().sub(foot).normalize())
  }
  update()
  return {
    prop,
    update,
    dispose: () => {
      prop.removeFromParent()
      prop.traverse((m) => {
        if (!(m instanceof THREE.Mesh)) return
        const made = m.material as THREE.MeshStandardMaterial
        m.geometry.dispose()
        for (const x of [made.map, made.bumpMap]) x?.dispose()
        made.dispose()
      })
    },
  }
}
