import { createServerCore } from "@/lib/gm-server/core"

export { buildNpcActionContext, buildNpcActionPrompt, buildNpcOutcomePrompt } from "@d20/gm-core/services/npc-turn-generation-service"

export async function generateNpcAction(...args: Parameters<ReturnType<typeof createServerCore>["generateNpcAction"]>) {
  return createServerCore().generateNpcAction(...args)
}

export async function generateNpcOutcome(...args: Parameters<ReturnType<typeof createServerCore>["generateNpcOutcome"]>) {
  return createServerCore().generateNpcOutcome(...args)
}
