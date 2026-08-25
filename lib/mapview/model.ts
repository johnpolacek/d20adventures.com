// Mapview generation model + call — the single source of truth for how a 2D map is
// generated, shared by the admin action and the headless smoke script so they can't
// drift (wiki/plans/mapview.md).
//
// Gemini flash with native structured outputs OFF: numeric min/max bounds in the
// schema drive Gemini's constrained decoder into digit-loops ("rows": 14000000…
// forever, observed 2026-07-03), so we generate prompt-mode JSON against the tolerant
// generation schema and repair in normalizeGeneration. Retries absorb the occasional
// unparseable sample.

import { google } from "@ai-sdk/google"
import type { LanguageModel } from "ai"
import { generateObject } from "ai"
import type { Encounter2DGeneration } from "@/types/encounter-map-2d"
import { encounter2dGenerationSchema } from "@/types/encounter-map-2d"

export const MAPVIEW_MODEL_ID = "gemini-3.6-flash"

export async function generateEncounter2DGeneration(prompt: string, opts?: { model?: LanguageModel; attempts?: number }): Promise<Encounter2DGeneration> {
  const model = opts?.model ?? google(MAPVIEW_MODEL_ID)
  const attempts = opts?.attempts ?? 3
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await generateObject({
        model,
        prompt,
        schema: encounter2dGenerationSchema,
        temperature: 0.8,
        maxOutputTokens: 8000,
        providerOptions: { google: { structuredOutputs: false } },
      })
      return result.object
    } catch (error) {
      lastError = error
      console.warn(`[mapview] generation attempt ${attempt}/${attempts} failed: ${error instanceof Error ? error.message : error}`)
    }
  }
  throw lastError
}
