// A rigged figure armed for its moves (clips.ts): the weapons each move puts in its hands (weapons.ts), shown while it
// plays, and its arms put where the move needs them once the clip has turned its bones. A clip turns each bone on its
// own, and that neither holds a bow up nor brings a hand to the jaw, so Shoot and Swing are finished here, by the two
// lengths of the arm (reachArm). The game's figures (models.ts) and the asset library's page both use it, so the page
// shows what the game plays.

import * as THREE from "three"
import { DRAW, IN_HAND, shooting, swinging } from "./clips"
import { bowAim, heldBow, pointAlong, reachArm, standUpright, turnHandTo, type Weapon, weaponIn } from "./weapons"

export interface Armed {
  weapons: Map<string, Weapon>
  // The weapon a move needs, or none: shows it, and hides any other that is not held through a hand.
  show: (clip: string | null) => Weapon | null
  // Called each frame after the clip has moved the figure: `t` is seconds into the move and `weight` how much of it
  // plays, 0 to 1.
  after: (clip: string, t: number, weight: number) => void
  dispose: () => void
}

// Call with the figure at rest, before any clip has moved it. `height` is its own, as modelled. `moves` are the clips
// whose weapons it needs. A bow held through a hand made round a rod is carried at all times.
export function arm(root: THREE.Object3D, moves: string[], height: number): Armed {
  const weapons = new Map<string, Weapon>()
  const kept = heldBow(root)
  const keptBow = kept ? weaponIn(root, "bow", kept.hand, kept) : null
  if (keptBow) weapons.set("bow", keptBow)
  for (const clip of moves) {
    const need = IN_HAND[clip]
    if (!need || weapons.has(need.what)) continue
    const made = weaponIn(root, need.what, need.hand)
    if (made) weapons.set(need.what, made)
  }
  const size = height / 1.8
  const at = (name: string) => {
    const o = root.getObjectByName(name)
    return o ? root.worldToLocal(o.getWorldPosition(new THREE.Vector3())) : null
  }
  const ahead = () => new THREE.Vector3(0, 0, 1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()))

  // A shot: the bow arm straight out ahead at the height of the shoulder, the drawing hand brought from beside it back
  // to the jaw, the bow facing the way the figure does, and the string drawn back with the hand and loosed. The bow is
  // in the left hand unless one held through the right says otherwise; the clip turns the body for the left.
  const shoot = (t: number, v: number) => {
    const bow = weapons.get("bow") ?? null
    const side = bow?.hand ?? "L"
    const other = side === "L" ? "R" : "L"
    // The figure's own +x is its left.
    const sx = side === "L" ? 1 : -1
    const { raise, draw } = shooting(t)
    root.updateWorldMatrix(true, true)
    const [shoulder, head, hand, fore] = [at(`upperarm${side}`), at("head"), at(`hand${side}`), at(`forearm${side}`)]
    if (!shoulder || !head || !hand || !fore) return
    // The figure's own +z is ahead: it is turned to face its target.
    const reach = (shoulder.distanceTo(fore) + fore.distanceTo(hand)) * 0.97
    const bowWrist = shoulder.clone().add(new THREE.Vector3(0, 0.03 * size, reach))
    reachArm(root, side, bowWrist, new THREE.Vector3(sx, -0.6, 0), raise * v)
    // The arrow's line runs back from the bow hand to under the chin, on the drawing side. Drawn farther, to the jaw,
    // the drawing elbow rises over the shoulder and the arm folds shut, and a mesh modelled with its arms down crumples
    // at the shoulder and the elbow.
    const anchor = new THREE.Vector3(head.x - 0.07 * size * sx, bowWrist.y - 0.08 * size, head.z + 0.1 * size)
    const nock = bowWrist.clone().add(new THREE.Vector3(-0.08 * sx, -0.04, -0.3).multiplyScalar(size))
    // Once loosed, the hand stays where it was, and the arm comes down with the bow. Flung back past the chin, the
    // drawing arm has to straighten and rise over the shoulder to follow it.
    const drawWrist = nock.clone().lerp(anchor, t >= DRAW[2] ? 1 : draw)
    reachArm(root, other, drawWrist, new THREE.Vector3(-1 * sx, 0.1, -0.7), raise * v)
    if (!bow) return
    // A bow held through the hand is aimed by turning the hand; one put in an open hand is turned itself. A hand made
    // round a rod as one holds a staff has the rod nearly along the forearm, so the bow is aimed broadside on and
    // canted to the side as archers do, which bends the wrist least (bowAim).
    if (bow.held) {
      const loose = bow.group.getWorldQuaternion(new THREE.Quaternion())
      turnHandTo(bow, loose.clone().slerp(bowAim(loose, ahead()), raise * v))
    } else standUpright(bow, ahead())
    bow.draw(t < DRAW[0] || t >= DRAW[2] ? 0 : Math.min(1, (t - DRAW[0]) / (DRAW[1] - DRAW[0])))
  }

  // A cut: the sword hand from over and behind the right shoulder, the blade laid back, down through in front of the
  // chest and across, the blade come over and pointing ahead and down.
  const swing = (t: number, v: number) => {
    const sword = weapons.get("sword") ?? null
    const { wound, through, arm: share } = swinging(t)
    root.updateWorldMatrix(true, true)
    const s = at("upperarmR")
    if (!s) return
    // The figure's own +z is ahead, +x its left.
    const back = new THREE.Vector3(0.02, 0.32, -0.16).multiplyScalar(size)
    const forth = new THREE.Vector3(0.24, -0.08, 0.5).multiplyScalar(size)
    reachArm(root, "R", s.clone().add(back.lerp(forth, through)), new THREE.Vector3(-1, -0.4, -0.2), share * v)
    // Before the wind-up has the blade, it rises from where the hand had it.
    if (sword && wound + through > 0.05) {
      const laid = new THREE.Vector3(-0.15, -0.35, -1).lerp(new THREE.Vector3(0.15, -0.4, 1), through).normalize()
      pointAlong(sword, laid.applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())))
    }
  }

  return {
    weapons,
    show: (clip) => {
      const need = clip ? IN_HAND[clip] : undefined
      const weapon = need ? (weapons.get(need.what) ?? null) : null
      for (const w of weapons.values()) w.group.visible = w.held || w === weapon
      if (weapon?.what === "bow") weapon.draw(0)
      return weapon
    },
    after: (clip, t, weight) => {
      if (weight <= 0) return
      if (clip === "Shoot") shoot(t, weight)
      else if (clip === "Swing") swing(t, weight)
    },
    dispose: () => {
      for (const w of weapons.values()) w.dispose()
    },
  }
}
