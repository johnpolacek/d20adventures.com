import { createServerCore } from "@/lib/gm-server/core"

export async function buildFirstTurnSetup(...args: Parameters<ReturnType<typeof createServerCore>["buildFirstTurnSetup"]>) {
  return createServerCore().buildFirstTurnSetup(...args)
}
