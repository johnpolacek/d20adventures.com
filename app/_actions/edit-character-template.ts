"use server"

import { auth } from "@clerk/nextjs/server"
import { updateJsonOnS3 } from "@/lib/s3-utils"
import type { PCTemplate } from "@/types/character"

interface EditCharacterTemplateParams {
  character: PCTemplate
  filename: string // e.g. "bok"
}

export async function editCharacterTemplateAction(
  params: EditCharacterTemplateParams
): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth()
  if (!userId) {
    return { success: false, error: "Unauthorized" }
  }

  const { character, filename } = params

  try {
    const key = `characters/${userId}/${filename}.json`
    await updateJsonOnS3(key, character)
    return { success: true }
  } catch (error) {
    console.error("Error editing character template:", error)
    return { success: false, error: "Failed to edit character template" }
  }
} 