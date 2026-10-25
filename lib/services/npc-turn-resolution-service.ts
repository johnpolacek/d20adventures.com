import { createServerCore } from "@/lib/gm-server/core"

export type { NpcTurnEffect } from "@d20/gm-core/services/npc-turn-resolution-service"
export { applyNpcEffectsToCharacters } from "@d20/gm-core/services/npc-turn-resolution-service"

export async function reconcileNpcRollWithAi(...args: Parameters<ReturnType<typeof createServerCore>["reconcileNpcRollWithAi"]>) {
  return createServerCore().reconcileNpcRollWithAi(...args)
}
