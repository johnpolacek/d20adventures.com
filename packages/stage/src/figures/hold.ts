// A sword and a bow in the hands of a figure rigged with finger bones under Mixamo's names (asset-library's pilot.ts:
// Rodin's model rigged by Hyper3D or Meshy), moved by clips borrowed from a library (retarget.ts). And a staff, which
// such a figure carries at all times (`carry`, at the foot of this file).
//
// fight.ts arms a figure rig.py rigged: its hand is one bone, so a weapon is stood on an open palm, and its clips are
// written turns, so the arms are put where a shot wants them after the clip has played. Here the clip is a whole
// move already and the hand has its fingers. So the weapon is seated across the palm under the knuckles, the fingers
// are closed round it while it shows, a bow is stood upright along the arrow's line, and its string goes back with the
// hand that draws it until the clip looses it.

import * as THREE from "three"
import { IN_HAND } from "./clips"
import type { Armed } from "./fight"
import { heldBy, staff, wayThrough } from "./props"
import { sword as armingSword, bow as longbow, type Weapon } from "./weapons"

// The clips a weapon shows in, beside the game's own two: the library's other sword clips.
const HOLDS: Record<string, { what: "sword" | "bow"; hand: "L" | "R" }> = {
  ...IN_HAND,
  Combo: { what: "sword", hand: "R" },
  Block: { what: "sword", hand: "R" },
  "Sword Idle": { what: "sword", hand: "R" },
}
// A clip tried for the sword cut goes by "Cut" and a name of its own (the pilot's audition figure).
const holds = (clip: string) => HOLDS[clip] ?? (clip.startsWith("Cut ") ? HOLDS.Swing : undefined)
// When a clip lets the string go, in seconds: the draw of the borrowed shot is cut there (the figure's brief).
const LOOSED: Record<string, number> = { Shoot: 1.5 }
const FINGERS = ["Index", "Middle", "Ring", "Pinky"]
// How far each joint of a finger closes round a grip, from its knuckle out, in degrees. And round a bowstring: hooked.
const GRIP = [72, 84, 46]
const HOOK = [18, 78, 52]
const THUMB = [26, 30, 18]
// How thick a grip is at its middle, in metres (weapons.ts), and half of how thick a finger is.
const ROUND = { sword: 0.0142, bow: 0.0192 }
const FINGER = 0.009

const plain = (name: string) => name.replace(/^mixamorig:?/i, "")
function skeleton(root: THREE.Object3D) {
  const bones = new Map<string, THREE.Object3D>()
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone && !bones.has(plain(o.name))) bones.set(plain(o.name), o)
  })
  return bones
}
// Whether a figure has such hands.
export const fingered = (root: THREE.Object3D) => {
  const bones = skeleton(root)
  return bones.has("LeftHandMiddle1") && bones.has("RightHandMiddle1") && bones.has("Spine2")
}

interface Hand {
  wrist: THREE.Object3D
  // Along the fingers, across the knuckles toward the thumb, and out of the palm, in the world at rest.
  along: THREE.Vector3
  across: THREE.Vector3
  palm: THREE.Vector3
  knuckle: THREE.Vector3
  // Each joint that closes: its turn at rest and the line it closes about, in its own space.
  joints: { bone: THREE.Object3D; rest: THREE.Quaternion; about: THREE.Vector3; step: number; thumb: boolean; finger: string }[]
  // Each finger as it was modelled: where its knuckle is, how long its first two bones are, and how far each of its
  // three joints is already closed, in degrees.
  fingers: Map<string, { knuckle: THREE.Vector3; bones: [number, number]; curled: [number, number, number] }>
}

