import { z } from "zod"
import { coord, deg, matName, num, size, vec2, vec3 } from "../builders/types"
import { PAWN_KINDS } from "../figures/pawns"
import { HERALDRY } from "../materials/heraldry"

// Set spec v1 (`d20.stage.set`): a location, authored once and reused across encounters. JSON only; the kit interprets
// it through parametric builders (see ../builders). Metres, y up, the set faces +z; angles in degrees; colours as hex.
// Every value is bounded: a set is untrusted input (owner decision, 2026-09-29).

export const LIMITS = { objects: 4000, placed: 30000, depth: 6, vertices: 14_000_000, people: 4000, materials: 128 }

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "colours are #rrggbb")
const name = matName
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/, "ids are lowercase slugs")
const unit = num(0, 1)

const masonry = z
  .object({
    type: z.literal("masonry"),
    a: color,
    b: color,
    c: color,
    mortar: color.optional(),
    block: z.tuple([num(0.05, 200), num(0.05, 200)]).optional(),
    joint: num(0, 1).optional(),
    relief: num(0, 1).optional(),
    grime: num(0, 3).optional(),
    variance: num(0, 2).optional(),
    seed: num(0, 1000).optional(),
    scale: num(0.1, 10).optional(),
    roughness: unit.optional(),
    ground: z.boolean().optional(),
    roads: z.boolean().optional(),
    doubleSided: z.boolean().optional(),
  })
  .strict()
const wood = z
  .object({
    type: z.literal("wood"),
    a: color,
    b: color,
    c: color,
    dark: color.optional(),
    plank: z.tuple([num(0, 5), num(0.05, 200)]).optional(),
    relief: num(0, 1).optional(),
    wear: num(0, 3).optional(),
    variance: num(0, 2).optional(),
    seed: num(0, 1000).optional(),
    grime: num(0, 3).optional(),
    roughness: unit.optional(),
  })
  .strict()
const cloth = z
  .object({
    type: z.literal("cloth"),
    color,
    heraldry: z.enum(HERALDRY).optional(),
    tatters: z.tuple([z.number().int().min(0).max(40), num(0, 0.6)]).optional(),
    amp: num(0, 3).optional(),
    freq: num(0.1, 5).optional(),
    shadow: z.boolean().optional(),
  })
  .strict()
const burlap = z.object({ type: z.literal("burlap"), color, roughness: unit.optional() }).strict()
const metal = z.object({ type: z.literal("metal"), color, roughness: unit.optional(), metalness: unit.optional() }).strict()
const plain = z.object({ type: z.literal("plain"), color, roughness: unit.optional(), emissive: color.optional(), emissiveIntensity: num(0, 20).optional() }).strict()
export const materialSpec = z.discriminatedUnion("type", [masonry, wood, cloth, burlap, metal, plain])
export type MaterialSpec = z.infer<typeof materialSpec>

// An object is `{ type, id?, at?, yaw?, materials?, ...params }`; params are checked by the builder named by `type`.
export const objectEnvelope = z.looseObject({
  type: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,39}$/),
  id: z.string().max(80).optional(),
  at: z.union([vec2, vec3]).optional(),
  yaw: deg.optional(),
  materials: z.record(name, name).optional(),
})
export type ObjectSpec = z.infer<typeof objectEnvelope>

const mix = z.partialRecord(z.enum(PAWN_KINDS), num(0, 1000))
const pathRef = z.union([name, z.array(vec2).min(2).max(256)])
const rect = z.tuple([coord, coord, coord, coord])
const crowdGroup = z.discriminatedUnion("type", [
  // People at random in an area; `density` rects multiply the chance of standing there (factors multiply where rects overlap).
  z
    .object({
      type: z.literal("scatter"),
      area: rect,
      count: z.number().int().min(1).max(LIMITS.people),
      mix,
      density: z
        .array(z.object({ rect, factor: num(0, 20) }).strict())
        .max(24)
        .default([]),
      face: z
        .object({ toward: vec2, jitter: num(0, 180).default(50), share: unit.default(0.7) })
        .strict()
        .optional(),
      avoid: z.boolean().default(true),
    })
    .strict(),
  // A rank: evenly spaced from `from` to `to`, all facing `yaw`.
  z.object({ type: z.literal("line"), from: vec2, to: vec2, count: z.number().int().min(1).max(400), mix, yaw: deg.default(0), scale: num(0.5, 2).optional() }).strict(),
  // Hand-placed people.
  z
    .object({
      type: z.literal("points"),
      people: z.array(z.object({ kind: z.enum(PAWN_KINDS), at: vec2, yaw: deg.default(0), scale: num(0.5, 2).optional(), y: num(-10, 300).optional() }).strict()).max(1000),
    })
    .strict(),
  // A standing line along a path, facing its start (a queue).
  z
    .object({
      type: z.literal("path"),
      id: name.optional(),
      path: pathRef,
      count: z.number().int().min(1).max(1000),
      start: num(0, 2000).default(0),
      spacing: z.tuple([num(0.3, 20), num(0.3, 20)]).default([0.75, 1.25]),
      lateral: num(0, 5).default(0.14),
      mix,
    })
    .strict(),
  // People walking a path: `loop` wraps at the end, `pingpong` turns around.
  z
    .object({
      type: z.literal("walkers"),
      path: pathRef,
      count: z.number().int().min(1).max(1000),
      mode: z.enum(["loop", "pingpong"]).default("loop"),
      speed: z.tuple([num(0.1, 5), num(0.1, 5)]).default([0.8, 1.2]),
      lateral: z.tuple([num(-20, 20), num(-20, 20)]).default([0, 0]),
      both: z.boolean().default(false),
      mix,
    })
    .strict(),
  // One person on each builder anchor with this tag (parapet lookouts).
  z.object({ type: z.literal("anchors"), tag: z.string().max(40), mix, jitter: num(0, 5).default(0.5), yaw: z.tuple([deg, deg]).default([-35, 35]) }).strict(),
])
export type CrowdGroup = z.infer<typeof crowdGroup>

