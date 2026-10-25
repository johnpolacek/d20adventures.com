import * as THREE from "three"
import { z } from "zod"
import { beam, Frame, G, M4, TAU } from "../kit/geometry"
import { barrel, crate, sack } from "./market"
import { defineBuilder, size } from "./types"

// The road kit's dressing (wiki/plans/road-to-kordavos-sets.md): a merchant's covered wagon, a wayside shrine, and a
// fortune teller's table.

// A spoked wheel at (x, y, z) turning about x: a wooden felloe in an iron tyre, twelve spokes and a hub. `side` is the
// way out from the wagon.
function wheel(F: Frame, M: Record<string, THREE.Material>, x: number, y: number, z: number, r: number, side: number) {
  const ring = (rr: number, t: number) => G(`wagon-ring-${rr.toFixed(3)}-${t}`, () => new THREE.TorusGeometry(rr, t, 5, 28))
  F.geo(M.wood, ring(r - 0.05, 0.045), M4(x, y, z, Math.PI / 2), { uv: "keep" })
  F.geo(M.iron, ring(r - 0.005, 0.03), M4(x, y, z, Math.PI / 2), { uv: "keep" })
  F.cyl(M.wood, x + side * 0.02, y - 0.1, z, 0.1, 0.09, 0.2, 10, 0, Math.PI / 2)
  F.cyl(M.iron, x + side * 0.1, y - 0.04, z, 0.06, 0.05, 0.08, 8, 0, Math.PI / 2)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU
    const s = Math.sin(a)
    const c = Math.cos(a)
    beam(F.b, M.wood, [x, y + s * 0.08, z + c * 0.08], [x, y + s * (r - 0.08), z + c * (r - 0.08)], 0.022, 5)
  }
}