function hand(bones: Map<string, THREE.Object3D>, side: "L" | "R"): Hand | null {
  const s = side === "L" ? "Left" : "Right"
  const [wrist, middle, index, pinky] = [`${s}Hand`, `${s}HandMiddle1`, `${s}HandIndex1`, `${s}HandPinky1`].map((n) => bones.get(n))
  if (!wrist || !middle || !index || !pinky) return null
  const at = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3())
  const along = at(middle).sub(at(wrist)).normalize()
  const across = at(index).sub(at(pinky))
  across.addScaledVector(along, -across.dot(along)).normalize()
  // Fingers along +x and thumb ahead, a left hand's palm is down and a right hand's up: the cross is the left's palm.
  const palm = new THREE.Vector3().crossVectors(along, across).multiplyScalar(side === "L" ? 1 : -1)
  const joints: Hand["joints"] = []
  const fingers: Hand["fingers"] = new Map()
  const closing = (name: string, about: THREE.Vector3, step: number, thumb: boolean, finger: string) => {
    const bone = bones.get(name)
    if (!bone) return
    joints.push({ bone, rest: bone.quaternion.clone(), about: about.clone().applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize(), step, thumb, finger })
  }
  for (const finger of FINGERS) {
    const [a, b, c] = [bones.get(`${s}Hand${finger}1`), bones.get(`${s}Hand${finger}2`), bones.get(`${s}Hand${finger}3`)]
    if (!a || !b) continue
    // A finger closes toward the palm: about the line square to both.
    const first = at(b).sub(at(a))
    const about = new THREE.Vector3().crossVectors(first.clone().normalize(), palm).normalize()
    for (const step of [1, 2, 3]) closing(`${s}Hand${finger}${step}`, about, step, false, finger)
    if (!c) continue
    // How far it is closed already, joint by joint. Its last bone runs as the one before it does, in its own space.
    const second = at(c).sub(at(b))
    const last = c.position.clone().normalize().applyQuaternion(c.getWorldQuaternion(new THREE.Quaternion()))
    const turn = (from: THREE.Vector3, to: THREE.Vector3) => THREE.MathUtils.radToDeg(Math.atan2(new THREE.Vector3().crossVectors(from, to).dot(about), from.dot(to)))
    const [u, v] = [first.clone().normalize(), second.clone().normalize()]
    fingers.set(finger, { knuckle: at(a), bones: [first.length(), second.length()], curled: [turn(along, u), turn(u, v), turn(v, last)] })
  }
  const [t1, t2] = [bones.get(`${s}HandThumb1`), bones.get(`${s}HandThumb2`)]
  if (t1 && t2) {
    // The thumb closes over the fingers: toward the first knuckle, a little into the palm.
    const to = at(index).addScaledVector(palm, 0.03).sub(at(t1)).normalize()
    const about = new THREE.Vector3().crossVectors(at(t2).sub(at(t1)).normalize(), to).normalize()
    for (const step of [1, 2, 3]) closing(`${s}HandThumb${step}`, about, step, true, "Thumb")
  }
  return { wrist, along, across, palm, knuckle: at(middle), joints, fingers }
}

// A hand's fingers closed by a share of the angles given, over whatever the clip left them at.
function close(h: Hand, fingers: number[], share: number) {
  const turn = new THREE.Quaternion()
  for (const j of h.joints) {
    const degrees = (j.thumb ? THUMB : fingers)[j.step - 1] * share
    j.bone.quaternion.copy(j.rest).multiply(turn.setFromAxisAngle(j.about, THREE.MathUtils.degToRad(degrees)))
  }
}

// How far each joint of each finger turns to lie round a grip of a given thickness seated at a place, both in the
// world at rest. Seen from the side a finger is three straight bones and the grip a circle: the first bone leaves the
// knuckle along the line that just touches the circle, and each joint after turns as far as brings the next bone to
// touch it too. Fixed angles closed every hand the same way whatever its shape, and on a hand modelled flat with
// slender fingers they made a small fist under the hilt, which lay on top of it (the owner, 2026-11-19: "pay attention
// to the hand position"). What a finger was modelled closed by is taken off what it is asked to turn.
function round(h: Hand, seat: THREE.Vector3, thick: number) {
  const clear = thick + FINGER
  const turns = new Map<string, [number, number, number]>()
  const within = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v))
  for (const [finger, f] of h.fingers) {
    const to = seat.clone().sub(f.knuckle)
    // The grip from the knuckle: along the hand, and out of the palm.
    const [x, y] = [to.dot(h.along), to.dot(h.palm)]
    const far = Math.max(Math.hypot(x, y), clear * 1.02)
    const first = within(Math.atan2(y, x) - Math.asin(clear / far), THREE.MathUtils.degToRad(20), THREE.MathUtils.degToRad(95))
    const touches = Math.sqrt(far * far - clear * clear)
    let [second, spare] = [0, 0]
    if (touches < f.bones[0]) {
      // The first bone touches the grip and runs on past: the joint at its end turns the second bone back onto it.
      const past = f.bones[0] - touches
      second = 2 * Math.atan(past / clear)
      spare = f.bones[1] - past
    } else {
      // The first bone is too short to touch: the second is laid on the grip from the joint at its end.
      const [jx, jy] = [x - Math.cos(first) * f.bones[0], y - Math.sin(first) * f.bones[0]]
      const off = Math.max(Math.hypot(jx, jy), clear * 1.02)
      second = Math.atan2(jy, jx) - Math.asin(clear / off) - first
      spare = f.bones[1] - Math.sqrt(off * off - clear * clear)
    }
    second = within(second, THREE.MathUtils.degToRad(15), THREE.MathUtils.degToRad(110))
    const third = within(spare > 0 ? 2 * Math.atan(spare / clear) : 0, THREE.MathUtils.degToRad(10), THREE.MathUtils.degToRad(80))
    turns.set(finger, [first, second, third].map((angle, k) => within(THREE.MathUtils.radToDeg(angle) - f.curled[k], -25, 110)) as [number, number, number])
  }
  return turns
}

