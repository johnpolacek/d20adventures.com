'use server'

import { generateObject } from "@/lib/ai"
import { 
  npcGenerationSchema, 
  pcTemplateGenerationSchema,
  type NPC, 
  type PCTemplate 
} from "@/types/character"

interface GenerateCharacterInput {
  prompt: string
  characterType: "npc" | "pc"
}

interface GenerateCharacterResult {
  success: boolean
  character?: NPC | PCTemplate
  error?: string
}

export async function generateCharacterAction({ 
  prompt, 
  characterType 
}: GenerateCharacterInput): Promise<GenerateCharacterResult> {
  try {
    if (!prompt.trim()) {
      return {
        success: false,
        error: "Prompt is required"
      }
    }

    // Use the appropriate schema based on character type
    const schema = characterType === "npc" ? npcGenerationSchema : pcTemplateGenerationSchema

    // Enhance the prompt with character type context
    const enhancedPrompt = `Generate a ${characterType === "npc" ? "non-player character (NPC)" : "player character"} based on this description: ${prompt}. 
    
    Please include:
    - Physical appearance and personality traits
    - Background story and motivation
    - Appropriate skills and equipment based on their archetype/class
    - Race-specific traits and abilities that would be natural for their race
    - Class/archetype-specific spells (if they are a spellcaster like wizard, cleric, druid, sorcerer, bard, etc.)
    - Special abilities that align with their race, class, and background (e.g., a ranger's tracking abilities, a rogue's sneak attack, a dwarf's resistance to magic, an elf's keen senses)
    ${characterType === "pc" ? "- Balanced but generous attributes (strength, dexterity, constitution, intelligence, wisdom, charisma) suitable for the character concept" : "- Attributes if relevant to the character's role"}
    `

    const result = await generateObject({
      prompt: enhancedPrompt,
      schema
    })

    if (!result.object) {
      return {
        success: false,
        error: "Failed to generate character"
      }
    }

    return {
      success: true,
      character: result.object as (typeof characterType extends "npc" ? NPC : PCTemplate)
    }

  } catch (error) {
    console.error("Error generating character:", error)
    
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred"
    
    return {
      success: false,
      error: errorMessage
    }
  }
} 