import * as THREE from "three"
import { z } from "zod"
import { beam, Frame, G, M4, type Sink, shape, TAU, V, type Vec2 } from "../kit/geometry"
import { hullOutline, plan } from "./river"
import { defineBuilder, num, size } from "./types"

// A harbour's working parts (the Kordavos docks): a great ship moored at the quay that people walk aboard, an iron cage
// for a beast in her hold, a treadwheel crane, stone warehouses with arcades, rowing skiffs and mooring bollards.

type M = Record<string, THREE.Material>
const box = (b: Sink, mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0, rx = 0, rz = 0) =>
  b.add(
    G("box", () => new THREE.BoxGeometry(1, 1, 1)),
    mat,
    M4(x, y, z, ry, w, h, d, rx, rz)
  )

// A sail hanging from a yard `w` wide, `drop` deep, bellied forward by `belly` of its drop. Torn sails hang in strips.
function sail(b: Sink, mat: THREE.Material, x: number, y: number, z: number, w: number, drop: number, belly: number) {
  const g = G(`hb-sail-${w.toFixed(2)}-${drop.toFixed(2)}-${belly}`, () => {
    const s = new THREE.PlaneGeometry(w, drop, 10, 8)
    const pos = s.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) / (w / 2)
      const v = (pos.getY(i) + drop / 2) / drop
      pos.setZ(i, (1 - u * u * 0.85) * Math.sin(v * Math.PI * 0.85) * drop * belly)
      pos.setX(i, pos.getX(i) * (0.92 + 0.08 * v))
    }
    s.computeVertexNormals()
    return s
  })
  b.add(g, mat, M4(x, y - drop / 2, z), { uv: "keep" })
}

// ── The ship ────────────────────────────────────────────────────────────────

