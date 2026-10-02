import { z } from "zod"
import type { TransitionValidationResult } from "./transition-validator"

// The model intermittently malforms the structured world-state fields below — most often
// returning an array of plain strings where an array of objects is expected. Previously a
// single malformed field failed the whole patch, so the turn fell back to a summary-only
// patch and silently dropped ALL the GM's world-state updates (discoveries, entity/character
// updates, threads) for that turn. Each field below is therefore made independently resilient:
// open threads coerce strings into {id,title,text}; the richer object arrays use `.catch` so a
// malformed field is dropped without discarding the rest of the patch. (Encounter transitions
// are handled separately in advance-turn.ts and were never affected by this.)
export const adventurePatchSchema = z.object({
  summaryDelta: z.string().optional(),
  discoveries: z
    .array(
      z.object({
        id: z.string(),
        type: z.enum(["fact", "location", "npc", "item", "faction", "quest", "lore"]),
        title: z.string(),
        text: z.string(),
        visibility: z.enum(["player", "gm"]),
        sourceEncounterId: z.string().optional(),
      })
    )
    .optional()
    .catch(undefined),
  entityUpdates: z
    .array(
      z.object({
        entityType: z.enum(["location", "npc", "item", "faction", "quest", "lore"]),
        entityId: z.string(),
        patchText: z.string(),
        visibility: z.enum(["player", "gm"]),
      })
    )
    .optional()
    .catch(undefined),
  characterUpdates: z
    .array(
      z.object({
        characterId: z.string(),
        healthPercent: z.number().min(0).max(100).optional(),
        status: z.string().optional(),
        effectChanges: z.array(z.string()).optional(),
        inventoryChanges: z.array(z.string()).optional(),
        spellUseChanges: z.array(z.string()).optional(),
      })
    )
    .optional()
    .catch(undefined),
  openThreads: z
    .array(
      z
        .union([z.object({ id: z.string(), title: z.string(), text: z.string() }), z.string()])
        .transform((thread) => (typeof thread === "string" ? { id: thread, title: thread, text: thread } : thread))
    )
    .optional()
    .catch(undefined),
  resolvedThreadIds: z.array(z.string()).optional().catch(undefined),
  transition: z
    .object({
      fromEncounterId: z.string(),
      toEncounterId: z.string(),
      reason: z.string(),
    })
    .optional(),
})

export type AdventurePatch = z.infer<typeof adventurePatchSchema>

export type AiGmTurnResult = {
  nextEncounterId: string
  narrative: string
  adventurePatch: AdventurePatch
}

export function validateAdventurePatch(input: unknown, transition: TransitionValidationResult): AdventurePatch {
  const patch = adventurePatchSchema.parse(input ?? {})
  if (transition.allowed && transition.kind === "transition" && transition.transition) {
    const validatedTransition = transition.transition
    const expected = { from: validatedTransition.fromEncounterId, to: validatedTransition.toEncounterId }
    if (patch.transition && (patch.transition.fromEncounterId !== expected.from || patch.transition.toEncounterId !== expected.to)) {
      throw new Error(`Adventure patch transition ${patch.transition.fromEncounterId}->${patch.transition.toEncounterId} does not match validated transition ${expected.from}->${expected.to}`)
    }
    return {
      ...patch,
      transition: patch.transition ?? {
        fromEncounterId: expected.from,
        toEncounterId: expected.to,
        reason: validatedTransition.condition,
      },
    }
  }
  if (patch.transition) {
    throw new Error("Adventure patch cannot include a transition when transition validation did not allow one.")
  }
  return patch
}
