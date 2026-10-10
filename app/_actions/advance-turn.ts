"use server"

import type { Id } from "@/convex/_generated/dataModel"
import { createServerCore } from "@/lib/gm-server/core"
import { refuseHostedTurn } from "@/lib/host/guard"

export async function advanceTurn(args: { turnId: Id<"turns">; settingId: string; adventurePlanId: string }) {
  await refuseHostedTurn(args.turnId)
  return createServerCore().advanceTurn(args)
}
