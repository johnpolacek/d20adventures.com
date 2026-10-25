import { createServerCore } from "@/lib/gm-server/core"

export async function generateAiPcIntent(...args: Parameters<ReturnType<typeof createServerCore>["generateAiPcIntent"]>) {
  return createServerCore().generateAiPcIntent(...args)
}

export async function processAiPcTurn(...args: Parameters<ReturnType<typeof createServerCore>["processAiPcTurn"]>) {
  return createServerCore().processAiPcTurn(...args)
}
