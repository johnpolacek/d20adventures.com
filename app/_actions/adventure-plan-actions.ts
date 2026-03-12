"use server"

import { externalizeAdventurePlanMaps, loadAdventurePlanFromStorage } from "@/lib/adventure-plan-storage"
import { canManageResource, getResourceOwnerId } from "@/lib/content-permissions"
import { copyS3Object, listAndReadJsonFilesInS3Directory, readJsonFromS3, updateJsonOnS3 } from "@/lib/s3-utils"
import type { AdventurePlan } from "@/types/adventure-plan"
import type { Setting } from "@/types/setting"
import { auth } from "@clerk/nextjs/server"

interface UpdateAdventurePlanParams {
  adventurePlan: AdventurePlan
}

async function loadSetting(settingId: string): Promise<Setting | null> {
  try {
    return (await readJsonFromS3(`settings/${settingId}/setting-data.json`)) as Setting
  } catch {
    return null
  }
}

export async function updateAdventurePlanAction(params: UpdateAdventurePlanParams): Promise<{ success: boolean; message?: string; error?: string }> {
  console.log("updateAdventurePlanAction: Received params:", JSON.stringify(params, null, 2)) // Log received params

  const { userId } = await auth()
  if (!userId) {
    console.error("updateAdventurePlanAction: Unauthorized access attempt.")
    return { success: false, error: "Unauthorized" }
  }

  const { adventurePlan } = params
  console.log("updateAdventurePlanAction: Extracted adventurePlan object:", JSON.stringify(adventurePlan, null, 2)) // Log extracted adventurePlan

  if (!adventurePlan || !adventurePlan.id || !adventurePlan.settingId) {
    console.error("updateAdventurePlanAction: Invalid adventure plan data provided:", adventurePlan)
    return { success: false, error: "Invalid adventure plan data provided." }
  }

  const originalKey = `settings/${adventurePlan.settingId}/${adventurePlan.id}.json`
  const timestamp = Date.now()
  const backupKey = `settings/${adventurePlan.settingId}/backups/${adventurePlan.id}-${timestamp}.json`
  let existingAdventurePlan: AdventurePlan | null = null

  try {
    try {
      existingAdventurePlan = (await readJsonFromS3(originalKey)) as AdventurePlan
    } catch (readError) {
      console.warn(`updateAdventurePlanAction: Could not read existing adventure plan at ${originalKey}:`, readError)
    }

    if (!existingAdventurePlan) {
      return { success: false, error: "Adventure plan not found." }
    }

    const setting = await loadSetting(adventurePlan.settingId)
    const canManagePlan = canManageResource(userId, existingAdventurePlan) || (setting !== null && canManageResource(userId, setting))
    if (!canManagePlan) {
      console.error("updateAdventurePlanAction: Forbidden access attempt.", {
        userId,
        settingId: adventurePlan.settingId,
        adventurePlanId: adventurePlan.id,
      })
      return { success: false, error: "Forbidden" }
    }

    const ownerId = getResourceOwnerId(existingAdventurePlan) ?? getResourceOwnerId(setting) ?? userId
    const sanitizedAdventurePlan: AdventurePlan = {
      ...adventurePlan,
      ownerId,
    }
    const persistedAdventurePlan = await externalizeAdventurePlanMaps(sanitizedAdventurePlan, existingAdventurePlan)

    try {
      await copyS3Object(originalKey, backupKey)
      console.log(`updateAdventurePlanAction: Backup created for ${originalKey} at ${backupKey}`)
    } catch (readError: unknown) {
      let errorMessage = "An unknown error occurred during pre-backup check."
      if (readError instanceof Error) {
        errorMessage = readError.message
      }
      if (errorMessage.includes("No file body returned from S3") || errorMessage.includes("NoSuchKey")) {
        console.log(`updateAdventurePlanAction: Original file ${originalKey} not found, skipping backup.`)
      } else {
        console.warn(`updateAdventurePlanAction: Could not back up ${originalKey} due to an unexpected error during pre-backup check: ${errorMessage}`, readError)
      }
    }

    // Log adventurePlan and its sections before calling updateJsonOnS3
    console.log("updateAdventurePlanAction: adventurePlan.sections before S3 update:", JSON.stringify(persistedAdventurePlan.sections, null, 2))
    console.log("updateAdventurePlanAction: Full adventurePlan object before S3 update:", JSON.stringify(persistedAdventurePlan, null, 2))

    await updateJsonOnS3(originalKey, persistedAdventurePlan)
    return { success: true, message: "Adventure plan updated successfully." }
  } catch (error) {
    console.error(`updateAdventurePlanAction: Error during S3 operations for ${originalKey}:`, error)
    console.error("updateAdventurePlanAction: Failed adventurePlan object structure:", JSON.stringify(adventurePlan, null, 2)) // Log the object that failed
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
    const setting = await loadSetting(adventurePlan.settingId)
    if (!setting) {
      return { success: false, error: "Setting not found." }
    }
    if (!canManageResource(userId, setting)) {
      return { success: false, error: "Forbidden" }
    }

    const sanitizedAdventurePlan: AdventurePlan = {
      ...adventurePlan,
      ownerId: userId,
    }
    const persistedAdventurePlan = await externalizeAdventurePlanMaps(sanitizedAdventurePlan)

    const key = `settings/${adventurePlan.settingId}/${adventurePlan.id}.json`
    await updateJsonOnS3(key, persistedAdventurePlan)
    return { success: true, message: "Adventure plan created successfully" }
  } catch (error) {
    console.error("Error creating adventure plan:", error)
    return { success: false, error: "Failed to create adventure plan" }
  }
}

export async function getOtherAdventurePlans(settingId: string, currentPlanId: string): Promise<AdventurePlan[]> {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }

  try {
    const setting = await loadSetting(settingId)
    const currentPlan = (await readJsonFromS3(`settings/${settingId}/${currentPlanId}.json`)) as AdventurePlan
    const canManageCurrentPlan = canManageResource(userId, currentPlan)
    const canManageSetting = setting !== null && canManageResource(userId, setting)
    if (!canManageCurrentPlan && !canManageSetting) {
      throw new Error("Forbidden")
    }

    // Read all adventure plan JSON files (excluding setting-data.json)
    const adventureFiles = await listAndReadJsonFilesInS3Directory(`settings/${settingId}/`, ["setting-data.json"])
    const adventures = adventureFiles.map((file: { key: string; data: unknown }) => file.data as AdventurePlan).filter((plan: AdventurePlan) => plan.id !== currentPlanId && !plan.draft) // Exclude current plan and drafts

    return adventures
  } catch (error) {
    console.error("Error fetching other adventure plans:", error)
    return []
  }
}

export async function getAdventurePlan(settingId: string, adventurePlanId: string): Promise<AdventurePlan | null> {
  try {
    const adventurePlan = await loadAdventurePlanFromStorage(settingId, adventurePlanId)
    return adventurePlan
  } catch (error) {
    console.error("Error fetching adventure plan:", error)
    return null
  }
}
