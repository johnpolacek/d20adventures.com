"use server"

import { updateJsonOnS3 } from "@/lib/s3-utils"
import { copyS3Object, deleteS3Object } from "@/lib/s3-utils"
import type { PCTemplate } from "@/types/character"
import { auth } from "@clerk/nextjs/server"
import slugify from "slugify"

interface EditCharacterTemplateParams {
  character: PCTemplate
  filename: string // e.g. "bok"
}

export async function editCharacterTemplateAction(params: EditCharacterTemplateParams): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth()
  if (!userId) {
    return { success: false, error: "Unauthorized" }
  }

  const { character, filename } = params

  try {
    const newSlug = slugify(character.name, { lower: true, strict: true })
    character.id = newSlug
    const oldKey = `characters/${userId}/${filename}.json`
    const newKey = `characters/${userId}/${newSlug}.json`
    if (filename !== newSlug) {
      // Move the file: copy to new slug, then delete old
      await copyS3Object(oldKey, newKey)
      await deleteS3Object(oldKey)
    }
    await updateJsonOnS3(newKey, character)
    return { success: true }
  } catch (error) {
    console.error("Error editing character template:", error)
    return { success: false, error: "Failed to edit character template" }
  }
}