// A tall carved merchant ship lying at the quay, bow toward +z, with her main deck at y = 0 so people walk aboard by a
// gangway: a flared hull of planks with wales and a painted band, bulwarks with a rail broken at the gangway, a sterncastle
// with a door and lit stern windows, a forecastle, three masts with yards, sails set, furled or `torn`, shrouds with
// ratlines, a bowsprit and jib, a figurehead, stern lanterns, a capstan, and a cargo hatch whose doors are shut or have
// `burst` outward from the hold. The hold under the hatch is open: a dark well down to the hold floor.
export const galleon = defineBuilder(
  z
    .object({
      length: size(80).default(30),
      beam: size(20).default(8),
      depth: size(10).default(4.6),
      height: size(60).default(22),
      sails: z.enum(["set", "furled", "torn"]).default("set"),
      // The gangway's gap in the bulwark: which side (+1 is +x) and where along the deck.
      gangway: z.tuple([z.union([z.literal(-1), z.literal(1)]), num(-40, 40)]).default([1, 0]),
      hatch: z
        .object({ at: num(-40, 40).default(0), size: size(6).default(2.6), state: z.enum(["shut", "burst"]).default("shut") })
        .strict()
        .default({ at: 0, size: 2.6, state: "shut" }),
      stern: size(30).default(6.5),
      // How deep the hold's well under the hatch goes; kept above the set's water, which would show in it.
      hold: size(10).default(2.1),
      fore: size(20).default(4.5),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const L = p.length
    const B = p.beam
    const hull = hullOutline(L, B, 0.26, 14)
    const s = (k: number, kz = 1): Vec2[] => hull.map(([x, zz]) => [x * k, zz * kz])
    const H = p.hatch.size
    const hz = p.hatch.at
    const hole: Vec2[] = [
      [-H / 2, hz - H / 2],
      [H / 2, hz - H / 2],
      [H / 2, hz + H / 2],
      [-H / 2, hz + H / 2],
    ]
    // The hull in flaring courses from the keel up to the deck, each a slab with the hold's well cut through it.
    const courses: [number, number, number][] = [
      [-p.depth, 0.55, 0.82],
      [-p.depth * 0.72, 0.8, 0.93],
      [-p.depth * 0.45, 0.93, 0.98],
      [-p.depth * 0.2, 1, 1],
    ]
    const flip = (pts: Vec2[]) => pts.map(([x, zz]) => [x, -zz] as Vec2)
    for (let i = 0; i < courses.length; i++) {
      const [y0, k, kz] = courses[i]
      const y1 = i < courses.length - 1 ? courses[i + 1][0] : -0.06
      shape(b, M.hull, flip(s(k, kz)), y1 - y0, M4(0, y0, 0, 0, 1, 1, 1, -Math.PI / 2), 0, [flip(hole.map(([x, zz]) => [x * 1.02, zz] as Vec2))])
    }
    // Wales: dark rubbing strakes, and the elven ship's green band with a gilt line.
    // Each a ring round the hull, not a plate across it, so the hold stays open under the hatch.
    const ring = (mat: THREE.Material, k: number, kz: number, y0: number, depth: number) =>
      shape(b, mat, flip(s(k, kz)), depth, M4(0, y0, 0, 0, 1, 1, 1, -Math.PI / 2), 0, [flip(s(k - 0.06, kz - 0.02))])
    ring(M.wale, 1.025, 1.005, -0.55, 0.16)
    ring(M.wale, 1.02, 1.004, -1.25, 0.14)
    ring(M.band, 1.012, 1.002, -0.36, 0.3)
    ring(M.gilt, 1.03, 1.006, -0.07, 0.05)
    ring(M.gilt, 1.03, 1.005, -0.62, 0.05)
    ring(M.gilt, 1.022, 1.004, -1.95, 0.06)
    ring(M.wale, 1.012, 1.003, -2.9, 0.18)
    // The deck, its planks running fore and aft, with the hatch cut out.
    shape(b, M.deck, flip(s(0.965, 0.985)), 0.06, M4(0, -0.06, 0, 0, 1, 1, 1, -Math.PI / 2), 0, [flip(hole)])
    // The hold's well under the hatch: plank walls and a floor in the dark.
    const well = Math.min(p.hold, p.depth - 0.8)
    for (const [x, zz, w, d] of [
      [0, hz - H / 2 - 0.05, H + 0.2, 0.1],
      [0, hz + H / 2 + 0.05, H + 0.2, 0.1],
      [-H / 2 - 0.05, hz, 0.1, H],
      [H / 2 + 0.05, hz, 0.1, H],
    ])
      box(b, M.hold, x, -well / 2 - 0.06, zz, w, well, d)
    box(b, M.hold, 0, -well - 0.08, hz, H + 0.4, 0.06, H + 0.4)
    // Bulwarks along the deck's edge, broken at the gangway, with stanchions and a capping rail.
    const edge = s(0.985, 0.995)
    const [gSide, gZ] = p.gangway
    for (let i = 0; i < edge.length; i++) {
      const [ax, az] = edge[i]
      const [cx, cz] = edge[(i + 1) % edge.length]
      const len = Math.hypot(cx - ax, cz - az)
      if (len < 0.05) continue
      const n = Math.max(1, Math.round(len / 1.2))
      for (let k = 0; k < n; k++) {
        const x0 = ax + ((cx - ax) * k) / n
        const z0 = az + ((cz - az) * k) / n
        const x1 = ax + ((cx - ax) * (k + 1)) / n
        const z1 = az + ((cz - az) * (k + 1)) / n
        const mx = (x0 + x1) / 2
        const mz = (z0 + z1) / 2
        if (Math.sign(mx) === gSide && Math.abs(mx) > B * 0.3 && Math.abs(mz - gZ) < 0.9) continue
        const seg = Math.hypot(x1 - x0, z1 - z0)
        const yaw = -Math.atan2(z1 - z0, x1 - x0)
        box(b, M.bulwark, mx, 0.5, mz, seg + 0.02, 1.0, 0.12, yaw)
        box(b, M.rail, mx, 1.04, mz, seg + 0.04, 0.08, 0.22, yaw)
        beam(b, M.rail, [x0 * 0.985, 0, z0], [x0 * 0.985, 1.0, z0], 0.06, 5)
        ctx.footprint(mx, mz, seg / 2 + 0.05, 0.15, yaw)
      }
    }
    // The gangway's gap: a doorway for walks, a step inside the rail and a step out on the quay, and posts either side.
    ctx.anchor("door", gSide * (B / 2 - 0.9), 0, gZ)
    ctx.anchor("door", gSide * (B / 2 + 2.3), 0, gZ)
    for (const dz of [-0.9, 0.9]) beam(b, M.gilt, [(gSide * B) / 2 - gSide * 0.12, 0, gZ + dz], [(gSide * B) / 2 - gSide * 0.12, 1.3, gZ + dz], 0.07, 6)
    // The sterncastle: a raised deck over the stern with a carved front, a door, windows, ladders up, and a balustrade.
    const F = new Frame(b, M4())
    const z0 = -L / 2 + 0.35
    const zf = -L / 2 + p.stern
    const sw = B * 0.8
    const sh = Math.max(2.8, B * 0.32)
    // The castles follow the hull's own curve aft: the outline behind a station, closed across it.
    const aft = (k: number, upTo: number): Vec2[] => {
      const pts = edge.filter(([, zz]) => zz < upTo).map(([x, zz]) => [x * k, zz] as Vec2)
      const w = edge.reduce((m, [x, zz]) => (Math.abs(zz - upTo) < Math.abs(m[1] - upTo) ? [Math.abs(x), zz] : m), [0, 0] as Vec2)[0] * k
      const right = pts.filter(([x]) => x > 0)
      const left = pts.filter(([x]) => x <= 0)
      return [[-w, upTo], ...left, ...right, [w, upTo]]
    }
    plan(b, M.castle, aft(0.97, zf), 0, sh)
    F.box(M.deck, 0, sh + 0.03, (z0 + zf) / 2, sw + 0.3, 0.08, zf - z0 + 0.3)
    F.box(M.gilt, 0, sh - 0.06, zf + 0.02, sw + 0.1, 0.1, 0.06)
    F.box(M.band, 0, sh - 0.35, zf + 0.02, sw, 0.4, 0.04)
    F.box(M.void, 0, 1.05, zf + 0.005, 1.1, 2.0, 0.04)
    F.box(M.gilt, 0, 2.1, zf + 0.03, 1.4, 0.12, 0.06)
    for (const sx of [-1, 1]) {
      for (const x of [sx * 1.4, sx * 2.4]) F.box(M.window, x, 1.45, zf + 0.01, 0.6, 0.75, 0.04)
      // Ladders up to the sterncastle at its front corners.
      const lx = sx * (sw / 2 - 0.5)
      for (const side of [-0.28, 0.28]) beam(b, M.rail, [lx + side, 0, zf + 1.1], [lx + side, sh + 0.9, zf + 0.05], 0.04, 5)
      for (let k = 1; k < 8; k++) F.box(M.rail, lx, (k * sh) / 8, zf + 1.1 - (k * 1.05) / 8, 0.56, 0.04, 0.08)
      ctx.footprint(lx, zf + 0.55, 0.32, 0.55)
    }
    // A balustrade round the sterncastle's deck.
    for (const [ax, az, cx, cz] of [
      [-sw / 2, zf, sw / 2, zf],
      [-sw / 2, z0, -sw / 2, zf],
      [sw / 2, z0, sw / 2, zf],
    ]) {
      const n = Math.round(Math.hypot(cx - ax, cz - az) / 0.22)
      for (let k = 0; k <= n; k++) beam(b, M.rail, [ax + ((cx - ax) * k) / n, sh, az + ((cz - az) * k) / n], [ax + ((cx - ax) * k) / n, sh + 0.85, az + ((cz - az) * k) / n], 0.03, 5)
      beam(b, M.gilt, [ax, sh + 0.88, az], [cx, sh + 0.88, cz], 0.05, 6)
    }
    // The poop: a second tier over the after part of the sterncastle, with its own windows and balustrade.
    const pz = z0 + (zf - z0) * 0.55
    const pw = sw * 0.86
    const ph = sh * 0.7
    plan(b, M.castle, aft(0.86, pz), sh, ph)
    F.box(M.deck, 0, sh + ph + 0.03, (z0 + pz) / 2, pw + 0.3, 0.08, pz - z0 + 0.3)
    F.box(M.void, 0, sh + 0.95, pz + 0.005, 0.9, 1.6, 0.04)
    F.box(M.gilt, 0, sh + ph - 0.06, pz + 0.02, pw + 0.1, 0.1, 0.06)
    for (const sx of [-1, 1]) F.box(M.window, sx * pw * 0.3, sh + 1.0, pz + 0.01, 0.55, 0.65, 0.04)
    for (const [ax, az, cx, cz] of [
      [-pw / 2, pz, pw / 2, pz],
      [-pw / 2, z0, -pw / 2, pz],
      [pw / 2, z0, pw / 2, pz],
    ]) {
      const n = Math.round(Math.hypot(cx - ax, cz - az) / 0.24)
      for (let k = 0; k <= n; k++) beam(b, M.rail, [ax + ((cx - ax) * k) / n, sh + ph, az + ((cz - az) * k) / n], [ax + ((cx - ax) * k) / n, sh + ph + 0.8, az + ((cz - az) * k) / n], 0.03, 5)
      beam(b, M.gilt, [ax, sh + ph + 0.83, az], [cx, sh + ph + 0.83, cz], 0.05, 6)
    }
    // The carved transom: two rows of stern windows between gilt bands, carved pilasters, a gilt crest.
    const top = sh + ph
    for (const [y, n] of [
      [sh * 0.55, 5],
      [sh + ph * 0.5, 4],
    ] as const) {
      for (let k = 0; k < n; k++) F.box(M.window, (k - (n - 1) / 2) * sw * 0.18, y, z0 - 0.03, sw * 0.12, 0.8, 0.06)
      F.box(M.gilt, 0, y + 0.52, z0 - 0.05, sw * 0.95, 0.12, 0.08)
      F.box(M.gilt, 0, y - 0.52, z0 - 0.05, sw * 0.95, 0.1, 0.08)
      for (let k = 0; k <= n; k++) F.box(M.gilt, (k - n / 2) * sw * 0.18, y, z0 - 0.06, 0.08, 0.9, 0.06)
    }
    F.box(M.band, 0, -0.2, z0 - 0.03, sw * 0.9, 0.5, 0.05)
    F.sphere(M.gilt, 0, top + 0.5, z0 - 0.05, 0.7, 0.55, 0.15, 12)
    // Quarter galleries: glazed bays on the sterncastle's sides, gilt-capped.
    for (const sx of [-1, 1]) {
      const gx = sx * (sw / 2 + 0.25)
      const gz = z0 + 1.4
      F.box(M.castle, gx, sh * 0.55, gz, 0.5, 1.6, 2.2)
      for (const dz of [-0.6, 0, 0.6]) F.box(M.window, gx + sx * 0.26, sh * 0.55, gz + dz, 0.02, 0.8, 0.42)
      F.box(M.gilt, gx, sh * 0.55 + 0.85, gz, 0.62, 0.12, 2.3)
      F.box(M.gilt, gx, sh * 0.55 - 0.85, gz, 0.62, 0.12, 2.3)
      F.cyl(M.gilt, gx, sh * 0.55 + 0.9, gz, 0.32, 0.05, 0.5, 8)
    }
    // Stern lanterns over the poop.
    for (const sx of [-1, 0, 1]) {
      const x = sx * (pw / 2 - 0.15)
      const lz = z0 + (sx ? 0.25 : -0.1)
      beam(b, M.iron, [x, top + 0.8, lz], [x, top + 1.6, lz], 0.03, 5)
      F.cyl(M.gilt, x, top + 1.6, lz, 0.18, 0.15, 0.08, 10)
      F.cyl(M.lamp, x, top + 1.68, lz, 0.14, 0.17, 0.5, 10)
      F.cyl(M.gilt, x, top + 2.18, lz, 0.19, 0.04, 0.26, 10)
    }
    // Gunports down both sides, shut, with gilt frames.
    for (let zz = -L / 2 + p.stern + 1.5; zz < L / 2 - p.fore - 1; zz += 2.3)
      for (const sx of [-1, 1]) {
        const x = sx * (B / 2 + 0.03)
        F.box(M.port, x, -0.75, zz, 0.06, 0.55, 0.6)
        F.box(M.gilt, x + sx * 0.02, -0.75, zz, 0.04, 0.65, 0.7)
      }
    ctx.footprint(0, (z0 + zf) / 2, sw / 2 + 0.1, (zf - z0) / 2 + 0.05)
    // The forecastle: the bow's deck raised over the hull's taper.
    const zb = L / 2 - p.fore
    const bowPts = edge.filter(([, zz]) => zz > zb)
    const half = edge.reduce((m, [x, zz]) => (Math.abs(zz - zb) < Math.abs(m[1] - zb) ? [Math.abs(x), zz] : m), [0, 0] as Vec2)[0]
    const fore: Vec2[] = [
      [half - 0.15, zb],
      ...bowPts.filter(([x]) => x > 0).map(([x, zz]) => [x - 0.15, zz] as Vec2),
      ...bowPts.filter(([x]) => x <= 0).map(([x, zz]) => [x + 0.15, zz] as Vec2),
      [-half + 0.15, zb],
    ]
    const fh = Math.max(2.3, B * 0.28)
    plan(b, M.castle, fore, 0, fh)
    plan(
      b,
      M.deck,
      fore.map(([x, zz]) => [x * 1.02, zz] as Vec2),
      fh,
      0.08
    )
    F.box(M.gilt, 0, fh - 0.06, zb - 0.02, half * 2 - 0.2, 0.1, 0.06)
    F.box(M.void, 0, 0.85, zb - 0.01, 0.9, 1.6, 0.04)
    ctx.footprint(0, (zb + L / 2) / 2, half, (L / 2 - zb) / 2)
    // Masts, yards, sails and rigging.
    const masts = [
      { z: -L * 0.2, h: p.height * 0.78 },
      { z: L * 0.03, h: p.height },
      { z: L * 0.25, h: p.height * 0.88 },
    ]
    const tops: THREE.Vector3[] = []
    for (const [mi, m] of masts.entries()) {
      const base = 0
      beam(b, M.mast, [0, base - 0.2, m.z], [0, m.h, m.z], 0.32, 10, 0.14)
      ctx.circle(0, m.z, 0.45)
      // A fighting top: a round platform two thirds up.
      F.cyl(M.mast, 0, m.h * 0.66, m.z, 0.9, 1.0, 0.12, 14)
      tops.push(new THREE.Vector3(0, m.h, m.z))
      const yards = mi === 0 ? [0.5, 0.74, 0.93] : [0.36, 0.6, 0.8, 0.95]
      for (const [k, yf] of yards.entries()) {
        const yy = m.h * yf
        const half = B * (0.95 - k * 0.17) * (mi === 1 ? 1 : 0.85)
        beam(b, M.mast, [-half, yy, m.z + 0.25], [half, yy, m.z + 0.25], 0.11, 6, 0.11)
        const drop = Math.max(1.5, (k === 0 ? yy - (base + 3.2) : yy - m.h * yards[k - 1]) * 0.92)
        // The topmost sail on each mast is furled to its yard, as a ship lies in harbour with her courses loosed to dry.
        if (p.sails === "furled" || k === yards.length - 1) beam(b, M.furl, [-half * 0.92, yy - 0.2, m.z + 0.35], [half * 0.92, yy - 0.2, m.z + 0.35], 0.22, 6, 0.22)
        else {
          const torn = p.sails === "torn" && mi === 1 && k === 0
          sail(b, torn ? M.sailTorn : M.sail, 0, yy - 0.12, m.z + 0.42, half * 1.9, drop, torn ? 0.06 : 0.14)
        }
      }
      // Shrouds from the top down to the bulwarks, with ratlines across them.
      const ty = m.h * 0.66
      for (const sx of [-1, 1]) {
        const feet = [-0.9, -0.3, 0.3, 0.9].map((dz) => new THREE.Vector3(sx * B * 0.49, 1.05, m.z + dz))
        const top = (dz: number) => new THREE.Vector3(sx * 0.85, ty, m.z + dz * 0.3)
        const lines = feet.map((f, i) => [f, top([-0.9, -0.3, 0.3, 0.9][i])] as const)
        for (const [f, t] of lines) beam(b, M.rope, f, t, 0.025, 4)
        const rungs = Math.floor((ty - 1.3) / 0.42)
        for (let r = 1; r < rungs; r++) {
          const t = r / rungs
          const pts = lines.map(([f, tp]) => f.clone().lerp(tp, t))
          for (let i = 0; i < pts.length - 1; i++) beam(b, M.rope, pts[i], pts[i + 1], 0.012, 3)
        }
        for (const f of feet) F.box(M.iron, f.x, 0.9, f.z, 0.08, 0.3, 0.12)
      }
    }
    // Stays between the mastheads, bowsprit and stern.
    const bowY = fh + 0.6
    const sprit = new THREE.Vector3(0, fh + 3.6, L / 2 + L * 0.22)
    beam(b, M.mast, [0, fh, L / 2 - 1.2], sprit, 0.26, 8, 0.1)
    for (let i = 0; i < tops.length - 1; i++) beam(b, M.rope, tops[i], tops[i + 1], 0.03, 4)
    beam(b, M.rope, tops[2], sprit, 0.03, 4)
    beam(b, M.rope, tops[1].clone().setY(tops[1].y * 0.9), [0, bowY, L / 2 - 0.5], 0.03, 4)
    beam(b, M.rope, tops[0], [0, sh + 1, z0 + 0.3], 0.03, 4)
    // A jib from the bowsprit to the foremast.
    if (p.sails !== "furled") {
      const a = sprit.clone().lerp(new THREE.Vector3(0, fh, L / 2), 0.15)
      const c = tops[2].clone().lerp(new THREE.Vector3(0, 0, masts[2].z), 0.25)
      const d = new THREE.Vector3(0, fh + 1.2, L / 2 - 0.6)
      const g = new THREE.BufferGeometry().setFromPoints([a, c, d, a, d, c])
      g.computeVertexNormals()
      g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 0.5, 1, 1, 0, 0, 0, 1, 0, 0.5, 1], 2))
      b.add(g, M.sail, null, { uv: "keep" })
      g.dispose()
    }
    // The stem: a curved post rising from the waterline at the bow to over the forecastle, carved and gilt, with the
    // beakhead's rails running out to the figurehead.
    for (let k = 0; k < 10; k++) {
      const t0 = k / 10
      const t1 = (k + 1) / 10
      const pt = (t: number) => [0, -p.depth * 0.6 + t * (p.depth * 0.6 + fh + 1.4), L / 2 + Math.sin(t * Math.PI * 0.5) * 1.2 - (1 - t) * 0.2] as [number, number, number]
      beam(b, M.hull, pt(t0), pt(t1), 0.32, 6)
      beam(b, M.gilt, pt(t0).map((v, i) => (i === 2 ? v + 0.18 : v)) as [number, number, number], pt(t1).map((v, i) => (i === 2 ? v + 0.18 : v)) as [number, number, number], 0.08, 5)
    }
    for (const sx of [-1, 1]) {
      beam(b, M.gilt, [sx * half * 0.8, fh + 0.9, L / 2 - p.fore * 0.6], [0, fh + 0.4, L / 2 + 1.2], 0.05, 5)
      beam(b, M.rail, [sx * half * 0.8, fh * 0.55, L / 2 - p.fore * 0.6], [0, fh * 0.2, L / 2 + 1.0], 0.07, 5)
    }
    // A balustrade round the forecastle.
    for (let k = 0; k < fore.length - 1; k++) {
      const [ax, az] = fore[k]
      const [cx, cz] = fore[k + 1]
      const n = Math.max(1, Math.round(Math.hypot(cx - ax, cz - az) / 0.26))
      for (let j = 0; j < n; j++) beam(b, M.rail, [ax + ((cx - ax) * j) / n, fh, az + ((cz - az) * j) / n], [ax + ((cx - ax) * j) / n, fh + 0.85, az + ((cz - az) * j) / n], 0.03, 5)
      beam(b, M.gilt, [ax, fh + 0.88, az], [cx, fh + 0.88, cz], 0.05, 6)
    }
    // The figurehead: a gilt swan's neck under the bowsprit.
    for (let k = 0; k < 6; k++) {
      const t0 = k / 6
      const t1 = (k + 1) / 6
      const pt = (t: number) => [0, fh * 0.3 + Math.sin(t * Math.PI * 0.8) * 1.4 + t * 0.4, L / 2 + 0.1 + t * 1.6] as [number, number, number]
      beam(b, M.gilt, pt(t0), pt(t1), 0.16 - k * 0.015, 6)
    }
    F.sphere(M.gilt, 0, fh * 0.3 + Math.sin(0.8 * Math.PI) * 1.4 + 0.4 + 0.05, L / 2 + 1.75, 0.18, 0.15, 0.24, 10)
    // A capstan before the sterncastle.
    const cz = zf + 2.2
    F.cyl(M.rail, 0, 0, cz, 0.42, 0.36, 0.9, 14)
    F.cyl(M.gilt, 0, 0.9, cz, 0.45, 0.45, 0.06, 14)
    for (let k = 0; k < 6; k++) {
      const a = (k * TAU) / 6
      beam(b, M.rail, [Math.cos(a) * 0.4, 0.75, cz + Math.sin(a) * 0.4], [Math.cos(a) * 1.1, 0.78, cz + Math.sin(a) * 1.1], 0.035, 5)
    }
    ctx.circle(0, cz, 0.5)
    // The cargo hatch: a raised coaming, and its two doors shut on it or thrown outward and split.
    for (const [x, zz, w, d] of [
      [0, hz - H / 2 - 0.08, H + 0.32, 0.16],
      [0, hz + H / 2 + 0.08, H + 0.32, 0.16],
      [-H / 2 - 0.08, hz, 0.16, H],
      [H / 2 + 0.08, hz, 0.16, H],
    ])
      box(b, M.rail, x, 0.2, zz, w, 0.4, d)
    const door = (x: number, y: number, zz: number, ry: number, rx: number, rz: number, broken: boolean) => {
      const DF = new Frame(b, M4(x, y, zz, ry, 1, 1, 1, rx, rz))
      const n = 6
      for (let k = 0; k < n; k++) {
        const len = broken && k % 3 === 1 ? H * rand(0.45, 0.75) : H
        DF.box(M.hatchDoor, -H / 4 + ((k + 0.5) * (H / 2)) / n - H / 4 + H / 4, 0, -H / 2 + len / 2, H / 2 / n - 0.01, 0.07, len)
      }
      for (const dz of [-H * 0.35, H * 0.35]) DF.box(M.iron, 0, 0.045, dz, H / 2, 0.02, 0.08)
    }
    if (p.hatch.state === "shut") {
      door(-H / 4, 0.42, hz, 0, 0, 0, false)
      door(H / 4, 0.42, hz, 0, 0, 0, false)
      ctx.footprint(0, hz, H / 2 + 0.16, H / 2 + 0.16, 0, 0.45)
    } else {
      // One leaf thrown flat across the deck, the other hanging split against the coaming, splinters round about.
      door(-H / 2 - 1.3, 0.05, hz + 0.4, 0.5, 0, 0.12, true)
      door(H / 2 + 0.35, 0.55, hz - 0.2, -0.2, 0, -1.2, true)
      for (let k = 0; k < 18; k++) {
        const a = rand(0, TAU)
        const r = rand(H * 0.6, H * 1.4)
        box(b, M.hatchDoor, Math.cos(a) * r, 0.03, hz + Math.sin(a) * r, rand(0.04, 0.09), 0.03, rand(0.25, 0.9), rand(0, TAU))
      }
      ctx.footprint(0, hz, H / 2 + 0.16, H / 2 + 0.16, 0, 0.45)
    }
  },
  {
    hull: "hull",
    wale: "wale",
    band: "band",
    gilt: "gilt",
    deck: "deck",
    hold: "hold",
    bulwark: "hull",
    rail: "rail",
    castle: "hull",
    window: "window",
    void: "void",
    mast: "mast",
    sail: "sail",
    sailTorn: "sailTorn",
    furl: "furl",
    rope: "rope",
    iron: "iron",
    lamp: "lamp",
    hatchDoor: "rail",
    port: "wale",
  }
)

