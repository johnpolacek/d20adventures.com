import { createServerCore } from "@/lib/gm-server/core"

export async function readTurnReply(...args: Parameters<ReturnType<typeof createServerCore>["readTurnReply"]>) {
  return createServerCore().readTurnReply(...args)
}
