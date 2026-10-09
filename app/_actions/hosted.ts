"use server"

import { auth } from "@clerk/nextjs/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { assertAdventureAccessByTurn, assertPlayerCharacterControl } from "@/lib/adventure-access"
import { convex } from "@/lib/convex/server"
import { serverSecret } from "@/lib/convex/server-secret"

type HostedAction =
  | { turnId: Id<"turns">; kind: "reply"; characterId: string; text: string; movement?: unknown }
  | { turnId: Id<"turns">; kind: "roll"; characterId: string; result: number }
  | { turnId: Id<"turns">; kind: "continue" }

// A player's action in a hosted game waits for the host's app, which runs the GM. Players see the result on the turn.
export async function queueHostedAction(action: HostedAction) {
  const { userId } = await auth()
  const { adventure, turn } = await assertAdventureAccessByTurn(userId, action.turnId)
  if (!adventure.host) throw new Error("This game is not hosted.")
  if (action.kind === "continue") {
    await convex.mutation(api.hosting.queueJob, { secret: serverSecret(), adventureId: adventure._id, turnId: turn._id, kind: "continue", userId: userId! })
    return
  }
  assertPlayerCharacterControl(userId, turn, action.characterId)
  if (action.kind === "reply") {
    const text = action.text.trim()
    if (!text || text.length > 4000) throw new Error("Write an action of up to 4000 characters.")
    await convex.mutation(api.hosting.queueJob, {
      secret: serverSecret(),
      adventureId: adventure._id,
      turnId: turn._id,
      kind: "reply",
      userId: userId!,
      characterId: action.characterId,
      text,
      movement: action.movement,
    })
    return
  }
  if (!Number.isInteger(action.result) || action.result < 1 || action.result > 20) throw new Error("A roll is a whole number from 1 to 20.")
  await convex.mutation(api.hosting.queueJob, {
    secret: serverSecret(),
    adventureId: adventure._id,
    turnId: turn._id,
    kind: "roll",
    userId: userId!,
    characterId: action.characterId,
    result: action.result,
  })
}
