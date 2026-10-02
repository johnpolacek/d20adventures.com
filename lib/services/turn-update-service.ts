import { createServerCore } from "@/lib/gm-server/core"

export async function analyzeAndApplyDiceRoll(...args: Parameters<ReturnType<typeof createServerCore>["analyzeAndApplyDiceRoll"]>) {
  return createServerCore().analyzeAndApplyDiceRoll(...args)
}
