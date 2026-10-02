"use server"

import { createServerCore } from "@/lib/gm-server/core"

export async function generatePersonalityMotivationBackstoryAction(...args: Parameters<ReturnType<typeof createServerCore>["generatePersonalityMotivationBackstoryAction"]>) {
  return createServerCore().generatePersonalityMotivationBackstoryAction(...args)
}
