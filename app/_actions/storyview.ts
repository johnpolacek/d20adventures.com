"use server"

import { auth } from "@clerk/nextjs/server"
import { after } from "next/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { convex } from "@/lib/convex/server"
import { maybeTriggerStoryviewAutoGeneration } from "@/lib/services/turn-audio-service"

// Owner-only toggle for Storyview auto-narration. Any toggle clears a pause;
// enabling also warms narration for the current turn so it's ready immediately.
export async function setStoryviewAutoEnabled(adventureId: Id<"adventures">, enabled: boolean): Promise<{ enabled: boolean }> {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")

  const adventure = await convex.query(api.adventure.getAdventureById, { adventureId })
  if (!adventure) throw new Error("Adventure not found")
  if (adventure.ownerId !== userId) throw new Error("Only the adventure owner can change Storyview settings")

  await convex.mutation(api.adventure.setStoryviewSettings, {
    adventureId,
    storyview: {
      autoEnabled: enabled,
      updatedBy: userId,
      updatedAt: Date.now(),
      paused: undefined,
    },
  })

  if (enabled && adventure.currentTurnId) {
    const currentTurnId = adventure.currentTurnId
    after(() => maybeTriggerStoryviewAutoGeneration(currentTurnId))
  }

  return { enabled }
}
