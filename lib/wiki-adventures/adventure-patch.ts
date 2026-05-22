import { z } from "zod"
import type { TransitionValidationResult } from "./transition-validator"

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
    .optional(),
  entityUpdates: z
    .array(
      z.object({
        entityType: z.enum(["location", "npc", "item", "faction", "quest", "lore"]),
        entityId: z.string(),
        patchText: z.string(),
        visibility: z.enum(["player", "gm"]),
      })
    )
    .optional(),
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
    .optional(),
  openThreads: z.array(z.object({ id: z.string(), title: z.string(), text: z.string() })).optional(),
  resolvedThreadIds: z.array(z.string()).optional(),
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
