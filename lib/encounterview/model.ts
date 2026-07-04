// Encounter view scene generation model + call — single source of truth for how a
// 3D scene spec is generated. Same Gemini setup as lib/mapview/model.ts and for the
// same reason: structured outputs OFF (numeric min/max bounds digit-loop Gemini's
// constrained decoder), tolerant schema, repair in normalizeSceneGeneration.

import { google } from "@ai-sdk/google"
import type { LanguageModel } from "ai"
import { generateObject } from "ai"
import type { EncounterScene3DGeneration } from "@/types/encounter-scene-3d"
import { encounterScene3DGenerationSchema } from "@/types/encounter-scene-3d"

export const ENCOUNTERVIEW_MODEL_ID = "gemini-3.5-flash"

export async function generateEncounterScene3DGeneration(prompt: string, opts?: { model?: LanguageModel; attempts?: number }): Promise<EncounterScene3DGeneration> {
  const model = opts?.model ?? google(ENCOUNTERVIEW_MODEL_ID)
  const attempts = opts?.attempts ?? 3
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await generateObject({
        model,
        prompt,
        schema: encounterScene3DGenerationSchema,
        temperature: 0.8,
        maxOutputTokens: 5000,
        providerOptions: { google: { structuredOutputs: false } },
      })
      return result.object
    } catch (error) {
      lastError = error
      console.warn(`[encounterview] generation attempt ${attempt}/${attempts} failed: ${error instanceof Error ? error.message : error}`)
    }
  }
  throw lastError
}
