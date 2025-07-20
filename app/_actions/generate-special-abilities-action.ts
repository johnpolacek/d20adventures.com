'use server'

import { generateObject } from "@/lib/ai"
import { specialAbilitiesSchema } from "@/lib/validations/special-abilities-schema"

interface GenerateSpecialAbilitiesInput {
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
  personality?: string
  motivation?: string
  backstory?: string
  skills?: string[]
  equipment?: string[]
}

interface GenerateSpecialAbilitiesResult {
  success: boolean
  specialAbilities?: string[]
  error?: string
}

export async function generateSpecialAbilitiesAction({
  archetype,
  race,
  attributes,
  appearance,
  background,
  personality,
  motivation,
  backstory,
  skills,
  equipment,
}: GenerateSpecialAbilitiesInput): Promise<GenerateSpecialAbilitiesResult> {
  try {
    let attributesText = ""
    if (attributes) {
      attributesText = Object.entries(attributes)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`)
        .join(", ")
      if (attributesText) attributesText = `Attributes: ${attributesText}\n`
    }
    const skillsText = skills && skills.length ? `Skills: ${skills.join(", ")}\n` : ""
    const equipmentText = equipment && equipment.length ? `Equipment: ${equipment.join(", ")}\n` : ""
    const prompt = `Generate a list of 2-4 D&D-style special abilities for a character with the following details. These should be unique abilities that reflect the character's race, class, background, or personal traits. Return only a JSON object with a single field: specialAbilities (an array of strings). Do not include any extra fields or text.\n\n${archetype ? `Archetype: ${archetype}\n` : ''}${race ? `Race: ${race}\n` : ''}${attributesText}${appearance ? `Appearance: ${appearance}\n` : ''}${background ? `Background: ${background}\n` : ''}${personality ? `Personality: ${personality}\n` : ''}${motivation ? `Motivation: ${motivation}\n` : ''}${backstory ? `Backstory: ${backstory}\n` : ''}${skillsText}${equipmentText}`

    const result = await generateObject({
      prompt,
      schema: specialAbilitiesSchema
    })

    if (!result.object) {
      return {
        success: false,
        error: "Failed to generate special abilities"
      }
    }

    return {
      success: true,
      specialAbilities: result.object.specialAbilities
    }
  } catch (error) {
    console.error("Error generating special abilities:", error)
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred"
    return {
      success: false,
      error: errorMessage
    }
  }
} 