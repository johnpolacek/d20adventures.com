"use server"

import { auth } from "@clerk/nextjs/server"
import slugify from "slugify"
import { getUserCharacters } from "@/app/_actions/character"
import { updateJsonOnS3 } from "@/lib/s3-utils"
import type { PCTemplate } from "@/types/character"

interface SaveCharacterTemplateParams {
  character: PCTemplate
}

export async function saveCharacterTemplateAction(params: SaveCharacterTemplateParams): Promise<{ success: boolean; message?: string; error?: string; characterId?: string }> {
  console.log("[saveCharacterTemplateAction] Starting with params:", JSON.stringify(params, null, 2))

  const { userId } = await auth()
  console.log("[saveCharacterTemplateAction] Auth result - userId:", userId)

  if (!userId) {
    console.error("[saveCharacterTemplateAction] No userId found, unauthorized")
    return { success: false, error: "Unauthorized" }
  }

  const { character } = params
  console.log("[saveCharacterTemplateAction] Character data:", JSON.stringify(character, null, 2))

  try {
    // Create a slug from the character name
    const slug = slugify(character.name, { lower: true, strict: true })
    console.log("[saveCharacterTemplateAction] Generated slug:", slug)

    // Check for character name collision
    console.log("[saveCharacterTemplateAction] Checking for existing characters...")
    const existingCharacters = await getUserCharacters(userId)
    console.log("[saveCharacterTemplateAction] Existing characters:", JSON.stringify(existingCharacters, null, 2))

    if (existingCharacters.some((c: PCTemplate) => slugify(c.name, { lower: true, strict: true }) === slug)) {
      console.log("[saveCharacterTemplateAction] Character name collision detected")
      return {
        success: false,
        error: "You already have a character with that name. Please choose a different name.",
      }
    }

    // Save the character template to S3
    const key = `characters/${userId}/${slug}.json`
    console.log("[saveCharacterTemplateAction] S3 key:", key)

    console.log("[saveCharacterTemplateAction] Calling updateJsonOnS3...")
    await updateJsonOnS3(key, character)
    console.log("[saveCharacterTemplateAction] S3 update completed successfully")

    const result = {
      success: true,
      message: "Character template saved successfully",
      characterId: key,
    }
    console.log("[saveCharacterTemplateAction] Returning success result:", JSON.stringify(result, null, 2))
    return result
  } catch (error) {
    console.error("[saveCharacterTemplateAction] Error saving character template:", JSON.stringify(error, null, 2))
    console.error("[saveCharacterTemplateAction] Error stack:", error instanceof Error ? error.stack : "No stack trace")
    return {
      success: false,
      error: "Failed to save character template",
    }
  }
}
