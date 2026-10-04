"use server"

import type { Id } from "@/convex/_generated/dataModel"
import { createServerCore } from "@/lib/gm-server/core"

export async function advanceTurn(args: { turnId: Id<"turns">; settingId: string; adventurePlanId: string }) {
  return createServerCore().advanceTurn(args)
}