// Ambient loops the set can run. A queue: an official works a line (a `path` crowd group with an id) at a station;
// those who pass follow `pass` to a point in `passEnd` (cast members to `castEnd`), and are recycled: they reappear in a
// `spawn` rectangle, walk by the nearest `via` point and park near `park` until there is room at the tail.
const rect4 = z.tuple([coord, coord, coord, coord])
export const queueLoopSpec = z
  .object({
    type: z.literal("queue"),
    id: name,
    crowd: name,
    path: name,
    station: name,
    counter: vec3,
    pass: z.array(vec2).min(1).max(16),
    passEnd: rect4,
    castEnd: vec2,
    recycle: z.object({ spawn: z.array(rect4).min(1).max(8), via: z.array(vec2).min(1).max(8), park: vec2, parkJitter: z.tuple([num(0, 20), num(0, 20)]).default([0.6, 1.7]) }).strict(),
    spacing: z
      .object({ within: num(0.3, 5).default(0.75), between: num(0.3, 10).default(1.25), pair: num(0.3, 5).default(0.85) })
      .strict()
      .default({ within: 0.75, between: 1.25, pair: 0.85 }),
  })
  .strict()
export type QueueLoopSpecInput = z.infer<typeof queueLoopSpec>

const shot = z
  .object({
    position: vec3,
    target: vec3,
    fov: num(10, 120),
    label: z.string().max(80).optional(),
  })
  .strict()

export const setSpecSchema = z
  .object({
    format: z.literal("d20.stage.set"),
    version: z.literal(1),
    id: slug,
    settingId: slug,
    locationId: slug,
    title: z.string().min(1).max(120),
    seed: z.number().int().min(0).max(4294967295),
    atmosphere: z
      .object({
        sun: z
          .object({
            direction: vec3,
            color,
            intensity: num(0, 20),
            target: vec3.default([0, 0, 0]),
            distance: num(10, 2000).default(260),
            shadow: z.object({ left: coord, right: coord, top: coord, bottom: coord, near: num(0.1, 1000), far: num(1, 5000) }).strict(),
          })
          .strict(),
        hemisphere: z.object({ sky: color, ground: color, intensity: num(0, 5) }).strict(),
        sky: z.object({ horizon: color, mid: color, zenith: color }).strict(),
        fog: z.object({ density: num(0, 0.05) }).strict(),
        environment: num(0, 3).default(0.32),
        exposure: num(0.1, 4).default(1.05),
        wind: num(0, 3).default(0.8),
      })
      .strict(),
    camera: z
      .object({
        near: num(0.05, 10).default(0.3),
        far: num(100, 10000).default(2400),
        min: vec3,
        max: vec3,
        maxDistance: num(1, 2000).default(320),
      })
      .strict(),
    materials: z.record(name, materialSpec),
    objects: z.array(objectEnvelope).max(LIMITS.objects),
    land: z
      .object({ inner: size(5000), outer: size(10000), palette: z.array(color).min(1).max(12), hills: num(0, 5).default(1) })
      .strict()
      .optional(),
    crowd: z
      .object({
        library: slug,
        avoid: z
          .object({
            rects: z
              .array(z.tuple([coord, coord, num(0, 1000), num(0, 1000), deg]))
              .max(64)
              .default([]),
            circles: z
              .array(z.tuple([coord, coord, num(0, 1000)]))
              .max(64)
              .default([]),
          })
          .strict()
          .default({ rects: [], circles: [] }),
        groups: z.array(crowdGroup).max(64),
      })
      .strict()
      .optional(),
    // Named spots. A `label` makes a mark a place players can refer to ("the gap in the barrier"): the movement model
    // may only send characters to labelled marks, other cast members, or relative steps.
    marks: z.record(name, z.object({ at: vec2, yaw: deg.optional(), label: z.string().max(80).optional() }).strict()).default({}),
    loops: z.array(queueLoopSpec).max(8).default([]),
    paths: z.record(name, z.array(vec2).min(2).max(256)).default({}),
    shots: z.record(name, shot),
    life: z
      .object({
        birds: z
          .object({ count: z.number().int().min(1).max(400), center: vec2, spread: vec2, radius: z.tuple([size(1000), size(1000)]), height: z.tuple([num(0, 1000), num(0, 1000)]) })
          .strict()
          .optional(),
        dust: z
          .object({ count: z.number().int().min(1).max(6000), box: z.tuple([coord, coord, coord, coord, coord, coord]) })
          .strict()
          .optional(),
      })
      .strict()
      .default({}),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (Object.keys(s.materials).length > LIMITS.materials) ctx.addIssue({ code: "custom", message: `at most ${LIMITS.materials} materials`, path: ["materials"] })
    if (!Object.keys(s.shots).length) ctx.addIssue({ code: "custom", message: "a set needs at least one shot", path: ["shots"] })
    const people = (s.crowd?.groups ?? []).reduce((n, g) => n + ("count" in g ? g.count : g.type === "points" ? g.people.length : 0), 0)
    if (people > LIMITS.people) ctx.addIssue({ code: "custom", message: `at most ${LIMITS.people} people`, path: ["crowd"] })
  })

export type SetSpecInput = z.input<typeof setSpecSchema>
export type SetSpec = z.output<typeof setSpecSchema>
