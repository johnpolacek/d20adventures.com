// A sword and a bow in the hands of a figure rigged with finger bones under Mixamo's names (asset-library's pilot.ts:
// Rodin's model rigged by Hyper3D or Meshy), moved by clips borrowed from a library (retarget.ts).
//
// fight.ts arms a figure rig.py rigged: its hand is one bone, so a weapon is stood on an open palm, and its clips are
// written turns, so the arms are put where a shot wants them after the clip has played. Here the clip is a whole
// move already and the hand has its fingers. So the weapon is seated across the palm under the knuckles, the fingers
// are closed round it while it shows, a bow is stood upright along the arrow's line, and its string goes back with the
// hand that draws it until the clip looses it.

import * as THREE from "three"
import { IN_HAND } from "./clips"
import type { Armed } from "./fight"
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
  joints: { bone: THREE.Object3D; rest: THREE.Quaternion; about: THREE.Vector3; step: number; thumb: boolean }[]
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
  const closing = (name: string, about: THREE.Vector3, step: number, thumb: boolean) => {
    const bone = bones.get(name)
    if (!bone) return
    joints.push({ bone, rest: bone.quaternion.clone(), about: about.clone().applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize(), step, thumb })
  }
  for (const finger of FINGERS) {
    const [a, b] = [bones.get(`${s}Hand${finger}1`), bones.get(`${s}Hand${finger}2`)]
    if (!a || !b) continue
    // A finger closes toward the palm: about the line square to both.
    const about = new THREE.Vector3().crossVectors(at(b).sub(at(a)).normalize(), palm).normalize()
    for (const step of [1, 2, 3]) closing(`${s}Hand${finger}${step}`, about, step, false)
  }
  const [t1, t2] = [bones.get(`${s}HandThumb1`), bones.get(`${s}HandThumb2`)]
  if (t1 && t2) {
    // The thumb closes over the fingers: toward the first knuckle, a little into the palm.
    const to = at(index).addScaledVector(palm, 0.03).sub(at(t1)).normalize()
    const about = new THREE.Vector3().crossVectors(at(t2).sub(at(t1)).normalize(), to).normalize()
    for (const step of [1, 2, 3]) closing(`${s}HandThumb${step}`, about, step, true)
  }
  return { wrist, along, across, palm, knuckle: at(middle), joints }
}

// A hand's fingers closed by a share of the angles given, over whatever the clip left them at.
function close(h: Hand, fingers: number[], share: number) {
  const turn = new THREE.Quaternion()
  for (const j of h.joints) {
    const degrees = (j.thumb ? THUMB : fingers)[j.step - 1] * share
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
    g.traverse((m) => {
      if (m instanceof THREE.Mesh) m.castShadow = m.receiveShadow = true
    })
    // Placed in the world, then handed to the wrist to carry.
    const scene = root.parent ?? root
    scene.add(g)
    scene.updateWorldMatrix(true, true)
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

  const shoot = (bow: Weapon, t: number, loosed: number) => {
    const [bowHand, drawHand] = [hands[bow.hand], hands[bow.hand === "L" ? "R" : "L"]]
    const string = strings.get(bow)
    if (!bowHand || !drawHand || !string) return
    const [left, right] = bow.hand === "L" ? ["Left", "Right"] : ["Right", "Left"]
    const drawn = t < loosed
    close(drawHand, drawn ? HOOK : GRIP, drawn ? 1 : 0.25)
    root.updateWorldMatrix(true, true)
    const [grip, pull, hips, chest] = [at(`${left}Hand`), at(`${right}HandMiddle1`), at("Hips"), at("Spine2")]
    if (!grip || !pull || !hips || !chest) return
    // The bow hangs in the hand until the hand is raised, then stands upright along the arrow's line: from the hand
    // that draws to the hand that holds, or the way the figure faces while the two are together.
    const line = grip.clone().sub(pull).setY(0)
    const ahead = line.length() > 0.2 ? line.normalize() : new THREE.Vector3(0, 0, 1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize()
    const up = new THREE.Vector3(0, 1, 0)
    const upright = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, ahead), up, ahead))
    const raised = THREE.MathUtils.smoothstep((grip.y - hips.y) / Math.max(0.05, chest.y - hips.y), 0.15, 0.75)
    const parent = bow.group.parent
    if (!parent) return
    const hung = parent.getWorldQuaternion(new THREE.Quaternion()).multiply(string.seated)
    bow.group.quaternion.copy(parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(hung.slerp(upright, raised)))
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
      close(h, GRIP, 1)
      if (weapon.what === "bow") shoot(weapon, t, LOOSED[clip] ?? Number.POSITIVE_INFINITY)
    },
    dispose: () => {
      for (const w of weapons.values()) w.dispose()
    },
  }
}
