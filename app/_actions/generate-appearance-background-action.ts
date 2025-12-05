"use server"

import { generateObject } from "@/lib/ai"
import { appearanceBackgroundSchema } from "@/lib/validations/appearance-background-schema"

interface GenerateAppearanceBackgroundInput {
  archetype?: string
  race?: string
  name?: string
  attributes?: {
    strength?: number | string
    dexterity?: number | string
    constitution?: number | string
    intelligence?: number | string
    wisdom?: number | string
    charisma?: number | string
  }
}

interface GenerateAppearanceBackgroundResult {
  success: boolean
  appearance?: string
  background?: string
  error?: string
}

export async function generateAppearanceBackgroundAction({ archetype, race, name, attributes }: GenerateAppearanceBackgroundInput): Promise<GenerateAppearanceBackgroundResult> {
  try {
    let attributesText = ""
    if (attributes) {
      attributesText = Object.entries(attributes)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .filter(([_, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`)
        .join(", ")
      if (attributesText) attributesText = `Attributes: ${attributesText}\n`
    }
    const prompt = `Generate a D&D-style single-sentence character appearance and single-sentence background for a character with the following details. Return only a JSON object with two fields: appearance (required, a vivid description of the character's looks) and background (optional, a brief backstory). Do not include any extra fields or text.\n\n${name ? `Name: ${name}\n` : ""}${archetype ? `Archetype: ${archetype}\n` : ""}${race ? `Race: ${race}\n` : ""}${attributesText}`

    const result = await generateObject({
      prompt,
      schema: appearanceBackgroundSchema,
    })

    if (!result.object) {
      return {
        success: false,
        error: "Failed to generate appearance/background",
      }
    }

    return {
      success: true,
      appearance: result.object.appearance,
      background: result.object.background,
    }
  } catch (error) {
    console.error("Error generating appearance/background:", error)
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred"
    return {
      success: false,
      error: errorMessage,
    }
  }
}
