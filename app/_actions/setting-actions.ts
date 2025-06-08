'use server'

import { auth } from "@clerk/nextjs/server"
import { updateJsonOnS3, readJsonFromS3, copyS3Object } from "@/lib/s3-utils"
import { Setting } from "@/types/setting"

interface UpdateSettingParams {
  setting: Setting
  settingId: string
}

export async function updateSettingAction(
  params: UpdateSettingParams
): Promise<{ success: boolean; message?: string; error?: string }> {
  console.log("updateSettingAction: Received params:", JSON.stringify(params, null, 2))

  const { userId } = await auth()
  if (!userId) {
    console.error("updateSettingAction: Unauthorized access attempt.")
    return { success: false, error: "Unauthorized" }
  }

  const { setting, settingId } = params
  console.log("updateSettingAction: Extracted setting object:", JSON.stringify(setting, null, 2))

  if (!setting || !settingId) {
    console.error("updateSettingAction: Invalid setting data provided:", setting)
    return { success: false, error: "Invalid setting data provided." }
  }

  const originalKey = `settings/${settingId}/setting-data.json`
  const timestamp = Date.now()
  const backupKey = `settings/${settingId}/backups/setting-data-${timestamp}.json`

  try {
    // Try to create a backup of the existing setting
    try {
      await readJsonFromS3(originalKey)
      await copyS3Object(originalKey, backupKey)
      console.log(`updateSettingAction: Backup created for ${originalKey} at ${backupKey}`)
    } catch (readError: unknown) {
      let errorMessage = "An unknown error occurred during pre-backup check."
      if (readError instanceof Error) {
        errorMessage = readError.message
      }
      if (errorMessage.includes("No file body returned from S3") || errorMessage.includes("NoSuchKey")) {
        console.log(`updateSettingAction: Original file ${originalKey} not found, skipping backup.`)
      } else {
        console.warn(`updateSettingAction: Could not back up ${originalKey} due to an unexpected error during pre-backup check: ${errorMessage}`, readError)
      }
    }
    
    // Log setting data before calling updateJsonOnS3
    console.log("updateSettingAction: setting.locations before S3 update:", JSON.stringify(setting.locations, null, 2))
    console.log("updateSettingAction: Full setting object before S3 update:", JSON.stringify(setting, null, 2))

    await updateJsonOnS3(originalKey, setting)
    return { success: true, message: "Setting updated successfully." }
  } catch (error) {
    console.error(`updateSettingAction: Error during S3 operations for ${originalKey}:`, error)
    console.error("updateSettingAction: Failed setting object structure:", JSON.stringify(setting, null, 2))
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred"
    return { success: false, error: `Failed to update setting: ${errorMessage}` }
  }
} 