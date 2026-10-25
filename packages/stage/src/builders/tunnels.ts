import * as THREE from "three"
import { z } from "zod"
import { defineBuilder, num, size, vec2 } from "./types"

// Tunnels and caves below the city (the tunnel kit): a bore swept along a path, its walls of laid stone or rough-hewn
// rock, and a cave chamber whose walls open in mouths where bores come in.

// Value noise in metres, smooth and the same wherever the same point is asked for, so bores and caves that meet agree.
const hash = (x: number, y: number, z: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
  return s - Math.floor(s)
}
function noise(x: number, y: number, z: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const f = (t: number) => t * t * (3 - 2 * t)
  const u = f(x - xi)
  const v = f(y - yi)
  const w = f(z - zi)
  let out = 0
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) out += hash(xi + dx, yi + dy, zi + dz) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w)
  return out * 2 - 1
}
const rock = (x: number, y: number, z: number, scale: number) => noise(x / scale, y / scale, z / scale) * 0.65 + noise((x * 2.3) / scale, (y * 2.3) / scale, (z * 2.3) / scale) * 0.35

// A grid of points to a mesh whose faces look toward `inside(point)`; uv in metres along the grid.
function sheet(rows: THREE.Vector3[][], uvs: [number, number][][], inside: (p: THREE.Vector3) => THREE.Vector3, skip?: (i: number, j: number) => boolean) {
  const pos: number[] = []
  const uv: number[] = []
  const cols = rows[0].length
  for (let i = 0; i < rows.length; i++)
    for (let j = 0; j < cols; j++) {
      const q = rows[i][j]
      pos.push(q.x, q.y, q.z)
      uv.push(uvs[i][j][0], uvs[i][j][1])
    }
  const idx: number[] = []
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const n = new THREE.Vector3()
  const c = new THREE.Vector3()
  for (let i = 0; i < rows.length - 1; i++)
    for (let j = 0; j < cols - 1; j++) {
      if (skip?.(i, j)) continue
      const p00 = i * cols + j
      const p10 = (i + 1) * cols + j
      const p01 = i * cols + j + 1
      const p11 = (i + 1) * cols + j + 1
      a.subVectors(rows[i + 1][j], rows[i][j])
      b.subVectors(rows[i][j + 1], rows[i][j])
      n.crossVectors(a, b)
      c.copy(rows[i][j])
        .add(rows[i + 1][j + 1])
        .multiplyScalar(0.5)
      const toward = inside(c).sub(c)
      if (n.dot(toward) >= 0) idx.push(p00, p10, p01, p01, p10, p11)
      else idx.push(p00, p01, p10, p01, p11, p10)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// A bore along `path` (local x, z points): side walls `walls` high, a round vault over them, or rough rock when `rough`
// is above 0 (metres of relief). The floor is laid between the walls. `caps` closes the start and the end with a flat
// face of the wall's own stone (a blank wall). Walks keep to the floor.
export const bore = defineBuilder(
  z
    .object({
      path: z.array(vec2).min(2).max(64),
      width: size(30).default(2.6),
      walls: num(0, 20).default(1.6),
      rough: num(0, 3).default(0),
      grain: size(20).default(1.6),
      caps: z.tuple([z.boolean(), z.boolean()]).default([false, false]),
      floor: z.boolean().default(true),
    })
    .strict(),
  (ctx, p) => {
    const { M } = ctx
    const r = p.width / 2
    // Section across the bore, from the right foot over the top to the left foot: (across, up), across + to the left.
    const sec: [number, number][] = []
    const nw = Math.max(1, Math.round(p.walls / 0.6))
    for (let k = 0; k <= nw; k++) sec.push([-r, (k * p.walls) / nw])
    const na = 16
    for (let k = 1; k < na; k++) {
      const t = Math.PI * (k / na)
      sec.push([-r * Math.cos(t), p.walls + r * Math.sin(t)])
    }
    for (let k = nw; k >= 0; k--) sec.push([r, (k * p.walls) / nw])
    // Resample the path every half metre or so, so rough walls have points to move.
    const pts: THREE.Vector2[] = []
    for (let i = 0; i < p.path.length - 1; i++) {
      const A = new THREE.Vector2(...p.path[i])
      const B = new THREE.Vector2(...p.path[i + 1])
      const n = Math.max(1, Math.round(A.distanceTo(B) / (p.rough > 0 ? 0.5 : 2)))
      for (let k = 0; k < n; k++) pts.push(A.clone().lerp(B, k / n))
    }
    pts.push(new THREE.Vector2(...p.path[p.path.length - 1]))
    const dirs = pts.map((_, i) => {
      const a = pts[Math.max(0, i - 1)]
      const b = pts[Math.min(pts.length - 1, i + 1)]
      return b.clone().sub(a).normalize()
    })
    let run = 0
    const rows: THREE.Vector3[][] = []
    const uvs: [number, number][][] = []
    const axis: THREE.Vector3[] = []
    pts.forEach((q, i) => {
      if (i > 0) run += q.distanceTo(pts[i - 1])
      const t = dirs[i]
      const left = new THREE.Vector2(-t.y, t.x)
      axis.push(new THREE.Vector3(q.x, p.walls * 0.6, q.y))
      let along = 0
      const row: THREE.Vector3[] = []
      const uvr: [number, number][] = []
      sec.forEach(([u, v], j) => {
        if (j > 0) along += Math.hypot(u - sec[j - 1][0], v - sec[j - 1][1])
        const pt = new THREE.Vector3(q.x + left.x * u, v, q.y + left.y * u)
        if (p.rough > 0) {
          // Push the rock outward from the axis, more on the walls and vault than at the foot.
          const out = new THREE.Vector3(left.x * u, Math.max(0, v - p.walls * 0.5), left.y * u).normalize()
          const k = rock(pt.x, pt.y, pt.z, p.grain) * p.rough * Math.min(1, v / 0.5 + 0.2)
          pt.addScaledVector(out, k)
        }
        row.push(pt)
        uvr.push([run, along])
      })
      rows.push(row)
      uvs.push(uvr)
    })
    const g = sheet(rows, uvs, (c) => {
      // The nearest axis point, raised to the bore's middle.
      let best = axis[0]
      for (const a of axis) if (a.distanceToSquared(c) < best.distanceToSquared(c)) best = a
      return best.clone()
    })
    ctx.b.add(g, M.wall, new THREE.Matrix4(), { uv: "keep" })
    g.dispose()
    if (p.floor) {
      // The floor, a strip between the feet of the walls.
      const fr = rows.map((row) => [row[0].clone().setY(0.005), row[row.length - 1].clone().setY(0.005)])
      const fuv = fr.map((row) => row.map((q) => [q.x, q.z] as [number, number]))
      const f = sheet(fr, fuv, (c) => c.clone().setY(5))
      ctx.b.add(f, M.floor, new THREE.Matrix4(), { uv: "keep" })
      f.dispose()
    }
    for (const [end, i] of [
      [0, 0],
      [1, rows.length - 1],
    ] as const) {
      if (!p.caps[end]) continue
      // A flat face across the bore: a fan from the floor's middle.
      const row = rows[i]
      const mid = row[0]
        .clone()
        .add(row[row.length - 1])
        .multiplyScalar(0.5)
      const pos: number[] = []
      const uv: number[] = []
      for (let j = 0; j < row.length - 1; j++)
        for (const q of [mid, row[j], row[j + 1]]) {
          pos.push(q.x, q.y, q.z)
          uv.push(q.x + q.z, q.y)
        }
      const cap = new THREE.BufferGeometry()
      cap.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
      cap.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2))
      cap.computeVertexNormals()
      // Face back down the bore.
      const n = new THREE.Vector3().fromBufferAttribute(cap.attributes.normal as THREE.BufferAttribute, 0)
      const back = new THREE.Vector3(dirs[i].x, 0, dirs[i].y).multiplyScalar(end === 0 ? 1 : -1)
      if (n.dot(back) < 0) {
        const arr = cap.attributes.position.array as Float32Array
        for (let k = 0; k < arr.length; k += 9) for (let m = 0; m < 3; m++) [arr[k + 3 + m], arr[k + 6 + m]] = [arr[k + 6 + m], arr[k + 3 + m]]
        cap.computeVertexNormals()
      }
      ctx.b.add(cap, M.wall, new THREE.Matrix4(), { uv: "keep" })
      cap.dispose()
      const t = dirs[i]
      ctx.footprint(mid.x - t.x * (end === 0 ? 0.15 : -0.15), mid.z - t.y * (end === 0 ? 0.15 : -0.15), r + 0.2, 0.15, Math.atan2(t.x, t.y))
    }
    // Walls to the walks: a thin rect beyond each side of every leg.
    for (let i = 0; i < p.path.length - 1; i++) {
      const A = new THREE.Vector2(...p.path[i])
      const B = new THREE.Vector2(...p.path[i + 1])
      const t = B.clone().sub(A)
      const len = t.length()
      t.normalize()
      const ry = Math.atan2(t.x, t.y)
      const mid = A.clone().add(B).multiplyScalar(0.5)
      for (const s of [-1, 1]) ctx.footprint(mid.x - t.y * s * (r + 0.15), mid.y + t.x * s * (r + 0.15), 0.15, len / 2, ry)
    }
  },
  { wall: "tunnelStone", floor: "tunnelFloor" }
)

