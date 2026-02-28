"use server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { assertAdventureAccess } from "@/lib/adventure-access"
import { convex } from "@/lib/convex/server"
import { auth } from "@clerk/nextjs/server"

export async function loadAdventureWithNpc(adventureId: Id<"adventures">) {
  return convex.mutation(api.adventure.getCurrentAdventureWithNpcProcessing, { adventureId, refreshKey: Date.now() })
}

export async function loadAdventureWithTurnByOrder(adventureId: Id<"adventures">, turnOrder: number) {
  const { userId } = await auth()
  if (!userId) return null

  const adventure = await assertAdventureAccess(userId, adventureId)
  const turn = await convex.query(api.adventure.getTurnByOrder, { adventureId, order: turnOrder })
  return { adventure, currentTurn: turn }
}

export async function getAdventureTurns(adventureId: Id<"adventures">) {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")
  await assertAdventureAccess(userId, adventureId)
  return convex.query(api.adventure.getTurnsByAdventure, { adventureId })
}

export async function getTurnNavigationInfo(adventureId: Id<"adventures">) {
  const { userId } = await auth()
  if (!userId) return null

  await assertAdventureAccess(userId, adventureId)
  return convex.query(api.adventure.getTurnNavigationInfo, { adventureId })
}
