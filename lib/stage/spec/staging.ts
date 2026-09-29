import { z } from "zod"
import { deg, matName, num, size, vec2, vec3 } from "../builders/types"

// Staging spec v1 (`d20.stage.staging`), minimal for phase 2: which set, who stands where, and the shots that frame
// them. Scripts, ambient loops and beats come later (Stageview phases 3–4).

// Art must come from this app (`/stage/...`) or the project's asset bucket; a staging never points players' browsers
// at an arbitrary host.
const ASSET_HOSTS = [/^https:\/\/[a-z0-9-]+\.s3\.[a-z0-9-]+\.amazonaws\.com\//, /^https:\/\/[a-z0-9-]+\.s3\.amazonaws\.com\//]
export const assetUrl = z
  .string()
  .max(1000)
  .refine((u) => /^\/stage\/[A-Za-z0-9/_.-]+$/.test(u) || ASSET_HOSTS.some((re) => re.test(u)), "asset URLs must be /stage/… paths or the asset bucket")

const idName = matName
// Where to look: degrees, another cast member, a mark, or a point.
const facing = z.union([deg, idName, vec2])

const castMember = z
  .object({
    id: idName,
    name: z.string().min(1).max(80),
    role: z.string().max(160).default(""),
    height: size(4),
    art: z.object({ front: assetUrl, back: assetUrl.optional(), portrait: assetUrl.optional() }).strict(),
    at: z.union([idName, vec2]),
    facing: facing.default(0),
  })
  .strict()

const absoluteShot = z.object({ position: vec3, target: vec3, fov: num(10, 120), label: z.string().max(80).optional() }).strict()
// A shot framed on the centroid of some cast members: camera at centroid + offset, looking at centroid + target. With
// `relative: "facing"` the offsets turn with the subjects' average facing (x to their left, z ahead of them).
const groupShot = z
  .object({
    subjects: z.array(idName).min(1).max(12),
    offset: vec3,
    target: vec3,
    relative: z.enum(["world", "facing"]).default("world"),
    fov: num(10, 120),
    label: z.string().max(80).optional(),
  })
  .strict()
// A shot on one cast member: `distance` metres away at `angle` degrees off their facing, camera at `height`, looking at `lookHeight`.
const subjectShot = z.object({ subject: idName, distance: size(100), angle: deg, height: num(0, 100), lookHeight: num(0, 100), fov: num(10, 120), label: z.string().max(80).optional() }).strict()
export const stagingShot = z.union([absoluteShot, groupShot, subjectShot])
export type StagingShot = z.infer<typeof stagingShot>

export const stagingSpecSchema = z
  .object({
    format: z.literal("d20.stage.staging"),
    version: z.literal(1),
    id: z.string().regex(/^[a-z0-9][a-z0-9/-]{0,159}$/),
    set: z.string().regex(/^[a-z0-9][a-z0-9/-]{0,159}$/),
    cast: z.array(castMember).max(24),
    shots: z.record(idName, stagingShot).default({}),
    // Who works each of the set's loops, the party's place in it, and what gets said.
    loops: z
      .record(
        idName,
        z
          .object({
            official: idName,
            party: z
              .object({
                members: z.array(idName).min(1).max(12),
                position: z.number().int().min(0).max(40).default(0),
                lateral: z.array(num(-5, 5)).max(12).optional(),
                pair: z.number().int().min(1).max(4).default(2),
              })
              .strict()
              .optional(),
            lines: z
              .object({
                next: z.array(z.string().max(200)).max(20).default([]),
                question: z.array(z.string().max(200)).max(20).default([]),
                replies: z.array(z.string().max(200)).max(60).default([]),
                fees: z.array(z.string().max(200)).max(20).default([]),
              })
              .strict(),
          })
          .strict()
      )
      .default({}),
    shot: idName.optional(),
  })
  .strict()
  .superRefine((s, ctx) => {
    const ids = new Set<string>()
    for (const c of s.cast) {
      if (ids.has(c.id)) ctx.addIssue({ code: "custom", message: `duplicate cast id ${c.id}`, path: ["cast"] })
      ids.add(c.id)
    }
    for (const [key, shot] of Object.entries(s.shots)) {
      const refs = "subjects" in shot ? shot.subjects : "subject" in shot ? [shot.subject] : []
      for (const r of refs) if (!ids.has(r)) ctx.addIssue({ code: "custom", message: `shot ${key} frames unknown cast member ${r}`, path: ["shots", key] })
    }
  })

export type StagingSpec = z.output<typeof stagingSpecSchema>
export type StagingSpecInput = z.input<typeof stagingSpecSchema>
