"use server"

import { MOVEMENT_SYSTEM, type MovementContext, type MovementIntent, movementIntentSchema, movementPrompt } from "@d20/stage/movement"
import { generateObject } from "ai"
import { currentModel } from "@/lib/ai/llm"
import { isDev } from "@/lib/auth-utils"

// Dev-only while Stageview is a mock: maps a player's written action to a movement intent. The real turn loop will run
// this server-side as part of resolving a reply (and charge it with the turn), then validate the move against the set.
export async function inferStageMovement(context: MovementContext): Promise<{ intent: MovementIntent; ms: number } | { error: string }> {
  if (!isDev()) return { error: "Not available" }
  const t0 = Date.now()
  try {
    const { object } = await generateObject({ model: currentModel, schema: movementIntentSchema, system: MOVEMENT_SYSTEM, prompt: movementPrompt(context) })
    // Only ids that were offered survive.
    const intent = { ...object }
    if (intent.place && !context.places.some((p) => p.id === intent.place)) intent.move = "stay"
    if (intent.character && !context.characters.some((p) => p.id === intent.character)) intent.move = "stay"
    return { intent, ms: Date.now() - t0 }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
