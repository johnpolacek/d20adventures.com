import * as THREE from "three"
import { z } from "zod"
import { beam, Frame, G, M4, type Sink, TAU } from "../kit/geometry"
import type { Rand } from "../kit/rng"
import { barrel } from "./market"
import { defineBuilder, num, size } from "./types"

// A tavern's room and furniture: walls with doors and windows, a hearth, a bar, tables, benches, stools, chairs, stairs,
// a wheel chandelier, and a dragon's skull over the mantel (the Dragonbone Inn).

type M = Record<string, THREE.Material>
// Placements seen through a local frame, for helpers that write straight into a sink (a keg on its side).
const framed = (b: Sink, m: THREE.Matrix4): Sink => ({ add: (geo, mat, x = null, o) => b.add(geo, mat, x ? m.clone().multiply(x) : m.clone(), o) })
const flameGeo = () => G("tav-flame", () => new THREE.SphereGeometry(1, 8, 6))
const knob = () => G("tav-knob", () => new THREE.SphereGeometry(1, 8, 6))

// ── Walls ────────────────────────────────────────────────────────────────────

// One face of a wall: bare plaster (the core), upright boards or stone over it, a panelled dado, exposed studs and a rail.
const face = z
  .object({
    finish: z.enum(["plaster", "boards", "stone"]).default("plaster"),
    wainscot: num(0, 3).default(0),
    studs: num(0, 6).default(0),
    rail: num(0, 8).default(0),
  })
  .strict()
const wallOpening = z
  .object({
    // Centre of the opening, in metres from the middle of the wall along it.
    at: num(-100, 100),
    width: size(10),
    height: size(10),
    sill: num(0, 10).default(0),
    kind: z.enum(["window", "door", "doorway"]).default("window"),
    // A door leaf, swung into side a by this many degrees (0 is shut). No leaf when unset.
    leaf: num(-170, 170).optional(),
    // Leaded lights: columns and rows of panes.
    panes: z.tuple([z.number().int().min(1).max(8), z.number().int().min(1).max(12)]).default([2, 3]),
  })
  .strict()

