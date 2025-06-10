'use server'

import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { convex } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"

interface JoinAdventureArgs {
  settingId: string
  adventurePlanId: string
  adventureId: string
  characterId: string
}

export async function joinAdventure({ settingId, adventurePlanId, adventureId, characterId }: JoinAdventureArgs) {
  console.log("🎲 Server Action: joinAdventure called", { settingId, adventurePlanId, adventureId, characterId })

  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized: User must be signed in")
  }

  try {
    // Add the player to the adventure
    await convex.mutation(api.adventure.joinAdventure, {
      adventureId: adventureId as Id<"adventures">,
      userId,
      characterId,
    })

    console.log("🎲 Successfully joined adventure, redirecting...")

    // Redirect to the adventure page
    redirect(`/settings/${settingId}/${adventurePlanId}/${adventureId}`)
  } catch (error) {
    console.error("🎲 Failed to join adventure:", error)
    throw error
  }
} 