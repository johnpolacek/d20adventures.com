import { createServerCore } from "@/lib/gm-server/core"

export async function buildTurnReplyRollRequirement(...args: Parameters<ReturnType<typeof createServerCore>["buildTurnReplyRollRequirement"]>) {
  return createServerCore().buildTurnReplyRollRequirement(...args)
}
