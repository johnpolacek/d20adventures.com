"use server"

import { createServerCore } from "@/lib/gm-server/core"

export async function generateEquipmentAction(...args: Parameters<ReturnType<typeof createServerCore>["generateEquipmentAction"]>) {
  return createServerCore().generateEquipmentAction(...args)
}
