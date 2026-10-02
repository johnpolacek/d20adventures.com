"use server"

import { createServerCore } from "@/lib/gm-server/core"

export async function generateCharacterAction(...args: Parameters<ReturnType<typeof createServerCore>["generateCharacterAction"]>) {
  return createServerCore().generateCharacterAction(...args)
}
