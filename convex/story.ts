import { v } from "convex/values"
import { EFFECT_KINDS, ELEMENTS, OBJECT_KINDS, PACES } from "../packages/gm-core/src/story/beats"

const oneOf = <T extends string>(values: readonly [T, ...T[]]) => v.union(...values.map((value) => v.literal(value)))

// A turn's story as labelled beats, as the GM core writes it (packages/gm-core/src/story/beats.ts).
const by = v.object({ step: v.union(v.literal("intro"), v.literal("reply"), v.literal("roll"), v.literal("npc"), v.literal("round")), character: v.optional(v.string()) })
export const storyValidator = v.array(
  v.union(
    v.object({ kind: v.literal("narration"), by, text: v.string(), place: v.optional(v.string()) }),
    v.object({
      kind: v.literal("action"),
      by,
      text: v.string(),
      actor: v.string(),
      target: v.optional(v.string()),
      move: v.optional(v.object({ to: v.optional(v.string()), from: v.optional(v.string()), pace: v.optional(oneOf(PACES)) })),
      effect: v.optional(v.object({ kind: oneOf(EFFECT_KINDS), element: v.optional(oneOf(ELEMENTS)) })),
      object: v.optional(v.object({ kind: oneOf(OBJECT_KINDS), to: v.optional(v.string()) })),
    }),
    v.object({ kind: v.literal("line"), by, text: v.string(), speaker: v.string(), to: v.optional(v.string()), delivery: v.optional(v.string()) }),
    v.object({
      kind: v.literal("roll"),
      by,
      character: v.string(),
      name: v.string(),
      check: v.string(),
      natural: v.number(),
      modifier: v.optional(v.number()),
      total: v.number(),
      dc: v.number(),
      success: v.boolean(),
      image: v.optional(v.string()),
    }),
    v.object({ kind: v.literal("reply"), by, character: v.string(), text: v.string() })
  )
)
