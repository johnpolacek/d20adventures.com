"use server"

import { createServerCore } from "@/lib/gm-server/core"

export async function generateSpecialAbilitiesAction(...args: Parameters<ReturnType<typeof createServerCore>["generateSpecialAbilitiesAction"]>) {
  return createServerCore().generateSpecialAbilitiesAction(...args)
}
