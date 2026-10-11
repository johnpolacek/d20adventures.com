import { clerkClient } from "@clerk/nextjs/server"
import { api } from "@/convex/_generated/api"
import type { Doc } from "@/convex/_generated/dataModel"
import { convex } from "@/lib/convex/server"
import { readJsonFromS3 } from "@/lib/s3-utils"

// Server only. A hosted game's table chat, shared by its lobby and its play view.

/** A line of table chat: who said it, and when. */
export type TableChatLine = { from: string; text: string; at: number }

/** The latest lines, oldest first. */
export async function tableChat(adventureId: Doc<"adventures">["_id"]): Promise<TableChatLine[]> {
  const messages = await convex.query(api.chat.getRecent, { adventureId, limit: 50 })
  return messages.map((m) => ({ from: m.characterName ? `${m.username} · ${m.characterName}` : m.username, text: m.content, at: m.createdAt }))
}

/** Posts a line as this player, under their username and their hero's name if they have one. Returns the chat. */
export async function postTableChat(adventure: Pick<Doc<"adventures">, "_id" | "players">, userId: string, text: string) {
  const user = await (await clerkClient()).users.getUser(userId)
  const username = user.username || user.primaryEmailAddress?.emailAddress?.split("@")[0] || "Player"
  const seat = adventure.players?.find((p) => p.userId === userId && p.controlledBy !== "ai")
  const sheet = seat?.characterId.startsWith("characters/") ? ((await readJsonFromS3(seat.characterId).catch(() => null)) as { name?: string } | null) : null
  await convex.mutation(api.chat.postMessage, { adventureId: adventure._id, username, characterName: sheet?.name, content: text })
  return tableChat(adventure._id)
}
