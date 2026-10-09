"use server"

import { auth } from "@clerk/nextjs/server"
import type { Id } from "@/convex/_generated/dataModel"
import { assertAdventureAccessByTurn } from "@/lib/adventure-access"
import { type HostedAction, queueAction } from "@/lib/host/server"

export type { HostedAction }

// A player's action in a hosted game waits for the host's app, which runs the GM. Players see the result on the turn.
export async function queueHostedAction(action: HostedAction) {
  const { userId } = await auth()
  const { adventure } = await assertAdventureAccessByTurn(userId, action.turnId as Id<"turns">)
  await queueAction(adventure, userId!, action)
}
