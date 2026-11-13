// A 3D figure built from a character's own paintings, with nothing from a third party: no model pack, no generator.
//
//   pnpm exec tsx lab/stage-art/figure.ts garlan
//
// In:  raw/<id>-apose-front.png and -back.png (the A-pose sheet `character.ts sheet` paints) and figures/<id>.json, which
//      gives the character's height and where the joints are on the front painting, in its pixels.
// Out: public/stage/figures/<id>.glb, a skinned mesh with Idle, Hit and Fall clips, and raw/<id>-figure-*.png to check by eye.
//
// How: the figure's outline is cut from the front painting and inflated into a rounded body (a membrane blown up
// from its edge: a limb comes out round, a torso deep and flattened). The front painting is laid on the front half
// and the back painting, turned about and fitted to the same outline, on the back half. The outline's exact edge is
// the texture's alpha, so the mesh stays coarse. Bones are placed at the joints, each point of the body follows the
// bones nearest to it going through the body (never across a gap, so a hand beside a hip stays the arm's), and the
// three clips are written here as joint turns.

import { mkdir, readFile, writeFile } from "node:fs/promises"
import sharp from "sharp"

const RAW = "lab/stage-art/raw"
const OUT = "public/stage/figures"
// The mesh's grid, in painting pixels: about 1.6 cm on a 1.9 m figure painted 980 px tall.
const CELL = 8
// How deep the body may get, as a share of the figure's height, and how much rounder than a plain membrane.
const DEPTH_CAP = 0.08
const DEPTH_GAIN = 1.2
const FPS = 30

type P2 = [number, number]
interface Spec {
  height: number
  front: string
  back: string
  joints: Record<string, P2>
}
interface Img {
  w: number
  h: number
  d: Uint8Array
}

const load = async (file: string): Promise<Img> => {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { w: info.width, h: info.height, d: new Uint8Array(data) }
}

// The figure's cover: everything the flat backdrop does not reach from the frame's edge. The edge is taken in a pixel,
// since the backdrop's grey mixes into it, and then softened.
function cover(img: Img, tolerance = 20): Uint8Array {
  const { w, h, d } = img
  const ring: number[][] = [[], [], []]
  for (let x = 0; x < w; x += 4) for (const y of [0, 1, h - 2, h - 1]) for (let c = 0; c < 3; c++) ring[c].push(d[(y * w + x) * 4 + c])
  const bg = ring.map((v) => v.sort((a, b) => a - b)[v.length >> 1])
  const near = (i: number) => Math.max(Math.abs(d[i * 4] - bg[0]), Math.abs(d[i * 4 + 1] - bg[1]), Math.abs(d[i * 4 + 2] - bg[2])) < tolerance
  const out = new Uint8Array(w * h)
  const stack: number[] = []
  const push = (i: number) => {
    if (!out[i] && near(i)) {
      out[i] = 1
      stack.push(i)
    }
  }
  for (let x = 0; x < w; x++) {
    push(x)
    push((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    push(y * w)
    push(y * w + w - 1)
  }
  while (stack.length) {
    const i = stack.pop() as number
    const x = i % w
    if (x > 0) push(i - 1)
    if (x < w - 1) push(i + 1)
    if (i >= w) push(i - w)
    if (i < w * (h - 1)) push(i + w)
  }
  // Only the largest piece is the figure.
  const label = new Int32Array(w * h)
  let best = 0
  let bestSize = 0
  let next = 0
  for (let s = 0; s < w * h; s++) {
    if (out[s] || label[s]) continue
    next++
    let size = 0
    label[s] = next
    stack.push(s)
    while (stack.length) {
      const i = stack.pop() as number
      size++
      const x = i % w
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h || out[j] || label[j]) continue
        label[j] = next
        stack.push(j)
      }
    }
    if (size > bestSize) {
      bestSize = size
      best = next
    }
  }
  const solid = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) solid[i] = label[i] === best ? 255 : 0
  const thin = new Uint8Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let m = 255
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) m = Math.min(m, solid[Math.min(h - 1, Math.max(0, y + dy)) * w + Math.min(w - 1, Math.max(0, x + dx))])
      thin[y * w + x] = m
    }
  const soft = new Uint8Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += thin[Math.min(h - 1, Math.max(0, y + dy)) * w + Math.min(w - 1, Math.max(0, x + dx))]
      soft[y * w + x] = Math.round(s / 9)
    }
  return soft
}

const box = (a: Uint8Array, w: number, h: number) => {
  let x0 = w
  let x1 = 0
  let y0 = h
  let y1 = 0
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (a[y * w + x] > 127) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  return { x0, x1, y0, y1 }
}

// The stretches of a row the figure covers.
function runs(a: Uint8Array, w: number, y: number): P2[] {
  const out: P2[] = []
  let start = -1
  for (let x = 0; x <= w; x++) {
    const on = x < w && a[y * w + x] > 127
    if (on && start < 0) start = x
    if (!on && start >= 0) {
      if (out.length && start - out[out.length - 1][1] < 4) out[out.length - 1][1] = x - 1
      else out.push([start, x - 1])
      start = -1
    }
  }
  return out.filter(([p, q]) => q - p >= 3)
}

