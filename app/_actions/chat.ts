"use server"

import type { Id } from "@/convex/_generated/dataModel"
import { assertAdventureAccess } from "@/lib/adventure-access"
import { api, convex } from "@/lib/convex/server"
import { auth, clerkClient } from "@clerk/nextjs/server"

export async function sendChatMessage(input: {
  adventureId: Id<"adventures">
  content: string
  characterName?: string
}) {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")
  await assertAdventureAccess(userId, input.adventureId)
  const client = await clerkClient()
  const user = await client.users.getUser(userId)
  const username = user.username || user.primaryEmailAddress?.emailAddress?.split("@")[0] || "Player"
  return convex.mutation(api.chat.postMessage, { ...input, username })
}

export async function fetchRecentMessages(adventureId: Id<"adventures">, limit = 50) {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")
  await assertAdventureAccess(userId, adventureId)
  return convex.query(api.chat.getRecent, { adventureId, limit })
}
