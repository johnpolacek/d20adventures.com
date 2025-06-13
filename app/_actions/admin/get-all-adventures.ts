"use server"
import { api } from "@/convex/_generated/api"
import { convex } from "@/lib/convex/server"
import { requireAdmin } from "@/lib/auth-utils"

export async function getAllAdventuresAdmin() {
  await requireAdmin()
  return convex.query(api.adventure.getAllAdventures, {})
} 