// The back painting, turned about and fitted to the front's outline. The whole figure's box is fitted first. Then, row
// by row, each stretch of the back (an arm, the body, the other arm) is slid onto the matching stretch of the front,
// and those slides are evened out over the rows about them, so the fit follows a limb without tearing the paint from
// one row to the next. Returns colour where the back painting had the figure, and 0 alpha elsewhere.
function fitBack(back: Img, backCover: Uint8Array, frontCover: Uint8Array): Img {
  const { w, h } = back
  const flip = new Uint8Array(w * h * 4)
  const flipCover = new Uint8Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const s = y * w + (w - 1 - x)
      flip.set(back.d.subarray(s * 4, s * 4 + 4), (y * w + x) * 4)
      flipCover[y * w + x] = backCover[s]
    }
  const f = box(frontCover, w, h)
  const b = box(flipCover, w, h)
  const rowOf = (y: number) => b.y0 + ((y - f.y0) * (b.y1 - b.y0)) / Math.max(1, f.y1 - f.y0)
  const boxed = (x: number) => b.x0 + ((x - f.x0) * (b.x1 - b.x0)) / Math.max(1, f.x1 - f.x0)
  let slide = new Float32Array(w * h)
  let sure = new Float32Array(w * h)
  for (let y = f.y0; y <= f.y1; y++) {
    const fr = runs(frontCover, w, y)
    const br = runs(flipCover, w, Math.min(h - 1, Math.max(0, Math.round(rowOf(y)))))
    if (fr.length !== br.length) continue
    fr.forEach(([a0, a1], k) => {
      const [b0, b1] = br[k]
      for (let x = a0; x <= a1; x++) {
        slide[y * w + x] = b0 + ((x - a0) * (b1 - b0)) / Math.max(1, a1 - a0) - boxed(x)
        sure[y * w + x] = 1
      }
    })
  }
  // Evened out: a weighted box blur, twice, 25 rows by 9 columns.
  for (let pass = 0; pass < 2; pass++)
    for (const [dx, dy, r] of [
      [0, 1, 12],
      [1, 0, 4],
    ] as const) {
      const s2 = new Float32Array(w * h)
      const n2 = new Float32Array(w * h)
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          let s = 0
          let n = 0
          for (let q = -r; q <= r; q++) {
            const xx = x + dx * q
            const yy = y + dy * q
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
            s += slide[yy * w + xx] * sure[yy * w + xx]
            n += sure[yy * w + xx]
          }
          s2[y * w + x] = n > 0 ? s / n : 0
          n2[y * w + x] = n > 0 ? 1 : 0
        }
      slide = s2
      sure = n2
    }
  const out = new Uint8Array(w * h * 4)
  for (let y = f.y0; y <= f.y1; y++) {
    const yb = Math.min(h - 1.001, Math.max(0, rowOf(y)))
    const y0 = Math.floor(yb)
    const fy = yb - y0
    for (let x = f.x0; x <= f.x1; x++) {
      const xb = Math.min(w - 1.001, Math.max(0, boxed(x) + slide[y * w + x]))
      const x0 = Math.floor(xb)
      const fx = xb - x0
      const o = (y * w + x) * 4
      const corners = [
        [y0 * w + x0, (1 - fx) * (1 - fy)],
        [y0 * w + x0 + 1, fx * (1 - fy)],
        [(y0 + 1) * w + x0, (1 - fx) * fy],
        [(y0 + 1) * w + x0 + 1, fx * fy],
      ] as const
      // Only the figure's own paint is mixed: the backdrop's grey stays out of the edge.
      let r = 0
      let g = 0
      let bl = 0
      let a = 0
      let n = 0
      for (const [s, k] of corners) {
        const c = flipCover[s] / 255
        r += flip[s * 4] * k * c
        g += flip[s * 4 + 1] * k * c
        bl += flip[s * 4 + 2] * k * c
        n += k * c
        a += flipCover[s] * k
      }
      if (n > 0) {
        out[o] = r / n
        out[o + 1] = g / n
        out[o + 2] = bl / n
      }
      out[o + 3] = a
    }
  }
  return { w, h, d: out }
}

// Colour spread outward from where it is known, so the outline's edge and any gap in the fit take the paint beside them.
function bleed(img: Img, known: (i: number) => boolean, passes: number) {
  const { w, h, d } = img
  let have = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) have[i] = known(i) ? 1 : 0
  for (let p = 0; p < passes; p++) {
    const now = have.slice()
    let changed = 0
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        if (have[i]) continue
        let r = 0
        let g = 0
        let bl = 0
        let n = 0
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
          if (j < 0 || !have[j]) continue
          r += d[j * 4]
          g += d[j * 4 + 1]
          bl += d[j * 4 + 2]
          n++
        }
        if (!n) continue
        d[i * 4] = r / n
        d[i * 4 + 1] = g / n
        d[i * 4 + 2] = bl / n
        now[i] = 1
        changed++
      }
    have = now
    if (!changed) break
  }
}

