"use server"

import { generateObject } from "@/lib/ai"
import { equipmentSchema } from "@/lib/validations/equipment-schema"

interface GenerateEquipmentInput {
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
}

interface GenerateEquipmentResult {
  success: boolean
  equipment?: string[]
  error?: string
}

export async function generateEquipmentAction({
  archetype,
  race,
  attributes,
  appearance,
  background,
  personality,
  motivation,
  backstory,
  skills,
}: GenerateEquipmentInput): Promise<GenerateEquipmentResult> {
  try {
    let attributesText = ""
    if (attributes) {
      attributesText = Object.entries(attributes)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`)
        .join(", ")
      if (attributesText) attributesText = `Attributes: ${attributesText}\n`
    }
    const skillsText = skills?.length ? `Skills: ${skills.join(", ")}\n` : ""
    const prompt = `Generate a list of 3-6 D&D-style starting equipment items for a character with the following details. Return only a JSON object with a single field: equipment (an array of strings). Do not include any extra fields or text.\n\n${archetype ? `Archetype: ${archetype}\n` : ""}${race ? `Race: ${race}\n` : ""}${attributesText}${appearance ? `Appearance: ${appearance}\n` : ""}${background ? `Background: ${background}\n` : ""}${personality ? `Personality: ${personality}\n` : ""}${motivation ? `Motivation: ${motivation}\n` : ""}${backstory ? `Backstory: ${backstory}\n` : ""}${skillsText}`

    const result = await generateObject({
      prompt,
      schema: equipmentSchema,
    })

    if (!result.object) {
      return {
        success: false,
        error: "Failed to generate equipment",
      }
    }

    return {
      success: true,
      equipment: result.object.equipment,
    }
  } catch (error) {
    console.error("Error generating equipment:", error)
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred"
    return {
      success: false,
      error: errorMessage,
    }
  }
}
