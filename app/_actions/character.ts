"use server"
import { auth } from "@clerk/nextjs/server"
import { deleteS3Object, readJsonFromS3, updateJsonOnS3 } from "@/lib/s3-utils"
import type { PCTemplate } from "@/types/character"

/**
 * Soft delete a user's character by moving it under a deleted/ subdirectory
 * and updating its status to "deleted". Requires the current user to match.
 */
export async function softDeleteUserCharacter(characterId: string): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: "Unauthorized" }
  if (!/^[\w-]+$/.test(characterId)) return { success: false, error: "Unknown character" }
  // characterId here is the file basename without .json, matching usage in routes
  const sourceKey = `characters/${userId}/${characterId}.json`
  const destinationKey = `characters/${userId}/deleted/${characterId}.json`
  try {
    // Read and mark status deleted for traceability
    const data = (await readJsonFromS3(sourceKey)) as PCTemplate
    const updated = { ...data, status: "deleted" } as PCTemplate
    // Write updated JSON to deleted destination first
    await updateJsonOnS3(destinationKey, updated)
    // Remove the original
    await deleteS3Object(sourceKey)
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}
