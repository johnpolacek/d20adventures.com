"use server"

import { generateObject } from "@/lib/ai"
import { spellsSchema } from "@/lib/validations/spells-schema"

interface GenerateSpellsInput {
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

interface GenerateSpellsResult {
  success: boolean
  spells?: { name: string; description?: string }[]
  error?: string
}

export async function generateSpellsAction({
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
}: GenerateSpellsInput): Promise<GenerateSpellsResult> {
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
    const equipmentText = equipment?.length ? `Equipment: ${equipment.join(", ")}\n` : ""
    const prompt = `Generate a list of 2-5 D&D-style spells for a character with the following details. Each spell should have a name and a short description. Return only a JSON object with a single field: spells (an array of objects with name and description). Do not include any extra fields or text.\n\n${archetype ? `Archetype: ${archetype}\n` : ""}${race ? `Race: ${race}\n` : ""}${attributesText}${appearance ? `Appearance: ${appearance}\n` : ""}${background ? `Background: ${background}\n` : ""}${personality ? `Personality: ${personality}\n` : ""}${motivation ? `Motivation: ${motivation}\n` : ""}${backstory ? `Backstory: ${backstory}\n` : ""}${skillsText}${equipmentText}`

    const result = await generateObject({
      prompt,
      schema: spellsSchema,
    })

    if (!result.object) {
      return {
        success: false,
        error: "Failed to generate spells",
      }
    }

    return {
      success: true,
      spells: result.object.spells,
    }
  } catch (error) {
    console.error("Error generating spells:", error)
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred"
    return {
      success: false,
      error: errorMessage,
    }
  }
}
