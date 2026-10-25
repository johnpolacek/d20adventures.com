import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { convex } from "@/lib/convex/server"

/** Hosted games run their GM in the host's desktop app. The server's GM refuses them, so it never runs or charges for one. */
export async function refuseHostedTurn(turnId: Id<"turns">) {
  const turn = await convex.query(api.adventure.getTurnById, { turnId })
  const adventure = turn ? await convex.query(api.adventure.getAdventureById, { adventureId: turn.adventureId }) : null
  if (adventure?.host) throw new Error("This game's Game Master runs in the host's app.")
}