// A hand's fingers laid round a grip (`round`), its thumb closed over them, over whatever the clip left them at.
function grip(h: Hand, turns: Map<string, [number, number, number]>) {
  const turn = new THREE.Quaternion()
  for (const j of h.joints) {
    const degrees = j.thumb ? THUMB[j.step - 1] : (turns.get(j.finger)?.[j.step - 1] ?? GRIP[j.step - 1])
    j.bone.quaternion.copy(j.rest).multiply(turn.setFromAxisAngle(j.about, THREE.MathUtils.degToRad(degrees)))
  }
}

// Call with the figure at rest, before any clip has moved it.
export function wield(root: THREE.Object3D): Armed {
  root.updateWorldMatrix(true, true)
  const bones = skeleton(root)
  const hands = { L: hand(bones, "L"), R: hand(bones, "R") }
  const weapons = new Map<string, Weapon>()
  const strings = new Map<Weapon, { update: (to: THREE.Vector3 | null, share: number) => void; seated: THREE.Quaternion }>()
  const grips = new Map<string, Map<string, [number, number, number]>>()
  for (const need of Object.values(HOLDS)) {
    const h = hands[need.hand]
    if (!h || weapons.has(need.what)) continue
    const made = need.what === "sword" ? armingSword() : longbow()
    const g = made.group
    // Across the palm under the knuckles, where closed fingers have it. Its length runs out of the hand on the thumb's
    // side. A sword's flat faces out of the palm. A bow is bowed out toward the fingers, its string toward the wrist.
    const y = h.across.clone()
    const z = (need.what === "bow" ? h.along : h.palm).clone()
    const x = new THREE.Vector3().crossVectors(y, z).normalize()
    z.crossVectors(x, y).normalize()
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
    g.position.copy(h.knuckle).addScaledVector(h.along, -0.012).addScaledVector(h.palm, 0.03)
    grips.set(need.what, round(h, g.position, ROUND[need.what]))
    g.traverse((m) => {
      if (m instanceof THREE.Mesh) m.castShadow = m.receiveShadow = true
    })
    // Placed in the world, then handed to the wrist to carry. It has no parent till then, so where it is put is where
    // it is in the world: under the figure's root, a figure already stood at its spot on a stage would carry it as far
    // from its hand as the spot is from the middle of the stage.
    h.wrist.attach(g)
    g.visible = false
    const weapon: Weapon = {
      what: need.what,
      hand: need.hand,
      group: g,
      held: false,
      draw: () => {},
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
    weapons.set(need.what, weapon)
    strings.set(weapon, { update: made.update as (to: THREE.Vector3 | null, share: number) => void, seated: g.quaternion.clone() })
  }
  const at = (name: string) => bones.get(name)?.getWorldPosition(new THREE.Vector3()) ?? null

  // How the bow lay in the hand at the last moment it was drawn and raised.
  let aimed: THREE.Quaternion | null = null
  const shoot = (bow: Weapon, t: number, loosed: number) => {
    const [bowHand, drawHand] = [hands[bow.hand], hands[bow.hand === "L" ? "R" : "L"]]
    const string = strings.get(bow)
    if (!bowHand || !drawHand || !string) return
    const [left, right] = bow.hand === "L" ? ["Left", "Right"] : ["Right", "Left"]
    const drawn = t < loosed
    // Loosed, the drawing hand eases to a half curl, as a hand at rest is: a quarter closed, it splayed.
    close(drawHand, drawn ? HOOK : GRIP, drawn ? 1 : 0.5)
    root.updateWorldMatrix(true, true)
    // The string lies in the hook of the first two fingers at their middle joints, the arrow's nock between them, and
    // not at the knuckles: there it ran into the back of the hand.
    const [index2, middle2] = [at(`${right}HandIndex2`), at(`${right}HandMiddle2`)]
    const [grip, pull, hips, chest] = [at(`${left}Hand`), index2 && middle2 ? index2.lerp(middle2, 0.5) : at(`${right}HandMiddle1`), at("Hips"), at("Spine2")]
    if (!grip || !pull || !hips || !chest) return
    // The bow hangs in the hand until the hand is raised, then stands upright along the arrow's line: from the hand
    // that draws to the hand that holds, or the way the figure faces while the two are together.
    const line = grip.clone().sub(pull).setY(0)
    const ahead = line.length() > 0.2 ? line.normalize() : new THREE.Vector3(0, 0, 1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize()
    const up = new THREE.Vector3(0, 1, 0)
    const upright = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, ahead), up, ahead))
    const raised = THREE.MathUtils.smoothstep((grip.y - hips.y) / Math.max(0.05, chest.y - hips.y), 0.15, 0.75)
    // Stood upright while the string is drawn, and once it is loosed held as it lay in the hand at the loosing, so it
    // goes where the hand goes, as a gripped bow does. Kept upright as the hand swung on, it slid out of the fingers and
    // they held air. Eased back to lie as the fingers first closed round it, it swung across the face.
    const parent = bow.group.parent
    if (!parent) return
    if (t < loosed || !aimed) {
      const hung = parent.getWorldQuaternion(new THREE.Quaternion()).multiply(string.seated)
      bow.group.quaternion.copy(parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(hung.slerp(upright, raised)))
      if (t < loosed && raised > 0.9) aimed = bow.group.quaternion.clone()
    } else bow.group.quaternion.copy(aimed)
    bow.group.updateWorldMatrix(false, true)
    // The string goes back with the drawing hand once the hand is behind it, and flies straight when the clip looses.
    const to = bow.group.worldToLocal(pull.clone())
    const behind = drawn && raised > 0.9 && to.z < -0.17
    string.update(behind ? to : null, 1)
  }

  let shown: Weapon | null = null
  return {
    weapons,
    show: (clip) => {
      const need = clip ? holds(clip) : undefined
      shown = need ? (weapons.get(need.what) ?? null) : null
      for (const w of weapons.values()) w.group.visible = w === shown
      return shown
    },
    after: (clip, t) => {
      const need = holds(clip)
      const weapon = need ? weapons.get(need.what) : null
      const h = need ? hands[need.hand] : null
      if (!weapon || !h || weapon !== shown) return
      grip(h, grips.get(weapon.what) ?? new Map())
      if (weapon.what === "bow") shoot(weapon, t, LOOSED[clip] ?? Number.POSITIVE_INFINITY)
    },
    // Closed on as it hangs, the bow loosed and its string straight, the other hand easy.
    rest: (clip) => {
      const need = holds(clip)
      const weapon = need ? weapons.get(need.what) : null
      const h = need ? hands[need.hand] : null
      if (!weapon || !h || weapon !== shown) return
      grip(h, grips.get(weapon.what) ?? new Map())
      if (weapon.what === "bow") shoot(weapon, Number.POSITIVE_INFINITY, 0)
    },
    dispose: () => {
      for (const w of weapons.values()) w.dispose()
    },
  }
}

