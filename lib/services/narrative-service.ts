import { createServerCore } from "@/lib/gm-server/core"

export async function getRollRequirementHelper(...args: Parameters<ReturnType<typeof createServerCore>["getRollRequirementHelper"]>) {
  return createServerCore().getRollRequirementHelper(...args)
}

export { getRollModifier } from "@/lib/services/roll-modifier-service"
