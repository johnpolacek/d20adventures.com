// A cloak's back hung on bones of its own, and swung clear of the legs in every clip.
//
// A rigger shares each point among the bones nearest it, and the back of a cloak that hangs behind the legs is nearest
// the shins: Silas's, from knee to hem, was the shins' alone, and at the hips a third of it was the upper arms'. In the
// walk the cloak was torn up the middle, each half carried on a shin, and seen from the side wrapped round the knee.
//
// Two chains, one down each half of the back, hang from the hips. What lies behind the legs below the hips is given to
// them, more and more as it lies further out from the leg, so the trousers stay on the legs. In every clip each link
// hangs as gravity has it, below the hips as they lean, and is swung back as far as it must be to pass behind the legs
// with the room it had at rest. It comes after them a little late, as cloth does, but never into a leg. The keys are in
// the clips like any other bone's: the game plays them and knows nothing of it.
//
// A brief with "cloak": true has it (pilot.ts). Returns what was made, or null for a figure with no cloak to find.

import type { Document, Node } from "@gltf-transform/core"
import * as THREE from "three"
import { type Quat, qinv, qmul } from "./quat"
import { reader } from "./retarget"

const LINKS = 3
// How quickly a link comes after where it should hang, and how little it overshoots: about a tenth of a second late.
const SPRING = 2 * Math.PI * 1.6
const DAMP = 0.6
const RAD = Math.PI / 180
// Passes of smoothing the cloak's share over the mesh: each reaches about one edge further.
const SMOOTH = 12

const eased = (v: number, from: number, to: number) => {
  const t = Math.max(0, Math.min(1, (v - from) / (to - from)))
  return t * t * (3 - 2 * t)
}
// A turn about the figure's own line from side to side: a link swung back by a positive angle.
const swing = (a: number): Quat => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)]
// A link's angle back from straight down, and the way it runs at that angle, in the figure's own up and forward.
const angleOf = (y: number, z: number) => Math.atan2(-z, -y)
const runs = (a: number) => [-Math.cos(a), -Math.sin(a)]

