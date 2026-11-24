"use server"

import { auth } from "@clerk/nextjs/server"
import type { Id } from "@/convex/_generated/dataModel"
import { assertAdventureAccessByTurn } from "@/lib/adventure-access"
import { createServerCore } from "@/lib/gm-server/core"

// A server action is a public endpoint, so the caller must play in the turn's adventure. The setting and plan come from
// the adventure, never from the browser.
export async function advanceTurn(args: { turnId: Id<"turns">; settingId: string; adventurePlanId: string }) {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")
  const { adventure } = await assertAdventureAccessByTurn(userId, args.turnId)
  // Hosted games run their GM in the host's desktop app. The server's GM refuses them, so it never runs or charges for one.
  if (adventure.host) throw new Error("This game's Game Master runs in the host's app.")
  return createServerCore().advanceTurn({ turnId: args.turnId, settingId: adventure.settingId, adventurePlanId: adventure.planId })
}