// A cave chamber: an elliptical floor `rx` by `rz`, rough walls rising into a dome `height` high. `mouths` cut openings at
// a bearing (0 looks down +z, 90 down +x) `width` wide and `height` high, where bores come in. Walks keep inside.
export const cave = defineBuilder(
  z
    .object({
      rx: size(80).default(8),
      rz: size(80).default(8),
      height: size(60).default(7),
      rough: num(0, 5).default(0.8),
      grain: size(30).default(2.4),
      mouths: z
        .array(z.object({ at: num(-360, 360), width: size(20), height: size(30) }).strict())
        .max(8)
        .default([]),
    })
    .strict(),
  (ctx, p) => {
    const { M } = ctx
    const na = 72
    const nv = 18
    const ang = (i: number) => (i / na) * Math.PI * 2
    const rows: THREE.Vector3[][] = []
    const uvs: [number, number][][] = []
    const mouth = (a: number, y: number) =>
      p.mouths.some((m) => {
        const d = Math.abs(Math.atan2(Math.sin(a - (m.at * Math.PI) / 180), Math.cos(a - (m.at * Math.PI) / 180)))
        const rr = Math.hypot(p.rx * Math.sin(a), p.rz * Math.cos(a))
        return d * rr < m.width / 2 && y < m.height
      })
    for (let i = 0; i <= na; i++) {
      const a = ang(i)
      const row: THREE.Vector3[] = []
      const uvr: [number, number][] = []
      for (let j = 0; j <= nv; j++) {
        const t = j / nv
        // A wall that rises steeply, then curves over into a low dome.
        const up = Math.sin((t * Math.PI) / 2)
        const inwards = 1 - (Math.max(0, t - 0.35) / 0.65) ** 2 * 0.92
        const y = p.height * (t < 0.35 ? (t / 0.35) * 0.45 : 0.45 + 0.55 * Math.sin(((t - 0.35) / 0.65) * (Math.PI / 2)))
        const x = Math.sin(a) * p.rx * inwards
        const zz = Math.cos(a) * p.rz * inwards
        const pt = new THREE.Vector3(x, y, zz)
        const k = rock(pt.x, pt.y, pt.z, p.grain) * p.rough * (0.4 + up * 0.6)
        pt.add(new THREE.Vector3(Math.sin(a), 0.4 * up, Math.cos(a)).normalize().multiplyScalar(k))
        row.push(pt)
        uvr.push([(a * (p.rx + p.rz)) / 2, y])
      }
      rows.push(row)
      uvs.push(uvr)
    }
    const g = sheet(
      rows,
      uvs,
      (c) => new THREE.Vector3(0, Math.min(c.y, p.height * 0.3), 0),
      (i, j) => mouth((ang(i) + ang(i + 1)) / 2, (rows[i][j].y + rows[i][j + 1].y) / 2)
    )
    ctx.b.add(g, M.wall, new THREE.Matrix4(), { uv: "keep" })
    g.dispose()
    const floor = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2)
    const fp = floor.attributes.position
    const fuv = floor.attributes.uv
    for (let i = 0; i < fp.count; i++) {
      fp.setXYZ(i, fp.getX(i) * (p.rx + p.rough), 0.004, fp.getZ(i) * (p.rz + p.rough))
      fuv.setXY(i, fp.getX(i), fp.getZ(i))
    }
    floor.computeVertexNormals()
    ctx.b.add(floor, M.floor, new THREE.Matrix4(), { uv: "keep" })
    floor.dispose()
    // The wall's foot to the walks, but for the mouths.
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2
      if (mouth(a, 0.5)) continue
      ctx.circle(Math.sin(a) * (p.rx - 0.1), Math.cos(a) * (p.rz - 0.1), 0.5)
    }
  },
  { wall: "tunnelRock", floor: "tunnelFloor" }
)