// ── Joints ──
const BONES = ["root", "hips", "spine", "chest", "neck", "head", "upperarmL", "forearmL", "handL", "upperarmR", "forearmR", "handR", "thighL", "shinL", "footL", "thighR", "shinR", "footR"] as const
type Bone = (typeof BONES)[number]
const PARENT: Record<Bone, Bone | null> = {
  root: null,
  hips: "root",
  spine: "hips",
  chest: "spine",
  neck: "chest",
  head: "neck",
  upperarmL: "chest",
  forearmL: "upperarmL",
  handL: "forearmL",
  upperarmR: "chest",
  forearmR: "upperarmR",
  handR: "forearmR",
  thighL: "hips",
  shinL: "thighL",
  footL: "shinL",
  thighR: "hips",
  shinR: "thighR",
  footR: "shinR",
}
// What each bone carries, as lines on the painting between named points.
const REACH: Partial<Record<Bone, [string, string][]>> = {
  hips: [
    ["thighR", "thighL"],
    ["hips", "spine"],
  ],
  spine: [["spine", "chest"]],
  chest: [
    ["chest", "neck"],
    ["upperarmR", "upperarmL"],
  ],
  neck: [["neck", "head"]],
  head: [["head", "headTop"]],
  upperarmL: [["upperarmL", "forearmL"]],
  forearmL: [["forearmL", "handL"]],
  handL: [["handL", "handTipL"]],
  upperarmR: [["upperarmR", "forearmR"]],
  forearmR: [["forearmR", "handR"]],
  handR: [["handR", "handTipR"]],
  thighL: [["thighL", "shinL"]],
  shinL: [["shinL", "footL"]],
  footL: [["footL", "toeL"]],
  thighR: [["thighR", "shinR"]],
  shinR: [["shinR", "footR"]],
  footR: [["footR", "toeR"]],
}

// A membrane makes a head as flat as a coin and a chest no deeper than an arm. Each part is deepened by what its bone
// says it is.
const DEEPER: Partial<Record<Bone, number>> = { head: 1.45, neck: 1.25, chest: 1.2, spine: 1.15, hips: 1.1, footL: 1.3, footR: 1.3 }

// ── Turns ──
type Q = [number, number, number, number]
const RAD = Math.PI / 180
const about = (axis: "x" | "y" | "z", deg: number): Q => {
  const s = Math.sin((deg * RAD) / 2)
  return [axis === "x" ? s : 0, axis === "y" ? s : 0, axis === "z" ? s : 0, Math.cos((deg * RAD) / 2)]
}
const mul = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
]
const turn = (...parts: Q[]) => parts.reduce(mul, [0, 0, 0, 1] as Q)
const ease = (t: number) => t * t * (3 - 2 * t)
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

// A pose: a turn per bone, in its parent's frame, and where the root is. Every bone is square to the world at rest, so
// x is the figure's left, y up and z the way it faces. A positive turn about z lifts the left arm and lowers the right.
type Pose = { turns: Partial<Record<Bone, Q>>; lift?: [number, number, number] }

// The painting's arms are held out for the outline's sake. Standing, they hang.
const STAND = { arm: 21, elbow: -9 }
function standing(sway: { arm?: number; elbowL?: number; elbowR?: number; armL?: number; armR?: number } = {}): Pose["turns"] {
  return {
    upperarmL: about("z", -STAND.arm + (sway.arm ?? 0) + (sway.armL ?? 0)),
    upperarmR: about("z", STAND.arm - (sway.arm ?? 0) - (sway.armR ?? 0)),
    forearmL: about("x", STAND.elbow + (sway.elbowL ?? 0)),
    forearmR: about("x", STAND.elbow + (sway.elbowR ?? 0)),
  }
}

