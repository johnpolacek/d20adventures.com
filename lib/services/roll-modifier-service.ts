import { createServerCore } from "@/lib/gm-server/core"

export async function getRollModifier(...args: Parameters<ReturnType<typeof createServerCore>["getRollModifier"]>) {
  return createServerCore().getRollModifier(...args)
}
