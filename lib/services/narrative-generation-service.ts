"use server"

import { createServerCore } from "@/lib/gm-server/core"

export async function generateNarrativeUpdate(...args: Parameters<ReturnType<typeof createServerCore>["generateNarrativeUpdate"]>) {
  return createServerCore().generateNarrativeUpdate(...args)
}

export async function formatNarrativeAction(...args: Parameters<ReturnType<typeof createServerCore>["formatNarrativeAction"]>) {
  return createServerCore().formatNarrativeAction(...args)
}

export async function generateRollOutcomeNarrativeWithContext(...args: Parameters<ReturnType<typeof createServerCore>["generateRollOutcomeNarrativeWithContext"]>) {
  return createServerCore().generateRollOutcomeNarrativeWithContext(...args)
}
