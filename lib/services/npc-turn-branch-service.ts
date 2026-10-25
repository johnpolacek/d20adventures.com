import { createServerCore } from "@/lib/gm-server/core"

export type { NpcRollInfo, NpcTurnBranchResult } from "@d20/gm-core/services/npc-turn-branch-service"
export { handleSkipPassNpcTurn } from "@d20/gm-core/services/npc-turn-branch-service"

export async function resolveNpcTurnRollOrDirectBranch(...args: Parameters<ReturnType<typeof createServerCore>["resolveNpcTurnRollOrDirectBranch"]>) {
  return createServerCore().resolveNpcTurnRollOrDirectBranch(...args)
}