// An iron cage for a beast, `width` by `depth` by `height`, on its base frame: square bars, a barred top and a door.
// `melted` eats that share of the bars away to dripping stubs, scorches round them, and leaves the door hanging open.
export const cage = defineBuilder(
  z.object({ width: size(10).default(2.4), depth: size(10).default(2.4), height: size(6).default(2.2), spacing: size(1).default(0.18), melted: num(0, 1).default(0) }).strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const { width: w, depth: d, height: h } = p
    const F = new Frame(b, M4())
    // Base and top frames.
    for (const y of [0.06, h - 0.06])
      for (const [x, zz, sx, sz] of [
        [0, -d / 2, w, 0.12],
        [0, d / 2, w, 0.12],
        [-w / 2, 0, 0.12, d],
        [w / 2, 0, 0.12, d],
      ])
        F.box(M.iron, x, y, zz, sx, 0.12, sz)
    for (const [x, zz] of [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [-w / 2, d / 2],
      [w / 2, d / 2],
    ])
      F.box(M.iron, x, h / 2, zz, 0.14, h, 0.14)
    const bar = (x0: number, z0: number, x1: number, z1: number, along: "x" | "z") => {
      const len = along === "x" ? x1 - x0 : z1 - z0
      const n = Math.max(1, Math.round(Math.abs(len) / p.spacing))
      for (let k = 1; k < n; k++) {
        const x = along === "x" ? x0 + (len * k) / n : x0
        const zz = along === "z" ? z0 + (len * k) / n : z0
        const eaten = rand() < p.melted
        if (!eaten) {
          F.box(M.iron, x, h / 2, zz, 0.055, h - 0.12, 0.055)
          continue
        }
        // A bar eaten through: a stub up from the base and one down from the top, drips at their ends, scorch round them.
        const lo = rand(0.05, 0.4) * h
        const hi = rand(0.15, 0.45) * h
        F.box(M.iron, x, lo / 2 + 0.06, zz, 0.055, lo, 0.055)
        F.box(M.iron, x, h - hi / 2 - 0.06, zz, 0.055, hi, 0.055)
        F.sphere(M.slag, x, lo + 0.07, zz, 0.035, 0.05, 0.035, 6)
        F.sphere(M.slag, x, h - hi - 0.08, zz, 0.03, 0.07, 0.03, 6)
        F.box(M.acid, x, h - hi - 0.06, zz, 0.06, 0.12, 0.06)
      }
    }
    bar(-w / 2, -d / 2, w / 2, -d / 2, "x")
    bar(-w / 2, d / 2, w / 2, d / 2, "x")
    bar(-w / 2, -d / 2, -w / 2, d / 2, "z")
    // The door side: barred, or hanging open on one hinge when melted.
    if (p.melted > 0) {
      const DF = new Frame(b, M4(w / 2, 0, -d / 2 + 0.06, -1.9, 1, 1, 1, 0, 0.15))
      const n = Math.round(d / p.spacing)
      for (let k = 1; k < n; k++) DF.box(M.iron, 0, h / 2, (k * d) / n, 0.055, h - 0.2, 0.055)
      DF.box(M.iron, 0, 0.15, d / 2, 0.06, 0.08, d)
      DF.box(M.iron, 0, h - 0.2, d / 2, 0.06, 0.08, d)
    } else bar(w / 2, -d / 2, w / 2, d / 2, "z")
    // The barred top, eaten through over the door.
    const nt = Math.round(w / p.spacing)
    for (let k = 1; k < nt; k++) {
      const x = -w / 2 + (k * w) / nt
      if (p.melted > 0 && x > w * 0.1) {
        F.box(M.iron, x, h - 0.03, -d * 0.3, 0.055, 0.055, d * 0.4)
        F.sphere(M.slag, x, h - 0.06, -d * 0.1, 0.03, 0.05, 0.03, 6)
        continue
      }
      F.box(M.iron, x, h - 0.03, 0, 0.055, 0.055, d)
    }
    // Straw on the floor, and scorched boards round the cage where the acid ran.
    F.box(M.straw, 0, 0.02, 0, w - 0.2, 0.04, d - 0.2)
    if (p.melted > 0) for (let k = 0; k < 7; k++) F.box(M.scorch, rand(-w / 2, w / 2), 0.045, rand(-d / 2, d / 2), rand(0.3, 0.8), 0.005, rand(0.3, 0.8), rand(0, TAU))
    ctx.footprint(0, 0, w / 2, d / 2)
  },
  { iron: "iron", slag: "slag", acid: "acid", straw: "cageStraw", scorch: "scorch" }
)

