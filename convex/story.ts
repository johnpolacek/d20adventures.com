import { v } from "convex/values"
import { EFFECT_KINDS, ELEMENTS, OBJECT_KINDS, PACES } from "../packages/gm-core/src/story/beats"

const oneOf = <T extends string>(values: readonly [T, ...T[]]) => v.union(...values.map((value) => v.literal(value)))

// A turn's story as labelled beats, as the GM core writes it (packages/gm-core/src/story/beats.ts).
const by = v.object({ step: v.union(v.literal("intro"), v.literal("reply"), v.literal("roll"), v.literal("npc"), v.literal("round")), character: v.optional(v.string()) })
const harm = v.array(
  v.object({
    target: v.string(),
    kind: v.union(v.literal("damage"), v.literal("healing")),
    dice: v.array(v.number()),
    sides: v.optional(v.number()),
    bonus: v.number(),
    type: v.optional(v.string()),
    amount: v.number(),
  })
)
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
      private: v.optional(v.literal(true)),
    }),
    v.object({ kind: v.literal("line"), by, text: v.string(), speaker: v.string(), to: v.optional(v.string()), delivery: v.optional(v.string()), private: v.optional(v.literal(true)) }),
    v.object({
      kind: v.literal("roll"),
      by,
      character: v.string(),
      name: v.string(),
      check: v.string(),
      natural: v.number(),
      dice: v.optional(v.array(v.number())),
      mode: v.optional(v.union(v.literal("advantage"), v.literal("disadvantage"))),
      modifier: v.optional(v.number()),
      total: v.number(),
      dc: v.number(),
      success: v.boolean(),
      image: v.optional(v.string()),
      // An attack roll: who was attacked, a Critical Hit, the damage dice as they fell and what the target lost.
      attack: v.optional(
        v.object({
          target: v.string(),
          critical: v.optional(v.literal(true)),
          damage: v.optional(v.array(v.object({ type: v.string(), dice: v.array(v.number()), sides: v.optional(v.number()), bonus: v.number(), total: v.number() }))),
          taken: v.optional(v.number()),
        })
      ),
      // What a check or save hurt or healed: the dice as they fell and what each target lost or regained.
      harm: v.optional(harm),
      // The conditions a check or save gave, or ended, and for whom.
      conditions: v.optional(v.array(v.object({ target: v.string(), condition: v.string(), ends: v.optional(v.literal(true)) }))),
      // A Bardic Inspiration die rolled and added to a roll that had failed.
      inspired: v.optional(v.number()),
      // Dice that lasting spells added to the roll or took from it.
      adds: v.optional(v.array(v.object({ from: v.string(), amount: v.number() }))),
      // The spell this roll belongs to: the caster's spell attack, or a target's saving throw against it.
      spell: v.optional(v.string()),
      // A Death Saving Throw: the saves once it was made, and how it ended the hero's dying.
      deathSave: v.optional(v.object({ successes: v.number(), failures: v.number(), fate: v.optional(v.union(v.literal("revived"), v.literal("stable"), v.literal("dead"))) })),
    }),
    v.object({ kind: v.literal("reply"), by, character: v.string(), text: v.string() }),
    // A class feature used with a Bonus Action, which the engine applied.
    v.object({ kind: v.literal("feature"), by, character: v.string(), name: v.string(), text: v.string(), target: v.optional(v.string()), harm: v.optional(harm) })
  )
)

// What each character knows: facts, each with every character who knows it (packages/gm-core/src/story/knowledge.ts).
export const knowledgeValidator = v.array(v.object({ id: v.string(), text: v.string(), knownBy: v.array(v.string()) }))
