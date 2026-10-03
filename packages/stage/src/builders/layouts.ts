import { z } from "zod"
import { DEG, M4 } from "../kit/geometry"
import type { Rand } from "../kit/rng"
import { type BuildCtx, coord, defineBuilder, deg, num, vec2 } from "./types"

// Layouts repeat other objects. `item` is any object spec (its own `at` and `yaw` are relative to the placement);
// `items` picks one per placement by weight. `vary` draws numeric params from [min, max] per placement, `choose` picks
// a value from a list; both apply to the chosen item and may also sit on a weighted entry.

const itemSpec = z.looseObject({ type: z.string() })
const vary = z.record(z.string(), z.tuple([z.number(), z.number()]))
const choose = z.record(z.string(), z.array(z.unknown()).min(1).max(32))
const weighted = z.object({ weight: num(0, 1000), item: itemSpec, vary: vary.optional(), choose: choose.optional() }).strict()
const common = {
  item: itemSpec.optional(),
  items: z.array(weighted).min(1).max(16).optional(),
  vary: vary.default({}),
  choose: choose.default({}),
}

type Item = Record<string, unknown>
function pickItem(
  rand: Rand,
  p: {
    item?: Item
    items?: { weight: number; item: Item; vary?: Record<string, [number, number]>; choose?: Record<string, unknown[]> }[]
    vary: Record<string, [number, number]>
    choose: Record<string, unknown[]>
  }
): Item {
  let base: Item
  let v = p.vary
  let c = p.choose
  if (p.items?.length) {
    const total = p.items.reduce((a, e) => a + e.weight, 0)
    let r = rand(0, total)
    let entry = p.items[p.items.length - 1]
    for (const e of p.items) {
      if ((r -= e.weight) < 0) {
        entry = e
        break
      }
    }
    base = entry.item
    v = { ...v, ...entry.vary }
    c = { ...c, ...entry.choose }
  } else if (p.item) base = p.item
  else throw new Error("a layout needs `item` or `items`")
  const out: Item = { ...base }
  for (const [k, [a, b]] of Object.entries(v)) out[k] = rand(a, b)
  for (const [k, list] of Object.entries(c)) out[k] = rand.pick(list)
  return out
}

// Children in this object's frame.
export const group = defineBuilder(z.object({ children: z.array(itemSpec).max(500) }).strict(), (ctx, p) => {
  p.children.forEach((child, i) => {
    ctx.place(child, M4(), ctx.rand.fork(i), `children/${i}`)
  })
})

// Items along a line from `from` to `to` at a random `step`; `offset` pushes each sideways (to the left of the line's
// direction), `itemYaw` turns every item (the layout's own `yaw` turns the whole row) and `yawJitter` adds a random turn; `skip` drops a share of placements.
export const row = defineBuilder(
  z
    .object({
      from: vec2,
      to: vec2,
      step: z.union([num(0.2, 500), z.tuple([num(0.2, 500), num(0.2, 500)])]),
      start: num(0, 500).default(0),
      offset: z.tuple([coord, coord]).default([0, 0]),
      itemYaw: deg.default(0),
      yawJitter: num(0, 180).default(0),
      skip: num(0, 1).default(0),
      max: z.number().int().min(1).max(300).default(300),
      ...common,
    })
    .strict(),
  (ctx: BuildCtx, p) => {
    const [x0, z0] = p.from
    const [x1, z1] = p.to
    const len = Math.hypot(x1 - x0, z1 - z0)
    if (len < 1e-3) return
    const dx = (x1 - x0) / len
    const dz = (z1 - z0) / len
    const [s0, s1] = Array.isArray(p.step) ? p.step : [p.step, p.step]
    let n = 0
    for (let t = p.start; t <= len + 1e-6 && n < p.max; t += ctx.rand(s0, s1), n++) {
      const r = ctx.rand.fork(n)
      if (p.skip > 0 && r() < p.skip) continue
      const off = r(p.offset[0], p.offset[1])
      const x = x0 + dx * t + dz * off
      const zz = z0 + dz * t - dx * off
      const yaw = (p.itemYaw + (p.yawJitter ? r(-p.yawJitter, p.yawJitter) : 0)) * DEG
      ctx.place(pickItem(r, p), M4(x, 0, zz, yaw), r, `row/${n}`)
    }
  }
)

// Items at random points in an area [x0, z0, x1, z1], clear of footprints built so far (unless `avoid` is false).
export const scatter = defineBuilder(
  z
    .object({
      area: z.tuple([coord, coord, coord, coord]),
      count: z.number().int().min(1).max(500),
      itemYaw: z.union([deg, z.tuple([deg, deg])]).default([0, 360]),
      avoid: z.boolean().default(true),
      // Circles [x, z, r] kept empty: a trail, a clearing.
      clear: z
        .array(z.tuple([coord, coord, num(0, 500)]))
        .max(64)
        .default([]),
      ...common,
    })
    .strict(),
  (ctx, p) => {
    const [x0, z0, x1, z1] = p.area
    let placed = 0
    for (let tries = 0; placed < p.count && tries < p.count * 20; tries++) {
      const r = ctx.rand.fork(tries)
      const x = r(x0, x1)
      const zz = r(z0, z1)
      if (p.avoid && ctx.blocked(x, zz)) continue
      if (p.clear.some(([cx, cz, r]) => Math.hypot(x - cx, zz - cz) < r)) continue
      const yaw = (Array.isArray(p.itemYaw) ? r(p.itemYaw[0], p.itemYaw[1]) : p.itemYaw) * DEG
      ctx.place(pickItem(r, p), M4(x, 0, zz, yaw), r, `scatter/${placed}`)
      placed++
    }
  }
)
