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
// Painted textures from scripts/stage-textures.ts, served from public/stage/textures. A set is untrusted: that folder only.
const texture = z.string().regex(/^\/stage\/textures\/[a-z0-9][a-z0-9-]{0,79}\.(jpg|webp|png)$/, "textures live in /stage/textures")
// Boards painted from an image: `map` is one board's grain, laid along each piece's grain axis with the wood shader's
// seams, worn arrises and grime. size = [across, along] the grain in metres that the image covers; tint multiplies it.
// nails 0..1 sets nail heads near each board's ends.
const painted = z
  .object({
    type: z.literal("painted"),
    map: texture,
    size: z.tuple([num(0.05, 20), num(0.05, 40)]).optional(),
    tint: color.optional(),
    dark: color.optional(),
    plank: z.tuple([num(0, 5), num(0.05, 200)]).optional(),
    relief: num(0, 1).optional(),
    wear: num(0, 3).optional(),
    variance: num(0, 2).optional(),
    seed: num(0, 1000).optional(),
    grime: num(0, 3).optional(),
    nails: unit.optional(),
    roughness: unit.optional(),
  })
  .strict()
// Cut-out cards such as hanging moss: an image with alpha, lit from both sides, casting no shadow.
const card = z.object({ type: z.literal("card"), map: texture, tint: color.optional(), roughness: unit.optional() }).strict()
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
// Light in the air: additive, unlit and shadowless (shafts of moonlight through a canopy).
const glow = z.object({ type: z.literal("glow"), color, opacity: unit.optional() }).strict()
// Mist banks: soft cloud cards in the fog's colour, unlit and shadowless (see the `mist` builder).
const mist = z.object({ type: z.literal("mist"), color, opacity: unit.optional() }).strict()
// Leaves: painted leaf clusters with gaps, for tree crowns, bushes and ferns.
const foliage = z.object({ type: z.literal("foliage"), color, roughness: unit.optional() }).strict()
const metal = z.object({ type: z.literal("metal"), color, roughness: unit.optional(), metalness: unit.optional() }).strict()
const plain = z.object({ type: z.literal("plain"), color, roughness: unit.optional(), emissive: color.optional(), emissiveIntensity: num(0, 20).optional() }).strict()
// Field stone with moss and lichen, painted from world position (menhirs, boulders, flagstones).
const rock = z
  .object({
    type: z.literal("rock"),
    a: color.optional(),
    b: color.optional(),
    moss: color.optional(),
    mossLight: color.optional(),
    lichen: color.optional(),
    mossAmount: unit.optional(),
    lichenAmount: unit.optional(),
    relief: num(0, 3).optional(),
    scale: num(0.1, 10).optional(),
    seed: num(0, 1000).optional(),
  })
  .strict()
// A meadow floor: grass, moss, bare earth, pebbles, fallen leaves and wildflowers.
const meadow = z
  .object({
    type: z.literal("meadow"),
    grass: color.optional(),
    grassDark: color.optional(),
    moss: color.optional(),
    dry: color.optional(),
    dirt: color.optional(),
    litter: color.optional(),
    dirtAmount: unit.optional(),
    pebbles: unit.optional(),
    litterAmount: unit.optional(),
    flowers: unit.optional(),
    relief: num(0, 3).optional(),
    seed: num(0, 1000).optional(),
  })
  .strict()
// Grass blades and heather, dark at the root and `tip` coloured at the top.
const grass = z.object({ type: z.literal("grass"), base: color.optional(), tip: color.optional(), roughness: unit.optional() }).strict()
// Running water that mirrors the sky. `flow` is the downstream direction [x, z].
const water = z.object({ type: z.literal("water"), color: color.optional(), reflect: num(0, 20).optional(), ripple: num(0, 5).optional(), flow: z.tuple([num(-1, 1), num(-1, 1)]).optional() }).strict()
export const materialSpec = z.discriminatedUnion("type", [masonry, wood, painted, card, cloth, burlap, foliage, glow, mist, metal, plain, rock, meadow, grass, water])
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
            // Where the disc shows in the sky, if not where the light comes from.
            disc: vec3.optional(),
            color,
            intensity: num(0, 20),
            target: vec3.default([0, 0, 0]),
            distance: num(10, 2000).default(260),
            shadow: z.object({ left: coord, right: coord, top: coord, bottom: coord, near: num(0.1, 1000), far: num(1, 5000) }).strict(),
          })
          .strict(),
        hemisphere: z.object({ sky: color, ground: color, intensity: num(0, 5) }).strict(),
        // `gain` dims the whole painted sky, clouds and sun glow included: below 1 for dusk and night. `clouds` thins the
        // cumulus, and `stars` fades in a star field for night. `moon` draws a crisp moon of that radius in degrees at the
        // sun's disc, in place of the soft sun.
        sky: z.object({ horizon: color, mid: color, zenith: color, gain: num(0, 2).default(1), clouds: unit.default(1), stars: unit.default(0), moon: num(0, 10).default(0) }).strict(),
        // `color` sets mist apart from the sky: pale mist glowing between dark trees on a moonlit night.
        // `start` keeps the near ground clear: haze builds only beyond it, in metres, as in a painting's aerial depth.
        fog: z.object({ density: num(0, 0.05), color: color.optional(), start: num(0, 200).default(0) }).strict(),
        // The sky's glow around the sun (or moon) and the haze toward it. Warm sunlight when unset.
        glow: color.optional(),
        // A soft light that travels with the camera, keeping nearby characters readable at night (a game convention):
        // warm against cool moonlight. `distance` is where it fades out, in metres.
        fill: z
          .object({ color, intensity: num(0, 50), distance: size(100).default(14) })
          .strict()
          .optional(),
        // Lamps and lit windows: warm point lights that pool on decks and walls and glint in water. No shadows.
        lights: z
          .array(z.object({ at: vec3, color, intensity: num(0, 500), distance: num(0.5, 200), decay: num(0, 3).default(2) }).strict())
          .max(8)
          .default([]),
        environment: num(0, 3).default(0.32),
        exposure: num(0.1, 4).default(1.05),
        // The paint pass's colour grade: warm umber shadows and parchment highlights, or neutral for moonlight.
        grade: z.enum(["warm", "neutral"]).default("warm"),
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
