// A skinned figure posed at a moment of a clip, for the checks that measure it (armcheck.ts, legcheck.ts).

import type { Animation, Node } from "@gltf-transform/core"
import { reader } from "./retarget"

export type Mat = number[]

// Column-major 4x4 matrices, as glTF keeps them.
export const mul = (a: Mat, b: Mat): Mat => {
  const out = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return out
}
export const local = (t: number[], [x, y, z, w]: number[], s: number[]): Mat => [
  (1 - 2 * (y * y + z * z)) * s[0],
  2 * (x * y + w * z) * s[0],
  2 * (x * z - w * y) * s[0],
  0,
  2 * (x * y - w * z) * s[1],
  (1 - 2 * (x * x + z * z)) * s[1],
  2 * (y * z + w * x) * s[1],
  0,
  2 * (x * z + w * y) * s[2],
  2 * (y * z - w * x) * s[2],
  (1 - 2 * (x * x + y * y)) * s[2],
  0,
  t[0],
  t[1],
  t[2],
  1,
]
export const angle = (a: number[], b: number[]) =>
  (Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b) || 1)))) * 180) / Math.PI

// Every node's place in the world at a time of a clip, its parents' above it. With no clip, the figure at rest.
export function posed(clip: Animation | null) {
  const read = clip ? reader(clip) : null
  return (time: number) => {
    const memo = new Map<Node, Mat>()
    const world = (node: Node): Mat => {
      const had = memo.get(node)
      if (had) return had
      const up = node.getParentNode()
      const own = read ? local(read(node, "translation", time), read(node, "rotation", time), node.getScale()) : local(node.getTranslation(), node.getRotation(), node.getScale())
      const now = up ? mul(world(up), own) : own
      memo.set(node, now)
      return now
    }
    return world
  }
}

// A point of the mesh moved by its bones: `skinned` is each joint's world matrix times its inverse bind.
export function skinPoint(p: number[], j: number[], w: number[], skinned: Mat[]) {
  const out = [0, 0, 0]
  for (let k = 0; k < 4; k++) {
    if (!w[k]) continue
    const m = skinned[j[k]]
    for (let r = 0; r < 3; r++) out[r] += w[k] * (m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r])
  }
  return out
}