// A straight wall along x, centred on the origin, its side a facing +z and side b facing -z, cut by real openings.
// Windows have a timber frame, leaded panes and a sill inside. A door has a planked leaf with strap hinges; a doorway is an
// open frame. Walks pass through doors and doorways (a `door` anchor a step either side) and are stopped by the rest.
export const wall = defineBuilder(
  z
    .object({
      length: size(60),
      height: size(20).default(3.4),
      thickness: size(2).default(0.3),
      openings: z.array(wallOpening).max(16).default([]),
      a: face.default({ finish: "plaster", wainscot: 0, studs: 0, rail: 0 }),
      b: face.default({ finish: "plaster", wainscot: 0, studs: 0, rail: 0 }),
    })
    .strict(),
  (ctx, p) => {
    const { b, M } = ctx
    const F = new Frame(b, new THREE.Matrix4())
    const L = p.length
    const H = p.height
    const T = p.thickness
    const opens = [...p.openings].sort((u, v) => u.at - v.at)
    const cuts = [-L / 2, ...opens.flatMap((q) => [q.at - q.width / 2, q.at + q.width / 2]), L / 2]
    // Spans of solid wall between y0 and y1 at each cut: full height between openings, below the sill and above the head.
    const pieces: { x0: number; x1: number; y0: number; y1: number }[] = []
    for (let j = 0; j < cuts.length - 1; j++) {
      const x0 = cuts[j]
      const x1 = cuts[j + 1]
      if (x1 - x0 < 0.005) continue
      const q = j % 2 === 1 ? opens[(j - 1) / 2] : null
      if (q) {
        if (q.sill > 0.005) pieces.push({ x0, x1, y0: 0, y1: q.sill })
        if (q.sill + q.height < H - 0.005) pieces.push({ x0, x1, y0: q.sill + q.height, y1: H })
        if (q.kind === "window") ctx.footprint((x0 + x1) / 2, 0, (x1 - x0) / 2, T / 2 + 0.03)
      } else {
        pieces.push({ x0, x1, y0: 0, y1: H })
        ctx.footprint((x0 + x1) / 2, 0, (x1 - x0) / 2, T / 2 + 0.03)
      }
    }
    for (const s of pieces) F.box(M.wall, (s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, 0, s.x1 - s.x0, s.y1 - s.y0, T)
    const blockedAt = (x: number, pad: number) => opens.some((q) => Math.abs(x - q.at) < q.width / 2 + pad)
    const dressFace = (f: z.output<typeof face>, sgn: number) => {
      const z0 = (sgn * T) / 2
      // Upright boards in panels narrower than they are tall, so the grain runs up the wall.
      const lining = (mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, d = 0.025) => {
        const w = x1 - x0
        if (w < 0.01 || y1 - y0 < 0.01) return
        const n = Math.max(1, Math.ceil(w / Math.min(0.9, (y1 - y0) * 0.9)))
        for (let i = 0; i < n; i++) F.box(mat, x0 + ((i + 0.5) * w) / n, (y0 + y1) / 2, z0 + (sgn * d) / 2, w / n - 0.006, y1 - y0, d)
      }
      const W = f.wainscot
      for (const s of pieces) {
        if (f.finish === "boards") lining(M.boards, s.x0, s.x1, Math.max(s.y0, W), s.y1)
        if (f.finish === "stone") F.box(M.stone, (s.x0 + s.x1) / 2, (Math.max(s.y0, W) + s.y1) / 2, z0 + sgn * 0.04, s.x1 - s.x0, s.y1 - Math.max(s.y0, W), 0.08)
        if (W > 0 && s.y0 < W) lining(M.panel, s.x0, s.x1, s.y0, Math.min(W, s.y1), 0.035)
      }
      if (W > 0) {
        // A moulded cap rail on the dado and a skirting board, broken by doors.
        for (let j = 0; j < cuts.length - 1; j++) {
          const q = j % 2 === 1 ? opens[(j - 1) / 2] : null
          const x0 = cuts[j]
          const x1 = cuts[j + 1]
          if (x1 - x0 < 0.01) continue
          if (!q || q.sill >= W) F.box(M.timber, (x0 + x1) / 2, W, z0 + sgn * 0.05, x1 - x0, 0.07, 0.07)
          if (!q || q.sill > 0.005) F.box(M.timber, (x0 + x1) / 2, 0.07, z0 + sgn * 0.045, x1 - x0, 0.14, 0.05)
        }
      }
      if (f.studs > 0) {
        const n = Math.max(1, Math.round(L / f.studs))
        for (let i = 0; i <= n; i++) {
          const x = THREE.MathUtils.clamp(-L / 2 + (i * L) / n, -L / 2 + 0.1, L / 2 - 0.1)
          if (blockedAt(x, 0.12)) continue
          F.box(M.timber, x, (Math.max(W, 0) + H) / 2, z0 + sgn * 0.06, 0.18, H - Math.max(W, 0), 0.12)
        }
        F.box(M.timber, 0, H - 0.1, z0 + sgn * 0.07, L, 0.2, 0.14)
      }
      if (f.rail > 0)
        for (let j = 0; j < cuts.length - 1; j++) {
          const q = j % 2 === 1 ? opens[(j - 1) / 2] : null
          const x0 = cuts[j]
          const x1 = cuts[j + 1]
          if (x1 - x0 > 0.01 && (!q || q.sill > f.rail || q.sill + q.height < f.rail)) F.box(M.timber, (x0 + x1) / 2, f.rail, z0 + sgn * 0.065, x1 - x0, 0.16, 0.13)
        }
    }
    dressFace(p.a, 1)
    dressFace(p.b, -1)
    const D = T + 0.12
    for (const q of opens) {
      const x0 = q.at - q.width / 2
      const x1 = q.at + q.width / 2
      const top = q.sill + q.height
      // Timber casing round the reveal: jambs, a head beam, and on windows a deep sill inside.
      for (const x of [x0 - 0.05, x1 + 0.05]) F.box(M.timber, x, q.sill + q.height / 2, 0, 0.12, q.height + 0.02, D)
      F.box(M.timber, q.at, top + 0.08, 0, q.width + 0.34, 0.18, D + 0.02)
      if (q.kind === "window") {
        F.box(M.timber, q.at, q.sill - 0.03, 0.05, q.width + 0.3, 0.07, D + 0.1)
        // Leaded lights: a stout frame, a mullion and transoms, a grid of cames, and glass in the middle of the wall.
        const [cols, rows] = q.panes
        F.box(M.timber, q.at, q.sill + 0.03, 0, q.width, 0.06, 0.1)
        F.box(M.timber, q.at, top - 0.03, 0, q.width, 0.06, 0.1)
        for (let i = 1; i < cols; i++) F.box(M.timber, x0 + (i * q.width) / cols, q.sill + q.height / 2, 0, 0.06, q.height, 0.1)
        for (let i = 1; i < rows; i++) F.box(M.lead, q.at, q.sill + (i * q.height) / rows, 0, q.width, 0.018, 0.03)
        const sub = Math.max(2, Math.round(q.width / cols / 0.14))
        for (let c = 0; c < cols; c++) for (let i = 1; i < sub; i++) F.box(M.lead, x0 + ((c + i / sub) * q.width) / cols, q.sill + q.height / 2, 0, 0.014, q.height, 0.03)
        const pane = G("tav-pane", () => new THREE.PlaneGeometry(1, 1))
        F.geo(M.glass, pane, M4(q.at, q.sill + q.height / 2, 0.02, 0, q.width, q.height, 1), { uv: "keep" })
        F.geo(M.glassOut, pane, M4(q.at, q.sill + q.height / 2, -0.02, Math.PI, q.width, q.height, 1), { uv: "keep" })
        continue
      }
      ctx.anchor("door", q.at, 0, 0.6 + T / 2)
      ctx.anchor("door", q.at, 0, -0.6 - T / 2)
      if (q.kind !== "door") continue
      F.box(M.timber, q.at, 0.02, 0, q.width, 0.04, D)
      if (q.leaf === undefined) continue
      // The leaf hangs on the jamb at x0 and swings into side a: upright planks, ledges, strap hinges, a ring pull.
      const a = (q.leaf * Math.PI) / 180
      const lw = q.width - 0.03
      const hinge = new Frame(b, M4(x0 + 0.02, 0, T / 2 - 0.04, -a))
      const n = Math.max(3, Math.round(lw / 0.16))
      for (let i = 0; i < n; i++) hinge.box(M.door, ((i + 0.5) * lw) / n, (q.height - 0.03) / 2 + 0.01, -0.03, lw / n - 0.006, q.height - 0.03, 0.05)
      for (const y of [0.35, q.height - 0.4]) {
        hinge.box(M.door, lw / 2, y, 0.01, lw - 0.06, 0.12, 0.03)
        hinge.box(M.iron, lw * 0.28, y, 0.03, lw * 0.56, 0.045, 0.012)
      }
      hinge.box(M.door, lw / 2, q.height / 2, 0.01, 0.1, q.height - 0.8, 0.03, 0, 0, Math.atan2(lw - 0.2, q.height - 0.9))
      hinge.geo(
        M.iron,
        G("tav-ring", () => new THREE.TorusGeometry(0.06, 0.012, 6, 16)),
        M4(lw - 0.14, 1.0, 0.04),
        { uv: "keep" }
      )
      hinge.geo(M.iron, knob(), M4(lw - 0.14, 1.07, 0.03, 0, 0.022, 0.022, 0.022), { uv: "keep" })
      const mid = new THREE.Vector3(lw / 2, 0, -0.03).applyMatrix4(M4(x0 + 0.02, 0, T / 2 - 0.04, -a))
      ctx.footprint(mid.x, mid.z, lw / 2, 0.05, -a)
    }
  },
  { wall: "plaster", glassOut: "glass" }
)

// ── Hearth ───────────────────────────────────────────────────────────────────

// A great stone fireplace against a wall, facing +z: a stepped chimney breast to the ceiling, an oak mantel beam with
// things on its shelf, a sooty firebox with a live fire on andirons, a spit of roasting meat, a pot on a trivet, a stone
// apron in front and a stack of firewood beside it.
export const hearth = defineBuilder(
  z
    .object({
      width: size(8).default(3),
      depth: size(3).default(0.9),
      height: size(12).default(3.4),
      opening: z.tuple([size(6), size(4)]).default([1.8, 1.3]),
      spit: z.boolean().default(true),
      fire: z.enum(["blaze", "embers", "none"]).default("blaze"),
      wood: z.enum(["left", "right", "none"]).default("right"),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const F = new Frame(b, new THREE.Matrix4())
    const { width: w, depth: d, height: H } = p
    const [ow, oh] = p.opening
    const od = d - 0.18
    const mantel = oh + 0.34
    // The breast: piers either side of the firebox and a lintel course over it, then a narrower stack to the ceiling,
    // a dark mortar core faced with courses of rough stones.
    const pier = (w - ow) / 2
    for (const s of [-1, 1]) F.box(M.mortar, s * (ow / 2 + pier / 2), mantel / 2, -d / 2, pier, mantel, d)
    F.box(M.mortar, 0, (oh + mantel) / 2 + 0.02, -d / 2, ow + 0.02, mantel - oh, d)
    const sw = w * 0.84
    const sd = d * 0.8
    F.box(M.mortar, 0, mantel + 0.12, -d / 2, w + 0.1, 0.24, d + 0.1)
    F.box(M.mortar, 0, (mantel + 0.24 + H) / 2, -d + sd / 2, sw, H - mantel - 0.24, sd)
    const stone = G("tav-stone", () => new THREE.IcosahedronGeometry(1, 1))
    // Courses of stones over a face: `u` runs along it from u0 to u1, `y` from y0 to y1, the face at `at` looking along `n`.
    const face = (u0: number, u1: number, y0: number, y1: number, at: (u: number) => [number, number], ry: number) => {
      for (let y = y0; y < y1 - 0.08; ) {
        const h = Math.min(y1 - y, rand(0.2, 0.32))
        for (let u = u0 + rand(-0.15, 0); u < u1; ) {
          const sw2 = rand(0.28, 0.55)
          const a = Math.max(u, u0)
          const c = Math.min(u + sw2, u1)
          if (c - a > 0.06) {
            const [x, zz] = at((a + c) / 2)
            F.geo(M.stone, stone, M4(x, y + h / 2, zz, ry + rand(-0.06, 0.06), (c - a) * 0.62, h * 0.68, rand(0.05, 0.08), rand(-0.08, 0.08), rand(-0.06, 0.06)), {
              uv: "keep",
              flat: true,
            })
          }
          u += sw2 + 0.025
        }
        y += h + 0.025
      }
    }
    for (const s of [-1, 1]) {
      face(s < 0 ? -w / 2 : ow / 2, s < 0 ? -ow / 2 : w / 2, 0.1, oh, (u) => [u, 0], 0)
      face(-d, 0, 0.1, mantel, (u) => [s * w * 0.5, u], (s * Math.PI) / 2)
      face(-d, sd - d, mantel + 0.24, H, (u) => [s * sw * 0.5, u], (s * Math.PI) / 2)
    }
    face(-ow / 2, ow / 2, oh, mantel, (u) => [u, 0], 0)
    face(-sw / 2, sw / 2, mantel + 0.24, H, (u) => [u, sd - d], 0)
    // The firebox: sooty back and cheeks, a smoke shelf, a hearth of old stone.
    F.box(M.soot, 0, oh / 2, -od - 0.04, ow, oh, 0.08)
    for (const s of [-1, 1]) F.box(M.soot, s * (ow / 2 - 0.04), oh / 2, -od / 2, 0.08, oh, od, s * 0.08)
    F.box(M.soot, 0, oh - 0.04, -od / 2, ow, 0.08, od)
    F.box(M.soot, 0, 0.02, -od / 2, ow, 0.04, od)
    // The oak mantel beam and its shelf.
    F.box(M.mantel, 0, oh + 0.14, 0.06, w + 0.3, 0.28, 0.2)
    F.box(M.mantel, 0, mantel + 0.26, 0.05, w + 0.42, 0.06, 0.38)
    for (const s of [-1, 1]) F.box(M.mantel, s * (w / 2 + 0.05), mantel + 0.12, 0.12, 0.14, 0.22, 0.14)
    // On the shelf: two candlesticks, a jug, tankards and a small chest.
    for (const s of [-1, 1]) {
      F.lathe(M.brass, s * (w / 2 - 0.15), mantel + 0.29, 0.07, [
        [0, 0],
        [0.06, 0],
        [0.06, 0.015],
        [0.018, 0.04],
        [0.014, 0.2],
        [0.035, 0.22],
        [0.035, 0.24],
        [0, 0.24],
      ])
      F.cyl(M.candle, s * (w / 2 - 0.15), mantel + 0.53, 0.07, 0.016, 0.016, 0.12, 8)
      F.geo(M.flame, flameGeo(), M4(s * (w / 2 - 0.15), mantel + 0.68, 0.07, 0, 0.012, 0.024, 0.012), { uv: "keep" })
    }
    F.lathe(M.pottery, -0.75, mantel + 0.29, 0.06, [
      [0, 0],
      [0.07, 0],
      [0.1, 0.1],
      [0.08, 0.2],
      [0.04, 0.24],
      [0.05, 0.27],
    ])
    for (const x of [0.55, 0.72]) tankard(F, M, x, mantel + 0.29, 0.08, rand(0, TAU), 0.9)
    F.box(M.mantel, 1.0, mantel + 0.36, 0.05, 0.22, 0.14, 0.14)
    // A flagged apron before the fire.
    F.box(M.apron, 0, 0.05, 0.42, w + 0.2, 0.1, 0.84)
    // The fire: logs on iron andirons, a bed of embers, and live flame.
    const fy = 0.04
    for (const s of [-1, 1]) {
      F.box(M.iron, s * 0.42, fy + 0.12, -od / 2, 0.04, 0.04, 0.5)
      beam(b, M.iron, [s * 0.42, fy, -od / 2 + 0.22], [s * 0.42, fy + 0.34, -od / 2 + 0.24], 0.022, 5)
      F.geo(M.iron, knob(), M4(s * 0.42, fy + 0.36, -od / 2 + 0.24, 0, 0.035, 0.035, 0.035), { uv: "keep" })
    }
    const logs: [number, number, number, number][] = [
      [-0.55, -od / 2 - 0.05, 0.55, -od / 2 - 0.12],
      [-0.5, -od / 2 + 0.1, 0.5, -od / 2 + 0.06],
      [-0.25, -od / 2 - 0.22, 0.35, -od / 2 + 0.12],
    ]
    for (const [i, [x0, z0, x1, z1]] of logs.entries()) beam(b, M.log, [x0, fy + 0.2 + i * 0.07, z0], [x1, fy + 0.2 + i * 0.09, z1], 0.07, 8, 0.065)
    for (let i = 0; i < (p.fire === "none" ? 0 : 26); i++) {
      const s = rand(0.03, 0.07)
      F.geo(
        i % 3 ? M.coal : M.soot,
        G("tav-ember", () => new THREE.IcosahedronGeometry(1, 0)),
        M4(rand(-ow / 2 + 0.25, ow / 2 - 0.25), fy + 0.02, -od / 2 + rand(-0.25, 0.22), rand(0, 3), s, s * 0.6, s),
        {
          uv: "keep",
        }
      )
    }
    if (p.fire === "blaze" && M.fire.userData.fire) {
      const turn = rand(0, TAU)
      for (const [x, s] of [
        [0, 1],
        [-0.32, 0.7],
        [0.3, 0.75],
      ] as const)
        for (let i = 0; i < 3; i++)
          F.geo(
            M.fire,
            G("flame-card", () => new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0)),
            M4(x, fy + 0.22, -od / 2 - 0.02, turn + x * 3 + (i * TAU) / 6, 0.7 * s, 0.82 * s, 1),
            { uv: "keep" }
          )
    }
    if (p.spit) {
      // A spit across the fire on two iron stands, a haunch of meat and two fowl on it.
      const sy = 0.78
      for (const s of [-1, 1]) {
        beam(b, M.iron, [s * (ow / 2 - 0.14), 0, -0.08], [s * (ow / 2 - 0.14), sy + 0.04, -0.12], 0.02, 5)
        F.box(M.iron, s * (ow / 2 - 0.14), sy + 0.04, -0.12, 0.08, 0.03, 0.03)
      }
      beam(b, M.iron, [-ow / 2 + 0.05, sy, -0.12], [ow / 2 - 0.05, sy, -0.12], 0.014, 5)
      beam(b, M.iron, [ow / 2 - 0.05, sy, -0.12], [ow / 2 + 0.08, sy - 0.12, -0.12], 0.012, 5)
      F.sphere(M.roast, -0.05, sy, -0.12, 0.28, 0.15, 0.16, 14)
      F.sphere(M.roastDark, 0.12, sy + 0.02, -0.12, 0.12, 0.12, 0.13, 10)
      F.cyl(M.bone, 0.28, sy - 0.02, -0.12, 0.03, 0.025, 0.18, 6, 0, Math.PI / 2)
      for (const x of [-0.5, 0.42]) {
        F.sphere(M.roast, x, sy - 0.02, -0.12, 0.11, 0.09, 0.09, 10)
        F.sphere(M.roastDark, x + 0.08, sy - 0.05, -0.12, 0.04, 0.04, 0.03, 6)
      }
    }
    // An iron pot on a trivet at the side of the fire.
    const px = -ow / 2 + 0.28
    for (let i = 0; i < 3; i++) {
      const a = (i * TAU) / 3
      beam(b, M.iron, [px + Math.cos(a) * 0.14, 0.04, -od / 2 + 0.15 + Math.sin(a) * 0.14], [px, 0.2, -od / 2 + 0.15], 0.012, 4)
    }
    F.lathe(M.iron, px, 0.18, -od / 2 + 0.15, [
      [0, 0],
      [0.1, 0.01],
      [0.17, 0.08],
      [0.18, 0.18],
      [0.15, 0.26],
      [0.16, 0.28],
      [0.13, 0.28],
    ])
    if (p.wood !== "none") {
      // Split logs stacked against the breast, ends toward the room.
      const s = p.wood === "left" ? -1 : 1
      const x0 = s * (w / 2 + 0.45)
      for (let row = 0; row < 4; row++)
        for (let i = 0; i < 4 - (row >> 1); i++) {
          const x = x0 + (i - (3 - (row >> 1)) / 2) * 0.16 + (row % 2) * 0.04
          beam(b, M.log, [x, 0.07 + row * 0.14, -0.05], [x + rand(-0.02, 0.02), 0.07 + row * 0.14, 0.55], 0.07, 6)
        }
      ctx.footprint(x0, 0.25, 0.38, 0.33, 0, 0.6)
      // Fire irons on the other side.
      const ix = -s * (w / 2 + 0.18)
      for (const [dx, h] of [
        [-0.06, 0.95],
        [0.05, 0.85],
      ])
        beam(b, M.iron, [ix + dx, 0.02, 0.2], [ix + dx * 0.4, h, 0.05], 0.012, 4)
    }
    ctx.footprint(0, -d / 2, w / 2, d / 2)
  },
  { stone: "hearthStone", mortar: "hearthMortar", apron: "hearthApron", mantel: "timber", flame: "candleFlame" }
)

// ── Small things ─────────────────────────────────────────────────────────────

function tankard(F: Frame, M: M, x: number, y: number, z: number, ry: number, s = 1) {
  F.lathe(M.pewter, x, y, z, [
    [0, 0],
    [0.045 * s, 0],
    [0.048 * s, 0.01 * s],
    [0.043 * s, 0.13 * s],
    [0.046 * s, 0.14 * s],
    [0.04 * s, 0.14 * s],
    [0.04 * s, 0.11 * s],
    [0, 0.11 * s],
  ])
  F.geo(
    M.pewter,
    G("tav-handle", () => new THREE.TorusGeometry(0.035, 0.008, 5, 10, Math.PI)),
    M4(x + Math.cos(ry) * 0.045 * s, y + 0.07 * s, z - Math.sin(ry) * 0.045 * s, ry, s, s, s, 0, -Math.PI / 2),
    {
      uv: "keep",
    }
  )
}
function mug(F: Frame, M: M, x: number, y: number, z: number, ry: number) {
  F.lathe(M.pottery, x, y, z, [
    [0, 0],
    [0.04, 0],
    [0.045, 0.06],
    [0.042, 0.11],
    [0.036, 0.11],
    [0.036, 0.09],
    [0, 0.09],
  ])
  F.geo(
    M.pottery,
    G("tav-handle", () => new THREE.TorusGeometry(0.035, 0.008, 5, 10, Math.PI)),
    M4(x + Math.cos(ry) * 0.044, y + 0.055, z - Math.sin(ry) * 0.044, ry, 0.8, 0.8, 0.8, 0, -Math.PI / 2),
    {
      uv: "keep",
    }
  )
}
function plate(F: Frame, M: M, rand: Rand, x: number, y: number, z: number) {
  F.cyl(M.pewter, x, y, z, 0.1, 0.12, 0.015, 16)
  const k = rand()
  if (k < 0.35) F.sphere(M.bread, x, y + 0.04, z, 0.08, 0.045, 0.05, 10)
  else if (k < 0.6) {
    F.sphere(M.roast, x - 0.02, y + 0.035, z, 0.06, 0.035, 0.045, 8)
    F.cyl(M.bone, x + 0.04, y + 0.03, z, 0.01, 0.008, 0.07, 5, 0, Math.PI / 2)
  } else if (k < 0.8) F.box(M.cheese, x, y + 0.035, z, 0.08, 0.04, 0.06, rand(0, 3))
}
function candle(F: Frame, M: M, x: number, y: number, z: number, h = 0.12) {
  F.cyl(M.pewter, x, y, z, 0.045, 0.03, 0.015, 10)
  F.cyl(M.candle, x, y + 0.015, z, 0.016, 0.014, h, 8)
  F.geo(M.flame, flameGeo(), M4(x, y + h + 0.04, z, 0, 0.011, 0.024, 0.011), { uv: "keep" })
}
// Things on a table top at height y: what people are eating and drinking, scattered round its edge.
function setting(F: Frame, M: M, rand: Rand, n: number, y: number, spot: (t: number) => [number, number]) {
  for (let i = 0; i < n; i++) {
    const [x, z] = spot((i + rand(0.1, 0.9)) / n)
    const k = rand()
    if (k < 0.35) tankard(F, M, x, y, z, rand(0, TAU))
    else if (k < 0.55) mug(F, M, x, y, z, rand(0, TAU))
    else if (k < 0.85) plate(F, M, rand, x, y, z)
    else
      F.lathe(M.pottery, x, y, z, [
        [0, 0],
        [0.05, 0],
        [0.075, 0.08],
        [0.06, 0.17],
        [0.03, 0.2],
        [0.035, 0.22],
      ])
  }
}

// ── Furniture ────────────────────────────────────────────────────────────────

// A table: a trestle of planks on slab legs with a stretcher, or a round top on four splayed legs. `setting` scatters
// tankards, mugs, plates and jugs round its edge, and `candle` stands one in the middle.
export const table = defineBuilder(
  z
    .object({
      kind: z.enum(["trestle", "round"]).default("trestle"),
      length: size(6).default(1.9),
      width: size(3).default(0.85),
      radius: size(2).default(0.55),
      height: size(1.5).default(0.76),
      setting: z.number().int().min(0).max(16).default(0),
      candle: z.boolean().default(false),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const F = new Frame(b, new THREE.Matrix4())
    const h = p.height
    const t = 0.07
    if (p.kind === "trestle") {
      const { length: l, width: w } = p
      const n = Math.max(2, Math.round(w / 0.24))
      for (let i = 0; i < n; i++) F.box(M.top, 0, h - t / 2, -w / 2 + ((i + 0.5) * w) / n, l, t, w / n - 0.008)
      for (const s of [-1, 1]) {
        const x = s * (l / 2 - 0.28)
        F.box(M.top, x, h - t - 0.04, 0, 0.1, 0.08, w - 0.1)
        F.box(M.top, x, (h - t - 0.08) / 2 + 0.06, 0, 0.08, h - t - 0.14, w * 0.42)
        F.box(M.top, x, 0.04, 0, 0.12, 0.08, w - 0.12)
      }
      F.box(M.top, 0, 0.26, 0, l - 0.56, 0.08, 0.06)
      setting(F, M, rand, p.setting, h, (u) => {
        const side = u < 0.5 ? -1 : 1
        const v = (u * 2) % 1
        return [-l / 2 + 0.2 + v * (l - 0.4), side * (w / 2 - 0.16)]
      })
      if (p.candle) candle(F, M, rand(-0.15, 0.15), h, 0)
      ctx.footprint(0, 0, l / 2, w / 2, 0, h)
    } else {
      const r = p.radius
      F.cyl(M.top, 0, h - t, 0, r, r, t, 28)
      F.cyl(M.top, 0, h - t - 0.08, 0, r * 0.8, r * 0.8, 0.08, 16)
      for (let i = 0; i < 4; i++) {
        const a = (i * TAU) / 4 + Math.PI / 4
        beam(b, M.top, [Math.cos(a) * r * 0.62, h - t - 0.05, Math.sin(a) * r * 0.62], [Math.cos(a) * r * 0.78, 0, Math.sin(a) * r * 0.78], 0.035, 6, 0.03)
      }
      setting(F, M, rand, p.setting, h, (u) => [Math.cos(u * TAU) * r * 0.66, Math.sin(u * TAU) * r * 0.66])
      if (p.candle) candle(F, M, 0, h, 0)
      ctx.footprint(0, 0, r * 0.82, r * 0.82, 0, h)
    }
  },
  { top: "timber", flame: "candleFlame" }
)

// A bench, or with `back` a high-backed settle with arms: boards on slab ends.
export const bench = defineBuilder(
  z
    .object({
      length: size(6).default(1.6),
      height: size(1).default(0.45),
      depth: size(1).default(0.32),
      back: num(0, 2.5).default(0),
    })
    .strict(),
  (ctx, p) => {
    const F = new Frame(ctx.b, new THREE.Matrix4())
    const M = ctx.M
    const { length: l, height: h, depth: d } = p
    F.box(M.seat, 0, h - 0.025, 0, l, 0.05, d)
    if (!p.back) {
      for (const s of [-1, 1]) F.box(M.seat, s * (l / 2 - 0.16), (h - 0.05) / 2, 0, 0.06, h - 0.05, d - 0.04)
      F.box(M.seat, 0, h * 0.4, 0, l - 0.32, 0.07, 0.04)
      ctx.footprint(0, 0, l / 2, d / 2, 0, h)
      return
    }
    // A settle: solid ends rising into arms, a boarded back behind the seat, and a box base.
    const H = p.back
    for (const s of [-1, 1]) {
      F.box(M.seat, s * (l / 2 - 0.03), h / 2 + 0.17, -0.04, 0.06, h + 0.34, d + 0.08)
      F.box(M.seat, s * (l / 2 - 0.03), h + 0.36, 0.02, 0.08, 0.05, d + 0.14)
    }
    F.box(M.seat, 0, (h - 0.05) / 2, d / 2 - 0.03, l - 0.06, h - 0.05, 0.04)
    const n = Math.max(3, Math.round(l / 0.2))
    for (let i = 0; i < n; i++) F.box(M.seat, -l / 2 + ((i + 0.5) * l) / n, (h + H) / 2, -d / 2 - 0.02, l / n - 0.008, H - h, 0.04)
    F.box(M.seat, 0, H + 0.03, -d / 2 - 0.02, l + 0.06, 0.06, 0.1)
    F.box(M.seat, 0, (h + H) / 2 + 0.25, -d / 2, l - 0.06, 0.06, 0.05)
    ctx.footprint(0, -0.03, l / 2, d / 2 + 0.03, 0, H)
  },
  { seat: "timber" }
)

// A three-legged stool.
export const stool = defineBuilder(
  z.object({ height: size(1.2).default(0.46), radius: size(0.5).default(0.16) }).strict(),
  (ctx, p) => {
    const F = new Frame(ctx.b, new THREE.Matrix4())
    const { height: h, radius: r } = p
    F.cyl(ctx.M.seat, 0, h - 0.04, 0, r, r, 0.04, 14)
    for (let i = 0; i < 3; i++) {
      const a = (i * TAU) / 3 + ctx.rand(0, 0.3)
      beam(ctx.b, ctx.M.seat, [Math.cos(a) * r * 0.55, h - 0.04, Math.sin(a) * r * 0.55], [Math.cos(a) * r * 1.05, 0, Math.sin(a) * r * 1.05], 0.022, 5, 0.018)
    }
  },
  { seat: "timber" }
)

// A ladder-back chair facing +z.
export const chair = defineBuilder(
  z.object({ height: size(1.2).default(0.45), back: size(2).default(0.98) }).strict(),
  (ctx, p) => {
    const F = new Frame(ctx.b, new THREE.Matrix4())
    const M = ctx.M
    const h = p.height
    F.box(M.seat, 0, h - 0.02, 0, 0.44, 0.04, 0.4)
    for (const [x, z] of [
      [-0.19, 0.17],
      [0.19, 0.17],
    ])
      F.box(M.seat, x, (h - 0.04) / 2, z, 0.04, h - 0.04, 0.04)
    for (const x of [-0.19, 0.19]) F.box(M.seat, x, p.back / 2, -0.17, 0.045, p.back, 0.045)
    for (const y of [h + 0.18, h + 0.32, p.back - 0.08]) F.box(M.seat, 0, y, -0.17, 0.38, 0.06, 0.02)
    F.box(M.seat, 0, 0.18, 0.17, 0.38, 0.03, 0.03)
    F.box(M.seat, 0, 0.22, -0.17, 0.38, 0.03, 0.03)
  },
  { seat: "timber" }
)

// ── Bar ──────────────────────────────────────────────────────────────────────

// A bar along x facing +z: a panelled counter with an oak top and a foot rail, a gap at one end to pass behind, and
// against the wall `back` metres behind it a dresser of shelves with bottles, jugs and tankards on hooks, and kegs.
export const bar = defineBuilder(
  z
    .object({
      length: size(20).default(6),
      height: size(1.6).default(1.08),
      depth: size(1.5).default(0.62),
      back: size(4).default(1.55),
      gap: z.enum(["left", "right"]).default("left"),
      kegs: z.number().int().min(0).max(8).default(3),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const F = new Frame(b, new THREE.Matrix4())
    const { height: h, depth: d } = p
    const g = p.gap === "left" ? -1 : 1
    const x0 = g < 0 ? -p.length / 2 + 0.85 : -p.length / 2
    const x1 = g < 0 ? p.length / 2 : p.length / 2 - 0.85
    const l = x1 - x0
    const cx = (x0 + x1) / 2
    // The counter: an upright-boarded front between posts, a dark plinth, an overhanging top, a rail on brackets.
    const n = Math.max(3, Math.round(l / 0.17))
    for (let i = 0; i < n; i++) F.box(M.panel, x0 + ((i + 0.5) * l) / n, (h - 0.08) / 2 + 0.06, -0.04, l / n - 0.006, h - 0.14, 0.04)
    F.box(M.panel, cx, (h - 0.08) / 2, -d / 2, l - 0.08, h - 0.08, d - 0.1)
    const posts = Math.max(2, Math.round(l / 1.2))
    for (let i = 0; i <= posts; i++) F.box(M.timber, x0 + 0.05 + (i * (l - 0.1)) / posts, (h - 0.08) / 2, -0.01, 0.1, h - 0.08, 0.06)
    F.box(M.timber, cx, 0.05, -0.02, l + 0.02, 0.1, 0.08)
    F.box(M.timber, cx, h - 0.15, -0.015, l + 0.02, 0.06, 0.07)
    F.box(M.top, cx, h - 0.04, -d / 2 + 0.06, l + 0.12, 0.08, d + 0.14)
    // The end panel at the gap.
    F.box(M.panel, g < 0 ? x0 + 0.02 : x1 - 0.02, (h - 0.08) / 2, -d / 2, 0.05, h - 0.08, d - 0.04)
    beam(b, M.brass, [x0 + 0.1, 0.2, 0.17], [x1 - 0.1, 0.2, 0.17], 0.022, 8)
    for (let i = 0; i <= posts; i++) {
      const x = x0 + 0.05 + (i * (l - 0.1)) / posts
      beam(b, M.brass, [x, 0.2, 0.17], [x, 0.2, 0.0], 0.012, 5)
    }
    // On the counter: tankards, a candle, a bowl, a cloth.
    for (let i = 0; i < Math.round(l / 1.1); i++) {
      const x = x0 + 0.4 + rand(0, l - 0.8)
      const k = rand()
      if (k < 0.5) tankard(F, M, x, h, -0.15 + rand(-0.1, 0.05), rand(0, TAU))
      else if (k < 0.7) mug(F, M, x, h, -0.2, rand(0, TAU))
      else if (k < 0.85)
        F.lathe(M.pottery, x, h, -0.3, [
          [0, 0],
          [0.07, 0],
          [0.12, 0.06],
          [0.13, 0.08],
        ])
      else F.box(M.cloth, x, h + 0.005, -0.25, 0.3, 0.01, 0.22, rand(-0.4, 0.4))
    }
    candle(F, M, x1 - 0.5, h, -0.3, 0.16)
    ctx.footprint(cx, -d / 2 + 0.06, l / 2 + 0.06, d / 2 + 0.07, 0, h)
    // The dresser against the wall: a cupboard below, open shelves above on uprights.
    const zb = -p.back
    const L = p.length
    F.box(M.panel, 0, 0.45, zb + 0.25, L, 0.9, 0.5)
    F.box(M.top, 0, 0.92, zb + 0.26, L + 0.04, 0.05, 0.54)
    const doors = Math.max(2, Math.round(L / 0.8))
    for (let i = 0; i < doors; i++) {
      const x = -L / 2 + ((i + 0.5) * L) / doors
      F.box(M.timber, x, 0.47, zb + 0.505, L / doors - 0.1, 0.7, 0.02)
      F.geo(M.iron, knob(), M4(x + L / doors / 2 - 0.12, 0.6, zb + 0.53, 0, 0.018, 0.018, 0.018), { uv: "keep" })
    }
    const ups = Math.max(2, Math.round(L / 1.1))
    for (let i = 0; i <= ups; i++) F.box(M.timber, -L / 2 + 0.04 + (i * (L - 0.08)) / ups, 1.85, zb + 0.13, 0.08, 1.9, 0.26)
    const shelves = [1.45, 1.92, 2.4]
    for (const y of shelves) F.box(M.top, 0, y, zb + 0.14, L, 0.04, 0.28)
    F.box(M.timber, 0, 2.82, zb + 0.15, L + 0.1, 0.12, 0.32)
    for (const [k, y] of shelves.entries())
      for (let x = -L / 2 + 0.18; x < L / 2 - 0.12; x += rand(0.09, 0.2)) {
        const pick = rand()
        if (k === 0 && pick < 0.25) continue
        if (pick < 0.6) {
          const tall = rand(0.22, 0.32)
          F.lathe(rand() < 0.5 ? M.bottleGreen : M.bottleBrown, x, y + 0.02, zb + 0.14 + rand(-0.04, 0.04), [
            [0, 0],
            [0.035, 0],
            [0.038, tall * 0.62],
            [0.014, tall * 0.8],
            [0.012, tall],
            [0, tall],
          ])
        } else if (pick < 0.8)
          F.lathe(M.pottery, x, y + 0.02, zb + 0.14, [
            [0, 0],
            [0.05, 0],
            [0.075, 0.09],
            [0.06, 0.18],
            [0.03, 0.21],
            [0.035, 0.23],
          ])
        else tankard(F, M, x, y + 0.02, zb + 0.14, rand(0, TAU))
      }
    // Tankards on hooks under the lowest shelf.
    for (let x = -L / 2 + 0.3; x < L / 2 - 0.2; x += 0.22) {
      beam(b, M.iron, [x, shelves[0] - 0.02, zb + 0.2], [x, shelves[0] - 0.08, zb + 0.24], 0.005, 4)
      tankard(F, M, x, shelves[0] - 0.24, zb + 0.24, Math.PI / 2, 0.9)
    }
    // Kegs on their sides on a cradle at one end of the cupboard, taps toward the room.
    for (let i = 0; i < p.kegs; i++) {
      const x = g * (L / 2 - 0.35 - i * 0.62)
      for (const s of [-1, 1]) F.box(M.timber, x + s * 0.18, 1.0, zb + 0.26, 0.06, 0.1, 0.5)
      barrel(framed(b, M4(x, 1.3, zb + 0.02, 0, 1, 1, 1, Math.PI / 2)), M, 0, 0, 0, 0.27, 0.5)
      beam(b, M.brass, [x, 1.22, zb + 0.52], [x, 1.22, zb + 0.6], 0.02, 6)
      beam(b, M.brass, [x, 1.22, zb + 0.6], [x, 1.14, zb + 0.62], 0.014, 5)
    }
    ctx.footprint(0, zb + 0.25, L / 2, 0.27)
  },
  { top: "timber", flame: "candleFlame" }
)

// ── Stairs ───────────────────────────────────────────────────────────────────

// A straight flight rising toward -z from its foot at z = 0: treads and risers between stringers, a newel post and a
// handrail on balusters on the `rail` side, and with `boarded` that side's underside boarded in to the floor. Otherwise
// the space under it stays open for stores.
export const stairs = defineBuilder(
  z
    .object({
      width: size(4).default(1.0),
      rise: size(10).default(3.4),
      run: size(20).default(4.8),
      rail: z.enum(["left", "right", "none"]).default("left"),
      boarded: z.boolean().default(false),
    })
    .strict(),
  (ctx, p) => {
    const { b, M } = ctx
    const F = new Frame(b, new THREE.Matrix4())
    const { width: w, rise: R, run: U } = p
    const n = Math.max(2, Math.round(R / 0.19))
    const rh = R / n
    const td = U / n
    for (let i = 0; i < n; i++) {
      const y = (i + 1) * rh
      const zz = -i * td
      F.box(M.tread, 0, y - 0.025, zz - td / 2 + 0.02, w, 0.05, td + 0.04)
      F.box(M.riser, 0, y - rh / 2 - 0.02, zz + 0.005, w - 0.04, rh - 0.04, 0.025)
    }
    const slope = Math.atan2(R, U)
    const sl = Math.hypot(R, U)
    for (const s of [-1, 1]) F.box(M.timber, s * (w / 2 + 0.03), R / 2 - 0.05, -U / 2, 0.06, 0.28, sl + 0.1, 0, slope)
    const side = p.rail === "right" ? 1 : -1
    if (p.boarded) {
      // The underside boarded in: a triangle of upright boards.
      const cols = Math.max(2, Math.round(U / 0.22))
      for (let i = 0; i < cols; i++) {
        const zz = -((i + 0.5) * U) / cols
        const top = ((i + 0.5) / cols) * R - 0.12
        if (top > 0.05) F.box(M.riser, side * (w / 2 + 0.03), top / 2, zz, 0.03, top, U / cols - 0.006)
      }
    }
    if (p.rail !== "none") {
      const x = side * (w / 2 + 0.02)
      F.box(M.timber, x, 0.55, 0, 0.12, 1.1, 0.12)
      F.geo(M.timber, knob(), M4(x, 1.13, 0, 0, 0.07, 0.05, 0.07), { uv: "keep" })
      beam(b, M.timber, [x, 1.02, 0], [x, R + 0.92, -U + 0.1], 0.035, 6)
      for (let i = 1; i < n; i += 1) {
        const zz = -i * td + td * 0.3
        const y = (i + 1) * rh
        beam(b, M.timber, [x, y, zz], [x, y + 0.86 - 0.04, zz], 0.018, 5)
      }
    }
    ctx.footprint(0, -U / 2, w / 2 + 0.08, U / 2)
  },
  { tread: "timber", riser: "timber" }
)

// ── Lights ───────────────────────────────────────────────────────────────────

// A wagon-wheel chandelier hung on three chains from a hook at its origin (the ceiling), candles round its rim.
export const chandelier = defineBuilder(
  z
    .object({
      radius: size(2).default(0.55),
      candles: z.number().int().min(3).max(16).default(8),
      drop: size(12).default(1.0),
    })
    .strict(),
  (ctx, p) => {
    const { b, M } = ctx
    const F = new Frame(b, new THREE.Matrix4())
    const { radius: r, drop } = p
    const y = -drop
    F.geo(
      M.timber,
      G(`tav-wheel-${r}`, () => new THREE.TorusGeometry(r, 0.04, 6, 28)),
      M4(0, y, 0, 0, 1, 1, 1, Math.PI / 2),
      { uv: "keep" }
    )
    F.cyl(M.timber, 0, y - 0.06, 0, 0.07, 0.07, 0.12, 10)
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6
      beam(b, M.timber, [0, y, 0], [Math.cos(a) * r, y, Math.sin(a) * r], 0.02, 5)
    }
    for (let i = 0; i < 3; i++) {
      const a = (i * TAU) / 3 + 0.3
      beam(b, M.iron, [Math.cos(a) * r * 0.9, y, Math.sin(a) * r * 0.9], [0, -0.05, 0], 0.008, 4)
    }
    F.geo(
      M.iron,
      G("tav-hook", () => new THREE.TorusGeometry(0.04, 0.01, 5, 12)),
      M4(0, -0.04, 0),
      { uv: "keep" }
    )
    for (let i = 0; i < p.candles; i++) {
      const a = (i * TAU) / p.candles
      const x = Math.cos(a) * r
      const zz = Math.sin(a) * r
      const h = 0.1 + ctx.rand(0, 0.08)
      F.cyl(M.iron, x, y + 0.03, zz, 0.035, 0.035, 0.015, 8)
      F.cyl(M.candle, x, y + 0.045, zz, 0.02, 0.018, h, 8)
      F.geo(M.candle, flameGeo(), M4(x + 0.02, y + 0.045 + h * 0.6, zz, 0, 0.01, 0.03, 0.01), { uv: "keep" })
      F.geo(M.flame, flameGeo(), M4(x, y + 0.045 + h + 0.035, zz, 0, 0.012, 0.026, 0.012), { uv: "keep" })
    }
  },
  { flame: "candleFlame" }
)

// ── The Dragonbone ───────────────────────────────────────────────────────────

// A tapered tube along a smooth curve through `pts`: a horn, a brow ridge or a cheekbone, from radius r0 to r1.
function taperedTube(pts: THREE.Vector3[], r0: number, r1: number, seg = 14, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(pts)
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false)
  const pos = g.attributes.position
  const v = new THREE.Vector3()
  const c = new THREE.Vector3()
  for (let i = 0; i <= seg; i++) {
    const t = i / seg
    curve.getPointAt(t, c)
    const r = r0 + (r1 - r0) * t ** 0.8
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c)
      pos.setXYZ(k, v.x, v.y, v.z)
    }
  }
  g.computeVertexNormals()
  return g
}