// ── The quay ───────────────────────────────────────────────────────────────

// A treadwheel crane on the quay, its jib reaching toward +z over the water: a timber housing on a turntable, the great
// wheel men walk in, a raking jib with its tackle, and a cargo net of crates hanging from the hook.
export const crane = defineBuilder(
  z.object({ reach: size(20).default(7), height: size(30).default(9), load: z.boolean().default(true), drop: num(0, 20).default(3.5) }).strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const F = new Frame(b, M4())
    // A stone base, the turntable and the timber housing.
    F.box(M.stone, 0, 0.3, 0, 3.2, 0.6, 3.2)
    F.cyl(M.timber, 0, 0.6, 0, 1.5, 1.5, 0.2, 16)
    for (const [x, zz] of [
      [-1.2, -1.2],
      [1.2, -1.2],
      [-1.2, 1.2],
      [1.2, 1.2],
    ])
      beam(b, M.timber, [x, 0.8, zz], [x * 0.35, p.height * 0.62, zz * 0.35], 0.13, 6)
    F.box(M.timber, 0, p.height * 0.62, 0, 1.2, 0.3, 1.2)
    // The treadwheel, standing upright across x.
    const R = 2.1
    const wy = 0.8 + R
    for (const sx of [-0.65, 0.65]) {
      F.geo(
        M.timber,
        G(`hb-wheel-${R}`, () => new THREE.TorusGeometry(R, 0.08, 6, 32)),
        M4(sx, wy, -1.6, Math.PI / 2),
        { uv: "keep" }
      )
      for (let k = 0; k < 8; k++) {
        const a = (k * TAU) / 16
        beam(b, M.timber, [sx, wy + Math.cos(a) * R, -1.6 + Math.sin(a) * R], [sx, wy - Math.cos(a) * R, -1.6 - Math.sin(a) * R], 0.05, 5)
      }
    }
    for (let k = 0; k < 28; k++) {
      const a = (k * TAU) / 28
      F.box(M.timber, 0, wy + Math.cos(a) * R, -1.6 + Math.sin(a) * R, 1.3, 0.04, 0.2, 0, -a)
    }
    beam(b, M.timber, [-0.9, wy, -1.6], [0.9, wy, -1.6], 0.12, 8)
    // The jib, raking out over the water, and its tackle.
    const tip = new THREE.Vector3(0, p.height, p.reach)
    beam(b, M.timber, [0, 0.9, 0.6], tip, 0.2, 8, 0.12)
    beam(b, M.timber, [0, p.height * 0.62, 0], tip.clone().lerp(V(0, 0.9, 0.6), 0.25), 0.1, 6)
    beam(b, M.rope, [0, p.height * 0.62, 0], tip, 0.025, 4)
    beam(b, M.rope, [0, wy, -1.6], tip, 0.02, 4)
    F.cyl(M.iron, 0, p.height - 0.3, p.reach, 0.18, 0.18, 0.2, 10)
    const hookY = p.height - p.drop
    beam(b, M.rope, tip, [0, hookY + 0.4, p.reach], 0.03, 4)
    F.geo(
      M.iron,
      G("hb-hook", () => new THREE.TorusGeometry(0.12, 0.03, 5, 12, Math.PI * 1.4)),
      M4(0, hookY + 0.3, p.reach, Math.PI / 2),
      { uv: "keep" }
    )
    if (p.load) {
      // Crates in a sagging net.
      for (let k = 0; k < 5; k++) {
        const x = rand(-0.4, 0.4)
        const zz = p.reach + rand(-0.4, 0.4)
        const s = rand(0.45, 0.65)
        F.box(M.crate, x, hookY - 1.0 + (k > 2 ? 0.55 : 0) + s / 2, zz, s, s, s, rand(-0.3, 0.3))
      }
      for (let k = 0; k < 8; k++) {
        const a = (k * TAU) / 8
        beam(b, M.rope, [0, hookY + 0.2, p.reach], [Math.cos(a) * 0.75, hookY - 1.05, p.reach + Math.sin(a) * 0.75], 0.018, 3)
      }
    }
    ctx.footprint(0, 0, 1.6, 1.6)
    ctx.footprint(0, -1.6, 0.8, R)
  },
  { stone: "stone", timber: "timber", rope: "rope", iron: "iron", crate: "crate" }
)

