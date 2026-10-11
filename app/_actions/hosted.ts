"use server"

import { auth } from "@clerk/nextjs/server"
import type { Id } from "@/convex/_generated/dataModel"
import { assertAdventureAccess, assertAdventureAccessByTurn } from "@/lib/adventure-access"
import { postTableChat } from "@/lib/host/chat"
import { type HostedAction, queueAction } from "@/lib/host/server"

export type { HostedAction }

// A player's action in a hosted game waits for the host's app, which runs the GM. Players see the result on the turn.
export async function queueHostedAction(action: HostedAction) {
  const { userId } = await auth()
  const { adventure } = await assertAdventureAccessByTurn(userId, action.turnId as Id<"turns">)
  await queueAction(adventure, userId!, action)
}

// A player says something in a hosted game's table chat. Returns the chat with their line in it.
export async function sendHostedChat({ adventureId, text }: { adventureId: string; text: string }) {
  const { userId } = await auth()
  const adventure = await assertAdventureAccess(userId, adventureId as Id<"adventures">)
  const line = text.trim()
  if (!adventure.host || !line || line.length > 1000) throw new Error("Write a message of up to 1000 characters.")
  return postTableChat(adventure, userId!, line)
}