// A dragon's skull mounted on an oak shield, facing +z from a wall at its origin: a domed cranium with cheekbones and
// a crest, a long snout with teeth, the lower jaw hanging open, deep sockets under heavy brows, horns sweeping out, up
// and forward, spines along the crown.
export const dragonSkull = defineBuilder(
  z.object({ length: size(4).default(1.3), jaw: num(0, 40).default(16) }).strict(),
  (ctx, p) => {
    const { M } = ctx
    const F = new Frame(ctx.b, new THREE.Matrix4())
    const L = p.length
    const P = (x: number, y: number, zz: number) => new THREE.Vector3(x * L, y * L, zz * L)
    const tube = (mat: THREE.Material, pts: [number, number, number][], r0: number, r1: number, seg = 14) => {
      const g = taperedTube(
        pts.map(([x, y, zz]) => P(x, y, zz)),
        r0 * L,
        r1 * L,
        seg
      )
      F.geo(mat, g, M4(), { uv: "keep" })
      g.dispose()
    }
    const ball = (mat: THREE.Material, x: number, y: number, zz: number, sx: number, sy: number, sz: number, pitch = 0) =>
      F.geo(
        mat,
        G("tav-ball", () => new THREE.SphereGeometry(1, 20, 14)),
        M4(x * L, y * L, zz * L, 0, sx * L, sy * L, sz * L, pitch),
        { uv: "keep" }
      )
    // The shield it hangs on.
    const shield: [number, number][] = [
      [-0.42, 0.42],
      [0.42, 0.42],
      [0.44, 0.0],
      [0.3, -0.36],
      [0, -0.52],
      [-0.3, -0.36],
      [-0.44, 0],
    ]
    F.shape(
      M.plaque,
      shield.map(([x, y]) => [x * L, y * L] as [number, number]),
      0.05,
      M4(0, 0, 0)
    )
    // Cranium, a crest down its back, the upper jaw and the blunt nose.
    ball(M.bone, 0, 0.03, 0.24, 0.22, 0.17, 0.24)
    ball(M.bone, 0, 0.12, 0.2, 0.06, 0.1, 0.2)
    ball(M.bone, 0, -0.01, 0.62, 0.135, 0.07, 0.38)
    ball(M.bone, 0, 0.0, 0.95, 0.085, 0.06, 0.09)
    ball(M.bone, 0, 0.045, 0.66, 0.06, 0.05, 0.3)
    for (const s of [-1, 1]) {
      // Heavy brows over deep sockets, cheekbones, and the nostrils.
      tube(
        M.bone,
        [
          [s * 0.08, 0.15, 0.3],
          [s * 0.16, 0.14, 0.42],
          [s * 0.17, 0.1, 0.52],
        ],
        0.045,
        0.03
      )
      ball(M.void, s * 0.15, 0.06, 0.44, 0.06, 0.06, 0.09)
      tube(
        M.bone,
        [
          [s * 0.2, -0.02, 0.14],
          [s * 0.22, -0.04, 0.3],
          [s * 0.16, -0.03, 0.5],
        ],
        0.045,
        0.03
      )
      ball(M.void, s * 0.045, 0.07, 0.99, 0.022, 0.016, 0.035)
      // Horns from behind the brows, out and up, curling forward at the tips.
      tube(
        M.horn,
        [
          [s * 0.14, 0.14, 0.2],
          [s * 0.3, 0.24, 0.12],
          [s * 0.48, 0.34, 0.08],
          [s * 0.62, 0.48, 0.12],
          [s * 0.68, 0.64, 0.22],
          [s * 0.64, 0.74, 0.34],
        ],
        0.07,
        0.006,
        22
      )
      // Spurs back from the jaw's corner.
      tube(
        M.horn,
        [
          [s * 0.2, -0.08, 0.2],
          [s * 0.27, -0.13, 0.1],
          [s * 0.3, -0.2, 0.02],
        ],
        0.035,
        0.004,
        8
      )
    }
    // The lower jaw, hinged under the cranium and hanging open.
    const ja = (p.jaw * Math.PI) / 180
    const jy = -0.1
    const jz = 0.26
    const along = (d: number, up = 0): [number, number, number] => [0, jy + up * Math.cos(ja) - d * Math.sin(ja), jz + up * Math.sin(ja) + d * Math.cos(ja)]
    const [, cy, cz] = along(0.34)
    ball(M.bone, 0, cy, cz, 0.13, 0.045, 0.36, ja)
    // Teeth: down from the upper jaw, up from the lower, the fangs longest.
    const fang = G("tav-tooth", () => new THREE.ConeGeometry(1, 1, 6).translate(0, -0.5, 0))
    const fangUp = G("tav-tooth-up", () => new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0))
    for (let i = 0; i < 8; i++) {
      const t = i / 7
      const zz = 0.4 + t * 0.56
      const half = 0.135 - t * 0.075
      const len = 0.06 - t * 0.02 + (i === 1 ? 0.045 : 0)
      for (const s of [-1, 1]) {
        F.geo(M.tooth, fang, M4(s * half * L, -0.075 * L * (1 - t * 0.4), zz * L, 0, 0.013 * L, len * L, 0.013 * L), { uv: "keep" })
        const [, ly, lz] = along(0.1 + t * 0.56, 0.03)
        F.geo(M.tooth, fangUp, M4(s * (0.11 - t * 0.06) * L, ly * L, lz * L, 0, 0.011 * L, len * 0.8 * L, 0.011 * L, ja), { uv: "keep" })
      }
    }
    // Spines along the crown.
    for (let i = 0; i < 4; i++)
      tube(
        M.horn,
        [
          [0, 0.2 - i * 0.03, 0.3 - i * 0.07],
          [0, 0.28 - i * 0.04, 0.24 - i * 0.08],
        ],
        0.025,
        0.003,
        4
      )
  },
  { bone: "bone", horn: "bone", tooth: "bone", plaque: "timber" }
)