interface Clip {
  name: string
  seconds: number
  pose: (t: number) => Pose
}
function clips(depth: number): Clip[] {
  const wave = (t: number, T: number, phase = 0, times = 1) => Math.sin((2 * Math.PI * times * t) / T + phase)
  return [
    {
      // Breathing, a slow look about, the weight of the arms.
      name: "Idle",
      seconds: 5,
      pose: (t) => ({
        turns: {
          ...standing({ arm: 0.9 * wave(t, 5, 0, 2), elbowL: 1.5 * wave(t, 5, 1.1), elbowR: 1.5 * wave(t, 5, 2.3) }),
          spine: turn(about("x", 0.5 * wave(t, 5, 0, 2)), about("z", 0.5 * wave(t, 5, 0.6))),
          chest: turn(about("x", -0.9 * wave(t, 5, 0, 2)), about("y", 1.1 * wave(t, 5, 0.3))),
          neck: about("y", 2.2 * wave(t, 5, 0.9)),
          head: turn(about("y", 3.2 * wave(t, 5, 0.9)), about("x", 1.1 * wave(t, 5, 2, 2))),
        },
      }),
    },
    {
      // Struck in the chest: thrown back from the waist, arms flung out, and back to standing.
      name: "Hit",
      seconds: 0.6,
      pose: (t) => {
        const e = Math.sin(Math.PI * clamp01(t / 0.6) ** 0.55) ** 1.3
        return {
          turns: {
            ...standing({ arm: 13 * e, elbowL: -22 * e, elbowR: -16 * e }),
            hips: about("x", -2.5 * e),
            spine: turn(about("x", -8 * e), about("y", 5 * e)),
            chest: turn(about("x", -7 * e), about("y", 6 * e)),
            neck: about("x", 4 * e),
            head: about("x", 9 * e),
            thighL: about("x", -3 * e),
            thighR: about("x", 2 * e),
          },
          lift: [0, 0, -0.035 * e],
        }
      },
    },
    {
      // Onto his back: the knees give, he tips over his heels, the arms are left behind and land spread.
      name: "Fall",
      seconds: 1.6,
      pose: (t) => {
        const land = 1.0
        const g = t < land ? (t / land) ** 2.3 : 1 - 0.035 * Math.sin((Math.PI * (t - land)) / 0.22) * Math.exp(-(t - land) / 0.1)
        const mid = Math.sin(Math.PI * clamp01(t / land))
        const done = ease(clamp01((t - land * 0.55) / (land * 0.6)))
        return {
          turns: {
            root: about("x", -90 * g),
            upperarmL: about("z", -STAND.arm + 58 * mid + 26 * done),
            upperarmR: about("z", STAND.arm - 50 * mid - 30 * done),
            forearmL: about("x", STAND.elbow - 30 * mid - 8 * done),
            forearmR: about("x", STAND.elbow - 24 * mid - 12 * done),
            spine: about("x", 7 * mid),
            chest: about("x", 6 * mid),
            head: about("x", 12 * mid - 4 * done),
            thighL: about("x", -20 * mid - 5 * done),
            shinL: about("x", 34 * mid + 9 * done),
            thighR: about("x", -12 * mid - 2 * done),
            shinR: about("x", 22 * mid + 4 * done),
            footL: about("x", -12 * done),
            footR: about("x", -12 * done),
          },
          // Lying, his back is on the ground, not his middle.
          lift: [0, depth * ease(clamp01(g)), 0.06 * ease(clamp01(g))],
        }
      },
    },
  ]
}

// ── glTF ──
class Glb {
  private parts: Uint8Array[] = []
  private size = 0
  views: Record<string, unknown>[] = []
  accessors: Record<string, unknown>[] = []
  view(data: Uint8Array, target?: number) {
    const pad = (4 - (this.size % 4)) % 4
    if (pad) {
      this.parts.push(new Uint8Array(pad))
      this.size += pad
    }
    this.views.push({ buffer: 0, byteOffset: this.size, byteLength: data.byteLength, ...(target ? { target } : {}) })
    this.parts.push(data)
    this.size += data.byteLength
    return this.views.length - 1
  }
  accessor(data: Float32Array | Uint32Array | Uint8Array, type: "SCALAR" | "VEC2" | "VEC3" | "VEC4" | "MAT4", o: { target?: number; bounds?: boolean } = {}) {
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[type]
    const componentType = data instanceof Float32Array ? 5126 : data instanceof Uint32Array ? 5125 : 5121
    const a: Record<string, unknown> = { bufferView: this.view(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), o.target), componentType, count: data.length / width, type }
    if (o.bounds) {
      const min = new Array(width).fill(Infinity)
      const max = new Array(width).fill(-Infinity)
      for (let i = 0; i < data.length; i++) {
        min[i % width] = Math.min(min[i % width], data[i])
        max[i % width] = Math.max(max[i % width], data[i])
      }
      a.min = min
      a.max = max
    }
    this.accessors.push(a)
    return this.accessors.length - 1
  }
  write(json: Record<string, unknown>) {
    const bin = new Uint8Array(this.size + ((4 - (this.size % 4)) % 4))
    let o = 0
    for (const p of this.parts) {
      bin.set(p, o)
      o += p.byteLength
    }
    const text = new TextEncoder().encode(JSON.stringify({ ...json, bufferViews: this.views, accessors: this.accessors, buffers: [{ byteLength: bin.byteLength }] }))
    const jsonChunk = new Uint8Array(text.byteLength + ((4 - (text.byteLength % 4)) % 4)).fill(0x20)
    jsonChunk.set(text)
    const out = new Uint8Array(12 + 8 + jsonChunk.byteLength + 8 + bin.byteLength)
    const dv = new DataView(out.buffer)
    dv.setUint32(0, 0x46546c67, true)
    dv.setUint32(4, 2, true)
    dv.setUint32(8, out.byteLength, true)
    dv.setUint32(12, jsonChunk.byteLength, true)
    dv.setUint32(16, 0x4e4f534a, true)
    out.set(jsonChunk, 20)
    dv.setUint32(20 + jsonChunk.byteLength, bin.byteLength, true)
    dv.setUint32(24 + jsonChunk.byteLength, 0x004e4942, true)
    out.set(bin, 28 + jsonChunk.byteLength)
    return out
  }
}

