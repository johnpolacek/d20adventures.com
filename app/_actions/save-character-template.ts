"use server"

import { auth } from "@clerk/nextjs/server"
import { buildHero, heroMakingSchema } from "@d20/gm-core/character/hero-make"
import slugify from "slugify"
import { readJsonFromS3, updateJsonOnS3 } from "@/lib/s3-utils"
import { type PCTemplate, pcTemplateSchema } from "@/types/character"

// Saves a new hero to the player's account. The rules sheet is built here from the choices the hero was made from,
// never taken from the screen, and the race, class, scores, skills and gear are read off it. The story is the
// player's to have edited.
export async function saveCharacterTemplateAction(params: { character: PCTemplate; making: unknown }): Promise<{ success: boolean; message?: string; error?: string; characterId?: string }> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: "Unauthorized" }
  const making = heroMakingSchema.safeParse(params.making)
  if (!making.success) return { success: false, error: "Those rules choices could not be read. Choose them again." }
  const built = buildHero(making.data)
  if ("problems" in built) return { success: false, error: `These choices do not make a legal hero: ${built.problems.join(". ")}.` }
  try {
    const slug = slugify(params.character.name, { lower: true, strict: true })
    if (!slug) return { success: false, error: "Give your hero a name." }
    const key = `characters/${userId}/${slug}.json`
    // A hero is a file named by their name, so one name is one hero.
    const taken = await readJsonFromS3(key).then(
      () => true,
      () => false
    )
    if (taken) return { success: false, error: "You already have a character with that name. Please choose a different name." }
    const hero = pcTemplateSchema.parse({ ...params.character, ...built.record, sheet: built.sheet, id: slug, type: "pc", effects: [] })
    await updateJsonOnS3(key, hero)
    return { success: true, message: "Character template saved successfully", characterId: key }
  } catch (error) {
    console.error("[saveCharacterTemplateAction] Error saving character template:", error)
    return { success: false, error: "Failed to save character template" }
  }
}
