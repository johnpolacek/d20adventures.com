"use server"

import { createServerCore } from "@/lib/gm-server/core"

export async function generateAttributesAction(...args: Parameters<ReturnType<typeof createServerCore>["generateAttributesAction"]>) {
  return createServerCore().generateAttributesAction(...args)
}
