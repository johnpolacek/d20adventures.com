import { createServerCore } from "@/lib/gm-server/core"

export async function processNpcTurnWithLLM(...args: Parameters<ReturnType<typeof createServerCore>["processNpcTurnWithLLM"]>) {
  return createServerCore().processNpcTurnWithLLM(...args)
}

export async function processNpcTurnsAfterCurrent(...args: Parameters<ReturnType<typeof createServerCore>["processNpcTurnsAfterCurrent"]>) {
  return createServerCore().processNpcTurnsAfterCurrent(...args)
}
