'use server'

import { generateObject } from "@/lib/ai"
import { skillsSchema } from "@/lib/validations/skills-schema"

interface GenerateSkillsInput {
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
}

interface GenerateSkillsResult {
  success: boolean
  skills?: string[]
  error?: string
}

export async function generateSkillsAction({
  archetype,
  race,
  attributes,
  appearance,
  background,
  personality,
  motivation,
  backstory,
}: GenerateSkillsInput): Promise<GenerateSkillsResult> {
  try {
    let attributesText = ""
    if (attributes) {
      attributesText = Object.entries(attributes)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`)
        .join(", ")
      if (attributesText) attributesText = `Attributes: ${attributesText}\n`
    }
    const prompt = `Generate a list of 3-6 D&D-style skills for a character with the following details. Return only a JSON object with a single field: skills (an array of strings). Do not include any extra fields or text.\n\n${archetype ? `Archetype: ${archetype}\n` : ''}${race ? `Race: ${race}\n` : ''}${attributesText}${appearance ? `Appearance: ${appearance}\n` : ''}${background ? `Background: ${background}\n` : ''}${personality ? `Personality: ${personality}\n` : ''}${motivation ? `Motivation: ${motivation}\n` : ''}${backstory ? `Backstory: ${backstory}\n` : ''}`

    const result = await generateObject({
      prompt,
      schema: skillsSchema
    })

    if (!result.object) {
      return {
        success: false,
        error: "Failed to generate skills"
      }
    }

    return {
      success: true,
      skills: result.object.skills
    }
  } catch (error) {
    console.error("Error generating skills:", error)
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred"
    return {
      success: false,
      error: errorMessage
    }
  }
} 