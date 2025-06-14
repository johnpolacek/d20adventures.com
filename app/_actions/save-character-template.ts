"use server"

import { auth } from "@clerk/nextjs/server"
import { updateJsonOnS3 } from "@/lib/s3-utils"
import type { PCTemplate } from "@/types/character"
import slugify from "slugify"

interface SaveCharacterTemplateParams {
  character: PCTemplate
}

export async function saveCharacterTemplateAction(
  params: SaveCharacterTemplateParams
): Promise<{ success: boolean; message?: string; error?: string; characterId?: string }> {
  const { userId } = await auth()
  if (!userId) {
    return { success: false, error: "Unauthorized" }
  }

  const { character } = params

  try {
    // Create a slug from the character name
    const slug = slugify(character.name, { lower: true, strict: true })
    
    // Save the character template to S3
    const key = `characters/${userId}/${slug}.json`
    await updateJsonOnS3(key, character)

    return { 
      success: true, 
      message: "Character template saved successfully",
      characterId: key
    }
  } catch (error) {
    console.error("Error saving character template:", error)
    return { 
      success: false, 
      error: "Failed to save character template" 
    }
  }
} 