import { api } from "@/convex/_generated/api"
import { convex } from "@/lib/convex/server"
import { serverSecret } from "@/lib/convex/server-secret"
import { catalogEntry, libraryOf } from "./catalog"

// Server only. The caller must already have proven userId through Clerk or a device token.
export async function libraryFor(userId: string) {
  const owned = await convex.query(api.store.ownedAdventures, { secret: serverSecret(), userId })
  return libraryOf(owned)
}

export async function grantAdventure(args: { userId: string; adventureId: string; source: "purchase" | "grant"; stripeSessionId?: string; amountCents?: number; currency?: string }) {
  if (!catalogEntry(args.adventureId)) throw new Error(`Unknown adventure: ${args.adventureId}`)
  return convex.mutation(api.store.grantAdventure, { secret: serverSecret(), ...args })
}
