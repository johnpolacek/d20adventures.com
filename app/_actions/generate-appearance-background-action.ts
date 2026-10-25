"use server"

import { createServerCore } from "@/lib/gm-server/core"

export async function generateAppearanceBackgroundAction(...args: Parameters<ReturnType<typeof createServerCore>["generateAppearanceBackgroundAction"]>) {
  return createServerCore().generateAppearanceBackgroundAction(...args)
}
