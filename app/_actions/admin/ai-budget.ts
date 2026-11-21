"use server"

import { revalidatePath } from "next/cache"
import { api } from "@/convex/_generated/api"
import { requireAdmin } from "@/lib/auth-utils"
import { convex } from "@/lib/convex/server"
import { serverSecret } from "@/lib/convex/server-secret"

// The daily limit on what the site spends on its own AI calls, in US dollars (lib/gm-server/budget.ts).
export async function setDailyAiBudget(dailyUsd: number) {
  const { isAdmin } = await requireAdmin()
  if (!isAdmin) throw new Error("Forbidden")
  if (!Number.isFinite(dailyUsd) || dailyUsd < 0) throw new Error("The limit must be zero or more.")
  await convex.mutation(api.aiBudget.setLimit, { secret: serverSecret(), dailyUsd })
  revalidatePath("/admin")
}
