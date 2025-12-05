"use server"

import { generateObject } from "@/lib/ai"
import { type Attributes, attributesSchema } from "@/types/character"

interface GenerateAttributesInput {
  archetype?: string
  race?: string
}

interface GenerateAttributesResult {
  success: boolean
  attributes?: Attributes
  error?: string
}

export async function generateAttributesAction({ archetype, race }: GenerateAttributesInput): Promise<GenerateAttributesResult> {
  try {
    const prompt = `Generate balanced but generous and thematic D&D-style character attributes (strength, dexterity, constitution, intelligence, wisdom, charisma) for a character with the following details. Each attribute should be a number between 1 and 20.\n\n${archetype ? `Archetype: ${archetype}\n` : ""}${race ? `Race: ${race}\n` : ""}\nReturn only the six attributes as a JSON object. Do not include any extra fields or text.`

    const result = await generateObject({
      prompt,
      schema: attributesSchema,
    })

    if (!result.object) {
      return {
        success: false,
        error: "Failed to generate attributes",
      }
    }

    return {
      success: true,
      attributes: result.object,
    }
  } catch (error) {
    console.error("Error generating attributes:", error)
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred"
    return {
      success: false,
      error: errorMessage,
    }
  }
}