export function cloak(doc: Document, big = 1) {
  const skin = doc.getRoot().listSkins()[0]
  const bind = skin?.getInverseBindMatrices()
  if (!skin || !bind) return null
  const joints = skin.listJoints()
  const find = (bone: string) => joints.find((j) => new RegExp(`(^|:)${bone}$`).test(j.getName()))
  const hips = find("Hips")
  const legs = ["Left", "Right"].map((s) => [find(`${s}UpLeg`), find(`${s}Leg`), find(`${s}Foot`)])
  if (!hips || legs.some((leg) => leg.some((n) => !n))) return null
  const at = (n: Node) => n.getWorldMatrix().slice(12, 15)
  const hip = at(hips)
  // The leg's line at a height, at rest: where across and how far forward it runs there.
  const legAt = (side: number, y: number) => {
    const [a, b, c] = legs[side].map((n) => at(n as Node))
    const [from, to] = y > b[1] ? [a, b] : [b, c]
    const t = Math.max(0, Math.min(1, (from[1] - y) / (from[1] - to[1] || 1)))
    return [from[0] + (to[0] - from[0]) * t, from[2] + (to[2] - from[2]) * t]
  }

  // What is cloak: below the hips, behind the leg and out from it, and not the hand or the wrist that hangs beside the
  // thigh, which is left to its arm. A cut at a width instead left the cloak's sides half on the leg and half on the
  // chain, and in the stride its lining was drawn out between them in a pale sheet.
  const arms = ["Left", "Right"].flatMap((s) => {
    const [fore, hand] = [find(`${s}ForeArm`), find(`${s}Hand`)]
    return fore && hand ? [[at(fore), at(hand)]] : []
  })
  const byHand = (p: number[]) =>
    Math.min(
      ...arms.map(([a, b]) => {
        const along = [0, 1, 2].map((k) => b[k] - a[k])
        const long = along[0] ** 2 + along[1] ** 2 + along[2] ** 2 || 1
        // Past the wrist to the fingertips, a hand's length on.
        const t = Math.max(0, Math.min(1.8, ((p[0] - a[0]) * along[0] + (p[1] - a[1]) * along[1] + (p[2] - a[2]) * along[2]) / long))
        return Math.hypot(...[0, 1, 2].map((k) => p[k] - a[k] - along[k] * t))
      })
    )
  const prims = doc
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .filter((p) => p.getAttribute("POSITION") && p.getAttribute("JOINTS_0") && p.getAttribute("WEIGHTS_0"))
  const share = (p: number[]) => {
    if (p[1] >= hip[1]) return 0
    const side = p[0] >= 0 ? 0 : 1
    const [lx, lz] = legAt(side, p[1])
    const behind = lz - p[2]
    const out = Math.hypot(p[0] - lx, p[2] - lz)
    return eased(behind, 0.02 * big, 0.06 * big) * eased(out, 0.09 * big, 0.14 * big) * eased(hip[1] - p[1], 0, 0.12 * big) * eased(byHand(p), 0.06 * big, 0.1 * big)
  }
  const columns: number[][][] = [[], []]
  for (const prim of prims) {
    const pos = prim.getAttribute("POSITION")!
    for (let i = 0; i < pos.getCount(); i++) {
      const p = pos.getElement(i, [0, 0, 0])
      if (share(p) > 0.5) columns[p[0] >= 0 ? 0 : 1].push(p)
    }
  }
  if (columns.some((c) => c.length < 200)) return null

  // Each chain's links, from the hips to the hem, through the middle of its half of the cloak.
  const top = hip[1] - 0.04 * big
  const chains = columns.map((points) => {
    const hem = Math.min(...points.map((p) => p[1]))
    const step = (top - hem) / LINKS
    const x = points.reduce((sum, p) => sum + p[0], 0) / points.length
    const heads = Array.from({ length: LINKS + 1 }, (_, k) => {
      const y = top - k * step
      const near = points.filter((p) => Math.abs(p[1] - y) < step / 2)
      const z = near.length ? near.reduce((sum, p) => sum + p[2], 0) / near.length : hip[2] - 0.1 * big
      return [x, y, z]
    })
    return { hem, step, heads }
  })

  // The bones, square to the world at rest as every helper is, and their bind matrices from where they stand.
  const binds = [...(bind.getArray() ?? [])]
  const hipsRot = hips.getWorldRotation() as Quat
  const bones = chains.map((chain, c) => {
    const made: Node[] = []
    let parent = hips
    for (let k = 0; k < LINKS; k++) {
      const node = doc.createNode(`Cloak${c ? "Right" : "Left"}${k + 1}`)
      const inv = new THREE.Matrix4().fromArray(parent.getWorldMatrix()).invert()
      const local = new THREE.Vector3(...chain.heads[k]).applyMatrix4(inv)
      node.setTranslation([local.x, local.y, local.z])
      if (k === 0) node.setRotation(qinv(hipsRot))
      parent.addChild(node)
      skin.addJoint(node)
      binds.push(...new THREE.Matrix4().fromArray(node.getWorldMatrix()).invert().toArray())
      made.push(node)
      parent = node
    }
    return made
  })
  bind.setArray(new Float32Array(binds))
  const index = (node: Node) => skin.listJoints().indexOf(node)

  // The cloak's points given to the chains: across between the two, and along between the links about them.
  // The share is smoothed over the mesh, each point toward the points it shares an edge with. A generated cloak is
  // fused to the trousers and has a thickness, and a share that went from none to all over a few millimetres tore it
  // at the seam: in the walk twice as many edges were drawn out to double their length as before there were chains.
  let moved = 0
  for (const prim of prims) {
    const [pos, J, W] = [prim.getAttribute("POSITION")!, prim.getAttribute("JOINTS_0")!, prim.getAttribute("WEIGHTS_0")!]
    const shareOf = new Float32Array(pos.getCount())
    for (let i = 0; i < pos.getCount(); i++) shareOf[i] = share(pos.getElement(i, [0, 0, 0]))
    const idx = prim.getIndices()
    if (idx) {
      const next = new Float32Array(pos.getCount())
      const count = new Float32Array(pos.getCount())
      for (let pass = 0; pass < SMOOTH; pass++) {
        next.set(shareOf)
        count.fill(1)
        for (let f = 0; f < idx.getCount(); f += 3) {
          const [a, b, c] = [idx.getScalar(f), idx.getScalar(f + 1), idx.getScalar(f + 2)]
          for (const [u, v] of [
            [a, b],
            [b, c],
            [c, a],
          ]) {
            next[u] += shareOf[v]
            next[v] += shareOf[u]
            count[u]++
            count[v]++
          }
        }
        // None is given above the hips, however its neighbours lean.
        for (let i = 0; i < shareOf.length; i++) shareOf[i] = pos.getElement(i, [0, 0, 0])[1] >= hip[1] ? 0 : next[i] / count[i]
      }
    }
    for (let i = 0; i < pos.getCount(); i++) {
      const p = pos.getElement(i, [0, 0, 0])
      const c = shareOf[i]
      if (c < 1e-3) continue
      const [j, w] = [J.getElement(i, [0, 0, 0, 0]), W.getElement(i, [0, 0, 0, 0])]
      const shares = new Map<number, number>()
      for (const [k, bone] of j.entries()) if (w[k] > 0) shares.set(bone, (shares.get(bone) ?? 0) + w[k] * (1 - c))
      const whole = w.reduce((sum, v) => sum + v, 0)
      const left = eased(p[0], -0.06 * big, 0.06 * big)
      for (const [side, of] of [
        [0, left],
        [1, 1 - left],
      ]) {
        if (of < 1e-3) continue
        const chain = chains[side]
        const t = Math.max(0, Math.min(LINKS - 1, (top - p[1]) / chain.step - 0.5))
        const k = Math.min(LINKS - 2, Math.floor(t))
        const f = t - k
        for (const [link, part] of [
          [k, 1 - f],
          [k + 1, f],
        ]) {
          const bone = index(bones[side][link])
          shares.set(bone, (shares.get(bone) ?? 0) + whole * c * of * part)
        }
      }
      const kept = [...shares].sort((x, y) => y[1] - x[1]).slice(0, 4)
      const total = kept.reduce((sum, [, v]) => sum + v, 0) || 1
      J.setElement(
        i,
        [0, 1, 2, 3].map((k) => kept[k]?.[0] ?? 0)
      )
      W.setElement(
        i,
        [0, 1, 2, 3].map((k) => ((kept[k]?.[1] ?? 0) / total) * whole)
      )
      moved++
    }
  }

  // At rest: each link's length, its angle back from straight down, and the room between it and the leg in front.
  const rest = chains.map((chain) =>
    Array.from({ length: LINKS }, (_, k) => {
      const [a, b] = [chain.heads[k], chain.heads[k + 1]]
      return { long: Math.hypot(b[1] - a[1], b[2] - a[2]), angle: angleOf(b[1] - a[1], b[2] - a[2]) }
    })
  )
  // How far in front of a link a leg's points are, as the link swings, for the points level with it.
  const clear = (head: number[], angle: number, long: number, points: number[][]) => {
    const [dy, dz] = runs(angle)
    const [ny, nz] = [-Math.sin(angle), Math.cos(angle)]
    let least = Infinity
    for (const q of points) {
      const [vy, vz] = [q[1] - head[1], q[2] - head[2]]
      const along = vy * dy + vz * dz
      if (along < 0 || along > long + 0.05 * big) continue
      least = Math.min(least, vy * ny + vz * nz)
    }
    return least
  }
  const sample = (thigh: number[], knee: number[], ankle: number[]) => {
    const points: number[][] = []
    for (const [a, b] of [
      [thigh, knee],
      [knee, ankle],
    ])
      for (let s = 0; s <= 8; s++) points.push([0, 1, 2].map((k) => a[k] + ((b[k] - a[k]) * s) / 8))
    return points
  }
  const restLegs = legs.map((leg) => sample(...(leg.map((n) => at(n as Node)) as [number[], number[], number[]])))
  const room = chains.map((chain, c) =>
    rest[c].map(({ angle, long }, k) => {
      const r = clear(chain.heads[k], angle, long, restLegs[c])
      return Math.max(0.03 * big, Math.min(0.1 * big, Number.isFinite(r) ? r : 0.1 * big))
    })
  )

  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer()
  const hipsRest = new THREE.Quaternion(...hipsRot)
  let most = 0
  let where = ""
  for (const clip of doc.getRoot().listAnimations()) {
    const read = reader(clip)
    // The keys of the bone keyed most often stand for the clip's frames.
    const input = clip
      .listSamplers()
      .map((s) => s.getInput())
      .filter((a) => !!a)
      .sort((a, b) => b!.getCount() - a!.getCount())[0]
    if (!input || input.getCount() < 2) continue
    const times = Array.from(input.getArray() ?? [])
    const world = new Map<Node, THREE.Matrix4>()
    const posed = (node: Node, time: number): THREE.Matrix4 => {
      const had = world.get(node)
      if (had) return had
      const [t, r] = [read(node, "translation", time), read(node, "rotation", time)]
      const own = new THREE.Matrix4().compose(new THREE.Vector3(...t), new THREE.Quaternion(...r), new THREE.Vector3(...node.getScale()))
      const up = node.getParentNode()
      const m = up ? posed(up, time).clone().multiply(own) : own
      world.set(node, m)
      return m
    }
    // Whether the clip comes round to where it began, so it is played twice over and the cloak starts as it ends.
    const pose = (time: number) => {
      world.clear()
      const hipsAt = new THREE.Vector3()
      const hipsTurn = new THREE.Quaternion()
      posed(hips, time).decompose(hipsAt, hipsTurn, new THREE.Vector3())
      // The turn of the hips since rest: what the body has done, and the way down seen from it.
      const body = hipsTurn.clone().multiply(hipsRest.clone().invert())
      const unbody = body.clone().invert()
      const inBody = (n: Node) => {
        const p = new THREE.Vector3().setFromMatrixPosition(posed(n, time)).sub(hipsAt).applyQuaternion(unbody)
        return [p.x + hip[0], p.y + hip[1], p.z + hip[2]]
      }
      const down = new THREE.Vector3(0, -1, 0).applyQuaternion(unbody)
      return { legs: legs.map((leg) => sample(...(leg.map((n) => inBody(n as Node)) as [number[], number[], number[]]))), lean: angleOf(down.y, down.z), turn: body }
    }
    const first = pose(times[0])
    const last = pose(times[times.length - 1])
    const loops = first.turn.angleTo(last.turn) < 5 * RAD
    const angles = chains.map(() => Array.from({ length: times.length }, () => new Array<number>(LINKS).fill(0)))
    const state = chains.map((_, c) => rest[c].map(({ angle }) => ({ x: angle, v: 0 })))
    for (let pass = 0; pass < (loops ? 2 : 1); pass++) {
      for (let i = 0; i < times.length; i++) {
        const now = pose(times[i])
        const dt = i ? times[i] - times[i - 1] : 0
        for (let c = 0; c < chains.length; c++) {
          let head = chains[c].heads[0]
          for (let k = 0; k < LINKS; k++) {
            const { angle, long } = rest[c][k]
            // Where gravity hangs it, and then back until the leg in front has the room it had at rest.
            // In a roll or a fall the way down goes round the body. Cloth would wrap it, and a link cannot: it is held
            // to hanging back along the body at the most, and a little forward of the legs at the least.
            let want = angle + Math.max(-45 * RAD, Math.min(80 * RAD, now.lean))
            for (let n = 0; n < 70 && clear(head, want, long, now.legs[c]) < room[c][k]; n++) want += RAD
            const s = state[c][k]
            if (pass === 0 && i === 0 && !loops) s.x = want
            for (let sub = 0; sub < 4; sub++) {
              const h = dt / 4
              s.v += (SPRING * SPRING * (want - s.x) - 2 * DAMP * SPRING * s.v) * h
              s.x += s.v * h
            }
            const a = Math.max(s.x, want)
            angles[c][i][k] = a
            if (pass === (loops ? 1 : 0) && a - angle > most) [most, where] = [a - angle, `${clip.getName()}`]
            const [dy, dz] = runs(a)
            head = [head[0], head[1] + dy * long, head[2] + dz * long]
          }
        }
      }
    }
    for (const [c, made] of bones.entries())
      for (const [k, node] of made.entries()) {
        const values = new Float32Array(times.length * 4)
        for (let i = 0; i < times.length; i++) {
          const turn = angles[c][i][k] - rest[c][k].angle
          const before = k ? angles[c][i][k - 1] - rest[c][k - 1].angle : 0
          // The first link's turn is in the hips' own frame, which at rest is turned by hipsRot: square to the world
          // there. Each link after it turns on the one before.
          const q = k ? swing(turn - before) : qmul(qinv(hipsRot), swing(turn))
          values.set(q, i * 4)
        }
        const sampler = doc.createAnimationSampler().setInput(input).setOutput(doc.createAccessor().setType("VEC4").setArray(values).setBuffer(buffer)).setInterpolation("LINEAR")
        clip.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath("rotation").setSampler(sampler))
      }
  }
  return { moved, links: LINKS * chains.length, hem: chains.map((c) => c.hem), most: most / RAD, where }
}

