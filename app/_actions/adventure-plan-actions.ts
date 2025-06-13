'use server'

import { auth } from "@clerk/nextjs/server"
import { updateJsonOnS3, copyS3Object, readJsonFromS3 } from "@/lib/s3-utils"
import type { AdventurePlan } from "@/types/adventure-plan"

interface UpdateAdventurePlanParams {
  adventurePlan: AdventurePlan
}

export async function updateAdventurePlanAction(
  params: UpdateAdventurePlanParams
): Promise<{ success: boolean; message?: string; error?: string }> {
  console.log("updateAdventurePlanAction: Received params:", JSON.stringify(params, null, 2)); // Log received params

  const { userId } = await auth()
  if (!userId) {
    console.error("updateAdventurePlanAction: Unauthorized access attempt.");
    return { success: false, error: "Unauthorized" }
  }

  const { adventurePlan } = params
  console.log("updateAdventurePlanAction: Extracted adventurePlan object:", JSON.stringify(adventurePlan, null, 2)); // Log extracted adventurePlan

  if (!adventurePlan || !adventurePlan.id || !adventurePlan.settingId) {
    console.error("updateAdventurePlanAction: Invalid adventure plan data provided:", adventurePlan);
    return { success: false, error: "Invalid adventure plan data provided." }
  }

  const originalKey = `settings/${adventurePlan.settingId}/${adventurePlan.id}.json`
  const timestamp = Date.now()
  const backupKey = `settings/${adventurePlan.settingId}/backups/${adventurePlan.id}-${timestamp}.json`

  try {
    try {
      await readJsonFromS3(originalKey)
      await copyS3Object(originalKey, backupKey)
      console.log(`updateAdventurePlanAction: Backup created for ${originalKey} at ${backupKey}`)
    } catch (readError: unknown) {
      let errorMessage = "An unknown error occurred during pre-backup check."
      if (readError instanceof Error) {
        errorMessage = readError.message;
      }
      if (errorMessage.includes("No file body returned from S3") || errorMessage.includes("NoSuchKey")) {
        console.log(`updateAdventurePlanAction: Original file ${originalKey} not found, skipping backup.`)
      } else {
        console.warn(`updateAdventurePlanAction: Could not back up ${originalKey} due to an unexpected error during pre-backup check: ${errorMessage}`, readError)
      }
    }
    
    // Log adventurePlan and its sections before calling updateJsonOnS3
    console.log("updateAdventurePlanAction: adventurePlan.sections before S3 update:", JSON.stringify(adventurePlan.sections, null, 2));
    console.log("updateAdventurePlanAction: Full adventurePlan object before S3 update:", JSON.stringify(adventurePlan, null, 2));

    await updateJsonOnS3(originalKey, adventurePlan)
    return { success: true, message: "Adventure plan updated successfully." }
  } catch (error) {
    console.error(`updateAdventurePlanAction: Error during S3 operations for ${originalKey}:`, error)
    console.error("updateAdventurePlanAction: Failed adventurePlan object structure:", JSON.stringify(adventurePlan, null, 2)); // Log the object that failed
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred"
    return { success: false, error: `Failed to update adventure plan: ${errorMessage}` }
  }
}

export async function createAdventurePlan(adventurePlan: AdventurePlan): Promise<{ success: boolean; message?: string; error?: string }> {
  const { userId } = await auth()
  if (!userId) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    const key = `settings/${adventurePlan.settingId}/${adventurePlan.id}.json`
    await updateJsonOnS3(key, adventurePlan)
    return { success: true, message: "Adventure plan created successfully" }
  } catch (error) {
    console.error("Error creating adventure plan:", error)
    return { success: false, error: "Failed to create adventure plan" }
  }
} 