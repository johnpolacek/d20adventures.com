import { createServerCore } from "@/lib/gm-server/core"

export async function getRollRequirementForAction(...args: Parameters<ReturnType<typeof createServerCore>["getRollRequirementForAction"]>) {
  return createServerCore().getRollRequirementForAction(...args)
}
