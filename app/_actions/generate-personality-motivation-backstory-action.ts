'use server'

import { generateObject } from "@/lib/ai"
import { personalityMotivationBackstorySchema } from "@/lib/validations/personality-motivation-backstory-schema"

interface GeneratePersonalityMotivationBackstoryInput {
  archetype?: string
  race?: string
  attributes?: {
    strength?: number | string
    dexterity?: number | string
    constitution?: number | string
    intelligence?: number | string
    wisdom?: number | string
    charisma?: number | string
  }
  appearance?: string
  background?: string
}

interface GeneratePersonalityMotivationBackstoryResult {
  success: boolean
  personality?: string
  motivation?: string
  backstory?: string
  error?: string
}

export async function generatePersonalityMotivationBackstoryAction({
  archetype,
  race,
  attributes,
  appearance,
  background
}: GeneratePersonalityMotivationBackstoryInput): Promise<GeneratePersonalityMotivationBackstoryResult> {
  try {
    let attributesText = ""
    if (attributes) {
      attributesText = Object.entries(attributes)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`)
        .join(", ")
      if (attributesText) attributesText = `Attributes: ${attributesText}\n`
    }
    const prompt = `Generate a D&D-style single-sentence personality, single-sentence motivation, and a brief backstory for a character with the following details. Do not include any place names. Return only a JSON object with three fields: personality (required), motivation (required), and backstory (optional). Do not include any extra fields or text.\n\n${archetype ? `Archetype: ${archetype}\n` : ''}${race ? `Race: ${race}\n` : ''}${attributesText}${appearance ? `Appearance: ${appearance}\n` : ''}${background ? `Background: ${background}\n` : ''}`

    const result = await generateObject({
      prompt,
      schema: personalityMotivationBackstorySchema
    })

    if (!result.object) {
      return {
        success: false,
        error: "Failed to generate personality/motivation/backstory"
      }
    }

    return {
      success: true,
      personality: result.object.personality,
      motivation: result.object.motivation,
      backstory: result.object.backstory
    }
  } catch (error) {
    console.error("Error generating personality/motivation/backstory:", error)
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred"
    return {
      success: false,
      error: errorMessage
    }
  }
} 