// A hand to hold something handed over in (models.ts, hold): a seat across the palm under the knuckles, carried by
// the wrist, where a tube `thick` metres round lies with its length across the hand, as a sword's grip does, and the
// fingers closed round it by `close`, over whatever the clip left them at, by a share. `open` puts them back as they
// were modelled, for a hand whose clip does not move its fingers. Call with the figure at rest.
export interface Grasp {
  seat: THREE.Object3D
  close: (share: number) => void
  open: () => void
}
export function grasp(root: THREE.Object3D, side: "L" | "R", thick: number): Grasp | null {
  root.updateWorldMatrix(true, true)
  const h = hand(skeleton(root), side)
  if (!h) return null
  const seat = new THREE.Group()
  seat.name = `grasp${side}`
  const y = h.across.clone()
  const z = h.palm.clone()
  const x = new THREE.Vector3().crossVectors(y, z).normalize()
  z.crossVectors(x, y).normalize()
  seat.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
  seat.position.copy(h.knuckle).addScaledVector(h.along, -0.012).addScaledVector(h.palm, thick + 0.016)
  const turns = round(h, seat.position, thick)
  h.wrist.attach(seat)
  const clip = h.joints.map(() => new THREE.Quaternion())
  return {
    seat,
    close: (share) => {
      if (share <= 0) return
      h.joints.forEach((j, i) => clip[i].copy(j.bone.quaternion))
      grip(h, turns)
      h.joints.forEach((j, i) => j.bone.quaternion.copy(clip[i].slerp(j.bone.quaternion, Math.min(1, share))))
    },
    open: () => {
      for (const j of h.joints) j.bone.quaternion.copy(j.rest)
    },
  }
}

