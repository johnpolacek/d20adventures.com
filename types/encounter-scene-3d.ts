import { z } from "zod"
import { PROP_IDS } from "@/lib/encounterview/asset-catalog"

// Encounter view (3D miniatures) scene spec. Generated per turn from the narrative
// (current + previous), cached in S3 keyed by adventureId/turnId. Board is a fixed
// 20x20-unit tabletop: x/z in [0, 20], rendered centered (world = board - 10).
// facing/rotation in degrees, 0 = facing -z (away from the default camera).

export const environmentKitSchema = z.enum(["forest", "grove", "road", "camp", "ruins", "crypt", "cavern", "shrine", "courtyard", "checkpoint", "generic"])
export type SceneEnvironmentKit = z.infer<typeof environmentKitSchema>

export const sceneGroundSchema = z.enum(["grass", "dirt", "stone", "sand", "snow", "cave"])
export const sceneTimeOfDaySchema = z.enum(["day", "dusk", "night"])
export const sceneMoodSchema = z.enum(["calm", "tense", "battle", "eerie", "aftermath"])
export const sceneStanceSchema = z.enum(["idle", "ready", "attack", "hurt", "down"])
export type SceneStance = z.infer<typeof sceneStanceSchema>

export const sceneEnvironmentSchema = z.object({
  kit: environmentKitSchema,
  ground: sceneGroundSchema,
  timeOfDay: sceneTimeOfDaySchema,
  mood: sceneMoodSchema,
})
export type SceneEnvironment = z.infer<typeof sceneEnvironmentSchema>

export const scenePropSchema = z.object({
  id: z.string(),
  propId: z.enum(PROP_IDS as [string, ...string[]]),
  x: z.number().min(0).max(20),
  z: z.number().min(0).max(20),
  rotation: z.number().min(0).max(359).default(0),
  scale: z.number().min(0.5).max(2).default(1),
})
export type SceneProp = z.infer<typeof scenePropSchema>

export const sceneCharacterSchema = z.object({
  characterId: z.string(),
  x: z.number().min(0).max(20),
  z: z.number().min(0).max(20),
  facing: z.number().min(0).max(359).default(180),
  stance: sceneStanceSchema.default("idle"),
})
export type SceneCharacter = z.infer<typeof sceneCharacterSchema>

export const encounterScene3DSchema = z.object({
  summary: z.string(),
  environment: sceneEnvironmentSchema,
  props: z.array(scenePropSchema),
  characters: z.array(sceneCharacterSchema),
  version: z.literal(1).default(1),
  turnId: z.string(),
  generatedAt: z.string(),
})
export type EncounterScene3D = z.infer<typeof encounterScene3DSchema>

// What the generation model produces; turnId/generatedAt/version stamped afterward.
//
// This schema is deliberately TOLERANT and repairs rather than rejects (same
// rationale as encounter2dGenerationSchema): numeric min/max bounds feed Gemini's
// constrained decoding, which can digit-loop. We generate with structuredOutputs
// off and clamp everything in normalizeSceneGeneration instead. .catch() fallbacks
// absorb loose values, coerce absorbs stringified numbers, and preprocess steps
// absorb the field-name drift observed across samples: coordinates nested under
// "position", characters using "rotation" for "facing", summary nested inside
// environment, and free-text enum values ("tense and moonlit").

/** Hoist {position: {x, z}} / {pos: ...} onto the item root. */
const hoistPosition = (value: unknown) => {
  if (!value || typeof value !== "object") return value
  const item = value as Record<string, unknown>
  const position = item.position ?? item.pos ?? item.coords
  if (position && typeof position === "object") {
    const p = position as Record<string, unknown>
    if (item.x === undefined && p.x !== undefined) item.x = p.x
    if (item.z === undefined && p.z !== undefined) item.z = p.z
  }
  return item
}

const generationPropSchema = z.preprocess(
  hoistPosition,
  z.object({
    id: z.string().catch(""),
    propId: z.string(),
    x: z.coerce.number().catch(0),
    y: z.coerce.number().optional().catch(undefined),
    z: z.coerce.number().catch(0),
    rotation: z.coerce.number().catch(0).default(0),
    scale: z.coerce.number().catch(1).default(1),
  })
)

const generationCharacterSchema = z.preprocess(
  (value) => {
    hoistPosition(value)
    if (value && typeof value === "object") {
      const item = value as Record<string, unknown>
      if (item.facing === undefined && item.rotation !== undefined) item.facing = item.rotation
      if (item.characterId === undefined && item.id !== undefined) item.characterId = item.id
    }
    return value
  },
  z.object({
    characterId: z.string(),
    x: z.coerce.number().catch(0),
    y: z.coerce.number().optional().catch(undefined),
    z: z.coerce.number().catch(0),
    facing: z.coerce.number().catch(180).default(180),
    stance: sceneStanceSchema.optional().catch(undefined),
  })
)

/** Map free-text enum-ish values ("tense and moonlit") onto the closest enum member. */
const fuzzyEnum = <T extends string>(options: readonly T[], fallback: T) =>
  z.preprocess((value) => {
    if (typeof value !== "string") return value
    const lower = value.toLowerCase()
    return options.find((option) => lower.includes(option)) ?? value
  }, z.enum(options as [T, ...T[]]).catch(fallback))

export const encounterScene3DGenerationSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object") return value
    const root = value as Record<string, unknown>
    const env = root.environment
    if (!env || typeof env !== "object") {
      root.environment = { kit: root.kit, ground: root.ground, timeOfDay: root.timeOfDay, mood: root.mood }
    } else {
      const e = env as Record<string, unknown>
      if (root.summary === undefined && typeof e.summary === "string") root.summary = e.summary
      if (e.kit === undefined && e.environmentId !== undefined) e.kit = e.environmentId
    }
    return root
  },
  z.object({
    summary: z.string().catch(""),
    environment: z
      .object({
        kit: fuzzyEnum(environmentKitSchema.options, "generic"),
        ground: fuzzyEnum(sceneGroundSchema.options, "grass"),
        timeOfDay: fuzzyEnum(sceneTimeOfDaySchema.options, "day"),
        mood: fuzzyEnum(sceneMoodSchema.options, "calm"),
      })
      .catch({ kit: "generic", ground: "grass", timeOfDay: "day", mood: "calm" }),
    props: z
      .array(generationPropSchema.catch(null as never))
      .catch([])
      .default([]),
    characters: z
      .array(generationCharacterSchema.catch(null as never))
      .catch([])
      .default([]),
  })
)
export type EncounterScene3DGeneration = z.infer<typeof encounterScene3DGenerationSchema>
