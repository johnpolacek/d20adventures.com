"use server"

import { createServerCore } from "@/lib/gm-server/core"

export async function generateSkillsAction(...args: Parameters<ReturnType<typeof createServerCore>["generateSkillsAction"]>) {
  return createServerCore().generateSkillsAction(...args)
}
