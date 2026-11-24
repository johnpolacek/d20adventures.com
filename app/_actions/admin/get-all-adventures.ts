"use server"
import { api } from "@/convex/_generated/api"
import { requireAdmin } from "@/lib/auth-utils"
import { convex } from "@/lib/convex/server"

export async function getAllAdventuresAdmin() {
  // requireAdmin redirects in production only. Elsewhere it answers, so its answer is checked.
  if (!(await requireAdmin()).isAdmin) throw new Error("Forbidden")
  return convex.query(api.adventure.getAllAdventures, {})
}
