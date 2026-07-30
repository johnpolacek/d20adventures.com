"use server"

import { revalidatePath } from "next/cache"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { requireAdmin } from "@/lib/auth-utils"
import { convex } from "@/lib/convex/server"

// Admin cleanup for test play sessions. Deletes the adventure and all
// dependent Convex rows. Copied character sheets in S3 are left alone (they
// live in the owner's shared characters/ namespace) and orphaned audio files
// in the public bucket are harmless.
export async function deleteAdventureAdmin(adventureId: Id<"adventures">) {
  await requireAdmin()

  const result = await convex.mutation(api.adventure.deleteAdventureCascade, { adventureId })
  revalidatePath("/admin/adventures")
  return result
}