const Y = new THREE.Vector3(0, 1, 0)

// The staff a figure with such hands carries, as its skeleton says (props.ts `heldBy`: pilot.ts leaves the brief's
// `holds` on it). props.ts stands a staff beside a figure rig.py rigged, and this does the same by the same measures:
// the staff is planted on the ground, the arm is bent to it over whatever the clip did with that arm, the hand is
// turned thumb uppermost with the staff across the palm under the knuckles, and the fingers are closed on it. The
// staff turns on its foot as the hand sways, so it follows every clip. `update` is called each frame after the clip
// has moved the figure. Its `weight` is how much the figure stands, 1 to 0: as it falls the arm goes back to the clip
// and the staff is let fall beside it.
// Call with the figure at rest, before any clip has moved it. `ground` is where its feet are, in its own space.
export function carry(root: THREE.Object3D, ground: number) {
  const held = heldBy(root)
  if (!held) return null
  root.updateWorldMatrix(true, true)
  const bones = skeleton(root)
  const s = held.hand === "L" ? "Left" : "Right"
  const h = hand(bones, held.hand)
  const [upper, fore, head] = [`${s}Arm`, `${s}ForeArm`, "Head"].map((n) => bones.get(n))
  // The bone between arm and trunk that pilot.ts hangs the shoulder on: it is kept half way to the arm, as its keys are.
  const half = bones.get(`${s}ArmHalf`)
  // The bone that rolls the forearm's skin with the hand, as its keys have it: the arm is put where it is here and
  // not by the clip, so the clip's roll is none of this arm's, and it is laid flat while the staff is carried.
  const rolled = bones.get(`${s}ForeArmRoll`)
  const flat = new THREE.Quaternion()
  if (!h || !upper || !fore || !head) return null
  // The figure's left is +x, so its right hand is at -x.
  const side = held.hand === "L" ? 1 : -1
  // Everything below is in the figure's own space: its root may be turned, moved and scaled by whoever stands it.
  const own = new THREE.Quaternion()
  const local = (o: THREE.Object3D) => root.worldToLocal(o.getWorldPosition(new THREE.Vector3()))
  const turned = (o: THREE.Object3D | null) => (o ? own.clone().invert().multiply(o.getWorldQuaternion(new THREE.Quaternion())) : new THREE.Quaternion())
  root.getWorldQuaternion(own)
  const tall = local(head).y - ground
  // Where the wrist goes: out from the shoulder and forward of it, at the height of the chest. The elbow hangs under
  // it at the side, so the forearm rises to the hand.
  const reach = new THREE.Vector3(side * 0.1, -0.085, 0.15).multiplyScalar(tall)
  const pole = new THREE.Vector3(side * 0.12, -1, -0.3).normalize()
  const wrist = h.wrist
  const atRest = turned(wrist).invert()
  // The hand as it was modelled, in its own space: along the fingers, toward the thumb, and where the staff lies in it.
  // A hand modelled closed round a rod (pilot.ts) holds the staff where the rod was and the way it ran, thumb
  // uppermost as the sheet painted it. Its fingers are left as modelled: the rigger laid their bones straight through
  // the fist, so a clip that curls them would pull it apart.
  const way = wayThrough(root)
  const runs = way?.runs.clone().transformDirection(root.matrixWorld)
  const [fingers, thumbward] = runs ? [h.along.clone().addScaledVector(runs, -h.along.dot(runs)).normalize(), runs] : [h.along, h.across]
  const [alongHand, acrossHand] = [fingers.clone().applyQuaternion(own.clone().invert()).applyQuaternion(atRest), thumbward.clone().applyQuaternion(own.clone().invert()).applyQuaternion(atRest)]
  const modelled = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(alongHand, acrossHand, alongHand.clone().cross(acrossHand)))
  const seat = wrist.worldToLocal(way ? root.localToWorld(way.at.clone()) : h.knuckle.clone().addScaledVector(h.along, -0.012).addScaledVector(h.palm, 0.03))
  const alongFore = wrist.position.clone().normalize()
  const upperRest = upper.quaternion.clone()
  const prop = way ? staff(held.length, -1, way.wide * 0.97) : staff(held.length, local(upper).y + reach.y - ground)
  prop.traverse((m) => {
    if (m instanceof THREE.Mesh) m.castShadow = m.receiveShadow = true
  })
  root.add(prop)
  // A bone turned so the next joint down lies the way wanted, by the least turn from where the clip left it.
  const aim = (bone: THREE.Object3D, child: THREE.Object3D, want: THREE.Vector3) => {
    const turn = new THREE.Quaternion().setFromUnitVectors(local(child).sub(local(bone)).normalize(), want)
    bone.quaternion.copy(
      turned(bone.parent)
        .invert()
        .multiply(turn.multiply(turned(bone)))
    )
    bone.updateWorldMatrix(false, true)
  }
  let foot: THREE.Vector3 | null = null
  const stand = new THREE.Vector3(0, 1, 0)
  const lying = new THREE.Vector3(side * 0.3, 0.02, 1).normalize()
  const update = (weight = 1) => {
    root.updateWorldMatrix(true, true)
    root.getWorldQuaternion(own)
    const clip = [upper.quaternion.clone(), fore.quaternion.clone(), wrist.quaternion.clone()]
    const [at, a, b] = [local(upper), local(upper).distanceTo(local(fore)), local(fore).distanceTo(local(wrist))]
    // The elbow, by the two lengths of the arm: on the side of the line from shoulder to wrist that the pole is.
    const to = reach.clone()
    const d = THREE.MathUtils.clamp(to.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3)
    to.normalize()
    const along = (a * a + d * d - b * b) / (2 * a * d)
    const off = pole.clone().addScaledVector(to, -pole.dot(to)).normalize()
    const elbow = at
      .clone()
      .addScaledVector(to, a * along)
      .addScaledVector(off, a * Math.sqrt(Math.max(0, 1 - along * along)))
    const level = at.clone().addScaledVector(to, d).sub(elbow).normalize()
    aim(upper, fore, elbow.clone().sub(at).normalize())
    aim(fore, wrist, level)
    // The fist grips along its knuckles, thumb uppermost, pointing as near the forearm's way as the staff allows.
    const points = level.clone().addScaledVector(stand, -level.dot(stand)).normalize()
    const gripped = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(points, stand, points.clone().cross(stand)))
    const turnHand = turned(fore).invert().multiply(gripped).multiply(modelled.clone().invert())
    // What of that turn is a roll about the forearm is mostly the forearm's to make, and the rest is the wrist's
    // (props.ts says why it is read off the turn itself).
    const about = turnHand.x * alongFore.x + turnHand.y * alongFore.y + turnHand.z * alongFore.z
    const roll = new THREE.Quaternion(alongFore.x * about, alongFore.y * about, alongFore.z * about, turnHand.w)
    if (roll.lengthSq() > 1e-8) {
      roll.normalize()
      if (roll.w < 0) roll.set(-roll.x, -roll.y, -roll.z, -roll.w)
      const above = new THREE.Quaternion().slerp(roll, 0.6)
      fore.quaternion.multiply(above)
      turnHand.premultiply(above.clone().invert())
    }
    wrist.quaternion.copy(turnHand)
    if (weight < 1) {
      upper.quaternion.copy(clip[0].slerp(upper.quaternion, weight))
      fore.quaternion.copy(clip[1].slerp(fore.quaternion, weight))
      wrist.quaternion.copy(clip[2].slerp(wrist.quaternion, weight))
    }
    half?.quaternion.copy(upperRest).slerp(upper.quaternion, 0.5)
    rolled?.quaternion.slerp(flat, weight)
    close(h, GRIP, way ? 0 : weight)
    upper.parent?.updateWorldMatrix(false, true)
    const grip = root.worldToLocal(wrist.localToWorld(seat.clone()))
    // Planted where it first stood, a hand's width farther from the feet than the hand is: it leans in a little.
    foot ??= new THREE.Vector3(grip.x + side * 0.03, ground, grip.z + 0.05)
    stand.copy(grip).sub(foot).normalize()
    // Let fall, it lies on the ground and not half in it.
    prop.position.copy(foot).setY(foot.y + (1 - weight) * 0.03)
    const runs =
      weight < 1
        ? stand
            .clone()
            .lerp(lying, 1 - weight)
            .normalize()
        : stand
    prop.quaternion.setFromUnitVectors(Y, runs)
  }
  // Twice, so the fist has turned to the staff it stands on.
  update()
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