// A merchant's covered wagon along local z, its tongue reaching toward +z for the horse. A plank bed on two axles with
// spoked wheels, a canvas bonnet on hoops with the house mark on both sides, a driver's bench, and goods at the open tail.
// `cover: false` leaves the bed open with its load piled high. Solid.
export const wagon = defineBuilder(
  z
    .object({
      length: size(6).default(3.4),
      width: size(3).default(1.5),
      cover: z.boolean().default(true),
      mark: z.boolean().default(true),
    })
    .strict(),
  (ctx, p) => {
    const { b, M, rand } = ctx
    const F = new Frame(b, new THREE.Matrix4())
    const L = p.length
    const W = p.width
    const deck = 1.0
    const front = L / 2
    const rearR = 0.68
    const frontR = 0.52
    // Undercarriage: two axles and the reach pole between them.
    F.box(M.wood, 0, rearR, -front + 0.6, W + 0.3, 0.12, 0.14)
    F.box(M.wood, 0, frontR, front - 0.55, W + 0.3, 0.12, 0.14)
    F.box(M.wood, 0, (rearR + frontR) / 2 + 0.06, 0, 0.12, 0.1, L - 0.6)
    for (const s of [-1, 1]) {
      wheel(F, M, s * (W / 2 + 0.16), rearR, -front + 0.6, rearR, s)
      wheel(F, M, s * (W / 2 + 0.16), frontR, front - 0.55, frontR, s)
      F.box(M.wood, s * (W / 2 - 0.1), deck - 0.18, 0, 0.12, 0.16, L)
    }
    // The bed and its boards.
    F.box(M.wood, 0, deck - 0.05, 0, W, 0.1, L)
    for (const s of [-1, 1]) {
      F.box(M.wood, s * (W / 2 - 0.03), deck + 0.24, 0, 0.06, 0.48, L)
      F.box(M.wood, s * (W / 2 + 0.005), deck + 0.47, 0, 0.08, 0.06, L + 0.04)
      for (let i = 0; i <= 4; i++) F.box(M.iron, s * (W / 2 + 0.01), deck + 0.24, -front + 0.1 + (i * (L - 0.2)) / 4, 0.03, 0.46, 0.05)
    }
    F.box(M.wood, 0, deck + 0.24, front - 0.03, W, 0.48, 0.06)
    F.box(M.wood, 0, deck + 0.14, -front + 0.03, W, 0.28, 0.06)
    // The driver's bench over the front, its footboard sloping down ahead.
    F.box(M.wood, 0, deck + 0.75, front - 0.25, W - 0.1, 0.08, 0.36)
    F.box(M.wood, 0, deck + 0.95, front - 0.43, W - 0.1, 0.32, 0.05)
    for (const s of [-1, 1]) F.box(M.wood, s * (W / 2 - 0.12), deck + 0.6, front - 0.25, 0.06, 0.3, 0.3)
    F.box(M.wood, 0, deck + 0.15, front + 0.22, W - 0.1, 0.04, 0.5, 0, -0.5)
    // The tongue for the horse, with a crossbar at its end.
    beam(b, M.wood, [0, frontR + 0.05, front - 0.3], [0, 0.75, front + 2.5], 0.05, 6)
    F.box(M.wood, 0, 0.75, front + 2.5, 1.0, 0.07, 0.07)
    if (p.cover) {
      // Hoops over the bed and the canvas bonnet on them, taller than it is wide, drawn in at the ends.
      const R = W / 2 + 0.02
      const top = deck + 0.48
      const span = L - 0.3
      const bow = G(`wagon-bow-${R.toFixed(2)}`, () => new THREE.TorusGeometry(R, 0.03, 4, 16, Math.PI))
      for (let i = 0; i < 5; i++) F.geo(M.wood, bow, M4(0, top, -span / 2 + (i * span) / 4, 0, 1, 1.3, 1), { uv: "keep" })
      const hood = G("wagon-hood", () => new THREE.CylinderGeometry(1, 1, 1, 18, 1, true, Math.PI / 2, Math.PI))
      F.geo(M.canvas, hood, M4(0, top, 0, 0, R + 0.02, span + 0.2, (R + 0.02) * 1.3, Math.PI / 2), { uv: "keep" })
      if (p.mark) {
        // The house mark on each side: a painted roundel laid on the canvas a third of the way up its curve, tilted to
        // face out along the bonnet's normal there.
        const disc = G("wagon-mark", () => new THREE.CircleGeometry(0.27, 24))
        const phi = 0.6
        const H = (R + 0.02) * 1.3
        const tilt = Math.atan2(Math.sin(phi) / 1.3, Math.cos(phi))
        for (const s of [-1, 1]) F.geo(M.mark, disc, M4(s * ((R + 0.02) * Math.cos(phi) + 0.01), top + H * Math.sin(phi), 0, (s * Math.PI) / 2, 1, 1, 1, -tilt), { uv: "keep" })
      }
      // Goods inside, showing at the open tail.
      crate(b, M, -0.35, deck, -front + 0.5, 0.55, 0.1)
      barrel(b, M, 0.35, deck, -front + 0.45, 0.26, 0.7)
      sack(b, M, rand, 0, deck + 0.55, -front + 0.55, 0.5)
      crate(b, M, 0.1, deck, -front + 1.15, 0.7)
    } else {
      crate(b, M, -0.35, deck, -0.8, 0.6)
      crate(b, M, 0.35, deck, -0.7, 0.55, 0.2)
      crate(b, M, 0, deck + 0.6, -0.75, 0.5, -0.1)
      barrel(b, M, -0.35, deck, 0.4, 0.28, 0.75)
      barrel(b, M, 0.35, deck, 0.45, 0.28, 0.75)
      sack(b, M, rand, 0, deck, 1.1, 0.6)
    }
    // A water barrel lashed to the side.
    barrel(b, M, -(W / 2 + 0.2), deck - 0.3, -0.4, 0.2, 0.55)
    ctx.footprint(0, 0, W / 2 + 0.35, L / 2 + 0.3)
  },
  { wood: "wagonWood", canvas: "wagonCanvas", mark: "wagonMark", iron: "iron" }
)