// A stone warehouse fronting the quay toward +z: an arcade of round arches on the ground floor opening on dark stores,
// upper floors with shuttered windows, a loading door at the top under a hoist beam with its pulley, and a tiled roof.
export const warehouse = defineBuilder(
  z
    .object({
      w: size(60).default(14),
      d: size(40).default(10),
      h: size(40).default(12),
      bays: z.number().int().min(1).max(12).default(4),
      arch: size(10).default(4.2),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const F = new Frame(b, M4())
    const { w, d, h } = p
    const fz = d / 2
    // The body behind the arcade, and the arcade's piers and arches.
    F.box(M.stone, 0, h / 2, -0.8, w, h, d - 1.6)
    const bay = w / p.bays
    const r = Math.min(bay * 0.36, p.arch / 2)
    const spring = p.arch - r
    for (let i = 0; i < p.bays; i++) {
      const cx = -w / 2 + (i + 0.5) * bay
      // The store's dark interior behind the arch.
      F.box(M.void, cx, spring / 2 + r / 2, fz - 1.62, r * 2, spring + r, 0.04)
      // The wall over the arch: the square between the piers above the springing, less the arch's half-round.
      const top = p.arch + 0.5
      const spandrel: Vec2[] = [
        [r, spring],
        [r, top],
        [-r, top],
        [-r, spring],
      ]
      for (let k = 1; k < 16; k++) {
        const a = Math.PI - (k / 16) * Math.PI
        spandrel.push([Math.cos(a) * r, spring + Math.sin(a) * r])
      }
      F.shape(M.stone, spandrel, 1.6, M4(cx, 0, fz - 1.6))
      F.geo(
        M.trim,
        G(`hb-arch-${r.toFixed(2)}`, () => new THREE.TorusGeometry(r + 0.1, 0.12, 5, 20, Math.PI)),
        M4(cx, spring, fz + 0.02),
        { uv: "keep" }
      )
    }
    for (let i = 0; i <= p.bays; i++) {
      const x = -w / 2 + i * bay
      F.box(M.stone, x, spring / 2, fz - 0.8, bay - 2 * r, spring, 1.6)
      F.box(M.trim, x, spring + 0.08, fz + 0.02, bay - 2 * r + 0.2, 0.16, 0.2)
      F.box(M.trim, x, 0.2, fz + 0.02, bay - 2 * r + 0.25, 0.4, 0.24)
    }
    F.box(M.stone, 0, p.arch + 0.25 + (h - p.arch) / 2, fz - 0.8, w, h - p.arch - 0.5, 1.6)
    // String courses and a cornice.
    for (const y of [p.arch + 0.5, h * 0.72]) F.box(M.trim, 0, y, fz + 0.06, w + 0.2, 0.22, 0.24)
    F.box(M.trim, 0, h - 0.15, fz + 0.12, w + 0.4, 0.3, 0.4)
    // Upper windows with shutters, some open.
    for (let i = 0; i < p.bays; i++) {
      const cx = -w / 2 + (i + 0.5) * bay
      for (const y of [p.arch + 1.9, h * 0.72 + 1.3]) {
        if (y + 1 > h) continue
        F.box(M.void, cx, y, fz + 0.01, 1.0, 1.5, 0.04)
        F.box(M.trim, cx, y - 0.82, fz + 0.08, 1.3, 0.12, 0.18)
        const open = rand() < 0.5
        for (const sx of [-1, 1]) F.box(M.shutter, cx + sx * (open ? 0.85 : 0.26), y, fz + (open ? 0.06 : 0.04), 0.48, 1.5, 0.05, open ? 0 : 0)
      }
    }
    // A loading door at the top, under a hoist beam with a pulley and a hanging rope.
    const ly = h * 0.72 + 1.3
    F.box(M.timber, 0, ly, fz + 0.02, 1.6, 2.0, 0.06)
    beam(b, M.timber, [0, h - 0.6, fz - 0.6], [0, h - 0.6, fz + 1.4], 0.14, 6)
    F.cyl(M.iron, 0, h - 0.9, fz + 1.25, 0.12, 0.12, 0.2, 10)
    beam(b, M.rope, [0, h - 0.9, fz + 1.25], [0, rand(2.5, 4.5), fz + 1.25], 0.025, 4)
    // The roof: a long tiled pitch.
    F.shape(
      M.roof,
      [
        [-d / 2 - 0.6, 0],
        [d / 2 + 0.6, 0],
        [0, d * 0.42],
      ],
      w + 0.6,
      M4(-(w + 0.6) / 2, h, 0, Math.PI / 2)
    )
    ctx.footprint(0, -0.8, w / 2, d / 2 - 0.8)
  },
  { stone: "stone", trim: "stoneTrim", void: "void", timber: "timber", shutter: "shutter", rope: "rope", iron: "iron", roof: "roof" }
)

// A rowing skiff afloat, bow toward +z, its gunwale at y = 0: planked hull, thwarts and a pair of oars.
export const skiff = defineBuilder(
  z.object({ length: size(12).default(4.6), beam: size(4).default(1.5) }).strict(),
  (ctx, p) => {
    const { b, M } = ctx
    const L = p.length
    const hull = hullOutline(L, p.beam, 0.4, 8)
    plan(
      b,
      M.hull,
      hull.map(([x, zz]) => [x * 0.7, zz * 0.92] as Vec2),
      -0.75,
      0.3
    )
    plan(b, M.hull, hull, -0.45, 0.42)
    plan(
      b,
      M.deck,
      hull.map(([x, zz]) => [x * 0.86, zz * 0.95] as Vec2),
      -0.38,
      0.06
    )
    plan(
      b,
      M.trim,
      hull.map(([x, zz]) => [x * 1.03, zz * 1.01] as Vec2),
      -0.06,
      0.08
    )
    for (const zz of [-L * 0.2, L * 0.1]) box(b, M.trim, 0, -0.12, zz, p.beam * 0.86, 0.05, 0.24)
    for (const sx of [-1, 1]) beam(b, M.trim, [sx * 0.3, -0.05, -L * 0.1], [sx * p.beam * 1.4, -0.5, L * 0.12], 0.03, 5)
  },
  { hull: "hull", deck: "deck", trim: "rail" }
)

// A mooring bollard: a squat iron post with a flared cap.
export const bollard = defineBuilder(z.object({ height: size(2).default(0.7) }).strict(), (ctx, p) => {
  const F = new Frame(ctx.b, M4())
  F.lathe(
    ctx.M.iron,
    0,
    0,
    0,
    [
      [0, 0],
      [0.2, 0],
      [0.18, 0.08],
      [0.14, p.height * 0.7],
      [0.2, p.height * 0.92],
      [0.18, p.height],
      [0, p.height],
    ],
    14
  )
  ctx.circle(0, 0, 0.22)
})
