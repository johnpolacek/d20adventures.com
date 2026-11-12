"use server"

import { auth } from "@clerk/nextjs/server"
import { withStoryOf } from "@d20/gm-core/character/hero-make"
import slugify from "slugify"
import { deleteS3Object, readJsonFromS3, updateJsonOnS3 } from "@/lib/s3-utils"
import { type PCTemplate, pcTemplateSchema } from "@/types/character"

// Saves an edit of a hero in the player's account. Their story changes. Their rules, and the race, class, scores,
// skills and gear read off them, stay as stored: levels change those.
export async function editCharacterTemplateAction(params: { character: Partial<PCTemplate>; filename: string }): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: "Unauthorized" }
  try {
    const oldKey = `characters/${userId}/${slugify(params.filename, { lower: true, strict: true })}.json`
    const stored = pcTemplateSchema.parse(await readJsonFromS3(oldKey))
    const hero = withStoryOf(stored, params.character)
    const slug = slugify(hero.name, { lower: true, strict: true })
    if (!slug) return { success: false, error: "Give your hero a name." }
    const newKey = `characters/${userId}/${slug}.json`
    await updateJsonOnS3(newKey, { ...hero, id: slug })
    if (newKey !== oldKey) await deleteS3Object(oldKey)
    return { success: true }
  } catch (error) {
    console.error("Error editing character template:", error)
    return { success: false, error: "Failed to edit character template" }
  }
}