// A wayside shrine: a squared stone post with a little gabled niche on top, a silver sun in it, candles and offered
// flowers on its sill. Solid.
export const shrine = defineBuilder(
  z.object({ height: size(4).default(1.7) }).strict(),
  (ctx, p) => {
    const { b, M } = ctx
    const F = new Frame(b, new THREE.Matrix4())
    const h = p.height
    F.box(M.stone, 0, 0.12, 0, 0.7, 0.24, 0.7)
    F.box(M.stone, 0, h * 0.45, 0, 0.36, h * 0.9 - 0.24, 0.36)
    // The niche: back, sides and sill, under a small slate roof.
    const y = h * 0.9
    F.box(M.stone, 0, y, 0, 0.58, 0.08, 0.46)
    F.box(M.stone, 0, y + 0.3, -0.19, 0.58, 0.52, 0.08)
    for (const s of [-1, 1]) F.box(M.stone, s * 0.26, y + 0.3, 0, 0.06, 0.52, 0.46)
    for (const s of [-1, 1]) F.box(M.roof, s * 0.2, y + 0.66, 0, 0.48, 0.05, 0.6, 0, 0, s * -0.62)
    F.box(M.stone, 0, y + 0.8, 0, 0.06, 0.06, 0.62)
    // The sun of Valkara: a disc with rays, in silver.
    const disc = G("shrine-sun", () => new THREE.CircleGeometry(0.11, 20))
    F.geo(M.silver, disc, M4(0, y + 0.34, -0.145), { uv: "keep" })
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU
      F.box(M.silver, Math.cos(a) * 0.15, y + 0.34 + Math.sin(a) * 0.15, -0.146, 0.08, 0.018, 0.005, 0, 0, a)
    }
    for (const x of [-0.16, 0.16]) {
      F.cyl(M.candle, x, y + 0.04, 0.08, 0.025, 0.025, 0.12, 8)
      F.sphere(M.candleFlame, x, y + 0.18, 0.08, 0.012, 0.025, 0.012, 6)
    }
    for (let i = 0; i < 5; i++) F.sphere(i % 2 ? M.flowerA : M.flowerB, -0.1 + i * 0.05, y + 0.06, 0.16, 0.03, 0.025, 0.03, 6)
    ctx.footprint(0, 0, 0.4, 0.4)
  },
  { stone: "shrineStone", roof: "shrineRoof" }
)

// A fortune teller's table, its front toward +z: a small carved table under a patterned carpet that hangs over its
// edges, a crystal ball on a turned stand, the cards laid out in a spread with the deck beside them, and a little cup.
// Solid.
export const fortuneTable = defineBuilder(
  z.object({ width: size(2).default(0.95), depth: size(2).default(0.65), height: size(1.2).default(0.72) }).strict(),
  (ctx, p) => {
    const { b, M } = ctx
    const F = new Frame(b, new THREE.Matrix4())
    const w = p.width
    const d = p.depth
    const top = p.height
    // Turned legs and a carved apron.
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      F.lathe(
        M.wood,
        sx * (w / 2 - 0.07),
        0,
        sz * (d / 2 - 0.07),
        [
          [0, 0],
          [0.035, 0],
          [0.045, 0.06],
          [0.03, 0.2],
          [0.045, 0.34],
          [0.028, 0.5],
          [0.04, top - 0.1],
          [0.04, top - 0.04],
          [0, top - 0.04],
        ],
        10
      )
    F.box(M.wood, 0, top - 0.08, 0, w - 0.06, 0.1, d - 0.06)
    F.box(M.wood, 0, top - 0.02, 0, w, 0.04, d)
    // The carpet: over the top and hanging down the front and the ends.
    F.box(M.carpet, 0, top + 0.004, 0, w + 0.04, 0.012, d + 0.04)
    F.box(M.carpet, 0, top - 0.13, d / 2 + 0.02, w + 0.04, 0.27, 0.012)
    for (const s of [-1, 1]) F.box(M.carpet, s * (w / 2 + 0.02), top - 0.1, 0, 0.012, 0.21, d + 0.04)
    // The crystal ball on its stand.
    F.lathe(
      M.wood,
      0,
      top + 0.01,
      0,
      [
        [0, 0],
        [0.075, 0],
        [0.08, 0.02],
        [0.055, 0.04],
        [0.065, 0.06],
        [0, 0.06],
      ],
      16
    )
    F.sphere(M.orb, 0, top + 0.17, 0, 0.11, 0.11, 0.11, 24)
    // A spread of five cards toward the sitter's guest, and the deck.
    for (let i = 0; i < 5; i++) F.box(M.cards, -0.3 + i * 0.075 + (i > 2 ? 0.34 : 0), top + 0.013, 0.18 - Math.abs(i - 2) * 0.012 + (i > 2 ? -0.06 : 0), 0.06, 0.004, 0.095, (i - 2) * 0.12)
    F.box(M.cardBack, 0.33, top + 0.02, -0.12, 0.062, 0.03, 0.097, 0.3)
    // A small horn cup.
    F.cyl(M.wood, -0.34, top + 0.01, -0.15, 0.035, 0.045, 0.1, 10)
    ctx.footprint(0, 0, w / 2 + 0.1, d / 2 + 0.1)
  },
  { wood: "tableWood" }
)