async function main() {
  const id = process.argv[2]
  if (!id) throw new Error("usage: figure.ts <id>")
  const spec = JSON.parse(await readFile(`lab/stage-art/figures/${id}.json`, "utf8")) as Spec
  const front = await load(`${RAW}/${spec.front}`)
  const back = await load(`${RAW}/${spec.back}`)
  if (front.w !== back.w || front.h !== back.h) throw new Error("the two paintings differ in size")
  const { w, h } = front
  const fc = cover(front)
  const bc = cover(back)
  const fb = box(fc, w, h)
  const fitted = fitBack(back, bc, fc)
  let both = 0
  let either = 0
  for (let i = 0; i < w * h; i++) {
    const a = fc[i] > 127
    const b = fitted.d[i * 4 + 3] > 127
    if (a && b) both++
    if (a || b) either++
  }
  console.log(`outline ${fb.x1 - fb.x0 + 1}x${fb.y1 - fb.y0 + 1} px, back fitted to front ${((100 * both) / either).toFixed(1)}%`)

  // The texture: front beside back, both cut by the front's outline, paint carried past the edge for the filtering.
  bleed(front, (i) => fc[i] > 235, 24)
  bleed(fitted, (i) => fitted.d[i * 4 + 3] > 235, 96)
  const atlas = new Uint8Array(w * 2 * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      for (const [src, at] of [
        [front.d, y * w * 2 + x],
        [fitted.d, y * w * 2 + w + x],
      ] as const) {
        atlas[at * 4] = src[i * 4]
        atlas[at * 4 + 1] = src[i * 4 + 1]
        atlas[at * 4 + 2] = src[i * 4 + 2]
        atlas[at * 4 + 3] = fc[i]
      }
    }
  const webp = await sharp(atlas, { raw: { width: w * 2, height: h, channels: 4 } })
    // sharp takes `exact` for WebP, which keeps the colour of fully clear pixels, and its types do not list it yet.
    .webp({ quality: 90, alphaQuality: 100, exact: true } as sharp.WebpOptions)
    .toBuffer()
  await sharp(atlas, { raw: { width: w * 2, height: h, channels: 4 } })
    .png()
    .toFile(`${RAW}/${id}-figure-atlas.png`)

  // The grid. A node is inside where the outline covers it. A cell is drawn if the outline touches it at all, so the
  // mesh overlaps the edge and the texture's alpha cuts it.
  const gw = Math.ceil(w / CELL) + 1
  const gh = Math.ceil(h / CELL) + 1
  const at = (i: number, j: number) => j * gw + i
  const inside = new Uint8Array(gw * gh)
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) inside[at(i, j)] = fc[Math.min(h - 1, j * CELL) * w + Math.min(w - 1, i * CELL)] > 127 ? 1 : 0
  const drawn = new Uint8Array(gw * gh)
  for (let j = 0; j < gh - 1; j++)
    for (let i = 0; i < gw - 1; i++) {
      let any = inside[at(i, j)] || inside[at(i + 1, j)] || inside[at(i, j + 1)] || inside[at(i + 1, j + 1)]
      for (let y = j * CELL; !any && y < Math.min(h, (j + 1) * CELL); y++) for (let x = i * CELL; x < Math.min(w, (i + 1) * CELL); x++) if (fc[y * w + x] > 40) any = 1
      drawn[at(i, j)] = any ? 1 : 0
    }

  // Inflation: a membrane fixed at the outline under even pressure, solved by successive over-relaxation. Its square
  // root is a circle's arc across anything long and thin.
  const m = new Float64Array(gw * gh)
  for (let sweep = 0; sweep < 900; sweep++)
    for (let j = 1; j < gh - 1; j++)
      for (let i = 1; i < gw - 1; i++) {
        const n = at(i, j)
        if (!inside[n]) continue
        m[n] += 1.9 * ((m[n - 1] + m[n + 1] + m[n - gw] + m[n + gw] + CELL * CELL) / 4 - m[n])
      }
  const tall = fb.y1 - fb.y0 + 1
  const cap = DEPTH_CAP * tall
  const deep = new Float32Array(gw * gh)
  for (let n = 0; n < gw * gh; n++) deep[n] = cap * Math.tanh((DEPTH_GAIN * Math.sqrt(2 * Math.max(0, m[n]))) / cap)

  // Bones, in metres. x is the figure's left, which is the painting's right.
  const k = spec.height / tall
  const cx = spec.joints.hips[0]
  const world = (p: P2): [number, number, number] => [(p[0] - cx) * k, (fb.y1 - p[1]) * k, 0]
  const rest = Object.fromEntries(BONES.map((b) => [b, b === "root" ? [0, 0, 0] : world(spec.joints[b])])) as Record<Bone, [number, number, number]>

  // Each node follows the bones nearest to it through the body.
  const far = new Float32Array(BONES.length * gw * gh).fill(Infinity)
  const steps: [number, number, number][] = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
  ]
  BONES.forEach((bone, b) => {
    const lines = REACH[bone]
    if (!lines) return
    const dist = far.subarray(b * gw * gh, (b + 1) * gw * gh)
    const heap: [number, number][] = []
    const add = (d: number, n: number) => {
      heap.push([d, n])
      for (let c = heap.length - 1; c > 0; ) {
        const p = (c - 1) >> 1
        if (heap[p][0] <= heap[c][0]) break
        ;[heap[p], heap[c]] = [heap[c], heap[p]]
        c = p
      }
    }
    const take = () => {
      const top = heap[0]
      const last = heap.pop() as [number, number]
      if (heap.length) {
        heap[0] = last
        for (let p = 0; ; ) {
          let c = p * 2 + 1
          if (c >= heap.length) break
          if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++
          if (heap[p][0] <= heap[c][0]) break
          ;[heap[p], heap[c]] = [heap[c], heap[p]]
          p = c
        }
      }
      return top
    }
    for (const [from, to] of lines) {
      const a = spec.joints[from]
      const z = spec.joints[to]
      const n = Math.max(2, Math.ceil(Math.hypot(z[0] - a[0], z[1] - a[1]) / (CELL / 2)))
      for (let s = 0; s <= n; s++) {
        const i0 = Math.round((a[0] + ((z[0] - a[0]) * s) / n) / CELL)
        const j0 = Math.round((a[1] + ((z[1] - a[1]) * s) / n) / CELL)
        // A point just off the outline starts from the nearest node on it.
        let found = -1
        for (let r = 0; r <= 4 && found < 0; r++)
          for (let dj = -r; dj <= r && found < 0; dj++)
            for (let di = -r; di <= r; di++) {
              const i = i0 + di
              const j = j0 + dj
              if (i >= 0 && j >= 0 && i < gw && j < gh && inside[at(i, j)]) {
                found = at(i, j)
                break
              }
            }
        if (found >= 0 && dist[found] > 0) {
          dist[found] = 0
          add(0, found)
        }
      }
    }
    while (heap.length) {
      const [d, n] = take()
      if (d > dist[n]) continue
      const i = n % gw
      const j = (n / gw) | 0
      for (const [di, dj, cost] of steps) {
        const x = i + di
        const y = j + dj
        if (x < 0 || y < 0 || x >= gw || y >= gh || !inside[at(x, y)]) continue
        const nd = d + cost * CELL
        if (nd < dist[at(x, y)]) {
          dist[at(x, y)] = nd
          add(nd, at(x, y))
        }
      }
    }
  })
  const soft = 0.018 * tall
  let weight = new Float32Array(BONES.length * gw * gh)
  for (let n = 0; n < gw * gh; n++) {
    if (!inside[n]) continue
    let nearest = Infinity
    for (let b = 0; b < BONES.length; b++) nearest = Math.min(nearest, far[b * gw * gh + n])
    if (nearest === Infinity) continue
    for (let b = 0; b < BONES.length; b++) weight[b * gw * gh + n] = Math.exp(-(far[b * gw * gh + n] - nearest) / soft)
  }
  // The rim beyond the outline takes its neighbours' bones, and everything is evened out a little, so nothing creases.
  const has = inside.slice()
  for (let pass = 0; pass < 6; pass++) {
    const next = weight.slice()
    const now = has.slice()
    for (let j = 0; j < gh; j++)
      for (let i = 0; i < gw; i++) {
        const n = at(i, j)
        if (has[n] && pass > 2) continue
        let count = has[n] ? 2 : 0
        const sum = new Float32Array(BONES.length)
        if (has[n]) for (let b = 0; b < BONES.length; b++) sum[b] = 2 * weight[b * gw * gh + n]
        for (const [di, dj] of steps) {
          const x = i + di
          const y = j + dj
          if (x < 0 || y < 0 || x >= gw || y >= gh || !has[at(x, y)]) continue
          // Only through the body: two nodes across a gap are not neighbours.
          if (has[n] && inside[n] && !inside[at(x, y)]) continue
          for (let b = 0; b < BONES.length; b++) sum[b] += weight[b * gw * gh + at(x, y)]
          count++
        }
        if (!count) continue
        for (let b = 0; b < BONES.length; b++) next[b * gw * gh + n] = sum[b] / count
        now[n] = 1
      }
    weight = next
    has.set(now)
  }

  // A node just off the outline is moved onto it. The two sheets then meet on the outline itself, at no depth. Left on
  // the grid, they met beside it, and the texture's cut ran across the steep rim as a row of teeth.
  const nodeX = new Float32Array(gw * gh)
  const nodeY = new Float32Array(gw * gh)
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) {
      const n = at(i, j)
      let x = Math.min(w - 1, i * CELL)
      let y = Math.min(h - 1, j * CELL)
      if (!inside[n]) {
        let best = Infinity
        const reach = CELL * 2
        for (let dy = -reach; dy <= reach; dy++)
          for (let dx = -reach; dx <= reach; dx++) {
            const xx = i * CELL + dx
            const yy = j * CELL + dy
            if (xx < 0 || yy < 0 || xx >= w || yy >= h || fc[yy * w + xx] <= 127) continue
            const d = dx * dx + dy * dy
            if (d < best) {
              best = d
              x = xx
              y = yy
            }
          }
      }
      nodeX[n] = x
      nodeY[n] = y
    }

  // The mesh: a front sheet and a back sheet over the drawn cells, meeting at the rim.
  const used = new Int32Array(gw * gh).fill(-1)
  let count = 0
  for (let j = 0; j < gh - 1; j++) for (let i = 0; i < gw - 1; i++) if (drawn[at(i, j)]) for (const n of [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)]) if (used[n] < 0) used[n] = count++
  const position = new Float32Array(count * 2 * 3)
  const uv = new Float32Array(count * 2 * 2)
  const joints = new Uint8Array(count * 2 * 4)
  const weights = new Float32Array(count * 2 * 4)
  for (let n = 0; n < gw * gh; n++) {
    const v = used[n]
    if (v < 0) continue
    const px = nodeX[n]
    const py = nodeY[n]
    let part = 0
    let parts = 0
    for (let b = 0; b < BONES.length; b++) {
      part += weight[b * gw * gh + n] * (DEEPER[BONES[b]] ?? 1)
      parts += weight[b * gw * gh + n]
    }
    const z = inside[n] ? deep[n] * k * (parts > 0 ? part / parts : 1) : 0
    const order = [...BONES.keys()].sort((a, b) => weight[b * gw * gh + n] - weight[a * gw * gh + n]).slice(0, 4)
    const total = order.reduce((s, b) => s + weight[b * gw * gh + n], 0) || 1
    for (const side of [0, 1]) {
      const o = v + side * count
      position.set([(px - cx) * k, (fb.y1 - py) * k, side ? -z : z], o * 3)
      uv.set([(px + side * w) / (w * 2), py / h], o * 2)
      order.forEach((b, s) => {
        const share = total > 0 ? weight[b * gw * gh + n] / total : 0
        joints[o * 4 + s] = share > 0 ? b : 0
        weights[o * 4 + s] = share
      })
      if (!order.some((b) => weight[b * gw * gh + n] > 0)) {
        joints[o * 4] = BONES.indexOf("hips")
        weights[o * 4] = 1
      }
    }
  }
  const index: number[] = []
  for (let j = 0; j < gh - 1; j++)
    for (let i = 0; i < gw - 1; i++) {
      if (!drawn[at(i, j)]) continue
      const a = used[at(i, j)]
      const b = used[at(i + 1, j)]
      const c = used[at(i + 1, j + 1)]
      const d = used[at(i, j + 1)]
      index.push(d, c, b, d, b, a, d + count, b + count, c + count, d + count, a + count, b + count)
    }
  const indices = new Uint32Array(index)
  const normal = new Float32Array(count * 2 * 3)
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]]
    const e1 = [0, 1, 2].map((q) => position[b * 3 + q] - position[a * 3 + q])
    const e2 = [0, 1, 2].map((q) => position[c * 3 + q] - position[a * 3 + q])
    const nx = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
    for (const v of [a, b, c]) for (let q = 0; q < 3; q++) normal[v * 3 + q] += nx[q]
  }
  for (let v = 0; v < count * 2; v++) {
    const l = Math.hypot(normal[v * 3], normal[v * 3 + 1], normal[v * 3 + 2]) || 1
    // A flat rim node has no normal of its own.
    if (l === 1 && !normal[v * 3 + 2]) normal[v * 3 + 2] = v < count ? 1 : -1
    for (let q = 0; q < 3; q++) normal[v * 3 + q] /= l
  }

  // ── Write ──
  const glb = new Glb()
  const prim = {
    attributes: {
      POSITION: glb.accessor(position, "VEC3", { target: 34962, bounds: true }),
      NORMAL: glb.accessor(normal, "VEC3", { target: 34962 }),
      TEXCOORD_0: glb.accessor(uv, "VEC2", { target: 34962 }),
      JOINTS_0: glb.accessor(joints, "VEC4", { target: 34962 }),
      WEIGHTS_0: glb.accessor(weights, "VEC4", { target: 34962 }),
    },
    indices: glb.accessor(indices, "SCALAR", { target: 34963 }),
    material: 0,
  }
  const bind = new Float32Array(BONES.length * 16)
  BONES.forEach((b, i) => {
    bind.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -rest[b][0], -rest[b][1], -rest[b][2], 1], i * 16)
  })
  const nodes: Record<string, unknown>[] = BONES.map((b) => {
    const p = PARENT[b]
    const children = BONES.map((c, i) => (PARENT[c] === b ? i : -1)).filter((i) => i >= 0)
    return { name: b, translation: p ? rest[b].map((v, q) => v - rest[p][q]) : rest[b], ...(children.length ? { children } : {}) }
  })
  nodes.push({ name: id, mesh: 0, skin: 0 })
  const depth = cap * Math.tanh(DEPTH_GAIN) * k * 0.82
  const animations = clips(depth).map((clip) => {
    const frames = Math.round(clip.seconds * FPS) + 1
    const times = new Float32Array(frames).map((_, f) => f / FPS)
    const input = glb.accessor(times, "SCALAR", { bounds: true })
    const samplers: Record<string, unknown>[] = []
    const channels: Record<string, unknown>[] = []
    const poses = [...times].map((t) => clip.pose(Math.min(t, clip.seconds)))
    BONES.forEach((b, node) => {
      if (!poses.some((p) => p.turns[b])) return
      const out = new Float32Array(frames * 4)
      poses.forEach((p, f) => {
        out.set(p.turns[b] ?? [0, 0, 0, 1], f * 4)
      })
      samplers.push({ input, output: glb.accessor(out, "VEC4"), interpolation: "LINEAR" })
      channels.push({ sampler: samplers.length - 1, target: { node, path: "rotation" } })
    })
    if (poses.some((p) => p.lift)) {
      const out = new Float32Array(frames * 3)
      poses.forEach((p, f) => {
        out.set(p.lift ?? [0, 0, 0], f * 3)
      })
      samplers.push({ input, output: glb.accessor(out, "VEC3"), interpolation: "LINEAR" })
      channels.push({ sampler: samplers.length - 1, target: { node: 0, path: "translation" } })
    }
    return { name: clip.name, samplers, channels }
  })
  const image = glb.view(new Uint8Array(webp))
  const out = glb.write({
    asset: { version: "2.0", generator: "d20 lab/stage-art/figure.ts" },
    extensionsUsed: ["EXT_texture_webp"],
    extensionsRequired: ["EXT_texture_webp"],
    scene: 0,
    scenes: [{ name: id, nodes: [0, BONES.length] }],
    nodes,
    meshes: [{ name: id, primitives: [prim] }],
    skins: [{ name: id, joints: BONES.map((_, i) => i), skeleton: 0, inverseBindMatrices: glb.accessor(bind, "MAT4") }],
    materials: [{ name: id, pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.82 }, alphaMode: "MASK", alphaCutoff: 0.5 }],
    textures: [{ sampler: 0, extensions: { EXT_texture_webp: { source: 0 } } }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
    images: [{ bufferView: image, mimeType: "image/webp" }],
    animations,
  })
  await mkdir(OUT, { recursive: true })
  await writeFile(`${OUT}/${id}.glb`, out)

  // To check by eye: the outline, the grid's depth, and the bones over the painting.
  const check = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const n = at(Math.round(x / CELL), Math.round(y / CELL))
      const dz = inside[n] ? (255 * deep[n]) / cap : 0
      check.set([fc[i] > 127 ? front.d[i * 4] * 0.5 + dz * 0.5 : 30, fc[i] > 127 ? front.d[i * 4 + 1] * 0.5 + dz * 0.5 : 30, fc[i] > 127 ? front.d[i * 4 + 2] * 0.5 + dz * 0.5 : 60, 255], i * 4)
    }
  const dot = (p: P2, c: number[]) => {
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (p[1] + dy >= 0 && p[1] + dy < h && p[0] + dx >= 0 && p[0] + dx < w) check.set(c, ((p[1] + dy) * w + p[0] + dx) * 4)
  }
  for (const lines of Object.values(REACH))
    for (const [a, z] of lines) {
      const p = spec.joints[a]
      const q = spec.joints[z]
      for (let s = 0; s <= 200; s++) check.set([255, 60, 60, 255], (Math.round(p[1] + ((q[1] - p[1]) * s) / 200) * w + Math.round(p[0] + ((q[0] - p[0]) * s) / 200)) * 4)
    }
  for (const p of Object.values(spec.joints)) dot(p, [80, 255, 120, 255])
  await sharp(check, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toFile(`${RAW}/${id}-figure-check.png`)
  console.log(
    `${OUT}/${id}.glb ${(out.byteLength / 1024).toFixed(0)} KB, ${indices.length / 3} triangles, ${count * 2} vertices, texture ${(webp.byteLength / 1024).toFixed(0)} KB, depth ${(2 * depth * 100).toFixed(0)} cm`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
