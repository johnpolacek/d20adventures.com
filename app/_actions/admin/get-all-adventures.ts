"use server"
import { api } from "@/convex/_generated/api"
import { requireAdmin } from "@/lib/auth-utils"
import { convex } from "@/lib/convex/server"

export async function getAllAdventuresAdmin() {
  await requireAdmin()
  return convex.query(api.adventure.getAllAdventures, {})
}
