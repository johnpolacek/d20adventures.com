"use server"

import { createServerCore } from "@/lib/gm-server/core"

export async function generateSpellsAction(...args: Parameters<ReturnType<typeof createServerCore>["generateSpellsAction"]>) {
  return createServerCore().generateSpellsAction(...args)
}
